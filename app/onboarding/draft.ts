'use client'

/**
 * app/onboarding/draft.ts — client-side wizard draft model + localStorage
 * persistence (T08 resumability).
 *
 * The schema is locked (no onboarding-draft table), so partial progress is kept
 * client-side in localStorage keyed by the parent's user id. Leaving mid-flow
 * and returning restores the exact step + every field. Nothing is written to the
 * DB until the final "เริ่มใช้งาน" submit hits POST /api/onboarding.
 *
 * The draft mirrors the shapes in lib/onboarding but keeps numeric inputs as
 * strings (raw <input> values); toPayload() coerces + trims into the exact
 * onboardingSchema payload right before validation/submit.
 */

import type { MemberAvatar } from '@/lib/onboarding'
import type { OnboardingInput } from '@/lib/onboarding'

export interface DraftMember {
  /** Stable local id for React keys (never sent to the server). */
  uid: string
  name: string
  avatar: MemberAvatar
  role: 'parent' | 'child'
  age: string
  pin: string
  /** Co-parent sign-in credentials. Empty for children. */
  email: string
  password: string
  /**
   * A chosen avatar photo, held until the members exist. Nothing can be
   * uploaded during the wizard because an avatar attaches to a user id that is
   * only minted at finish, so the file waits here and is uploaded afterwards.
   * Deliberately NOT persisted to localStorage — a File cannot survive JSON.
   */
  photo?: File | null
  /** Object URL for the local preview of `photo` (also not persisted). */
  photoPreview?: string | null
}

export interface OnboardingDraft {
  /** Index into ONBOARDING_STEPS. */
  stepIndex: number
  familyName: string
  members: DraftMember[]
  starterChoreKeys: string[]
  starterRewardKeys: string[]
}

export function newMember(role: 'parent' | 'child' = 'child'): DraftMember {
  return {
    uid:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `m_${Math.random().toString(36).slice(2)}`,
    name: '',
    avatar: 'panda',
    role,
    age: '',
    pin: '',
    email: '',
    password: '',
    photo: null,
    photoPreview: null,
  }
}

export function emptyDraft(familyName = ''): OnboardingDraft {
  return {
    stepIndex: 0,
    familyName,
    members: [newMember('child')],
    starterChoreKeys: [],
    starterRewardKeys: [],
  }
}

const KEY_PREFIX = 'habithero:onboarding:'

export function draftKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`
}

export function loadDraft(userId: string, fallbackName: string): OnboardingDraft {
  if (typeof window === 'undefined') return emptyDraft(fallbackName)
  try {
    const raw = window.localStorage.getItem(draftKey(userId))
    if (!raw) return emptyDraft(fallbackName)
    const parsed = JSON.parse(raw) as Partial<OnboardingDraft>
    // Be defensive: a malformed / truncated draft should never crash the wizard.
    return {
      stepIndex:
        typeof parsed.stepIndex === 'number' ? parsed.stepIndex : 0,
      familyName:
        typeof parsed.familyName === 'string' ? parsed.familyName : fallbackName,
      members:
        Array.isArray(parsed.members) && parsed.members.length > 0
          ? parsed.members.map((m) => ({ ...newMember(), ...m }))
          : [newMember('child')],
      starterChoreKeys: Array.isArray(parsed.starterChoreKeys)
        ? parsed.starterChoreKeys.filter((k): k is string => typeof k === 'string')
        : [],
      // Missing entirely on a draft saved before the rewards step existed;
      // an empty list is the same start a new draft gets, so those families
      // pick their rewards on the step like everyone else.
      starterRewardKeys: Array.isArray(parsed.starterRewardKeys)
        ? parsed.starterRewardKeys.filter((k): k is string => typeof k === 'string')
        : [],
    }
  } catch {
    return emptyDraft(fallbackName)
  }
}

export function saveDraft(userId: string, draft: OnboardingDraft): void {
  if (typeof window === 'undefined') return
  try {
    // Strip the pending photo + its object URL: a File is not JSON-serialisable
    // and a blob: URL is dead on the next page load.
    const persistable: OnboardingDraft = {
      ...draft,
      members: draft.members.map(({ photo: _photo, photoPreview: _preview, ...m }) => m),
    }
    window.localStorage.setItem(draftKey(userId), JSON.stringify(persistable))
  } catch {
    // Storage full / disabled — resumability is best-effort, never fatal.
  }
}

export function clearDraft(userId: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(draftKey(userId))
  } catch {
    /* ignore */
  }
}

/**
 * Coerce ONE draft member into the exact shape memberSchema validates: trim
 * strings, parse age to a number (or drop it), and keep only the credentials
 * that role actually uses.
 *
 * Every caller that validates or submits a member goes through here — the
 * wizard's "can I advance?" check, the per-field errors under the inputs, and
 * the final payload. They used to each build this object themselves, and the
 * moment co-parent email/password were added, the copy behind the Next button
 * was the one that did not get them: a fully filled-in parent failed validation
 * forever, under an error message about a PIN it does not have.
 */
export function toMemberInput(m: DraftMember) {
  const ageNum = m.age.trim() === '' ? undefined : Number(m.age)
  return {
    name: m.name.trim(),
    avatar: m.avatar,
    role: m.role,
    age: ageNum !== undefined && Number.isFinite(ageNum) ? ageNum : undefined,
    pin: m.role === 'child' ? m.pin.trim() : undefined,
    email: m.role === 'parent' ? m.email.trim() : undefined,
    password: m.role === 'parent' ? m.password : undefined,
  }
}

/** Coerce the raw draft into the exact onboardingSchema payload. */
export function toPayload(draft: OnboardingDraft): OnboardingInput {
  return {
    familyName: draft.familyName.trim(),
    members: draft.members.map(toMemberInput),
    starterChoreKeys: draft.starterChoreKeys,
    starterRewardKeys: draft.starterRewardKeys,
  }
}
