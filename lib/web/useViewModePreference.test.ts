/**
 * lib/web/useViewModePreference.test.ts — the per-list view-mode persistence.
 *
 * Tests the pure read/write helpers directly (no React render harness —
 * same approach as useAutoRefresh.test.ts, which tests subscribeAutoRefresh
 * rather than the hook itself). The hook is a thin useState/useEffect
 * wrapper around these and is exercised by tests/e2e/view-mode.spec.ts.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { readViewMode, writeViewMode, viewModeKey } from '@/lib/web/useViewModePreference'

beforeEach(() => {
  window.localStorage.clear()
})

describe('viewModeKey', () => {
  it('namespaces by listId', () => {
    expect(viewModeKey('rewards')).toBe('habithero:view-mode:rewards')
    expect(viewModeKey('history')).toBe('habithero:view-mode:history')
  })
})

describe('readViewMode / writeViewMode', () => {
  it('defaults to the fallback when nothing is stored', () => {
    expect(readViewMode('rewards', 'list')).toBe('list')
    expect(readViewMode('rewards', 'grid')).toBe('grid')
  })

  it('round-trips a written value', () => {
    writeViewMode('rewards', 'grid')
    expect(readViewMode('rewards', 'list')).toBe('grid')
  })

  it('keeps each listId independent', () => {
    writeViewMode('rewards', 'grid')
    expect(readViewMode('history', 'list')).toBe('list')
    expect(readViewMode('rewards', 'list')).toBe('grid')
  })

  it('overwriting persists the latest value', () => {
    writeViewMode('rewards', 'grid')
    writeViewMode('rewards', 'list')
    expect(readViewMode('rewards', 'grid')).toBe('list')
  })

  it('ignores a malformed stored value and falls back', () => {
    window.localStorage.setItem(viewModeKey('rewards'), 'huge')
    expect(readViewMode('rewards', 'list')).toBe('list')
  })

  it('is a no-op / does not throw when localStorage.setItem throws', () => {
    const original = window.localStorage.setItem
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    expect(() => writeViewMode('rewards', 'grid')).not.toThrow()
    window.localStorage.setItem = original
  })
})
