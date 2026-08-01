'use client'

/**
 * app/(parent)/approvals/page.tsx  →  /approvals  (T12 · S3)
 *
 * Parent approval hub — the single place a parent approves things. Two sections:
 *   1. งานที่รออนุมัติ — chore completions kids submitted (approve / ตีกลับ).
 *   2. คำขอแลกรางวัล   — reward redemption requests (อนุมัติ / ปฏิเสธ),
 *      moved here off /rewards so the catalog page stays purely a catalog.
 *
 * Client-side fetch only (the (parent)/layout provides the shell + parent-only
 * guard), so `next build` never touches Postgres.
 *
 * Data:
 *   • GET  /api/completions?status=pending          → the pending chore queue.
 *   • POST /api/completions/:id/approve|reject      → decide a chore.
 *   • GET  /api/redemptions                         → redemption requests.
 *   • POST /api/redemptions/:id/approve|reject      → decide a redemption.
 */

import { useEffect, useRef, useState } from 'react'
import {
  Avatar,
  Button,
  Card,
  PhotoThumb,
  XpBadge,
  cn,
  type AvatarCharacter,
} from '@/components/ui'
import { api, ApiError } from '@/lib/web/api'
import { useAutoRefresh } from '@/lib/web/useAutoRefresh'

// ---- API response shapes (subset these screens read) ----------------------

interface PendingCompletion {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  photoUrl: string | null
  submittedAt: string
  chore: { id: string; title: string; xpValue: number; requirePhoto: boolean }
  child: { id: string; name: string; avatarUrl: string | null }
}
interface PendingResponse {
  completions: PendingCompletion[]
}

interface Redemption {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  xpSpent: number
  requestedAt: string
  reviewedAt: string | null
  reward: { id: string; title: string; iconEmoji: string | null; xpCost: number }
  redeemer: { id: string; name: string; role: 'parent' | 'child' }
}

type Toast = { kind: 'success' | 'error'; text: string } | null

// Kids have no stored avatar art yet — rotate the two illustrated faces so the
// queue feels warm rather than a wall of initials. Purely cosmetic.
const AVATAR_CYCLE: AvatarCharacter[] = ['fox', 'panda']

/** Friendly Thai "time ago" for a submission timestamp. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = Date.now() - then
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'เมื่อสักครู่'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`
  const days = Math.floor(hrs / 24)
  return `${days} วันที่แล้ว`
}

// ---------------------------------------------------------------------------

export default function ApprovalsPage() {
  const [rows, setRows] = useState<PendingCompletion[] | null>(null)
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast>(null)
  // Completion id currently being approved/rejected → disables its buttons.
  const [busyId, setBusyId] = useState<string | null>(null)
  // Redemption id currently being decided.
  const [redBusyId, setRedBusyId] = useState<string | null>(null)
  // Completion id whose approve panel (XP slider + reason) is open.
  const [approvingId, setApprovingId] = useState<string | null>(null)
  // Completion id whose reject feedback box is open.
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  // Bumping this key re-runs the loader; `background` marks a silent refresh.
  const [reloadKey, setReloadKey] = useState(0)
  const background = useRef(false)

  useEffect(() => {
    let alive = true
    const silent = background.current
    background.current = false

    async function load() {
      try {
        const [comp, red] = await Promise.all([
          api.get<PendingResponse>('/api/completions?status=pending'),
          api
            .get<{ redemptions: Redemption[] }>('/api/redemptions')
            .catch(() => ({ redemptions: [] as Redemption[] })),
        ])
        if (!alive) return
        setRows(comp.completions)
        setRedemptions(red.redemptions)
        setError(null)
      } catch (err) {
        if (!alive || silent) return
        setError(
          err instanceof ApiError
            ? err.message
            : 'โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง',
        )
      }
    }

    load()
    return () => {
      alive = false
    }
  }, [reloadKey])

  // A child may submit a chore or request a redemption while the parent watches.
  useAutoRefresh(() => {
    background.current = true
    setReloadKey((k) => k + 1)
  })

  // Auto-dismiss the toast so it never lingers.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  // ---- Chore completion actions ------------------------------------------

  /** Drop a row from the queue once its decision lands. */
  function removeRow(id: string) {
    setRows((prev) => (prev ? prev.filter((c) => c.id !== id) : prev))
  }

  async function approve(row: PendingCompletion, xpAwarded: number, note: string) {
    setBusyId(row.id)
    try {
      const trimmed = note.trim()
      await api.post(`/api/completions/${row.id}/approve`, {
        xpAwarded,
        ...(trimmed.length > 0 ? { note: trimmed } : {}),
      })
      removeRow(row.id)
      setApprovingId(null)
      setToast({
        kind: 'success',
        text: `อนุมัติ "${row.chore.title}" ของ ${row.child.name} +${xpAwarded} XP 🎉`,
      })
    } catch (err) {
      setToast({
        kind: 'error',
        text:
          err instanceof ApiError
            ? err.message
            : 'อนุมัติไม่สำเร็จ ลองใหม่อีกครั้ง',
      })
    } finally {
      setBusyId(null)
    }
  }

  async function reject(row: PendingCompletion, feedback: string) {
    setBusyId(row.id)
    try {
      const trimmed = feedback.trim()
      await api.post(
        `/api/completions/${row.id}/reject`,
        trimmed.length > 0 ? { feedback: trimmed } : undefined,
      )
      removeRow(row.id)
      setRejectingId(null)
      setToast({
        kind: 'success',
        text: `ตีกลับ "${row.chore.title}" แล้ว ให้ ${row.child.name} ลองใหม่นะ`,
      })
    } catch (err) {
      setToast({
        kind: 'error',
        text:
          err instanceof ApiError
            ? err.message
            : 'ตีกลับงานไม่สำเร็จ ลองใหม่อีกครั้ง',
      })
    } finally {
      setBusyId(null)
    }
  }

  // ---- Redemption review actions -----------------------------------------

  function decideRedemption(id: string, next: 'approved' | 'rejected') {
    setRedemptions((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, status: next, reviewedAt: new Date().toISOString() } : r,
      ),
    )
  }

  async function approveRedemption(r: Redemption) {
    setRedBusyId(r.id)
    try {
      await api.post(`/api/redemptions/${r.id}/approve`)
      decideRedemption(r.id, 'approved')
      setToast({ kind: 'success', text: `อนุมัติแลก "${r.reward.title}" ให้ ${r.redeemer.name} แล้ว 🎁` })
    } catch (err) {
      setToast({ kind: 'error', text: err instanceof ApiError ? err.message : 'อนุมัติไม่สำเร็จ ลองใหม่' })
    } finally {
      setRedBusyId(null)
    }
  }

  async function rejectRedemption(r: Redemption) {
    setRedBusyId(r.id)
    try {
      await api.post(`/api/redemptions/${r.id}/reject`)
      decideRedemption(r.id, 'rejected')
      setToast({ kind: 'success', text: `ปฏิเสธคำขอแลก "${r.reward.title}" ของ ${r.redeemer.name} แล้ว` })
    } catch (err) {
      setToast({ kind: 'error', text: err instanceof ApiError ? err.message : 'ปฏิเสธไม่สำเร็จ ลองใหม่' })
    } finally {
      setRedBusyId(null)
    }
  }

  const pendingRedemptions = redemptions.filter((r) => r.status === 'pending')

  // Monthly summary (approved redemptions this calendar month).
  const now = new Date()
  const approvedThisMonth = redemptions.filter((r) => {
    if (r.status !== 'approved') return false
    const d = new Date(r.reviewedAt ?? r.requestedAt)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })
  const monthSpent = approvedThisMonth.reduce((sum, r) => sum + r.xpSpent, 0)

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-extrabold text-ink-900 sm:text-3xl">อนุมัติ</h1>
        <p className="mt-1 text-sm font-semibold text-ink-600">
          ตรวจงานที่ลูก ๆ ส่งมา และคำขอแลกรางวัล แล้วกดอนุมัติ
        </p>
      </header>

      {error && (
        <Card variant="plain" className="border-danger-500/30 bg-danger-100">
          <p className="text-sm font-semibold text-danger-500">{error}</p>
        </Card>
      )}

      {/* ---- Section 1 · Chore completions ----------------------------- */}
      <section aria-label="งานที่รออนุมัติ" className="space-y-3">
        <SectionHeading
          icon="✅"
          title="งานที่รออนุมัติ"
          count={rows?.length ?? 0}
        />
        {rows === null && !error ? (
          <div className="space-y-3">
            <ApprovalSkeleton />
            <ApprovalSkeleton />
          </div>
        ) : rows && rows.length > 0 ? (
          rows.map((row, i) => (
            <ApprovalCard
              key={row.id}
              row={row}
              character={AVATAR_CYCLE[i % AVATAR_CYCLE.length]}
              busy={busyId === row.id}
              disabled={busyId !== null}
              approving={approvingId === row.id}
              rejecting={rejectingId === row.id}
              onOpenApprove={() => {
                setRejectingId(null)
                setApprovingId(row.id)
              }}
              onCancelApprove={() => setApprovingId(null)}
              onConfirmApprove={(xp, note) => approve(row, xp, note)}
              onOpenReject={() => {
                setApprovingId(null)
                setRejectingId(row.id)
              }}
              onCancelReject={() => setRejectingId(null)}
              onConfirmReject={(feedback) => reject(row, feedback)}
            />
          ))
        ) : (
          <Card variant="sunk" className="text-center">
            <p className="text-4xl">🎉</p>
            <p className="mt-2 text-base font-extrabold text-ink-900">ไม่มีงานรออนุมัติ</p>
            <p className="mt-1 text-sm font-semibold text-ink-600">เคลียร์หมดแล้ว เก่งมาก!</p>
          </Card>
        )}
      </section>

      {/* ---- Section 2 · Reward redemptions ---------------------------- */}
      <section aria-label="คำขอแลกรางวัล" className="space-y-3">
        <SectionHeading
          icon="🎁"
          title="คำขอแลกรางวัล"
          count={pendingRedemptions.length}
        />
        {pendingRedemptions.length > 0 ? (
          pendingRedemptions.map((r) => (
            <RedemptionCard
              key={r.id}
              redemption={r}
              busy={redBusyId === r.id}
              disabled={redBusyId !== null}
              onApprove={() => approveRedemption(r)}
              onReject={() => rejectRedemption(r)}
            />
          ))
        ) : (
          <Card variant="sunk" className="text-center">
            <p className="text-4xl">🎁</p>
            <p className="mt-2 text-base font-extrabold text-ink-900">ไม่มีคำขอแลกรางวัล</p>
            <p className="mt-1 text-sm font-semibold text-ink-600">
              เมื่อเด็ก ๆ ใช้แต้มมาแลกของรางวัล คำขอจะมาโผล่ที่นี่
            </p>
          </Card>
        )}
        {/* Monthly summary */}
        <p className="px-1 pt-1 text-xs font-bold text-ink-500">
          เดือนนี้: อนุมัติ {approvedThisMonth.length} ครั้ง · ใช้ไป{' '}
          <span className="text-xp-700">{monthSpent.toLocaleString()} XP</span>
        </p>
      </section>

      {/* ---- Toast ------------------------------------------------------ */}
      {toast && (
        <div
          role="status"
          className={`fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-2xl px-4 py-3 text-center text-sm font-extrabold shadow-lg ${
            toast.kind === 'success'
              ? 'bg-success-500 text-white'
              : 'bg-danger-500 text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

// ---- Section heading with a count pill ------------------------------------

function SectionHeading({
  icon,
  title,
  count,
}: {
  icon: string
  title: string
  count: number
}) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="flex items-center gap-2 text-lg font-black text-ink-900">
        <span aria-hidden>{icon}</span> {title}
      </h2>
      {count > 0 && (
        <span className="grid h-6 min-w-6 place-items-center rounded-full bg-danger-500 px-1.5 text-xs font-black text-white">
          {count}
        </span>
      )}
    </div>
  )
}

// ---- One pending completion -----------------------------------------------

function ApprovalCard({
  row,
  character,
  busy,
  disabled,
  approving,
  rejecting,
  onOpenApprove,
  onCancelApprove,
  onConfirmApprove,
  onOpenReject,
  onCancelReject,
  onConfirmReject,
}: {
  row: PendingCompletion
  character: AvatarCharacter
  busy: boolean
  disabled: boolean
  approving: boolean
  rejecting: boolean
  onOpenApprove: () => void
  onCancelApprove: () => void
  onConfirmApprove: (xp: number, note: string) => void
  onOpenReject: () => void
  onCancelReject: () => void
  onConfirmReject: (feedback: string) => void
}) {
  const [feedback, setFeedback] = useState('')
  // Approve panel: XP starts at the chore's full value; slider lets the parent
  // nudge it, and the reason box is optional.
  const [xp, setXp] = useState(row.chore.xpValue)
  const [note, setNote] = useState('')
  // The slider spans 0..max, wide enough to bump above the base if a kid went
  // above and beyond. Step of 5 matches the chore-XP editor.
  // Award range: 0 up to 30 XP above the chore's base reward, adjustable in
  // steps of 1 (the old 0–200 step-5 range was far too wide to fine-tune).
  const xpMax = row.chore.xpValue + 30
  // Signed difference from the base reward, shown as a colored badge next to the
  // value: red (−N) when the parent awards below the default, green (+N) above.
  const delta = xp - row.chore.xpValue

  return (
    <Card>
      <div className="flex items-start gap-3">
        <Avatar
          src={row.child.avatarUrl}
          character={character}
          name={row.child.name}
          size="md"
          ring="primary"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-base font-extrabold text-ink-900">
              {row.chore.title}
            </p>
            <XpBadge value={row.chore.xpValue} size="sm" />
          </div>
          <p className="mt-0.5 text-sm font-semibold text-ink-600">
            {row.child.name} · ส่งเมื่อ {timeAgo(row.submittedAt)}
          </p>
        </div>

        {/* Proof photo as a small thumbnail — tap to open the full-size popup. */}
        {row.photoUrl && (
          <PhotoThumb photoUrl={row.photoUrl} title={row.chore.title} />
        )}
      </div>

      {approving ? (
        /* ---- Approve panel: adjustable XP + optional reason ------------- */
        <div className="mt-3 space-y-3 rounded-2xl bg-cream-100 p-3">
          <div>
            <div className="flex items-baseline justify-between">
              <label
                htmlFor={`xp-${row.id}`}
                className="text-sm font-bold text-ink-700"
              >
                ให้แต้ม
              </label>
              <span className="flex items-baseline gap-1.5">
                <span className="text-lg font-black text-xp-700">{xp} XP</span>
                {delta !== 0 && (
                  <span
                    className={cn(
                      'text-sm font-extrabold tabular-nums',
                      delta < 0 ? 'text-danger-500' : 'text-success-500',
                    )}
                  >
                    {delta > 0 ? `(+${delta})` : `(${delta})`}
                  </span>
                )}
              </span>
            </div>
            <input
              id={`xp-${row.id}`}
              type="range"
              min={0}
              max={xpMax}
              step={1}
              value={xp}
              onChange={(e) => setXp(Number(e.target.value))}
              className="mt-1 w-full accent-xp-500"
            />
            <div className="flex justify-between text-xs font-semibold text-ink-500">
              <span>0</span>
              <button
                type="button"
                onClick={() => setXp(row.chore.xpValue)}
                className="font-bold text-primary-600 underline-offset-2 hover:underline"
              >
                ค่าเริ่มต้น {row.chore.xpValue}
              </button>
              <span>{xpMax}</span>
            </div>
          </div>
          <div>
            <label
              htmlFor={`note-${row.id}`}
              className="block text-sm font-bold text-ink-700"
            >
              เหตุผล (ไม่ใส่ก็ได้)
            </label>
            <textarea
              id={`note-${row.id}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="เช่น ทำได้ดีมาก เพิ่มแต้มพิเศษให้"
              className="mt-1 w-full resize-none rounded-2xl border border-cream-500 bg-white px-3 py-2 text-sm font-semibold text-ink-900 outline-none focus:border-primary-500"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="success"
              size="md"
              fullWidth
              onClick={() => onConfirmApprove(xp, note)}
              disabled={disabled}
              leftIcon={<span aria-hidden>{busy ? '⏳' : '✅'}</span>}
            >
              {busy ? 'กำลังอนุมัติ…' : `ยืนยัน +${xp} XP`}
            </Button>
            <Button
              variant="ghost"
              size="md"
              className="shrink-0"
              onClick={onCancelApprove}
              disabled={busy}
            >
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : rejecting ? (
        /* ---- Reject feedback box (inline) ------------------------------- */
        <div className="mt-3 space-y-2">
          <label
            htmlFor={`reject-${row.id}`}
            className="block text-sm font-bold text-ink-700"
          >
            บอกลูกหน่อยว่าต้องแก้อะไร (ไม่ใส่ก็ได้)
          </label>
          <textarea
            id={`reject-${row.id}`}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="เช่น ยังเก็บของไม่ครบนะ ลองอีกที"
            className="w-full resize-none rounded-2xl border border-cream-500 bg-cream-50 px-3 py-2 text-sm font-semibold text-ink-900 outline-none focus:border-primary-500"
          />
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={() => onConfirmReject(feedback)}
              disabled={disabled}
              leftIcon={<span aria-hidden>{busy ? '⏳' : '↩️'}</span>}
            >
              {busy ? 'กำลังส่ง…' : 'ยืนยันตีกลับ'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancelReject}
              disabled={busy}
            >
              ยกเลิก
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            variant="success"
            size="md"
            fullWidth
            onClick={onOpenApprove}
            disabled={disabled}
            leftIcon={<span aria-hidden>✅</span>}
          >
            อนุมัติ
          </Button>
          <Button
            variant="secondary"
            size="md"
            className="shrink-0"
            onClick={onOpenReject}
            disabled={disabled}
            leftIcon={<span aria-hidden>↩️</span>}
          >
            ตีกลับ
          </Button>
        </div>
      )}
    </Card>
  )
}

// ---- One redemption request -----------------------------------------------

function RedemptionCard({
  redemption: r,
  busy,
  disabled,
  onApprove,
  onReject,
}: {
  redemption: Redemption
  busy: boolean
  disabled: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-cream-200 text-2xl"
          aria-hidden
        >
          {r.reward.iconEmoji || '🎁'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold text-ink-900">{r.reward.title}</p>
          <p className="mt-0.5 text-sm font-semibold text-ink-600">
            {r.redeemer.name} · {timeAgo(r.requestedAt)}
          </p>
        </div>
        <span className="shrink-0 rounded-pill bg-danger-100 px-2.5 py-1 text-sm font-extrabold text-danger-500">
          −{r.xpSpent.toLocaleString()} XP
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          variant="success"
          size="md"
          fullWidth
          onClick={onApprove}
          disabled={disabled}
          leftIcon={<span aria-hidden>{busy ? '⏳' : '✅'}</span>}
        >
          {busy ? 'กำลังอนุมัติ…' : 'อนุมัติ'}
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="shrink-0"
          onClick={onReject}
          disabled={disabled}
        >
          ปฏิเสธ
        </Button>
      </div>
    </Card>
  )
}

// ---- Skeleton -------------------------------------------------------------

function ApprovalSkeleton() {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 animate-pulse rounded-full bg-cream-300" />
        <div className="space-y-2">
          <div className="h-4 w-40 animate-pulse rounded bg-cream-300" />
          <div className="h-3 w-28 animate-pulse rounded bg-cream-300" />
        </div>
      </div>
      <div className="mt-3 h-40 w-full animate-pulse rounded-2xl bg-cream-300" />
      <div className="mt-3 flex gap-2">
        <div className="h-11 flex-1 animate-pulse rounded-pill bg-cream-300" />
        <div className="h-11 w-24 animate-pulse rounded-pill bg-cream-300" />
      </div>
    </Card>
  )
}
