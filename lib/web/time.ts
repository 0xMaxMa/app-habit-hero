/**
 * lib/web/time.ts — clock labels for screens where "1 ชั่วโมงที่แล้ว" alone is
 * not enough to decide anything.
 *
 * A parent approving a morning chore needs the wall-clock time ("ส่งเมื่อ 07:45")
 * to judge it against the chore's due time ("⏰ 07:00"). Both are rendered in
 * Thailand's zone — the same fixed +7 that `deadlineForDueTime` (lib/point-rules)
 * uses to decide late-vs-on-time — so the time on the card can never disagree
 * with the ⏰/สาย chip next to it, even on a device set to another timezone.
 *
 * Pure: `now` is injected, never read from Date.now() here.
 */

const BANGKOK = 'Asia/Bangkok'

// h23 (not hour12:false) — some ICU builds render midnight as "24:00" otherwise.
const TIME_FMT = new Intl.DateTimeFormat('th-TH', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: BANGKOK,
})

const DATE_FMT = new Intl.DateTimeFormat('th-TH', {
  day: 'numeric',
  month: 'short',
  timeZone: BANGKOK,
})

// Sortable YYYY-MM-DD *in Bangkok*, used to compare calendar days without
// dragging the runtime's local timezone into it.
const DAY_KEY_FMT = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: BANGKOK,
})

/** "07:45" — the Bangkok wall-clock time of an instant. */
export function clockTime(at: Date): string {
  return TIME_FMT.format(at)
}

/** Bangkok calendar day as YYYY-MM-DD, for same-day / yesterday checks. */
export function bangkokDayKey(at: Date): string {
  return DAY_KEY_FMT.format(at)
}

/** Friendly Thai "time ago". */
export function timeAgo(at: Date, now: Date): string {
  const mins = Math.floor((now.getTime() - at.getTime()) / 60_000)
  if (mins < 1) return 'เมื่อสักครู่'
  if (mins < 60) return `${mins} นาทีที่แล้ว`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`
  const days = Math.floor(hrs / 24)
  return `${days} วันที่แล้ว`
}

/**
 * When something was submitted, led by the clock time because that is what the
 * parent compares against a due time. Returns the whole phrase so Thai reads
 * naturally on every branch ("ส่งเมื่อ" + "เมื่อวาน" would double up):
 *   today     → "ส่งเมื่อ 07:36 น. · 40 นาทีที่แล้ว"
 *   yesterday → "ส่งเมื่อวาน 21:15 น."
 *   older     → "ส่งเมื่อ 1 ส.ค. 21:15 น."
 */
export function submittedLabel(at: Date, now: Date): string {
  if (Number.isNaN(at.getTime())) return ''
  const hhmm = `${clockTime(at)} น.`
  const day = bangkokDayKey(at)
  if (day === bangkokDayKey(now)) return `ส่งเมื่อ ${hhmm} · ${timeAgo(at, now)}`
  const yesterday = new Date(now.getTime() - 86_400_000)
  if (day === bangkokDayKey(yesterday)) return `ส่งเมื่อวาน ${hhmm}`
  return `ส่งเมื่อ ${DATE_FMT.format(at)} ${hhmm}`
}
