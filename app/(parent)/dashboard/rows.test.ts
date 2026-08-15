/**
 * app/(parent)/dashboard/rows.test.ts — the dashboard's table + counters.
 *
 * Every case here is a number a parent actually saw on screen and could not
 * reconcile with the app's own pages: the summary tile said 0 รออนุมัติ while
 * nine submissions sat in the queue, and the "งานของวันนี้" table reported a
 * shared chore finished because one of three children had done it.
 *
 * The counting unit is the *cell* (one child owing one chore), because that is
 * the unit the "งานยังไม่เสร็จวันนี้" tile sums. Rows are per chore purely for
 * readability, and mixing the two units is what made the numbers disagree.
 */

import { describe, it, expect } from 'vitest'
import {
  buildTodayRows,
  cellStatus,
  countCells,
  remainingTotal,
  type ChildDay,
  type DayEntry,
  type DaySummary,
  type RowChore,
} from './rows'

const chore = (over: Partial<RowChore> = {}): RowChore => ({
  id: 'c1',
  title: 'ล้างจาน',
  xpValue: 20,
  isExtra: false,
  dueTime: null,
  ...over,
})

/** A day-entry for `choreId`. Defaults to untouched work. */
const entry = (choreId: string, over: Partial<DayEntry> = {}): DayEntry => ({
  choreId,
  isExtra: false,
  outstanding: true,
  completion: null,
  ...over,
})

const done = (choreId: string, xpAwarded = 20): DayEntry =>
  entry(choreId, {
    outstanding: false,
    completion: { id: `k_${choreId}`, status: 'approved', submittedAt: '', xpAwarded },
  })

const submitted = (choreId: string): DayEntry =>
  entry(choreId, {
    outstanding: false,
    completion: { id: `k_${choreId}`, status: 'pending', submittedAt: '', xpAwarded: 0 },
  })

const summary = (over: Partial<DaySummary> = {}): DaySummary => ({
  requiredTotal: 0,
  requiredDone: 0,
  requiredRemaining: 0,
  extraTotal: 0,
  extraDone: 0,
  extraRemaining: 0,
  ...over,
})

const child = (userId: string, name: string, day: DayEntry[] | null, s = summary()): ChildDay => ({
  userId,
  name,
  day,
  summary: day === null ? null : s,
})

describe('cellStatus', () => {
  it('reads a full-XP approval as done and a docked one as late', () => {
    expect(cellStatus(done('c1', 20), chore())).toBe('done')
    expect(cellStatus(done('c1', 12), chore())).toBe('late')
  })

  it('reads an unreviewed submission as waiting for the parent, not as done', () => {
    expect(cellStatus(submitted('c1'), chore())).toBe('pending')
  })

  it('reads a rejected chore as re-opened, since the server still owes it', () => {
    const rejected = entry('c1', {
      outstanding: true,
      completion: { id: 'k', status: 'rejected', submittedAt: '', xpAwarded: 0 },
    })
    expect(cellStatus(rejected, chore())).toBe('rejected')
  })
})

describe('buildTodayRows — a shared chore is per child, not per chore', () => {
  const kids = [
    child('u1', 'วิน', [done('c1')]),
    child('u2', 'เวล', [entry('c1')]),
    child('u3', 'เหวิน', [entry('c1')]),
  ]

  it('keeps every child that owes the chore visible', () => {
    const rows = buildTodayRows(kids, [chore()])
    expect(rows).toHaveLength(1)
    expect(rows[0].cells.map((c) => [c.childName, c.status])).toEqual(
      expect.arrayContaining([
        ['วิน', 'done'],
        ['เวล', 'todo'],
        ['เหวิน', 'todo'],
      ]),
    )
  })

  it('does NOT report the chore finished because one child did it', () => {
    // The regression: the table used to keep one completion per chore, so this
    // read as "เสร็จ 1 · ค้าง 0" and the other two children vanished.
    const counts = countCells(buildTodayRows(kids, [chore()]))
    expect(counts).toEqual({ done: 1, review: 0, todo: 2, late: 0 })
  })

  it('counts a rejected chore as still owed, alongside plain todo', () => {
    const rows = buildTodayRows(
      [
        child('u1', 'วิน', [
          entry('c1', {
            completion: { id: 'k', status: 'rejected', submittedAt: '', xpAwarded: 0 },
          }),
        ]),
        child('u2', 'เวล', [entry('c1')]),
      ],
      [chore()],
    )
    expect(countCells(rows).todo).toBe(2)
  })
})

describe('buildTodayRows — bonus chores', () => {
  it('hides bonus work nobody has touched', () => {
    const rows = buildTodayRows([child('u1', 'วิน', [entry('x1', { isExtra: true })])], [
      chore({ id: 'x1', isExtra: true }),
    ])
    expect(rows).toHaveLength(0)
  })

  it('shows a bonus chore once a child actually did it', () => {
    const rows = buildTodayRows([child('u1', 'วิน', [done('x1')])], [chore({ id: 'x1', isExtra: true })])
    expect(rows).toHaveLength(1)
    expect(rows[0].isExtra).toBe(true)
    expect(countCells(rows)).toEqual({ done: 1, review: 0, todo: 0, late: 0 })
  })

  it('keeps a rejected bonus out of ค้าง, which counts required work only', () => {
    // Caught by measuring the rendered page: a rejected bonus chore put a
    // "ตีกลับ" cell into ค้าง (34) while the tile counted required work only
    // (33) — the same header-vs-tile disagreement this whole change removes.
    const rows = buildTodayRows(
      [
        child('u1', 'วิน', [
          entry('x1', {
            isExtra: true,
            completion: { id: 'k', status: 'rejected', submittedAt: '', xpAwarded: 0 },
          }),
          entry('c1'),
        ]),
      ],
      [chore({ id: 'x1', isExtra: true }), chore({ id: 'c1' })],
    )
    expect(countCells(rows).todo).toBe(1)
  })
})

describe('the invariant the dashboard has to hold', () => {
  it('ค้าง in the table header equals the "งานยังไม่เสร็จวันนี้" tile', () => {
    // Two numbers, side by side on one screen, in the same unit. They are
    // computed by different functions from different endpoints — this is the
    // test that keeps them from drifting the way every counter on this page
    // already did once.
    const chores = [
      chore({ id: 'c1' }),
      chore({ id: 'c2' }),
      chore({ id: 'x1', isExtra: true }),
    ]
    const kids = [
      child('u1', 'วิน', [entry('c1'), done('c2'), entry('x1', { isExtra: true })], summary({
        requiredTotal: 2,
        requiredDone: 1,
        requiredRemaining: 1,
        extraTotal: 1,
        extraRemaining: 1,
      })),
      child('u2', 'เวล', [entry('c1'), entry('c2')], summary({
        requiredTotal: 2,
        requiredDone: 0,
        requiredRemaining: 2,
      })),
    ]

    const counts = countCells(buildTodayRows(kids, chores))
    expect(counts.todo).toBe(remainingTotal(kids).total)
    expect(counts.todo).toBe(3)
  })
})

describe('buildTodayRows — ordering', () => {
  it('puts what needs the parent first and finished work last', () => {
    const rows = buildTodayRows(
      [child('u1', 'วิน', [done('c1'), entry('c2'), submitted('c3')])],
      [chore({ id: 'c1' }), chore({ id: 'c2' }), chore({ id: 'c3' })],
    )
    expect(rows.map((r) => r.choreId)).toEqual(['c3', 'c2', 'c1'])
  })
})

describe('remainingTotal', () => {
  it('sums the required remainder across children', () => {
    const kids = [
      child('u1', 'วิน', [], summary({ requiredTotal: 6, requiredDone: 2, requiredRemaining: 4 })),
      child('u2', 'เวล', [], summary({ requiredTotal: 6, requiredDone: 6, requiredRemaining: 0 })),
    ]
    expect(remainingTotal(kids)).toEqual({ total: 4, partial: false })
  })

  it('flags a failed child instead of counting them as finished', () => {
    // The old page swallowed the error with `.catch(() => 0)`, so a broken
    // request rendered as "เคลียร์หมดแล้ว 🎉" — the most misleading answer
    // available.
    const kids = [
      child('u1', 'วิน', [], summary({ requiredRemaining: 4 })),
      child('u2', 'เวล', null),
    ]
    expect(remainingTotal(kids)).toEqual({ total: 4, partial: true })
  })
})
