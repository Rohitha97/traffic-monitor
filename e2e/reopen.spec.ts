import { expect, test, type Page } from '@playwright/test';

/*
 * The reopen rule, end to end.
 *
 * The unit tests in `src/lib/correlation.test.ts` pin the boundaries — the
 * window, the lane arithmetic, the type check. What they cannot show is that
 * the operator's dismissal actually reaches the server: the client marks
 * optimistically and posts the reason separately, so the rule can be perfectly
 * correct and still never fire because nothing on the server ever learned that
 * a call was dismissed. That is exactly the failure this file exists to catch.
 */

/**
 * A camera no other test uses — including the other tests in this file.
 *
 * The server's replay buffer is shared across the whole run and every test
 * reloads the page, so a reconnecting client is shown what earlier tests left
 * open. Correlation is *about* matching against history, so it cannot simply
 * tolerate that history the way an assertion on row counts can: two tests
 * sharing a camera would have each one's leftovers satisfying — or spoiling —
 * the other's match.
 */
function cameraFor(id: string) {
  return {
    id,
    name: 'M40 southbound, junction 12–11',
    roadway: 'M40',
    direction: 'SB',
    marker: 'MM 77.6',
    laneCount: 3,
    lat: 52.0891,
    lng: -1.4102,
  };
}

function debrisFrom(cameraId: string) {
  return {
    type: 'debris',
    confidence: 0.44,
    lanePosition: 'live_lane',
    laneNumber: 1,
    snapshotUrl: '/snapshots/debris.svg',
    description: 'Possible debris in lane 1. Low-confidence detection.',
    camera: cameraFor(cameraId),
  };
}

async function observe(
  page: Page,
  body: Record<string, unknown>,
): Promise<{ id: string; seenBefore?: string }> {
  const response = await page.request.post('/api/events/ingest', {
    data: body,
  });
  expect(response.status()).toBe(202);
  return (await response.json()) as { id: string; seenBefore?: string };
}

const rows = (page: Page) =>
  page.getByRole('listbox', { name: 'Open incidents' }).getByRole('option');
const detail = (page: Page) =>
  page.getByRole('main', { name: 'Incident detail' });

/**
 * Dismiss the selected incident and wait for the server to hear about it.
 *
 * The mark POST is fire-and-forget by design — an operator's keystroke does not
 * block on a write — so a test that re-ingests immediately would be racing it
 * and would fail intermittently rather than honestly.
 */
async function dismissSelected(page: Page, reason: string): Promise<void> {
  const marked = page.waitForResponse(
    (response) =>
      response.url().includes('/api/events/mark') && response.status() === 200,
  );

  await page.keyboard.press('x');
  await page.getByRole('menu').getByRole('menuitem', { name: reason }).click();
  await marked;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('banner', { name: 'System status' }),
  ).toBeVisible();
});

test('a dismissed call that re-detects comes back tagged with the original reason', async ({
  page,
}) => {
  const camera = 'CAM-431';
  await observe(page, debrisFrom(camera));

  const first = rows(page).filter({ hasText: camera }).first();
  await expect(first).toBeVisible();
  await first.click();
  await dismissSelected(page, 'Shadow');
  await expect(rows(page).filter({ hasText: camera })).toHaveCount(0);

  // The redetect: same camera, same class, one lane over — which the rule
  // treats as one object the detector changed its mind about.
  const redetect = await observe(page, {
    ...debrisFrom(camera),
    laneNumber: 2,
  });

  // The server says so on the way in, before any of this reaches a screen.
  expect(redetect.seenBefore).toBe('Shadow');

  // And the row carries the reason itself, not merely the fact of a prior call:
  // an operator who has to open the incident to find out what they already
  // decided is being asked to make the decision twice.
  const reopened = rows(page).filter({ hasText: camera }).first();
  await expect(reopened).toContainText('Seen before · shadow');

  await reopened.click();
  await expect(detail(page)).toContainText('Seen before');
  await expect(detail(page)).toContainText('dismissed as “shadow”');

  // It arrives as a live incident with its own priority, not as the old one
  // revived — the earlier call is context for the decision, not a substitute
  // for making one.
  await expect(detail(page)).toContainText('Detected · confidence 44%');
  await expect(detail(page)).toContainText(
    'Seen before — dismissed as "Shadow"',
  );
});

test('a different event type from the same camera is not treated as the same call', async ({
  page,
}) => {
  const camera = 'CAM-432';
  await observe(page, debrisFrom(camera));

  await rows(page).filter({ hasText: camera }).first().click();
  await dismissSelected(page, 'Spray');
  await expect(rows(page).filter({ hasText: camera })).toHaveCount(0);

  // Debris and a stopped vehicle on one camera are two incidents. Merging them
  // would hide a real call behind an unrelated dismissal.
  const other = await observe(page, {
    ...debrisFrom(camera),
    type: 'stopped_vehicle',
    description: 'Vehicle stationary in lane 1 of 3.',
  });
  expect(other.seenBefore).toBeUndefined();

  const row = rows(page).filter({ hasText: camera }).first();
  await expect(row).toBeVisible();
  await expect(row).not.toContainText('Seen before');
});
