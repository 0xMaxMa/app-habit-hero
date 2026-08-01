/**
 * app/api/link/route.ts — redeem a one-time account-link code (agent side).
 *
 * The gateway forwards this on behalf of a channel user that is still UNLINKED
 * (resolveActor throws 'UNLINKED' for them). Authentication is therefore the
 * service token (x-agent-token) plus the one-time `code` itself — not a
 * resolved Actor, which by definition doesn't exist yet.
 *
 * On success it binds `channel_user_ref` to the matching User and clears the
 * code (one-time use), turning that caller into a resolvable actor on every
 * subsequent request. A reused or invalid code fails cleanly (404).
 */

import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  withHandler,
  ok,
  parseBody,
  unauthorized,
  notFound,
  conflict,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  code: z.string().min(1),
  channel_user_ref: z.string().min(1),
})

/** Service-token gate for the agent/gateway caller (mirrors resolveActor). */
function assertAgentToken(req: Request): void {
  const token = req.headers.get('x-agent-token')
  const expected = process.env.AGENT_API_TOKEN
  if (!expected || token !== expected) {
    throw unauthorized('Invalid agent token')
  }
}

export const POST = withHandler(async (req) => {
  assertAgentToken(req)

  const { code, channel_user_ref } = await parseBody(req, bodySchema)

  const user = await prisma.user.findUnique({ where: { linkCode: code } })
  if (!user) {
    // Missing, mistyped, or already redeemed (cleared on first use).
    throw notFound('Invalid or already-used link code')
  }

  try {
    const bound = await prisma.user.update({
      where: { id: user.id },
      // Bind the caller and burn the code so it cannot be reused.
      data: { channelUserRef: channel_user_ref, linkCode: null },
    })
    return ok({ id: bound.id, name: bound.name, role: bound.role })
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      // channelUserRef is @unique — this identity is already bound elsewhere.
      throw conflict(
        'This channel identity is already linked to another account',
      )
    }
    throw err
  }
})
