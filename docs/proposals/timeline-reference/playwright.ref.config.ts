import { defineConfig, devices } from '@playwright/test';

/** Local runner for the reference prototype. Not part of the app suite. */
export default defineConfig({
  testDir: '.',
  testMatch: 'timeline-visual.spec.mjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
