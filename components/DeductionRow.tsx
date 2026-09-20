/**
 * components/DeductionRow.tsx — one point-deduction entry, shared by every
 * history surface (parent timeline, parent child-profile, child's own tasks page).
 *
 * A deduction has to read differently from a completion at a glance: chore rows
 * are cream with an amber +XP pill, so these are danger-tinted with a ➖ icon
 * and a `penalty`-tone pill. Same row on the parent and the child side — a kid
 * always sees the reason, never a balance that silently dropped.
 *
 * A cancelled deduction (POST /api/deductions/:id/cancel) renders the same row
 * struck through with a "ยกเลิกแล้ว" badge instead of the amount pill — on
 * BOTH the parent and child side, so a kid never sees a normal-looking penalty
 * that was actually undone. Only a caller that passes `onCancel` gets the
 * "ยกเลิก" button (the parent surfaces); the child's own page never does.
 */

import { Button, Card, XpBadge } from '@/components/ui'

/** The DTO returned by GET/POST /api/deductions (`toDeductionDto`). */
export interface Deduction {
  id: string
  /** Positive XP taken off — the figure every screen prints as "-N XP". */
  amount: number
  /** What was actually removed; smaller than `amount` when the balance floored at 0. */
  applied: number
  reason: string
  createdAt: string
  child: { id: string; name: string; avatarUrl: string | null }
  /** null once the parent who did it has been removed from the family. */
  by: { id: string; name: string } | null
  /** null while the deduction stands; set once a parent undoes it. */
  cancelledAt: string | null
  /** null while not cancelled, and once the cancelling parent has left the family. */
  cancelledBy: { id: string; name: string } | null
}

const TIME_FMT = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' })

export function DeductionRow({
  deduction,
  /** Prefix the child's name — for the family-wide timeline, where rows mix children. */
  showChild = false,
  /** Say who did it. Off on the parent's own child-profile page (always them). */
  showBy = true,
  /** Address the reader as the child ("Mom deducted your points") instead of reporting it. */
  kidVoice = false,
  /** Renders the "ยกเลิก" button and receives the row when it's clicked. Omit
   *  on the child's page — a kid must never be offered this action. */
  onCancel,
}: {
  deduction: Deduction
  showChild?: boolean
  showBy?: boolean
  kidVoice?: boolean
  onCancel?: (deduction: Deduction) => void
}) {
  const d = deduction
  const who = d.by?.name ?? 'ผู้ปกครอง'
  const cancelled = d.cancelledAt !== null
  const meta = [
    `${TIME_FMT.format(new Date(d.createdAt))} น.`,
    showChild ? d.child.name : null,
    showBy ? (kidVoice ? `${who} หักคะแนน` : `โดย${who}`) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <li>
      <Card
        padding="md"
        className={
          'flex items-start gap-3 border-danger-500/30' +
          (cancelled ? ' bg-cream-100 opacity-70' : ' bg-danger-100/60')
        }
      >
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-danger-100 text-lg text-danger-500"
        >
          ➖
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-base font-extrabold text-ink-900">
                {cancelled ? <span className="line-through">หักคะแนน</span> : 'หักคะแนน'}
              </h4>
              <p className="mt-0.5 text-sm font-semibold text-ink-600">{meta}</p>
            </div>
            {cancelled ? (
              <span className="rounded-pill bg-cream-300 px-2.5 py-1 text-xs font-black text-ink-600">
                ยกเลิกแล้ว
              </span>
            ) : (
              <XpBadge value={-d.amount} tone="penalty" size="sm" />
            )}
          </div>

          {/* The reason is the point of the row, not a footnote. */}
          <p
            className={
              'mt-2 rounded-xl bg-cream-50 px-3 py-2 text-sm font-semibold text-ink-900' +
              (cancelled ? ' line-through' : '')
            }
          >
            <span className="font-bold text-ink-600">เหตุผล:</span> {d.reason}
          </p>

          {/* Only when the child had less XP than the parent asked to remove —
              otherwise `applied` is just a duplicate of `amount`. */}
          {!cancelled && d.applied < d.amount && (
            <p className="mt-1.5 text-xs font-bold text-ink-500">
              คะแนนไม่พอ หักได้จริง {d.applied.toLocaleString()} XP (ไม่ติดลบ)
            </p>
          )}

          {cancelled && (
            <p className="mt-1.5 text-xs font-bold text-ink-500">
              คืน {d.applied.toLocaleString()} XP แล้ว
              {d.cancelledBy ? ` · โดย${d.cancelledBy.name}` : ''}
            </p>
          )}

          {!cancelled && onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-danger-500 hover:bg-danger-100"
              onClick={() => onCancel(d)}
            >
              ยกเลิก
            </Button>
          )}
        </div>
      </Card>
    </li>
  )
}
