import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

/**
 * tests/e2e/layout-overflow.spec.ts — the child profile must never scroll
 * sideways on a phone.
 *
 * Why this exists: a long chore title in the activity timeline used to widen the
 * whole page. The title is rendered with `truncate` (white-space: nowrap), so
 * its min-content width is the ENTIRE string; every ancestor up to the page
 * inherited that minimum because grid/flex items default to min-width:auto.
 * Nothing in the unit or integration suites can see that — it only exists once
 * a browser lays the page out at a real phone width — so it is pinned here.
 *
 * The fixture titles must stay long: the seeded chores (ล้างจาน, ล้างรถ …) are
 * short enough to fit even on broken code, which would make this test pass for
 * the wrong reason.
 */

const PARENT = { email: 'parent@test.local', password: 'test1234' }
const AGENT_TOKEN = 'test-agent-token'
const PARENT_REF = 'gw:parent-1'
const CHILD_A = { ref: 'gw:child-a', id: 'usr_test_child_a' }

// Real-world length: this is the shape of title families actually type.
const LONG_TITLE = 'พร้อมไปโรงเรียนตอนเช้า (อาบน้ำ + แต่งตัว + กินข้าว + เก็บกระเป๋า)'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

// A phone, not a desktop — the bug is invisible at desktop widths.
const PHONE = { width: 390, height: 844 }

function agentHeaders(ref: string): Record<string, string> {
  return { 'x-agent-token': AGENT_TOKEN, 'x-actor-ref': ref }
}

/** Create a chore with a deliberately long title and return its id. */
async function createLongChore(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/chores', {
    headers: { ...agentHeaders(PARENT_REF), 'content-type': 'application/json' },
    data: { title: LONG_TITLE, xpValue: 15, recurrence: 'daily', requirePhoto: true },
  })
  expect(res.status(), await res.text()).toBe(201)
  return (await res.json()).data.chore.id as string
}

/** Submit + approve it, so it lands in the profile's activity timeline. */
async function completeAndApprove(request: APIRequestContext, choreId: string): Promise<void> {
  const submit = await request.post('/api/completions', {
    headers: agentHeaders(CHILD_A.ref),
    multipart: {
      child: CHILD_A.ref,
      chore_id: choreId,
      photo: { name: 'proof.png', mimeType: 'image/png', buffer: PNG_1PX },
    },
  })
  expect(submit.status(), await submit.text()).toBe(201)
  const id = (await submit.json()).data.completion.id as string

  const approve = await request.post(`/api/completions/${id}/approve`, {
    headers: { ...agentHeaders(PARENT_REF), 'content-type': 'application/json' },
    data: {},
  })
  expect(approve.ok(), await approve.text()).toBeTruthy()
}

async function loginAsParent(page: Page): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('อีเมล').fill(PARENT.email)
  await page.getByLabel('รหัสผ่าน').fill(PARENT.password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForURL('**/dashboard')
}

test.describe('W-LAYOUT — the child profile fits a phone', () => {
  test.use({ viewport: PHONE })

  test('a long chore title in the timeline does not make the page scroll sideways', async ({
    page,
    request,
  }) => {
    const choreId = await createLongChore(request)
    await completeAndApprove(request, choreId)

    await loginAsParent(page)
    await page.goto(`/children/${CHILD_A.id}`)
    // The timeline is what carries the long title — wait for it, otherwise this
    // could measure a page that never rendered the offending row.
    await expect(page.getByText('ไทม์ไลน์กิจกรรม')).toBeVisible()
    await expect(page.getByText(LONG_TITLE).first()).toBeVisible()

    const m = await page.evaluate(() => {
      const de = document.documentElement
      return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth }
    })

    // Allow a 1px rounding slack; anything more is a real sideways scroll.
    expect(
      m.scrollWidth,
      `page scrolls sideways by ${m.scrollWidth - m.clientWidth}px at ${PHONE.width}px wide`,
    ).toBeLessThanOrEqual(m.clientWidth + 1)
  })
})
