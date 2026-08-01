/**
 * lib/badges.ts — badge condition evaluation (PRD §6.3 + design badge grid).
 *
 * The catalog mirrors the exported Claude design's 8-badge wall plus the three
 * original PRD achievements. Each DB `Badge` row mirrors an entry here via
 * `condition_type` + `condition_value` (see prisma/seed-badges.ts).
 *
 * | 🔥 On Fire        | streak 7 วัน                         |
 * | 🧹 นักทำความสะอาด | ทำงานทำความสะอาดครบ 10 ครั้ง          |
 * | 📚 หนอนหนังสือ    | ทำงานอ่านหนังสือครบ 10 ครั้ง          |
 * | ⭐ 1,000 XP       | สะสม XP ครบ 1,000                    |
 * | 🌙 ตื่นเช้า 14 วัน | ส่งงานตอนเช้า (ก่อน 8 โมง) ครบ 14 วัน |
 * | 💪 Iron Will      | streak 30 วัน                        |
 * | 🍳 ผู้ช่วยเชฟ      | ทำงานทำครัวครบ 5 ครั้ง                |
 * | 💎 5,000 XP       | สะสม XP ครบ 5,000                    |
 * | ⚡ Speed Demon    | ทำครบทุกงานก่อน 12:00                |
 * | 🌟 Overachiever   | ทำ Extra Chore ครบ 10 ครั้ง          |
 * | 👑 Perfect Week   | ทำครบ 7 วันไม่ขาดแม้แต่วันเดียว       |
 *
 * Plus a second wave of 17 badges (2026-07-31) covering: beginner wins (first
 * chore / streak 3 / 10 chores), the 45-level ladder (L10/25/45), higher tiers
 * of the existing streak·XP·category badges, and reward-linked "good habit"
 * achievements (นักออม / แลกรางวัลครั้งแรก / ครบเครื่อง / Perfect Month).
 *
 * Pure — no Prisma, no React.
 */

export type BadgeId =
  | 'on_fire'
  | 'cleaner'
  | 'bookworm'
  | 'xp_1000'
  | 'early_bird'
  | 'iron_will'
  | 'chef'
  | 'xp_5000'
  | 'speed_demon'
  | 'overachiever'
  | 'perfect_week'
  // --- Second wave (2026-07-31) --------------------------------------------
  | 'first_chore'
  | 'streak_3'
  | 'ten_chores'
  | 'level_10'
  | 'level_25'
  | 'level_45'
  | 'streak_100'
  | 'cleaner_pro'
  | 'bookworm_pro'
  | 'chef_pro'
  | 'xp_10000'
  | 'xp_50000'
  | 'xp_200000'
  | 'saver'
  | 'first_redeem'
  | 'all_rounder'
  | 'perfect_month'

export type BadgeConditionType =
  | 'streak' // currentStreak >= value
  | 'total_xp' // totalXp (spendable balance) >= value
  | 'category_cleaning' // cleaning chores completed >= value
  | 'category_reading' // reading chores completed >= value
  | 'category_cooking' // cooking chores completed >= value
  | 'early_bird_days' // distinct early-morning days >= value
  | 'all_before_noon' // every chore today done before 12:00
  | 'extra_chores' // extraChoresCompleted >= value
  | 'perfect_week' // 7 consecutive complete days
  | 'total_completions' // lifetime approved completions >= value
  | 'level_reached' // current level >= value
  | 'saver' // totalXp >= value AND zero approved redemptions (delayed gratification)
  | 'redemptions' // approved reward redemptions >= value
  | 'all_categories_week' // did all 3 badge categories within the current week
  | 'perfect_month' // 30 consecutive complete days

export interface BadgeDefinition {
  id: BadgeId
  name: string
  emoji: string
  /** Kid-facing Thai description of how to earn it (shown as the locked hint). */
  description: string
  conditionType: BadgeConditionType
  /** Numeric threshold; undefined for boolean conditions. */
  conditionValue?: number
}

export const BADGES: readonly BadgeDefinition[] = [
  {
    id: 'on_fire',
    name: 'สตรีค 7 วัน',
    emoji: '🔥',
    description: 'ทำงานต่อเนื่อง 7 วันติด',
    conditionType: 'streak',
    conditionValue: 7,
  },
  {
    id: 'cleaner',
    name: 'นักทำความสะอาด',
    emoji: '🧹',
    description: 'ทำงานทำความสะอาดครบ 10 ครั้ง',
    conditionType: 'category_cleaning',
    conditionValue: 10,
  },
  {
    id: 'bookworm',
    name: 'หนอนหนังสือ',
    emoji: '📚',
    description: 'ทำงานอ่านหนังสือครบ 10 ครั้ง',
    conditionType: 'category_reading',
    conditionValue: 10,
  },
  {
    id: 'xp_1000',
    name: '1,000 XP',
    emoji: '⭐',
    description: 'สะสม XP ให้ครบ 1,000',
    conditionType: 'total_xp',
    conditionValue: 1000,
  },
  {
    id: 'early_bird',
    name: 'ตื่นเช้า 14 วัน',
    emoji: '🌙',
    description: 'ส่งงานตอนเช้า (ก่อน 8 โมง) ครบ 14 วัน',
    conditionType: 'early_bird_days',
    conditionValue: 14,
  },
  {
    id: 'iron_will',
    name: 'สตรีค 30 วัน',
    emoji: '🏆',
    description: 'ทำงานต่อเนื่อง 30 วันติด',
    conditionType: 'streak',
    conditionValue: 30,
  },
  {
    id: 'chef',
    name: 'ผู้ช่วยเชฟ',
    emoji: '🍳',
    description: 'ทำงานทำครัวครบ 5 ครั้ง',
    conditionType: 'category_cooking',
    conditionValue: 5,
  },
  {
    id: 'xp_5000',
    name: '5,000 XP',
    emoji: '💎',
    description: 'สะสม XP ให้ครบ 5,000',
    conditionType: 'total_xp',
    conditionValue: 5000,
  },
  {
    id: 'speed_demon',
    name: 'Speed Demon',
    emoji: '⚡',
    description: 'ทำงานครบทุกอย่างก่อนเที่ยง',
    conditionType: 'all_before_noon',
  },
  {
    id: 'overachiever',
    name: 'Overachiever',
    emoji: '🌟',
    description: 'ทำงานพิเศษครบ 10 ครั้ง',
    conditionType: 'extra_chores',
    conditionValue: 10,
  },
  {
    id: 'perfect_week',
    name: 'Perfect Week',
    emoji: '👑',
    description: 'ทำงานครบทุกวันตลอดสัปดาห์ ไม่ขาดเลย',
    conditionType: 'perfect_week',
  },

  // --- Second wave (2026-07-31) ---------------------------------------------
  // Beginner wins — the first few easy badges so a new child gets an early
  // dopamine hit long before the streak-7 / 1,000-XP milestones.
  {
    id: 'first_chore',
    name: 'งานแรกของฉัน',
    emoji: '🐣',
    description: 'ทำภารกิจสำเร็จเป็นครั้งแรก',
    conditionType: 'total_completions',
    conditionValue: 1,
  },
  {
    id: 'streak_3',
    name: 'สตรีค 3 วัน',
    emoji: '✨',
    description: 'ทำงานต่อเนื่อง 3 วันติด',
    conditionType: 'streak',
    conditionValue: 3,
  },
  {
    id: 'ten_chores',
    name: '10 ภารกิจแรก',
    emoji: '🎯',
    description: 'ทำภารกิจสำเร็จครบ 10 ครั้ง',
    conditionType: 'total_completions',
    conditionValue: 10,
  },
  // Level ladder — companions to the 45-level system (lib/level.ts).
  {
    id: 'level_10',
    name: 'เลเวล 10',
    emoji: '🎖️',
    description: 'เก็บ XP จนถึงเลเวล 10',
    conditionType: 'level_reached',
    conditionValue: 10,
  },
  {
    id: 'level_25',
    name: 'เลเวล 25',
    emoji: '🏅',
    description: 'ไต่ถึงเลเวล 25 — ครึ่งทางสู่จุดสูงสุด',
    conditionType: 'level_reached',
    conditionValue: 25,
  },
  {
    id: 'level_45',
    name: 'เลเวล 45 สูงสุด',
    emoji: '🦸',
    description: 'พิชิตเลเวลสูงสุด เป็นตำนานของบ้าน',
    conditionType: 'level_reached',
    conditionValue: 45,
  },
  // Higher tiers of the existing streak / XP / category badges.
  {
    id: 'streak_100',
    name: 'สตรีค 100 วัน',
    emoji: '💯',
    description: 'ทำงานต่อเนื่อง 100 วันติด',
    conditionType: 'streak',
    conditionValue: 100,
  },
  {
    id: 'cleaner_pro',
    name: 'ยอดนักสะอาด',
    emoji: '🧽',
    description: 'ทำงานทำความสะอาดครบ 50 ครั้ง',
    conditionType: 'category_cleaning',
    conditionValue: 50,
  },
  {
    id: 'bookworm_pro',
    name: 'ยอดหนอนหนังสือ',
    emoji: '📖',
    description: 'ทำงานอ่านหนังสือครบ 25 ครั้ง',
    conditionType: 'category_reading',
    conditionValue: 25,
  },
  {
    id: 'chef_pro',
    name: 'ยอดผู้ช่วยเชฟ',
    emoji: '👨‍🍳',
    description: 'ทำงานทำครัวครบ 15 ครั้ง',
    conditionType: 'category_cooking',
    conditionValue: 15,
  },
  {
    id: 'xp_10000',
    name: '10,000 XP',
    emoji: '🔷',
    description: 'สะสม XP ให้ครบ 10,000',
    conditionType: 'total_xp',
    conditionValue: 10000,
  },
  {
    id: 'xp_50000',
    name: '50,000 XP',
    emoji: '🚀',
    description: 'สะสม XP ให้ครบ 50,000',
    conditionType: 'total_xp',
    conditionValue: 50000,
  },
  {
    id: 'xp_200000',
    name: '200,000 XP สูงสุด',
    emoji: '🌌',
    description: 'สะสม XP แตะเพดานสูงสุด 200,000',
    conditionType: 'total_xp',
    conditionValue: 200000,
  },
  // Reward-linked "good habit" achievements.
  {
    id: 'saver',
    name: 'นักออม',
    emoji: '🐷',
    description: 'สะสม XP ถึง 2,000 โดยยังไม่แลกรางวัลเลย',
    conditionType: 'saver',
    conditionValue: 2000,
  },
  {
    id: 'first_redeem',
    name: 'แลกรางวัลครั้งแรก',
    emoji: '🎁',
    description: 'ใช้ XP แลกของรางวัลเป็นครั้งแรก',
    conditionType: 'redemptions',
    conditionValue: 1,
  },
  {
    id: 'all_rounder',
    name: 'ครบเครื่อง',
    emoji: '🌈',
    description: 'ทำครบทั้ง 3 หมวด (สะอาด/อ่าน/ครัว) ในสัปดาห์เดียว',
    conditionType: 'all_categories_week',
  },
  {
    id: 'perfect_month',
    name: 'Perfect Month',
    emoji: '📅',
    description: 'ทำงานครบทุกวันตลอดเดือน — สตรีค 30 วัน',
    conditionType: 'perfect_month',
  },
]

/** The static medal image for a badge (served from public/badges/<id>.png). */
export function badgeImagePath(id: BadgeId): string {
  return `/badges/${id}.png`
}

/** Look up a badge definition by its id. */
export function badgeById(id: string): BadgeDefinition | undefined {
  return BADGES.find((b) => b.id === id)
}

// ---------------------------------------------------------------------------
// Chore categorization (for the "do a type of task" badges)
//
// Chores have no explicit category column, so we infer one from the Thai title
// with a curated keyword list. This is a heuristic: an unrecognized title just
// counts toward nothing (it never mis-fires a crash). Cooking keywords are
// matched first so "ล้างผัก/เตรียมอาหาร" reads as cooking, while a bare "ล้าง…"
// falls through to cleaning.
// ---------------------------------------------------------------------------

export type ChoreCategory = 'cleaning' | 'reading' | 'cooking'

const CATEGORY_KEYWORDS: ReadonlyArray<[ChoreCategory, readonly string[]]> = [
  [
    'cooking',
    ['ทำอาหาร', 'ทำกับข้าว', 'ทำครัว', 'เข้าครัว', 'หุงข้าว', 'หุง', 'ทำขนม', 'เตรียมอาหาร', 'ล้างผัก', 'หั่น', 'ปรุง', 'ผัด', 'ต้ม', 'ทอด', 'เชฟ', 'ทำกับ'],
  ],
  [
    'reading',
    ['อ่าน', 'หนังสือ', 'การบ้าน', 'ทบทวน', 'ท่องหนังสือ', 'ท่องศัพท์', 'เขียนเรียงความ', 'อ่านนิทาน'],
  ],
  [
    'cleaning',
    ['ทำความสะอาด', 'ล้าง', 'กวาด', 'เช็ด', 'ถู', 'ปัด', 'ดูดฝุ่น', 'ซัก', 'เก็บของ', 'เก็บที่นอน', 'จัดที่นอน', 'จัดโต๊ะ', 'จัดห้อง', 'ทิ้งขยะ', 'ขยะ', 'รดน้ำ'],
  ],
]

/** Infer a chore's category from its title, or null when nothing matches. */
export function classifyChore(title: string): ChoreCategory | null {
  const t = title.toLowerCase()
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => t.includes(kw.toLowerCase()))) return category
  }
  return null
}

/** Snapshot of the stats every badge condition is evaluated against. */
export interface BadgeStats {
  /** Current consecutive-day streak. */
  currentStreak: number
  /** Did the user finish every one of today's chores before 12:00? */
  allChoresDoneBeforeNoon: boolean
  /** Lifetime count of completed Extra Chores. */
  extraChoresCompleted: number
  /** Completed all chores on all 7 days of the current week. */
  perfectWeek: boolean
  /** Running XP total. */
  totalXp: number
  /** Lifetime approved completions per inferred chore category. */
  categoryCounts: Record<ChoreCategory, number>
  /** Distinct calendar days with an early-morning (before 08:00) completion. */
  earlyBirdDays: number
  /** Lifetime count of approved completions (any category). */
  totalCompletions: number
  /** Current level (1..MAX_LEVEL), derived from the running XP total. */
  level: number
  /** Count of the user's approved reward redemptions. */
  redemptionsCount: number
  /** Did the user complete all 3 badge categories within the current week? */
  allCategoriesThisWeek: boolean
  /** Completed every day for 30 straight days (streak >= 30). */
  perfectMonth: boolean
}

/** A zeroed stats snapshot — handy for tests and partial evaluation. */
export const EMPTY_BADGE_STATS: BadgeStats = {
  currentStreak: 0,
  allChoresDoneBeforeNoon: false,
  extraChoresCompleted: 0,
  perfectWeek: false,
  totalXp: 0,
  categoryCounts: { cleaning: 0, reading: 0, cooking: 0 },
  earlyBirdDays: 0,
  totalCompletions: 0,
  level: 1,
  redemptionsCount: 0,
  allCategoriesThisWeek: false,
  perfectMonth: false,
}

/** Does a single badge's condition hold given the stats? */
export function isBadgeEarned(badge: BadgeDefinition, stats: BadgeStats): boolean {
  switch (badge.conditionType) {
    case 'streak':
      return stats.currentStreak >= (badge.conditionValue ?? Infinity)
    case 'total_xp':
      return stats.totalXp >= (badge.conditionValue ?? Infinity)
    case 'category_cleaning':
      return stats.categoryCounts.cleaning >= (badge.conditionValue ?? Infinity)
    case 'category_reading':
      return stats.categoryCounts.reading >= (badge.conditionValue ?? Infinity)
    case 'category_cooking':
      return stats.categoryCounts.cooking >= (badge.conditionValue ?? Infinity)
    case 'early_bird_days':
      return stats.earlyBirdDays >= (badge.conditionValue ?? Infinity)
    case 'extra_chores':
      return stats.extraChoresCompleted >= (badge.conditionValue ?? Infinity)
    case 'all_before_noon':
      return stats.allChoresDoneBeforeNoon
    case 'perfect_week':
      return stats.perfectWeek
    case 'total_completions':
      return stats.totalCompletions >= (badge.conditionValue ?? Infinity)
    case 'level_reached':
      return stats.level >= (badge.conditionValue ?? Infinity)
    case 'saver':
      // Delayed gratification: reach the XP bar without spending any of it yet.
      return stats.totalXp >= (badge.conditionValue ?? Infinity) && stats.redemptionsCount === 0
    case 'redemptions':
      return stats.redemptionsCount >= (badge.conditionValue ?? Infinity)
    case 'all_categories_week':
      return stats.allCategoriesThisWeek
    case 'perfect_month':
      return stats.perfectMonth
    default: {
      const _exhaustive: never = badge.conditionType
      throw new Error(`unknown condition type: ${String(_exhaustive)}`)
    }
  }
}

/** All badge ids currently earned given the stats. */
export function evaluateBadges(stats: BadgeStats): BadgeId[] {
  return BADGES.filter((b) => isBadgeEarned(b, stats)).map((b) => b.id)
}

/**
 * Badges earned now that the user did NOT already have — i.e. the ones to
 * celebrate / persist on this evaluation.
 */
export function newlyEarnedBadges(stats: BadgeStats, alreadyEarned: readonly BadgeId[]): BadgeId[] {
  const owned = new Set(alreadyEarned)
  return evaluateBadges(stats).filter((id) => !owned.has(id))
}
