-- Track whether the child has seen a newly-earned badge (drives the "new" popup).
ALTER TABLE "user_badges" ADD COLUMN "seen_at" TIMESTAMP(3);

-- Seed the 5 curated badges so awards can persist (UserBadge FK → Badge).
-- Ids are the stable badge slugs; condition_type/value mirror lib/badges.ts.
-- Idempotent: ON CONFLICT DO NOTHING so re-running deploy never duplicates.
INSERT INTO "badges" ("id", "name", "description", "icon_emoji", "condition_type", "condition_value")
VALUES
  ('on_fire',      'On Fire',      'ทำงานต่อเนื่อง 7 วันติด',            '🔥', 'streak',          7),
  ('iron_will',    'Iron Will',    'ทำงานต่อเนื่อง 30 วันติด',           '💪', 'streak',          30),
  ('speed_demon',  'Speed Demon',  'ทำงานครบทุกอย่างก่อนเที่ยง',         '⚡', 'all_before_noon', NULL),
  ('overachiever', 'Overachiever', 'ทำงานพิเศษครบ 10 ครั้ง',             '🌟', 'extra_chores',    10),
  ('perfect_week', 'Perfect Week', 'ทำงานครบทุกวันตลอดสัปดาห์ ไม่ขาดเลย', '👑', 'perfect_week',    NULL)
ON CONFLICT ("id") DO NOTHING;
