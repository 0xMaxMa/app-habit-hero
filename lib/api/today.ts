/**
 * lib/api/today.ts — "what does this child still have to do today?" helper.
 *
 * Shared by the completions API (T17/T19): POST /api/completions uses it to list
 * a child's pending chores when the caller omits `chore_id` (so the agent/UI can
 * ask "which one?" instead of guessing), and the approval API uses it to decide
 * whether a just-approved completion finishes the child's day (→ streak).
 *
 * A chore is still pending *today* for a child when it applies to that child
 * today (assigned to them or shared, inside its active window) AND they have no
 * pending/approved completion that counts for today. `once` chores drop out for
 * good once completed; `daily`/`weekly` chores reset each UTC day.
 *
 * Time is read through the injected Clock (lib/clock) — never Date.now().
 */

import type { Chore } from '@prisma/client'
import type { Clock } from '@/lib/clock'
import { dayNumber, weekNumber } from '@/lib/streak'
import { prisma } from '@/lib/db'

/**
 * The chores `childId` (in `familyId`) has not yet completed today. Ordered by
 * creation so the "which one?" prompt is stable.
 */
export async function pendingTodayChores(
  familyId: string,
  childId: string,
  clock: Clock,
): Promise<Chore[]> {
  const now = clock.now()

  const chores = await prisma.chore.findMany({
    where: {
      familyId,
      // Assigned to this child, or shared (any child in the family).
      OR: [{ assignedTo: childId }, { assignedTo: null }],
      // Inside the optional active window.
      AND: [
        { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
        { OR: [{ activeUntil: null }, { activeUntil: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })

  if (chores.length === 0) return []

  const completions = await prisma.choreCompletion.findMany({
    where: {
      completedBy: childId,
      choreId: { in: chores.map((c) => c.id) },
      status: { in: ['pending', 'approved'] },
    },
    select: { choreId: true, submittedAt: true },
  })

  const today = dayNumber(now)
  const thisWeek = weekNumber(now)
  // Local weekday (0=Sun … 6=Sat) for the weekly day-of-week filter. Families are
  // in Thailand (≈UTC+7), so read the weekday in local time, matching how the
  // create-chore drawer records recurDays.
  const LOCAL_OFFSET_MS = 7 * 60 * 60 * 1000
  const localWeekday = new Date(now.getTime() + LOCAL_OFFSET_MS).getUTCDay()

  return chores.filter((chore) => {
    // Weekly chore restricted to specific weekdays: skip it entirely on days it
    // doesn't apply. An empty recurDays means "every day of the week".
    if (
      chore.recurrence === 'weekly' &&
      chore.recurDays.length > 0 &&
      !chore.recurDays.includes(localWeekday)
    ) {
      return false
    }

    const forChore = completions.filter((c) => c.choreId === chore.id)
    switch (chore.recurrence) {
      case 'once':
        // One-off: any outstanding/approved completion removes it permanently.
        return forChore.length === 0
      case 'weekly':
        // Once a week is enough — a weekly chore done on Monday is done for the
        // rest of the week. This MUST match GET /api/chores/today, which is what
        // the child ticks off; when the two disagreed, a weekly chore completed
        // earlier in the week stayed "pending" here forever and no day could
        // ever read as finished.
        return !forChore.some((c) => weekNumber(c.submittedAt) === thisWeek)
      case 'daily':
      default:
        // Only today's completion counts against a daily chore.
        return !forChore.some((c) => dayNumber(c.submittedAt) === today)
    }
  })
}
