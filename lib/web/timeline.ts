/**
 * lib/web/timeline.ts — shared helpers for merging a completions list and a
 * deductions list onto one newest-first, day-grouped timeline. Used by every
 * screen that renders both record kinds together (parent history, parent
 * child-profile, child's own tasks page) so the sort/group rule only lives
 * in one place.
 */

export type TimelineEntry<C, D> =
  | { kind: 'completion'; at: number; completion: C }
  | { kind: 'deduction'; at: number; deduction: D }

/** Merge completions + deductions onto one newest-first axis. */
export function mergeTimeline<C, D>(
  completions: readonly C[],
  deductions: readonly D[],
  completionAt: (c: C) => number,
  deductionAt: (d: D) => number,
): TimelineEntry<C, D>[] {
  return [
    ...completions.map<TimelineEntry<C, D>>((c) => ({
      kind: 'completion',
      at: completionAt(c),
      completion: c,
    })),
    ...deductions.map<TimelineEntry<C, D>>((d) => ({
      kind: 'deduction',
      at: deductionAt(d),
      deduction: d,
    })),
  ].sort((a, b) => b.at - a.at)
}

export interface DayGroup<C, D> {
  key: string
  label: string
  items: TimelineEntry<C, D>[]
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

const DAY_FMT = new Intl.DateTimeFormat('th-TH', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** "วันนี้" / "เมื่อวาน" / full Thai date — the day-group header label. */
export function formatDayLabel(d: Date): string {
  const now = new Date()
  if (isSameDay(d, now)) return 'วันนี้'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(d, yesterday)) return 'เมื่อวาน'
  return DAY_FMT.format(d)
}

/** Bucket already-sorted (desc) timeline entries under a per-day header. */
export function groupByDay<C, D>(
  items: readonly TimelineEntry<C, D>[],
): DayGroup<C, D>[] {
  const groups: DayGroup<C, D>[] = []
  let current: DayGroup<C, D> | null = null

  for (const item of items) {
    const d = new Date(item.at)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (!current || current.key !== key) {
      current = { key, label: formatDayLabel(d), items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}
