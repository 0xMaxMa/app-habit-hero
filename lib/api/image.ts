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
 * The rules:
 *   • Anything already inside the cap, in a format the serve route can hand
 *     back, and small enough is stored as handed in — re-encoding it would only
 *     cost quality.
 *   • Everything else is fitted to the cap and re-encoded: JPEG normally, WebP
 *     when the source is animated or has an alpha channel (an animated GIF
 *     stays animated; JPEG would flatten it, and would turn transparency
 *     black).
 *   • Bytes we cannot decode are stored untouched. A resize step must never be
 *     the reason a legitimate upload fails.
 *
 * Known gap: the prebuilt libvips sharp ships has no HEVC decoder, so a real
 * iPhone `.heic` (as opposed to an `.avif`, which it does read) cannot be
 * decoded here and is stored as sent. The browser helper transcodes HEIC at
 * the source, which covers every upload from the web UI; one forwarded to the
 * agent as a *document* is the case that slips through. Closing it means
 * building libvips with libheif — a much bigger change than this file.
 */

import sharp, { type Metadata } from 'sharp'

/** Longest-edge cap and the "already small enough" byte threshold for a kind
 * of upload. Chore photos are viewed full-screen; avatars are also inlined as
 * base64 into the pre-auth /pin page, so they get a much tighter budget. */
export interface ImagePreset {
  /** Longest-edge cap in px. */
  maxDim: number
  /** Under this many bytes, an in-bounds servable image is kept verbatim. */
  keepBytes: number
  /** Refuse the upload outright if normalization could not get it under this.
   * Only set where an oversized file harms more than the volume — see the
   * avatar preset. Omitted means "store whatever we ended up with". */
  hardMaxBytes?: number
}

/** Chore proof photos — same 1280px the web client targets. */
export const PHOTO_PRESET: ImagePreset = { maxDim: 1280, keepBytes: 400 * 1024 }

/** Member avatars — same 256px the web client targets.
 *
 * `hardMaxBytes` exists because an avatar is not only stored: /pin inlines it
 * as a base64 data URI into the PUBLIC login page, at ~1.33× its file size in
 * HTML, for every child with one. Normalization gets a decodable image far
 * under this; the ceiling is what stops a format we could not decode (an
 * iPhone `.heic` uploaded straight to the API, say) from being waved through
 * at megabytes and making the login page slow to hydrate — the exact
 * regression lib/web/image.ts was written to prevent. */
export const AVATAR_PRESET: ImagePreset = {
  maxDim: 256,
  keepBytes: 80 * 1024,
  hardMaxBytes: 512 * 1024,
}

const JPEG_QUALITY = 80
const WEBP_QUALITY = 80

/**
 * Formats that may be stored exactly as uploaded, and the extension to store
 * them under. Every value here must be a key of CONTENT_TYPES in ./photo — the
 * serve route derives the content type from the extension, and a file it
 * cannot type is handed back as `application/octet-stream`, which an <img>
 * renders as nothing. `image.test.ts` pins that.
 *
 * Note what is NOT here. `heif` is what sharp reports for an AVIF; `tiff` and
 * `svg` it can read but the app has no reason to serve. All three are always
 * re-encoded to JPEG or WebP, which is also why rasterizing an SVG is the right
 * outcome rather than a loss: what this app displays is a raster thumbnail at
 * 256px, and storing markup that the serve route cannot type meant it silently
 * rendered as nothing at all.
 */
const VERBATIM_EXT: Record<string, string> = {
  jpeg: '.jpg',
  png: '.png',
  webp: '.webp',
  gif: '.gif',
}

/** Extensions the re-encode path produces. */
const JPEG_EXT = '.jpg'
const WEBP_EXT = '.webp'

/** Every extension this module can hand back — what the serve route's
 * CONTENT_TYPES has to cover. `image.test.ts` asserts the two agree. */
export const STORED_EXTENSIONS: readonly string[] = Array.from(
  new Set([...Object.values(VERBATIM_EXT), JPEG_EXT, WEBP_EXT]),
)

/** Formats worth decoding at all. Anything else is stored as sent. */
const RE_ENCODABLE = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'tiff', 'svg'])

export interface NormalizedImage {
  /** The bytes to store. */
  data: Buffer
  /** Extension matching `data`, or null when the bytes were not recognized as
   * an image we handle (the caller then falls back to the uploaded filename). */
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
  // the file being pristine. `animated: true` is what populates `pages` and
  // `pageHeight`; without it a multi-frame image reports no frame height and
  // there is nothing to measure the cap against.
  let meta: Metadata
  try {
    meta = await sharp(input, { failOn: 'none', animated: true }).metadata()
  } catch {
    return unchanged(null) // not an image we can read — store it as sent
  }

  const format = meta.format
  if (!format || !RE_ENCODABLE.has(format)) return unchanged(null)
  const verbatimExt = VERBATIM_EXT[format] ?? null

  // Multi-page input is an animation (GIF, animated WebP, APNG). Its `height`
  // is every frame stacked; `pageHeight` is the one a viewer sees.
  const animated = (meta.pages ?? 1) > 1
  // EXIF orientations 5–8 swap the axes, so the stored width/height are not
  // what a viewer sees. Compare the upright dimensions or a portrait photo
  // shot sideways is measured against the wrong edge.
  const swapped = (meta.orientation ?? 1) >= 5
  const frameHeight = meta.pageHeight ?? meta.height
  const width = swapped ? frameHeight : meta.width
  const height = swapped ? meta.width : frameHeight
  if (!width || !height) return unchanged(verbatimExt)

  const withinBounds = Math.max(width, height) <= preset.maxDim

  // Small enough, and the serve route can type it: leave the bytes alone. This
  // is also what keeps a modest animated GIF animated.
  if (withinBounds && verbatimExt && input.byteLength <= preset.keepBytes) {
    return unchanged(verbatimExt)
  }

  try {
    const pipeline = sharp(input, { failOn: 'none', animated })
    // Baking EXIF rotation into the pixels matters because the encoders below
    // drop the metadata — but rotation is a still-image concept, and asking for
    // it on a multi-page image is an error in libvips.
    if (!animated) pipeline.rotate()
    pipeline.resize({
      width: preset.maxDim,
      height: preset.maxDim,
      fit: 'inside',
      withoutEnlargement: true,
    })

    // WebP for anything JPEG cannot represent: JPEG has a single frame, so an
    // animation would come back as a still, and no alpha channel, so a
    // transparent PNG would come back with black where it was see-through.
    const asWebp = animated || meta.hasAlpha
    const data = asWebp
      ? await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
      : await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()

    // An in-bounds image that re-encodes no smaller gains nothing and loses a
    // generation of quality. Only applies to formats we could have stored as
    // they were — a TIFF must be transcoded whatever it costs.
    if (withinBounds && verbatimExt && data.byteLength >= input.byteLength) {
      return unchanged(verbatimExt)
    }

    return { data, ext: asWebp ? WEBP_EXT : JPEG_EXT, reencoded: true }
  } catch {
    // Encoding failed. Keep the original bytes, but only claim an extension for
    // a format the serve route can actually type.
    return unchanged(verbatimExt)
  }
}
