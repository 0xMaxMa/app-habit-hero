'use client'

/**
 * app/(child)/child/tasks/ChildTasks.tsx — the kid-facing "งานของฉัน" hub.
 *
 * One place for a child to see and act on all of their chores, top to bottom:
 *   1. งานวันนี้ (ยังไม่ได้ทำ) — today's still-pending chores, submittable right
 *      here (same one-tap / photo flow as the home screen).
 *   2. ทำแล้ววันนี้           — completions submitted today, with their status.
 *   3. ประวัติทั้งหมด          — older completions, grouped by day (this replaces
 *                              the standalone /child/history screen).
 *
 * Point-deduction entries (POST /api/deductions, by a parent) are folded into
 * 2 and 3 with their reason. A kid must never find XP missing with no explanation — that
 * is the whole reason the API makes `reason` mandatory.
 *
 * The home screen keeps its own "งานวันนี้" section; this page is the fuller
 * view reachable from the 2nd nav tab.
 *
 * Data (all client-side so `next build` never touches Postgres):
 *   • GET  /api/chores/today?child=<id> → today's still-pending chores
 *   • GET  /api/completions?child=<id>  → the child's own completion timeline
 *   • GET  /api/deductions              → the child's OWN point-deduction entries
 *                                         (the endpoint self-scopes a child)
 *   • POST /api/completions (multipart) → submit a chore done (optional photo)
 * Photos come from GET /api/photos/<file> (authenticated, family-scoped).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, PhotoThumb, StatusChip, XpBadge, type ChoreStatus } from '@/components/ui'
import { DeductionRow, type Deduction } from '@/components/DeductionRow'
import { api, ApiError } from '@/lib/web/api'
import { downscaleImage } from '@/lib/web/image'
import { useAutoRefresh } from '@/lib/web/useAutoRefresh'
import { mergeTimeline, groupByDay, type TimelineEntry as SharedTimelineEntry } from '@/lib/web/timeline'

// ---- API response shapes (the subset this screen reads) -------------------

interface TodayChore {
  id: string
  title: string
  description: string | null
  xpValue: number
  requirePhoto: boolean
  isExtra: boolean
  dueTime: string | null
}
interface TodayResponse {
  child: string
  chores: TodayChore[]
}

interface Completion {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  photoUrl: string | null
  submittedAt: string
  reviewedAt: string | null
  xpAwarded: number | null
  feedback: string | null
  chore: { id: string; title: string; xpValue: number; requirePhoto: boolean }
}
interface CompletionsResponse {
  completions: Completion[]
}
interface DeductionsResponse {
  deductions: Deduction[]
}

/** One axis for both record kinds, so a deduction sits in the right day. */
type TimelineEntry = SharedTimelineEntry<Completion, Deduction>

type Toast = { kind: 'success' | 'error'; text: string } | null

const STATUS_CHIP: Record<Completion['status'], ChoreStatus> = {
  approved: 'done',
  pending: 'pending',
  rejected: 'rejected',
}
const STATUS_LABEL: Record<Completion['status'], string> = {
  approved: 'อนุมัติแล้ว',
  pending: 'รออนุมัติ',
  rejected: 'ไม่ผ่าน',
}

// ---- Date helpers (local calendar) ----------------------------------------

function startOfDay(d: Date): number {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c.getTime()
}

// ---------------------------------------------------------------------------

export function ChildTasks({ childId }: { childId: string }) {
  const [chores, setChores] = useState<TodayChore[] | null>(null)
  const [completions, setCompletions] = useState<Completion[] | null>(null)
  const [deductions, setDeductions] = useState<Deduction[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast>(null)
  const [submitting, setSubmitting] = useState<string | null>(null)

  // A hidden file input reused for every "needs a photo" chore.
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingPhotoChore = useRef<TodayChore | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    // All three fire together — `allSettled` (not `all`) because a failed
    // deductions fetch must not block/error today's chores or completions
    // (core to this page) or vice versa; each result is handled on its own.
    const [today, comps, deds] = await Promise.allSettled([
      api.get<TodayResponse>(`/api/chores/today?child=${encodeURIComponent(childId)}`),
      api.get<CompletionsResponse>(`/api/completions?child=${encodeURIComponent(childId)}`),
      // No ?child= — the endpoint pins a child caller to their own rows.
      api.get<DeductionsResponse>('/api/deductions'),
    ])

    if (today.status === 'fulfilled' && comps.status === 'fulfilled') {
      setChores(today.value.chores)
      setCompletions(comps.value.completions)
      setError(null)
    } else if (!silent) {
      const failure = today.status === 'rejected' ? today.reason : (comps as PromiseRejectedResult).reason
      setError(failure instanceof ApiError ? failure.message : 'โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้งนะ')
    }

    if (deds.status === 'fulfilled') {
      setDeductions(deds.value.deductions)
    } else if (!silent) {
      setDeductions([])
    }
  }, [childId])

  useEffect(() => {
    void load()
  }, [load])

  // A parent may approve/reject while the child is on this page.
  useAutoRefresh(() => load({ silent: true }))

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  /** Submit one chore as done, optionally attaching a photo File. */
  async function submitChore(chore: TodayChore, photo: File | null) {
    setSubmitting(chore.id)
    try {
      const form = new FormData()
      form.set('child', childId)
      form.set('chore_id', chore.id)
      // Shrink the proof photo in the browser before upload so the stored file
      // (and every thumbnail that later renders it) stays small.
      if (photo) form.set('photo', await downscaleImage(photo, 1280))

      await api.postForm('/api/completions', form)

      // Drop it from today's pending list; reload so it appears under
      // "ทำแล้ววันนี้" with its fresh status.
      setChores((prev) => (prev ? prev.filter((c) => c.id !== chore.id) : prev))
      setToast({ kind: 'success', text: `ส่ง "${chore.title}" แล้ว รอพ่อแม่อนุมัติ ✅` })
      void load()
    } catch (err) {
      setToast({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'ส่งงานไม่สำเร็จ ลองใหม่อีกครั้งนะ',
      })
    } finally {
      setSubmitting(null)
    }
  }

  function onDone(chore: TodayChore) {
    if (chore.requirePhoto) {
      pendingPhotoChore.current = chore
      fileInputRef.current?.click()
    } else {
      submitChore(chore, null)
    }
  }

  function onPhotoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    const chore = pendingPhotoChore.current
    pendingPhotoChore.current = null
    e.target.value = ''
    if (chore && file) submitChore(chore, file)
  }

  // ---- Split the timeline: today vs older history ------------------------
  const { doneToday, history } = useMemo(() => {
    const todayStart = startOfDay(new Date())
    const sorted = mergeTimeline(
      completions ?? [],
      deductions ?? [],
      (c) => new Date(c.submittedAt).getTime(),
      (d) => new Date(d.createdAt).getTime(),
    )

    const doneToday: TimelineEntry[] = []
    const history: TimelineEntry[] = []
    for (const e of sorted) {
      if (startOfDay(new Date(e.at)) === todayStart) doneToday.push(e)
      else history.push(e)
    }
    return { doneToday, history }
  }, [completions, deductions])

  const historyGroups = useMemo(() => groupByDay(history), [history])

  // Order the actionable list: (1) time-bound chores, (2) งานทั่วไป,
  // (3) งานพิเศษ ปิดท้าย. Within a tier: earliest due time first, then lowest XP.
  const sortedChores = useMemo(() => {
    if (!chores) return chores
    const tier = (c: TodayChore) => (c.dueTime ? 0 : c.isExtra ? 2 : 1)
    return [...chores].sort(
      (a, b) =>
        tier(a) - tier(b) ||
        (a.dueTime ?? '').localeCompare(b.dueTime ?? '') ||
        a.xpValue - b.xpValue,
    )
  }, [chores])

  return (
    <div className="flex flex-col gap-6">
      {/* Hidden photo picker shared by all chores. Deliberately NO `capture`
          attribute: that would force the camera and hide the photo library, so
          a kid couldn't send a shot they took earlier. Without it the OS offers
          both (camera / library / files). */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPhotoPicked}
      />

      <header className="pt-1">
        <h1 className="text-2xl font-extrabold text-ink-900">งานของฉัน</h1>
        <p className="mt-1 text-sm font-semibold text-ink-600">
          งานวันนี้ที่ต้องทำ งานที่ทำแล้ว และประวัติทั้งหมด รวมไว้ที่เดียว
        </p>
      </header>

      {error && (
        <Card variant="plain" className="border-danger-500/30 bg-danger-100">
          <p className="text-sm font-semibold text-danger-500">{error}</p>
        </Card>
      )}

      {/* ---- 1) Today's still-pending chores (actionable) --------------- */}
      <section aria-label="งานวันนี้ที่ยังไม่ได้ทำ" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink-900">งานวันนี้ที่ยังไม่ได้ทำ</h2>
          {chores && chores.length > 0 && (
            <span className="rounded-pill bg-primary-300/30 px-3 py-1 text-sm font-extrabold text-primary-700">
              เหลือ {chores.length} งาน
            </span>
          )}
        </div>

        {chores === null && !error ? (
          <div className="space-y-3">
            <ChoreSkeleton />
            <ChoreSkeleton />
          </div>
        ) : chores && chores.length === 0 ? (
          <Card variant="sunk" className="text-center">
            <p className="text-4xl">🎉</p>
            <p className="mt-2 text-base font-extrabold text-ink-900">เย้! ทำงานครบแล้ววันนี้</p>
            <p className="mt-1 text-sm font-semibold text-ink-600">
              พักผ่อนได้เลย แล้วพรุ่งนี้มาลุยต่อ 💪
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedChores?.map((chore) => (
              <ChoreRow
                key={chore.id}
                chore={chore}
                busy={submitting === chore.id}
                disabled={submitting !== null}
                onDone={() => onDone(chore)}
              />
            ))}
          </div>
        )}
      </section>

      {/* ---- 2) Today's record (done + any point deductions) ------------- */}
      {doneToday.length > 0 && (
        <section aria-label="วันนี้" className="space-y-3">
          <h2 className="text-lg font-extrabold text-ink-900">
            {doneToday.some((e) => e.kind === 'deduction') ? 'วันนี้' : 'ทำแล้ววันนี้'}
          </h2>
          <ol className="space-y-3">
            {doneToday.map((entry) => (
              <EntryRow key={entryKey(entry)} entry={entry} />
            ))}
          </ol>
        </section>
      )}

      {/* ---- 3) Full history (older than today) ------------------------ */}
      <section aria-label="ประวัติทั้งหมด" className="space-y-3">
        <h2 className="text-lg font-extrabold text-ink-900">ประวัติทั้งหมด</h2>
        {(completions === null || deductions === null) && !error ? (
          <TimelineSkeleton />
        ) : historyGroups.length === 0 ? (
          <Card variant="sunk" className="text-center">
            <p className="text-4xl">🗂️</p>
            <p className="mt-2 text-base font-extrabold text-ink-900">ยังไม่มีประวัติ</p>
            <p className="mt-1 text-sm font-semibold text-ink-600">
              งานที่ทำเสร็จในวันก่อน ๆ จะมาโชว์ที่นี่นะ
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {historyGroups.map((group) => (
              <section key={group.key} className="space-y-3">
                <h3 className="text-sm font-extrabold text-ink-600">{group.label}</h3>
                <ol className="space-y-3">
                  {group.items.map((entry) => (
                    <EntryRow key={entryKey(entry)} entry={entry} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </section>

      {toast && (
        <div
          role="status"
          className={`fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-2xl px-4 py-3 text-center text-sm font-extrabold shadow-lg ${
            toast.kind === 'success' ? 'bg-success-500 text-white' : 'bg-danger-500 text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

// ---- One actionable chore row (mirrors the home screen) -------------------

function ChoreRow({
  chore,
  busy,
  disabled,
  onDone,
}: {
  chore: TodayChore
  busy: boolean
  disabled: boolean
  onDone: () => void
}) {
  return (
    <Card className={chore.isExtra ? 'border-xp-500/40 bg-xp-100/40' : undefined}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-extrabold text-ink-900">{chore.title}</p>
            {chore.isExtra && (
              <span className="rounded-pill bg-xp-300/40 px-2 py-0.5 text-xs font-extrabold text-ink-900">
                งานพิเศษ
              </span>
            )}
          </div>
          {chore.description && (
            <p className="mt-0.5 text-sm font-semibold text-ink-600">{chore.description}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <XpBadge value={chore.xpValue} size="sm" />
            {chore.dueTime && (
              <span className="text-xs font-bold text-ink-500">⏰ {chore.dueTime}</span>
            )}
            {chore.requirePhoto && (
              <span className="text-xs font-bold text-ink-500">📷 ต้องมีรูป</span>
            )}
          </div>
        </div>
      </div>

      <Button
        variant="primary"
        size="md"
        className="mt-3 w-full"
        onClick={onDone}
        disabled={disabled}
        leftIcon={<span aria-hidden>{busy ? '⏳' : '✅'}</span>}
      >
        {busy ? 'กำลังส่ง…' : chore.requirePhoto ? 'แนบรูป แล้วส่งงาน' : 'ทำเสร็จแล้ว'}
      </Button>
    </Card>
  )
}

// ---- Timeline rows --------------------------------------------------------

function entryKey(entry: TimelineEntry): string {
  return entry.kind === 'completion' ? `c-${entry.completion.id}` : `d-${entry.deduction.id}`
}

/** Render whichever kind of record this is. */
function EntryRow({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === 'deduction') {
    // kidVoice: "Mom deducted my points" reads as something that happened TO
    // them, which is what it was — showBy stays on so it is never an
    // anonymous penalty.
    return <DeductionRow deduction={entry.deduction} kidVoice />
  }
  return <TimelineRow entry={entry.completion} />
}

// ---- One completion row (mirrors the old history timeline) ----------------

function TimelineRow({ entry }: { entry: Completion }) {
  const xp =
    entry.status === 'approved' && entry.xpAwarded != null ? entry.xpAwarded : entry.chore.xpValue

  return (
    <li>
      <Card padding="md" className="flex items-start gap-3">
        <PhotoThumb photoUrl={entry.photoUrl} title={entry.chore.title} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="truncate text-base font-extrabold text-ink-900">
                {entry.chore.title}
              </h4>
              <p className="mt-0.5 text-sm font-semibold text-ink-600">
                {formatTime(entry.submittedAt)} · {STATUS_LABEL[entry.status]}
              </p>
            </div>
            <StatusChip status={STATUS_CHIP[entry.status]} size="sm" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <XpBadge value={xp} size="sm" />
            {entry.status === 'approved' && (
              <span className="rounded-pill bg-success-100 px-2 py-0.5 text-xs font-bold text-success-500">
                +{xp} XP
              </span>
            )}
          </div>
          {entry.feedback && (
            <p className="mt-2 rounded-xl bg-cream-200 px-3 py-2 text-sm text-ink-700">
              <span className="font-bold text-ink-600">โน้ตจากพ่อแม่:</span> {entry.feedback}
            </p>
          )}
        </div>
      </Card>
    </li>
  )
}

// ---- Skeletons ------------------------------------------------------------

function ChoreSkeleton() {
  return (
    <Card>
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-cream-300" />
        <div className="h-3 w-24 animate-pulse rounded bg-cream-300" />
      </div>
      <div className="mt-3 h-11 w-full animate-pulse rounded-2xl bg-cream-300" />
    </Card>
  )
}

function TimelineSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
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

// ---- Formatting helpers ----------------------------------------------------

const TIME_FMT = new Intl.DateTimeFormat('th-TH', { hour: '2-digit', minute: '2-digit' })
function formatTime(iso: string): string {
  return `${TIME_FMT.format(new Date(iso))} น.`
}
