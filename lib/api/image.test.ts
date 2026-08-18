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
import { AVATAR_PRESET, normalizeImage, PHOTO_PRESET } from './image'

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

  it('leaves an animated GIF alone — re-encoding would drop the animation', async () => {
    const input = await sharp(await noise(64, 64)).gif().toBuffer()

    const out = await normalizeImage(input, AVATAR_PRESET)

    expect(out.reencoded).toBe(false)
    expect(out.ext).toBe('.gif')
  })

  it('leaves an SVG alone — rasterizing would throw the vector away', async () => {
    const input = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="4000"><rect width="4000" height="4000" fill="red"/></svg>',
    )

    const out = await normalizeImage(input, PHOTO_PRESET)

    expect(out.reencoded).toBe(false)
    expect(out.data).toBe(input)
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
