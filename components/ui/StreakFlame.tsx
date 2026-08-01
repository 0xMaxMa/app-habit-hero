import * as React from 'react'
import { cn } from './cn'

type StreakFlameProps = {
  /** Number of consecutive days. */
  days: number
  size?: 'sm' | 'md' | 'lg'
  /** Suffix label (default: "วันติด" — days in a row). */
  unitLabel?: string
  className?: string
}

const sizeMap = {
  sm: 'h-7 px-2.5 text-sm gap-1',
  md: 'h-9 px-3 text-base gap-1.5',
  lg: 'h-11 px-4 text-lg gap-2',
}

/**
 * StreakFlame — flame + day count. Gains a warm glow once the streak
 * crosses 7 days (matches the design spec's "special glow > 7 วัน").
 */
export function StreakFlame({
  days,
  size = 'md',
  unitLabel = 'วันติด',
  className,
}: StreakFlameProps) {
  const hot = days >= 7
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border font-extrabold tabular-nums',
        sizeMap[size],
        hot
          ? 'border-xp-500/50 bg-xp-300/70 text-xp-700 shadow-[0_0_0_3px_rgba(242,169,59,.18)]'
          : 'border-cream-600 bg-cream-300 text-ink-700',
        className,
      )}
      title={`${days} ${unitLabel}`}
    >
      <span aria-hidden className={cn('leading-none', hot && 'animate-pulse')}>
        🔥
      </span>
      <span>{days}</span>
      <span className="font-bold opacity-80">{unitLabel}</span>
    </span>
  )
}
