import * as React from 'react'
import { cn } from './cn'

type XpBadgeProps = {
  /** XP amount to show. */
  value: number
  /** Prefix a sign for gains/penalties (e.g. +40 / -12). */
  showSign?: boolean
  size?: 'sm' | 'md' | 'lg'
  /** Tone — `xp` (amber, default), `muted` (neutral) or `penalty` (danger). */
  tone?: 'xp' | 'muted' | 'penalty'
  className?: string
}

const sizeMap = {
  sm: 'h-6 px-2 text-xs gap-1',
  md: 'h-7 px-2.5 text-sm gap-1',
  lg: 'h-9 px-3.5 text-base gap-1.5',
}

const toneMap = {
  xp: 'bg-xp-300/60 text-xp-700 border-xp-500/40',
  muted: 'bg-cream-300 text-ink-700 border-cream-600',
  penalty: 'bg-danger-100 text-danger-500 border-danger-500/30',
}

/**
 * XpBadge — the amber "star" pill used everywhere XP is displayed.
 */
export function XpBadge({
  value,
  showSign = false,
  size = 'md',
  tone = 'xp',
  className,
}: XpBadgeProps) {
  const sign = showSign && value > 0 ? '+' : ''
  const display = `${sign}${value.toLocaleString()}`
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border font-extrabold tabular-nums',
        sizeMap[size],
        toneMap[tone],
        className,
      )}
    >
      {/* A star next to "-50 XP" reads as a reward — the penalty tone gets a
          minus instead, so an earning and a deduction never look alike. */}
      <span aria-hidden className="leading-none">
        {tone === 'penalty' ? '➖' : '⭐'}
      </span>
      {display}
      <span className="font-bold opacity-80">XP</span>
    </span>
  )
}
