import * as React from 'react'
import { cn } from './cn'

export type AvatarCharacter = 'panda' | 'fox' | 'initials'

type AvatarProps = {
  /** Illustrated character, or `initials` to render text. */
  character?: AvatarCharacter
  /** Uploaded avatar image URL. When set, it takes precedence over `character`. */
  src?: string | null
  /** Used when character is `initials`, or as the aria label. */
  name?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Colored level ring around the avatar. */
  ring?: 'none' | 'primary' | 'xp' | 'success'
  className?: string
}

const sizePx: Record<NonNullable<AvatarProps['size']>, number> = {
  sm: 36,
  md: 48,
  lg: 64,
  xl: 96,
}

const ringMap: Record<NonNullable<AvatarProps['ring']>, string> = {
  none: 'ring-0',
  primary: 'ring-4 ring-primary-400',
  xp: 'ring-4 ring-xp-400',
  success: 'ring-4 ring-success-400',
}

function initialsOf(name?: string): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : ''
  return (first + second).toUpperCase() || '?'
}

/** Self-contained panda face. */
function PandaFace() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-hidden>
      <circle cx="50" cy="52" r="34" fill="#FFFDF6" />
      <circle cx="26" cy="24" r="12" fill="#3F3227" />
      <circle cx="74" cy="24" r="12" fill="#3F3227" />
      <ellipse cx="35" cy="50" rx="10" ry="12" fill="#3F3227" />
      <ellipse cx="65" cy="50" rx="10" ry="12" fill="#3F3227" />
      <circle cx="36" cy="50" r="4" fill="#FFFDF6" />
      <circle cx="64" cy="50" r="4" fill="#FFFDF6" />
      <ellipse cx="50" cy="66" rx="7" ry="5" fill="#3F3227" />
      <path
        d="M43 74 Q50 80 57 74"
        stroke="#3F3227"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="26" cy="62" r="5" fill="#FBE1D6" />
      <circle cx="74" cy="62" r="5" fill="#FBE1D6" />
    </svg>
  )
}

/** Self-contained fox face. */
function FoxFace() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-hidden>
      <path d="M18 20 L40 44 L20 50 Z" fill="#C9891F" />
      <path d="M82 20 L60 44 L80 50 Z" fill="#C9891F" />
      <path d="M50 30 L78 46 L50 86 L22 46 Z" fill="#F2A93B" />
      <path d="M50 58 L72 48 L50 86 L28 48 Z" fill="#FFFDF6" />
      <ellipse cx="38" cy="52" rx="5" ry="6" fill="#3F3227" />
      <ellipse cx="62" cy="52" rx="5" ry="6" fill="#3F3227" />
      <path d="M44 74 L50 80 L56 74 Z" fill="#3F3227" />
      <circle cx="28" cy="60" r="4" fill="#FBE1D6" />
      <circle cx="72" cy="60" r="4" fill="#FBE1D6" />
    </svg>
  )
}

/**
 * Avatar — circle with an illustrated panda/fox face (inline, self-contained
 * SVG) or initials, with an optional colored level ring.
 */
export function Avatar({
  character = 'initials',
  src,
  name,
  size = 'md',
  ring = 'none',
  className,
}: AvatarProps) {
  const px = sizePx[size]
  const label = name ? `${name} avatar` : `${character} avatar`
  return (
    <div
      role="img"
      aria-label={label}
      style={{ width: px, height: px }}
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-cream-600 bg-cream-200',
        ringMap[ring],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded
        // avatars are served from our own /api/avatars route; next/image adds no
        // value here and needs remote-pattern config.
        <img src={src} alt={label} className="h-full w-full object-cover" />
      ) : (
        <>
          {character === 'panda' && <PandaFace />}
          {character === 'fox' && <FoxFace />}
          {character === 'initials' && (
            <span
              className="font-extrabold text-ink-800"
              style={{ fontSize: px * 0.4 }}
            >
              {initialsOf(name)}
            </span>
          )}
        </>
      )}
    </div>
  )
}
