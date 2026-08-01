/**
 * prisma/seed-badges.ts — upsert the 5 curated Badge rows.
 *
 * The production DB gets these from the migration
 * (20260729160000_badges_seed_and_seen). The dev/test seeds truncate the table,
 * so they re-apply the same rows via this helper to keep UserBadge FKs valid.
 *
 * Rows mirror lib/badges.ts (id = slug, condition_type/value identical). Kept as
 * a plain constant so the CLI seeds don't depend on the "@/" path alias.
 */

import type { PrismaClient } from '@prisma/client'

export const BADGE_ROWS = [
  { id: 'on_fire', name: 'สตรีค 7 วัน', description: 'ทำงานต่อเนื่อง 7 วันติด', iconEmoji: '🔥', conditionType: 'streak', conditionValue: 7 },
  { id: 'cleaner', name: 'นักทำความสะอาด', description: 'ทำงานทำความสะอาดครบ 10 ครั้ง', iconEmoji: '🧹', conditionType: 'category_cleaning', conditionValue: 10 },
  { id: 'bookworm', name: 'หนอนหนังสือ', description: 'ทำงานอ่านหนังสือครบ 10 ครั้ง', iconEmoji: '📚', conditionType: 'category_reading', conditionValue: 10 },
  { id: 'xp_1000', name: '1,000 XP', description: 'สะสม XP ให้ครบ 1,000', iconEmoji: '⭐', conditionType: 'total_xp', conditionValue: 1000 },
  { id: 'early_bird', name: 'ตื่นเช้า 14 วัน', description: 'ส่งงานตอนเช้า (ก่อน 8 โมง) ครบ 14 วัน', iconEmoji: '🌙', conditionType: 'early_bird_days', conditionValue: 14 },
  { id: 'iron_will', name: 'สตรีค 30 วัน', description: 'ทำงานต่อเนื่อง 30 วันติด', iconEmoji: '🏆', conditionType: 'streak', conditionValue: 30 },
  { id: 'chef', name: 'ผู้ช่วยเชฟ', description: 'ทำงานทำครัวครบ 5 ครั้ง', iconEmoji: '🍳', conditionType: 'category_cooking', conditionValue: 5 },
  { id: 'xp_5000', name: '5,000 XP', description: 'สะสม XP ให้ครบ 5,000', iconEmoji: '💎', conditionType: 'total_xp', conditionValue: 5000 },
  { id: 'speed_demon', name: 'Speed Demon', description: 'ทำงานครบทุกอย่างก่อนเที่ยง', iconEmoji: '⚡', conditionType: 'all_before_noon', conditionValue: null },
  { id: 'overachiever', name: 'Overachiever', description: 'ทำงานพิเศษครบ 10 ครั้ง', iconEmoji: '🌟', conditionType: 'extra_chores', conditionValue: 10 },
  { id: 'perfect_week', name: 'Perfect Week', description: 'ทำงานครบทุกวันตลอดสัปดาห์ ไม่ขาดเลย', iconEmoji: '👑', conditionType: 'perfect_week', conditionValue: null },
  // --- Second wave (2026-07-31) ---------------------------------------------
  { id: 'first_chore',   name: 'งานแรกของฉัน',       description: 'ทำภารกิจสำเร็จเป็นครั้งแรก',                  iconEmoji: '🐣', conditionType: 'total_completions',   conditionValue: 1 },
  { id: 'streak_3',      name: 'สตรีค 3 วัน',         description: 'ทำงานต่อเนื่อง 3 วันติด',                     iconEmoji: '✨', conditionType: 'streak',              conditionValue: 3 },
  { id: 'ten_chores',    name: '10 ภารกิจแรก',        description: 'ทำภารกิจสำเร็จครบ 10 ครั้ง',                  iconEmoji: '🎯', conditionType: 'total_completions',   conditionValue: 10 },
  { id: 'level_10',      name: 'เลเวล 10',            description: 'เก็บ XP จนถึงเลเวล 10',                       iconEmoji: '🎖️', conditionType: 'level_reached',       conditionValue: 10 },
  { id: 'level_25',      name: 'เลเวล 25',            description: 'ไต่ถึงเลเวล 25 — ครึ่งทางสู่จุดสูงสุด',        iconEmoji: '🏅', conditionType: 'level_reached',       conditionValue: 25 },
  { id: 'level_45',      name: 'เลเวล 45 สูงสุด',      description: 'พิชิตเลเวลสูงสุด เป็นตำนานของบ้าน',            iconEmoji: '🦸', conditionType: 'level_reached',       conditionValue: 45 },
  { id: 'streak_100',    name: 'สตรีค 100 วัน',       description: 'ทำงานต่อเนื่อง 100 วันติด',                   iconEmoji: '💯', conditionType: 'streak',              conditionValue: 100 },
  { id: 'cleaner_pro',   name: 'ยอดนักสะอาด',         description: 'ทำงานทำความสะอาดครบ 50 ครั้ง',                iconEmoji: '🧽', conditionType: 'category_cleaning',   conditionValue: 50 },
  { id: 'bookworm_pro',  name: 'ยอดหนอนหนังสือ',      description: 'ทำงานอ่านหนังสือครบ 25 ครั้ง',                iconEmoji: '📖', conditionType: 'category_reading',    conditionValue: 25 },
  { id: 'chef_pro',      name: 'ยอดผู้ช่วยเชฟ',        description: 'ทำงานทำครัวครบ 15 ครั้ง',                    iconEmoji: '👨‍🍳', conditionType: 'category_cooking',   conditionValue: 15 },
  { id: 'xp_10000',      name: '10,000 XP',           description: 'สะสม XP ให้ครบ 10,000',                      iconEmoji: '🔷', conditionType: 'total_xp',            conditionValue: 10000 },
  { id: 'xp_50000',      name: '50,000 XP',           description: 'สะสม XP ให้ครบ 50,000',                      iconEmoji: '🚀', conditionType: 'total_xp',            conditionValue: 50000 },
  { id: 'xp_200000',     name: '200,000 XP สูงสุด',    description: 'สะสม XP แตะเพดานสูงสุด 200,000',              iconEmoji: '🌌', conditionType: 'total_xp',            conditionValue: 200000 },
  { id: 'saver',         name: 'นักออม',              description: 'สะสม XP ถึง 2,000 โดยยังไม่แลกรางวัลเลย',      iconEmoji: '🐷', conditionType: 'saver',               conditionValue: 2000 },
  { id: 'first_redeem',  name: 'แลกรางวัลครั้งแรก',    description: 'ใช้ XP แลกของรางวัลเป็นครั้งแรก',              iconEmoji: '🎁', conditionType: 'redemptions',         conditionValue: 1 },
  { id: 'all_rounder',   name: 'ครบเครื่อง',          description: 'ทำครบทั้ง 3 หมวด (สะอาด/อ่าน/ครัว) ในสัปดาห์เดียว', iconEmoji: '🌈', conditionType: 'all_categories_week', conditionValue: null },
  { id: 'perfect_month', name: 'Perfect Month',       description: 'ทำงานครบทุกวันตลอดเดือน — สตรีค 30 วัน',        iconEmoji: '📅', conditionType: 'perfect_month',       conditionValue: null },
] as const

/** Idempotently upsert every curated badge by its stable slug id. */
export async function seedBadges(prisma: PrismaClient): Promise<void> {
  for (const b of BADGE_ROWS) {
    await prisma.badge.upsert({
      where: { id: b.id },
      create: {
        id: b.id,
        name: b.name,
        description: b.description,
        iconEmoji: b.iconEmoji,
        conditionType: b.conditionType,
        conditionValue: b.conditionValue,
      },
      update: {
        name: b.name,
        description: b.description,
        iconEmoji: b.iconEmoji,
        conditionType: b.conditionType,
        conditionValue: b.conditionValue,
      },
    })
  }
}
