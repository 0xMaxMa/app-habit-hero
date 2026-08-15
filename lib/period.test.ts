import { describe, it, expect } from 'vitest'
import { periodStart } from './period'
import { THAI_LOCAL_OFFSET_MS } from './clock'
import { localWeekNumber } from './streak'

const at = (iso: string) => periodStart(new Date(iso), 'day', THAI_LOCAL_OFFSET_MS)

describe('periodStart', () => {
  it('starts the day at local midnight, not UTC midnight', () => {
    // 2026-08-15T02:00Z is 09:00 Thai on the 15th; the day began at
    // 2026-08-14T17:00Z (00:00 Thai).
    expect(at('2026-08-15T02:00:00Z').toISOString()).toBe('2026-08-14T17:00:00.000Z')
    // 06:45 Thai on the 15th is the SAME day — the boundary a UTC day got wrong.
    expect(at('2026-08-14T23:45:00Z').toISOString()).toBe('2026-08-14T17:00:00.000Z')
  })

  it('starts the week on Monday local midnight', () => {
    // Saturday 15 August 2026 → Monday the 10th.
    const start = periodStart(new Date('2026-08-15T02:00:00Z'), 'week', THAI_LOCAL_OFFSET_MS)
    expect(start.toISOString()).toBe('2026-08-09T17:00:00.000Z')
    // A Monday is its own week start, not the Monday before.
    const monday = periodStart(new Date('2026-08-10T04:00:00Z'), 'week', THAI_LOCAL_OFFSET_MS)
    expect(monday.toISOString()).toBe('2026-08-09T17:00:00.000Z')
    // Sunday still belongs to the week that began that Monday.
    const sunday = periodStart(new Date('2026-08-16T10:00:00Z'), 'week', THAI_LOCAL_OFFSET_MS)
    expect(sunday.toISOString()).toBe('2026-08-09T17:00:00.000Z')
  })

  it('agrees with localWeekNumber about where a week begins', () => {
    // Two ways of asking the same question must not drift.
    for (const iso of ['2026-08-10T04:00:00Z', '2026-08-13T04:00:00Z', '2026-08-16T16:00:00Z']) {
      const now = new Date(iso)
      const start = periodStart(now, 'week', THAI_LOCAL_OFFSET_MS)
      expect(localWeekNumber(start, THAI_LOCAL_OFFSET_MS)).toBe(
        localWeekNumber(now, THAI_LOCAL_OFFSET_MS),
      )
      // One millisecond earlier is the previous week.
      expect(localWeekNumber(new Date(start.getTime() - 1), THAI_LOCAL_OFFSET_MS)).toBe(
        localWeekNumber(now, THAI_LOCAL_OFFSET_MS) - 1,
      )
    }
  })

  it('starts the month on the 1st local midnight', () => {
    const start = periodStart(new Date('2026-08-15T02:00:00Z'), 'month', THAI_LOCAL_OFFSET_MS)
    expect(start.toISOString()).toBe('2026-07-31T17:00:00.000Z')
    // 00:30 Thai on 1 September belongs to September, not August.
    const sept = periodStart(new Date('2026-08-31T17:30:00Z'), 'month', THAI_LOCAL_OFFSET_MS)
    expect(sept.toISOString()).toBe('2026-08-31T17:00:00.000Z')
  })
})
