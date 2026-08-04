/**
 * app/api/completions/[id]/unapprove/route.ts
 *
 * POST (parent only) — undo an approval and put the completion back in the
 * review queue. The inverse of ./approve:
 *   1. completion → pending, xpAwarded 0, reviewer + review time + note cleared
 *      (the photo the child submitted is kept, so it can simply be re-reviewed).
 *   2. claw the granted XP back off the child's UserProgress and recompute the
 *      level (lib/api/gamification.reverseGamification).
 *   3. revoke any badge that this approval — and only this approval — was
 *      holding up, so re-approving celebrates it again.
 *
 * The daily streak IS re-derived from the child's remaining approved
 * completions: taking back their only approved chore of a day takes that day
 * out of the streak, while undoing one of several leaves it alone. The response
 * reports which happened via `streakUnchanged` so the UI can say it plainly.
 *
 * Family scope is enforced against the completion's chore (decision #3).
 */

import {
  ok,
  withHandler,
  resolveActor,
  assertParent,
  assertFamily,
  notFound,
  conflict,
} from '@/lib/api'
import { reverseGamification } from '@/lib/api/gamification'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/clock'

export const dynamic = 'force-dynamic'

export const POST = withHandler<{ params: { id: string } }>(async (req, { params }) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const completion = await prisma.choreCompletion.findUnique({
    where: { id: params.id },
    include: { chore: { select: { familyId: true } } },
  })
  if (!completion) throw notFound('Completion not found')
  assertFamily(actor, completion.chore.familyId)

  if (completion.status !== 'approved') {
    throw conflict(`Completion is ${completion.status}, not approved`)
  }

  const xpToRevoke = completion.xpAwarded ?? 0

  // Flip the row back first so the badge recount below sees the post-undo world.
  await prisma.choreCompletion.update({
    where: { id: completion.id },
    data: {
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      xpAwarded: 0,
      // Drop the approval note — it belonged to the decision being undone.
      feedback: null,
    },
  })

  const undo = await reverseGamification({
    userId: completion.completedBy,
    xpDelta: xpToRevoke,
    completionId: completion.id,
    clock: systemClock,
  })

  return ok({
    completion: {
      id: completion.id,
      status: 'pending',
      xpRevoked: xpToRevoke,
      reviewedBy: null,
      reviewedAt: null,
    },
    ...undo,
    // The streak is derived from approved completions, so it only moves when
    // this was the child's last approved chore of that day. Reported, not assumed.
    streakUnchanged: !undo.streak.changed,
  })
})
