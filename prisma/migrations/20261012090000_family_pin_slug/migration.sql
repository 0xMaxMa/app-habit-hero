-- families.pin_slug — the stable per-family code behind the bookmarkable
-- /pin/<slug> child sign-in URL (multi-family: app/pin must know WHICH
-- family's children to list before it lists any; see lib/pin-slug.ts).
--
-- Added nullable first and backfilled, because ALTER TABLE ... ADD COLUMN
-- NOT NULL has no default to fall back on for the families that already
-- exist. Every pre-existing family gets its own random slug from the same
-- alphabet lib/pin-slug.ts uses at runtime (lowercase + digits, ambiguous
-- characters omitted), collision-checked against itself as it goes.

-- AddColumn
ALTER TABLE "families" ADD COLUMN "pin_slug" TEXT;

-- Backfill existing rows.
DO $$
DECLARE
  alphabet TEXT := 'abcdefghjkmnpqrstuvwxyz23456789';
  fam RECORD;
  slug TEXT;
  i INT;
BEGIN
  FOR fam IN SELECT id FROM "families" WHERE "pin_slug" IS NULL LOOP
    LOOP
      slug := '';
      FOR i IN 1..10 LOOP
        slug := slug || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "families" WHERE "pin_slug" = slug);
    END LOOP;
    UPDATE "families" SET "pin_slug" = slug WHERE id = fam.id;
  END LOOP;
END $$;

-- Enforce the real constraints now that every row has a value.
ALTER TABLE "families" ALTER COLUMN "pin_slug" SET NOT NULL;
CREATE UNIQUE INDEX "families_pin_slug_key" ON "families"("pin_slug");
