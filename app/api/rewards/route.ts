/**
 * app/api/rewards/route.ts — reward catalog (T11, T17, T21).
 *
 *   GET  /api/rewards  — list the family's catalog. Parents see every reward;
 *                        children and the agent see only active ones (toggling
 *                        isActive off hides a reward from the child side, T11).
 *   POST /api/rewards  — parent-only create a reward.
 *
 * Family-scoped: a caller only ever touches their own family's rewards.
 */

import { z } from 'zod'
import { prisma } from '@/lib/db'
import { resolveActor, assertParent, ok, withHandler, parseBody } from '@/lib/api'

export const GET = withHandler(async (req) => {
  const actor = await resolveActor(req)

  const rewards = await prisma.reward.findMany({
    where: {
      familyId: actor.familyId,
      // Children / agent callers never see deactivated rewards.
      ...(actor.role === 'parent' ? {} : { isActive: true }),
    },
    orderBy: [{ isActive: 'desc' }, { xpCost: 'asc' }, { createdAt: 'asc' }],
  })

  return ok({ rewards })
})

const createRewardSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.string().trim().min(1).nullable().optional(),
  xpCost: z.number().int().min(0, 'xpCost must be >= 0'),
  iconEmoji: z.string().trim().min(1).nullable().optional(),
  isActive: z.boolean().optional(),
  // [P2] optional redemption limits.
  dailyLimit: z.number().int().min(0).nullable().optional(),
  weeklyLimit: z.number().int().min(0).nullable().optional(),
  monthlyLimit: z.number().int().min(0).nullable().optional(),
})

export const POST = withHandler(async (req) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const body = await parseBody(req, createRewardSchema)

  const reward = await prisma.reward.create({
    data: {
      familyId: actor.familyId,
      title: body.title,
      description: body.description ?? null,
      xpCost: body.xpCost,
      iconEmoji: body.iconEmoji ?? null,
      isActive: body.isActive ?? true,
      dailyLimit: body.dailyLimit ?? null,
      weeklyLimit: body.weeklyLimit ?? null,
      monthlyLimit: body.monthlyLimit ?? null,
    },
  })

  return ok({ reward }, { status: 201 })
})
