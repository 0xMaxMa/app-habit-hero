/**
 * app/(child)/child/rewards/page.tsx → /child/rewards (S7, child side).
 *
 * Thin server component: the (child) layout guard has already gated this to a
 * signed-in child, so we only read their identity from the session JWT and hand
 * it to the client component, which fetches the catalog + balance client-side.
 */

import { getSessionUser } from '@/lib/auth'
import { ChildRewards } from './ChildRewards'

export const dynamic = 'force-dynamic'

export default async function ChildRewardsPage() {
  const user = await getSessionUser()
  return <ChildRewards childId={user!.userId} />
}
