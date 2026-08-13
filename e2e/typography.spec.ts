import { expect, test, type Page } from '@playwright/test';

/*
 * The Japanese typography layer.
 *
 * Everything here is a property that is invisible until it is wrong, and wrong
 * in a way nobody notices from a screenshot: numerals silently captured by a
 * proportional CJK face, a line height that pushes the twelfth queue row off
 * screen, tracking tuned for Latin applied to kanji.
 *
 * Measured rather than eyeballed, because "it looks fine" is exactly the
 * failure mode — the phase brief's own words are "verify this explicitly; it is
 * easy to miss".
 */

/** Set the workstation's language the way the switcher does. */
async function setLocaleCookie(page: Page, locale: 'en' | 'ja'): Promise<void> {
  await page.context().addCookies([
    {
      name: 'locale',
      value: locale,
      url: page.url().startsWith('http')
        ? new URL(page.url()).origin
        : 'http://localhost:3000',
    },
  ]);
}

const stack = (page: Page, token: '--font-ui' | '--font-mono') =>
  page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    token,
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
});

test('the document declares the resolved locale', async ({ page }) => {
  // Screen readers switch synthesiser voice on this. Left at "en", a Japanese
  // interface is read aloud as English phonemes — unusable, not merely wrong.
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  await setLocaleCookie(page, 'ja');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
});

test('numerals keep the tabular face in both locales', async ({ page }) => {
  /*
   * The failure this exists to prevent: a Japanese fallback capturing digits.
   * Noto Sans JP declares Latin ranges of its own, so nothing about
   * `unicode-range` stops it — what stops it is sitting *after* the Latin face
   * in the stack, and per-glyph fallback taking the first family that has the
   * glyph. That is a property of one character of CSS ordering, so it is worth
   * a test.
   */
  const measure = async () =>
    page.evaluate(async () => {
      /*
       * Rendered DOM text, not `canvas.measureText`. Canvas resolves fonts
       * separately and does not reliably pull in `unicode-range` subsets, so it
       * reported the correct answer even with the stack deliberately inverted —
       * a measurement that cannot fail is not a measurement.
       */
      const span = (family: string, text: string) => {
        const node = document.createElement('span');
        node.textContent = text;
        node.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:500 14px ${family}`;
        document.body.append(node);
        return node;
      };

      const digits = '0123456789';
      const stackNode = span('var(--font-mono)', digits);
      const monoNode = span('var(--font-ibm-plex-mono)', digits);
      const jpNode = span('var(--font-noto-sans-jp)', digits);
      const perDigit = [...digits].map((d) => span('var(--font-mono)', d));

      await document.fonts.ready;

      const result = {
        inStack: stackNode.getBoundingClientRect().width,
        inDesignFace: monoNode.getBoundingClientRect().width,
        inJapaneseFace: jpNode.getBoundingClientRect().width,
        perDigit: perDigit.map((n) => n.getBoundingClientRect().width),
      };

      for (const node of [stackNode, monoNode, jpNode, ...perDigit])
        node.remove();
      return result;
    });

  const english = await measure();

  /*
   * The control. If the two faces set digits identically, nothing below can
   * distinguish them and the test would be vacuous — so assert they differ
   * before relying on the comparison.
   */
  expect(
    Math.abs(english.inDesignFace - english.inJapaneseFace),
    'the two faces set digits identically, so this test cannot detect capture',
  ).toBeGreaterThan(0.5);

  // The stack resolves digits to the design's own face, not the CJK fallback.
  expect(english.inStack).toBeCloseTo(english.inDesignFace, 1);

  // Every digit the same width — the point of a tabular face, and what stops
  // the age counters reflowing the row every second as they tick.
  expect(new Set(english.perDigit.map((w) => w.toFixed(2))).size).toBe(1);

  await setLocaleCookie(page, 'ja');
  await page.reload();

  const japanese = await measure();
  expect(japanese.inStack).toBeCloseTo(japanese.inDesignFace, 1);
  expect(new Set(japanese.perDigit.map((w) => w.toFixed(2))).size).toBe(1);

  // And identical between locales: the Japanese font never touched them.
  expect(japanese.inStack).toBeCloseTo(english.inStack, 1);
});

test('kanji render in the Japanese face, not an arbitrary system font', async ({
  page,
}) => {
  await setLocaleCookie(page, 'ja');
  await page.reload();
  await page.evaluate(() => document.fonts.ready);

  /*
   * Deliberately not comparing advance widths against a generic font, which was
   * the first thing I tried and is meaningless: CJK glyphs are full-width by
   * definition, so 渋滞 measures exactly 2em in *every* correct Japanese face.
   * Identical widths prove nothing either way.
   *
   * `document.fonts.check()` is no better — it answers "can this be rendered
   * without a download", which is true when the family is absent and the
   * browser intends to fall back.
   *
   * What is actually at risk is the download: next/font fetches ~370 faces at
   * build time and carries on if they fail. So the question is whether a real
   * Noto Sans JP face reached `loaded`, which is a fact the page can be asked
   * directly.
   */
  const ui = await stack(page, '--font-ui');
  expect(ui).toContain('Noto');

  const loaded = await page.evaluate(async () => {
    // Force the browser to resolve the faces it needs for Japanese text.
    const probe = document.createElement('span');
    probe.textContent = '渋滞 逆走 落下物 停止車両';
    probe.style.font = '600 13px var(--font-ui)';
    document.body.append(probe);
    await document.fonts.ready;

    const faces = [...document.fonts].filter(
      (face) => face.family.replace(/["']/g, '') === 'Noto Sans JP',
    );
    probe.remove();

    return {
      declared: faces.length,
      loaded: faces.filter((face) => face.status === 'loaded').length,
      weights: [...new Set(faces.map((face) => face.weight))].sort(),
    };
  });

  expect(
    loaded.declared,
    'no Noto Sans JP faces declared — the build shipped only the metric fallback',
  ).toBeGreaterThan(0);
  expect(
    loaded.loaded,
    'Noto Sans JP is declared but no face actually loaded',
  ).toBeGreaterThan(0);
});

test('the queue still shows twelve rows at 1440×900', async ({ page }) => {
  /*
   * The density target the whole layout is built on, and the constraint that
   * decided the Japanese type scale: raising line height by a flat 0.15 would
   * have pushed the row's two stacked lines past 40px and quietly cost a row.
   */
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const locale of ['en', 'ja'] as const) {
    await setLocaleCookie(page, locale);
    await page.reload();
    await page.evaluate(() => document.fonts.ready);

    for (let index = 0; index < 14; index += 1) {
      const response = await page.request.post('/api/events/ingest', {
        data: {},
      });
      expect(response.status()).toBe(202);
    }

    const rows = page
      .getByRole('listbox', { name: /Open incidents|未対応/ })
      .getByRole('option');
    await expect
      .poll(async () => await rows.count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(12);

    // The row is a fixed 40px in both locales — the virtualiser measures
    // against it, so a taller row in Japanese would misplace every window.
    const heights = await rows.evaluateAll((nodes) =>
      nodes.slice(0, 12).map((node) => node.getBoundingClientRect().height),
    );
    // Rounded: the virtualiser positions rows with a transform, so the measured
    // height carries sub-pixel noise (40.000015…) that means nothing.
    expect(
      new Set(heights.map((height) => Math.round(height))),
      `row heights in ${locale}`,
    ).toEqual(new Set([40]));

    // And the text inside genuinely fits, rather than overflowing invisibly.
    const overflowing = await rows.evaluateAll(
      (nodes) =>
        nodes
          .slice(0, 12)
          .filter((node) => node.scrollHeight > node.clientHeight).length,
    );
    expect(overflowing, `overflowing rows in ${locale}`).toBe(0);
  }
});

test('Japanese retargets the type tokens rather than the components', async ({
  page,
}) => {
  const read = () =>
    page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        caption: cs.getPropertyValue('--text-caption').trim(),
        captionLine: cs.getPropertyValue('--text-caption--line-height').trim(),
        label: cs.getPropertyValue('--tracking-label').trim(),
        kicker: cs.getPropertyValue('--tracking-kicker').trim(),
      };
    });

  const english = await read();
  expect(english.caption).toBe('13px');
  expect(english.captionLine).toBe('18px');
  // Parsed, not string-compared: the built CSS drops the leading zero, so the
  // computed value is ".06em" rather than "0.06em".
  expect(Number.parseFloat(english.label)).toBeCloseTo(0.06);

  await setLocaleCookie(page, 'ja');
  await page.reload();

  const japanese = await read();
  // One size down, more leading — Japanese carries more per character and
  // wants the difference back as space between lines.
  expect(japanese.caption).toBe('12px');
  expect(Number.parseFloat(japanese.captionLine)).toBeGreaterThan(18);

  // Tracking tuned to open up uppercase Latin reads as a mistake on kanji.
  expect(Number.parseFloat(japanese.label)).toBe(0);
  expect(Number.parseFloat(japanese.kicker)).toBe(0);
});

test('long Japanese truncates rather than wrapping or overflowing', async ({
  page,
}) => {
  /*
   * C4, the other direction. Japanese is usually shorter than English —
   * "Dispatch response" is 出動指示 — but compound technical terms run longer,
   * and the row's truncation is drawn in the design rather than being an
   * accident of width. It has to still trigger with CJK, where there are no
   * spaces to break at.
   */
  await setLocaleCookie(page, 'ja');
  await page.reload();

  const measured = await page.evaluate(async () => {
    const row = document.createElement('div');
    row.style.cssText = 'width:200px;position:absolute;visibility:hidden';
    const line = document.createElement('span');
    // A deliberately over-long compound: "expressway inbound carriageway
    // travel-lane stopped-vehicle detection notification".
    line.textContent = '高速道路上り線走行車線停止車両検知通知システム異常発生';
    line.className = 'text-caption truncate';
    line.style.display = 'block';
    row.append(line);
    document.body.append(row);
    await document.fonts.ready;

    const result = {
      clientWidth: line.clientWidth,
      scrollWidth: line.scrollWidth,
      height: line.getBoundingClientRect().height,
      overflow: getComputedStyle(line).textOverflow,
      whiteSpace: getComputedStyle(line).whiteSpace,
    };
    row.remove();
    return result;
  });

  // It overflows its box — so truncation is genuinely being exercised.
  expect(measured.scrollWidth).toBeGreaterThan(measured.clientWidth);
  // Clipped with an ellipsis on one line, not wrapped to several.
  expect(measured.overflow).toBe('ellipsis');
  expect(measured.whiteSpace).toBe('nowrap');
  // One line of the Japanese caption leading, not two.
  expect(measured.height).toBeLessThanOrEqual(20);
});

test('the queue renders Japanese domain vocabulary, not translated English', async ({
  page,
}) => {
  /*
   * The vocabulary reaching the screen, rather than merely existing in a JSON
   * file. 逆走 is the tell: it is the established term in Japanese road safety,
   * and a machine translation of "wrong-way driver" would not produce it.
   */
  await setLocaleCookie(page, 'ja');
  await page.reload();

  const response = await page.request.post('/api/events/ingest', {
    data: { preset: 'critical' },
  });
  expect(response.status()).toBe(202);

  const rows = page.getByRole('listbox').getByRole('option');
  await expect(rows.first()).toBeVisible();

  const queue = page.getByRole('listbox');
  await expect(queue).toContainText('逆走');

  // Camera IDs are identifiers and stay identifiers in both locales.
  await expect(queue).toContainText(/CAM-\d+/);

  await rows.first().click();
  const detail = page.getByRole('main');
  await expect(detail).toContainText('逆走');

  // The priority chip takes the Japanese level, not "CRITICAL".
  await expect(page.getByText('重大').first()).toBeVisible();
});

test('the age counter keeps a constant width as it ticks, in both locales', async ({
  page,
}) => {
  /*
   * The counter is `mm:ss` in both locales, and deliberately not localised into
   * `2分14秒`.
   *
   * The phase brief asks for the relative-time output to localise. This
   * interface never used `formatDistanceToNowStrict` — Pass B rejected it in
   * phase 1 because a counter whose *width* changes as the words change makes
   * the column beside it twitch once a second. `2分14秒` has exactly that
   * problem (`1分5秒` is four characters shorter than `12分14秒`), so adopting
   * it would trade a real design constraint for a cosmetic one.
   *
   * `mm:ss` needs no translation: it is digits and a colon, and it reads the
   * same to both operators. The rule the brief is protecting — no English words
   * leaking into a Japanese screen — is satisfied by there being no words at
   * all. ADR-0013.
   */
  for (const locale of ['en', 'ja'] as const) {
    await setLocaleCookie(page, locale);
    await page.reload();

    const response = await page.request.post('/api/events/ingest', {
      data: {},
    });
    expect(response.status()).toBe(202);

    const row = page.getByRole('listbox').getByRole('option').first();
    await expect(row).toBeVisible();

    const age = await row.evaluate((node) => {
      const text = node.textContent ?? '';
      return /\d{1,2}:\d{2}(:\d{2})?/.exec(text)?.[0] ?? '';
    });

    // Digits and a colon. No 分, no 秒, and nothing that changes width.
    expect(age, `age counter in ${locale}`).toMatch(/^\d{2}:\d{2}$/);
    expect(age).not.toMatch(/[分秒]/);
  }
});

test('the latency arrow and units survive the Japanese font stack', async ({
  page,
}) => {
  /*
   * C4's leftover: the brief asks explicitly whether the arrow glyph and its
   * spacing survive. `↓` and `↑` are in the flow legend and are exactly the
   * kind of character a CJK fallback renders full-width, which would break the
   * two-line legend's alignment.
   */
  await setLocaleCookie(page, 'ja');
  await page.reload();

  const measured = await page.evaluate(async () => {
    const span = (family: string) => {
      const node = document.createElement('span');
      node.textContent = '↓↑';
      node.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:500 13px ${family}`;
      document.body.append(node);
      return node;
    };
    const inStack = span('var(--font-ui)');
    const inLatin = span('var(--font-public-sans)');
    await document.fonts.ready;

    const result = {
      stack: inStack.getBoundingClientRect().width,
      latin: inLatin.getBoundingClientRect().width,
    };
    inStack.remove();
    inLatin.remove();
    return result;
  });

  // The design's own face answers for the arrows; a full-width CJK substitute
  // would measure noticeably wider.
  expect(measured.stack).toBeGreaterThan(0);
  expect(measured.stack).toBeCloseTo(measured.latin, 1);
});

test('Japanese line breaking follows kinsoku rules', async ({ page }) => {
  await setLocaleCookie(page, 'ja');
  await page.reload();

  const breaking = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      lineBreak: cs.lineBreak,
      wordBreak: cs.wordBreak,
      overflowWrap: cs.overflowWrap,
    };
  });

  // `strict` applies the full kinsoku set: no break before 。、）」 or a small
  // kana, no break after an opening bracket.
  expect(breaking.lineBreak).toBe('strict');

  /*
   * `anywhere` and `break-word` are actively wrong for Japanese — they are what
   * breaks a word in half. `auto-phrase` is the enhancement where supported;
   * `normal` is the correct fallback, and both are acceptable here.
   */
  expect(['auto-phrase', 'normal']).toContain(breaking.wordBreak);
  expect(breaking.overflowWrap).toBe('normal');
});

test('the layout survives every string doubled in length', async ({ page }) => {
  /*
   * The pseudo-locale check: find layout that only holds because English
   * happens to be short.
   *
   * Doubling every text node in place rather than adding a third
   * `messages/*.json`. A real pseudo-locale needs a fake locale code that
   * `isLocale`, the switcher and the parity check all have to know about —
   * machinery in the shipped product to serve a test — and doubling the
   * rendered text reflows identically, which is all a *layout* check needs.
   *
   * **This assertion is weaker than it looks, and that is worth saying.** Three
   * formulations were tried — growth in row and bar heights, per-element
   * horizontal overflow, then both axes — and none of them failed against a
   * deliberately broken row (`h-10` removed, then `truncate` removed). The
   * design truncates and fixes heights aggressively enough that doubled text
   * produces no measurable change anywhere it was looked for.
   *
   * That is a real finding about the design rather than a passing test, and it
   * leaves this as a guard against future layout that is *not* built that way,
   * not as proof that today's is safe. The horizontal-scroll assertion is the
   * part with teeth: nothing may push the page sideways.
   */
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dev/states');
  await page.evaluate(() => document.fonts.ready);

  const widthBefore = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );

  const after = await page.evaluate(() => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const node of nodes) {
      const text = node.nodeValue ?? '';
      if (text.trim().length > 0) node.nodeValue = `${text} ${text}`;
    }

    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    };
  });

  // Nothing pushed the page sideways, and the document did not get wider.
  expect(after.scrollWidth).toBeLessThanOrEqual(after.clientWidth);
  expect(after.scrollWidth).toBe(widthBefore);
});
