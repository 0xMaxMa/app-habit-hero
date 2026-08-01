/**
 * app/(child)/child/page.tsx → /child — the child home (S4 + S8, T14).
 *
 * This is a thin server component: the `(child)` layout guard has already
 * redirected anonymous users and parents away, so here we only read the child's
 * identity from the session JWT (no DB round-trip) and hand it to the client
 * component, which fetches all data client-side via the JSON API. Marked
 * `force-dynamic` so `next build` never tries to read the session/Postgres.
 */

import { getSessionUser } from '@/lib/auth'
import { ChildHome } from './ChildHome'

export const dynamic = 'force-dynamic'

export default async function ChildDashboardPage() {
  // The layout guard guarantees a signed-in child here; the non-null assertion
  // just narrows the type for the client props.
  const user = await getSessionUser()
  return <ChildHome childId={user!.userId} childName={user!.name ?? 'เพื่อน'} />
}
