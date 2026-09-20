/**
 * lib/api/validate.ts — zod-backed request parsing.
 *
 * On failure these throw ApiError badRequest carrying the zod `issues`, which
 * `withHandler` surfaces in the failure envelope. Handlers get a fully typed,
 * validated value or an early throw — never a half-checked body. The
 * top-level message is the generic fallback below UNLESS a caller opts in
 * with `exposeMessage` — most of the 15+ routes sharing this helper never
 * wrote their zod messages to be end-user-facing, so leaking the first
 * issue's raw text by default would surface schema internals through
 * whichever route happened to fail validation next.
 */

import type { z } from 'zod'
import { badRequest } from './errors'

/** Parse and validate a JSON request body against `schema`. */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
  /** Set on a route whose schema messages are written to be shown to a
   *  caller/end user (e.g. app/api/deductions/route.ts). Leave unset to keep
   *  the generic "Invalid request body" message. */
  opts?: { exposeMessage?: boolean },
): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw badRequest('Request body must be valid JSON')
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    const message = opts?.exposeMessage
      ? (result.error.issues[0]?.message ?? 'Invalid request body')
      : 'Invalid request body'
    throw badRequest(message, { issues: result.error.issues })
  }
  return result.data
}

/** Parse and validate URL query params against `schema`. */
export function parseQuery<T extends z.ZodTypeAny>(
  url: string | URL,
  schema: T,
): z.infer<T> {
  const searchParams =
    url instanceof URL ? url.searchParams : new URL(url).searchParams
  const raw = Object.fromEntries(searchParams.entries())

  const result = schema.safeParse(raw)
  if (!result.success) {
    throw badRequest('Invalid query parameters', { issues: result.error.issues })
  }
  return result.data
}
