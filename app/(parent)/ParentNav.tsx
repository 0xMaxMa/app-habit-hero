'use client'

/**
 * app/(parent)/ParentNav.tsx — parent navigation.
 *
 * Layouts:
 *  • Desktop (md+): left sidebar with nav links + a logout footer.
 *  • Mobile (<md): a slim top brand bar (logo + logout) AND a bottom tab bar
 *    for the destinations — mirroring the kid area so navigation lives at the
 *    bottom (thumb reach) instead of a top scroller. The tab bar ships as a
 *    SEPARATE export (`ParentTabBar`) because it has to render *after* the
 *    page content in the DOM: it is `sticky`, not `fixed` (see below), and a
 *    sticky element only sits at the bottom if it comes last in flow.
 *
 * Nothing here is `position: fixed`. A fixed box is placed against the browser's
 * LAYOUT viewport, and on iPadOS (Safari/Edge/Chrome all share WebKit) that box
 * stops matching the VISIBLE area the moment the toolbar auto-hides — the
 * sidebar slides up under the address bar and the bottom bar floats in the
 * middle of the page with content showing underneath it. `sticky` is resolved
 * against the scroll position instead, so it tracks what the user can actually
 * see in every toolbar state.
 *
 * Logout goes through <LogoutButton>, which confirms first and redirects
 * against the current origin (not NEXTAUTH_URL) so it never lands on localhost.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoutButton } from '@/components/LogoutButton'
import { Avatar, cn } from '@/components/ui'

/** `short` is the compact label used in the mobile bottom bar. */
type NavItem = { href: string; label: string; short: string; icon: string }

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'แดชบอร์ด', short: 'หน้าหลัก', icon: '🏠' },
  { href: '/approvals', label: 'อนุมัติ', short: 'อนุมัติ', icon: '✅' },
  { href: '/history', label: 'ประวัติ', short: 'ประวัติ', icon: '🕒' },
  { href: '/chores', label: 'งานบ้าน', short: 'งานบ้าน', icon: '🧹' },
  { href: '/rewards', label: 'รางวัล', short: 'รางวัล', icon: '🎁' },
  { href: '/settings', label: 'ตั้งค่า', short: 'ตั้งค่า', icon: '⚙️' },
]

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function ParentNav({
  userName,
  avatarUrl,
}: {
  userName?: string | null
  avatarUrl?: string | null
}) {
  const pathname = usePathname() || ''

  return (
    <>
      {/* ---- Mobile top brand bar (in flow) ------------------------------- */}
      <header className="flex items-center justify-between gap-2 border-b border-cream-500 bg-cream-100/85 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            🦸
          </span>
          <span className="text-lg font-extrabold text-primary-700">HabitHero</span>
        </div>
        <div className="flex items-center gap-2">
          <Avatar src={avatarUrl ?? undefined} name={userName ?? undefined} size="sm" />
          <LogoutButton
            redirectTo="/login"
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold text-danger-600 transition hover:bg-danger-100"
          >
            <span aria-hidden>🚪</span>
            ออก
          </LogoutButton>
        </div>
      </header>

      {/* ---- Desktop sidebar --------------------------------------------- */}
      {/*
        `md:self-start` + `md:h-dvh`: as a flex-row item the sidebar would
        otherwise stretch to the full document height, which makes `sticky`
        pointless.

        It must be `dvh`, NOT `svh`. `svh` is frozen at the viewport height with
        every browser toolbar EXPANDED — so the moment iPadOS Safari retracts its
        toolbar the visible area grows by ~100px while the sidebar does not,
        leaving a blank band along the bottom of the column. `dvh` tracks the
        visible viewport in both toolbar states, which is exactly the
        requirement: fill what is visible, never more, never less.
      */}
      <nav
        aria-label="เมนูผู้ปกครอง"
        /* Solid `bg-cream-100`, no translucency/backdrop-blur here: this column
           sits BESIDE the content (never over it), so the blur bought nothing
           visually — and a translucent + backdrop-filtered box is a known iOS
           Safari compositing hazard that can leave blank white bands while
           scrolling. The mobile header/bottom bar keep their blur because those
           genuinely overlay scrolling content. */
        className="hidden shrink-0 flex-col overscroll-contain border-cream-500 bg-cream-100 md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:self-start md:border-r"
      >
        <div className="flex shrink-0 items-center gap-2 px-5 py-4">
          <span className="text-2xl" aria-hidden>
            🦸
          </span>
          <span className="text-lg font-extrabold text-primary-700">HabitHero</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain px-3 py-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition',
                  active ? 'bg-primary text-white shadow-sm' : 'text-ink-800 hover:bg-cream-300',
                )}
              >
                <span aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Account footer — avatar + name, then a clearly-styled logout. */}
        <div className="shrink-0 border-t border-cream-500 px-3 py-3">
          <div className="mb-2 flex items-center gap-2.5 px-1">
            <Avatar src={avatarUrl ?? undefined} name={userName ?? undefined} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink-900">
                {userName ?? 'ผู้ปกครอง'}
              </p>
              <p className="text-xs font-semibold text-ink-500">ผู้ปกครอง</p>
            </div>
          </div>
          <LogoutButton
            redirectTo="/login"
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-danger-600 transition hover:bg-danger-100"
          >
            <span aria-hidden>🚪</span>
            ออกจากระบบ
          </LogoutButton>
        </div>
      </nav>
    </>
  )
}

/**
 * Mobile bottom tab bar. Rendered by the layout *after* the page content so
 * that `sticky bottom-0` puts it at the bottom of the viewport (and at the end
 * of the document once you scroll there) instead of floating mid-page the way
 * `fixed` does when iPadOS hides its toolbar.
 */
export function ParentTabBar() {
  const pathname = usePathname() || ''

  return (
    <nav
      aria-label="เมนูผู้ปกครอง"
      className="sticky bottom-0 z-40 border-t border-cream-500 bg-cream-100/95 backdrop-blur md:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-6 gap-0.5 px-1.5 py-2">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-extrabold transition',
                active ? 'bg-primary text-white shadow-sm' : 'text-ink-600 hover:bg-cream-300',
              )}
            >
              <span className="text-lg" aria-hidden>
                {item.icon}
              </span>
              {item.short}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export default ParentNav
