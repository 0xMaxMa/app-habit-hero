/**
 * components/ChoreTile.tsx — grid-view tile for an actionable chore, shared by
 * the child home screen and the child tasks page (same data/actions as each
 * page's own ChoreRow, stacked around the category emoji since a chore has no
 * photo of its own).
 */

import { Button, Card, XpBadge } from '@/components/ui'
import { CATEGORY_META, type ChoreCategory } from '@/app/(parent)/chores/types'

export interface ChoreTileChore {
  title: string
  xpValue: number
  requirePhoto: boolean
  category: ChoreCategory
  isExtra: boolean
  dueTime: string | null
}

export function ChoreTile({
  chore,
  busy,
  disabled,
  onDone,
}: {
  chore: ChoreTileChore
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
