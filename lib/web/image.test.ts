/**
 * lib/web/image.test.ts — guard-path coverage for the upload downscaler.
 *
 * The happy path (real canvas re-encode) needs a browser and is exercised in
 * the live e2e; here we lock down the *safety* guards that must never drop or
 * corrupt an upload: anything we can't faithfully re-encode is returned as-is.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { downscaleImage } from '@/lib/web/image'

function fakeFile(name: string, type: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

/**
 * jsdom has no image decoder or canvas backend, so the re-encode path is
 * unreachable by default. These stubs stand in for both: a decoded bitmap of a
 * chosen size, and a canvas whose toBlob yields a JPEG of a chosen size.
 */
function stubEncodePipeline(opts: { width: number; height: number; blobBytes: number }) {
  vi.stubGlobal('createImageBitmap', async () => ({
    width: opts.width,
    height: opts.height,
    close: () => {},
  }))
  const realCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag !== 'canvas') return realCreateElement(tag)
    return {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (cb: (b: Blob | null) => void) =>
        cb(new Blob([new Uint8Array(opts.blobBytes)], { type: 'image/jpeg' })),
    } as unknown as HTMLCanvasElement
  }) as typeof document.createElement)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('downscaleImage — passthrough guards', () => {
  it('returns non-image files untouched', async () => {
    const pdf = fakeFile('doc.pdf', 'application/pdf')
    expect(await downscaleImage(pdf, 256)).toBe(pdf)
  })

  it('returns SVGs untouched (not a raster format)', async () => {
    const svg = fakeFile('logo.svg', 'image/svg+xml')
    expect(await downscaleImage(svg, 256)).toBe(svg)
  })

  it('returns GIFs untouched (would lose animation)', async () => {
    const gif = fakeFile('anim.gif', 'image/gif')
    expect(await downscaleImage(gif, 256)).toBe(gif)
  })

  it('never throws — falls back to the original when decode is unavailable', async () => {
    // jsdom has no real image decoder, so an encodable type still resolves to
    // the original rather than rejecting.
    const jpg = fakeFile('photo.jpg', 'image/jpeg', 5 * 1024 * 1024)
    const out = await downscaleImage(jpg, 256)
    expect(out).toBeInstanceOf(File)
  })
})

describe('downscaleImage — phone-library formats', () => {
  it('transcodes a HEIC to JPEG even when it is already small enough', async () => {
    // A picture picked from an iPhone library: within the size cap and under
    // the 300 KB "skip the re-encode" shortcut that web-safe types enjoy. It
    // must still be converted — the server stores and serves files verbatim, so
    // a stored .heic is unrenderable on non-Apple browsers.
    stubEncodePipeline({ width: 800, height: 600, blobBytes: 90 * 1024 })
    const heic = fakeFile('IMG_0001.HEIC', 'image/heic', 120 * 1024)

    const out = await downscaleImage(heic, 1280)

    expect(out).not.toBe(heic)
    expect(out.type).toBe('image/jpeg')
    expect(out.name).toBe('IMG_0001.jpg')
  })

  it('transcodes a HEIC even when the resulting JPEG is larger', async () => {
    // HEIC compresses better than JPEG, so a faithful conversion can grow the
    // file. Correctness (a photo the parent can actually see) wins over bytes.
    stubEncodePipeline({ width: 800, height: 600, blobBytes: 200 * 1024 })
    const heic = fakeFile('IMG_0002.heic', 'image/heic', 80 * 1024)

    const out = await downscaleImage(heic, 1280)

    expect(out.type).toBe('image/jpeg')
    expect(out.size).toBe(200 * 1024)
  })

  it('still skips the re-encode for a small web-safe JPEG', async () => {
    // The size optimization must survive: no pointless quality loss on files
    // every browser can already render.
    stubEncodePipeline({ width: 800, height: 600, blobBytes: 10 * 1024 })
    const jpg = fakeFile('photo.jpg', 'image/jpeg', 100 * 1024)

    expect(await downscaleImage(jpg, 1280)).toBe(jpg)
  })

  it('keeps a web-safe JPEG when re-encoding would grow it', async () => {
    stubEncodePipeline({ width: 800, height: 600, blobBytes: 900 * 1024 })
    const jpg = fakeFile('photo.jpg', 'image/jpeg', 400 * 1024)

    expect(await downscaleImage(jpg, 1280)).toBe(jpg)
  })
})
