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

import bcrypt from 'bcryptjs'
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

    const keys = Array.from(new Set([withDue.key, withDays.key, noPhoto.key]))

    const result = await provisionOnboarding(prisma, {
      familyId,
      parentUserId,
      familyName: 'บ้านทดสอบ',
      members: [{ name: 'น้องเอ', role: 'child', avatar: 'panda', pin: '1234' }],
      starterChoreKeys: keys,
      starterRewardKeys: STARTER_REWARDS.map((r) => r.key),
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
      starterRewardKeys: STARTER_REWARDS.map((r) => r.key),
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
      starterRewardKeys: STARTER_REWARDS.map((r) => r.key),
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
        starterRewardKeys: STARTER_REWARDS.map((r) => r.key),
      }),
    ).rejects.toThrow()

    // Nothing leaked into the real family.
    expect(await prisma.chore.count({ where: { familyId } })).toBe(0)
    expect(await prisma.reward.count({ where: { familyId } })).toBe(0)
  })
})

/**
 * The wizard grew three things the DB has to actually honour: a co-parent who
 * can sign in, an avatar choice that survives, and a reward selection instead
 * of "everything, always". Each of those used to be a silent no-op or was not
 * offered at all, so each gets a row-level assertion here.
 */
describe('provisionOnboarding — members and reward selection', () => {
  it('creates a co-parent who can actually sign in (email + password hash)', async () => {
    const { familyId, parentUserId } = await freshFamily()

    await provisionOnboarding(prisma, {
      familyId,
      parentUserId,
      familyName: 'บ้านสองผู้ปกครอง',
      members: [
        {
          name: 'มะม๊า',
          role: 'parent',
          avatar: 'cat',
          email: 'Mom@Example.com',
          password: 'sup3r-secret',
        },
        { name: 'น้องเอ', role: 'child', avatar: 'rabbit', pin: '1234' },
      ],
      starterChoreKeys: [STARTER_CHORES[0].key],
      starterRewardKeys: [STARTER_REWARDS[0].key],
    })

    const coParent = await prisma.user.findFirst({
      where: { familyId, name: 'มะม๊า' },
    })
    expect(coParent?.role).toBe('parent')
    // Lower-cased on the way in, so a capitalised retype still matches at login.
    expect(coParent?.email).toBe('mom@example.com')
    expect(coParent?.passwordHash).toBeTruthy()
    expect(coParent?.passwordHash).not.toBe('sup3r-secret')
    expect(await bcrypt.compare('sup3r-secret', coParent!.passwordHash!)).toBe(true)
    // A co-parent has no PIN — that is the child login path.
    expect(coParent?.pinHash).toBeNull()
  })

  it('persists the chosen avatar for every member', async () => {
    const { familyId, parentUserId } = await freshFamily()

    await provisionOnboarding(prisma, {
      familyId,
      parentUserId,
      familyName: 'บ้านอวตาร์',
      members: [
        { name: 'น้องบี', role: 'child', avatar: 'chick', pin: '1111' },
        { name: 'น้องซี', role: 'child', avatar: 'bear', pin: '2222' },
      ],
      starterChoreKeys: [STARTER_CHORES[0].key],
      starterRewardKeys: [STARTER_REWARDS[0].key],
    })

    const b = await prisma.user.findFirst({ where: { familyId, name: 'น้องบี' } })
    const c = await prisma.user.findFirst({ where: { familyId, name: 'น้องซี' } })
    expect(b?.avatarCharacter).toBe('chick')
    expect(c?.avatarCharacter).toBe('bear')
  })

  it('creates only the rewards that were selected', async () => {
    const { familyId, parentUserId } = await freshFamily()
    const picked = [STARTER_REWARDS[0].key, STARTER_REWARDS[2].key]

    const result = await provisionOnboarding(prisma, {
      familyId,
      parentUserId,
      familyName: 'บ้านเลือกรางวัล',
      members: [{ name: 'น้องดี', role: 'child', avatar: 'panda', pin: '4444' }],
      starterChoreKeys: [STARTER_CHORES[0].key],
      starterRewardKeys: picked,
    })

    expect(result.rewardCount).toBe(2)
    const rewards = await prisma.reward.findMany({ where: { familyId } })
    expect(rewards.map((r) => r.title).sort()).toEqual(
      [STARTER_REWARDS[0].title, STARTER_REWARDS[2].title].sort(),
    )
  })

  it('reports every created member with its submitted index, for photo upload', async () => {
    const { familyId, parentUserId } = await freshFamily()

    const result = await provisionOnboarding(prisma, {
      familyId,
      parentUserId,
      familyName: 'บ้านรูปโปรไฟล์',
      members: [
        { name: 'น้องอี', role: 'child', avatar: 'panda', pin: '5555' },
        {
          name: 'ปะป๊า',
          role: 'parent',
          avatar: 'fox',
          email: 'dad@example.com',
          password: 'another-secret',
        },
        { name: 'น้องเอฟ', role: 'child', avatar: 'cat', pin: '6666' },
      ],
      starterChoreKeys: [STARTER_CHORES[0].key],
      starterRewardKeys: [STARTER_REWARDS[0].key],
    })

    // The wizard pairs file N with member N, so the indexes must line up with
    // the order the members were submitted in — not with the child-only list.
    expect(result.createdMembers.map((m) => m.index)).toEqual([0, 1, 2])
    expect(result.createdMembers.map((m) => m.role)).toEqual([
      'child',
      'parent',
      'child',
    ])
    const names = await Promise.all(
      result.createdMembers.map(async (m) =>
        (await prisma.user.findUnique({ where: { id: m.id } }))?.name,
      ),
    )
    expect(names).toEqual(['น้องอี', 'ปะป๊า', 'น้องเอฟ'])
  })
})
