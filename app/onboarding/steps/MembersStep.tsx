'use client'

import { useRef } from 'react'
import {
  Avatar,
  Button,
  Card,
  CardTitle,
  CardSubtitle,
  cn,
} from '@/components/ui'
import { AVATARS, AVATAR_LABELS, memberSchema } from '@/lib/onboarding'
import { downscaleImage } from '@/lib/web/image'
import { newMember, type DraftMember } from '../draft'

/** Validate one draft member, returning field errors keyed by path. */
function memberErrors(m: DraftMember): Record<string, string> {
  const ageNum = m.age.trim() === '' ? undefined : Number(m.age)
  const res = memberSchema.safeParse({
    name: m.name.trim(),
    avatar: m.avatar,
    role: m.role,
    age: ageNum !== undefined && Number.isFinite(ageNum) ? ageNum : undefined,
    pin: m.role === 'child' ? m.pin.trim() : undefined,
    email: m.role === 'parent' ? m.email.trim() : undefined,
    password: m.role === 'parent' ? m.password : undefined,
  })
  if (res.success) return {}
  const out: Record<string, string> = {}
  for (const issue of res.error.issues) {
    const key = String(issue.path[0] ?? '_')
    if (!out[key]) out[key] = issue.message
  }
  return out
}

function MemberEditor({
  member,
  index,
  canRemove,
  showErrors,
  onChange,
  onRemove,
}: {
  member: DraftMember
  index: number
  canRemove: boolean
  showErrors: boolean
  onChange: (patch: Partial<DraftMember>) => void
  onRemove: () => void
}) {
  const errs = showErrors ? memberErrors(member) : {}
  const fileRef = useRef<HTMLInputElement>(null)

  /**
   * Hold the picked photo instead of uploading it: there is no member row yet
   * to attach an avatar to. Shrink it here anyway — the same 256px cap the
   * settings page uses — so a multi-MB phone photo is not carried around in
   * memory until finish.
   */
  async function pickPhoto(file: File | undefined) {
    if (!file) return
    const small = await downscaleImage(file, 256).catch(() => file)
    if (member.photoPreview) URL.revokeObjectURL(member.photoPreview)
    onChange({ photo: small, photoPreview: URL.createObjectURL(small) })
  }

  function clearPhoto() {
    if (member.photoPreview) URL.revokeObjectURL(member.photoPreview)
    onChange({ photo: null, photoPreview: null })
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <Card padding="md" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            character={member.avatar}
            src={member.photoPreview ?? undefined}
            size="md"
            ring={member.role === 'child' ? 'primary' : 'none'}
          />
          <span className="text-sm font-extrabold text-ink-700">
            สมาชิกคนที่ {index + 1}
          </span>
        </div>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-sm font-bold text-danger-500 hover:underline"
            aria-label={`ลบสมาชิกคนที่ ${index + 1}`}
          >
            ลบ
          </button>
        ) : null}
      </div>

      {/* Name */}
      <div>
        <label className="mb-1 block text-xs font-bold text-ink-600">ชื่อเล่น</label>
        <input
          type="text"
          value={member.name}
          maxLength={40}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="เช่น มิ้นท์"
          className="w-full rounded-xl border-2 border-cream-600 bg-cream-50 px-3 py-2.5 font-bold text-ink-900 outline-none focus:border-primary-500"
        />
        {errs.name ? (
          <p className="mt-1 text-xs font-semibold text-danger-500">{errs.name}</p>
        ) : null}
      </div>

      {/* Role toggle */}
      <div>
        <label className="mb-1 block text-xs font-bold text-ink-600">บทบาท</label>
        <div className="grid grid-cols-2 gap-2">
          {(['child', 'parent'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => onChange({ role: r })}
              className={cn(
                'rounded-xl border-2 py-2.5 text-sm font-extrabold transition',
                member.role === r
                  ? 'border-primary-600 bg-primary-300/30 text-primary-700'
                  : 'border-cream-600 bg-cream-50 text-ink-600 hover:border-primary-300',
              )}
            >
              {r === 'child' ? '🧒 เด็ก' : '🧑 ผู้ปกครอง'}
            </button>
          ))}
        </div>
      </div>

      {/* Photo */}
      <div>
        <label className="mb-1 block text-xs font-bold text-ink-600">
          รูปโปรไฟล์ (ไม่บังคับ)
        </label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void pickPhoto(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fileRef.current?.click()}
            leftIcon={<span aria-hidden>📷</span>}
          >
            {member.photo ? 'เปลี่ยนรูป' : 'เลือกรูป'}
          </Button>
          {member.photo ? (
            <Button variant="ghost" size="sm" onClick={clearPhoto}>
              เอารูปออก
            </Button>
          ) : null}
        </div>
        <p className="mt-1 text-xs font-semibold text-ink-500">
          {member.photo
            ? 'ใช้รูปนี้แทนอวตาร์ · อัปโหลดตอนกดเสร็จสิ้น'
            : 'ไม่เลือกก็ได้ — จะใช้อวตาร์ที่เลือกไว้'}
        </p>
      </div>

      {/* Avatar picker */}
      <div>
        <label className="mb-1 block text-xs font-bold text-ink-600">อวตาร์</label>
        <div className={cn('grid grid-cols-2 gap-2', member.photo && 'opacity-50')}>
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ avatar: a })}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-xl border-2 px-3 py-2 transition',
                member.avatar === a
                  ? 'border-primary-600 bg-primary-300/30'
                  : 'border-cream-600 bg-cream-50 hover:border-primary-300',
              )}
            >
              <Avatar character={a} size="sm" />
              <span className="min-w-0 truncate text-sm font-bold text-ink-800">
                {AVATAR_LABELS[a]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Age */}
      <div>
        <label className="mb-1 block text-xs font-bold text-ink-600">
          อายุ (ไม่บังคับ)
        </label>
        <input
          type="number"
          inputMode="numeric"
          min={2}
          max={25}
          value={member.age}
          onChange={(e) => onChange({ age: e.target.value })}
          placeholder="เช่น 9"
          className="w-28 rounded-xl border-2 border-cream-600 bg-cream-50 px-3 py-2.5 font-bold text-ink-900 outline-none focus:border-primary-500"
        />
        {errs.age ? (
          <p className="mt-1 text-xs font-semibold text-danger-500">{errs.age}</p>
        ) : null}
      </div>

      {/* Sign-in credentials — co-parents only */}
      {member.role === 'parent' ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-ink-600">
              อีเมล (สำหรับเข้าสู่ระบบ)
            </label>
            <input
              type="email"
              autoComplete="off"
              value={member.email}
              onChange={(e) => onChange({ email: e.target.value })}
              placeholder="เช่น mom@example.com"
              className="w-full rounded-xl border-2 border-cream-600 bg-cream-50 px-3 py-2.5 font-bold text-ink-900 outline-none focus:border-primary-500"
            />
            {errs.email ? (
              <p className="mt-1 text-xs font-semibold text-danger-500">{errs.email}</p>
            ) : null}
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-ink-600">
              รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={member.password}
              onChange={(e) => onChange({ password: e.target.value })}
              placeholder="••••••••"
              className="w-full rounded-xl border-2 border-cream-600 bg-cream-50 px-3 py-2.5 font-bold text-ink-900 outline-none focus:border-primary-500"
            />
            {errs.password ? (
              <p className="mt-1 text-xs font-semibold text-danger-500">
                {errs.password}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* PIN — children only */}
      {member.role === 'child' ? (
        <div>
          <label className="mb-1 block text-xs font-bold text-ink-600">
            PIN 4 หลัก (สำหรับเข้าสู่ระบบของเด็ก)
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={member.pin}
            maxLength={4}
            onChange={(e) =>
              onChange({ pin: e.target.value.replace(/\D/g, '').slice(0, 4) })
            }
            placeholder="••••"
            className="w-32 rounded-xl border-2 border-cream-600 bg-cream-50 px-3 py-2.5 text-center text-xl font-extrabold tracking-[0.4em] text-ink-900 outline-none focus:border-primary-500"
          />
          {errs.pin ? (
            <p className="mt-1 text-xs font-semibold text-danger-500">{errs.pin}</p>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

/**
 * MembersStep — add children + extra parents (design S2 "เพิ่มสมาชิก").
 *
 * Each member picks an animal avatar (or uploads a photo, which wins), a role,
 * an optional age, and then whatever that role needs to sign in: a 4-digit PIN
 * for a child, an email + password for a co-parent. Without the latter a
 * co-parent row exists but the person can never log in, which is the state this
 * step used to leave them in. The signed-in parent is implicit and not listed.
 */
export function MembersStep({
  members,
  onChange,
  showErrors,
  formError,
}: {
  members: DraftMember[]
  onChange: (members: DraftMember[]) => void
  showErrors: boolean
  formError?: string
}) {
  function patch(uid: string, p: Partial<DraftMember>) {
    onChange(members.map((m) => (m.uid === uid ? { ...m, ...p } : m)))
  }
  function remove(uid: string) {
    onChange(members.filter((m) => m.uid !== uid))
  }
  function add() {
    onChange([...members, newMember('child')])
  }

  return (
    <div>
      <CardTitle className="text-xl">เพิ่มสมาชิก</CardTitle>
      <CardSubtitle className="mt-1">
        เพิ่มลูก ๆ และผู้ปกครองอีกคน แก้ไขภายหลังได้
      </CardSubtitle>

      {formError ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-danger-500">
          {formError}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {members.map((m, i) => (
          <MemberEditor
            key={m.uid}
            member={m}
            index={i}
            canRemove={members.length > 1}
            showErrors={showErrors}
            onChange={(p) => patch(m.uid, p)}
            onRemove={() => remove(m.uid)}
          />
        ))}
      </div>

      <Button
        variant="secondary"
        fullWidth
        className="mt-4"
        onClick={add}
        leftIcon={<span aria-hidden>＋</span>}
      >
        เพิ่มสมาชิกอีกคน
      </Button>
    </div>
  )
}
