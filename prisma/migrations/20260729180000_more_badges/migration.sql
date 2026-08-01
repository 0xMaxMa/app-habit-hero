-- Add the 6 design-grid badges so their awards can persist (UserBadge FK → Badge).
-- Ids are the stable badge slugs; condition_type/value mirror lib/badges.ts.
-- Idempotent: ON CONFLICT DO NOTHING so re-running deploy never duplicates.
INSERT INTO "badges" ("id", "name", "description", "icon_emoji", "condition_type", "condition_value")
VALUES
  ('cleaner',    'นักทำความสะอาด', 'ทำงานทำความสะอาดครบ 10 ครั้ง',         '🧹', 'category_cleaning', 10),
  ('bookworm',   'หนอนหนังสือ',    'ทำงานอ่านหนังสือครบ 10 ครั้ง',         '📚', 'category_reading',  10),
  ('xp_1000',    '1,000 XP',       'สะสม XP ให้ครบ 1,000',                '⭐', 'total_xp',          1000),
  ('early_bird', 'ตื่นเช้า 14 วัน', 'ส่งงานตอนเช้า (ก่อน 8 โมง) ครบ 14 วัน', '🌙', 'early_bird_days',   14),
  ('chef',       'ผู้ช่วยเชฟ',      'ทำงานทำครัวครบ 5 ครั้ง',               '🍳', 'category_cooking',  5),
  ('xp_5000',    '5,000 XP',       'สะสม XP ให้ครบ 5,000',                '💎', 'total_xp',          5000)
ON CONFLICT ("id") DO NOTHING;

-- Realign the two streak badges to the exported design's labels + icons
-- ("On Fire"/💪 → the design's "สตรีค 7/30 วัน" with 🔥/🏆). Id-stable.
UPDATE "badges" SET "name" = 'สตรีค 7 วัน',  "icon_emoji" = '🔥' WHERE "id" = 'on_fire';
UPDATE "badges" SET "name" = 'สตรีค 30 วัน', "icon_emoji" = '🏆' WHERE "id" = 'iron_will';
