/**
 * app/page.tsx — root entry. Routes the visitor to the right surface by role:
 *   anonymous → /login
 *   parent    → /dashboard   (parent area, app/(parent)/dashboard)
 *   child     → /child       (child area,  app/(child)/child)
 *
 * Reads the session from the JWT cookie only (no DB), so it renders
 * dynamically at request time and is safe at build (no Postgres access).
 */

import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  redirect(user.role === 'parent' ? '/dashboard' : '/child')
}
