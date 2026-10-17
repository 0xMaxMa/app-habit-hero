/**
 * app/pin/page.tsx — bare /pin entry point (design S1, multi-family fix).
 *
 * This page has no family context of its own — it never queries or lists any
 * child, in any family. It only decides where to send the visitor:
 *
 *   - a browser signed in as a parent is redirected server-side to
 *     /pin/<their own family's slug>. The slug is looked up from the
 *     session's `familyId`, which came from the DB at sign-in, so no client
 *     input can steer a parent to another family's picker;
 *   - everyone else (no session, or a child session) gets PinEntryGateClient:
 *     a device that already bookmarked a family (RememberSlug wrote its slug
 *     into localStorage from a previous /pin/<slug> visit) is redirected
 *     straight there, no typing needed; otherwise it asks for the family's
 *     code ONCE and pushes to /pin/<code> — that page is the one that
 *     actually validates the code and, only once validated, lists that
 *     family's children.
 *
 * This is the fix for the cross-family leak the old single-family `/pin`
 * page had: it rendered a public list of children from EVERY family in the
 * database (`prisma.user.findMany({ where: { role: 'child' } })`, no
 * familyId filter at all). A multi-family deployment cannot repeat that — a
 * child list may only ever render once the family is known, which now means
 * only inside `/pin/[slug]`.
 */
import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/auth'
import { getFamilyPinSlug } from '@/lib/pin-picker'
import PinEntryGateClient from './PinEntryGateClient'

export const dynamic = 'force-dynamic'

export default async function PinEntryGatePage() {
  const user = await getSessionUser()
  if (user?.role === 'parent') {
    const slug = await getFamilyPinSlug(user.familyId)
    if (slug) redirect(`/pin/${slug}`)
  }
  return <PinEntryGateClient />
}
