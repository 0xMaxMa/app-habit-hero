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

export interface ChildOption {
  id: string
  name: string
  familyId: string
  /** Uploaded avatar as an inlined data URI, or null → illustrated fallback. */
  avatar: string | null
}

/**
 * Resolve `slug` to its Family and return ONLY that family's children who
 * have a PIN set — or `null` when the slug does not resolve to any family
 * (an invalid/typo'd code, or the DB being unavailable). There is no code
 * path here that can return a child without a resolved, matching familyId.
 */
export async function loadFamilyChildrenBySlug(slug: string): Promise<ChildOption[] | null> {
  try {
    const family = await prisma.family.findUnique({
      where: { pinSlug: slug },
      select: { id: true },
    })
    if (!family) return null

    const kids = await prisma.user.findMany({
      where: { role: 'child', familyId: family.id, pinHash: { not: null } },
      select: { id: true, name: true, familyId: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    })
    // The picker is a PUBLIC (pre-login) page, but /api/avatars is auth-gated —
    // a client <img> would 401. So inline each uploaded avatar as a data URI on
    // the server instead of opening the avatar route to unauthenticated users.
    return Promise.all(
      kids.map(async (k) => {
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
  } catch {
    // DB unavailable — the caller renders "not found" rather than a 500;
    // never fall back to an unscoped list.
    return null
  }
}
