-- Parent point deductions ("หักคะแนน").
--
-- XP had no ledger: the balance lives on user_progress and the history screens
-- read chore_completions (earned) + reward_redemptions (spent). A parent
-- deduction is neither, so it needs a row of its own — otherwise the child's
-- total drops with nothing on any screen to explain it.
--
-- xp_delta is signed (negative = deduction), matching lib/xp.addXp's delta, so a
-- logged bonus can reuse the table later without a second one. xp_applied is
-- what was actually taken off the balance, which is smaller than |xp_delta| when
-- the deduction hit the zero floor.

-- CreateTable
CREATE TABLE "point_adjustments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "xp_delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "xp_applied" INTEGER NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "point_adjustments_user_id_idx" ON "point_adjustments"("user_id");

-- CreateIndex
CREATE INDEX "point_adjustments_created_by_idx" ON "point_adjustments"("created_by");

-- AddForeignKey
ALTER TABLE "point_adjustments" ADD CONSTRAINT "point_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_adjustments" ADD CONSTRAINT "point_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
