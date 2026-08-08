import { defineConfig, devices } from '@playwright/test';

/*
 * One browser, one spec file, run against a real production build.
 *
 * Port 3100 rather than 3000: the compose stack binds 3000, and a suite that
 * cannot run while the app is running is a suite nobody runs.
 *
 * `SIM_MODE=external` stops the in-process simulator, so the ambient stream
 * cannot inject an unrelated critical mid-assertion. The spec creates every
 * event it needs through the ingest route, which makes each run deterministic.
 */
const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : [['list']],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    // The design targets 1440px+; testing at a phone width would exercise a
    // layout the product does not claim to support.
    viewport: { width: 1512, height: 950 },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    /*
     * Never reuse, even locally. The server holds the replay ring buffer in
     * module state, so a reused process carries every incident from every
     * previous run into the next one — and a suite whose starting conditions
     * depend on how many times you have run it is not a suite.
     */
    reuseExistingServer: false,
    timeout: 180_000,
    env: { SIM_MODE: 'external', PORT: String(PORT) },
  },
});
