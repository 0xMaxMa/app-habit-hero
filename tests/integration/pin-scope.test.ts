/**
 * tests/integration/pin-scope.test.ts — multi-family /pin scoping (Phase A
 * security fix).
 *
 * Drives `loadFamilyChildrenBySlug` (lib/pin-picker.ts) directly against the
 * real test Postgres. This is the actual fix for the old `app/pin/page.tsx`
 * leak: it queried every child in the database with no familyId filter at
 * all, so a public, unauthenticated page listed children from every family.
 * These tests pin down that the replacement can NEVER do that again — there
 * is no slug for which two different families' children both appear, and an
 * unresolved slug returns null rather than falling back to an unscoped list.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { getFamilyPinSlug, loadFamilyChildrenBySlug, resolveParentPinRedirect } from '@/lib/pin-picker'
import { generatePinSlug } from '@/lib/pin-slug'
import { resetAndSeed, getRefs, prisma } from './helpers/db'
import { IDS } from '@/prisma/seed.test'
import type { SessionUser } from '@/lib/auth'

beforeEach(async () => {
  await resetAndSeed()
})

/** A second, fully separate family with its own child who has a PIN set. */
async function seedFamilyB(): Promise<{ id: string; slug: string; childName: string }> {
  const slug = generatePinSlug()
  const family = await prisma.family.create({ data: { name: 'ครอบครัวบี', pinSlug: slug } })
  const childName = 'น้องบีสอง'
  await prisma.user.create({
    data: {
      name: childName,
      role: 'child',
      familyId: family.id,
      pinHash: '$2a$10$abcdefghijklmnopqrstuv', // shape only — never verified here
    },
  })
  return { id: family.id, slug, childName }
}

describe('loadFamilyChildrenBySlug', () => {
  it("resolves family A's slug to ONLY family A's children", async () => {
    const { familyId } = await getRefs()
    const family = await prisma.family.findUniqueOrThrow({ where: { id: familyId } })

    const kids = await loadFamilyChildrenBySlug(family.pinSlug)
    expect(kids).not.toBeNull()
    expect(kids!.length).toBeGreaterThan(0)
    expect(kids!.every((k) => k.familyId === familyId)).toBe(true)
  })

  it("family A's slug never returns family B's child, and vice-versa", async () => {
    const { familyId: familyAId } = await getRefs()
    const famB = await seedFamilyB()
    const familyA = await prisma.family.findUniqueOrThrow({ where: { id: familyAId } })

    const kidsForA = await loadFamilyChildrenBySlug(familyA.pinSlug)
    expect(kidsForA!.some((k) => k.name === famB.childName)).toBe(false)
    expect(kidsForA!.every((k) => k.familyId === familyAId)).toBe(true)

    const kidsForB = await loadFamilyChildrenBySlug(famB.slug)
    expect(kidsForB!.map((k) => k.name)).toEqual([famB.childName])
    expect(kidsForB!.every((k) => k.familyId !== familyAId)).toBe(true)
  })

  it('an unknown slug resolves to null — never an unscoped fallback list', async () => {
    await seedFamilyB() // prove there IS data in the DB it could leak
    const kids = await loadFamilyChildrenBySlug('this-slug-does-not-exist')
    expect(kids).toBeNull()
  })

  it("the seeded fixture's slug matches prisma/seed.test.ts IDS.familyPinSlug", async () => {
    // e2e (tests/e2e/auth.spec.ts) hard-codes this value — if it drifts here
    // without updating there, that suite silently stops testing the real URL.
    const family = await prisma.family.findUniqueOrThrow({ where: { id: IDS.family } })
    expect(family.pinSlug).toBe(IDS.familyPinSlug)
  })
})

describe('getFamilyPinSlug', () => {
  it("resolves a family's id to that family's own pinSlug", async () => {
    const { familyId } = await getRefs()
    expect(await getFamilyPinSlug(familyId)).toBe(IDS.familyPinSlug)
  })

  it("family A's id never returns family B's slug, and vice-versa", async () => {
    const { familyId: familyAId } = await getRefs()
    const famB = await seedFamilyB()

    expect(await getFamilyPinSlug(familyAId)).toBe(IDS.familyPinSlug)
    expect(await getFamilyPinSlug(famB.id)).toBe(famB.slug)
    expect(famB.slug).not.toBe(IDS.familyPinSlug)
  })

  it('a deleted family resolves to null instead of throwing', async () => {
    const famB = await seedFamilyB()
    await prisma.user.deleteMany({ where: { familyId: famB.id } })
    await prisma.family.delete({ where: { id: famB.id } })

    expect(await getFamilyPinSlug(famB.id)).toBeNull()
    expect(await getFamilyPinSlug('this-family-id-does-not-exist')).toBeNull()
  })
})

/** Build a minimal SessionUser as getSessionUser() would return it. */
function sessionUser(overrides: Partial<SessionUser> & { familyId: string }): SessionUser {
  return { userId: 'u1', role: 'parent', name: null, ...overrides }
}

describe('resolveParentPinRedirect', () => {
  it("a signed-in parent gets their own family's pinSlug, with no code typed", async () => {
    const { familyId } = await getRefs()
    const slug = await resolveParentPinRedirect(sessionUser({ role: 'parent', familyId }))
    expect(slug).toBe(IDS.familyPinSlug)
  })

  it('no session falls through to the existing client gate (null, no redirect)', async () => {
    expect(await resolveParentPinRedirect(null)).toBeNull()
  })

  it("a child's own session also falls through — only a parent session auto-redirects", async () => {
    const { familyId } = await getRefs()
    const slug = await resolveParentPinRedirect(sessionUser({ role: 'child', familyId }))
    expect(slug).toBeNull()
  })

  it("a parent from family A can never be redirected into family B's picker", async () => {
    const { familyId: familyAId } = await getRefs()
    const famB = await seedFamilyB()

    const slugForA = await resolveParentPinRedirect(sessionUser({ role: 'parent', familyId: familyAId }))
    const slugForB = await resolveParentPinRedirect(sessionUser({ role: 'parent', familyId: famB.id }))

    expect(slugForA).toBe(IDS.familyPinSlug)
    expect(slugForB).toBe(famB.slug)
    expect(slugForA).not.toBe(slugForB)
  })
})
