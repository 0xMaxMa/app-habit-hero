'use client'

/**
 * app/(child)/child/rewards/ChildRewards.tsx — the kid-facing reward catalog (S7).
 *
 * A child sees their current XP balance, the family's active rewards, and can
 * ask to redeem one:
 *   • enough XP  → POST /api/redemptions creates a pending request; we show a
 *                  "ส่งคำขอแล้ว รอพ่อแม่อนุมัติ" toast (XP is only deducted once a
 *                  parent approves — never here).
 *   • not enough → the endpoint returns { enough:false, shortfall } and we show
 *                  "ขาดอีก N XP" inline without creating anything.
 * Below the catalog, "คำขอของฉัน" lists the child's own requests + their status.
 *
 * Data (all client-side so `next build` never touches Postgres):
 *   • GET /api/progress?user=<id>  → XP balance
 *   • GET /api/rewards             → active catalog (children never see hidden)
 *   • GET /api/redemptions         → the child's own requests (self-scoped)
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Button,
  Card,
  ConfirmDialog,
  StatusChip,
  ViewModeToggle,
  XpBadge,
  cn,
  type ChoreStatus,
} from '@/components/ui'
import { api, ApiError } from '@/lib/web/api'
import { useAutoRefresh } from '@/lib/web/useAutoRefresh'
import { useViewModePreference } from '@/lib/web/useViewModePreference'

interface Reward {
  id: string
  title: string
  description: string | null
  xpCost: number
  iconEmoji: string | null
  isActive: boolean
}
interface Redemption {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  xpSpent: number
  requestedAt: string
  reward: { id: string; title: string; iconEmoji: string | null; xpCost: number }
}
type Toast = { kind: 'success' | 'error'; text: string } | null

const STATUS_CHIP: Record<Redemption['status'], ChoreStatus> = {
  approved: 'done',
  pending: 'pending',
  rejected: 'rejected',
}
const STATUS_LABEL: Record<Redemption['status'], string> = {
  approved: 'อนุมัติแล้ว',
  pending: 'รออนุมัติ',
  rejected: 'ไม่ผ่าน',
}

export function ChildRewards({ childId }: { childId: string }) {
  const [available, setAvailable] = useState<number | null>(null)
  const [rewards, setRewards] = useState<Reward[] | null>(null)
  const [requests, setRequests] = useState<Redemption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  // Reward awaiting the child's "yes, redeem" confirmation.
  const [pendingRedeem, setPendingRedeem] = useState<Reward | null>(null)
  // Per-reward shortfall message after a "not enough" attempt.
  const [shortfalls, setShortfalls] = useState<Record<string, number>>({})
  const [catalogMode, setCatalogMode] = useViewModePreference('child-rewards-catalog')
  const [requestsMode, setRequestsMode] = useViewModePreference('child-rewards-requests')

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    try {
      const [prog, cat, mine] = await Promise.all([
        api.get<{ xp: number }>(`/api/progress?user=${encodeURIComponent(childId)}`),
        api.get<{ rewards: Reward[] }>('/api/rewards'),
        api.get<{ redemptions: Redemption[] }>('/api/redemptions'),
      ])
      setAvailable(prog.xp)
      setRewards(cat.rewards)
      // Newest request first.
      setRequests(
        [...mine.redemptions].sort(
          (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
        ),
      )
      setError(null)
    } catch (err) {
      if (silent) return // background refresh — keep the last good view
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลไม่สำเร็จ ลองรีเฟรชอีกครั้งนะ')
      setRewards([])
    }
  }, [childId])

  useEffect(() => {
    void load()
  }, [load])

  // A parent may approve/reject a request while the child watches this page.
  useAutoRefresh(() => load({ silent: true }))

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3200)
    return () => clearTimeout(t)
  }, [toast])

  async function redeem(reward: Reward) {
    setBusyId(reward.id)
    setShortfalls((s) => {
      const next = { ...s }
      delete next[reward.id]
      return next
    })
    try {
      const res = await api.post<
        | { enough: false; shortfall: number }
        | { enough: true; redemption: Redemption }
      >('/api/redemptions', { rewardId: reward.id })

      if (res.enough === false) {
        setShortfalls((s) => ({ ...s, [reward.id]: res.shortfall }))
        setToast({ kind: 'error', text: `ยังไม่พอ ขาดอีก ${res.shortfall.toLocaleString()} XP` })
        return
      }
      setRequests((prev) => [res.redemption, ...prev])
      setToast({ kind: 'success', text: `ขอแลก "${reward.title}" แล้ว รอพ่อแม่อนุมัติ 🎉` })
    } catch (err) {
      setToast({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'ขอแลกไม่สำเร็จ ลองใหม่อีกครั้งนะ',
      })
    } finally {
      setBusyId(null)
      setPendingRedeem(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* XP balance header */}
      <header className="pt-1">
        <h1 className="text-2xl font-extrabold text-ink-900">คลังรางวัล</h1>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm font-bold text-ink-600">แต้มของฉันตอนนี้</span>
          {available === null ? (
            <span className="h-6 w-16 animate-pulse rounded-pill bg-cream-300" />
          ) : (
            <XpBadge value={available} size="md" />
          )}
        </div>
      </header>

      {error && (
        <Card variant="plain" className="border-danger-500/30 bg-danger-100">
          <p className="text-sm font-semibold text-danger-500">{error}</p>
        </Card>
      )}

      {/* Catalog */}
      <section aria-label="รางวัลที่แลกได้" className="space-y-3">
        {rewards !== null && rewards.length > 0 && (
          <div className="flex justify-end">
            <ViewModeToggle mode={catalogMode} onChange={setCatalogMode} />
          </div>
        )}
        {rewards === null ? (
          <div className="space-y-3">
            <RewardSkeleton />
            <RewardSkeleton />
          </div>
        ) : rewards.length === 0 ? (
          <Card variant="sunk" className="text-center">
            <p className="text-4xl">🎁</p>
            <p className="mt-2 text-base font-extrabold text-ink-900">ยังไม่มีรางวัล</p>
            <p className="mt-1 text-sm font-semibold text-ink-600">
              บอกพ่อแม่ให้เพิ่มรางวัลเจ๋ง ๆ ไว้ให้แลกนะ
            </p>
          </Card>
        ) : catalogMode === 'grid' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {rewards.map((reward) => (
              <RewardTile
                key={reward.id}
                reward={reward}
                canAfford={available != null && available >= reward.xpCost}
                shortfall={shortfalls[reward.id]}
                busy={busyId === reward.id}
                disabled={busyId !== null}
                onRedeem={() => setPendingRedeem(reward)}
              />
            ))}
          </div>
        ) : (
          rewards.map((reward) => {
            const canAfford = available != null && available >= reward.xpCost
            const shortfall = shortfalls[reward.id]
            return (
              <Card key={reward.id} className="flex items-start gap-3">
                <span
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cream-200 text-3xl"
                  aria-hidden
                >
                  {reward.iconEmoji || '🎁'}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-extrabold text-ink-900">{reward.title}</h3>
                  {reward.description && (
                    <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-ink-600">
                      {reward.description}
                    </p>
                  )}
                  <div className="mt-1.5">
                    <XpBadge value={reward.xpCost} size="sm" />
                  </div>
                  {shortfall != null && (
                    <p className="mt-1.5 text-xs font-bold text-danger-500">
                      ยังไม่พอ ขาดอีก {shortfall.toLocaleString()} XP
                    </p>
                  )}
                  <Button
                    variant={canAfford ? 'primary' : 'secondary'}
                    size="md"
                    className="mt-3 w-full"
                    onClick={() => setPendingRedeem(reward)}
                    disabled={busyId === reward.id || busyId !== null || !canAfford}
                    leftIcon={<span aria-hidden>{canAfford ? '🎉' : '🔒'}</span>}
                  >
                    {busyId === reward.id
                      ? 'กำลังส่งคำขอ…'
                      : canAfford
                        ? 'แลกเลย'
                        : 'แต้มยังไม่พอ'}
                  </Button>
                </div>
              </Card>
            )
          })
        )}
      </section>

      {/* My requests */}
      {requests.length > 0 && (
        <section aria-label="คำขอแลกรางวัลของฉัน" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-extrabold text-ink-900">คำขอของฉัน</h2>
            <ViewModeToggle mode={requestsMode} onChange={setRequestsMode} />
          </div>
          {requestsMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {requests.map((r) => (
                <div key={r.id} role="listitem">
                  <Card padding="sm" className="flex flex-col items-center gap-2 p-3 text-center">
                    <span className="text-3xl" aria-hidden>
                      {r.reward.iconEmoji || '🎁'}
                    </span>
                    <div className="w-full min-w-0">
                      <p className="truncate text-sm font-extrabold text-ink-900">{r.reward.title}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-ink-600">
                        ใช้ {r.xpSpent.toLocaleString()} XP
                      </p>
                    </div>
                    <StatusChip status={STATUS_CHIP[r.status]} size="sm" />
                  </Card>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((r) => (
                <Card key={r.id} padding="md" className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden>
                    {r.reward.iconEmoji || '🎁'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold text-ink-900">{r.reward.title}</p>
                    <p className="text-xs font-semibold text-ink-600">
                      ใช้ {r.xpSpent.toLocaleString()} XP · {STATUS_LABEL[r.status]}
                    </p>
                  </div>
                  <StatusChip status={STATUS_CHIP[r.status]} size="sm" />
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      <ConfirmDialog
        open={pendingRedeem !== null}
        icon={<span aria-hidden>{pendingRedeem?.iconEmoji || '🎁'}</span>}
        title={pendingRedeem ? `แลก "${pendingRedeem.title}"?` : ''}
        message={
          pendingRedeem
            ? `ใช้ ${pendingRedeem.xpCost.toLocaleString()} XP นะ — ส่งคำขอให้พ่อแม่อนุมัติก่อน`
            : undefined
        }
        confirmLabel="แลกเลย 🎉"
        cancelLabel="ยังก่อน"
        busy={busyId !== null}
        onConfirm={() => {
          if (pendingRedeem) void redeem(pendingRedeem)
        }}
        onCancel={() => setPendingRedeem(null)}
      />

      {toast && (
        <div
          role="status"
          className={cn(
            'fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-2xl px-4 py-3 text-center text-sm font-extrabold shadow-lg',
            toast.kind === 'success' ? 'bg-success-500 text-white' : 'bg-danger-500 text-white',
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}

/** Grid-view tile for a reward — same data/action as the catalog row. */
function RewardTile({
  reward,
  canAfford,
  shortfall,
  busy,
  disabled,
  onRedeem,
}: {
  reward: Reward
  canAfford: boolean
  shortfall: number | undefined
  busy: boolean
  disabled: boolean
  onRedeem: () => void
}) {
  return (
    <Card padding="sm" className="flex flex-col items-center gap-2 p-3 text-center">
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cream-200 text-3xl"
        aria-hidden
      >
        {reward.iconEmoji || '🎁'}
      </span>
      <div className="w-full min-w-0">
        <h3 className="truncate text-sm font-extrabold text-ink-900">{reward.title}</h3>
        <XpBadge value={reward.xpCost} size="sm" className="mt-1" />
      </div>
      {shortfall != null && (
        <p className="text-xs font-bold text-danger-500">ขาดอีก {shortfall.toLocaleString()} XP</p>
      )}
      <Button
        variant={canAfford ? 'primary' : 'secondary'}
        size="sm"
        className="w-full"
        onClick={onRedeem}
        disabled={disabled || !canAfford}
        leftIcon={<span aria-hidden>{canAfford ? '🎉' : '🔒'}</span>}
      >
        {busy ? 'กำลังส่ง…' : canAfford ? 'แลกเลย' : 'ยังไม่พอ'}
      </Button>
    </Card>
  )
}

function RewardSkeleton() {
  return (
    <Card className="flex items-start gap-3">
      <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-cream-300" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 animate-pulse rounded bg-cream-300" />
        <div className="h-3 w-20 animate-pulse rounded bg-cream-300" />
        <div className="mt-3 h-11 w-full animate-pulse rounded-2xl bg-cream-300" />
      </div>
    </Card>
  )
}
