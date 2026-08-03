/**
 * app/onboarding/draft.test.ts — the draft → memberSchema mapping.
 *
 * This exists because of a real escape: co-parent email + password were added
 * to memberSchema, but the mapping behind the wizard's Next button was a
 * separate copy that never passed them along. A parent with every field filled
 * in could not advance, and the error shown talked about a 4-digit PIN that
 * role does not even have. `toMemberInput` is now the single mapping, and these
 * tests hold it to what each role actually needs to be valid.
 */

import { describe, it, expect } from 'vitest'
import { memberSchema } from '@/lib/onboarding'
import { newMember, toMemberInput, emptyDraft, toPayload } from './draft'
import type { DraftMember } from './draft'

function parent(over: Partial<DraftMember> = {}): DraftMember {
  return {
    ...newMember('parent'),
    name: 'แม่',
    email: 'mom@example.com',
    password: 'password123',
    ...over,
  }
}

function child(over: Partial<DraftMember> = {}): DraftMember {
  return { ...newMember('child'), name: 'น้องเอ', pin: '1234', ...over }
}

const valid = (m: DraftMember) => memberSchema.safeParse(toMemberInput(m)).success

function errorPaths(m: DraftMember): string[] {
  const res = memberSchema.safeParse(toMemberInput(m))
  return res.success ? [] : res.error.issues.map((i) => String(i.path[0]))
}

describe('toMemberInput — co-parent', () => {
  it('passes a parent who has an email and password', () => {
    expect(valid(parent())).toBe(true)
  })

  it('carries the credentials through instead of dropping them', () => {
    // The regression was silent: the object simply lacked these two keys, so
    // the schema reported them missing on a form the user had filled in.
    const input = toMemberInput(parent())
    expect(input.email).toBe('mom@example.com')
    expect(input.password).toBe('password123')
  })

  it('never asks a parent for a PIN', () => {
    expect(toMemberInput(parent()).pin).toBeUndefined()
    expect(errorPaths(parent())).not.toContain('pin')
  })

  it('fails on a missing email, and says so on the email field', () => {
    expect(valid(parent({ email: '' }))).toBe(false)
    expect(errorPaths(parent({ email: '' }))).toContain('email')
  })

  it('fails on a password under 8 characters', () => {
    expect(valid(parent({ password: 'short' }))).toBe(false)
    expect(errorPaths(parent({ password: 'short' }))).toContain('password')
  })

  it('trims the email so a stray space does not block the button', () => {
    expect(toMemberInput(parent({ email: '  mom@example.com  ' })).email).toBe(
      'mom@example.com',
    )
  })
})

describe('toMemberInput — child', () => {
  it('passes a child with a 4-digit PIN', () => {
    expect(valid(child())).toBe(true)
  })

  it('fails a child without one', () => {
    expect(valid(child({ pin: '' }))).toBe(false)
    expect(errorPaths(child({ pin: '' }))).toContain('pin')
  })

  it('never asks a child for credentials', () => {
    const input = toMemberInput(child())
    expect(input.email).toBeUndefined()
    expect(input.password).toBeUndefined()
  })

  it('drops a blank age rather than sending NaN', () => {
    expect(toMemberInput(child({ age: '' })).age).toBeUndefined()
    expect(toMemberInput(child({ age: '9' })).age).toBe(9)
  })
})

describe('toPayload', () => {
  it('uses the same mapping for every member it submits', () => {
    const draft = {
      ...emptyDraft('บ้านตัวอย่าง'),
      members: [child(), parent()],
      starterChoreKeys: ['tidy_toys'],
    }
    const payload = toPayload(draft)
    expect(payload.members).toEqual([toMemberInput(child()), toMemberInput(parent())])
  })

  it('starts a new draft with every reward selected', () => {
    expect(emptyDraft().starterRewardKeys.length).toBeGreaterThan(0)
  })
})
