import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

/**
 * tests/e2e/approval-history.spec.ts — web E2E for the parent APPROVAL queue
 * (T12 · §3.4) and the HISTORY timeline (T13 · §3.4).
 *
 * Target pages (read for the real Thai copy the selectors below rely on):
 *   - app/(parent)/approvals/page.tsx  → /approvals  (h1 "อนุมัติ")
 *   - app/(parent)/history/page.tsx    → /history    (h1 "ประวัติงานบ้าน")
 *   - app/(parent)/ParentNav.tsx       (nav labels "อนุมัติ" / "ประวัติ")
 *   - components/ui/StatusChip.tsx     (approved→"เสร็จแล้ว", pending→"รออนุมัติ",
 *                                        rejected→"ปฏิเสธ")
 *
 * Setup strategy — a pending completion has to exist before the browser steps.
 * We create it out-of-band with Playwright's `request` fixture, calling the SAME
 * REST API the gateway agent uses (app/api/completions/route.ts): a multipart
 * POST authenticated as the AGENT actor (`x-agent-token` + `x-actor-ref` =
 * the child's channelUserRef from prisma/seed.test.ts). Side-effects are then
 * asserted back through that API (XP via /api/progress, status via
 * /api/completions) where the DOM is ambiguous.
 *
 * These three cases share state and run in ORDER (serial): W-APPR-1 approves,
 * W-APPR-2 rejects, and W-HIST-1 reads the timeline built from both. Serial mode
 * also keeps น้องเอ's XP deterministic — the only writer of that child's XP in
 * the whole suite is this file, so the "XP unchanged after reject" assertion
 * never races a concurrent approve.
 */

// --- Seeded fixture values (prisma/seed.test.ts — single source of truth) ---
const PARENT = { email: 'parent@test.local', password: 'test1234' }
const AGENT_TOKEN = 'test-agent-token' // == AGENT_API_TOKEN in .env.test

const PARENT_REF = 'gw:parent-1' // IDS.parent channelUserRef
const CHILD_A = { ref: 'gw:child-a', id: 'usr_test_child_a', name: 'น้องเอ' }
const CHILD_B = { ref: 'gw:child-b', id: 'usr_test_child_b', name: 'น้องบี' }

// Seeded chores. NOTE: every seeded chore has requirePhoto=true (there is no
// "no-photo" chore in prisma/seed.test.ts — see the assumption note in the
// task report), so createPending() always uploads a tiny photo.
//   ล้างรถ  — 100 XP, recurrence "once", NO dueTime → approval awards the full
//             100 XP with no late penalty (deterministic +100).
//   เก็บของเล่น — 30 XP, shared (assignedTo null) → any child may submit it.
const CHORE_CAR = { id: 'chore_test_car', title: 'ล้างรถ' }
const CHORE_TOYS = { id: 'chore_test_toys', title: 'เก็บของเล่น' }

// A 1x1 PNG — enough to satisfy the requirePhoto guard + savePhoto (lib/api/photo).
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

// --- API helpers (raw REST envelope is { ok, data }; see lib/api/respond.ts) --

/** Agent auth headers for a given actor channelUserRef. */
function agentHeaders(ref: string): Record<string, string> {
  return { 'x-agent-token': AGENT_TOKEN, 'x-actor-ref': ref }
}

/**
 * Create a pending ChoreCompletion for a child via the agent API and return its
 * id. Mirrors POST /api/completions (multipart: child, chore_id, photo).
 */
async function createPending(
  request: APIRequestContext,
  child: { ref: string },
  chore: { id: string },
): Promise<string> {
  const res = await request.post('/api/completions', {
    headers: agentHeaders(child.ref),
    multipart: {
      child: child.ref,
      chore_id: chore.id,
      photo: { name: 'proof.png', mimeType: 'image/png', buffer: PNG_1PX },
    },
  })
  expect(res.status(), await res.text()).toBe(201)
  const body = await res.json()
  expect(body.ok).toBe(true)
  expect(body.data.completion.status).toBe('pending')
  return body.data.completion.id as string
}

/** Read a child's current total XP through the parent-scoped progress API. */
async function getChildXp(request: APIRequestContext, childId: string): Promise<number> {
  const res = await request.get(`/api/progress?user=${childId}`, {
    headers: agentHeaders(PARENT_REF),
  })
  expect(res.ok(), await res.text()).toBeTruthy()
  const body = await res.json()
  return body.data.xp as number
}

/** Fetch family-scoped completions (optionally by status) as the parent actor. */
async function getCompletions(
  request: APIRequestContext,
  status?: 'pending' | 'approved' | 'rejected',
): Promise<Array<{ id: string; status: string; feedback: string | null }>> {
  const path = status ? `/api/completions?status=${status}` : '/api/completions'
  const res = await request.get(path, { headers: agentHeaders(PARENT_REF) })
  expect(res.ok(), await res.text()).toBeTruthy()
  const body = await res.json()
  return body.data.completions
}

// --- Browser helper ---------------------------------------------------------

/** Log in as the seeded parent via the real /login credentials form. */
async function loginAsParent(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('อีเมล').fill(PARENT.email)
  await page.getByLabel('รหัสผ่าน').fill(PARENT.password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForURL('**/dashboard')
}

/** The approval-queue cards (each ApprovalCard is a direct child of the section). */
function approvalCards(page: Page) {
  return page.locator('section[aria-label="งานที่รออนุมัติ"] > *')
}

// ---------------------------------------------------------------------------
// §3.4 APPROVAL + HISTORY — shared, ordered flow.
// ---------------------------------------------------------------------------

test.describe.serial('Approval + History (§3.4)', () => {
  test('W-APPR-1: parent approves a pending completion → row disappears, XP rises', async ({
    page,
    request,
  }) => {
    const xpBefore = await getChildXp(request, CHILD_A.id)
    const completionId = await createPending(request, CHILD_A, CHORE_CAR)

    await loginAsParent(page)
    await page.goto('/approvals')
    await expect(
      page.getByRole('heading', { name: 'อนุมัติ', exact: true, level: 1 }),
    ).toBeVisible()

    // Act on the newest ล้างรถ card (my row; the queue is submittedAt-asc so it
    // renders last). Clicking approve should drop exactly that card.
    //
    // The h1 above renders before the queue fetch resolves and `count()` does
    // not auto-wait, so gate on the card itself first — otherwise this reads 0.
    const carCards = approvalCards(page).filter({ hasText: CHORE_CAR.title })
    await expect(carCards.first()).toBeVisible()
    const countBefore = await carCards.count()
    expect(countBefore).toBeGreaterThan(0)

    // Approving is two-step: "อนุมัติ" opens an XP/note panel on the card, and
    // "ยืนยัน +<xp> XP" commits it.
    const card = carCards.last()
    await card.getByRole('button', { name: 'อนุมัติ' }).click()
    await card.getByRole('button', { name: /^ยืนยัน \+\d+ XP$/ }).click()

    // DOM: one fewer pending ล้างรถ card + a success toast.
    await expect(carCards).toHaveCount(countBefore - 1)
    await expect(page.getByRole('status')).toContainText('อนุมัติ')

    // API: my completion is no longer pending, and น้องเอ's XP went up (+100,
    // the full award since ล้างรถ has no dueTime → no late penalty).
    const pendingIds = (await getCompletions(request, 'pending')).map((c) => c.id)
    expect(pendingIds).not.toContain(completionId)

    const approved = await getCompletions(request, 'approved')
    expect(approved.find((c) => c.id === completionId)?.status).toBe('approved')

    const xpAfter = await getChildXp(request, CHILD_A.id)
    expect(xpAfter).toBeGreaterThan(xpBefore)
  })

  test('W-APPR-2: parent rejects with feedback → no XP change, status rejected', async ({
    page,
    request,
  }) => {
    const completionId = await createPending(request, CHILD_A, CHORE_TOYS)

    await loginAsParent(page)
    await page.goto('/approvals')
    await expect(
      page.getByRole('heading', { name: 'อนุมัติ', exact: true, level: 1 }),
    ).toBeVisible()

    const toyCards = approvalCards(page).filter({ hasText: CHORE_TOYS.title })
    // Same as W-APPR-1: wait for the queue to render before the non-waiting count().
    await expect(toyCards.first()).toBeVisible()
    const countBefore = await toyCards.count()
    expect(countBefore).toBeGreaterThan(0)

    // Read XP immediately before the act so the "unchanged" check is tight.
    const xpBefore = await getChildXp(request, CHILD_A.id)

    // Open the inline reject box on my (newest) card, type feedback, confirm.
    const card = toyCards.last()
    await card.getByRole('button', { name: 'ตีกลับ' }).click()
    const feedback = 'ยังเก็บของไม่ครบนะ ลองอีกที'
    await card.getByRole('textbox').fill(feedback)
    await card.getByRole('button', { name: 'ยืนยันตีกลับ' }).click()

    // DOM: card removed + toast.
    await expect(toyCards).toHaveCount(countBefore - 1)
    await expect(page.getByRole('status')).toContainText('ตีกลับ')

    // API: the completion is rejected, carries the feedback, and XP is unchanged.
    const rejected = await getCompletions(request, 'rejected')
    const mine = rejected.find((c) => c.id === completionId)
    expect(mine?.status).toBe('rejected')
    expect(mine?.feedback).toBe(feedback)

    const xpAfter = await getChildXp(request, CHILD_A.id)
    expect(xpAfter).toBe(xpBefore)
  })

  test('W-HIST-1: history shows the approved + rejected entries, newest-first, and filters by child', async ({
    page,
    request,
  }) => {
    // Add a childB pending entry so the child filter has something to hide.
    await createPending(request, CHILD_B, CHORE_TOYS)

    await loginAsParent(page)
    await page.goto('/history')
    await expect(page.getByRole('heading', { name: 'ประวัติงานบ้าน' })).toBeVisible()

    const items = page.getByRole('listitem')

    // The approved ล้างรถ (W-APPR-1) shows the "เสร็จแล้ว" chip; the rejected
    // เก็บของเล่น (W-APPR-2) shows "ปฏิเสธ". Both belong to น้องเอ.
    const approvedRow = items
      .filter({ hasText: CHORE_CAR.title })
      .filter({ hasText: 'เสร็จแล้ว' })
      .first()
    const rejectedRow = items
      .filter({ hasText: CHORE_TOYS.title })
      .filter({ hasText: 'ปฏิเสธ' })
      .first()
    await expect(approvedRow).toBeVisible()
    await expect(approvedRow).toContainText(CHILD_A.name)
    await expect(rejectedRow).toBeVisible()
    await expect(rejectedRow).toContainText(CHILD_A.name)

    // Ordering: the timeline is newest-first (page sorts submittedAt desc). The
    // rejected toys row was submitted after the approved car row, so it appears
    // earlier in the list.
    const texts = await items.allInnerTexts()
    const idxRejected = texts.findIndex(
      (t) => t.includes(CHORE_TOYS.title) && t.includes('ปฏิเสธ'),
    )
    const idxApproved = texts.findIndex(
      (t) => t.includes(CHORE_CAR.title) && t.includes('เสร็จแล้ว'),
    )
    expect(idxRejected).toBeGreaterThanOrEqual(0)
    expect(idxApproved).toBeGreaterThanOrEqual(0)
    expect(idxRejected).toBeLessThan(idxApproved)

    // Both children are visible under the default "ทุกคน" filter.
    await expect(items.filter({ hasText: CHILD_B.name }).first()).toBeVisible()

    // Filter to น้องเอ → น้องบี's rows disappear, น้องเอ's remain.
    await page.getByRole('combobox', { name: 'กรองตามลูก' }).selectOption({
      label: CHILD_A.name,
    })
    await expect(items.filter({ hasText: CHILD_B.name })).toHaveCount(0)
    await expect(
      items.filter({ hasText: CHORE_CAR.title }).filter({ hasText: 'เสร็จแล้ว' }).first(),
    ).toBeVisible()
  })
})
