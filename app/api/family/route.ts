/**
 * app/api/family/route.ts — read/rename the acting parent's own family.
 *
 * Single-family app, but the endpoint is still family-scoped: a parent may only
 * ever touch the family carried on their own Actor (T30). Renaming lives here
 * rather than in onboarding so the name stays editable from Settings after the
 * one-time wizard is done.
 */

import { z } from 'zod'
import { prisma } from '@/lib/db'
import { withHandler, ok, parseBody, resolveActor, assertParent, notFound } from '@/lib/api'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  name: z.string().trim().min(1, 'กรุณาตั้งชื่อครอบครัว').max(60),
})

export const GET = withHandler(async (req) => {
  const actor = await resolveActor(req)
  const family = await prisma.family.findUnique({
    where: { id: actor.familyId },
    select: { id: true, name: true },
  })
  if (!family) throw notFound('Family not found')
  return ok({ family })
})

export const PATCH = withHandler(async (req) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const { name } = await parseBody(req, patchSchema)

  const family = await prisma.family.update({
    where: { id: actor.familyId },
    data: { name },
    select: { id: true, name: true },
  })
  return ok({ family })
})
