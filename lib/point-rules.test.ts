import { describe, it, expect } from 'vitest'
import {
  isLate,
  classifyOutcome,
  xpForOutcome,
  xpForSubmission,
  xpForSubmissionNow,
  deadlineForDueTime,
} from './point-rules'
import { createFakeClock, THAI_LOCAL_OFFSET_MS } from './clock'

const DUE = new Date('2026-07-29T20:00:00Z')

describe('isLate / classifyOutcome — deadline boundary', () => {
  it('is on time when submitted before the deadline', () => {
    const before = new Date('2026-07-29T19:59:00Z')
    expect(isLate(DUE, before)).toBe(false)
    expect(classifyOutcome(DUE, before)).toBe('on_time')
  })

  it('is on time when submitted at exactly the deadline instant', () => {
    const exact = new Date('2026-07-29T20:00:00Z')
    expect(isLate(DUE, exact)).toBe(false)
    expect(classifyOutcome(DUE, exact)).toBe('on_time')
  })

  it('is late when submitted one minute after the deadline', () => {
    const oneMinLate = new Date('2026-07-29T20:01:00Z')
    expect(isLate(DUE, oneMinLate)).toBe(true)
    expect(classifyOutcome(DUE, oneMinLate)).toBe('late')
  })

  it('is late when submitted one millisecond after the deadline', () => {
    const oneMs = new Date(DUE.getTime() + 1)
    expect(isLate(DUE, oneMs)).toBe(true)
  })
})

describe('xpForOutcome', () => {
  it('awards full XP on time', () => {
    expect(xpForOutcome(50, 'on_time')).toBe(50)
  })

  it('awards 60% (default) when late', () => {
    expect(xpForOutcome(50, 'late')).toBe(30)
  })

  it('awards 0 for a miss', () => {
    expect(xpForOutcome(50, 'miss')).toBe(0)
  })

  it('honours a custom late multiplier', () => {
    expect(xpForOutcome(100, 'late', 0.5)).toBe(50)
  })
})

describe('xpForSubmission', () => {
  it('full XP just before the deadline, penalised just after', () => {
    expect(xpForSubmission(50, DUE, new Date('2026-07-29T19:59:00Z'))).toBe(50)
    expect(xpForSubmission(50, DUE, new Date('2026-07-29T20:00:00Z'))).toBe(50)
    expect(xpForSubmission(50, DUE, new Date('2026-07-29T20:01:00Z'))).toBe(30)
  })
})

describe('xpForSubmissionNow', () => {
  it('uses the injected clock as the submission time', () => {
    const clock = createFakeClock('2026-07-29T20:01:00Z')
    expect(xpForSubmissionNow(50, DUE, clock)).toBe(30)
    clock.set('2026-07-29T19:00:00Z')
    expect(xpForSubmissionNow(50, DUE, clock)).toBe(50)
  })
})

describe('deadlineForDueTime — Thai-local due time', () => {
  const OFFSET = THAI_LOCAL_OFFSET_MS // +7h

  it('resolves a "20:00" due time to 13:00 UTC on the submission local day', () => {
    // Submitted 2026-07-29T10:00:00Z = 17:00 Thai on the 29th.
    const submitted = new Date('2026-07-29T10:00:00Z')
    const due = deadlineForDueTime(submitted, '20:00', OFFSET)
    // 20:00 Thai on the 29th = 13:00 UTC on the 29th.
    expect(due?.toISOString()).toBe('2026-07-29T13:00:00.000Z')
  })

  it('marks a submission after the LOCAL deadline as late (the bug this fixes)', () => {
    // 21:30 Thai on the 29th = 14:30 UTC — after a 20:00 Thai deadline.
    const submitted = new Date('2026-07-29T14:30:00Z')
    const due = deadlineForDueTime(submitted, '20:00', OFFSET)!
    expect(isLate(due, submitted)).toBe(true)
    expect(xpForSubmission(50, due, submitted)).toBe(30)
  })

  it('keeps a submission before the local deadline on time', () => {
    // 09:00 Thai on the 29th = 02:00 UTC — before a 20:00 Thai deadline.
    const submitted = new Date('2026-07-29T02:00:00Z')
    const due = deadlineForDueTime(submitted, '20:00', OFFSET)!
    expect(isLate(due, submitted)).toBe(false)
    expect(xpForSubmission(50, due, submitted)).toBe(50)
  })

  it('anchors to the submission local day even across the UTC midnight boundary', () => {
    // 2026-07-29T22:00:00Z = 05:00 Thai on the 30th → local day is the 30th.
    const submitted = new Date('2026-07-29T22:00:00Z')
    const due = deadlineForDueTime(submitted, '20:00', OFFSET)
    // 20:00 Thai on the 30th = 13:00 UTC on the 30th.
    expect(due?.toISOString()).toBe('2026-07-30T13:00:00.000Z')
  })

  it('returns null for no / malformed due time (→ no deadline, no penalty)', () => {
    const s = new Date('2026-07-29T10:00:00Z')
    expect(deadlineForDueTime(s, null, OFFSET)).toBeNull()
    expect(deadlineForDueTime(s, '99:99', OFFSET)).toBeNull()
    expect(deadlineForDueTime(s, 'nope', OFFSET)).toBeNull()
  })
})
