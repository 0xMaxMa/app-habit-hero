/**
 * lib/pin-slug.test.ts — createFamilyWithPinSlug must be a single attempt.
 *
 * It used to retry in a loop on a @unique collision, but `db` can be a handle
 * into an already-open transaction — Postgres aborts the WHOLE transaction on
 * the first error, so a second statement on that same `db` fails with "current
 * transaction is aborted" (25P02), not the P2002 the old loop expected to
 * catch. Retrying belongs to the caller, which can open a brand-new
 * transaction (see app/api/signup/route.ts and lib/import-family.ts).
 */
import { describe, it, expect, vi } from 'vitest'
import { createFamilyWithPinSlug, generatePinSlug } from './pin-slug'

describe('generatePinSlug', () => {
  it('produces a 10-character slug from the URL-safe alphabet', () => {
    const slug = generatePinSlug()
    expect(slug).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/)
  })
})

describe('createFamilyWithPinSlug', () => {
  it('creates the family with a freshly generated pinSlug', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'f1', name: 'ครอบครัว', pinSlug: 'whatever12' })
    const db = { family: { create } }

    const result = await createFamilyWithPinSlug(db as never, 'ครอบครัว')

    expect(result).toEqual({ id: 'f1', name: 'ครอบครัว', pinSlug: 'whatever12' })
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith({
      data: { name: 'ครอบครัว', pinSlug: expect.any(String) },
      select: { id: true, name: true, pinSlug: true },
    })
  })

  it('propagates a unique-constraint collision immediately instead of retrying on the same (possibly-aborted) db handle', async () => {
    const collisionErr = Object.assign(new Error('Unique constraint failed on the fields: (`pin_slug`)'), {
      code: 'P2002',
    })
    const create = vi.fn().mockRejectedValue(collisionErr)
    const db = { family: { create } }

    await expect(createFamilyWithPinSlug(db as never, 'ครอบครัว')).rejects.toBe(collisionErr)
    // The old self-retry loop would have called this up to 5 times — a single
    // attempt proves the retry-on-aborted-tx bug cannot resurface here.
    expect(create).toHaveBeenCalledTimes(1)
  })
})
