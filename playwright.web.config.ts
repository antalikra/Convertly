import { defineConfig } from '@playwright/test';

// Website tests: the built site (`npm run build:web` first) served by `vite
// preview` under the same base path as on GitHub Pages, in headless Chromium.
const PORT = 4174;

export default defineConfig({
  testDir: 'tests/web',
  testMatch: '*.web.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/Convertly/`,
    acceptDownloads: true,
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: `npx vite preview --config vite.web.config.ts --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/Convertly/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
