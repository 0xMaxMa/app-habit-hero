/**
 * tests/integration/redemptions-bonus.test.ts — API integration for reward
 * redemptions + parent bonus XP (§4A: A-TOOL-3, A-TOOL-4).
 *
 * Direct route-handler import (no server boot) against the real test Postgres.
 * XP math is asserted through lib/xp.addXp — never recomputed inline — and the
 * DB side-effects are read back with prisma.
 *
 * Seed facts used (prisma/seed.test.ts):
 *   • น้องเอ (childA)  — totalXp 150
 *   • รางวัล ค่าขนม 20 บาท (rewardSnack) — xpCost 50   (affordable for childA)
 *   • รางวัล เล่นเกม 1 ชม. (rewardGame)  — xpCost 100  (affordable for childA)
 *   • รางวัล ตั๋วเครื่องบินญี่ปุ่น (rewardJapan) — xpCost 50000 (NOT affordable)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { POST as REDEEM } from '@/app/api/redemptions/route'
import { POST as APPROVE } from '@/app/api/redemptions/[id]/approve/route'
import { POST as REJECT } from '@/app/api/redemptions/[id]/reject/route'
import { POST as BONUS } from '@/app/api/bonus/route'
import { DELETE as DELETE_REWARD } from '@/app/api/rewards/[id]/route'
import { IDS } from '@/prisma/seed.test'
import { addXp } from '@/lib/xp'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { agentHeaders } from './helpers/actor'

beforeEach(async () => {
  await resetAndSeed()
})

async function totalXpOf(userId: string): Promise<number> {
  const p = await prisma.userProgress.findUnique({ where: { userId } })
  return p?.totalXp ?? 0
}

describe('POST /api/redemptions — child requests a reward (A-TOOL-4)', () => {
  it('enough XP: creates a pending redemption WITHOUT deducting XP yet', async () => {
    const { childARef, childAId } = await getRefs()
    const before = await totalXpOf(childAId) // 150

    const req = new Request('http://t/api/redemptions', {
      method: 'POST',
      headers: agentHeaders(childARef),
      body: JSON.stringify({ rewardId: IDS.rewardSnack }), // xpCost 50
    })
    const res = await REDEEM(req)
    const env = await res.json()

    expect(res.status).toBe(201)
    expect(env.ok).toBe(true)
    expect(env.data.enough).toBe(true)
    expect(env.data.redemption.status).toBe('pending')
    expect(env.data.redemption.xpSpent).toBe(50)
    expect(env.data.redemption.redeemedBy).toBe(childAId)

    // Exactly one pending row for this child + reward, persisted.
    const rows = await prisma.rewardRedemption.findMany({
      where: { redeemedBy: childAId },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('pending')
    expect(rows[0].rewardId).toBe(IDS.rewardSnack)

    // XP is NOT deducted at request time — deduction happens on parent approve.
    expect(await totalXpOf(childAId)).toBe(before)
  })

  it('not enough XP: reports the shortfall, creates NO row, leaves XP unchanged', async () => {
    const { childARef, childAId } = await getRefs()
    const before = await totalXpOf(childAId) // 150

    const req = new Request('http://t/api/redemptions', {
      method: 'POST',
      headers: agentHeaders(childARef),
      body: JSON.stringify({ rewardId: IDS.rewardJapan }), // xpCost 50000
    })
    const res = await REDEEM(req)
    const env = await res.json()

    // NOTE: the handler signals "can't afford" as a normal envelope with
    // enough:false + a numeric shortfall (NOT an HTTP 4xx). We assert the real
    // contract: the caller learns exactly how short they are, and nothing is
    // created or deducted.
    expect(env.ok).toBe(true)
    expect(env.data.enough).toBe(false)
    expect(env.data.shortfall).toBe(50000 - before) // 49850
    expect(env.data.available).toBe(before)
    expect(env.data.xpCost).toBe(50000)

    // No redemption row was created.
    const rows = await prisma.rewardRedemption.findMany({
      where: { redeemedBy: childAId },
    })
    expect(rows).toHaveLength(0)

    // XP untouched.
    expect(await totalXpOf(childAId)).toBe(before)
  })
})

describe('POST /api/redemptions/:id/approve — parent approves (T22)', () => {
  it('approves a pending redemption and deducts reward.xpCost from the child', async () => {
    const { childARef, childAId, parentRef } = await getRefs()
    const before = await totalXpOf(childAId) // 150

    // 1) child requests เล่นเกม 1 ชม. (100 XP) — affordable.
    const reqReq = new Request('http://t/api/redemptions', {
      method: 'POST',
      headers: agentHeaders(childARef),
      body: JSON.stringify({ rewardId: IDS.rewardGame }),
    })
    const reqEnv = await (await REDEEM(reqReq)).json()
    expect(reqEnv.ok).toBe(true)
    const redemptionId = reqEnv.data.redemption.id as string
    expect(await totalXpOf(childAId)).toBe(before) // still not deducted

    // 2) parent approves.
    const approveReq = new Request(
      `http://t/api/redemptions/${redemptionId}/approve`,
      { method: 'POST', headers: agentHeaders(parentRef) },
    )
    const res = await APPROVE(approveReq, { params: { id: redemptionId } })
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.ok).toBe(true)
    expect(env.data.redemption.status).toBe('approved')

    // Row is approved and stamped reviewedAt.
    const row = await prisma.rewardRedemption.findUniqueOrThrow({
      where: { id: redemptionId },
    })
    expect(row.status).toBe('approved')
    expect(row.reviewedAt).not.toBeNull()

    // Child's totalXp dropped by exactly the reward cost (via lib/xp).
    const expected = addXp(before, -100) // 50
    expect(await totalXpOf(childAId)).toBe(expected)
  })
})

describe('POST /api/redemptions/:id/reject — parent declines', () => {
  it('marks the redemption rejected WITHOUT touching the child XP', async () => {
    const { childARef, childAId, parentRef } = await getRefs()
    const before = await totalXpOf(childAId) // 150

    // child requests ค่าขนม (50 XP)
    const reqEnv = await (
      await REDEEM(
        new Request('http://t/api/redemptions', {
          method: 'POST',
          headers: agentHeaders(childARef),
          body: JSON.stringify({ rewardId: IDS.rewardSnack }),
        }),
      )
    ).json()
    const redemptionId = reqEnv.data.redemption.id as string

    // parent rejects
    const res = await REJECT(
      new Request(`http://t/api/redemptions/${redemptionId}/reject`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: redemptionId } },
    )
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.data.redemption.status).toBe('rejected')

    const row = await prisma.rewardRedemption.findUniqueOrThrow({
      where: { id: redemptionId },
    })
    expect(row.status).toBe('rejected')
    expect(row.reviewedAt).not.toBeNull()

    // No XP deducted on a reject.
    expect(await totalXpOf(childAId)).toBe(before)
  })

  it('re-deciding a non-pending redemption is a 409 conflict', async () => {
    const { childARef, parentRef } = await getRefs()
    const reqEnv = await (
      await REDEEM(
        new Request('http://t/api/redemptions', {
          method: 'POST',
          headers: agentHeaders(childARef),
          body: JSON.stringify({ rewardId: IDS.rewardSnack }),
        }),
      )
    ).json()
    const id = reqEnv.data.redemption.id as string

    // reject once → 200
    await REJECT(
      new Request(`http://t/api/redemptions/${id}/reject`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
      }),
      { params: { id } },
    )
    // approve after reject → 409
    const res = await APPROVE(
      new Request(`http://t/api/redemptions/${id}/approve`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
      }),
      { params: { id } },
    )
    expect(res.status).toBe(409)
  })
})

describe('POST /api/bonus — parent grants bonus XP (A-TOOL-3)', () => {
  it('adds the bonus amount to the target child totalXp', async () => {
    const { childAId, parentRef } = await getRefs()
    const before = await totalXpOf(childAId) // 150

    const req = new Request('http://t/api/bonus', {
      method: 'POST',
      headers: agentHeaders(parentRef),
      body: JSON.stringify({
        user: childAId,
        amount: 50,
        reason: 'ช่วยยกของเข้าบ้าน',
      }),
    })
    const res = await BONUS(req)
    const env = await res.json()

    expect(res.status).toBe(201)
    expect(env.ok).toBe(true)
    expect(env.data.userId).toBe(childAId)
    expect(env.data.amount).toBe(50)

    const expected = addXp(before, 50) // 200
    expect(env.data.xp).toBe(expected)
    expect(await totalXpOf(childAId)).toBe(expected)
  })

  it('authz: a child self-granting a bonus is forbidden (403), XP unchanged', async () => {
    const { childARef, childAId } = await getRefs()
    const before = await totalXpOf(childAId) // 150

    const req = new Request('http://t/api/bonus', {
      method: 'POST',
      headers: agentHeaders(childARef),
      body: JSON.stringify({ user: childAId, amount: 50 }),
    })
    const res = await BONUS(req)
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')

    // No XP was granted.
    expect(await totalXpOf(childAId)).toBe(before)
  })
})

describe('DELETE /api/rewards/:id — reward with redemption history', () => {
  it('refuses (409 + count) without force, then deletes with ?force=1 (redemptions cascade)', async () => {
    const { childAId, parentRef } = await getRefs()

    // Give the reward some redemption history.
    await prisma.rewardRedemption.create({
      data: {
        rewardId: IDS.rewardSnack,
        redeemedBy: childAId,
        xpSpent: 50,
        status: 'approved',
      },
    })

    // 1) Plain delete → 409 CONFLICT carrying the redemption count.
    const blocked = await DELETE_REWARD(
      new Request(`http://t/api/rewards/${IDS.rewardSnack}`, {
        method: 'DELETE',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: IDS.rewardSnack } },
    )
    const blockedEnv = await blocked.json()
    expect(blocked.status).toBe(409)
    expect(blockedEnv.error.code).toBe('CONFLICT')
    expect(blockedEnv.error.redemptionCount).toBe(1)
    expect(await prisma.reward.findUnique({ where: { id: IDS.rewardSnack } })).not.toBeNull()

    // 2) Forced delete → 200; reward and its redemptions are gone.
    const forced = await DELETE_REWARD(
      new Request(`http://t/api/rewards/${IDS.rewardSnack}?force=1`, {
        method: 'DELETE',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: IDS.rewardSnack } },
    )
    expect(forced.status).toBe(200)
    expect(await prisma.reward.findUnique({ where: { id: IDS.rewardSnack } })).toBeNull()
    expect(
      await prisma.rewardRedemption.findMany({ where: { rewardId: IDS.rewardSnack } }),
    ).toHaveLength(0)
  })
})
