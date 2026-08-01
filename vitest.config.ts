import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    passWithNoTests: true,
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': __dirname,
    },
  },
})
