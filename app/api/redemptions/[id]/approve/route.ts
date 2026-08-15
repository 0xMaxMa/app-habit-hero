/**
 * app/api/redemptions/[id]/approve/route.ts — parent approves a redemption (T22).
 *
 *   POST /api/redemptions/:id/approve
 *     • parent-only, family-scoped.
 *     • deducts the redemption's XP cost from the redeemer's balance
 *       (lib/xp.addXp, clamped at 0) and recomputes their level (lib/level),
 *     • marks the redemption approved.
 *
 * Only a pending redemption can be approved; re-approving is a 409 conflict.
 */

import { prisma } from '@/lib/db'
import { addXp } from '@/lib/xp'
import { levelForXp } from '@/lib/level'
import { systemClock } from '@/lib/clock'
import { applyGamification } from '@/lib/api/gamification'
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

type Ctx = { params: { id: string } }

export const POST = withHandler<Ctx>(async (req, { params }) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const redemption = await prisma.rewardRedemption.findUnique({
    where: { id: params.id },
    include: { reward: true },
  })
  if (!redemption) {
    throw notFound('Redemption not found')
  }
  assertFamily(actor, redemption.reward.familyId)

  if (redemption.status !== 'pending') {
    throw conflict(`Redemption is already ${redemption.status}`)
  }

  const reviewedAt = systemClock.now()

  // Read the balance, check it, and deduct inside ONE serializable transaction.
  // Reading it outside meant the check was a snapshot: two redemptions approved
  // at the same moment both saw the full balance, both passed, and only one
  // deduction survived — the child got two rewards and paid for one.
  const updated = await serializable(async (tx) => {
    const fresh = await tx.rewardRedemption.findUnique({ where: { id: redemption.id } })
    // Another approval may have claimed it while this one waited for its turn.
    if (!fresh || fresh.status !== 'pending') {
      throw conflict(`Redemption is already ${fresh?.status ?? 'gone'}`)
    }

    const progress = await tx.userProgress.findUnique({
      where: { userId: redemption.redeemedBy },
    })
    const available = progress?.totalXp ?? 0
    if (available < redemption.xpSpent) {
      // Balance dropped below the cost since the request was made.
      throw conflict('Not enough XP to approve this redemption', {
        shortfall: redemption.xpSpent - available,
        available,
        xpCost: redemption.xpSpent,
      })
    }

    const newTotal = addXp(available, -redemption.xpSpent)
    // Only touch progress when a row exists (it always does once the child has
    // earned any XP; a zero-cost reward for a fresh child has nothing to deduct).
    if (progress) {
      await tx.userProgress.update({
        where: { userId: redemption.redeemedBy },
        data: { totalXp: newTotal, currentLevel: levelForXp(newTotal) },
      })
    }

    return tx.rewardRedemption.update({
      where: { id: redemption.id },
      data: { status: 'approved', reviewedAt },
      include: {
        reward: true,
        redeemer: { select: { id: true, name: true, role: true } },
      },
    })
  })

  // Re-evaluate badges now that the redemption is approved: this is what awards
  // "แลกรางวัลครั้งแรก" the moment a child spends XP. xpDelta 0 keeps the balance
  // (already deducted above) untouched and never advances the streak — it only
  // recomputes and persists any newly-earned badges. Non-fatal: a badge-eval
  // hiccup must never fail an otherwise-successful approval.
  let newBadges: Awaited<ReturnType<typeof applyGamification>>['newBadges'] = []
  try {
    const gamified = await applyGamification({
      userId: redemption.redeemedBy,
      xpDelta: 0,
      allChoresDoneBeforeNoon: false,
      clock: systemClock,
    })
    newBadges = gamified.newBadges
  } catch {
    // swallow — approval already committed
  }

  return ok({ redemption: updated, newBadges })
})
