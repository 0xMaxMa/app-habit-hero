/**
 * app/api/completions/route.ts (T17 / T19)
 *
 *   POST  multipart/form-data { child, chore_id?, photo(file) }
 *     - chore_id omitted → do NOT guess. Return the child's pending-today chores
 *       (status "choose_chore") so the caller can pick one.
 *     - chore_id present  → save the photo to the local volume (lib/api/photo)
 *       and create a ChoreCompletion with status=pending.
 *
 *   GET  ?status=pending → family-scoped pending completions, each with its
 *     chore, the child who did it, and the photo URL.
 *
 * The same endpoints back both the web UI and the gateway agent (decision #2).
 */

import { z } from 'zod'
import {
  ok,
  withHandler,
  resolveActor,
  assertFamily,
  badRequest,
  conflict,
  forbidden,
  notFound,
  savePhoto,
  discardPhoto,
} from '@/lib/api'
import { inCurrentPeriod, pendingTodayChores } from '@/lib/api/today'
import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/clock'

export const dynamic = 'force-dynamic'

const getQuery = z.object({
  // Omitted → all statuses (used by the history timeline). A single status
  // narrows the result (the approval queue passes `pending`).
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  // Optional child filter — a user id OR a channelUserRef.
  child: z.string().min(1).optional(),
})

// ---------------------------------------------------------------------------
// POST — submit a completion (optionally photo) for a child.
// ---------------------------------------------------------------------------

export const POST = withHandler(async (req) => {
  const actor = await resolveActor(req)

  const form = await req.formData().catch(() => {
    throw badRequest('Expected multipart/form-data')
  })

  // Identify the target child. `child` may be a user id OR a channelUserRef
  // (the agent knows callers by ref, not internal id). When omitted, a child
  // actor defaults to themselves; a parent must say which child.
  const rawChild = form.get('child')
  const childRef = typeof rawChild === 'string' && rawChild.length > 0 ? rawChild : null

  let child
  if (childRef) {
    child =
      (await prisma.user.findUnique({ where: { id: childRef } })) ??
      (await prisma.user.findUnique({ where: { channelUserRef: childRef } }))
  } else if (actor.role === 'child') {
    child = await prisma.user.findUnique({ where: { id: actor.userId } })
  } else {
    throw badRequest('`child` is required')
  }
  if (!child || child.role !== 'child') {
    throw notFound('Child not found')
  }
  assertFamily(actor, child.familyId)
  if (actor.role === 'child' && actor.userId !== child.id) {
    throw forbidden('Children can only submit their own chores')
  }

  const rawChoreId = form.get('chore_id')
  const choreId = typeof rawChoreId === 'string' && rawChoreId.length > 0 ? rawChoreId : null

  // No chore chosen → hand back the pending list rather than guessing (T19).
  if (!choreId) {
    const pending = await pendingTodayChores(child.familyId, child.id, systemClock)
    return ok({
      status: 'choose_chore',
      child: { id: child.id, name: child.name },
      pendingChores: pending.map((c) => ({
        id: c.id,
        title: c.title,
        xpValue: c.xpValue,
        requirePhoto: c.requirePhoto,
        isExtra: c.isExtra,
        dueTime: c.dueTime,
      })),
    })
  }

  const chore = await prisma.chore.findUnique({ where: { id: choreId } })
  if (!chore) throw notFound('Chore not found')
  assertFamily(actor, chore.familyId)
  // A chore assigned to a specific (other) child cannot be claimed by this one.
  if (chore.assignedTo && chore.assignedTo !== child.id) {
    throw forbidden('This chore is assigned to another child')
  }

  // --- Already handed in for this period? ----------------------------------
  // Without this a child could submit the same chore twice in a day and, once
  // both were approved, collect the XP twice — while every list in the app
  // insisted the chore was done. `inCurrentPeriod` is the same rule those lists
  // use, so the two cannot drift apart again.
  //
  // Deliberately NOT a schedule check: the agent may still submit a chore that
  // is out of its active window or on a weekday it does not recur on, so a
  // parent can record work after the fact. `allow_duplicate` opts out of this
  // one guard for the same reason — recording a second, genuinely separate run
  // of the chore.
  const now = systemClock.now()
  const allowDuplicate = form.get('allow_duplicate') === 'true'
  if (!allowDuplicate) {
    const settled = await prisma.choreCompletion.findFirst({
      where: {
        choreId: chore.id,
        completedBy: child.id,
        status: { in: ['pending', 'approved'] },
      },
      select: { id: true, status: true, submittedAt: true },
      orderBy: { submittedAt: 'desc' },
    })
    if (settled && inCurrentPeriod(chore, settled.submittedAt, now)) {
      throw conflict(
        settled.status === 'pending'
          ? 'งานนี้ส่งไปแล้ว กำลังรอคุณพ่อคุณแม่ตรวจอยู่'
          : 'งานนี้ทำเสร็จแล้วในรอบนี้',
        {
          // NOT `code` — respond.ts spreads extras over the envelope, and
          // `error.code` must stay the ApiErrorCode the clients branch on.
          reason: 'ALREADY_SUBMITTED',
          completionId: settled.id,
          completionStatus: settled.status,
          recurrence: chore.recurrence,
        },
      )
    }
  }

  const photo = form.get('photo')
  const hasPhoto = photo instanceof File && photo.size > 0
  if (chore.requirePhoto && !hasPhoto) {
    throw badRequest('This chore requires a photo')
  }
  const photoUrl = hasPhoto ? await savePhoto(photo) : null

  let completion
  try {
    completion = await prisma.choreCompletion.create({
      data: {
        choreId: chore.id,
        completedBy: child.id,
        photoUrl,
        submittedAt: now,
        status: 'pending',
      },
      include: {
        chore: true,
        completer: { select: { id: true, name: true, avatarUrl: true } },
      },
    })
  } catch (err) {
    // The photo is already on the volume at this point. Nothing will ever
    // reference it now, so take it back out rather than leaving the family's
    // storage to fill with files no screen can show.
    if (photoUrl) await discardPhoto(photoUrl)
    throw err
  }

  return ok(
    {
      status: 'submitted',
      completion: {
        id: completion.id,
        status: completion.status,
        photoUrl: completion.photoUrl,
        submittedAt: completion.submittedAt,
        chore: { id: completion.chore.id, title: completion.chore.title, xpValue: completion.chore.xpValue },
        child: completion.completer,
      },
    },
    { status: 201 },
  )
})

// ---------------------------------------------------------------------------
// GET — family-scoped completions.
//   • ?status=pending           → the approval queue (T19).
//   • no status / ?child=<ref>  → the history timeline (T13): every reviewed
//     completion, newest-first sorting handled by the caller.
// ---------------------------------------------------------------------------

export const GET = withHandler(async (req) => {
  const actor = await resolveActor(req)
  const { searchParams } = new URL(req.url)
  const { status, child } = getQuery.parse(Object.fromEntries(searchParams.entries()))

  // Resolve an optional child filter to a concrete family member.
  let completedBy: string | undefined
  if (child) {
    const target =
      (await prisma.user.findUnique({ where: { id: child } })) ??
      (await prisma.user.findUnique({ where: { channelUserRef: child } }))
    if (!target || target.role !== 'child') {
      throw notFound('Child not found')
    }
    assertFamily(actor, target.familyId)
    completedBy = target.id
  }

  // A child may only ever read their OWN completions — never a sibling's,
  // whatever `child` filter they pass (T30).
  if (actor.role === 'child') {
    if (completedBy && completedBy !== actor.userId) {
      throw forbidden('Children can only view their own history')
    }
    completedBy = actor.userId
  }

  const completions = await prisma.choreCompletion.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(completedBy ? { completedBy } : {}),
      chore: { familyId: actor.familyId },
    },
    include: {
      // dueTime + lateXpMultiplier ride along so the approval queue can show the
      // deadline a submission is judged against, and flag the late ones.
      chore: {
        select: {
          id: true,
          title: true,
          xpValue: true,
          requirePhoto: true,
          dueTime: true,
          lateXpMultiplier: true,
        },
      },
      completer: { select: { id: true, name: true, avatarUrl: true } },
    },
    orderBy: { submittedAt: 'asc' },
  })

  return ok({
    completions: completions.map((c) => ({
      id: c.id,
      status: c.status,
      photoUrl: c.photoUrl,
      submittedAt: c.submittedAt,
      reviewedAt: c.reviewedAt,
      xpAwarded: c.xpAwarded,
      feedback: c.feedback,
      chore: c.chore,
      child: c.completer,
    })),
  })
})
