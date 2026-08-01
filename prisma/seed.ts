/**
 * prisma/seed.ts — load the starter catalogue into an EXISTING family.
 *
 * A fresh install normally gets its starter chores + rewards from the
 * onboarding wizard (lib/onboarding.ts → provisionOnboarding). This script is
 * for the other case: a family that already exists and wants the catalogue —
 * after an upgrade that added entries, or after clearing the tables.
 *
 * Safe to re-run. Nothing is deleted and nothing is overwritten: a chore or
 * reward whose `title` already exists in the family is skipped, so a parent's
 * own edits (XP tweaks, renamed rewards, disabled items) survive.
 *
 * Badges are NOT handled by the wizard — they are global rows seeded by the SQL
 * migrations — but they are re-asserted here so a database that skipped a
 * migration still converges. Levels have no table at all (lib/level.ts).
 *
 * Run:
 *   npm run db:seed                 # the single family (errors if there are 2+)
 *   npm run db:seed -- <familyId>   # a specific family
 */

import { PrismaClient } from '@prisma/client'
import { seedBadges } from './seed-badges'
import { STARTER_CHORES, STARTER_REWARDS } from '../lib/starter-catalog'

const prisma = new PrismaClient()

/**
 * Resolve which family to seed: the explicit CLI argument, else THE family
 * (HabitHero is single-family per install). Ambiguity is an error rather than a
 * guess — writing 40 rows into the wrong family is not something to shrug at.
 */
async function resolveFamilyId(argv: string[]): Promise<string> {
  const explicit = argv[2]?.trim()
  if (explicit) {
    const family = await prisma.family.findUnique({
      where: { id: explicit },
      select: { id: true },
    })
    if (!family) throw new Error(`ไม่พบครอบครัว id="${explicit}"`)
    return family.id
  }

  const families = await prisma.family.findMany({ select: { id: true, name: true } })
  if (families.length === 0) {
    throw new Error(
      'ยังไม่มีครอบครัวในระบบ — เปิดแอปแล้วสร้างบัญชีผู้ปกครองที่ /setup ก่อน',
    )
  }
  if (families.length > 1) {
    const list = families.map((f) => `  ${f.id}  ${f.name}`).join('\n')
    throw new Error(
      `พบหลายครอบครัว ระบุ id ที่ต้องการด้วย: npm run db:seed -- <familyId>\n${list}`,
    )
  }
  return families[0].id
}

async function main() {
  const familyId = await resolveFamilyId(process.argv)

  // --- Badges (global catalogue; also seeded by migrations) ---
  await seedBadges(prisma)

  // --- Chores — skip any title the family already has ---
  const existingChoreTitles = new Set(
    (
      await prisma.chore.findMany({ where: { familyId }, select: { title: true } })
    ).map((c) => c.title),
  )

  let choresAdded = 0
  for (const c of STARTER_CHORES) {
    if (existingChoreTitles.has(c.title)) continue
    await prisma.chore.create({
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
    choresAdded++
  }

  // --- Rewards — skip any title the family already has ---
  const existingRewardTitles = new Set(
    (
      await prisma.reward.findMany({ where: { familyId }, select: { title: true } })
    ).map((r) => r.title),
  )

  let rewardsAdded = 0
  for (const r of STARTER_REWARDS) {
    if (existingRewardTitles.has(r.title)) continue
    await prisma.reward.create({
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
    rewardsAdded++
  }

  const [badges, chores, rewards] = await Promise.all([
    prisma.badge.count(),
    prisma.chore.count({ where: { familyId } }),
    prisma.reward.count({ where: { familyId } }),
  ])

  console.log('[seed] done:', {
    familyId,
    choresAdded,
    choresSkipped: STARTER_CHORES.length - choresAdded,
    rewardsAdded,
    rewardsSkipped: STARTER_REWARDS.length - rewardsAdded,
    totals: { badges, chores, rewards },
  })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('[seed] failed:', e instanceof Error ? e.message : e)
    await prisma.$disconnect()
    process.exit(1)
  })
