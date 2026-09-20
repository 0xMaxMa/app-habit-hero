/**
 * app/api/deductions/[id]/cancel/route.ts — undo a point deduction.
 *
 *   POST /api/deductions/:id/cancel
 *     • parent-only, family-scoped (same rule as POST /api/deductions itself).
 *     • adds `xpApplied` back to the child's balance (lib/xp.addXp — the amount
 *       actually taken, not the amount requested, so a deduction that floored
 *       at 0 restores only what it really removed) and recomputes their level,
 *     • marks the ORIGINAL point_adjustments row cancelled. No time limit, no
 *       row is deleted, and no second/offsetting row is created — the history
 *       must show that THIS deduction was undone, not two entries that merely
 *       net to zero.
 *
 * Only a not-yet-cancelled deduction can be cancelled; cancelling twice is a
 * 409 conflict (mirrors POST /api/redemptions/:id/approve).
 */

import { prisma } from '@/lib/db'
import { addXp } from '@/lib/xp'
import { levelForXp, xpToNextLevel } from '@/lib/level'
import { systemClock } from '@/lib/clock'
import { serializable } from '@/lib/api/tx'
import {
  resolveActor,
  assertParent,
  assertFamily,
  ok,
  withHandler,
  notFound,
  conflict,
} from '@/lib/api'
import { dtoInclude, toDeductionDto } from '@/lib/api/deduction-dto'

export const dynamic = 'force-dynamic'

type Ctx = { params: { id: string } }

export const POST = withHandler<Ctx>(async (req, { params }) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const adjustment = await prisma.pointAdjustment.findUnique({
    where: { id: params.id },
    include: { user: true },
  })
  // xpDelta >= 0 rows are not deductions (the table is the generic adjustment
  // ledger) — treat them the same as "no such deduction".
  if (!adjustment || adjustment.xpDelta >= 0) {
    throw notFound('Deduction not found')
  }
  assertFamily(actor, adjustment.user.familyId)

  const cancelledAt = systemClock.now()

  // Read the balance, check it, restore the XP, and mark the row cancelled
  // inside ONE serializable transaction — the same reason POST /api/deductions
  // and POST /api/redemptions/:id/approve do: two cancel requests landing
  // together would otherwise both see the row as not-yet-cancelled and both
  // restore the XP, doubling it back.
  const result = await serializable(async (tx) => {
    const fresh = await tx.pointAdjustment.findUniqueOrThrow({ where: { id: adjustment.id } })
    if (fresh.cancelledAt) {
      throw conflict('ยกเลิกรายการนี้ไปแล้ว')
    }

    const progress = await tx.userProgress.findUnique({ where: { userId: fresh.userId } })
    const before = progress?.totalXp ?? 0
    const after = addXp(before, fresh.xpApplied)

    await tx.userProgress.upsert({
      where: { userId: fresh.userId },
      create: { userId: fresh.userId, totalXp: after, currentLevel: levelForXp(after) },
      update: { totalXp: after, currentLevel: levelForXp(after) },
    })

    const updated = await tx.pointAdjustment.update({
      where: { id: fresh.id },
      data: { cancelledAt, cancelledBy: actor.userId },
      include: dtoInclude,
    })

    return { adjustment: updated, before, after }
  })

  const beforeLevel = levelForXp(result.before)
  const afterLevel = levelForXp(result.after)

  return ok({
    deduction: toDeductionDto(result.adjustment),
    userId: adjustment.userId,
    // XP handed back — always xpApplied, the amount that really came off.
    restored: result.adjustment.xpApplied,
    xp: result.after,
    level: afterLevel,
    xpToNext: xpToNextLevel(result.after),
    previousLevel: beforeLevel,
    leveledUp: afterLevel > beforeLevel,
    levelsGained: Math.max(0, afterLevel - beforeLevel),
  })
})
