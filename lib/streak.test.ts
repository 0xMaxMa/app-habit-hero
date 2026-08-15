import { describe, it, expect } from 'vitest'
import {
  STREAK_MILESTONES,
  currentStreakAsOf,
  isMilestone,
  localDayNumber,
  localWeekNumber,
  milestoneReached,
  streakFromActiveDays,
} from './streak'
import { THAI_LOCAL_OFFSET_MS } from './clock'

/** Local day index for a literal instant, at the offset the streak runs on. */
const day = (iso: string) => localDayNumber(new Date(iso), THAI_LOCAL_OFFSET_MS)
/** Local week index for a literal instant, same offset. */
const week = (iso: string) => localWeekNumber(new Date(iso), THAI_LOCAL_OFFSET_MS)

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

describe('localWeekNumber', () => {
  it('is stable across seven days and rolls exactly one week later', () => {
    // Monday 10 August 2026, 16:00 Thai.
    const start = new Date('2026-08-10T09:00:00Z')
    expect(week('2026-08-15T09:00:00Z')).toBe(localWeekNumber(start, THAI_LOCAL_OFFSET_MS))
    expect(
      localWeekNumber(new Date(start.getTime() + 7 * 86_400_000), THAI_LOCAL_OFFSET_MS),
    ).toBe(localWeekNumber(start, THAI_LOCAL_OFFSET_MS) + 1)
  })

  it('rolls at LOCAL midnight on Monday — the week the UI shows', () => {
    // The whole calendar week the "สัปดาห์นี้" strip draws must be one period.
    // 2026-08-16T16:59Z is 23:59 Thai on Sunday the 16th; one minute later is
    // Monday 00:00 Thai and a new week.
    expect(week('2026-08-16T16:59:00Z')).toBe(week('2026-08-16T17:00:00Z') - 1)
  })

  it('keeps Monday→Sunday together, so a weekly chore does not reset mid-week', () => {
    // Mon 10 → Sun 16 August 2026 is one week; the Thursday inside it is NOT a
    // boundary. Bucketing by floor(day/7) put the roll-over on Thursday (local
    // day 0 is 1 Jan 1970, a Thursday), so a chore done Mon–Wed read as
    // outstanding again on Thursday morning.
    const monday = week('2026-08-10T04:00:00Z')
    for (const iso of [
      '2026-08-10T04:00:00Z', // Mon
      '2026-08-12T04:00:00Z', // Wed
      '2026-08-13T04:00:00Z', // Thu — used to start a new week here
      '2026-08-16T04:00:00Z', // Sun
    ]) {
      expect(week(iso)).toBe(monday)
    }
    expect(week('2026-08-17T04:00:00Z')).toBe(monday + 1) // next Monday
    expect(week('2026-08-09T04:00:00Z')).toBe(monday - 1) // the Sunday before
  })

  it('never disagrees with localDayNumber about which week a day is in', () => {
    // The two are derived from one another on purpose: when "today" and "this
    // week" came from different calendars, a weekly chore done earlier in the
    // week stayed outstanding forever.
    for (const iso of [
      '2026-08-05T16:59:00Z',
      '2026-08-05T17:00:00Z',
      '2026-08-09T03:00:00Z',
      '2026-12-31T20:00:00Z',
    ]) {
      expect(week(iso)).toBe(Math.floor((day(iso) + 3) / 7))
    }
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
      Math.floor(morning.getTime() / 86_400_000) + 1,
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
