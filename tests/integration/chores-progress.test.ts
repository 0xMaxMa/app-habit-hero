/**
 * tests/integration/chores-progress.test.ts — §4A A-API-CHORE / A-API-TODAY /
 * A-API-PROG.
 *
 * Route-handler-import integration tests (no server boot) against the real test
 * Postgres. Covers the chore collection + single-chore endpoints, the child
 * "งานวันนี้" list, and the progress endpoint (single-user + weekly summary),
 * including authz. All business math is asserted through lib/level — never
 * recomputed here.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GET as listChores, POST as createChore } from '@/app/api/chores/route'
import { PATCH as patchChore, DELETE as deleteChore } from '@/app/api/chores/[id]/route'
import { GET as todayChores } from '@/app/api/chores/today/route'
import { GET as getProgress } from '@/app/api/progress/route'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { agentHeaders, jsonBody } from './helpers/actor'
import { levelForXp, xpToNextLevel } from '@/lib/level'

// Seeded chore ids (prisma/seed.test.ts).
const CHORE_DISHES = 'chore_test_dishes' // 50 XP, daily, assigned → น้องเอ (childA)
const CHORE_TOYS = 'chore_test_toys' // 30 XP, daily, shared (any child)
const CHORE_CAR = 'chore_test_car' // 100 XP, once, shared, isExtra

// Seeded UserProgress (prisma/seed.test.ts).
const CHILD_A_XP = 150
const CHILD_A_STREAK = 2
const CHILD_B_XP = 600
const CHILD_B_STREAK = 0

beforeEach(async () => {
  await resetAndSeed()
})

describe('A-API-CHORE — POST/GET /api/chores', () => {
  it('parent creates a chore → row lands in the family and shows in GET list', async () => {
    const { parentRef, familyId } = await getRefs()

    const req = new Request('http://t/api/chores', {
      method: 'POST',
      headers: agentHeaders(parentRef),
      body: jsonBody({ title: 'จัดโต๊ะเรียน', xpValue: 20, recurrence: 'daily' }),
    })
    const res = await createChore(req)
    const env = await res.json()

    expect(res.status).toBe(201)
    expect(env.ok).toBe(true)
    const created = env.data.chore
    expect(created.title).toBe('จัดโต๊ะเรียน')
    expect(created.xpValue).toBe(20)
    expect(created.recurrence).toBe('daily')
    expect(created.familyId).toBe(familyId)
    expect(created.assignedTo).toBeNull() // unassigned → shared

    // Persisted in the family.
    const row = await prisma.chore.findUnique({ where: { id: created.id } })
    expect(row?.familyId).toBe(familyId)

    // Appears in GET /api/chores for the family.
    const listRes = await listChores(
      new Request('http://t/api/chores', { headers: agentHeaders(parentRef) }),
    )
    const listEnv = await listRes.json()
    expect(listEnv.ok).toBe(true)
    const ids = listEnv.data.chores.map((c: { id: string }) => c.id)
    expect(ids).toContain(created.id)
  })

  it('a daily shared chore just created also appears in childA\'s งานวันนี้', async () => {
    const { parentRef, childAId } = await getRefs()

    const createRes = await createChore(
      new Request('http://t/api/chores', {
        method: 'POST',
        headers: agentHeaders(parentRef),
        body: jsonBody({ title: 'รดน้ำต้นไม้', xpValue: 15, recurrence: 'daily' }),
      }),
    )
    const createEnv = await createRes.json()
    const newId = createEnv.data.chore.id

    const todayRes = await todayChores(
      new Request(`http://t/api/chores/today?child=${childAId}`, {
        headers: agentHeaders(parentRef),
      }),
    )
    const todayEnv = await todayRes.json()
    expect(todayEnv.ok).toBe(true)
    const todayIds = todayEnv.data.chores.map((c: { id: string }) => c.id)
    expect(todayIds).toContain(newId)
  })

  it('POST /api/chores by a child is forbidden (parent-only)', async () => {
    const { childARef } = await getRefs()
    const res = await createChore(
      new Request('http://t/api/chores', {
        method: 'POST',
        headers: agentHeaders(childARef),
        body: jsonBody({ title: 'no', xpValue: 5, recurrence: 'daily' }),
      }),
    )
    const env = await res.json()
    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')
  })
})

describe('A-API-CHORE — category + recurDays (item 6/7)', () => {
  it('auto-classifies category from the title when none is given', async () => {
    const { parentRef } = await getRefs()
    const res = await createChore(
      new Request('http://t/api/chores', {
        method: 'POST',
        headers: agentHeaders(parentRef),
        body: jsonBody({ title: 'ล้างจานหลังอาหาร', xpValue: 20 }),
      }),
    )
    const env = await res.json()
    expect(res.status).toBe(201)
    expect(env.data.chore.category).toBe('cleaning') // "ล้าง…" → cleaning
  })

  it('an explicit category overrides the title inference', async () => {
    const { parentRef } = await getRefs()
    const res = await createChore(
      new Request('http://t/api/chores', {
        method: 'POST',
        headers: agentHeaders(parentRef),
        body: jsonBody({ title: 'ล้างจาน', xpValue: 20, category: 'cooking' }),
      }),
    )
    const env = await res.json()
    expect(env.data.chore.category).toBe('cooking')
  })

  it('accepts the newer categories (exercise / routine / helping) verbatim', async () => {
    const { parentRef } = await getRefs()
    for (const category of ['exercise', 'routine', 'helping'] as const) {
      const res = await createChore(
        new Request('http://t/api/chores', {
          method: 'POST',
          headers: agentHeaders(parentRef),
          body: jsonBody({ title: `งาน ${category}`, xpValue: 15, category }),
        }),
      )
      const env = await res.json()
      expect(res.status).toBe(201)
      expect(env.data.chore.category).toBe(category)
    }
  })

  it('recurDays are deduped + sorted on create, and a weekly chore is hidden on off-days', async () => {
    const { parentRef, childAId } = await getRefs()
    const todayWeekday = new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCDay()
    const offDay = (todayWeekday + 2) % 7

    // Restricted to a single day that is NOT today → excluded from งานวันนี้.
    const offRes = await createChore(
      new Request('http://t/api/chores', {
        method: 'POST',
        headers: agentHeaders(parentRef),
        body: jsonBody({
          title: 'ซักผ้าเฉพาะวัน',
          xpValue: 25,
          recurrence: 'weekly',
          recurDays: [offDay, offDay, offDay], // duplicates → deduped
        }),
      }),
    )
    const offEnv = await offRes.json()
    expect(offEnv.data.chore.recurDays).toEqual([offDay]) // deduped + sorted
    const offId = offEnv.data.chore.id

    // Restricted to today → appears in งานวันนี้.
    const onRes = await createChore(
      new Request('http://t/api/chores', {
        method: 'POST',
        headers: agentHeaders(parentRef),
        body: jsonBody({
          title: 'จัดโต๊ะวันนี้',
          xpValue: 25,
          recurrence: 'weekly',
          recurDays: [todayWeekday],
        }),
      }),
    )
    const onId = (await onRes.json()).data.chore.id

    const todayEnv = await (
      await todayChores(
        new Request(`http://t/api/chores/today?child=${childAId}`, {
          headers: agentHeaders(parentRef),
        }),
      )
    ).json()
    const ids = todayEnv.data.chores.map((c: { id: string }) => c.id)
    expect(ids).toContain(onId)
    expect(ids).not.toContain(offId)
  })
})

describe('A-API-TODAY — GET /api/chores/today', () => {
  it('returns only childA\'s still-pending chores (assigned-to-A + shared)', async () => {
    const { childARef, childAId } = await getRefs()

    const res = await todayChores(
      new Request(`http://t/api/chores/today?child=${childAId}`, {
        headers: agentHeaders(childARef),
      }),
    )
    const env = await res.json()
    expect(env.ok).toBe(true)
    expect(env.data.child).toBe(childAId)

    const ids = env.data.chores.map((c: { id: string }) => c.id).sort()
    // dishes (assigned A) + toys (shared daily) + car (shared once) all pending.
    expect(ids).toEqual([CHORE_CAR, CHORE_DISHES, CHORE_TOYS].sort())
  })

  it('excludes childA\'s chore that was already completed today', async () => {
    const { childARef, childAId } = await getRefs()

    // Approve-status completion of the dishes chore, submitted "now" (today).
    await prisma.choreCompletion.create({
      data: {
        choreId: CHORE_DISHES,
        completedBy: childAId,
        status: 'approved',
        submittedAt: new Date(),
      },
    })

    const res = await todayChores(
      new Request(`http://t/api/chores/today?child=${childAId}`, {
        headers: agentHeaders(childARef),
      }),
    )
    const env = await res.json()
    const ids = env.data.chores.map((c: { id: string }) => c.id)

    expect(ids).not.toContain(CHORE_DISHES) // done today → excluded
    expect(ids).toContain(CHORE_TOYS) // still pending
    expect(ids).toContain(CHORE_CAR)
  })

  it('childB does not see dishes (assigned to childA), only shared chores', async () => {
    const { childBRef, childBId } = await getRefs()

    const res = await todayChores(
      new Request(`http://t/api/chores/today?child=${childBId}`, {
        headers: agentHeaders(childBRef),
      }),
    )
    const env = await res.json()
    const ids = env.data.chores.map((c: { id: string }) => c.id).sort()
    expect(ids).toEqual([CHORE_CAR, CHORE_TOYS].sort())
    expect(ids).not.toContain(CHORE_DISHES)
  })

  it('a child requesting another child\'s งานวันนี้ is forbidden', async () => {
    const { childARef, childBId } = await getRefs()
    const res = await todayChores(
      new Request(`http://t/api/chores/today?child=${childBId}`, {
        headers: agentHeaders(childARef),
      }),
    )
    const env = await res.json()
    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')
  })
})

describe('A-API-PROG — GET /api/progress', () => {
  it('single-user: childA xp/level/streak match seed (level + xpToNext via lib/level)', async () => {
    const { childARef, childAId } = await getRefs()

    const res = await getProgress(
      new Request(`http://t/api/progress?user=${childAId}`, {
        headers: agentHeaders(childARef),
      }),
    )
    const env = await res.json()
    expect(env.ok).toBe(true)
    const d = env.data

    expect(d.userId).toBe(childAId)
    expect(d.xp).toBe(CHILD_A_XP)
    expect(d.streak).toBe(CHILD_A_STREAK)
    // Math lives in lib/level — assert against it, and pin the concrete values.
    expect(d.level).toBe(levelForXp(CHILD_A_XP))
    expect(d.level).toBe(2)
    expect(d.xpToNext).toBe(xpToNextLevel(CHILD_A_XP))
    expect(d.xpToNext).toBe(263) // 413 (L3) - 150
  })

  it('single-user: childB (600 XP) → level 3, xpToNext 330', async () => {
    const { parentRef, childBId } = await getRefs()

    const res = await getProgress(
      new Request(`http://t/api/progress?user=${childBId}`, {
        headers: agentHeaders(parentRef),
      }),
    )
    const d = (await res.json()).data
    expect(d.xp).toBe(CHILD_B_XP)
    expect(d.streak).toBe(CHILD_B_STREAK)
    expect(d.level).toBe(levelForXp(CHILD_B_XP))
    expect(d.level).toBe(3)
    expect(d.xpToNext).toBe(xpToNextLevel(CHILD_B_XP))
    expect(d.xpToNext).toBe(330) // 930 (L4) - 600
  })

  it('weekly scope as a parent → one row per child with correct numbers', async () => {
    const { parentRef, childAId, childBId } = await getRefs()

    const res = await getProgress(
      new Request('http://t/api/progress?scope=weekly', {
        headers: agentHeaders(parentRef),
      }),
    )
    const env = await res.json()
    expect(env.ok).toBe(true)
    expect(env.data.scope).toBe('weekly')

    const rows = env.data.children as Array<{
      userId: string
      xp: number
      level: number
      xpToNext: number
      streak: number
    }>
    expect(rows).toHaveLength(2) // exactly the two seeded children

    const a = rows.find((r) => r.userId === childAId)!
    const b = rows.find((r) => r.userId === childBId)!
    expect(a.xp).toBe(CHILD_A_XP)
    expect(a.level).toBe(levelForXp(CHILD_A_XP))
    expect(a.xpToNext).toBe(xpToNextLevel(CHILD_A_XP))
    expect(a.streak).toBe(CHILD_A_STREAK)
    expect(b.xp).toBe(CHILD_B_XP)
    expect(b.level).toBe(levelForXp(CHILD_B_XP))
    expect(b.xpToNext).toBe(xpToNextLevel(CHILD_B_XP))
    expect(b.streak).toBe(CHILD_B_STREAK)
  })

  it('weekly scope as a child → forbidden (parent-only)', async () => {
    const { childARef } = await getRefs()
    const res = await getProgress(
      new Request('http://t/api/progress?scope=weekly', {
        headers: agentHeaders(childARef),
      }),
    )
    const env = await res.json()
    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')
  })

  it('authz: a child reading another child\'s progress → forbidden', async () => {
    const { childARef, childBId } = await getRefs()
    const res = await getProgress(
      new Request(`http://t/api/progress?user=${childBId}`, {
        headers: agentHeaders(childARef),
      }),
    )
    const env = await res.json()
    expect(res.status).toBe(403)
    expect(env.ok).toBe(false)
    expect(env.error.code).toBe('FORBIDDEN')
  })
})

describe('chore PATCH / DELETE — /api/chores/[id]', () => {
  it('parent edits xpValue → persisted', async () => {
    const { parentRef } = await getRefs()

    const res = await patchChore(
      new Request(`http://t/api/chores/${CHORE_TOYS}`, {
        method: 'PATCH',
        headers: agentHeaders(parentRef),
        body: jsonBody({ xpValue: 45 }),
      }),
      { params: { id: CHORE_TOYS } },
    )
    const env = await res.json()
    expect(env.ok).toBe(true)
    expect(env.data.chore.xpValue).toBe(45)

    const row = await prisma.chore.findUnique({ where: { id: CHORE_TOYS } })
    expect(row?.xpValue).toBe(45)
  })

  it('DELETE a chore with no completions → gone from GET list', async () => {
    const { parentRef } = await getRefs()

    // Fresh chore with no completion history is deletable.
    const createEnv = await (
      await createChore(
        new Request('http://t/api/chores', {
          method: 'POST',
          headers: agentHeaders(parentRef),
          body: jsonBody({ title: 'ชั่วคราว', xpValue: 5, recurrence: 'once' }),
        }),
      )
    ).json()
    const id = createEnv.data.chore.id

    const delRes = await deleteChore(
      new Request(`http://t/api/chores/${id}`, {
        method: 'DELETE',
        headers: agentHeaders(parentRef),
      }),
      { params: { id } },
    )
    const delEnv = await delRes.json()
    expect(delEnv.ok).toBe(true)
    expect(delEnv.data.deleted).toBe(id)

    const listEnv = await (
      await listChores(
        new Request('http://t/api/chores', { headers: agentHeaders(parentRef) }),
      )
    ).json()
    const ids = listEnv.data.chores.map((c: { id: string }) => c.id)
    expect(ids).not.toContain(id)
    expect(await prisma.chore.findUnique({ where: { id } })).toBeNull()
  })

  it('DELETE a chore WITH completion history → 409, chore + completion remain', async () => {
    const { parentRef, childAId } = await getRefs()

    const completion = await prisma.choreCompletion.create({
      data: {
        choreId: CHORE_DISHES,
        completedBy: childAId,
        status: 'approved',
        submittedAt: new Date(),
      },
    })

    const delRes = await deleteChore(
      new Request(`http://t/api/chores/${CHORE_DISHES}`, {
        method: 'DELETE',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: CHORE_DISHES } },
    )
    const delEnv = await delRes.json()
    expect(delRes.status).toBe(409)
    expect(delEnv.ok).toBe(false)
    expect(delEnv.error.code).toBe('CONFLICT')
    expect(delEnv.error.completionCount).toBe(1)

    // Chore still present; the completion (soft ref) survives.
    expect(await prisma.chore.findUnique({ where: { id: CHORE_DISHES } })).not.toBeNull()
    expect(
      await prisma.choreCompletion.findUnique({ where: { id: completion.id } }),
    ).not.toBeNull()
  })

  it('DELETE a chore WITH history and ?force=1 → 200, chore + completions gone', async () => {
    const { parentRef, childAId } = await getRefs()

    const completion = await prisma.choreCompletion.create({
      data: {
        choreId: CHORE_DISHES,
        completedBy: childAId,
        status: 'approved',
        submittedAt: new Date(),
      },
    })

    const delRes = await deleteChore(
      new Request(`http://t/api/chores/${CHORE_DISHES}?force=1`, {
        method: 'DELETE',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: CHORE_DISHES } },
    )
    const delEnv = await delRes.json()
    expect(delRes.status).toBe(200)
    expect(delEnv.ok).toBe(true)
    expect(delEnv.data.deleted).toBe(CHORE_DISHES)

    // Both the chore and its history are gone.
    expect(await prisma.chore.findUnique({ where: { id: CHORE_DISHES } })).toBeNull()
    expect(
      await prisma.choreCompletion.findUnique({ where: { id: completion.id } }),
    ).toBeNull()
  })
})
