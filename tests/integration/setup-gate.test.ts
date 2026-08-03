/**
 * tests/integration/setup-gate.test.ts — the "is this install bootstrapped?"
 * rule that decides where a first-time visitor lands.
 *
 * app/login/page.tsx redirects to /setup while `needsSetup()` is true, and
 * app/setup/page.tsx bounces back to /login once it is false. The two pages
 * only avoid an infinite ping-pong because they read the SAME condition and it
 * flips exactly once — when the first parent row appears. That is what these
 * tests pin down; they run against the real test Postgres rather than a mock,
 * because the rule is a claim about rows.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { needsSetup } from '@/lib/setup'
import { resetAndSeed, prisma } from './helpers/db'

beforeEach(async () => {
  await resetAndSeed()
})

describe('needsSetup', () => {
  it('is false on a seeded install that already has a parent', async () => {
    const parents = await prisma.user.count({ where: { role: 'parent' } })
    expect(parents).toBeGreaterThan(0)

    expect(await needsSetup()).toBe(false)
  })

  it('is true once every user is gone — a truly fresh install', async () => {
    await prisma.user.deleteMany({})

    expect(await needsSetup()).toBe(true)
  })

  it('stays true while only children exist, since no parent can sign in', async () => {
    await prisma.user.deleteMany({})
    const family = await prisma.family.create({ data: { name: 'ครอบครัวไร้ผู้ปกครอง' } })
    await prisma.user.create({
      data: { name: 'ลูก', role: 'child', familyId: family.id },
    })

    expect(await needsSetup()).toBe(true)
  })

  it('flips to false as soon as the first parent is created', async () => {
    await prisma.user.deleteMany({})
    expect(await needsSetup()).toBe(true)

    const family = await prisma.family.create({ data: { name: 'ครอบครัวใหม่' } })
    await prisma.user.create({
      data: { name: 'พ่อแม่', role: 'parent', familyId: family.id },
    })

    // The redirect flips with it: /login stops sending people to /setup, and
    // /setup starts sending them back to /login. Never both at once.
    expect(await needsSetup()).toBe(false)
  })
})
