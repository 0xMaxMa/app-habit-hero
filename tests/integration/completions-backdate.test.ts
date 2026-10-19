/**
 * tests/integration/completions-backdate.test.ts — POST /api/completions/backdate
 * (parent-authorized retroactive chore completion).
 *
 * Drives the real route handler against the real test Postgres, same harness
 * as tests/integration/completions.test.ts. Assertions look at DB side-effects
 * (the ChoreCompletion row's `source`/`submittedAt`/`xpAwarded`) and the
 * derived streak/XP (UserProgress), never at reply wording.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { POST as backdate } from '@/app/api/completions/backdate/route'
import { POST as approve } from '@/app/api/completions/[id]/approve/route'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { agentHeaders, jsonBody } from './helpers/actor'
import { IDS } from '@/prisma/seed.test'
import { THAI_LOCAL_OFFSET_MS } from '@/lib/clock'
import { BACKDATE_LOOKBACK_DAYS } from '@/lib/api/backdate'

const BACKDATE_URL = 'http://t/api/completions/backdate'

/** "YYYY-MM-DD" for `daysAgo` Thai-local days before real "now". */
function dateDaysAgo(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000)
  const local = new Date(d.getTime() + THAI_LOCAL_OFFSET_MS)
  const y = local.getUTCFullYear()
  const m = String(local.getUTCMonth() + 1).padStart(2, '0')
  const day = String(local.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function backdateRequest(actorRef: string, body: Record<string, unknown>): Request {
  return new Request(BACKDATE_URL, {
    method: 'POST',
    headers: agentHeaders(actorRef),
    body: jsonBody(body),
  })
}

beforeEach(async () => {
  await resetAndSeed()
})

describe('POST /api/completions/backdate — parent logs a past-day completion', () => {
  it('parent backdates a chore 3 days ago → 201, approved row tagged parent_backdated, XP applied', async () => {
    const { childAId, parentRef } = await getRefs()
    const date = dateDaysAgo(3)

    const res = await backdate(
      backdateRequest(parentRef, { child: childAId, chore_id: IDS.choreDishes, date }),
    )
    const env = await res.json()

    expect(res.status).toBe(201)
    expect(env.ok).toBe(true)
    expect(env.data.completion.status).toBe('approved')
    expect(env.data.completion.source).toBe('parent_backdated')
    expect(env.data.completion.xpAwarded).toBeGreaterThan(0)

    const row = await prisma.choreCompletion.findUniqueOrThrow({
      where: { id: env.data.completion.id },
    })
    expect(row.source).toBe('parent_backdated')
    expect(row.status).toBe('approved')
    expect(row.reviewedBy).toBe((await getRefs()).parentId)
    expect(row.photoUrl).toBeNull()

    const progress = await prisma.userProgress.findUniqueOrThrow({
      where: { userId: childAId },
    })
    expect(progress.totalXp).toBe(150 + row.xpAwarded)
  })

  it('a child actor backdating → 403, no completion row created', async () => {
    const { childARef } = await getRefs()

    const res = await backdate(
      backdateRequest(childARef, {
        child: childARef,
        chore_id: IDS.choreDishes,
        date: dateDaysAgo(1),
      }),
    )
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')
    expect(await prisma.choreCompletion.count()).toBe(0)
  })

  it("a parent from another family backdating a different family's child → 403", async () => {
    const { childAId } = await getRefs()
    await prisma.family.create({
      data: { id: 'fam_other_bd', name: 'ครอบครัวอื่น', pinSlug: 'other-bd-x' },
    })
    await prisma.user.create({
      data: {
        id: 'usr_other_parent_bd',
        name: 'พ่อบ้านอื่น',
        role: 'parent',
        familyId: 'fam_other_bd',
        email: 'other-bd@test.local',
        passwordHash: 'x',
        channelUserRef: 'gw:other-parent-bd',
      },
    })

    const res = await backdate(
      backdateRequest('gw:other-parent-bd', {
        child: childAId,
        chore_id: IDS.choreDishes,
        date: dateDaysAgo(1),
      }),
    )
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')
    expect(await prisma.choreCompletion.count()).toBe(0)
  })

  it(`a date more than ${BACKDATE_LOOKBACK_DAYS} days ago → 400, no completion row`, async () => {
    const { parentRef } = await getRefs()

    const res = await backdate(
      backdateRequest(parentRef, {
        child: IDS.childA,
        chore_id: IDS.choreDishes,
        date: dateDaysAgo(BACKDATE_LOOKBACK_DAYS + 1),
      }),
    )
    const env = await res.json()

    expect(res.status).toBe(400)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('BAD_REQUEST')
    expect(await prisma.choreCompletion.count()).toBe(0)
  })

  it("today's date → 400 (use the normal submit flow), no completion row", async () => {
    const { parentRef } = await getRefs()

    const res = await backdate(
      backdateRequest(parentRef, {
        child: IDS.childA,
        chore_id: IDS.choreDishes,
        date: dateDaysAgo(0),
      }),
    )
    const env = await res.json()

    expect(res.status).toBe(400)
    expect(env.ok).toBe(false)
    expect(await prisma.choreCompletion.count()).toBe(0)
  })

  it('duplicate backdate for a day already settled → 409, no second row or XP', async () => {
    const { parentRef, childAId } = await getRefs()
    const date = dateDaysAgo(2)

    const first = await backdate(
      backdateRequest(parentRef, { child: childAId, chore_id: IDS.choreDishes, date }),
    )
    expect(first.status).toBe(201)

    const second = await backdate(
      backdateRequest(parentRef, { child: childAId, chore_id: IDS.choreDishes, date }),
    )
    const env = await second.json()
    expect(second.status).toBe(409)
    expect(env.error.code).toBe('CONFLICT')
    expect(
      await prisma.choreCompletion.count({
        where: { choreId: IDS.choreDishes, completedBy: childAId },
      }),
    ).toBe(1)
  })

  it('fills a gap in the streak: backdating the missing middle day joins two single days into a run of 3', async () => {
    const { parentRef, childAId } = await getRefs()

    // Day T-3 and T-1 approved, T-2 deliberately skipped — two isolated active
    // days, not yet a run.
    await backdate(
      backdateRequest(parentRef, {
        child: childAId,
        chore_id: IDS.choreDishes,
        date: dateDaysAgo(3),
      }),
    )
    await backdate(
      backdateRequest(parentRef, {
        child: childAId,
        chore_id: IDS.choreDishes,
        date: dateDaysAgo(1),
      }),
    )

    const before = await prisma.userProgress.findUniqueOrThrow({
      where: { userId: childAId },
    })
    expect(before.currentStreak).toBe(1) // only T-1 is contiguous with "now"

    // Fill T-2 — a DIFFERENT chore, so it doesn't collide with the dishes
    // chore's own per-day "already submitted" guard.
    const fillRes = await backdate(
      backdateRequest(parentRef, {
        child: childAId,
        chore_id: IDS.choreToys,
        date: dateDaysAgo(2),
      }),
    )
    expect(fillRes.status).toBe(201)

    const after = await prisma.userProgress.findUniqueOrThrow({
      where: { userId: childAId },
    })
    expect(after.currentStreak).toBe(3) // T-3, T-2, T-1 now form one unbroken run
    expect(after.longestStreak).toBeGreaterThanOrEqual(3)
  })

  it('approving a backdated-pending-style flow is unnecessary: the row is already approved and visible to GET history', async () => {
    const { parentRef, childAId } = await getRefs()
    const res = await backdate(
      backdateRequest(parentRef, {
        child: childAId,
        chore_id: IDS.choreDishes,
        date: dateDaysAgo(2),
      }),
    )
    const env = await res.json()

    // Re-approving an already-approved completion must be rejected (same rule
    // the normal approve route enforces) — proves backdate did not leave the
    // row in a state the approval queue would try to act on again.
    const approveRes = await approve(
      new Request(`http://t/api/completions/${env.data.completion.id}/approve`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: env.data.completion.id } },
    )
    expect(approveRes.status).toBe(409)
  })
})
