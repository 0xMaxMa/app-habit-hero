/**
 * app/api/completions/backdate/route.ts — parent logs a chore completion for
 * an earlier day.
 *
 * POST /api/completions/backdate  { child, chore_id, date: "YYYY-MM-DD", note? }
 *   Parent-only (never the child/self-submit path). `date` is a Thai local
 *   calendar date, at most BACKDATE_LOOKBACK_DAYS in the past (lib/api/backdate).
 *   Creates a ChoreCompletion already `approved` — the parent attesting it
 *   happened IS the approval, there is no one else left to review it — tagged
 *   `source: parent_backdated` so it never reads as the child's own same-day
 *   submission in history. XP is priced the same way the approve route prices
 *   any completion (lib/point-rules, against the chore's due time ON the
 *   backdated day), then run through the shared applyGamification so the
 *   streak is correctly re-derived from the full completion history — see
 *   lib/api/gamification.deriveStreak's doc comment: it is explicitly
 *   order-independent, so a gap-filling backdate lands exactly where it should
 *   without any special-casing here.
 *
 * Still outside this endpoint's job: a photo. A parent is vouching directly,
 * not forwarding evidence, so requirePhoto does not apply here the way it does
 * for POST /api/completions.
 */

import { z } from 'zod'
import {
  ok,
  withHandler,
  resolveActor,
  assertParent,
  assertFamily,
  parseBody,
  badRequest,
  conflict,
  forbidden,
  notFound,
} from '@/lib/api'
import { resolveBackdate, BACKDATE_LOOKBACK_DAYS } from '@/lib/api/backdate'
import { inCurrentPeriod } from '@/lib/api/today'
import { applyGamification } from '@/lib/api/gamification'
import { xpForSubmission, deadlineForDueTime } from '@/lib/point-rules'
import { prisma } from '@/lib/db'
import { systemClock, THAI_LOCAL_OFFSET_MS } from '@/lib/clock'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  child: z.string().min(1),
  chore_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  note: z.string().trim().max(500).optional(),
})

export const POST = withHandler(async (req) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const {
    child: childRef,
    chore_id: choreId,
    date,
    note,
  } = await parseBody(req, bodySchema)

  const child =
    (await prisma.user.findUnique({ where: { id: childRef } })) ??
    (await prisma.user.findUnique({ where: { channelUserRef: childRef } }))
  if (!child || child.role !== 'child') {
    throw notFound('Child not found')
  }
  assertFamily(actor, child.familyId)

  const chore = await prisma.chore.findUnique({ where: { id: choreId } })
  if (!chore) throw notFound('Chore not found')
  assertFamily(actor, chore.familyId)
  if (chore.assignedTo && chore.assignedTo !== child.id) {
    throw forbidden('This chore is assigned to another child')
  }

  const now = systemClock.now()
  const resolved = resolveBackdate(date, now, THAI_LOCAL_OFFSET_MS)
  if (!resolved.ok) {
    throw badRequest(
      resolved.rejection === 'not_past'
        ? 'date must be a past day — use POST /api/completions for today'
        : `date cannot be more than ${BACKDATE_LOOKBACK_DAYS} days ago`,
      { reason: resolved.rejection },
    )
  }
  const submittedAt = resolved.instant

  // Same "already settled this period" guard the normal submit endpoint uses
  // (lib/api/today.inCurrentPeriod) — evaluated against the BACKDATED day, so a
  // parent cannot double-log the same chore for a day already covered.
  const settled = await prisma.choreCompletion.findFirst({
    where: {
      choreId: chore.id,
      completedBy: child.id,
      status: { in: ['pending', 'approved'] },
    },
    select: { id: true, status: true, submittedAt: true },
    orderBy: { submittedAt: 'desc' },
  })
  if (settled && inCurrentPeriod(chore, settled.submittedAt, submittedAt)) {
    throw conflict('งานนี้มีการบันทึกไว้แล้วสำหรับช่วงนี้', {
      reason: 'ALREADY_SUBMITTED',
      completionId: settled.id,
      completionStatus: settled.status,
    })
  }

  const baseXp = chore.xpValue
  const deadline = deadlineForDueTime(submittedAt, chore.dueTime, THAI_LOCAL_OFFSET_MS)
  const xpAwarded = deadline
    ? xpForSubmission(baseXp, deadline, submittedAt, chore.lateXpMultiplier)
    : baseXp

  const completion = await prisma.choreCompletion.create({
    data: {
      choreId: chore.id,
      completedBy: child.id,
      submittedAt,
      status: 'approved',
      source: 'parent_backdated',
      reviewedBy: actor.userId,
      reviewedAt: now,
      xpAwarded,
      ...(note ? { feedback: note } : {}),
    },
    include: {
      chore: { select: { id: true, title: true, xpValue: true } },
      completer: { select: { id: true, name: true, avatarUrl: true } },
    },
  })

  const gamification = await applyGamification({
    userId: child.id,
    xpDelta: xpAwarded,
    allChoresDoneBeforeNoon: false,
    clock: systemClock,
  })

  return ok(
    {
      completion: {
        id: completion.id,
        status: 'approved',
        source: 'parent_backdated',
        date,
        submittedAt: completion.submittedAt,
        xpAwarded,
        chore: completion.chore,
        child: completion.completer,
      },
      ...gamification,
    },
    { status: 201 },
  )
})
