/**
 * Global setup for the API integration suite (runs ONCE before the suite).
 *
 * Loads .env.test, then applies migrations against the test Postgres so the
 * schema is guaranteed current before any test truncates + seeds. `prisma
 * generate` is run only if the client is missing (keeps warm runs fast).
 */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadTestEnv } from './load-env'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

export default function setup() {
  loadTestEnv()

  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    throw new Error(
      '[integration:global-setup] DATABASE_URL is not set — expected .env.test at repo root',
    )
  }

  const env = { ...process.env, DATABASE_URL: dbUrl }

  // Generate the client only if it is not already present on disk.
  const generatedClient = resolve(repoRoot, 'node_modules/.prisma/client/index.js')
  if (!existsSync(generatedClient)) {
    execSync('npx prisma generate', { cwd: repoRoot, env, stdio: 'inherit' })
  }

  console.log(`[integration:global-setup] migrating ${redact(dbUrl)}`)
  execSync('npx prisma migrate deploy', { cwd: repoRoot, env, stdio: 'inherit' })
}

function redact(url: string): string {
  return url.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')
}
