'use client'

/**
 * app/(child)/ChildNav.tsx — the kid-facing bottom tab bar.
 *
 * The child area used to be a single dead-end screen with no way out. This
 * fixed bottom nav gives the child surfaces (home / my-tasks / rewards / badges)
 * plus a logout that drops back to the PIN picker so a sibling can switch in.
 * Big touch targets, mobile-first, matches the "Cozy" theme.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LogoutButton } from '@/components/LogoutButton'
import { cn } from '@/components/ui'

type Tab = { href: string; label: string; icon: string }

const TABS: Tab[] = [
  { href: '/child', label: 'หน้าหลัก', icon: '🏠' },
  { href: '/child/tasks', label: 'งานของฉัน', icon: '✅' },
  { href: '/child/rewards', label: 'รางวัล', icon: '🎁' },
  { href: '/child/badges', label: 'เหรียญ', icon: '🏅' },
]

function isActive(pathname: string, href: string): boolean {
  // Exact match for /child (home) so it doesn't stay lit on sub-routes.
  return href === '/child' ? pathname === '/child' : pathname.startsWith(href)
}

const cell =
  'flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[11px] font-extrabold transition'

export function ChildNav() {
  const pathname = usePathname() || ''

  return (
    <nav
      aria-label="เมนูเด็ก"
      className="sticky bottom-0 z-40 border-t border-cream-500 bg-cream-100/95 backdrop-blur"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1 px-2 py-2">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                cell,
                active ? 'bg-primary text-white shadow-sm' : 'text-ink-600 hover:bg-cream-300',
              )}
            >
              <span className="text-xl" aria-hidden>
                {tab.icon}
              </span>
              {tab.label}
            </Link>
          )
        })}
        <LogoutButton
          redirectTo="/pin"
          className={cn(cell, 'text-ink-600 hover:bg-cream-300')}
          confirmMessage="กลับไปหน้าเลือกผู้ใช้ เพื่อสลับเป็นคนอื่นได้"
        >
          <span className="text-xl" aria-hidden>
            🚪
          </span>
          ออก
        </LogoutButton>
      </div>
    </nav>
  )
}

export default ChildNav
