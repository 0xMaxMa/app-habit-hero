/**
 * app/(parent)/layout.tsx — shell + guard for the PARENT area.
 *
 * Route-group `(parent)` does NOT add a URL segment; it just gives every
 * parent page this desktop shell (left sidebar nav) and a shared guard.
 * Feature pages live at their bare paths, e.g.:
 *   app/(parent)/dashboard/page.tsx  → /dashboard
 *   app/(parent)/chores/page.tsx     → /chores
 *   app/(parent)/rewards/page.tsx    → /rewards
 *   app/(parent)/approvals/page.tsx  → /approvals
 *   app/(parent)/history/page.tsx    → /history
 *   app/(parent)/settings/page.tsx   → /settings
 *
 * Guard: parent-only. Anonymous → /login; a signed-in child → /child.
 * Reads the session from the JWT cookie (no DB round-trip), so this renders
 * dynamically at request time and never hits Postgres at build.
 */

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ParentNav, ParentTabBar } from './ParentNav'

export const dynamic = 'force-dynamic'

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  if (user.role !== 'parent') redirect('/child')

  // The JWT session carries no avatar; read it once for the nav account card.
  const profile = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { avatarUrl: true },
  })

  return (
    /* Plain document flow — deliberately NOT a `fixed`, self-scrolling app
       shell. A fixed box is laid out against the browser's LAYOUT viewport, and
       on iPadOS (Safari, Edge and Chrome all run WebKit) that stops matching the
       VISIBLE area as soon as the toolbar auto-hides: the shell ends up parked
       above the screen with its brand row clipped off and a blank band left
       under it, and no amount of viewport-unit tuning (`vh`/`dvh`/`svh`, even a
       JS-measured `visualViewport.height`) fixes it, because the problem is the
       positioning origin, not the height.

       With normal flow the document is exactly as tall as its content, so there
       is nothing below the page to scroll into, and the sidebar/tab bar are
       `sticky` (resolved against scroll position, so always where the user can
       see them). `min-h-dvh` only guarantees the shell fills a short page. */
    <div className="flex min-h-dvh flex-col bg-cream-200 md:flex-row">
      <ParentNav userName={user.name} avatarUrl={profile?.avatarUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
        <ParentTabBar />
      </div>
    </div>
  )
}
