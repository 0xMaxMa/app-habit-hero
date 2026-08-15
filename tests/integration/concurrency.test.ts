/**
 * tests/integration/concurrency.test.ts — two writers, one child.
 *
 * Every XP path used to be a read-modify-write of an ABSOLUTE total: read
 * `totalXp`, add in memory, write the sum back. Two requests overlapping (a
 * parent approving two chores in one tap-tap, the agent approving while the
 * parent does) both read the same "before" value and the second write erased
 * the first — XP the child had visibly earned simply vanished, and no request
 * failed to say so.
 *
 * The badge insert had the mirror problem: two overlapping approvals both
 * decided the same badge was newly earned and raced on the same unique row, so
 * one request died as a bare 500 in the parent's face.
 *
 * These tests fire the real route handlers concurrently and assert on the
 * PERSISTED result, which is the only place the loss was ever visible.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { prisma, resetAndSeed, getRefs, type Refs } from './helpers/db'
import { AGENT_TOKEN } from './helpers/actor'
import { applyGamification } from '@/lib/api/gamification'
import { systemClock } from '@/lib/clock'
import { POST as approveCompletion } from '@/app/api/completions/[id]/approve/route'
import { POST as approveRedemption } from '@/app/api/redemptions/[id]/approve/route'

let R: Refs

beforeEach(async () => {
  await resetAndSeed()
  R = await getRefs()
})

function parentPost(url: string) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'x-agent-token': AGENT_TOKEN,
      'x-actor-ref': R.parentRef,
      'content-type': 'application/json',
    },
    body: '{}',
  })
}

async function totalXpOf(userId: string): Promise<number> {
  return (await prisma.userProgress.findUnique({ where: { userId } }))?.totalXp ?? 0
}

describe('concurrent XP awards', () => {
  it('adds both, rather than letting the later write erase the earlier', async () => {
    const before = await totalXpOf(R.childAId)

    await Promise.all([
      applyGamification({
        userId: R.childAId,
        xpDelta: 50,
        allChoresDoneBeforeNoon: false,
        clock: systemClock,
      }),
      applyGamification({
        userId: R.childAId,
        xpDelta: 50,
        allChoresDoneBeforeNoon: false,
        clock: systemClock,
      }),
    ])

    expect(await totalXpOf(R.childAId)).toBe(before + 100)
  })

  it('approving two chores at once awards both and never 500s', async () => {
    const chores = await prisma.chore.findMany({
      where: { familyId: R.familyId, recurrence: 'daily' },
      take: 2,
    })
    expect(chores).toHaveLength(2)
    const before = await totalXpOf(R.childAId)

    const made = await Promise.all(
      chores.map((c) =>
        prisma.choreCompletion.create({
          data: { choreId: c.id, completedBy: R.childAId, status: 'pending' },
        }),
      ),
    )

    const results = await Promise.all(
      made.map((m) =>
        approveCompletion(parentPost(`http://t/api/completions/${m.id}/approve`), {
          params: { id: m.id },
        }),
      ),
    )
    // The badge upsert used to race itself and surface as a bare 500.
    expect(results.map((r) => r.status)).toEqual([200, 200])

    const granted = await prisma.choreCompletion.aggregate({
      where: { id: { in: made.map((m) => m.id) } },
      _sum: { xpAwarded: true },
    })
    // What the child was told they earned is what they actually have.
    expect(await totalXpOf(R.childAId)).toBe(before + (granted._sum.xpAwarded ?? 0))
  })
})

describe('concurrent redemption approvals', () => {
  it('refuses the second when the child can only afford one', async () => {
    const balance = await totalXpOf(R.childAId)
    expect(balance).toBeGreaterThan(0)
    // Two of these cost more than the child has.
    const cost = Math.floor(balance * 0.75)
    const reward = await prisma.reward.create({
      data: { familyId: R.familyId, title: 'ของแพง', xpCost: cost, isActive: true },
    })
    const made = await Promise.all(
      [0, 1].map(() =>
        prisma.rewardRedemption.create({
          data: {
            rewardId: reward.id,
            redeemedBy: R.childAId,
            xpSpent: cost,
            status: 'pending',
          },
        }),
      ),
    )

    const results = await Promise.all(
      made.map((m) =>
        approveRedemption(parentPost(`http://t/api/redemptions/${m.id}/approve`), {
          params: { id: m.id },
        }),
      ),
    )

    const codes = results.map((r) => r.status).sort()
    expect(codes).toEqual([200, 409])
    expect(
      await prisma.rewardRedemption.count({ where: { rewardId: reward.id, status: 'approved' } }),
    ).toBe(1)
    // Exactly one deduction landed — no free reward, no double charge.
    expect(await totalXpOf(R.childAId)).toBe(balance - cost)
  })

  it('deducts both when the child can afford both', async () => {
    const balance = await totalXpOf(R.childAId)
    const cost = Math.floor(balance / 4)
    const reward = await prisma.reward.create({
      data: { familyId: R.familyId, title: 'ของถูก', xpCost: cost, isActive: true },
    })
    const made = await Promise.all(
      [0, 1].map(() =>
        prisma.rewardRedemption.create({
          data: {
            rewardId: reward.id,
            redeemedBy: R.childAId,
            xpSpent: cost,
            status: 'pending',
          },
        }),
      ),
    )

    const results = await Promise.all(
      made.map((m) =>
        approveRedemption(parentPost(`http://t/api/redemptions/${m.id}/approve`), {
          params: { id: m.id },
        }),
      ),
    )
    expect(results.map((r) => r.status)).toEqual([200, 200])
    expect(await totalXpOf(R.childAId)).toBe(balance - cost * 2)
  })
})
