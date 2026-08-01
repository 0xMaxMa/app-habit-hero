'use client'

/**
 * app/(parent)/settings/page.tsx — S8 family settings (parent).
 *
 * The home for everything that isn't a chore/reward/approval:
 *   - rename the family                    (PATCH /api/family)
 *   - roster: add / rename / remove kids   (GET/POST/PATCH/DELETE /api/members)
 *     and reset a child's PIN
 *   - mint a one-time link code per member  (POST /api/link-code) so they can
 *     bind a chat identity to their account from the agent (redeemed via
 *     POST /api/link).
 *
 * Data is fetched client-side (the parent layout supplies the shell + guard),
 * so `next build` never touches Postgres.
 */

import * as React from 'react'
import { api, ApiError } from '@/lib/web/api'
import { useAutoRefresh } from '@/lib/web/useAutoRefresh'
import { downscaleImage } from '@/lib/web/image'
import { Avatar, Button, Card, cn, ConfirmDialog } from '@/components/ui'

type Member = {
  id: string
  name: string
  role: 'parent' | 'child'
  email: string | null
  hasPin: boolean
  linked: boolean
  linkCode: string | null
  avatarUrl: string | null
  isSelf: boolean
}

export default function SettingsPage() {
  const [members, setMembers] = React.useState<Member[] | null>(null)
  const [familyName, setFamilyName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent ?? false
    if (!silent) setError(null)
    try {
      const [fam, mem] = await Promise.all([
        api.get<{ family: { id: string; name: string } }>('/api/family'),
        api.get<{ members: Member[] }>('/api/members'),
      ])
      setFamilyName(fam.family.name)
      setMembers(mem.members)
      setError(null)
    } catch (err) {
      if (silent) return // background refresh — keep the last good view
      setError(err instanceof ApiError ? err.message : 'โหลดข้อมูลไม่สำเร็จ')
      setMembers([])
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  useAutoRefresh(() => load({ silent: true }))

  function upsertMember(m: Member) {
    setMembers((prev) => {
      const list = prev ?? []
      return list.some((x) => x.id === m.id)
        ? list.map((x) => (x.id === m.id ? m : x))
        : [...list, m]
    })
  }

  function removeMember(id: string) {
    setMembers((prev) => (prev ?? []).filter((x) => x.id !== id))
  }

  const children = (members ?? []).filter((m) => m.role === 'child')
  const parents = (members ?? []).filter((m) => m.role === 'parent')

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-ink-900">ตั้งค่า</h1>
        <p className="mt-0.5 text-sm text-ink-600">จัดการครอบครัว สมาชิก และรหัสเชื่อมแชท</p>
      </header>

      {error ? (
        <p className="mb-4 rounded-xl bg-danger-100 px-3 py-2 text-sm font-semibold text-danger-500">
          {error}
        </p>
      ) : null}

      <FamilySection
        name={familyName}
        onSaved={setFamilyName}
        onError={setError}
      />

      <ChildrenSection
        loading={members === null}
        kids={children}
        onUpsert={upsertMember}
        onRemove={removeMember}
        onError={setError}
      />

      {parents.length > 0 ? (
        <ParentsSection
          parents={parents}
          onUpsert={upsertMember}
          onRemove={removeMember}
          onError={setError}
        />
      ) : null}

      <ChangePasswordSection onError={setError} />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Family name                                                                */
/* -------------------------------------------------------------------------- */

function FamilySection({
  name,
  onSaved,
  onError,
}: {
  name: string
  onSaved: (n: string) => void
  onError: (e: string) => void
}) {
  const [value, setValue] = React.useState(name)
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => setValue(name), [name])

  const dirty = value.trim() !== name.trim() && value.trim().length > 0

  async function save() {
    setBusy(true)
    try {
      const data = await api.patch<{ family: { name: string } }>('/api/family', {
        name: value.trim(),
      })
      onSaved(data.family.name)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'บันทึกชื่อครอบครัวไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card padding="md" className="mb-6">
      <h2 className="mb-3 text-base font-extrabold text-ink-900">ชื่อครอบครัว</h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <TextInput value={value} onChange={setValue} placeholder="ชื่อครอบครัว" />
        </div>
        <Button onClick={save} disabled={!dirty || busy}>
          {busy ? 'กำลังบันทึก…' : 'บันทึก'}
        </Button>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Children roster                                                            */
/* -------------------------------------------------------------------------- */

function ChildrenSection({
  loading,
  kids,
  onUpsert,
  onRemove,
  onError,
}: {
  loading: boolean
  kids: Member[]
  onUpsert: (m: Member) => void
  onRemove: (id: string) => void
  onError: (e: string) => void
}) {
  const [adding, setAdding] = React.useState(false)

  return (
    <Card padding="md" className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-extrabold text-ink-900">เด็ก ๆ</h2>
        <Button
          size="sm"
          leftIcon={<span aria-hidden>➕</span>}
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          เพิ่มเด็ก
        </Button>
      </div>

      {/* Form sits directly under the header so tapping "เพิ่มเด็ก" reveals it
          in view — not buried below a long roster. */}
      {adding ? (
        <AddChildForm
          onAdded={(m) => {
            onUpsert(m)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
          onError={onError}
        />
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-ink-500">กำลังโหลด…</p>
      ) : kids.length === 0 && !adding ? (
        <p className="py-8 text-center text-sm text-ink-500">
          ยังไม่มีเด็กในระบบ — กด “เพิ่มเด็ก” เพื่อเริ่ม
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {kids.map((child) => (
            <MemberRow
              key={child.id}
              member={child}
              onUpsert={onUpsert}
              onRemove={onRemove}
              onError={onError}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

function AddChildForm({
  onAdded,
  onCancel,
  onError,
}: {
  onAdded: (m: Member) => void
  onCancel: () => void
  onError: (e: string) => void
}) {
  const [name, setName] = React.useState('')
  const [pin, setPin] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const valid = name.trim().length > 0 && /^\d{4}$/.test(pin)

  async function submit() {
    setBusy(true)
    try {
      const data = await api.post<{ member: Member }>('/api/members', {
        name: name.trim(),
        pin,
      })
      onAdded(data.member)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'เพิ่มเด็กไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <div className="mb-3 rounded-2xl border border-dashed border-cream-500 bg-cream-100 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <TextInput value={name} onChange={setName} placeholder="ชื่อเด็ก" autoFocus />
        <TextInput
          value={pin}
          onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
          placeholder="PIN 4 หลัก"
          inputMode="numeric"
        />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          ยกเลิก
        </Button>
        <Button size="sm" onClick={submit} disabled={!valid || busy}>
          {busy ? 'กำลังเพิ่ม…' : 'เพิ่ม'}
        </Button>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* One member row (child): rename, reset PIN, link code, delete               */
/* -------------------------------------------------------------------------- */

function MemberRow({
  member,
  onUpsert,
  onRemove,
  onError,
}: {
  member: Member
  onUpsert: (m: Member) => void
  onRemove: (id: string) => void
  onError: (e: string) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [name, setName] = React.useState(member.name)
  const [pin, setPin] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  // Type-to-confirm: deleting a child wipes their history, so the parent must
  // retype the child's name before the button unlocks.
  const [typed, setTyped] = React.useState('')
  const [removeError, setRemoveError] = React.useState<string | null>(null)
  const [code, setCode] = React.useState<string | null>(member.linkCode)
  const fileRef = React.useRef<HTMLInputElement>(null)

  async function uploadAvatar(file: File) {
    setBusy(true)
    try {
      // Shrink to an avatar-sized JPEG in the browser first — the original may
      // be a multi-MB phone photo, and avatars get inlined into the public /pin
      // page (see lib/web/image).
      const small = await downscaleImage(file, 256)
      const form = new FormData()
      form.append('avatar', small)
      const data = await api.postForm<{ member: Member }>(
        `/api/members/${member.id}/avatar`,
        form,
      )
      onUpsert(data.member)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'อัพโหลดรูปไม่สำเร็จ')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeAvatar() {
    setBusy(true)
    try {
      const data = await api.del<{ member: Member }>(`/api/members/${member.id}/avatar`)
      onUpsert(data.member)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'ลบรูปไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit() {
    const body: { name?: string; pin?: string } = {}
    if (name.trim() && name.trim() !== member.name) body.name = name.trim()
    if (/^\d{4}$/.test(pin)) body.pin = pin
    if (!body.name && !body.pin) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      const data = await api.patch<{ member: Member }>(`/api/members/${member.id}`, body)
      onUpsert(data.member)
      setPin('')
      setEditing(false)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function mintCode() {
    setBusy(true)
    try {
      const data = await api.post<{ code: string }>('/api/link-code', {
        userId: member.id,
      })
      setCode(data.code)
      onUpsert({ ...member, linkCode: data.code })
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'สร้างรหัสไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function doRemove() {
    setBusy(true)
    setRemoveError(null)
    try {
      await api.del(`/api/members/${member.id}`)
      setConfirmOpen(false)
      onRemove(member.id)
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <li className="rounded-2xl border border-cream-400 bg-white p-3">
      {editing ? (
        <div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <TextInput value={name} onChange={setName} placeholder="ชื่อเด็ก" />
            <TextInput
              value={pin}
              onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 4))}
              placeholder="ตั้ง PIN ใหม่ (เว้นว่าง = คงเดิม)"
              inputMode="numeric"
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
              ยกเลิก
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={busy}>
              บันทึก
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="group relative shrink-0 rounded-full disabled:opacity-60"
              aria-label={`เปลี่ยนรูป ${member.name}`}
            >
              <Avatar src={member.avatarUrl} name={member.name} size="md" />
              <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-primary text-[10px] text-white">
                📷
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void uploadAvatar(f)
              }}
            />
            <div className="min-w-0">
              <p className="truncate font-bold text-ink-900">{member.name}</p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                <Tag ok={member.hasPin}>{member.hasPin ? 'มี PIN' : 'ยังไม่มี PIN'}</Tag>
                <Tag ok={member.linked}>{member.linked ? 'เชื่อมแชทแล้ว' : 'ยังไม่เชื่อมแชท'}</Tag>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={busy}>
              แก้ไข
            </Button>
            <Button size="sm" variant="danger" onClick={() => { setRemoveError(null); setTyped(''); setConfirmOpen(true) }} disabled={busy}>
              ลบ
            </Button>
          </div>
        </div>
      )}

      {!editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-cream-300 pt-3">
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
            {member.avatarUrl ? 'เปลี่ยนรูป' : 'อัพโหลดรูป'}
          </Button>
          {member.avatarUrl ? (
            <Button size="sm" variant="ghost" onClick={removeAvatar} disabled={busy}>
              ลบรูป
            </Button>
          ) : null}
          {code ? (
            <span className="rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-primary-700">
              {code}
            </span>
          ) : null}
          <Button size="sm" variant="ghost" onClick={mintCode} disabled={busy}>
            {code ? 'สร้างรหัสใหม่' : 'สร้างรหัสเชื่อมแชท'}
          </Button>
          {code ? (
            <span className="text-xs text-ink-500">ให้เด็กส่งรหัสนี้ให้บอทเพื่อเชื่อมบัญชี</span>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        icon={<span aria-hidden>🗑️</span>}
        title={`ลบ "${member.name}"?`}
        message="สมาชิกและประวัติทั้งหมดจะถูกลบออกจากครอบครัว การกระทำนี้ย้อนกลับไม่ได้"
        confirmLabel="ลบออก"
        cancelLabel="ยกเลิก"
        busy={busy}
        confirmDisabled={typed.trim() !== member.name.trim()}
        onConfirm={doRemove}
        error={removeError}
        onCancel={() => { setConfirmOpen(false); setTyped(''); setRemoveError(null) }}
      >
        <label htmlFor={`confirm-del-${member.id}`} className="block text-sm font-bold text-ink-700">
          พิมพ์ชื่อ <span className="text-danger-500">“{member.name}”</span> เพื่อยืนยัน
        </label>
        <input
          id={`confirm-del-${member.id}`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={member.name}
          autoFocus
          className="mt-1.5 w-full rounded-xl border border-cream-500 bg-white px-3 py-2.5 text-ink-900 outline-none focus:border-danger-500 focus:ring-2 focus:ring-danger-500/20"
        />
      </ConfirmDialog>
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Parents (link codes only — no PIN/delete)                                  */
/* -------------------------------------------------------------------------- */

function ParentsSection({
  parents,
  onUpsert,
  onRemove,
  onError,
}: {
  parents: Member[]
  onUpsert: (m: Member) => void
  onRemove: (id: string) => void
  onError: (e: string) => void
}) {
  const [adding, setAdding] = React.useState(false)
  // Guard the UI the same way the API does: never offer to delete the last
  // parent (that would lock the family out).
  const canDeleteAny = parents.length > 1

  return (
    <Card padding="md" className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-extrabold text-ink-900">ผู้ปกครอง</h2>
        <Button
          size="sm"
          leftIcon={<span aria-hidden>➕</span>}
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          เพิ่มผู้ปกครอง
        </Button>
      </div>

      {/* Form under the header so the tap has an immediate, visible effect. */}
      {adding ? (
        <AddParentForm
          onAdded={(m) => {
            onUpsert(m)
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
          onError={onError}
        />
      ) : null}

      <ul className="flex flex-col gap-2">
        {parents.map((p) => (
          <ParentRow
            key={p.id}
            member={p}
            canDelete={canDeleteAny && !p.isSelf}
            onUpsert={onUpsert}
            onRemove={onRemove}
            onError={onError}
          />
        ))}
      </ul>
    </Card>
  )
}

function AddParentForm({
  onAdded,
  onCancel,
  onError,
}: {
  onAdded: (m: Member) => void
  onCancel: () => void
  onError: (e: string) => void
}) {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const valid = name.trim().length > 0 && emailOk && password.length >= 8

  async function submit() {
    setBusy(true)
    try {
      const data = await api.post<{ member: Member }>('/api/members', {
        role: 'parent',
        name: name.trim(),
        email: email.trim(),
        password,
      })
      onAdded(data.member)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'เพิ่มผู้ปกครองไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <div className="mb-3 rounded-2xl border border-dashed border-cream-500 bg-cream-100 p-3">
      <div className="flex flex-col gap-2">
        <TextInput value={name} onChange={setName} placeholder="ชื่อผู้ปกครอง" autoFocus />
        <TextInput value={email} onChange={setEmail} placeholder="อีเมล (ใช้เข้าสู่ระบบ)" />
        <TextInput
          value={password}
          onChange={setPassword}
          placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)"
          type="password"
        />
      </div>
      <p className="mt-2 text-xs text-ink-500">
        ผู้ปกครองคนใหม่เข้าสู่ระบบด้วยอีเมล + รหัสผ่านนี้ และเห็นข้อมูลครอบครัวเดียวกัน
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          ยกเลิก
        </Button>
        <Button size="sm" onClick={submit} disabled={!valid || busy}>
          {busy ? 'กำลังเพิ่ม…' : 'เพิ่ม'}
        </Button>
      </div>
    </div>
  )
}

function ParentRow({
  member,
  canDelete,
  onUpsert,
  onRemove,
  onError,
}: {
  member: Member
  canDelete: boolean
  onUpsert: (m: Member) => void
  onRemove: (id: string) => void
  onError: (e: string) => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [removeError, setRemoveError] = React.useState<string | null>(null)
  const [code, setCode] = React.useState<string | null>(member.linkCode)
  const fileRef = React.useRef<HTMLInputElement>(null)

  async function uploadAvatar(file: File) {
    setBusy(true)
    try {
      // Shrink to an avatar-sized JPEG in the browser first — the original may
      // be a multi-MB phone photo, and avatars get inlined into the public /pin
      // page (see lib/web/image).
      const small = await downscaleImage(file, 256)
      const form = new FormData()
      form.append('avatar', small)
      const data = await api.postForm<{ member: Member }>(
        `/api/members/${member.id}/avatar`,
        form,
      )
      onUpsert(data.member)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'อัพโหลดรูปไม่สำเร็จ')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeAvatar() {
    setBusy(true)
    try {
      const data = await api.del<{ member: Member }>(`/api/members/${member.id}/avatar`)
      onUpsert(data.member)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'ลบรูปไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function mintCode() {
    setBusy(true)
    try {
      const data = await api.post<{ code: string }>('/api/link-code', { userId: member.id })
      setCode(data.code)
      onUpsert({ ...member, linkCode: data.code })
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'สร้างรหัสไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function doRemove() {
    setBusy(true)
    setRemoveError(null)
    try {
      await api.del(`/api/members/${member.id}`)
      setConfirmOpen(false)
      onRemove(member.id)
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : 'ลบไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <li className="rounded-2xl border border-cream-400 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="group relative shrink-0 rounded-full disabled:opacity-60"
            aria-label={`เปลี่ยนรูป ${member.name}`}
          >
            <Avatar src={member.avatarUrl} name={member.name} size="md" />
            <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-white bg-primary text-[10px] text-white">
              📷
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void uploadAvatar(f)
            }}
          />
          <div className="min-w-0">
            <p className="truncate font-bold text-ink-900">
              {member.name}
              {member.isSelf ? (
                <span className="ml-1.5 rounded-pill bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary-700">
                  คุณ
                </span>
              ) : null}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
              {member.email ? (
                <span className="truncate text-ink-500">{member.email}</span>
              ) : null}
              <Tag ok={member.linked}>{member.linked ? 'เชื่อมแชทแล้ว' : 'ยังไม่เชื่อมแชท'}</Tag>
            </div>
          </div>
        </div>
        {canDelete ? (
          <Button size="sm" variant="danger" onClick={() => { setRemoveError(null); setConfirmOpen(true) }} disabled={busy}>
            ลบ
          </Button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-cream-300 pt-3">
        <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
          {member.avatarUrl ? 'เปลี่ยนรูป' : 'อัพโหลดรูป'}
        </Button>
        {member.avatarUrl ? (
          <Button size="sm" variant="ghost" onClick={removeAvatar} disabled={busy}>
            ลบรูป
          </Button>
        ) : null}
        {code ? (
          <span className="rounded-lg bg-primary/10 px-2.5 py-1 font-mono text-sm font-bold tracking-widest text-primary-700">
            {code}
          </span>
        ) : null}
        <Button size="sm" variant="ghost" onClick={mintCode} disabled={busy}>
          {code ? 'สร้างรหัสใหม่' : 'สร้างรหัสเชื่อมแชท'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        icon={<span aria-hidden>🗑️</span>}
        title={`ลบผู้ปกครอง "${member.name}"?`}
        message="บัญชีนี้จะเข้าสู่ระบบไม่ได้อีก การกระทำนี้ย้อนกลับไม่ได้"
        confirmLabel="ลบออก"
        cancelLabel="ยกเลิก"
        busy={busy}
        onConfirm={doRemove}
        error={removeError}
        onCancel={() => { setConfirmOpen(false); setRemoveError(null) }}
      />
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Change my own login password                                               */
/* -------------------------------------------------------------------------- */

function ChangePasswordSection({ onError }: { onError: (e: string) => void }) {
  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState(false)

  const mismatch = confirm.length > 0 && next !== confirm
  const valid =
    current.length > 0 && next.length >= 8 && next === confirm

  async function submit() {
    setBusy(true)
    setDone(false)
    try {
      await api.patch('/api/account/password', {
        currentPassword: current,
        newPassword: next,
      })
      setCurrent('')
      setNext('')
      setConfirm('')
      setDone(true)
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card padding="md" className="mb-6">
      <h2 className="mb-1 text-base font-extrabold text-ink-900">เปลี่ยนรหัสผ่าน</h2>
      <p className="mb-3 text-sm text-ink-600">
        รหัสผ่านสำหรับเข้าสู่ระบบของบัญชีที่คุณใช้อยู่ตอนนี้
      </p>
      <div className="flex flex-col gap-2 sm:max-w-md">
        <TextInput
          value={current}
          onChange={(v) => {
            setCurrent(v)
            setDone(false)
          }}
          placeholder="รหัสผ่านปัจจุบัน"
          type="password"
        />
        <TextInput
          value={next}
          onChange={(v) => {
            setNext(v)
            setDone(false)
          }}
          placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)"
          type="password"
        />
        <TextInput
          value={confirm}
          onChange={(v) => {
            setConfirm(v)
            setDone(false)
          }}
          placeholder="ยืนยันรหัสผ่านใหม่"
          type="password"
        />
      </div>
      {mismatch ? (
        <p className="mt-2 text-xs font-semibold text-danger-500">รหัสผ่านใหม่ไม่ตรงกัน</p>
      ) : null}
      {done ? (
        <p className="mt-2 text-xs font-semibold text-success-500">เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ✓</p>
      ) : null}
      <div className="mt-3">
        <Button onClick={submit} disabled={!valid || busy}>
          {busy ? 'กำลังบันทึก…' : 'เปลี่ยนรหัสผ่าน'}
        </Button>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/* Small presentational helpers                                               */
/* -------------------------------------------------------------------------- */

function TextInput({
  value,
  onChange,
  placeholder,
  inputMode,
  type = 'text',
  autoFocus,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  inputMode?: 'numeric' | 'text'
  type?: 'text' | 'password' | 'email'
  autoFocus?: boolean
}) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl border border-cream-500 bg-white px-3 py-2.5 text-ink-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
    />
  )
}

function Tag({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-pill px-2 py-0.5 text-xs font-semibold',
        ok ? 'bg-success-100 text-success-500' : 'bg-cream-300 text-ink-600',
      )}
    >
      {children}
    </span>
  )
}
