/**
 * app/api/members/[id]/avatar/route.ts — upload or clear a member's avatar.
 *
 *   POST   multipart/form-data { avatar(file) } → store on the local volume and
 *          set User.avatarUrl.
 *   DELETE → remove the avatar (back to the illustrated fallback).
 *
 * Parent-only and family-scoped (T30); the target must be a member (child OR
 * parent — a parent may set their own or a co-parent's photo) in the acting
 * parent's own family, or 404. Photo I/O reuses lib/api/photo (decision #1:
 * local volume, not object storage).
 */

import { prisma } from '@/lib/db'
import {
  withHandler,
  ok,
  resolveActor,
  assertParent,
  notFound,
  badRequest,
  saveAvatar,
} from '@/lib/api'

export const dynamic = 'force-dynamic'

/** Load a member that must live in the acting parent's family, or 404. */
async function memberInFamily(id: string, familyId: string) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user || user.familyId !== familyId) {
    throw notFound('ไม่พบสมาชิกในครอบครัวนี้')
  }
  return user
}

/** Mirrors /api/members' DTO so a settings upsert keeps email/isSelf intact. */
function toMemberDto(
  u: {
    id: string
    name: string
    role: 'parent' | 'child'
    email: string | null
    pinHash: string | null
    channelUserRef: string | null
    linkCode: string | null
    avatarUrl: string | null
  },
  selfId?: string,
) {
  return {
    id: u.id,
    name: u.name,
    role: u.role,
    email: u.email,
    hasPin: u.pinHash !== null,
    linked: u.channelUserRef !== null,
    linkCode: u.linkCode,
    avatarUrl: u.avatarUrl,
    isSelf: u.id === selfId,
  }
}

const memberSelect = {
  id: true,
  name: true,
  role: true,
  email: true,
  pinHash: true,
  channelUserRef: true,
  linkCode: true,
  avatarUrl: true,
} as const

export const POST = withHandler<{ params: { id: string } }>(async (req, { params }) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const target = await memberInFamily(params.id, actor.familyId)

  const form = await req.formData().catch(() => {
    throw badRequest('Expected multipart/form-data')
  })
  const file = form.get('avatar')
  if (!(file instanceof File) || file.size === 0) {
    throw badRequest('กรุณาเลือกรูปภาพ')
  }
  if (file.type && !file.type.startsWith('image/')) {
    throw badRequest('ไฟล์ต้องเป็นรูปภาพเท่านั้น')
  }

  const avatarUrl = await saveAvatar(file)
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { avatarUrl },
    select: memberSelect,
  })

  return ok({ member: toMemberDto(updated, actor.userId) })
})

export const DELETE = withHandler<{ params: { id: string } }>(async (req, { params }) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const target = await memberInFamily(params.id, actor.familyId)
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { avatarUrl: null },
    select: memberSelect,
  })

  return ok({ member: toMemberDto(updated, actor.userId) })
})
