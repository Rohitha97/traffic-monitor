import { defineConfig, devices } from '@playwright/test';

/*
 * Two servers, two projects.
 *
 * The behaviour suites run against a real production build, because that is
 * what ships. The visual suite cannot: `/dev/states` is excluded from
 * production builds by `pageExtensions`, so it only exists under `next dev`.
 * That is the right trade — the state matrix is development scaffolding, and
 * the alternative is shipping it to keep a test happy.
 *
 * Ports avoid 3000 so the suites can run while `docker compose up` is serving.
 */
const APP_PORT = 3100;
const DEV_PORT = 3101;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : [['list']],

  /*
   * Snapshots carry no platform suffix on purpose. They are rasterised on
   * Linux, in the pinned Playwright image, and the suite refuses to run
   * anywhere else — so a developer on Windows or macOS gets a clear skip
   * rather than a confusing diff, and cannot accidentally commit snapshots
   * their own machine produced.
   */
  snapshotPathTemplate: 'e2e/__screenshots__/{arg}{ext}',

  expect: {
    /*
     * 15s rather than the 5s default. The visual suite navigates to
     * `/dev/states` once per test against `next dev`, which recompiles on
     * demand — on a loaded machine a run that normally takes two minutes took
     * nineteen, and two assertions timed out waiting for a page that was
     * simply still building. Neither was a screenshot disagreeing; raising the
     * ceiling removes the whole class without weakening what is asserted.
     */
    timeout: 15_000,

    toHaveScreenshot: {
      /*
       * 1%. Text antialiasing varies by a pixel or two between runs even on
       * identical hardware, and zero tolerance flakes within a day. The
       * failure this has to catch — a 2px padding change on a 432×40 row —
       * moves the text and every following glyph, which is a double-digit
       * percentage of the element. 1% sits comfortably between the two, and
       * the deliberate-regression check below proves it.
       */
      maxDiffPixelRatio: 0.01,
      animations: 'disabled',
      scale: 'css',
    },
  },

  use: {
    trace: 'retain-on-failure',
    // The design targets 1440px+; testing at a phone width would exercise a
    // layout the product does not claim to support.
    viewport: { width: 1512, height: 950 },
  },

  projects: [
    {
      name: 'chromium',
      testIgnore: /visual\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://127.0.0.1:${APP_PORT}`,
      },
    },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      // Each test loads the page fresh against a dev server; the first few
      // carry the compile cost.
      timeout: 90_000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://127.0.0.1:${DEV_PORT}`,
      },
    },
  ],

  /*
   * Exactly one server per run, and never both.
   *
   * `next dev` and `next start` share `.next`. Running them together — which is
   * what a plain two-entry array does — has the dev server rewrite the build
   * directory out from under the production server mid-suite. The page still
   * server-renders, so it *looks* alive, but its client chunks are gone:
   * hydration fails silently, the SSE connection is never opened, and every
   * test that waits for an event times out against a page that will never
   * receive one. That cost an afternoon; it is not a subtle failure once you
   * know, and completely opaque before.
   *
   * `PW_VISUAL_ONLY` selects which one starts. The container script and the CI
   * visual job both set it; everything else gets the production build.
   */
  webServer: process.env.PW_VISUAL_ONLY
    ? [
        {
          command: `pnpm dev --port ${DEV_PORT}`,
          url: `http://127.0.0.1:${DEV_PORT}/api/health`,
          reuseExistingServer: false,
          timeout: 180_000,
          env: { SIM_MODE: 'external', PORT: String(DEV_PORT) },
        },
      ]
    : [
        {
          command: `pnpm build && pnpm start --port ${APP_PORT}`,
          url: `http://127.0.0.1:${APP_PORT}/api/health`,
          /*
           * Never reuse, even locally. The server holds the replay ring buffer
           * in module state, so a reused process carries every incident from
           * every previous run into the next — and a suite whose starting
           * conditions depend on how many times you have run it is not a suite.
           */
          reuseExistingServer: false,
          timeout: 180_000,
          env: { SIM_MODE: 'external', PORT: String(APP_PORT) },
        },
      ],
});
