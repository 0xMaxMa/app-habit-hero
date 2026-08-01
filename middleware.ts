/**
 * middleware.ts — route protection for HabitHero.
 *
 * - Any request to /dashboard, /parent/**, or /child/** must be authenticated;
 *   unauthenticated users are redirected to /login (NextAuth `signIn` page).
 * - Role gate: parent-only areas (/dashboard, /parent/**) are blocked for
 *   children — a signed-in child is redirected to their own /child home.
 *   Parents may view /child/** (e.g. to help a kid), so it is not gated.
 */
import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const { token } = req.nextauth
    const { pathname } = req.nextUrl

    const isParentOnly =
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/parent') ||
      pathname.startsWith('/children')

    if (isParentOnly && token?.role !== 'parent') {
      return NextResponse.redirect(new URL('/child', req.url))
    }

    return NextResponse.next()
  },
  {
    // Returning false here makes withAuth redirect to the signIn page (/login).
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: { signIn: '/login' },
  },
)

export const config = {
  matcher: ['/dashboard/:path*', '/parent/:path*', '/children/:path*', '/child/:path*'],
}
