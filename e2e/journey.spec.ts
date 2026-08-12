import { expect, test, type Page } from '@playwright/test';

/*
 * The journey the brief names: an event arrives, the operator opens it, and
 * dispatches a response — driven entirely from the keyboard, because that is
 * how the operator in Pass A actually works.
 *
 * Every event is created through the ingest route rather than by waiting on the
 * ambient simulator, so the suite is deterministic and fast. The route is the
 * same boundary a real detection pipeline posts to, so this is not a test-only
 * back door.
 */

/** Posts an observation and returns the priority the *dashboard* derived. */
async function observe(
  page: Page,
  body: Record<string, unknown> = {},
): Promise<string> {
  const response = await page.request.post('/api/events/ingest', {
    data: body,
  });
  expect(response.status()).toBe(202);
  return ((await response.json()) as { priority: string }).priority;
}

const WRONG_WAY = {
  type: 'wrong_way_driver',
  confidence: 0.96,
  lanePosition: 'live_lane',
  laneNumber: 2,
  snapshotUrl: '/snapshots/wrong_way_driver.svg',
  description:
    'Vehicle travelling against traffic flow in live lane 2 of 3, approaching Jct 9.',
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

/*
 * A guaranteed-routine observation. An empty body asks the generator for a
 * random event, which is occasionally critical — and a critical is designed to
 * jump the buffer, so a test asserting on buffering has to specify what it
 * wants rather than roll for it.
 */
const ROUTINE = {
  type: 'congestion',
  confidence: 0.94,
  lanePosition: 'hard_shoulder',
  snapshotUrl: '/snapshots/congestion.svg',
  description: 'Average speed below 20mph, queue building upstream.',
  camera: {
    id: 'CAM-168',
    name: 'M25 clockwise, junction 6–7',
    roadway: 'M25',
    direction: 'EB',
    marker: 'MM 51.2',
    laneCount: 4,
    lat: 51.2703,
    lng: -0.0871,
  },
};

const queue = (page: Page) =>
  page.getByRole('listbox', { name: 'Open incidents' });
const rows = (page: Page) => queue(page).getByRole('option');
const detail = (page: Page) =>
  page.getByRole('main', { name: 'Incident detail' });
/*
 * Next injects its own `role="alert"` route announcer, so this is scoped to
 * exclude it rather than relying on document order.
 */
const banner = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');

/**
 * Unacknowledged criticals, read from the tab title.
 *
 * Counting from the title rather than the banner is deliberate: with more than
 * one critical outstanding the banner correctly shows the *next* one, so
 * "did acknowledging retire this alert" is a question about the count, not
 * about whether the band happens to be collapsed.
 */
async function criticalCount(page: Page): Promise<number> {
  return Number(/\((\d+)\)/.exec(await page.title())?.[1] ?? 0);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  // The stream replays what is already open, so wait for the connection rather
  // than for a fixed delay.
  await expect(
    page.getByRole('banner', { name: 'System status' }),
  ).toBeVisible();
});

test('a critical event arrives, is reviewed, and a response is dispatched', async ({
  page,
}) => {
  const priority = await observe(page, WRONG_WAY);

  // The detector posted what the camera saw; the dashboard decided severity.
  expect(priority).toBe('critical');

  // ── Time to awareness ──────────────────────────────────────────────────
  // The pinned band takes space at the top rather than overlaying anything.
  await expect(banner(page)).toContainText('Wrong-way driver');
  await expect(banner(page)).toContainText('CAM-014');
  await expect(banner(page)).toHaveCSS('height', '52px');

  // The alert survives the operator looking at another monitor.
  await expect(page).toHaveTitle(/^\(\d+\) CRITICAL · Incident Monitor$/);

  const incident = rows(page).filter({ hasText: 'CAM-014' }).first();
  await expect(incident).toBeVisible();

  // ── Time to decision ───────────────────────────────────────────────────
  // ↑↓ moves and previews: no separate "open" step.
  await page.keyboard.press('ArrowDown');
  await expect(incident).toHaveAttribute('aria-selected', 'true');
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(
    'Wrong-way driver',
  );

  // The reason is rendered, not just the level — the argument for the dispatch.
  await expect(detail(page)).toContainText('live lane 2 of 3');
  await expect(detail(page)).toContainText('MM 42.3');

  const outstandingBefore = await criticalCount(page);

  // Enter acknowledges and takes the lock. (Pass A's state machine)
  await page.keyboard.press('Enter');
  await expect(detail(page)).toContainText('✓ Acknowledged');
  // The audit trail names the workstation that acted, which the server assigned
  // when the stream opened — not a name the browser chose for itself.
  await expect(detail(page)).toContainText(/Acknowledged \(Position \d+\)/);

  // Acknowledging retires this incident's alert — and only acknowledging does.
  await expect.poll(() => criticalCount(page)).toBe(outstandingBefore - 1);

  // D confirms, Enter commits — the whole dispatch without leaving the keyboard.
  await page.keyboard.press('d');
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText('Dispatch a response team?');
  await expect(
    page.getByRole('button', { name: /^Dispatch · Enter$/ }),
  ).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(confirm).toBeHidden();

  await expect(detail(page)).toContainText(
    /✓ Dispatched · unit \d+, ETA \d+ min/,
  );
  await expect(detail(page)).toContainText('Response dispatched');

  // The row drops to the calm treatment: unit and ETA replace the description.
  await expect(incident).toContainText(/Unit \d+ · ETA \d+ min/);
});

test('an arrival never moves what the operator is reading', async ({
  page,
}) => {
  await observe(page, ROUTINE);
  await page.keyboard.press('ArrowDown');
  await expect(
    rows(page).and(page.locator('[aria-selected="true"]')),
  ).toHaveCount(1);

  const buffered = page.getByRole('button', { name: /new/ });

  /*
   * Let the connect-time replay finish before measuring. The server keeps a
   * ring buffer so a reconnect loses nothing, which means earlier tests in this
   * file are still streaming in — and anything landing after the selection
   * would correctly buffer, inflating the count this test is asserting on.
   */
  await page.keyboard.press('Home');
  await expect(buffered).toBeHidden();

  const openTitle = await detail(page)
    .getByRole('heading', { level: 2 })
    .textContent();
  const countBefore = await rows(page).count();

  // Three routine arrivals while an incident is open.
  await observe(page, ROUTINE);
  await observe(page, ROUTINE);
  await observe(page, ROUTINE);

  // They buffer instead of reordering the list under the cursor.
  await expect(buffered).toContainText('+3 new');
  await expect(rows(page)).toHaveCount(countBefore);
  await expect(detail(page).getByRole('heading', { level: 2 })).toHaveText(
    openTitle ?? '',
  );

  // Loading them is an explicit act.
  await page.keyboard.press('Home');
  await expect(rows(page)).toHaveCount(countBefore + 3);
  await expect(buffered).toBeHidden();
});

test('a critical jumps the buffer even while an incident is open', async ({
  page,
}) => {
  await observe(page, ROUTINE);
  await page.keyboard.press('ArrowDown');

  await observe(page, WRONG_WAY);

  // Straight into the queue and the banner — but still at the pinned top band,
  // so the selected row does not move.
  await expect(banner(page)).toContainText('Wrong-way driver');
  await expect(rows(page).filter({ hasText: 'CAM-014' }).first()).toBeVisible();
});

test('dismissing states a reason, and the row can be recovered', async ({
  page,
}) => {
  await observe(page, ROUTINE);
  await page.keyboard.press('ArrowDown');
  const countBefore = await rows(page).count();

  await page.keyboard.press('x');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('aria-label', 'Dismiss as false positive');
  await expect(menu.getByRole('menuitem')).toHaveCount(5);

  await menu.getByRole('menuitem', { name: 'Shadow' }).click();

  // It leaves the queue but keeps its place as a strip with an undo, so a
  // mis-click is recoverable rather than silent.
  await expect(rows(page)).toHaveCount(countBefore - 1);
  const strip = page.getByText(/Dismissed — shadow/);
  await expect(strip).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(rows(page)).toHaveCount(countBefore);
});

test('priority filters narrow the queue and clear again', async ({ page }) => {
  await observe(page, WRONG_WAY);
  await observe(page, {
    ...WRONG_WAY,
    type: 'congestion',
    lanePosition: 'hard_shoulder',
  });

  const header = page.getByRole('heading', { name: /^Queue ·/ });
  // Wait for both to land before counting: the server replays what is already
  // open on connect, so the row count is only stable once they are in.
  await expect(rows(page).filter({ hasText: 'Congestion' })).not.toHaveCount(0);
  const total = await rows(page).count();

  await page.keyboard.press('1');
  await expect(header).toContainText('Critical only');
  // Assert on content rather than a count: earlier tests leave events in the
  // server's replay buffer, so absolute counts are not stable across the file.
  await expect(rows(page).filter({ hasText: 'Congestion' })).toHaveCount(0);
  await expect(
    rows(page).filter({ hasText: 'Wrong-way driver' }),
  ).not.toHaveCount(0);

  await page.keyboard.press('0');
  await expect(header).not.toContainText('only');
  await expect(rows(page)).toHaveCount(total);
});

test('the shortcut overlay publishes the bindings that actually work', async ({
  page,
}) => {
  await page.keyboard.press('?');
  const overlay = page.getByRole('dialog');
  await expect(overlay).toBeVisible();

  // Rendered from the same table the handler dispatches from.
  await expect(overlay).toContainText('Acknowledge, and take the lock');
  await expect(overlay).toContainText('Dispatch a response — Enter confirms');

  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
});

test('the queue is operable and announced without a mouse', async ({
  page,
}) => {
  await observe(page, WRONG_WAY);
  await observe(page, ROUTINE);

  // Landmarks, so a screen-reader user can reach each region directly.
  await expect(
    page.getByRole('banner', { name: 'System status' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Incident queue' }),
  ).toBeVisible();
  await expect(detail(page)).toHaveAttribute('aria-live', 'polite');
  await expect(queue(page)).toBeVisible();

  // Severity reaches assistive technology as text, never as colour alone.
  // Targeted by camera rather than position: the queue is newest-first and the
  // second observation lands above the critical one.
  const critical = rows(page).filter({ hasText: 'CAM-014' }).first();
  await expect(critical).toContainText(/CRITICAL priority — danger/);

  // Roving tabindex: only the selected row is in the tab order, so Tab moves
  // past the queue rather than through every incident in it.
  await page.keyboard.press('ArrowDown');
  const selected = rows(page).and(page.locator('[aria-selected="true"]'));
  await expect(selected).toHaveAttribute('tabindex', '0');
  await expect(
    rows(page).and(page.locator('[aria-selected="false"]')).first(),
  ).toHaveAttribute('tabindex', '-1');
});
