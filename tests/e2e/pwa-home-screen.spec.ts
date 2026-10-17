import { test, expect } from '@playwright/test'

/**
 * tests/e2e/pwa-home-screen.spec.ts — regression test for the iOS "Add to
 * Home Screen" bug: iOS bakes whichever manifest is LINKED from the current
 * page into the saved icon's `start_url`, discarding the page's own URL —
 * confirmed on-device even when Add to Home Screen was tapped directly from
 * `/pin/<slug>`, because that page was (before the fix below) still linking
 * the site-wide manifest, whose `start_url` is the generic `/pin` gate.
 * Playwright can't literally drive iOS's native Add-to-Home-Screen sheet, so
 * this proves the two things iOS actually reads:
 *
 *   1. `/pin/<slug>` links ITS OWN manifest (not the site-wide one), and that
 *      manifest's `start_url` is that exact family's `/pin/<slug>` — so Add
 *      to Home Screen from a family's own page bakes the full URL into the
 *      saved icon directly, no redirect involved;
 *   2. the site-wide manifest (linked from every other page, e.g. the bare
 *      `/pin` gate) still starts at `/pin`, not `/` (site root → `/login`
 *      for an anonymous visitor, with no family context at all) — a
 *      fallback for a bookmark saved with no specific family page open, and
 *      for platforms (Android/Chrome) that don't isolate installed-PWA
 *      storage from the browser, where RememberSlug's localStorage redirect
 *      still works.
 */

/** Matches prisma/seed.test.ts → IDS.familyPinSlug; update both together. */
const FAMILY_PIN_SLUG = 'pin-test-fam'

test('manifest start_url points at the slug-aware /pin gate, not the bare site root', async ({
  request,
}) => {
  const res = await request.get('/manifest.webmanifest')
  expect(res.ok()).toBe(true)
  const manifest = await res.json()
  expect(manifest.start_url).toBe('/pin')
})

/**
 * Regression test for the follow-up bug the per-family manifest introduced:
 * iOS only keeps navigation inside the standalone PWA while it stays within
 * the linked manifest's `scope`. An absent `scope` defaults to the directory
 * of `start_url` — '/' for the site-wide manifest's '/pin', but only '/pin/'
 * for the per-family manifest's '/pin/<slug>' — so tapping into the parent
 * dashboard or the child area (both outside '/pin/') dropped the user into
 * an in-app browser tab instead of staying standalone. Both manifests must
 * declare `scope: '/'` explicitly.
 */
test('both the site-wide and per-family manifests scope to the whole app, not just /pin/', async ({
  request,
}) => {
  const siteWide = await (await request.get('/manifest.webmanifest')).json()
  expect(siteWide.scope).toBe('/')

  const perFamily = await (await request.get(`/pin/${FAMILY_PIN_SLUG}/manifest.webmanifest`)).json()
  expect(perFamily.scope).toBe('/')
})

test("a family's own /pin/<slug> page links its own manifest, start_url baked to that family", async ({
  page,
  request,
}) => {
  await page.goto(`/pin/${FAMILY_PIN_SLUG}`)

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBe(`/pin/${FAMILY_PIN_SLUG}/manifest.webmanifest`)

  const res = await request.get(manifestHref!)
  expect(res.ok()).toBe(true)
  const manifest = await res.json()
  expect(manifest.start_url).toBe(`/pin/${FAMILY_PIN_SLUG}`)
})

test('a device that already bookmarked a family lands straight on it from bare /pin, like a home-screen tap would', async ({
  page,
}) => {
  // First visit to /pin/<slug> writes this device's remembered slug.
  await page.goto(`/pin/${FAMILY_PIN_SLUG}`)
  await expect(page.getByRole('heading', { name: 'เข้าด้วยรหัสเด็ก' })).toBeVisible()

  // A home-screen icon at start_url '/pin' launches here next.
  await page.goto('/pin')
  await page.waitForURL(`**/pin/${FAMILY_PIN_SLUG}`)
  expect(new URL(page.url()).pathname).toBe(`/pin/${FAMILY_PIN_SLUG}`)

  // Landed straight on the family's PIN picker — the code-entry gate form
  // never rendered in between.
  await expect(page.getByRole('heading', { name: 'เข้าด้วยรหัสเด็ก' })).toBeVisible()
  await expect(page.getByLabel('โค้ดครอบครัว')).not.toBeVisible()
})
