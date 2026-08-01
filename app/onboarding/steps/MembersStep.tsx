'use client'

import {
  Avatar,
  Button,
  Card,
  CardTitle,
  CardSubtitle,
  cn,
} from '@/components/ui'
import { AVATARS, memberSchema, type MemberAvatar } from '@/lib/onboarding'
import { newMember, type DraftMember } from '../draft'

const AVATAR_LABEL: Record<MemberAvatar, string> = {
  panda: 'แพนด้า',
  fox: 'สุนัขจิ้งจอก',
}

/** Validate one draft member, returning field errors keyed by path. */
function memberErrors(m: DraftMember): Record<string, string> {
  const ageNum = m.age.trim() === '' ? undefined : Number(m.age)
  const res = memberSchema.safeParse({
    name: m.name.trim(),
    avatar: m.avatar,
    role: m.role,
    age: ageNum !== undefined && Number.isFinite(ageNum) ? ageNum : undefined,
    pin: m.role === 'child' ? m.pin.trim() : undefined,
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

  return (
    <Card padding="md" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar
            character={member.avatar}
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

      {/* Avatar picker */}
      <div>
        <label className="mb-1 block text-xs font-bold text-ink-600">อวตาร์</label>
        <div className="grid grid-cols-2 gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onChange({ avatar: a })}
              className={cn(
                'flex items-center gap-2 rounded-xl border-2 px-3 py-2 transition',
                member.avatar === a
                  ? 'border-primary-600 bg-primary-300/30'
                  : 'border-cream-600 bg-cream-50 hover:border-primary-300',
              )}
            >
              <Avatar character={a} size="sm" />
              <span className="text-sm font-bold text-ink-800">
                {AVATAR_LABEL[a]}
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
 * Each member picks a panda/fox avatar, a role, an optional age, and (for
 * children) a 4-digit PIN. The signed-in parent is implicit and not listed.
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
