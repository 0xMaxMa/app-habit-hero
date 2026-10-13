/**
 * lib/pin-picker.test.ts — loadFamilyChildrenBySlug's null/throw contract.
 *
 * `null` must mean ONLY "this slug does not resolve to any family" — the
 * caller (app/pin/[slug]/page.tsx) treats null as "show the not-found page
 * AND forget this device's bookmarked slug" (ForgetSlug). A transient DB
 * error used to be swallowed into the same null, which wiped a perfectly
 * valid bookmark over what might just be a blip. It must now propagate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  prisma: { family: { findUnique: vi.fn() } },
}))

import { prisma } from '@/lib/db'
import { loadFamilyChildrenBySlug } from './pin-picker'

const findUnique = prisma.family.findUnique as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadFamilyChildrenBySlug', () => {
  it('returns null when the slug does not resolve to any family', async () => {
    findUnique.mockResolvedValue(null)

    expect(await loadFamilyChildrenBySlug('no-such-slug')).toBeNull()
  })

  it('resolves this family\'s children in a single query via the members relation', async () => {
    findUnique.mockResolvedValue({
      id: 'fam1',
      members: [{ id: 'c1', name: 'เด็ก', familyId: 'fam1', avatarUrl: null }],
    })

    const kids = await loadFamilyChildrenBySlug('abc1234567')

    expect(kids).toEqual([{ id: 'c1', name: 'เด็ก', familyId: 'fam1', avatar: null }])
    expect(findUnique).toHaveBeenCalledTimes(1) // one round trip, not two
    expect(findUnique).toHaveBeenCalledWith({
      where: { pinSlug: 'abc1234567' },
      select: {
        id: true,
        members: {
          where: { role: 'child', pinHash: { not: null } },
          select: { id: true, name: true, familyId: true, avatarUrl: true },
          orderBy: { name: 'asc' },
        },
      },
    })
  })

  it('propagates a transient DB error instead of swallowing it into the "not found" null', async () => {
    findUnique.mockRejectedValue(new Error('connection refused'))

    await expect(loadFamilyChildrenBySlug('abc1234567')).rejects.toThrow('connection refused')
  })
})
