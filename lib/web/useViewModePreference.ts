'use client'

/**
 * lib/web/useViewModePreference.ts — remembers a per-list "row list vs
 * thumbnail grid" layout choice.
 *
 * This is a per-device UI preference (not data), so it lives in localStorage
 * rather than the DB — same rationale and shape as app/onboarding/draft.ts.
 * Keyed by `listId` so each page's toggle is independent (switching the
 * rewards catalog to grid must not affect the history page).
 */

import { useCallback, useEffect, useState } from 'react'

export type ViewMode = 'list' | 'grid'

const KEY_PREFIX = 'habithero:view-mode:'

export function viewModeKey(listId: string): string {
  return `${KEY_PREFIX}${listId}`
}

/** Pure read, safe to call outside React (SSR-safe: returns `fallback` without a DOM). */
export function readViewMode(listId: string, fallback: ViewMode = 'list'): ViewMode {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(viewModeKey(listId))
    return raw === 'list' || raw === 'grid' ? raw : fallback
  } catch {
    return fallback
  }
}

/** Pure write, safe to call outside React. Best-effort — storage full/disabled never throws. */
export function writeViewMode(listId: string, mode: ViewMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(viewModeKey(listId), mode)
  } catch {
    // ignore
  }
}

/**
 * `useViewModePreference(listId)` — the mode starts at `fallback` (so the
 * server-rendered and first client paint match, avoiding a hydration
 * mismatch) and is replaced by the stored value right after mount, mirroring
 * the loadDraft()-after-mount pattern in app/onboarding/draft.ts.
 */
export function useViewModePreference(
  listId: string,
  fallback: ViewMode = 'list',
): readonly [ViewMode, (mode: ViewMode) => void] {
  const [mode, setModeState] = useState<ViewMode>(fallback)

  useEffect(() => {
    setModeState(readViewMode(listId, fallback))
    // Only re-read when the list identity changes — `fallback` is a per-call
    // constant, not state this effect should react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId])

  const setMode = useCallback(
    (next: ViewMode) => {
      setModeState(next)
      writeViewMode(listId, next)
    },
    [listId],
  )

  return [mode, setMode] as const
}
