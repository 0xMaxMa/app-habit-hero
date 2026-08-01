/**
 * app/api/progress/route.ts — GET progress (T17 / T21 / T23).
 *
 * GET /api/progress?user=<id>
 *   → { userId, name, xp, level, xpToNext, streak, badges } for one user.
 *     Authz: a child may only read their own progress; a parent may read any
 *     user in their family. Always family-scoped.
 *
 * GET /api/progress?scope=weekly
 *   → { scope: 'weekly', children: [...] } — every child in the actor's family
 *     (parent-only). Backs the "สรุปสัปดาห์" / per-child score summary (T23).
 *
 * XP → level/xpToNext via lib/level, streak straight off UserProgress, and the
 * earned badge set via lib/badges — all derived from the stored UserProgress
 * row so both the web UI and the gateway agent read the same numbers.
 */

import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  ok,
  withHandler,
  resolveActor,
  assertParent,
  assertFamily,
  badRequest,
  notFound,
  forbidden,
  type Actor,
} from '@/lib/api'
import { levelForXp, xpToNextLevel, rankName } from '@/lib/level'
import { BADGES, badgeImagePath } from '@/lib/badges'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  user: z.string().min(1).optional(),
  scope: z.enum(['weekly']).optional(),
})

interface ProgressRow {
  totalXp: number
  currentStreak: number
  longestStreak: number
}

/** Shape both the single-user and per-child summary responses share. */
function progressView(
  userId: string,
  name: string,
  progress: ProgressRow | null,
  earnedBadgeIds: readonly string[] = [],
  avatarUrl: string | null = null,
) {
  const xp = progress?.totalXp ?? 0
  const streak = progress?.currentStreak ?? 0
  const bestStreak = progress?.longestStreak ?? 0

  // Badges come straight from the persisted UserBadge set (the real earned
  // list), so the agent /score and the web read the same medals.
  const earned = new Set(earnedBadgeIds)
  const badges = BADGES.filter((b) => earned.has(b.id)).map((def) => ({
    id: def.id,
    name: def.name,
    emoji: def.emoji,
    imageUrl: badgeImagePath(def.id),
  }))

  return {
    userId,
    name,
    xp,
    level: levelForXp(xp),
    rank: rankName(levelForXp(xp)),
    xpToNext: xpToNextLevel(xp),
    streak,
    bestStreak,
    badges,
    avatarUrl,
  }
}

export const GET = withHandler(async (req) => {
  const actor: Actor = await resolveActor(req)
  const { user, scope } = querySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams.entries()),
  )

  // ---- Weekly / all-children summary (parent-only) ----------------------
  if (scope === 'weekly') {
    assertParent(actor)
    const children = await prisma.user.findMany({
      where: { familyId: actor.familyId, role: 'child' },
      include: { progress: true, badges: { select: { badgeId: true } } },
      orderBy: { name: 'asc' },
    })
    return ok({
      scope: 'weekly' as const,
      children: children.map((c) =>
        progressView(
          c.id,
          c.name,
          c.progress,
          c.badges.map((b) => b.badgeId),
          c.avatarUrl,
        ),
      ),
    })
  }

  // ---- Single-user progress --------------------------------------------
  if (!user) {
    throw badRequest('A "user" query parameter (or scope=weekly) is required')
  }

  const target = await prisma.user.findUnique({
    where: { id: user },
    include: { progress: true, badges: { select: { badgeId: true } } },
  })
  if (!target) {
    throw notFound('User not found')
  }

  // Family scope first, then the child-reads-only-self rule.
  assertFamily(actor, target.familyId)
  if (actor.role === 'child' && actor.userId !== target.id) {
    throw forbidden('Children may only read their own progress')
  }

  return ok(
    progressView(
      target.id,
      target.name,
      target.progress,
      target.badges.map((b) => b.badgeId),
      target.avatarUrl,
    ),
  )
})
