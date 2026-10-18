/**
 * tests/integration/signup.test.ts — public, repeatable family sign-up
 * (Phase A item 1). Replaces tests/integration/setup-gate.test.ts, which
 * tested the old one-time needsSetup() gate — that gate no longer exists;
 * sign-up is now open and may happen any number of times.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { POST as signup } from '@/app/api/signup/route'
import { resetAndSeed, prisma } from './helpers/db'

const ORIGIN = 'http://t'

function signupReq(body: unknown): Request {
  return new Request(`${ORIGIN}/api/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(async () => {
  await resetAndSeed()
})

describe('POST /api/signup', () => {
  it('creates a brand-new Family + parent + progress row', async () => {
    const familiesBefore = await prisma.family.count()

    const res = await signup(
      signupReq({
        email: 'new-family@test.local',
        password: 'password123',
        parentName: 'พ่อใหม่',
        familyName: 'ครอบครัวใหม่',
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.ok).toBe(true)

    expect(await prisma.family.count()).toBe(familiesBefore + 1)
    const parent = await prisma.user.findUniqueOrThrow({
      where: { id: body.data.userId },
    })
    expect(parent.role).toBe('parent')
    expect(parent.email).toBe('new-family@test.local')
    expect(
      await prisma.userProgress.findUnique({ where: { userId: parent.id } }),
    ).not.toBeNull()

    const family = await prisma.family.findUniqueOrThrow({ where: { id: parent.familyId } })
    expect(family.name).toBe('ครอบครัวใหม่')
    expect(family.pinSlug).toBeTruthy()
  })

  it('is repeatable — a second, unrelated sign-up also succeeds (no one-time gate)', async () => {
    const familiesBefore = await prisma.family.count()

    const first = await signup(
      signupReq({ email: 'fam-one@test.local', password: 'password123' }),
    )
    expect(first.status).toBe(201)

    const second = await signup(
      signupReq({ email: 'fam-two@test.local', password: 'password123' }),
    )
    expect(second.status).toBe(201)

    expect(await prisma.family.count()).toBe(familiesBefore + 2)

    // The two new families never share a pinSlug — each gets its own.
    const firstBody = await first.json()
    const secondBody = await second.json()
    const famOne = await prisma.family.findUniqueOrThrow({ where: { id: firstBody.data.familyId } })
    const famTwo = await prisma.family.findUniqueOrThrow({ where: { id: secondBody.data.familyId } })
    expect(famOne.pinSlug).not.toBe(famTwo.pinSlug)
  })

  it('refuses a duplicate email with 409 and leaves no orphaned Family behind', async () => {
    const res = await signup(
      signupReq({ email: 'parent@test.local', password: 'password123' }), // already the seeded parent
    )
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('CONFLICT')

    // Exactly the seeded fixture family — the pre-check (before the
    // transaction opens) must stop this before any Family row is created.
    expect(await prisma.family.count()).toBe(1)
  })

  it('rejects a password shorter than 8 characters', async () => {
    const res = await signup(signupReq({ email: 'short@test.local', password: '123' }))
    expect(res.status).toBe(400)
    expect(await prisma.family.count()).toBe(1)
  })

  it('answers a genuine concurrent duplicate-email race with 409, not a raw 500', async () => {
    // Two requests for the same brand-new email, fired together so both can
    // race past the pre-check before either commits its transaction — the
    // email @unique constraint, not the pre-check, is what must catch this.
    const body = () => signupReq({ email: 'racer@test.local', password: 'password123' })
    const [first, second] = await Promise.all([signup(body()), signup(body())])

    const statuses = [first.status, second.status].sort()
    expect(statuses).toEqual([201, 409])

    const loser = first.status === 409 ? first : second
    const loserBody = await loser.json()
    expect(loserBody.ok).toBe(false)
    expect(loserBody.error.code).toBe('CONFLICT')

    // Exactly one family was created — the loser left no orphaned Family.
    expect(await prisma.family.count()).toBe(2) // seeded fixture family + the one winner
    expect(await prisma.user.count({ where: { email: 'racer@test.local' } })).toBe(1)
  })
})
