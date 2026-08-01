import * as React from 'react'
import { cn } from './cn'

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg' | 'kid'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Stretch to fill the container width. */
  fullWidth?: boolean
  /** Optional leading element (emoji / icon). */
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

/**
 * Signature "chunky" tactile button: a hard bottom-offset shadow that
 * compresses on press (translate-y). Matches the Cozy mockup's 3D pill
 * buttons. `kid` size gives extra-large tap targets for young children.
 */
const base =
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-extrabold ' +
  'rounded-pill border transition-[transform,box-shadow] duration-100 ' +
  'active:translate-y-[3px] disabled:pointer-events-none disabled:opacity-50 ' +
  'disabled:shadow-none disabled:active:translate-y-0'

const variantMap: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white border-primary-700 shadow-[0_4px_0_#27619B] ' +
    'hover:bg-primary-500 active:shadow-[0_1px_0_#27619B]',
  secondary:
    'bg-cream-50 text-ink-900 border-cream-600 shadow-[0_4px_0_#E9DCC6] ' +
    'hover:bg-cream-100 active:shadow-[0_1px_0_#E9DCC6]',
  success:
    'bg-success-500 text-white border-success-500 shadow-[0_4px_0_#3C6B28] ' +
    'hover:bg-success-400 active:shadow-[0_1px_0_#3C6B28]',
  danger:
    'bg-danger-500 text-white border-danger-500 shadow-[0_4px_0_#963F28] ' +
    'hover:brightness-105 active:shadow-[0_1px_0_#963F28]',
  ghost:
    'bg-transparent text-ink-700 border-transparent shadow-none ' +
    'hover:bg-cream-300 active:translate-y-0',
}

const sizeMap: Record<ButtonSize, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'px-7 text-base min-h-[52px]',
  // Extra-large, thumb-friendly target for kids (>= 44pt guideline, and then some)
  kid: 'min-h-[60px] px-8 text-xl gap-3 rounded-3xl',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      leftIcon,
      rightIcon,
      className,
      children,
      type = 'button',
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          base,
          variantMap[variant],
          sizeMap[size],
          fullWidth && 'w-full',
          className,
        )}
        {...rest}
      >
        {leftIcon != null && <span className="shrink-0">{leftIcon}</span>}
        {children}
        {rightIcon != null && <span className="shrink-0">{rightIcon}</span>}
      </button>
    )
  },
)
