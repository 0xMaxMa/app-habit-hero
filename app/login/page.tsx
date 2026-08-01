'use client'

/**
 * app/login/page.tsx — parent sign-in (design S1).
 * Email + password via the "parent" CredentialsProvider, with a link over to
 * the child PIN entry ("เข้าด้วยรหัสเด็ก / PIN 4 หลัก").
 *
 * Uses the shared "Cozy" design system (cream surfaces, blue primary, the
 * chunky <Button>) so the login buttons match the in-app buttons.
 */
import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui'
import { api } from '@/lib/web/api'

const inputCls =
  'w-full rounded-xl border-2 border-cream-600 bg-cream-50 px-3 py-2.5 ' +
  'font-semibold text-ink-900 outline-none transition focus:border-primary-500'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = params.get('callbackUrl') || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Only surface the first-run "create account" link while no parent exists.
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .get<{ needsSetup: boolean }>('/api/setup')
      .then((d) => alive && setNeedsSetup(d.needsSetup))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('parent', {
      email,
      password,
      redirect: false,
    })
    setLoading(false)
    if (!res || res.error) {
      setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง')
      return
    }
    router.push(callbackUrl)
    router.refresh()
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream-200 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 text-4xl">🦸</div>
          <h1 className="text-2xl font-extrabold text-primary-700">HabitHero</h1>
          <p className="mt-1 text-sm font-semibold text-ink-600">
            วินัยเล็กๆ ที่สร้างฮีโร่ตัวจริง
          </p>
        </div>

        <div className="rounded-3xl bg-cream-50 p-6 shadow-soft ring-1 ring-black/5">
          <h2 className="mb-4 text-lg font-extrabold text-ink-900">เข้าสู่ระบบ</h2>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-bold text-ink-700">
                อีเมล
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
                placeholder="parent@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-bold text-ink-700">
                รหัสผ่าน
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
              />
            </div>

            <div className="text-sm">
              <label className="flex items-center gap-2 font-semibold text-ink-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-cream-600 text-primary-600"
                />
                จำฉันไว้
              </label>
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-xl bg-danger-100 px-3 py-2 text-sm font-semibold text-danger-500"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" variant="primary" size="lg" fullWidth disabled={loading}>
              {loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
            </Button>
          </form>
        </div>

        <div className="mt-6 space-y-3 text-center">
          <p className="text-xs font-semibold text-ink-500">เด็กหรือผู้ปกครอง?</p>
          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={() => router.push('/pin')}
            leftIcon={<span aria-hidden>🧒</span>}
          >
            เข้าด้วยรหัสเด็ก / PIN 4 หลัก
          </Button>

          {needsSetup ? (
            <p className="pt-1 text-sm font-semibold text-ink-600">
              ยังไม่มีบัญชี?{' '}
              <button
                type="button"
                onClick={() => router.push('/setup')}
                className="font-extrabold text-primary-600 hover:underline"
              >
                สร้างบัญชีผู้ปกครอง
              </button>
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={<main className="flex min-h-dvh items-center justify-center bg-cream-200" />}
    >
      <LoginForm />
    </Suspense>
  )
}
