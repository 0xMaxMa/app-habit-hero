/**
 * lib/import-family.test.ts — exportFamilySnapshot against a source whose
 * schema predates PointAdjustment entirely (confirmed against a real
 * deployment's dump: 10 tables, no `point_adjustments`). Fixture/mock data
 * only — this never touches a real dump or a real database, per the
 * project's rule against running the import against production data before
 * the owner says so.
 *
 * The mock source's `pointAdjustment.findMany` throws the exact error Prisma
 * raises for a table that genuinely doesn't exist on the connection (P2021,
 * `meta.modelName: 'PointAdjustment'` — reproduced against a real scratch
 * Postgres with that table dropped, not guessed from docs), so this proves
 * `exportFamilySnapshot` reads that specific failure as "zero adjustments"
 * without weakening it into swallowing unrelated failures.
 */
import { describe, it, expect, vi } from 'vitest'
import { Prisma, type PrismaClient } from '@prisma/client'
import { exportFamilySnapshot } from './import-family'

function missingTableError(modelName: string, table: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    `Invalid \`prisma.${modelName}.findMany()\` invocation:\n\n` +
      `The table \`${table}\` does not exist in the current database.`,
    { code: 'P2021', clientVersion: 'test', meta: { modelName, table } },
  )
}

/** A source db stub with exactly the shape exportFamilySnapshot reads, one family + one user. */
function sourceDbWith(pointAdjustmentFindMany: () => Promise<unknown[]>) {
  const family = { id: 'fam_old', name: 'ครอบครัวรุ่นเก่า' }
  const user = {
    id: 'user_old',
    name: 'พ่อรุ่นเก่า',
    role: 'parent',
    channelUserRef: null,
    avatarCharacter: null,
    email: 'old-deployment-parent@example.com',
    passwordHash: 'hash',
    pinHash: null,
  }
  return {
    family: { findUniqueOrThrow: vi.fn().mockResolvedValue(family) },
    user: { findMany: vi.fn().mockResolvedValue([user]) },
    chore: { findMany: vi.fn().mockResolvedValue([]) },
    reward: { findMany: vi.fn().mockResolvedValue([]) },
    userProgress: { findMany: vi.fn().mockResolvedValue([]) },
    choreCompletion: { findMany: vi.fn().mockResolvedValue([]) },
    rewardRedemption: { findMany: vi.fn().mockResolvedValue([]) },
    pointAdjustment: { findMany: vi.fn(pointAdjustmentFindMany) },
    userBadge: { findMany: vi.fn().mockResolvedValue([]) },
  }
}

describe('exportFamilySnapshot — source schema predates PointAdjustment', () => {
  it('reads a missing point_adjustments table as zero adjustments, not a failed export', async () => {
    const db = sourceDbWith(() =>
      Promise.reject(missingTableError('PointAdjustment', 'public.point_adjustments')),
    )

    const snapshot = await exportFamilySnapshot(db as unknown as PrismaClient, 'fam_old')

    expect(snapshot.pointAdjustments).toEqual([])
    expect(snapshot.users).toHaveLength(1) // every other table still read normally
  })

  it('still fails the export on an unrelated error from the same query', async () => {
    const connectionFailure = new Prisma.PrismaClientKnownRequestError(
      "Can't reach database server",
      { code: 'P1001', clientVersion: 'test' },
    )
    const db = sourceDbWith(() => Promise.reject(connectionFailure))

    await expect(exportFamilySnapshot(db as unknown as PrismaClient, 'fam_old')).rejects.toBe(
      connectionFailure,
    )
  })

  it('still fails when a DIFFERENT model is reported missing (does not over-match on code alone)', async () => {
    const db = sourceDbWith(() =>
      Promise.reject(missingTableError('UserBadge', 'public.user_badges')),
    )

    await expect(exportFamilySnapshot(db as unknown as PrismaClient, 'fam_old')).rejects.toThrow(
      /user_badges/,
    )
  })
})
