/**
 * lib/period.ts — where a local calendar period starts.
 *
 * Reward limits ("2 ครั้ง/วัน", "1 ครั้ง/สัปดาห์") and the weekly badge windows
 * all need the same answer: as of now, when did this day / week / month begin
 * for the family? Answering it in each caller is how the app ended up with a
 * "week" that ran Thursday→Wednesday in one place and Monday→Sunday in another.
 *
 * Weeks start on Monday, matching the "สัปดาห์นี้" strip and
 * `localWeekNumber`. Pure — the caller supplies both `now` and the offset.
 */

/** The periods a limit can be expressed over. */
export type PeriodUnit = 'day' | 'week' | 'month'

/**
 * The instant `unit` began, for an observer `offsetMs` east of UTC.
 *
 * Returned as a real UTC `Date`, so it can be compared against stored
 * timestamps directly.
 */
export function periodStart(now: Date, unit: PeriodUnit, offsetMs: number): Date {
  // Shift into local civil time, do plain calendar arithmetic there, shift back.
  const local = new Date(now.getTime() + offsetMs)
  const year = local.getUTCFullYear()
  const month = local.getUTCMonth()
  const date = local.getUTCDate()

  switch (unit) {
    case 'month':
      return new Date(Date.UTC(year, month, 1) - offsetMs)
    case 'week': {
      // getUTCDay is 0=Sunday; we want 0=Monday.
      const daysFromMonday = (local.getUTCDay() + 6) % 7
      return new Date(Date.UTC(year, month, date - daysFromMonday) - offsetMs)
    }
    case 'day':
    default:
      return new Date(Date.UTC(year, month, date) - offsetMs)
  }
}
