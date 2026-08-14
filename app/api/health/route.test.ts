// @vitest-environment node
//
// Node, not jsdom: this exercises a route handler and the real filesystem.

/**
 * app/api/health/route.test.ts — the container healthcheck's contract.
 *
 * app.yaml wires `wget -qO- /api/health` as the healthcheck, so whatever this
 * returns decides whether `docker ps` shows the app as healthy. Before the fix
 * it only checked the database, which is why an unwritable photo volume — no
 * chore photos, no avatar changes — left the container looking perfectly fine.
 */

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// vi.hoisted, so the stub exists before the mock factory runs — vitest hoists
// vi.mock above the imports, and the route imports the client on load.
const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }))
vi.mock('@/lib/db', () => ({ default: { $queryRaw: queryRaw } }))

import { GET } from './route'

let dir: string
const original = process.env.PHOTO_DIR

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'habithero-health-'))
  process.env.PHOTO_DIR = dir
  queryRaw.mockResolvedValue([{ '?column?': 1 }])
})

afterEach(async () => {
  await fs.chmod(dir, 0o755).catch(() => {})
  await fs.rm(dir, { recursive: true, force: true })
  if (original === undefined) delete process.env.PHOTO_DIR
  else process.env.PHOTO_DIR = original
  vi.clearAllMocks()
})

describe('GET /api/health', () => {
  it('is healthy when the database and the photo volume are both fine', async () => {
    const res = await GET()

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      status: 'ok',
      db: 'connected',
      photos: 'writable',
    })
  })

  it('is unhealthy when the photo volume cannot be written, even with the DB up', async () => {
    await fs.chmod(dir, 0o555)

    const res = await GET()

    // 503 is what turns the container unhealthy — the whole point of the fix.
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.status).toBe('error')
    expect(body.db).toBe('connected')
    // Names the errno so an operator can act without reproducing it first.
    expect(body.photos).toBe('not writable (EACCES)')
  })

  it('is unhealthy when the database is unreachable', async () => {
    queryRaw.mockRejectedValue(new Error('connection refused'))

    const res = await GET()

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({
      status: 'error',
      db: 'disconnected',
      photos: 'writable',
    })
  })
})
