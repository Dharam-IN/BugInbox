import { defineConfig, devices } from '@playwright/test';

/**
 * Browser verification runs against the running Compose stack, not a mock.
 * Start it first with `npm run up`.
 */
const WEB = process.env.BUGINBOX_WEB_URL ?? 'http://localhost:58080';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  globalSetup: './tests/e2e/globalSetup.ts',
  reporter: [['list']],
  use: {
    baseURL: WEB,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
      testIgnore: /(^|\/)(mobile|site-mobile)\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /(^|\/)(mobile|site-mobile)\.spec\.ts/ },
    // The same desktop suite in the other two engines. Install them first with
    // `npx playwright install firefox webkit`; WebKit additionally needs the
    // system libraries listed by `npx playwright install-deps webkit`.
    // Driving WebKit's Linux build is not evidence about Safari on a real
    // iPhone or Mac — see docs/PROJECT_STATUS.md.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 900 } },
      testIgnore: /(^|\/)(mobile|site-mobile)\.spec\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 } },
      testIgnore: /(^|\/)(mobile|site-mobile)\.spec\.ts/,
    },
  ],
});
