// playwright.config.js
// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  // Seed test accounts in the DB before any test runs
  globalSetup: './tests/ui/helpers/global-setup.js',

  // Only run files inside tests/ui/
  testDir: './tests/ui',
  testMatch: '**/*.spec.js',

  // Each test gets up to 30 seconds; slow CI can need more
  timeout: 30_000,

  // Retry once on failure so flaky window-paint timing doesn't kill a run
  retries: 1,

  // Run test files in parallel but keep tests within each file sequential
  // (important because each file launches its own Electron process)
  workers: 1,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],

  use: {
    // Screenshot on failure for debugging
    screenshot: 'only-on-failure',
    // Record a video on first retry so you can watch what went wrong
    video: 'on-first-retry',
  },
});
