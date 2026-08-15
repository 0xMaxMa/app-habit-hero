/**
 * tests/e2e/auth.spec.ts — Playwright web-E2E for AUTH + HEALTH (T27a · §3.1, §3.5).
 *
 * Runs against a booted production app (playwright.config.ts webServer, baseURL
 * http://localhost:4000) with a test Postgres seeded via prisma/seed.test.ts.
 *
 * Fixture values below are copied verbatim from prisma/seed.test.ts — keep them
 * in sync with that file (it is the single source of truth for the fixture).
 *
 * Selectors are role/label-based off the real Thai copy in:
 *   - app/login/page.tsx            (parent email/password sign-in)
 *   - app/pin/page.tsx + PinEntryForm.tsx (child PIN sign-in)
 *   - app/(parent)/dashboard/page.tsx     (family overview heading)
 *   - app/(parent)/ParentNav.tsx    (logout button "ออกจากระบบ")
 *   - middleware.ts                 (auth + role redirects)
 *   - app/api/health/route.ts       (health shape)
 */
import { test, expect } from '@playwright/test'

// --- Seeded fixture values (prisma/seed.test.ts) ---------------------------
const PARENT = { email: 'parent@test.local', password: 'test1234' }
const CHILD_A = { name: 'น้องเอ' }

/** Matches prisma/seed.test.ts → CHILD_TEST_PIN; update both together. */
const CHILD_A_PIN = '1234'

// ---------------------------------------------------------------------------
// §3.1 AUTH
// ---------------------------------------------------------------------------

test.describe('AUTH', () => {
  // W-AUTH-1: parent logs in, reaches the dashboard, then logs back out.
  test('W-AUTH-1 parent can log in and log out', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('อีเมล').fill(PARENT.email)
    await page.getByLabel('รหัสผ่าน').fill(PARENT.password)
    await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()

    // Lands on the parent dashboard (family overview heading).
    await page.waitForURL('**/dashboard')
    await expect(
      page.getByRole('heading', { name: 'ภาพรวมครอบครัว' }),
    ).toBeVisible()

    // Logout via ParentNav (visible at Desktop Chrome's md+ width) → back to /login.
    // components/LogoutButton.tsx asks for confirmation first, and the confirm
    // button carries the same label as the trigger — so scope it to the dialog.
    const logout = page.getByRole('button', { name: 'ออกจากระบบ' })
    await expect(logout).toBeVisible()
    await logout.click()

    const confirm = page.getByRole('dialog', { name: 'ออกจากระบบ?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'ออกจากระบบ' }).click()

    await page.waitForURL('**/login')
    await expect(page.getByLabel('อีเมล')).toBeVisible()
  })

  // W-AUTH-2: unauthenticated visit to a protected route is bounced to /login.
  test('W-AUTH-2 unauthenticated /dashboard redirects to /login', async ({
    page,
  }) => {
    await page.goto('/dashboard')

    // Middleware (withAuth, pages.signIn = '/login') redirects anonymous users.
    await page.waitForURL('**/login**')
    expect(new URL(page.url()).pathname).toBe('/login')
    await expect(page.getByLabel('อีเมล')).toBeVisible()
  })

  // W-AUTH-3: child signs in via PIN, reaches /child, and is blocked from the
  // parent-only /dashboard.
  test('W-AUTH-3 child signs in via PIN and is blocked from /dashboard', async ({
    page,
  }) => {
    await page.goto('/pin')

    // Step 1 — pick the child (picker shown when >1 child has a PIN).
    await page.getByRole('button', { name: CHILD_A.name }).click()

    // Step 2 — tap the 4-digit PIN on the keypad; the form auto-submits on the
    // 4th digit and pushes to /child.
    for (const digit of CHILD_A_PIN) {
      await page.getByRole('button', { name: digit, exact: true }).click()
    }

    await page.waitForURL('**/child')
    // Child home renders the child's name as the page heading (from the session).
    await expect(
      page.getByRole('heading', { name: CHILD_A.name }),
    ).toBeVisible()

    // Parent-only area is blocked for a child → middleware redirects to /child.
    await page.goto('/dashboard')
    await page.waitForURL('**/child')
    expect(new URL(page.url()).pathname).toBe('/child')
  })
})

// ---------------------------------------------------------------------------
// §3.5 HEALTH
// ---------------------------------------------------------------------------

test.describe('HEALTH', () => {
  // W-HEALTH-1: /api/health does a real DB round-trip and reports connected.
  test('W-HEALTH-1 /api/health returns ok + db connected', async ({
    request,
  }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    await expect(res).toBeOK()

    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.db).toBe('connected')
    // The endpoint also reports the photo volume, because an unwritable one
    // silently kills photo submissions and avatars. 'writable (repaired)' is
    // the same pass — it just means this call took ownership back first.
    expect(body.photos).toMatch(/^writable/)
  })
})
