/**
 * lib/web/api.ts — tiny typed fetch client for the HabitHero JSON API.
 *
 * Every endpoint speaks the shared envelope (see lib/api/respond.ts):
 *   success → { ok: true,  data }
 *   failure → { ok: false, error: { code, message, ...extra } }
 *
 * These helpers unwrap that envelope: on success they return `data` typed as
 * `T`; on any non-ok response (HTTP error, ok:false body, or unparseable
 * payload) they throw an `ApiError` carrying the server's code/message so UI
 * code can `try/catch` and show a friendly message.
 *
 * All calls are same-origin with `credentials: 'include'` so the NextAuth
 * session cookie rides along (web is authenticated by cookie, never by
 * x-agent-token — that header is only for the gateway agent). Paths are
 * prefixed with NEXT_PUBLIC_BASE_PATH so the client works when the app is
 * mounted under a sub-path.
 */

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

/** Error thrown for any failed API call, mirroring the failure envelope. */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly extra: Record<string, unknown>

  constructor(
    message: string,
    code: string,
    status: number,
    extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.extra = extra
  }
}

/** Prefix a caller-supplied API path (e.g. "/api/chores") with the base path. */
function url(path: string): string {
  return `${BASE_PATH}${path}`
}

/** Unwrap a fetch Response into the envelope's `data`, or throw ApiError. */
async function unwrap<T>(res: Response): Promise<T> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // Non-JSON body (e.g. an upstream 502 HTML page) — fall through to throw.
  }

  const env = body as
    | { ok: true; data: T }
    | { ok: false; error: { code?: string; message?: string; [k: string]: unknown } }
    | null

  if (res.ok && env && env.ok === true) {
    return env.data
  }

  // A 401 in the browser means the session is missing or no longer valid (e.g.
  // a JWT for an account that was since deleted). Bounce to /login so the user
  // re-authenticates, rather than leaving them staring at an opaque error on a
  // page they can no longer use. Skipped on the pre-auth pages themselves.
  if (res.status === 401 && typeof window !== 'undefined') {
    const { pathname } = window.location
    if (!pathname.endsWith('/login') && !pathname.endsWith('/pin')) {
      window.location.assign(`${BASE_PATH}/login`)
    }
  }

  if (env && env.ok === false && env.error) {
    const { code, message, ...extra } = env.error
    throw new ApiError(
      message || 'Request failed',
      code || 'INTERNAL',
      res.status,
      extra,
    )
  }

  // No usable envelope — synthesize one from the HTTP status.
  throw new ApiError(
    res.statusText || 'Request failed',
    'INTERNAL',
    res.status,
  )
}

const jsonHeaders = { 'Content-Type': 'application/json' } as const

/** GET `path`, returning the unwrapped `data`. */
export function get<T>(path: string): Promise<T> {
  return fetch(url(path), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }).then((r) => unwrap<T>(r))
}

/** POST a JSON `body` to `path`, returning the unwrapped `data`. */
export function post<T>(path: string, body?: unknown): Promise<T> {
  return fetch(url(path), {
    method: 'POST',
    credentials: 'include',
    headers: jsonHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => unwrap<T>(r))
}

/** PATCH a JSON `body` to `path`, returning the unwrapped `data`. */
export function patch<T>(path: string, body?: unknown): Promise<T> {
  return fetch(url(path), {
    method: 'PATCH',
    credentials: 'include',
    headers: jsonHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then((r) => unwrap<T>(r))
}

/** DELETE `path`, returning the unwrapped `data`. (`del` — `delete` is reserved.) */
export function del<T>(path: string): Promise<T> {
  return fetch(url(path), {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  }).then((r) => unwrap<T>(r))
}

/**
 * POST multipart/form-data to `path` — used for completion photo uploads.
 * Do NOT set Content-Type manually: the browser sets it (with the multipart
 * boundary) from the FormData instance.
 */
export function postForm<T>(path: string, form: FormData): Promise<T> {
  return fetch(url(path), {
    method: 'POST',
    credentials: 'include',
    body: form,
  }).then((r) => unwrap<T>(r))
}

export const api = { get, post, patch, del, postForm }
export default api
