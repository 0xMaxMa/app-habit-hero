'use client'

/**
 * app/pin/page.tsx — bare /pin entry point (design S1, multi-family fix).
 *
 * This page has no family context of its own — it never queries or lists any
 * child, in any family. It only decides where to send the visitor:
 *
 *   - a device that already bookmarked a family (RememberSlug wrote its slug
 *     into localStorage from a previous /pin/<slug> visit) is redirected
 *     straight there, no typing needed;
 *   - otherwise it asks for the family's code ONCE and pushes to
 *     /pin/<code> — that page is the one that actually validates the code
 *     and, only once validated, lists that family's children.
 *
 * This is the fix for the cross-family leak the old single-family `/pin`
 * page had: it rendered a public list of children from EVERY family in the
 * database (`prisma.user.findMany({ where: { role: 'child' } })`, no
 * familyId filter at all). A multi-family deployment cannot repeat that — a
 * child list may only ever render once the family is known, which now means
 * only inside `/pin/[slug]`.
 */
import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { PIN_SLUG_STORAGE_KEY } from './[slug]/RememberSlug'

export default function PinEntryGatePage() {
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
                placeholder="เช่น abc123xy89"
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
