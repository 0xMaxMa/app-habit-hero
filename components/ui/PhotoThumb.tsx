'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

/**
 * PhotoThumb — a proof-photo thumbnail that opens the full-size image in a
 * portaled lightbox on tap. Used everywhere a completion photo is shown
 * (approvals, history, child tasks, child home, child profile) so the
 * tap-to-enlarge behaviour is identical across the app.
 *
 * - `photoUrl` is the stored `/api/photos/<file>` path (already family-scoped);
 *   the BASE_PATH prefix is applied here so callers pass the raw value.
 * - When `photoUrl` is null a neutral 📷 placeholder is rendered (no lightbox).
 */
const SIZES = {
  sm: 'h-12 w-12 rounded-xl',
  md: 'h-16 w-16 rounded-2xl',
} as const

export function PhotoThumb({
  photoUrl,
  title,
  size = 'md',
  className,
}: {
  photoUrl: string | null
  title?: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const box = `${SIZES[size]} shrink-0`

  if (!photoUrl) {
    return (
      <span
        aria-hidden
        className={`grid ${box} place-items-center bg-cream-200 text-2xl text-ink-400 ${className ?? ''}`}
      >
        📷
      </span>
    )
  }

  const src = `${BASE_PATH}${photoUrl}`
  const label = title ? `รูปงาน ${title}` : 'รูปงาน'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`ดู${label}แบบเต็ม`}
        className={`group relative ${box} overflow-hidden ring-1 ring-cream-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${className ?? ''}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- authenticated,
            family-scoped photo route; Next/Image can't carry the session cookie. */}
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition group-hover:brightness-95"
        />
        <span className="absolute bottom-0 right-0 rounded-tl-lg bg-ink-900/55 px-1 py-0.5 text-[10px] leading-none text-white">
          🔍
        </span>
      </button>
      {open && (
        <PhotoLightbox src={src} alt={label} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

/**
 * PhotoLightbox — a dimmed full-screen overlay showing the photo at full size.
 * Portaled to <body> so it escapes any card / blurred nav ancestor, and closes
 * on backdrop click or Escape.
 */
function PhotoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!mounted) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-900/80 p-4 backdrop-blur-sm"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        decoding="async"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] max-w-full rounded-2xl object-contain shadow-2xl"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="ปิด"
        className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-lg font-black text-ink-900 shadow-lg hover:bg-white"
      >
        ✕
      </button>
    </div>,
    document.body,
  )
}
