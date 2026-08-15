/**
 * app/api/redemptions/route.ts — reward redemptions (T22, T17).
 *
 *   POST /api/redemptions  — a child asks to redeem a reward. We check the
 *       child's available XP (UserProgress.totalXp) against the reward cost:
 *         • enough  → create a pending RewardRedemption and return it.
 *         • short   → return { enough: false, shortfall } (200) WITHOUT creating
 *                     a row and WITHOUT deducting any XP.
 *       XP is only deducted later, when a parent approves (see ./[id]/approve).
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
})

export const POST = withHandler(async (req) => {
  const actor = await resolveActor(req)
  const body = await parseBody(req, createSchema)

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
  const exceeded = await firstExceededLimit(reward, actor.userId, systemClock.now())
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

  // Available XP is the redeemer's current balance (UserProgress.totalXp).
  const progress = await prisma.userProgress.findUnique({
    where: { userId: actor.userId },
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
      redeemedBy: actor.userId,
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
