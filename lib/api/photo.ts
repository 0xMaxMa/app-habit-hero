/**
 * lib/api/photo.ts — chore-completion photo storage on the local volume.
 *
 * Decision #1: photos live on a mounted volume (env.PHOTO_DIR, default
 * ./data/photos), NOT object storage. `savePhoto` writes an uploaded File and
 * returns a stable app-relative URL; `readPhoto` reads it back for the serve
 * route (GET /api/photos/[name]).
 */

import { randomUUID } from 'node:crypto'
import { constants as fsConstants, promises as fs } from 'node:fs'
import path from 'node:path'
import { badRequest, notFound, storageUnavailable } from './errors'

/** Absolute directory photos are stored in. */
function photoDir(): string {
  // Tests MUST point PHOTO_DIR somewhere disposable. The default resolves to
  // ./data/photos, which on a deployed host is the very directory the container
  // bind-mounts — a test run there writes 1px fixtures straight into the
  // family's real photos. Fail loudly instead of quietly polluting it.
  if (process.env.NODE_ENV === 'test' && !process.env.PHOTO_DIR) {
    throw new Error(
      'PHOTO_DIR must be set when running tests — refusing to fall back to ./data/photos',
    )
  }
  return path.resolve(process.env.PHOTO_DIR || './data/photos')
}

/** Derive a safe lowercase extension from the original filename (default .jpg). */
function safeExt(originalName: string): string {
  const ext = path.extname(originalName).toLowerCase()
  // Allow only a small alnum extension; fall back to .jpg otherwise.
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '.jpg'
}

/**
 * Persist an uploaded photo to the local volume. Returns an app-relative URL
 * (`/api/photos/<filename>`) suitable for storing on ChoreCompletion.photoUrl.
 */
export async function savePhoto(file: File): Promise<string> {
  const filename = await writeUpload(file)
  return `/api/photos/${filename}`
}

/**
 * Persist an uploaded avatar image to the same local volume. Returns an
 * app-relative URL (`/api/avatars/<filename>`) for User.avatarUrl. Served by a
 * distinct route so authorization keys off the owning user, not a completion.
 */
export async function saveAvatar(file: File): Promise<string> {
  const filename = await writeUpload(file)
  return `/api/avatars/${filename}`
}

/** Hard ceiling on a stored upload. The web client downscales images well
 * below this (avatars ~256px, proof photos ~1280px); this only rejects
 * pathological direct uploads so a single file can't bloat the volume — or, for
 * avatars, the inlined /pin payload. */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024 // 12 MB

/** Shared: validate + write a File to the upload dir, returning its filename. */
async function writeUpload(file: File): Promise<string> {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw badRequest('A file is required')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw badRequest('ไฟล์ใหญ่เกินไป (สูงสุด 12 MB)')
  }

  const dir = photoDir()
  const filename = `${randomUUID()}${safeExt(file.name || '')}`
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(path.join(dir, filename), buffer)
  } catch (err) {
    // A failure here is the volume, not the upload. Left unwrapped it becomes a
    // bare 500 "Internal server error" and the real cause never reaches anyone
    // — which is exactly how an unwritable mount stayed hidden until a parent
    // noticed photos silently failing to attach.
    if (isVolumeFailure(err)) {
      console.error(
        `[photo] cannot write to PHOTO_DIR ${dir}: ${(err as NodeJS.ErrnoException).code}`,
      )
      throw storageUnavailable()
    }
    throw err
  }

  return filename
}

/** errno values that mean "the volume is wrong", not "this request is wrong". */
const VOLUME_ERRNOS = new Set([
  'EACCES', // directory not writable by the container user
  'EPERM',
  'EROFS', // mounted read-only
  'ENOSPC', // volume full
  'EDQUOT',
  'ENOENT', // mount point vanished (mkdir -p could not create it either)
])

function isVolumeFailure(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code
  return typeof code === 'string' && VOLUME_ERRNOS.has(code)
}

/**
 * Report whether uploads can actually be stored right now, for /api/health.
 *
 * Uses access(W_OK) rather than a probe write: the healthcheck runs every 30s
 * and should not churn the family's photo directory. access() is often called
 * unreliable for root — the kernel short-circuits it when CAP_DAC_OVERRIDE is
 * held — but this container drops all capabilities, so the check is subject to
 * the same permission bits as the real write and was verified to return EACCES
 * on a directory the container cannot write.
 */
export async function photoDirStatus(): Promise<
  { writable: true; dir: string } | { writable: false; dir: string; reason: string }
> {
  const dir = photoDir()
  try {
    await fs.mkdir(dir, { recursive: true })
    await fs.access(dir, fsConstants.W_OK)
    return { writable: true, dir }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? 'UNKNOWN'
    return { writable: false, dir, reason: code }
  }
}

/** Bytes returned by readPhoto for the serve route. */
export interface StoredPhoto {
  data: Buffer
  contentType: string
}

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  // Phone-library formats. The web client transcodes these to JPEG before
  // upload, so they should never land here — but if a browser fails to decode
  // one, serving the right type still lets an Apple device render it instead of
  // downloading an octet-stream blob.
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
}

/**
 * Read a stored photo by filename for the serve route. `name` is treated as a
 * bare filename; any path separators are stripped to prevent traversal.
 */
export async function readPhoto(name: string): Promise<StoredPhoto> {
  const filename = path.basename(name)
  if (!filename || filename !== name) {
    throw badRequest('Invalid photo name')
  }

  const filePath = path.join(photoDir(), filename)
  try {
    const data = await fs.readFile(filePath)
    const contentType = CONTENT_TYPES[path.extname(filename).toLowerCase()] ??
      'application/octet-stream'
    return { data, contentType }
  } catch {
    throw notFound('Photo not found')
  }
}
