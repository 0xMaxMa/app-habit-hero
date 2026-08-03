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

import { STARTER_REWARDS } from '@/lib/onboarding'
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
    // Rewards start fully selected: a family that clicks straight through still
    // ends up with a usable shop, which is what happened before the step existed.
    starterRewardKeys: STARTER_REWARDS.map((r) => r.key),
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
      // A draft saved before the rewards step existed has no key list at all;
      // treat that as "everything", matching what those families used to get.
      starterRewardKeys: Array.isArray(parsed.starterRewardKeys)
        ? parsed.starterRewardKeys.filter((k): k is string => typeof k === 'string')
        : STARTER_REWARDS.map((r) => r.key),
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
 * Coerce the raw draft into the exact onboardingSchema payload: trim strings,
 * parse age to a number (or drop it), and strip PINs from non-children.
 */
export function toPayload(draft: OnboardingDraft): OnboardingInput {
  return {
    familyName: draft.familyName.trim(),
    members: draft.members.map((m) => {
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
    }),
    starterChoreKeys: draft.starterChoreKeys,
    starterRewardKeys: draft.starterRewardKeys,
  }
}
