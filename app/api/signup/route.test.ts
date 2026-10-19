// @vitest-environment node
//
// Node, not jsdom: exercises a real Request/Response round trip through the
// route handler.

/**
 * app/api/signup/route.test.ts — the pinSlug collision retry loop, isolated
 * from a real Postgres.
 *
 * tests/integration/signup.test.ts covers the happy path and the duplicate-
 * email conflict against the real DB, but can't force an actual pinSlug
 * collision without pre-seeding a row at the exact slug the next random draw
 * will produce. Mocking `prisma.$transaction` directly (same approach as
 * lib/import-family.test.ts) isolates the retry-vs-give-up decision instead.
 *
 * SLUG_LENGTH shrank from 10 to 6 (lib/pin-slug.ts) specifically to make this
 * path likelier to matter in practice, so it needs its own coverage rather
 * than relying on "two signups in a row never collide" (astronomically true
 * at either length, and proves nothing about the retry loop itself).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma } from '@prisma/client'

const { findUnique, transaction } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  transaction: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique }, $transaction: transaction },
}))

import { POST as signup } from './route'

function pinSlugCollision(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`pin_slug`)',
    { code: 'P2002', clientVersion: 'test', meta: { target: ['pin_slug'] } },
  )
}

function signupReq(body: unknown): Request {
  return new Request('http://t/api/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  findUnique.mockReset().mockResolvedValue(null) // no pre-existing email clash
  transaction.mockReset()
})

describe('POST /api/signup — pinSlug collision retry', () => {
  it('retries past one pinSlug collision and succeeds once a fresh slug clears it', async () => {
    const success = { familyId: 'fam_new', userId: 'usr_new', email: 'a@test.local' }
    transaction.mockRejectedValueOnce(pinSlugCollision()).mockResolvedValueOnce(success)

    const res = await signup(signupReq({ email: 'a@test.local', password: 'password123' }))

    expect(res.status).toBe(201)
    await expect(res.json()).resolves.toEqual({ ok: true, data: success })
    expect(transaction).toHaveBeenCalledTimes(2)
  })

  it('gives up after 5 consecutive pinSlug collisions and reports a conflict, not a raw 500', async () => {
    transaction.mockRejectedValue(pinSlugCollision())

    const res = await signup(signupReq({ email: 'b@test.local', password: 'password123' }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error.code).toBe('CONFLICT')
    expect(transaction).toHaveBeenCalledTimes(5)
  })
})
