import { expect, test, type Browser, type Page } from '@playwright/test';

/*
 * Two positions, one incident.
 *
 * The failure Pass A names explicitly is two operators dispatching the same
 * call, and everything else here serves one assertion: exactly one of two
 * browsers takes the incident, and the other is told who did.
 *
 * Each position is a separate browser *context*, which is what makes them
 * different positions — the workstation identity is a cookie the server sets
 * when the stream opens, and two contexts have two cookie jars. Two tabs of one
 * browser would share a jar and be the same desk, which is also correct
 * behaviour and is not the case worth testing.
 */

const CAMERA = {
  id: 'CAM-618',
  name: 'M62 eastbound, junction 24',
  roadway: 'M62',
  direction: 'EB',
  marker: 'MM 30.5',
  laneCount: 3,
  lat: 53.66,
  lng: -1.79,
};

function incidentFrom(cameraId: string) {
  return {
    type: 'stopped_vehicle',
    confidence: 0.92,
    lanePosition: 'live_lane',
    laneNumber: 2,
    snapshotUrl: '/snapshots/stopped_vehicle.svg',
    description: 'Vehicle stationary in lane 2 of 3.',
    camera: { ...CAMERA, id: cameraId },
  };
}

const rows = (page: Page) =>
  page.getByRole('listbox', { name: 'Open incidents' }).getByRole('option');
const detail = (page: Page) =>
  page.getByRole('main', { name: 'Incident detail' });
const taken = (page: Page) => page.getByText(/Taken by position \d+/);

/**
 * Open a dashboard in its own context — a distinct workstation.
 *
 * Waiting for the status bar is enough: the position cookie arrives on the
 * stream response, and nothing here claims anything before a row from that
 * stream is on screen.
 */
async function openPosition(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await expect(
    page.getByRole('banner', { name: 'System status' }),
  ).toBeVisible();
  return { context, page };
}

test('two positions race for one incident and exactly one takes it', async ({
  browser,
}) => {
  const a = await openPosition(browser);
  const b = await openPosition(browser);

  try {
    const camera = 'CAM-618';
    const response = await a.page.request.post('/api/events/ingest', {
      data: incidentFrom(camera),
    });
    expect(response.status()).toBe(202);

    // Posted once; both positions receive it over their own stream.
    const rowA = rows(a.page).filter({ hasText: camera }).first();
    const rowB = rows(b.page).filter({ hasText: camera }).first();
    await expect(rowA).toBeVisible();
    await expect(rowB).toBeVisible();

    await rowA.click();
    await rowB.click();

    // As close to simultaneous as two browsers get.
    await Promise.all([
      a.page.keyboard.press('Enter'),
      b.page.keyboard.press('Enter'),
    ]);

    /*
     * Exactly one *position* is refused — counted in pages, not elements. The
     * refusal deliberately appears twice on the losing screen, on the row and
     * in the detail pane, so counting elements would say "2" for one loser and
     * read as though both had lost.
     */
    const refused = async (page: Page) => (await taken(page).count()) > 0;
    await expect
      .poll(
        async () =>
          [await refused(a.page), await refused(b.page)].filter(Boolean).length,
        { timeout: 10_000 },
      )
      .toBe(1);

    const loserIsA = await refused(a.page);
    const loser = loserIsA ? a.page : b.page;
    const winner = loserIsA ? b.page : a.page;

    // The winner holds it, and the audit trail names the position that acted.
    await expect(detail(winner)).toContainText('✓ Acknowledged');
    await expect(detail(winner)).toContainText(/Acknowledged \(Position \d+\)/);

    // The loser is told who has it — specifically, not a generic failure.
    await expect(detail(loser)).toContainText(/Taken by position \d+/);
    await expect(detail(loser)).toContainText('Already being handled');

    /*
     * And both screens name the *same* owner.
     *
     * Deliberately not asserting that the loser's pane never says
     * "✓ Acknowledged": it does, in the action bar, because the incident really
     * is acknowledged — by the other desk. That is the lock being visible, which
     * is the point. What must not happen is the two positions disagreeing about
     * whose it is.
     */
    const ownerOn = async (page: Page) =>
      /Acknowledged \((Position \d+)\)/.exec(
        (await detail(page).innerText()) ?? '',
      )?.[1];

    const winnerOwner = await ownerOn(winner);
    expect(winnerOwner).toBeDefined();
    expect(await ownerOn(loser)).toBe(winnerOwner);

    /*
     * And the refusal is not merely cosmetic: the server agrees. Asking the
     * record rather than either screen is the point — the two browsers are the
     * parties to the dispute.
     */
    const owners = await Promise.all(
      [a.page, b.page].map(async (page) => {
        const claim = await page.request.post('/api/events/claim', {
          data: { id: await rowOwnerId(page, camera) },
        });
        return (await claim.json()) as { owner?: string };
      }),
    );
    expect(new Set(owners.map((o) => o.owner)).size).toBe(1);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

/** The incident id behind a row, read from the DOM the queue renders. */
async function rowOwnerId(page: Page, camera: string): Promise<string> {
  const id = await page
    .locator(`[data-event-id^="${camera}"]`)
    .first()
    .getAttribute('data-event-id');
  return id ?? '';
}

test('a position that was not racing still sees the lock', async ({
  browser,
}) => {
  /*
   * What the claim notice is for. Without it the only desks that learn an
   * incident has been taken are the two that collided, and every other position
   * goes on showing it as free — which is the confusion the lock exists to
   * remove.
   */
  const actor = await openPosition(browser);
  const observer = await openPosition(browser);

  try {
    const camera = 'CAM-619';
    const response = await actor.page.request.post('/api/events/ingest', {
      data: incidentFrom(camera),
    });
    expect(response.status()).toBe(202);

    const onObserver = rows(observer.page).filter({ hasText: camera }).first();
    await expect(onObserver).toBeVisible();
    // Unowned to begin with: the unread dot is there and no initials are.
    await expect(onObserver).toContainText('Unread');

    await rows(actor.page).filter({ hasText: camera }).first().click();
    await actor.page.keyboard.press('Enter');
    await expect(detail(actor.page)).toContainText('✓ Acknowledged');

    // The observer never touched it and never reloaded.
    await expect(onObserver).not.toContainText('Unread', { timeout: 10_000 });
    await onObserver.click();
    await expect(detail(observer.page)).toContainText('✓ Acknowledged');
    await expect(detail(observer.page)).toContainText(/Position \d+/);
  } finally {
    await actor.context.close();
    await observer.context.close();
  }
});
