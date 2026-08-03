/**
 * app/api/onboarding/route.ts — finish the onboarding wizard (T08 / design S2).
 *
 * The web wizard (app/onboarding) POSTs its final, validated draft here. The
 * parent + their Family already exist from sign-up; this endpoint renames the
 * family, creates the added members (children get a bcrypt-hashed 4-digit PIN,
 * co-parents a hashed password + email so they can sign in) and seeds the
 * chosen starter chores and rewards — all transactionally, scoped to the
 * authenticated parent's family.
 *
 * Avatar photos are NOT handled here: they need a member id, which only exists
 * once this returns, so the wizard uploads them afterwards against
 * /api/members/<id>/avatar using the ids in `createdMembers`.
 *
 * The heavy lifting (validation schema + the transactional write + PIN hashing,
 * which matches lib/auth's bcrypt usage) lives in lib/onboarding so it is shared
 * with tests and never duplicated here.
 */

import { prisma } from '@/lib/db'
import {
  withHandler,
  ok,
  parseBody,
  resolveActor,
  assertParent,
  conflict,
} from '@/lib/api'
import { onboardingSchema, provisionOnboarding } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'

export const POST = withHandler(async (req) => {
  // Only an authenticated parent may provision their family (T30 authz).
  const actor = await resolveActor(req)
  assertParent(actor)

  const input = await parseBody(req, onboardingSchema)

  // Co-parent emails must be free before the transaction opens. Prisma's unique
  // index would otherwise surface as a 500 halfway through provisioning, and a
  // parent would have no idea which of the members they added caused it.
  const emails = input.members
    .filter((m) => m.role === 'parent' && m.email)
    .map((m) => m.email!.trim().toLowerCase())

  if (new Set(emails).size !== emails.length) {
    throw conflict('มีอีเมลผู้ปกครองซ้ำกันในรายการ')
  }
  if (emails.length > 0) {
    const clash = await prisma.user.findFirst({
      where: { email: { in: emails } },
      select: { email: true },
    })
    if (clash) throw conflict(`อีเมล ${clash.email} ถูกใช้แล้ว`)
  }

  const result = await provisionOnboarding(prisma, {
    ...input,
    familyId: actor.familyId,
    parentUserId: actor.userId,
  })

  return ok(result, { status: 201 })
})
