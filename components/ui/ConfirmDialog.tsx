'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { cn } from './cn'

type ConfirmDialogProps = {
  open: boolean
  title: string
  message?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Tone of the confirm button. */
  tone?: 'primary' | 'danger'
  icon?: React.ReactNode
  busy?: boolean
  /** Disable the confirm button (e.g. a type-to-confirm gate not yet met). */
  confirmDisabled?: boolean
  /** Extra content between the message and the actions (e.g. a confirm input). */
  children?: React.ReactNode
  /** Failure message shown inside the dialog (so the popup never looks frozen
   *  when a confirm action fails on the server). */
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * ConfirmDialog — a small, centered yes/no modal on a dimmed backdrop.
 * Matches the Cozy card style; used for destructive/irreversible actions like
 * signing out. Closes on backdrop click or Escape.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  tone = 'primary',
  icon,
  busy = false,
  confirmDisabled = false,
  children,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Mount guard: portals need document.body, which only exists on the client.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open || !mounted) return null

  // Portal to <body> so the fixed overlay escapes any transformed / blurred
  // ancestor (the nav bars use `backdrop-blur`, which creates a containing
  // block that would otherwise trap `position: fixed` inside the nav's box).
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onCancel}
        className="absolute inset-0 cursor-default bg-ink-900/40 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-xs rounded-3xl bg-cream-50 p-6 text-center shadow-xl ring-1 ring-black/5">
        {icon != null && <div className="mb-2 text-4xl">{icon}</div>}
        <h2 className="text-lg font-extrabold text-ink-900">{title}</h2>
        {message != null && (
          <p className="mt-1.5 text-sm font-semibold text-ink-600">{message}</p>
        )}
        {children != null && <div className="mt-3 text-left">{children}</div>}
        {error ? (
          <p className="mt-3 rounded-xl bg-danger-100 px-3 py-2 text-sm font-semibold text-danger-500">
            {error}
          </p>
        ) : null}
        {/* Stack the actions so a long Thai label (e.g. "ออกจากระบบ") gets the
            full dialog width and never wraps past the fixed-height pill. */}
        <div className={cn('mt-5 flex flex-col gap-2.5')}>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="md"
            fullWidth
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
            className="whitespace-nowrap"
          >
            {busy ? '…' : confirmLabel}
          </Button>
          <Button
            variant="secondary"
            size="md"
            fullWidth
            onClick={onCancel}
            disabled={busy}
            className="whitespace-nowrap"
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
