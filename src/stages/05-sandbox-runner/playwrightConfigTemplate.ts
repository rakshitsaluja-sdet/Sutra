/**
 * Deterministic boilerplate, not LLM-generated — written fresh by the
 * Sandbox Runner before every run. playwright-bdd resolves `features`/`steps`
 * globs relative to this file's own directory (generated/), regardless of
 * the process's cwd, so this must live at generated/playwright.config.ts.
 */
export const PLAYWRIGHT_CONFIG_CONTENT = `import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'steps/**/*.ts',
});

export default defineConfig({
  testDir,
  timeout: 30_000,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: '../test-results/html-report', open: 'never' }],
    ['json', { outputFile: '../test-results/results.json' }],
    ['allure-playwright', { resultsDir: '../test-results/allure-results', detail: true, suiteTitle: false }],
  ],
  use: {
    baseURL: process.env.TARGET_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
`;
