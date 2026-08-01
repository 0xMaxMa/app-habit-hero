/**
 * tests/integration/security.test.ts — SECURITY api-integration tests (§4B).
 *
 * These prove authorization is enforced at the API layer (lib/api/authz.ts),
 * independent of any agent prompt. A caller cannot escalate by asking nicely:
 * the route handlers themselves reject unlinked callers, cross-family access,
 * child self-escalation, and missing/invalid agent tokens.
 *
 * Everything is asserted via HTTP status codes + machine error codes and via
 * prisma side-effects (XP / row counts UNCHANGED) — never on human wording.
 *
 * A-SEC-1  foreign / unlinked caller      → 401 UNLINKED | 403 cross-family
 * A-SEC-2  child self-escalation          → 403, XP unchanged
 * A-SEC-3  agent token missing / invalid  → 401, never acts as anyone
 * X-FAM    cross-family object access     → 403 (assertFamily), no data leak
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GET as GET_PROGRESS } from '@/app/api/progress/route'
import { POST as POST_BONUS } from '@/app/api/bonus/route'
import { POST as APPROVE_COMPLETION } from '@/app/api/completions/[id]/approve/route'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { agentHeaders, AGENT_TOKEN } from './helpers/actor'

beforeEach(async () => {
  await resetAndSeed()
})

// --- helpers ---------------------------------------------------------------

/** A pending completion of the daily "ล้างจาน" chore, done by น้องเอ (family A). */
async function seedPendingCompletionA(): Promise<string> {
  const { childAId } = await getRefs()
  const c = await prisma.choreCompletion.create({
    data: {
      choreId: 'chore_test_dishes',
      completedBy: childAId,
      status: 'pending',
    },
  })
  return c.id
}

interface FamilyB {
  familyId: string
  parentRef: string
  childId: string
  childRef: string
  completionId: string
}

/**
 * A second, fully-separate family with its own parent, child (150 XP), chore
 * and a pending completion — used to prove cross-family access is refused.
 */
async function seedFamilyB(): Promise<FamilyB> {
  const family = await prisma.family.create({ data: { name: 'ครอบครัวบี' } })
  const parent = await prisma.user.create({
    data: {
      name: 'พ่อบี',
      role: 'parent',
      familyId: family.id,
      email: 'parentB@test.local',
      channelUserRef: 'gw:famB-parent',
      linkCode: 'LINKFAMB',
    },
  })
  const child = await prisma.user.create({
    data: {
      name: 'น้องบีสอง',
      role: 'child',
      familyId: family.id,
      channelUserRef: 'gw:famB-child',
    },
  })
  await prisma.userProgress.create({
    data: { userId: child.id, totalXp: 150, currentLevel: 1, currentStreak: 0, longestStreak: 0 },
  })
  const chore = await prisma.chore.create({
    data: {
      title: 'กวาดบ้าน',
      familyId: family.id,
      assignedTo: child.id,
      xpValue: 40,
      recurrence: 'daily',
    },
  })
  const completion = await prisma.choreCompletion.create({
    data: { choreId: chore.id, completedBy: child.id, status: 'pending' },
  })
  return {
    familyId: family.id,
    parentRef: parent.channelUserRef!,
    childId: child.id,
    childRef: child.channelUserRef!,
    completionId: completion.id,
  }
}

async function xpOf(userId: string): Promise<number> {
  const p = await prisma.userProgress.findUnique({ where: { userId } })
  return p?.totalXp ?? 0
}

// ===========================================================================
// A-SEC-1 — foreign / unlinked caller
// ===========================================================================

describe('A-SEC-1 foreign / unlinked caller', () => {
  it('valid agent token but unlinked x-actor-ref → 401 UNLINKED', async () => {
    const req = new Request('http://t/api/progress?user=usr_test_child_a', {
      headers: agentHeaders('gw:not-a-real-user'),
    })
    const res = await GET_PROGRESS(req)
    const env = await res.json()

    expect(res.status).toBe(401)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('UNLINKED')
    expect(env.data).toBeUndefined()
  })

  it("a parent cannot read another family's child progress → 403, no data leak", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const req = new Request(`http://t/api/progress?user=${famB.childId}`, {
      headers: agentHeaders(parentRef),
    })
    const res = await GET_PROGRESS(req)
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')
    // No cross-family data leaked in the failure envelope.
    expect(env.data).toBeUndefined()
    expect(JSON.stringify(env)).not.toContain('น้องบีสอง')
  })
})

// ===========================================================================
// A-SEC-2 — child self-escalation
// ===========================================================================

describe('A-SEC-2 child self-escalation', () => {
  it('a CHILD granting themselves bonus XP → 403, XP unchanged', async () => {
    const { childAId, childARef } = await getRefs()
    const before = await xpOf(childAId)

    const req = new Request('http://t/api/bonus', {
      method: 'POST',
      headers: agentHeaders(childARef),
      body: JSON.stringify({ user: childAId, amount: 500, reason: 'self-reward' }),
    })
    const res = await POST_BONUS(req)
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')
    expect(await xpOf(childAId)).toBe(before) // 150, untouched
  })

  it('a CHILD approving a pending completion → 403, XP unchanged & still pending', async () => {
    const { childAId, childARef } = await getRefs()
    const completionId = await seedPendingCompletionA()
    const before = await xpOf(childAId)

    const req = new Request(`http://t/api/completions/${completionId}/approve`, {
      method: 'POST',
      headers: agentHeaders(childARef),
    })
    const res = await APPROVE_COMPLETION(req, { params: { id: completionId } })
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')
    expect(await xpOf(childAId)).toBe(before) // no XP awarded
    const row = await prisma.choreCompletion.findUnique({ where: { id: completionId } })
    expect(row?.status).toBe('pending') // not approved
  })
})

// ===========================================================================
// A-SEC-3 — agent token (missing / invalid), never falls through
// ===========================================================================

describe('A-SEC-3 agent token enforcement', () => {
  it('missing x-agent-token (and no session) → 401, does not act as anyone', async () => {
    const { childAId } = await getRefs()
    const req = new Request(`http://t/api/progress?user=${childAId}`, {
      // deliberately NO x-agent-token, NO x-actor-ref
      headers: { 'content-type': 'application/json' },
    })
    const res = await GET_PROGRESS(req)
    const env = await res.json()

    expect(res.status).toBe(401)
    expect(env.ok).toBe(false)
    expect(env.data).toBeUndefined()
  })

  it('invalid x-agent-token → 401', async () => {
    const { childAId } = await getRefs()
    const req = new Request(`http://t/api/progress?user=${childAId}`, {
      headers: {
        'x-agent-token': `${AGENT_TOKEN}-tampered`,
        'x-actor-ref': 'gw:child-a',
        'content-type': 'application/json',
      },
    })
    const res = await GET_PROGRESS(req)
    const env = await res.json()

    expect(res.status).toBe(401)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('UNAUTHORIZED')
    expect(env.data).toBeUndefined()
  })

  it('valid token but missing x-actor-ref → 401', async () => {
    const req = new Request('http://t/api/progress?user=usr_test_child_a', {
      headers: {
        'x-agent-token': AGENT_TOKEN,
        'content-type': 'application/json',
      },
    })
    const res = await GET_PROGRESS(req)
    const env = await res.json()

    expect(res.status).toBe(401)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('UNAUTHORIZED')
    expect(env.data).toBeUndefined()
  })
})

// ===========================================================================
// Cross-family object access (assertFamily) — parent A vs family B objects
// ===========================================================================

describe('cross-family object access', () => {
  it("parent A approving family B's completion → 403, no XP awarded, still pending", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()
    const before = await xpOf(famB.childId)

    const req = new Request(`http://t/api/completions/${famB.completionId}/approve`, {
      method: 'POST',
      headers: agentHeaders(parentRef),
    })
    const res = await APPROVE_COMPLETION(req, { params: { id: famB.completionId } })
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')
    expect(await xpOf(famB.childId)).toBe(before) // 150, untouched
    const row = await prisma.choreCompletion.findUnique({ where: { id: famB.completionId } })
    expect(row?.status).toBe('pending')
  })

  it("parent A granting bonus XP to family B's child → 403, XP unchanged", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()
    const before = await xpOf(famB.childId)

    const req = new Request('http://t/api/bonus', {
      method: 'POST',
      headers: agentHeaders(parentRef),
      body: JSON.stringify({ user: famB.childId, amount: 999 }),
    })
    const res = await POST_BONUS(req)
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')
    expect(await xpOf(famB.childId)).toBe(before)
  })
})
