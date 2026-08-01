/**
 * tests/integration/settings.test.ts — API integration for the Settings surface
 * (S8): family rename, the member roster CRUD, and the one-time setup guard.
 *
 * Drives the real route handlers against the real test Postgres (no HTTP boot),
 * asserting DB side-effects — never UI wording. The seeded fixture already has a
 * parent + two children (prisma/seed.test.ts), so `needsSetup` is false and the
 * bootstrap endpoint must refuse.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { GET as setupGet, POST as setupPost } from '@/app/api/setup/route'
import { GET as familyGet, PATCH as familyPatch } from '@/app/api/family/route'
import { GET as membersGet, POST as membersPost } from '@/app/api/members/route'
import { PATCH as memberPatch, DELETE as memberDelete } from '@/app/api/members/[id]/route'
import { PATCH as passwordPatch } from '@/app/api/account/password/route'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { agentHeaders } from './helpers/actor'
import bcrypt from 'bcryptjs'

const ORIGIN = 'http://t'

function jsonReq(url: string, actorRef: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: agentHeaders(actorRef),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(async () => {
  await resetAndSeed()
})

describe('setup (one-time bootstrap)', () => {
  it('GET reports needsSetup=false once a parent exists', async () => {
    const res = await setupGet(new Request(`${ORIGIN}/api/setup`))
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.data.needsSetup).toBe(false)
  })

  it('POST refuses (409) when a parent already exists', async () => {
    const res = await setupPost(
      new Request(`${ORIGIN}/api/setup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'new@x.local', password: 'password123' }),
      }),
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('CONFLICT')
    // No second family/parent was created.
    expect(await prisma.family.count()).toBe(1)
  })
})

describe('family rename', () => {
  it('parent can rename their own family', async () => {
    const { parentRef, familyId } = await getRefs()
    const res = await familyPatch(
      jsonReq(`${ORIGIN}/api/family`, parentRef, 'PATCH', { name: 'ครอบครัวใหม่' }),
    )
    expect(res.status).toBe(200)
    const fam = await prisma.family.findUnique({ where: { id: familyId } })
    expect(fam?.name).toBe('ครอบครัวใหม่')
  })

  it('GET returns the family for any family member', async () => {
    const { childARef, familyId } = await getRefs()
    const res = await familyGet(jsonReq(`${ORIGIN}/api/family`, childARef, 'GET'))
    const body = await res.json()
    expect(body.data.family.id).toBe(familyId)
  })
})

describe('members roster', () => {
  it('GET lists the family, never leaking pinHash', async () => {
    const { parentRef } = await getRefs()
    const res = await membersGet(jsonReq(`${ORIGIN}/api/members`, parentRef, 'GET'))
    const body = await res.json()
    expect(body.ok).toBe(true)
    const members = body.data.members
    expect(members.length).toBeGreaterThanOrEqual(3) // parent + 2 children
    for (const m of members) {
      expect(m).not.toHaveProperty('pinHash')
      expect(typeof m.hasPin).toBe('boolean')
    }
  })

  it('POST adds a child with a hashed PIN + a progress row', async () => {
    const { parentRef, familyId } = await getRefs()
    const res = await membersPost(
      jsonReq(`${ORIGIN}/api/members`, parentRef, 'POST', { name: 'น้องซี', pin: '4321' }),
    )
    expect(res.status).toBe(201)
    const id = (await res.json()).data.member.id

    const child = await prisma.user.findUnique({ where: { id } })
    expect(child?.role).toBe('child')
    expect(child?.familyId).toBe(familyId)
    expect(child?.pinHash).toBeTruthy()
    expect(await bcrypt.compare('4321', child!.pinHash!)).toBe(true)
    expect(await prisma.userProgress.findUnique({ where: { userId: id } })).not.toBeNull()
  })

  it('POST rejects a non-4-digit PIN (400)', async () => {
    const { parentRef } = await getRefs()
    const res = await membersPost(
      jsonReq(`${ORIGIN}/api/members`, parentRef, 'POST', { name: 'x', pin: '12' }),
    )
    expect(res.status).toBe(400)
  })

  it('PATCH renames a child and resets their PIN', async () => {
    const { parentRef, childAId } = await getRefs()
    const res = await memberPatch(
      jsonReq(`${ORIGIN}/api/members/${childAId}`, parentRef, 'PATCH', {
        name: 'น้องเอใหม่',
        pin: '9999',
      }),
      { params: { id: childAId } },
    )
    expect(res.status).toBe(200)
    const child = await prisma.user.findUnique({ where: { id: childAId } })
    expect(child?.name).toBe('น้องเอใหม่')
    expect(await bcrypt.compare('9999', child!.pinHash!)).toBe(true)
  })

  it('DELETE removes a child (with any completion history) cleanly', async () => {
    const { parentRef, childBId } = await getRefs()
    // Give the child a completion so the FK-restrict path is exercised.
    const chore = await prisma.chore.findFirstOrThrow({})
    await prisma.choreCompletion.create({
      data: { choreId: chore.id, completedBy: childBId, status: 'pending' },
    })

    const res = await memberDelete(
      jsonReq(`${ORIGIN}/api/members/${childBId}`, parentRef, 'DELETE'),
      { params: { id: childBId } },
    )
    expect(res.status).toBe(200)
    expect(await prisma.user.findUnique({ where: { id: childBId } })).toBeNull()
    expect(await prisma.choreCompletion.count({ where: { completedBy: childBId } })).toBe(0)
  })
})

describe('add co-parent', () => {
  it('POST role=parent creates a parent with a hashed password + progress row', async () => {
    const { parentRef, familyId } = await getRefs()
    const res = await membersPost(
      jsonReq(`${ORIGIN}/api/members`, parentRef, 'POST', {
        role: 'parent',
        name: 'พ่อทดสอบ',
        email: 'CoParent@Test.local',
        password: 'coparent123',
      }),
    )
    expect(res.status).toBe(201)
    const dto = (await res.json()).data.member
    expect(dto.role).toBe('parent')
    expect(dto).not.toHaveProperty('passwordHash')

    const parent = await prisma.user.findUnique({ where: { id: dto.id } })
    expect(parent?.role).toBe('parent')
    expect(parent?.familyId).toBe(familyId)
    // email is stored lowercased.
    expect(parent?.email).toBe('coparent@test.local')
    expect(await bcrypt.compare('coparent123', parent!.passwordHash!)).toBe(true)
    expect(await prisma.userProgress.findUnique({ where: { userId: dto.id } })).not.toBeNull()
  })

  it('POST role=parent with a taken email → 409', async () => {
    const { parentRef } = await getRefs()
    const res = await membersPost(
      jsonReq(`${ORIGIN}/api/members`, parentRef, 'POST', {
        role: 'parent',
        name: 'ซ้ำ',
        email: 'parent@test.local', // already the seeded parent's email
        password: 'whatever123',
      }),
    )
    expect(res.status).toBe(409)
  })

  it('a child cannot add a co-parent (403)', async () => {
    const { childARef } = await getRefs()
    const res = await membersPost(
      jsonReq(`${ORIGIN}/api/members`, childARef, 'POST', {
        role: 'parent',
        name: 'x',
        email: 'x@test.local',
        password: 'password123',
      }),
    )
    expect(res.status).toBe(403)
  })
})

describe('change own password', () => {
  it('PATCH with the correct current password updates the hash', async () => {
    const { parentRef, parentId } = await getRefs()
    const res = await passwordPatch(
      jsonReq(`${ORIGIN}/api/account/password`, parentRef, 'PATCH', {
        currentPassword: 'test1234',
        newPassword: 'brandNew123',
      }),
    )
    expect(res.status).toBe(200)
    const parent = await prisma.user.findUnique({ where: { id: parentId } })
    expect(await bcrypt.compare('brandNew123', parent!.passwordHash!)).toBe(true)
    expect(await bcrypt.compare('test1234', parent!.passwordHash!)).toBe(false)
  })

  it('PATCH with a wrong current password → 400 and no change', async () => {
    const { parentRef, parentId } = await getRefs()
    const res = await passwordPatch(
      jsonReq(`${ORIGIN}/api/account/password`, parentRef, 'PATCH', {
        currentPassword: 'wrongpass',
        newPassword: 'brandNew123',
      }),
    )
    expect(res.status).toBe(400)
    const parent = await prisma.user.findUnique({ where: { id: parentId } })
    expect(await bcrypt.compare('test1234', parent!.passwordHash!)).toBe(true)
  })

  it('a child cannot change a password via this endpoint (403)', async () => {
    const { childARef } = await getRefs()
    const res = await passwordPatch(
      jsonReq(`${ORIGIN}/api/account/password`, childARef, 'PATCH', {
        currentPassword: '1234',
        newPassword: 'brandNew123',
      }),
    )
    expect(res.status).toBe(403)
  })
})

describe('authz (T30)', () => {
  it('a child cannot add members (403)', async () => {
    const { childARef } = await getRefs()
    const res = await membersPost(
      jsonReq(`${ORIGIN}/api/members`, childARef, 'POST', { name: 'x', pin: '1234' }),
    )
    expect(res.status).toBe(403)
  })

  it('a parent cannot delete their own account (400)', async () => {
    const { parentRef, parentId } = await getRefs()
    const res = await memberDelete(
      jsonReq(`${ORIGIN}/api/members/${parentId}`, parentRef, 'DELETE'),
      { params: { id: parentId } },
    )
    expect(res.status).toBe(400)
    expect(await prisma.user.findUnique({ where: { id: parentId } })).not.toBeNull()
  })

  it('a parent CAN delete a co-parent, but not the last remaining one', async () => {
    const { parentRef, parentId, familyId } = await getRefs()

    // Add a second parent so the family has two.
    const created = await membersPost(
      jsonReq(`${ORIGIN}/api/members`, parentRef, 'POST', {
        role: 'parent',
        name: 'พ่อคนที่สอง',
        email: 'second@test.local',
        password: 'second12345',
      }),
    )
    const coParentId = (await created.json()).data.member.id as string

    // The acting parent deletes the co-parent → 200, and it's gone.
    const del = await memberDelete(
      jsonReq(`${ORIGIN}/api/members/${coParentId}`, parentRef, 'DELETE'),
      { params: { id: coParentId } },
    )
    expect(del.status).toBe(200)
    expect(await prisma.user.findUnique({ where: { id: coParentId } })).toBeNull()

    // Now only the acting parent is left — the last-parent guard still holds
    // (here it coincides with the self-guard, both returning 400).
    const parentsLeft = await prisma.user.count({
      where: { familyId, role: 'parent' },
    })
    expect(parentsLeft).toBe(1)
    const delSelf = await memberDelete(
      jsonReq(`${ORIGIN}/api/members/${parentId}`, parentRef, 'DELETE'),
      { params: { id: parentId } },
    )
    expect(delSelf.status).toBe(400)
  })

  it('no agent token → 401', async () => {
    const res = await membersGet(new Request(`${ORIGIN}/api/members`, { method: 'GET' }))
    expect(res.status).toBe(401)
  })
})
