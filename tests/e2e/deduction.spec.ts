import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

/**
 * tests/e2e/deduction.spec.ts — web E2E for parent point deduction.
 *
 * Proves the three surfaces the feature spans actually work in a browser, not
 * just the API (that is covered by tests/integration/deductions.test.ts):
 *   - components/DeductPointsCard.tsx on app/(parent)/children/[id]/page.tsx
 *     → the form, the confirm dialog, the toast, and the timeline row
 *   - app/(parent)/history/page.tsx  → the entry in the family timeline
 *   - app/(child)/child/tasks/ChildTasks.tsx → the CHILD sees it, with the reason
 *
 * Fixtures come from prisma/seed.test.ts. This file uses น้องบี (600 XP) so the
 * deduction never hits the zero floor, and it is the only spec that writes that
 * child's XP (approval-history.spec.ts only creates a pending row for them).
 *
 * The three cases run in ORDER (serial): the deduction made in W-DEDUCT-1 is
 * what the other two read back.
 */

// --- Seeded fixture values (prisma/seed.test.ts — single source of truth) ---
const PARENT = { email: 'parent@test.local', password: 'test1234' }
const AGENT_TOKEN = 'test-agent-token' // == AGENT_API_TOKEN in .env.test
const PARENT_REF = 'gw:parent-1'
const CHILD_B = { id: 'usr_test_child_b', name: 'น้องบี', pin: '1234' }

const AMOUNT = 50
// Unique per run so re-running against a DB that was not re-seeded still finds
// exactly this spec's row rather than a leftover from the last run.
const REASON = `ไม่ทำการบ้าน e2e-${Date.now()}`

function agentHeaders(ref: string): Record<string, string> {
  return { 'x-agent-token': AGENT_TOKEN, 'x-actor-ref': ref }
}

async function getChildXp(request: APIRequestContext, childId: string): Promise<number> {
  const res = await request.get(`/api/progress?user=${childId}`, {
    headers: agentHeaders(PARENT_REF),
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).data.xp as number
}

/** The family's deductions as the parent actor (newest first). */
async function getDeductions(
  request: APIRequestContext,
): Promise<Array<{ id: string; amount: number; applied: number; reason: string }>> {
  const res = await request.get('/api/deductions', { headers: agentHeaders(PARENT_REF) })
  expect(res.ok(), await res.text()).toBeTruthy()
  return (await res.json()).data.deductions
}

async function loginAsParent(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('อีเมล').fill(PARENT.email)
  await page.getByLabel('รหัสผ่าน').fill(PARENT.password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForURL('**/dashboard')
}

// ---------------------------------------------------------------------------

test.describe.serial('Parent point deduction', () => {
  test('W-DEDUCT-1: parent deducts XP from the child profile → confirm, toast, timeline row, XP down', async ({
    page,
    request,
  }) => {
    await loginAsParent(page)
    await page.goto(`/children/${CHILD_B.id}`)
    await expect(page.getByRole('heading', { name: new RegExp(CHILD_B.name) }).first()).toBeVisible()

    // The deduct card renders once the profile data has loaded.
    const amount = page.getByLabel('จำนวนคะแนน (XP)')
    await expect(amount).toBeVisible()

    // Nothing to submit yet: reason is required, so the button starts disabled.
    const submit = page.getByRole('button', { name: 'หักคะแนน' })
    await expect(submit).toBeDisabled()

    await amount.fill(String(AMOUNT))
    // Still disabled — an amount alone must never be enough.
    await expect(submit).toBeDisabled()

    await page.getByLabel(/^เหตุผล/).fill(REASON)
    await expect(submit).toBeEnabled()

    // Read XP as late as possible so the delta assertion is tight.
    const xpBefore = await getChildXp(request, CHILD_B.id)

    // Step 2: the confirm dialog spells out the resulting balance before committing.
    await submit.click()
    const dialog = page.getByRole('dialog', { name: 'ยืนยันหักคะแนน?' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(REASON)
    // toLocaleString so a 4-digit balance ("1,150") still matches the DOM.
    await expect(dialog).toContainText((xpBefore - AMOUNT).toLocaleString())
    await dialog.getByRole('button', { name: `หัก ${AMOUNT} XP` }).click()

    // DOM: a toast, and the deduction now sits in the activity timeline.
    await expect(page.getByRole('status')).toContainText('หัก')
    const row = page.getByRole('listitem').filter({ hasText: REASON }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText('หักคะแนน')

    // API: the balance really moved, and the ledger row explains it.
    expect(await getChildXp(request, CHILD_B.id)).toBe(xpBefore - AMOUNT)
    const mine = (await getDeductions(request)).find((d) => d.reason === REASON)
    expect(mine, 'the deduction was recorded').toBeTruthy()
    expect(mine?.amount).toBe(AMOUNT)
    expect(mine?.applied).toBe(AMOUNT)
  })

  test('W-DEDUCT-2: the deduction appears in the parent history timeline with its reason', async ({
    page,
  }) => {
    await loginAsParent(page)
    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'ประวัติงานบ้าน' })).toBeVisible()

    const row = page.getByRole('listitem').filter({ hasText: REASON }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText('หักคะแนน')
    // Family-wide timeline → the row says which child it was.
    await expect(row).toContainText(CHILD_B.name)
    // The ➖ icon carries the sign; the XpBadge itself prints the magnitude.
    await expect(row).toContainText(String(AMOUNT))
  })

  test('W-DEDUCT-3: the CHILD sees the deduction and its reason in their own history', async ({
    page,
  }) => {
    await page.goto('/pin')
    await page.getByRole('button', { name: CHILD_B.name }).click()
    for (const digit of CHILD_B.pin) {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }
    await page.waitForURL('**/child')

    await page.goto('/child/tasks')
    await expect(page.getByRole('heading', { name: 'งานของฉัน' })).toBeVisible()

    // No silent deductions: the kid's own screen carries the amount AND the why.
    const row = page.getByRole('listitem').filter({ hasText: REASON }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText('หักคะแนน')
    // The ➖ icon carries the sign; the XpBadge itself prints the magnitude.
    await expect(row).toContainText(String(AMOUNT))
  })
})
