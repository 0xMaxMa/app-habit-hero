/**
 * tests/integration/submit-guards.test.ts — what POST /api/completions and
 * POST /api/redemptions refuse, and what they deliberately still allow.
 *
 * Two guards that were missing, and one absence that is on purpose:
 *
 *   • the same chore could be handed in twice in a day and, once a parent
 *     approved both, pay out twice — while every list in the app said it was
 *     done. The guard now shares `inCurrentPeriod` with those lists.
 *   • a reward's "2/วัน" limit was stored, editable and printed on the card,
 *     but nothing counted against it.
 *   • submitting OUT OF SCHEDULE stays allowed: the agent must be able to
 *     record work after the fact, so an expired window or a weekday the chore
 *     does not recur on is not a reason to refuse.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { promises as fs } from 'node:fs'
import { prisma, resetAndSeed, getRefs, type Refs } from './helpers/db'
import { AGENT_TOKEN } from './helpers/actor'
import { THAI_LOCAL_OFFSET_MS } from '@/lib/clock'
import { POST as submit } from '@/app/api/completions/route'
import { POST as approve } from '@/app/api/completions/[id]/approve/route'
import { POST as redeem } from '@/app/api/redemptions/route'

let R: Refs

beforeEach(async () => {
  await resetAndSeed()
  R = await getRefs()
})

function submitReq(choreId: string, extra?: Record<string, string>) {
  const fd = new FormData()
  fd.set('child', R.childARef)
  fd.set('chore_id', choreId)
  fd.set('photo', new File([Buffer.from('x'.repeat(64))], 'p.jpg', { type: 'image/jpeg' }))
  for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v)
  return new Request('http://t/api/completions', {
    method: 'POST',
    headers: { 'x-agent-token': AGENT_TOKEN, 'x-actor-ref': R.childARef },
    body: fd,
  })
}

function dailyChore() {
  return prisma.chore.findFirstOrThrow({
    where: { familyId: R.familyId, recurrence: 'daily' },
  })
}

describe('duplicate submissions', () => {
  it('refuses a second submission while the first is still waiting to be reviewed', async () => {
    const chore = await dailyChore()
    expect((await submit(submitReq(chore.id))).status).toBe(201)

    const second = await submit(submitReq(chore.id))
    expect(second.status).toBe(409)
    const body = await second.json()
    expect(body.error.code).toBe('CONFLICT')
    expect(body.error.reason).toBe('ALREADY_SUBMITTED')
    expect(body.error.completionStatus).toBe('pending')

    expect(
      await prisma.choreCompletion.count({ where: { choreId: chore.id, completedBy: R.childAId } }),
    ).toBe(1)
  })

  it('refuses a second submission after the first was approved — no double XP', async () => {
    const chore = await dailyChore()
    const first = await submit(submitReq(chore.id))
    const { id } = (await first.json()).data.completion

    const approved = await approve(
      new Request(`http://t/api/completions/${id}/approve`, {
        method: 'POST',
        headers: {
          'x-agent-token': AGENT_TOKEN,
          'x-actor-ref': R.parentRef,
          'content-type': 'application/json',
        },
        body: '{}',
      }),
      { params: { id } },
    )
    expect(approved.status).toBe(200)

    expect((await submit(submitReq(chore.id))).status).toBe(409)
    const paid = await prisma.choreCompletion.aggregate({
      where: { choreId: chore.id, completedBy: R.childAId, status: 'approved' },
      _sum: { xpAwarded: true },
    })
    expect(paid._sum.xpAwarded).toBe(chore.xpValue)
  })

  it('lets the child try again after a rejection', async () => {
    const chore = await dailyChore()
    const first = await submit(submitReq(chore.id))
    const { id } = (await first.json()).data.completion
    await prisma.choreCompletion.update({ where: { id }, data: { status: 'rejected' } })

    expect((await submit(submitReq(chore.id))).status).toBe(201)
  })

  it('allows a deliberate duplicate when the caller asks for one', async () => {
    // The escape hatch for recording a second, genuinely separate run of the
    // chore — or a backdated one — from the agent.
    const chore = await dailyChore()
    expect((await submit(submitReq(chore.id))).status).toBe(201)
    expect((await submit(submitReq(chore.id, { allow_duplicate: 'true' }))).status).toBe(201)
    expect(
      await prisma.choreCompletion.count({ where: { choreId: chore.id, completedBy: R.childAId } }),
    ).toBe(2)
  })

  it('scopes the guard to the period: a weekly chore blocks for the week, a daily one for the day', async () => {
    const chore = await dailyChore()
    await prisma.chore.update({
      where: { id: chore.id },
      data: { recurrence: 'weekly', recurDays: [] },
    })
    expect((await submit(submitReq(chore.id))).status).toBe(201)
    expect((await submit(submitReq(chore.id))).status).toBe(409)

    // Move the first submission into last week — the chore is open again.
    await prisma.choreCompletion.updateMany({
      where: { choreId: chore.id },
      data: { submittedAt: new Date(Date.now() - 8 * 86_400_000) },
    })
    expect((await submit(submitReq(chore.id))).status).toBe(201)
  })
})

describe('submitting out of schedule stays allowed', () => {
  it('accepts a chore whose active window has closed', async () => {
    const chore = await dailyChore()
    await prisma.chore.update({
      where: { id: chore.id },
      data: {
        activeFrom: new Date('2020-01-01T00:00:00.000Z'),
        activeUntil: new Date('2020-02-01T00:00:00.000Z'),
      },
    })
    expect((await submit(submitReq(chore.id))).status).toBe(201)
  })

  it('accepts a weekly chore on a weekday it does not run', async () => {
    const chore = await dailyChore()
    const today = new Date(Date.now() + THAI_LOCAL_OFFSET_MS).getUTCDay()
    await prisma.chore.update({
      where: { id: chore.id },
      data: { recurrence: 'weekly', recurDays: [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== today) },
    })
    expect((await submit(submitReq(chore.id))).status).toBe(201)
  })
})

describe('orphaned uploads', () => {
  it('removes the photo when the completion row cannot be written', async () => {
    const dir = process.env.PHOTO_DIR as string
    await fs.mkdir(dir, { recursive: true })
    const before = new Set(await fs.readdir(dir))

    const chore = await dailyChore()
    const create = prisma.choreCompletion.create
    let status = 0
    try {
      // @ts-expect-error deliberate test double
      prisma.choreCompletion.create = async () => {
        throw Object.assign(new Error('insert failed'), { code: 'P2003' })
      }
      status = (await submit(submitReq(chore.id))).status
    } finally {
      prisma.choreCompletion.create = create
    }

    expect(status).toBeGreaterThanOrEqual(500)
    const after = await fs.readdir(dir)
    expect(after.filter((f) => !before.has(f))).toEqual([])
  })
})

describe('reward limits', () => {
  async function makeReward(limits: Partial<Record<'dailyLimit' | 'weeklyLimit' | 'monthlyLimit', number>>) {
    return prisma.reward.create({
      data: { familyId: R.familyId, title: 'เล่นเกม 1 ชม.', xpCost: 10, isActive: true, ...limits },
    })
  }
  function redeemReq(rewardId: string) {
    return new Request('http://t/api/redemptions', {
      method: 'POST',
      headers: {
        'x-agent-token': AGENT_TOKEN,
        'x-actor-ref': R.childARef,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ rewardId }),
    })
  }

  it('stops the child at the daily limit the card advertises', async () => {
    const reward = await makeReward({ dailyLimit: 2 })
    expect((await redeem(redeemReq(reward.id))).status).toBe(201)
    expect((await redeem(redeemReq(reward.id))).status).toBe(201)

    const third = await redeem(redeemReq(reward.id))
    expect(third.status).toBe(409)
    const body = await third.json()
    expect(body.error.code).toBe('CONFLICT')
    expect(body.error.reason).toBe('REDEMPTION_LIMIT_REACHED')
    expect(body.error.unit).toBe('day')
    expect(body.error.limit).toBe(2)
  })

  it('counts a still-pending request against the limit', async () => {
    // Otherwise a child could queue several and a parent approve past the cap.
    const reward = await makeReward({ dailyLimit: 1 })
    expect((await redeem(redeemReq(reward.id))).status).toBe(201)
    expect(
      await prisma.rewardRedemption.count({ where: { rewardId: reward.id, status: 'pending' } }),
    ).toBe(1)
    expect((await redeem(redeemReq(reward.id))).status).toBe(409)
  })

  it('does not count a rejected request — it was never granted', async () => {
    const reward = await makeReward({ dailyLimit: 1 })
    const first = await redeem(redeemReq(reward.id))
    const { id } = (await first.json()).data.redemption
    await prisma.rewardRedemption.update({ where: { id }, data: { status: 'rejected' } })

    expect((await redeem(redeemReq(reward.id))).status).toBe(201)
  })

  it('reports the weekly limit and when it lifts', async () => {
    const reward = await makeReward({ weeklyLimit: 1 })
    await redeem(redeemReq(reward.id))
    const blocked = await redeem(redeemReq(reward.id))
    expect(blocked.status).toBe(409)
    const details = (await blocked.json()).error
    expect(details.unit).toBe('week')
    expect(new Date(details.resetsAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('leaves a reward with no limits unrestricted', async () => {
    const reward = await makeReward({})
    for (let i = 0; i < 4; i++) {
      expect((await redeem(redeemReq(reward.id))).status).toBe(201)
    }
  })

  it('counts limits per child, not per family', async () => {
    const reward = await makeReward({ dailyLimit: 1 })
    expect((await redeem(redeemReq(reward.id))).status).toBe(201)

    const sibling = new Request('http://t/api/redemptions', {
      method: 'POST',
      headers: {
        'x-agent-token': AGENT_TOKEN,
        'x-actor-ref': R.childBRef,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ rewardId: reward.id }),
    })
    expect((await redeem(sibling)).status).toBe(201)
  })
})
