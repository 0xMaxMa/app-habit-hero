/**
 * app/api/onboarding/route.ts — finish the onboarding wizard (T08 / design S2).
 *
 * The web wizard (app/onboarding) POSTs its final, validated draft here. The
 * parent + their Family already exist from sign-up; this endpoint renames the
 * family, creates the added members (children get a bcrypt-hashed 4-digit PIN)
 * and seeds the chosen starter chores — all transactionally, scoped to the
 * authenticated parent's family.
 *
 * The heavy lifting (validation schema + the transactional write + PIN hashing,
 * which matches lib/auth's bcrypt usage) lives in lib/onboarding so it is shared
 * with tests and never duplicated here.
 */

import { prisma } from '@/lib/db'
import { withHandler, ok, parseBody, resolveActor, assertParent } from '@/lib/api'
import { onboardingSchema, provisionOnboarding } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'

export const POST = withHandler(async (req) => {
  // Only an authenticated parent may provision their family (T30 authz).
  const actor = await resolveActor(req)
  assertParent(actor)

  const input = await parseBody(req, onboardingSchema)

  const result = await provisionOnboarding(prisma, {
    ...input,
    familyId: actor.familyId,
    parentUserId: actor.userId,
  })

  return ok(result, { status: 201 })
})
