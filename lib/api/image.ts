/**
 * lib/api/image.ts — normalize an uploaded image before it is stored.
 *
 * Why this exists on the server when `lib/web/image.ts` already downscales in
 * the browser: the browser is only one of the two ways a photo reaches this
 * app. The gateway agent downloads the image a parent sent over Telegram and
 * POSTs it straight to `/api/completions`, never touching a canvas — so every
 * agent upload was stored at whatever size the phone produced. On the deployed
 * volume that showed up as 7 of 62 files above the 1280px the web client
 * promises, the largest a 2048×1536 / 1.0 MB pair.
 *
 * Doing it here makes the cap a property of storage rather than of one client:
 * whatever route an image arrives by, what lands on the volume is bounded. The
 * browser step stays — it saves the upload itself, which matters on a phone —
 * but it is now an optimization, not the only line of defence.
 *
 * Rules mirror the browser helper deliberately, so the two cannot disagree
 * about what is safe to touch:
 *   • GIF and SVG are never re-encoded (animation / vector would be destroyed).
 *   • Anything already inside the cap, in a format every browser renders, and
 *     small enough is stored as handed in — re-encoding it would only cost
 *     quality.
 *   • Everything else is fitted to the cap and re-encoded: JPEG normally, WebP
 *     when the source has an alpha channel (JPEG would turn transparency black).
 *   • Bytes we cannot decode are stored untouched. A resize step must never be
 *     the reason a legitimate upload fails.
 */

import sharp, { type Metadata } from 'sharp'

/** Longest-edge cap and the "already small enough" byte threshold for a kind
 * of upload. Chore photos are viewed full-screen; avatars are also inlined as
 * base64 into the pre-auth /pin page, so they get a much tighter budget. */
export interface ImagePreset {
  /** Longest-edge cap in px. */
  maxDim: number
  /** Under this many bytes, an in-bounds web-safe image is kept verbatim. */
  keepBytes: number
}

/** Chore proof photos — same 1280px the web client targets. */
export const PHOTO_PRESET: ImagePreset = { maxDim: 1280, keepBytes: 400 * 1024 }

/** Member avatars — same 256px the web client targets. */
export const AVATAR_PRESET: ImagePreset = { maxDim: 256, keepBytes: 80 * 1024 }

const JPEG_QUALITY = 80
const WEBP_QUALITY = 80

/** Detected format → the extension the serve route maps to a content type. */
const EXT_BY_FORMAT: Record<string, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  gif: '.gif',
  avif: '.avif',
  heif: '.heic',
  tiff: '.tiff',
  svg: '.svg',
}

/** Never re-encoded: animation and vector do not survive a raster round trip. */
const PASS_THROUGH = new Set(['gif', 'svg'])

/** Formats every browser renders, so keeping the original is always safe. */
const WEB_SAFE = new Set(['jpeg', 'png', 'webp'])

export interface NormalizedImage {
  /** The bytes to store. */
  data: Buffer
  /** Extension matching `data`, or null when the bytes were not recognized as
   * an image at all (the caller then falls back to the uploaded filename). */
  ext: string | null
  /** True when `data` is a re-encode rather than the bytes handed in. */
  reencoded: boolean
}

/**
 * Fit `input` inside `preset.maxDim` and re-encode it, or hand the original
 * bytes back when re-encoding would be wrong or pointless.
 *
 * Never throws: every failure path returns the input unchanged.
 */
export async function normalizeImage(
  input: Buffer,
  preset: ImagePreset,
): Promise<NormalizedImage> {
  const unchanged = (ext: string | null): NormalizedImage => ({
    data: input,
    ext,
    reencoded: false,
  })

  // `failOn: 'none'` — a truncated or slightly malformed image should still be
  // resized rather than rejected; the family's photo is more important than
  // the file being pristine. Pixel-count limits stay at sharp's defaults, which
  // is what stops a decompression bomb from being decoded at all.
  let meta: Metadata
  try {
    meta = await sharp(input, { failOn: 'none' }).metadata()
  } catch {
    return unchanged(null) // not an image we can read — store it as sent
  }

  const format = meta.format
  if (!format || !EXT_BY_FORMAT[format]) return unchanged(null)
  const ext = EXT_BY_FORMAT[format]

  if (PASS_THROUGH.has(format)) return unchanged(ext)

  // EXIF orientations 5–8 swap the axes, so the stored width/height are not
  // what a viewer sees. Compare the upright dimensions or a portrait photo
  // shot sideways is measured against the wrong edge.
  const swapped = (meta.orientation ?? 1) >= 5
  const width = swapped ? meta.height : meta.width
  const height = swapped ? meta.width : meta.height
  if (!width || !height) return unchanged(ext)

  const withinBounds = Math.max(width, height) <= preset.maxDim
  const webSafe = WEB_SAFE.has(format)

  if (withinBounds && webSafe && input.byteLength <= preset.keepBytes) {
    return unchanged(ext)
  }

  try {
    const pipeline = sharp(input, { failOn: 'none' })
      // Bake EXIF rotation into the pixels before the encoders below drop the
      // metadata — otherwise an upright photo would come back on its side.
      .rotate()
      .resize({
        width: preset.maxDim,
        height: preset.maxDim,
        fit: 'inside',
        withoutEnlargement: true,
      })

    // JPEG has no alpha channel: a transparent PNG encoded as JPEG comes back
    // with black where it was see-through. WebP keeps it, and the serve route
    // already maps `.webp` to its content type.
    const data = meta.hasAlpha
      ? await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
      : await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()

    // An in-bounds image that re-encodes no smaller gains nothing and loses a
    // generation of quality. Only applies when the original is a format the
    // web renders — a HEIC must be transcoded whatever it costs.
    if (withinBounds && webSafe && data.byteLength >= input.byteLength) {
      return unchanged(ext)
    }

    return { data, ext: meta.hasAlpha ? '.webp' : '.jpg', reencoded: true }
  } catch {
    return unchanged(ext) // encode failed — the original is still a valid photo
  }
}
