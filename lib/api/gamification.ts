/**
 * lib/api/gamification.ts — apply an XP change and return the "what changed"
 * deltas the agent/UI celebrate (T25).
 *
 * All the actual math lives in lib/ (xp, level, streak, badges); this module
 * only orchestrates: bump UserProgress, optionally advance the daily streak,
 * re-evaluate badges, persist any newly-earned ones, and hand back a compact
 * delta. Kept separate from the route so the approve/bonus endpoints share one
 * consistent gamification shape.
 *
 * `reverseGamification` (bottom) is the inverse, used when a parent undoes an
 * approval: it claws the XP back and revokes only the badges that approval was
 * holding up. Both paths score badges through the same `computeBadgeStats`.
 */

import type { Clock } from '@/lib/clock'
import { THAI_LOCAL_OFFSET_MS } from '@/lib/clock'
import { prisma } from '@/lib/db'
import { addXp } from '@/lib/xp'
import { levelForXp } from '@/lib/level'
import { recordCompletion, type StreakState, type StreakMilestone } from '@/lib/streak'
import {
  BADGES,
  classifyChore,
  isBadgeEarned,
  newlyEarnedBadges,
  type BadgeId,
  type BadgeStats,
  type ChoreCategory,
} from '@/lib/badges'

export interface ProgressDelta {
  totalXp: number
  level: number
  previousLevel: number
  leveledUp: boolean
}

export interface StreakDelta {
  current: number
  longest: number
  incremented: boolean
  reset: boolean
  milestone: StreakMilestone | null
}

export interface BadgeAward {
  id: BadgeId
  name: string
  emoji: string
}

export interface Gamification {
  progress: ProgressDelta
  streak: StreakDelta
  newBadges: BadgeAward[]
}

export interface GamifyOptions {
  userId: string
  /** XP to add to the user's running total (may be 0). */
  xpDelta: number
  /**
   * Whether this event completed all of the user's chores for the day — the
   * trigger for advancing the daily streak (lib/streak).
   */
  completedDay: boolean
  /** Did the user finish every one of today's chores before noon? (Speed Demon) */
  allChoresDoneBeforeNoon: boolean
  clock: Clock
}

/** Stable key so a DB Badge row can be matched back to a BADGES definition. */
function badgeKey(conditionType: string, conditionValue: number | null | undefined): string {
  return `${conditionType}:${conditionValue ?? ''}`
}

/**
 * Recompute every badge stat that is derivable from persisted state (approved
 * completions + approved redemptions) for `userId`, combined with the caller's
 * already-known XP / level / streak.
 *
 * Shared by the award path (applyGamification) and the undo path
 * (reverseGamification) so both judge a badge against exactly the same rules.
 */
async function computeBadgeStats(opts: {
  userId: string
  totalXp: number
  level: number
  currentStreak: number
  allChoresDoneBeforeNoon: boolean
  clock: Clock
  /**
   * Count this completion as if it were still approved. Used by the undo path
   * to reconstruct the "before" snapshot after the row has already been flipped
   * back to pending.
   */
  alsoCountCompletionId?: string
}): Promise<BadgeStats> {
  const {
    userId,
    totalXp,
    level,
    currentStreak,
    allChoresDoneBeforeNoon,
    clock,
    alsoCountCompletionId,
  } = opts

  // One pass over the child's approved completions feeds three stats: the
  // Extra-Chore count, per-category counts (title-inferred), and the number of
  // distinct early-morning days. The caller has already written the completion's
  // new status, so the row under review is counted (approve) / skipped (undo).
  const approved = await prisma.choreCompletion.findMany({
    where: alsoCountCompletionId
      ? { completedBy: userId, OR: [{ status: 'approved' }, { id: alsoCountCompletionId }] }
      : { completedBy: userId, status: 'approved' },
    select: { submittedAt: true, chore: { select: { title: true, isExtra: true, category: true } } },
  })

  // Approved reward redemptions — feeds the "แลกรางวัลครั้งแรก" badge and gates
  // the "นักออม" (saver) badge (earned only while this count is still 0).
  const redemptionsCount = await prisma.rewardRedemption.count({
    where: { redeemedBy: userId, status: 'approved' },
  })

  // Start of the current week (Monday 00:00 Thai local), expressed as a real
  // UTC timestamp, for the "ครบเครื่อง" (all 3 categories this week) badge.
  const localNow = new Date(clock.now().getTime() + THAI_LOCAL_OFFSET_MS)
  const daysFromMonday = (localNow.getUTCDay() + 6) % 7 // 0 = Monday
  const weekStartMs =
    Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate() - daysFromMonday,
    ) - THAI_LOCAL_OFFSET_MS

  let extraChoresCompleted = 0
  const categoryCounts: Record<ChoreCategory, number> = { cleaning: 0, reading: 0, cooking: 0 }
  const earlyDayKeys = new Set<string>()
  const weekCategories = new Set<ChoreCategory>()
  // The families we serve are in Thailand (≈UTC+7). Bucket "morning" and the
  // day boundary in local time so "ตื่นเช้า" means before 08:00 for the child.
  for (const c of approved) {
    if (c.chore.isExtra) extraChoresCompleted++
    // Prefer the chore's explicit category column (accurate); only fall back to
    // title inference for legacy/agent-created chores still tagged 'other'. Only
    // the three badge-bearing categories count — newer categories (exercise/
    // routine/helping) have no achievement badge, so they never contribute here.
    const raw = c.chore.category === 'other' ? classifyChore(c.chore.title) : c.chore.category
    if (raw === 'cleaning' || raw === 'reading' || raw === 'cooking') {
      categoryCounts[raw] += 1
      if (c.submittedAt.getTime() >= weekStartMs) weekCategories.add(raw)
    }
    const local = new Date(c.submittedAt.getTime() + THAI_LOCAL_OFFSET_MS)
    if (local.getUTCHours() < 8) {
      earlyDayKeys.add(`${local.getUTCFullYear()}-${local.getUTCMonth()}-${local.getUTCDate()}`)
    }
  }

  return {
    currentStreak,
    allChoresDoneBeforeNoon,
    extraChoresCompleted,
    // A 7-day unbroken streak of complete days is exactly "a perfect week with
    // no missed day" — derive it from the streak the daily engine already keeps.
    perfectWeek: currentStreak >= 7,
    // Likewise a 30-day unbroken streak is a "perfect month".
    perfectMonth: currentStreak >= 30,
    totalXp,
    categoryCounts,
    earlyBirdDays: earlyDayKeys.size,
    totalCompletions: approved.length,
    level,
    redemptionsCount,
    allCategoriesThisWeek: weekCategories.size === 3,
  }
}

/**
 * Persist an XP change for `userId` and return the resulting gamification
 * deltas. Upserts UserProgress so a child without a progress row still works.
 */
export async function applyGamification(opts: GamifyOptions): Promise<Gamification> {
  const { userId, xpDelta, completedDay, allChoresDoneBeforeNoon, clock } = opts

  const existing = await prisma.userProgress.findUnique({ where: { userId } })
  const previousTotal = existing?.totalXp ?? 0
  const previousLevel = existing?.currentLevel ?? 1

  const newTotal = addXp(previousTotal, xpDelta)
  const newLevel = levelForXp(newTotal)

  // --- Streak ------------------------------------------------------------
  const streakStateBefore: StreakState = {
    current: existing?.currentStreak ?? 0,
    longest: existing?.longestStreak ?? 0,
    lastActiveDate: existing?.lastActiveDate ?? null,
  }
  const streakUpdate = completedDay
    ? recordCompletion(streakStateBefore, clock)
    : { state: streakStateBefore, incremented: false, reset: false, milestone: null as StreakMilestone | null }

  await prisma.userProgress.upsert({
    where: { userId },
    create: {
      userId,
      totalXp: newTotal,
      currentLevel: newLevel,
      currentStreak: streakUpdate.state.current,
      longestStreak: streakUpdate.state.longest,
      lastActiveDate: streakUpdate.state.lastActiveDate,
    },
    update: {
      totalXp: newTotal,
      currentLevel: newLevel,
      currentStreak: streakUpdate.state.current,
      longestStreak: streakUpdate.state.longest,
      lastActiveDate: streakUpdate.state.lastActiveDate,
    },
  })

  // --- Badges ------------------------------------------------------------
  const stats = await computeBadgeStats({
    userId,
    totalXp: newTotal,
    level: newLevel,
    currentStreak: streakUpdate.state.current,
    allChoresDoneBeforeNoon,
    clock,
  })

  // Map DB Badge rows both ways so we know what the user already has and which
  // row to write a UserBadge against.
  const badgeRows = await prisma.badge.findMany()
  const rowByKey = new Map(badgeRows.map((b) => [badgeKey(b.conditionType, b.conditionValue), b]))

  const owned = await prisma.userBadge.findMany({
    where: { userId },
    include: { badge: true },
  })
  const alreadyEarned = owned
    .map((ub) => {
      const def = BADGES.find(
        (b) => badgeKey(b.conditionType, b.conditionValue) === badgeKey(ub.badge.conditionType, ub.badge.conditionValue),
      )
      return def?.id
    })
    .filter((id): id is BadgeId => Boolean(id))

  const newlyIds = newlyEarnedBadges(stats, alreadyEarned)

  const newBadges: BadgeAward[] = []
  for (const id of newlyIds) {
    const def = BADGES.find((b) => b.id === id)
    if (!def) continue
    newBadges.push({ id: def.id, name: def.name, emoji: def.emoji })
    // Persist only when a matching Badge row is seeded; otherwise the delta is
    // still returned so the agent can celebrate.
    const row = rowByKey.get(badgeKey(def.conditionType, def.conditionValue))
    if (row) {
      await prisma.userBadge.upsert({
        where: { userId_badgeId: { userId, badgeId: row.id } },
        create: { userId, badgeId: row.id },
        update: {},
      })
    }
  }

  return {
    progress: {
      totalXp: newTotal,
      level: newLevel,
      previousLevel,
      leveledUp: newLevel > previousLevel,
    },
    streak: {
      current: streakUpdate.state.current,
      longest: streakUpdate.state.longest,
      incremented: streakUpdate.incremented,
      reset: streakUpdate.reset,
      milestone: streakUpdate.milestone,
    },
    newBadges,
  }
}

// ---------------------------------------------------------------------------
// Undo — the exact inverse of applyGamification for a single approval.
// ---------------------------------------------------------------------------

export interface UndoProgressDelta {
  totalXp: number
  level: number
  previousLevel: number
  leveledDown: boolean
}

export interface UndoGamification {
  progress: UndoProgressDelta
  /** Badges taken back because this approval was the only thing earning them. */
  revokedBadges: BadgeAward[]
}

export interface UndoOptions {
  userId: string
  /** XP to remove from the user's running total (the amount this approval gave). */
  xpDelta: number
  /**
   * The completion that was just flipped out of 'approved'. Counted back in to
   * reconstruct the "before" badge snapshot, so we can revoke *only* what this
   * undo actually invalidated.
   */
  completionId: string
  clock: Clock
}

/**
 * Reverse one approval's gamification: subtract the XP it granted, recompute the
 * level, and take back any badge that this approval — and only this approval —
 * was holding up.
 *
 * Revocation is deliberately a *before vs after* diff rather than a plain
 * "recompute and drop whatever no longer qualifies". Several badge conditions
 * legitimately stop holding for reasons unrelated to this undo (XP is a
 * spendable balance, so redeeming a reward lowers totalXp; `perfect_week` and
 * `all_categories_week` are point-in-time achievements). A blanket recompute
 * would strip those historical badges off the child. Diffing isolates the
 * damage this one undo caused and leaves everything else untouched.
 *
 * The daily streak is intentionally NOT rewound: an approval only ever nudges
 * the streak when it completes the child's whole day, and later days may have
 * advanced it since — there is no sound way to undo one step of it. Callers
 * should say so rather than imply the streak was reverted.
 */
export async function reverseGamification(opts: UndoOptions): Promise<UndoGamification> {
  const { userId, xpDelta, completionId, clock } = opts

  const existing = await prisma.userProgress.findUnique({ where: { userId } })
  const previousTotal = existing?.totalXp ?? 0
  const previousLevel = existing?.currentLevel ?? 1
  const currentStreak = existing?.currentStreak ?? 0

  // Never let a clawback push a child below zero (XP is also spent on rewards,
  // so the running balance can already be lower than what this approval gave).
  const newTotal = Math.max(0, previousTotal - xpDelta)
  const newLevel = levelForXp(newTotal)

  await prisma.userProgress.upsert({
    where: { userId },
    create: { userId, totalXp: newTotal, currentLevel: newLevel },
    update: { totalXp: newTotal, currentLevel: newLevel },
  })

  // --- Badge diff: earned before this undo, no longer earned after ---------
  // `allChoresDoneBeforeNoon` is a property of the approval moment and is not
  // recoverable here; passing false on BOTH sides keeps it out of the diff, so
  // the Speed Demon badge is never revoked by an unrelated undo.
  const statsBefore = await computeBadgeStats({
    userId,
    totalXp: previousTotal,
    level: previousLevel,
    currentStreak,
    allChoresDoneBeforeNoon: false,
    clock,
    alsoCountCompletionId: completionId,
  })
  const statsAfter = await computeBadgeStats({
    userId,
    totalXp: newTotal,
    level: newLevel,
    currentStreak,
    allChoresDoneBeforeNoon: false,
    clock,
  })

  const invalidated = BADGES.filter(
    (def) => isBadgeEarned(def, statsBefore) && !isBadgeEarned(def, statsAfter),
  )

  const revokedBadges: BadgeAward[] = []
  if (invalidated.length > 0) {
    const owned = await prisma.userBadge.findMany({ where: { userId }, include: { badge: true } })
    for (const def of invalidated) {
      const key = badgeKey(def.conditionType, def.conditionValue)
      const held = owned.find((ub) => badgeKey(ub.badge.conditionType, ub.badge.conditionValue) === key)
      if (!held) continue
      await prisma.userBadge.delete({
        where: { userId_badgeId: { userId, badgeId: held.badgeId } },
      })
      revokedBadges.push({ id: def.id, name: def.name, emoji: def.emoji })
    }
  }

  return {
    progress: {
      totalXp: newTotal,
      level: newLevel,
      previousLevel,
      leveledDown: newLevel < previousLevel,
    },
    revokedBadges,
  }
}
