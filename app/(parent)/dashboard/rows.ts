/**
 * app/(parent)/dashboard/rows.ts — the parent dashboard's "งานของวันนี้" table,
 * as pure functions.
 *
 * This is the layer that used to be inline in page.tsx and quietly wrong. It is
 * separated out so the counts can be pinned by tests rather than by eye: the
 * bugs it now guards against were all invisible arithmetic, not visual defects.
 *
 * Everything here consumes what GET /api/chores/today already decided (which
 * chores are on the child's day, and whether each is still outstanding). No
 * calendar logic lives on this side of the wire — the two implementations
 * drifting apart is exactly what broke the counters.
 */

/** One chore on a child's day, as returned by GET /api/chores/today. */
export interface DayEntry {
  choreId: string
  isExtra: boolean
  outstanding: boolean
  completion: {
    id: string
    status: 'pending' | 'approved' | 'rejected'
    submittedAt: string
    xpAwarded: number
  } | null
}

/** Per-child counts from the same endpoint. */
export interface DaySummary {
  requiredTotal: number
  requiredDone: number
  requiredRemaining: number
  extraTotal: number
  extraDone: number
  extraRemaining: number
}

/** The chore fields the table renders. */
export interface RowChore {
  id: string
  title: string
  xpValue: number
  isExtra: boolean
  dueTime: string | null
}

/** A child's day as the table consumes it. `day: null` = the request failed. */
export interface ChildDay {
  userId: string
  name: string
  day: DayEntry[] | null
  summary: DaySummary | null
}

export type CellStatus = 'done' | 'late' | 'pending' | 'rejected' | 'todo'

export interface TodayCell {
  childId: string
  childName: string
  status: CellStatus
  xp: number
}

export interface TodayRow {
  choreId: string
  isExtra: boolean
  cells: TodayCell[]
}

/** Most-urgent-first: what still needs the parent, then the child, then done. */
export const URGENCY: Record<CellStatus, number> = {
  pending: 0,
  rejected: 1,
  todo: 2,
  late: 3,
  done: 4,
}

/**
 * Translate one server day-entry into the cell the table paints.
 *
 * `outstanding` is the server's word on whether the chore still needs doing, so
 * a rejected submission reads as re-opened rather than as finished work.
 */
export function cellStatus(entry: DayEntry, chore: RowChore): CellStatus {
  if (entry.outstanding) {
    return entry.completion?.status === 'rejected' ? 'rejected' : 'todo'
  }
  if (entry.completion?.status === 'approved') {
    return entry.completion.xpAwarded < chore.xpValue ? 'late' : 'done'
  }
  return 'pending'
}

/**
 * Build the family table: one row per chore, one cell per child who owes it.
 *
 * The row is per chore only for readability — the *unit of counting* is the
 * cell. Reporting a shared chore as finished because one of three children did
 * it is what hid the other two from the parent entirely.
 *
 * Bonus chores appear only once a child has actually completed one. They are
 * opt-in extras nobody owes, so listing them as outstanding both buries the
 * required work and breaks the one invariant this page has to hold: the header's
 * ค้าง count is the same number as the "งานยังไม่เสร็จวันนี้" tile, which counts
 * required work only. A rejected bonus is still outstanding, so it is dropped
 * too — otherwise it lands in ค้าง and the two numbers disagree by one.
 */
export function buildTodayRows(children: readonly ChildDay[], chores: readonly RowChore[]): TodayRow[] {
  const choreById = new Map(chores.map((c) => [c.id, c]))
  const rows = new Map<string, TodayRow>()

  for (const child of children) {
    for (const entry of child.day ?? []) {
      const chore = choreById.get(entry.choreId)
      if (!chore) continue
      if (chore.isExtra && entry.outstanding) continue
      const status = cellStatus(entry, chore)

      let row = rows.get(chore.id)
      if (!row) {
        row = { choreId: chore.id, isExtra: chore.isExtra, cells: [] }
        rows.set(chore.id, row)
      }
      row.cells.push({
        childId: child.userId,
        childName: child.name,
        status,
        xp: entry.completion?.xpAwarded ?? chore.xpValue,
      })
    }
  }

  const list = Array.from(rows.values())
  for (const row of list) row.cells.sort((a, b) => URGENCY[a.status] - URGENCY[b.status])
  list.sort((a, b) => URGENCY[a.cells[0].status] - URGENCY[b.cells[0].status])
  return list
}

export interface TableCounts {
  done: number
  review: number
  todo: number
  late: number
}

/**
 * Header counts, in cells — the same unit as the "งานยังไม่เสร็จวันนี้" tile, so
 * a shared chore three children owe counts three times in both places. The two
 * disagreed before because the header counted chores and the tile counted
 * child-tasks.
 *
 * `todo` deliberately includes re-opened (rejected) work: both mean "still owed
 * today", which is what the tile sums.
 */
export function countCells(rows: readonly TodayRow[]): TableCounts {
  const cells = rows.flatMap((r) => r.cells)
  return {
    done: cells.filter((c) => c.status === 'done' || c.status === 'late').length,
    review: cells.filter((c) => c.status === 'pending').length,
    todo: cells.filter((c) => c.status === 'todo' || c.status === 'rejected').length,
    late: cells.filter((c) => c.status === 'late').length,
  }
}

/**
 * Family total for "งานยังไม่เสร็จวันนี้". A child whose request failed
 * contributes nothing *and* flags the total as partial, so the tile can say so
 * instead of quietly reading as "everyone is finished".
 */
export function remainingTotal(children: readonly ChildDay[]): {
  total: number
  partial: boolean
} {
  let total = 0
  let partial = false
  for (const c of children) {
    if (c.summary === null) partial = true
    else total += c.summary.requiredRemaining
  }
  return { total, partial }
}
