'use client'

import * as React from 'react'
import { signOut } from 'next-auth/react'
import { ConfirmDialog } from '@/components/ui'

type LogoutButtonProps = {
  /** Where to land after signing out (relative path, e.g. "/login" or "/pin"). */
  redirectTo: string
  className?: string
  children: React.ReactNode
  /** Copy for the confirm modal. */
  confirmTitle?: string
  confirmMessage?: string
}

/**
 * LogoutButton — a sign-out trigger that (1) asks for confirmation first and
 * (2) redirects against the *current browser origin* instead of NEXTAUTH_URL.
 *
 * Why not `signOut({ callbackUrl })`: next-auth resolves a relative callbackUrl
 * against NEXTAUTH_URL, which in this deployment is set to localhost — so the
 * built-in redirect kicked users to http://localhost:3737. We instead call
 * signOut with `redirect: false` (just clears the session) and then navigate
 * with `window.location.assign`, which is always same-origin and public-URL safe.
 */
export function LogoutButton({
  redirectTo,
  className,
  children,
  confirmTitle = 'ออกจากระบบ?',
  confirmMessage = 'จะต้องเข้าสู่ระบบใหม่อีกครั้งนะ',
}: LogoutButtonProps) {
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function doLogout() {
    setBusy(true)
    try {
      await signOut({ redirect: false })
    } finally {
      // Same-origin redirect — immune to a mis-set NEXTAUTH_URL.
      window.location.assign(redirectTo)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="ออกจากระบบ"
        cancelLabel="อยู่ต่อ"
        tone="danger"
        icon={<span aria-hidden>👋</span>}
        busy={busy}
        onConfirm={doLogout}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}

export default LogoutButton
