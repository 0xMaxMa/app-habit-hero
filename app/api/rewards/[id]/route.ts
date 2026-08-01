/**
 * app/api/rewards/[id]/route.ts — mutate a single reward (T11, parent-only).
 *
 *   PATCH  /api/rewards/:id — update fields; toggling isActive off hides the
 *                             reward from the child/agent catalog.
 *   DELETE /api/rewards/:id — remove a reward. If it has redemption history the
 *                             call is refused with 409 (carrying the count)
 *                             unless `?force=1`, so the UI can ask the parent to
 *                             confirm a second time; its redemptions cascade.
 *
 * Both are family-scoped: a parent can only touch their own family's rewards.
 */

import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  resolveActor,
  assertParent,
  assertFamily,
  ok,
  withHandler,
  parseBody,
  notFound,
  conflict,
} from '@/lib/api'

type Ctx = { params: { id: string } }

async function loadOwnedReward(req: Request, id: string) {
  const actor = await resolveActor(req)
  assertParent(actor)

  const reward = await prisma.reward.findUnique({ where: { id } })
  if (!reward) {
    throw notFound('Reward not found')
  }
  assertFamily(actor, reward.familyId)
  return reward
}

const patchRewardSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().trim().min(1).nullable().optional(),
    xpCost: z.number().int().min(0).optional(),
    iconEmoji: z.string().trim().min(1).nullable().optional(),
    isActive: z.boolean().optional(),
    dailyLimit: z.number().int().min(0).nullable().optional(),
    weeklyLimit: z.number().int().min(0).nullable().optional(),
    monthlyLimit: z.number().int().min(0).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
  })

export const PATCH = withHandler<Ctx>(async (req, { params }) => {
  await loadOwnedReward(req, params.id)

  const body = await parseBody(req, patchRewardSchema)

  const reward = await prisma.reward.update({
    where: { id: params.id },
    data: body,
  })

  return ok({ reward })
})

export const DELETE = withHandler<Ctx>(async (req, { params }) => {
  await loadOwnedReward(req, params.id)

  const force = new URL(req.url).searchParams.get('force') === '1'

  // Redemptions cascade on delete, so nothing is orphaned — but a reward with
  // history is worth a second confirmation. Refuse (with the count) unless the
  // parent opts in with ?force=1.
  const redemptionCount = await prisma.rewardRedemption.count({
    where: { rewardId: params.id },
  })
  if (redemptionCount > 0 && !force) {
    throw conflict('Cannot delete a reward that has redemption history', {
      redemptionCount,
    })
  }

  await prisma.reward.delete({ where: { id: params.id } })

  return ok({ deleted: true })
})
