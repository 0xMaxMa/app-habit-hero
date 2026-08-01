/**
 * app/api/badges/route.ts — GET a user's achievement catalog (Item 1 / badges).
 *
 * GET /api/badges?user=<id>
 *   → { userId, name, total, earnedCount, newCount, badges: [...] }
 *     where each badge is the full catalog entry (from lib/badges) joined with
 *     the user's UserBadge rows:
 *       earned   — has the badge
 *       earnedAt — when (ISO) or null
 *       isNew    — earned but not yet seen (drives the "ใหม่" highlight + popup)
 *       imageUrl — /badges/<id>.png medal art
 *
 *   Authz: a child may only read their own badges; a parent may read any user
 *   in their family. Always family-scoped.
 */

import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  ok,
  withHandler,
  resolveActor,
  assertFamily,
  badRequest,
  notFound,
  forbidden,
  type Actor,
} from '@/lib/api'
import { BADGES, badgeImagePath } from '@/lib/badges'

export const dynamic = 'force-dynamic'

const querySchema = z.object({ user: z.string().min(1) })

export const GET = withHandler(async (req) => {
  const actor: Actor = await resolveActor(req)
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams.entries()),
  )
  if (!parsed.success) throw badRequest('A "user" query parameter is required')
  const { user } = parsed.data

  const target = await prisma.user.findUnique({
    where: { id: user },
    select: { id: true, name: true, familyId: true },
  })
  if (!target) throw notFound('User not found')

  assertFamily(actor, target.familyId)
  if (actor.role === 'child' && actor.userId !== target.id) {
    throw forbidden('Children may only read their own badges')
  }

  const owned = await prisma.userBadge.findMany({
    where: { userId: target.id },
    select: { badgeId: true, earnedAt: true, seenAt: true },
  })
  const ownedById = new Map(owned.map((b) => [b.badgeId, b]))

  const badges = BADGES.map((def) => {
    const held = ownedById.get(def.id)
    return {
      id: def.id,
      name: def.name,
      emoji: def.emoji,
      description: def.description,
      conditionType: def.conditionType,
      conditionValue: def.conditionValue ?? null,
      imageUrl: badgeImagePath(def.id),
      earned: Boolean(held),
      earnedAt: held?.earnedAt ?? null,
      isNew: Boolean(held) && held?.seenAt == null,
    }
  })

  // Show earned medals first, then the locked ones. Array#sort is stable, so
  // within each group the curated catalog order (lib/badges.ts) is preserved.
  badges.sort((a, b) => Number(b.earned) - Number(a.earned))

  return ok({
    userId: target.id,
    name: target.name,
    total: badges.length,
    earnedCount: badges.filter((b) => b.earned).length,
    newCount: badges.filter((b) => b.isNew).length,
    badges,
  })
})
