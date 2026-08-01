/**
 * app/(child)/child/badges/page.tsx → /child/badges — the kid achievement wall.
 *
 * Thin server component (the (child) layout guard already gated to a signed-in
 * child). Hands identity to the client component, which fetches the full badge
 * catalog (earned / locked / new) from /api/badges.
 */

import { getSessionUser } from '@/lib/auth'
import { ChildBadges } from './ChildBadges'

export const dynamic = 'force-dynamic'

export default async function ChildBadgesPage() {
  const user = await getSessionUser()
  return <ChildBadges childId={user!.userId} />
}
