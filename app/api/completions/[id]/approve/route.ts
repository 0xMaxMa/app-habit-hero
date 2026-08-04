/**
 * app/api/completions/[id]/approve/route.ts (T20 / T25)
 *
 * POST (parent only) — approve a pending completion:
 *   1. award XP via lib/point-rules (late penalty via chore.lateXpMultiplier)
 *      + lib/xp, persisted on the completion. A parent may override the amount
 *      with an explicit `xpAwarded` (the approval slider) and attach a short
 *      `note` (the reason) — both are optional; a bare approve keeps the
 *      computed award and no note.
 *   2. mark it approved (reviewedBy / reviewedAt / xpAwarded / feedback).
 *   3. bump the child's UserProgress and RETURN the gamification deltas —
 *      new level (lib/level), streak (lib/streak), newly-earned badges
 *      (lib/badges) — for the agent/UI to celebrate.
 *
 * Family scope is enforced against the completion's chore (decision #3).
 */

import { z } from 'zod'
import {
  ok,
  withHandler,
  resolveActor,
  assertParent,
  assertFamily,
  notFound,
  conflict,
  badRequest,
} from '@/lib/api'
import { pendingTodayChores } from '@/lib/api/today'
import { applyGamification } from '@/lib/api/gamification'
import { prisma } from '@/lib/db'
import { systemClock, THAI_LOCAL_OFFSET_MS } from '@/lib/clock'
import { xpForSubmission, deadlineForDueTime } from '@/lib/point-rules'

export const dynamic = 'force-dynamic'

/** Optional approve body: a manual XP override (slider) + a reason note. */
const approveSchema = z.object({
  xpAwarded: z.number().int().min(0).max(1000).optional(),
  note: z.string().trim().max(500).optional(),
})

export const POST = withHandler<{ params: { id: string } }>(async (req, { params }) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const completion = await prisma.choreCompletion.findUnique({
    where: { id: params.id },
    include: { chore: true },
  })
  if (!completion) throw notFound('Completion not found')
  assertFamily(actor, completion.chore.familyId)

  if (completion.status !== 'pending') {
    throw conflict(`Completion is already ${completion.status}`)
  }

  // Optional body — a bare approve (agent / quick-approve) sends nothing, while
  // the parent's approval panel sends an xpAwarded override and/or a note.
  const rawBody = await req.json().catch(() => ({}))
  const parsed = approveSchema.safeParse(rawBody)
  if (!parsed.success) {
    throw badRequest('Invalid request body', { issues: parsed.error.issues })
  }
  const { xpAwarded: xpOverride, note } = parsed.data

  // --- XP: a manual override wins verbatim; otherwise the full amount, or the
  //         chore's late-penalized amount against its due time. -------------
  const baseXp = completion.chore.xpValue
  const deadline = deadlineForDueTime(
    completion.submittedAt,
    completion.chore.dueTime,
    THAI_LOCAL_OFFSET_MS,
  )
  const xpAwarded =
    xpOverride !== undefined
      ? xpOverride
      : deadline
        ? xpForSubmission(baseXp, deadline, completion.submittedAt, completion.chore.lateXpMultiplier)
        : baseXp

  const now = systemClock.now()
  await prisma.choreCompletion.update({
    where: { id: completion.id },
    data: {
      status: 'approved',
      reviewedBy: actor.userId,
      reviewedAt: now,
      xpAwarded,
      // Store the parent's reason (if any) on the completion's feedback column.
      ...(note ? { feedback: note } : {}),
    },
  })

  // --- Did this finish the child's day? (drives the Speed Demon badge) -----
  // Bonus chores are opt-in extras, so a day is "finished" once every required
  // chore is done. The streak no longer asks this question at all — it counts
  // any day the child got something approved (lib/streak).
  const childId = completion.completedBy
  const remaining = await pendingTodayChores(completion.chore.familyId, childId, systemClock)
  const requiredRemaining = remaining.filter((c) => !c.isExtra)

  let allChoresDoneBeforeNoon = false
  if (requiredRemaining.length === 0) {
    const todaysApproved = await prisma.choreCompletion.findMany({
      where: {
        completedBy: childId,
        status: 'approved',
        submittedAt: {
          gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
          lt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)),
        },
      },
      select: { submittedAt: true },
    })
    allChoresDoneBeforeNoon =
      todaysApproved.length > 0 && todaysApproved.every((c) => c.submittedAt.getUTCHours() < 12)
  }

  const gamification = await applyGamification({
    userId: childId,
    xpDelta: xpAwarded,
    allChoresDoneBeforeNoon,
    clock: systemClock,
  })

  return ok({
    completion: {
      id: completion.id,
      status: 'approved',
      xpAwarded,
      reviewedBy: actor.userId,
      reviewedAt: now,
    },
    ...gamification,
  })
})
