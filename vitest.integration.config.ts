import { defineConfig } from 'vitest/config'

/**
 * API integration config — separate from the unit `vitest.config.ts`.
 *
 * Runs the route-handler-import integration tests against a REAL Postgres
 * (see .env.test / DATABASE_URL). These tests share one database, so they MUST
 * run strictly sequentially — a single fork, one file at a time, no in-file
 * concurrency — otherwise `resetAndSeed()` in one test races another.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    passWithNoTests: true,

    // Prime process.env from .env.test in every worker before the test module
    // graph (and its `@/lib/db` Prisma client) is evaluated.
    setupFiles: ['tests/integration/load-env.ts'],

    // Migrate the test DB once before the whole suite.
    globalSetup: ['tests/integration/global-setup.ts'],

    // --- Serialize everything: one DB, no races. ---
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    sequence: {
      concurrent: false,
    },
  },
  resolve: {
    alias: {
      '@': __dirname,
    },
  },
})
