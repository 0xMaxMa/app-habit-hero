'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, cn } from '@/components/ui'
import {
  ONBOARDING_STEPS,
  isLastStep,
  memberSchema,
  onboardingSchema,
} from '@/lib/onboarding'
import {
  clearDraft,
  emptyDraft,
  loadDraft,
  saveDraft,
  toPayload,
  type OnboardingDraft,
  type DraftMember,
} from './draft'
import { Stepper } from './steps/Stepper'
import { WelcomeStep } from './steps/WelcomeStep'
import { FamilyStep } from './steps/FamilyStep'
import { MembersStep } from './steps/MembersStep'
import { ChoresStep } from './steps/ChoresStep'
import { ReviewStep } from './steps/ReviewStep'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

/** True when every member individually satisfies memberSchema. */
function membersValid(members: DraftMember[]): boolean {
  if (members.length < 1) return false
  return members.every((m) => {
    const ageNum = m.age.trim() === '' ? undefined : Number(m.age)
    return memberSchema.safeParse({
      name: m.name.trim(),
      avatar: m.avatar,
      role: m.role,
      age: ageNum !== undefined && Number.isFinite(ageNum) ? ageNum : undefined,
      pin: m.role === 'child' ? m.pin.trim() : undefined,
    }).success
  })
}

/**
 * OnboardingWizard — the client half of the S2 flow. Holds the draft, persists
 * it to localStorage on every change (resumable), validates step-by-step, and
 * POSTs the final payload to /api/onboarding.
 */
export function OnboardingWizard({
  userId,
  initialFamilyName,
}: {
  userId: string
  initialFamilyName: string
}) {
  const router = useRouter()

  // Start from an empty draft for a stable first render, then hydrate from
  // localStorage on the client to avoid an SSR/CSR mismatch.
  const [draft, setDraft] = useState<OnboardingDraft>(() =>
    emptyDraft(initialFamilyName),
  )
  const [ready, setReady] = useState(false)

  const [showMemberErrors, setShowMemberErrors] = useState(false)
  const [familyError, setFamilyError] = useState('')
  const [membersFormError, setMembersFormError] = useState('')
  const [choresError, setChoresError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Hydrate the saved draft once, on mount.
  useEffect(() => {
    setDraft(loadDraft(userId, initialFamilyName))
    setReady(true)
  }, [userId, initialFamilyName])

  // Persist on every change (best-effort) once hydrated.
  useEffect(() => {
    if (ready) saveDraft(userId, draft)
  }, [ready, userId, draft])

  if (!ready) {
    return <div className="min-h-[40vh]" aria-hidden />
  }

  const step = ONBOARDING_STEPS[draft.stepIndex] ?? 'welcome'

  function update(patch: Partial<OnboardingDraft>) {
    setDraft((d) => ({ ...d, ...patch }))
  }

  function goTo(index: number) {
    const clamped = Math.max(0, Math.min(index, ONBOARDING_STEPS.length - 1))
    update({ stepIndex: clamped })
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }

  /** Validate the current step; returns true when it is safe to advance. */
  function validateStep(): boolean {
    if (step === 'family') {
      const name = draft.familyName.trim()
      if (name.length < 1) {
        setFamilyError('กรุณาตั้งชื่อครอบครัว')
        return false
      }
      setFamilyError('')
      return true
    }
    if (step === 'members') {
      if (draft.members.length < 1) {
        setMembersFormError('เพิ่มสมาชิกอย่างน้อย 1 คน')
        setShowMemberErrors(true)
        return false
      }
      if (!membersValid(draft.members)) {
        setMembersFormError('กรุณากรอกข้อมูลสมาชิกให้ครบ (เด็กต้องมี PIN 4 หลัก)')
        setShowMemberErrors(true)
        return false
      }
      setMembersFormError('')
      setShowMemberErrors(false)
      return true
    }
    if (step === 'chores') {
      if (draft.starterChoreKeys.length < 1) {
        setChoresError('เลือกงานเริ่มต้นอย่างน้อย 1 งาน')
        return false
      }
      setChoresError('')
      return true
    }
    return true
  }

  function handleNext() {
    if (!validateStep()) return
    goTo(draft.stepIndex + 1)
  }

  function handleBack() {
    goTo(draft.stepIndex - 1)
  }

  async function handleFinish() {
    setSubmitError('')
    const payload = toPayload(draft)
    const parsed = onboardingSchema.safeParse(payload)
    if (!parsed.success) {
      // Route the user back to the first step that has a problem.
      const bad = parsed.error.issues[0]?.path[0]
      if (bad === 'familyName') goTo(ONBOARDING_STEPS.indexOf('family'))
      else if (bad === 'members') {
        setShowMemberErrors(true)
        goTo(ONBOARDING_STEPS.indexOf('members'))
      } else if (bad === 'starterChoreKeys')
        goTo(ONBOARDING_STEPS.indexOf('chores'))
      setSubmitError('ข้อมูลยังไม่ครบ กรุณาตรวจสอบอีกครั้ง')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${BASE_PATH}/api/onboarding`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })

      if (res.status === 401) {
        router.push('/login?callbackUrl=/onboarding')
        return
      }

      const body = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error?: { message?: string } }
        | null

      if (!res.ok || !body || body.ok !== true) {
        const msg =
          body && body.ok === false && body.error?.message
            ? body.error.message
            : 'บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
        setSubmitError(msg)
        return
      }

      // Success — clear the local draft and head to the dashboard.
      clearDraft(userId)
      router.push('/dashboard')
      router.refresh()
    } catch {
      setSubmitError('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setSubmitting(false)
    }
  }

  // The welcome step owns its own CTA and has no footer nav.
  if (step === 'welcome') {
    return (
      <div>
        <Stepper current={draft.stepIndex} />
        <WelcomeStep onNext={() => goTo(1)} />
      </div>
    )
  }

  const onLast = isLastStep(step)

  return (
    <div>
      <Stepper current={draft.stepIndex} />

      {step === 'family' && (
        <FamilyStep
          value={draft.familyName}
          error={familyError}
          onChange={(familyName) => {
            update({ familyName })
            if (familyError) setFamilyError('')
          }}
        />
      )}

      {step === 'members' && (
        <MembersStep
          members={draft.members}
          showErrors={showMemberErrors}
          formError={membersFormError}
          onChange={(members) => update({ members })}
        />
      )}

      {step === 'chores' && (
        <ChoresStep
          selected={draft.starterChoreKeys}
          error={choresError}
          onChange={(starterChoreKeys) => {
            update({ starterChoreKeys })
            if (choresError) setChoresError('')
          }}
        />
      )}

      {step === 'review' && <ReviewStep draft={draft} submitError={submitError} />}

      {/* Footer nav */}
      <div className={cn('mt-8 flex items-center gap-3')}>
        <Button variant="ghost" onClick={handleBack} disabled={submitting}>
          ← ย้อนกลับ
        </Button>
        <div className="flex-1" />
        {onLast ? (
          <Button
            size="lg"
            variant="success"
            onClick={handleFinish}
            disabled={submitting}
          >
            {submitting ? 'กำลังบันทึก…' : 'เริ่มใช้งาน 🎉'}
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={handleNext}
            rightIcon={<span aria-hidden>→</span>}
          >
            ถัดไป
          </Button>
        )}
      </div>
    </div>
  )
}
