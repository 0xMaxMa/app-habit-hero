import { describe, it, expect } from 'vitest'
import {
  BADGES,
  isBadgeEarned,
  evaluateBadges,
  newlyEarnedBadges,
  classifyChore,
  EMPTY_BADGE_STATS,
  type BadgeStats,
  type BadgeDefinition,
} from './badges'

const none: BadgeStats = EMPTY_BADGE_STATS

function badge(id: string): BadgeDefinition {
  const b = BADGES.find((x) => x.id === id)
  if (!b) throw new Error(`no badge ${id}`)
  return b
}

describe('BADGES catalog', () => {
  it('is the original 11 followed by the 17 second-wave badges', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      // original 11
      'on_fire',
      'cleaner',
      'bookworm',
      'xp_1000',
      'early_bird',
      'iron_will',
      'chef',
      'xp_5000',
      'speed_demon',
      'overachiever',
      'perfect_week',
      // second wave (2026-07-31)
      'first_chore',
      'streak_3',
      'ten_chores',
      'level_10',
      'level_25',
      'level_45',
      'streak_100',
      'cleaner_pro',
      'bookworm_pro',
      'chef_pro',
      'xp_10000',
      'xp_50000',
      'xp_200000',
      'saver',
      'first_redeem',
      'all_rounder',
      'perfect_month',
    ])
    expect(badge('on_fire').conditionValue).toBe(7)
    expect(badge('iron_will').conditionValue).toBe(30)
    expect(badge('overachiever').conditionValue).toBe(10)
    expect(badge('xp_1000').conditionValue).toBe(1000)
    expect(badge('xp_5000').conditionValue).toBe(5000)
    expect(badge('early_bird').conditionValue).toBe(14)
    expect(badge('cleaner').conditionValue).toBe(10)
    expect(badge('chef').conditionValue).toBe(5)
    // second-wave thresholds
    expect(badge('first_chore').conditionValue).toBe(1)
    expect(badge('streak_3').conditionValue).toBe(3)
    expect(badge('level_45').conditionValue).toBe(45)
    expect(badge('streak_100').conditionValue).toBe(100)
    expect(badge('xp_200000').conditionValue).toBe(200000)
    expect(badge('saver').conditionValue).toBe(2000)
    expect(badge('all_rounder').conditionValue).toBeUndefined()
    expect(badge('perfect_month').conditionValue).toBeUndefined()
  })

  it('has no duplicate ids', () => {
    const ids = BADGES.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every badge has a medal PNG id and a kid-facing description', () => {
    for (const b of BADGES) {
      expect(b.description.length).toBeGreaterThan(0)
      expect(b.id).toMatch(/^[a-z0-9_]+$/)
    }
  })
})

describe('classifyChore', () => {
  it('reads cleaning titles', () => {
    expect(classifyChore('ล้างจานมื้อเย็น')).toBe('cleaning')
    expect(classifyChore('กวาดบ้าน')).toBe('cleaning')
    expect(classifyChore('เก็บที่นอน')).toBe('cleaning')
    expect(classifyChore('ทิ้งขยะ')).toBe('cleaning')
  })

  it('reads reading titles', () => {
    expect(classifyChore('อ่านหนังสือ 20 นาที')).toBe('reading')
    expect(classifyChore('ทำการบ้าน')).toBe('reading')
  })

  it('reads cooking titles, and cooking wins over a bare wash keyword', () => {
    expect(classifyChore('ช่วยทำอาหารเย็น')).toBe('cooking')
    expect(classifyChore('หุงข้าว')).toBe('cooking')
    // "ล้างผัก" is cooking prep — cooking keywords are checked before cleaning.
    expect(classifyChore('ล้างผักเตรียมทำกับข้าว')).toBe('cooking')
  })

  it('returns null for an unrecognized title', () => {
    expect(classifyChore('ให้อาหารน้องหมา')).toBeNull()
    expect(classifyChore('xyz')).toBeNull()
  })
})

describe('isBadgeEarned — streak badges at their boundary', () => {
  it('On Fire earns at exactly streak 7, not 6', () => {
    expect(isBadgeEarned(badge('on_fire'), { ...none, currentStreak: 6 })).toBe(false)
    expect(isBadgeEarned(badge('on_fire'), { ...none, currentStreak: 7 })).toBe(true)
    expect(isBadgeEarned(badge('on_fire'), { ...none, currentStreak: 40 })).toBe(true)
  })

  it('Iron Will earns at exactly streak 30, not 29', () => {
    expect(isBadgeEarned(badge('iron_will'), { ...none, currentStreak: 29 })).toBe(false)
    expect(isBadgeEarned(badge('iron_will'), { ...none, currentStreak: 30 })).toBe(true)
  })
})

describe('isBadgeEarned — xp / category / early-bird badges', () => {
  it('1,000 XP earns at exactly 1000', () => {
    expect(isBadgeEarned(badge('xp_1000'), { ...none, totalXp: 999 })).toBe(false)
    expect(isBadgeEarned(badge('xp_1000'), { ...none, totalXp: 1000 })).toBe(true)
  })

  it('5,000 XP earns at exactly 5000', () => {
    expect(isBadgeEarned(badge('xp_5000'), { ...none, totalXp: 4999 })).toBe(false)
    expect(isBadgeEarned(badge('xp_5000'), { ...none, totalXp: 5000 })).toBe(true)
  })

  it('นักทำความสะอาด earns at 10 cleaning chores', () => {
    const at = (n: number) => ({ ...none, categoryCounts: { ...none.categoryCounts, cleaning: n } })
    expect(isBadgeEarned(badge('cleaner'), at(9))).toBe(false)
    expect(isBadgeEarned(badge('cleaner'), at(10))).toBe(true)
  })

  it('หนอนหนังสือ earns at 10 reading chores', () => {
    const at = (n: number) => ({ ...none, categoryCounts: { ...none.categoryCounts, reading: n } })
    expect(isBadgeEarned(badge('bookworm'), at(9))).toBe(false)
    expect(isBadgeEarned(badge('bookworm'), at(10))).toBe(true)
  })

  it('ผู้ช่วยเชฟ earns at 5 cooking chores', () => {
    const at = (n: number) => ({ ...none, categoryCounts: { ...none.categoryCounts, cooking: n } })
    expect(isBadgeEarned(badge('chef'), at(4))).toBe(false)
    expect(isBadgeEarned(badge('chef'), at(5))).toBe(true)
  })

  it('ตื่นเช้า earns at 14 early days', () => {
    expect(isBadgeEarned(badge('early_bird'), { ...none, earlyBirdDays: 13 })).toBe(false)
    expect(isBadgeEarned(badge('early_bird'), { ...none, earlyBirdDays: 14 })).toBe(true)
  })
})

describe('isBadgeEarned — count and boolean badges', () => {
  it('Overachiever earns at exactly 10 extra chores', () => {
    expect(isBadgeEarned(badge('overachiever'), { ...none, extraChoresCompleted: 9 })).toBe(false)
    expect(isBadgeEarned(badge('overachiever'), { ...none, extraChoresCompleted: 10 })).toBe(true)
  })

  it('Speed Demon needs all chores before noon', () => {
    expect(isBadgeEarned(badge('speed_demon'), { ...none, allChoresDoneBeforeNoon: true })).toBe(
      true,
    )
    expect(isBadgeEarned(badge('speed_demon'), none)).toBe(false)
  })

  it('Perfect Week needs the perfectWeek flag', () => {
    expect(isBadgeEarned(badge('perfect_week'), { ...none, perfectWeek: true })).toBe(true)
    expect(isBadgeEarned(badge('perfect_week'), none)).toBe(false)
  })
})

describe('isBadgeEarned — second-wave conditions', () => {
  it('งานแรกของฉัน earns at the first completion', () => {
    expect(isBadgeEarned(badge('first_chore'), { ...none, totalCompletions: 0 })).toBe(false)
    expect(isBadgeEarned(badge('first_chore'), { ...none, totalCompletions: 1 })).toBe(true)
  })

  it('10 ภารกิจแรก earns at 10 completions', () => {
    expect(isBadgeEarned(badge('ten_chores'), { ...none, totalCompletions: 9 })).toBe(false)
    expect(isBadgeEarned(badge('ten_chores'), { ...none, totalCompletions: 10 })).toBe(true)
  })

  it('level badges earn at their level threshold', () => {
    expect(isBadgeEarned(badge('level_10'), { ...none, level: 9 })).toBe(false)
    expect(isBadgeEarned(badge('level_10'), { ...none, level: 10 })).toBe(true)
    expect(isBadgeEarned(badge('level_45'), { ...none, level: 44 })).toBe(false)
    expect(isBadgeEarned(badge('level_45'), { ...none, level: 45 })).toBe(true)
  })

  it('นักออม needs the XP bar AND zero redemptions', () => {
    expect(isBadgeEarned(badge('saver'), { ...none, totalXp: 1999, redemptionsCount: 0 })).toBe(false)
    expect(isBadgeEarned(badge('saver'), { ...none, totalXp: 2000, redemptionsCount: 0 })).toBe(true)
    // Any redemption disqualifies it, no matter the balance.
    expect(isBadgeEarned(badge('saver'), { ...none, totalXp: 5000, redemptionsCount: 1 })).toBe(false)
  })

  it('แลกรางวัลครั้งแรก earns at the first approved redemption', () => {
    expect(isBadgeEarned(badge('first_redeem'), { ...none, redemptionsCount: 0 })).toBe(false)
    expect(isBadgeEarned(badge('first_redeem'), { ...none, redemptionsCount: 1 })).toBe(true)
  })

  it('ครบเครื่อง needs all 3 categories this week', () => {
    expect(isBadgeEarned(badge('all_rounder'), { ...none, allCategoriesThisWeek: true })).toBe(true)
    expect(isBadgeEarned(badge('all_rounder'), none)).toBe(false)
  })

  it('Perfect Month needs the perfectMonth flag', () => {
    expect(isBadgeEarned(badge('perfect_month'), { ...none, perfectMonth: true })).toBe(true)
    expect(isBadgeEarned(badge('perfect_month'), none)).toBe(false)
  })
})

describe('evaluateBadges', () => {
  it('returns nothing when no condition is met', () => {
    expect(evaluateBadges(none)).toEqual([])
  })

  it('a maxed-out child earns every badge except นักออม (they redeemed once)', () => {
    const stats: BadgeStats = {
      currentStreak: 100, // on_fire + streak_3 + iron_will + streak_100
      allChoresDoneBeforeNoon: true, // speed_demon
      extraChoresCompleted: 12, // overachiever
      perfectWeek: true, // perfect_week
      perfectMonth: true, // perfect_month
      totalXp: 200000, // every total_xp tier (1k/5k/10k/50k/200k)
      categoryCounts: { cleaning: 50, reading: 25, cooking: 15 }, // base + pro tiers
      earlyBirdDays: 14, // early_bird
      totalCompletions: 10, // first_chore + ten_chores
      level: 45, // level_10 + level_25 + level_45
      redemptionsCount: 1, // first_redeem — but this DISQUALIFIES saver
      allCategoriesThisWeek: true, // all_rounder
    }
    // Everything except 'saver', which requires redemptionsCount === 0.
    const expected = BADGES.map((b) => b.id).filter((id) => id !== 'saver')
    expect(evaluateBadges(stats).sort()).toEqual(expected.sort())
    expect(evaluateBadges(stats)).not.toContain('saver')
  })

  it('a 7-day streak earns On Fire and the 3-day streak, but not Iron Will', () => {
    expect(evaluateBadges({ ...none, currentStreak: 7 })).toEqual(['on_fire', 'streak_3'])
  })
})

describe('newlyEarnedBadges', () => {
  it('excludes badges the user already holds', () => {
    const stats: BadgeStats = { ...none, currentStreak: 7 }
    expect(newlyEarnedBadges(stats, [])).toEqual(['on_fire', 'streak_3'])
    expect(newlyEarnedBadges(stats, ['on_fire', 'streak_3'])).toEqual([])
  })

  it('surfaces a freshly crossed milestone badge', () => {
    // was on_fire + streak_3 (streak 7), now hit 30 -> iron_will is new
    const stats: BadgeStats = { ...none, currentStreak: 30 }
    expect(newlyEarnedBadges(stats, ['on_fire', 'streak_3'])).toEqual(['iron_will'])
  })

  it('surfaces an XP-threshold badge the moment it is crossed', () => {
    const stats: BadgeStats = { ...none, totalXp: 1000 }
    expect(newlyEarnedBadges(stats, [])).toEqual(['xp_1000'])
  })
})
