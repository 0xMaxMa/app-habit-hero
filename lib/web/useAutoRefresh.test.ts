/**
 * lib/web/useAutoRefresh.test.ts — behavior of the auto-refresh subscription.
 *
 * Tests the pure `subscribeAutoRefresh` wiring (focus / visibility / interval →
 * refresh, and clean teardown) without a React render harness.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribeAutoRefresh } from '@/lib/web/useAutoRefresh'

/** Force jsdom's document.visibilityState for a test. */
function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  })
}

describe('subscribeAutoRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('refreshes on window focus when the tab is visible', () => {
    const refresh = vi.fn()
    const stop = subscribeAutoRefresh(refresh, { intervalMs: 0 })

    window.dispatchEvent(new Event('focus'))
    expect(refresh).toHaveBeenCalledTimes(1)

    stop()
  })

  it('does NOT refresh on focus when the tab is hidden', () => {
    const refresh = vi.fn()
    const stop = subscribeAutoRefresh(refresh, { intervalMs: 0 })

    setVisibility('hidden')
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refresh).not.toHaveBeenCalled()

    stop()
  })

  it('polls on the interval while visible', () => {
    const refresh = vi.fn()
    const stop = subscribeAutoRefresh(refresh, { intervalMs: 1000 })

    vi.advanceTimersByTime(3000)
    expect(refresh).toHaveBeenCalledTimes(3)

    stop()
  })

  it('stops firing after cleanup', () => {
    const refresh = vi.fn()
    const stop = subscribeAutoRefresh(refresh, { intervalMs: 1000 })
    stop()

    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(5000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('is a no-op when disabled', () => {
    const refresh = vi.fn()
    const stop = subscribeAutoRefresh(refresh, { enabled: false })

    window.dispatchEvent(new Event('focus'))
    vi.advanceTimersByTime(60_000)
    expect(refresh).not.toHaveBeenCalled()

    stop() // cleanup must be safe to call even when nothing was wired
  })
})
