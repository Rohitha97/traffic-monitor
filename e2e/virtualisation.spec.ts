import { expect, test, type Page } from '@playwright/test';

/*
 * The queue is windowed, and these are the three things that has to be true
 * for that to be worth doing.
 *
 * The keyboard specs in journey.spec.ts are the other half of this: they were
 * not touched when virtualisation landed, which is the evidence that the
 * refactor did not change behaviour.
 */

const DEPTH = 500;

const listbox = (page: Page) =>
  page.getByRole('listbox', { name: 'Open incidents' });
const rows = (page: Page) => listbox(page).getByRole('option');

/**
 * Fill the queue to `count`.
 *
 * Batched rather than fired all at once: five hundred simultaneous POSTs
 * exhaust the dev server's connection pool and it starts refusing them, which
 * fails the *fixture* and looks exactly like a product bug. Twenty-five at a
 * time is still fast and stays inside what a single Node server will accept.
 */
async function fill(page: Page, count: number): Promise<void> {
  const BATCH = 25;
  for (let sent = 0; sent < count; sent += BATCH) {
    await Promise.all(
      Array.from({ length: Math.min(BATCH, count - sent) }, () =>
        page.request.post('/api/events/ingest', { data: {} }),
      ),
    );
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('banner', { name: 'System status' }),
  ).toBeVisible();
});

test('renders a window, not the whole queue', async ({ page }) => {
  await fill(page, DEPTH);
  await expect
    .poll(
      async () => Number(await rows(page).first().getAttribute('aria-setsize')),
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThanOrEqual(DEPTH);

  const mounted = await rows(page).count();

  // A viewport of ~800px at 40px a row is twenty, plus overscan either side.
  // The exact number does not matter; that it is not five hundred does.
  expect(mounted).toBeLessThan(50);
  expect(mounted).toBeGreaterThan(5);
});

test('tells a screen reader how many incidents there actually are', async ({
  page,
}) => {
  await fill(page, DEPTH);
  await expect
    .poll(
      async () => Number(await rows(page).first().getAttribute('aria-setsize')),
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThanOrEqual(DEPTH);

  const first = rows(page).first();
  const setSize = Number(await first.getAttribute('aria-setsize'));

  // Without aria-setsize a windowed listbox announces the count it rendered,
  // so an operator would be told there are twenty incidents when there are
  // five hundred.
  expect(setSize).toBeGreaterThanOrEqual(DEPTH);
  expect(await first.getAttribute('aria-posinset')).toBe('1');
});

test('a critical prepending while scrolled does not move the view', async ({
  page,
}) => {
  await fill(page, 60);
  await expect
    .poll(async () => rows(page).count(), { timeout: 30_000 })
    .toBeGreaterThan(10);

  // Scroll well away from the head, where an insertion above would be felt.
  const scroller = page.locator('div.overflow-y-auto').first();
  await scroller.evaluate((el) => {
    el.scrollTop = 600;
  });
  await page.waitForTimeout(300);

  /** The incident sitting at the top of the viewport, and where exactly. */
  const anchor = async () =>
    page.evaluate(() => {
      const list = document.querySelector('[role="listbox"]');
      const scroll = list?.parentElement;
      if (!list || !scroll) return null;
      const top = scroll.getBoundingClientRect().top;
      const first = [...list.querySelectorAll('[role="option"]')]
        .map((el) => ({ el, offset: el.getBoundingClientRect().top - top }))
        .filter((row) => row.offset >= -1)
        .sort((a, b) => a.offset - b.offset)[0];
      return first
        ? {
            id: first.el
              .closest('[data-event-id]')
              ?.getAttribute('data-event-id'),
            offset: Math.round(first.offset),
          }
        : null;
    });

  const before = await anchor();
  expect(before?.id).toBeTruthy();

  /*
   * A critical is the one class designed to jump the buffer, so it really does
   * insert at index 0 while the operator is reading further down. In a windowed
   * list that shifts every row by one row height unless the scroll offset is
   * compensated — which would break the guarantee buffering exists to protect.
   */
  await page.request.post('/api/events/ingest', {
    data: { preset: 'critical' },
  });
  await expect(page.getByRole('alert').first()).toContainText('Wrong-way', {
    timeout: 15_000,
  });
  await page.waitForTimeout(400);

  const after = await anchor();
  expect(after?.id).toBe(before?.id);
  // Within a pixel: the same incident, in the same place on screen.
  expect(Math.abs((after?.offset ?? 0) - (before?.offset ?? 0))).toBeLessThan(
    2,
  );
});

test('↑↓ stays under a frame with a deep queue', async ({ page }) => {
  await fill(page, DEPTH);
  await expect
    .poll(
      async () => Number(await rows(page).first().getAttribute('aria-setsize')),
      {
        timeout: 30_000,
      },
    )
    .toBeGreaterThanOrEqual(DEPTH);

  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown');
  await expect(
    rows(page).and(page.locator('[aria-selected="true"]')),
  ).toHaveCount(1);

  /*
   * Measured from the keystroke to React committing the new selection to the
   * DOM — the work the refactor could have made slower. Deliberately not
   * waiting on a paint: that would measure the display's refresh interval
   * rather than this application's render cost.
   *
   * Selection moves through incidents that are not mounted, which is the whole
   * risk in windowing a list driven by the keyboard. If navigation were reading
   * the DOM instead of the store, this is where it would fall apart.
   */
  const timings: number[] = await page.evaluate(async () => {
    const samples: number[] = [];
    const list = document.querySelector('[role="listbox"]');
    if (!list) return samples;

    // The first presses after mount carry one-off work — lazy chunk
    // evaluation, the first commit of a freshly mounted subtree — so they are
    // measured and discarded rather than folded into the figure.
    for (let i = 0; i < 40; i += 1) {
      const start = performance.now();
      const settled = new Promise<number>((resolve) => {
        const observer = new MutationObserver(() => {
          observer.disconnect();
          resolve(performance.now());
        });
        observer.observe(list, {
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-selected'],
        });
        setTimeout(() => {
          observer.disconnect();
          resolve(performance.now());
        }, 1_000);
      });

      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
      samples.push((await settled) - start);
      await new Promise((r) => setTimeout(r, 16));
    }
    return samples;
  });

  const measured = timings.slice(10);
  expect(measured.length).toBeGreaterThan(20);
  const sorted = [...measured].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  const p95 = sorted[Math.ceil(0.95 * sorted.length) - 1]!;

  console.log(
    `↑↓ over ${DEPTH} incidents — median ${median.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms`,
  );

  // One frame at 60Hz. The p95 bound is looser because a CI worker sharing a
  // core will occasionally lose a slice, and failing the build on that would
  // teach nobody anything.
  expect(median).toBeLessThan(16.7);
  expect(p95).toBeLessThan(50);
});
