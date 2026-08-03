'use client'

import { ONBOARDING_STEPS } from '@/lib/onboarding'
import { cn } from '@/components/ui'

/** Short Thai labels per wizard step (design S2 crumb wording). */
const STEP_LABELS: Record<(typeof ONBOARDING_STEPS)[number], string> = {
  welcome: 'เริ่มต้น',
  family: 'ตั้งชื่อ',
  members: 'สมาชิก',
  chores: 'งานเริ่มต้น',
  rewards: 'ของรางวัล',
  review: 'พร้อมลุย',
}

/**
 * Stepper — a compact segmented progress bar for the onboarding wizard.
 * Dots fill up to the current step; a caption shows "ขั้นที่ x จาก y".
 */
export function Stepper({ current }: { current: number }) {
  const total = ONBOARDING_STEPS.length
  return (
    <div className="mb-6">
      <div className="flex items-center gap-1.5" aria-hidden>
        {ONBOARDING_STEPS.map((step, i) => (
          <span
            key={step}
            className={cn(
              'h-1.5 flex-1 rounded-pill transition-colors duration-300',
              i <= current ? 'bg-primary-500' : 'bg-cream-500',
            )}
          />
        ))}
      </div>
      <p className="mt-2 text-xs font-bold text-ink-600">
        ขั้นที่ {current + 1} จาก {total} · {STEP_LABELS[ONBOARDING_STEPS[current]]}
      </p>
    </div>
  )
}
