import { describe, it, expect } from 'vitest'
import { BACKDATE_LOOKBACK_DAYS, resolveBackdate } from './backdate'
import { localDayNumber } from '@/lib/streak'
import { THAI_LOCAL_OFFSET_MS } from '@/lib/clock'

// A fixed "now": Monday 19 October 2026, 10:00 Thai local.
const NOW = new Date('2026-10-19T03:00:00Z')

/** "YYYY-MM-DD" for `daysAgo` local days before NOW. */
function dateDaysAgo(daysAgo: number): string {
  const d = new Date(NOW.getTime() - daysAgo * 86_400_000)
  const local = new Date(d.getTime() + THAI_LOCAL_OFFSET_MS)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const day = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

describe('resolveBackdate', () => {
  it('accepts yesterday', () => {
    const res = resolveBackdate(dateDaysAgo(1), NOW, THAI_LOCAL_OFFSET_MS)
    expect(res.ok).toBe(true)
    expect(localDayNumber(res.instant, THAI_LOCAL_OFFSET_MS)).toBe(
      localDayNumber(NOW, THAI_LOCAL_OFFSET_MS) - 1,
    )
  })

  it('accepts exactly 7 days back', () => {
    const res = resolveBackdate(
      dateDaysAgo(BACKDATE_LOOKBACK_DAYS),
      NOW,
      THAI_LOCAL_OFFSET_MS,
    )
    expect(res.ok).toBe(true)
  })

  it('rejects 8 days back as too_old', () => {
    const res = resolveBackdate(
      dateDaysAgo(BACKDATE_LOOKBACK_DAYS + 1),
      NOW,
      THAI_LOCAL_OFFSET_MS,
    )
    expect(res.ok).toBe(false)
    expect(res.rejection).toBe('too_old')
  })

  it('rejects today as not_past (use the normal submit flow)', () => {
    const res = resolveBackdate(dateDaysAgo(0), NOW, THAI_LOCAL_OFFSET_MS)
    expect(res.ok).toBe(false)
    expect(res.rejection).toBe('not_past')
  })

  it('rejects a future date as not_past', () => {
    const res = resolveBackdate(dateDaysAgo(-1), NOW, THAI_LOCAL_OFFSET_MS)
    expect(res.ok).toBe(false)
    expect(res.rejection).toBe('not_past')
  })

  it('anchors the stored instant at local noon of the requested day', () => {
    const res = resolveBackdate(dateDaysAgo(2), NOW, THAI_LOCAL_OFFSET_MS)
    const local = new Date(res.instant.getTime() + THAI_LOCAL_OFFSET_MS)
    expect(local.getUTCHours()).toBe(12)
  })
})
