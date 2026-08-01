/**
 * app/api/redemptions/[id]/reject/route.ts — parent declines a redemption.
 *
 *   POST /api/redemptions/:id/reject
 *     • parent-only, family-scoped.
 *     • marks the redemption `rejected`. No XP is touched — a redemption's XP is
 *       only ever deducted on approve, so a decline simply closes the request.
 *
 * Only a pending redemption can be rejected; re-deciding is a 409 conflict.
 */

import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/clock'
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

  const updated = await prisma.rewardRedemption.update({
    where: { id: redemption.id },
    data: { status: 'rejected', reviewedAt: systemClock.now() },
    include: {
      reward: true,
      redeemer: { select: { id: true, name: true, role: true } },
    },
  })

  return ok({ redemption: updated })
})
