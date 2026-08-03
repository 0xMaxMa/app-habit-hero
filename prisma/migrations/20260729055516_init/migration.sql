-- HabitHero baseline schema.
--
-- Every table, enum, index and foreign key the app needs, plus the global badge
-- catalogue, in one migration. Earlier incremental migrations were folded in
-- here on 2026-08-03: a fresh install has no history to replay, so replaying it
-- only cost boot time and made the schema hard to read in one sitting.
--
-- The DDL below is generated from prisma/schema.prisma
-- (`prisma migrate diff --from-empty --to-schema-datamodel`); regenerate it the
-- same way if this file ever needs rebuilding. The badge INSERT at the bottom is
-- hand-maintained and must stay in step with lib/badges.ts.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('parent', 'child');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('daily', 'weekly', 'once');

-- CreateEnum
CREATE TYPE "ChoreCategory" AS ENUM ('cleaning', 'reading', 'cooking', 'other', 'exercise', 'routine', 'helping');

-- CreateEnum
CREATE TYPE "CompletionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "families" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel_group_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "families_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "family_id" TEXT NOT NULL,
    "channel_user_ref" TEXT,
    "link_code" TEXT,
    "avatar_url" TEXT,
    "avatar_character" TEXT,
    "email" TEXT,
    "password_hash" TEXT,
    "pin_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chores" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "family_id" TEXT NOT NULL,
    "assigned_to" TEXT,
    "xp_value" INTEGER NOT NULL,
    "late_xp_multiplier" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "recurrence" "Recurrence" NOT NULL DEFAULT 'once',
    "category" "ChoreCategory" NOT NULL DEFAULT 'other',
    -- NOT NULL is not something Prisma emits for list columns, but every
    -- deployment so far has it and an absent day set is spelled '{}', never
    -- null. Kept by hand so a fresh install matches the existing ones.
    "recur_days" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "due_time" TEXT,
    "active_from" TIMESTAMP(3),
    "active_until" TIMESTAMP(3),
    "require_photo" BOOLEAN NOT NULL DEFAULT true,
    "is_extra" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chore_completions" (
    "id" TEXT NOT NULL,
    "chore_id" TEXT NOT NULL,
    "completed_by" TEXT NOT NULL,
    "photo_url" TEXT,
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CompletionStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "xp_awarded" INTEGER NOT NULL DEFAULT 0,
    "feedback" TEXT,
    "is_team" BOOLEAN NOT NULL DEFAULT false,
    "team_members" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chore_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rewards" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "family_id" TEXT NOT NULL,
    "xp_cost" INTEGER NOT NULL,
    "icon_emoji" TEXT,
    "daily_limit" INTEGER,
    "weekly_limit" INTEGER,
    "monthly_limit" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reward_redemptions" (
    "id" TEXT NOT NULL,
    "reward_id" TEXT NOT NULL,
    "redeemed_by" TEXT NOT NULL,
    "xp_spent" INTEGER NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'pending',
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "current_level" INTEGER NOT NULL DEFAULT 1,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon_emoji" TEXT,
    "condition_type" TEXT NOT NULL,
    "condition_value" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen_at" TIMESTAMP(3),

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_channel_user_ref_key" ON "users"("channel_user_ref");

-- CreateIndex
CREATE UNIQUE INDEX "users_link_code_key" ON "users"("link_code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_family_id_idx" ON "users"("family_id");

-- CreateIndex
CREATE INDEX "chores_family_id_idx" ON "chores"("family_id");

-- CreateIndex
CREATE INDEX "chores_assigned_to_idx" ON "chores"("assigned_to");

-- CreateIndex
CREATE INDEX "chore_completions_chore_id_idx" ON "chore_completions"("chore_id");

-- CreateIndex
CREATE INDEX "chore_completions_completed_by_idx" ON "chore_completions"("completed_by");

-- CreateIndex
CREATE INDEX "chore_completions_status_idx" ON "chore_completions"("status");

-- CreateIndex
CREATE INDEX "rewards_family_id_idx" ON "rewards"("family_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_reward_id_idx" ON "reward_redemptions"("reward_id");

-- CreateIndex
CREATE INDEX "reward_redemptions_redeemed_by_idx" ON "reward_redemptions"("redeemed_by");

-- CreateIndex
CREATE INDEX "reward_redemptions_status_idx" ON "reward_redemptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "user_progress_user_id_key" ON "user_progress"("user_id");

-- CreateIndex
CREATE INDEX "user_badges_badge_id_idx" ON "user_badges"("badge_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_badges_user_id_badge_id_key" ON "user_badges"("user_id", "badge_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chores" ADD CONSTRAINT "chores_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chores" ADD CONSTRAINT "chores_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_completions" ADD CONSTRAINT "chore_completions_chore_id_fkey" FOREIGN KEY ("chore_id") REFERENCES "chores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_completions" ADD CONSTRAINT "chore_completions_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chore_completions" ADD CONSTRAINT "chore_completions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rewards" ADD CONSTRAINT "rewards_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "rewards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_redeemed_by_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Badge catalogue (28)
--
-- Badges are global, not per-family, so they ship with the schema instead of
-- with a family's starter data. Ids are the stable slugs referenced by
-- lib/badges.ts; condition_type/value mirror it exactly. ON CONFLICT DO NOTHING
-- keeps `migrate deploy` safe to re-run and leaves a hand-edited row untouched.
-- ---------------------------------------------------------------------------
INSERT INTO "badges" ("id", "name", "description", "icon_emoji", "condition_type", "condition_value")
VALUES
  -- Streaks & consistency
  ('streak_3',      'สตรีค 3 วัน',          'ทำงานต่อเนื่อง 3 วันติด',                          '✨', 'streak',              3),
  ('on_fire',       'สตรีค 7 วัน',          'ทำงานต่อเนื่อง 7 วันติด',                          '🔥', 'streak',              7),
  ('iron_will',     'สตรีค 30 วัน',         'ทำงานต่อเนื่อง 30 วันติด',                         '🏆', 'streak',              30),
  ('streak_100',    'สตรีค 100 วัน',        'ทำงานต่อเนื่อง 100 วันติด',                        '💯', 'streak',              100),
  ('perfect_week',  'Perfect Week',         'ทำงานครบทุกวันตลอดสัปดาห์ ไม่ขาดเลย',               '👑', 'perfect_week',        NULL),
  ('perfect_month', 'Perfect Month',        'ทำงานครบทุกวันตลอดเดือน — สตรีค 30 วัน',            '📅', 'perfect_month',       NULL),

  -- Volume of work
  ('first_chore',   'งานแรกของฉัน',         'ทำภารกิจสำเร็จเป็นครั้งแรก',                        '🐣', 'total_completions',   1),
  ('ten_chores',    '10 ภารกิจแรก',         'ทำภารกิจสำเร็จครบ 10 ครั้ง',                        '🎯', 'total_completions',   10),
  ('overachiever',  'Overachiever',         'ทำงานพิเศษครบ 10 ครั้ง',                            '🌟', 'extra_chores',        10),

  -- Categories
  ('cleaner',       'นักทำความสะอาด',       'ทำงานทำความสะอาดครบ 10 ครั้ง',                      '🧹', 'category_cleaning',   10),
  ('cleaner_pro',   'ยอดนักสะอาด',          'ทำงานทำความสะอาดครบ 50 ครั้ง',                      '🧽', 'category_cleaning',   50),
  ('bookworm',      'หนอนหนังสือ',          'ทำงานอ่านหนังสือครบ 10 ครั้ง',                      '📚', 'category_reading',    10),
  ('bookworm_pro',  'ยอดหนอนหนังสือ',       'ทำงานอ่านหนังสือครบ 25 ครั้ง',                      '📖', 'category_reading',    25),
  ('chef',          'ผู้ช่วยเชฟ',            'ทำงานทำครัวครบ 5 ครั้ง',                            '🍳', 'category_cooking',    5),
  ('chef_pro',      'ยอดผู้ช่วยเชฟ',         'ทำงานทำครัวครบ 15 ครั้ง',                           '👨‍🍳', 'category_cooking',   15),
  ('all_rounder',   'ครบเครื่อง',            'ทำครบทั้ง 3 หมวด (สะอาด/อ่าน/ครัว) ในสัปดาห์เดียว',  '🌈', 'all_categories_week', NULL),

  -- Time of day
  ('speed_demon',   'Speed Demon',          'ทำงานครบทุกอย่างก่อนเที่ยง',                        '⚡', 'all_before_noon',     NULL),
  ('early_bird',    'ตื่นเช้า 14 วัน',       'ส่งงานตอนเช้า (ก่อน 8 โมง) ครบ 14 วัน',              '🌙', 'early_bird_days',     14),

  -- XP & levels
  ('xp_1000',       '1,000 XP',             'สะสม XP ให้ครบ 1,000',                             '⭐', 'total_xp',            1000),
  ('xp_5000',       '5,000 XP',             'สะสม XP ให้ครบ 5,000',                             '💎', 'total_xp',            5000),
  ('xp_10000',      '10,000 XP',            'สะสม XP ให้ครบ 10,000',                            '🔷', 'total_xp',            10000),
  ('xp_50000',      '50,000 XP',            'สะสม XP ให้ครบ 50,000',                            '🚀', 'total_xp',            50000),
  ('xp_200000',     '200,000 XP สูงสุด',     'สะสม XP แตะเพดานสูงสุด 200,000',                    '🌌', 'total_xp',            200000),
  ('level_10',      'เลเวล 10',             'เก็บ XP จนถึงเลเวล 10',                             '🎖️', 'level_reached',       10),
  ('level_25',      'เลเวล 25',             'ไต่ถึงเลเวล 25 — ครึ่งทางสู่จุดสูงสุด',              '🏅', 'level_reached',       25),
  ('level_45',      'เลเวล 45 สูงสุด',       'พิชิตเลเวลสูงสุด เป็นตำนานของบ้าน',                  '🦸', 'level_reached',       45),

  -- Rewards
  ('saver',         'นักออม',               'สะสม XP ถึง 2,000 โดยยังไม่แลกรางวัลเลย',            '🐷', 'saver',               2000),
  ('first_redeem',  'แลกรางวัลครั้งแรก',     'ใช้ XP แลกของรางวัลเป็นครั้งแรก',                    '🎁', 'redemptions',         1)
ON CONFLICT ("id") DO NOTHING;
