/**
 * lib/streak.ts — daily streak tracking (PRD §6.3).
 *
 *   นับวันที่เด็ก "ลงมือทำ" — วันไหนมีงานที่ถูกอนุมัติอย่างน้อย 1 ชิ้น = ติด 1 วัน
 *   Streak milestone: 3, 7, 14, 30, 100 วัน
 *   Streak break: ข้ามวันโดยไม่ทำอะไรเลย → กลับไป 0
 *
 * The streak is *derived*, not nudged: {@link streakFromActiveDays} takes the
 * set of days a child was active and returns the whole picture. That makes it
 * idempotent (re-running never double-counts), order-independent (approving
 * yesterday's chore today lands on yesterday), and self-healing after an undo —
 * none of which a step-by-step counter can promise.
 *
 * A "day" for the streak is a *local* calendar day at {@link
 * THAI_LOCAL_OFFSET_MS} — the same offset chore deadlines and the "ตื่นเช้า"
 * window use — so a chore done at 06:00 counts for the morning it happened, not
 * for the day before (which a UTC boundary would say). Pure — no Prisma, no
 * React, no `Date.now()`.
 */

/** Streak lengths that earn a milestone reward. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 100] as const

export type StreakMilestone = (typeof STREAK_MILESTONES)[number]

const MS_PER_DAY = 86_400_000

/**
 * Local day index — same value for any instant within the same local calendar
 * day at `offsetMs` east of UTC. This is the day boundary the streak counts on,
 * and the one "งานวันนี้" resets on.
 *
 * There is deliberately no UTC-day counterpart: an earlier pair of `dayNumber`
 * / `weekNumber` helpers bucketed by UTC, which put the family's day boundary at
 * 07:00 local. A chore done at 06:45 landed in yesterday's bucket and then
 * re-appeared as outstanding at 07:00. Every period question takes the offset
 * now, so a caller cannot accidentally ask the UTC one.
 */
export function localDayNumber(date: Date, offsetMs: number): number {
  return Math.floor((date.getTime() + offsetMs) / MS_PER_DAY)
}

/**
 * Local week index — the period a `weekly` chore is satisfied for. Derived from
 * {@link localDayNumber} so "this week" cannot drift from "today"; every caller
 * deciding whether a weekly chore is still outstanding must use this one.
 *
 * The week runs Monday→Sunday, matching the "สัปดาห์นี้" strip in the UI. The
 * `+ MONDAY_SHIFT_DAYS` is what buys that: local day 0 is 1970-01-01, a
 * *Thursday*, so a bare `floor(day / 7)` started each period on a Thursday and
 * a weekly chore done Monday read as outstanding again on Thursday morning —
 * mid-week, halfway through the week the parent was looking at.
 */
export function localWeekNumber(date: Date, offsetMs: number): number {
  return Math.floor((localDayNumber(date, offsetMs) + MONDAY_SHIFT_DAYS) / 7)
}

/** Days from local day 0 (Thursday) back to the Monday that began its week. */
const MONDAY_SHIFT_DAYS = 3

/** Is `streak` exactly on a milestone boundary? */
export function isMilestone(streak: number): streak is StreakMilestone {
  return (STREAK_MILESTONES as readonly number[]).includes(streak)
}

/** The milestone newly crossed when a streak goes from `prev` to `next`, else null. */
export function milestoneReached(prev: number, next: number): StreakMilestone | null {
  for (const m of STREAK_MILESTONES) {
    if (prev < m && next >= m) return m
  }
  return null
}

export interface DerivedStreak {
  /** Days in a row up to now — 0 once a whole day has been missed. */
  current: number
  /** The longest run of consecutive active days ever recorded. */
  longest: number
  /** Highest active day index seen, or null when there were none. */
  lastActiveDay: number | null
}

/**
 * Derive the streak from the days a child was active.
 *
 * `activeDays` are local day indices ({@link localDayNumber}) — duplicates and
 * ordering do not matter. `today` is the same index for "now".
 *
 * The current run stays alive while the newest active day is today *or*
 * yesterday: a child who has not done anything yet today has not broken
 * anything, the day simply is not over. Two silent days in a row ends it.
 */
export function streakFromActiveDays(activeDays: Iterable<number>, today: number): DerivedStreak {
  const days = Array.from(new Set(activeDays)).sort((a, b) => a - b)
  if (days.length === 0) return { current: 0, longest: 0, lastActiveDay: null }

  let longest = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1
    if (run > longest) longest = run
  }

  const last = days[days.length - 1]
  let current = 0
  if (last >= today - 1) {
    current = 1
    for (let i = days.length - 1; i > 0 && days[i - 1] === days[i] - 1; i--) current++
  }

  return { current, longest, lastActiveDay: last }
}

/**
 * The streak to *show* right now for a stored row.
 *
 * A stored `currentStreak` is only ever written when something is approved, so
 * a child who simply stops would keep their flame lit forever. Reads apply the
 * same lapse rule {@link streakFromActiveDays} would: once the last active day
 * is older than yesterday, the run is over.
 */
export function currentStreakAsOf(
  stored: { current: number; lastActiveDate: Date | null },
  now: Date,
  offsetMs: number,
): number {
  if (stored.current === 0) return 0
  if (stored.lastActiveDate === null) return 0
  const gap = localDayNumber(now, offsetMs) - localDayNumber(stored.lastActiveDate, offsetMs)
  return gap > 1 ? 0 : stored.current
}
