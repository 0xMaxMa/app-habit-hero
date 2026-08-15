'use client'

/**
 * app/(parent)/dashboard/page.tsx  →  /dashboard  (T09 · S3)
 *
 * Parent "family overview". Client-side fetch only (the parent (parent)/layout
 * already provides the desktop shell + parent-only guard), so `next build`
 * never touches Postgres.
 *
 * Data:
 *   • GET /api/progress?scope=weekly        → one row per child (xp/level/streak)
 *   • GET /api/chores                       → definitions (title, category, xp)
 *   • GET /api/completions?status=pending   → the approval queue, counted directly
 *   • GET /api/chores/today?child=<id>      → that child's whole day + counts
 *
 * Every number on this page comes from the server. The page used to re-derive
 * "does this chore apply today" and "was it done today" in the browser, next to
 * a server that already knew — the two drifted, and the drift is what put a 0 in
 * "รออนุมัติ" while nine submissions sat in the queue. The only arithmetic left
 * here is summing per-child totals.
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
import {
  buildTodayRows,
  countCells,
  remainingTotal,
  type CellStatus,
  type DayEntry,
  type DaySummary,
  type TodayRow as TableRow,
} from './rows'

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
interface TodayResponse {
  child: string
  day: DayEntry[]
  summary: DaySummary
}

/** One child's fully-resolved dashboard row. `day`/`summary` are null when that
 *  child's request failed — the tiles then say "—" instead of a confident 0. */
interface ChildRow extends WeeklyChild {
  day: DayEntry[] | null
  summary: DaySummary | null
}

/** A table row plus the chore presentation the server does not need to know. */
interface TodayRow extends TableRow {
  title: string
  categoryEmoji: string
  repeat: string
  xp: number
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

const STATUS_META: Record<CellStatus, { label: string; cls: string }> = {
  done: { label: 'เสร็จ', cls: 'bg-success-100 text-success-500' },
  late: { label: 'สาย', cls: 'bg-xp-300/50 text-xp-700' },
  pending: { label: 'รอตรวจ', cls: 'bg-primary-100 text-primary-700' },
  rejected: { label: 'ตีกลับ', cls: 'bg-danger-100 text-danger-500' },
  todo: { label: 'ค้าง', cls: 'bg-cream-300 text-ink-600' },
}

/** Human label for how often a chore repeats. */
function repeatLabel(chore: Chore): string {
  return chore.recurrence === 'weekly' && chore.recurDays.length > 0
    ? chore.recurDays.map((d) => WEEKDAY_LABELS[d]).join(' ')
    : RECUR_LABEL[chore.recurrence]
}

// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [rows, setRows] = useState<ChildRow[] | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [redemptionCount, setRedemptionCount] = useState<number | null>(0)
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
        const [weekly, chores, pending, pendingRedempt] = await Promise.all([
          api.get<WeeklyResponse>('/api/progress?scope=weekly'),
          api.get<{ chores: Chore[] }>('/api/chores'),
          // The approval queue itself — the same request /approvals makes, so
          // the tile and the page it links to cannot disagree.
          api.get<{ completions: unknown[] }>('/api/completions?status=pending'),
          // Pending reward-redemption count. Resilient: a failure here must not
          // blank the whole dashboard — but it resolves to null, not 0, so the
          // tile can say "—" rather than claim the queue is empty.
          api
            .get<{ redemptions: unknown[] }>('/api/redemptions?status=pending')
            .then((r): number | null => r.redemptions.length)
            .catch(() => null),
        ])

        // Fan out one day request per child. Same deal: a failed child resolves
        // to null and shows as "—" instead of silently reading as "all done".
        const days = await Promise.all(
          weekly.children.map((c) =>
            api
              .get<TodayResponse>(`/api/chores/today?child=${encodeURIComponent(c.userId)}`)
              .catch(() => null),
          ),
        )
        if (!alive) return

        const childRows: ChildRow[] = weekly.children.map((c, i) => ({
          ...c,
          day: days[i]?.day ?? null,
          summary: days[i]?.summary ?? null,
        }))

        // ---- Family "งานของวันนี้" table ---------------------------------
        // One row per chore, one cell per child that owes it (./rows). A shared
        // chore that only one of three kids did is no longer reported finished.
        const choreById = new Map(chores.chores.map((c) => [c.id, c]))
        const tableRows: TodayRow[] = buildTodayRows(childRows, chores.chores).flatMap((r) => {
          const chore = choreById.get(r.choreId)
          if (!chore) return []
          return [
            {
              ...r,
              title: chore.title,
              categoryEmoji: CATEGORY_META[chore.category].emoji,
              repeat: repeatLabel(chore),
              xp: chore.xpValue,
              due: chore.dueTime,
            },
          ]
        })

        setRows(childRows)
        setPendingCount(pending.completions.length)
        setRedemptionCount(pendingRedempt)
        setTodayRows(tableRows)
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

  // Header counts are per child-task, the same unit as the "งานยังไม่เสร็จ" tile
  // — a shared chore three kids owe counts three times in both places.
  const counts = countCells(todayRows)
  // A child whose day request failed contributes nothing rather than a fake 0.
  const remaining = remainingTotal(rows ?? [])

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
        remainingTotal={remaining.total}
        remainingPartial={remaining.partial}
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
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-cream-400 px-5 py-4">
              <h2 className="text-lg font-extrabold text-ink-900">งานของวันนี้</h2>
              {/* "ส่งแล้ว" rather than "รอตรวจ": this counts what was handed in
                  *today*, while the รออนุมัติ tile counts the whole queue —
                  yesterday's submissions included. Two near-synonyms on one
                  screen meaning different scopes is how the page got confusing
                  in the first place. */}
              <span className="text-sm font-bold text-ink-600">
                เสร็จ {counts.done} · ส่งแล้ว {counts.review} · ค้าง {counts.todo} · สาย{' '}
                {counts.late}
              </span>
            </div>
            <ul>
              {todayRows.map((r) => (
                <li
                  key={r.choreId}
                  className="flex items-center gap-3 border-b border-cream-300 px-5 py-3 last:border-0"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-cream-300 text-base">
                    {r.categoryEmoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-extrabold text-ink-900">
                      {r.title}
                      {r.isExtra && (
                        <span className="shrink-0 rounded-pill bg-xp-100 px-1.5 py-0.5 text-[10px] font-black text-xp-700">
                          พิเศษ
                        </span>
                      )}
                    </p>
                    <p className="text-xs font-semibold text-ink-500">{r.repeat}</p>
                  </div>
                  {/* One chip per child who owes this chore — a shared chore that
                      only one of three kids did no longer reads as finished. */}
                  <div className="flex flex-wrap justify-end gap-1">
                    {r.cells.map((c) => (
                      <span
                        key={c.childId}
                        className={cn(
                          'whitespace-nowrap rounded-pill px-2 py-1 text-[11px] font-extrabold',
                          STATUS_META[c.status].cls,
                        )}
                      >
                        {c.childName} · {STATUS_META[c.status].label}
                      </span>
                    ))}
                  </div>
                  <span className="hidden w-16 shrink-0 text-right text-sm font-extrabold text-xp-700 sm:block">
                    +{r.xp} XP
                  </span>
                  <span className="hidden w-12 shrink-0 text-right text-xs font-bold text-ink-400 sm:block">
                    {r.due ?? '—'}
                  </span>
                </li>
              ))}
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
  remainingPartial,
  loading,
}: {
  pendingCount: number
  /** null → the request failed; show "—" rather than an untrue 0. */
  redemptionCount: number | null
  childCount: number
  remainingTotal: number
  remainingPartial: boolean
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
          className={redemptionCount ? 'border-xp-500/40 bg-xp-100/50' : undefined}
        >
          <StatBlock
            icon="🎁"
            label="คำขอแลกรางวัล"
            value={loading || redemptionCount === null ? '—' : String(redemptionCount)}
            hint={
              redemptionCount === null
                ? 'โหลดไม่สำเร็จ'
                : redemptionCount > 0
                  ? 'แตะเพื่อตรวจคำขอ'
                  : 'ไม่มีคำขอค้าง'
            }
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
          hint={remainingPartial ? 'บางคนโหลดไม่สำเร็จ' : 'ไม่รวมงานพิเศษ'}
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
  // Both halves come from the same server count, so the fraction is in one unit:
  // of the required chores on this child's day, how many are settled. It used to
  // divide "submitted today" by "outstanding this period" — two different things.
  const done = row.summary?.requiredDone ?? 0
  const total = row.summary?.requiredTotal ?? 0
  const remaining = row.summary?.requiredRemaining ?? 0
  const extraDone = row.summary?.extraDone ?? 0

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
          {row.summary === null ? (
            <span className="font-extrabold text-ink-500">— โหลดไม่สำเร็จ</span>
          ) : (
            <>
              <span
                className={cn('font-extrabold', remaining > 0 ? 'text-ink-900' : 'text-success-500')}
              >
                {done}/{total}
              </span>
              {remaining === 0 && total > 0 ? ' 🎉' : ''}
              {extraDone > 0 && (
                <span className="ml-1 font-bold text-xp-700">+{extraDone} พิเศษ</span>
              )}
            </>
          )}
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
