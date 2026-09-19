'use client'

/**
 * app/(parent)/children/[id]/page.tsx  →  /children/:id   (parent child profile)
 *
 * "โปรไฟล์เด็ก" — the parent's read-only view of one child, matching the
 * exported Claude design: a blue gradient hero (avatar + level + streak +
 * candy XP bar), a "this week" strip, "งานวันนี้", the full badge wall, and
 * an activity timeline. Client-side fetch only (the (parent) layout provides
 * the parent-only guard + shell) so `next build` never touches Postgres.
 *
 * It is also the one place a parent can take XP back off a child
 * (DeductPointsCard → POST /api/deductions); those entries are folded into the
 * same timeline, tinted danger so they never read as an earning.
 *
 * Data:
 *   • GET /api/progress?user=<id>        → name, xp, level, xpToNext, streak, avatar
 *   • GET /api/badges?user=<id>          → full earned/locked wall
 *   • GET /api/chores/today?child=<id>   → still-pending chores today
 *   • GET /api/completions?child=<id>    → activity timeline + this-week strip
 *   • GET /api/deductions?child=<id>     → หักคะแนน entries for the timeline
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Avatar,
  BadgeChip,
  Card,
  PhotoThumb,
  ProgressBar,
  XpBadge,
  cn,
  type ChoreStatus,
} from '@/components/ui'
import { DeductPointsCard, type DeductionResult } from '@/components/DeductPointsCard'
import type { Deduction } from '@/components/DeductionRow'
import { api, ApiError } from '@/lib/web/api'
import { useAutoRefresh } from '@/lib/web/useAutoRefresh'
import { levelInfo } from '@/lib/level'

// ---- API shapes (subset) --------------------------------------------------

interface ProgressResponse {
  userId: string
  name: string
  xp: number
  level: number
  rank: string
  xpToNext: number
  streak: number
  bestStreak: number
  avatarUrl: string | null
}
interface BadgeItem {
  id: string
  name: string
  imageUrl: string
  description: string
  earned: boolean
  isNew: boolean
}
interface BadgesResponse {
  total: number
  earnedCount: number
  badges: BadgeItem[]
}
interface TodayResponse {
  chores: { id: string; title: string; xpValue: number }[]
}
interface Completion {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  photoUrl: string | null
  submittedAt: string
  reviewedAt: string | null
  xpAwarded: number | null
  chore: { id: string; title: string; xpValue: number }
  child: { id: string; name: string }
}
interface CompletionsResponse {
  completions: Completion[]
}
interface DeductionsResponse {
  deductions: Deduction[]
}

/**
 * The timeline mixes two record types. `at` is the sort key so both kinds are
 * ordered on one axis (a completion by when it was submitted, a deduction by
 * when the parent made it).
 */
type TimelineEntry =
  | { kind: 'completion'; at: number; completion: Completion }
  | { kind: 'deduction'; at: number; deduction: Deduction }

// ---- Date helpers (local calendar) ----------------------------------------

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

function completionStatus(c: Completion): { chip: ChoreStatus; meta: string } {
  if (c.status === 'approved') return { chip: 'done', meta: 'อนุมัติแล้ว' }
  if (c.status === 'rejected') return { chip: 'rejected', meta: 'ไม่ผ่าน' }
  return { chip: 'pending', meta: 'รออนุมัติ' }
}

// ---------------------------------------------------------------------------

export default function ChildProfilePage() {
  const params = useParams<{ id: string }>()
  const childId = params.id

  const [progress, setProgress] = useState<ProgressResponse | null>(null)
  const [badges, setBadges] = useState<BadgesResponse | null>(null)
  const [today, setToday] = useState<TodayResponse | null>(null)
  const [completions, setCompletions] = useState<Completion[] | null>(null)
  const [deductions, setDeductions] = useState<Deduction[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // Bumping this key re-runs the loader; `background` marks a silent refresh.
  const [reloadKey, setReloadKey] = useState(0)
  const background = useRef(false)

  useEffect(() => {
    let alive = true
    const silent = background.current
    background.current = false
    async function load() {
      try {
        const [p, b, t, c, d] = await Promise.all([
          api.get<ProgressResponse>(`/api/progress?user=${encodeURIComponent(childId)}`),
          api.get<BadgesResponse>(`/api/badges?user=${encodeURIComponent(childId)}`),
          api.get<TodayResponse>(`/api/chores/today?child=${encodeURIComponent(childId)}`),
          api.get<CompletionsResponse>(`/api/completions?child=${encodeURIComponent(childId)}`),
          api.get<DeductionsResponse>(`/api/deductions?child=${encodeURIComponent(childId)}`),
        ])
        if (!alive) return
        setProgress(p)
        setBadges(b)
        setToday(t)
        setCompletions(c.completions)
        setDeductions(d.deductions)
        setError(null)
      } catch (err) {
        if (!alive || silent) return
        setError(
          err instanceof ApiError ? err.message : 'โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้ง',
        )
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [childId, reloadKey])

  useAutoRefresh(() => {
    background.current = true
    setReloadKey((k) => k + 1)
  })

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  /** A deduction just landed: reflect it immediately, then reconcile silently. */
  function onDeducted(res: DeductionResult) {
    setDeductions((prev) => (prev ? [res.deduction, ...prev] : [res.deduction]))
    setProgress((prev) => (prev ? { ...prev, xp: res.xp, level: res.level, xpToNext: res.xpToNext } : prev))
    setToast(
      `หัก ${res.applied.toLocaleString()} XP แล้ว` +
        (res.floored && res.applied < res.requested
          ? ` (ขอหัก ${res.requested.toLocaleString()} แต่คะแนนมีไม่ถึง)`
          : '') +
        (res.leveledDown ? ` · Level ลดเหลือ ${res.level}` : ''),
    )
    background.current = true
    setReloadKey((k) => k + 1)
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card variant="plain" className="border-danger-500/30 bg-danger-100">
          <p className="text-sm font-semibold text-danger-500">{error}</p>
        </Card>
      </div>
    )
  }

  if (!progress || !badges || !today || !completions || !deductions) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="h-52 animate-pulse rounded-3xl bg-cream-300" />
        <div className="h-40 animate-pulse rounded-3xl bg-cream-300" />
      </div>
    )
  }

  const info = levelInfo(progress.xp)
  const span = info.nextThreshold - info.currentThreshold
  const totalDone = completions.filter((c) => c.status === 'approved').length

  // Newest-first timeline of both record kinds on one axis.
  const timeline: TimelineEntry[] = [
    ...completions.map<TimelineEntry>((c) => ({
      kind: 'completion',
      at: new Date(c.submittedAt).getTime(),
      completion: c,
    })),
    ...deductions.map<TimelineEntry>((d) => ({
      kind: 'deduction',
      at: new Date(d.createdAt).getTime(),
      deduction: d,
    })),
  ].sort((a, b) => b.at - a.at)

  // "This week" — one cell per weekday (Mon–Sun).
  const monday = mondayOfWeek(new Date())
  const todayStart = startOfDay(new Date())
  const approvedDays = new Set(
    completions
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
  const mondayStart = startOfDay(monday)
  const weekXp = completions
    .filter((c) => c.status === 'approved' && startOfDay(new Date(c.submittedAt)) >= mondayStart)
    .reduce((sum, c) => sum + (c.xpAwarded ?? 0), 0)

  const todayChores = today.chores
  const todayDoneToday = completions.filter(
    (c) => startOfDay(new Date(c.submittedAt)) === todayStart,
  ).length
  const todayTotal = todayChores.length + todayDoneToday

  return (
    <div className="space-y-5">
      {/* Page header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <BackLink />
          <h1 className="mt-1 text-2xl font-extrabold text-ink-900 sm:text-3xl">
            {progress.name} · Level {progress.level}
          </h1>
          <p className="mt-1 text-sm font-semibold text-ink-600">
            ความก้าวหน้า สตรีค และเหรียญตราทั้งหมด
          </p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* ---- Left column ---- */}
        {/* min-w-0: a grid item defaults to min-width:auto, so the column would
            size to its widest content instead of the phone. */}
        <div className="min-w-0 space-y-5">
          {/* Hero card */}
          <section className="rounded-3xl bg-primary-fill p-6 text-cream-50 shadow-[0_10px_24px_rgba(62,134,201,.26)]">
            <div className="flex items-center gap-5">
              <Avatar
                src={progress.avatarUrl}
                character="fox"
                name={progress.name}
                size="xl"
                ring="xp"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
                    {progress.name}
                  </h2>
                  <span className="whitespace-nowrap rounded-pill border-[1.5px] border-white/40 bg-white/20 px-3 py-1 text-xs font-black">
                    LEVEL {progress.level} · {progress.rank}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className="inline-flex animate-hhGlow items-center gap-1.5 rounded-pill bg-white/20 px-3.5 py-1.5">
                    <span aria-hidden>🔥</span>
                    <span className="whitespace-nowrap text-sm font-black">
                      {progress.streak} วันติด
                    </span>
                  </span>
                  <span className="text-sm font-semibold opacity-90">
                    🏅 สถิติสูงสุด {progress.bestStreak} วัน
                  </span>
                  <span className="text-sm font-semibold opacity-90">
                    เสร็จทั้งหมด {totalDone.toLocaleString()} งาน
                  </span>
                </div>
              </div>
            </div>

            {/* Candy XP bar */}
            <div className="mt-6">
              <div className="mb-2 flex justify-between text-xs font-extrabold opacity-95">
                <span>
                  {info.xpIntoLevel.toLocaleString()} / {span.toLocaleString()} XP ไป Level{' '}
                  {progress.level + 1}
                </span>
                <span>XP สะสม {progress.xp.toLocaleString()}</span>
              </div>
              <ProgressBar value={info.xpIntoLevel} max={span} tone="xp" size="lg" />
            </div>
          </section>

          {/* Badge wall */}
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-black text-ink-900">เหรียญตรา</h3>
              <span className="text-sm font-bold text-ink-600">
                ได้แล้ว {badges.earnedCount} / {badges.total}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-4 sm:grid-cols-5">
              {badges.badges.map((b) => (
                <BadgeChip
                  key={b.id}
                  imageSrc={b.imageUrl}
                  label={b.name}
                  earned={b.earned}
                  isNew={b.isNew}
                  size="md"
                  className="w-full"
                />
              ))}
            </div>
          </Card>

          {/* Activity timeline */}
          <Card>
            <h3 className="mb-4 text-lg font-black text-ink-900">ไทม์ไลน์กิจกรรม</h3>
            {timeline.length === 0 ? (
              <p className="text-sm font-semibold text-ink-500">ยังไม่มีกิจกรรม</p>
            ) : (
              <ul className="space-y-0">
                {timeline.map((entry, i) => (
                  <li
                    key={`${entry.kind}-${entry.kind === 'completion' ? entry.completion.id : entry.deduction.id}`}
                    className="flex gap-3.5 pb-4 last:pb-0"
                  >
                    {/* dot + connector */}
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className={cn(
                          'grid h-7 w-7 shrink-0 place-items-center rounded-pill text-xs font-black',
                          entry.kind === 'deduction'
                            ? 'bg-danger-100 text-danger-500'
                            : entry.completion.status === 'approved'
                              ? 'bg-success-100 text-success-500'
                              : entry.completion.status === 'rejected'
                                ? 'bg-danger-100 text-danger-500'
                                : 'bg-cream-300 text-ink-500',
                        )}
                      >
                        {entry.kind === 'deduction'
                          ? '➖'
                          : entry.completion.status === 'approved'
                            ? '✓'
                            : entry.completion.status === 'rejected'
                              ? '✕'
                              : '⏳'}
                      </span>
                      {i < timeline.length - 1 && <span className="w-0.5 flex-1 bg-cream-500" />}
                    </div>
                    {/* body — min-w-0 so the row can shrink below the title's
                        width. Without it this flex item keeps min-width:auto,
                        and `truncate` (white-space:nowrap) makes its
                        min-content the WHOLE title, pushing the card, the main
                        column and the page wider than the phone. */}
                    {entry.kind === 'deduction' ? (
                      <DeductionTimelineBody deduction={entry.deduction} />
                    ) : (
                      <CompletionTimelineBody completion={entry.completion} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* ---- Right column ---- */}
        <div className="min-w-0 space-y-5">
          {/* This week */}
          <Card>
            <h3 className="text-base font-black text-ink-900">สัปดาห์นี้</h3>
            <div className="mt-4 grid grid-cols-7 gap-2">
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
              <span>✅ {okDays} วัน</span>
              <span>❌ {missDays} วัน</span>
              <span className="ml-auto text-xp-700">⭐ รวม +{weekXp.toLocaleString()} XP</span>
            </div>
          </Card>

          {/* หักคะแนน — last in the column: rarely used, and it takes XP away. */}
          <DeductPointsCard
            childId={childId}
            childName={progress.name}
            currentXp={progress.xp}
            onDeducted={onDeducted}
          />

          {/* Today */}
          <Card>
            <h3 className="mb-3 text-base font-black text-ink-900">
              งานวันนี้ {todayDoneToday}/{todayTotal}
            </h3>
            {todayChores.length === 0 ? (
              <p className="text-sm font-semibold text-success-500">ครบแล้ววันนี้ 🎉</p>
            ) : (
              <ul>
                {todayChores.map((ch) => (
                  <li
                    key={ch.id}
                    className="flex items-center gap-3 border-b border-cream-400 py-2.5 last:border-0"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-cream-300 text-xs font-black text-ink-400" />
                    <span className="flex-1 text-sm font-bold text-ink-900">{ch.title}</span>
                    <span className="text-sm font-black text-xp-600">+{ch.xpValue}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-md rounded-2xl bg-danger-500 px-4 py-3 text-center text-sm font-extrabold text-white shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  )
}

// ---- Timeline bodies ------------------------------------------------------

function CompletionTimelineBody({ completion }: { completion: Completion }) {
  const st = completionStatus(completion)
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border-[1.5px] border-cream-400 bg-cream-100 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-ink-900">{completion.chore.title}</p>
        <p className="mt-0.5 text-xs font-semibold text-ink-500">
          {timeLabel(completion.submittedAt)} · {st.meta}
        </p>
      </div>
      <span className="whitespace-nowrap text-sm font-black text-xp-600">
        +{(completion.xpAwarded ?? completion.chore.xpValue).toLocaleString()} XP
      </span>
      {completion.photoUrl && (
        <PhotoThumb photoUrl={completion.photoUrl} title={completion.chore.title} size="sm" />
      )}
    </div>
  )
}

/**
 * A หักคะแนน row. Same rail as a completion, but danger-tinted and it leads with
 * the reason — on this page the parent already knows they did it; what matters
 * when scrolling back is WHY. (The list pages use the fuller `DeductionRow`.)
 */
function DeductionTimelineBody({ deduction }: { deduction: Deduction }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border-[1.5px] border-danger-500/30 bg-danger-100/60 px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-ink-900">หักคะแนน · {deduction.reason}</p>
        <p className="mt-0.5 text-xs font-semibold text-ink-500">
          {timeLabel(deduction.createdAt)}
          {deduction.by ? ` · โดย${deduction.by.name}` : ''}
          {deduction.applied < deduction.amount
            ? ` · คะแนนไม่พอ หักได้ ${deduction.applied.toLocaleString()} XP`
            : ''}
        </p>
      </div>
      <XpBadge value={-deduction.amount} tone="penalty" size="sm" />
    </div>
  )
}

function BackLink() {
  return (
    <Link
      href="/dashboard"
      className="inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:underline"
    >
      <span aria-hidden>←</span> โปรไฟล์เด็ก
    </Link>
  )
}
