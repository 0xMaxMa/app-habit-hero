/**
 * app/api/chores/today/route.ts — a child's day (T21 / T17).
 *
 *   GET /api/chores/today?child=<userId>
 *
 * Returns three views of the same computation (lib/api/today · choreDay), so no
 * caller has to redo the calendar in the browser:
 *
 *   chores  — the still-outstanding ones, unchanged. What the child ticks off
 *             and what the agent answers "งานวันนี้" with.
 *   day     — every chore on the child's day including the ones already done,
 *             each with the completion that decided its state. The parent
 *             dashboard renders its table straight from this.
 *   summary — the counts the tiles show, with bonus chores kept separate.
 *
 * "Today" turns at local midnight (UTC+7), the same boundary the streak counts
 * on — not at 00:00 UTC, which used to put the family's day boundary at 07:00.
 */

import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  ok,
  withHandler,
  parseQuery,
  resolveActor,
  assertFamily,
  forbidden,
  notFound,
} from '@/lib/api'
import { systemClock } from '@/lib/clock'
import { choreDay, summarizeDay } from '@/lib/api/today'

export const dynamic = 'force-dynamic'

const querySchema = z.object({
  child: z.string().min(1).optional(),
})

export const GET = withHandler(async (req) => {
  const actor = await resolveActor(req)
  const { child } = parseQuery(req.url, querySchema)

  // Default to the caller when no child is named (a linked child asking "งานวันนี้").
  const childId = child ?? actor.userId

  // A child may only view their own list; parents may view any child in family.
  if (actor.role === 'child' && childId !== actor.userId) {
    throw forbidden('Children can only view their own chores')
  }

  const target = await prisma.user.findUnique({ where: { id: childId } })
  if (!target) throw notFound('Child not found')
  assertFamily(actor, target.familyId)

  const now = systemClock.now()
  const entries = await choreDay(target.familyId, target.id, systemClock)

  return ok({
    child: target.id,
    date: now.toISOString(),
    chores: entries.filter((e) => e.outstanding).map((e) => e.chore),
    day: entries.map((e) => ({
      choreId: e.chore.id,
      isExtra: e.chore.isExtra,
      outstanding: e.outstanding,
      completion: e.completion,
    })),
    summary: summarizeDay(entries),
  })
})
