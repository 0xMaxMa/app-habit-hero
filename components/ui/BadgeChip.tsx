import * as React from 'react'
import { cn } from './cn'

type BadgeChipProps = {
  /** Emoji or short glyph shown inside the hexagon (used when no imageSrc). */
  icon?: React.ReactNode
  /** Medal image (PNG). When set, it replaces the emoji hexagon. */
  imageSrc?: string
  /** Badge name. */
  label: string
  /** Optional sub-label (e.g. "14 วัน"). */
  hint?: string
  /** Not-yet-earned badges render greyed + desaturated. */
  earned?: boolean
  /** Show a "ใหม่" ribbon (a freshly-earned badge). */
  isNew?: boolean
  /** Rarity tints the medal (emoji mode only). */
  rarity?: 'common' | 'rare' | 'epic'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const rarityRing: Record<NonNullable<BadgeChipProps['rarity']>, string> = {
  common: 'from-success-400 to-success-300 text-white',
  rare: 'from-primary-500 to-primary-300 text-white',
  epic: 'from-xp-500 to-xp-300 text-ink-900',
}

const medalSize = {
  sm: 'h-12 w-12 text-xl',
  md: 'h-16 w-16 text-3xl',
  lg: 'h-24 w-24 text-5xl',
}

// The medal PNGs are the design "gem" hexagon (aspect ~1/1.12), so size the
// image by width and let height follow naturally instead of a square box.
const medalImgWidth = {
  sm: 'w-12',
  md: 'w-16',
  lg: 'w-24',
}

const chipWidth = {
  sm: 'w-20',
  md: 'w-24',
  lg: 'w-28',
}

/**
 * BadgeChip — an achievement medal with a name below. Renders a PNG medal
 * (imageSrc) when given, otherwise a rounded-hexagon emoji medal. Unearned
 * badges are greyed out; freshly-earned ones get a "ใหม่" ribbon.
 */
export function BadgeChip({
  icon,
  imageSrc,
  label,
  hint,
  earned = true,
  isNew = false,
  rarity = 'common',
  size = 'md',
  className,
}: BadgeChipProps) {
  return (
    <div
      className={cn('relative flex flex-col items-center gap-1.5 text-center', chipWidth[size], className)}
      title={label}
    >
      {isNew && earned && (
        <span className="absolute -right-1 -top-1 z-10 rounded-pill bg-danger-500 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
          ใหม่
        </span>
      )}

      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={label}
          className={cn(
            'h-auto object-contain drop-shadow-sm',
            medalImgWidth[size],
            earned ? '' : 'opacity-40 grayscale',
          )}
        />
      ) : (
        <div
          aria-hidden
          className={cn(
            'grid place-items-center bg-gradient-to-br shadow-soft',
            medalSize[size],
            rarityRing[rarity],
            earned ? '' : 'opacity-40 grayscale',
          )}
          style={{
            clipPath: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
          }}
        >
          {icon}
        </div>
      )}

      <span
        className={cn(
          'text-xs font-extrabold leading-tight',
          earned ? 'text-ink-900' : 'text-ink-500',
        )}
      >
        {label}
      </span>
      {hint != null && (
        <span className="text-[11px] font-semibold text-ink-500">{hint}</span>
      )}
    </div>
  )
}
