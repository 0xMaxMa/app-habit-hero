/**
 * tests/integration/deductions-cancel.test.ts — undo a point deduction.
 *
 * Direct route-handler import (no server boot) against the real test Postgres,
 * asserting on the PERSISTED result: the child's balance, the point_adjustments
 * row's cancelled_at/cancelled_by, and that nothing is deleted or duplicated.
 *
 * Seed facts used (prisma/seed.test.ts):
 *   • น้องเอ (childA) — totalXp 150, level 1
 *   • น้องบี (childB) — totalXp 600, level 3
 *   • แม่ทดสอบ (parent)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { POST as DEDUCT } from '@/app/api/deductions/route'
import { POST as CANCEL } from '@/app/api/deductions/[id]/cancel/route'
import { addXp } from '@/lib/xp'
import { levelForXp } from '@/lib/level'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { agentHeaders, AGENT_TOKEN } from './helpers/actor'

beforeEach(async () => {
  await resetAndSeed()
})

async function totalXpOf(userId: string): Promise<number> {
  return (await prisma.userProgress.findUnique({ where: { userId } }))?.totalXp ?? 0
}

function deductAs(actorRef: string, body: unknown): Request {
  return new Request('http://t/api/deductions', {
    method: 'POST',
    headers: agentHeaders(actorRef),
    body: JSON.stringify(body),
  })
}

function cancelAs(actorRef: string, id: string): Request {
  return new Request(`http://t/api/deductions/${id}/cancel`, {
    method: 'POST',
    headers: agentHeaders(actorRef),
    body: '{}',
  })
}

/** Deduct `amount` from `userId` as the seeded parent, returning the new row's id. */
async function makeDeduction(parentRef: string, userId: string, amount: number, reason = 'ทดสอบ') {
  const res = await DEDUCT(deductAs(parentRef, { user: userId, amount, reason }))
  const env = await res.json()
  expect(res.status).toBe(201)
  return env.data.deduction.id as string
}

/** A second family with its own parent + child (150 XP), to prove cross-family refusal. */
async function seedFamilyB() {
  const family = await prisma.family.create({ data: { name: 'ครอบครัวบี' } })
  const parent = await prisma.user.create({
    data: {
      name: 'พ่อบี',
      role: 'parent',
      familyId: family.id,
      email: 'parentb-cancel@test.local',
      channelUserRef: 'gw:parent-b-cancel',
    },
  })
  const child = await prisma.user.create({
    data: { name: 'น้องบีบี', role: 'child', familyId: family.id, channelUserRef: 'gw:child-bb-cancel' },
  })
  await prisma.userProgress.create({
    data: { userId: child.id, totalXp: 150, currentLevel: 1 },
  })
  return { familyId: family.id, parentRef: parent.channelUserRef!, childId: child.id }
}

// ---------------------------------------------------------------------------

describe('POST /api/deductions/:id/cancel — undoing a deduction', () => {
  it('restores exactly xpApplied and marks the row cancelled, without deleting or duplicating it', async () => {
    const { parentRef, parentId, childAId } = await getRefs()
    const before = await totalXpOf(childAId) // 150

    const id = await makeDeduction(parentRef, childAId, 50, 'ไม่ทำการบ้าน')
    expect(await totalXpOf(childAId)).toBe(addXp(before, -50)) // 100

    const res = await CANCEL(cancelAs(parentRef, id), { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.ok).toBe(true)
    expect(env.data.restored).toBe(50)
    expect(env.data.xp).toBe(before)
    expect(await totalXpOf(childAId)).toBe(before)

    // Exactly one row — cancelled in place, not deleted, not offset by a second row.
    const rows = await prisma.pointAdjustment.findMany({ where: { userId: childAId } })
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(id)
    expect(rows[0].xpDelta).toBe(-50) // unchanged — the original intent stays on record
    expect(rows[0].xpApplied).toBe(50)
    expect(rows[0].cancelledAt).toBeInstanceOf(Date)
    expect(rows[0].cancelledBy).toBe(parentId)

    expect(env.data.deduction.cancelledAt).not.toBeNull()
    expect(env.data.deduction.cancelledBy.id).toBe(parentId)
  })

  it('restores only xpApplied (not the requested amount) when the original deduction hit the zero floor', async () => {
    const { parentRef, childAId } = await getRefs()
    const before = await totalXpOf(childAId) // 150

    // Ask to take 500 off a 150 balance — only 150 is actually applied.
    const id = await makeDeduction(parentRef, childAId, 500, 'ตีน้อง')
    expect(await totalXpOf(childAId)).toBe(0)

    const res = await CANCEL(cancelAs(parentRef, id), { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.data.restored).toBe(before) // 150, not 500
    expect(await totalXpOf(childAId)).toBe(before)
  })

  it('reports a level-up when restoring XP crosses a level boundary back upward', async () => {
    const { parentRef, childBId } = await getRefs()
    const before = await totalXpOf(childBId) // 600, level 3

    const id = await makeDeduction(parentRef, childBId, 400, 'พูดไม่ดีกับน้อง')
    const droppedLevel = levelForXp(addXp(before, -400))
    expect(droppedLevel).toBeLessThan(levelForXp(before))

    const res = await CANCEL(cancelAs(parentRef, id), { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.data.level).toBe(levelForXp(before))
    expect(env.data.leveledUp).toBe(true)
    expect(env.data.levelsGained).toBe(levelForXp(before) - droppedLevel)
  })

  it('cancelling a second time is refused with 409 and does not restore XP twice', async () => {
    const { parentRef, childAId } = await getRefs()
    const before = await totalXpOf(childAId)
    const id = await makeDeduction(parentRef, childAId, 50, 'ไม่ทำการบ้าน')

    const first = await CANCEL(cancelAs(parentRef, id), { params: { id } })
    expect(first.status).toBe(200)
    expect(await totalXpOf(childAId)).toBe(before)

    const second = await CANCEL(cancelAs(parentRef, id), { params: { id } })
    const env = await second.json()
    expect(second.status).toBe(409)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('CONFLICT')

    // XP is unchanged by the rejected second call — not doubled.
    expect(await totalXpOf(childAId)).toBe(before)
  })

  it('404s on an id that does not exist', async () => {
    const { parentRef } = await getRefs()
    const res = await CANCEL(cancelAs(parentRef, 'padj_nope'), { params: { id: 'padj_nope' } })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/deductions/:id/cancel — authorization is server-side', () => {
  it('a CHILD cancelling their own deduction → 403, XP unchanged', async () => {
    const { parentRef, childARef, childAId } = await getRefs()
    const id = await makeDeduction(parentRef, childAId, 50, 'ไม่ทำการบ้าน')
    const after = await totalXpOf(childAId)

    const res = await CANCEL(cancelAs(childARef, id), { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.error.code).toBe('FORBIDDEN')
    expect(await totalXpOf(childAId)).toBe(after)
    const row = await prisma.pointAdjustment.findUniqueOrThrow({ where: { id } })
    expect(row.cancelledAt).toBeNull()
  })

  it("a parent from ANOTHER family cancelling → 403, XP unchanged", async () => {
    const { parentRef, childAId } = await getRefs()
    const id = await makeDeduction(parentRef, childAId, 50, 'ไม่ทำการบ้าน')
    const after = await totalXpOf(childAId)
    const famB = await seedFamilyB()

    const res = await CANCEL(cancelAs(famB.parentRef, id), { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.error.code).toBe('FORBIDDEN')
    expect(await totalXpOf(childAId)).toBe(after)
    const row = await prisma.pointAdjustment.findUniqueOrThrow({ where: { id } })
    expect(row.cancelledAt).toBeNull()
  })

  it('an unauthenticated caller → 401, nothing changed', async () => {
    const { parentRef, childAId } = await getRefs()
    const id = await makeDeduction(parentRef, childAId, 50, 'ไม่ทำการบ้าน')
    const after = await totalXpOf(childAId)

    const res = await CANCEL(
      new Request(`http://t/api/deductions/${id}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
      { params: { id } },
    )
    expect(res.status).toBe(401)
    expect(await totalXpOf(childAId)).toBe(after)
  })

  it('an invalid agent token → 401, never acts as the parent', async () => {
    const { parentRef, childAId } = await getRefs()
    const id = await makeDeduction(parentRef, childAId, 50, 'ไม่ทำการบ้าน')
    const after = await totalXpOf(childAId)

    const res = await CANCEL(
      new Request(`http://t/api/deductions/${id}/cancel`, {
        method: 'POST',
        headers: {
          'x-agent-token': `${AGENT_TOKEN}-wrong`,
          'x-actor-ref': parentRef,
          'content-type': 'application/json',
        },
        body: '{}',
      }),
      { params: { id } },
    )
    expect(res.status).toBe(401)
    expect(await totalXpOf(childAId)).toBe(after)
  })
})

describe('POST /api/deductions/:id/cancel — concurrency', () => {
  it('two simultaneous cancels of the SAME deduction restore the XP only once', async () => {
    const { parentRef, childBId } = await getRefs()
    const before = await totalXpOf(childBId) // 600
    const id = await makeDeduction(parentRef, childBId, 100, 'เรื่องหนึ่ง')
    const afterDeduct = await totalXpOf(childBId) // 500

    const [r1, r2] = await Promise.all([
      CANCEL(cancelAs(parentRef, id), { params: { id } }),
      CANCEL(cancelAs(parentRef, id), { params: { id } }),
    ])

    const statuses = [r1.status, r2.status].sort()
    // Exactly one wins (200), the other loses to the idempotency check (409).
    expect(statuses).toEqual([200, 409])
    expect(await totalXpOf(childBId)).toBe(before)
    expect(await totalXpOf(childBId)).not.toBe(afterDeduct + 100 + 100)
  })
})
