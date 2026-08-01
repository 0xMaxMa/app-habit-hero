'use client'

/**
 * app/(parent)/chores/ChoreFormModal.tsx — create/edit drawer for a chore
 * (T10 · design "สร้างงานใหม่" slide-out).
 *
 * A right slide-out drawer (design hh-slide) with:
 *   - category chips (writes Chore.category — accurate category badges)
 *   - an XP reward number input (type the exact reward, 5–999)
 *   - a weekday picker shown for weekly recurrence (design "กำหนดเอง")
 * Pure form + client-side validation mirroring the API schema. The parent page
 * owns the POST/PATCH and receives the built payload via `onSubmit`.
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import { Button, cn } from '@/components/ui'
import {
  CATEGORY_META,
  CATEGORY_ORDER,
  WEEKDAY_LABELS,
  type Chore,
  type ChoreInput,
  type ChoreCategory,
  type ChildOption,
  type Recurrence,
} from './types'

const inputCls =
  'w-full rounded-xl border-2 border-cream-600 bg-cream-50 px-3 py-2.5 ' +
  'font-bold text-ink-900 outline-none focus:border-primary-500'

const RECURRENCE: { value: Recurrence; label: string }[] = [
  { value: 'daily', label: 'ทุกวัน' },
  { value: 'weekly', label: 'รายสัปดาห์' },
  { value: 'once', label: 'ครั้งเดียว' },
]

/** Multiplier applied to a late completion when the penalty toggle is on. */
const LATE_PENALTY_MULTIPLIER = 0.6

/** XP input bounds. Floor mirrors the design's "งานเล็ก" 5 XP; the ceiling is
 *  generous so a parent can type a big-reward value the old slider capped at 200.
 *  Step drives the number input's arrow keys only — any integer in range is valid. */
const XP_MIN = 5
const XP_MAX = 999
const XP_STEP = 5

type Errors = { title?: string; xp?: string }

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-cream-600 bg-cream-50 px-3 py-2.5 text-left"
    >
      <span className="min-w-0">
        <span className="block font-extrabold text-ink-900">{label}</span>
        {hint ? (
          <span className="block text-xs font-semibold text-ink-600">{hint}</span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition',
          checked ? 'bg-primary-600' : 'bg-cream-500',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

export function ChoreFormModal({
  chore,
  childOptions,
  submitting,
  serverError,
  onSubmit,
  onClose,
}: {
  /** The chore being edited, or null for a fresh create. */
  chore: Chore | null
  childOptions: ChildOption[]
  submitting: boolean
  serverError?: string | null
  onSubmit: (input: ChoreInput) => void
  onClose: () => void
}) {
  const isEdit = chore != null

  // Mount guard: the portal needs document.body, which only exists client-side.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const [title, setTitle] = React.useState(chore?.title ?? '')
  const [category, setCategory] = React.useState<ChoreCategory>(chore?.category ?? 'other')
  const [assignedTo, setAssignedTo] = React.useState<string>(chore?.assignedTo ?? '')
  const [xp, setXp] = React.useState<string>(String(chore?.xpValue ?? 20))
  const [recurrence, setRecurrence] = React.useState<Recurrence>(chore?.recurrence ?? 'daily')
  const [recurDays, setRecurDays] = React.useState<number[]>(chore?.recurDays ?? [])
  const [dueTime, setDueTime] = React.useState<string>(chore?.dueTime ?? '')
  const [latePenalty, setLatePenalty] = React.useState<boolean>(
    chore ? chore.lateXpMultiplier < 1 : true,
  )
  const [requirePhoto, setRequirePhoto] = React.useState<boolean>(chore?.requirePhoto ?? true)
  const [isExtra, setIsExtra] = React.useState<boolean>(chore?.isExtra ?? false)
  const [errors, setErrors] = React.useState<Errors>({})

  function toggleDay(day: number) {
    setRecurDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    )
  }

  function validate(): ChoreInput | null {
    const next: Errors = {}
    const trimmed = title.trim()
    if (!trimmed) next.title = 'กรุณาใส่ชื่องาน'

    const xpValue = Number(xp)
    if (!xp.trim() || !Number.isInteger(xpValue)) {
      next.xp = 'กรุณาใส่แต้มเป็นตัวเลข'
    } else if (xpValue < XP_MIN || xpValue > XP_MAX) {
      next.xp = `แต้มต้องอยู่ระหว่าง ${XP_MIN}–${XP_MAX}`
    }

    setErrors(next)
    if (Object.keys(next).length > 0) return null

    return {
      title: trimmed,
      assignedTo: assignedTo || null,
      xpValue,
      recurrence,
      category,
      // Days only matter for weekly recurrence; drop them otherwise so the row
      // stays clean.
      recurDays: recurrence === 'weekly' ? recurDays : [],
      dueTime: dueTime.trim() ? dueTime : null,
      lateXpMultiplier: latePenalty ? LATE_PENALTY_MULTIPLIER : 1,
      requirePhoto,
      isExtra,
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = validate()
    if (input) onSubmit(input)
  }

  if (!mounted) return null

  // Portal to <body> so the fixed overlay escapes the parent layout's
  // `md:overflow-y-auto` scroll container. On iOS Safari a `position: fixed`
  // element trapped inside an overflow-scroll ancestor is clipped to that
  // ancestor's scrolled box — which left the drawer short of the screen bottom
  // (the "ล้นจอ" white gap). Same pattern ConfirmDialog / PhotoThumb already use.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'แก้ไขงานบ้าน' : 'สร้างงานใหม่'}
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-sm"
        onMouseDown={onClose}
        aria-hidden
      />

      {/* Right drawer. `h-dvh`, not `h-full` and not `h-svh`: `h-full` is 100%
          of the `inset-0` overlay, which iOS Safari lays out against the LARGE
          (toolbar-collapsed) viewport — taller than the visible area, so the
          footer buttons fall below the fold. `h-svh` overcorrects: it is frozen
          at the toolbar-EXPANDED height, so once the toolbar retracts the drawer
          is ~60px short and leaves a blank strip. `dvh` tracks the visible
          viewport in either state. The scrim keeps `inset-0` so it still covers
          everything. */}
      <aside className="animate-hhSlide relative flex h-dvh w-full max-w-[440px] flex-col bg-cream-50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b-2 border-cream-300 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-ink-900">
              {isEdit ? 'แก้ไขงานบ้าน' : 'สร้างงานใหม่'}
            </h2>
            <p className="mt-0.5 text-xs font-bold text-ink-600">มอบหมายให้ลูกและตั้ง XP</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2 border-cream-600 text-ink-600 hover:bg-cream-300"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
          {/* Scrollable body */}
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {serverError ? (
              <p
                role="alert"
                className="rounded-xl bg-danger-100 px-3 py-2 text-sm font-semibold text-danger-500"
              >
                {serverError}
              </p>
            ) : null}

            {/* Title + category chips */}
            <div>
              <label htmlFor="chore-title" className="mb-1.5 block text-xs font-bold text-ink-600">
                ชื่องาน
              </label>
              <input
                id="chore-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="เช่น เก็บของเล่นเข้ากล่อง"
                className={inputCls}
                aria-invalid={errors.title ? true : undefined}
              />
              {errors.title ? (
                <p className="mt-1 text-xs font-semibold text-danger-500">{errors.title}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORY_ORDER.map((cat) => {
                  const meta = CATEGORY_META[cat]
                  const on = category === cat
                  return (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCategory(cat)}
                      className={cn(
                        'whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-extrabold transition',
                        on
                          ? 'bg-primary-300/40 text-primary-700 ring-1 ring-primary-400'
                          : 'bg-cream-300 text-ink-600 hover:bg-cream-400',
                      )}
                    >
                      {meta.emoji} {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* XP reward — free number input */}
            <div>
              <label htmlFor="chore-xp" className="mb-1 flex items-center justify-between">
                <span className="text-xs font-bold text-ink-600">รางวัล XP</span>
                <span className="text-[11px] font-bold text-ink-500">
                  {XP_MIN}–{XP_MAX} แต้ม
                </span>
              </label>
              <div className="relative">
                <input
                  id="chore-xp"
                  type="number"
                  inputMode="numeric"
                  min={XP_MIN}
                  max={XP_MAX}
                  step={XP_STEP}
                  value={xp}
                  onChange={(e) => setXp(e.target.value)}
                  aria-label="แต้ม XP"
                  aria-invalid={errors.xp ? true : undefined}
                  className={cn(inputCls, 'pr-12 text-xp-700', errors.xp && 'border-danger-500')}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-extrabold text-xp-700">
                  XP
                </span>
              </div>
              {errors.xp ? (
                <p className="mt-1 text-xs font-semibold text-danger-500">{errors.xp}</p>
              ) : null}
            </div>

            {/* Assignee */}
            <div>
              <label
                htmlFor="chore-assignee"
                className="mb-1.5 block text-xs font-bold text-ink-600"
              >
                มอบหมายให้
              </label>
              <select
                id="chore-assignee"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className={inputCls}
              >
                <option value="">ทุกคน (งานส่วนกลาง)</option>
                {childOptions.map((c) => (
                  <option key={c.userId} value={c.userId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Recurrence + weekday picker */}
            <div>
              <span className="mb-1.5 block text-xs font-bold text-ink-600">ทำซ้ำ</span>
              <div className="flex gap-2 rounded-2xl bg-cream-300 p-1.5">
                {RECURRENCE.map((r) => {
                  const on = recurrence === r.value
                  return (
                    <button
                      key={r.value}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setRecurrence(r.value)}
                      className={cn(
                        'flex-1 rounded-xl py-2 text-sm font-extrabold transition',
                        on
                          ? 'bg-white text-primary-700 shadow-sm'
                          : 'text-ink-600 hover:text-ink-900',
                      )}
                    >
                      {r.label}
                    </button>
                  )
                })}
              </div>
              {recurrence === 'weekly' ? (
                <div className="mt-2.5">
                  <div className="flex gap-1.5">
                    {WEEKDAY_LABELS.map((label, day) => {
                      const on = recurDays.includes(day)
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          aria-label={label}
                          onClick={() => toggleDay(day)}
                          className={cn(
                            'grid h-9 flex-1 place-items-center rounded-xl border-2 text-xs font-extrabold transition',
                            on
                              ? 'border-primary-600 bg-primary-300/40 text-primary-700'
                              : 'border-cream-600 bg-cream-50 text-ink-500 hover:border-primary-300',
                          )}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] font-semibold text-ink-500">
                    {recurDays.length === 0
                      ? 'ไม่เลือก = ทุกวันในสัปดาห์'
                      : `กำหนดเอง · ${recurDays.length} วัน/สัปดาห์`}
                  </p>
                </div>
              ) : null}
            </div>

            {/* Due time */}
            <div>
              <label htmlFor="chore-due" className="mb-1.5 block text-xs font-bold text-ink-600">
                ครบกำหนด (ไม่บังคับ)
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="chore-due"
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className={cn(
                    inputCls,
                    // Native <input type="time"> on iOS Safari ignores width and
                    // renders an intrinsically-wide control that overflows the card.
                    // appearance-none makes it honour box-sizing; min-w-0 lets it
                    // shrink; the value pseudo is left-aligned to match other fields.
                    // appearance-none also drops the native control's intrinsic
                    // height, so an *empty* value collapses the box shorter than the
                    // sibling inputs — min-h pins it to the 48px they compute to
                    // (24px line + 20px padding + 4px border).
                    'block min-h-[3rem] min-w-0 flex-1 appearance-none [&::-webkit-date-and-time-value]:text-left',
                  )}
                />
                {dueTime ? (
                  <button
                    type="button"
                    onClick={() => setDueTime('')}
                    className="min-h-[3rem] shrink-0 rounded-xl border-2 border-cream-600 bg-cream-50 px-3 text-xs font-extrabold text-ink-500 transition hover:border-primary-300 hover:text-ink-700"
                  >
                    ล้าง
                  </button>
                ) : null}
              </div>
              <p className="mt-1.5 text-[11px] font-semibold text-ink-500">
                {dueTime ? 'กด "ล้าง" เพื่อกลับไปไม่กำหนดเวลา' : 'ไม่กำหนดเวลา = ส่งงานได้ทั้งวัน'}
              </p>
            </div>

            {/* Toggles */}
            <div className="space-y-2.5">
              <Toggle
                checked={requirePhoto}
                onChange={setRequirePhoto}
                label="ต้องถ่ายรูป"
                hint="เด็กต้องแนบรูปตอนส่งงาน"
              />
              <Toggle
                checked={latePenalty}
                onChange={setLatePenalty}
                label="หักแต้มเมื่อทำสาย"
                hint="ได้ XP น้อยลงถ้าส่งช้า"
              />
              <Toggle
                checked={isExtra}
                onChange={setIsExtra}
                label="งานพิเศษ"
                hint="งานเสริมนอกเหนืองานประจำ"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-3 border-t-2 border-cream-300 px-6 py-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={submitting}
            >
              ยกเลิก
            </Button>
            <Button type="submit" fullWidth disabled={submitting}>
              {submitting ? 'กำลังบันทึก…' : 'บันทึกงาน'}
            </Button>
          </div>
        </form>
      </aside>
    </div>,
    document.body,
  )
}

export default ChoreFormModal
