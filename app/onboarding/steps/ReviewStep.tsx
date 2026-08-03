'use client'

import {
  Avatar,
  Card,
  CardTitle,
  CardSubtitle,
  XpBadge,
} from '@/components/ui'
import { STARTER_CHORES, STARTER_REWARDS, starterChoreByKey } from '@/lib/onboarding'
import type { OnboardingDraft } from '../draft'

/**
 * ReviewStep — final confirmation before writing to the DB (design S2 final
 * screen, "เริ่มใช้งาน 🎉"). Summarizes the family, members, chosen chores and
 * chosen rewards.
 * Invite/link codes are minted later from Settings once members exist (T15/T18),
 * so this step notes that rather than pretending to invite pre-creation.
 */
export function ReviewStep({
  draft,
  submitError,
}: {
  draft: OnboardingDraft
  submitError?: string
}) {
  const chosen = STARTER_CHORES.filter((c) =>
    draft.starterChoreKeys.includes(c.key),
  )
  const chosenRewards = STARTER_REWARDS.filter((r) =>
    draft.starterRewardKeys.includes(r.key),
  )
  const totalXp = draft.starterChoreKeys
    .map((k) => starterChoreByKey(k)?.xpValue ?? 0)
    .reduce((a, b) => a + b, 0)

  return (
    <div>
      <CardTitle className="text-xl">พร้อมเริ่มใช้งาน 🎉</CardTitle>
      <CardSubtitle className="mt-1">
        ตรวจสอบข้อมูลก่อนสร้างครอบครัวของคุณ
      </CardSubtitle>

      {submitError ? (
        <p role="alert" className="mt-3 rounded-xl bg-danger-100 px-3 py-2 text-sm font-semibold text-danger-500">
          {submitError}
        </p>
      ) : null}

      {/* Family */}
      <Card variant="sunk" padding="md" className="mt-4">
        <p className="text-xs font-bold text-ink-600">ครอบครัว</p>
        <p className="mt-0.5 text-lg font-extrabold text-ink-900">
          🏡 {draft.familyName.trim() || '—'}
        </p>
      </Card>

      {/* Members */}
      <p className="mt-5 mb-2 text-xs font-bold text-ink-600">
        สมาชิก ({draft.members.length})
      </p>
      <div className="space-y-2">
        {draft.members.map((m) => (
          <Card key={m.uid} padding="sm" className="flex items-center gap-3">
            <Avatar
              character={m.avatar}
              src={m.photoPreview ?? undefined}
              size="sm"
              ring={m.role === 'child' ? 'primary' : 'none'}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-extrabold text-ink-900">
                {m.name.trim() || '(ยังไม่ตั้งชื่อ)'}
              </span>
              <span className="block text-xs font-semibold text-ink-600">
                {m.role === 'child' ? 'เด็ก' : 'ผู้ปกครอง'}
                {m.age.trim() ? ` · ${m.age.trim()} ขวบ` : ''}
                {m.role === 'child' && m.pin.trim().length === 4
                  ? ' · ตั้ง PIN แล้ว'
                  : ''}
                {m.role === 'parent' && m.email.trim() ? ` · ${m.email.trim()}` : ''}
                {m.photo ? ' · มีรูป' : ''}
              </span>
            </span>
          </Card>
        ))}
      </div>

      {/* Chores */}
      <p className="mt-5 mb-2 text-xs font-bold text-ink-600">
        งานเริ่มต้น ({chosen.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {chosen.length === 0 ? (
          <span className="text-sm font-semibold text-ink-500">
            ยังไม่ได้เลือกงาน
          </span>
        ) : (
          chosen.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1.5 rounded-pill border-2 border-cream-600 bg-cream-100 px-3 py-1.5 text-sm font-bold text-ink-800"
            >
              <span aria-hidden>{c.emoji}</span>
              {c.title}
            </span>
          ))
        )}
      </div>

      {chosen.length > 0 ? (
        <div className="mt-3 flex items-center gap-2 text-sm font-bold text-ink-700">
          รวม XP ต่อรอบ <XpBadge value={totalXp} size="sm" />
        </div>
      ) : null}

      {/* Rewards */}
      <p className="mt-5 mb-2 text-xs font-bold text-ink-600">
        ของรางวัล ({chosenRewards.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {chosenRewards.length === 0 ? (
          <span className="text-sm font-semibold text-ink-500">
            ยังไม่ได้เลือกรางวัล
          </span>
        ) : (
          chosenRewards.map((r) => (
            <span
              key={r.key}
              className="inline-flex items-center gap-1.5 rounded-pill border-2 border-cream-600 bg-cream-100 px-3 py-1.5 text-sm font-bold text-ink-800"
            >
              <span aria-hidden>{r.iconEmoji}</span>
              {r.title}
            </span>
          ))
        )}
      </div>

      <Card variant="sunk" padding="sm" className="mt-5 text-sm font-semibold text-ink-600">
        📨 อยากให้สมาชิกใช้งานผ่านแชท? สร้างรหัสเชิญ (invite code) ได้ในหน้า
        “ตั้งค่าครอบครัว” หลังตั้งค่าเสร็จ
      </Card>
    </div>
  )
}
