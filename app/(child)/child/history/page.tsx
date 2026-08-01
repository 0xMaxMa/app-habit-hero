/**
 * app/(child)/child/history/page.tsx → /child/history
 *
 * The standalone history screen was merged into "งานของฉัน" (/child/tasks).
 * This route now permanently redirects there so any old bookmark/link keeps
 * working instead of 404-ing.
 */

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ChildHistoryPage() {
  redirect('/child/tasks')
}
