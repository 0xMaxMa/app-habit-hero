/**
 * app/pin/page.tsx — child PIN sign-in (design S1: "เข้าด้วยรหัสเด็ก / PIN 4 หลัก").
 *
 * Server component: loads the children (role=child) so a kid can pick their
 * avatar, then hands off to the client form for the 4-digit PIN entry. Reading
 * the children here avoids needing a separate list endpoint (single-family MVP).
 *
 * force-dynamic so the DB query never runs at build time.
 */
import path from 'node:path'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { readPhoto } from '@/lib/api'
import PinEntryForm, { type ChildOption } from './PinEntryForm'

export const dynamic = 'force-dynamic'

async function loadChildren(): Promise<ChildOption[]> {
  try {
    const kids = await prisma.user.findMany({
      where: { role: 'child', pinHash: { not: null } },
      select: { id: true, name: true, familyId: true, avatarUrl: true },
      orderBy: { name: 'asc' },
    })
    // The picker is a PUBLIC (pre-login) page, but /api/avatars is auth-gated —
    // a client <img> would 401. So inline each uploaded avatar as a data URI on
    // the server instead of opening the avatar route to unauthenticated users.
    return Promise.all(
      kids.map(async (k) => {
        let avatar: string | null = null
        if (k.avatarUrl) {
          try {
            const { data, contentType } = await readPhoto(path.basename(k.avatarUrl))
            avatar = `data:${contentType};base64,${data.toString('base64')}`
          } catch {
            avatar = null // file missing → fall back to the illustrated face
          }
        }
        return { id: k.id, name: k.name, familyId: k.familyId, avatar }
      }),
    )
  } catch {
    // DB unavailable (e.g. first boot) — render an empty picker rather than 500.
    return []
  }
}

export default async function PinPage() {
  const children = await loadChildren()

  return (
    <main className="flex min-h-dvh items-center justify-center bg-cream-200 px-4 py-12">
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
