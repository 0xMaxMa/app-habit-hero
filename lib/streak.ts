/**
 * lib/streak.ts — daily streak tracking (PRD §6.3).
 *
 *   นับวันทำ chore ครบทุกอัน
 *   Streak milestone: 3, 7, 14, 30, 100 วัน
 *   Streak break: ข้ามวันโดยไม่ทำครบ → reset เป็น 0
 *
 * A "day" is a UTC calendar day (midnight-to-midnight, UTC). Every time-aware
 * function takes a {@link Clock}; nothing here reads `Date.now()`. Pure — no
 * Prisma, no React.
 */

import type { Clock } from './clock'

/** Streak lengths that earn a milestone reward. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 100] as const

export type StreakMilestone = (typeof STREAK_MILESTONES)[number]

const MS_PER_DAY = 86_400_000

/** UTC day index — same value for any instant within the same UTC calendar day. */
export function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / MS_PER_DAY)
}

/** Is `streak` exactly on a milestone boundary? */
export function isMilestone(streak: number): streak is StreakMilestone {
  return (STREAK_MILESTONES as readonly number[]).includes(streak)
}

/** The milestone newly crossed when a streak goes from `prev` to `next`, else null. */
export function milestoneReached(prev: number, next: number): StreakMilestone | null {
  for (const m of STREAK_MILESTONES) {
    if (prev < m && next >= m) return m
  }
  return null
}

export interface StreakState {
  current: number
  longest: number
  /** Instant of the last day the user completed everything, or null if never. */
  lastActiveDate: Date | null
}

export interface StreakUpdate {
  state: StreakState
  /** Streak went up by one (a fresh consecutive day). */
  incremented: boolean
  /** Streak was reset to 1 after a gap (or started from nothing). */
  reset: boolean
  /** Milestone newly reached by this update, else null. */
  milestone: StreakMilestone | null
}

/**
 * Record that the user completed all of today's chores.
 *
 * - first ever completion → streak = 1
 * - same UTC day as last active → no change (idempotent within a day)
 * - exactly the next UTC day → streak + 1
 * - a gap of 2+ days → streak resets to 1
 */
export function recordCompletion(state: StreakState, clock: Clock): StreakUpdate {
  const now = clock.now()
  const today = dayNumber(now)

  if (state.lastActiveDate !== null) {
    const last = dayNumber(state.lastActiveDate)
    if (today === last) {
      // Already counted today — no-op.
      return { state, incremented: false, reset: false, milestone: null }
    }
    if (today < last) {
      // Clock moved backwards; treat as no-op to stay monotonic.
      return { state, incremented: false, reset: false, milestone: null }
    }
    if (today === last + 1) {
      const current = state.current + 1
      const next: StreakState = {
        current,
        longest: Math.max(state.longest, current),
        lastActiveDate: now,
      }
      return {
        state: next,
        incremented: true,
        reset: false,
        milestone: milestoneReached(state.current, current),
      }
    }
    // Gap of 2+ days → streak broke, restart at 1.
    const next: StreakState = {
      current: 1,
      longest: Math.max(state.longest, 1),
      lastActiveDate: now,
    }
    return {
      state: next,
      incremented: false,
      reset: true,
      milestone: milestoneReached(0, 1),
    }
  }

  // First ever completion.
  const next: StreakState = {
    current: 1,
    longest: Math.max(state.longest, 1),
    lastActiveDate: now,
  }
  return {
    state: next,
    incremented: true,
    reset: false,
    milestone: milestoneReached(0, 1),
  }
}

/**
 * Has the streak lapsed as of `clock.now()`? True when more than one full day
 * has passed since the last active day (i.e. a day was missed).
 */
export function isStreakBroken(state: StreakState, clock: Clock): boolean {
  if (state.lastActiveDate === null) return false
  return dayNumber(clock.now()) - dayNumber(state.lastActiveDate) > 1
}

/** Reset the current streak to 0, preserving `longest` and `lastActiveDate`. */
export function resetStreak(state: StreakState): StreakState {
  return { ...state, current: 0 }
}
