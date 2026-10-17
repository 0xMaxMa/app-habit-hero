/**
 * lib/import-family.ts — import one external family's data into this
 * multi-family database (Phase A item 5: build the tool now, run it later).
 *
 * DESIGN DECISION (documented in the PR): rather than hand-parsing a raw
 * `pg_dump` SQL file — fragile, since the exact statement shape depends on
 * pg_dump's flags (plain INSERT vs. COPY, column order, quoting) — this
 * script reads the source family through a second PrismaClient connection
 * (`exportFamilySnapshot`, pointed at `SOURCE_DATABASE_URL`). In practice that
 * means the owner restores the other deployment's dump into a scratch
 * Postgres first (`psql ... < dump.sql`), a completely standard step, and
 * this script treats that restored database the same way the rest of the
 * app treats any Postgres: through Prisma, with the SAME schema. The dump's
 * *content* is still "parsed", just via Postgres + Prisma's type-checked
 * client rather than a bespoke text parser — the correctness-critical half
 * of this tool (ID remapping, collision detection, referential integrity) is
 * then fully unit/integration-testable against a synthetic in-memory
 * `FamilySnapshot`, independent of whatever dump format produced it.
 *
 * ID COLLISION STRATEGY: every row is re-created with `id` OMITTED, so
 * Prisma's `@default(cuid())` mints a guaranteed-fresh id — the exact
 * mechanism every other write path in this app already relies on. A
 * `sourceId → newId` map is built as rows are created (family → users →
 * chores/rewards → completions/redemptions/adjustments/badges, in FK-
 * dependency order) and used to remap every foreign key on the way in. The
 * source family's OWN id, pinSlug, and any one-time linkCode are never
 * reused — pinSlug in particular is regenerated fresh (see lib/pin-slug.ts).
 *
 * GLOBAL-UNIQUE COLLISIONS: `User.email` / `channelUserRef` are unique
 * ACROSS THE WHOLE DATABASE, not per-family (by design — a real email or chat
 * identity belongs to one person regardless of how many families exist). A
 * literal content collision here (e.g. two independently-run installs that
 * happen to share a parent's email) cannot be resolved automatically without
 * either silently overwriting someone's login or silently dropping their
 * channel binding — both are worse than stopping. `checkImportCollisions`
 * scans for this BEFORE any write, and `importFamily` refuses outright if it
 * finds one, rather than guessing.
 *
 * NOT carried over from the source: `avatarUrl` (it names a file on the
 * SOURCE deployment's photo volume, which does not exist on this one — avatar
 * falls back to the illustrated character) and `linkCode` (a one-time code;
 * the parent can mint a fresh one post-import via POST /api/link-code).
 * `Badge` rows are the global curated catalog (schema.prisma's comment: not
 * family-scoped by design) — matched by the catalog's stable id (the slug
 * prisma/seed-badges.ts upserts by, identical on every deployment) against
 * the target's existing catalog rather than re-created, so UserBadge can
 * point at the catalog this deployment already seeded. `.name` is NOT used
 * for the match — it has no @unique constraint, so it cannot be trusted to
 * resolve to one row.
 */

import type { PrismaClient, CompletionStatus, RedemptionStatus } from '@prisma/client'
import { createFamilyWithPinSlug } from './pin-slug'
import { isUniqueViolation } from './api/tx'
import type { UserWritableFields, ChoreWritableFields, RewardWritableFields } from './model-fields'

// ---------------------------------------------------------------------------
// Snapshot shape — what exportFamilySnapshot reads and importFamily writes.
// ---------------------------------------------------------------------------

export interface FamilySnapshot {
  family: { name: string }
  users: UserSnapshot[]
  userProgress: UserProgressSnapshot[]
  chores: ChoreSnapshot[]
  rewards: RewardSnapshot[]
  choreCompletions: ChoreCompletionSnapshot[]
  rewardRedemptions: RewardRedemptionSnapshot[]
  pointAdjustments: PointAdjustmentSnapshot[]
  userBadges: UserBadgeSnapshot[]
}

export interface UserSnapshot extends UserWritableFields {
  sourceId: string
}

export interface UserProgressSnapshot {
  userSourceId: string
  totalXp: number
  currentLevel: number
  currentStreak: number
  longestStreak: number
  lastActiveDate: Date | null
}

export interface ChoreSnapshot extends ChoreWritableFields {
  sourceId: string
  assignedToSourceId: string | null
}

export interface RewardSnapshot extends RewardWritableFields {
  sourceId: string
}

export interface ChoreCompletionSnapshot {
  choreSourceId: string
  completedBySourceId: string
  photoUrl: string | null
  submittedAt: Date
  status: CompletionStatus
  reviewedBySourceId: string | null
  reviewedAt: Date | null
  xpAwarded: number
  feedback: string | null
  isTeam: boolean
  teamMemberSourceIds: string[]
}

export interface RewardRedemptionSnapshot {
  rewardSourceId: string
  redeemedBySourceId: string
  xpSpent: number
  requestedAt: Date
  status: RedemptionStatus
  reviewedAt: Date | null
}

export interface PointAdjustmentSnapshot {
  userSourceId: string
  xpDelta: number
  reason: string
  xpApplied: number
  createdBySourceId: string | null
  cancelledAt: Date | null
  cancelledBySourceId: string | null
  createdAt: Date
}

export interface UserBadgeSnapshot {
  userSourceId: string
  /**
   * Badge.id, not .name — the curated catalog (prisma/seed-badges.ts) keys
   * every row by a stable hand-picked slug applied identically by every
   * deployment's migrations, whereas .name has no @unique constraint and a
   * name-based lookup would be ambiguous (and silently wrong) the day two
   * catalog rows ever share a name.
   */
  badgeId: string
  earnedAt: Date
  seenAt: Date | null
}

// ---------------------------------------------------------------------------
// Export — read a FamilySnapshot off ANY PrismaClient (the real source,
// or a synthetic fixture in a test).
// ---------------------------------------------------------------------------

/**
 * Resolve which family to export: the explicit id, else THE family if the
 * source has exactly one (mirrors prisma/seed.ts's resolveFamilyId — a dump
 * restored from a single-family deployment has exactly one row here).
 */
export async function resolveSourceFamilyId(
  db: PrismaClient,
  explicitId?: string,
): Promise<string> {
  if (explicitId) {
    const family = await db.family.findUnique({ where: { id: explicitId } })
    if (!family) throw new Error(`Source has no family with id="${explicitId}"`)
    return family.id
  }
  const families = await db.family.findMany({ select: { id: true, name: true } })
  if (families.length === 0) throw new Error('Source database has no family to export')
  if (families.length > 1) {
    const list = families.map((f) => `  ${f.id}  ${f.name}`).join('\n')
    throw new Error(`Source has multiple families — pass one explicitly:\n${list}`)
  }
  return families[0].id
}

export async function exportFamilySnapshot(
  db: PrismaClient,
  familyId: string,
): Promise<FamilySnapshot> {
  // chores/rewards only depend on familyId (already in hand), not on the
  // users lookup below — run them in the same batch instead of waiting.
  const [family, users, chores, rewards] = await Promise.all([
    db.family.findUniqueOrThrow({ where: { id: familyId } }),
    db.user.findMany({ where: { familyId } }),
    db.chore.findMany({ where: { familyId } }),
    db.reward.findMany({ where: { familyId } }),
  ])
  const userIds = users.map((u) => u.id)
  const choreIds = chores.map((c) => c.id)
  const rewardIds = rewards.map((r) => r.id)

  const [progress, completions, redemptions, adjustments, userBadges] = await Promise.all([
    db.userProgress.findMany({ where: { userId: { in: userIds } } }),
    db.choreCompletion.findMany({ where: { choreId: { in: choreIds } } }),
    db.rewardRedemption.findMany({ where: { rewardId: { in: rewardIds } } }),
    db.pointAdjustment.findMany({ where: { userId: { in: userIds } } }),
    db.userBadge.findMany({ where: { userId: { in: userIds } } }),
  ])

  return {
    family: { name: family.name },
    users: users.map((u) => ({
      sourceId: u.id,
      name: u.name,
      role: u.role,
      channelUserRef: u.channelUserRef,
      avatarCharacter: u.avatarCharacter,
      email: u.email,
      passwordHash: u.passwordHash,
      pinHash: u.pinHash,
    })),
    userProgress: progress.map((p) => ({
      userSourceId: p.userId,
      totalXp: p.totalXp,
      currentLevel: p.currentLevel,
      currentStreak: p.currentStreak,
      longestStreak: p.longestStreak,
      lastActiveDate: p.lastActiveDate,
    })),
    chores: chores.map((c) => ({
      sourceId: c.id,
      title: c.title,
      description: c.description,
      assignedToSourceId: c.assignedTo,
      xpValue: c.xpValue,
      lateXpMultiplier: c.lateXpMultiplier,
      recurrence: c.recurrence,
      category: c.category,
      recurDays: c.recurDays,
      dueTime: c.dueTime,
      activeFrom: c.activeFrom,
      activeUntil: c.activeUntil,
      requirePhoto: c.requirePhoto,
      isExtra: c.isExtra,
    })),
    rewards: rewards.map((r) => ({
      sourceId: r.id,
      title: r.title,
      description: r.description,
      xpCost: r.xpCost,
      iconEmoji: r.iconEmoji,
      dailyLimit: r.dailyLimit,
      weeklyLimit: r.weeklyLimit,
      monthlyLimit: r.monthlyLimit,
      isActive: r.isActive,
    })),
    choreCompletions: completions.map((c) => ({
      choreSourceId: c.choreId,
      completedBySourceId: c.completedBy,
      photoUrl: c.photoUrl,
      submittedAt: c.submittedAt,
      status: c.status,
      reviewedBySourceId: c.reviewedBy,
      reviewedAt: c.reviewedAt,
      xpAwarded: c.xpAwarded,
      feedback: c.feedback,
      isTeam: c.isTeam,
      teamMemberSourceIds: c.teamMembers,
    })),
    rewardRedemptions: redemptions.map((r) => ({
      rewardSourceId: r.rewardId,
      redeemedBySourceId: r.redeemedBy,
      xpSpent: r.xpSpent,
      requestedAt: r.requestedAt,
      status: r.status,
      reviewedAt: r.reviewedAt,
    })),
    pointAdjustments: adjustments.map((a) => ({
      userSourceId: a.userId,
      xpDelta: a.xpDelta,
      reason: a.reason,
      xpApplied: a.xpApplied,
      createdBySourceId: a.createdBy,
      cancelledAt: a.cancelledAt,
      cancelledBySourceId: a.cancelledBy,
      createdAt: a.createdAt,
    })),
    userBadges: userBadges.map((ub) => ({
      userSourceId: ub.userId,
      badgeId: ub.badgeId,
      earnedAt: ub.earnedAt,
      seenAt: ub.seenAt,
    })),
  }
}

// ---------------------------------------------------------------------------
// Collision check — global-unique fields that a blind re-create would clash
// on. Run BEFORE importFamily opens its transaction.
// ---------------------------------------------------------------------------

export interface CollisionReport {
  emails: string[]
  channelUserRefs: string[]
}

export function hasCollisions(report: CollisionReport): boolean {
  return report.emails.length > 0 || report.channelUserRefs.length > 0
}

export async function checkImportCollisions(
  targetDb: PrismaClient,
  snapshot: FamilySnapshot,
): Promise<CollisionReport> {
  const emails = snapshot.users.map((u) => u.email).filter((e): e is string => e !== null)
  const refs = snapshot.users
    .map((u) => u.channelUserRef)
    .filter((r): r is string => r !== null)

  const [emailClashes, refClashes] = await Promise.all([
    emails.length > 0
      ? targetDb.user.findMany({ where: { email: { in: emails } }, select: { email: true } })
      : Promise.resolve([]),
    refs.length > 0
      ? targetDb.user.findMany({
          where: { channelUserRef: { in: refs } },
          select: { channelUserRef: true },
        })
      : Promise.resolve([]),
  ])

  return {
    emails: emailClashes.map((u) => u.email as string),
    channelUserRefs: refClashes.map((u) => u.channelUserRef as string),
  }
}

// ---------------------------------------------------------------------------
// Import — write the snapshot into targetDb under a FRESH familyId, with
// every id remapped. Refuses if checkImportCollisions finds anything.
// ---------------------------------------------------------------------------

export interface ImportResult {
  familyId: string
  pinSlug: string
  counts: {
    users: number
    chores: number
    rewards: number
    choreCompletions: number
    rewardRedemptions: number
    pointAdjustments: number
    userBadges: number
  }
}

export async function importFamily(
  targetDb: PrismaClient,
  snapshot: FamilySnapshot,
): Promise<ImportResult> {
  const collisions = await checkImportCollisions(targetDb, snapshot)
  if (hasCollisions(collisions)) {
    throw new Error(
      'Import refused — these values already exist in the target database and ' +
        'importing would either overwrite a login or steal a channel binding:\n' +
        (collisions.emails.length > 0 ? `  emails: ${collisions.emails.join(', ')}\n` : '') +
        (collisions.channelUserRefs.length > 0
          ? `  channelUserRefs: ${collisions.channelUserRefs.join(', ')}\n`
          : ''),
    )
  }

  // Wrapped in a retry loop, re-running the WHOLE transaction on a pinSlug
  // collision: `checkImportCollisions` above already proves every OTHER
  // unique field (email, channelUserRef) is clash-free, so any P2002 raised
  // inside this transaction can only be the pinSlug — and Postgres aborts the
  // whole transaction on that first error, so a retry must open a fresh one
  // (see createFamilyWithPinSlug, lib/pin-slug.ts) rather than reuse `tx`.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await targetDb.$transaction(async (tx) => {
        const family = await createFamilyWithPinSlug(tx, snapshot.family.name)

        // --- Users (no FK dependencies among themselves) ---
        const userIdMap = new Map<string, string>()
        for (const u of snapshot.users) {
          const created = await tx.user.create({
            data: {
              name: u.name,
              role: u.role,
              familyId: family.id,
              channelUserRef: u.channelUserRef,
              avatarCharacter: u.avatarCharacter,
              email: u.email,
              passwordHash: u.passwordHash,
              pinHash: u.pinHash,
              // avatarUrl / linkCode deliberately not carried over — see header.
            },
          })
          userIdMap.set(u.sourceId, created.id)
        }
        const mapUser = (sourceId: string) => requireMapped(userIdMap, sourceId, 'user')
        const mapUserOrNull = (sourceId: string | null) =>
          sourceId === null ? null : mapUser(sourceId)

        // --- UserProgress ---
        for (const p of snapshot.userProgress) {
          await tx.userProgress.create({
            data: {
              userId: mapUser(p.userSourceId),
              totalXp: p.totalXp,
              currentLevel: p.currentLevel,
              currentStreak: p.currentStreak,
              longestStreak: p.longestStreak,
              lastActiveDate: p.lastActiveDate,
            },
          })
        }

        // --- Chores (assignedTo → user, nullable) ---
        const choreIdMap = new Map<string, string>()
        for (const c of snapshot.chores) {
          const created = await tx.chore.create({
            data: {
              title: c.title,
              description: c.description,
              familyId: family.id,
              assignedTo: mapUserOrNull(c.assignedToSourceId),
              xpValue: c.xpValue,
              lateXpMultiplier: c.lateXpMultiplier,
              recurrence: c.recurrence,
              category: c.category,
              recurDays: c.recurDays,
              dueTime: c.dueTime,
              activeFrom: c.activeFrom,
              activeUntil: c.activeUntil,
              requirePhoto: c.requirePhoto,
              isExtra: c.isExtra,
            },
          })
          choreIdMap.set(c.sourceId, created.id)
        }
        const mapChore = (sourceId: string) => requireMapped(choreIdMap, sourceId, 'chore')

        // --- Rewards ---
        const rewardIdMap = new Map<string, string>()
        for (const r of snapshot.rewards) {
          const created = await tx.reward.create({
            data: {
              title: r.title,
              description: r.description,
              familyId: family.id,
              xpCost: r.xpCost,
              iconEmoji: r.iconEmoji,
              dailyLimit: r.dailyLimit,
              weeklyLimit: r.weeklyLimit,
              monthlyLimit: r.monthlyLimit,
              isActive: r.isActive,
            },
          })
          rewardIdMap.set(r.sourceId, created.id)
        }
        const mapReward = (sourceId: string) => requireMapped(rewardIdMap, sourceId, 'reward')

        // --- ChoreCompletions (chore, completedBy, reviewedBy, teamMembers) ---
        for (const c of snapshot.choreCompletions) {
          await tx.choreCompletion.create({
            data: {
              choreId: mapChore(c.choreSourceId),
              completedBy: mapUser(c.completedBySourceId),
              // The photo itself lives on the SOURCE deployment's volume and was
              // never transferred — keep the historical URL as a record, even
              // though GET /api/photos will 404 on it until/unless the owner also
              // copies the underlying files. Re-uploading history is out of scope.
              photoUrl: c.photoUrl,
              submittedAt: c.submittedAt,
              status: c.status,
              reviewedBy: mapUserOrNull(c.reviewedBySourceId),
              reviewedAt: c.reviewedAt,
              xpAwarded: c.xpAwarded,
              feedback: c.feedback,
              isTeam: c.isTeam,
              teamMembers: c.teamMemberSourceIds.map(mapUser),
            },
          })
        }

        // --- RewardRedemptions ---
        for (const r of snapshot.rewardRedemptions) {
          await tx.rewardRedemption.create({
            data: {
              rewardId: mapReward(r.rewardSourceId),
              redeemedBy: mapUser(r.redeemedBySourceId),
              xpSpent: r.xpSpent,
              requestedAt: r.requestedAt,
              status: r.status,
              reviewedAt: r.reviewedAt,
            },
          })
        }

        // --- PointAdjustments ---
        for (const a of snapshot.pointAdjustments) {
          await tx.pointAdjustment.create({
            data: {
              userId: mapUser(a.userSourceId),
              xpDelta: a.xpDelta,
              reason: a.reason,
              xpApplied: a.xpApplied,
              createdBy: mapUserOrNull(a.createdBySourceId),
              cancelledAt: a.cancelledAt,
              cancelledBy: mapUserOrNull(a.cancelledBySourceId),
              createdAt: a.createdAt,
            },
          })
        }

        // --- UserBadges (Badge is the global catalog — matched by id, never
        // created here; prisma/seed-badges.ts is what owns that table).
        // Resolved in one query up front rather than once per badge, since
        // the whole point is to check against a small, rarely-changing table.
        const wantedBadgeIds = Array.from(new Set(snapshot.userBadges.map((ub) => ub.badgeId)))
        const existingBadgeIds = new Set(
          wantedBadgeIds.length > 0
            ? (
                await tx.badge.findMany({
                  where: { id: { in: wantedBadgeIds } },
                  select: { id: true },
                })
              ).map((b) => b.id)
            : [],
        )
        let userBadgesCreated = 0
        for (const ub of snapshot.userBadges) {
          if (!existingBadgeIds.has(ub.badgeId)) continue // catalog entry doesn't exist on this deployment — skip, don't invent one
          await tx.userBadge.create({
            data: {
              userId: mapUser(ub.userSourceId),
              badgeId: ub.badgeId,
              earnedAt: ub.earnedAt,
              seenAt: ub.seenAt,
            },
          })
          userBadgesCreated++
        }

        return {
          familyId: family.id,
          pinSlug: family.pinSlug,
          counts: {
            users: snapshot.users.length,
            chores: snapshot.chores.length,
            rewards: snapshot.rewards.length,
            choreCompletions: snapshot.choreCompletions.length,
            rewardRedemptions: snapshot.rewardRedemptions.length,
            pointAdjustments: snapshot.pointAdjustments.length,
            userBadges: userBadgesCreated,
          },
        }
      })
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      if (attempt < 4) continue
      // Last attempt's pinSlug collision — fall through to the message below
      // instead of rethrowing the raw Prisma error.
    }
  }
  throw new Error('Could not generate a unique pin slug after 5 attempts, please retry')
}

function requireMapped(map: Map<string, string>, sourceId: string, kind: string): string {
  const mapped = map.get(sourceId)
  if (!mapped) {
    throw new Error(
      `Referential integrity error: ${kind} sourceId="${sourceId}" was referenced but never exported`,
    )
  }
  return mapped
}
