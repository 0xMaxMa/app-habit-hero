/**
 * lib/api/tx.ts — serializable writes for the balances two callers can touch.
 *
 * XP is a running total that several endpoints move at once: a parent approving
 * two chores in one tap-tap, the agent approving while the parent does, a
 * redemption clearing while a chore lands. Each of those used to read the total,
 * add to it in memory, and write the sum back, so whichever wrote last erased
 * the other — silently, with both requests reporting success.
 *
 * `serializable` runs the read and the write inside one SERIALIZABLE
 * transaction. Postgres then refuses to let two overlapping transactions
 * pretend they ran alone: the loser aborts with a serialization failure
 * (Prisma P2034), which is retried here against the now-current state. A
 * balance check inside the callback is therefore a real check, not a snapshot
 * that was already stale by the time it was acted on.
 *
 * Use it for anything that reads a total and writes back a value derived from
 * it. Plain reads, and single-statement writes (Prisma `increment`), do not
 * need it.
 */

import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

/**
 * A Prisma client scoped to one transaction. The pooled client satisfies it
 * too, so helpers can take `db: Db` and work either way.
 */
export type Db = Prisma.TransactionClient

/**
 * Postgres aborted the transaction to preserve serializability, or two writers
 * raced the same unique row. Neither means the request was wrong — re-running
 * it against current state is the correct response.
 *
 *   P2034 — write conflict / deadlock (SQLSTATE 40001, 40P01)
 *   P2002 — unique constraint (two writers inserting the same badge row)
 */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false
  return err.code === 'P2034' || err.code === 'P2002'
}

/** Attempts before giving up. Contention here is between a handful of family
 * members, so a conflict that survives this many retries is a real bug. */
const MAX_ATTEMPTS = 6

/**
 * Run `fn` in a SERIALIZABLE transaction, retrying serialization failures with
 * a short escalating backoff. The callback MUST do all its reads and writes on
 * the `tx` it is handed — a query issued on the pooled client from inside runs
 * outside the transaction and is not protected.
 *
 * The callback can be executed more than once, so it must not mutate anything
 * outside the transaction (no file writes, no accumulating into a shared array).
 */
export async function serializable<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        // Generous enough for the badge re-evaluation that rides along with an
        // approval, without letting a stuck transaction pin a pool connection.
        timeout: 15_000,
        maxWait: 10_000,
      })
    } catch (err) {
      if (!isRetryable(err)) throw err
      lastError = err
      // 5ms, 10ms, 20ms … — long enough to let the winner commit, short enough
      // that the parent never notices.
      await sleep(5 * 2 ** attempt)
    }
  }
  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
