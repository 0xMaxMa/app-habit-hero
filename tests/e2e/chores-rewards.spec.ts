import { test, expect, type Page } from '@playwright/test'

/**
 * tests/e2e/chores-rewards.spec.ts — web E2E for parent Chore CRUD (§3.2) and
 * Reward management (§3.3).
 *
 * Cases:
 *   W-CHORE-1  create a chore (title/XP/recurrence/due_time/assignee) → in list
 *   W-CHORE-2  edit the chore's XP → new value reflected in the list
 *   W-CHORE-4  validation — empty title / negative XP → inline error, not saved
 *   W-REW-1    create a reward (title/emoji/XP cost) → appears in catalog
 *   W-REW-3    toggle is_active off → reward marked inactive
 *
 * No storageState is configured in playwright.config.ts, so every test logs in
 * through the real /login form using the seeded parent credentials from
 * prisma/seed.test.ts (parent@test.local / test1234). Seed data is shared and
 * this file only ever ADDS rows, so each create uses a unique title to stay
 * isolated across parallel workers and re-runs.
 */

// Seeded parent (prisma/seed.test.ts → IDS.parent "แม่ทดสอบ").
const PARENT_EMAIL = 'parent@test.local'
const PARENT_PASSWORD = 'test1234'

/** Log in as the seeded parent via the real credentials form. */
async function loginAsParent(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('อีเมล').fill(PARENT_EMAIL)
  await page.getByLabel('รหัสผ่าน').fill(PARENT_PASSWORD)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  // Successful sign-in pushes to the parent dashboard.
  await page.waitForURL('**/dashboard')
}

/** A collision-proof suffix so parallel workers / re-runs never clash. */
function unique(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1e4)}`
}

test.describe('Parent Chore CRUD (§3.2)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsParent(page)
    await page.goto('/chores')
    await expect(page.getByRole('heading', { name: 'งานบ้าน' })).toBeVisible()
  })

  test('W-CHORE-1: parent creates a chore and it appears in the list', async ({
    page,
  }) => {
    const title = unique('จัดโต๊ะ')

    await page.getByRole('button', { name: 'เพิ่มงาน' }).click()

    const dialog = page.getByRole('dialog', { name: 'สร้างงานใหม่' })
    await expect(dialog).toBeVisible()

    await dialog.getByLabel('ชื่องาน').fill(title)
    await dialog.getByLabel('แต้ม XP').fill('45')
    // Recurrence is a pressable button group.
    await dialog.getByRole('button', { name: 'รายสัปดาห์' }).click()
    await expect(
      dialog.getByRole('button', { name: 'รายสัปดาห์' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await dialog.getByLabel('ครบกำหนด (ไม่บังคับ)').fill('19:30')
    await dialog.getByLabel('มอบหมายให้').selectOption({ label: 'น้องเอ' })

    await dialog.getByRole('button', { name: 'บันทึกงาน' }).click()

    // Modal closes and the new chore shows up as a list row.
    await expect(dialog).toBeHidden()
    const row = page.getByRole('listitem').filter({ hasText: title })
    await expect(row).toBeVisible()
    await expect(row).toContainText('45') // XpBadge value
    await expect(row).toContainText('รายสัปดาห์')
    await expect(row).toContainText('น้องเอ')
  })

  test('W-CHORE-2: editing a chore XP is reflected in the list', async ({
    page,
  }) => {
    // Arrange: create a chore we solely own so the edit is deterministic.
    const title = unique('รดน้ำต้นไม้')
    await page.getByRole('button', { name: 'เพิ่มงาน' }).click()
    const createDialog = page.getByRole('dialog', { name: 'สร้างงานใหม่' })
    await createDialog.getByLabel('ชื่องาน').fill(title)
    await createDialog.getByLabel('แต้ม XP').fill('20')
    await createDialog.getByRole('button', { name: 'บันทึกงาน' }).click()
    await expect(createDialog).toBeHidden()

    const row = page.getByRole('listitem').filter({ hasText: title })
    await expect(row).toBeVisible()
    await expect(row).toContainText('20XP')

    // Act: open the edit modal for this chore and change its XP.
    await row.getByRole('button', { name: `แก้ไข ${title}` }).click()
    const editDialog = page.getByRole('dialog', { name: 'แก้ไขงานบ้าน' })
    await expect(editDialog).toBeVisible()
    const xp = editDialog.getByLabel('แต้ม XP')
    await expect(xp).toHaveValue('20')
    await xp.fill('75')
    await editDialog.getByRole('button', { name: 'บันทึกงาน' }).click()

    // Assert: saved value reflected in the list row. Match the "<n>XP" badge
    // text (not a bare number) — the unique title carries a timestamp that can
    // itself contain the digits we're checking for.
    await expect(editDialog).toBeHidden()
    await expect(row).toContainText('75XP')
    await expect(row).not.toContainText('20XP')
  })

  test('W-CHORE-4: empty title or negative XP shows inline error and does not save', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'เพิ่มงาน' }).click()
    const dialog = page.getByRole('dialog', { name: 'สร้างงานใหม่' })
    await expect(dialog).toBeVisible()

    // Case A — valid title but negative XP → XP error, modal stays open.
    // ChoreFormModal validates against a 5–999 range rather than just the sign,
    // so a negative value reports the range (XP_MIN–XP_MAX).
    await dialog.getByLabel('ชื่องาน').fill(unique('งานทดสอบ'))
    await dialog.getByLabel('แต้ม XP').fill('-5')
    await dialog.getByRole('button', { name: 'บันทึกงาน' }).click()
    await expect(dialog.getByText('แต้มต้องอยู่ระหว่าง 5–999')).toBeVisible()
    await expect(dialog).toBeVisible() // not saved / not dismissed

    // Case B — empty title → title error, modal still open.
    await dialog.getByLabel('ชื่องาน').fill('')
    await dialog.getByLabel('แต้ม XP').fill('10')
    await dialog.getByRole('button', { name: 'บันทึกงาน' }).click()
    await expect(dialog.getByText('กรุณาใส่ชื่องาน')).toBeVisible()
    await expect(dialog).toBeVisible()
  })
})

test.describe('Parent Reward management (§3.3)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsParent(page)
    await page.goto('/rewards')
    await expect(page.getByRole('heading', { name: 'รางวัล' })).toBeVisible()
  })

  test('W-REW-1: parent creates a reward and it appears in the catalog', async ({
    page,
  }) => {
    const title = unique('ดูหนัง')

    // Header CTA (the modal submit reuses the same Thai label, so scope by dialog).
    await page.getByRole('button', { name: 'เพิ่มรางวัล' }).click()
    const dialog = page.getByRole('dialog', { name: 'เพิ่มรางวัล' })
    await expect(dialog).toBeVisible()

    await dialog.getByLabel('อีโมจิรางวัล').fill('🎬')
    await dialog.getByLabel('ชื่อรางวัล').fill(title)
    await dialog.getByLabel('แต้มที่ใช้แลก (XP)').fill('120')
    await dialog.getByRole('button', { name: 'เพิ่มรางวัล' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
  })

  test('W-REW-3: toggling is_active off marks the reward inactive', async ({
    page,
  }) => {
    // Arrange: create an active reward we own.
    const title = unique('ขนมพิเศษ')
    await page.getByRole('button', { name: 'เพิ่มรางวัล' }).click()
    const dialog = page.getByRole('dialog', { name: 'เพิ่มรางวัล' })
    await dialog.getByLabel('ชื่อรางวัล').fill(title)
    await dialog.getByLabel('แต้มที่ใช้แลก (XP)').fill('60')
    await dialog.getByRole('button', { name: 'เพิ่มรางวัล' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()

    // Act: flip the per-card is_active switch off.
    const toggle = page.getByRole('switch', { name: `เปิดให้แลก ${title}` })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()

    // Assert: switch is off, its label reads "ปิดอยู่", card shows "ซ่อนอยู่".
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(toggle.locator('xpath=..')).toContainText('ปิดอยู่')
    const card = toggle.locator(
      'xpath=ancestor::div[contains(@class,"flex-col")][1]',
    )
    await expect(card.getByText('ซ่อนอยู่')).toBeVisible()
  })
})
