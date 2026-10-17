/**
 * app/manifest.test.ts — regression guard for the iOS "Add to Home Screen"
 * bug: a visitor who adds /pin/<slug> to their home screen with "Open as Web
 * App" launches the saved icon at `start_url`, not at the page they tapped
 * Share from. `start_url` must stay `/pin` (the family-less gate page that
 * reads the bookmarked slug — see RememberSlug.tsx) and never regress to `/`
 * (site root, which has no slug-aware redirect and bounces to /login).
 */
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
