/**
 * lib/model-fields.ts — the writable User/Chore/Reward columns, named once.
 *
 * Three places independently hand-type a subset of these columns: the import
 * tool's snapshot interfaces (lib/import-family.ts), onboarding's provisioning
 * + starter catalogue (lib/onboarding.ts, lib/starter-catalog.ts), and the
 * roster endpoints' create/update payloads (app/api/members/route.ts,
 * app/api/members/[id]/route.ts). Each one needs a different SUBSET — import
 * recreates full historical rows, onboarding creates fresh ones, the roster
 * PATCH only edits a couple of fields — so there is no single shape all four
 * can share directly. What they *can* share is where each column's name and
 * type comes from: `Pick<>` off the real Prisma model below, not a
 * hand-retyped copy. Rename or drop a column in schema.prisma and every sites'
 * `Pick<>` fails to compile instead of quietly drifting out of sync.
 *
 * Deliberately just type aliases, no runtime code: nobody here should get a
 * default value they didn't ask for (see lib/import-family.ts's header on why
 * silent defaults are actively wrong for an import).
 */

import type { User, Chore, Reward } from '@prisma/client'

/** Every User column a call site in this app ever sets directly. */
export type UserWritableFields = Pick<
  User,
  'name' | 'role' | 'channelUserRef' | 'avatarCharacter' | 'email' | 'passwordHash' | 'pinHash'
>

/** Every Chore column a call site in this app ever sets directly. */
export type ChoreWritableFields = Pick<
  Chore,
  | 'title'
  | 'description'
  | 'xpValue'
  | 'lateXpMultiplier'
  | 'recurrence'
  | 'category'
  | 'recurDays'
  | 'dueTime'
  | 'activeFrom'
  | 'activeUntil'
  | 'requirePhoto'
  | 'isExtra'
>

/** Every Reward column a call site in this app ever sets directly. */
export type RewardWritableFields = Pick<
  Reward,
  | 'title'
  | 'description'
  | 'xpCost'
  | 'iconEmoji'
  | 'dailyLimit'
  | 'weeklyLimit'
  | 'monthlyLimit'
  | 'isActive'
>
