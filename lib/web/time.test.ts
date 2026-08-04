/**
 * lib/web/time.test.ts — the approval queue's clock labels.
 *
 * These are pinned to Bangkok on purpose: the label sits next to a ⏰ due-time
 * chip whose late/on-time verdict is computed at a fixed +7 offset, so the two
 * must agree no matter what timezone the machine rendering them is set to.
 */
import { describe, it, expect } from 'vitest'
import { clockTime, bangkokDayKey, timeAgo, submittedLabel } from '@/lib/web/time'

// 2026-08-04 07:45 Bangkok = 00:45 UTC.
const SUBMIT = new Date('2026-08-04T00:45:00.000Z')
const NOW = new Date('2026-08-04T01:45:00.000Z') // 08:45 Bangkok, one hour later

describe('clockTime', () => {
  it('renders the Bangkok wall-clock time, not the runtime timezone', () => {
    expect(clockTime(SUBMIT)).toBe('07:45')
  })

  it('renders midnight as 00:xx, never 24:xx', () => {
    // 2026-08-04 00:10 Bangkok = 2026-08-03 17:10 UTC.
    expect(clockTime(new Date('2026-08-03T17:10:00.000Z'))).toBe('00:10')
  })

  it('keeps an evening submission on its own Bangkok day', () => {
    // 23:30 Bangkok on the 4th is already the 4th 16:30 UTC.
    expect(bangkokDayKey(new Date('2026-08-04T16:30:00.000Z'))).toBe('2026-08-04')
    // …while 06:00 UTC-day rollover (00:xx UTC) is still the *previous* UTC day
    // yet the same Bangkok day as its evening.
    expect(bangkokDayKey(new Date('2026-08-03T17:10:00.000Z'))).toBe('2026-08-04')
  })
})

describe('timeAgo', () => {
  it('reads "เมื่อสักครู่" under a minute', () => {
    expect(timeAgo(NOW, NOW)).toBe('เมื่อสักครู่')
  })

  it('counts minutes, then hours, then days', () => {
    expect(timeAgo(new Date(NOW.getTime() - 5 * 60_000), NOW)).toBe('5 นาทีที่แล้ว')
    expect(timeAgo(SUBMIT, NOW)).toBe('1 ชั่วโมงที่แล้ว')
    expect(timeAgo(new Date(NOW.getTime() - 50 * 3_600_000), NOW)).toBe('2 วันที่แล้ว')
  })
})

describe('submittedLabel', () => {
  it('leads with the clock time for a same-day submission', () => {
    expect(submittedLabel(SUBMIT, NOW)).toBe('ส่งเมื่อ 07:45 น. · 1 ชั่วโมงที่แล้ว')
  })

  it('names yesterday instead of counting hours', () => {
    // 2026-08-03 21:10 Bangkok = 14:10 UTC.
    expect(submittedLabel(new Date('2026-08-03T14:10:00.000Z'), NOW)).toBe(
      'ส่งเมื่อวาน 21:10 น.',
    )
  })

  it('falls back to a date for anything older', () => {
    // 2026-08-01 21:10 Bangkok.
    expect(submittedLabel(new Date('2026-08-01T14:10:00.000Z'), NOW)).toBe(
      'ส่งเมื่อ 1 ส.ค. 21:10 น.',
    )
  })

  it('returns an empty string for an unparsable timestamp', () => {
    expect(submittedLabel(new Date('nonsense'), NOW)).toBe('')
  })
})
