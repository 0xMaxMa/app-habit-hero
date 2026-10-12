/**
 * lib/pin-slug.ts — generate a Family.pinSlug (multi-family /pin scoping).
 *
 * Lowercase + digits, URL-safe, ambiguous characters (0/o, 1/l/i) omitted so a
 * parent can read it aloud or type it on any keyboard — same alphabet choice as
 * app/api/link-code's generateCode, just lowercase for a nicer URL.
 *
 * 10 characters keeps the collision odds negligible even at thousands of
 * families (unlike linkCode, this is never rotated — it is a bookmarked URL).
 */
import { randomInt } from 'crypto'
import { Prisma } from '@prisma/client'

/** Accepts a top-level PrismaClient or a $transaction callback's tx client. */
type FamilyWriter = Pick<Prisma.TransactionClient, 'family'>

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const SLUG_LENGTH = 10

export function generatePinSlug(): string {
  let out = ''
  for (let i = 0; i < SLUG_LENGTH; i++) {
    out += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)]
  }
  return out
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

/**
 * Create a Family with a guaranteed-unique pinSlug, retrying on the rare
 * @unique collision rather than trusting randomInt() never repeats.
 */
export async function createFamilyWithPinSlug(
  db: FamilyWriter,
  name: string,
): Promise<{ id: string; name: string; pinSlug: string }> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.family.create({
        data: { name, pinSlug: generatePinSlug() },
        select: { id: true, name: true, pinSlug: true },
      })
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 4) continue
      throw err
    }
  }
  throw new Error('Could not generate a unique pin slug, please retry')
}
