/**
 * lib/pin-picker.ts — resolve the child PIN picker list for ONE family.
 *
 * Factored out of app/pin/[slug]/page.tsx so the family-scoping logic itself
 * (the actual fix for the old cross-family leak — see that file's header) is
 * directly unit/integration-testable without rendering a Next.js server
 * component, mirroring how lib/onboarding.ts separates provisionOnboarding
 * from its route.
 */
import path from 'node:path'
import { prisma } from '@/lib/db'
import { readPhoto } from '@/lib/api'
import type { SessionUser } from '@/lib/auth'

export interface ChildOption {
  id: string
  name: string
  familyId: string
  /** Uploaded avatar as an inlined data URI, or null → illustrated fallback. */
  avatar: string | null
}

/**
 * Return the `pinSlug` of the family with id `familyId`, or `null` when that
 * family no longer exists. Callers must pass a server-verified id (e.g. the
 * session's `familyId`), never a client-supplied one.
 */
export async function getFamilyPinSlug(familyId: string): Promise<string | null> {
  const family = await prisma.family.findUnique({
    where: { id: familyId },
    select: { pinSlug: true },
  })
  return family?.pinSlug ?? null
}

/**
 * The gate for app/pin/page.tsx's server-side auto-redirect: only a
 * `role: 'parent'` session skips the code-entry form, and only to that
 * session's OWN family. `user` must be the server-verified session (never a
 * client-supplied familyId) — a `null` user or a `child` session (which gets
 * the existing localStorage/code-entry flow instead) both resolve to `null`.
 */
export async function resolveParentPinRedirect(user: SessionUser | null): Promise<string | null> {
  if (user?.role !== 'parent') return null
  return getFamilyPinSlug(user.familyId)
}

/**
 * Resolve `slug` to its Family and return ONLY that family's children who
 * have a PIN set — or `null` when the slug itself does not resolve to any
 * family (an invalid/typo'd code). A transient failure (DB unreachable, pool
 * exhausted) is NOT treated as "not found" — it propagates so the caller's
 * error boundary handles it, rather than looking identical to a bad slug and
 * having the caller (app/pin/[slug]/page.tsx's `ForgetSlug`) wipe a perfectly
 * valid bookmarked slug over what may just be a blip.
 */
export async function loadFamilyChildrenBySlug(slug: string): Promise<ChildOption[] | null> {
  const family = await prisma.family.findUnique({
    where: { pinSlug: slug },
    select: {
      id: true,
      members: {
        where: { role: 'child', pinHash: { not: null } },
        select: { id: true, name: true, familyId: true, avatarUrl: true },
        orderBy: { name: 'asc' },
      },
    },
  })
  if (!family) return null

  // The picker is a PUBLIC (pre-login) page, but /api/avatars is auth-gated —
  // a client <img> would 401. So inline each uploaded avatar as a data URI on
  // the server instead of opening the avatar route to unauthenticated users.
  return Promise.all(
    family.members.map(async (k) => {
      let avatar: string | null = null
      if (k.avatarUrl) {
        try {
          const { data, contentType } = await readPhoto(path.basename(k.avatarUrl))
          avatar = `data:${contentType};base64,${data.toString('base64')}`
        } catch {
          avatar = null // file missing → fall back to the illustrated face
        }
      }
      return { id: k.id, name: k.name, familyId: k.familyId, avatar }
    }),
  )
}
