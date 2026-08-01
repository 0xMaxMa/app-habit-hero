/**
 * app/api/members/route.ts — the family roster (Settings S8: "เพิ่มสมาชิก").
 *
 *   GET  → every member of the acting parent's family, with just enough to
 *          render the Settings list (name, role, whether a PIN is set, whether
 *          a channel identity is linked, and any outstanding link code).
 *   POST → add a member to that family:
 *          • child  — { name, pin }            (4-digit PIN login)
 *          • parent — { role:'parent', name, email, password }  (email login)
 *          This is the post-onboarding path the dashboard/Settings link to;
 *          onboarding only covers the very first batch.
 *
 * Both are parent-only and strictly family-scoped (T30): a parent can only see
 * and grow their own family.
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
  conflict,
} from '@/lib/api'
import { isValidPinFormat } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'

// A new member is either a child (PIN) or a co-parent (email + password). The
// child variant carries no `role` so the existing "เพิ่มเด็ก" form keeps working
// unchanged; the parent variant is tagged with role:'parent'.
const createSchema = z.union([
  z.object({
    role: z.literal('parent'),
    name: z.string().trim().min(1, 'กรุณาใส่ชื่อ').max(40),
    email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
    password: z.string().min(8, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร').max(200),
  }),
  z.object({
    role: z.literal('child').optional(),
    name: z.string().trim().min(1, 'กรุณาใส่ชื่อ').max(40),
    pin: z.string().refine(isValidPinFormat, 'PIN ต้องเป็นตัวเลข 4 หลัก'),
  }),
])

/** Shape returned to the Settings UI — never leaks pinHash/passwordHash. */
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
    // Lets the UI hide "delete" on the acting parent's own row.
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

export const GET = withHandler(async (req) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const members = await prisma.user.findMany({
    where: { familyId: actor.familyId },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: memberSelect,
  })

  return ok({ members: members.map((m) => toMemberDto(m, actor.userId)) })
})

export const POST = withHandler(async (req) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const body = await parseBody(req, createSchema)

  // ---- Co-parent (email + password) -------------------------------------
  if (body.role === 'parent') {
    const email = body.email.toLowerCase()
    const clash = await prisma.user.findUnique({ where: { email } })
    if (clash) throw conflict('อีเมลนี้ถูกใช้แล้ว')

    const passwordHash = await bcrypt.hash(body.password, 10)
    const parent = await prisma.user.create({
      data: {
        name: body.name,
        role: 'parent',
        familyId: actor.familyId,
        email,
        passwordHash,
      },
      select: memberSelect,
    })
    await prisma.userProgress.create({ data: { userId: parent.id } })

    return ok({ member: toMemberDto(parent) }, { status: 201 })
  }

  // ---- Child (4-digit PIN) ----------------------------------------------
  const pinHash = await bcrypt.hash(body.pin, 10)
  const child = await prisma.user.create({
    data: {
      name: body.name,
      role: 'child',
      familyId: actor.familyId,
      pinHash,
    },
    select: memberSelect,
  })
  await prisma.userProgress.create({ data: { userId: child.id } })

  return ok({ member: toMemberDto(child) }, { status: 201 })
})
