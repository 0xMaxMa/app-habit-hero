/**
 * tests/integration/streak.test.ts — the daily streak rule, end to end.
 *
 * The rule this file pins: **a day counts once the child gets at least one
 * chore approved on it.** It replaces "the child must finish every chore today",
 * which was unreachable in practice — a family with 18 chores a day never hit
 * 100%, so every child sat at "0 วันติด" forever and every streak-derived badge
 * was locked.
 *
 * Drives the real route handlers against the real test Postgres. The streak is
 * derived from approved completions (lib/api/gamification → lib/streak), so the
 * assertions look at UserProgress after an approval and at what GET
 * /api/progress reports on read.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { POST as approve } from '@/app/api/completions/[id]/approve/route'
import { POST as unapprove } from '@/app/api/completions/[id]/unapprove/route'
import { GET as getProgress } from '@/app/api/progress/route'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { AGENT_TOKEN, agentHeaders, jsonBody } from './helpers/actor'
import { IDS } from '@/prisma/seed.test'
import { pendingTodayChores } from '@/lib/api/today'
import { THAI_LOCAL_OFFSET_MS } from '@/lib/clock'
import { localDayNumber, localWeekNumber } from '@/lib/streak'

const DAY_MS = 86_400_000

/** Submit `choreId` for `childRef` (multipart, with the required photo). */
async function submit(childRef: string, choreId: string): Promise<string> {
  const { POST } = await import('@/app/api/completions/route')
  const fd = new FormData()
  fd.set('chore_id', choreId)
  fd.set('photo', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'p.jpg', { type: 'image/jpeg' }))
  const res = await POST(
    new Request('http://t/api/completions', {
      method: 'POST',
      headers: { 'x-agent-token': AGENT_TOKEN, 'x-actor-ref': childRef },
      body: fd,
    }),
  )
  const env = await res.json()
  expect(env.ok).toBe(true)
  return env.data.completion.id as string
}

/** Approve a completion as the parent. */
async function approveAs(parentRef: string, id: string) {
  const res = await approve(
    new Request(`http://t/api/completions/${id}/approve`, {
      method: 'POST',
      headers: agentHeaders(parentRef),
      body: jsonBody({}),
    }),
    { params: { id } },
  )
  const env = await res.json()
  expect(env.ok).toBe(true)
  return env.data
}

/** Write an already-approved completion dated `daysAgo`, as history. */
async function backdateApproved(childId: string, choreId: string, daysAgo: number) {
  const at = new Date(Date.now() - daysAgo * DAY_MS)
  await prisma.choreCompletion.create({
    data: {
      choreId,
      completedBy: childId,
      status: 'approved',
      submittedAt: at,
      reviewedAt: at,
      xpAwarded: 0,
    },
  })
}

beforeEach(async () => {
  await resetAndSeed()
})

describe('A-STREAK-1 — one approved chore lights up the day', () => {
  it('a child who finished ONE of their chores is on a 1-day streak', async () => {
    const { childBId, childBRef, parentRef, familyId } = await getRefs()

    // น้องบี starts at 0 and has more than one chore available today.
    const before = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childBId } })
    expect(before.currentStreak).toBe(0)

    const id = await submit(childBRef, IDS.choreToys)
    await approveAs(parentRef, id)

    // The day is demonstrably NOT finished — this is exactly the case the old
    // "must complete every chore" rule refused to count.
    const stillPending = await pendingTodayChores(familyId, childBId, { now: () => new Date() })
    expect(stillPending.length).toBeGreaterThan(0)

    const after = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childBId } })
    expect(after.currentStreak).toBe(1)
    expect(after.lastActiveDate).not.toBeNull()
    // The child's old record stands — a recompute never lowers the high-water mark.
    expect(after.longestStreak).toBe(5)
  })

  it('reports the fresh streak through GET /api/progress', async () => {
    const { childBId, childBRef, parentRef } = await getRefs()

    const id = await submit(childBRef, IDS.choreToys)
    await approveAs(parentRef, id)

    const res = await getProgress(
      new Request(`http://t/api/progress?user=${childBId}`, { headers: agentHeaders(parentRef) }),
    )
    const d = (await res.json()).data
    expect(d.streak).toBe(1)
    expect(d.bestStreak).toBe(5)
  })
})

describe('A-STREAK-2 — consecutive days, gaps, and undo', () => {
  it('counts back across yesterday and the day before', async () => {
    const { childBId, childBRef, parentRef } = await getRefs()
    await backdateApproved(childBId, IDS.choreToys, 1)
    await backdateApproved(childBId, IDS.choreToys, 2)

    const id = await submit(childBRef, IDS.choreToys)
    await approveAs(parentRef, id)

    const after = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childBId } })
    expect(after.currentStreak).toBe(3)
  })

  it('does not count across a missed day', async () => {
    const { childBId, childBRef, parentRef } = await getRefs()
    await backdateApproved(childBId, IDS.choreToys, 2) // yesterday is missing
    await backdateApproved(childBId, IDS.choreToys, 3)

    const id = await submit(childBRef, IDS.choreToys)
    await approveAs(parentRef, id)

    const after = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childBId } })
    expect(after.currentStreak).toBe(1)
    // The broken 2-day run is still the child's record if it beat the old one.
    expect(after.longestStreak).toBe(5)
  })

  it('a lapsed streak reads as 0 even though the stored row still says otherwise', async () => {
    const { childBId, parentRef } = await getRefs()
    // A row left behind by an approval three days ago: nothing has written to
    // it since, so only the read path can put the flame out.
    await prisma.userProgress.update({
      where: { userId: childBId },
      data: { currentStreak: 4, lastActiveDate: new Date(Date.now() - 3 * DAY_MS) },
    })

    const res = await getProgress(
      new Request(`http://t/api/progress?user=${childBId}`, { headers: agentHeaders(parentRef) }),
    )
    expect((await res.json()).data.streak).toBe(0)
  })

  it('undoing the only approval of the day takes the day back', async () => {
    const { childBId, childBRef, parentRef } = await getRefs()

    const id = await submit(childBRef, IDS.choreToys)
    await approveAs(parentRef, id)
    expect(
      (await prisma.userProgress.findUniqueOrThrow({ where: { userId: childBId } })).currentStreak,
    ).toBe(1)

    const undone = await unapprove(
      new Request(`http://t/api/completions/${id}/unapprove`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
        body: jsonBody({}),
      }),
      { params: { id } },
    )
    expect((await undone.json()).ok).toBe(true)

    const after = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childBId } })
    expect(after.currentStreak).toBe(0)
  })
})

describe('A-STREAK-3 — a weekly chore is done for the week, not just the day', () => {
  it('pendingTodayChores agrees with GET /api/chores/today about weekly chores', async () => {
    const { childBId, familyId } = await getRefs()

    // A Saturday, and the Thursday of the same week index. Asserted rather than
    // assumed, so a change to the week boundary fails loudly here.
    const now = new Date('2026-08-08T10:00:00Z')
    const earlier = new Date('2026-08-06T10:00:00Z')
    expect(localWeekNumber(earlier, THAI_LOCAL_OFFSET_MS)).toBe(
      localWeekNumber(now, THAI_LOCAL_OFFSET_MS),
    )
    expect(localDayNumber(earlier, THAI_LOCAL_OFFSET_MS)).toBeLessThan(
      localDayNumber(now, THAI_LOCAL_OFFSET_MS),
    )

    const weekly = await prisma.chore.create({
      data: {
        title: 'ท่องคำศัพท์',
        familyId,
        assignedTo: childBId,
        xpValue: 20,
        recurrence: 'weekly',
        requirePhoto: false,
        isExtra: false,
      },
    })
    await prisma.choreCompletion.create({
      data: {
        choreId: weekly.id,
        completedBy: childBId,
        status: 'approved',
        submittedAt: earlier,
        reviewedAt: earlier,
        xpAwarded: 20,
      },
    })

    const pending = await pendingTodayChores(familyId, childBId, { now: () => now })
    // Done on Thursday ⇒ done for the week. Counting it as still-outstanding is
    // what made "the child finished today" impossible to ever satisfy.
    expect(pending.map((c) => c.id)).not.toContain(weekly.id)
  })
})

describe('local day boundary', () => {
  it('an early-morning chore counts for the morning it happened', async () => {
    // 06:00 in Thailand is still "yesterday" in UTC — the streak must not
    // credit the previous day for a chore the child did this morning.
    const sixAm = new Date('2026-08-03T23:00:00Z')
    const sameEvening = new Date('2026-08-04T13:00:00Z')
    expect(localDayNumber(sixAm, THAI_LOCAL_OFFSET_MS)).toBe(
      localDayNumber(sameEvening, THAI_LOCAL_OFFSET_MS),
    )
  })
})
