'use client'

/**
 * app/pin/PinEntryForm.tsx — client half of the child PIN sign-in.
 * Pick a child, tap in a 4-digit PIN, then authenticate via the "child-pin"
 * CredentialsProvider. On success the child lands on their /child home.
 *
 * Styled with the shared "Cozy" tokens (cream / primary / ink) so it matches
 * the rest of the app rather than the old ad-hoc purple.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Avatar } from '@/components/ui'

export interface ChildOption {
  id: string
  name: string
  familyId: string
  /** Uploaded avatar as an inlined data URI, or null → illustrated fallback. */
  avatar: string | null
}

export default function PinEntryForm({ kids }: { kids: ChildOption[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<ChildOption | null>(
    kids.length === 1 ? kids[0] : null,
  )
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(finalPin: string, child: ChildOption) {
    setLoading(true)
    setError('')
    const res = await signIn('child-pin', {
      familyId: child.familyId,
      childId: child.id,
      pin: finalPin,
      redirect: false,
    })
    setLoading(false)
    if (!res || res.error) {
      setError('PIN ไม่ถูกต้อง ลองใหม่อีกครั้ง')
      setPin('')
      return
    }
    router.push('/child')
    router.refresh()
  }

  function pressDigit(d: string) {
    if (!selected || loading || pin.length >= 4) return
    const next = pin + d
    setPin(next)
    setError('')
    if (next.length === 4) void submit(next, selected)
  }

  function backspace() {
    setPin((p) => p.slice(0, -1))
    setError('')
  }

  if (kids.length === 0) {
    return (
      <p className="text-center text-sm font-semibold text-ink-500">
        ยังไม่มีเด็กที่ตั้ง PIN ในระบบ — ให้ผู้ปกครองเพิ่มสมาชิกและตั้ง PIN ก่อน
      </p>
    )
  }

  // Step 1: choose which child is signing in.
  if (!selected) {
    return (
      <div>
        <p className="mb-3 text-center text-sm font-bold text-ink-600">หนูคือใคร?</p>
        <div className="grid grid-cols-2 gap-3">
          {kids.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelected(c)}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-cream-500 bg-cream-100 p-4 transition hover:border-primary-500 hover:bg-primary-300/10"
            >
              <Avatar src={c.avatar} character="panda" name={c.name} size="lg" />
              <span className="font-extrabold text-ink-800">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Step 2: enter the 4-digit PIN.
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="font-extrabold text-ink-800">สวัสดี {selected.name}!</span>
        {kids.length > 1 ? (
          <button
            type="button"
            onClick={() => {
              setSelected(null)
              setPin('')
              setError('')
            }}
            className="text-xs font-bold text-primary-600 hover:underline"
          >
            เปลี่ยนคน
          </button>
        ) : null}
      </div>

      <div className="mb-5 flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full transition ${
              i < pin.length ? 'bg-primary-600' : 'bg-cream-500'
            }`}
          />
        ))}
      </div>

      {error ? (
        <p role="alert" className="mb-3 text-center text-sm font-semibold text-danger-500">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            disabled={loading}
            onClick={() => pressDigit(d)}
            className="rounded-2xl bg-cream-100 py-4 text-2xl font-extrabold text-ink-800 transition hover:bg-primary-300/20 active:scale-95 disabled:opacity-60"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          disabled={loading}
          onClick={() => pressDigit('0')}
          className="rounded-2xl bg-cream-100 py-4 text-2xl font-extrabold text-ink-800 transition hover:bg-primary-300/20 active:scale-95 disabled:opacity-60"
        >
          0
        </button>
        <button
          type="button"
          disabled={loading || pin.length === 0}
          onClick={backspace}
          className="rounded-2xl py-4 text-2xl font-extrabold text-ink-500 transition hover:text-ink-700 disabled:opacity-40"
          aria-label="ลบ"
        >
          ⌫
        </button>
      </div>
    </div>
  )
}
