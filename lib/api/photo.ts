/**
 * lib/api/photo.ts — chore-completion photo storage on the local volume.
 *
 * Decision #1: photos live on a mounted volume (env.PHOTO_DIR, default
 * ./data/photos), NOT object storage. `savePhoto` writes an uploaded File and
 * returns a stable app-relative URL; `readPhoto` reads it back for the serve
 * route (GET /api/photos/[name]).
 */

import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { badRequest, notFound } from './errors'

/** Absolute directory photos are stored in. */
function photoDir(): string {
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
  await fs.mkdir(dir, { recursive: true })

  const filename = `${randomUUID()}${safeExt(file.name || '')}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await fs.writeFile(path.join(dir, filename), buffer)

  return filename
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
