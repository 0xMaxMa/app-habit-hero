/**
 * tests/integration/helpers/db.ts — DB lifecycle for API integration tests.
 *
 * Uses the SAME Prisma client as the app (`@/lib/db`) so route handlers and the
 * test assertions observe one connection/pool against the test Postgres.
 */
import { seedTestData } from '@/prisma/seed.test'

export { prisma } from '@/lib/db'

import { prisma } from '@/lib/db'

/**
 * Every app table, child-first, so TRUNCATE ... CASCADE has a deterministic
 * order. `_prisma_migrations` is intentionally excluded — migrations are
 * applied once by the global setup and must survive resets.
 */
const APP_TABLES = [
  'user_badges',
  'badges',
  'point_adjustments',
  'reward_redemptions',
  'chore_completions',
  'user_progress',
  'rewards',
  'chores',
  'users',
  'families',
] as const

/**
 * Wipe every app table (RESTART IDENTITY, CASCADE) and re-apply the canonical
 * fixture from prisma/seed.test.ts. Idempotent — safe to call in beforeEach.
 */
export async function resetAndSeed(): Promise<void> {
  const list = APP_TABLES.map((t) => `"${t}"`).join(', ')
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`)
  await seedTestData(prisma)
}

export interface Refs {
  familyId: string
  parentId: string
  childAId: string
  childBId: string
  parentRef: string
  childARef: string
  childBRef: string
}

/**
 * Resolve the seeded ids + channel refs by looking rows up after seeding
 * (rather than hard-coding), keyed on the deterministic channelUserRef values
 * from prisma/seed.test.ts.
 */
export async function getRefs(): Promise<Refs> {
  const [parent, childA, childB] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { channelUserRef: 'gw:parent-1' } }),
    prisma.user.findFirstOrThrow({ where: { channelUserRef: 'gw:child-a' } }),
    prisma.user.findFirstOrThrow({ where: { channelUserRef: 'gw:child-b' } }),
  ])

  return {
    familyId: parent.familyId,
    parentId: parent.id,
    childAId: childA.id,
    childBId: childB.id,
    parentRef: parent.channelUserRef!,
    childARef: childA.channelUserRef!,
    childBRef: childB.channelUserRef!,
  }
}
