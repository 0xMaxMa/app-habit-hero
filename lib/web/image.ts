/**
 * lib/web/image.ts — browser-side image downscaling before upload.
 *
 * Why this exists: avatars are INLINED as base64 data URIs into the PUBLIC /pin
 * login page (that page is pre-auth, so it can't hit the auth-gated /api/avatars
 * route). A single 2 MB photo turned the /pin HTML into ~7 MB, and hydrating
 * that much inline base64 on a phone left the login buttons unresponsive for
 * several seconds — i.e. "ปุ่มกดไม่ได้".
 *
 * Shrinking here rather than only on the server also spares the upload itself,
 * which is the part a child on mobile data actually waits for. The server
 * normalizes every upload again (lib/api/image) with the same caps, so this
 * step is an optimization — not the thing that keeps the volume bounded.
 */

/** A decoded image source plus a disposer for whatever we allocated. */
interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  dispose: () => void
}

/** Decode a File into something drawable, preferring the fast off-thread path. */
async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close(),
    }
  }
  // Fallback: <img> + object URL (older Safari).
  const url = URL.createObjectURL(file)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('decode failed'))
    img.src = url
  })
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    dispose: () => URL.revokeObjectURL(url),
  }
}

/** Raster types every browser renders as-is — for these, re-encoding is purely
 * a size optimization and we may safely keep the original. */
const WEB_SAFE = /^image\/(jpeg|png|webp)$/
/** Never re-encode: animation (GIF) or vector (SVG) would be destroyed. */
const NEVER_ENCODE = /^image\/(gif|svg\+xml)$/

/**
 * Downscale an image File to at most `maxDim` px on its longest edge, re-encoded
 * as JPEG. Returns a new File, or the original untouched when it is already
 * small enough, is not a raster image we can safely re-encode, or the browser
 * can't decode it (we never want the resize step to block a legitimate upload).
 *
 * Types outside WEB_SAFE (HEIC/HEIF/AVIF — what an iPhone photo library hands
 * over) are ALWAYS transcoded when the browser can decode them, even if small,
 * so the bytes leaving the device are already something every parent's browser
 * renders. Apple platforms decode HEIC natively, which is exactly where such
 * files come from, so the canvas path converts them at the source — and it has
 * to, because the server cannot: the prebuilt libvips behind lib/api/image has
 * no HEVC decoder, so a HEIC that reaches it is stored as sent.
 *
 * @param maxDim  longest-edge cap in px (avatars 256, proof photos ~1280)
 * @param quality JPEG quality 0–1
 */
export async function downscaleImage(
  file: File,
  maxDim = 256,
  quality = 0.85,
): Promise<File> {
  // SSR guard + skip anything a canvas can't faithfully re-encode.
  const isImage = /^image\//.test(file.type)
  if (typeof document === 'undefined' || !isImage || NEVER_ENCODE.test(file.type)) {
    return file
  }
  const webSafe = WEB_SAFE.test(file.type)

  let decoded: Decoded | null = null
  try {
    decoded = await decode(file)
    const { source, width, height } = decoded
    const longest = Math.max(width, height)
    const scale = Math.min(1, maxDim / longest)

    // Already within bounds and not heavy → skip the needless re-encode.
    // Only for web-safe types; others must be transcoded regardless of size.
    if (webSafe && scale === 1 && file.size <= 300 * 1024) return file

    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(source, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (!blob) return file
    // Never grow the file — unless the original is a format the web can't be
    // trusted to render, where correctness beats a few extra KB.
    if (webSafe && blob.size >= file.size) return file

    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file // decode/encode failed → fall back to the original
  } finally {
    decoded?.dispose()
  }
}
