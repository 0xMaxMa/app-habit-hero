/**
 * prisma/seed.test.ts — deterministic test fixture (E2E-TEST-STRATEGY §2.1).
 *
 * Seeds the canonical "ครอบครัวเทสต์" used by every test layer (unit fixtures,
 * API integration against real Postgres, agent E2E side-effect assertions).
 *
 * Idempotent: every row is written with a FIXED id via upsert, so re-running
 * converges to the same rows (no duplicates, stable ids the tests can hard-code).
 * The parent password is hashed with bcryptjs.
 *
 * Run: DATABASE_URL=... npx tsx prisma/seed.test.ts
 */

import { PrismaClient } from '@prisma/client'
import { pathToFileURL } from 'node:url'
import bcrypt from 'bcryptjs'
import { seedBadges } from './seed-badges'

// Both children share the test PIN "1234" (bcrypt-hashed). The /pin picker only
// lists children with a non-null pinHash and only shows the name-picker when >1
// child has one — W-AUTH-3 relies on both being set.
export const CHILD_TEST_PIN = '1234'
const CHILD_PIN_HASH = bcrypt.hashSync(CHILD_TEST_PIN, 10)

// Stable ids — the tests reference these directly and re-seeding must not churn them.
export const IDS = {
  family: 'fam_test',
  parent: 'usr_test_parent',
  childA: 'usr_test_child_a',
  childB: 'usr_test_child_b',
  choreDishes: 'chore_test_dishes',
  choreToys: 'chore_test_toys',
  choreCar: 'chore_test_car',
  rewardGame: 'rew_test_game',
  rewardSnack: 'rew_test_snack',
  rewardJapan: 'rew_test_japan',
} as const

/**
 * Apply the canonical test fixture using the given Prisma client.
 *
 * Idempotent (every row upserted by fixed id). Callable from the integration
 * test harness (which passes the shared `lib/db` client after truncating) as
 * well as from the standalone CLI entrypoint below.
 */
export async function seedTestData(prisma: PrismaClient) {
  // --- Curated badges (FK target for any UserBadge award) ---
  await seedBadges(prisma)

  // --- Family: "ครอบครัวเทสต์" ---
  await prisma.family.upsert({
    where: { id: IDS.family },
    create: { id: IDS.family, name: 'ครอบครัวเทสต์' },
    update: { name: 'ครอบครัวเทสต์' },
  })

  // --- Parent: แม่ทดสอบ (parent@test.local / test1234) ---
  const passwordHash = await bcrypt.hash('test1234', 10)
  await prisma.user.upsert({
    where: { id: IDS.parent },
    create: {
      id: IDS.parent,
      name: 'แม่ทดสอบ',
      role: 'parent',
      familyId: IDS.family,
      email: 'parent@test.local',
      passwordHash,
      channelUserRef: 'gw:parent-1',
      linkCode: 'LINKMOM',
    },
    update: {
      name: 'แม่ทดสอบ',
      role: 'parent',
      familyId: IDS.family,
      email: 'parent@test.local',
      passwordHash,
      channelUserRef: 'gw:parent-1',
      linkCode: 'LINKMOM',
    },
  })

  // --- Child: น้องเอ (level 1, 150 XP, streak 2) ---
  await prisma.user.upsert({
    where: { id: IDS.childA },
    create: {
      id: IDS.childA,
      name: 'น้องเอ',
      role: 'child',
      familyId: IDS.family,
      channelUserRef: 'gw:child-a',
      pinHash: CHILD_PIN_HASH,
    },
    update: {
      name: 'น้องเอ',
      role: 'child',
      familyId: IDS.family,
      channelUserRef: 'gw:child-a',
      pinHash: CHILD_PIN_HASH,
    },
  })
  await prisma.userProgress.upsert({
    where: { userId: IDS.childA },
    create: {
      userId: IDS.childA,
      totalXp: 150,
      currentLevel: 1,
      currentStreak: 2,
      longestStreak: 2,
    },
    update: {
      totalXp: 150,
      currentLevel: 1,
      currentStreak: 2,
      longestStreak: 2,
    },
  })

  // --- Child: น้องบี (level 3, 600 XP, streak 0) ---
  await prisma.user.upsert({
    where: { id: IDS.childB },
    create: {
      id: IDS.childB,
      name: 'น้องบี',
      role: 'child',
      familyId: IDS.family,
      channelUserRef: 'gw:child-b',
      pinHash: CHILD_PIN_HASH,
    },
    update: {
      name: 'น้องบี',
      role: 'child',
      familyId: IDS.family,
      channelUserRef: 'gw:child-b',
      pinHash: CHILD_PIN_HASH,
    },
  })
  await prisma.userProgress.upsert({
    where: { userId: IDS.childB },
    create: {
      userId: IDS.childB,
      totalXp: 600,
      currentLevel: 3,
      currentStreak: 0,
      longestStreak: 5,
    },
    update: {
      totalXp: 600,
      currentLevel: 3,
      currentStreak: 0,
      longestStreak: 5,
    },
  })

  // --- Chores ---
  // ล้างจาน — 50 XP, daily, due 20:00, assigned to น้องเอ
  await prisma.chore.upsert({
    where: { id: IDS.choreDishes },
    create: {
      id: IDS.choreDishes,
      title: 'ล้างจาน',
      familyId: IDS.family,
      assignedTo: IDS.childA,
      xpValue: 50,
      recurrence: 'daily',
      dueTime: '20:00',
      requirePhoto: true,
      isExtra: false,
    },
    update: {
      title: 'ล้างจาน',
      familyId: IDS.family,
      assignedTo: IDS.childA,
      xpValue: 50,
      recurrence: 'daily',
      dueTime: '20:00',
      requirePhoto: true,
      isExtra: false,
    },
  })
  // เก็บของเล่น — 30 XP, daily, due 20:00, shared (any child)
  await prisma.chore.upsert({
    where: { id: IDS.choreToys },
    create: {
      id: IDS.choreToys,
      title: 'เก็บของเล่น',
      familyId: IDS.family,
      assignedTo: null,
      xpValue: 30,
      recurrence: 'daily',
      dueTime: '20:00',
      requirePhoto: true,
      isExtra: false,
    },
    update: {
      title: 'เก็บของเล่น',
      familyId: IDS.family,
      assignedTo: null,
      xpValue: 30,
      recurrence: 'daily',
      dueTime: '20:00',
      requirePhoto: true,
      isExtra: false,
    },
  })
  // ล้างรถ — 100 XP, extra chore (one-off)
  await prisma.chore.upsert({
    where: { id: IDS.choreCar },
    create: {
      id: IDS.choreCar,
      title: 'ล้างรถ',
      familyId: IDS.family,
      assignedTo: null,
      xpValue: 100,
      recurrence: 'once',
      requirePhoto: true,
      isExtra: true,
    },
    update: {
      title: 'ล้างรถ',
      familyId: IDS.family,
      assignedTo: null,
      xpValue: 100,
      recurrence: 'once',
      requirePhoto: true,
      isExtra: true,
    },
  })

  // --- Rewards ---
  // เล่นเกม 1 ชม. — 100 XP
  await prisma.reward.upsert({
    where: { id: IDS.rewardGame },
    create: {
      id: IDS.rewardGame,
      title: 'เล่นเกม 1 ชม.',
      familyId: IDS.family,
      xpCost: 100,
      iconEmoji: '🎮',
      isActive: true,
    },
    update: {
      title: 'เล่นเกม 1 ชม.',
      familyId: IDS.family,
      xpCost: 100,
      iconEmoji: '🎮',
      isActive: true,
    },
  })
  // ค่าขนม 20 บาท — 50 XP
  await prisma.reward.upsert({
    where: { id: IDS.rewardSnack },
    create: {
      id: IDS.rewardSnack,
      title: 'ค่าขนม 20 บาท',
      familyId: IDS.family,
      xpCost: 50,
      iconEmoji: '🍬',
      isActive: true,
    },
    update: {
      title: 'ค่าขนม 20 บาท',
      familyId: IDS.family,
      xpCost: 50,
      iconEmoji: '🍬',
      isActive: true,
    },
  })
  // ตั๋วเครื่องบินญี่ปุ่น — 50,000 XP
  await prisma.reward.upsert({
    where: { id: IDS.rewardJapan },
    create: {
      id: IDS.rewardJapan,
      title: 'ตั๋วเครื่องบินญี่ปุ่น',
      familyId: IDS.family,
      xpCost: 50000,
      iconEmoji: '✈️',
      isActive: true,
    },
    update: {
      title: 'ตั๋วเครื่องบินญี่ปุ่น',
      familyId: IDS.family,
      xpCost: 50000,
      iconEmoji: '✈️',
      isActive: true,
    },
  })

  // --- Summary ---
  const [families, users, chores, rewards, progress] = await Promise.all([
    prisma.family.count(),
    prisma.user.count(),
    prisma.chore.count(),
    prisma.reward.count(),
    prisma.userProgress.count(),
  ])
  console.log('[seed.test] done:', { families, users, chores, rewards, progress })
}

// CLI entrypoint — only when run directly (`tsx prisma/seed.test.ts`), not on import.
function isMain(): boolean {
  const entry = process.argv[1]
  return !!entry && import.meta.url === pathToFileURL(entry).href
}

if (isMain()) {
  const prisma = new PrismaClient()
  seedTestData(prisma)
    .then(async () => {
      await prisma.$disconnect()
    })
    .catch(async (e) => {
      console.error('[seed.test] failed:', e)
      await prisma.$disconnect()
      process.exit(1)
    })
}
