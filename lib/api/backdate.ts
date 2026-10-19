/**
 * lib/api/backdate.ts — the parent-backdate lookback window.
 *
 * A parent may log a chore completion for an earlier day instead of today
 * (POST /api/completions/backdate), but only up to {@link BACKDATE_LOOKBACK_DAYS}
 * back. 7 days mirrors the app's own weekly period boundary (lib/streak's
 * localWeekNumber) — long enough to cover a parent catching up after a missed
 * weekend, short enough that a stale claim can't be gamed into a streak or
 * badge threshold weeks after the fact.
 *
 * Pure — no Prisma, no Date.now(). The route resolves `now` through the
 * injected Clock and passes it in, same discipline as lib/streak and
 * lib/point-rules.
 */

import { localDayNumber } from '@/lib/streak'

export const BACKDATE_LOOKBACK_DAYS = 7

export type BackdateRejection = 'not_past' | 'too_old'

export interface BackdateResolution {
  ok: boolean
  rejection?: BackdateRejection
  /**
   * The instant to store as `submittedAt` — local NOON of the requested day.
   * Noon (rather than local midnight) keeps the stored instant inside the
   * requested calendar day regardless of offset rounding, and gives
   * lib/point-rules a representative instant to price on-time vs late against
   * the chore's due time for that day, since a backdated entry carries no
   * real submission clock-time of its own.
   */
  instant: Date
}

/**
 * Resolve a parent-supplied "YYYY-MM-DD" (Thai local calendar date, already
 * validated by the route's zod schema) against `now` and the lookback window.
 */
export function resolveBackdate(
  dateStr: string,
  now: Date,
  offsetMs: number,
): BackdateResolution {
  const [year, month, day] = dateStr.split('-').map(Number)
  const instant = new Date(Date.UTC(year, month - 1, day, 12, 0, 0) - offsetMs)

  const todayNumber = localDayNumber(now, offsetMs)
  const requestedNumber = localDayNumber(instant, offsetMs)

  if (requestedNumber >= todayNumber) {
    return { ok: false, rejection: 'not_past', instant }
  }
  if (todayNumber - requestedNumber > BACKDATE_LOOKBACK_DAYS) {
    return { ok: false, rejection: 'too_old', instant }
  }
  return { ok: true, instant }
}
