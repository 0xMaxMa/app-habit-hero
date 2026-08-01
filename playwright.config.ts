import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

/**
 * Load .env.test (no dotenv dependency) so the app booted by `webServer` points
 * at the test database. Existing process.env wins, so CI can inject its own
 * DATABASE_URL for the postgres service.
 */
function loadEnvTest(): void {
  const envPath = resolve(__dirname, '.env.test')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    const val = t.slice(eq + 1).trim()
    if (process.env[key] === undefined) process.env[key] = val
  }
}
loadEnvTest()

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Boot the real app for e2e. No BASE_PATH => health lives at /api/health.
  // `npm run build` must have run first (the web-e2e CI job does this).
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:4000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? '',
      AGENT_API_TOKEN: process.env.AGENT_API_TOKEN ?? '',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? '',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? 'http://localhost:4000',
    },
  },
})
