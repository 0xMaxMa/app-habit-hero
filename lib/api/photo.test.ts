// @vitest-environment node
//
// Node, not the suite-wide jsdom: jsdom's File has no `arrayBuffer()`, which is
// the exact method the upload path calls. Running this in jsdom would fail on
// the polyfill rather than on the behaviour under test.

/**
 * lib/api/photo.test.ts — the photo volume's failure behaviour.
 *
 * These pin the fix for the silent-upload-failure bug: a photo directory the
 * container cannot write produced a bare 500 with nothing logged, so submitting
 * a chore with a photo just failed while `docker ps` still said "healthy".
 *
 * The suite runs as an unprivileged user, so `chmod 0o555` genuinely blocks
 * writes — the same EACCES the deployed container hit once the directory was
 * restored from a backup under the wrong owner.
 */

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ApiError } from './errors'
import { photoDirStatus, savePhoto } from './photo'

let dir: string
const original = process.env.PHOTO_DIR

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'habithero-photo-'))
  process.env.PHOTO_DIR = dir
})

afterEach(async () => {
  // Restore write permission first or the cleanup itself fails.
  await fs.chmod(dir, 0o755).catch(() => {})
  await fs.rm(dir, { recursive: true, force: true })
  if (original === undefined) delete process.env.PHOTO_DIR
  else process.env.PHOTO_DIR = original
})

/** A minimal File, as the route handlers receive from multipart form data. */
function fakeFile(name = 'proof.jpg', bytes = 32): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' })
}

describe('savePhoto', () => {
  it('stores the file and returns its serve URL', async () => {
    const url = await savePhoto(fakeFile())

    expect(url).toMatch(/^\/api\/photos\/[0-9a-f-]{36}\.jpg$/)
    expect(await fs.readdir(dir)).toHaveLength(1)
  })

  it('reports an unwritable directory as STORAGE_UNAVAILABLE, not a bare 500', async () => {
    await fs.chmod(dir, 0o555) // readable + traversable, not writable

    const err = await savePhoto(fakeFile()).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('STORAGE_UNAVAILABLE')
    expect((err as ApiError).status).toBe(503)
    // Nothing was written, and the message says what an operator must fix.
    expect(await fs.readdir(dir)).toHaveLength(0)
  })

  it('still rejects a bad upload as BAD_REQUEST, not as a volume failure', async () => {
    // A 13 MB file is over MAX_UPLOAD_BYTES: the caller's problem, not the
    // mount's. Volume mapping must not swallow ordinary validation.
    const err = await savePhoto(fakeFile('huge.jpg', 13 * 1024 * 1024)).catch(
      (e: unknown) => e,
    )

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('BAD_REQUEST')
  })
})

describe('photoDirStatus', () => {
  it('reports a writable directory', async () => {
    await expect(photoDirStatus()).resolves.toEqual({ writable: true, dir })
  })

  it('creates the directory when it does not exist yet', async () => {
    process.env.PHOTO_DIR = path.join(dir, 'nested', 'photos')

    const status = await photoDirStatus()

    expect(status.writable).toBe(true)
    await expect(fs.stat(process.env.PHOTO_DIR)).resolves.toBeTruthy()
  })

  it('reports an unwritable directory with the errno, so health can name it', async () => {
    await fs.chmod(dir, 0o555)

    const status = await photoDirStatus()

    expect(status).toEqual({ writable: false, dir, reason: 'EACCES' })
  })
})
