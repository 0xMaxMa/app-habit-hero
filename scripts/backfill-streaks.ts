/**
 * scripts/backfill-streaks.ts — one-time recompute of every child's streak.
 *
 * The streak used to only advance when a child finished 100% of their chores in
 * a day, which no real family ever hit, so every stored row is sitting at 0 with
 * no lastActiveDate. The rule is now "a day counts once at least one chore was
 * approved on it" (lib/streak), and rows are re-derived on each approval — but
 * a child who is simply waiting for their next approval would keep showing the
 * stale 0 until then. This walks every child once and writes the real number.
 *
 * Safe by default: prints what it would change and writes NOTHING. Pass --apply
 * to persist. `longestStreak` is a high-water mark and is never lowered.
 *
 *   npx tsx scripts/backfill-streaks.ts            # dry run
 *   npx tsx scripts/backfill-streaks.ts --apply    # write
 */

import { prisma } from '@/lib/db'
import { systemClock } from '@/lib/clock'
import { deriveStreak } from '@/lib/api/gamification'

async function main() {
  const apply = process.argv.includes('--apply')

  const children = await prisma.user.findMany({
    where: { role: 'child' },
    include: { progress: true },
    orderBy: { name: 'asc' },
  })

  console.log(`[backfill-streaks] ${apply ? 'APPLY' : 'DRY RUN'} — ${children.length} children\n`)

  let changed = 0
  for (const child of children) {
    const before = {
      current: child.progress?.currentStreak ?? 0,
      longest: child.progress?.longestStreak ?? 0,
    }
    const derived = await deriveStreak(child.id, systemClock)
    const after = {
      current: derived.current,
      longest: Math.max(before.longest, derived.longest),
    }

    const moved = after.current !== before.current || after.longest !== before.longest
    if (moved) changed++

    console.log(
      `${moved ? '~' : ' '} ${child.name.padEnd(12)} ` +
        `current ${before.current} → ${after.current}   ` +
        `longest ${before.longest} → ${after.longest}   ` +
        `last active ${derived.lastActiveDate?.toISOString() ?? '—'}`,
    )

    if (apply) {
      await prisma.userProgress.upsert({
        where: { userId: child.id },
        create: {
          userId: child.id,
          totalXp: child.progress?.totalXp ?? 0,
          currentLevel: child.progress?.currentLevel ?? 1,
          currentStreak: after.current,
          longestStreak: after.longest,
          lastActiveDate: derived.lastActiveDate,
        },
        update: {
          currentStreak: after.current,
          longestStreak: after.longest,
          lastActiveDate: derived.lastActiveDate,
        },
      })
    }
  }

  console.log(
    `\n[backfill-streaks] ${changed} of ${children.length} would change` +
      `${apply ? ' — written' : ' — nothing written (pass --apply)'}`,
  )
  // XP, levels, badges and completions are never touched by this script.
}

main()
  .catch((err) => {
    console.error('[backfill-streaks] failed:', err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
