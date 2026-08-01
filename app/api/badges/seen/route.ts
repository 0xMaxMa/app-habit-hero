/**
 * app/api/badges/seen/route.ts — mark a user's new badges as seen.
 *
 * POST /api/badges/seen
 *   body: { user: string, ids?: string[] }
 *   → { marked: number }
 *
 * Clears the "ใหม่" highlight after the child has seen the celebration. Marks
 * every still-unseen earned badge (or only the given `ids` if provided).
 * Authz mirrors GET /api/badges: a child may only mark their own; a parent may
 * mark any user in their family.
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
import { systemClock } from '@/lib/clock'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  user: z.string().min(1),
  ids: z.array(z.string().min(1)).optional(),
})

export const POST = withHandler(async (req) => {
  const actor: Actor = await resolveActor(req)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw badRequest('Invalid JSON body')
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) throw badRequest('A "user" field is required')
  const { user, ids } = parsed.data

  const target = await prisma.user.findUnique({
    where: { id: user },
    select: { id: true, familyId: true },
  })
  if (!target) throw notFound('User not found')

  assertFamily(actor, target.familyId)
  if (actor.role === 'child' && actor.userId !== target.id) {
    throw forbidden('Children may only update their own badges')
  }

  const res = await prisma.userBadge.updateMany({
    where: {
      userId: target.id,
      seenAt: null,
      ...(ids && ids.length > 0 ? { badgeId: { in: ids } } : {}),
    },
    data: { seenAt: systemClock.now() },
  })

  return ok({ marked: res.count })
})
