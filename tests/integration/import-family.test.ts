/**
 * tests/integration/import-family.test.ts — the import-family tool (Phase A
 * item 5), tested against the real test Postgres with a SYNTHETIC source
 * family — never a real dump, per the task's explicit instruction not to run
 * this against real data yet.
 *
 * The "source" and "target" in every test below are the SAME physical test
 * database — exportFamilySnapshot/importFamily only ever talk to whatever
 * PrismaClient they are handed, so this round-trip (seed a family here →
 * export it → import it back as a NEW family) exercises exactly the same
 * code path a real cross-deployment import would, without needing a second
 * live Postgres in CI.
 *
 * Because source and target share one database, the round-trip tests delete
 * the source family's rows right after exporting its snapshot (deleteSource,
 * respecting the same FK order app/api/members/[id]'s DELETE already uses) —
 * otherwise the source's own email/channelUserRef would always "collide"
 * with itself when importFamily checks the target, which is not a real
 * scenario (an actual source lives on a different database and is never
 * touched by this tool).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import {
  exportFamilySnapshot,
  resolveSourceFamilyId,
  checkImportCollisions,
  importFamily,
  type FamilySnapshot,
} from '@/lib/import-family'
import { resetAndSeed, prisma } from './helpers/db'

beforeEach(async () => {
  await resetAndSeed()
})

interface SourceFamily {
  familyId: string
  parentId: string
  childId: string
  choreId: string
  rewardId: string
  email: string
  channelUserRef: string
}

/** A rich, self-contained source family: parent + child with one of every row type. */
async function seedSourceFamily(tag: string): Promise<SourceFamily> {
  const email = `source-parent-${tag}@external.example`
  const channelUserRef = `ext:source-parent-${tag}`

  const family = await prisma.family.create({
    data: { name: 'ครอบครัวต้นทาง', pinSlug: `src-${tag}-${Math.random().toString(36).slice(2, 8)}` },
  })
  const parent = await prisma.user.create({
    data: {
      name: 'พ่อต้นทาง',
      role: 'parent',
      familyId: family.id,
      email,
      passwordHash: await bcrypt.hash('sourcepass1', 10),
      channelUserRef,
    },
  })
  const child = await prisma.user.create({
    data: {
      name: 'ลูกต้นทาง',
      role: 'child',
      familyId: family.id,
      pinHash: await bcrypt.hash('1111', 10),
      avatarCharacter: 'fox',
      avatarUrl: '/api/avatars/source-only-file.jpg', // must NOT survive the import
    },
  })
  await prisma.userProgress.create({
    data: { userId: child.id, totalXp: 777, currentLevel: 3, currentStreak: 2, longestStreak: 5 },
  })
  const chore = await prisma.chore.create({
    data: {
      title: 'งานต้นทาง',
      familyId: family.id,
      assignedTo: child.id,
      xpValue: 25,
      recurrence: 'daily',
      category: 'cleaning',
    },
  })
  const reward = await prisma.reward.create({
    data: { title: 'รางวัลต้นทาง', familyId: family.id, xpCost: 50, isActive: true },
  })
  await prisma.choreCompletion.create({
    data: {
      choreId: chore.id,
      completedBy: child.id,
      reviewedBy: parent.id,
      status: 'approved',
      xpAwarded: 25,
    },
  })
  await prisma.rewardRedemption.create({
    data: { rewardId: reward.id, redeemedBy: child.id, xpSpent: 50, status: 'approved' },
  })
  await prisma.pointAdjustment.create({
    data: {
      userId: child.id,
      xpDelta: -10,
      xpApplied: -10,
      reason: 'ทดสอบ',
      createdBy: parent.id,
    },
  })
  const badge = await prisma.badge.findFirstOrThrow({ where: { name: 'งานแรกของฉัน' } })
  await prisma.userBadge.create({ data: { userId: child.id, badgeId: badge.id } })

  return {
    familyId: family.id,
    parentId: parent.id,
    childId: child.id,
    choreId: chore.id,
    rewardId: reward.id,
    email,
    channelUserRef,
  }
}

/**
 * Remove a seeded source family's rows entirely, in the same FK order
 * app/api/members/[id]'s DELETE already relies on — simulating that the
 * source lives on a database the import never touches, once its snapshot has
 * already been captured.
 */
async function deleteSourceFamily(src: SourceFamily): Promise<void> {
  const userIds = [src.parentId, src.childId]
  await prisma.userBadge.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.pointAdjustment.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.rewardRedemption.deleteMany({ where: { redeemedBy: { in: userIds } } })
  await prisma.choreCompletion.deleteMany({ where: { completedBy: { in: userIds } } })
  await prisma.userProgress.deleteMany({ where: { userId: { in: userIds } } })
  await prisma.chore.deleteMany({ where: { familyId: src.familyId } })
  await prisma.reward.deleteMany({ where: { familyId: src.familyId } })
  await prisma.user.deleteMany({ where: { familyId: src.familyId } })
  await prisma.family.delete({ where: { id: src.familyId } })
}

describe('resolveSourceFamilyId', () => {
  it('returns the explicit id when given one that exists', async () => {
    const src = await seedSourceFamily('a')
    expect(await resolveSourceFamilyId(prisma, src.familyId)).toBe(src.familyId)
  })

  it('throws when the explicit id does not exist', async () => {
    await expect(resolveSourceFamilyId(prisma, 'no-such-family')).rejects.toThrow()
  })

  it('auto-resolves when the source has exactly one family', async () => {
    await prisma.family.deleteMany({}) // resetAndSeed's own fixture family too
    const src = await seedSourceFamily('a')
    expect(await resolveSourceFamilyId(prisma)).toBe(src.familyId)
  })

  it('throws when the source has more than one family and none was named', async () => {
    await seedSourceFamily('a')
    await seedSourceFamily('b')
    // Plus the resetAndSeed fixture family = at least 3 — definitely ambiguous.
    await expect(resolveSourceFamilyId(prisma)).rejects.toThrow(/multiple families/)
  })
})

describe('importFamily — full round trip', () => {
  it('recreates every row under a NEW family with fresh ids, preserving field values and relationships', async () => {
    const src = await seedSourceFamily('a')
    const snapshot = await exportFamilySnapshot(prisma, src.familyId)
    await deleteSourceFamily(src) // the real source lives elsewhere, untouched

    const result = await importFamily(prisma, snapshot)

    expect(result.familyId).not.toBe(src.familyId)
    expect(result.counts).toEqual({
      users: 2,
      chores: 1,
      rewards: 1,
      choreCompletions: 1,
      rewardRedemptions: 1,
      pointAdjustments: 1,
      userBadges: 1,
    })

    // The new family has its own, fresh, never-reused pinSlug.
    const newFamily = await prisma.family.findUniqueOrThrow({ where: { id: result.familyId } })
    expect(newFamily.name).toBe('ครอบครัวต้นทาง')
    expect(newFamily.pinSlug).toBe(result.pinSlug)

    // Users recreated with new ids, under the new family, core fields intact.
    const newUsers = await prisma.user.findMany({ where: { familyId: result.familyId } })
    expect(newUsers).toHaveLength(2)
    expect(newUsers.every((u) => u.id !== src.parentId && u.id !== src.childId)).toBe(true)
    const newChild = newUsers.find((u) => u.role === 'child')!
    const newParent = newUsers.find((u) => u.role === 'parent')!
    expect(newChild.name).toBe('ลูกต้นทาง')
    expect(newChild.avatarCharacter).toBe('fox')
    expect(await bcrypt.compare('1111', newChild.pinHash!)).toBe(true)
    expect(await bcrypt.compare('sourcepass1', newParent.passwordHash!)).toBe(true)

    // avatarUrl and linkCode are deliberately NOT carried over.
    expect(newChild.avatarUrl).toBeNull()
    expect(newChild.linkCode).toBeNull()
    // channelUserRef on the other hand IS preserved (it's the bot identity).
    expect(newParent.channelUserRef).toBe(src.channelUserRef)

    // UserProgress preserved, pointing at the NEW child.
    const newProgress = await prisma.userProgress.findUniqueOrThrow({
      where: { userId: newChild.id },
    })
    expect(newProgress.totalXp).toBe(777)
    expect(newProgress.currentStreak).toBe(2)

    // Chore + reward recreated under the new family, chore still assigned to
    // the NEW child (not the old, now-foreign, id).
    const newChore = await prisma.chore.findFirstOrThrow({ where: { familyId: result.familyId } })
    expect(newChore.title).toBe('งานต้นทาง')
    expect(newChore.assignedTo).toBe(newChild.id)
    const newReward = await prisma.reward.findFirstOrThrow({
      where: { familyId: result.familyId },
    })
    expect(newReward.xpCost).toBe(50)

    // Completion + redemption + adjustment all point at the NEW rows, not the
    // source ones — this is the actual referential-integrity claim.
    const newCompletion = await prisma.choreCompletion.findFirstOrThrow({
      where: { choreId: newChore.id },
    })
    expect(newCompletion.completedBy).toBe(newChild.id)
    expect(newCompletion.reviewedBy).toBe(newParent.id)
    expect(newCompletion.xpAwarded).toBe(25)

    const newRedemption = await prisma.rewardRedemption.findFirstOrThrow({
      where: { rewardId: newReward.id },
    })
    expect(newRedemption.redeemedBy).toBe(newChild.id)

    const newAdjustment = await prisma.pointAdjustment.findFirstOrThrow({
      where: { userId: newChild.id },
    })
    expect(newAdjustment.xpDelta).toBe(-10)
    expect(newAdjustment.createdBy).toBe(newParent.id)

    // Badge matched by id against the EXISTING catalog, not duplicated.
    const newUserBadge = await prisma.userBadge.findFirstOrThrow({
      where: { userId: newChild.id },
    })
    const badge = await prisma.badge.findUniqueOrThrow({ where: { id: newUserBadge.badgeId } })
    expect(badge.name).toBe('งานแรกของฉัน')
    expect(await prisma.badge.count({ where: { name: 'งานแรกของฉัน' } })).toBe(1) // not duplicated

    // The (now-deleted) source family's rows never come back as a side effect.
    expect(await prisma.user.findUnique({ where: { id: src.parentId } })).toBeNull()
  })

  it('skips a UserBadge whose catalog entry does not exist on this deployment, without failing the import', async () => {
    const src = await seedSourceFamily('a')
    const snapshot = await exportFamilySnapshot(prisma, src.familyId)
    await deleteSourceFamily(src)
    const withFakeBadge: FamilySnapshot = {
      ...snapshot,
      userBadges: [
        ...snapshot.userBadges,
        { userSourceId: src.childId, badgeId: 'not_a_real_badge_id', earnedAt: new Date(), seenAt: null },
      ],
    }

    const result = await importFamily(prisma, withFakeBadge)
    // Only the ONE real badge was created — the fake one was skipped, not thrown.
    expect(result.counts.userBadges).toBe(1)
  })
})

describe('importFamily — collision refusal', () => {
  it('refuses when a source email already exists in the target, and writes nothing', async () => {
    const src = await seedSourceFamily('a')
    const snapshot = await exportFamilySnapshot(prisma, src.familyId)
    await deleteSourceFamily(src)

    // A pre-existing, unrelated user in the TARGET already has this email.
    const clashFamily = await prisma.family.create({
      data: { name: 'ครอบครัวชนกัน', pinSlug: `clash-${Math.random().toString(36).slice(2, 8)}` },
    })
    await prisma.user.create({
      data: {
        name: 'คนอื่น',
        role: 'parent',
        familyId: clashFamily.id,
        email: src.email, // same email as the (now-deleted) source parent
      },
    })

    const familyCountBefore = await prisma.family.count()
    await expect(importFamily(prisma, snapshot)).rejects.toThrow(/collisions|already exist/i)
    expect(await prisma.family.count()).toBe(familyCountBefore) // nothing written
  })

  it('refuses when a source channelUserRef already exists in the target', async () => {
    const src = await seedSourceFamily('a')
    const snapshot = await exportFamilySnapshot(prisma, src.familyId)
    await deleteSourceFamily(src)

    const clashFamily = await prisma.family.create({
      data: { name: 'ครอบครัวชนกัน2', pinSlug: `clash2-${Math.random().toString(36).slice(2, 8)}` },
    })
    await prisma.user.create({
      data: {
        name: 'คนอื่น2',
        role: 'parent',
        familyId: clashFamily.id,
        channelUserRef: src.channelUserRef, // same ref as the (now-deleted) source parent
      },
    })

    const report = await checkImportCollisions(prisma, snapshot)
    expect(report.channelUserRefs).toContain(src.channelUserRef)

    const userCountBefore = await prisma.user.count()
    await expect(importFamily(prisma, snapshot)).rejects.toThrow()
    expect(await prisma.user.count()).toBe(userCountBefore)
  })
})
