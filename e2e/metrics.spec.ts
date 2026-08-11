import { expect, test, type Page } from '@playwright/test';

/*
 * The two numbers the design argues from, measured end to end.
 *
 * This drives a real operator pass — arrive, look, decide — and then reads
 * `/api/metrics`, so it exercises the whole chain: the dwell timer that decides
 * an incident was read rather than cursored past, the mark posted back to the
 * server, and the percentiles computed over the buffer.
 */

const OBSERVATION = {
  type: 'stopped_vehicle',
  confidence: 0.91,
  lanePosition: 'hard_shoulder',
  snapshotUrl: '/snapshots/stopped_vehicle.svg',
  description: 'Vehicle stationary on the hard shoulder for over 4 minutes.',
  camera: {
    id: 'CAM-062',
    name: 'M6 northbound, junction 10a',
    roadway: 'M6',
    direction: 'NB',
    marker: 'MM 34.7',
    laneCount: 3,
    lat: 52.5901,
    lng: -2.0143,
  },
};

interface Distribution {
  n: number;
  p50: number | null;
  p95: number | null;
}
interface MetricsReport {
  events: number;
  timeToAwarenessMs: Distribution;
  timeToDecisionMs: Distribution;
}

async function metrics(page: Page): Promise<MetricsReport> {
  const response = await page.request.get('/api/metrics');
  expect(response.status()).toBe(200);
  return (await response.json()) as MetricsReport;
}

const rows = (page: Page) =>
  page.getByRole('listbox', { name: 'Open incidents' }).getByRole('option');

test('a run of incidents reports p50 and p95 for both numbers', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('banner', { name: 'System status' }),
  ).toBeVisible();

  const before = await metrics(page);

  // Three incidents, worked one at a time: select, dwell past the threshold so
  // the incident counts as read, then decide.
  for (let i = 0; i < 3; i += 1) {
    await page.request.post('/api/events/ingest', { data: OBSERVATION });
    await expect(rows(page).first()).toBeVisible();

    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowDown');
    await expect(
      rows(page).and(page.locator('[aria-selected="true"]')),
    ).toHaveCount(1);

    // Longer than SEEN_DWELL_MS, plus room for the mark to reach the server.
    await page.waitForTimeout(900);

    await page.keyboard.press('d');
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alertdialog')).toBeHidden();
  }

  // The marks are posted fire-and-forget, so allow them to land.
  await expect
    .poll(async () => (await metrics(page)).timeToDecisionMs.n, {
      timeout: 10_000,
    })
    .toBeGreaterThan(before.timeToDecisionMs.n);

  const after = await metrics(page);

  for (const name of ['timeToAwarenessMs', 'timeToDecisionMs'] as const) {
    const d = after[name];
    expect(d.n, `${name} should have samples`).toBeGreaterThan(0);
    expect(d.p50, `${name} p50`).not.toBeNull();
    expect(d.p95, `${name} p95`).not.toBeNull();
    expect(d.p50!).toBeGreaterThanOrEqual(0);
    expect(d.p95!).toBeGreaterThanOrEqual(d.p50!);
  }

  // Awareness is bounded below by the dwell threshold: an incident cannot be
  // marked read faster than it takes to decide it was read.
  expect(after.timeToAwarenessMs.p50!).toBeGreaterThanOrEqual(500);
});

test('cursoring past an incident does not mark it read', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('banner', { name: 'System status' }),
  ).toBeVisible();

  for (let i = 0; i < 4; i += 1) {
    await page.request.post('/api/events/ingest', { data: OBSERVATION });
  }
  await expect(rows(page).nth(3)).toBeVisible();

  const before = await metrics(page);

  /*
   * Walk the queue at roughly key-repeat speed. This is the behaviour the dwell
   * threshold exists to exclude: an operator scrolling through a queue has not
   * become aware of anything, and counting it would make time-to-awareness
   * measure scrolling speed.
   */
  await page.keyboard.press('Escape');
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(60);
  }
  // Land somewhere that is not one of the rows just passed.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1_200);

  const after = await metrics(page);
  expect(after.timeToAwarenessMs.n).toBe(before.timeToAwarenessMs.n);
});
