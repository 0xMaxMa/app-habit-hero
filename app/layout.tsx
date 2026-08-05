import type { Metadata, Viewport } from 'next'
import { Mali, Nunito } from 'next/font/google'
import './globals.css'

/**
 * HabitHero "Cozy" typography — matches the exported Claude design, which uses
 * `font-family: Mali, Nunito`. Mali (a rounded Thai display face) leads and
 * covers Thai + Latin; Nunito is the Latin fallback. Both are self-hosted by
 * next/font (fetched + bundled at build), so the running app never depends on
 * Google's CDN at runtime. Their CSS variables feed `--font-cozy` in
 * globals.css / the Tailwind `sans` stack.
 */
const mali = Mali({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mali',
  display: 'swap',
})

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
  variable: '--font-nunito',
  display: 'swap',
})

/**
 * The icons themselves come from Next's file conventions — app/icon.png,
 * app/apple-icon.png and app/favicon.ico are picked up automatically, so no
 * `icons` field is declared here. `appleWebApp.title` is the one thing Safari
 * will not infer: without it an iOS Home Screen shortcut is labelled with the
 * page <title> of whatever page happened to be open when it was added.
 */
export const metadata: Metadata = {
  title: 'HabitHero',
  description: 'A cozy habit and chore tracker for families',
  applicationName: 'HabitHero',
  appleWebApp: { title: 'HabitHero' },
}

export const viewport: Viewport = {
  // Stated explicitly rather than relying on how Next merges a partial
  // `viewport` export with its defaults — themeColor is the only new field.
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FBF5E9',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${mali.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  )
}
