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
