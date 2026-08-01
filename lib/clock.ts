/**
 * lib/clock.ts — injectable clock.
 *
 * Everything time-based in HabitHero (streaks, deadline penalties, auto-approve
 * windows) MUST take a `Clock` instead of calling `Date.now()` / `new Date()`
 * directly. That keeps the business logic pure and lets tests freeze / advance
 * time deterministically. Do NOT call `Date.now()` anywhere else in `lib/`.
 */

export interface Clock {
  /** Current instant. Callers must treat the returned Date as read-only. */
  now(): Date
}

/**
 * The offset of the families we serve (Thailand, ≈UTC+7) from UTC, in ms.
 * Used to bucket "local day" and time-of-day (streak day boundaries, the
 * "ตื่นเช้า" early-morning window, and chore due-time deadlines) consistently,
 * so a "20:00" due time means 20:00 for the child, not 20:00 UTC.
 */
export const THAI_LOCAL_OFFSET_MS = 7 * 60 * 60 * 1000

/** Real wall-clock. The only place `new Date()` (no args) is allowed. */
export const systemClock: Clock = {
  now: () => new Date(),
}

/** Factory form of {@link systemClock}, handy for DI containers. */
export function createSystemClock(): Clock {
  return { now: () => new Date() }
}

/** A clock whose time can be set / advanced — for tests only. */
export interface FakeClock extends Clock {
  /** Jump to an absolute instant. */
  set(instant: Date | string | number): void
  /** Move forward (or backward, if negative) by milliseconds. */
  advance(ms: number): void
  /** Move forward by whole days (24h each). */
  advanceDays(days: number): void
}

/**
 * Create a controllable clock for tests.
 * @param initial starting instant (default: Unix epoch).
 */
export function createFakeClock(initial: Date | string | number = 0): FakeClock {
  let current = new Date(initial)
  return {
    // Return a copy so callers cannot mutate the internal instant.
    now: () => new Date(current.getTime()),
    set: (instant) => {
      current = new Date(instant)
    },
    advance: (ms) => {
      current = new Date(current.getTime() + ms)
    },
    advanceDays: (days) => {
      current = new Date(current.getTime() + days * 86_400_000)
    },
  }
}
