/**
 * app/api/chores/route.ts — chore collection endpoints (T10 / T17).
 *
 *   GET  /api/chores  → list chores in the actor's family (family-scoped).
 *   POST /api/chores  → parent-only create.
 *
 * Both the web UI and the gateway agent hit these; authz is enforced here
 * (resolveActor + assertParent + family scope), never at the channel layer.
 */

import { z } from 'zod'
import { prisma } from '@/lib/db'
import { classifyChore } from '@/lib/badges'
import {
  ok,
  withHandler,
  parseBody,
  resolveActor,
  assertParent,
  assertFamily,
  badRequest,
} from '@/lib/api'

/** "HH:MM" 24-hour time-of-day marker. */
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/

const createChoreSchema = z.object({
  title: z.string().trim().min(1, 'title is required'),
  description: z.string().trim().optional(),
  assignedTo: z.string().min(1).nullable().optional(),
  xpValue: z.number().int().min(0, 'xpValue must be >= 0'),
  lateXpMultiplier: z.number().min(0).max(1).optional(),
  recurrence: z.enum(['daily', 'weekly', 'once']).optional(),
  category: z.enum(['cleaning', 'reading', 'cooking', 'other', 'exercise', 'routine', 'helping']).optional(),
  // Weekday subset (0=Sun … 6=Sat) for weekly chores; deduped + sorted below.
  recurDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  dueTime: z.string().regex(TIME_OF_DAY, 'dueTime must be HH:MM').nullable().optional(),
  activeFrom: z.coerce.date().nullable().optional(),
  activeUntil: z.coerce.date().nullable().optional(),
  requirePhoto: z.boolean().optional(),
  isExtra: z.boolean().optional(),
})

/** Dedupe + sort a weekday list so storage is canonical. */
function normalizeDays(days: number[] | undefined): number[] {
  if (!days) return []
  return Array.from(new Set(days)).sort((a, b) => a - b)
}

/** GET /api/chores — every chore in the caller's family. */
export const GET = withHandler(async (req) => {
  const actor = await resolveActor(req)

  const chores = await prisma.chore.findMany({
    where: { familyId: actor.familyId },
    orderBy: { createdAt: 'desc' },
  })

  return ok({ chores })
})

/** POST /api/chores — parent-only create, validated. */
export const POST = withHandler(async (req) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const body = await parseBody(req, createChoreSchema)

  // An explicit assignee must be a child in the actor's own family.
  if (body.assignedTo) {
    const assignee = await prisma.user.findUnique({ where: { id: body.assignedTo } })
    if (!assignee) throw badRequest('assignedTo is not a valid user')
    assertFamily(actor, assignee.familyId)
    if (assignee.role !== 'child') throw badRequest('assignedTo must be a child')
  }

  const chore = await prisma.chore.create({
    data: {
      familyId: actor.familyId,
      title: body.title,
      description: body.description ?? null,
      assignedTo: body.assignedTo ?? null,
      xpValue: body.xpValue,
      ...(body.lateXpMultiplier !== undefined && { lateXpMultiplier: body.lateXpMultiplier }),
      ...(body.recurrence !== undefined && { recurrence: body.recurrence }),
      // Explicit category wins; otherwise infer from the title (cleaning/reading/
      // cooking) so the category badges stay accurate, else fall back to 'other'.
      category: body.category ?? classifyChore(body.title) ?? 'other',
      recurDays: normalizeDays(body.recurDays),
      dueTime: body.dueTime ?? null,
      activeFrom: body.activeFrom ?? null,
      activeUntil: body.activeUntil ?? null,
      ...(body.requirePhoto !== undefined && { requirePhoto: body.requirePhoto }),
      ...(body.isExtra !== undefined && { isExtra: body.isExtra }),
    },
  })

  return ok({ chore }, { status: 201 })
})
