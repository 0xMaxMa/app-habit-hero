/**
 * lib/auth.ts — NextAuth (v4) configuration for HabitHero.
 *
 * Two credential flows (design S1):
 *   - "parent"    : email + password, bcrypt-compared against passwordHash.
 *   - "child-pin" : familyId + childId + a 4-digit PIN, bcrypt-compared against
 *                   pinHash. Kids sign in without an email.
 *
 * The session is a JWT carrying { userId, role, familyId } so every server
 * component / API route can enforce family-scoped, role-based authz without a
 * DB round-trip.
 *
 * The credential verification is factored into pure helpers (verifyPassword /
 * verifyPin / isValidPinFormat) so they can be unit-tested with bcryptjs
 * directly, without spinning up a NextAuth server (see lib/auth.test.ts).
 */

import { getServerSession, type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import type { Role } from '@prisma/client'
import { prisma } from '@/lib/db'

// ---------------------------------------------------------------------------
// Pure verification helpers (unit-testable, no NextAuth / no live DB needed)
// ---------------------------------------------------------------------------

/** A child PIN is exactly four decimal digits. */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

/**
 * Compare a plaintext password against a bcrypt hash. Returns false for any
 * missing input so callers never accidentally authenticate on empty values.
 */
export async function verifyPassword(
  plaintext: string | undefined,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!plaintext || !hash) return false
  return bcrypt.compare(plaintext, hash)
}

/**
 * Compare a 4-digit PIN against a bcrypt hash. Rejects malformed PINs before
 * touching bcrypt so a non-numeric / wrong-length PIN can never match.
 */
export async function verifyPin(
  pin: string | undefined,
  hash: string | null | undefined,
): Promise<boolean> {
  if (!pin || !hash || !isValidPinFormat(pin)) return false
  return bcrypt.compare(pin, hash)
}

// ---------------------------------------------------------------------------
// NextAuth options
// ---------------------------------------------------------------------------

export const authOptions: NextAuthOptions = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    CredentialsProvider({
      id: 'parent',
      name: 'Parent',
      credentials: {
        email: { label: 'อีเมล', type: 'email' },
        password: { label: 'รหัสผ่าน', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase()
        if (!email || !credentials?.password) return null

        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || user.role !== 'parent') return null

        const ok = await verifyPassword(credentials.password, user.passwordHash)
        if (!ok) return null

        return {
          id: user.id,
          name: user.name,
          role: user.role,
          familyId: user.familyId,
        }
      },
    }),
    CredentialsProvider({
      id: 'child-pin',
      name: 'Child PIN',
      credentials: {
        familyId: { label: 'ครอบครัว', type: 'text' },
        childId: { label: 'เด็ก', type: 'text' },
        pin: { label: 'PIN 4 หลัก', type: 'password' },
      },
      async authorize(credentials) {
        const { familyId, childId, pin } = credentials ?? {}
        if (!familyId || !childId || !pin) return null

        const user = await prisma.user.findUnique({ where: { id: childId } })
        if (!user || user.role !== 'child') return null
        // Belt-and-suspenders: the submitted family must own this child.
        if (user.familyId !== familyId) return null

        const ok = await verifyPin(pin, user.pinHash)
        if (!ok) return null

        return {
          id: user.id,
          name: user.name,
          role: user.role,
          familyId: user.familyId,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present on the initial sign-in.
      if (user) {
        token.userId = user.id
        token.role = user.role
        token.familyId = user.familyId
      }
      return token
    },
    async session({ session, token }) {
      session.userId = token.userId
      session.role = token.role
      session.familyId = token.familyId
      return session
    },
  },
}

// ---------------------------------------------------------------------------
// Server helpers
// ---------------------------------------------------------------------------

export interface SessionUser {
  userId: string
  role: Role
  familyId: string
  name: string | null
}

/**
 * Read the current session on the server (RSC / route handler). Returns null
 * when there is no valid session.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions)
  if (!session?.userId) return null
  return {
    userId: session.userId,
    role: session.role,
    familyId: session.familyId,
    name: session.user?.name ?? null,
  }
}

/**
 * Guard for server code: return the session user when their role matches,
 * otherwise throw. Callers translate the throw into a 401/403 or redirect.
 */
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  if (user.role !== role) throw new Error('FORBIDDEN')
  return user
}
