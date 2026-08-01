import * as React from 'react'
import { cn } from './cn'

type ContainerProps = React.HTMLAttributes<HTMLDivElement> & {
  size?: 'sm' | 'md' | 'lg'
}

const maxWidth = {
  sm: 'max-w-md',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
}

/** Container — centered, width-capped, responsive horizontal padding. */
export function Container({
  size = 'lg',
  className,
  children,
  ...rest
}: ContainerProps) {
  return (
    <div
      className={cn('mx-auto w-full px-4 sm:px-6', maxWidth[size], className)}
      {...rest}
    >
      {children}
    </div>
  )
}

type PageShellProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Sticky top bar content (title, actions). */
  header?: React.ReactNode
  containerSize?: ContainerProps['size']
}

/**
 * PageShell — full-height cozy page scaffold with an optional sticky
 * header. Mobile-first; content is centered via Container on wide screens.
 */
export function PageShell({
  header,
  containerSize = 'lg',
  className,
  children,
  ...rest
}: PageShellProps) {
  return (
    <div className={cn('min-h-dvh', className)} {...rest}>
      {header != null && (
        <header className="sticky top-0 z-20 border-b border-cream-500 bg-cream-100/85 backdrop-blur">
          <Container size={containerSize} className="flex h-14 items-center gap-3">
            {header}
          </Container>
        </header>
      )}
      <main className="py-5 sm:py-8">
        <Container size={containerSize}>{children}</Container>
      </main>
    </div>
  )
}
