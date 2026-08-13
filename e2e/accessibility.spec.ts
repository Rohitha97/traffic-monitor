import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/*
 * The accessibility pass, run rather than asserted.
 *
 * Axe catches the mechanical half — contrast, names, roles, landmark
 * structure — across the states an operator actually sees, including the two
 * that are easiest to forget: a queue with a critical in it, and a modal open.
 *
 * The half axe cannot check is covered in journey.spec.ts: that the interface
 * is fully operable from the keyboard, and that severity reaches assistive
 * technology as text rather than as colour.
 */

const WRONG_WAY = {
  type: 'wrong_way_driver',
  confidence: 0.96,
  lanePosition: 'live_lane',
  laneNumber: 2,
  snapshotUrl: '/snapshots/wrong_way_driver.svg',
  description: 'Vehicle travelling against traffic flow in live lane 2 of 3.',
  camera: {
    id: 'CAM-014',
    name: 'M6 northbound, junction 8–9',
    roadway: 'M6',
    direction: 'NB',
    marker: 'MM 42.3',
    laneCount: 3,
    lat: 52.5218,
    lng: -1.9765,
  },
};

/** WCAG 2.1 AA, which is the bar the design's contrast ratios were chosen against. */
const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags([
    'wcag2a',
    'wcag2aa',
    'wcag21a',
    'wcag21aa',
  ]);

test('the empty queue has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('banner', { name: 'System status' }),
  ).toBeVisible();

  const results = await scan(page).analyze();
  expect(results.violations).toEqual([]);
});

test('a populated queue with a critical open has no violations', async ({
  page,
}) => {
  await page.goto('/');
  await page.request.post('/api/events/ingest', { data: WRONG_WAY });
  await expect(
    page.getByRole('option').filter({ hasText: 'CAM-014' }).first(),
  ).toBeVisible();

  // With the detail pane populated: the densest state on screen.
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('main', { name: 'Incident detail' }),
  ).toContainText('Wrong-way driver');

  const results = await scan(page).analyze();
  expect(results.violations).toEqual([]);
});

test('the dispatch confirmation has no violations', async ({ page }) => {
  await page.goto('/');
  await page.request.post('/api/events/ingest', { data: WRONG_WAY });
  await expect(
    page.getByRole('option').filter({ hasText: 'CAM-014' }).first(),
  ).toBeVisible();

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('d');
  await expect(page.getByRole('alertdialog')).toBeVisible();

  const results = await scan(page).analyze();
  expect(results.violations).toEqual([]);
});

test('the shortcut overlay has no violations', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('?');
  await expect(page.getByRole('dialog')).toBeVisible();

  const results = await scan(page).analyze();
  expect(results.violations).toEqual([]);
});

/*
 * The Japanese screen-reader pass.
 *
 * A synthesiser picks its voice from `lang`. Left at `en`, Japanese is read
 * aloud as English phonemes — not merely wrong but unusable — so the attribute
 * matters more here than any individual label.
 *
 * The labels matter too, and this is where they were found missing: every
 * `aria-label` and `sr-only` string in the interface was still English after
 * three workstreams of translation, because none of them is visible on screen
 * and nothing had looked.
 */
async function inJapanese(page: Page): Promise<void> {
  /*
   * Navigate first, then set the cookie against the origin that actually
   * answered, then reload. Setting it up front means guessing the host and
   * port — which are `127.0.0.1:3100` here, not `localhost:3000` — and a cookie
   * on the wrong origin is silently ignored.
   */
  await page.goto('/');
  await page
    .context()
    .addCookies([
      { name: 'locale', value: 'ja', url: new URL(page.url()).origin },
    ]);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
}

test('a Japanese queue has no accessibility violations', async ({ page }) => {
  await inJapanese(page);
  const response = await page.request.post('/api/events/ingest', {
    data: WRONG_WAY,
  });
  expect(response.status()).toBe(202);

  await expect(
    page.getByRole('listbox').getByRole('option').first(),
  ).toBeVisible();
  await page.getByRole('listbox').getByRole('option').first().click();

  const results = await scan(page).analyze();
  expect(results.violations).toEqual([]);
});

test('the landmarks announce in Japanese, not English', async ({ page }) => {
  await inJapanese(page);

  // Accessible names, which a sighted operator never sees and a screen-reader
  // user hears on every landmark change.
  await expect(
    page.getByRole('banner', { name: 'システム状態' }),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: '事象キュー' })).toBeVisible();
  await expect(page.getByRole('listbox', { name: '未対応事象' })).toBeVisible();
  await expect(page.getByRole('main', { name: '事象詳細' })).toBeVisible();

  // Nothing left behind in English.
  for (const english of [
    'System status',
    'Incident queue',
    'Open incidents',
    'Incident detail',
  ]) {
    await expect(page.getByLabel(english)).toHaveCount(0);
  }
});

test('the detail pane is a live region that announces a selection', async ({
  page,
}) => {
  await inJapanese(page);

  /*
   * The live region exists on both branches — empty and populated — because a
   * region created at the same moment as its content does not reliably
   * announce. The region has to already be there for the change to be a change.
   */
  const detail = page.getByRole('main', { name: '事象詳細' });
  await expect(detail).toHaveAttribute('aria-live', 'polite');
  await expect(detail).toContainText('事象を選択');

  const response = await page.request.post('/api/events/ingest', {
    data: WRONG_WAY,
  });
  expect(response.status()).toBe(202);

  await page.getByRole('listbox').getByRole('option').first().click();

  // Same node, new content — which is what a live region announces.
  await expect(detail).toHaveAttribute('aria-live', 'polite');
  await expect(detail).toContainText('逆走');
});

test('severity reaches a Japanese screen reader as text', async ({ page }) => {
  /*
   * The rule the whole priority system is built on: colour is never the only
   * cue. In Japanese that means the *word* has to be Japanese too, or a
   * screen-reader user gets the one encoding that survived translation read to
   * them in the wrong language.
   */
  await inJapanese(page);
  const response = await page.request.post('/api/events/ingest', {
    data: WRONG_WAY,
  });
  expect(response.status()).toBe(202);

  const row = page.getByRole('listbox').getByRole('option').first();
  await expect(row).toBeVisible();

  const spoken = await row.evaluate((node) =>
    [...node.querySelectorAll('.sr-only')]
      .map((n) => n.textContent ?? '')
      .join(' '),
  );

  expect(spoken).toContain('優先度');
  expect(spoken).toContain('重大');
  expect(spoken).not.toMatch(/priority|Unread/i);
});
