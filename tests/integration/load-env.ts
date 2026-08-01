/**
 * Load .env.test into process.env WITHOUT depending on `dotenv` (not a dep).
 *
 * Must run before `@/lib/db` is imported in any worker, because the Prisma
 * client is instantiated at import time from process.env.DATABASE_URL. Wired as
 * a Vitest `setupFiles` entry (runs per worker before the test module graph)
 * and also called from the globalSetup before `prisma migrate deploy`.
 *
 * Existing process.env values win (so CI can inject DATABASE_URL for the
 * postgres service without .env.test clobbering it).
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// tests/integration/ -> repo root
const ENV_PATH = resolve(here, '../../.env.test')

let loaded = false

export function loadTestEnv(): void {
  if (loaded) return
  loaded = true

  if (!existsSync(ENV_PATH)) return

  const raw = readFileSync(ENV_PATH, 'utf8')
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    // strip a single layer of surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

// Load immediately on import so `setupFiles: ['tests/integration/load-env.ts']`
// primes the env before the test file (and its @/lib/db import) evaluates.
loadTestEnv()
