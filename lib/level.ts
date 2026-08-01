/**
 * lib/level.ts — XP → level mapping.
 *
 * The ladder has a fixed top: 45 levels, capping at 200,000 cumulative XP.
 * The curve is quadratic so early levels come quickly and later ones stretch:
 *   threshold(L) = 200000 × ((L−1) / 44)²   for L in 1..45
 * L1 = 0 and L45 = 200,000 exactly; everything between is rounded to a whole XP.
 *
 * Ranks are tiered — 9 rank titles, one per band of 5 levels (L1–5, L6–10, …,
 * L41–45). Within a band a kid collects up to 5 ⭐ (one per level) before the
 * next promotion, so every single level-up shows a visible change.
 *
 * Pure functions only — no Prisma, no React.
 */

/** Number of levels in the ladder (the ceiling). */
export const MAX_LEVEL = 45

/** Cumulative XP at the top level (L45). */
export const XP_CAP = 200000

/** How many levels share one rank title. */
const LEVELS_PER_RANK = 5

/**
 * Precomputed cumulative XP required to *reach* each level 1..MAX_LEVEL
 * (index 0 = level 1). Quadratic curve, rounded to whole XP; anchored so
 * THRESHOLDS[0] === 0 and THRESHOLDS[MAX_LEVEL-1] === XP_CAP.
 */
const THRESHOLDS: readonly number[] = Array.from({ length: MAX_LEVEL }, (_, i) =>
  Math.round(XP_CAP * Math.pow(i / (MAX_LEVEL - 1), 2)),
)

/**
 * Cumulative XP needed to reach a given level (>= 1).
 * Levels above MAX_LEVEL clamp to the cap (the ladder tops out at L45).
 * @example xpThresholdForLevel(1)  // 0
 * @example xpThresholdForLevel(6)  // 2583
 * @example xpThresholdForLevel(45) // 200000
 */
export function xpThresholdForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be an integer >= 1, got ${level}`)
  }
  if (level >= MAX_LEVEL) return XP_CAP
  return THRESHOLDS[level - 1]
}

/**
 * The level a user with `xp` total XP has reached.
 * A user is at level L when they have at least the L threshold but less than
 * the L+1 threshold. Caps at MAX_LEVEL. Negative XP is treated as 0 (level 1).
 * @example levelForXp(0)      // 1
 * @example levelForXp(102)    // 1
 * @example levelForXp(103)    // 2  (exact crossing)
 * @example levelForXp(200000) // 45 (cap)
 */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp)) {
    throw new RangeError(`xp must be a finite number, got ${xp}`)
  }
  const clamped = Math.max(0, xp)
  let level = 1
  while (level < MAX_LEVEL && xpThresholdForLevel(level + 1) <= clamped) {
    level++
  }
  return level
}

/** XP still needed to reach the next level. 0 once the top level is reached. */
export function xpToNextLevel(xp: number): number {
  const level = levelForXp(xp)
  if (level >= MAX_LEVEL) return 0
  return xpThresholdForLevel(level + 1) - Math.max(0, xp)
}

/**
 * Kid-facing rank titles — the "good-habits hero" ladder. One title per band of
 * 5 levels (L1–5, L6–10, …, L41–45); levels past the top band clamp to the last
 * title. Nine bands total to cover all 45 levels.
 */
const RANK_NAMES: readonly string[] = [
  'ฮีโร่ฝึกหัด', // L1–5
  'นักผจญภัยน้อย', // L6–10
  'นักเก็บกวาด', // L11–15
  'ผู้ช่วยคนเก่ง', // L16–20
  'นักสู้ดาวรุ่ง', // L21–25
  'แชมป์นิสัยดี', // L26–30
  'ดาวเด่นประจำบ้าน', // L31–35
  'วินัยขั้นสูงสุด', // L36–40
  'ตำนานของบ้าน', // L41–45
]

/** The rank title for a level (>= 1), clamped to the final band. */
export function rankName(level: number): string {
  if (!Number.isInteger(level) || level < 1) return RANK_NAMES[0]
  const band = Math.floor((level - 1) / LEVELS_PER_RANK)
  return RANK_NAMES[Math.min(band, RANK_NAMES.length - 1)]
}

export interface LevelInfo {
  /** Current level (1..MAX_LEVEL). */
  level: number
  /** Rank title for the current level (e.g. "นักเก็บกวาด"). */
  rank: string
  /** Cumulative XP at which the current level began. */
  currentThreshold: number
  /** Cumulative XP at which the next level begins (== current at the top level). */
  nextThreshold: number
  /** XP earned since the current level began. */
  xpIntoLevel: number
  /** XP remaining to the next level (0 at the top level). */
  xpToNext: number
  /** Progress through the current level, 0..1 (1 at the top level). */
  progress: number
}

/** Everything the UI needs to render "อีก N XP ถึง Level x" + a progress bar. */
export function levelInfo(xp: number): LevelInfo {
  const clamped = Math.max(0, xp)
  const level = levelForXp(clamped)
  const atMax = level >= MAX_LEVEL
  const currentThreshold = xpThresholdForLevel(level)
  const nextThreshold = atMax ? currentThreshold : xpThresholdForLevel(level + 1)
  const span = nextThreshold - currentThreshold
  const xpIntoLevel = clamped - currentThreshold
  return {
    level,
    rank: rankName(level),
    currentThreshold,
    nextThreshold,
    xpIntoLevel,
    xpToNext: atMax ? 0 : nextThreshold - clamped,
    progress: atMax ? 1 : span > 0 ? xpIntoLevel / span : 0,
  }
}
