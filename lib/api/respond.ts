/**
 * lib/api/respond.ts — the shared JSON envelope + handler wrapper.
 *
 * Every endpoint returns one shape so the web UI and the gateway agent parse
 * responses the same way:
 *   success → { ok: true,  data }
 *   failure → { ok: false, error: { code, message, ...extra } }
 *
 * `withHandler` wraps a route handler and converts thrown ApiError / ZodError
 * (and anything unexpected) into that failure envelope, so handlers can just
 * `throw badRequest(...)` and return `ok(...)` on the happy path.
 */

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { ApiError, type ApiErrorCode } from './errors'

export interface ApiSuccess<T> {
  ok: true
  data: T
}

export interface ApiFailure {
  ok: false
  error: {
    code: ApiErrorCode
    message: string
    [key: string]: unknown
  }
}

/** Success envelope. `init` lets callers set status (e.g. 201) or headers. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true as const, data }, init)
}

/** Failure envelope with an explicit status. */
export function fail(
  code: ApiErrorCode,
  message: string,
  status: number,
  extra?: Record<string, unknown>,
): NextResponse<ApiFailure> {
  return NextResponse.json(
    { ok: false as const, error: { code, message, ...extra } },
    { status },
  )
}

/** Turn a thrown value into a failure envelope. Exported for testing. */
export function toErrorResponse(err: unknown): NextResponse<ApiFailure> {
  if (err instanceof ApiError) {
    return fail(err.code, err.message, err.status, err.extra)
  }
  if (err instanceof ZodError) {
    return fail('BAD_REQUEST', 'Invalid request', 400, { issues: err.issues })
  }
  // Unexpected — do not leak internals to the caller.
  return fail('INTERNAL', 'Internal server error', 500)
}

type RouteContext = { params?: Record<string, string | string[]> }
type Handler<C extends RouteContext> = (
  req: Request,
  ctx: C,
) => Promise<NextResponse> | NextResponse

/**
 * Wrap a route handler so any thrown ApiError / ZodError becomes a proper
 * failure response. Usage:
 *
 *   export const POST = withHandler(async (req) => {
 *     const actor = await resolveActor(req)
 *     ...
 *     return ok(result, { status: 201 })
 *   })
 */
export function withHandler<C extends RouteContext = RouteContext>(
  handler: Handler<C>,
): (req: Request, ctx?: C) => Promise<NextResponse> {
  // ctx is optional so integration tests can invoke a non-dynamic route handler
  // directly as `POST(req)` (strategy §4A). Next.js always passes it in prod, and
  // dynamic routes still receive `{ params }` from both Next and their tests.
  return async (req: Request, ctx?: C) => {
    try {
      return await handler(req, (ctx ?? {}) as C)
    } catch (err) {
      return toErrorResponse(err)
    }
  }
}
