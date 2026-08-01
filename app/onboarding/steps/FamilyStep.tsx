'use client'

import { Card, CardTitle, CardSubtitle } from '@/components/ui'

/**
 * FamilyStep — name the family (design S2 "ตั้งชื่อครอบครัว").
 * A couple of one-tap suggestions plus a free-text field.
 */
const SUGGESTIONS = ['ครอบครัวสุขสันต์', 'บ้านอบอุ่น', 'ทีมฮีโร่']

export function FamilyStep({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (name: string) => void
  error?: string
}) {
  return (
    <div>
      <CardTitle className="text-xl">ตั้งชื่อครอบครัว</CardTitle>
      <CardSubtitle className="mt-1">
        ชื่อนี้จะแสดงในแอปและในการแจ้งเตือน
      </CardSubtitle>

      <label htmlFor="familyName" className="sr-only">
        ชื่อครอบครัว
      </label>
      <input
        id="familyName"
        type="text"
        value={value}
        maxLength={60}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        placeholder="เช่น ครอบครัวสุขสันต์"
        className="mt-4 w-full rounded-2xl border-2 border-cream-600 bg-cream-50 px-4 py-3 text-lg font-bold text-ink-900 outline-none focus:border-primary-500"
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm font-semibold text-danger-500">
          {error}
        </p>
      ) : null}

      <p className="mt-5 mb-2 text-xs font-bold text-ink-600">ชื่อที่แนะนำ</p>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className="rounded-pill border-2 border-cream-600 bg-cream-100 px-4 py-2 text-sm font-bold text-ink-800 transition hover:border-primary-400 hover:bg-primary-300/20"
          >
            {s}
          </button>
        ))}
      </div>

      <Card variant="sunk" padding="sm" className="mt-6 text-sm font-semibold text-ink-600">
        💡 เปลี่ยนชื่อภายหลังได้จากหน้าตั้งค่าครอบครัว
      </Card>
    </div>
  )
}
