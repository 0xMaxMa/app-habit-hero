/**
 * lib/api/today.ts — "what does this child have to do today, and how far are
 * they?" — the single source of truth for a child's day.
 *
 * Shared by the completions API (T17/T19), the approval API (does this approval
 * finish the child's day → Speed Demon), and GET /api/chores/today, which is
 * what the child UI, the parent dashboard and the gateway agent all read.
 *
 * A chore is part of the child's day when it applies to them today (assigned to
 * them or shared, inside its active window, on a weekday the chore recurs on)
 * AND it is either still outstanding or was completed today. It is outstanding
 * until a pending/approved completion covers the current period: `once` chores
 * drop out for good, `daily` resets each local day, `weekly` each local week. A
 * rejected completion re-opens the chore.
 *
 * "Local" is Thailand (lib/clock · THAI_LOCAL_OFFSET_MS): the day turns at local
 * midnight, the same boundary the streak counts on. Time is read through the
 * injected Clock (lib/clock) — never Date.now().
 */

import type { Chore, ChoreCompletion } from '@prisma/client'
import { THAI_LOCAL_OFFSET_MS, type Clock } from '@/lib/clock'
import { localDayNumber, localWeekNumber } from '@/lib/streak'
import { prisma } from '@/lib/db'

/** One chore on a child's day, with the completion that decided its state. */
export interface ChoreDayEntry {
  chore: Chore
  /** True while the chore still needs doing for the current period. */
  outstanding: boolean
  /**
   * The child's most recent completion for this chore in the current period —
   * including a `rejected` one, which is why the chore can be outstanding and
   * carry a completion at the same time.
   */
  completion: Pick<
    ChoreCompletion,
    'id' | 'status' | 'submittedAt' | 'xpAwarded' | 'photoUrl'
  > | null
}

/** Counts the dashboard tiles show. Bonus chores are opt-in, so they are split
 *  out rather than inflating "งานยังไม่เสร็จวันนี้" with work nobody owes. */
export interface ChoreDaySummary {
  /** Required (non-bonus) chores on the child's day. done + remaining. */
  requiredTotal: number
  requiredDone: number
  requiredRemaining: number
  /** Bonus chores, same split — shown separately, never mixed into the above. */
  extraTotal: number
  extraDone: number
  extraRemaining: number
}

/**
 * Does a completion submitted at `at` still count for the chore's period as of
 * `now`? `once` is satisfied forever, `weekly` for the rest of the local week,
 * `daily` for the rest of the local day.
 *
 * Exported because the submit endpoint needs the SAME answer to reject a
 * duplicate: when "already done" was decided in two places, the two drifted and
 * a chore could be handed in twice for double XP while the list swore it was
 * finished.
 */
export function inCurrentPeriod(
  chore: Pick<Chore, 'recurrence'>,
  at: Date,
  now: Date,
): boolean {
  switch (chore.recurrence) {
    case 'once':
      // One-off: every completion, however old, is "this period".
      return true
    case 'weekly':
      // Once a week is enough — a weekly chore done on Monday is done for the
      // rest of the week.
      return (
        localWeekNumber(at, THAI_LOCAL_OFFSET_MS) === localWeekNumber(now, THAI_LOCAL_OFFSET_MS)
      )
    case 'daily':
    default:
      return localDayNumber(at, THAI_LOCAL_OFFSET_MS) === localDayNumber(now, THAI_LOCAL_OFFSET_MS)
  }
}

/**
 * Every chore on `childId`'s day, ordered by creation so the "which one?" prompt
 * is stable.
 */
export async function choreDay(
  familyId: string,
  childId: string,
  clock: Clock,
): Promise<ChoreDayEntry[]> {
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
    },
    select: {
      id: true,
      choreId: true,
      status: true,
      submittedAt: true,
      xpAwarded: true,
      photoUrl: true,
    },
    orderBy: { submittedAt: 'asc' },
  })

  const today = localDayNumber(now, THAI_LOCAL_OFFSET_MS)
  const thisWeek = localWeekNumber(now, THAI_LOCAL_OFFSET_MS)
  // Local weekday (0=Sun … 6=Sat) for the weekly day-of-week filter, matching
  // how the create-chore drawer records recurDays.
  const localWeekday = new Date(now.getTime() + THAI_LOCAL_OFFSET_MS).getUTCDay()

  /** Does this completion count for the chore's current period? */
  const inPeriod = (chore: Chore, at: Date): boolean => inCurrentPeriod(chore, at, now)

  const entries: ChoreDayEntry[] = []
  for (const chore of chores) {
    // A weekly chore restricted to specific weekdays is simply not part of
    // today. An empty recurDays means "every day of the week".
    if (
      chore.recurrence === 'weekly' &&
      chore.recurDays.length > 0 &&
      !chore.recurDays.includes(localWeekday)
    ) {
      continue
    }

    const forChore = completions.filter((c) => c.choreId === chore.id)
    const inThisPeriod = forChore.filter((c) => inPeriod(chore, c.submittedAt))
    // Only a pending/approved completion settles a chore; a rejected one re-opens it.
    const outstanding = !inThisPeriod.some((c) => c.status !== 'rejected')
    const latest = inThisPeriod.length > 0 ? inThisPeriod[inThisPeriod.length - 1] : null
    const completedToday =
      latest !== null && localDayNumber(latest.submittedAt, THAI_LOCAL_OFFSET_MS) === today

    // Settled earlier in the period (a weekly chore done on Monday, a `once`
    // chore done last month) is not part of *today* — nothing left to show or
    // count. It reappears when the period rolls over.
    if (!outstanding && !completedToday) continue

    entries.push({
      chore,
      outstanding,
      completion: latest === null ? null : { ...latest },
    })
  }

  return entries
}

/** Roll {@link choreDay} entries up into the counts the tiles show. */
export function summarizeDay(entries: readonly ChoreDayEntry[]): ChoreDaySummary {
  const s: ChoreDaySummary = {
    requiredTotal: 0,
    requiredDone: 0,
    requiredRemaining: 0,
    extraTotal: 0,
    extraDone: 0,
    extraRemaining: 0,
  }
  for (const e of entries) {
    if (e.chore.isExtra) {
      s.extraTotal++
      e.outstanding ? s.extraRemaining++ : s.extraDone++
    } else {
      s.requiredTotal++
      e.outstanding ? s.requiredRemaining++ : s.requiredDone++
    }
  }
  return s
}

/**
 * The chores `childId` (in `familyId`) has not yet completed today — the
 * outstanding slice of {@link choreDay}. Used to offer "which one?" on submit
 * and to decide whether an approval finished the child's day.
 */
export async function pendingTodayChores(
  familyId: string,
  childId: string,
  clock: Clock,
): Promise<Chore[]> {
  const day = await choreDay(familyId, childId, clock)
  return day.filter((e) => e.outstanding).map((e) => e.chore)
}
