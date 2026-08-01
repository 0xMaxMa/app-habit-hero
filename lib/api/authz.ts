/**
 * lib/api/authz.ts — resolve the acting principal for any API request.
 *
 * Two callers hit the same endpoints (decision #2 — channels live in the
 * gateway, the app ships only REST):
 *
 *   • WEB      — a NextAuth session (parent email/password OR child PIN, T06).
 *   • AGENT    — the gateway forwards a request on a channel user's behalf,
 *                authenticated with `x-agent-token` (== env.AGENT_API_TOKEN)
 *                and identifying the user via `x-actor-ref` (channelUserRef).
 *
 * A resolved `Actor` is family-scoped; `assertParent` / `assertFamily` enforce
 * role + single-family scope on top of it (decision #3, T30).
 */

import type { Role } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { unauthorized, forbidden } from './errors'

export interface Actor {
  userId: string
  role: Role
  familyId: string
}

const AGENT_TOKEN_HEADER = 'x-agent-token'
const ACTOR_REF_HEADER = 'x-actor-ref'

/**
 * Resolve who is making this request. Prefers an agent token when present
 * (that path is unambiguous), otherwise falls back to the NextAuth session.
 * Throws ApiError 401 when neither yields a valid principal.
 */
export async function resolveActor(req: Request): Promise<Actor> {
  const agentToken = req.headers.get(AGENT_TOKEN_HEADER)

  // ---- AGENT / SERVICE caller -------------------------------------------
  if (agentToken !== null) {
    const expected = process.env.AGENT_API_TOKEN
    if (!expected || agentToken !== expected) {
      throw unauthorized('Invalid agent token')
    }

    const actorRef = req.headers.get(ACTOR_REF_HEADER)
    if (!actorRef) {
      throw unauthorized('Missing x-actor-ref header')
    }

    const user = await prisma.user.findUnique({
      where: { channelUserRef: actorRef },
    })
    if (!user) {
      // The channel user has not redeemed a link code yet (T18). Signal the
      // agent so it can prompt them to link, rather than a generic 401.
      throw unauthorized('Channel user is not linked to an account', 'UNLINKED')
    }

    return { userId: user.id, role: user.role, familyId: user.familyId }
  }

  // ---- WEB caller (NextAuth session, parent or child PIN) ----------------
  // A failure to resolve the session (e.g. no request context) means "no
  // authenticated principal", not a server error — fall through to 401 rather
  // than letting it surface as a 500.
  const session = await getSessionUser().catch(() => null)
  if (session) {
    // The session is a stateless JWT: a user deleted (or re-scoped) after
    // sign-in still carries a valid-looking token. Confirm they still exist and
    // read role/familyId from the DB (the source of truth) — otherwise a stale
    // token would let the request write rows referencing a non-existent user
    // and blow up on a foreign-key constraint (a 500) instead of a clean 401.
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, role: true, familyId: true },
    })
    if (!user) {
      throw unauthorized(
        'บัญชีนี้ไม่มีอยู่ในระบบแล้ว กรุณาเข้าสู่ระบบใหม่',
        'SESSION_INVALID',
      )
    }
    return { userId: user.id, role: user.role, familyId: user.familyId }
  }

  throw unauthorized()
}

/** Throw 403 unless the actor is a parent. */
export function assertParent(actor: Actor): void {
  if (actor.role !== 'parent') {
    throw forbidden('This action is restricted to parents')
  }
}

/**
 * Throw 403 unless the actor belongs to the target family. Single-family MVP
 * still enforces this so multi-family (P2+) is a data change, not a code audit.
 */
export function assertFamily(actor: Actor, familyId: string): void {
  if (actor.familyId !== familyId) {
    throw forbidden('Resource belongs to another family')
  }
}
