/**
 * app/pin/[slug]/manifest.webmanifest/route.ts — per-family web app manifest.
 *
 * Served at /pin/<slug>/manifest.webmanifest with `start_url: /pin/<slug>`.
 * `app/pin/[slug]/page.tsx` links THIS manifest (via generateMetadata)
 * instead of the site-wide one, so iOS Safari's "Add to Home Screen" —
 * which launches the saved icon at whichever manifest is linked from the
 * page the user tapped Share from, not the page's own URL — bakes this
 * family's full `/pin/<slug>` into the saved icon directly. No
 * localStorage/redirect round-trip, and nothing for RememberSlug to race.
 *
 * A folder named `manifest.webmanifest` is an ordinary Next.js app-router
 * path segment (dots are valid in segment names); this is NOT the special
 * `manifest.ts` file convention, which only applies at the segment it lives
 * in and can't read this segment's `[slug]` param.
 */
import { NextResponse } from 'next/server'
import { buildWebAppManifest } from '@/lib/webapp-manifest'

export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const manifest = buildWebAppManifest(`/pin/${encodeURIComponent(params.slug)}`)
  return NextResponse.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json' },
  })
}
