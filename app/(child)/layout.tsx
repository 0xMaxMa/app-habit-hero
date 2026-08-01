/**
 * app/(child)/layout.tsx — shell + guard for the CHILD area.
 *
 * Route-group `(child)` adds no URL segment; it just wraps every child page in
 * a mobile-first shell and a shared guard. The child dashboard lives at:
 *   app/(child)/child/page.tsx      → /child   (child home; matches the PIN
 *                                               sign-in redirect to /child)
 * Any further child surfaces go under the same group at their bare paths.
 *
 * Guard: child-only. Anonymous → /login; a signed-in parent → /dashboard.
 * Reads the session from the JWT cookie (no DB round-trip), so this renders
 * dynamically at request time and never hits Postgres at build.
 */

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { ChildNav } from './ChildNav'

export const dynamic = 'force-dynamic'

export default async function ChildLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.role !== 'child') redirect('/dashboard')

  return (
    /* The bar is `sticky bottom-0`, NOT `fixed`: a fixed box is placed against
       the browser's LAYOUT viewport, and on iPadOS (Safari/Edge/Chrome all run
       WebKit) that stops matching the visible area once the toolbar auto-hides
       — the bar then floats in the MIDDLE of the screen with page content
       showing below it. Sticky resolves against scroll position instead, so it
       hugs the bottom in every toolbar state. It only lands there if it comes
       last in flow, hence the flex column with a growing content area (and no
       `pb-28` spacer any more — the bar now takes real space). */
    <div className="flex min-h-dvh flex-col bg-cream-200">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-6 pt-5 sm:px-5">
        {children}
      </div>
      <ChildNav />
    </div>
  )
}
