import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the framework's own unit tests. Excludes generated/ (Playwright BDD
    // specs live there and must be run by Playwright, not vitest) and any
    // archived run output under test-results/.
    include: ['src/**/*.test.ts', 'config/**/*.test.ts'],
  },
});
