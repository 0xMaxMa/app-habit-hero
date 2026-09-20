/**
 * lib/api/deduction-dto.ts — the PointAdjustment → wire shape shared by
 * POST/GET /api/deductions and POST /api/deductions/:id/cancel, so a
 * cancelled row looks identical everywhere it is returned.
 */

const dtoInclude = {
  user: { select: { id: true, name: true, avatarUrl: true } },
  creator: { select: { id: true, name: true } },
  canceller: { select: { id: true, name: true } },
} as const

type DeductionRow = {
  id: string
  xpDelta: number
  xpApplied: number
  reason: string
  createdAt: Date
  cancelledAt: Date | null
  user: { id: string; name: string; avatarUrl: string | null }
  creator: { id: string; name: string } | null
  canceller: { id: string; name: string } | null
}

/** Shape one PointAdjustment row for the history timelines. */
function toDeductionDto(row: DeductionRow) {
  return {
    id: row.id,
    // Positive XP taken off, which is what every screen shows ("-50 XP").
    amount: -row.xpDelta,
    applied: row.xpApplied,
    reason: row.reason,
    createdAt: row.createdAt,
    child: row.user,
    // Null once the parent who did it has been removed from the family.
    by: row.creator,
    cancelledAt: row.cancelledAt,
    // Null while not cancelled, and also once the cancelling parent has been
    // removed from the family — same SetNull rule as `by`.
    cancelledBy: row.cancelledAt ? row.canceller : null,
  }
}

export { dtoInclude, toDeductionDto }
