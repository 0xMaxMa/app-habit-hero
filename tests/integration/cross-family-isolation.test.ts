/**
 * tests/integration/cross-family-isolation.test.ts — Phase A hardening pass.
 *
 * Public, repeatable sign-up (POST /api/signup, item 1 of the Phase A plan)
 * means cross-family bugs can now actually be exercised in production — before
 * this, exactly one family ever existed per deployment, so a route that forgot
 * `assertFamily` had no second family to leak into. This file is the focused
 * review the plan calls for: for every family-scoped resource NOT already
 * covered by an existing cross-family test elsewhere in this suite, prove
 * family A's parent/child can neither read nor write family B's rows.
 *
 * Already covered elsewhere (not duplicated here):
 *   - progress, bonus                      → tests/integration/security.test.ts
 *   - completions approve                  → tests/integration/completions.test.ts
 *   - deductions (create/cancel/list)       → tests/integration/deductions*.test.ts
 *   - redemptions create                    → tests/integration/redemptions-bonus.test.ts
 *
 * Covered HERE for the first time: chores (create/patch/delete/today),
 * completions (reject/unapprove), redemptions (approve/reject), rewards
 * (patch/delete), members (get/patch/delete + avatar upload/clear), link-code,
 * badges (get/seen), photos + avatars (file-serving routes), and a sanity
 * check that GET /api/family never crosses.
 *
 * Every assertion is on an HTTP status + machine error code + a DB read that
 * proves nothing moved — never on response wording (same discipline as
 * security.test.ts).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { GET as listChores, POST as createChore } from '@/app/api/chores/route'
import { PATCH as patchChore, DELETE as deleteChore } from '@/app/api/chores/[id]/route'
import { GET as choresToday } from '@/app/api/chores/today/route'
import { POST as rejectCompletion } from '@/app/api/completions/[id]/reject/route'
import { POST as unapproveCompletion } from '@/app/api/completions/[id]/unapprove/route'
import { POST as approveRedemption } from '@/app/api/redemptions/[id]/approve/route'
import { POST as rejectRedemption } from '@/app/api/redemptions/[id]/reject/route'
import { PATCH as patchReward, DELETE as deleteReward } from '@/app/api/rewards/[id]/route'
import { GET as getMembers } from '@/app/api/members/route'
import { PATCH as patchMember, DELETE as deleteMember } from '@/app/api/members/[id]/route'
import {
  POST as postAvatar,
  DELETE as deleteAvatar,
} from '@/app/api/members/[id]/avatar/route'
import { POST as issueLinkCode } from '@/app/api/link-code/route'
import { GET as getBadges } from '@/app/api/badges/route'
import { POST as markBadgesSeen } from '@/app/api/badges/seen/route'
import { GET as getPhoto } from '@/app/api/photos/[...path]/route'
import { GET as getAvatarFile } from '@/app/api/avatars/[...path]/route'
import { GET as getFamily } from '@/app/api/family/route'
import { generatePinSlug } from '@/lib/pin-slug'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { agentHeaders } from './helpers/actor'
import { IDS } from '@/prisma/seed.test'

const ORIGIN = 'http://t'

beforeEach(async () => {
  await resetAndSeed()
})

interface FamilyB {
  familyId: string
  pinSlug: string
  parentId: string
  parentRef: string
  childId: string
  childRef: string
  choreId: string
  rewardId: string
  completionId: string
  redemptionId: string
}

/** A second, fully-independent family with one of every resource type. */
async function seedFamilyB(): Promise<FamilyB> {
  const pinSlug = generatePinSlug()
  const family = await prisma.family.create({ data: { name: 'ครอบครัวบี', pinSlug } })
  const parent = await prisma.user.create({
    data: {
      name: 'พ่อบี',
      role: 'parent',
      familyId: family.id,
      email: 'parentb-isolation@test.local',
      passwordHash: await bcrypt.hash('password123', 10),
      channelUserRef: 'gw:isolation-parent-b',
    },
  })
  const child = await prisma.user.create({
    data: {
      name: 'น้องบี',
      role: 'child',
      familyId: family.id,
      channelUserRef: 'gw:isolation-child-b',
      pinHash: await bcrypt.hash('5678', 10),
      avatarUrl: '/api/avatars/fam-b-avatar-fixture.jpg',
    },
  })
  await prisma.userProgress.create({
    data: { userId: child.id, totalXp: 200, currentLevel: 1 },
  })
  const chore = await prisma.chore.create({
    data: { title: 'งานบ้านบี', familyId: family.id, xpValue: 20, recurrence: 'daily' },
  })
  const reward = await prisma.reward.create({
    data: { title: 'รางวัลบี', familyId: family.id, xpCost: 30, isActive: true },
  })
  const completion = await prisma.choreCompletion.create({
    data: {
      choreId: chore.id,
      completedBy: child.id,
      status: 'pending',
      photoUrl: '/api/photos/fam-b-photo-fixture.jpg',
    },
  })
  const redemption = await prisma.rewardRedemption.create({
    data: { rewardId: reward.id, redeemedBy: child.id, xpSpent: 30, status: 'pending' },
  })
  return {
    familyId: family.id,
    pinSlug,
    parentId: parent.id,
    parentRef: parent.channelUserRef!,
    childId: child.id,
    childRef: child.channelUserRef!,
    choreId: chore.id,
    rewardId: reward.id,
    completionId: completion.id,
    redemptionId: redemption.id,
  }
}

// ===========================================================================
// Chores
// ===========================================================================

describe('cross-family: chores', () => {
  it("assigning a new chore to family B's child → 403, chore not created", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await createChore(
      new Request(`${ORIGIN}/api/chores`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
        body: JSON.stringify({ title: 'แอบมอบงาน', xpValue: 10, assignedTo: famB.childId }),
      }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
    expect(await prisma.chore.count({ where: { title: 'แอบมอบงาน' } })).toBe(0)
  })

  it("PATCH on family B's chore → 403, nothing changed", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await patchChore(
      new Request(`${ORIGIN}/api/chores/${famB.choreId}`, {
        method: 'PATCH',
        headers: agentHeaders(parentRef),
        body: JSON.stringify({ title: 'ยึดไปแล้ว' }),
      }),
      { params: { id: famB.choreId } },
    )
    expect(res.status).toBe(403)
    const chore = await prisma.chore.findUniqueOrThrow({ where: { id: famB.choreId } })
    expect(chore.title).toBe('งานบ้านบี')
  })

  it("DELETE on family B's chore → 403, not deleted", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await deleteChore(
      new Request(`${ORIGIN}/api/chores/${famB.choreId}`, {
        method: 'DELETE',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: famB.choreId } },
    )
    expect(res.status).toBe(403)
    expect(await prisma.chore.findUnique({ where: { id: famB.choreId } })).not.toBeNull()
  })

  it("GET /api/chores/today for family B's child → 403, no data leaked", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await choresToday(
      new Request(`${ORIGIN}/api/chores/today?child=${famB.childId}`, {
        headers: agentHeaders(parentRef),
      }),
    )
    const env = await res.json()
    expect(res.status).toBe(403)
    expect(JSON.stringify(env)).not.toContain('งานบ้านบี')
  })

  it("GET /api/chores never includes family B's chores", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await listChores(
      new Request(`${ORIGIN}/api/chores`, { headers: agentHeaders(parentRef) }),
    )
    const ids = (await res.json()).data.chores.map((c: { id: string }) => c.id)
    expect(ids).not.toContain(famB.choreId)
  })
})

// ===========================================================================
// Completions — reject / unapprove
// ===========================================================================

describe('cross-family: completions reject/unapprove', () => {
  it("rejecting family B's pending completion → 403, still pending", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await rejectCompletion(
      new Request(`${ORIGIN}/api/completions/${famB.completionId}/reject`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: famB.completionId } },
    )
    expect(res.status).toBe(403)
    const row = await prisma.choreCompletion.findUniqueOrThrow({
      where: { id: famB.completionId },
    })
    expect(row.status).toBe('pending')
  })

  it("unapproving family B's completion → 403, XP untouched", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()
    // Approve it directly at the DB layer so there is something to try to undo.
    await prisma.choreCompletion.update({
      where: { id: famB.completionId },
      data: { status: 'approved', xpAwarded: 20 },
    })
    await prisma.userProgress.update({
      where: { userId: famB.childId },
      data: { totalXp: 220 },
    })

    const res = await unapproveCompletion(
      new Request(`${ORIGIN}/api/completions/${famB.completionId}/unapprove`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: famB.completionId } },
    )
    expect(res.status).toBe(403)
    const row = await prisma.choreCompletion.findUniqueOrThrow({
      where: { id: famB.completionId },
    })
    expect(row.status).toBe('approved')
    const progress = await prisma.userProgress.findUniqueOrThrow({
      where: { userId: famB.childId },
    })
    expect(progress.totalXp).toBe(220)
  })
})

// ===========================================================================
// Redemptions — approve / reject
// ===========================================================================

describe('cross-family: redemptions approve/reject', () => {
  it("approving family B's redemption → 403, XP unchanged, still pending", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()
    const before = (
      await prisma.userProgress.findUniqueOrThrow({ where: { userId: famB.childId } })
    ).totalXp

    const res = await approveRedemption(
      new Request(`${ORIGIN}/api/redemptions/${famB.redemptionId}/approve`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: famB.redemptionId } },
    )
    expect(res.status).toBe(403)
    const after = (
      await prisma.userProgress.findUniqueOrThrow({ where: { userId: famB.childId } })
    ).totalXp
    expect(after).toBe(before)
    const row = await prisma.rewardRedemption.findUniqueOrThrow({
      where: { id: famB.redemptionId },
    })
    expect(row.status).toBe('pending')
  })

  it("rejecting family B's redemption → 403, still pending", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await rejectRedemption(
      new Request(`${ORIGIN}/api/redemptions/${famB.redemptionId}/reject`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: famB.redemptionId } },
    )
    expect(res.status).toBe(403)
    const row = await prisma.rewardRedemption.findUniqueOrThrow({
      where: { id: famB.redemptionId },
    })
    expect(row.status).toBe('pending')
  })
})

// ===========================================================================
// Rewards
// ===========================================================================

describe('cross-family: rewards', () => {
  it("PATCH on family B's reward → 403, unchanged", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await patchReward(
      new Request(`${ORIGIN}/api/rewards/${famB.rewardId}`, {
        method: 'PATCH',
        headers: agentHeaders(parentRef),
        body: JSON.stringify({ title: 'ยึดรางวัล' }),
      }),
      { params: { id: famB.rewardId } },
    )
    expect(res.status).toBe(403)
    const reward = await prisma.reward.findUniqueOrThrow({ where: { id: famB.rewardId } })
    expect(reward.title).toBe('รางวัลบี')
  })

  it("DELETE on family B's reward → 403, not deleted", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await deleteReward(
      new Request(`${ORIGIN}/api/rewards/${famB.rewardId}`, {
        method: 'DELETE',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: famB.rewardId } },
    )
    expect(res.status).toBe(403)
    expect(await prisma.reward.findUnique({ where: { id: famB.rewardId } })).not.toBeNull()
  })
})

// ===========================================================================
// Members, member avatar, link-code (also the item-3 authz consolidation —
// these 3 routes now go through assertFamily instead of a hand-rolled check,
// so the behavior under test is a real 403 FORBIDDEN, not the old 404)
// ===========================================================================

describe('cross-family: members / avatar / link-code', () => {
  it("renaming family B's member → 403, unchanged", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await patchMember(
      new Request(`${ORIGIN}/api/members/${famB.childId}`, {
        method: 'PATCH',
        headers: agentHeaders(parentRef),
        body: JSON.stringify({ name: 'ยึดลูกบี' }),
      }),
      { params: { id: famB.childId } },
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
    const user = await prisma.user.findUniqueOrThrow({ where: { id: famB.childId } })
    expect(user.name).toBe('น้องบี')
  })

  it("deleting family B's member → 403, not deleted", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await deleteMember(
      new Request(`${ORIGIN}/api/members/${famB.childId}`, {
        method: 'DELETE',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: famB.childId } },
    )
    expect(res.status).toBe(403)
    expect(await prisma.user.findUnique({ where: { id: famB.childId } })).not.toBeNull()
  })

  it("uploading an avatar for family B's member → 403, avatarUrl unchanged", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()
    const form = new FormData()
    form.append('avatar', new File([new Uint8Array([1, 2, 3])], 'x.png', { type: 'image/png' }))

    const req = new Request(`${ORIGIN}/api/members/${famB.childId}/avatar`, {
      method: 'POST',
      headers: { 'x-agent-token': process.env.AGENT_API_TOKEN as string, 'x-actor-ref': parentRef },
      body: form,
    })
    const res = await postAvatar(req, { params: { id: famB.childId } })
    expect(res.status).toBe(403)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: famB.childId } })
    expect(user.avatarUrl).toBe('/api/avatars/fam-b-avatar-fixture.jpg')
  })

  it("clearing family B's member's avatar → 403, unchanged", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await deleteAvatar(
      new Request(`${ORIGIN}/api/members/${famB.childId}/avatar`, {
        method: 'DELETE',
        headers: agentHeaders(parentRef),
      }),
      { params: { id: famB.childId } },
    )
    expect(res.status).toBe(403)
    const user = await prisma.user.findUniqueOrThrow({ where: { id: famB.childId } })
    expect(user.avatarUrl).toBe('/api/avatars/fam-b-avatar-fixture.jpg')
  })

  it("issuing a link-code for family B's member → 403, linkCode unset", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await issueLinkCode(
      new Request(`${ORIGIN}/api/link-code`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
        body: JSON.stringify({ userId: famB.childId }),
      }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
    const user = await prisma.user.findUniqueOrThrow({ where: { id: famB.childId } })
    expect(user.linkCode).toBeNull()
  })

  it("GET /api/members never includes family B's roster", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await getMembers(
      new Request(`${ORIGIN}/api/members`, { headers: agentHeaders(parentRef) }),
    )
    const ids = (await res.json()).data.members.map((m: { id: string }) => m.id)
    expect(ids).not.toContain(famB.childId)
    expect(ids).not.toContain(famB.parentId)
  })
})

// ===========================================================================
// Badges
// ===========================================================================

describe('cross-family: badges', () => {
  it("GET /api/badges?user=<family B child> → 403, no leak", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await getBadges(
      new Request(`${ORIGIN}/api/badges?user=${famB.childId}`, {
        headers: agentHeaders(parentRef),
      }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('FORBIDDEN')
  })

  it("POST /api/badges/seen for family B's child → 403, nothing marked", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()
    const badge = await prisma.badge.findFirstOrThrow()
    await prisma.userBadge.create({ data: { userId: famB.childId, badgeId: badge.id } })

    const res = await markBadgesSeen(
      new Request(`${ORIGIN}/api/badges/seen`, {
        method: 'POST',
        headers: agentHeaders(parentRef),
        body: JSON.stringify({ user: famB.childId }),
      }),
    )
    expect(res.status).toBe(403)
    const ub = await prisma.userBadge.findFirstOrThrow({ where: { userId: famB.childId } })
    expect(ub.seenAt).toBeNull()
  })
})

// ===========================================================================
// File-serving routes — photos + avatars
// ===========================================================================

describe('cross-family: photo / avatar file serving', () => {
  it("GET a photo belonging to family B's completion → 403 before any file read", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await getPhoto(
      new Request(`${ORIGIN}/api/photos/fam-b-photo-fixture.jpg`, {
        headers: agentHeaders(parentRef),
      }),
      { params: { path: ['fam-b-photo-fixture.jpg'] } },
    )
    expect(res.status).toBe(403)
  })

  it("GET an avatar belonging to family B's member → 403 before any file read", async () => {
    const { parentRef } = await getRefs()
    const famB = await seedFamilyB()

    const res = await getAvatarFile(
      new Request(`${ORIGIN}/api/avatars/fam-b-avatar-fixture.jpg`, {
        headers: agentHeaders(parentRef),
      }),
      { params: { path: ['fam-b-avatar-fixture.jpg'] } },
    )
    expect(res.status).toBe(403)
  })
})

// ===========================================================================
// Family — sanity: GET never returns another family's row
// ===========================================================================

describe('cross-family: GET /api/family', () => {
  it("a parent's own family lookup never resolves to family B, even once it exists", async () => {
    const { parentRef, familyId } = await getRefs()
    const famB = await seedFamilyB()

    const res = await getFamily(
      new Request(`${ORIGIN}/api/family`, { headers: agentHeaders(parentRef) }),
    )
    const body = await res.json()
    expect(body.data.family.id).toBe(familyId)
    expect(body.data.family.id).not.toBe(famB.familyId)
    expect(body.data.family.pinSlug).not.toBe(famB.pinSlug)
  })

  it("the seeded fixture's two families never share a pinSlug", async () => {
    const famB = await seedFamilyB()
    const familyA = await prisma.family.findUniqueOrThrow({ where: { id: IDS.family } })
    expect(familyA.pinSlug).not.toBe(famB.pinSlug)
  })
})
