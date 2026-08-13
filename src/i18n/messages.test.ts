import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ja from '../../messages/ja.json';

/*
 * What the message files actually render.
 *
 * The parity check in `pnpm lint` proves the two files have the same keys and
 * the same placeholders. It cannot prove the ICU inside them is right — and
 * pluralisation is where a locale pair goes wrong invisibly, because a
 * mistranslation still renders and still looks like a sentence.
 */

const t = {
  en: createTranslator({ locale: 'en', messages: en }),
  ja: createTranslator({ locale: 'ja', messages: ja }),
};

describe('counted strings', () => {
  it('inflects in English', () => {
    expect(t.en('queue.buffered', { count: 1 })).toBe('+1 new event');
    expect(t.en('queue.buffered', { count: 3 })).toBe('+3 new events');
  });

  it('does not inflect in Japanese, and takes the 件 counter', () => {
    /*
     * Japanese has no grammatical plural: 1 and 3 are the same sentence. The
     * message uses a single `other` branch rather than two identical branches
     * mirroring English — the difference is invisible in the output and is the
     * whole reason the format is ICU.
     */
    expect(t.ja('queue.buffered', { count: 1 })).toBe('新着 1 件');
    expect(t.ja('queue.buffered', { count: 3 })).toBe('新着 3 件');
  });

  it('counts camera feeds with 台, not 件', () => {
    // Counter words are not interchangeable. Cameras are 台 (machines);
    // events are 件 (occurrences). Getting this wrong is instantly visible to a
    // native speaker and invisible to everyone else.
    expect(t.ja('statusBar.feeds', { online: 18, total: 18 })).toBe(
      '18 / 18 台 受信中',
    );
    expect(t.en('statusBar.feeds', { online: 17, total: 18 })).toBe(
      '17 / 18 feeds live',
    );
  });

  it('inflects the English feed count at one', () => {
    expect(t.en('statusBar.feeds', { online: 1, total: 1 })).toBe(
      '1 / 1 feed live',
    );
    expect(t.ja('statusBar.feeds', { online: 1, total: 1 })).toBe(
      '1 / 1 台 受信中',
    );
  });

  it('keeps Western Arabic digits in Japanese', () => {
    // Japanese technical interfaces do not use kanji numerals, and the tabular
    // face the counters render in has no glyphs for them.
    for (const count of [1, 3, 12]) {
      expect(t.ja('queue.buffered', { count })).toMatch(/[0-9]/);
      expect(t.ja('queue.buffered', { count })).not.toMatch(/[一二三十]/);
    }
  });
});

describe('the Japanese register', () => {
  it('uses noun-form labels rather than polite verb forms', () => {
    /*
     * です/ます is unnecessarily polite for machine-generated status text and
     * costs width in a layout that has none to give. Control-room Japanese is
     * plain and declarative — the register rule from the phase brief's D3.
     */
    const strings = Object.values(flatten(ja));
    const polite = strings.filter((value) => /(です|ます)。?$/.test(value));

    expect(polite).toEqual([]);
  });

  it('does not apologise in error or degraded states', () => {
    // Errors state the condition. 申し訳 is an apology, すみません a softener;
    // neither belongs in a status line an operator reads a hundred times.
    const strings = Object.values(flatten(ja)).join('\n');
    expect(strings).not.toMatch(/申し訳|すみません|ごめん/);
  });
});

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  if (value === null || typeof value !== 'object') return {};

  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}
