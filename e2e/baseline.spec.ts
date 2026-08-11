import { expect, test, type Page } from '@playwright/test';

/*
 * The measurement harness for roadmap #3, run before and after virtualisation.
 *
 *   pnpm baseline
 *
 * Skipped by default: it takes minutes and produces a reading rather than a
 * pass/fail, so it has no place in the normal suite. `metrics.spec.ts` is the
 * permanent check that the instrumentation works.
 *
 * What this measures, stated plainly because the numbers are misleading
 * otherwise. The dwell is scripted, so both figures are dominated by this
 * driver rather than by an operator — and the sixty events arrive in a batch,
 * so time to awareness here is mostly queue backlog. It is a *comparison*
 * instrument: the same scripted pass, before and after a change. If the queue
 * gets slower to respond, decision time grows beyond the scripted dwell. It is
 * not a measure of how fast a real operator works.
 *
 * It works *distinct* incidents by dismissing rather than dispatching: a
 * dispatched incident stays in the queue, so a driver that always takes the
 * head re-decides the same row repeatedly. Dismissing removes it, so each pass
 * lands on a new one and the sample is n incidents rather than one incident
 * measured n times. That mistake cost the first reading — 39 presses across 3
 * incidents.
 */

test.skip(
  !process.env.RUN_BASELINE,
  'Measurement run, not a test. Use `pnpm baseline`.',
);

const rows = (page: Page) =>
  page.getByRole('listbox', { name: 'Open incidents' }).getByRole('option');

test('baseline: awareness and decision over a worked queue', async ({
  page,
}) => {
  test.setTimeout(300_000);

  await page.goto('/');
  await expect(
    page.getByRole('banner', { name: 'System status' }),
  ).toBeVisible();

  // A queue with real depth, which is the condition virtualisation is meant to
  // improve. Measuring against twelve rows would tell us nothing about four
  // hundred.
  for (let i = 0; i < 60; i += 1) {
    await page.request.post('/api/events/ingest', { data: {} });
  }
  await expect(rows(page).nth(20)).toBeVisible({ timeout: 30_000 });

  let worked = 0;
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowDown');
    if (
      (await rows(page).and(page.locator('[aria-selected="true"]')).count()) ===
      0
    ) {
      break;
    }

    // A considered look rather than a glance, with enough spread that the
    // percentiles are not three copies of one number.
    await page.waitForTimeout(900 + Math.floor(Math.random() * 2_600));

    await page.keyboard.press('x');
    const menu = page.getByRole('menu');
    if (!(await menu.isVisible().catch(() => false))) break;
    await menu.getByRole('menuitem').first().click();
    await expect(menu).toBeHidden();
    worked += 1;
  }

  await page.waitForTimeout(2_500);

  const report = await (await page.request.get('/api/metrics')).json();
  console.log('\n=== BASELINE ===');
  console.log(`worked ${worked} distinct incidents`);
  console.log(JSON.stringify(report, null, 2));
  console.log('=== END BASELINE ===\n');

  expect(report.timeToAwarenessMs.n).toBeGreaterThan(5);
  expect(report.timeToDecisionMs.n).toBeGreaterThan(5);
});
