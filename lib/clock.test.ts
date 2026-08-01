import { describe, it, expect } from 'vitest'
import { systemClock, createSystemClock, createFakeClock } from './clock'

describe('systemClock', () => {
  it('returns a Date close to real now', () => {
    const before = Date.now()
    const t = systemClock.now().getTime()
    const after = Date.now()
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(after)
  })

  it('createSystemClock produces an equivalent clock', () => {
    expect(createSystemClock().now()).toBeInstanceOf(Date)
  })
})

describe('createFakeClock', () => {
  it('defaults to the Unix epoch', () => {
    expect(createFakeClock().now().getTime()).toBe(0)
  })

  it('accepts an ISO string / Date / number as the initial instant', () => {
    expect(createFakeClock('2026-07-29T12:00:00Z').now().toISOString()).toBe(
      '2026-07-29T12:00:00.000Z',
    )
    expect(createFakeClock(new Date(1000)).now().getTime()).toBe(1000)
    expect(createFakeClock(1500).now().getTime()).toBe(1500)
  })

  it('set() jumps to an absolute instant', () => {
    const clock = createFakeClock(0)
    clock.set('2026-01-01T00:00:00Z')
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('advance() moves forward and backward by ms', () => {
    const clock = createFakeClock(10_000)
    clock.advance(5_000)
    expect(clock.now().getTime()).toBe(15_000)
    clock.advance(-3_000)
    expect(clock.now().getTime()).toBe(12_000)
  })

  it('advanceDays() moves forward by whole 24h days', () => {
    const clock = createFakeClock('2026-07-29T23:00:00Z')
    clock.advanceDays(1)
    expect(clock.now().toISOString()).toBe('2026-07-30T23:00:00.000Z')
  })

  it('now() returns a copy that cannot mutate internal state', () => {
    const clock = createFakeClock(0)
    const d = clock.now()
    d.setFullYear(1999)
    expect(clock.now().getTime()).toBe(0)
  })
})
