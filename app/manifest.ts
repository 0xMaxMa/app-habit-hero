import type { MetadataRoute } from 'next'
import { buildWebAppManifest } from '@/lib/webapp-manifest'

/**
 * Web app manifest, served at /manifest.webmanifest (Next injects the
 * <link rel="manifest"> tag automatically into every page that doesn't
 * override it — see app/pin/[slug]/page.tsx's generateMetadata).
 *
 * This is what Android/Chrome reads on "Add to Home screen": without it the
 * browser invents a shortcut from the page title and favicon. iOS ignores most
 * of it and uses app/apple-icon.png + apple-mobile-web-app-title instead —
 * EXCEPT `start_url`. Because app/layout.tsx's `appleWebApp` metadata marks
 * this site as installable (`apple-mobile-web-app-capable`), iOS Safari's
 * "Add to Home Screen" launches the saved icon at the CURRENTLY LINKED
 * manifest's `start_url`, discarding whatever page was actually open when the
 * user tapped Share → Add to Home Screen — confirmed by real-device testing
 * that this fires even from `/pin/<slug>` itself while this site-wide
 * manifest was the only one linked. For a generic bookmark with no specific
 * family in view, `start_url` stays `/pin`, NOT `/` (site root → `/login` for
 * an anonymous visitor, with no family context at all): `/pin` is what reads
 * the bookmarked pinSlug RememberSlug wrote to localStorage on an earlier
 * visit and redirects to `/pin/<slug>` on devices where that storage is
 * actually shared with the standalone app (notably NOT iOS — see
 * app/pin/[slug]/manifest.webmanifest/route.ts for the fix that matters
 * there: a per-family manifest so Add to Home Screen from a family's own
 * page bakes that family's full URL into `start_url` directly).
 *
 * Colours are the app shell's cream (`cream-200`), i.e. the same value
 * globals.css paints on <html> — so the splash/status area matches the app
 * rather than the icon's green.
 */
export default function manifest(): MetadataRoute.Manifest {
  return buildWebAppManifest('/pin')
}
