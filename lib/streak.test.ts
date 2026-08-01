import { describe, it, expect } from 'vitest'
import {
  STREAK_MILESTONES,
  dayNumber,
  isMilestone,
  milestoneReached,
  recordCompletion,
  isStreakBroken,
  resetStreak,
  type StreakState,
} from './streak'
import { createFakeClock } from './clock'

const fresh: StreakState = { current: 0, longest: 0, lastActiveDate: null }

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

describe('recordCompletion — streak crossing midnight (fake clock)', () => {
  it('starts a streak at 1 on the first completion', () => {
    const clock = createFakeClock('2026-07-29T20:00:00Z')
    const u = recordCompletion(fresh, clock)
    expect(u.state.current).toBe(1)
    expect(u.state.longest).toBe(1)
    expect(u.incremented).toBe(true)
    expect(u.reset).toBe(false)
  })

  it('increments when the next completion lands just past midnight', () => {
    const clock = createFakeClock('2026-07-29T23:59:00Z')
    const day1 = recordCompletion(fresh, clock)
    expect(day1.state.current).toBe(1)

    // cross midnight into the next UTC day
    clock.set('2026-07-30T00:01:00Z')
    const day2 = recordCompletion(day1.state, clock)
    expect(day2.state.current).toBe(2)
    expect(day2.incremented).toBe(true)
    expect(day2.state.longest).toBe(2)
  })

  it('is idempotent for multiple completions on the same UTC day', () => {
    const clock = createFakeClock('2026-07-29T08:00:00Z')
    const first = recordCompletion(fresh, clock)
    clock.set('2026-07-29T21:00:00Z') // later same day
    const second = recordCompletion(first.state, clock)
    expect(second.state.current).toBe(1)
    expect(second.incremented).toBe(false)
  })

  it('resets to 1 after a gap of 2+ days', () => {
    const clock = createFakeClock('2026-07-29T20:00:00Z')
    const day1 = recordCompletion(fresh, clock)
    clock.advanceDays(2) // skip the 30th entirely
    const afterGap = recordCompletion(day1.state, clock)
    expect(afterGap.state.current).toBe(1)
    expect(afterGap.reset).toBe(true)
    expect(afterGap.incremented).toBe(false)
    // longest preserved from before? day1 longest was 1, so still 1
    expect(afterGap.state.longest).toBe(1)
  })

  it('emits a milestone when the streak reaches 7 consecutive days', () => {
    const clock = createFakeClock('2026-07-01T12:00:00Z')
    let state = fresh
    const milestones: (number | null)[] = []
    for (let day = 0; day < 7; day++) {
      clock.set(new Date(Date.UTC(2026, 6, 1 + day, 12, 0, 0)))
      const u = recordCompletion(state, clock)
      state = u.state
      milestones.push(u.milestone)
    }
    expect(state.current).toBe(7)
    // milestone(7) fires exactly on the 7th day's update
    expect(milestones).toEqual([null, null, 3, null, null, null, 7])
  })

  it('tracks longest across a reset', () => {
    const clock = createFakeClock('2026-07-01T12:00:00Z')
    let state = fresh
    for (let day = 0; day < 4; day++) {
      clock.set(new Date(Date.UTC(2026, 6, 1 + day, 12, 0, 0)))
      state = recordCompletion(state, clock).state
    }
    expect(state.current).toBe(4)
    // gap
    clock.set(new Date(Date.UTC(2026, 6, 10, 12, 0, 0)))
    const afterGap = recordCompletion(state, clock)
    expect(afterGap.state.current).toBe(1)
    expect(afterGap.state.longest).toBe(4)
  })
})

describe('isStreakBroken', () => {
  const clock = createFakeClock('2026-07-29T12:00:00Z')
  const state: StreakState = {
    current: 5,
    longest: 5,
    lastActiveDate: new Date('2026-07-29T20:00:00Z'),
  }

  it('is not broken on the same day', () => {
    clock.set('2026-07-29T23:00:00Z')
    expect(isStreakBroken(state, clock)).toBe(false)
  })

  it('is not broken on the very next day (still recoverable)', () => {
    clock.set('2026-07-30T09:00:00Z')
    expect(isStreakBroken(state, clock)).toBe(false)
  })

  it('is broken once a full day has been skipped', () => {
    clock.set('2026-07-31T09:00:00Z')
    expect(isStreakBroken(state, clock)).toBe(true)
  })

  it('is never broken for a user who never started', () => {
    expect(isStreakBroken(fresh, clock)).toBe(false)
  })
})

describe('resetStreak', () => {
  it('zeroes current but keeps longest and lastActiveDate', () => {
    const state: StreakState = {
      current: 9,
      longest: 12,
      lastActiveDate: new Date('2026-07-29T20:00:00Z'),
    }
    const reset = resetStreak(state)
    expect(reset.current).toBe(0)
    expect(reset.longest).toBe(12)
    expect(reset.lastActiveDate).toEqual(state.lastActiveDate)
  })
})
