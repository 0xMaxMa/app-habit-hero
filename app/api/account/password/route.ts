/**
 * app/api/account/password/route.ts — a parent changes their OWN login password.
 *
 *   PATCH { currentPassword, newPassword }
 *     - Verifies currentPassword against the logged-in parent's bcrypt hash,
 *       then stores a fresh hash of newPassword. Parent-only, and always scoped
 *       to the session/actor's own account — never another user's.
 *
 * Children log in with a PIN (reset from the roster), not a password, so this
 * endpoint is deliberately parent-only.
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
  badRequest,
} from '@/lib/api'
import { verifyPassword } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  currentPassword: z.string().min(1, 'กรุณาใส่รหัสผ่านปัจจุบัน'),
  newPassword: z.string().min(8, 'รหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร').max(200),
})

export const PATCH = withHandler(async (req) => {
  const actor = await resolveActor(req)
  assertParent(actor)

  const { currentPassword, newPassword } = await parseBody(req, bodySchema)

  const user = await prisma.user.findUnique({ where: { id: actor.userId } })
  if (!user?.passwordHash) {
    throw badRequest('บัญชีนี้ไม่มีรหัสผ่าน')
  }

  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) {
    throw badRequest('รหัสผ่านปัจจุบันไม่ถูกต้อง')
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  })

  return ok({ success: true })
})
