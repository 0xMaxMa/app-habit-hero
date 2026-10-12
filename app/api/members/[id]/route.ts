/**
 * app/api/members/[id]/route.ts — edit or remove one family member.
 *
 *   PATCH  → rename a member and/or reset a child's 4-digit PIN.
 *   DELETE → remove a member (child or co-parent) from the family.
 *
 * Parent-only and family-scoped: the target must belong to the acting parent's
 * own family, enforced with the shared `assertFamily` (lib/api/authz.ts) — the
 * same helper every other family-scoped route uses (T30). A missing id is a
 * 404; a real member in a DIFFERENT family is a 403, same as every other
 * family-scoped resource in this API (e.g. app/api/chores/[id]).
 * Guardrails: PINs only apply to children; you can't delete your own account,
 * and you can't delete the last remaining parent — that keeps a family from
 * ever losing its last account and locking everyone out.
 */

import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import {
  withHandler,
  ok,
  parseBody,
  resolveActor,
  assertParent,
  assertFamily,
  notFound,
  badRequest,
  type Actor,
} from '@/lib/api'
import { isValidPinFormat } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'

const patchSchema = z
  .object({
    name: z.string().trim().min(1, 'กรุณาใส่ชื่อ').max(40).optional(),
    pin: z.string().refine(isValidPinFormat, 'PIN ต้องเป็นตัวเลข 4 หลัก').optional(),
  })
  .refine((b) => b.name !== undefined || b.pin !== undefined, {
    message: 'ไม่มีข้อมูลให้แก้ไข',
  })

/** Load a member that must live in the acting parent's family. */
async function memberInFamily(id: string, actor: Actor) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw notFound('ไม่พบสมาชิก')
  assertFamily(actor, user.familyId)
  return user
}

export const PATCH = withHandler<{ params: { id: string } }>(async (req, { params }) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const target = await memberInFamily(params.id, actor)
  const { name, pin } = await parseBody(req, patchSchema)

  if (pin !== undefined && target.role !== 'child') {
    throw badRequest('ตั้ง PIN ได้เฉพาะบัญชีเด็กเท่านั้น')
  }

  const data: { name?: string; pinHash?: string } = {}
  if (name !== undefined) data.name = name
  if (pin !== undefined) data.pinHash = await bcrypt.hash(pin, 10)

  const updated = await prisma.user.update({
    where: { id: target.id },
    data,
    select: {
      id: true,
      name: true,
      role: true,
      pinHash: true,
      channelUserRef: true,
      linkCode: true,
      avatarUrl: true,
    },
  })

  return ok({
    member: {
      id: updated.id,
      name: updated.name,
      role: updated.role,
      hasPin: updated.pinHash !== null,
      linked: updated.channelUserRef !== null,
      linkCode: updated.linkCode,
      avatarUrl: updated.avatarUrl,
    },
  })
})

export const DELETE = withHandler<{ params: { id: string } }>(async (req, { params }) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const target = await memberInFamily(params.id, actor)

  // You can never delete your own account (that would kill your own session and
  // is almost always a mistake) …
  if (target.id === actor.userId) {
    throw badRequest('ไม่สามารถลบบัญชีของตัวเองได้')
  }

  // … and the family must always keep at least one parent, or nobody can ever
  // sign in to manage it again.
  if (target.role === 'parent') {
    const parentCount = await prisma.user.count({
      where: { familyId: actor.familyId, role: 'parent' },
    })
    if (parentCount <= 1) {
      throw badRequest('ต้องมีผู้ปกครองอย่างน้อยหนึ่งคนในครอบครัว')
    }
  }

  // UserProgress + UserBadge cascade on user delete, and reviewedCompletions +
  // assignedChores are SetNull — but ChoreCompletion.completedBy and
  // RewardRedemption.redeemedBy have NO cascade (they'd raise a FK restrict).
  // Remove those user-owned rows first, all in one transaction so a member with
  // history deletes cleanly. (Parents have none of these, but it's harmless.)
  await prisma.$transaction([
    prisma.rewardRedemption.deleteMany({ where: { redeemedBy: target.id } }),
    prisma.choreCompletion.deleteMany({ where: { completedBy: target.id } }),
    prisma.user.delete({ where: { id: target.id } }),
  ])

  return ok({ id: target.id })
})
