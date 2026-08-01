/**
 * lib/point-rules.ts — on-time / late / miss → XP awarded (PRD §6.1).
 *
 *   ทำก่อน deadline → ได้ point เต็ม
 *   ทำหลัง deadline แต่ยังในวัน → ได้ 60% (configurable)
 *   ไม่ทำเลย → 0 point
 *
 * Deadline comparison is exact-instant: submitting *at* the deadline is on
 * time; one millisecond after is late. Pure — no Prisma, no React.
 */

import type { Clock } from './clock'
import { applyLatePenalty, DEFAULT_LATE_PENALTY_MULTIPLIER } from './xp'

export type CompletionOutcome = 'on_time' | 'late' | 'miss'

/** Was the submission after the deadline? (equal instant = on time). */
export function isLate(dueAt: Date, submittedAt: Date): boolean {
  return submittedAt.getTime() > dueAt.getTime()
}

/** Classify an actual submission against its deadline. */
export function classifyOutcome(dueAt: Date, submittedAt: Date): Extract<CompletionOutcome, 'on_time' | 'late'> {
  return isLate(dueAt, submittedAt) ? 'late' : 'on_time'
}

/** XP awarded for a known outcome. */
export function xpForOutcome(
  baseXp: number,
  outcome: CompletionOutcome,
  multiplier: number = DEFAULT_LATE_PENALTY_MULTIPLIER,
): number {
  switch (outcome) {
    case 'on_time':
      return baseXp
    case 'late':
      return applyLatePenalty(baseXp, multiplier)
    case 'miss':
      return 0
    default: {
      const _exhaustive: never = outcome
      throw new Error(`unknown outcome: ${String(_exhaustive)}`)
    }
  }
}

/** XP for a submission with an explicit submitted-at timestamp. */
export function xpForSubmission(
  baseXp: number,
  dueAt: Date,
  submittedAt: Date,
  multiplier: number = DEFAULT_LATE_PENALTY_MULTIPLIER,
): number {
  return xpForOutcome(baseXp, classifyOutcome(dueAt, submittedAt), multiplier)
}

/**
 * Resolve a chore's "HH:MM" due time into the exact UTC deadline instant for a
 * given submission. The due time is a *local* time-of-day (the families we serve
 * are in Thailand, ≈UTC+7): "20:00" means 20:00 for the child, not 20:00 UTC.
 *
 * We anchor the due time to the submission's LOCAL calendar day, then convert
 * back to a UTC instant so it compares correctly against the (UTC) submittedAt.
 * Returns null when there is no due time or it is malformed (→ no deadline, so
 * no late penalty). Pure — pass the offset in (see THAI_LOCAL_OFFSET_MS).
 */
export function deadlineForDueTime(
  submittedAt: Date,
  dueTime: string | null,
  offsetMs: number,
): Date | null {
  if (!dueTime) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(dueTime.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return null
  const local = new Date(submittedAt.getTime() + offsetMs)
  const deadlineLocalMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    hours,
    minutes,
    0,
    0,
  )
  return new Date(deadlineLocalMs - offsetMs)
}

/**
 * XP for a submission happening "now" per the injected clock — the form API
 * routes use so the submission time is never read from `Date.now()` directly.
 */
export function xpForSubmissionNow(
  baseXp: number,
  dueAt: Date,
  clock: Clock,
  multiplier: number = DEFAULT_LATE_PENALTY_MULTIPLIER,
): number {
  return xpForSubmission(baseXp, dueAt, clock.now(), multiplier)
}
