/**
 * app/(child)/child/tasks/page.tsx → /child/tasks — the child "งานของฉัน" hub.
 *
 * Thin server component: the (child) layout guard has already gated this to a
 * signed-in child, so we just read the child's identity from the session JWT
 * (no DB round-trip) and hand it to the client component, which fetches all
 * data client-side. `force-dynamic` so `next build` never reads the session.
 */

import { getSessionUser } from '@/lib/auth'
import { ChildTasks } from './ChildTasks'

export const dynamic = 'force-dynamic'

export default async function ChildTasksPage() {
  const user = await getSessionUser()
  return <ChildTasks childId={user!.userId} />
}
