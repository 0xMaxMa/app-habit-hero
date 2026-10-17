/**
 * lib/pin-slug.ts — generate a Family.pinSlug (multi-family /pin scoping).
 *
 * Lowercase + digits, URL-safe, ambiguous characters (0/o, 1/l/i) omitted so a
 * parent can read it aloud or type it on any keyboard — same alphabet choice as
 * app/api/link-code's generateCode, just lowercase for a nicer URL.
 *
 * 6 characters from this 32-symbol alphabet is 32^6 ≈ 1.07 billion possible
 * codes — shortened from the original 10 (real-world iOS testing: a 10-char
 * code was too long to read off a phone and retype on another device) but
 * still far beyond this app's family count, so the collision odds a
 * `createFamilyWithPinSlug` caller must retry against stay negligible (see
 * that function's doc comment for the actual retry math). Unlike linkCode,
 * this is never rotated — it is a bookmarked URL.
 */
import { randomInt } from 'crypto'
import { Prisma } from '@prisma/client'

/** Accepts a top-level PrismaClient or a $transaction callback's tx client. */
type FamilyWriter = Pick<Prisma.TransactionClient, 'family'>

const SLUG_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const SLUG_LENGTH = 6

export function generatePinSlug(): string {
  let out = ''
  for (let i = 0; i < SLUG_LENGTH; i++) {
    out += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)]
  }
  return out
}

/**
 * Create a Family with a freshly generated pinSlug. A single attempt: `db`
 * may be a handle into an already-open transaction, and Postgres aborts the
 * whole transaction on the first error — a second `create` on that same `db`
 * would fail with "current transaction is aborted" (25P02), not the P2002 a
 * naive retry-on-collision loop here would expect to catch. On a @unique
 * collision, callers must retry by re-running their ENTIRE enclosing
 * `$transaction` (which calls back in here and gets a new pinSlug) — see
 * `isUniqueViolation` (lib/api/tx.ts) and its callers in app/api/signup and
 * lib/import-family for the pattern.
 *
 * Collision odds at `SLUG_LENGTH` 6 (32^6 ≈ 1.07e9 codes): with n existing
 * families, one fresh draw collides with probability ~n/1.07e9. Both retry
 * callers below cap at 5 attempts, so exhausting them needs 5 independent
 * draws to all collide — probability (n/1.07e9)^5, still negligible (<1e-10)
 * even at n in the tens of thousands. 5 attempts is unchanged from the old
 * 10-character slug: the alphabet shrinking from 32^10 to 32^6 only matters
 * at a family count this product is nowhere near.
 */
export async function createFamilyWithPinSlug(
  db: FamilyWriter,
  name: string,
): Promise<{ id: string; name: string; pinSlug: string }> {
  return db.family.create({
    data: { name, pinSlug: generatePinSlug() },
    select: { id: true, name: true, pinSlug: true },
  })
}
