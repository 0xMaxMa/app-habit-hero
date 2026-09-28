/**
 * tests/integration/child-home-timeline.test.ts — regression test for the
 * child home page ("/child", app/(child)/child/ChildHome.tsx) missing point
 * deductions from its "ไทม์ไลน์กิจกรรม" section.
 *
 * ChildHome used to build that timeline from GET /api/completions alone; it
 * never fetched GET /api/deductions, so a deduction could never appear there
 * even though the sibling page (ChildTasks, "งานของฉัน") did it correctly via
 * lib/web/timeline.mergeTimeline. This drives the exact two endpoints
 * ChildHome now fetches, as the child actor would (self-scoped, no `?child=`
 * on /api/deductions per its own self-scope rule), then feeds the real
 * responses through the same mergeTimeline() ChildHome calls — proving the
 * data layer actually surfaces both record kinds together, not just in theory.
 *
 * DOM-level coverage (that the row renders and is visible after a real PIN
 * login) lives in tests/e2e/deduction.spec.ts (W-DEDUCT-3).
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { POST as submitCompletion, GET as listCompletions } from '@/app/api/completions/route'
import { POST as deduct, GET as listDeductions } from '@/app/api/deductions/route'
import { mergeTimeline } from '@/lib/web/timeline'
import { resetAndSeed, getRefs } from './helpers/db'
import { agentHeaders, AGENT_TOKEN } from './helpers/actor'
import { IDS } from '@/prisma/seed.test'

beforeEach(async () => {
  await resetAndSeed()
})

/** Submit the dishes chore (photo required, like every seeded chore) for childA, as childA. */
async function submitDishes(childARef: string): Promise<{ id: string }> {
  const fd = new FormData()
  fd.set('chore_id', IDS.choreDishes)
  fd.set(
    'photo',
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'proof.jpg', { type: 'image/jpeg' }),
  )
  const res = await submitCompletion(
    new Request('http://t/api/completions', {
      method: 'POST',
      headers: { 'x-agent-token': AGENT_TOKEN, 'x-actor-ref': childARef },
      body: fd,
    }),
  )
  const env = await res.json()
  expect(res.status, JSON.stringify(env)).toBe(201)
  return env.data.completion
}

describe("ChildHome's data-loading includes deductions (regression)", () => {
  it('a completion AND a deduction both come back from the two endpoints ChildHome fetches, and merge onto one timeline', async () => {
    const { parentRef, childARef, childAId } = await getRefs()

    const completion = await submitDishes(childARef)
    const deductRes = await deduct(
      new Request('http://t/api/deductions', {
        method: 'POST',
        headers: agentHeaders(parentRef),
        body: JSON.stringify({ user: childAId, amount: 15, reason: 'ทดสอบ ChildHome timeline' }),
      }),
    )
    const deductEnv = await deductRes.json()
    expect(deductRes.status, JSON.stringify(deductEnv)).toBe(201)

    // Exactly what ChildHome.load() now calls: completions scoped via ?child=,
    // deductions self-scoped with NO ?child= param.
    const compsRes = await listCompletions(
      new Request(`http://t/api/completions?child=${childAId}`, {
        headers: agentHeaders(childARef),
      }),
    )
    const dedsRes = await listDeductions(
      new Request('http://t/api/deductions', { headers: agentHeaders(childARef) }),
    )
    const comps = await compsRes.json()
    const deds = await dedsRes.json()

    expect(compsRes.status, JSON.stringify(comps)).toBe(200)
    expect(dedsRes.status, JSON.stringify(deds)).toBe(200)
    expect(comps.data.completions.some((c: { id: string }) => c.id === completion.id)).toBe(true)
    expect(
      deds.data.deductions.some((d: { id: string }) => d.id === deductEnv.data.deduction.id),
    ).toBe(true)

    // The exact merge ChildHome performs — proves both record kinds land on
    // one timeline, newest first, not just that the raw endpoints work.
    const timeline = mergeTimeline(
      comps.data.completions as { id: string; submittedAt: string }[],
      deds.data.deductions as { id: string; createdAt: string }[],
      (c) => new Date(c.submittedAt).getTime(),
      (d) => new Date(d.createdAt).getTime(),
    )

    expect(timeline.some((e) => e.kind === 'completion' && e.completion.id === completion.id)).toBe(
      true,
    )
    expect(timeline.some((e) => e.kind === 'deduction' && e.deduction.id === deductEnv.data.deduction.id)).toBe(
      true,
    )
    // The deduction was created after the completion → sorts first.
    expect(timeline[0].kind).toBe('deduction')
  })
})
