'use client'

/**
 * app/(parent)/rewards/RewardForm.tsx — create/edit modal for a reward (T11).
 *
 * Owns the POST /api/rewards (create) and PATCH /api/rewards/:id (edit) calls.
 * Fields: emoji, title, XP cost, description, is_active, plus the optional
 * [P2] daily/weekly/monthly redemption limits. On success it hands the saved
 * reward back to the catalog page via `onSaved`.
 */

import * as React from 'react'
import { api, ApiError } from '@/lib/web/api'
import { Button, Card, cn } from '@/components/ui'
import type { Reward } from './types'

/** A big curated set of quick-pick emojis for kid rewards, loosely grouped:
 *  screen/games · treats & food · outings & activities · toys · sports ·
 *  creative · money/allowance · special. Wrapped + scrollable in the picker. */
const EMOJI_PRESETS = [
  // screen time & games
  '🎮', '🕹️', '📱', '💻', '📺', '🎧', '🎬', '🍿',
  // treats & food
  '🍦', '🍨', '🍩', '🍪', '🍫', '🍬', '🧁', '🎂', '🍰', '🍕', '🍔', '🍟', '🌭', '🍜', '🥤', '🧋',
  // outings & activities
  '🎡', '🎢', '🎪', '🏊', '🚲', '🛝', '🏕️', '🏖️', '✈️', '🚗', '🦁', '🎠',
  // toys & things
  '🧸', '🪀', '🧩', '🪁', '🎁', '🎈', '🧱', '🚀', '🤖', '🪄',
  // sports
  '⚽', '🏀', '🏓', '⚾', '🏸', '🛹', '⛸️',
  // creative
  '🎨', '🖍️', '🖌️', '🎸', '🎹', '🎤', '📷', '📚',
  // money & special
  '💰', '🪙', '💵', '⭐', '🏆', '👑', '💎', '🎉',
]

type NumField = number | ''

function toNum(v: NumField): number | null {
  return v === '' ? null : v
}

function fromNum(v: number | null | undefined): NumField {
  return v == null ? '' : v
}

export function RewardForm({
  initial,
  onClose,
  onSaved,
}: {
  /** Reward being edited, or null when creating a new one. */
  initial: Reward | null
  onClose: () => void
  onSaved: (reward: Reward) => void
}) {
  const editing = initial != null

  const [emoji, setEmoji] = React.useState(initial?.iconEmoji ?? '🎁')
  const [title, setTitle] = React.useState(initial?.title ?? '')
  const [xpCost, setXpCost] = React.useState<NumField>(fromNum(initial?.xpCost))
  const [description, setDescription] = React.useState(initial?.description ?? '')
  const [isActive, setIsActive] = React.useState(initial?.isActive ?? true)
  const [dailyLimit, setDailyLimit] = React.useState<NumField>(fromNum(initial?.dailyLimit))
  const [weeklyLimit, setWeeklyLimit] = React.useState<NumField>(fromNum(initial?.weeklyLimit))
  const [monthlyLimit, setMonthlyLimit] = React.useState<NumField>(
    fromNum(initial?.monthlyLimit),
  )

  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // Close on Escape for keyboard users.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const canSubmit = title.trim().length > 0 && xpCost !== '' && Number(xpCost) >= 0 && !saving

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setError(null)

    const payload = {
      title: title.trim(),
      xpCost: Number(xpCost),
      iconEmoji: emoji.trim() || null,
      description: description.trim() ? description.trim() : null,
      isActive,
      dailyLimit: toNum(dailyLimit),
      weeklyLimit: toNum(weeklyLimit),
      monthlyLimit: toNum(monthlyLimit),
    }

    try {
      const data = editing
        ? await api.patch<{ reward: Reward }>(`/api/rewards/${initial!.id}`, payload)
        : await api.post<{ reward: Reward }>('/api/rewards', payload)
      onSaved(data.reward)
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ ลองอีกครั้งนะ',
      )
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'แก้ไขรางวัล' : 'เพิ่มรางวัล'}
      onMouseDown={onClose}
    >
      <Card
        padding="lg"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-b-none sm:rounded-card"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl font-extrabold text-ink-900">
          {editing ? 'แก้ไขรางวัล' : 'เพิ่มรางวัลใหม่'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Emoji + quick picks */}
          <div>
            <Label>ไอคอน</Label>
            <div className="flex items-center gap-3">
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                aria-label="อีโมจิรางวัล"
                className="h-14 w-14 shrink-0 rounded-2xl border border-cream-500 bg-cream-100 text-center text-2xl focus:border-primary-500 focus:outline-none"
              />
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto pr-1">
                {EMOJI_PRESETS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl border text-lg transition',
                      emoji === e
                        ? 'border-primary-500 bg-primary-300'
                        : 'border-cream-500 bg-cream-100 hover:bg-cream-200',
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="reward-title">ชื่อรางวัล</Label>
            <TextInput
              id="reward-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น เล่นเกม 1 ชั่วโมง"
              autoFocus
            />
          </div>

          {/* XP cost */}
          <div>
            <Label htmlFor="reward-xp">แต้มที่ใช้แลก (XP)</Label>
            <TextInput
              id="reward-xp"
              type="number"
              min={0}
              step={5}
              value={xpCost}
              onChange={(e) =>
                setXpCost(e.target.value === '' ? '' : Number(e.target.value))
              }
              placeholder="100"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="reward-desc">รายละเอียด (ไม่บังคับ)</Label>
            <textarea
              id="reward-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="อธิบายเพิ่มเติม…"
              className="w-full rounded-2xl border border-cream-500 bg-cream-100 px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none"
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center justify-between rounded-2xl border border-cream-500 bg-cream-100 px-4 py-3">
            <span>
              <span className="block text-sm font-bold text-ink-900">
                เปิดให้แลกได้
              </span>
              <span className="block text-xs text-ink-600">
                ปิดไว้เพื่อซ่อนรางวัลนี้จากฝั่งเด็ก
              </span>
            </span>
            <Toggle checked={isActive} onChange={setIsActive} label="เปิดให้แลกได้" />
          </label>

          {/* Optional limits [P2] */}
          <details className="rounded-2xl border border-cream-500 bg-cream-100 px-4 py-3">
            <summary className="cursor-pointer text-sm font-bold text-ink-800">
              จำกัดจำนวนครั้ง (ไม่บังคับ)
            </summary>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <LimitInput label="ต่อวัน" value={dailyLimit} onChange={setDailyLimit} />
              <LimitInput label="ต่อสัปดาห์" value={weeklyLimit} onChange={setWeeklyLimit} />
              <LimitInput label="ต่อเดือน" value={monthlyLimit} onChange={setMonthlyLimit} />
            </div>
          </details>

          {error ? (
            <p className="rounded-xl bg-danger-100 px-3 py-2 text-sm font-semibold text-danger-500">
              {error}
            </p>
          ) : null}

          <div className="mt-1 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={onClose}
              disabled={saving}
            >
              ยกเลิก
            </Button>
            <Button type="submit" fullWidth disabled={!canSubmit}>
              {saving ? 'กำลังบันทึก…' : editing ? 'บันทึก' : 'เพิ่มรางวัล'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-bold text-ink-800">
      {children}
    </label>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props
  return (
    <input
      className={cn(
        'w-full rounded-2xl border border-cream-500 bg-cream-100 px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none',
        className,
      )}
      {...rest}
    />
  )
}

function LimitInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: NumField
  onChange: (v: NumField) => void
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-ink-600">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        placeholder="—"
        className="w-full rounded-xl border border-cream-500 bg-cream-50 px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:border-primary-500 focus:outline-none"
      />
    </label>
  )
}

/** A cozy pill switch used for the is_active toggle. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-pill border transition-colors',
        checked
          ? 'border-success-500 bg-success-500'
          : 'border-cream-600 bg-cream-300',
      )}
    >
      <span
        // Anchored at left-0.5 so the knob's origin is deterministic — a bare
        // `absolute` span inherits the <button>'s centered static position,
        // which stacks on top of the translate and shoves the knob off-track.
        className={cn(
          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0',
        )}
      />
    </button>
  )
}
