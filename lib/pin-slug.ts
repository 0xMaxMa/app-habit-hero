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

/**
 * Create a Family with a freshly generated pinSlug. A single attempt: `db`
 * may be a handle into an already-open transaction, and Postgres aborts the
 * whole transaction on the first error — a second `create` on that same `db`
 * would fail with "current transaction is aborted" (25P02), not the P2002 a
 * naive retry-on-collision loop here would expect to catch. On the rare
 * @unique collision (astronomically unlikely at `SLUG_LENGTH` 10, but not
 * impossible), callers must retry by re-running their ENTIRE enclosing
 * `$transaction` (which calls back in here and gets a new pinSlug) — see
 * `isUniqueViolation` (lib/api/tx.ts) and its callers in app/api/signup and
 * lib/import-family for the pattern.
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
