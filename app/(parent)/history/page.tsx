'use client'

/**
 * app/(parent)/history/page.tsx  →  /history  (T13 · S8)
 *
 * Parent "ประวัติงานบ้าน" — a reverse-chronological timeline of every chore
 * completion (approved / pending / rejected) with photo thumbnails, so a parent
 * can scroll back through what the kids did and how it was reviewed.
 *
 * Client-side fetch only (the (parent)/layout already provides the desktop
 * shell + parent-only guard), so `next build` never touches Postgres.
 *
 * Approved rows carry an "ยกเลิกอนุมัติ" action — the only place in the app a
 * parent can walk an approval back (XP clawed back, badges revoked, the chore
 * returned to the review queue with its photo intact).
 *
 * Data:
 *   • GET /api/completions[?child=<id>] → family-scoped completions of ALL
 *     statuses (the endpoint already returns every status when `status` is
 *     omitted; we sort newest-first here per its documented caller contract).
 *   • GET /api/progress?scope=weekly    → the family's children, for the filter.
 *   • POST /api/completions/:id/unapprove → undo an approval.
 *
 * Photos are served by GET /api/photos/<file>; `photoUrl` is already stored as
 * that full path, so we only prefix the app base path for the <img src>.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  PhotoThumb,
  StatusChip,
  XpBadge,
  cn,
  type ChoreStatus,
} from '@/components/ui'
import { api, ApiError } from '@/lib/web/api'
import { useAutoRefresh } from '@/lib/web/useAutoRefresh'

// ---- API response shapes (subset this page reads) -------------------------

interface Completion {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  photoUrl: string | null
  submittedAt: string
  reviewedAt: string | null
  xpAwarded: number | null
  feedback: string | null
  chore: { id: string; title: string; xpValue: number; requirePhoto: boolean }
  child: { id: string; name: string; avatarUrl: string | null }
}
interface CompletionsResponse {
  completions: Completion[]
}
interface WeeklyChild {
  userId: string
  name: string
}
interface WeeklyResponse {
  scope: 'weekly'
  children: WeeklyChild[]
}
interface UnapproveResponse {
  completion: { id: string; status: 'pending'; xpRevoked: number }
  progress: { totalXp: number; level: number; previousLevel: number; leveledDown: boolean }
  revokedBadges: { id: string; name: string; emoji: string }[]
}

// Completion status → StatusChip status (StatusChip has no "approved").
const STATUS_CHIP: Record<Completion['status'], ChoreStatus> = {
  approved: 'done',
  pending: 'pending',
  rejected: 'rejected',
}

// ---------------------------------------------------------------------------

export default function HistoryPage() {
  const [entries, setEntries] = useState<Completion[] | null>(null)
  const [children, setChildren] = useState<WeeklyChild[]>([])
  const [childFilter, setChildFilter] = useState<string>('') // '' = ทุกคน
  const [error, setError] = useState<string | null>(null)
  // Bumping this key re-runs the timeline loader; `background` marks a silent
  // auto-refresh (no spinner flash, keep the last good view on failure).
  const [reloadKey, setReloadKey] = useState(0)
  const background = useRef(false)
  // Undo-approval: the row awaiting confirmation, plus its in-flight state.
  const [undoTarget, setUndoTarget] = useState<Completion | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const [undoError, setUndoError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  // Load the children list once (drives the filter dropdown).
  useEffect(() => {
    let alive = true
    api
      .get<WeeklyResponse>('/api/progress?scope=weekly')
      .then((res) => {
        if (alive) setChildren(res.children)
      })
      .catch(() => {
        /* Non-fatal: the timeline still works without the filter. */
      })
    return () => {
      alive = false
    }
  }, [])

  // Load (and reload on filter change) the completion timeline.
  useEffect(() => {
    let alive = true
    const silent = background.current
    background.current = false
    if (!silent) {
      setEntries(null)
      setError(null)
    }

    const path = childFilter
      ? `/api/completions?child=${encodeURIComponent(childFilter)}`
      : '/api/completions'

    api
      .get<CompletionsResponse>(path)
      .then((res) => {
        if (!alive) return
        // Endpoint sorts submittedAt asc; the timeline reads newest-first.
        const sorted = [...res.completions].sort(
          (a, b) =>
            new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
        )
        setEntries(sorted)
        setError(null)
      })
      .catch((err) => {
        if (!alive || silent) return
        setError(
          err instanceof ApiError
            ? err.message
            : 'โหลดประวัติไม่สำเร็จ ลองรีเฟรชอีกครั้ง',
        )
        setEntries([])
      })

    return () => {
      alive = false
    }
  }, [childFilter, reloadKey])

  // Refetch the timeline when the parent returns to the tab / on interval.
  useAutoRefresh(() => {
    background.current = true
    setReloadKey((k) => k + 1)
  })

  // Auto-dismiss the toast so it never lingers.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ---- Undo an approval ---------------------------------------------------

  const askUndo = useCallback((entry: Completion) => {
    setUndoError(null)
    setUndoTarget(entry)
  }, [])

  async function confirmUndo() {
    if (!undoTarget) return
    const entry = undoTarget
    setUndoBusy(true)
    setUndoError(null)
    try {
      const res = await api.post<UnapproveResponse>(
        `/api/completions/${entry.id}/unapprove`,
      )
      // Patch the row in place so the change is visible immediately, then let a
      // silent refetch reconcile with the server.
      setEntries((prev) =>
        prev
          ? prev.map((c) =>
              c.id === entry.id
                ? { ...c, status: 'pending', xpAwarded: 0, reviewedAt: null, feedback: null }
                : c,
            )
          : prev,
      )
      setUndoTarget(null)
      background.current = true
      setReloadKey((k) => k + 1)

      const revoked = res.revokedBadges ?? []
      setToast({
        kind: 'success',
        text:
          `ยกเลิกอนุมัติ "${entry.chore.title}" แล้ว — คืน ${res.completion.xpRevoked} XP` +
          (revoked.length > 0
            ? ` และถอนเหรียญ ${revoked.map((b) => `${b.emoji} ${b.name}`).join(', ')}`
            : '') +
          ' · งานกลับไปรออนุมัติแล้ว',
      })
    } catch (err) {
      setUndoError(
        err instanceof ApiError ? err.message : 'ยกเลิกอนุมัติไม่สำเร็จ ลองใหม่อีกครั้ง',
      )
    } finally {
      setUndoBusy(false)
    }
  }

  // Group the sorted entries under a per-day header for a scannable timeline.
  const groups = useMemo(() => groupByDay(entries ?? []), [entries])

  // Four KPI stat cards (design S8): งานเดือนนี้ / XP รวม / อัตราตรงเวลา / รูป.
  const stats = useMemo(() => computeStats(entries ?? []), [entries])

  const loading = entries === null && error === null

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-900 sm:text-3xl">
            ประวัติงานบ้าน
          </h1>
          <p className="mt-1 text-sm font-semibold text-ink-600">
            ย้อนดูงานที่ลูก ๆ ส่งมา พร้อมรูปและผลการตรวจ
          </p>
        </div>

        {children.length > 0 && (
          <label className="flex items-center gap-2 text-sm font-semibold text-ink-700">
            <span className="text-ink-600">กรองตามลูก</span>
            <select
              value={childFilter}
              onChange={(e) => setChildFilter(e.target.value)}
              className="rounded-xl border border-cream-500 bg-cream-100 px-3 py-1.5 text-sm font-semibold text-ink-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-300"
            >
              <option value="">ทุกคน</option>
              {children.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {/* KPI stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="งานเดือนนี้" value={loading ? '—' : String(stats.monthCount)} tone="ink" />
        <StatCard
          label="XP เดือนนี้"
          value={loading ? '—' : `+${stats.monthXp.toLocaleString()}`}
          tone="xp"
        />
        <StatCard
          label="อัตราตรงเวลา"
          value={loading ? '—' : stats.onTimeRate == null ? '—' : `${stats.onTimeRate}%`}
          tone="success"
        />
        <StatCard label="รูปที่ส่ง" value={loading ? '—' : String(stats.photoCount)} tone="ink" />
      </div>

      {error && (
        <Card variant="plain" className="border-danger-500/30 bg-danger-100">
          <p className="text-sm font-semibold text-danger-500">{error}</p>
        </Card>
      )}

      {loading ? (
        <TimelineSkeleton />
      ) : entries && entries.length === 0 && !error ? (
        <EmptyState hasFilter={childFilter !== ''} />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => {
            const dayXp = group.items.reduce(
              (sum, e) => sum + (e.status === 'approved' ? (e.xpAwarded ?? 0) : 0),
              0,
            )
            return (
              <section key={group.key} className="space-y-3">
                <h2 className="sticky top-0 z-[1] -mx-1 flex items-center justify-between gap-2 bg-cream-100/80 px-1 py-1 backdrop-blur">
                  <span className="text-sm font-extrabold text-ink-600">
                    {group.label}
                    <span className="ml-2 font-bold text-ink-400">{group.items.length} งาน</span>
                  </span>
                  {dayXp > 0 && (
                    <span className="text-sm font-black text-xp-700">
                      +{dayXp.toLocaleString()} XP
                    </span>
                  )}
                </h2>
                <ol className="space-y-3">
                  {group.items.map((entry) => (
                    <TimelineRow key={entry.id} entry={entry} onUndo={askUndo} />
                  ))}
                </ol>
              </section>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={undoTarget !== null}
        title="ยกเลิกอนุมัติ?"
        icon="↩️"
        tone="danger"
        confirmLabel="ยกเลิกอนุมัติ"
        cancelLabel="ไม่ใช่ตอนนี้"
        busy={undoBusy}
        error={undoError}
        message={
          undoTarget
            ? `"${undoTarget.chore.title}" ของ${undoTarget.child.name} จะกลับไปรออนุมัติใหม่`
            : undefined
        }
        onConfirm={confirmUndo}
        onCancel={() => {
          if (undoBusy) return
          setUndoTarget(null)
          setUndoError(null)
        }}
      >
        {/* CSS-drawn markers, not a literal "•" — the Thai webfont has no bullet
            glyph, so a typed one falls back to a mismatched character. */}
        <ul className="list-disc space-y-1 pl-5 text-sm font-semibold text-ink-600 marker:text-ink-400">
          <li>คืน XP {undoTarget?.xpAwarded ?? 0} แต้มที่ให้ไป</li>
          <li>ถอนเหรียญที่ได้จากการอนุมัติครั้งนี้ (ถ้ามี)</li>
          <li>รูปที่ลูกส่งยังอยู่ครบ อนุมัติใหม่ได้เลย</li>
          <li className="text-ink-500">สตรีคไม่ถูกย้อน (นับเป็นรายวัน ย้อนทีละงานไม่ได้)</li>
        </ul>
      </ConfirmDialog>

      {toast && (
        <div
          role="status"
          className={cn(
            'fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-2xl px-4 py-3 text-center text-sm font-extrabold text-white shadow-lg',
            toast.kind === 'success' ? 'bg-success-500' : 'bg-danger-500',
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

// ---- Timeline row ---------------------------------------------------------

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'ink' | 'xp' | 'success'
}) {
  const toneCls =
    tone === 'xp' ? 'text-xp-700' : tone === 'success' ? 'text-success-500' : 'text-ink-900'
  return (
    <Card padding="md">
      <p className="text-xs font-bold text-ink-500">{label}</p>
      <p className={cn('mt-1.5 text-2xl font-black tabular-nums tracking-tight', toneCls)}>
        {value}
      </p>
    </Card>
  )
}

function TimelineRow({
  entry,
  onUndo,
}: {
  entry: Completion
  onUndo: (entry: Completion) => void
}) {
  // Approved rows show the XP actually awarded; others show the chore's value.
  const xp =
    entry.status === 'approved' && entry.xpAwarded != null
      ? entry.xpAwarded
      : entry.chore.xpValue

  return (
    <li>
      <Card padding="md" className="flex items-start gap-3">
        <PhotoThumb photoUrl={entry.photoUrl} title={entry.chore.title} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate text-base font-extrabold text-ink-900">
                {entry.chore.title}
              </h3>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-ink-600">
                <Avatar src={entry.child.avatarUrl} character="fox" name={entry.child.name} size="sm" />
                <span>{entry.child.name} · {formatTime(entry.submittedAt)}</span>
              </p>
            </div>
            <StatusChip status={STATUS_CHIP[entry.status]} size="sm" />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <XpBadge value={xp} size="sm" />
            {entry.status === 'approved' && (
              <>
                <span className="rounded-pill bg-success-100 px-2 py-0.5 text-xs font-bold text-success-500">
                  +{xp} XP
                </span>
                {/* The only route back out of an approval — kept low-key (ghost)
                    so the timeline still reads as a record, not a control panel. */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-danger-500 hover:bg-danger-100"
                  onClick={() => onUndo(entry)}
                >
                  ↩️ ยกเลิกอนุมัติ
                </Button>
              </>
            )}
          </div>

          {entry.feedback && (
            <p className="mt-2 rounded-xl bg-cream-200 px-3 py-2 text-sm text-ink-700">
              <span className="font-bold text-ink-600">โน้ตจากผู้ปกครอง:</span>{' '}
              {entry.feedback}
            </p>
          )}
        </div>
      </Card>
    </li>
  )
}

// ---- Empty + skeleton -----------------------------------------------------

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <Card padding="lg" className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="text-5xl" aria-hidden>
        🗂️
      </span>
      <div>
        <h2 className="text-lg font-extrabold text-ink-900">
          {hasFilter ? 'ยังไม่มีประวัติของลูกคนนี้' : 'ยังไม่มีประวัติงานบ้าน'}
        </h2>
        <p className="mt-1 text-sm text-ink-600">
          {hasFilter
            ? 'ลองเลือก "ทุกคน" เพื่อดูงานของทั้งครอบครัว'
            : 'เมื่อลูก ๆ เริ่มส่งงาน รายการจะปรากฏที่นี่'}
        </p>
      </div>
    </Card>
  )
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} padding="md" className="flex items-start gap-3">
          <div className="h-16 w-16 shrink-0 animate-pulse rounded-2xl bg-cream-300" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-cream-300" />
            <div className="h-3 w-28 animate-pulse rounded bg-cream-300" />
            <div className="h-5 w-16 animate-pulse rounded-pill bg-cream-300" />
          </div>
        </Card>
      ))}
    </div>
  )
}

// ---- Grouping + formatting helpers ----------------------------------------

interface DayGroup {
  key: string
  label: string
  items: Completion[]
}

/** The four KPI figures shown above the timeline (design S8). */
interface HistoryStats {
  monthCount: number
  monthXp: number
  onTimeRate: number | null
  photoCount: number
}

/** Derive the KPI stats from the (already-filtered) completion list. */
function computeStats(items: Completion[]): HistoryStats {
  const now = new Date()
  const inThisMonth = (iso: string) => {
    const d = new Date(iso)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }
  const approved = items.filter((c) => c.status === 'approved')
  const monthApproved = approved.filter((c) => inThisMonth(c.submittedAt))
  // On-time = approved with no late penalty (awarded >= the chore's full value).
  const onTime = approved.filter((c) => (c.xpAwarded ?? 0) >= c.chore.xpValue).length
  return {
    monthCount: monthApproved.length,
    monthXp: monthApproved.reduce((sum, c) => sum + (c.xpAwarded ?? 0), 0),
    onTimeRate: approved.length === 0 ? null : Math.round((onTime / approved.length) * 100),
    photoCount: items.filter((c) => c.photoUrl).length,
  }
}

/** Bucket already-sorted (desc) completions under a per-day header. */
function groupByDay(items: Completion[]): DayGroup[] {
  const groups: DayGroup[] = []
  let current: DayGroup | null = null

  for (const item of items) {
    const d = new Date(item.submittedAt)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!current || current.key !== key) {
      current = { key, label: formatDay(d), items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}

const DAY_FMT = new Intl.DateTimeFormat('th-TH', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const TIME_FMT = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
})

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatDay(d: Date): string {
  const now = new Date()
  if (isSameDay(d, now)) return 'วันนี้'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, yesterday)) return 'เมื่อวาน'
  return DAY_FMT.format(d)
}

function formatTime(iso: string): string {
  return `${TIME_FMT.format(new Date(iso))} น.`
}
