/**
 * app/pin/[slug]/page.tsx — child PIN sign-in, scoped to ONE family.
 *
 * Multi-family (Phase A): the old `app/pin/page.tsx` listed children from
 * EVERY family on a public, unauthenticated page — a real cross-family PII
 * leak once more than one family can exist (see the Phase A plan). The fix:
 * a child list may only ever be rendered for a family resolved from this
 * route's `slug` (Family.pinSlug, lib/pin-slug.ts) — there is no code path
 * left that lists children without one.
 *
 * `slug` is the bookmarkable part: a parent sets this page's URL as their
 * home device's bookmark/home-screen icon ONCE (the URL is shown on the
 * Settings page), and every visit after that goes straight to their own
 * family's child picker — no login, nothing to type, nothing to read for the
 * child. RememberSlug (a tiny client component) also writes the slug to
 * localStorage on a successful load, so a visit to the bare /pin (which has
 * no family context of its own) can redirect here automatically next time.
 *
 * Server component: loads this family's children (role=child) so a kid can
 * pick their avatar, then hands off to the client form for PIN entry.
 * force-dynamic so the DB query never runs at build time.
 */
import Link from 'next/link'
import { loadFamilyChildrenBySlug } from '@/lib/pin-picker'
import PinEntryForm from './PinEntryForm'
import { RememberSlug, ForgetSlug } from './RememberSlug'

export const dynamic = 'force-dynamic'

export default async function FamilyPinPage({ params }: { params: { slug: string } }) {
  const children = await loadFamilyChildrenBySlug(params.slug)

  if (children === null) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-cream-200 px-4 py-12">
        <ForgetSlug />
        <div className="w-full max-w-sm text-center">
          <div className="mb-2 text-4xl">🔎</div>
          <h1 className="mb-1 text-xl font-extrabold text-primary-700">ไม่พบครอบครัวนี้</h1>
          <p className="mb-6 text-sm font-semibold text-ink-600">
            ลิงก์หรือโค้ดนี้ไม่ถูกต้อง ลองขอลิงก์ใหม่จากผู้ปกครอง
          </p>
          <Link href="/pin" className="text-sm font-bold text-primary-600 hover:underline">
            ← ใส่โค้ดครอบครัวใหม่
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream-200 px-4 py-12">
      <RememberSlug slug={params.slug} />
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-2 text-4xl">🧒</div>
          <h1 className="text-2xl font-extrabold text-primary-700">
            เข้าด้วยรหัสเด็ก
          </h1>
          <p className="mt-1 text-sm font-semibold text-ink-600">ใส่ PIN 4 หลักของหนู</p>
        </div>

        <div className="rounded-3xl bg-cream-50 p-6 shadow-soft ring-1 ring-black/5">
          <PinEntryForm kids={children} />
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="text-sm font-bold text-primary-600 hover:underline"
          >
            ← ผู้ปกครอง เข้าสู่ระบบด้วยอีเมล
          </Link>
        </div>
      </div>
    </main>
  )
}
