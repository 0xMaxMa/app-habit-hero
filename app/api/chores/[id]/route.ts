/**
 * app/api/chores/[id]/route.ts — single-chore endpoints (T10 / T17).
 *
 *   PATCH  /api/chores/:id  → parent-only edit.
 *   DELETE /api/chores/:id  → parent-only delete.
 *
 * ChoreCompletion → Chore is a Restrict relation (see schema.prisma): historical
 * completions must never disappear silently. A chore that already has completions
 * is refused with a clear 409 CONFLICT (carrying the count) — unless the caller
 * opts in with `?force=1`, in which case the chore and its completion history are
 * removed together in one transaction (the parent confirmed a second time).
 */

import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  ok,
  withHandler,
  parseBody,
  resolveActor,
  assertParent,
  assertFamily,
  badRequest,
  notFound,
  conflict,
} from '@/lib/api'

type Ctx = { params: { id: string } }

/** "HH:MM" 24-hour time-of-day marker. */
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/

const updateChoreSchema = z.object({
  title: z.string().trim().min(1, 'title must not be empty').optional(),
  description: z.string().trim().nullable().optional(),
  assignedTo: z.string().min(1).nullable().optional(),
  xpValue: z.number().int().min(0, 'xpValue must be >= 0').optional(),
  lateXpMultiplier: z.number().min(0).max(1).optional(),
  recurrence: z.enum(['daily', 'weekly', 'once']).optional(),
  category: z.enum(['cleaning', 'reading', 'cooking', 'other', 'exercise', 'routine', 'helping']).optional(),
  recurDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  dueTime: z.string().regex(TIME_OF_DAY, 'dueTime must be HH:MM').nullable().optional(),
  activeFrom: z.coerce.date().nullable().optional(),
  activeUntil: z.coerce.date().nullable().optional(),
  requirePhoto: z.boolean().optional(),
  isExtra: z.boolean().optional(),
})

/** PATCH /api/chores/:id — parent-only edit within the actor's family. */
export const PATCH = withHandler<Ctx>(async (req, { params }) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const existing = await prisma.chore.findUnique({ where: { id: params.id } })
  if (!existing) throw notFound('Chore not found')
  assertFamily(actor, existing.familyId)

  const body = await parseBody(req, updateChoreSchema)

  if (body.assignedTo) {
    const assignee = await prisma.user.findUnique({ where: { id: body.assignedTo } })
    if (!assignee) throw badRequest('assignedTo is not a valid user')
    assertFamily(actor, assignee.familyId)
    if (assignee.role !== 'child') throw badRequest('assignedTo must be a child')
  }

  const chore = await prisma.chore.update({
    where: { id: params.id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo }),
      ...(body.xpValue !== undefined && { xpValue: body.xpValue }),
      ...(body.lateXpMultiplier !== undefined && { lateXpMultiplier: body.lateXpMultiplier }),
      ...(body.recurrence !== undefined && { recurrence: body.recurrence }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.recurDays !== undefined && {
        recurDays: Array.from(new Set(body.recurDays)).sort((a, b) => a - b),
      }),
      ...(body.dueTime !== undefined && { dueTime: body.dueTime }),
      ...(body.activeFrom !== undefined && { activeFrom: body.activeFrom }),
      ...(body.activeUntil !== undefined && { activeUntil: body.activeUntil }),
      ...(body.requirePhoto !== undefined && { requirePhoto: body.requirePhoto }),
      ...(body.isExtra !== undefined && { isExtra: body.isExtra }),
    },
  })

  return ok({ chore })
})

/** DELETE /api/chores/:id — parent-only. With history: 409 unless ?force=1. */
export const DELETE = withHandler<Ctx>(async (req, { params }) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const existing = await prisma.chore.findUnique({ where: { id: params.id } })
  if (!existing) throw notFound('Chore not found')
  assertFamily(actor, existing.familyId)

  const force = new URL(req.url).searchParams.get('force') === '1'

  // Restrict relation: deleting would orphan completion history. Refuse cleanly
  // (with the count) so the UI can ask the parent to confirm once more; a forced
  // delete drops the history in the same transaction.
  const completionCount = await prisma.choreCompletion.count({
    where: { choreId: params.id },
  })
  if (completionCount > 0 && !force) {
    throw conflict('Cannot delete a chore that has completion history', {
      completionCount,
    })
  }

  if (completionCount > 0) {
    await prisma.$transaction([
      prisma.choreCompletion.deleteMany({ where: { choreId: params.id } }),
      prisma.chore.delete({ where: { id: params.id } }),
    ])
  } else {
    await prisma.chore.delete({ where: { id: params.id } })
  }

  return ok({ deleted: params.id })
})
