import { defineConfig } from 'vitest/config'

// base './' keeps every asset URL relative, so the build works at any Pages sub-path.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
  test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] },
})
