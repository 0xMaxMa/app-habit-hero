/**
 * app/api/link-code/route.ts — issue a one-time account-link code (web side).
 *
 * A parent asks the app to mint a short, human-typable code for a member of
 * their own family. The code is stored on that `User.linkCode` (@unique); the
 * agent later redeems it once via POST /api/link (T18) to bind a channel
 * identity to the account. Parents may only issue codes for users in their own
 * family (family-scoped authz, T17/T30).
 */

import { randomInt } from 'crypto'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  withHandler,
  ok,
  parseBody,
  resolveActor,
  assertParent,
  notFound,
  conflict,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  userId: z.string().min(1),
})

// Ambiguous characters (0/O, 1/I/L) are omitted so codes are easy to read out
// loud and type on any keyboard.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

function generateCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return out
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  )
}

export const POST = withHandler(async (req) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const { userId } = await parseBody(req, bodySchema)

  const target = await prisma.user.findUnique({ where: { id: userId } })
  if (!target || target.familyId !== actor.familyId) {
    // Same response whether the user is missing or in another family — don't
    // leak the existence of other families' users.
    throw notFound('User not found in your family')
  }

  // Mint a unique code, retrying on the rare linkCode @unique collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    try {
      const updated = await prisma.user.update({
        where: { id: target.id },
        data: { linkCode: code },
      })
      return ok({ userId: updated.id, code })
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 4) continue
      throw err
    }
  }

  throw conflict('Could not generate a unique link code, please retry')
})
