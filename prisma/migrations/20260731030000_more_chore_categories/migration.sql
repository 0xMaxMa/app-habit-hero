-- Add three more chore categories (exercise / daily routine / helping others).
-- Postgres 12+ allows ALTER TYPE ... ADD VALUE inside the migration transaction
-- as long as the new labels are not USED in the same transaction (they aren't).
-- IF NOT EXISTS keeps this idempotent across re-runs.
ALTER TYPE "ChoreCategory" ADD VALUE IF NOT EXISTS 'exercise';
ALTER TYPE "ChoreCategory" ADD VALUE IF NOT EXISTS 'routine';
ALTER TYPE "ChoreCategory" ADD VALUE IF NOT EXISTS 'helping';
