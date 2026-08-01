import * as React from 'react'
import { cn } from './cn'

type ProgressBarProps = {
  /** Current value. */
  value: number
  /** Max value (defaults to 100). */
  max?: number
  tone?: 'xp' | 'primary' | 'success'
  size?: 'sm' | 'md' | 'lg'
  /** Show the "x / y" label above the track. */
  label?: React.ReactNode
  /** Small pill rendered flush to the LEFT of the track (e.g. current level). */
  startCap?: React.ReactNode
  /** Small pill rendered flush to the RIGHT of the track (e.g. next level). */
  endCap?: React.ReactNode
  /** Short text drawn centered ON the track (e.g. "150 / 500 XP"). */
  valueText?: React.ReactNode
  /** Animated diagonal sheen sweeping across the fill (default on). */
  shine?: boolean
  /**
   * Use the design's animated candy stripe as the fill (instead of a flat
   * gradient). Defaults on for the `xp` tone — matching the exported design.
   */
  candy?: boolean
  /** Accessible name for the progress track. */
  ariaLabel?: string
  className?: string
}

const trackHeight = {
  sm: 'h-2',
  md: 'h-3',
  lg: 'h-5',
}

const fillTone = {
  xp: 'bg-xp-fill',
  primary: 'bg-primary-fill',
  success: 'bg-success-fill',
}

const capTone = {
  xp: 'bg-xp-500 text-white',
  primary: 'bg-primary-600 text-white',
  success: 'bg-success-500 text-white',
}

/**
 * ProgressBar — gradient XP / level progress. Rounded track on cream, gradient
 * fill with a soft inner sheen and an optional sweeping shine. Optional level
 * pills sit flush at each end and a "x / y XP" readout can be drawn on the
 * track — matching the design's XP bar. Clamps to [0, max].
 */
export function ProgressBar({
  value,
  max = 100,
  tone = 'xp',
  size = 'md',
  label,
  startCap,
  endCap,
  valueText,
  shine = true,
  candy,
  ariaLabel = 'progress',
  className,
}: ProgressBarProps) {
  const safeMax = max <= 0 ? 1 : max
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100))
  const hasCaps = startCap != null || endCap != null
  // Candy stripe is the design default for the XP bar; opt in/out explicitly.
  const useCandy = candy ?? tone === 'xp'

  const track = (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      className={cn(
        'relative w-full overflow-hidden rounded-pill bg-cream-500',
        'shadow-[inset_0_1px_2px_rgba(122,90,50,.18)]',
        hasCaps ? 'flex-1' : '',
        trackHeight[size],
      )}
    >
      <div
        className={cn(
          'relative h-full rounded-pill transition-[width] duration-500 ease-out',
          useCandy
            ? 'bg-xp-candy bg-[length:62px_100%] animate-hhStripe'
            : fillTone[tone],
        )}
        style={{ width: `${pct}%` }}
      >
        {/* top gloss */}
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1/2 rounded-t-pill bg-white/25"
        />
        {/* sweeping sheen — off for candy (the stripe motion is the animation) */}
        {shine && !useCandy && pct > 0 && (
          <span
            aria-hidden
            className="absolute inset-y-0 w-1/3 animate-xpShine bg-gradient-to-r from-transparent via-white/45 to-transparent"
          />
        )}
      </div>
      {/* value readout drawn over the whole track, centered */}
      {valueText != null && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] font-extrabold text-ink-900/80">
          {valueText}
        </span>
      )}
    </div>
  )

  return (
    <div className={cn('w-full', className)}>
      {label != null && (
        <div className="mb-1.5 flex items-center justify-between text-sm font-bold text-ink-700">
          {label}
        </div>
      )}
      {hasCaps ? (
        <div className="flex items-center gap-2">
          {startCap != null && (
            <span
              className={cn(
                'shrink-0 rounded-pill px-2.5 py-1 text-xs font-extrabold shadow-sm',
                capTone[tone],
              )}
            >
              {startCap}
            </span>
          )}
          {track}
          {endCap != null && (
            <span
              className={cn(
                'shrink-0 rounded-pill px-2.5 py-1 text-xs font-extrabold',
                'bg-cream-300 text-ink-700',
              )}
            >
              {endCap}
            </span>
          )}
        </div>
      ) : (
        track
      )}
    </div>
  )
}
