/**
 * prisma/seed.dev.ts — local development fixture.
 *
 * Mirrors the canonical test family (E2E-TEST-STRATEGY §2.1) so `npm run dev`
 * has a realistic family to click through: one parent, two kids at different
 * levels/streaks, the standard chores and rewards. Uses dev-only credentials
 * (parent@dev.local / dev1234) and dev-scoped ids so it never collides with the
 * test fixture if they ever share a database.
 *
 * Idempotent: every row is written with a FIXED id via upsert, so re-running
 * converges to the same rows. The parent password is hashed with bcryptjs.
 *
 * Run: DATABASE_URL=... npx tsx prisma/seed.dev.ts
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { seedBadges } from './seed-badges'

const prisma = new PrismaClient()

const IDS = {
  family: 'fam_dev',
  parent: 'usr_dev_parent',
  childA: 'usr_dev_child_a',
  childB: 'usr_dev_child_b',
  choreDishes: 'chore_dev_dishes',
  choreToys: 'chore_dev_toys',
  choreCar: 'chore_dev_car',
  rewardGame: 'rew_dev_game',
  rewardSnack: 'rew_dev_snack',
  rewardJapan: 'rew_dev_japan',
} as const

async function main() {
  const now = new Date()

  // --- Curated badges (FK target for any UserBadge award) ---
  await seedBadges(prisma)

  // --- Family ---
  await prisma.family.upsert({
    where: { id: IDS.family },
    create: { id: IDS.family, name: 'ครอบครัวตัวอย่าง' },
    update: { name: 'ครอบครัวตัวอย่าง' },
  })

  // --- Parent: แม่ตัวอย่าง (parent@dev.local / dev1234) ---
  const passwordHash = await bcrypt.hash('dev1234', 10)
  await prisma.user.upsert({
    where: { id: IDS.parent },
    create: {
      id: IDS.parent,
      name: 'แม่ตัวอย่าง',
      role: 'parent',
      familyId: IDS.family,
      email: 'parent@dev.local',
      passwordHash,
      channelUserRef: 'gw:dev-parent-1',
      linkCode: 'DEVLINKMOM',
    },
    update: {
      name: 'แม่ตัวอย่าง',
      role: 'parent',
      familyId: IDS.family,
      email: 'parent@dev.local',
      passwordHash,
      channelUserRef: 'gw:dev-parent-1',
      linkCode: 'DEVLINKMOM',
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
      channelUserRef: 'gw:dev-child-a',
    },
    update: {
      name: 'น้องเอ',
      role: 'child',
      familyId: IDS.family,
      channelUserRef: 'gw:dev-child-a',
    },
  })
  await prisma.userProgress.upsert({
    where: { userId: IDS.childA },
    create: {
      userId: IDS.childA,
      totalXp: 150,
      currentLevel: 1,
      // A live 2-day streak: the flame now lapses on read when the last active
      // day is older than yesterday (lib/streak), so seeded state must carry one.
      currentStreak: 2,
      longestStreak: 2,
      lastActiveDate: now,
    },
    update: {
      totalXp: 150,
      currentLevel: 1,
      currentStreak: 2,
      longestStreak: 2,
      lastActiveDate: now,
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
      channelUserRef: 'gw:dev-child-b',
    },
    update: {
      name: 'น้องบี',
      role: 'child',
      familyId: IDS.family,
      channelUserRef: 'gw:dev-child-b',
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

  const [families, users, chores, rewards, progress] = await Promise.all([
    prisma.family.count(),
    prisma.user.count(),
    prisma.chore.count(),
    prisma.reward.count(),
    prisma.userProgress.count(),
  ])
  console.log('[seed.dev] done:', { families, users, chores, rewards, progress })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('[seed.dev] failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
