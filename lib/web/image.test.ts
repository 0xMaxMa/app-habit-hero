/**
 * lib/web/image.test.ts — guard-path coverage for the upload downscaler.
 *
 * The happy path (real canvas re-encode) needs a browser and is exercised in
 * the live e2e; here we lock down the *safety* guards that must never drop or
 * corrupt an upload: anything we can't faithfully re-encode is returned as-is.
 */
import { describe, it, expect } from 'vitest'
import { downscaleImage } from '@/lib/web/image'

function fakeFile(name: string, type: string, bytes = 1024): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

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
