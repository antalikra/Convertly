import { defineConfig } from '@playwright/test';

// End-to-end tests run the built extension (dist/, `npm run build` first) in Chromium.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '*.e2e.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
});
