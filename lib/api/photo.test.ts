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
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './errors'
import { PHOTO_PRESET } from './image'
import { ensurePhotoDir, saveAvatar, savePhoto } from './photo'

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

/** A real encoded image of the given size — the upload path now decodes what
 * it is handed, so a buffer of zero bytes no longer exercises it. */
async function imageFile(
  name: string,
  width: number,
  height: number,
  type = 'image/jpeg',
): Promise<File> {
  const channels = 3
  const raw = Buffer.alloc(width * height * channels)
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 97 + ((i / width) | 0) * 31) % 256
  const bytes = await sharp(raw, { raw: { width, height, channels } })
    .jpeg({ quality: 95 })
    .toBuffer()
  return new File([bytes], name, { type })
}

/** Longest edge of an image on disk. */
async function longestEdge(file: string): Promise<number> {
  const meta = await sharp(await fs.readFile(file)).metadata()
  return Math.max(meta.width ?? 0, meta.height ?? 0)
}

describe('savePhoto — normalization on the way in', () => {
  // The bug this pins: the gateway agent POSTs a photo straight from Telegram,
  // bypassing the browser downscaler entirely, so files well over the app's own
  // 1280px promise were landing on the volume — 2048×1536 among them.
  it('caps an oversized upload at the photo dimension, whatever client sent it', async () => {
    const url = await savePhoto(await imageFile('from-agent.jpg', 2048, 1536))

    const stored = path.join(dir, path.basename(url))
    expect(await longestEdge(stored)).toBeLessThanOrEqual(PHOTO_PRESET.maxDim)
  })

  it('caps an avatar much tighter — it is inlined into the public /pin page', async () => {
    const url = await saveAvatar(await imageFile('face.jpg', 2048, 1536))

    const stored = path.join(dir, path.basename(url))
    expect(await longestEdge(stored)).toBe(256)
  })

  it('names the file after the bytes, not after what the client called it', async () => {
    // A JPEG announced as `.png`: the serve route derives the content type from
    // the extension, so trusting the name would hand a browser the wrong one.
    const url = await savePhoto(await imageFile('mislabelled.png', 1600, 1200))

    expect(url).toMatch(/\.jpg$/)
  })

  it('still stores something it cannot decode, rather than failing the upload', async () => {
    const url = await savePhoto(fakeFile('proof.jpg')) // 32 zero bytes

    expect(url).toMatch(/^\/api\/photos\/[0-9a-f-]{36}\.jpg$/)
    expect(await fs.readdir(dir)).toHaveLength(1)
  })
})

describe('ensurePhotoDir', () => {
  it('reports a writable directory', async () => {
    await expect(ensurePhotoDir()).resolves.toEqual({
      writable: true,
      dir,
      repaired: false,
    })
  })

  it('creates the directory when it does not exist yet', async () => {
    process.env.PHOTO_DIR = path.join(dir, 'nested', 'photos')

    const status = await ensurePhotoDir()

    expect(status.writable).toBe(true)
    await expect(fs.stat(process.env.PHOTO_DIR)).resolves.toBeTruthy()
  })

  it('reports an unwritable directory with the errno, so health can name it', async () => {
    await fs.chmod(dir, 0o555)

    const status = await ensurePhotoDir()

    // The chown repair runs but cannot help here: the directory is already
    // owned by this process, so it is the mode bits — not the owner — that
    // block the write, and the original errno is what gets reported.
    expect(status).toEqual({ writable: false, dir, reason: 'EACCES' })
  })

  // The real failure is ownership, not mode: a restore hands the directory back
  // owned by someone else and chown fixes it. Reproducing that for real needs
  // CAP_CHOWN, which the test runner does not have, so the privileged chown is
  // stubbed here to pin the logic — the capability itself was verified against
  // the built image with `docker run --cap-drop ALL --cap-add CHOWN`.
  it('reports repaired: true when taking ownership makes it writable', async () => {
    await fs.chmod(dir, 0o555)
    const chown = vi.spyOn(fs, 'chown').mockImplementation(async () => {
      await fs.chmod(dir, 0o755) // stand-in for "now we own it"
    })

    const status = await ensurePhotoDir()

    expect(chown).toHaveBeenCalledWith(dir, process.getuid?.() ?? 0, process.getgid?.() ?? 0)
    expect(status).toEqual({ writable: true, dir, repaired: true })
    chown.mockRestore()
  })
})

describe('savePhoto self-repair', () => {
  it('repairs and retries once, so a restored directory costs no uploads', async () => {
    await fs.chmod(dir, 0o555)
    const chown = vi.spyOn(fs, 'chown').mockImplementation(async () => {
      await fs.chmod(dir, 0o755)
    })

    const url = await savePhoto(fakeFile())

    expect(url).toMatch(/^\/api\/photos\/[0-9a-f-]{36}\.jpg$/)
    // The photo really landed — the retry wrote it, not just the repair.
    expect(await fs.readdir(dir)).toHaveLength(1)
    chown.mockRestore()
  })

  it('still fails cleanly when the repair cannot help', async () => {
    await fs.chmod(dir, 0o555) // owned by us, so chown changes nothing

    const err = await savePhoto(fakeFile()).catch((e: unknown) => e)

    expect((err as ApiError).code).toBe('STORAGE_UNAVAILABLE')
    expect(await fs.readdir(dir)).toHaveLength(0)
  })
})
