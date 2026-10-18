/**
 * scripts/import-family.ts — import one external family's data into this
 * multi-family database (Phase A item 5). See lib/import-family.ts for the
 * full design rationale (ID remapping, collision handling, what is and isn't
 * carried over).
 *
 * This is a BUILD-ONLY deliverable for this phase: the owner has not yet
 * provided a real dump to import, so this script must never be run against
 * production data as part of this change. It IS safe to dry-run against a
 * scratch/synthetic source, which is exactly what its own test coverage does
 * (tests/integration/import-family.test.ts, lib/import-family.test.ts).
 *
 * Usage:
 *   1. Restore the other deployment's pg_dump into a scratch Postgres (not
 *      this app's database):
 *        createdb habithero_import_source
 *        psql habithero_import_source < other-family-dump.sql
 *
 *   2. Dry run (default — prints what WOULD be imported, writes nothing):
 *        DATABASE_URL=<this app's db> \
 *        SOURCE_DATABASE_URL=postgres://.../habithero_import_source \
 *        npx tsx scripts/import-family.ts
 *
 *   3. Apply for real, once the dry-run report looks right:
 *        DATABASE_URL=<this app's db> \
 *        SOURCE_DATABASE_URL=postgres://.../habithero_import_source \
 *        npx tsx scripts/import-family.ts --apply
 *
 *   Optional: --source-family-id <id> if the source ever has more than one
 *   family (a fresh pg_dump from a single-family deployment never does).
 */

import { PrismaClient } from '@prisma/client'
import { prisma as targetDb } from '@/lib/db'
import {
  exportFamilySnapshot,
  resolveSourceFamilyId,
  checkImportCollisions,
  hasCollisions,
  importFamily,
} from '@/lib/import-family'

function readFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main() {
  const apply = process.argv.includes('--apply')
  const sourceUrl = process.env.SOURCE_DATABASE_URL
  if (!sourceUrl) {
    throw new Error(
      'SOURCE_DATABASE_URL is not set — point it at the restored dump, not this app\'s own DATABASE_URL',
    )
  }
  if (sourceUrl === process.env.DATABASE_URL) {
    throw new Error('SOURCE_DATABASE_URL must not be the same database as DATABASE_URL')
  }

  const sourceDb = new PrismaClient({ datasources: { db: { url: sourceUrl } } })

  try {
    const explicitFamilyId = readFlag('--source-family-id')
    const familyId = await resolveSourceFamilyId(sourceDb, explicitFamilyId)
    const snapshot = await exportFamilySnapshot(sourceDb, familyId)

    console.log(
      `[import-family] ${apply ? 'APPLY' : 'DRY RUN'} — source family "${snapshot.family.name}" ` +
        `(${familyId}):\n` +
        `  users:              ${snapshot.users.length}\n` +
        `  chores:             ${snapshot.chores.length}\n` +
        `  rewards:            ${snapshot.rewards.length}\n` +
        `  chore completions:  ${snapshot.choreCompletions.length}\n` +
        `  reward redemptions: ${snapshot.rewardRedemptions.length}\n` +
        `  point adjustments:  ${snapshot.pointAdjustments.length}\n` +
        `  user badges:        ${snapshot.userBadges.length}\n`,
    )

    const collisions = await checkImportCollisions(targetDb, snapshot)
    if (hasCollisions(collisions)) {
      console.error('[import-family] REFUSING — collisions with existing data:')
      if (collisions.emails.length > 0) {
        console.error(`  emails already in use: ${collisions.emails.join(', ')}`)
      }
      if (collisions.channelUserRefs.length > 0) {
        console.error(`  channel identities already linked: ${collisions.channelUserRefs.join(', ')}`)
      }
      process.exitCode = 1
      return
    }
    console.log('[import-family] no collisions with existing data.')

    if (!apply) {
      console.log('[import-family] dry run only — nothing written. Pass --apply to import for real.')
      return
    }

    const result = await importFamily(targetDb, snapshot)
    console.log(
      `[import-family] imported as NEW family ${result.familyId} (pin link: /pin/${result.pinSlug})`,
    )
    console.log('[import-family] counts written:', result.counts)
  } finally {
    await sourceDb.$disconnect()
  }
}

main()
  .catch((err) => {
    console.error('[import-family] failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => targetDb.$disconnect())
