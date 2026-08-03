import * as React from 'react'
import { cn } from './cn'

export type AvatarCharacter =
  | 'panda'
  | 'fox'
  | 'rabbit'
  | 'chick'
  | 'cat'
  | 'bear'
  | 'initials'

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

/** Self-contained rabbit face. */
function RabbitFace() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-hidden>
      <ellipse cx="34" cy="22" rx="9" ry="20" fill="#FFFDF6" stroke="#E4D9C4" strokeWidth="2" />
      <ellipse cx="66" cy="22" rx="9" ry="20" fill="#FFFDF6" stroke="#E4D9C4" strokeWidth="2" />
      <ellipse cx="34" cy="24" rx="4" ry="13" fill="#FBE1D6" />
      <ellipse cx="66" cy="24" rx="4" ry="13" fill="#FBE1D6" />
      <circle cx="50" cy="60" r="30" fill="#FFFDF6" />
      <ellipse cx="39" cy="56" rx="4" ry="6" fill="#3F3227" />
      <ellipse cx="61" cy="56" rx="4" ry="6" fill="#3F3227" />
      <path d="M46 68 L54 68 L50 73 Z" fill="#E58BA0" />
      <path
        d="M42 78 Q50 84 58 78"
        stroke="#3F3227"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="28" cy="68" r="5" fill="#FBE1D6" />
      <circle cx="72" cy="68" r="5" fill="#FBE1D6" />
    </svg>
  )
}

/** Self-contained chick face. */
function ChickFace() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-hidden>
      <path d="M50 12 L44 26 L56 26 Z" fill="#F2A93B" />
      <circle cx="50" cy="56" r="34" fill="#FBD65B" />
      <ellipse cx="38" cy="50" rx="5" ry="6" fill="#3F3227" />
      <ellipse cx="62" cy="50" rx="5" ry="6" fill="#3F3227" />
      <circle cx="39" cy="48" r="2" fill="#FFFDF6" />
      <circle cx="63" cy="48" r="2" fill="#FFFDF6" />
      <path d="M42 64 L58 64 L50 72 Z" fill="#F2872B" />
      <circle cx="26" cy="62" r="5" fill="#F6A6A0" opacity="0.7" />
      <circle cx="74" cy="62" r="5" fill="#F6A6A0" opacity="0.7" />
    </svg>
  )
}

/** Self-contained cat face. */
function CatFace() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-hidden>
      <path d="M22 20 L30 48 L46 32 Z" fill="#9C8AA5" />
      <path d="M78 20 L70 48 L54 32 Z" fill="#9C8AA5" />
      <path d="M26 26 L31 43 L41 33 Z" fill="#FBE1D6" />
      <path d="M74 26 L69 43 L59 33 Z" fill="#FBE1D6" />
      <circle cx="50" cy="56" r="32" fill="#B9A7C2" />
      <ellipse cx="38" cy="52" rx="4" ry="8" fill="#3F3227" />
      <ellipse cx="62" cy="52" rx="4" ry="8" fill="#3F3227" />
      <path d="M46 64 L54 64 L50 69 Z" fill="#E58BA0" />
      <path
        d="M50 69 Q44 76 38 72 M50 69 Q56 76 62 72"
        stroke="#3F3227"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M18 56 L32 58 M18 66 L32 65 M82 56 L68 58 M82 66 L68 65"
        stroke="#3F3227"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  )
}

/** Self-contained bear face. */
function BearFace() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-hidden>
      <circle cx="24" cy="28" r="13" fill="#B98252" />
      <circle cx="76" cy="28" r="13" fill="#B98252" />
      <circle cx="24" cy="28" r="6" fill="#FBE1D6" />
      <circle cx="76" cy="28" r="6" fill="#FBE1D6" />
      <circle cx="50" cy="56" r="34" fill="#C79461" />
      <ellipse cx="50" cy="70" rx="17" ry="13" fill="#EBD3B4" />
      <ellipse cx="38" cy="50" rx="4" ry="5" fill="#3F3227" />
      <ellipse cx="62" cy="50" rx="4" ry="5" fill="#3F3227" />
      <ellipse cx="50" cy="65" rx="6" ry="4" fill="#3F3227" />
      <path
        d="M44 74 Q50 79 56 74"
        stroke="#3F3227"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

/**
 * Avatar — circle with an illustrated animal face (inline, self-contained SVG)
 * or initials, with an optional colored level ring.
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
          {character === 'rabbit' && <RabbitFace />}
          {character === 'chick' && <ChickFace />}
          {character === 'cat' && <CatFace />}
          {character === 'bear' && <BearFace />}
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
