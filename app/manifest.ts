import type { MetadataRoute } from 'next'

/**
 * Web app manifest, served at /manifest.webmanifest (Next injects the
 * <link rel="manifest"> tag automatically).
 *
 * This is what Android/Chrome reads on "Add to Home screen": without it the
 * browser invents a shortcut from the page title and favicon. iOS ignores most
 * of it and uses app/apple-icon.png + apple-mobile-web-app-title instead —
 * EXCEPT `start_url`. Because app/layout.tsx's `appleWebApp` metadata marks
 * this site as installable (`apple-mobile-web-app-capable`), iOS Safari's
 * "Add to Home Screen" with "Open as Web App" launches the saved icon at this
 * manifest's `start_url`, not at whatever page was open when the user tapped
 * Share → Add to Home Screen. `start_url` must therefore be `/pin`, the
 * family-less gate page, NOT `/` (site root → `/login` for an anonymous
 * visitor, with no family context at all): `/pin` is what reads the
 * bookmarked pinSlug RememberSlug wrote to localStorage on an earlier visit
 * and redirects straight to `/pin/<slug>` — that is the only reason a kid's
 * home-screen icon lands back on their own family's PIN pad instead of
 * re-asking for the family code every time.
 *
 * Colours are the app shell's cream (`cream-200`), i.e. the same value
 * globals.css paints on <html> — so the splash/status area matches the app
 * rather than the icon's green.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HabitHero',
    short_name: 'HabitHero',
    description: 'A cozy habit and chore tracker for families',
    lang: 'th',
    start_url: '/pin',
    display: 'standalone',
    background_color: '#FBF5E9',
    theme_color: '#FBF5E9',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
