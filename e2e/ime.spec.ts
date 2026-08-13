import { expect, test, type Page } from '@playwright/test';

/*
 * Japanese input against single-key shortcuts.
 *
 * Typing 渋滞 ("congestion") means pressing `j-u-u-t-a-i` and then converting.
 * Every one of those keystrokes fires a real `keydown`, and this application
 * binds `D` to dispatch and `X` to dismiss. Without a guard, an operator typing
 * a Japanese note fires dispatch actions mid-word — in a system whose purpose is
 * sending safety crews onto a live motorway.
 *
 * Driven through real composition events rather than a mocked `isComposing`
 * flag, because what is under test is how the browser sequences
 * `compositionstart`, `keydown` and `compositionend` — and a mock would be
 * asserting the assumption instead of checking it.
 */

const CAMERA = {
  id: 'CAM-731',
  name: 'M40 northbound, junction 15',
  roadway: 'M40',
  direction: 'NB',
  marker: 'MM 88.2',
  laneCount: 3,
  lat: 52.14,
  lng: -1.58,
};

const INCIDENT = {
  type: 'congestion',
  confidence: 0.94,
  lanePosition: 'live_lane',
  laneNumber: 2,
  snapshotUrl: '/snapshots/congestion.svg',
  description: 'Average speed below 20mph across lane 2 of 3.',
  camera: CAMERA,
};

const rows = (page: Page) =>
  page.getByRole('listbox', { name: 'Open incidents' }).getByRole('option');
const detail = (page: Page) =>
  page.getByRole('main', { name: 'Incident detail' });
/**
 * Anything `D` or `X` could have opened.
 *
 * Explicitly all three roles: Radix renders the dispatch confirmation as
 * `alertdialog` and the dismissal reasons as `menu`, neither of which
 * `getByRole('dialog')` matches. Checking only for `dialog` made the assertion
 * that no shortcut fired pass whether or not one had.
 */
const overlays = (page: Page) =>
  page.locator('[role="alertdialog"], [role="menu"], [role="dialog"]');

/**
 * Type romaji the way an IME does: composition events around each keystroke,
 * then a commit.
 *
 * `keyCode: 229` is set on the composing keydowns because that is what several
 * browsers report during composition instead of setting `isComposing` — the
 * legacy signal the guard also has to honour.
 */
async function composeJapanese(
  page: Page,
  romaji: string,
  committed: string,
): Promise<void> {
  await page.evaluate(
    ({ romaji: keys, committed: text }) => {
      const target = document.activeElement ?? document.body;

      target.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true, data: '' }),
      );

      for (const character of keys) {
        target.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: character,
            keyCode: 229,
            which: 229,
            isComposing: true,
            bubbles: true,
            cancelable: true,
          }),
        );
        target.dispatchEvent(
          new CompositionEvent('compositionupdate', {
            bubbles: true,
            data: character,
          }),
        );
      }

      /*
       * The commit. `compositionend` first, then the Enter that caused it with
       * `isComposing` already false — the browser ordering that defeats a guard
       * checking only the per-event flag, and the reason for the tail window.
       */
      target.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: text }),
      );
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          keyCode: 13,
          which: 13,
          isComposing: false,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { romaji, committed },
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('banner', { name: 'System status' }),
  ).toBeVisible();
});

test('composing Japanese fires no shortcut, and no dispatch', async ({
  page,
}) => {
  const response = await page.request.post('/api/events/ingest', {
    data: INCIDENT,
  });
  expect(response.status()).toBe(202);

  const row = rows(page).filter({ hasText: CAMERA.id }).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(detail(page)).toBeVisible();

  /*
   * 渋滞 is `juutai`. The `d` of a word like `dou` and the `x` of `xa` are the
   * live hazard, so this composes a string containing both alongside the real
   * reading — every one of these letters is bound to something.
   */
  await composeJapanese(page, 'juutai', '渋滞');
  await composeJapanese(page, 'dourodxa', '道路');

  // No confirmation dialog opened: `d` never reached the dispatch binding and
  // `x` never reached the dismiss menu.
  await expect(overlays(page)).toHaveCount(0);

  // And the incident is untouched — still selectable, never dispatched.
  await expect(detail(page)).not.toContainText('Unit');
  await expect(detail(page)).not.toContainText('ETA');
});

test('the keystroke that commits a conversion does not acknowledge', async ({
  page,
}) => {
  /*
   * The subtle half. `compositionend` can land before the `keydown` that caused
   * it, so the Enter finishing a Japanese word arrives with `isComposing`
   * false. Enter acknowledges an incident and takes the lock.
   */
  const camera = { ...CAMERA, id: 'CAM-732' };
  const response = await page.request.post('/api/events/ingest', {
    data: { ...INCIDENT, camera },
  });
  expect(response.status()).toBe(202);

  const row = rows(page).filter({ hasText: camera.id }).first();
  await expect(row).toBeVisible();
  await row.click();

  await composeJapanese(page, 'juutai', '渋滞');

  await expect(detail(page)).not.toContainText('✓ Acknowledged');
  await expect(row).toContainText('Unread');
});

test('the shortcuts still work when nobody is composing', async ({ page }) => {
  /*
   * The other half of the guard, and the one a too-eager fix breaks: a
   * dashboard where `D` never dispatches is also broken, and would pass every
   * assertion above.
   */
  const camera = { ...CAMERA, id: 'CAM-733' };
  const response = await page.request.post('/api/events/ingest', {
    data: { ...INCIDENT, camera },
  });
  expect(response.status()).toBe(202);

  const row = rows(page).filter({ hasText: camera.id }).first();
  await expect(row).toBeVisible();
  await row.click();

  await page.keyboard.press('Enter');
  await expect(detail(page)).toContainText('✓ Acknowledged');

  await page.keyboard.press('d');
  await expect(overlays(page)).toHaveCount(1);
  await page.keyboard.press('Escape');
});

test('a shortcut works again once composition has finished', async ({
  page,
}) => {
  // The tail window suppresses briefly and then releases. A guard that latched
  // would leave the keyboard dead for the rest of the shift.
  const camera = { ...CAMERA, id: 'CAM-734' };
  const response = await page.request.post('/api/events/ingest', {
    data: { ...INCIDENT, camera },
  });
  expect(response.status()).toBe(202);

  const row = rows(page).filter({ hasText: camera.id }).first();
  await expect(row).toBeVisible();
  await row.click();

  await composeJapanese(page, 'juutai', '渋滞');
  await expect(detail(page)).not.toContainText('✓ Acknowledged');

  // Past the tail, a deliberate keystroke lands.
  await page.waitForTimeout(120);
  await page.keyboard.press('Enter');
  await expect(detail(page)).toContainText('✓ Acknowledged');
});

test('typing in a field never reaches the queue, composing or not', async ({
  page,
}) => {
  /*
   * The broad guard, which predates this workstream and which Japanese input
   * makes load-bearing rather than incidental. Asserted here because it is the
   * layer the composition guard sits behind, and a regression in it would be
   * invisible with the composition guard in place.
   */
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'ime-probe';
    document.body.append(input);
    input.focus();
  });

  // Every destructive binding, typed as text.
  await page.keyboard.type('dxr');
  await composeJapanese(page, 'dxr', 'テスト');

  /*
   * That the field received the keystrokes is what makes the next assertion
   * mean anything: the keys were genuinely delivered and genuinely ignored by
   * the queue, rather than never having arrived at all.
   */
  await expect(page.locator('#ime-probe')).toHaveValue('dxr');
  await expect(overlays(page)).toHaveCount(0);

  /*
   * Deliberately *not* asserting the row count is unchanged. The ambient
   * simulator posts events on its own, so an absolute total is a race with the
   * clock rather than a statement about the keyboard — the trap recorded in
   * DECISIONS 6.8, which this test walked straight into and flaked on once
   * before being narrowed to what it actually means to check.
   */
  await page.evaluate(() => document.querySelector('#ime-probe')?.remove());
});
