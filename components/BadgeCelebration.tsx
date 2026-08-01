'use client'

import * as React from 'react'
import { Button } from '@/components/ui'

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || ''

export type CelebratedBadge = {
  id: string
  name: string
  description?: string
  imageUrl: string
}

/**
 * BadgeCelebration — a full-screen "you earned a new badge!" moment shown when
 * a child has freshly-unlocked badges. Steps through them one at a time with
 * the medal art. `onDone` fires after the last one (used to mark them seen).
 */
export function BadgeCelebration({
  badges,
  onDone,
}: {
  badges: CelebratedBadge[]
  onDone: () => void
}) {
  const [i, setI] = React.useState(0)
  if (badges.length === 0) return null

  const b = badges[Math.min(i, badges.length - 1)]
  const isLast = i >= badges.length - 1

  function next() {
    if (isLast) onDone()
    else setI((n) => n + 1)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="ปลดล็อกเหรียญใหม่"
      className="fixed inset-0 z-[70] flex items-center justify-center p-5"
    >
      <div className="absolute inset-0 bg-primary-700/45 backdrop-blur-sm" />
      <div className="relative w-full max-w-xs rounded-[28px] bg-cream-50 p-6 text-center shadow-xl ring-1 ring-black/5">
        <p className="text-sm font-extrabold uppercase tracking-wide text-xp-600">
          🎉 ปลดล็อกเหรียญใหม่!
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${BASE_PATH}${b.imageUrl}`}
          alt={b.name}
          className="mx-auto my-3 h-36 w-36 object-contain drop-shadow"
        />
        <h2 className="text-2xl font-extrabold text-ink-900">{b.name}</h2>
        {b.description ? (
          <p className="mt-1 text-sm font-semibold text-ink-600">{b.description}</p>
        ) : null}

        {badges.length > 1 && (
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {badges.map((_, idx) => (
              <span
                key={idx}
                className={`h-1.5 w-1.5 rounded-full ${
                  idx <= i ? 'bg-primary-600' : 'bg-cream-500'
                }`}
              />
            ))}
          </div>
        )}

        <Button variant="primary" size="lg" fullWidth className="mt-5" onClick={next}>
          {isLast ? 'เย้! รับเลย 🙌' : 'ถัดไป →'}
        </Button>
      </div>
    </div>
  )
}

export default BadgeCelebration
