'use client'

/**
 * lib/web/useAutoRefresh.ts — keep a page's data fresh without a manual reload.
 *
 * Why this exists: every screen fetches once on mount and then goes stale, so a
 * parent had to pull-to-refresh to see a child's new submission (and vice
 * versa). This hook re-runs the page's existing fetch whenever the data is
 * likely to have changed underneath the user:
 *
 *   • window `focus`         — they switched back to the tab/app
 *   • `visibilitychange`→visible — same, on mobile where focus is unreliable
 *   • a light interval poll  — only while the tab is visible (no background
 *                              battery/network drain)
 *
 * The caller passes a *silent* refresher — one that updates state on success but
 * does NOT toggle the full-page loading spinner or wipe data on a transient
 * error — so refreshes are invisible until the numbers actually change. Pages
 * here derive their spinner from `data === null`, so "silent" just means: don't
 * reset data to null, and swallow errors (keep showing the last good view).
 */

import { useEffect, useRef } from 'react'

export interface AutoRefreshOptions {
  /** Poll cadence in ms while the tab is visible. 0 disables the interval. */
  intervalMs?: number
  /** Turn the whole thing off (e.g. before an id/child is known). */
  enabled?: boolean
}

const DEFAULT_INTERVAL_MS = 30_000

/**
 * Wire the focus / visibility / interval listeners that trigger `refresh`, and
 * return a cleanup that removes them. Pure (no React) so it can be unit-tested
 * directly; `useAutoRefresh` just runs it inside an effect.
 *
 * Returns a no-op cleanup when disabled or when there is no DOM (SSR).
 */
export function subscribeAutoRefresh(
  refresh: () => void | Promise<void>,
  { intervalMs = DEFAULT_INTERVAL_MS, enabled = true }: AutoRefreshOptions = {},
): () => void {
  if (!enabled || typeof window === 'undefined') return () => {}

  // Fire only when the page is actually in front of the user.
  const runIfVisible = () => {
    if (document.visibilityState === 'visible') void refresh()
  }

  window.addEventListener('focus', runIfVisible)
  document.addEventListener('visibilitychange', runIfVisible)

  const id =
    intervalMs > 0 ? window.setInterval(runIfVisible, intervalMs) : undefined

  return () => {
    window.removeEventListener('focus', runIfVisible)
    document.removeEventListener('visibilitychange', runIfVisible)
    if (id !== undefined) window.clearInterval(id)
  }
}

/**
 * Re-run `refresh` on focus / tab-visible / a visible-only interval.
 *
 * `refresh` is always read from a ref, so callers may pass a fresh closure each
 * render without re-subscribing the listeners. SSR-safe (no-op without a DOM).
 */
export function useAutoRefresh(
  refresh: () => void | Promise<void>,
  { intervalMs = DEFAULT_INTERVAL_MS, enabled = true }: AutoRefreshOptions = {},
): void {
  const saved = useRef(refresh)
  saved.current = refresh

  useEffect(
    () => subscribeAutoRefresh(() => saved.current(), { intervalMs, enabled }),
    [enabled, intervalMs],
  )
}
