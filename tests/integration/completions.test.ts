/**
 * tests/integration/completions.test.ts — API integration for the completion +
 * approval flow (E2E strategy §4A: A-TOOL-1, A-TOOL-2, plus reject & authz).
 *
 * Drives the real route handlers against the real test Postgres (no HTTP server
 * boot). Assertions look at DB side-effects (ChoreCompletion rows) and XP
 * (UserProgress.totalXp) — never at reply/UI wording. XP is computed with the
 * same lib the route uses (lib/point-rules.xpForSubmission) so the on-time/late
 * expectation is exact and deterministic regardless of wall-clock run time.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { POST } from '@/app/api/completions/route'
import { GET as listCompletions } from '@/app/api/completions/route'
import { POST as approve } from '@/app/api/completions/[id]/approve/route'
import { POST as reject } from '@/app/api/completions/[id]/reject/route'
import { POST as unapprove } from '@/app/api/completions/[id]/unapprove/route'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { AGENT_TOKEN, agentHeaders, jsonBody } from './helpers/actor'
import { IDS } from '@/prisma/seed.test'
import { xpForSubmission, deadlineForDueTime } from '@/lib/point-rules'
import { THAI_LOCAL_OFFSET_MS } from '@/lib/clock'

const COMPLETIONS_URL = 'http://t/api/completions'

/** A tiny real image file for a photo upload. */
function photoFile(): File {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'proof.jpg', {
    type: 'image/jpeg',
  })
}

/**
 * Build a multipart POST /api/completions Request as an agent acting for
 * `actorRef`. Deliberately omits content-type so undici sets the multipart
 * boundary (agentHeaders' JSON default would break req.formData()).
 */
function submitRequest(
  actorRef: string,
  fields: Record<string, string>,
  photo?: File,
): Request {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  if (photo) fd.set('photo', photo)
  return new Request(COMPLETIONS_URL, {
    method: 'POST',
    headers: { 'x-agent-token': AGENT_TOKEN, 'x-actor-ref': actorRef },
    body: fd,
  })
}

/** Submit the dishes chore (with a photo) for childA and return the new id. */
async function submitDishes(childARef: string): Promise<string> {
  const res = await POST(submitRequest(childARef, { chore_id: IDS.choreDishes }, photoFile()))
  const env = await res.json()
  expect(env.ok).toBe(true)
  return env.data.completion.id as string
}

/** Expected XP for a dishes completion, computed the way the route does. */
async function expectedDishesXp(completionId: string): Promise<number> {
  const completion = await prisma.choreCompletion.findUniqueOrThrow({
    where: { id: completionId },
  })
  const chore = await prisma.chore.findUniqueOrThrow({ where: { id: IDS.choreDishes } })
  const s = completion.submittedAt
  const dueAt = deadlineForDueTime(s, chore.dueTime, THAI_LOCAL_OFFSET_MS)
  if (!dueAt) return chore.xpValue
  return xpForSubmission(chore.xpValue, dueAt, s, chore.lateXpMultiplier)
}

beforeEach(async () => {
  await resetAndSeed()
})

describe('POST /api/completions — submit (A-TOOL-1)', () => {
  it('A-TOOL-1: child submits an assigned chore → 201 + a pending ChoreCompletion row', async () => {
    const { childAId, childARef } = await getRefs()

    const res = await POST(
      submitRequest(childARef, { chore_id: IDS.choreDishes }, photoFile()),
    )
    const env = await res.json()

    expect(res.status).toBe(201)
    expect(env.ok).toBe(true)
    expect(env.data.status).toBe('submitted')

    const rows = await prisma.choreCompletion.findMany({
      where: { completedBy: childAId, choreId: IDS.choreDishes },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('pending')
    expect(rows[0].photoUrl).toBeTruthy()
    expect(rows[0].xpAwarded).toBe(0)
    expect(env.data.completion.id).toBe(rows[0].id)
  })

  it('no chore_id → returns the choose_chore list and creates NO completion row', async () => {
    const { childARef } = await getRefs()

    const res = await POST(submitRequest(childARef, {}))
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.ok).toBe(true)
    expect(env.data.status).toBe('choose_chore')
    expect(Array.isArray(env.data.pendingChores)).toBe(true)
    expect(env.data.pendingChores.length).toBeGreaterThan(0)

    expect(await prisma.choreCompletion.count()).toBe(0)
  })

  it('requirePhoto chore submitted without a photo → 400 and no completion row', async () => {
    const { childARef } = await getRefs()

    const res = await POST(submitRequest(childARef, { chore_id: IDS.choreDishes }))
    const env = await res.json()

    expect(res.status).toBe(400)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('BAD_REQUEST')

    expect(await prisma.choreCompletion.count()).toBe(0)
  })
})

describe('GET /api/completions?status=pending — the approval queue', () => {
  it('carries the chore deadline so a parent can see what the submission is judged against', async () => {
    const { childARef, parentRef } = await getRefs()
    const id = await submitDishes(childARef)

    const res = await listCompletions(
      new Request(`${COMPLETIONS_URL}?status=pending`, { headers: agentHeaders(parentRef) }),
    )
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.ok).toBe(true)
    const row = env.data.completions.find((c: { id: string }) => c.id === id)
    expect(row).toBeDefined()
    // The queue is where a parent decides on-time vs late, so both halves of
    // that rule have to reach the client — dueTime alone can't price a late
    // submission, and the multiplier alone has nothing to compare against.
    expect(row.chore.dueTime).toBe('20:00')
    expect(typeof row.chore.lateXpMultiplier).toBe('number')
    expect(row.submittedAt).toBeTruthy()
  })
})

describe('POST /api/completions/:id/approve — approve (A-TOOL-2)', () => {
  it('A-TOOL-2: parent approves → status=approved and totalXp += XP computed via lib', async () => {
    const { childAId, childARef, parentRef } = await getRefs()

    const before = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childAId } })
    expect(before.totalXp).toBe(150) // seed fixture

    const id = await submitDishes(childARef)
    const expXp = await expectedDishesXp(id)
    expect(expXp).toBeGreaterThan(0)
    expect(expXp).toBeLessThanOrEqual(50)

    const req = new Request(`${COMPLETIONS_URL}/${id}/approve`, {
      method: 'POST',
      headers: agentHeaders(parentRef),
    })
    const res = await approve(req, { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.ok).toBe(true)
    expect(env.data.completion.status).toBe('approved')
    expect(env.data.completion.xpAwarded).toBe(expXp)

    const row = await prisma.choreCompletion.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('approved')
    expect(row.xpAwarded).toBe(expXp)
    expect(row.reviewedBy).toBeTruthy()
    expect(row.reviewedAt).toBeTruthy()

    const after = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childAId } })
    expect(after.totalXp).toBe(150 + expXp)
  })

  it('parent approves with an XP override + note → xpAwarded=override, feedback=note', async () => {
    const { childAId, childARef, parentRef } = await getRefs()
    const before = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childAId } })

    const id = await submitDishes(childARef)
    const req = new Request(`${COMPLETIONS_URL}/${id}/approve`, {
      method: 'POST',
      headers: agentHeaders(parentRef),
      body: jsonBody({ xpAwarded: 200, note: 'ทำได้ดีมาก โบนัสพิเศษ' }),
    })
    const res = await approve(req, { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.data.completion.xpAwarded).toBe(200)

    const row = await prisma.choreCompletion.findUniqueOrThrow({ where: { id } })
    expect(row.xpAwarded).toBe(200)
    expect(row.feedback).toBe('ทำได้ดีมาก โบนัสพิเศษ')

    const after = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childAId } })
    expect(after.totalXp).toBe(before.totalXp + 200)
  })
})

describe('POST /api/completions/:id/reject — reject', () => {
  it('parent rejects with feedback → status=rejected, feedback stored, totalXp unchanged', async () => {
    const { childAId, childARef, parentRef } = await getRefs()

    const id = await submitDishes(childARef)

    const req = new Request(`${COMPLETIONS_URL}/${id}/reject`, {
      method: 'POST',
      headers: agentHeaders(parentRef),
      body: jsonBody({ feedback: 'ยังไม่สะอาดพอ ลองอีกที' }),
    })
    const res = await reject(req, { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.ok).toBe(true)
    expect(env.data.completion.status).toBe('rejected')

    const row = await prisma.choreCompletion.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('rejected')
    expect(row.feedback).toBe('ยังไม่สะอาดพอ ลองอีกที')
    expect(row.xpAwarded).toBe(0)

    const after = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childAId } })
    expect(after.totalXp).toBe(150) // no XP granted on rejection
  })
})

describe('approve authz — role + cross-family', () => {
  it('a child actor approving → 403 (parents only), status stays pending', async () => {
    const { childAId, childARef } = await getRefs()

    const completion = await prisma.choreCompletion.create({
      data: { choreId: IDS.choreDishes, completedBy: childAId, status: 'pending' },
    })

    const req = new Request(`${COMPLETIONS_URL}/${completion.id}/approve`, {
      method: 'POST',
      headers: agentHeaders(childARef),
    })
    const res = await approve(req, { params: { id: completion.id } })
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')

    const row = await prisma.choreCompletion.findUniqueOrThrow({ where: { id: completion.id } })
    expect(row.status).toBe('pending')
  })

  it('a parent from another family approving → 403, no XP awarded', async () => {
    const { childAId } = await getRefs()

    // A pending completion in the seeded family...
    const completion = await prisma.choreCompletion.create({
      data: { choreId: IDS.choreDishes, completedBy: childAId, status: 'pending' },
    })

    // ...and an unrelated family + parent that must not be able to touch it.
    await prisma.family.create({ data: { id: 'fam_other', name: 'ครอบครัวอื่น' } })
    await prisma.user.create({
      data: {
        id: 'usr_other_parent',
        name: 'พ่อบ้านอื่น',
        role: 'parent',
        familyId: 'fam_other',
        email: 'other@test.local',
        passwordHash: 'x',
        channelUserRef: 'gw:other-parent',
      },
    })

    const req = new Request(`${COMPLETIONS_URL}/${completion.id}/approve`, {
      method: 'POST',
      headers: agentHeaders('gw:other-parent'),
    })
    const res = await approve(req, { params: { id: completion.id } })
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')

    const row = await prisma.choreCompletion.findUniqueOrThrow({ where: { id: completion.id } })
    expect(row.status).toBe('pending')
    const progress = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childAId } })
    expect(progress.totalXp).toBe(150)
  })
})

describe('POST /api/completions/:id/unapprove — undo an approval', () => {
  /** Approve childA's dishes chore and return { id, xp }. */
  async function approveDishes(childARef: string, parentRef: string) {
    const id = await submitDishes(childARef)
    const xp = await expectedDishesXp(id)
    const res = await approve(
      new Request(`${COMPLETIONS_URL}/${id}/approve`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
      }),
      { params: { id } },
    )
    expect(res.status).toBe(200)
    return { id, xp }
  }

  function unapproveRequest(id: string, actorRef: string): Request {
    return new Request(`${COMPLETIONS_URL}/${id}/unapprove`, {
      method: 'POST',
      headers: agentHeaders(actorRef),
    })
  }

  it('parent undoes an approval → back to pending, XP clawed back, photo kept', async () => {
    const { childAId, childARef, parentRef } = await getRefs()
    const { id, xp } = await approveDishes(childARef, parentRef)

    const mid = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childAId } })
    expect(mid.totalXp).toBe(150 + xp)

    const res = await unapprove(unapproveRequest(id, parentRef), { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.ok).toBe(true)
    expect(env.data.completion.status).toBe('pending')
    expect(env.data.completion.xpRevoked).toBe(xp)
    expect(env.data.progress.totalXp).toBe(150)
    // This was the child's only approved chore today, so undoing it takes the
    // day back out of the streak — the response must not claim otherwise.
    expect(env.data.streakUnchanged).toBe(false)
    expect(env.data.streak).toEqual({ current: 0, changed: true })

    const row = await prisma.choreCompletion.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('pending')
    expect(row.xpAwarded).toBe(0)
    expect(row.reviewedBy).toBeNull()
    expect(row.reviewedAt).toBeNull()
    expect(row.feedback).toBeNull()
    // The child's proof must survive so the chore can simply be re-reviewed.
    expect(row.photoUrl).toBeTruthy()

    const after = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childAId } })
    expect(after.totalXp).toBe(150)
  })

  it('revokes the badge that approval earned, so re-approving celebrates it again', async () => {
    const { childAId, childARef, parentRef } = await getRefs()
    expect(await prisma.userBadge.count({ where: { userId: childAId } })).toBe(0)

    const { id } = await approveDishes(childARef, parentRef)
    // The first approved chore earns "งานแรกของฉัน" (total_completions >= 1).
    const firstChore = await prisma.badge.findFirstOrThrow({
      where: { conditionType: 'total_completions', conditionValue: 1 },
    })
    expect(
      await prisma.userBadge.count({ where: { userId: childAId, badgeId: firstChore.id } }),
    ).toBe(1)

    const res = await unapprove(unapproveRequest(id, parentRef), { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.data.revokedBadges.map((b: { id: string }) => b.id)).toContain('first_chore')
    expect(
      await prisma.userBadge.count({ where: { userId: childAId, badgeId: firstChore.id } }),
    ).toBe(0)
  })

  it('keeps a badge this undo did not invalidate (point-in-time Speed Demon)', async () => {
    const { childAId, childARef, parentRef } = await getRefs()

    // Speed Demon is judged at the moment of approval and cannot be recomputed
    // afterwards — a naive "recompute and drop what no longer qualifies" would
    // wrongly strip it off the child on any later undo.
    const speedDemon = await prisma.badge.findFirstOrThrow({
      where: { conditionType: 'all_before_noon' },
    })
    await prisma.userBadge.create({ data: { userId: childAId, badgeId: speedDemon.id } })

    const { id } = await approveDishes(childARef, parentRef)
    const res = await unapprove(unapproveRequest(id, parentRef), { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(200)
    expect(env.data.revokedBadges.map((b: { id: string }) => b.id)).not.toContain('speed_demon')
    expect(
      await prisma.userBadge.count({ where: { userId: childAId, badgeId: speedDemon.id } }),
    ).toBe(1)
  })

  it('undoing a pending completion → 409 and nothing changes', async () => {
    const { childAId, childARef, parentRef } = await getRefs()
    const id = await submitDishes(childARef)

    const res = await unapprove(unapproveRequest(id, parentRef), { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(409)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('CONFLICT')

    const row = await prisma.choreCompletion.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('pending')
    const progress = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childAId } })
    expect(progress.totalXp).toBe(150)
  })

  it('a child actor undoing → 403, the approval stands', async () => {
    const { childAId, childARef, parentRef } = await getRefs()
    const { id, xp } = await approveDishes(childARef, parentRef)

    const res = await unapprove(unapproveRequest(id, childARef), { params: { id } })
    const env = await res.json()

    expect(res.status).toBe(403)
    expect(env.error.code).toBe('FORBIDDEN')

    const row = await prisma.choreCompletion.findUniqueOrThrow({ where: { id } })
    expect(row.status).toBe('approved')
    const progress = await prisma.userProgress.findUniqueOrThrow({ where: { userId: childAId } })
    expect(progress.totalXp).toBe(150 + xp)
  })
})
