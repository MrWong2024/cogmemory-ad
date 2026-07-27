import { defineConfig } from '@playwright/test';

// Playwright 1.62 otherwise captures an automatic ARIA page snapshot on failure.
// Acceptance failures must not persist page content; assertions use safe summaries.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1';

export default defineConfig({
  testDir: './test/browser-acceptance',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  reporter: [['dot']],
  outputDir: './test-results/browser-acceptance',
  preserveOutput: 'never',
  use: {
    browserName: 'chromium',
    headless: true,
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
});
