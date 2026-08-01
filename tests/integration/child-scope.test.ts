/**
 * tests/integration/child-scope.test.ts — a child may only ever read their OWN
 * redemption requests and chore-completion history, never a sibling's, while a
 * parent still sees the whole family. Covers the self-scoping added to
 * GET /api/redemptions and GET /api/completions (T30).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GET as redemptionsGet } from '@/app/api/redemptions/route'
import { GET as completionsGet } from '@/app/api/completions/route'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { agentHeaders } from './helpers/actor'

const ORIGIN = 'http://t'

function getReq(url: string, actorRef: string): Request {
  return new Request(url, { method: 'GET', headers: agentHeaders(actorRef) })
}

beforeEach(async () => {
  await resetAndSeed()
})

describe('GET /api/redemptions — child self-scope', () => {
  beforeEach(async () => {
    const { familyId, childAId, childBId } = await getRefs()
    const reward = await prisma.reward.create({
      data: { familyId, title: 'ของรางวัล', xpCost: 10, isActive: true },
    })
    await prisma.rewardRedemption.createMany({
      data: [
        { rewardId: reward.id, redeemedBy: childAId, xpSpent: 10, status: 'pending' },
        { rewardId: reward.id, redeemedBy: childBId, xpSpent: 10, status: 'pending' },
      ],
    })
  })

  it('a child sees only their own requests', async () => {
    const { childARef, childAId } = await getRefs()
    const res = await redemptionsGet(getReq(`${ORIGIN}/api/redemptions`, childARef))
    expect(res.status).toBe(200)
    const list = (await res.json()).data.redemptions as { redeemedBy: string }[]
    expect(list.length).toBe(1)
    expect(list.every((r) => r.redeemedBy === childAId)).toBe(true)
  })

  it('a parent sees the whole family', async () => {
    const { parentRef } = await getRefs()
    const res = await redemptionsGet(getReq(`${ORIGIN}/api/redemptions`, parentRef))
    const list = (await res.json()).data.redemptions as unknown[]
    expect(list.length).toBe(2)
  })
})

describe('GET /api/completions — child self-scope', () => {
  beforeEach(async () => {
    const { childAId, childBId } = await getRefs()
    const chore = await prisma.chore.findFirstOrThrow()
    await prisma.choreCompletion.createMany({
      data: [
        { choreId: chore.id, completedBy: childAId, status: 'pending' },
        { choreId: chore.id, completedBy: childBId, status: 'pending' },
      ],
    })
  })

  it('a child (no filter) sees only their own completions', async () => {
    const { childARef, childAId } = await getRefs()
    const res = await completionsGet(getReq(`${ORIGIN}/api/completions`, childARef))
    expect(res.status).toBe(200)
    const list = (await res.json()).data.completions as { child: { id: string } }[]
    expect(list.length).toBe(1)
    expect(list.every((c) => c.child.id === childAId)).toBe(true)
  })

  it("a child cannot read a sibling's history (403)", async () => {
    const { childARef, childBId } = await getRefs()
    const res = await completionsGet(
      getReq(`${ORIGIN}/api/completions?child=${childBId}`, childARef),
    )
    expect(res.status).toBe(403)
  })

  it('a parent sees every child', async () => {
    const { parentRef } = await getRefs()
    const res = await completionsGet(getReq(`${ORIGIN}/api/completions`, parentRef))
    const list = (await res.json()).data.completions as unknown[]
    expect(list.length).toBe(2)
  })
})
