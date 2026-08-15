/**
 * lib/api/errors.ts — the one error type every API endpoint throws.
 *
 * Handlers throw `ApiError` (directly or via a factory) and never build error
 * responses by hand; `withHandler` (lib/api/respond.ts) catches them and turns
 * them into the shared JSON envelope. This keeps status + code + message in one
 * place so the whole Phase 3 API answers consistently (T17, decision #3).
 */

/** A machine-readable error code the web UI / agent can branch on. */
export type ApiErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'UNLINKED'
  | 'SESSION_INVALID'
  | 'STORAGE_UNAVAILABLE'
  | 'INTERNAL'

export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  /** Optional extra fields merged into the error body (e.g. zod `issues`). */
  readonly extra?: Record<string, unknown>

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    extra?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.extra = extra
  }
}

// ---------------------------------------------------------------------------
// Common factories — prefer these over `new ApiError(...)` at call sites.
// ---------------------------------------------------------------------------

export function unauthorized(
  message = 'Authentication required',
  code: ApiErrorCode = 'UNAUTHORIZED',
  extra?: Record<string, unknown>,
): ApiError {
  return new ApiError(401, code, message, extra)
}

export function forbidden(
  message = 'You do not have access to this resource',
  extra?: Record<string, unknown>,
): ApiError {
  return new ApiError(403, 'FORBIDDEN', message, extra)
}

export function notFound(
  message = 'Not found',
  extra?: Record<string, unknown>,
): ApiError {
  return new ApiError(404, 'NOT_FOUND', message, extra)
}

export function badRequest(
  message = 'Invalid request',
  extra?: Record<string, unknown>,
): ApiError {
  return new ApiError(400, 'BAD_REQUEST', message, extra)
}

export function conflict(
  message = 'Conflict',
  extra?: Record<string, unknown>,
): ApiError {
  return new ApiError(409, 'CONFLICT', message, extra)
}

/**
 * The photo volume could not be written — the host directory is not writable by
 * the container, is full, or is mounted read-only. This is an operator problem,
 * not a caller problem: the same request will fail again until someone fixes
 * the mount, so it must not read as a generic glitch the child should retry
 * forever. 503 (not 500) so it is visibly *unavailable* rather than broken.
 */
export function storageUnavailable(
  message = 'บันทึกรูปไม่ได้ — พื้นที่จัดเก็บรูปเขียนไม่ได้ กรุณาแจ้งผู้ดูแล',
  extra?: Record<string, unknown>,
): ApiError {
  return new ApiError(503, 'STORAGE_UNAVAILABLE', message, extra)
}
