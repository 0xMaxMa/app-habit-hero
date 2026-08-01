'use client'

/**
 * app/(parent)/dashboard/page.tsx  →  /dashboard  (T09 · S3)
 *
 * Parent "family overview". Client-side fetch only (the parent (parent)/layout
 * already provides the desktop shell + parent-only guard), so `next build`
 * never touches Postgres.
 *
 * Data:
 *   • GET /api/progress?scope=weekly      → one row per child (xp/level/streak)
 *   • GET /api/chores                     → definitions (assignee, due, category)
 *   • GET /api/completions                → today's activity + pending count
 *   • GET /api/chores/today?child=<id>    → per-child "งานยังไม่เสร็จวันนี้"
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  CardTitle,
  ProgressBar,
  StreakFlame,
  XpBadge,
  cn,
  type AvatarCharacter,
} from '@/components/ui'
import { api, ApiError } from '@/lib/web/api'
import { useAutoRefresh } from '@/lib/web/useAutoRefresh'
import { levelInfo } from '@/lib/level'
import { CATEGORY_META, WEEKDAY_LABELS, type Chore } from '../chores/types'

// ---- API response shapes (subset the dashboard reads) ---------------------

interface WeeklyChild {
  userId: string
  name: string
  xp: number
  level: number
  xpToNext: number
  streak: number
  badges: { id: string; name: string; emoji: string }[]
  avatarUrl: string | null
}
interface WeeklyResponse {
  scope: 'weekly'
  children: WeeklyChild[]
}
interface CompletionRow {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  submittedAt: string
  xpAwarded: number | null
  chore: { id: string; title: string; xpValue: number }
  child: { id: string; name: string; avatarUrl: string | null }
}
interface CompletionsResponse {
  completions: CompletionRow[]
}
interface TodayResponse {
  child: string
  chores: unknown[]
}

/** One child's fully-resolved dashboard row. */
interface ChildRow extends WeeklyChild {
  remainingToday: number
  doneToday: number
}

/** A row in the family "งานของวันนี้" table. */
type RowStatus = 'done' | 'late' | 'pending' | 'rejected' | 'todo'
interface TodayRow {
  key: string
  title: string
  categoryEmoji: string
  repeat: string
  assigneeName: string
  assigneeAvatar: string | null
  xp: number
  status: RowStatus
  due: string | null
}

// Kids have no stored avatar art yet — rotate the two illustrated faces so the
// cards feel warm rather than a wall of initials. Purely cosmetic.
const AVATAR_CYCLE: AvatarCharacter[] = ['fox', 'panda']

const RECUR_LABEL: Record<Chore['recurrence'], string> = {
  daily: 'ทุกวัน',
  weekly: 'รายสัปดาห์',
  once: 'ครั้งเดียว',
}

const STATUS_META: Record<RowStatus, { label: string; cls: string }> = {
  done: { label: 'เสร็จ', cls: 'bg-success-100 text-success-500' },
  late: { label: 'สาย', cls: 'bg-xp-300/50 text-xp-700' },
  pending: { label: 'รอตรวจ', cls: 'bg-primary-100 text-primary-700' },
  rejected: { label: 'ตีกลับ', cls: 'bg-danger-100 text-danger-500' },
  todo: { label: 'ค้าง', cls: 'bg-cream-300 text-ink-600' },
}

function startOfDayTs(d: Date): number {
  const c = new Date(d)
  c.setHours(0, 0, 0, 0)
  return c.getTime()
}
function localWeekday(): number {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCDay()
}
function appliesToday(chore: Chore, weekday: number): boolean {
  if (chore.recurrence === 'weekly' && chore.recurDays.length > 0) {
    return chore.recurDays.includes(weekday)
  }
  return true
}
function isPaused(chore: Chore, now: number): boolean {
  if (chore.activeUntil && new Date(chore.activeUntil).getTime() < now) return true
  if (chore.activeFrom && new Date(chore.activeFrom).getTime() > now) return true
  return false
}

// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [rows, setRows] = useState<ChildRow[] | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [redemptionCount, setRedemptionCount] = useState(0)
  const [todayRows, setTodayRows] = useState<TodayRow[]>([])
  const [error, setError] = useState<string | null>(null)
  // Bumping this key re-runs the loader effect; `background` marks a silent
  // auto-refresh so a transient failure keeps the last good view on screen.
  const [reloadKey, setReloadKey] = useState(0)
  const background = useRef(false)

  useEffect(() => {
    let alive = true
    const silent = background.current
    background.current = false

    async function load() {
      try {
        const [weekly, chores, comps, pendingRedempt] = await Promise.all([
          api.get<WeeklyResponse>('/api/progress?scope=weekly'),
          api.get<{ chores: Chore[] }>('/api/chores'),
          api.get<CompletionsResponse>('/api/completions'),
          // Pending reward-redemption count for the summary tile. Resilient: a
          // failure here must not blank the whole dashboard.
          api
            .get<{ redemptions: unknown[] }>('/api/redemptions?status=pending')
            .then((r) => r.redemptions.length)
            .catch(() => 0),
        ])

        // Fan out one today-list request per child for the remaining counts.
        const todays = await Promise.all(
          weekly.children.map((c) =>
            api
              .get<TodayResponse>(`/api/chores/today?child=${encodeURIComponent(c.userId)}`)
              .then((t) => t.chores.length)
              .catch(() => 0),
          ),
        )
        if (!alive) return

        // ---- Family "งานของวันนี้" table + per-child done counts ----------
        const todayStart = startOfDayTs(new Date())
        const now = Date.now()
        const weekday = localWeekday()
        const todayComps = comps.completions.filter(
          (c) => startOfDayTs(new Date(c.submittedAt)) === todayStart,
        )
        // Latest completion today per chore (newest wins for the row status).
        const latestByChore = new Map<string, CompletionRow>()
        for (const c of todayComps) {
          const prev = latestByChore.get(c.chore.id)
          if (!prev || new Date(c.submittedAt) > new Date(prev.submittedAt)) {
            latestByChore.set(c.chore.id, c)
          }
        }
        const doneByChild = new Map<string, number>()
        for (const c of todayComps) {
          if (c.status !== 'rejected') {
            doneByChild.set(c.child.id, (doneByChild.get(c.child.id) ?? 0) + 1)
          }
        }
        const childName = (id: string | null) =>
          weekly.children.find((c) => c.userId === id)?.name ?? null

        const table: TodayRow[] = []
        let pending = 0
        for (const chore of chores.chores) {
          const comp = latestByChore.get(chore.id)
          const shows = comp != null || (appliesToday(chore, weekday) && !isPaused(chore, now))
          if (!shows) continue
          if (comp?.status === 'pending') pending++

          let status: RowStatus
          let assigneeName: string
          let assigneeAvatar: string | null = null
          if (comp) {
            assigneeName = comp.child.name
            assigneeAvatar = comp.child.avatarUrl
            if (comp.status === 'approved') {
              status = (comp.xpAwarded ?? chore.xpValue) < chore.xpValue ? 'late' : 'done'
            } else {
              status = comp.status === 'rejected' ? 'rejected' : 'pending'
            }
          } else {
            status = 'todo'
            assigneeName = childName(chore.assignedTo) ?? 'ทุกคน'
          }
          const daysLabel =
            chore.recurrence === 'weekly' && chore.recurDays.length > 0
              ? chore.recurDays.map((d) => WEEKDAY_LABELS[d]).join(' ')
              : RECUR_LABEL[chore.recurrence]
          table.push({
            key: chore.id,
            title: chore.title,
            categoryEmoji: CATEGORY_META[chore.category].emoji,
            repeat: daysLabel,
            assigneeName,
            assigneeAvatar,
            xp: comp?.xpAwarded ?? chore.xpValue,
            status,
            due: chore.dueTime,
          })
        }
        // Done rows first, then pending/todo; stable within each.
        const order: Record<RowStatus, number> = { late: 0, done: 1, pending: 2, rejected: 3, todo: 4 }
        table.sort((a, b) => order[a.status] - order[b.status])

        setRows(
          weekly.children.map((c, i) => ({
            ...c,
            remainingToday: todays[i],
            doneToday: doneByChild.get(c.userId) ?? 0,
          })),
        )
        setPendingCount(pending)
        setRedemptionCount(pendingRedempt)
        setTodayRows(table)
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
  }, [reloadKey])

  // Refetch when the parent returns to the tab or on a light interval, so a
  // child's new submission shows up without a manual reload.
  useAutoRefresh(() => {
    background.current = true
    setReloadKey((k) => k + 1)
  })

  const doneCount = todayRows.filter((r) => r.status === 'done' || r.status === 'late').length
  const todoCount = todayRows.filter((r) => r.status === 'todo').length
  const lateCount = todayRows.filter((r) => r.status === 'late').length

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-900 sm:text-3xl">ภาพรวมครอบครัว</h1>
          <p className="mt-1 text-sm font-semibold text-ink-600">
            ดูความคืบหน้าของลูก ๆ และงานที่รอการอนุมัติ
          </p>
        </div>
        <Link href="/chores">
          <Button variant="primary" size="sm" leftIcon={<span aria-hidden>➕</span>}>
            เพิ่มงานบ้าน
          </Button>
        </Link>
      </header>

      {/* Top summary strip */}
      <SummaryStrip
        pendingCount={pendingCount}
        redemptionCount={redemptionCount}
        childCount={rows?.length ?? 0}
        remainingTotal={rows ? rows.reduce((sum, r) => sum + r.remainingToday, 0) : 0}
        loading={rows === null && error === null}
      />

      {error && (
        <Card variant="plain" className="border-danger-500/30 bg-danger-100">
          <p className="text-sm font-semibold text-danger-500">{error}</p>
        </Card>
      )}

      {/* Per-child cards */}
      <section aria-label="ความคืบหน้าของลูก ๆ" className="space-y-3">
        <h2 className="text-lg font-extrabold text-ink-900">ลูก ๆ ของคุณ</h2>

        {rows === null && error === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <ChildCardSkeleton />
            <ChildCardSkeleton />
          </div>
        ) : rows && rows.length === 0 ? (
          <Card variant="sunk" className="text-center">
            <p className="text-sm font-semibold text-ink-600">
              ยังไม่มีเด็กในครอบครัว —{' '}
              <Link href="/settings" className="text-primary-700 underline">
                เพิ่มสมาชิก
              </Link>{' '}
              เพื่อเริ่มต้น
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rows?.map((row, i) => (
              <ChildCard key={row.userId} row={row} character={AVATAR_CYCLE[i % AVATAR_CYCLE.length]} />
            ))}
          </div>
        )}
      </section>

      {/* Today's family task table */}
      {rows !== null && todayRows.length > 0 && (
        <section aria-label="งานของวันนี้" className="space-y-3">
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-cream-400 px-5 py-4">
              <h2 className="text-lg font-extrabold text-ink-900">งานของวันนี้</h2>
              <span className="text-sm font-bold text-ink-600">
                เสร็จ {doneCount} · ค้าง {todoCount} · สาย {lateCount}
              </span>
            </div>
            <ul>
              {todayRows.map((r) => {
                const st = STATUS_META[r.status]
                return (
                  <li
                    key={r.key}
                    className="flex items-center gap-3 border-b border-cream-300 px-5 py-3 last:border-0"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cream-300 text-base">
                      {r.categoryEmoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-extrabold text-ink-900">{r.title}</p>
                      <p className="text-xs font-semibold text-ink-500">{r.repeat}</p>
                    </div>
                    <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
                      <Avatar src={r.assigneeAvatar} character="fox" name={r.assigneeName} size="sm" />
                      <span className="truncate text-xs font-bold text-ink-700">{r.assigneeName}</span>
                    </div>
                    <span className="hidden w-16 text-right text-sm font-extrabold text-xp-700 sm:block">
                      +{r.xp} XP
                    </span>
                    <span
                      className={cn(
                        'w-16 rounded-pill py-1 text-center text-xs font-extrabold',
                        st.cls,
                      )}
                    >
                      {st.label}
                    </span>
                    <span className="hidden w-12 text-right text-xs font-bold text-ink-400 sm:block">
                      {r.due ?? '—'}
                    </span>
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>
      )}

      {/* Quick actions */}
      <section aria-label="ทางลัด" className="space-y-3">
        <h2 className="text-lg font-extrabold text-ink-900">ทางลัด</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <QuickAction
            href="/approvals"
            icon="✅"
            title="อนุมัติงาน"
            subtitle={pendingCount > 0 ? `${pendingCount} งานรออยู่` : 'ไม่มีงานค้าง'}
          />
          <QuickAction href="/chores" icon="🧹" title="จัดการงานบ้าน" subtitle="สร้าง แก้ไข หรือลบงาน" />
          <QuickAction href="/rewards" icon="🎁" title="ของรางวัล" subtitle="จัดการแคตตาล็อกรางวัล" />
        </div>
      </section>
    </div>
  )
}

// ---- Summary strip --------------------------------------------------------

function SummaryStrip({
  pendingCount,
  redemptionCount,
  childCount,
  remainingTotal,
  loading,
}: {
  pendingCount: number
  redemptionCount: number
  childCount: number
  remainingTotal: number
  loading: boolean
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Link href="/approvals" className="block">
        <Card
          interactive
          className={pendingCount > 0 ? 'border-primary-500/40 bg-primary-300/25' : undefined}
        >
          <StatBlock
            icon="⏳"
            label="รออนุมัติ"
            value={loading ? '—' : String(pendingCount)}
            hint={pendingCount > 0 ? 'แตะเพื่อตรวจงาน' : 'เคลียร์หมดแล้ว 🎉'}
          />
        </Card>
      </Link>
      <Link href="/approvals" className="block">
        <Card
          interactive
          className={redemptionCount > 0 ? 'border-xp-500/40 bg-xp-100/50' : undefined}
        >
          <StatBlock
            icon="🎁"
            label="คำขอแลกรางวัล"
            value={loading ? '—' : String(redemptionCount)}
            hint={redemptionCount > 0 ? 'แตะเพื่อตรวจคำขอ' : 'ไม่มีคำขอค้าง'}
          />
        </Card>
      </Link>
      <Card>
        <StatBlock icon="🧒" label="เด็กในครอบครัว" value={loading ? '—' : String(childCount)} />
      </Card>
      <Card>
        <StatBlock
          icon="🧹"
          label="งานยังไม่เสร็จวันนี้"
          value={loading ? '—' : String(remainingTotal)}
          hint="รวมทุกคน"
        />
      </Card>
    </div>
  )
}

function StatBlock({
  icon,
  label,
  value,
  hint,
}: {
  icon: string
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="text-2xl">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-600">{label}</p>
        <p className="text-2xl font-extrabold tabular-nums text-ink-900">{value}</p>
        {hint && <p className="truncate text-xs font-semibold text-ink-500">{hint}</p>}
      </div>
    </div>
  )
}

// ---- Child card -----------------------------------------------------------

function ChildCard({ row, character }: { row: ChildRow; character: AvatarCharacter }) {
  const info = levelInfo(row.xp)
  const span = info.nextThreshold - info.currentThreshold
  const totalToday = row.doneToday + row.remainingToday

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Avatar src={row.avatarUrl} character={character} name={row.name} size="lg" ring="primary" />
          <div>
            <CardTitle>{row.name}</CardTitle>
            <span className="mt-0.5 inline-block whitespace-nowrap rounded-pill bg-primary-100 px-2.5 py-0.5 text-xs font-black text-primary-700">
              LV {row.level}
            </span>
          </div>
        </div>
        <StreakFlame days={row.streak} size="sm" />
      </CardHeader>

      <div className="mb-3 flex items-center gap-2">
        <XpBadge value={row.xp} size="sm" />
      </div>

      <ProgressBar
        value={info.xpIntoLevel}
        max={span}
        tone="xp"
        size="lg"
        startCap={`Lv ${row.level}`}
        endCap={`Lv ${row.level + 1}`}
        valueText={`${info.xpIntoLevel.toLocaleString()} / ${span.toLocaleString()} XP`}
        label={
          <>
            <span>ความคืบหน้า</span>
            <span className="tabular-nums">
              อีก {row.xpToNext.toLocaleString()} XP ถึง Level {row.level + 1}
            </span>
          </>
        }
        ariaLabel={`ความคืบหน้า XP ของ ${row.name}`}
      />

      <div className="mt-4 flex items-center justify-between border-t border-cream-500 pt-3">
        <p className="text-sm font-semibold text-ink-700">
          งานวันนี้{' '}
          <span
            className={cn(
              'font-extrabold',
              row.remainingToday > 0 ? 'text-ink-900' : 'text-success-500',
            )}
          >
            {row.doneToday}/{totalToday}
          </span>
          {row.remainingToday === 0 && totalToday > 0 ? ' 🎉' : ''}
        </p>
        <Link href={`/children/${row.userId}`}>
          <Button variant="ghost" size="sm">
            ดูโปรไฟล์
          </Button>
        </Link>
      </div>
    </Card>
  )
}

function ChildCardSkeleton() {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="h-16 w-16 animate-pulse rounded-full bg-cream-300" />
        <div className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-cream-300" />
          <div className="h-3 w-16 animate-pulse rounded bg-cream-300" />
        </div>
      </div>
      <div className="mt-4 h-3 w-full animate-pulse rounded-pill bg-cream-300" />
      <div className="mt-4 h-4 w-40 animate-pulse rounded bg-cream-300" />
    </Card>
  )
}

// ---- Quick action tile ----------------------------------------------------

function QuickAction({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string
  icon: string
  title: string
  subtitle: string
}) {
  return (
    <Link href={href} className="block">
      <Card interactive className="h-full">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-cream-300 text-xl"
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p className="font-extrabold text-ink-900">{title}</p>
            <p className="truncate text-sm font-semibold text-ink-600">{subtitle}</p>
          </div>
        </div>
      </Card>
    </Link>
  )
}
