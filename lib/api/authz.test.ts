/**
 * lib/api/authz.test.ts — unit tests for the API authz layer.
 *
 * The DB (lib/db) and the NextAuth session (lib/auth) are mocked so we exercise
 * resolveActor's branches without a live Postgres or a NextAuth server.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveActor, assertParent, assertFamily, type Actor } from '@/lib/api/authz'
import { ApiError } from '@/lib/api/errors'

// --- mocks -----------------------------------------------------------------
vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/auth', () => ({
  getSessionUser: vi.fn(),
}))

import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>
const mockSession = getSessionUser as unknown as ReturnType<typeof vi.fn>

function agentReq(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/x', { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AGENT_API_TOKEN = 'secret-token'
  mockSession.mockResolvedValue(null)
})

describe('resolveActor — agent caller', () => {
  it('returns an Actor for a valid token + linked ref', async () => {
    findUnique.mockResolvedValue({
      id: 'u1',
      role: 'parent',
      familyId: 'fam1',
    })

    const actor = await resolveActor(
      agentReq({ 'x-agent-token': 'secret-token', 'x-actor-ref': 'chan-abc' }),
    )

    expect(actor).toEqual({ userId: 'u1', role: 'parent', familyId: 'fam1' })
    expect(findUnique).toHaveBeenCalledWith({
      where: { channelUserRef: 'chan-abc' },
    })
  })

  it('throws 401 UNAUTHORIZED for a bad token', async () => {
    const err = await resolveActor(
      agentReq({ 'x-agent-token': 'wrong', 'x-actor-ref': 'chan-abc' }),
    ).catch((e) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.code).toBe('UNAUTHORIZED')
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('throws 401 UNLINKED for an unknown ref', async () => {
    findUnique.mockResolvedValue(null)

    const err = await resolveActor(
      agentReq({ 'x-agent-token': 'secret-token', 'x-actor-ref': 'chan-unknown' }),
    ).catch((e) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.code).toBe('UNLINKED')
  })

  it('throws 401 when the token header is present but no ref', async () => {
    const err = await resolveActor(
      agentReq({ 'x-agent-token': 'secret-token' }),
    ).catch((e) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.code).toBe('UNAUTHORIZED')
  })
})

describe('resolveActor — web caller', () => {
  it('builds an Actor from the DB (authoritative) for a valid session', async () => {
    mockSession.mockResolvedValue({
      userId: 'u2',
      role: 'child',
      familyId: 'fam2',
      name: 'Kid',
    })
    // Role/family come from the DB, not the (stale-able) JWT.
    findUnique.mockResolvedValue({ id: 'u2', role: 'child', familyId: 'fam2' })

    const actor = await resolveActor(agentReq({}))
    expect(actor).toEqual({ userId: 'u2', role: 'child', familyId: 'fam2' })
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'u2' },
      select: { id: true, role: true, familyId: true },
    })
  })

  it('throws 401 SESSION_INVALID when the session user no longer exists', async () => {
    // A JWT for an account deleted after sign-in: the session resolves but the
    // row is gone. Must be a clean 401 (not a downstream FK 500).
    mockSession.mockResolvedValue({
      userId: 'ghost',
      role: 'parent',
      familyId: 'fam1',
      name: 'Deleted',
    })
    findUnique.mockResolvedValue(null)

    const err = await resolveActor(agentReq({})).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.code).toBe('SESSION_INVALID')
  })

  it('throws 401 when there is neither a session nor an agent token', async () => {
    const err = await resolveActor(agentReq({})).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(err.code).toBe('UNAUTHORIZED')
  })
})

describe('assertParent / assertFamily', () => {
  const parent: Actor = { userId: 'p', role: 'parent', familyId: 'fam1' }
  const child: Actor = { userId: 'c', role: 'child', familyId: 'fam1' }

  it('assertParent passes for a parent, throws 403 for a child', () => {
    expect(() => assertParent(parent)).not.toThrow()
    const err = (() => {
      try {
        assertParent(child)
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(403)
    expect((err as ApiError).code).toBe('FORBIDDEN')
  })

  it('assertFamily passes for the same family, throws 403 otherwise', () => {
    expect(() => assertFamily(parent, 'fam1')).not.toThrow()
    const err = (() => {
      try {
        assertFamily(parent, 'other-fam')
      } catch (e) {
        return e
      }
    })()
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(403)
    expect((err as ApiError).code).toBe('FORBIDDEN')
  })
})
