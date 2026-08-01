import * as React from 'react'
import { cn } from './cn'

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Visual treatment. `sunk` reads as an inset well; `plain` drops the shadow. */
  variant?: 'raised' | 'plain' | 'sunk'
  /** Inner padding size. */
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Adds hover lift + pointer affordance (use when the whole card is a link/button). */
  interactive?: boolean
}

const paddingMap: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-7',
}

const variantMap: Record<NonNullable<CardProps['variant']>, string> = {
  raised: 'bg-cream-50 shadow-soft',
  plain: 'bg-cream-50',
  sunk: 'bg-cream-200 shadow-none',
}

/**
 * Card — the foundational cozy surface: cream background, warm hairline
 * border, generously rounded corners and a soft warm shadow.
 */
export function Card({
  variant = 'raised',
  padding = 'md',
  interactive = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border border-cream-500',
        variantMap[variant],
        paddingMap[padding],
        interactive &&
          'cursor-pointer transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-card active:translate-y-0',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mb-3 flex items-start justify-between gap-3', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardTitle({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-lg font-extrabold text-ink-900', className)} {...rest}>
      {children}
    </h3>
  )
}

export function CardSubtitle({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-sm font-semibold text-ink-600', className)} {...rest}>
      {children}
    </p>
  )
}
