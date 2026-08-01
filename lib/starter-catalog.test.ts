/**
 * lib/starter-catalog.test.ts — invariants for the shipped starter content.
 *
 * This catalogue is what a stranger's install arrives with, and it is edited by
 * hand (that is the point — tune it to your household). These tests guard the
 * mistakes hand-editing actually makes: a duplicated key, a title collision
 * that `npm run db:seed` would then silently skip, a weekday list on a chore
 * that does not recur weekly, or a reward ladder that stops making sense.
 */

import { describe, it, expect } from 'vitest'
import {
  STARTER_CHORES,
  STARTER_REWARDS,
  isStarterChoreKey,
  starterChoreByKey,
  starterRewardByKey,
} from './starter-catalog'

describe('STARTER_CHORES', () => {
  it('ships a non-empty catalogue', () => {
    expect(STARTER_CHORES.length).toBeGreaterThan(0)
  })

  it('has unique keys', () => {
    const keys = STARTER_CHORES.map((c) => c.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has unique titles — db:seed dedupes on title, so collisions would be dropped', () => {
    const titles = STARTER_CHORES.map((c) => c.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('gives every chore a positive XP value', () => {
    for (const c of STARTER_CHORES) {
      expect(c.xpValue, c.key).toBeGreaterThan(0)
      expect(Number.isInteger(c.xpValue), c.key).toBe(true)
    }
  })

  it('only puts weekday lists on weekly chores', () => {
    for (const c of STARTER_CHORES) {
      if (c.recurDays && c.recurDays.length > 0) {
        expect(c.recurrence, c.key).toBe('weekly')
      }
    }
  })

  it('uses valid weekday numbers (0=Sun … 6=Sat), no duplicates', () => {
    for (const c of STARTER_CHORES) {
      const days = c.recurDays ?? []
      for (const d of days) {
        expect(Number.isInteger(d), c.key).toBe(true)
        expect(d, c.key).toBeGreaterThanOrEqual(0)
        expect(d, c.key).toBeLessThanOrEqual(6)
      }
      expect(new Set(days).size, c.key).toBe(days.length)
    }
  })

  it('uses HH:MM for dueTime', () => {
    for (const c of STARTER_CHORES) {
      if (c.dueTime !== undefined) {
        expect(c.dueTime, c.key).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/)
      }
    }
  })

  it('keeps lateXpMultiplier in (0, 1] and only where a dueTime exists', () => {
    for (const c of STARTER_CHORES) {
      if (c.lateXpMultiplier === undefined) continue
      expect(c.lateXpMultiplier, c.key).toBeGreaterThan(0)
      expect(c.lateXpMultiplier, c.key).toBeLessThanOrEqual(1)
      // A late penalty with no deadline can never fire.
      expect(c.dueTime, c.key).toBeDefined()
    }
  })

  it('gives every chore a title, description and emoji', () => {
    for (const c of STARTER_CHORES) {
      expect(c.title.trim().length, c.key).toBeGreaterThan(0)
      expect(c.description.trim().length, c.key).toBeGreaterThan(0)
      expect(c.emoji.trim().length, c.key).toBeGreaterThan(0)
    }
  })

  it('looks up by key and reports membership', () => {
    const first = STARTER_CHORES[0]
    expect(starterChoreByKey(first.key)).toEqual(first)
    expect(isStarterChoreKey(first.key)).toBe(true)

    expect(starterChoreByKey('nope')).toBeUndefined()
    expect(isStarterChoreKey('nope')).toBe(false)
  })
})

describe('STARTER_REWARDS', () => {
  it('ships a non-empty catalogue', () => {
    expect(STARTER_REWARDS.length).toBeGreaterThan(0)
  })

  it('has unique keys', () => {
    const keys = STARTER_REWARDS.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has unique titles — db:seed dedupes on title, so collisions would be dropped', () => {
    const titles = STARTER_REWARDS.map((r) => r.title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('gives every reward a positive integer XP cost', () => {
    for (const r of STARTER_REWARDS) {
      expect(Number.isInteger(r.xpCost), r.key).toBe(true)
      expect(r.xpCost, r.key).toBeGreaterThan(0)
    }
  })

  it('is ordered cheapest-first so the shop reads as a ladder', () => {
    const costs = STARTER_REWARDS.map((r) => r.xpCost)
    expect(costs).toEqual([...costs].sort((a, b) => a - b))
  })

  it('uses positive limits when a limit is set', () => {
    for (const r of STARTER_REWARDS) {
      for (const limit of [r.dailyLimit, r.weeklyLimit, r.monthlyLimit]) {
        if (limit === undefined) continue
        expect(Number.isInteger(limit), r.key).toBe(true)
        expect(limit, r.key).toBeGreaterThan(0)
      }
    }
  })

  it('gives every reward a title and an icon', () => {
    for (const r of STARTER_REWARDS) {
      expect(r.title.trim().length, r.key).toBeGreaterThan(0)
      expect(r.iconEmoji.trim().length, r.key).toBeGreaterThan(0)
    }
  })

  it('looks up by key', () => {
    const first = STARTER_REWARDS[0]
    expect(starterRewardByKey(first.key)).toEqual(first)
    expect(starterRewardByKey('nope')).toBeUndefined()
  })
})
