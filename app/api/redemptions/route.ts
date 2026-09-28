/**
 * app/api/redemptions/route.ts — reward redemptions (T22, T17).
 *
 *   POST /api/redemptions  — redeem a reward for a child. We check that
 *       child's available XP (UserProgress.totalXp) against the reward cost:
 *         • enough  → create a pending RewardRedemption and return it.
 *         • short   → return { enough: false, shortfall } (200) WITHOUT creating
 *                     a row and WITHOUT deducting any XP.
 *       XP is only deducted later, when a parent approves (see ./[id]/approve).
 *
 *       Who the redemption is FOR is resolved by resolveRedemptionTarget, not
 *       just "whoever is calling": a child always redeems for themselves, but a
 *       parent has no XP balance of their own (parents never earn XP) — they
 *       must name the child via `user`, the same param GET /api/progress and
 *       POST /api/deductions already use for "act on this family member".
 *       Checking `actor.userId`'s balance unconditionally used to mean a
 *       parent-initiated redemption (e.g. via the gateway agent, on behalf of a
 *       child with no channel identity of their own) silently read the
 *       parent's own — nonexistent — balance and reported a false "0 XP".
 *
 *   GET /api/redemptions?status=pending
 *       • parent → family-scoped list of every member's requests (review queue).
 *       • child  → only their OWN requests (so a kid can see the status of what
 *                  they asked for), never a sibling's.
 */

import { z } from 'zod'
import type { RedemptionStatus, Reward } from '@prisma/client'
import { prisma } from '@/lib/db'
import { systemClock, THAI_LOCAL_OFFSET_MS } from '@/lib/clock'
import { periodStart, type PeriodUnit } from '@/lib/period'
import {
  resolveActor,
  ok,
  withHandler,
  parseBody,
  parseQuery,
  conflict,
  notFound,
  badRequest,
  forbidden,
  assertFamily,
  type Actor,
} from '@/lib/api'

const listQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
})

export const GET = withHandler(async (req) => {
  const actor = await resolveActor(req)
  const { status } = parseQuery(req.url, listQuerySchema)

  const redemptions = await prisma.rewardRedemption.findMany({
    where: {
      // Family scope enforced through the reward relation. A child is further
      // narrowed to their own requests; a parent sees the whole family.
      reward: { familyId: actor.familyId },
      ...(actor.role === 'child' ? { redeemedBy: actor.userId } : {}),
      ...(status ? { status: status as RedemptionStatus } : {}),
    },
    orderBy: { requestedAt: 'asc' },
    include: {
      reward: true,
      redeemer: { select: { id: true, name: true, role: true } },
    },
  })

  return ok({ redemptions })
})

/** The three limit columns, in the order a child hits them. */
const LIMIT_UNITS = [
  { unit: 'day' as const, column: 'dailyLimit' as const, label: 'ของวันนี้' },
  { unit: 'week' as const, column: 'weeklyLimit' as const, label: 'ของสัปดาห์นี้' },
  { unit: 'month' as const, column: 'monthlyLimit' as const, label: 'ของเดือนนี้' },
]

interface ExceededLimit {
  unit: PeriodUnit
  label: string
  limit: number
  used: number
  /** When the window rolls over and the reward becomes available again. */
  resetsAt: Date
}

/**
 * The first limit `userId` has already used up for `reward`, or null.
 *
 * Pending requests count: a child cannot queue up five requests and have a
 * parent unknowingly approve past the limit. A rejected one does not — it was
 * never granted, so it should not consume the quota.
 */
async function firstExceededLimit(
  reward: Reward,
  userId: string,
  now: Date,
): Promise<ExceededLimit | null> {
  for (const { unit, column, label } of LIMIT_UNITS) {
    const limit = reward[column]
    if (limit === null || limit === undefined) continue

    const since = periodStart(now, unit, THAI_LOCAL_OFFSET_MS)
    const used = await prisma.rewardRedemption.count({
      where: {
        rewardId: reward.id,
        redeemedBy: userId,
        status: { in: ['pending', 'approved'] },
        requestedAt: { gte: since },
      },
    })
    if (used >= limit) {
      return { unit, label, limit, used, resetsAt: nextPeriodStart(since, unit) }
    }
  }
  return null
}

/** The start of the window after the one beginning at `since`. */
function nextPeriodStart(since: Date, unit: PeriodUnit): Date {
  const local = new Date(since.getTime() + THAI_LOCAL_OFFSET_MS)
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth()
  const d = local.getUTCDate()
  if (unit === 'month') return new Date(Date.UTC(y, m + 1, 1) - THAI_LOCAL_OFFSET_MS)
  return new Date(Date.UTC(y, m, d + (unit === 'week' ? 7 : 1)) - THAI_LOCAL_OFFSET_MS)
}

const createSchema = z.object({
  rewardId: z.string().min(1, 'rewardId is required'),
  // Which child this redemption is for — an internal id OR a channelUserRef,
  // same resolution as POST /api/deductions. Optional for a child redeeming
  // for themselves; REQUIRED for a parent (see resolveRedemptionTarget).
  user: z.string().min(1).optional(),
})

/**
 * Who this redemption is actually for — NOT just "whoever is calling".
 *
 * A child always redeems for themselves: `user` is ignored unless it names
 * someone else, which is forbidden (same rule as GET /api/progress — a child
 * only ever reads/spends their own balance).
 *
 * A parent never accumulates XP, so there is no such thing as "the parent's
 * balance" to redeem against. `user` is therefore REQUIRED when the actor is a
 * parent, and must resolve to one of their own children (assertFamily) —
 * without it there is no way to know which child the reward is for, and
 * silently falling back to the parent's own (nonexistent) UserProgress row is
 * exactly the bug this guards against (a false "0 XP available").
 */
async function resolveRedemptionTarget(
  actor: Actor,
  requestedUser: string | undefined,
): Promise<Actor> {
  if (actor.role === 'child') {
    if (requestedUser && requestedUser !== actor.userId) {
      throw forbidden('เด็กแลกรางวัลได้เฉพาะของตัวเองเท่านั้น')
    }
    return actor
  }

  if (!requestedUser) {
    throw badRequest('กรุณาระบุว่าจะแลกรางวัลให้เด็กคนไหน (ส่ง user)')
  }

  const child =
    (await prisma.user.findUnique({ where: { id: requestedUser } })) ??
    (await prisma.user.findUnique({ where: { channelUserRef: requestedUser } }))
  if (!child) {
    throw notFound('ไม่พบสมาชิกคนนี้')
  }
  assertFamily(actor, child.familyId)
  if (child.role !== 'child') {
    throw badRequest('แลกรางวัลได้เฉพาะบัญชีเด็กเท่านั้น')
  }
  return { userId: child.id, role: child.role, familyId: child.familyId }
}

export const POST = withHandler(async (req) => {
  const actor = await resolveActor(req)
  const body = await parseBody(req, createSchema)
  const target = await resolveRedemptionTarget(actor, body.user)

  const reward = await prisma.reward.findUnique({ where: { id: body.rewardId } })
  // Not-found and cross-family both read as "no such reward" to this caller.
  if (!reward || reward.familyId !== actor.familyId || !reward.isActive) {
    throw notFound('Reward not found')
  }

  // --- How often may this child take it? -----------------------------------
  // dailyLimit / weeklyLimit / monthlyLimit were stored, editable in the reward
  // form, and printed on the reward card as "2/วัน" — but nothing ever counted
  // against them, so "เล่นเกม 1 ชม. · 2/วัน" could be taken ten times in an
  // afternoon. The card was making a promise the API did not keep.
  const exceeded = await firstExceededLimit(reward, target.userId, systemClock.now())
  if (exceeded) {
    throw conflict(`แลกรางวัลนี้ครบโควตา${exceeded.label}แล้ว`, {
      // NOT `code` — that field is the ApiErrorCode envelope (CONFLICT).
      reason: 'REDEMPTION_LIMIT_REACHED',
      unit: exceeded.unit,
      limit: exceeded.limit,
      used: exceeded.used,
      resetsAt: exceeded.resetsAt,
    })
  }

  // Available XP is the TARGET child's current balance (UserProgress.totalXp)
  // — not the calling actor's, which matters exactly when a parent redeems on
  // a child's behalf.
  const progress = await prisma.userProgress.findUnique({
    where: { userId: target.userId },
  })
  const available = progress?.totalXp ?? 0

  if (available < reward.xpCost) {
    // Not enough — do NOT create a row or deduct anything.
    return ok({
      enough: false,
      shortfall: reward.xpCost - available,
      available,
      xpCost: reward.xpCost,
      rewardId: reward.id,
    })
  }

  const redemption = await prisma.rewardRedemption.create({
    data: {
      rewardId: reward.id,
      redeemedBy: target.userId,
      xpSpent: reward.xpCost,
      status: 'pending',
    },
    include: {
      reward: true,
      redeemer: { select: { id: true, name: true, role: true } },
    },
  })

  return ok({ enough: true, redemption }, { status: 201 })
})
