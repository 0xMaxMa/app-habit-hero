'use client'

/**
 * app/pin/PinEntryGateClient.tsx — client half of the bare /pin gate, rendered
 * by app/pin/page.tsx for every visitor without a parent session. See that
 * file's header for the full routing rules.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PIN_SLUG_STORAGE_KEY } from './[slug]/RememberSlug'

export default function PinEntryGateClient() {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [code, setCode] = useState('')

  useEffect(() => {
    let remembered: string | null = null
    try {
      remembered = window.localStorage.getItem(PIN_SLUG_STORAGE_KEY)
    } catch {
      remembered = null
    }
    if (remembered) {
      router.replace(`/pin/${remembered}`)
      return
    }
    setChecked(true)
  }, [router])

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = code.trim().toLowerCase()
    if (!trimmed) return
    router.push(`/pin/${encodeURIComponent(trimmed)}`)
  }

  // Nothing renders while we check localStorage, to avoid a flash of the
  // code-entry form right before an instant redirect.
  if (!checked) {
    return <main className="flex min-h-dvh items-center justify-center bg-cream-200" />
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream-200 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 text-4xl">🏠</div>
          <h1 className="text-2xl font-extrabold text-primary-700">HabitHero</h1>
          <p className="mt-1 text-sm font-semibold text-ink-600">
            ใส่โค้ดครอบครัว (ขอจากผู้ปกครองได้ที่หน้าตั้งค่า)
          </p>
        </div>

        <div className="rounded-3xl bg-cream-50 p-6 shadow-soft ring-1 ring-black/5">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="pinSlug" className="mb-1 block text-sm font-bold text-ink-700">
                โค้ดครอบครัว
              </label>
              <input
                id="pinSlug"
                name="pinSlug"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="เช่น ab23cd"
                className="w-full rounded-xl border-2 border-cream-600 bg-cream-50 px-3 py-2.5 font-semibold text-ink-900 outline-none transition focus:border-primary-500"
              />
            </div>
            <button
              type="submit"
              disabled={!code.trim()}
              className="w-full rounded-2xl bg-primary-600 py-3 text-base font-extrabold text-white transition hover:bg-primary-700 disabled:opacity-50"
            >
              ไปหน้าเข้าสู่ระบบของหนู
            </button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-sm font-bold text-primary-600 hover:underline">
            ← ผู้ปกครอง เข้าสู่ระบบด้วยอีเมล
          </Link>
        </div>
      </div>
    </main>
  )
}
