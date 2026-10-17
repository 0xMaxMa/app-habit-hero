import type { MetadataRoute } from 'next'

/**
 * lib/webapp-manifest.ts — shared web-app-manifest shape for both the
 * site-wide manifest (app/manifest.ts, start_url '/pin') and the per-family
 * manifest served at /pin/<slug>/manifest.webmanifest (start_url '/pin/<slug>').
 *
 * iOS Safari's "Add to Home Screen" dialog reads whichever manifest is linked
 * from the CURRENT page and uses ITS `start_url` as the saved icon's URL,
 * discarding the page's actual address — confirmed empirically (tapping
 * Add to Home Screen from /pin/<slug> itself still showed only /pin in the
 * dialog while the site-wide manifest was linked everywhere). Pointing
 * `/pin/[slug]/page.tsx`'s manifest link at a slug-specific manifest (see
 * app/pin/[slug]/manifest.webmanifest/route.ts) makes that `start_url` the
 * family's own `/pin/<slug>`, so the saved icon is the full URL — no
 * localStorage/redirect round-trip required.
 */
export function buildWebAppManifest(startUrl: string): MetadataRoute.Manifest {
  return {
    name: 'HabitHero',
    short_name: 'HabitHero',
    description: 'A cozy habit and chore tracker for families',
    lang: 'th',
    start_url: startUrl,
    display: 'standalone',
    background_color: '#FBF5E9',
    theme_color: '#FBF5E9',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
