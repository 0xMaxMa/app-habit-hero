'use client'

/**
 * app/(child)/child/badges/ChildBadges.tsx — the kid achievement wall.
 *
 * Fetches the full badge catalog for the signed-in child and shows each medal
 * as earned (bright) or locked (greyed), with a "ใหม่" ribbon on freshly-earned
 * ones. Visiting this page counts as "seen", so the ribbons clear on the next
 * load (the home popup is the primary celebration).
 */

import { useCallback, useEffect, useState } from 'react'
import { BadgeChip, Card } from '@/components/ui'
import { api, ApiError } from '@/lib/web/api'
import { useAutoRefresh } from '@/lib/web/useAutoRefresh'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface BadgeItem {
  id: string
  name: string
  emoji: string
  description: string
  imageUrl: string
  earned: boolean
  earnedAt: string | null
  isNew: boolean
}

interface BadgesResponse {
  userId: string
  name: string
  total: number
  earnedCount: number
  newCount: number
  badges: BadgeItem[]
}

export function ChildBadges({ childId }: { childId: string }) {
  const [data, setData] = useState<BadgesResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    try {
      const res = await api.get<BadgesResponse>(
        `/api/badges?user=${encodeURIComponent(childId)}`,
      )
      setData(res)
      setError(null)
      // Mark any freshly-earned badges as seen so the ribbon is a one-time cue.
      // Only on a foreground load, so a background poll can't clear the "new"
      // cue before the child actually looks at the page.
      if (!silent && res.newCount > 0) {
        api.post('/api/badges/seen', { user: childId }).catch(() => {})
      }
    } catch (err) {
      if (silent) return // background refresh — keep the last good view
      setError(
        err instanceof ApiError ? err.message : 'โหลดเหรียญไม่สำเร็จ ลองรีเฟรชอีกครั้งนะ',
      )
    }
  }, [childId])

  useEffect(() => {
    load()
  }, [load])

  useAutoRefresh(() => load({ silent: true }))

  return (
    <div className="flex flex-col gap-5">
      <header className="pt-1">
        <h1 className="text-2xl font-extrabold text-ink-900">เหรียญของฉัน 🏅</h1>
        {data && (
          <p className="mt-1 text-sm font-bold text-ink-600">
            สะสมได้ {data.earnedCount} / {data.total} เหรียญแล้ว
            {data.earnedCount === data.total ? ' — เก่งมาก! ครบทุกอันเลย 🎉' : ' สู้ ๆ นะ!'}
          </p>
        )}
      </header>

      {error && (
        <Card variant="plain" className="border-danger-500/30 bg-danger-100">
          <p className="text-sm font-semibold text-danger-500">{error}</p>
        </Card>
      )}

      {data === null && !error ? (
        <Card>
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className="h-24 w-24 animate-pulse rounded-2xl bg-cream-300" />
                <div className="h-3 w-16 animate-pulse rounded bg-cream-300" />
              </div>
            ))}
          </div>
        </Card>
      ) : data ? (
        <Card>
          <div className="grid grid-cols-2 justify-items-center gap-x-3 gap-y-6 sm:grid-cols-3">
            {data.badges.map((b) => (
              <BadgeChip
                key={b.id}
                imageSrc={`${BASE_PATH}${b.imageUrl}`}
                label={b.name}
                hint={b.earned ? undefined : b.description}
                earned={b.earned}
                isNew={b.isNew}
                size="lg"
              />
            ))}
          </div>
          <p className="mt-5 text-center text-xs font-semibold text-ink-500">
            เหรียญสีจาง ๆ คือเหรียญที่ยังไม่ได้ — ทำภารกิจให้ครบเพื่อปลดล็อกนะ!
          </p>
        </Card>
      ) : null}
    </div>
  )
}

export default ChildBadges
