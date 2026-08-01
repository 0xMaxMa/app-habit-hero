-- Second wave of 17 achievement badges (2026-07-31).
-- Ids are the stable badge slugs; condition_type/value mirror lib/badges.ts.
-- Idempotent: ON CONFLICT DO NOTHING so re-running deploy never duplicates and
-- an existing row (e.g. hand-seeded in dev) is left untouched.
INSERT INTO "badges" ("id", "name", "description", "icon_emoji", "condition_type", "condition_value")
VALUES
  ('first_chore',   'งานแรกของฉัน',        'ทำภารกิจสำเร็จเป็นครั้งแรก',                       '🐣', 'total_completions',   1),
  ('streak_3',      'สตรีค 3 วัน',          'ทำงานต่อเนื่อง 3 วันติด',                          '✨', 'streak',              3),
  ('ten_chores',    '10 ภารกิจแรก',         'ทำภารกิจสำเร็จครบ 10 ครั้ง',                       '🎯', 'total_completions',   10),
  ('level_10',      'เลเวล 10',             'เก็บ XP จนถึงเลเวล 10',                            '🎖️', 'level_reached',       10),
  ('level_25',      'เลเวล 25',             'ไต่ถึงเลเวล 25 — ครึ่งทางสู่จุดสูงสุด',             '🏅', 'level_reached',       25),
  ('level_45',      'เลเวล 45 สูงสุด',       'พิชิตเลเวลสูงสุด เป็นตำนานของบ้าน',                 '🦸', 'level_reached',       45),
  ('streak_100',    'สตรีค 100 วัน',        'ทำงานต่อเนื่อง 100 วันติด',                        '💯', 'streak',              100),
  ('cleaner_pro',   'ยอดนักสะอาด',          'ทำงานทำความสะอาดครบ 50 ครั้ง',                     '🧽', 'category_cleaning',   50),
  ('bookworm_pro',  'ยอดหนอนหนังสือ',       'ทำงานอ่านหนังสือครบ 25 ครั้ง',                     '📖', 'category_reading',    25),
  ('chef_pro',      'ยอดผู้ช่วยเชฟ',         'ทำงานทำครัวครบ 15 ครั้ง',                          '👨‍🍳', 'category_cooking',   15),
  ('xp_10000',      '10,000 XP',            'สะสม XP ให้ครบ 10,000',                           '🔷', 'total_xp',            10000),
  ('xp_50000',      '50,000 XP',            'สะสม XP ให้ครบ 50,000',                           '🚀', 'total_xp',            50000),
  ('xp_200000',     '200,000 XP สูงสุด',     'สะสม XP แตะเพดานสูงสุด 200,000',                   '🌌', 'total_xp',            200000),
  ('saver',         'นักออม',               'สะสม XP ถึง 2,000 โดยยังไม่แลกรางวัลเลย',           '🐷', 'saver',               2000),
  ('first_redeem',  'แลกรางวัลครั้งแรก',     'ใช้ XP แลกของรางวัลเป็นครั้งแรก',                   '🎁', 'redemptions',         1),
  ('all_rounder',   'ครบเครื่อง',           'ทำครบทั้ง 3 หมวด (สะอาด/อ่าน/ครัว) ในสัปดาห์เดียว',  '🌈', 'all_categories_week', NULL),
  ('perfect_month', 'Perfect Month',        'ทำงานครบทุกวันตลอดเดือน — สตรีค 30 วัน',            '📅', 'perfect_month',       NULL)
ON CONFLICT ("id") DO NOTHING;
