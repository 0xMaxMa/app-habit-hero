/**
 * app/api/signup/route.ts — public family sign-up.
 *
 * Open registration (product decision, Phase A): any visitor may create a
 * brand-new Family + its first parent account, as many times as they like —
 * same trust model as any public SaaS sign-up. This replaced the old
 * `/api/setup`, which only ever let this happen once per deployment
 * (`needsSetup()` / `lib/setup.ts`, now removed) because HabitHero used to
 * assume a single family per install.
 *
 * POST → create Family (with a fresh pinSlug — see lib/pin-slug.ts, the
 *        /pin/<slug> scoping this family's child PIN picker) + parent User
 *        (bcrypt-hashed password) + UserProgress, all in one transaction. The
 *        email-uniqueness check runs BEFORE the transaction opens so the
 *        common duplicate-email case never pays for opening one; a genuine
 *        concurrent duplicate that races past that check still hits the
 *        email @unique constraint inside the transaction and is caught below
 *        as a clean 409, not a raw 500.
 *
 * After POST succeeds the client signs in and is sent to /onboarding to name
 * the family, add children and pick starter chores (that wizard already
 * assumes "the parent + family exist from sign-up").
 */

import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { createFamilyWithPinSlug } from '@/lib/pin-slug'
import { isUniqueViolation } from '@/lib/api/tx'
import { withHandler, ok, parseBody, conflict } from '@/lib/api'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().trim().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(8, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร').max(200),
  parentName: z.string().trim().min(1).max(40).default('คุณพ่อคุณแม่'),
  familyName: z.string().trim().min(1).max(60).default('ครอบครัวของฉัน'),
})

export const POST = withHandler(async (req) => {
  const { email, password, parentName, familyName } = await parseBody(req, bodySchema)
  const normalizedEmail = email.toLowerCase()

  const clash = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (clash) throw conflict(`อีเมล ${normalizedEmail} ถูกใช้แล้ว`)

  const passwordHash = await bcrypt.hash(password, 10)

  // One transaction so a mid-way failure (e.g. a race on the email we just
  // checked) never leaves an orphaned Family with no parent. Retried, as a
  // WHOLE new transaction each time, on the rare pinSlug collision — a
  // `family` set right after it succeeds tells the catch below whether a
  // P2002 happened before or after that point, since Postgres aborts the
  // whole transaction on any error and a second statement on the same `tx`
  // cannot be trusted to retry cleanly.
  for (let attempt = 0; attempt < 5; attempt++) {
    let pastFamilyCreation = false
    try {
      const result = await prisma.$transaction(async (tx) => {
        const family = await createFamilyWithPinSlug(tx, familyName)
        pastFamilyCreation = true
        const parent = await tx.user.create({
          data: {
            name: parentName,
            role: 'parent',
            familyId: family.id,
            email: normalizedEmail,
            passwordHash,
          },
        })
        await tx.userProgress.create({ data: { userId: parent.id } })
        return { familyId: family.id, userId: parent.id, email: parent.email }
      })
      return ok(result, { status: 201 })
    } catch (err) {
      if (!pastFamilyCreation && isUniqueViolation(err) && attempt < 4) continue
      if (pastFamilyCreation && isUniqueViolation(err)) {
        throw conflict(`อีเมล ${normalizedEmail} ถูกใช้แล้ว`)
      }
      throw err
    }
  }
  throw conflict('ไม่สามารถสร้างครอบครัวได้ กรุณาลองใหม่')
})
