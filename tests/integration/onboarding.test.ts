/**
 * tests/integration/onboarding.test.ts — what a brand-new install ends up with.
 *
 * Drives `provisionOnboarding` against the real test Postgres and asserts the
 * DB rows, because "the install ships with starter content" is a claim about
 * rows, not about the wizard's UI. Covers the two things that actually break:
 * chore fields silently dropped on the way in (category / dueTime / recurDays /
 * requirePhoto / late multiplier), and the reward catalogue not being created.
 *
 * The seeded fixture already has a family + members, so each test provisions
 * into a FRESH family to mirror a real first run.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { provisionOnboarding } from '@/lib/onboarding'
import { STARTER_CHORES, STARTER_REWARDS } from '@/lib/starter-catalog'
import { resetAndSeed, prisma } from './helpers/db'

/** A blank family + parent, as `POST /api/setup` would leave them. */
async function freshFamily() {
  const family = await prisma.family.create({ data: { name: 'ครอบครัวใหม่' } })
  const parent = await prisma.user.create({
    data: { name: 'พ่อแม่', role: 'parent', familyId: family.id },
  })
  return { familyId: family.id, parentUserId: parent.id }
}

beforeEach(async () => {
  await resetAndSeed()
})

describe('provisionOnboarding — starter content', () => {
  it('creates the chosen chores with every catalogue field persisted', async () => {
    const { familyId, parentUserId } = await freshFamily()
    // Pick chores that exercise the optional fields, not just the plain ones.
    const withDue = STARTER_CHORES.find((c) => c.dueTime !== undefined)!
    const withDays = STARTER_CHORES.find((c) => (c.recurDays?.length ?? 0) > 0)!
    const noPhoto = STARTER_CHORES.find((c) => !c.requirePhoto)!

    const keys = [...new Set([withDue.key, withDays.key, noPhoto.key])]

    const result = await provisionOnboarding(prisma, {
      familyId,
      parentUserId,
      familyName: 'บ้านทดสอบ',
      members: [{ name: 'น้องเอ', role: 'child', avatar: 'panda', pin: '1234' }],
      starterChoreKeys: keys,
    })

    expect(result.choreCount).toBe(keys.length)

    const chores = await prisma.chore.findMany({ where: { familyId } })
    expect(chores).toHaveLength(keys.length)

    for (const key of keys) {
      const tpl = STARTER_CHORES.find((c) => c.key === key)!
      const row = chores.find((c) => c.title === tpl.title)
      expect(row, `chore "${tpl.title}" was not created`).toBeDefined()
      expect(row!.xpValue).toBe(tpl.xpValue)
      expect(row!.recurrence).toBe(tpl.recurrence)
      expect(row!.category).toBe(tpl.category)
      expect(row!.requirePhoto).toBe(tpl.requirePhoto)
      expect(row!.isExtra).toBe(tpl.isExtra)
      expect(row!.dueTime).toBe(tpl.dueTime ?? null)
      expect(row!.recurDays).toEqual(tpl.recurDays ?? [])
      expect(row!.lateXpMultiplier).toBe(tpl.lateXpMultiplier ?? 1)
    }
  })

  it('creates the whole reward catalogue, with limits, regardless of chore picks', async () => {
    const { familyId, parentUserId } = await freshFamily()

    const result = await provisionOnboarding(prisma, {
      familyId,
      parentUserId,
      familyName: 'บ้านทดสอบ',
      members: [{ name: 'น้องบี', role: 'child', avatar: 'fox', pin: '4321' }],
      starterChoreKeys: [STARTER_CHORES[0].key],
    })

    expect(result.rewardCount).toBe(STARTER_REWARDS.length)

    const rewards = await prisma.reward.findMany({ where: { familyId } })
    expect(rewards).toHaveLength(STARTER_REWARDS.length)

    for (const tpl of STARTER_REWARDS) {
      const row = rewards.find((r) => r.title === tpl.title)
      expect(row, `reward "${tpl.title}" was not created`).toBeDefined()
      expect(row!.xpCost).toBe(tpl.xpCost)
      expect(row!.iconEmoji).toBe(tpl.iconEmoji)
      expect(row!.dailyLimit).toBe(tpl.dailyLimit ?? null)
      expect(row!.weeklyLimit).toBe(tpl.weeklyLimit ?? null)
      expect(row!.monthlyLimit).toBe(tpl.monthlyLimit ?? null)
      expect(row!.isActive).toBe(true)
    }
  })

  it('gives every created child a zeroed progress row', async () => {
    const { familyId, parentUserId } = await freshFamily()

    const result = await provisionOnboarding(prisma, {
      familyId,
      parentUserId,
      familyName: 'บ้านทดสอบ',
      members: [
        { name: 'น้องเอ', role: 'child', avatar: 'panda', pin: '1111' },
        { name: 'น้องบี', role: 'child', avatar: 'fox', pin: '2222' },
      ],
      starterChoreKeys: [STARTER_CHORES[0].key],
    })

    expect(result.childCount).toBe(2)

    for (const childId of result.createdChildIds) {
      const progress = await prisma.userProgress.findUnique({ where: { userId: childId } })
      expect(progress).not.toBeNull()
      expect(progress!.totalXp).toBe(0)
      expect(progress!.currentLevel).toBe(1)
      expect(progress!.currentStreak).toBe(0)
    }
  })

  it('writes nothing at all when provisioning fails', async () => {
    const { familyId, parentUserId } = await freshFamily()
    // The first statement in the transaction renames the family; an unknown id
    // makes it throw, so the members/chores/rewards that follow must not land.
    await expect(
      provisionOnboarding(prisma, {
        familyId: 'fam_does_not_exist',
        parentUserId,
        familyName: 'บ้านที่ไม่มีจริง',
        members: [{ name: 'น้องซี', role: 'child', avatar: 'panda', pin: '3333' }],
        starterChoreKeys: [STARTER_CHORES[0].key],
      }),
    ).rejects.toThrow()

    // Nothing leaked into the real family.
    expect(await prisma.chore.count({ where: { familyId } })).toBe(0)
    expect(await prisma.reward.count({ where: { familyId } })).toBe(0)
  })
})
