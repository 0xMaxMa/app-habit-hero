/**
 * tests/integration/badges.test.ts — the achievement catalog + seen endpoints.
 *
 * GET  /api/badges?user=<id>   → full catalog with earned / locked / new flags
 * POST /api/badges/seen        → clears the "new" highlight
 *
 * Authz mirrors progress: a child only reads/updates their own; a parent any
 * child in the family; a sibling is 403.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GET as badgesGet } from '@/app/api/badges/route'
import { POST as seenPost } from '@/app/api/badges/seen/route'
import { POST as bonusPost } from '@/app/api/bonus/route'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { agentHeaders, jsonBody } from './helpers/actor'

const ORIGIN = 'http://t'

const CATALOG_SIZE = 28

function getReq(url: string, actorRef: string): Request {
  return new Request(url, { method: 'GET', headers: agentHeaders(actorRef) })
}
function postReq(url: string, actorRef: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: agentHeaders(actorRef),
    body: jsonBody(body),
  })
}

beforeEach(async () => {
  await resetAndSeed()
})

describe('GET /api/badges — catalog', () => {
  it('returns the full catalog, none earned for a fresh child', async () => {
    const { childARef, childAId } = await getRefs()
    const res = await badgesGet(getReq(`${ORIGIN}/api/badges?user=${childAId}`, childARef))
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    expect(data.total).toBe(CATALOG_SIZE)
    expect(data.earnedCount).toBe(0)
    expect(data.newCount).toBe(0)
    // Each entry carries its medal image + locked state.
    expect(data.badges.every((b: { imageUrl: string }) => b.imageUrl.startsWith('/badges/'))).toBe(
      true,
    )
    expect(data.badges.every((b: { earned: boolean }) => b.earned === false)).toBe(true)
    // The design-grid badges are present.
    const ids = data.badges.map((b: { id: string }) => b.id)
    expect(ids).toEqual(
      expect.arrayContaining(['cleaner', 'bookworm', 'xp_1000', 'early_bird', 'chef', 'xp_5000']),
    )
  })

  it('marks an owned-but-unseen badge as earned + new', async () => {
    const { childARef, childAId } = await getRefs()
    await prisma.userBadge.create({ data: { userId: childAId, badgeId: 'on_fire' } })

    const res = await badgesGet(getReq(`${ORIGIN}/api/badges?user=${childAId}`, childARef))
    const data = (await res.json()).data
    expect(data.earnedCount).toBe(1)
    expect(data.newCount).toBe(1)
    const onFire = data.badges.find((b: { id: string }) => b.id === 'on_fire')
    expect(onFire.earned).toBe(true)
    expect(onFire.isNew).toBe(true)
  })

  it('sorts earned badges ahead of locked ones', async () => {
    const { childARef, childAId } = await getRefs()
    // Two earned badges, one of them last in the catalog order, to prove the
    // sort is by earned-state (not catalog position).
    await prisma.userBadge.createMany({
      data: [
        { userId: childAId, badgeId: 'perfect_month' }, // last in the catalog
        { userId: childAId, badgeId: 'xp_1000' },
      ],
    })

    const res = await badgesGet(getReq(`${ORIGIN}/api/badges?user=${childAId}`, childARef))
    const data = (await res.json()).data
    const earnedFlags: boolean[] = data.badges.map((b: { earned: boolean }) => b.earned)
    // The first two entries are the earned ones; no locked badge precedes an earned one.
    expect(earnedFlags.slice(0, 2)).toEqual([true, true])
    expect(earnedFlags.lastIndexOf(true)).toBeLessThan(earnedFlags.indexOf(false))
  })

  it("a child cannot read a sibling's badges (403)", async () => {
    const { childARef, childBId } = await getRefs()
    const res = await badgesGet(getReq(`${ORIGIN}/api/badges?user=${childBId}`, childARef))
    expect(res.status).toBe(403)
  })

  it('a parent can read any child in the family', async () => {
    const { parentRef, childAId } = await getRefs()
    const res = await badgesGet(getReq(`${ORIGIN}/api/badges?user=${childAId}`, parentRef))
    expect(res.status).toBe(200)
  })
})

describe('XP-threshold badge awards', () => {
  it('crossing 1,000 XP via a parent bonus earns the 1,000 XP badge', async () => {
    const { parentRef, childAId, childARef } = await getRefs()

    // Bonus enough to cross the 1,000 XP threshold in one shot.
    const bonusRes = await bonusPost(
      new Request(`${ORIGIN}/api/bonus`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
        body: jsonBody({ user: childAId, amount: 1000, reason: 'test' }),
      }),
    )
    expect(bonusRes.status).toBe(201)
    const bonus = (await bonusRes.json()).data
    expect(bonus.newBadges.map((b: { id: string }) => b.id)).toContain('xp_1000')

    // It is persisted + reflected in the catalog as earned + new.
    const res = await badgesGet(getReq(`${ORIGIN}/api/badges?user=${childAId}`, childARef))
    const data = (await res.json()).data
    const xp1000 = data.badges.find((b: { id: string }) => b.id === 'xp_1000')
    expect(xp1000.earned).toBe(true)
    expect(xp1000.isNew).toBe(true)
    // Not yet at 5,000.
    expect(data.badges.find((b: { id: string }) => b.id === 'xp_5000').earned).toBe(false)
  })
})

describe('POST /api/badges/seen', () => {
  it('clears the new flag for the child', async () => {
    const { childARef, childAId } = await getRefs()
    await prisma.userBadge.create({ data: { userId: childAId, badgeId: 'on_fire' } })

    const marked = await seenPost(postReq(`${ORIGIN}/api/badges/seen`, childARef, { user: childAId }))
    expect(marked.status).toBe(200)
    expect((await marked.json()).data.marked).toBe(1)

    const res = await badgesGet(getReq(`${ORIGIN}/api/badges?user=${childAId}`, childARef))
    const data = (await res.json()).data
    expect(data.newCount).toBe(0)
    expect(data.earnedCount).toBe(1) // still earned, just not "new"
  })

  it("a child cannot mark a sibling's badges (403)", async () => {
    const { childARef, childBId } = await getRefs()
    const res = await seenPost(postReq(`${ORIGIN}/api/badges/seen`, childARef, { user: childBId }))
    expect(res.status).toBe(403)
  })
})
