import { test, expect } from '@playwright/test'

/**
 * tests/e2e/pwa-home-screen.spec.ts — regression test for the iOS "Add to
 * Home Screen" bug: iOS launches a home-screen PWA icon at the manifest's
 * `start_url` (app/manifest.ts), not at the page the user tapped Share from.
 * Playwright can't literally drive iOS's native Add-to-Home-Screen sheet, so
 * this proves the two halves of the fix that make it work in practice:
 *
 *   1. the manifest really serves `start_url: '/pin'` (not '/', which has no
 *      slug-aware redirect and bounces an anonymous visitor to /login);
 *   2. landing on /pin — exactly what tapping that home-screen icon does —
 *      redirects straight to /pin/<slug> once this device has already
 *      bookmarked a family (RememberSlug.tsx writes that slug to
 *      localStorage on any /pin/<slug> visit; app/pin/page.tsx reads it
 *      back).
 *
 * Together: tap icon → launches /pin → localStorage redirect → /pin/<slug>,
 * with no re-typing the family code.
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
