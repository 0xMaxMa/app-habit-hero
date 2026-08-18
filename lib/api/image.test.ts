// @vitest-environment node
//
// Node, not the suite-wide jsdom: sharp is a native module and the fixtures are
// real encoded images, neither of which belongs in a DOM environment.

/**
 * lib/api/image.test.ts — server-side upload normalization.
 *
 * These pin the fix for uploads that never met the app's own size promise: the
 * gateway agent POSTs a photo straight from Telegram without touching the
 * browser downscaler, so the deployed volume held files up to 2048×1536 / 1 MB
 * while the web client claimed a 1280px cap.
 *
 * Fixtures are generated with sharp itself rather than committed binaries, so
 * a test failure is always about the code under test and never about a stale
 * blob in the repo.
 */

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { AVATAR_PRESET, normalizeImage, PHOTO_PRESET, STORED_EXTENSIONS } from './image'
import { CONTENT_TYPES } from './photo'

/** A JPEG of the given size, noisy enough that it does not compress to nothing
 * (a flat colour encodes so small that byte-size assertions stop meaning
 * anything). */
async function jpeg(width: number, height: number, quality = 95): Promise<Buffer> {
  return sharp(await noise(width, height))
    .jpeg({ quality })
    .toBuffer()
}

/** Raw RGB noise — deterministic, so a size assertion cannot flake. */
async function noise(width: number, height: number): Promise<Buffer> {
  const channels = 3
  const data = Buffer.alloc(width * height * channels)
  for (let i = 0; i < data.length; i++) {
    // A cheap LCG-ish pattern: high-frequency detail, no randomness.
    data[i] = (i * 97 + ((i / width) | 0) * 31) % 256
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer()
}

async function dims(buf: Buffer): Promise<{ width: number; height: number }> {
  const meta = await sharp(buf).metadata()
  return { width: meta.width ?? 0, height: meta.height ?? 0 }
}

/** An animated image of `frames` frames, in the given format. */
async function animated(
  width: number,
  height: number,
  frames: number,
  to: 'gif' | 'webp',
): Promise<Buffer> {
  const pages = await Promise.all(
    Array.from({ length: frames }, (_, i) =>
      sharp(seededNoise(width, height, i), {
        raw: { width, height, channels: 3 },
      })
        .png()
        .toBuffer(),
    ),
  )
  const joined = sharp(pages, { join: { animated: true } })
  return to === 'gif' ? joined.gif().toBuffer() : joined.webp({ quality: 60 }).toBuffer()
}

/** Deterministic high-frequency bytes; `seed` varies them per frame. */
function seededNoise(width: number, height: number, seed = 0): Buffer {
  const data = Buffer.alloc(width * height * 3)
  for (let i = 0; i < data.length; i++) {
    data[i] = (i * 97 + ((i / width) | 0) * 31 + seed * 13) % 256
  }
  return data
}

async function pageCount(buf: Buffer): Promise<number> {
  return (await sharp(buf, { animated: true }).metadata()).pages ?? 1
}

describe('normalizeImage — the cap', () => {
  it('fits an oversized photo inside the cap and re-encodes it smaller', async () => {
    // The exact shape found on the deployed volume: 2048×1536, ~1 MB.
    const input = await jpeg(2048, 1536)

    const out = await normalizeImage(input, PHOTO_PRESET)

    expect(out.reencoded).toBe(true)
    expect(out.ext).toBe('.jpg')
    const { width, height } = await dims(out.data)
    expect(Math.max(width, height)).toBeLessThanOrEqual(PHOTO_PRESET.maxDim)
    // Aspect ratio survives (4:3 in, 4:3 out).
    expect(width / height).toBeCloseTo(2048 / 1536, 2)
    expect(out.data.byteLength).toBeLessThan(input.byteLength)
  })

  it('applies the tighter avatar cap to the same image', async () => {
    const input = await jpeg(2048, 1536)

    const out = await normalizeImage(input, AVATAR_PRESET)

    const { width, height } = await dims(out.data)
    expect(Math.max(width, height)).toBe(AVATAR_PRESET.maxDim)
  })

  it('never enlarges an image that is smaller than the cap', async () => {
    const input = await jpeg(120, 90)

    const out = await normalizeImage(input, PHOTO_PRESET)

    const { width, height } = await dims(out.data)
    expect({ width, height }).toEqual({ width: 120, height: 90 })
  })

  it('recompresses an in-bounds photo that is simply too heavy', async () => {
    // 1200px is under the 1280 cap, but at quality 100 it lands well over the
    // keepBytes budget — the case a straight dimension check would wave through.
    const input = await sharp(await noise(1200, 900)).jpeg({ quality: 100 }).toBuffer()
    expect(input.byteLength).toBeGreaterThan(PHOTO_PRESET.keepBytes)

    const out = await normalizeImage(input, PHOTO_PRESET)

    expect(out.reencoded).toBe(true)
    expect(out.data.byteLength).toBeLessThan(input.byteLength)
  })
})

describe('normalizeImage — what it leaves alone', () => {
  it('stores an in-bounds, small, web-safe photo exactly as sent', async () => {
    const input = await jpeg(640, 480, 70)
    expect(input.byteLength).toBeLessThanOrEqual(PHOTO_PRESET.keepBytes)

    const out = await normalizeImage(input, PHOTO_PRESET)

    expect(out.reencoded).toBe(false)
    expect(out.data).toBe(input) // the very same bytes, not a re-encode
    expect(out.ext).toBe('.jpg')
  })

  it('leaves a small GIF alone, animation and all', async () => {
    const input = await animated(64, 64, 4, 'gif')
    expect(input.byteLength).toBeLessThanOrEqual(AVATAR_PRESET.keepBytes)

    const out = await normalizeImage(input, AVATAR_PRESET)

    expect(out.reencoded).toBe(false)
    expect(out.data).toBe(input)
    expect(out.ext).toBe('.gif')
  })

  it('rasterizes an SVG rather than storing markup the serve route cannot type', async () => {
    // Stored as `.svg`, /api/photos hands it back as application/octet-stream —
    // and /pin, which inlines an avatar as `data:<contentType>;base64,…`,
    // renders nothing at all. A 256px raster is what the app displays anyway.
    const input = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="4000"><circle cx="2000" cy="2000" r="1800" fill="red"/></svg>',
    )

    const out = await normalizeImage(input, AVATAR_PRESET)

    expect(out.reencoded).toBe(true)
    expect(STORED_EXTENSIONS).toContain(out.ext)
    const meta = await sharp(out.data).metadata()
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(AVATAR_PRESET.maxDim)
  })

  it('stores bytes it cannot decode untouched, rather than failing the upload', async () => {
    const input = Buffer.from('this is not an image at all')

    const out = await normalizeImage(input, PHOTO_PRESET)

    expect(out).toEqual({ data: input, ext: null, reencoded: false })
  })

  it('keeps the original when a re-encode would not actually be smaller', async () => {
    // Already JPEG-compressed hard: encoding it again at quality 80 buys
    // nothing, and each generation loses detail.
    const input = await jpeg(1000, 750, 30)
    expect(input.byteLength).toBeLessThanOrEqual(PHOTO_PRESET.keepBytes)

    const out = await normalizeImage(input, PHOTO_PRESET)

    expect(out.data).toBe(input)
  })
})

describe('normalizeImage — formats a phone produces', () => {
  it('transcodes an oversized PNG to JPEG', async () => {
    const input = await noise(2000, 1500) // PNG

    const out = await normalizeImage(input, PHOTO_PRESET)

    expect(out.ext).toBe('.jpg')
    const meta = await sharp(out.data).metadata()
    expect(meta.format).toBe('jpeg')
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(PHOTO_PRESET.maxDim)
    // Deliberately no byte assertion: this fixture is synthetic high-frequency
    // detail, which PNG happens to store more compactly than JPEG can. What the
    // cap guarantees is the dimension — bytes are asserted on the photographic
    // fixtures above.
  })

  it('keeps transparency by choosing WebP, not JPEG', async () => {
    // JPEG has no alpha channel: encoding this as JPEG turns the see-through
    // half black, which on an avatar is very visible.
    const input = await sharp({
      create: {
        width: 800,
        height: 800,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 0.5 },
      },
    })
      .png()
      .toBuffer()

    const out = await normalizeImage(input, AVATAR_PRESET)

    expect(out.reencoded).toBe(true)
    expect(out.ext).toBe('.webp')
    const meta = await sharp(out.data).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.hasAlpha).toBe(true)
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(AVATAR_PRESET.maxDim)
  })

  it('bakes EXIF rotation into the pixels before stripping the metadata', async () => {
    // Orientation 6 = "rotate 90° clockwise on display". Stored 1600×1200, so a
    // viewer sees 1200×1600 — the resize must measure the upright edges, and
    // the output must already be upright since the EXIF tag does not survive.
    const input = await sharp(await noise(1600, 1200))
      .withMetadata({ orientation: 6 })
      .jpeg({ quality: 95 })
      .toBuffer()

    const out = await normalizeImage(input, PHOTO_PRESET)

    const meta = await sharp(out.data).metadata()
    expect(meta.height).toBeGreaterThan(meta.width ?? 0) // portrait, as displayed
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(
      PHOTO_PRESET.maxDim,
    )
  })
})

describe('normalizeImage — animation', () => {
  // An avatar is inlined as base64 into the PUBLIC /pin page, so an unbounded
  // one is a slow login screen for everybody, not just a big file on a volume.
  it('bounds an oversized animated GIF instead of waving it through', async () => {
    const input = await animated(1200, 1200, 4, 'gif')
    expect(input.byteLength).toBeGreaterThan(AVATAR_PRESET.keepBytes)

    const out = await normalizeImage(input, AVATAR_PRESET)

    expect(out.reencoded).toBe(true)
    expect(out.data.byteLength).toBeLessThan(input.byteLength)
    const meta = await sharp(out.data, { animated: true }).metadata()
    expect(Math.max(meta.width ?? 0, meta.pageHeight ?? 0)).toBe(AVATAR_PRESET.maxDim)
  })

  it('keeps every frame when it has to shrink an animation', async () => {
    // Fitting an animation to the cap must not silently turn it into a still —
    // WebP carries the frames, JPEG would keep only the first.
    const input = await animated(1200, 1200, 4, 'gif')

    const out = await normalizeImage(input, AVATAR_PRESET)

    expect(out.ext).toBe('.webp')
    expect(await pageCount(out.data)).toBe(4)
  })

  it('does the same for an animated WebP, not just a GIF', async () => {
    const input = await animated(600, 600, 4, 'webp')
    expect(await pageCount(input)).toBe(4)

    const out = await normalizeImage(input, AVATAR_PRESET)

    expect(await pageCount(out.data)).toBe(4)
    const meta = await sharp(out.data, { animated: true }).metadata()
    expect(Math.max(meta.width ?? 0, meta.pageHeight ?? 0)).toBe(AVATAR_PRESET.maxDim)
  })
})

describe('normalizeImage — every extension it hands back is servable', () => {
  // The serve route types a file by its extension and falls back to
  // application/octet-stream, which an <img> renders as nothing. Anything this
  // module can name has to be in that table.
  it('produces only extensions CONTENT_TYPES knows', () => {
    for (const ext of STORED_EXTENSIONS) {
      expect(CONTENT_TYPES[ext], `${ext} has no content type`).toBeTruthy()
    }
  })

  it('names an AVIF something a browser will render', async () => {
    // sharp reports AVIF as `format: 'heif'`, so a table keyed on that name and
    // mapping to `.heic` would serve `image/heic` — which no browser renders.
    const input = await sharp(await noise(400, 300)).avif({ quality: 50 }).toBuffer()

    const out = await normalizeImage(input, PHOTO_PRESET)

    expect(STORED_EXTENSIONS).toContain(out.ext)
    expect(CONTENT_TYPES[out.ext as string]).toMatch(/^image\/(jpeg|webp)$/)
  })
})
