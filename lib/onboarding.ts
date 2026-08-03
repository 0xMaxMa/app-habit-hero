/**
 * lib/onboarding.ts — HabitHero onboarding (T08 / design S2).
 *
 * Two concerns live here:
 *
 *  1. PURE, unit-testable logic (no Prisma, no React, no next/server import):
 *     - the curated STARTER_CHORE catalogue the wizard offers,
 *     - the wizard step machine (order / next / prev / parse),
 *     - zod input schemas + small validators reused by the client and the API.
 *
 *  2. `provisionOnboarding(db, input)` — the transactional write that turns a
 *     validated payload into DB rows. It takes the Prisma client as an argument
 *     (rather than importing `@/lib/db`) so it stays decoupled from Next and can
 *     be driven directly from an integration test against a throwaway Postgres.
 *
 * The parent + their Family already exist from sign-up; onboarding names the
 * family, adds child members (each with a bcrypt-hashed 4-digit PIN + a fresh
 * UserProgress row) and seeds the chosen starter chores — all in one
 * transaction, scoped to the authenticated parent's family.
 */

import { z } from 'zod'
import bcrypt from 'bcryptjs'
import type { PrismaClient } from '@prisma/client'
import {
  STARTER_CHORES,
  STARTER_REWARDS,
  isStarterChoreKey,
  isStarterRewardKey,
} from '@/lib/starter-catalog'

// The starter catalogue itself lives in lib/starter-catalog.ts (it is also read
// by `npm run db:seed` for families that already exist). Re-exported here so the
// wizard steps keep importing it from the module they always have.
export {
  STARTER_CHORES,
  STARTER_REWARDS,
  starterChoreByKey,
  starterRewardByKey,
  isStarterRewardKey,
} from '@/lib/starter-catalog'
export type { StarterChore, StarterReward } from '@/lib/starter-catalog'

// ---------------------------------------------------------------------------
// Wizard step machine
// ---------------------------------------------------------------------------

export const ONBOARDING_STEPS = [
  'welcome',
  'family',
  'members',
  'chores',
  'rewards',
  'review',
] as const

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number]

/** Parse an untrusted ?step= value, defaulting to the first step. */
export function parseStep(raw: string | null | undefined): OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(raw ?? '')
    ? (raw as OnboardingStep)
    : 'welcome'
}

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step)
}

export function isFirstStep(step: OnboardingStep): boolean {
  return stepIndex(step) === 0
}

export function isLastStep(step: OnboardingStep): boolean {
  return stepIndex(step) === ONBOARDING_STEPS.length - 1
}

/** Next step (clamped at the last step). */
export function nextStep(step: OnboardingStep): OnboardingStep {
  return ONBOARDING_STEPS[Math.min(stepIndex(step) + 1, ONBOARDING_STEPS.length - 1)]
}

/** Previous step (clamped at the first step). */
export function prevStep(step: OnboardingStep): OnboardingStep {
  return ONBOARDING_STEPS[Math.max(stepIndex(step) - 1, 0)]
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** A child PIN is exactly four decimal digits (mirrors lib/auth's rule). */
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin)
}

export const AVATARS = ['panda', 'fox', 'rabbit', 'chick', 'cat', 'bear'] as const
export type MemberAvatar = (typeof AVATARS)[number]

/** Thai labels for the picker, kept next to the list so the two can't drift. */
export const AVATAR_LABELS: Record<MemberAvatar, string> = {
  panda: 'แพนด้า',
  fox: 'จิ้งจอก',
  rabbit: 'กระต่าย',
  chick: 'ลูกเจี๊ยบ',
  cat: 'แมว',
  bear: 'หมี',
}

/**
 * A member added during onboarding.
 *
 * Children require a valid 4-digit PIN so they can sign in; a co-parent needs
 * an email + password instead, because that is what the parent credentials
 * provider authenticates against — without them the row exists but the person
 * can never log in. `age` is collected for UX but has no column in the schema,
 * so it is accepted and simply not persisted.
 */
export const memberSchema = z
  .object({
    name: z.string().trim().min(1, 'กรุณาใส่ชื่อ').max(40),
    avatar: z.enum(AVATARS).default('panda'),
    role: z.enum(['parent', 'child']).default('child'),
    age: z.number().int().min(2).max(25).optional(),
    pin: z.string().optional(),
    email: z.string().trim().email('อีเมลไม่ถูกต้อง').optional(),
    password: z.string().min(8, 'รหัสผ่านอย่างน้อย 8 ตัวอักษร').max(200).optional(),
  })
  .superRefine((m, ctx) => {
    if (m.role === 'child') {
      if (!m.pin || !isValidPinFormat(m.pin)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pin'],
          message: 'เด็กต้องมี PIN 4 หลัก',
        })
      }
      return
    }

    // role === 'parent'
    if (!m.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'ผู้ปกครองต้องมีอีเมลไว้เข้าสู่ระบบ',
      })
    }
    if (!m.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'ผู้ปกครองต้องตั้งรหัสผ่าน',
      })
    }
  })

export type MemberInput = z.infer<typeof memberSchema>

/** The full payload the finish step POSTs to /api/onboarding. */
export const onboardingSchema = z.object({
  familyName: z.string().trim().min(1, 'กรุณาตั้งชื่อครอบครัว').max(60),
  members: z.array(memberSchema).min(1, 'เพิ่มสมาชิกอย่างน้อย 1 คน').max(10),
  starterChoreKeys: z
    .array(z.string())
    .min(1, 'เลือกงานเริ่มต้นอย่างน้อย 1 งาน')
    .max(STARTER_CHORES.length)
    .refine((keys) => keys.every((k) => isStarterChoreKey(k)), {
      message: 'พบงานเริ่มต้นที่ไม่รู้จัก',
    })
    .refine((keys) => new Set(keys).size === keys.length, {
      message: 'งานเริ่มต้นซ้ำกัน',
    }),
  starterRewardKeys: z
    .array(z.string())
    .min(1, 'เลือกรางวัลอย่างน้อย 1 อย่าง')
    .max(STARTER_REWARDS.length)
    .refine((keys) => keys.every((k) => isStarterRewardKey(k)), {
      message: 'พบรางวัลที่ไม่รู้จัก',
    })
    .refine((keys) => new Set(keys).size === keys.length, {
      message: 'รางวัลซ้ำกัน',
    }),
})

export type OnboardingInput = z.infer<typeof onboardingSchema>

// ---------------------------------------------------------------------------
// Transactional provisioning
// ---------------------------------------------------------------------------

export interface ProvisionParams extends OnboardingInput {
  /** The authenticated parent's family (already exists from sign-up). */
  familyId: string
  /** The authenticated parent's user id (gets a UserProgress row if missing). */
  parentUserId: string
}

export interface ProvisionResult {
  familyId: string
  familyName: string
  childCount: number
  choreCount: number
  rewardCount: number
  createdChildIds: string[]
  createdChoreIds: string[]
  createdRewardIds: string[]
  /**
   * Every member created, in the order they were submitted. The wizard uploads
   * avatar photos only after this returns, because a photo needs a user id to
   * attach to — matching by index is what lets it pair file N with member N.
   */
  createdMembers: { index: number; id: string; role: 'parent' | 'child' }[]
}

/**
 * Turn a validated onboarding payload into rows, transactionally:
 *   - rename the parent's family,
 *   - ensure the parent has a UserProgress row,
 *   - create each member (children get a bcrypt-hashed PIN, co-parents a
 *     bcrypt-hashed password so they can actually sign in) + a UserProgress row,
 *   - create the selected starter chores,
 *   - create the selected starter rewards.
 *
 * PINs and passwords are hashed *before* opening the transaction so the
 * transaction stays short (no CPU-bound bcrypt work while it is held open).
 *
 * Accepts the Prisma client as an argument so it can run under the Next request
 * (with `@/lib/db`) or under an integration test with a throwaway client.
 */
export async function provisionOnboarding(
  db: PrismaClient,
  params: ProvisionParams,
): Promise<ProvisionResult> {
  const {
    familyId,
    parentUserId,
    familyName,
    members,
    starterChoreKeys,
    starterRewardKeys,
  } = params

  // Pre-hash PINs and passwords outside the transaction.
  const membersWithHash = await Promise.all(
    members.map(async (m) => ({
      name: m.name.trim(),
      role: m.role,
      avatarCharacter: m.avatar ?? null,
      email: m.role === 'parent' && m.email ? m.email.trim().toLowerCase() : null,
      pinHash: m.role === 'child' && m.pin ? await bcrypt.hash(m.pin, 10) : null,
      passwordHash:
        m.role === 'parent' && m.password ? await bcrypt.hash(m.password, 10) : null,
    })),
  )

  // Resolve chosen starter content in catalogue order (stable, de-duplicated).
  const chosen = STARTER_CHORES.filter((c) => starterChoreKeys.includes(c.key))
  const chosenRewards = STARTER_REWARDS.filter((r) => starterRewardKeys.includes(r.key))

  return db.$transaction(async (tx) => {
    await tx.family.update({
      where: { id: familyId },
      data: { name: familyName.trim() },
    })

    await tx.userProgress.upsert({
      where: { userId: parentUserId },
      create: { userId: parentUserId },
      update: {},
    })

    const createdChildIds: string[] = []
    const createdMembers: ProvisionResult['createdMembers'] = []
    for (let index = 0; index < membersWithHash.length; index++) {
      const m = membersWithHash[index]
      const user = await tx.user.create({
        data: {
          name: m.name,
          role: m.role,
          familyId,
          avatarCharacter: m.avatarCharacter,
          email: m.email,
          passwordHash: m.passwordHash,
          pinHash: m.pinHash,
        },
      })
      await tx.userProgress.create({ data: { userId: user.id } })
      createdMembers.push({ index, id: user.id, role: m.role })
      if (m.role === 'child') createdChildIds.push(user.id)
    }

    const createdChoreIds: string[] = []
    for (const c of chosen) {
      const chore = await tx.chore.create({
        data: {
          title: c.title,
          description: c.description,
          familyId,
          xpValue: c.xpValue,
          recurrence: c.recurrence,
          category: c.category,
          requirePhoto: c.requirePhoto,
          isExtra: c.isExtra,
          dueTime: c.dueTime ?? null,
          recurDays: c.recurDays ?? [],
          lateXpMultiplier: c.lateXpMultiplier ?? 1,
        },
      })
      createdChoreIds.push(chore.id)
    }

    const createdRewardIds: string[] = []
    for (const r of chosenRewards) {
      const reward = await tx.reward.create({
        data: {
          title: r.title,
          description: r.description ?? null,
          familyId,
          xpCost: r.xpCost,
          iconEmoji: r.iconEmoji,
          dailyLimit: r.dailyLimit ?? null,
          weeklyLimit: r.weeklyLimit ?? null,
          monthlyLimit: r.monthlyLimit ?? null,
        },
      })
      createdRewardIds.push(reward.id)
    }

    return {
      familyId,
      familyName: familyName.trim(),
      childCount: createdChildIds.length,
      choreCount: createdChoreIds.length,
      rewardCount: createdRewardIds.length,
      createdChildIds,
      createdChoreIds,
      createdRewardIds,
      createdMembers,
    }
  })
}
