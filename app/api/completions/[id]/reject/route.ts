/**
 * app/api/completions/[id]/reject/route.ts (T20)
 *
 * POST (parent only) — reject a pending completion: set status=rejected, record
 * the reviewer + optional feedback, and award NO XP. Family scope is enforced
 * against the completion's chore (decision #3).
 */

import { z } from 'zod'
import {
  ok,
  withHandler,
  resolveActor,
  assertParent,
  assertFamily,
  badRequest,
  notFound,
  conflict,
} from '@/lib/api'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/clock'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  feedback: z.string().trim().min(1).max(500).optional(),
})

export const POST = withHandler<{ params: { id: string } }>(async (req, { params }) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  // Body is optional; tolerate an empty/absent one but reject malformed JSON.
  let feedback: string | undefined
  const rawBody = await req.text()
  if (rawBody.trim().length > 0) {
    let parsed: unknown
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      throw badRequest('Request body must be valid JSON')
    }
    feedback = bodySchema.parse(parsed).feedback
  }

  const completion = await prisma.choreCompletion.findUnique({
    where: { id: params.id },
    include: { chore: { select: { familyId: true } } },
  })
  if (!completion) throw notFound('Completion not found')
  assertFamily(actor, completion.chore.familyId)

  if (completion.status !== 'pending') {
    throw conflict(`Completion is already ${completion.status}`)
  }

  const now = systemClock.now()
  await prisma.choreCompletion.update({
    where: { id: completion.id },
    data: {
      status: 'rejected',
      reviewedBy: actor.userId,
      reviewedAt: now,
      feedback: feedback ?? null,
      // xpAwarded stays at its default 0 — a rejection grants no XP.
    },
  })

  return ok({
    completion: {
      id: completion.id,
      status: 'rejected',
      reviewedBy: actor.userId,
      reviewedAt: now,
      feedback: feedback ?? null,
      xpAwarded: 0,
    },
  })
})
