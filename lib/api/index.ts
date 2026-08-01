/**
 * lib/api/index.ts — shared API foundation used by every endpoint (T17).
 * Import from '@/lib/api' rather than the individual modules.
 */

export * from './errors'
export * from './respond'
export * from './authz'
export * from './validate'
export * from './photo'
