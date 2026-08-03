'use client'

import { Button } from '@/components/ui'

/**
 * WelcomeStep — friendly intro screen (design S2 "เริ่มต้นใช้งาน").
 * No inputs; just sets the tone and starts the flow.
 */
export function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-primary-300/40 text-5xl">
        🦸
      </div>
      <h1 className="text-2xl font-extrabold text-ink-900">
        ยินดีต้อนรับสู่ HabitHero
      </h1>
      <p className="mx-auto mt-2 max-w-xs text-sm font-semibold text-ink-600">
        วินัยเล็ก ๆ ที่สร้างฮีโร่ตัวจริง — ตั้งค่าครอบครัวของคุณใน 5 ขั้นตอนง่าย ๆ
        ออกกลางคันได้ เดี๋ยวกลับมาทำต่อจากเดิม
      </p>

      <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left text-sm font-semibold text-ink-700">
        <li className="flex items-center gap-3">
          <span className="text-lg">🏡</span> ตั้งชื่อครอบครัว
        </li>
        <li className="flex items-center gap-3">
          <span className="text-lg">🦊</span> เพิ่มลูก ๆ พร้อมอวตาร์และ PIN
        </li>
        <li className="flex items-center gap-3">
          <span className="text-lg">🧹</span> เลือกงานเริ่มต้น (ตั้ง XP ให้อัตโนมัติ)
        </li>
        <li className="flex items-center gap-3">
          <span className="text-lg">🎁</span> เลือกของรางวัลไว้ให้ลูกแลก
        </li>
      </ul>

      <Button
        className="mt-8"
        size="lg"
        fullWidth
        onClick={onNext}
        rightIcon={<span aria-hidden>→</span>}
      >
        เริ่มเลย
      </Button>
    </div>
  )
}
