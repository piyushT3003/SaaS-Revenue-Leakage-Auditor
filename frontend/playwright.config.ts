import { defineConfig, devices } from '@playwright/test'

/** End-to-end tests against a running stack (backend + frontend, seeded demo data).
 *  Start it with `docker compose up` (or the dev servers), then: `npm run e2e`.
 *  E2E_BASE_URL defaults to the Vite dev server; E2E_PASSWORD is the demo password chosen at seeding. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5185',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 940 }, // after the device preset, which would otherwise force 1280×720
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH, args: ['--no-sandbox'] } : {},
  },
})
