/**
 * lib/web/image.ts — browser-side image downscaling before upload.
 *
 * Why this exists: uploads are stored on the volume at their original size (no
 * server-side image processing — the app image ships no sharp/jimp). Avatars
 * are then INLINED as base64 data URIs into the PUBLIC /pin login page (that
 * page is pre-auth, so it can't hit the auth-gated /api/avatars route). A single
 * 2 MB photo turned the /pin HTML into ~7 MB, and hydrating that much inline
 * base64 on a phone left the login buttons unresponsive for several seconds —
 * i.e. "ปุ่มกดไม่ได้".
 *
 * Fixing it at the source: shrink images in the browser (via <canvas>) before
 * they ever reach the server, so both the stored file and the inlined data URI
 * stay tiny. Pure client util, no dependency.
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

/**
 * Downscale an image File to at most `maxDim` px on its longest edge, re-encoded
 * as JPEG. Returns a new File, or the original untouched when it is already
 * small enough, is not a raster image we can safely re-encode, or the browser
 * can't decode it (we never want the resize step to block a legitimate upload).
 *
 * @param maxDim  longest-edge cap in px (avatars 256, proof photos ~1280)
 * @param quality JPEG quality 0–1
 */
export async function downscaleImage(
  file: File,
  maxDim = 256,
  quality = 0.85,
): Promise<File> {
  // SSR guard + only touch raster types a canvas can faithfully re-encode.
  // (SVG is not raster; GIF would lose animation — leave both as-is.)
  const encodable = /^image\/(jpeg|png|webp)$/.test(file.type)
  if (typeof document === 'undefined' || !encodable) return file

  let decoded: Decoded | null = null
  try {
    decoded = await decode(file)
    const { source, width, height } = decoded
    const longest = Math.max(width, height)
    const scale = Math.min(1, maxDim / longest)

    // Already within bounds and not heavy → skip the needless re-encode.
    if (scale === 1 && file.size <= 300 * 1024) return file

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
    if (!blob || blob.size >= file.size) return file // never grow the file

    const base = file.name.replace(/\.[^.]+$/, '') || 'image'
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file // decode/encode failed → fall back to the original
  } finally {
    decoded?.dispose()
  }
}
