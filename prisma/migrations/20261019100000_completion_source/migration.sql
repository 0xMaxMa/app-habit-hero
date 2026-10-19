-- chore_completions.source — distinguishes a parent's retroactive backdated
-- log (POST /api/completions/backdate) from a child's normal same-day
-- submission, so streak/XP history stays auditable. Defaults every existing
-- row to 'self', which is exactly what they all are today.

-- CreateEnum
CREATE TYPE "CompletionSource" AS ENUM ('self', 'parent_backdated');

-- AddColumn
ALTER TABLE "chore_completions" ADD COLUMN "source" "CompletionSource" NOT NULL DEFAULT 'self';
