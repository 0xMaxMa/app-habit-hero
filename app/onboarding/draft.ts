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
}

export interface OnboardingDraft {
  /** Index into ONBOARDING_STEPS. */
  stepIndex: number
  familyName: string
  members: DraftMember[]
  starterChoreKeys: string[]
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
  }
}

export function emptyDraft(familyName = ''): OnboardingDraft {
  return {
    stepIndex: 0,
    familyName,
    members: [newMember('child')],
    starterChoreKeys: [],
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
    }
  } catch {
    return emptyDraft(fallbackName)
  }
}

export function saveDraft(userId: string, draft: OnboardingDraft): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(draftKey(userId), JSON.stringify(draft))
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
      }
    }),
    starterChoreKeys: draft.starterChoreKeys,
  }
}
