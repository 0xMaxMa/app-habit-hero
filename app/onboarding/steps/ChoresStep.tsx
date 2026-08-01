'use client'

import {
  Card,
  CardTitle,
  CardSubtitle,
  XpBadge,
  cn,
} from '@/components/ui'
import { STARTER_CHORES } from '@/lib/onboarding'

const RECURRENCE_LABEL: Record<string, string> = {
  daily: 'ทุกวัน',
  weekly: 'รายสัปดาห์',
  once: 'ครั้งเดียว',
}

/**
 * ChoresStep — pick starter chores from the curated catalogue (design S2
 * "เลือกงานเริ่มต้น"). XP is preset per chore; parents tune it later.
 */
export function ChoresStep({
  selected,
  onChange,
  error,
}: {
  selected: string[]
  onChange: (keys: string[]) => void
  error?: string
}) {
  const selectedSet = new Set(selected)

  function toggle(key: string) {
    if (selectedSet.has(key)) {
      onChange(selected.filter((k) => k !== key))
    } else {
      onChange([...selected, key])
    }
  }

  return (
    <div>
      <CardTitle className="text-xl">เลือกงานเริ่มต้น</CardTitle>
      <CardSubtitle className="mt-1">
        เราตั้ง XP ให้อัตโนมัติ ปรับได้ทุกเมื่อ · เลือกได้หลายงาน
      </CardSubtitle>

      {error ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger-500">
          {error}
        </p>
      ) : null}

      <div className="mt-4 grid gap-2.5">
        {STARTER_CHORES.map((c) => {
          const on = selectedSet.has(c.key)
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c.key)}
              className={cn(
                'flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition',
                on
                  ? 'border-primary-600 bg-primary-300/25'
                  : 'border-cream-600 bg-cream-50 hover:border-primary-300',
              )}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cream-200 text-2xl">
                {c.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold text-ink-900">
                  {c.title}
                </span>
                <span className="block text-xs font-semibold text-ink-600">
                  {RECURRENCE_LABEL[c.recurrence] ?? c.recurrence}
                </span>
              </span>
              <XpBadge value={c.xpValue} size="sm" />
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
        เลือกแล้ว {selected.length} งาน
      </Card>
    </div>
  )
}
