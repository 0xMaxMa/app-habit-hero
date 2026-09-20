/**
 * app/api/deductions/route.ts — parent deducts XP from a child (point deduction).
 *
 * POST /api/deductions  { user, amount, reason }
 *   Parent-only, family-scoped, children only. Takes `amount` XP off the child's
 *   balance (floored at 0, lib/xp.addXp) and records a PointAdjustment carrying
 *   the amount, the reason, which parent did it and when — so the drop is
 *   explainable on both the parent history and the child's own timeline.
 *
 *   The mirror of POST /api/bonus, with three deliberate differences:
 *     • `reason` is REQUIRED (a bonus note is optional). A child sees this row;
 *       "-50 XP" with no reason is exactly what this feature must not produce.
 *     • it does NOT route through applyGamification. That path exists to award
 *       badges as XP crosses a threshold upward — losing XP can never earn one,
 *       so calling it would be a second write that changes nothing. Badges are
 *       likewise never revoked here: earned-and-kept is already the rule
 *       everywhere except the one approval a parent explicitly undoes (see
 *       lib/api/gamification.reverseGamification).
 *     • it is capped (MAX_DEDUCTION_XP) — see lib/point-rules.
 *
 * GET /api/deductions[?child=<id|ref>]
 *   The deduction rows behind the history timelines. Family-scoped; a child may
 *   only ever read their own, whatever filter they pass (same rule as
 *   GET /api/completions).
 *
 * Backs both the web parent UI and the agent "หัก [เด็ก] [N] XP [เหตุผล]" command.
 */

import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  ok,
  withHandler,
  resolveActor,
  assertParent,
  assertFamily,
  parseBody,
  badRequest,
  forbidden,
  notFound,
  type Actor,
} from '@/lib/api'
import { serializable } from '@/lib/api/tx'
import { addXp } from '@/lib/xp'
import { levelForXp, xpToNextLevel } from '@/lib/level'
import { MAX_DEDUCTION_XP } from '@/lib/point-rules'
import { systemClock } from '@/lib/clock'
import { dtoInclude, toDeductionDto } from '@/lib/api/deduction-dto'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  user: z.string().min(1),
  // A positive whole number: the route negates it. Letting a caller pass the
  // sign would make "deduct -50" quietly hand out XP through the deduct endpoint.
  amount: z
    .number({ invalid_type_error: 'จำนวนคะแนนต้องเป็นตัวเลข' })
    .int('จำนวนคะแนนต้องเป็นจำนวนเต็ม')
    .positive('จำนวนคะแนนต้องมากกว่า 0')
    .max(MAX_DEDUCTION_XP, `หักได้ครั้งละไม่เกิน ${MAX_DEDUCTION_XP} XP`),
  // Trimmed first, so "   " is the empty string it really is and gets rejected.
  reason: z
    .string({ required_error: 'กรุณาใส่เหตุผล' })
    .trim()
    .min(1, 'กรุณาใส่เหตุผลที่หักคะแนน')
    .max(200, 'เหตุผลยาวเกินไป (ไม่เกิน 200 ตัวอักษร)'),
})

const getQuery = z.object({
  child: z.string().min(1).optional(),
})

// ---------------------------------------------------------------------------
// POST — deduct XP from one child.
// ---------------------------------------------------------------------------

export const POST = withHandler(async (req) => {
  const actor: Actor = await resolveActor(req)
  // Authorization is enforced HERE, not by hiding the button: the same endpoint
  // serves the agent, and a child's own session could otherwise call it.
  assertParent(actor)

  const { user, amount, reason } = await parseBody(req, bodySchema)

  // `user` may be an internal id OR a channelUserRef — the agent knows callers
  // by ref (same resolution as POST /api/completions).
  const target =
    (await prisma.user.findUnique({ where: { id: user } })) ??
    (await prisma.user.findUnique({ where: { channelUserRef: user } }))
  if (!target) {
    throw notFound('ไม่พบสมาชิกคนนี้')
  }
  assertFamily(actor, target.familyId)
  if (target.role !== 'child') {
    throw badRequest('หักคะแนนได้เฉพาะบัญชีเด็กเท่านั้น')
  }

  const now = systemClock.now()

  // Read the balance, subtract, and write the ledger row in ONE serializable
  // transaction — the same reason POST /api/redemptions/:id/approve does: two
  // deductions landing together would otherwise both read the same "before"
  // total and the second would erase the first, so the child would lose only
  // one of the two while both requests reported success.
  const result = await serializable(async (tx) => {
    const progress = await tx.userProgress.findUnique({ where: { userId: target.id } })
    const before = progress?.totalXp ?? 0

    // Floored at 0: XP is also the currency rewards are bought with, and a
    // negative balance would mean a child has to work off a debt before a chore
    // counts again. addXp already clamps — the max() here is only so `applied`
    // reports what was really taken.
    const after = addXp(before, -amount)
    const applied = before - after

    const adjustment = await tx.pointAdjustment.create({
      data: {
        userId: target.id,
        // Signed: negative is the deduction (lib/xp delta convention).
        xpDelta: -amount,
        xpApplied: applied,
        reason,
        createdBy: actor.userId,
        createdAt: now,
      },
      include: dtoInclude,
    })

    // Upsert, not update: a child who has never earned anything has no progress
    // row yet, and the deduction must still be recorded rather than 500.
    await tx.userProgress.upsert({
      where: { userId: target.id },
      create: { userId: target.id, totalXp: after, currentLevel: levelForXp(after) },
      update: { totalXp: after, currentLevel: levelForXp(after) },
    })

    return { adjustment, before, after, applied }
  })

  const beforeLevel = levelForXp(result.before)
  const afterLevel = levelForXp(result.after)

  return ok(
    {
      deduction: toDeductionDto(result.adjustment),
      userId: target.id,
      // What the parent asked for vs what the balance could actually give up.
      requested: amount,
      applied: result.applied,
      // True when the child did not have `amount` to lose — the UI says so
      // rather than letting the parent think the full amount came off.
      floored: result.applied < amount,
      xp: result.after,
      level: afterLevel,
      xpToNext: xpToNextLevel(result.after),
      previousLevel: beforeLevel,
      leveledDown: afterLevel < beforeLevel,
      levelsLost: Math.max(0, beforeLevel - afterLevel),
    },
    { status: 201 },
  )
})

// ---------------------------------------------------------------------------
// GET — the deduction rows the history timelines merge in.
// ---------------------------------------------------------------------------

export const GET = withHandler(async (req) => {
  const actor: Actor = await resolveActor(req)
  const { child } = getQuery.parse(
    Object.fromEntries(new URL(req.url).searchParams.entries()),
  )

  let userId: string | undefined
  if (child) {
    const target =
      (await prisma.user.findUnique({ where: { id: child } })) ??
      (await prisma.user.findUnique({ where: { channelUserRef: child } }))
    if (!target || target.role !== 'child') {
      throw notFound('ไม่พบเด็กคนนี้')
    }
    assertFamily(actor, target.familyId)
    userId = target.id
  }

  // A child reads their OWN deductions and nothing else — never a sibling's,
  // whatever `child` they pass (mirrors GET /api/completions).
  if (actor.role === 'child') {
    if (userId && userId !== actor.userId) {
      throw forbidden('ดูได้เฉพาะประวัติของตัวเองนะ')
    }
    userId = actor.userId
  }

  const rows = await prisma.pointAdjustment.findMany({
    where: {
      // Negative only: the table is the generic adjustment ledger, this endpoint
      // is the deduction view of it.
      xpDelta: { lt: 0 },
      ...(userId ? { userId } : {}),
      // Family scope comes from the subject, the way the completions query
      // scopes through its chore.
      user: { familyId: actor.familyId },
    },
    include: dtoInclude,
    orderBy: { createdAt: 'desc' },
  })

  return ok({ deductions: rows.map(toDeductionDto) })
})
