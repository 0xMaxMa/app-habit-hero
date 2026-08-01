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

export const metadata = {
  title: 'HabitHero',
  description: 'A cozy habit and chore tracker for families',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${mali.variable} ${nunito.variable}`}>
      <body>{children}</body>
    </html>
  )
}
