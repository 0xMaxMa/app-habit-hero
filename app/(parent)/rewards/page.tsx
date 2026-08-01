'use client'

/**
 * app/(parent)/rewards/page.tsx — S7 Reward Catalog (T11).
 *
 * The family's reward catalog with full CRUD (create / edit / toggle / delete).
 * Redemption review ("คำขอแลกรางวัล") lives on /approvals — the single place a
 * parent approves things — so this page is purely the catalog.
 *
 * Data is fetched client-side so `next build` never touches Postgres.
 */

import * as React from 'react'
import { api, ApiError } from '@/lib/web/api'
import { useAutoRefresh } from '@/lib/web/useAutoRefresh'
import { Button, Card, XpBadge, cn, ConfirmDialog } from '@/components/ui'
import { RewardForm, Toggle } from './RewardForm'
import type { Reward } from './types'

export default function RewardsPage() {
  const [rewards, setRewards] = React.useState<Reward[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // Modal state: undefined = closed, null = creating, Reward = editing.
  const [editing, setEditing] = React.useState<Reward | null | undefined>(undefined)
  const modalOpen = editing !== undefined

  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = React.useState<Reward | null>(null)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)
  // Non-null once a delete is refused for having redemption history: the count,
  // which flips the dialog into "confirm once more".
  const [forceCount, setForceCount] = React.useState<number | null>(null)

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    if (!silent) setError(null)
    try {
      const rw = await api.get<{ rewards: Reward[] }>('/api/rewards')
      setRewards(rw.rewards)
      setError(null)
    } catch (err) {
      if (silent) return // background refresh — keep the last good view
      setError(err instanceof ApiError ? err.message : 'โหลดรายการรางวัลไม่สำเร็จ')
      setRewards([])
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  // Keep the catalog fresh without a manual reload (a co-parent may edit it).
  useAutoRefresh(() => load({ silent: true }))

  function handleSaved(saved: Reward) {
    setRewards((prev) => {
      const list = prev ?? []
      const exists = list.some((r) => r.id === saved.id)
      return exists ? list.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...list]
    })
    setEditing(undefined)
  }

  async function handleToggle(reward: Reward) {
    setBusyId(reward.id)
    const next = !reward.isActive
    setRewards((prev) => (prev ?? []).map((r) => (r.id === reward.id ? { ...r, isActive: next } : r)))
    try {
      const data = await api.patch<{ reward: Reward }>(`/api/rewards/${reward.id}`, { isActive: next })
      setRewards((prev) => (prev ?? []).map((r) => (r.id === reward.id ? data.reward : r)))
    } catch {
      setRewards((prev) =>
        (prev ?? []).map((r) => (r.id === reward.id ? { ...r, isActive: reward.isActive } : r)),
      )
      setError('เปลี่ยนสถานะไม่สำเร็จ ลองอีกครั้งนะ')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(reward: Reward, force: boolean) {
    setBusyId(reward.id)
    setDeleteError(null)
    try {
      await api.del(`/api/rewards/${reward.id}${force ? '?force=1' : ''}`)
      setRewards((prev) => (prev ?? []).filter((r) => r.id !== reward.id))
      setPendingDelete(null)
      setForceCount(null)
    } catch (err) {
      // History present → escalate to a second confirmation (force delete).
      if (err instanceof ApiError && err.code === 'CONFLICT' && !force) {
        const c = err.extra?.redemptionCount
        setForceCount(typeof c === 'number' ? c : 0)
      } else {
        setDeleteError(err instanceof ApiError ? err.message : 'ลบรางวัลไม่สำเร็จ ลองอีกครั้งนะ')
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink-900">รางวัล</h1>
          <p className="mt-0.5 text-sm text-ink-600">
            สร้างของรางวัลให้เด็ก ๆ ใช้แต้ม XP มาแลก (คำขอแลกรางวัลอยู่ที่หน้า “อนุมัติ”)
          </p>
        </div>
        <Button leftIcon={<span aria-hidden>➕</span>} onClick={() => setEditing(null)}>
          เพิ่มรางวัล
        </Button>
      </header>

      {error ? (
        <p className="mb-4 rounded-xl bg-danger-100 px-3 py-2 text-sm font-semibold text-danger-500">
          {error}
        </p>
      ) : null}

      {rewards === null ? (
        <p className="py-16 text-center text-sm text-ink-500">กำลังโหลด…</p>
      ) : rewards.length === 0 ? (
        <EmptyState onAdd={() => setEditing(null)} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rewards.map((reward) => (
            <RewardCard
              key={reward.id}
              reward={reward}
              busy={busyId === reward.id}
              onToggle={() => handleToggle(reward)}
              onEdit={() => setEditing(reward)}
              onDelete={() => {
                setDeleteError(null)
                setForceCount(null)
                setPendingDelete(reward)
              }}
            />
          ))}
        </div>
      )}

      {modalOpen ? (
        <RewardForm initial={editing ?? null} onClose={() => setEditing(undefined)} onSaved={handleSaved} />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        icon={<span aria-hidden>🗑️</span>}
        title={
          pendingDelete
            ? forceCount !== null
              ? `ลบรางวัล "${pendingDelete.title}" ทั้งประวัติ?`
              : `ลบรางวัล "${pendingDelete.title}"?`
            : ''
        }
        message={
          forceCount !== null
            ? `รางวัลนี้มีประวัติการแลก${forceCount > 0 ? ` ${forceCount} ครั้ง` : ''}แล้ว — ลบรางวัลจะลบประวัติเหล่านั้นทิ้งด้วย ย้อนกลับไม่ได้`
            : 'รางวัลนี้จะถูกลบออกจากคลัง'
        }
        confirmLabel={forceCount !== null ? 'ลบทั้งหมด' : 'ลบออก'}
        cancelLabel="ยกเลิก"
        busy={busyId !== null}
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

function RewardCard({
  reward,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  reward: Reward
  busy: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const limits = [
    reward.dailyLimit != null ? `${reward.dailyLimit}/วัน` : null,
    reward.weeklyLimit != null ? `${reward.weeklyLimit}/สัปดาห์` : null,
    reward.monthlyLimit != null ? `${reward.monthlyLimit}/เดือน` : null,
  ].filter(Boolean) as string[]

  return (
    <Card padding="md" className={cn('flex flex-col gap-3 transition', !reward.isActive && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cream-200 text-2xl"
          aria-hidden
        >
          {reward.iconEmoji || '🎁'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-extrabold text-ink-900">{reward.title}</h3>
            {!reward.isActive ? (
              <span className="shrink-0 rounded-pill bg-cream-300 px-2 py-0.5 text-xs font-bold text-ink-600">
                ซ่อนอยู่
              </span>
            ) : null}
          </div>
          {reward.description ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">{reward.description}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <XpBadge value={reward.xpCost} />
            {limits.map((l) => (
              <span
                key={l}
                className="rounded-pill bg-cream-200 px-2 py-0.5 text-xs font-semibold text-ink-600"
              >
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-cream-400 pt-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-700">
          <Toggle checked={reward.isActive} onChange={onToggle} label={`เปิดให้แลก ${reward.title}`} />
          {reward.isActive ? 'เปิดให้แลก' : 'ปิดอยู่'}
        </label>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onEdit} disabled={busy}>
            แก้ไข
          </Button>
          <Button size="sm" variant="danger" onClick={onDelete} disabled={busy}>
            ลบ
          </Button>
        </div>
      </div>
    </Card>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card padding="lg" className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="text-5xl" aria-hidden>
        🎁
      </span>
      <div>
        <h2 className="text-lg font-extrabold text-ink-900">ยังไม่มีรางวัล</h2>
        <p className="mt-1 text-sm text-ink-600">
          เพิ่มรางวัลแรกเพื่อให้เด็ก ๆ มีเป้าหมายในการเก็บแต้ม
        </p>
      </div>
      <Button leftIcon={<span aria-hidden>➕</span>} onClick={onAdd}>
        เพิ่มรางวัล
      </Button>
    </Card>
  )
}
