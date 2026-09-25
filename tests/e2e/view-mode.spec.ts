import { test, expect, type Page } from '@playwright/test'

/**
 * tests/e2e/view-mode.spec.ts — web E2E for the shared ViewMode toggle
 * (row list ↔ thumbnail grid) and its per-list localStorage persistence.
 *
 * Target: app/(child)/child/rewards/ChildRewards.tsx → /child/rewards
 * (section aria-label "รางวัลที่แลกได้") — chosen as the representative page
 * because its catalog rows (เล่นเกม 1 ชม. / ค่าขนม 20 บาท / ตั๋วเครื่องบินญี่ปุ่น,
 * prisma/seed.test.ts) are static seed data untouched by any other spec, so
 * this file's assertions never race another file's mutations.
 *
 * Shared pieces under test:
 *   - components/ui/ViewModeToggle.tsx  (aria-pressed pill pair)
 *   - lib/web/useViewModePreference.ts  (localStorage key habithero:view-mode:<listId>)
 */

const CHILD_A_NAME = 'น้องเอ'
/** Matches prisma/seed.test.ts → CHILD_TEST_PIN. */
const CHILD_A_PIN = '1234'

const CATALOG_KEY = 'habithero:view-mode:child-rewards-catalog'
const REQUESTS_KEY = 'habithero:view-mode:child-rewards-requests'

async function loginAsChildA(page: Page): Promise<void> {
  await page.goto('/pin')
  await page.getByRole('button', { name: CHILD_A_NAME }).click()
  for (const digit of CHILD_A_PIN) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.waitForURL('**/child')
}

test.describe('ViewMode toggle (list ↔ grid)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsChildA(page)
    await page.goto('/child/rewards')
    await expect(page.getByText('เล่นเกม 1 ชม.')).toBeVisible()
  })

  test('W-VM-1: defaults to row-list layout', async ({ page }) => {
    const catalog = page.locator('section[aria-label="รางวัลที่แลกได้"]')
    await expect(catalog.locator('> div.grid')).toHaveCount(0)

    await expect(page.getByRole('button', { name: 'มุมมองรายการแถว' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: 'มุมมองตาราง' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  test('W-VM-2: toggling to grid switches layout and keeps full functionality', async ({
    page,
  }) => {
    const catalog = page.locator('section[aria-label="รางวัลที่แลกได้"]')

    await page.getByRole('button', { name: 'มุมมองตาราง' }).click()

    await expect(page.getByRole('button', { name: 'มุมมองตาราง' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(catalog.locator('> div.grid')).toHaveCount(1)

    // All three seeded rewards still render, each with its XP cost and a
    // working redeem button (the same "แลกเลย"/"ยังไม่พอ" action as row mode).
    await expect(page.getByText('เล่นเกม 1 ชม.')).toBeVisible()
    await expect(page.getByText('ค่าขนม 20 บาท')).toBeVisible()
    await expect(page.getByText('ตั๋วเครื่องบินญี่ปุ่น')).toBeVisible()
    await expect(
      page.getByRole('button', { name: /แลกเลย|ยังไม่พอ/ }).first(),
    ).toBeVisible()

    // Toggling back returns to the row layout.
    await page.getByRole('button', { name: 'มุมมองรายการแถว' }).click()
    await expect(catalog.locator('> div.grid')).toHaveCount(0)
  })

  test('W-VM-3: the grid choice persists after a reload', async ({ page }) => {
    await page.getByRole('button', { name: 'มุมมองตาราง' }).click()
    await expect(
      page.locator('section[aria-label="รางวัลที่แลกได้"] > div.grid'),
    ).toHaveCount(1)

    await page.reload()
    await expect(page.getByText('เล่นเกม 1 ชม.')).toBeVisible()

    await expect(page.getByRole('button', { name: 'มุมมองตาราง' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(
      page.locator('section[aria-label="รางวัลที่แลกได้"] > div.grid'),
    ).toHaveCount(1)

    const stored = await page.evaluate((key) => window.localStorage.getItem(key), CATALOG_KEY)
    expect(stored).toBe('grid')
  })

  test('W-VM-4: the choice is scoped per list — another list on the same page stays list-mode', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'มุมมองตาราง' }).click()
    await expect(
      page.locator('section[aria-label="รางวัลที่แลกได้"] > div.grid'),
    ).toHaveCount(1)

    const requestsStored = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      REQUESTS_KEY,
    )
    expect(requestsStored).toBeNull() // never toggled → no stored preference yet
  })
})
