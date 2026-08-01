/**
 * lib/xp.ts — XP arithmetic.
 *
 * Pure helpers for accumulating XP and applying the "did it late" penalty.
 * The point-rule decisions (on-time / late / miss) live in `point-rules.ts`;
 * this module only does the math. XP is always a non-negative integer.
 */

/** Default multiplier applied when a chore is completed late (PRD §6.1). */
export const DEFAULT_LATE_PENALTY_MULTIPLIER = 0.6

function assertNonNegative(xp: number, label: string): void {
  if (!Number.isFinite(xp) || xp < 0) {
    throw new RangeError(`${label} must be a finite number >= 0, got ${xp}`)
  }
}

/**
 * Reduce a base XP award by the late-penalty multiplier.
 * Result is rounded to the nearest integer (XP has no fractional part).
 *
 * @example applyLatePenalty(50) // 30   (50 * 0.6)
 */
export function applyLatePenalty(
  baseXp: number,
  multiplier: number = DEFAULT_LATE_PENALTY_MULTIPLIER,
): number {
  assertNonNegative(baseXp, 'baseXp')
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new RangeError(`multiplier must be a finite number >= 0, got ${multiplier}`)
  }
  return Math.round(baseXp * multiplier)
}

/** Sum a list of XP awards (e.g. every approved completion for a user). */
export function totalXp(awards: readonly number[]): number {
  return awards.reduce((sum, x) => {
    assertNonNegative(x, 'award')
    return sum + x
  }, 0)
}

/**
 * Apply a delta (bonus, penalty, spend) to a running XP total, clamped at 0 so
 * a user's total_xp can never go negative.
 *
 * @example addXp(150, 50)   // 200
 * @example addXp(30, -100)  // 0   (clamped)
 */
export function addXp(current: number, delta: number): number {
  assertNonNegative(current, 'current')
  if (!Number.isFinite(delta)) {
    throw new RangeError(`delta must be a finite number, got ${delta}`)
  }
  return Math.max(0, current + delta)
}
