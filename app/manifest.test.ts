/**
 * app/manifest.test.ts — regression guard for the iOS "Add to Home Screen"
 * bug: a visitor who adds /pin/<slug> to their home screen with "Open as Web
 * App" launches the saved icon at `start_url`, not at the page they tapped
 * Share from. `start_url` must stay `/pin` (the family-less gate page that
 * reads the bookmarked slug — see RememberSlug.tsx) and never regress to `/`
 * (site root, which has no slug-aware redirect and bounces to /login).
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import manifest from './manifest'

describe('app manifest', () => {
  it('starts at the /pin gate, not the bare site root', () => {
    expect(manifest().start_url).toBe('/pin')
  })

  it('is still a standalone, installable manifest', () => {
    const m = manifest()
    expect(m.display).toBe('standalone')
    expect(m.icons?.length).toBeGreaterThan(0)
  })
})

/**
 * Lists every route the app actually serves (every `page.tsx` under `app/`),
 * so the scope check below exercises the real route tree instead of a
 * hand-picked sample. Route groups like `(parent)` and `(child)` are
 * filesystem-only and don't appear in the URL, so they're dropped.
 */
function listPageRoutes(dir: string, segments: string[] = []): string[] {
  const routes: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const isRouteGroup = entry.name.startsWith('(') && entry.name.endsWith(')')
      routes.push(...listPageRoutes(join(dir, entry.name), isRouteGroup ? segments : [...segments, entry.name]))
    } else if (entry.name === 'page.tsx') {
      routes.push(`/${segments.join('/')}`)
    }
  }
  return routes
}

describe('manifest scope', () => {
  it('covers every page route in the app, both parent and child areas', () => {
    const appRoutes = listPageRoutes(join(__dirname))
    expect(appRoutes).toContain('/')
    expect(appRoutes).toContain('/pin/[slug]')
    expect(appRoutes).toContain('/dashboard')
    expect(appRoutes).toContain('/child')

    const scope = manifest().scope
    for (const route of appRoutes) {
      expect(route.startsWith(scope as string), `route "${route}" is outside manifest scope "${scope}"`).toBe(true)
    }
  })
})
