/**
 * app/api/setup/route.ts — one-time bootstrap for the single family.
 *
 * HabitHero is a single-family app (product decision): there is no open
 * registration. Instead the very first run creates THE parent + THE family
 * once, and the door then closes.
 *
 *   GET  → { needsSetup } for clients that need the flag (the /setup page
 *          guards itself with it; the login page redirects server-side).
 *   POST → create Family + parent User (bcrypt-hashed password) + UserProgress,
 *          but ONLY when no parent exists yet. A second attempt is a 409 so a
 *          public, unauthenticated endpoint can never mint a second family.
 *
 * After POST succeeds the client signs in and is sent to /onboarding to name
 * the family, add children and pick starter chores (that wizard already assumes
 * "the parent + family exist from sign-up").
 */

import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { needsSetup } from '@/lib/setup'
import { withHandler, ok, parseBody, conflict } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(8, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร').max(200),
  parentName: z.string().trim().min(1).max(40).default('คุณพ่อคุณแม่'),
  familyName: z.string().trim().min(1).max(60).default('ครอบครัวของฉัน'),
})

export const GET = withHandler(async () => {
  return ok({ needsSetup: await needsSetup() })
})

export const POST = withHandler(async (req) => {
  const { email, password, parentName, familyName } = await parseBody(req, bodySchema)

  // Guard: bootstrap is one-time. Anyone can call this endpoint, so the gate
  // must live here, not in the UI.
  if (!(await needsSetup())) {
    throw conflict('ตั้งค่าบัญชีเรียบร้อยแล้ว — เข้าสู่ระบบได้เลย')
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const family = await prisma.family.create({ data: { name: familyName } })
  const parent = await prisma.user.create({
    data: {
      name: parentName,
      role: 'parent',
      familyId: family.id,
      email: email.toLowerCase(),
      passwordHash,
    },
  })
  await prisma.userProgress.create({ data: { userId: parent.id } })

  return ok(
    { familyId: family.id, userId: parent.id, email: parent.email },
    { status: 201 },
  )
})
