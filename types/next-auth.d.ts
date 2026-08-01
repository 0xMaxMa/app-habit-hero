/**
 * types/next-auth.d.ts — augment NextAuth's Session / User / JWT so the
 * HabitHero identity fields (userId, role, familyId) are strongly typed
 * everywhere getServerSession / useSession / the JWT callbacks are used.
 */
import type { Role } from '@prisma/client'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    userId: string
    role: Role
    familyId: string
    user?: DefaultSession['user']
  }

  // Shape returned by the CredentialsProvider `authorize` callbacks.
  interface User {
    id: string
    name?: string | null
    role: Role
    familyId: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string
    role: Role
    familyId: string
  }
}
