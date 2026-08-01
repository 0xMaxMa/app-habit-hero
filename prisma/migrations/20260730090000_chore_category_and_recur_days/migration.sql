-- Chore.category (accurate category badges + drawer chips) and Chore.recurDays
-- (weekly day-of-week picker). Both are additive with safe defaults, so existing
-- rows keep working; category is then backfilled from the title with the same
-- cooking > reading > cleaning precedence as lib/badges.ts classifyChore().

-- 1. New enum type.
CREATE TYPE "ChoreCategory" AS ENUM ('cleaning', 'reading', 'cooking', 'other');

-- 2. New columns with defaults (existing rows → 'other' + empty day set).
ALTER TABLE "chores"
  ADD COLUMN "category" "ChoreCategory" NOT NULL DEFAULT 'other',
  ADD COLUMN "recur_days" INTEGER[] NOT NULL DEFAULT '{}';

-- 3. Backfill existing rows by keyword. Each step only touches rows still at the
--    'other' default, so the first match wins (cooking beats reading beats
--    cleaning), mirroring classifyChore()'s ordered keyword lists.
UPDATE "chores" SET "category" = 'cooking'
WHERE "category" = 'other' AND (
  title LIKE '%ทำอาหาร%' OR title LIKE '%ทำกับข้าว%' OR title LIKE '%ทำครัว%' OR
  title LIKE '%เข้าครัว%' OR title LIKE '%หุงข้าว%' OR title LIKE '%หุง%' OR
  title LIKE '%ทำขนม%' OR title LIKE '%เตรียมอาหาร%' OR title LIKE '%ล้างผัก%' OR
  title LIKE '%หั่น%' OR title LIKE '%ปรุง%' OR title LIKE '%ผัด%' OR
  title LIKE '%ต้ม%' OR title LIKE '%ทอด%' OR title LIKE '%เชฟ%' OR title LIKE '%ทำกับ%'
);

UPDATE "chores" SET "category" = 'reading'
WHERE "category" = 'other' AND (
  title LIKE '%อ่าน%' OR title LIKE '%หนังสือ%' OR title LIKE '%การบ้าน%' OR
  title LIKE '%ทบทวน%' OR title LIKE '%ท่องหนังสือ%' OR title LIKE '%ท่องศัพท์%' OR
  title LIKE '%เขียนเรียงความ%' OR title LIKE '%อ่านนิทาน%'
);

UPDATE "chores" SET "category" = 'cleaning'
WHERE "category" = 'other' AND (
  title LIKE '%ทำความสะอาด%' OR title LIKE '%ล้าง%' OR title LIKE '%กวาด%' OR
  title LIKE '%เช็ด%' OR title LIKE '%ถู%' OR title LIKE '%ปัด%' OR
  title LIKE '%ดูดฝุ่น%' OR title LIKE '%ซัก%' OR title LIKE '%เก็บของ%' OR
  title LIKE '%เก็บที่นอน%' OR title LIKE '%จัดที่นอน%' OR title LIKE '%จัดโต๊ะ%' OR
  title LIKE '%จัดห้อง%' OR title LIKE '%ทิ้งขยะ%' OR title LIKE '%ขยะ%' OR title LIKE '%รดน้ำ%'
);
