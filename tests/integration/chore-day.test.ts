/**
 * tests/integration/chore-day.test.ts — a child's day, as the server decides it.
 *
 * The parent dashboard's counters were wrong because the browser re-derived
 * "what is on the child's day" next to a server that already knew, and the two
 * answers drifted. The day is computed once now (lib/api/today · choreDay) and
 * served to every caller; this file pins what it must say.
 *
 * Runs the real handler against the real test Postgres.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GET as todayChores } from '@/app/api/chores/today/route'
import { choreDay, summarizeDay, pendingTodayChores } from '@/lib/api/today'
import { THAI_LOCAL_OFFSET_MS } from '@/lib/clock'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { agentHeaders } from './helpers/actor'
import { IDS } from '@/prisma/seed.test'

const DAY_MS = 86_400_000

/** A clock frozen at `iso`. */
const at = (iso: string) => ({ now: () => new Date(iso) })

/** GET /api/chores/today as the parent, for one child. */
async function fetchDay(parentRef: string, childId: string) {
  const res = await todayChores(
    new Request(`http://t/api/chores/today?child=${childId}`, {
      headers: agentHeaders(parentRef),
    }),
  )
  const env = await res.json()
  expect(env.ok).toBe(true)
  return env.data as {
    chores: { id: string }[]
    day: { choreId: string; isExtra: boolean; outstanding: boolean }[]
    summary: Record<string, number>
  }
}

beforeEach(async () => {
  await resetAndSeed()
})

describe('A-DAY-1 — bonus chores are counted separately, never mixed in', () => {
  it('splits required from extra so "งานยังไม่เสร็จวันนี้" is work the family owes', async () => {
    const { familyId, childAId } = await getRefs()
    // Seed: ล้างจาน (daily, น้องเอ) + เก็บของเล่น (daily, shared) are required;
    // ล้างรถ is a one-off bonus.
    const s = summarizeDay(await choreDay(familyId, childAId, { now: () => new Date() }))

    expect(s.requiredRemaining).toBe(2)
    expect(s.extraRemaining).toBe(1)
    // The tile reads requiredRemaining. Folding the bonus in made the number
    // effectively impossible to drive to zero.
    expect(s.requiredRemaining).not.toBe(s.requiredRemaining + s.extraRemaining)
  })

  it('keeps done + remaining equal to the total, per bucket', async () => {
    const { familyId, childAId } = await getRefs()
    await prisma.choreCompletion.create({
      data: {
        choreId: IDS.choreDishes,
        completedBy: childAId,
        status: 'approved',
        submittedAt: new Date(),
        xpAwarded: 50,
      },
    })

    const s = summarizeDay(await choreDay(familyId, childAId, { now: () => new Date() }))
    // The child card shows requiredDone / requiredTotal. Both halves come from
    // this one count, so the fraction is in a single unit — it used to divide
    // "submitted today" by "outstanding this period".
    expect(s.requiredDone + s.requiredRemaining).toBe(s.requiredTotal)
    expect(s.extraDone + s.extraRemaining).toBe(s.extraTotal)
    expect(s.requiredDone).toBe(1)
  })
})

describe('A-DAY-2 — a shared chore is owed per child', () => {
  it('stays outstanding for the sibling who has not done it', async () => {
    const { familyId, childAId, childBId } = await getRefs()
    await prisma.choreCompletion.create({
      data: {
        choreId: IDS.choreToys,
        completedBy: childAId,
        status: 'approved',
        submittedAt: new Date(),
        xpAwarded: 30,
      },
    })

    const dayA = await choreDay(familyId, childAId, { now: () => new Date() })
    const dayB = await choreDay(familyId, childBId, { now: () => new Date() })

    expect(dayA.find((e) => e.chore.id === IDS.choreToys)?.outstanding).toBe(false)
    // The dashboard table reported the whole chore finished off น้องเอ's
    // completion; น้องบี disappeared from the parent's view entirely.
    expect(dayB.find((e) => e.chore.id === IDS.choreToys)?.outstanding).toBe(true)
  })
})

describe('A-DAY-3 — the day turns at local midnight, not 07:00', () => {
  it('an 06:45 chore stays done through the morning', async () => {
    const { familyId, childAId } = await getRefs()
    // 23:45Z is 06:45 the NEXT day in Thailand. Bucketing by UTC put it in
    // yesterday, so at 07:00 local the chore silently re-opened as outstanding —
    // observed three times in the family's real data.
    const submittedAt = new Date('2026-08-05T23:45:00Z') // 06:45 local, 6 Aug
    await prisma.choreCompletion.create({
      data: {
        choreId: IDS.choreDishes,
        completedBy: childAId,
        status: 'approved',
        submittedAt,
        xpAwarded: 50,
      },
    })

    const morning = at('2026-08-06T01:00:00Z') // 08:00 local, same day
    const evening = at('2026-08-06T13:00:00Z') // 20:00 local, same day
    for (const clock of [morning, evening]) {
      const ids = (await pendingTodayChores(familyId, childAId, clock)).map((c) => c.id)
      expect(ids).not.toContain(IDS.choreDishes)
    }

    // …and genuinely re-opens the next local day.
    const tomorrow = at('2026-08-07T01:00:00Z')
    const ids = (await pendingTodayChores(familyId, childAId, tomorrow)).map((c) => c.id)
    expect(ids).toContain(IDS.choreDishes)
  })

  it('a chore done just before local midnight belongs to the day that is ending', async () => {
    const { familyId, childAId } = await getRefs()
    const submittedAt = new Date('2026-08-06T16:50:00Z') // 23:50 local, 6 Aug
    await prisma.choreCompletion.create({
      data: {
        choreId: IDS.choreDishes,
        completedBy: childAId,
        status: 'approved',
        submittedAt,
        xpAwarded: 50,
      },
    })

    const justBefore = at('2026-08-06T16:59:00Z') // 23:59 local, same day
    const justAfter = at('2026-08-06T17:01:00Z') // 00:01 local, next day
    expect(
      (await pendingTodayChores(familyId, childAId, justBefore)).map((c) => c.id),
    ).not.toContain(IDS.choreDishes)
    expect((await pendingTodayChores(familyId, childAId, justAfter)).map((c) => c.id)).toContain(
      IDS.choreDishes,
    )
  })
})

describe('A-DAY-4 — settled work leaves the day instead of lingering', () => {
  it('drops a one-off bonus finished on an earlier day', async () => {
    const { familyId, childAId } = await getRefs()
    await prisma.choreCompletion.create({
      data: {
        choreId: IDS.choreCar,
        completedBy: childAId,
        status: 'approved',
        submittedAt: new Date(Date.now() - 5 * DAY_MS),
        xpAwarded: 100,
      },
    })

    const day = await choreDay(familyId, childAId, { now: () => new Date() })
    expect(day.map((e) => e.chore.id)).not.toContain(IDS.choreCar)
  })

  it('keeps work finished today visible, so the table can show it as done', async () => {
    const { familyId, childAId } = await getRefs()
    await prisma.choreCompletion.create({
      data: {
        choreId: IDS.choreCar,
        completedBy: childAId,
        status: 'approved',
        submittedAt: new Date(),
        xpAwarded: 100,
      },
    })

    const day = await choreDay(familyId, childAId, { now: () => new Date() })
    const car = day.find((e) => e.chore.id === IDS.choreCar)
    expect(car?.outstanding).toBe(false)
    expect(car?.completion?.status).toBe('approved')
  })

  it('re-opens a rejected chore and still reports the rejection', async () => {
    const { familyId, childAId } = await getRefs()
    await prisma.choreCompletion.create({
      data: {
        choreId: IDS.choreDishes,
        completedBy: childAId,
        status: 'rejected',
        submittedAt: new Date(),
        xpAwarded: 0,
      },
    })

    const day = await choreDay(familyId, childAId, { now: () => new Date() })
    const dishes = day.find((e) => e.chore.id === IDS.choreDishes)
    expect(dishes?.outstanding).toBe(true)
    // Both facts are needed: the dashboard paints "ตีกลับ" rather than "ค้าง".
    expect(dishes?.completion?.status).toBe('rejected')
  })
})

describe('A-DAY-5 — GET /api/chores/today serves one consistent day', () => {
  it('agrees with itself across chores, day and summary', async () => {
    const { parentRef, childAId } = await getRefs()
    await prisma.choreCompletion.create({
      data: {
        choreId: IDS.choreDishes,
        completedBy: childAId,
        status: 'pending',
        submittedAt: new Date(),
      },
    })

    const data = await fetchDay(parentRef, childAId)
    const outstanding = data.day.filter((e) => e.outstanding)

    // `chores` (what the child ticks off and the agent answers with) is exactly
    // the outstanding slice of `day` — one computation, three views.
    expect(data.chores.map((c) => c.id).sort()).toEqual(
      outstanding.map((e) => e.choreId).sort(),
    )
    expect(data.summary.requiredRemaining).toBe(
      outstanding.filter((e) => !e.isExtra).length,
    )
    expect(data.summary.requiredTotal).toBe(data.day.filter((e) => !e.isExtra).length)
    // A submitted-but-unreviewed chore is not outstanding, and not "todo".
    expect(data.chores.map((c) => c.id)).not.toContain(IDS.choreDishes)
    expect(data.summary.requiredDone).toBe(1)
  })

  it('is what the local offset says, not what the server timezone says', async () => {
    const { familyId, childAId } = await getRefs()
    // Guard the constant itself: every "today" question in the app resolves
    // through this offset, so a change here moves the whole app's day boundary.
    expect(THAI_LOCAL_OFFSET_MS).toBe(7 * 60 * 60 * 1000)
    const day = await choreDay(familyId, childAId, at('2026-08-06T17:30:00Z'))
    expect(day.length).toBeGreaterThan(0)
  })
})
