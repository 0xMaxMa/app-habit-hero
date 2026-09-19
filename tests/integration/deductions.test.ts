/**
 * tests/integration/deductions.test.ts — parent point deduction.
 *
 * Direct route-handler import (no server boot) against the real test Postgres,
 * asserting on the PERSISTED result: the child's balance, and the
 * point_adjustments row that has to explain it. XP arithmetic goes through
 * lib/xp.addXp rather than being recomputed inline.
 *
 * Seed facts used (prisma/seed.test.ts):
 *   • น้องเอ (childA) — totalXp 150, level 1
 *   • น้องบี (childB) — totalXp 600, level 3
 *   • แม่ทดสอบ (parent)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { POST as DEDUCT, GET as LIST } from '@/app/api/deductions/route'
import { addXp } from '@/lib/xp'
import { levelForXp } from '@/lib/level'
import { MAX_DEDUCTION_XP } from '@/lib/point-rules'
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

/** A second family with its own parent + child (150 XP), to prove cross-family refusal. */
async function seedFamilyB() {
  const family = await prisma.family.create({ data: { name: 'ครอบครัวบี' } })
  const parent = await prisma.user.create({
    data: {
      name: 'พ่อบี',
      role: 'parent',
      familyId: family.id,
      email: 'parentb@test.local',
      channelUserRef: 'gw:parent-b',
    },
  })
  const child = await prisma.user.create({
    data: { name: 'น้องบีบี', role: 'child', familyId: family.id, channelUserRef: 'gw:child-bb' },
  })
  await prisma.userProgress.create({
    data: { userId: child.id, totalXp: 150, currentLevel: 1 },
  })
  return { familyId: family.id, parentRef: parent.channelUserRef!, childId: child.id }
}

// ---------------------------------------------------------------------------

describe('POST /api/deductions — a parent deducts XP', () => {
  it('lowers the balance by exactly the amount and records the full ledger row', async () => {
    const { parentRef, parentId, childAId } = await getRefs()
    const before = await totalXpOf(childAId) // 150

    const res = await DEDUCT(
      deductAs(parentRef, { user: childAId, amount: 50, reason: 'ไม่ทำการบ้าน' }),
    )
    const env = await res.json()

    expect(res.status).toBe(201)
    expect(env.ok).toBe(true)
    expect(env.data.requested).toBe(50)
    expect(env.data.applied).toBe(50)
    expect(env.data.floored).toBe(false)
    expect(env.data.xp).toBe(addXp(before, -50)) // 100

    // The balance really moved, not just the response.
    expect(await totalXpOf(childAId)).toBe(addXp(before, -50))
    const progress = await prisma.userProgress.findUnique({ where: { userId: childAId } })
    expect(progress?.currentLevel).toBe(levelForXp(addXp(before, -50)))

    // …and there is a row that explains WHY, by whom, and when.
    const rows = await prisma.pointAdjustment.findMany({ where: { userId: childAId } })
    expect(rows).toHaveLength(1)
    expect(rows[0].xpDelta).toBe(-50) // signed: negative is a deduction
    expect(rows[0].xpApplied).toBe(50)
    expect(rows[0].reason).toBe('ไม่ทำการบ้าน')
    expect(rows[0].createdBy).toBe(parentId)
    expect(rows[0].createdAt).toBeInstanceOf(Date)
  })

  it('reports a level drop when the deduction crosses a level boundary', async () => {
    const { parentRef, childBId } = await getRefs()
    const before = await totalXpOf(childBId) // 600, level 3

    const res = await DEDUCT(
      deductAs(parentRef, { user: childBId, amount: 400, reason: 'พูดไม่ดีกับน้อง' }),
    )
    const env = await res.json()

    expect(res.status).toBe(201)
    expect(env.data.previousLevel).toBe(levelForXp(before))
    expect(env.data.level).toBe(levelForXp(addXp(before, -400)))
    expect(env.data.leveledDown).toBe(true)
    expect(env.data.levelsLost).toBe(levelForXp(before) - levelForXp(addXp(before, -400)))
  })

  it('accepts a channelUserRef as `user`, the way the agent addresses a child', async () => {
    const { parentRef, childARef, childAId } = await getRefs()
    const before = await totalXpOf(childAId)

    const res = await DEDUCT(
      deductAs(parentRef, { user: childARef, amount: 20, reason: 'ลืมเก็บของเล่น' }),
    )
    expect(res.status).toBe(201)
    expect(await totalXpOf(childAId)).toBe(addXp(before, -20))
  })
})

describe('POST /api/deductions — the balance floor', () => {
  it('stops at 0 instead of going negative, and says how much it could take', async () => {
    const { parentRef, childAId } = await getRefs()
    const before = await totalXpOf(childAId) // 150

    const res = await DEDUCT(
      deductAs(parentRef, { user: childAId, amount: 500, reason: 'ตีน้อง' }),
    )
    const env = await res.json()

    expect(res.status).toBe(201)
    expect(env.data.requested).toBe(500)
    expect(env.data.applied).toBe(before) // only 150 was there to take
    expect(env.data.floored).toBe(true)
    expect(env.data.xp).toBe(0)

    // Never negative — a child must not owe XP back before a chore counts again.
    expect(await totalXpOf(childAId)).toBe(0)

    // The row keeps BOTH the intent and what actually happened.
    const row = await prisma.pointAdjustment.findFirstOrThrow({ where: { userId: childAId } })
    expect(row.xpDelta).toBe(-500)
    expect(row.xpApplied).toBe(before)
  })

  it('deducting from a child with no progress row records it and leaves 0', async () => {
    const { parentRef, familyId } = await getRefs()
    const fresh = await prisma.user.create({
      data: { name: 'น้องใหม่', role: 'child', familyId },
    })

    const res = await DEDUCT(
      deductAs(parentRef, { user: fresh.id, amount: 10, reason: 'ไม่ยอมแปรงฟัน' }),
    )
    const env = await res.json()

    expect(res.status).toBe(201)
    expect(env.data.applied).toBe(0)
    expect(env.data.floored).toBe(true)
    expect(await totalXpOf(fresh.id)).toBe(0)
    expect(await prisma.pointAdjustment.count({ where: { userId: fresh.id } })).toBe(1)
  })
})

describe('POST /api/deductions — validation', () => {
  const BAD_AMOUNTS: [string, unknown][] = [
    ['zero', 0],
    ['negative', -50],
    ['fractional', 12.5],
    [`over the ${MAX_DEDUCTION_XP} cap`, MAX_DEDUCTION_XP + 1],
    ['not a number', '50'],
  ]

  it.each(BAD_AMOUNTS)('rejects an amount that is %s → 400, nothing written', async (_l, amount) => {
    const { parentRef, childAId } = await getRefs()
    const before = await totalXpOf(childAId)

    const res = await DEDUCT(deductAs(parentRef, { user: childAId, amount, reason: 'ทดสอบ' }))
    const env = await res.json()

    expect(res.status).toBe(400)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('BAD_REQUEST')
    expect(await totalXpOf(childAId)).toBe(before)
    expect(await prisma.pointAdjustment.count({ where: { userId: childAId } })).toBe(0)
  })

  it('accepts exactly the cap (the boundary is inclusive)', async () => {
    const { parentRef, childBId } = await getRefs()
    const res = await DEDUCT(
      deductAs(parentRef, { user: childBId, amount: MAX_DEDUCTION_XP, reason: 'เหตุผลจริง' }),
    )
    expect(res.status).toBe(201)
  })

  const BAD_REASONS: [string, Record<string, unknown>][] = [
    ['omitted', {}],
    ['empty', { reason: '' }],
    ['whitespace only', { reason: '   ' }],
    ['longer than 200 chars', { reason: 'x'.repeat(201) }],
  ]

  it.each(BAD_REASONS)('rejects a reason that is %s → 400, nothing written', async (_l, patch) => {
    const { parentRef, childAId } = await getRefs()
    const before = await totalXpOf(childAId)

    const res = await DEDUCT(deductAs(parentRef, { user: childAId, amount: 10, ...patch }))
    const env = await res.json()

    expect(res.status).toBe(400)
    expect(env.error.code).toBe('BAD_REQUEST')
    expect(await totalXpOf(childAId)).toBe(before)
    expect(await prisma.pointAdjustment.count({ where: { userId: childAId } })).toBe(0)
  })

  it('stores the reason trimmed', async () => {
    const { parentRef, childAId } = await getRefs()
    const res = await DEDUCT(
      deductAs(parentRef, { user: childAId, amount: 10, reason: '  ไม่เก็บที่นอน  ' }),
    )
    expect(res.status).toBe(201)
    const row = await prisma.pointAdjustment.findFirstOrThrow({ where: { userId: childAId } })
    expect(row.reason).toBe('ไม่เก็บที่นอน')
  })

  it('refuses to deduct from a PARENT account → 400', async () => {
    const { parentRef, parentId } = await getRefs()
    const res = await DEDUCT(deductAs(parentRef, { user: parentId, amount: 10, reason: 'ทดสอบ' }))
    expect(res.status).toBe(400)
    expect(await prisma.pointAdjustment.count()).toBe(0)
  })

  it('404s on a user that does not exist', async () => {
    const { parentRef } = await getRefs()
    const res = await DEDUCT(deductAs(parentRef, { user: 'usr_nope', amount: 10, reason: 'ทดสอบ' }))
    expect(res.status).toBe(404)
  })
})

describe('POST /api/deductions — authorization is server-side', () => {
  it('a CHILD deducting from themselves → 403, XP unchanged', async () => {
    const { childARef, childAId } = await getRefs()
    const before = await totalXpOf(childAId)

    const res = await DEDUCT(deductAs(childARef, { user: childAId, amount: 50, reason: 'เอาคืน' }))
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.error.code).toBe('FORBIDDEN')
    expect(await totalXpOf(childAId)).toBe(before)
    expect(await prisma.pointAdjustment.count()).toBe(0)
  })

  it('a CHILD deducting from a SIBLING → 403, XP unchanged', async () => {
    const { childARef, childBId } = await getRefs()
    const before = await totalXpOf(childBId)

    const res = await DEDUCT(deductAs(childARef, { user: childBId, amount: 50, reason: 'แกล้ง' }))
    expect(res.status).toBe(403)
    expect(await totalXpOf(childBId)).toBe(before)
    expect(await prisma.pointAdjustment.count()).toBe(0)
  })

  it("a parent deducting from ANOTHER family's child → 403, XP unchanged", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()
    const before = await totalXpOf(famB.childId)

    const res = await DEDUCT(deductAs(parentRef, { user: famB.childId, amount: 99, reason: 'ไม่ใช่ลูกฉัน' }))
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.error.code).toBe('FORBIDDEN')
    expect(await totalXpOf(famB.childId)).toBe(before)
    expect(await prisma.pointAdjustment.count()).toBe(0)
  })

  it('an unauthenticated caller → 401, nothing written', async () => {
    const { childAId } = await getRefs()
    const before = await totalXpOf(childAId)

    const res = await DEDUCT(
      new Request('http://t/api/deductions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user: childAId, amount: 50, reason: 'ไม่มีใคร' }),
      }),
    )
    expect(res.status).toBe(401)
    expect(await totalXpOf(childAId)).toBe(before)
    expect(await prisma.pointAdjustment.count()).toBe(0)
  })

  it('an invalid agent token → 401, never acts as the parent', async () => {
    const { parentRef, childAId } = await getRefs()
    const before = await totalXpOf(childAId)

    const res = await DEDUCT(
      new Request('http://t/api/deductions', {
        method: 'POST',
        headers: {
          'x-agent-token': `${AGENT_TOKEN}-wrong`,
          'x-actor-ref': parentRef,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ user: childAId, amount: 50, reason: 'ปลอม' }),
      }),
    )
    expect(res.status).toBe(401)
    expect(await totalXpOf(childAId)).toBe(before)
    expect(await prisma.pointAdjustment.count()).toBe(0)
  })
})

describe('POST /api/deductions — concurrency', () => {
  it('two deductions at once take BOTH off, rather than one erasing the other', async () => {
    const { parentRef, childBId } = await getRefs()
    const before = await totalXpOf(childBId) // 600

    const [r1, r2] = await Promise.all([
      DEDUCT(deductAs(parentRef, { user: childBId, amount: 100, reason: 'เรื่องที่หนึ่ง' })),
      DEDUCT(deductAs(parentRef, { user: childBId, amount: 100, reason: 'เรื่องที่สอง' })),
    ])

    expect(r1.status).toBe(201)
    expect(r2.status).toBe(201)
    expect(await totalXpOf(childBId)).toBe(addXp(before, -200))
    expect(await prisma.pointAdjustment.count({ where: { userId: childBId } })).toBe(2)
  })
})

describe('GET /api/deductions — the history rows', () => {
  it('returns the family rows to a parent, newest first, with reason + author', async () => {
    const { parentRef, parentId, childAId, childBId } = await getRefs()
    await DEDUCT(deductAs(parentRef, { user: childAId, amount: 10, reason: 'เรื่องเอ' }))
    await DEDUCT(deductAs(parentRef, { user: childBId, amount: 20, reason: 'เรื่องบี' }))

    const res = await LIST(
      new Request('http://t/api/deductions', { headers: agentHeaders(parentRef) }),
    )
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.data.deductions).toHaveLength(2)
    const [newest] = env.data.deductions
    // `amount` is the positive figure every screen prints as "-20 XP".
    expect(newest.amount).toBe(20)
    expect(newest.reason).toBe('เรื่องบี')
    expect(newest.by.id).toBe(parentId)
    expect(newest.child.id).toBe(childBId)
    expect(
      new Date(env.data.deductions[0].createdAt).getTime(),
    ).toBeGreaterThanOrEqual(new Date(env.data.deductions[1].createdAt).getTime())
  })

  it('a ?child= filter narrows it for a parent', async () => {
    const { parentRef, childAId, childBId } = await getRefs()
    await DEDUCT(deductAs(parentRef, { user: childAId, amount: 10, reason: 'เรื่องเอ' }))
    await DEDUCT(deductAs(parentRef, { user: childBId, amount: 20, reason: 'เรื่องบี' }))

    const res = await LIST(
      new Request(`http://t/api/deductions?child=${childAId}`, {
        headers: agentHeaders(parentRef),
      }),
    )
    const env = await res.json()
    expect(env.data.deductions).toHaveLength(1)
    expect(env.data.deductions[0].child.id).toBe(childAId)
  })

  it('a child sees their OWN deductions — with the reason, never silently', async () => {
    const { parentRef, childARef, childAId } = await getRefs()
    await DEDUCT(deductAs(parentRef, { user: childAId, amount: 30, reason: 'ไม่ทำการบ้าน' }))

    const res = await LIST(
      new Request('http://t/api/deductions', { headers: agentHeaders(childARef) }),
    )
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.data.deductions).toHaveLength(1)
    expect(env.data.deductions[0].amount).toBe(30)
    expect(env.data.deductions[0].reason).toBe('ไม่ทำการบ้าน')
  })

  it("a child is scoped to themselves even when they ask for a sibling's", async () => {
    const { parentRef, childARef, childAId, childBId } = await getRefs()
    await DEDUCT(deductAs(parentRef, { user: childAId, amount: 10, reason: 'เรื่องเอ' }))
    await DEDUCT(deductAs(parentRef, { user: childBId, amount: 20, reason: 'เรื่องบี' }))

    // Explicitly asking for the sibling is refused…
    const explicit = await LIST(
      new Request(`http://t/api/deductions?child=${childBId}`, {
        headers: agentHeaders(childARef),
      }),
    )
    expect(explicit.status).toBe(403)

    // …and an unfiltered read returns only their own row, never the sibling's.
    const own = await LIST(
      new Request('http://t/api/deductions', { headers: agentHeaders(childARef) }),
    )
    const env = await own.json()
    expect(env.data.deductions).toHaveLength(1)
    expect(env.data.deductions[0].child.id).toBe(childAId)
  })

  it("does not leak another family's deductions to a parent", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()
    await DEDUCT(deductAs(famB.parentRef, { user: famB.childId, amount: 40, reason: 'ของบ้านบี' }))

    const res = await LIST(
      new Request('http://t/api/deductions', { headers: agentHeaders(parentRef) }),
    )
    const env = await res.json()
    expect(env.data.deductions).toHaveLength(0)
  })
})
