'use client'

/**
 * app/signup/page.tsx — public family sign-up (design S1b, Phase A).
 *
 * Open registration: any visitor can create a brand-new Family + themselves as
 * its first parent, as many times as they like (POST /api/signup). Replaces
 * the old one-time /setup, which refused after the very first family ever
 * created on a deployment — that gate (`needsSetup()`) is gone, so this page no
 * longer guards itself against "already done"; there is no such state anymore.
 *
 * After sign-up succeeds it signs the new parent in and hands off to
 * /onboarding to name the family, add children and pick starter chores.
 */

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui'
import { api, ApiError } from '@/lib/web/api'

const inputCls =
  'w-full rounded-xl border-2 border-cream-600 bg-cream-50 px-3 py-2.5 ' +
  'font-semibold text-ink-900 outline-none transition focus:border-primary-500'

export default function SignupPage() {
  const router = useRouter()

  const [parentName, setParentName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/api/signup', {
        email,
        password,
        parentName: parentName || undefined,
        familyName: familyName || undefined,
      })
      const res = await signIn('parent', { email, password, redirect: false })
      if (!res || res.error) {
        // Account made but auto sign-in failed — send them to login to retry.
        router.push('/login')
        return
      }
      router.push('/onboarding')
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'สร้างบัญชีไม่สำเร็จ ลองอีกครั้งนะ')
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream-200 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 text-4xl">🦸</div>
          <h1 className="text-2xl font-extrabold text-primary-700">HabitHero</h1>
          <p className="mt-1 text-sm font-semibold text-ink-600">สร้างครอบครัวใหม่</p>
        </div>

        <div className="rounded-3xl bg-cream-50 p-6 shadow-soft ring-1 ring-black/5">
          <h2 className="mb-1 text-lg font-extrabold text-ink-900">เริ่มต้นใช้งาน</h2>
          <p className="mb-4 text-xs font-semibold text-ink-500">
            บัญชีนี้จะเป็นผู้ปกครองของครอบครัวใหม่ของคุณ
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <Field
              id="parentName"
              label="ชื่อผู้ปกครอง"
              value={parentName}
              onChange={setParentName}
              placeholder="เช่น คุณแม่"
              autoComplete="name"
            />
            <Field
              id="familyName"
              label="ชื่อครอบครัว"
              value={familyName}
              onChange={setFamilyName}
              placeholder="เช่น ครอบครัวสุขสันต์"
            />
            <Field
              id="email"
              label="อีเมล"
              type="email"
              required
              value={email}
              onChange={setEmail}
              placeholder="parent@example.com"
              autoComplete="email"
            />
            <Field
              id="password"
              label="รหัสผ่าน (อย่างน้อย 8 ตัว)"
              type="password"
              required
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              autoComplete="new-password"
            />

            {error ? (
              <p
                role="alert"
                className="rounded-xl bg-danger-100 px-3 py-2 text-sm font-semibold text-danger-500"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" size="lg" fullWidth disabled={loading}>
              {loading ? 'กำลังสร้างบัญชี…' : 'สร้างครอบครัวและเริ่มต้น'}
            </Button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="text-sm font-bold text-primary-600 hover:underline"
          >
            มีบัญชีแล้ว? เข้าสู่ระบบ
          </button>
        </div>
      </div>
    </main>
  )
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  required = false,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  required?: boolean
  autoComplete?: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-ink-700">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  )
}
