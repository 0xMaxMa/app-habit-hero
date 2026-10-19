// @vitest-environment node

/**
 * Regression guard for the iOS "Add to Home Screen" bug: iOS bakes whichever
 * manifest is LINKED from the current page into the saved icon's start_url,
 * even when tapped from `/pin/<slug>` itself (confirmed on-device — the
 * site-wide manifest's static `/pin` start_url was what got saved). This
 * per-family manifest must report that family's own `/pin/<slug>` back, so
 * `/pin/[slug]/page.tsx` linking it makes the saved icon the full URL.
 */
import { describe, it, expect } from 'vitest'
import { GET } from './route'

describe('GET /pin/[slug]/manifest.webmanifest', () => {
  it("starts at this family's own /pin/<slug>, not the site-wide gate", async () => {
    const res = await GET(new Request('http://x/pin/p95v4c/manifest.webmanifest'), {
      params: { slug: 'p95v4c' },
    })
    const body = await res.json()

    expect(body.start_url).toBe('/pin/p95v4c')
    expect(res.headers.get('content-type')).toBe('application/manifest+json')
  })

  it("scopes to the whole app, not just /pin/, so navigating to the parent dashboard or the child area stays inside the standalone PWA", async () => {
    const res = await GET(new Request('http://x/pin/p95v4c/manifest.webmanifest'), {
      params: { slug: 'p95v4c' },
    })
    const body = await res.json()

    expect(body.scope).toBe('/')
  })

  it('is still a standalone, installable manifest', async () => {
    const res = await GET(new Request('http://x/pin/abc123/manifest.webmanifest'), {
      params: { slug: 'abc123' },
    })
    const body = await res.json()

    expect(body.display).toBe('standalone')
    expect(body.icons?.length).toBeGreaterThan(0)
  })

  it('encodes a slug with URL-unsafe characters instead of corrupting the path', async () => {
    const res = await GET(new Request('http://x/pin/has space/manifest.webmanifest'), {
      params: { slug: 'has space' },
    })
    const body = await res.json()

    expect(body.start_url).toBe('/pin/has%20space')
  })
})
