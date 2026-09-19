'use client'

/**
 * components/DeductPointsCard.tsx — the parent-side "หักคะแนน" form.
 *
 * Lives on the child profile (/children/:id). Two steps on purpose: the card
 * collects amount + reason, and the ConfirmDialog is the commit — it spells out
 * the exact balance the child will be left with before anything is sent, because
 * this is the only screen in the app where a parent takes XP a kid already
 * earned. The reason is required here for the same reason the API requires it: a
 * balance that drops with no explanation is the thing that makes a kid quit.
 *
 * Server-side authorization (`assertParent` + `assertFamily`) is the real gate;
 * this component never assumes hiding a button is protection.
 *
 * Data: POST /api/deductions { user, amount, reason }
 */

import { useState } from 'react'
import { Button, Card, CardSubtitle, CardTitle, ConfirmDialog, XpBadge, cn } from '@/components/ui'
import type { Deduction } from '@/components/DeductionRow'
import { api, ApiError } from '@/lib/web/api'
import { MAX_DEDUCTION_XP } from '@/lib/point-rules'
import { addXp } from '@/lib/xp'
import { levelForXp } from '@/lib/level'

/** The `data` payload of POST /api/deductions. */
export interface DeductionResult {
  deduction: Deduction
  userId: string
  requested: number
  applied: number
  floored: boolean
  xp: number
  level: number
  xpToNext: number
  previousLevel: number
  leveledDown: boolean
  levelsLost: number
}

const REASON_MAX = 200
// Everyday sizes: 10 ≈ a nudge, 100 ≈ the biggest single chore in the app.
const QUICK_AMOUNTS = [10, 20, 50, 100]

export function DeductPointsCard({
  childId,
  childName,
  currentXp,
  onDeducted,
}: {
  childId: string
  childName: string
  /** The child's balance right now — drives the "เหลือ X XP" preview. */
  currentXp: number
  onDeducted: (result: DeductionResult) => void
}) {
  const [amountText, setAmountText] = useState('')
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const amount = Number(amountText)
  const amountValid =
    amountText.trim() !== '' && Number.isInteger(amount) && amount > 0 && amount <= MAX_DEDUCTION_XP
  const reasonValid = reason.trim().length > 0
  const canSubmit = amountValid && reasonValid

  // Mirror the server's floor (lib/xp.addXp) so the preview cannot promise a
  // negative balance the API would never write.
  const after = amountValid ? addXp(currentXp, -amount) : currentXp
  const applied = currentXp - after
  const willFloor = amountValid && applied < amount

  function openConfirm() {
    if (!amountValid) {
      setFormError(
        amountText.trim() === ''
          ? 'ใส่จำนวนคะแนนที่จะหักก่อนนะ'
          : !Number.isInteger(amount) || amount <= 0
            ? 'จำนวนคะแนนต้องเป็นจำนวนเต็มมากกว่า 0'
            : `หักได้ครั้งละไม่เกิน ${MAX_DEDUCTION_XP.toLocaleString()} XP`,
      )
      return
    }
    if (!reasonValid) {
      setFormError('ใส่เหตุผลด้วย — ลูกจะเห็นเหตุผลนี้ในประวัติของตัวเอง')
      return
    }
    setFormError(null)
    setSubmitError(null)
    setConfirming(true)
  }

  async function confirm() {
    setBusy(true)
    setSubmitError(null)
    try {
      const result = await api.post<DeductionResult>('/api/deductions', {
        user: childId,
        amount,
        reason: reason.trim(),
      })
      setConfirming(false)
      setAmountText('')
      setReason('')
      onDeducted(result)
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : 'หักคะแนนไม่สำเร็จ ลองอีกครั้งนะ',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardTitle>หักคะแนน</CardTitle>
      <CardSubtitle className="mt-1">
        ใช้เมื่อจำเป็นจริง ๆ — {childName}จะเห็นเหตุผลในประวัติของตัวเอง
      </CardSubtitle>

      {/* Amount */}
      <div className="mt-4">
        <label
          htmlFor="deduct-amount"
          className="block text-sm font-extrabold text-ink-700"
        >
          จำนวนคะแนน (XP)
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setAmountText(String(q))
                setFormError(null)
              }}
              className={cn(
                'rounded-pill border-[1.5px] px-3.5 py-1.5 text-sm font-extrabold transition-colors',
                amountText === String(q)
                  ? 'border-danger-500 bg-danger-500 text-white'
                  : 'border-cream-500 bg-cream-100 text-ink-700 hover:bg-cream-200',
              )}
            >
              -{q}
            </button>
          ))}
        </div>
        <input
          id="deduct-amount"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_DEDUCTION_XP}
          step={1}
          value={amountText}
          onChange={(e) => {
            setAmountText(e.target.value)
            setFormError(null)
          }}
          placeholder={`1 – ${MAX_DEDUCTION_XP}`}
          className="mt-2 w-full rounded-xl border-[1.5px] border-cream-500 bg-cream-100 px-3.5 py-2.5 text-base font-bold text-ink-900 tabular-nums focus:border-danger-500 focus:outline-none focus:ring-2 focus:ring-danger-500/30"
        />
      </div>

      {/* Reason — required */}
      <div className="mt-4">
        <label htmlFor="deduct-reason" className="block text-sm font-extrabold text-ink-700">
          เหตุผล <span className="text-danger-500">*</span>
        </label>
        <input
          id="deduct-reason"
          type="text"
          value={reason}
          maxLength={REASON_MAX}
          onChange={(e) => {
            setReason(e.target.value)
            setFormError(null)
          }}
          placeholder="เช่น ไม่ทำการบ้าน, พูดไม่ดีกับน้อง"
          className="mt-2 w-full rounded-xl border-[1.5px] border-cream-500 bg-cream-100 px-3.5 py-2.5 text-base font-semibold text-ink-900 focus:border-danger-500 focus:outline-none focus:ring-2 focus:ring-danger-500/30"
        />
        <p className="mt-1 text-right text-xs font-bold text-ink-400">
          {reason.length}/{REASON_MAX}
        </p>
      </div>

      {/* Live preview of the resulting balance */}
      {amountValid && (
        <p className="mt-1 flex flex-wrap items-center gap-2 rounded-xl bg-cream-200 px-3 py-2 text-sm font-bold text-ink-700">
          <span>
            {currentXp.toLocaleString()} → {after.toLocaleString()} XP
          </span>
          <XpBadge value={-applied} tone="penalty" size="sm" />
          {willFloor && (
            <span className="text-xs font-bold text-ink-500">
              (คะแนนมีไม่ถึง หักได้ {applied.toLocaleString()} XP)
            </span>
          )}
        </p>
      )}

      {formError && (
        <p className="mt-3 rounded-xl bg-danger-100 px-3 py-2 text-sm font-semibold text-danger-500">
          {formError}
        </p>
      )}

      <Button
        variant="danger"
        size="md"
        fullWidth
        className="mt-4"
        onClick={openConfirm}
        disabled={!canSubmit}
        leftIcon={<span aria-hidden>➖</span>}
      >
        หักคะแนน
      </Button>

      <ConfirmDialog
        open={confirming}
        title="ยืนยันหักคะแนน?"
        icon="➖"
        tone="danger"
        confirmLabel={`หัก ${applied.toLocaleString()} XP`}
        cancelLabel="ไม่ใช่ตอนนี้"
        busy={busy}
        error={submitError}
        message={`${childName} จะเหลือ ${after.toLocaleString()} XP (Level ${levelForXp(after)})`}
        onConfirm={confirm}
        onCancel={() => {
          if (busy) return
          setConfirming(false)
          setSubmitError(null)
        }}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm font-semibold text-ink-600 marker:text-ink-400">
          <li>
            หัก <span className="font-black text-danger-500">{amount.toLocaleString()} XP</span>{' '}
            จาก {currentXp.toLocaleString()} XP
          </li>
          <li>เหตุผล: “{reason.trim()}”</li>
          {willFloor && <li>คะแนนมีไม่ถึง หักได้จริง {applied.toLocaleString()} XP (ไม่ติดลบ)</li>}
          {levelForXp(after) < levelForXp(currentXp) && (
            <li className="text-danger-500">
              Level จะลดจาก {levelForXp(currentXp)} เป็น {levelForXp(after)}
            </li>
          )}
          <li className="text-ink-500">รายการนี้จะขึ้นในประวัติของ{childName} พร้อมเหตุผล</li>
        </ul>
      </ConfirmDialog>
    </Card>
  )
}
