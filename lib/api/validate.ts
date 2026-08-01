/**
 * lib/api/validate.ts — zod-backed request parsing.
 *
 * On failure these throw ApiError badRequest carrying the zod `issues`, which
 * `withHandler` surfaces in the failure envelope. Handlers get a fully typed,
 * validated value or an early throw — never a half-checked body.
 */

import type { z } from 'zod'
import { badRequest } from './errors'

/** Parse and validate a JSON request body against `schema`. */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    throw badRequest('Request body must be valid JSON')
  }

  const result = schema.safeParse(raw)
  if (!result.success) {
    throw badRequest('Invalid request body', { issues: result.error.issues })
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
