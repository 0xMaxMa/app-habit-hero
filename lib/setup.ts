/**
 * lib/setup.ts — "has this install been bootstrapped yet?"
 *
 * HabitHero is a single-family app: the very first run creates THE parent +
 * THE family once, and the door then closes. Several surfaces need to know
 * whether that has happened — the /api/setup route, and the login page, which
 * sends a first-time visitor straight to /setup instead of showing a sign-in
 * form no account exists for yet.
 *
 * Kept as a plain DB query (not an HTTP call) so a server component can await
 * it directly without a round trip through its own API.
 */

import { prisma } from '@/lib/db'

/** True while the app has no parent yet — setup is still required. */
export async function needsSetup(): Promise<boolean> {
  const parent = await prisma.user.findFirst({
    where: { role: 'parent' },
    select: { id: true },
  })
  return parent === null
}
