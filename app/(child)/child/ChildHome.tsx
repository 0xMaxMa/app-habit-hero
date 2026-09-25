'use client'

/**
 * app/(child)/child/ChildHome.tsx — the child home client component (S4 + S8, T14).
 *
 * Rendered by the `(child)/child` server page, which only passes the signed-in
 * child's id + name (from the session JWT). Everything else is fetched here on
 * the client via the shared JSON API, exactly like the parent dashboard:
 *   • GET  /api/progress?user=<childId>      → xp / level / xpToNext / streak / badges
 *   • GET  /api/chores/today?child=<childId> → the still-pending chores for today
 *   • POST /api/completions (multipart)      → "ทำเสร็จแล้ว" (optionally with a photo)
 *
 * The child flow is deliberately one-tap: tap a chore → if it needs a photo we
 * open the camera/file picker, otherwise we submit straight away. On success we
 * optimistically drop the chore from the list and refresh the progress header
 * (parent still has to approve before XP actually lands, so we show a friendly
 * "รออนุมัติ" toast rather than faking the points).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Avatar,
  BadgeChip,
  Button,
  Card,
  PhotoThumb,
  ProgressBar,
  ViewModeToggle,
  XpBadge,
} from '@/components/ui'
import Link from 'next/link'
import { BadgeCelebration, type CelebratedBadge } from '@/components/BadgeCelebration'
import { api, ApiError } from '@/lib/web/api'
import { downscaleImage } from '@/lib/web/image'
import { useAutoRefresh } from '@/lib/web/useAutoRefresh'
import { useViewModePreference } from '@/lib/web/useViewModePreference'
import { levelInfo } from '@/lib/level'
import { CATEGORY_META, type ChoreCategory } from '@/app/(parent)/chores/types'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

// ---- API response shapes (the subset this screen reads) -------------------

interface ProgressResponse {
  userId: string
  name: string
  avatarUrl: string | null
  xp: number
  level: number
  rank: string
  xpToNext: number
  streak: number
  bestStreak: number
  badges: { id: string; name: string; emoji: string; imageUrl?: string }[]
}

interface BadgeCatalogItem {
  id: string
  name: string
  description: string
  imageUrl: string
  earned: boolean
  isNew: boolean
}

interface BadgeCatalogResponse {
  newCount: number
  badges: BadgeCatalogItem[]
}

interface TodayChore {
  id: string
  title: string
  description: string | null
  xpValue: number
  requirePhoto: boolean
  category: ChoreCategory
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
  xpAwarded: number | null
  chore: { id: string; title: string; xpValue: number }
}
interface CompletionsResponse {
  completions: Completion[]
}

type Toast = { kind: 'success' | 'error'; text: string } | null

// ---- Date helpers (local calendar) — mirror the parent child-profile page ---

const WEEK_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

function startOfDay(d: Date): number {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c.getTime()
}

/** Monday 00:00 of the week containing `now`. */
function mondayOfWeek(now: Date): Date {
  const d = new Date(now)
  const dow = (d.getDay() + 6) % 7 // Mon=0 … Sun=6
  d.setDate(d.getDate() - dow)
  d.setHours(0, 0, 0, 0)
  return d
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  const today = startOfDay(new Date())
  const that = startOfDay(d)
  const hhmm = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  if (that === today) return `วันนี้ ${hhmm}`
  if (that === today - 86400000) return `เมื่อวาน ${hhmm}`
  return `${d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })} ${hhmm}`
}

function statusMeta(status: Completion['status']): string {
  if (status === 'approved') return 'อนุมัติแล้ว'
  if (status === 'rejected') return 'ไม่ผ่าน'
  return 'รออนุมัติ'
}

// ---------------------------------------------------------------------------

export function ChildHome({
  childId,
  childName,
}: {
  childId: string
  childName: string
}) {
  const [progress, setProgress] = useState<ProgressResponse | null>(null)
  const [chores, setChores] = useState<TodayChore[] | null>(null)
  const [completions, setCompletions] = useState<Completion[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast>(null)
  // Freshly-earned badges to celebrate with a popup (cleared once seen).
  const [celebrate, setCelebrate] = useState<CelebratedBadge[]>([])
  // Chore id currently being submitted → disables its button + shows a spinner.
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [choresMode, setChoresMode] = useViewModePreference('child-home-today')
  const [timelineMode, setTimelineMode] = useViewModePreference('child-home-timeline')

  // A hidden file input reused for every "needs a photo" chore. We stash the
  // chore awaiting a photo here so the input's onChange knows what to submit.
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingPhotoChore = useRef<TodayChore | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    try {
      const [prog, today, comps] = await Promise.all([
        api.get<ProgressResponse>(
          `/api/progress?user=${encodeURIComponent(childId)}`,
        ),
        api.get<TodayResponse>(
          `/api/chores/today?child=${encodeURIComponent(childId)}`,
        ),
        api.get<CompletionsResponse>(
          `/api/completions?child=${encodeURIComponent(childId)}`,
        ),
      ])
      setProgress(prog)
      setChores(today.chores)
      setCompletions(comps.completions)
      setError(null)
    } catch (err) {
      if (silent) return // background refresh — keep the last good view
      setError(
        err instanceof ApiError
          ? err.message
          : 'โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้งนะ',
      )
    }
  }, [childId])

  /** Look for freshly-earned (unseen) badges and queue the celebration popup. */
  const checkNewBadges = useCallback(async () => {
    try {
      const cat = await api.get<BadgeCatalogResponse>(
        `/api/badges?user=${encodeURIComponent(childId)}`,
      )
      if (cat.newCount > 0) {
        setCelebrate(
          cat.badges
            .filter((b) => b.isNew)
            .map((b) => ({
              id: b.id,
              name: b.name,
              description: b.description,
              imageUrl: b.imageUrl,
            })),
        )
      }
    } catch {
      // Non-critical — a failed badge check just means no popup this load.
    }
  }, [childId])

  useEffect(() => {
    load()
    checkNewBadges()
  }, [load, checkNewBadges])

  // Keep today's chores + progress fresh (a parent may approve while the child
  // is on this screen). Data only — badge celebration stays a mount-time cue.
  useAutoRefresh(() => load({ silent: true }))

  /** Dismiss the celebration and mark those badges as seen server-side. */
  function dismissCelebration() {
    setCelebrate([])
    api.post('/api/badges/seen', { user: childId }).catch(() => {})
  }

  // Auto-dismiss the toast so it never lingers.
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
      // Downscale proof photos before upload — full-res phone shots bloat both
      // storage and the approval queue; 1280px keeps plenty of detail to zoom.
      if (photo) form.set('photo', await downscaleImage(photo, 1280))

      await api.postForm('/api/completions', form)

      // Optimistically remove it from today's list; XP lands after approval.
      setChores((prev) => (prev ? prev.filter((c) => c.id !== chore.id) : prev))
      setToast({
        kind: 'success',
        text: `ส่ง "${chore.title}" แล้ว รอพ่อแม่อนุมัติ ✅`,
      })
    } catch (err) {
      setToast({
        kind: 'error',
        text:
          err instanceof ApiError
            ? err.message
            : 'ส่งงานไม่สำเร็จ ลองใหม่อีกครั้งนะ',
      })
    } finally {
      setSubmitting(null)
    }
  }

  /** "ทำเสร็จแล้ว" tap — branch on whether the chore needs a photo. */
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
    // Reset so picking the same file twice still fires onChange next time.
    e.target.value = ''
    if (chore && file) submitChore(chore, file)
  }

  const info = progress ? levelInfo(progress.xp) : null
  const span = info ? info.nextThreshold - info.currentThreshold : 1

  // ---- "This week" strip + activity timeline (from own completions) --------
  const todayStart = startOfDay(new Date())
  const monday = mondayOfWeek(new Date())
  const approvedDays = new Set(
    (completions ?? [])
      .filter((c) => c.status === 'approved')
      .map((c) => startOfDay(new Date(c.submittedAt))),
  )
  const week = WEEK_LABELS.map((label, i) => {
    const dayStart = startOfDay(new Date(monday.getTime() + i * 86400000))
    let state: 'ok' | 'miss' | 'todo'
    if (approvedDays.has(dayStart)) state = 'ok'
    else if (dayStart < todayStart) state = 'miss'
    else state = 'todo'
    return { label, state }
  })
  const okDays = week.filter((d) => d.state === 'ok').length
  const missDays = week.filter((d) => d.state === 'miss').length
  // Total XP actually granted this week (approved completions since Monday).
  const mondayStart = startOfDay(monday)
  const weekXp = (completions ?? [])
    .filter((c) => c.status === 'approved' && startOfDay(new Date(c.submittedAt)) >= mondayStart)
    .reduce((sum, c) => sum + (c.xpAwarded ?? 0), 0)
  const timeline = [...(completions ?? [])].sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Freshly-earned badge celebration */}
      {celebrate.length > 0 && (
        <BadgeCelebration badges={celebrate} onDone={dismissCelebration} />
      )}

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

      {/* ---- Hero: avatar + level + rank + streak + candy XP bar --------- */}
      {progress && info ? (
        <section className="rounded-3xl bg-primary-fill p-6 text-cream-50 shadow-[0_10px_24px_rgba(62,134,201,.26)]">
          <div className="flex items-center gap-4">
            <Avatar
              character="panda"
              src={progress.avatarUrl}
              name={childName}
              size="xl"
              ring="xp"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-cream-50/80">สวัสดี</p>
              <h1 className="truncate text-2xl font-black tracking-tight text-white">
                {childName}
              </h1>
              <span className="mt-1.5 inline-block whitespace-nowrap rounded-pill border-[1.5px] border-white/40 bg-white/20 px-3 py-1 text-xs font-black">
                LEVEL {progress.level} · {progress.rank}
              </span>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="inline-flex animate-hhGlow items-center gap-1.5 rounded-pill bg-white/20 px-3.5 py-1.5">
              <span aria-hidden>🔥</span>
              <span className="whitespace-nowrap text-sm font-black">
                {progress.streak} วันติด
              </span>
            </span>
            <span className="text-sm font-semibold opacity-90">
              🏅 สถิติสูงสุด {progress.bestStreak} วัน
            </span>
          </div>

          {/* Candy XP bar */}
          <div className="mt-5">
            <div className="mb-2 flex justify-between text-xs font-extrabold opacity-95">
              <span>
                {info.xpIntoLevel.toLocaleString()} / {span.toLocaleString()} XP ไป Level{' '}
                {progress.level + 1}
              </span>
              <span>⭐ XP สะสม {progress.xp.toLocaleString()}</span>
            </div>
            <ProgressBar value={info.xpIntoLevel} max={span} tone="xp" size="lg" />
            <p className="mt-2 text-center text-xs font-bold opacity-90">
              เก่งขึ้นเรื่อย ๆ 💪 อีก {progress.xpToNext.toLocaleString()} XP ถึง Level{' '}
              {progress.level + 1}
            </p>
          </div>
        </section>
      ) : (
        !error && <HeaderSkeleton />
      )}

      {error && (
        <Card variant="plain" className="border-danger-500/30 bg-danger-100">
          <p className="text-sm font-semibold text-danger-500">{error}</p>
        </Card>
      )}

      {/* ---- This week -------------------------------------------------- */}
      {completions !== null && (
        <section aria-label="สัปดาห์นี้" className="space-y-3">
          <h2 className="text-lg font-extrabold text-ink-900">สัปดาห์นี้</h2>
          <Card>
            <div className="grid grid-cols-7 gap-2">
              {week.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <span className="text-[11px] font-extrabold text-ink-400">{d.label}</span>
                  <div
                    className={
                      'grid aspect-square w-full place-items-center rounded-xl border-[1.5px] text-base ' +
                      (d.state === 'ok'
                        ? 'border-success-300 bg-success-100'
                        : d.state === 'miss'
                          ? 'border-danger-500/30 bg-danger-100'
                          : 'border-cream-400 bg-cream-100')
                    }
                  >
                    {d.state === 'ok' ? '✅' : d.state === 'miss' ? '❌' : ''}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-4 border-t border-dashed border-cream-500 pt-3.5 text-xs font-bold text-ink-700">
              <span>✅ ทำได้ {okDays} วัน</span>
              <span>❌ ขาด {missDays} วัน</span>
              <span className="ml-auto text-xp-700">⭐ รวม +{weekXp.toLocaleString()} XP</span>
            </div>
          </Card>
        </section>
      )}

      {/* ---- Today's chores --------------------------------------------- */}
      <section aria-label="งานวันนี้" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold text-ink-900">งานวันนี้</h2>
          <div className="flex items-center gap-2">
            {chores && chores.length > 0 && (
              <span className="rounded-pill bg-primary-300/30 px-3 py-1 text-sm font-extrabold text-primary-700">
                เหลือ {chores.length} งาน
              </span>
            )}
            <ViewModeToggle mode={choresMode} onChange={setChoresMode} />
          </div>
        </div>

        {chores === null && !error ? (
          <div className="space-y-3">
            <ChoreSkeleton />
            <ChoreSkeleton />
          </div>
        ) : chores && chores.length === 0 ? (
          <Card variant="sunk" className="text-center">
            <p className="text-4xl">🎉</p>
            <p className="mt-2 text-base font-extrabold text-ink-900">
              เย้! ทำงานครบแล้ววันนี้
            </p>
            <p className="mt-1 text-sm font-semibold text-ink-600">
              พักผ่อนได้เลย แล้วพรุ่งนี้มาลุยต่อ 💪
            </p>
          </Card>
        ) : choresMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {chores?.map((chore) => (
              <ChoreTile
                key={chore.id}
                chore={chore}
                busy={submitting === chore.id}
                disabled={submitting !== null}
                onDone={() => onDone(chore)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {chores?.map((chore) => (
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

      {/* ---- Badges (S8) ------------------------------------------------ */}
      {progress && progress.badges.length > 0 && (
        <section aria-label="เหรียญรางวัล" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-ink-900">เหรียญของฉัน</h2>
            <Link
              href="/child/badges"
              className="text-sm font-extrabold text-primary-600 hover:underline"
            >
              ดูทั้งหมด →
            </Link>
          </div>
          <Card>
            <div className="flex flex-wrap gap-4">
              {progress.badges.map((b) => (
                <BadgeChip
                  key={b.id}
                  icon={b.imageUrl ? undefined : b.emoji}
                  imageSrc={b.imageUrl ? `${BASE_PATH}${b.imageUrl}` : undefined}
                  label={b.name}
                  size="sm"
                  rarity="rare"
                />
              ))}
            </div>
          </Card>
        </section>
      )}

      {/* ---- Activity timeline ------------------------------------------ */}
      {completions !== null && (
        <section aria-label="ไทม์ไลน์กิจกรรม" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-ink-900">ไทม์ไลน์กิจกรรม</h2>
            {timeline.length > 0 && (
              <ViewModeToggle mode={timelineMode} onChange={setTimelineMode} />
            )}
          </div>
          {timeline.length === 0 ? (
            <Card>
              <p className="text-sm font-semibold text-ink-500">
                ยังไม่มีกิจกรรม — เริ่มทำงานวันนี้กันเลย! 💪
              </p>
            </Card>
          ) : timelineMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {timeline.slice(0, 15).map((c) => (
                <div key={c.id} role="listitem">
                  <Card padding="sm" className="flex flex-col items-center gap-2 p-3 text-center">
                    {c.photoUrl ? (
                      <PhotoThumb photoUrl={c.photoUrl} title={c.chore.title} size="md" />
                    ) : (
                      <span
                        aria-hidden
                        className={
                          'grid h-14 w-14 place-items-center rounded-pill text-xl font-black ' +
                          (c.status === 'approved'
                            ? 'bg-success-100 text-success-500'
                            : c.status === 'rejected'
                              ? 'bg-danger-100 text-danger-500'
                              : 'bg-cream-300 text-ink-500')
                        }
                      >
                        {c.status === 'approved' ? '✓' : c.status === 'rejected' ? '✕' : '⏳'}
                      </span>
                    )}
                    <div className="w-full min-w-0">
                      <p className="truncate text-sm font-extrabold text-ink-900">
                        {c.chore.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-ink-500">
                        {timeLabel(c.submittedAt)} · {statusMeta(c.status)}
                      </p>
                    </div>
                    <span className="text-sm font-black text-xp-600">
                      +{(c.xpAwarded ?? c.chore.xpValue).toLocaleString()} XP
                    </span>
                  </Card>
                </div>
              ))}
            </div>
          ) : (
            <Card>
              <ul className="space-y-0">
                {timeline.slice(0, 15).map((c, i, arr) => (
                  <li key={c.id} className="flex gap-3.5 pb-4 last:pb-0">
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={
                          'grid h-7 w-7 shrink-0 place-items-center rounded-pill text-xs font-black ' +
                          (c.status === 'approved'
                            ? 'bg-success-100 text-success-500'
                            : c.status === 'rejected'
                              ? 'bg-danger-100 text-danger-500'
                              : 'bg-cream-300 text-ink-500')
                        }
                      >
                        {c.status === 'approved' ? '✓' : c.status === 'rejected' ? '✕' : '⏳'}
                      </span>
                      {i < arr.length - 1 && <span className="w-0.5 flex-1 bg-cream-500" />}
                    </div>
                    <div className="flex flex-1 items-center gap-3 rounded-2xl border-[1.5px] border-cream-400 bg-cream-100 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold text-ink-900">
                          {c.chore.title}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-ink-500">
                          {timeLabel(c.submittedAt)} · {statusMeta(c.status)}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-sm font-black text-xp-600">
                        +{(c.xpAwarded ?? c.chore.xpValue).toLocaleString()} XP
                      </span>
                      {c.photoUrl && (
                        <PhotoThumb
                          photoUrl={c.photoUrl}
                          title={c.chore.title}
                          size="sm"
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

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

// ---- One chore row --------------------------------------------------------

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
            <p className="mt-0.5 text-sm font-semibold text-ink-600">
              {chore.description}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <XpBadge value={chore.xpValue} size="sm" />
            {chore.dueTime && (
              <span className="text-xs font-bold text-ink-500">
                ⏰ {chore.dueTime}
              </span>
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
        {busy
          ? 'กำลังส่ง…'
          : chore.requirePhoto
            ? 'แนบรูป แล้วส่งงาน'
            : 'ทำเสร็จแล้ว'}
      </Button>
    </Card>
  )
}

/** Grid-view tile for a chore — same data/actions as ChoreRow, stacked
 *  around the category emoji (a chore has no photo of its own). */
function ChoreTile({
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
  const meta = CATEGORY_META[chore.category]
  return (
    <Card
      padding="sm"
      className={
        'flex flex-col items-center gap-2 p-3 text-center' +
        (chore.isExtra ? ' border-xp-500/40 bg-xp-100/40' : '')
      }
    >
      <span
        aria-hidden
        className="grid h-14 w-14 place-items-center rounded-2xl bg-cream-200 text-2xl"
      >
        {meta.emoji}
      </span>
      <div className="w-full min-w-0">
        <p className="truncate text-sm font-extrabold text-ink-900">{chore.title}</p>
        {chore.isExtra && (
          <span className="mt-1 inline-block rounded-pill bg-xp-300/40 px-2 py-0.5 text-xs font-extrabold text-ink-900">
            งานพิเศษ
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <XpBadge value={chore.xpValue} size="sm" />
        {chore.dueTime && (
          <span className="text-xs font-bold text-ink-500">⏰ {chore.dueTime}</span>
        )}
      </div>
      <Button
        variant="primary"
        size="sm"
        className="w-full"
        onClick={onDone}
        disabled={disabled}
        leftIcon={<span aria-hidden>{busy ? '⏳' : '✅'}</span>}
      >
        {busy ? 'กำลังส่ง…' : chore.requirePhoto ? 'แนบรูป' : 'ทำเสร็จแล้ว'}
      </Button>
    </Card>
  )
}

// ---- Skeletons ------------------------------------------------------------

function HeaderSkeleton() {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-cream-300" />
          <div className="h-7 w-28 animate-pulse rounded bg-cream-300" />
        </div>
        <div className="h-8 w-20 animate-pulse rounded-pill bg-cream-300" />
      </div>
      <div className="h-3 w-full animate-pulse rounded-pill bg-cream-300" />
    </Card>
  )
}

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
