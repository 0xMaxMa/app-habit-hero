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
import type { RedemptionStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  resolveActor,
  ok,
  withHandler,
  parseBody,
  parseQuery,
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
