'use client'

/**
 * components/ui/ViewModeToggle.tsx — the shared "row list vs thumbnail grid"
 * segmented switch used at the top of every list page. Styled after the
 * pressable pill filters (e.g. CategoryChip in app/(parent)/chores/page.tsx):
 * `rounded-pill`, `aria-pressed`, primary fill when active.
 */

import { cn } from './cn'
import type { ViewMode } from '@/lib/web/useViewModePreference'

const OPTIONS: { mode: ViewMode; label: string; icon: string }[] = [
  { mode: 'list', label: 'แถว', icon: '☰' },
  { mode: 'grid', label: 'ตาราง', icon: '▦' },
]

export function ViewModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="รูปแบบการแสดงรายการ"
      className={cn('inline-flex shrink-0 gap-1 rounded-pill bg-cream-200 p-1', className)}
    >
      {OPTIONS.map((opt) => {
        const on = mode === opt.mode
        return (
          <button
            key={opt.mode}
            type="button"
            aria-pressed={on}
            aria-label={opt.mode === 'list' ? 'มุมมองรายการแถว' : 'มุมมองตาราง'}
            onClick={() => onChange(opt.mode)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-extrabold transition',
              on
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-ink-600 hover:bg-cream-300',
            )}
          >
            <span aria-hidden>{opt.icon}</span>
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
