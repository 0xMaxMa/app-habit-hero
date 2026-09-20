-- Undo a point deduction.
--
-- No new row and nothing deleted: cancelling marks the ORIGINAL
-- point_adjustments row so the history shows this exact deduction was undone,
-- rather than two rows (a deduction and a compensating bonus) that merely net
-- to zero. cancelled_at/cancelled_by are set together, never independently.

-- AlterTable
ALTER TABLE "point_adjustments" ADD COLUMN "cancelled_at" TIMESTAMP(3);
ALTER TABLE "point_adjustments" ADD COLUMN "cancelled_by" TEXT;

-- AddForeignKey
ALTER TABLE "point_adjustments" ADD CONSTRAINT "point_adjustments_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
