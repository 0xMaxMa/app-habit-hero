import { describe, it, expect } from 'vitest'
import {
  STREAK_MILESTONES,
  currentStreakAsOf,
  dayNumber,
  isMilestone,
  localDayNumber,
  milestoneReached,
  streakFromActiveDays,
  weekNumber,
} from './streak'
import { THAI_LOCAL_OFFSET_MS } from './clock'

/** Local day index for a literal instant, at the offset the streak runs on. */
const day = (iso: string) => localDayNumber(new Date(iso), THAI_LOCAL_OFFSET_MS)

describe('milestones', () => {
  it('exposes the PRD milestone set', () => {
    expect([...STREAK_MILESTONES]).toEqual([3, 7, 14, 30, 100])
  })

  it('isMilestone matches exact boundaries only', () => {
    expect(isMilestone(7)).toBe(true)
    expect(isMilestone(6)).toBe(false)
    expect(isMilestone(8)).toBe(false)
  })

  it('milestoneReached detects the crossing', () => {
    expect(milestoneReached(6, 7)).toBe(7)
    expect(milestoneReached(2, 3)).toBe(3)
    expect(milestoneReached(7, 8)).toBeNull()
    expect(milestoneReached(0, 1)).toBeNull()
  })
})

describe('dayNumber', () => {
  it('is stable within a UTC day and increments at UTC midnight', () => {
    const a = dayNumber(new Date('2026-07-29T00:00:00Z'))
    const b = dayNumber(new Date('2026-07-29T23:59:59Z'))
    const c = dayNumber(new Date('2026-07-30T00:00:00Z'))
    expect(a).toBe(b)
    expect(c).toBe(a + 1)
  })
})

describe('weekNumber', () => {
  it('is stable across seven days and rolls exactly one week later', () => {
    const start = new Date('2026-07-30T09:00:00Z')
    expect(weekNumber(new Date('2026-08-04T09:00:00Z'))).toBe(weekNumber(start))
    expect(weekNumber(new Date(start.getTime() + 7 * 86_400_000))).toBe(weekNumber(start) + 1)
  })

  it('rolls on Thursday — day 0 of the index is 1 Jan 1970, a Thursday', () => {
    // Pinning the real (surprising) boundary: a weekly chore resets Thursday
    // 00:00 UTC = 07:00 Thai, NOT Monday like the "สัปดาห์นี้" strip in the UI.
    expect(weekNumber(new Date('2026-08-05T23:59:00Z'))).toBe(
      weekNumber(new Date('2026-08-06T00:00:00Z')) - 1,
    )
  })
})

describe('localDayNumber', () => {
  it('rolls at local midnight, not UTC midnight', () => {
    // 06:00 Thai on 30 July is still 29 July in UTC — the child did their
    // morning chore on the 30th and it must count for the 30th.
    const morning = new Date('2026-07-29T23:00:00Z') // 06:00 +07
    const evening = new Date('2026-07-30T14:00:00Z') // 21:00 +07, same local day
    expect(day('2026-07-29T23:00:00Z')).toBe(day('2026-07-30T14:00:00Z'))
    expect(localDayNumber(morning, THAI_LOCAL_OFFSET_MS)).toBe(
      dayNumber(new Date('2026-07-29T23:00:00Z')) + 1,
    )
    expect(localDayNumber(evening, THAI_LOCAL_OFFSET_MS)).toBe(
      localDayNumber(morning, THAI_LOCAL_OFFSET_MS),
    )
  })

  it('a chore done just before local midnight still belongs to that day', () => {
    expect(day('2026-07-30T16:59:00Z')).toBe(day('2026-07-30T00:00:00Z')) // 23:59 vs 07:00 +07
    expect(day('2026-07-30T17:00:00Z')).toBe(day('2026-07-30T00:00:00Z') + 1) // 00:00 +07 next day
  })
})

describe('streakFromActiveDays', () => {
  const today = day('2026-08-04T12:00:00Z')

  it('is 0 when the child has never had anything approved', () => {
    expect(streakFromActiveDays([], today)).toEqual({
      current: 0,
      longest: 0,
      lastActiveDay: null,
    })
  })

  it('counts one approved day as a 1-day streak', () => {
    const s = streakFromActiveDays([today], today)
    expect(s.current).toBe(1)
    expect(s.longest).toBe(1)
    expect(s.lastActiveDay).toBe(today)
  })

  it('counts consecutive days regardless of order or duplicates', () => {
    // Several chores approved per day, listed newest-first — same answer.
    const s = streakFromActiveDays(
      [today, today - 1, today, today - 2, today - 1, today - 2],
      today,
    )
    expect(s.current).toBe(3)
    expect(s.longest).toBe(3)
  })

  it('keeps the run alive on a day the child has not done anything YET', () => {
    // Nothing approved today, but yesterday counts — the day is not over.
    const s = streakFromActiveDays([today - 1, today - 2], today)
    expect(s.current).toBe(2)
  })

  it('ends the run once a whole day was missed', () => {
    const s = streakFromActiveDays([today - 2, today - 3, today - 4], today)
    expect(s.current).toBe(0)
    // …but the record it set is kept.
    expect(s.longest).toBe(3)
  })

  it('only counts back to the gap, not across it', () => {
    const s = streakFromActiveDays([today, today - 1, today - 3, today - 4, today - 5], today)
    expect(s.current).toBe(2)
    expect(s.longest).toBe(3)
  })

  it('does not require a full day of chores — one approved chore lights the day', () => {
    // The rule this file exists to encode: any approved completion on a day
    // makes that day count. Callers pass one day index per approved chore.
    const s = streakFromActiveDays([day('2026-08-04T02:00:00Z')], today)
    expect(s.current).toBe(1)
  })
})

describe('currentStreakAsOf — the streak decays on read', () => {
  const lastActive = new Date('2026-08-04T13:00:00Z') // 20:00 +07

  it('shows the stored streak on the same local day', () => {
    const now = new Date('2026-08-04T15:00:00Z')
    expect(currentStreakAsOf({ current: 5, lastActiveDate: lastActive }, now, THAI_LOCAL_OFFSET_MS)).toBe(5)
  })

  it('still shows it the next day — the child has all day to keep it', () => {
    const now = new Date('2026-08-05T15:00:00Z')
    expect(currentStreakAsOf({ current: 5, lastActiveDate: lastActive }, now, THAI_LOCAL_OFFSET_MS)).toBe(5)
  })

  it('goes out once a whole day passed with nothing', () => {
    const now = new Date('2026-08-06T15:00:00Z')
    expect(currentStreakAsOf({ current: 5, lastActiveDate: lastActive }, now, THAI_LOCAL_OFFSET_MS)).toBe(0)
  })

  it('a row with a streak but no activity date reads as 0', () => {
    const now = new Date('2026-08-06T15:00:00Z')
    expect(currentStreakAsOf({ current: 5, lastActiveDate: null }, now, THAI_LOCAL_OFFSET_MS)).toBe(0)
  })
})
