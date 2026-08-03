'use client'

import { Card, CardTitle, CardSubtitle, cn } from '@/components/ui'
import { STARTER_REWARDS } from '@/lib/onboarding'

/**
 * RewardsStep — pick which starter rewards the family's shop opens with.
 *
 * Nothing is ticked to begin with, the same as ChoresStep: a step that arrives
 * pre-filled reads as already answered, so parents scrolled past a list of 16
 * rewards they had not actually chosen. "เลือกทั้งหมด" is one tap away for the
 * families that do want the lot.
 *
 * Row layout mirrors ChoresStep, `min-w-0` included: these are grid items, and
 * without it a row cannot shrink below its content and overhangs the card.
 */
export function RewardsStep({
  selected,
  onChange,
  error,
}: {
  selected: string[]
  onChange: (keys: string[]) => void
  error?: string
}) {
  const selectedSet = new Set(selected)
  const allSelected = selected.length === STARTER_REWARDS.length

  function toggle(key: string) {
    if (selectedSet.has(key)) {
      onChange(selected.filter((k) => k !== key))
    } else {
      onChange([...selected, key])
    }
  }

  function toggleAll() {
    onChange(allSelected ? [] : STARTER_REWARDS.map((r) => r.key))
  }

  return (
    <div>
      <CardTitle className="text-xl">เลือกของรางวัล</CardTitle>
      <CardSubtitle className="mt-1">
        ลูกใช้ XP ที่สะสมมาแลก · แก้ราคาและเพิ่มรางวัลเองได้ทีหลัง
      </CardSubtitle>

      <button
        type="button"
        onClick={toggleAll}
        className="mt-3 rounded-xl border-2 border-cream-600 bg-cream-50 px-3 py-1.5 text-sm font-extrabold text-primary-700 transition hover:border-primary-300"
      >
        {allSelected
          ? 'ล้างที่เลือกทั้งหมด'
          : `เลือกทั้งหมด (${STARTER_REWARDS.length} รางวัล)`}
      </button>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger-500">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2.5">
        {STARTER_REWARDS.map((r) => {
          const on = selectedSet.has(r.key)
          return (
            <button
              key={r.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(r.key)}
              className={cn(
                'flex min-w-0 items-center gap-3 rounded-2xl border-2 p-3 text-left transition',
                on
                  ? 'border-primary-600 bg-primary-300/25'
                  : 'border-cream-600 bg-cream-50 hover:border-primary-300',
              )}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cream-200 text-2xl">
                {r.iconEmoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block line-clamp-2 font-extrabold text-ink-900">
                  {r.title}
                </span>
                <span className="block text-xs font-semibold text-ink-600">
                  {r.xpCost} XP
                </span>
              </span>
              <span
                aria-hidden
                className={cn(
                  'grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 text-xs font-extrabold',
                  on
                    ? 'border-primary-600 bg-primary-600 text-white'
                    : 'border-cream-600 text-transparent',
                )}
              >
                ✓
              </span>
            </button>
          )
        })}
      </div>

      <Card variant="sunk" padding="sm" className="mt-4 text-sm font-semibold text-ink-600">
        เลือกแล้ว {selected.length} จาก {STARTER_REWARDS.length} รางวัล
      </Card>
    </div>
  )
}
