import { describe, it, expect } from 'vitest'
import { applyLatePenalty, totalXp, addXp, DEFAULT_LATE_PENALTY_MULTIPLIER } from './xp'

describe('applyLatePenalty', () => {
  it('defaults to a 0.6 multiplier', () => {
    expect(DEFAULT_LATE_PENALTY_MULTIPLIER).toBe(0.6)
    expect(applyLatePenalty(50)).toBe(30)
    expect(applyLatePenalty(100)).toBe(60)
  })

  it('rounds to the nearest integer', () => {
    // 55 * 0.6 = 33 exactly
    expect(applyLatePenalty(55)).toBe(33)
    // 25 * 0.6 = 15 exactly
    expect(applyLatePenalty(25)).toBe(15)
    // 35 * 0.6 = 21 exactly
    expect(applyLatePenalty(35)).toBe(21)
    // 33 * 0.6 = 19.8 -> 20
    expect(applyLatePenalty(33)).toBe(20)
  })

  it('honours a custom multiplier', () => {
    expect(applyLatePenalty(100, 0.5)).toBe(50)
    expect(applyLatePenalty(100, 0)).toBe(0)
    expect(applyLatePenalty(100, 1)).toBe(100)
  })

  it('rejects invalid input', () => {
    expect(() => applyLatePenalty(-1)).toThrow(RangeError)
    expect(() => applyLatePenalty(50, -0.1)).toThrow(RangeError)
    expect(() => applyLatePenalty(Number.NaN)).toThrow(RangeError)
  })
})

describe('totalXp', () => {
  it('sums awards', () => {
    expect(totalXp([])).toBe(0)
    expect(totalXp([50, 30, 100])).toBe(180)
  })

  it('rejects negative awards', () => {
    expect(() => totalXp([50, -5])).toThrow(RangeError)
  })
})

describe('addXp', () => {
  it('adds a positive delta', () => {
    expect(addXp(150, 50)).toBe(200)
  })

  it('clamps at zero on a negative delta', () => {
    expect(addXp(30, -100)).toBe(0)
    expect(addXp(0, -1)).toBe(0)
  })

  it('rejects a negative current total', () => {
    expect(() => addXp(-1, 10)).toThrow(RangeError)
  })
})
