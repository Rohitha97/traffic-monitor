import { expect, test, type Page } from '@playwright/test';

/*
 * Visual regression against the component state matrix.
 *
 * The adherence lint proves values come from tokens. It cannot prove the result
 * still looks like the frame — a row can be built entirely from legal tokens
 * and still have drifted two steps of padding away from Pass C. This is the
 * check for that.
 *
 * One capture per state, never one shot of the whole gallery. A mega-shot fails
 * opaquely — "something on the page changed" — and gets `--update-snapshots`'d
 * into uselessness within a week. Each state here fails on its own name.
 *
 * Each capture is of the state's *element*, not the viewport, which keeps the
 * dev-server overlay, the section headings and neighbouring states out of the
 * frame. A diff can then only have been caused by the component itself.
 */

/**
 * States captured as images.
 *
 * With `ZERO_HEIGHT` below, this is the complete list of what the page renders.
 * `matches the state matrix exactly` asserts that against the DOM, so adding a
 * state to the page without adding it here fails loudly rather than going
 * quietly uncovered.
 */
const CAPTURED = [
  'status-bar/live',
  'status-bar/reconnecting',
  'status-bar/offline',
  'status-bar/history-local',
  'status-bar/unmuted',

  'priority-chip/critical',
  'priority-chip/high',
  'priority-chip/medium',
  'priority-chip/low',

  'queue-row/default',
  'queue-row/hovered',
  'queue-row/focused',
  'queue-row/selected',
  'queue-row/unread',
  'queue-row/sla',
  'queue-row/acknowledged',
  'queue-row/dispatched',
  'queue-row/arriving',
  'queue-row/claiming',
  'queue-row/taken',
  'queue-row/seen-before',
  'queue-row/dismissed',

  'banner/present',

  'buffered-bar/neutral',
  'buffered-bar/critical',

  'edge/offline',
  'edge/empty-queue',
  'edge/low-confidence',

  'overlays/triggers',
] as const;

/**
 * States that are zero-height by design, so there is nothing to photograph —
 * an image of an empty element would pass no matter what changed.
 *
 * Their regression check is dimensional instead, and it is a real one: the
 * collapsed critical band shipped a permanent 2px red rule across the top of a
 * quiet screen in phase 3, because only its *height* was conditional and its
 * border was not.
 */
const ZERO_HEIGHT = ['banner/collapsed'] as const;

/**
 * Both locales, every state.
 *
 * The cheapest way to catch Japanese text overflowing a component that was
 * sized for English — and the reason phase 9 comes after phase 8 rather than
 * before it, because the harness already existed.
 *
 * The state matrix's *sample data* stays English on purpose: it is lifted
 * verbatim from Pass C so a reviewer can diff this page against the frames. So
 * the `ja` captures exercise the localised chrome — priority chips, the status
 * bar, the buffered bar, the dismissal menu — rather than Japanese row copy.
 * Japanese *content* overflow is covered where it belongs, against real data,
 * in `e2e/typography.spec.ts`.
 */
const LOCALES = ['en', 'ja'] as const;
type Locale = (typeof LOCALES)[number];

/*
 * Linux only, and deliberately so. Font rasterisation differs enough between
 * platforms that snapshots taken on Windows or macOS will never match CI. The
 * suite skips rather than diffs, so the failure mode is a clear message instead
 * of a mysterious red — and nobody can commit snapshots their laptop produced.
 *
 *   pnpm test:visual            runs this in the pinned Playwright image
 *   pnpm test:visual:update     regenerates the snapshots there
 */
test.skip(
  process.platform !== 'linux',
  'Visual snapshots are Linux-rasterised. Run `pnpm test:visual`, which runs this suite in the pinned Playwright container.',
);

/**
 * Everything a capture needs before the shutter opens, for one locale.
 *
 * The locale is a cookie, so it has to be set before the first navigation —
 * `/dev/states` resolves it server-side and there is no client-side switch to
 * flip afterwards.
 */
async function open(page: Page, locale: Locale): Promise<void> {
  await page
    .context()
    .addCookies([
      { name: 'locale', value: locale, url: 'http://localhost:3000' },
    ]);

  /*
   * Motion off for the whole capture run. A pulsing reconnecting dot or a row
   * mid-transition must never be what decides whether a diff passes — and it
   * also means the snapshots record the reduced-motion rendering, which is a
   * path worth having covered.
   */
  await page.emulateMedia({ reducedMotion: 'reduce' });

  /*
   * Freeze the clock before any application code runs. Nothing on this page
   * renders a live time today — the sample data is static — but the moment one
   * component starts reading the shared tick, an unfrozen clock would move
   * pixels between capture and comparison. Pinning it costs nothing now and
   * removes a whole class of future flake.
   */
  await page.addInitScript(() => {
    const FIXED = new Date('2026-01-01T02:14:07.000Z').getTime();
    const RealDate = Date;
    Date.now = () => FIXED;
    // A Proxy pins `new Date()` too, without the argument-forwarding gymnastics
    // that subclassing Date needs.
    globalThis.Date = new Proxy(RealDate, {
      construct: (target, args) =>
        args.length
          ? Reflect.construct(target, args)
          : Reflect.construct(target, [FIXED]),
    });
  });

  // The dev server renders a floating build indicator. It is fixed-position and
  // could overlap a state near the bottom of the page.
  await page
    .addStyleTag({
      content:
        'nextjs-portal, [data-nextjs-toast] { display: none !important; }',
    })
    .catch(() => {});

  await page.goto('/dev/states');

  /*
   * The locale is set against the origin that answered, then the page is
   * reloaded — it is resolved server-side, so it has to be in place before the
   * render that gets photographed. Setting it before the first navigation would
   * mean guessing the port, which is not 3000 when 3000 is busy.
   */
  await page
    .context()
    .addCookies([
      { name: 'locale', value: locale, url: new URL(page.url()).origin },
    ]);
  await page.reload();

  /*
   * Font swap is the second-largest source of screenshot flake after motion:
   * capture during the fallback face and every glyph shifts.
   */
  await page.evaluate(() => document.fonts.ready);
  await expect(
    page.getByRole('heading', { name: 'Component state matrix' }),
  ).toBeVisible();
}

test('matches the state matrix exactly', async ({ page }) => {
  await open(page, 'en');
  const expected = [...CAPTURED, ...ZERO_HEIGHT];
  const states = page.locator('[data-vrt]');

  /*
   * Wait for the count before reading the attributes. `evaluateAll` is a
   * single-shot DOM read with no auto-retry, so on a slow run it can sample the
   * page mid-render and report a short list — which is exactly how this flaked
   * once in three runs. `toHaveCount` retries until the page has settled.
   */
  await expect(states).toHaveCount(expected.length);

  const rendered = await states.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute('data-vrt')),
  );
  expect(rendered.sort()).toEqual([...expected].sort());
});

test('banner/collapsed takes no space and paints no rule', async ({ page }) => {
  await open(page, 'en');
  const banner = page.locator('[data-vrt="banner/collapsed"] [role="alert"]');

  await expect(banner).toHaveCSS('height', '0px');
  // The border is conditional too, not just the height. Without that, a quiet
  // shift carries a permanent red line under the status bar — a standing false
  // alarm, and the actual bug this assertion exists to catch.
  await expect(banner).toHaveCSS('border-bottom-width', '0px');
});

for (const locale of LOCALES) {
  for (const state of CAPTURED) {
    test(`${state} · ${locale}`, async ({ page }) => {
      await open(page, locale);
      const target = page.locator(`[data-vrt="${state}"]`);
      await expect(target).toBeVisible();
      await expect(target).toHaveScreenshot(
        `${state.replace('/', '--')}--${locale}.png`,
      );
    });
  }
}
