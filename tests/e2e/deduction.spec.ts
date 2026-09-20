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
 * Also covers undoing that same deduction (POST /api/deductions/:id/cancel,
 * tests/integration/deductions-cancel.test.ts has the API-level cases —
 * restore-on-floor, idempotent 409, cross-family 403, the concurrent-cancel
 * race). Cancelling is ONLY offered on the parent history page — every other
 * surface (the "ไทม์ไลน์กิจกรรม" widget on the child profile page, and the
 * child's own tasks page) renders the row read-only, active or cancelled:
 *   - the "ยกเลิก" button + confirm dialog on the history page
 *   - the row reading "ยกเลิกแล้ว" with no cancel control anywhere else, on
 *     BOTH the child profile timeline and the child's own tasks page — and
 *     the child profile's hero XP figure reflecting the restore on its next
 *     fetch (a plain refetch, not a live cross-page update — there is no
 *     button there to trigger one)
 *
 * Fixtures come from prisma/seed.test.ts. This file uses น้องบี (600 XP) and is
 * the only spec that writes that child's XP (approval-history.spec.ts only
 * creates a pending row for them). W-DEDUCT-1..6 keep the balance non-floored;
 * W-DEDUCT-7 deliberately floors it at 0 (asserting the badge shows what was
 * actually taken, not what was requested) then cancels to restore it.
 *
 * The cases run in ORDER (serial): the deduction made in W-DEDUCT-1 is what
 * the rest read back, and the cancel in W-DEDUCT-4 is what W-DEDUCT-5/6 read back.
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
): Promise<
  Array<{ id: string; amount: number; applied: number; reason: string; cancelledAt: string | null }>
> {
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
    // The "ไทม์ไลน์กิจกรรม" widget is read-only, like every other row in it —
    // cancelling only lives on the history page.
    await expect(row.getByRole('button', { name: 'ยกเลิก' })).toHaveCount(0)

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
    // The history page is the only surface offering the cancel action.
    await expect(row.getByRole('button', { name: 'ยกเลิก' })).toBeVisible()
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
    // A kid must never be offered the cancel action.
    await expect(row.getByRole('button', { name: 'ยกเลิก' })).toHaveCount(0)
  })

  test('W-DEDUCT-4: parent cancels the deduction from the history page → confirm, toast, XP restored', async ({
    page,
    request,
  }) => {
    await loginAsParent(page)
    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'ประวัติงานบ้าน' })).toBeVisible()

    const xpBefore = await getChildXp(request, CHILD_B.id)

    const row = page.getByRole('listitem').filter({ hasText: REASON }).first()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'ยกเลิก' }).click()

    // The confirm dialog spells out the reason and the resulting restore before committing.
    const dialog = page.getByRole('dialog', { name: 'ยกเลิกการหักคะแนน?' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(REASON)
    await dialog.getByRole('button', { name: 'ยกเลิก' }).click()

    // DOM: a toast, and the row now reads cancelled with its button gone.
    await expect(page.getByRole('status')).toContainText('ยกเลิก')
    await expect(row).toContainText('ยกเลิกแล้ว')
    await expect(row.getByRole('button', { name: 'ยกเลิก' })).toHaveCount(0)

    // API: the balance really moved back, and the ledger row itself says cancelled.
    expect(await getChildXp(request, CHILD_B.id)).toBe(xpBefore + AMOUNT)
    const mine = (await getDeductions(request)).find((d) => d.reason === REASON)
    expect(mine?.cancelledAt, 'the deduction is marked cancelled').toBeTruthy()
  })

  test('W-DEDUCT-5: the child profile timeline picks up the cancel on its next fetch — read-only, XP restored', async ({
    page,
    request,
  }) => {
    // The child profile's "ไทม์ไลน์กิจกรรม" widget has no cancel button of its
    // own (W-DEDUCT-1), so there is nothing there to trigger a live update —
    // a plain page load/refetch is what has to pick up the cancel made in
    // W-DEDUCT-4 from the history page.
    const xp = await getChildXp(request, CHILD_B.id)

    await loginAsParent(page)
    await page.goto(`/children/${CHILD_B.id}`)
    await expect(page.getByRole('heading', { name: new RegExp(CHILD_B.name) }).first()).toBeVisible()

    // Hero XP figure reflects the restored balance on this fresh fetch.
    await expect(page.getByText(`XP สะสม ${xp.toLocaleString()}`)).toBeVisible()

    const row = page.getByRole('listitem').filter({ hasText: REASON }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText('ยกเลิกแล้ว')
    await expect(row.getByRole('button', { name: 'ยกเลิก' })).toHaveCount(0)
  })

  test('W-DEDUCT-6: the CHILD sees the cancelled deduction too, with no cancel control ever offered', async ({
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

    const row = page.getByRole('listitem').filter({ hasText: REASON }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText('ยกเลิกแล้ว')
    // A kid must never be offered the cancel action, cancelled or not.
    await expect(row.getByRole('button', { name: 'ยกเลิก' })).toHaveCount(0)
  })

  test('W-DEDUCT-7: a deduction that floors at 0 shows what was actually taken, not what was requested', async ({
    page,
    request,
  }) => {
    // W-DEDUCT-1 took 50 off น้องบี and W-DEDUCT-4 cancelled it, so the balance
    // is back to its seeded 600 here — comfortably under MAX_DEDUCTION_XP
    // (1000), so a 900-XP ask both floors the balance AND stays form-valid.
    await loginAsParent(page)
    await page.goto(`/children/${CHILD_B.id}`)
    await expect(page.getByRole('heading', { name: new RegExp(CHILD_B.name) }).first()).toBeVisible()

    const xpBefore = await getChildXp(request, CHILD_B.id)
    const REQUESTED = 900
    const FLOOR_REASON = `หักเกินยอด e2e-${Date.now()}`

    const amount = page.getByLabel('จำนวนคะแนน (XP)')
    await amount.fill(String(REQUESTED))
    await page.getByLabel(/^เหตุผล/).fill(FLOOR_REASON)
    await page.getByRole('button', { name: 'หักคะแนน' }).click()

    // The confirm button itself already reads the applied (floored) amount.
    const dialog = page.getByRole('dialog', { name: 'ยืนยันหักคะแนน?' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: `หัก ${xpBefore} XP` }).click()
    await expect(page.getByRole('status')).toContainText('หัก')

    // DOM: the timeline badge must read the FLOORED amount (applied), never
    // the full requested amount — this is the bug the code review caught.
    const row = page.getByRole('listitem').filter({ hasText: FLOOR_REASON }).first()
    await expect(row).toBeVisible()
    await expect(row).toContainText(`คะแนนไม่พอ หักได้ ${xpBefore.toLocaleString()} XP`)
    await expect(row).toContainText(String(xpBefore))
    await expect(row).not.toContainText(String(REQUESTED))
    // Still read-only here — cancelling only happens from the history page.
    await expect(row.getByRole('button', { name: 'ยกเลิก' })).toHaveCount(0)

    expect(await getChildXp(request, CHILD_B.id)).toBe(0)

    // Clean up via the history page (the only surface with the cancel action)
    // so this test leaves น้องบี's balance exactly as it found it, whatever
    // future tests land after this one.
    await page.goto('/history')
    const historyRow = page.getByRole('listitem').filter({ hasText: FLOOR_REASON }).first()
    await expect(historyRow).toBeVisible()
    await historyRow.getByRole('button', { name: 'ยกเลิก' }).click()
    const cancelDialog = page.getByRole('dialog', { name: 'ยกเลิกการหักคะแนน?' })
    await expect(cancelDialog).toBeVisible()
    await cancelDialog.getByRole('button', { name: 'ยกเลิก' }).click()
    await expect(page.getByRole('status')).toContainText('ยกเลิก')

    expect(await getChildXp(request, CHILD_B.id)).toBe(xpBefore)
  })
})
