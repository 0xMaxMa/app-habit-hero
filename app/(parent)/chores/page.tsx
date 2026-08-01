'use client'

/**
 * app/(parent)/chores/page.tsx — parent Chore CRUD (T10 · design S5).
 *
 * Lists every chore in the family and lets a parent create / edit / delete
 * them, filterable by category and ordered งานกำหนดเวลา → งานทั่วไป → งานพิเศษ.
 * All data is fetched CLIENT-side from the JSON API (no build-time DB access).
 */

import * as React from 'react'
import { Button, Card, XpBadge, ConfirmDialog, cn } from '@/components/ui'
import { api, ApiError } from '@/lib/web/api'
import { ChoreFormModal } from './ChoreFormModal'
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  WEEKDAY_LABELS,
  type Chore,
  type ChoreCategory,
  type ChoreInput,
  type ChildOption,
  type Recurrence,
} from './types'

const RECURRENCE_LABEL: Record<Recurrence, string> = {
  daily: 'ทุกวัน',
  weekly: 'รายสัปดาห์',
  once: 'ครั้งเดียว',
}

/** Sort tier for the chore list — mirrors the child "งานของฉัน" ordering:
 *  0 = งานที่กำหนดระยะเวลา (has a due time), 1 = งานทั่วไป, 2 = งานพิเศษ (last). */
function choreTier(c: Chore): number {
  return c.dueTime ? 0 : c.isExtra ? 2 : 1
}

/** Modal state: closed, creating, or editing a specific chore. */
type Editor = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; chore: Chore }

export default function ChoresPage() {
  const [chores, setChores] = React.useState<Chore[]>([])
  const [children, setChildren] = React.useState<ChildOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = React.useState<ChoreCategory | 'all'>('all')

  const [editor, setEditor] = React.useState<Editor>({ mode: 'closed' })
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)

  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<Chore | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  // Non-null once a delete is refused for having history: the completion count,
  // which flips the dialog into "confirm once more to delete the history too".
  const [forceCount, setForceCount] = React.useState<number | null>(null)

  const childName = React.useCallback(
    (id: string | null) => {
      if (!id) return null
      return children.find((c) => c.userId === id)?.name ?? null
    },
    [children],
  )

  const loadChores = React.useCallback(async () => {
    const choreData = await api.get<{ chores: Chore[] }>('/api/chores')
    setChores(choreData.chores)
  }, [])

  React.useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [choreData, progressData] = await Promise.all([
          api.get<{ chores: Chore[] }>('/api/chores'),
          api
            .get<{ children: ChildOption[] }>('/api/progress?scope=weekly')
            .catch(() => ({ children: [] as ChildOption[] })),
        ])
        if (!alive) return
        setChores(choreData.chores)
        setChildren(progressData.children)
      } catch (err) {
        if (!alive) return
        setLoadError(err instanceof ApiError ? err.message : 'โหลดรายการงานไม่สำเร็จ')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // Derived category options (+ per-category counts) and the visible, sorted list.
  const { visible, categoryOptions, categoryCounts } = React.useMemo(() => {
    // Category chips: only those actually present, in canonical order, with counts.
    const categoryCounts = {} as Record<ChoreCategory | 'all', number>
    categoryCounts.all = chores.length
    for (const c of chores) categoryCounts[c.category] = (categoryCounts[c.category] ?? 0) + 1
    const categoryOptions = CATEGORY_ORDER.filter((cat) => (categoryCounts[cat] ?? 0) > 0)

    const visible = chores
      .filter((c) => categoryFilter === 'all' || c.category === categoryFilter)
      // งานกำหนดเวลา → งานทั่วไป → งานพิเศษ; ในกลุ่มเรียงตามเวลา (เร็วสุดก่อน) แล้วค่อย XP
      .sort(
        (a, b) =>
          choreTier(a) - choreTier(b) ||
          (a.dueTime ?? '').localeCompare(b.dueTime ?? '') ||
          a.xpValue - b.xpValue,
      )
    return { visible, categoryOptions, categoryCounts }
  }, [chores, categoryFilter])

  async function handleSubmit(input: ChoreInput) {
    setSubmitting(true)
    setFormError(null)
    try {
      if (editor.mode === 'edit') {
        await api.patch(`/api/chores/${editor.chore.id}`, input)
      } else {
        await api.post('/api/chores', input)
      }
      await loadChores()
      setEditor({ mode: 'closed' })
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ ลองอีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(chore: Chore, force: boolean) {
    setDeletingId(chore.id)
    setDeleteError(null)
    try {
      await api.del(`/api/chores/${chore.id}${force ? '?force=1' : ''}`)
      setChores((prev) => prev.filter((c) => c.id !== chore.id))
      setPendingDelete(null)
      setForceCount(null)
    } catch (err) {
      // History present → don't dead-end; escalate to a second confirmation that
      // will re-issue the delete with ?force=1.
      if (err instanceof ApiError && err.code === 'CONFLICT' && !force) {
        const c = err.extra?.completionCount
        setForceCount(typeof c === 'number' ? c : 0)
      } else {
        setDeleteError(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ ลองอีกครั้ง')
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-900">งานบ้าน</h1>
          <p className="mt-1 text-sm font-semibold text-ink-600">
            สร้างและจัดการงานบ้านของครอบครัว
          </p>
        </div>
        <Button
          leftIcon="＋"
          onClick={() => {
            setFormError(null)
            setEditor({ mode: 'create' })
          }}
        >
          เพิ่มงาน
        </Button>
      </div>

      {/* Category filter chips (only when there's more than one category to pick) */}
      {!loading && !loadError && categoryOptions.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <CategoryChip
            label="ทุกประเภท"
            count={categoryCounts.all}
            on={categoryFilter === 'all'}
            onClick={() => setCategoryFilter('all')}
          />
          {categoryOptions.map((cat) => (
            <CategoryChip
              key={cat}
              label={`${CATEGORY_META[cat].emoji} ${CATEGORY_META[cat].label}`}
              count={categoryCounts[cat] ?? 0}
              on={categoryFilter === cat}
              onClick={() => setCategoryFilter(cat)}
            />
          ))}
        </div>
      ) : null}

      {loading ? (
        <Card variant="sunk" className="text-center text-sm font-semibold text-ink-600">
          กำลังโหลด…
        </Card>
      ) : loadError ? (
        <Card variant="sunk" className="text-center text-sm font-semibold text-danger-500">
          {loadError}
        </Card>
      ) : chores.length === 0 ? (
        <Card variant="sunk" padding="lg" className="text-center">
          <p className="text-4xl">🧹</p>
          <p className="mt-2 font-extrabold text-ink-900">ยังไม่มีงานบ้าน</p>
          <p className="mt-1 text-sm font-semibold text-ink-600">
            แตะ “เพิ่มงาน” เพื่อสร้างงานแรก
          </p>
        </Card>
      ) : visible.length === 0 ? (
        <Card variant="sunk" padding="lg" className="text-center text-sm font-semibold text-ink-600">
          ไม่มีงานที่ตรงกับตัวกรอง
        </Card>
      ) : (
        <ul className="grid gap-3">
          {visible.map((chore) => {
            const assignee = childName(chore.assignedTo)
            const cat = CATEGORY_META[chore.category]
            const daysLabel =
              chore.recurrence === 'weekly' && chore.recurDays.length > 0
                ? chore.recurDays.map((d) => WEEKDAY_LABELS[d]).join(' ')
                : null
            return (
              <li key={chore.id} className="min-w-0">
                <Card padding="md">
                  <div className="flex flex-col gap-2.5">
                    {/* Title on its own full-width row so long titles show in
                        full (wrapping) instead of competing with the actions. */}
                    <h3 className="break-words font-extrabold text-ink-900">{chore.title}</h3>

                    {/* Meta (left) + XP & actions (right). */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-pill bg-cream-300 px-2 py-0.5 text-xs font-bold text-ink-600">
                            {cat.emoji} {cat.label}
                          </span>
                          {chore.isExtra ? (
                            <span className="rounded-pill bg-xp-300/60 px-2 py-0.5 text-xs font-bold text-xp-700">
                              งานพิเศษ
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-ink-600">
                          <span>
                            {RECURRENCE_LABEL[chore.recurrence]}
                            {daysLabel ? ` · ${daysLabel}` : ''}
                          </span>
                          <span>{assignee ? `👤 ${assignee}` : '👥 งานส่วนกลาง'}</span>
                          {chore.dueTime ? <span>⏰ {chore.dueTime}</span> : null}
                          {chore.lateXpMultiplier < 1 ? (
                            <span>
                              ⚠️ สายหัก {Math.round((1 - chore.lateXpMultiplier) * 100)}%
                            </span>
                          ) : null}
                          {chore.requirePhoto ? <span>📷 ต้องมีรูป</span> : null}
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <XpBadge value={chore.xpValue} />
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={`แก้ไข ${chore.title}`}
                            onClick={() => {
                              setFormError(null)
                              setEditor({ mode: 'edit', chore })
                            }}
                          >
                            แก้ไข
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            aria-label={`ลบ ${chore.title}`}
                            disabled={deletingId === chore.id}
                            onClick={() => {
                              setDeleteError(null)
                              setForceCount(null)
                              setPendingDelete(chore)
                            }}
                          >
                            {deletingId === chore.id ? '…' : 'ลบ'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {editor.mode !== 'closed' ? (
        <ChoreFormModal
          chore={editor.mode === 'edit' ? editor.chore : null}
          childOptions={children}
          submitting={submitting}
          serverError={formError}
          onSubmit={handleSubmit}
          onClose={() => {
            if (!submitting) setEditor({ mode: 'closed' })
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        icon={<span aria-hidden>🗑️</span>}
        title={
          pendingDelete
            ? forceCount !== null
              ? `ลบงาน "${pendingDelete.title}" ทั้งประวัติ?`
              : `ลบงาน "${pendingDelete.title}"?`
            : ''
        }
        message={
          forceCount !== null
            ? `งานนี้มีประวัติการทำ${forceCount > 0 ? ` ${forceCount} ครั้ง` : ''}แล้ว — ลบงานจะลบประวัติเหล่านั้นทิ้งด้วย ย้อนกลับไม่ได้`
            : 'งานนี้จะถูกลบออกจากรายการ'
        }
        confirmLabel={forceCount !== null ? 'ลบทั้งหมด' : 'ลบออก'}
        cancelLabel="ยกเลิก"
        busy={deletingId !== null}
        error={deleteError}
        onConfirm={() => {
          if (pendingDelete) void handleDelete(pendingDelete, forceCount !== null)
        }}
        onCancel={() => {
          setPendingDelete(null)
          setDeleteError(null)
          setForceCount(null)
        }}
      />
    </div>
  )
}

/** A pill for the category filter row, with a count badge. */
function CategoryChip({
  label,
  count,
  on,
  onClick,
}: {
  label: string
  count: number
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-pill px-3.5 py-1.5 text-sm font-extrabold transition',
        on
          ? 'bg-primary-600 text-white shadow-sm'
          : 'bg-cream-200 text-ink-600 hover:bg-cream-300',
      )}
    >
      {label}
      <span
        className={cn(
          'ml-1.5 rounded-full px-1.5 py-0.5 text-xs',
          on ? 'bg-white/25 text-white' : 'bg-cream-400 text-ink-600',
        )}
      >
        {count}
      </span>
    </button>
  )
}
