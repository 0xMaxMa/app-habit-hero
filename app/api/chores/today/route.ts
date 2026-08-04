/**
 * app/api/chores/today/route.ts — a child's still-pending chores for today
 * (T21 / T17).
 *
 *   GET /api/chores/today?child=<userId>
 *
 * "Today" and "this week" use the shared UTC day index from lib/streak
 * (`dayNumber`) — the same calendar model streaks use — so we never invent a
 * second date util. A chore is still pending for the child today when:
 *   • it is assigned to the child (or unassigned → any child), and
 *   • it is inside its active window (activeFrom / activeUntil), and
 *   • no pending/approved completion by that child already covers this period:
 *       daily  → none submitted today
 *       weekly → none submitted this week
 *       once   → none ever (a rejected completion re-opens it)
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
import { dayNumber, weekNumber } from '@/lib/streak'

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
  const today = dayNumber(now)
  const thisWeek = weekNumber(now)
  // Local (UTC+7) weekday for the weekly day-of-week picker (recurDays).
  const localWeekday = new Date(now.getTime() + 7 * 60 * 60 * 1000).getUTCDay()

  const chores = await prisma.chore.findMany({
    where: {
      familyId: target.familyId,
      OR: [{ assignedTo: target.id }, { assignedTo: null }],
    },
    orderBy: { createdAt: 'asc' },
  })

  // Completions by this child that could satisfy a chore for the current period.
  const completions = await prisma.choreCompletion.findMany({
    where: {
      completedBy: target.id,
      status: { in: ['pending', 'approved'] },
      chore: { familyId: target.familyId },
    },
    select: { choreId: true, submittedAt: true },
  })

  const pending = chores.filter((chore) => {
    if (chore.activeFrom && now < chore.activeFrom) return false
    if (chore.activeUntil && now > chore.activeUntil) return false
    // Weekly chore pinned to specific weekdays only applies on those days.
    if (
      chore.recurrence === 'weekly' &&
      chore.recurDays.length > 0 &&
      !chore.recurDays.includes(localWeekday)
    ) {
      return false
    }

    const done = completions.filter((c) => c.choreId === chore.id)
    switch (chore.recurrence) {
      case 'daily':
        return !done.some((c) => dayNumber(c.submittedAt) === today)
      case 'weekly':
        return !done.some((c) => weekNumber(c.submittedAt) === thisWeek)
      case 'once':
      default:
        return done.length === 0
    }
  })

  return ok({ child: target.id, date: now.toISOString(), chores: pending })
})
