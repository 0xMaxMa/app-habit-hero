-- Remember which illustrated character a member picked.
--
-- The onboarding wizard has always shown an avatar picker, but the choice had
-- nowhere to live: User only had avatar_url (an uploaded photo), so whatever
-- the parent selected was validated and then dropped on the floor. This column
-- is that missing home. It stays null when a photo is uploaded instead — the
-- photo wins — and null on existing rows, which keep rendering the default face.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_character" TEXT;
