/**
 * app/api/bonus/route.ts — POST parent bonus XP (T17 / T23).
 *
 * POST /api/bonus  { user, amount, reason? }
 *   Parent-only. Adds `amount` XP to the target user (same family) via lib/xp,
 *   persists the new total + level on UserProgress, and returns the resulting
 *   gamification deltas (level, level-up) computed via lib/level so the caller
 *   can celebrate a level crossing.
 *
 * Backs the agent "บวก [เด็ก] [N] XP [เหตุผล]" command (A-CMD-1) and any web
 * parent-side bonus action. Authz enforced here at the API layer.
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
  notFound,
  type Actor,
} from '@/lib/api'
import { levelForXp, xpToNextLevel } from '@/lib/level'
import { applyGamification } from '@/lib/api/gamification'
import { systemClock } from '@/lib/clock'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  user: z.string().min(1),
  amount: z.number().int().positive(),
  reason: z.string().min(1).max(200).optional(),
})

export const POST = withHandler(async (req) => {
  const actor: Actor = await resolveActor(req)
  assertParent(actor)

  const { user, amount, reason } = await parseBody(req, bodySchema)

  const target = await prisma.user.findUnique({ where: { id: user } })
  if (!target) {
    throw notFound('User not found')
  }
  assertFamily(actor, target.familyId)

  const existing = await prisma.userProgress.findUnique({
    where: { userId: target.id },
  })
  const beforeLevel = levelForXp(existing?.totalXp ?? 0)

  // Delegate the XP write + badge evaluation to the shared gamification path so
  // an XP-threshold badge (1,000 / 5,000 XP) is awarded the moment a bonus
  // crosses it. A bonus is not a day-completion, so the streak is left untouched.
  const gamification = await applyGamification({
    userId: target.id,
    xpDelta: amount,
    completedDay: false,
    allChoresDoneBeforeNoon: false,
    clock: systemClock,
  })

  const afterXp = gamification.progress.totalXp
  const afterLevel = gamification.progress.level

  return ok(
    {
      userId: target.id,
      amount,
      reason: reason ?? null,
      xp: afterXp,
      level: afterLevel,
      xpToNext: xpToNextLevel(afterXp),
      previousLevel: beforeLevel,
      leveledUp: afterLevel > beforeLevel,
      levelsGained: afterLevel - beforeLevel,
      newBadges: gamification.newBadges,
    },
    { status: 201 },
  )
})
