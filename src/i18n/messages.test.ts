import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';

import {
  DISMISS_REASON_LABEL,
  DISMISS_REASONS,
  EVENT_TYPE_LABEL,
  EVENT_TYPES,
  LANE_POSITION_LABEL,
  LANE_POSITIONS,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUSES,
} from '@/lib/schema';

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

/**
 * Render a key built at runtime.
 *
 * The typed-key augmentation is doing its job here and getting in the way of
 * this one test: iterating enum × group generates combinations that cannot
 * exist (`domain.eventType.live_lane`), and TypeScript is right to refuse them.
 * The whole point of this test is to walk the matrix and check what resolves,
 * so the key is a string here — and every other call in the file stays typed.
 */
const render = (locale: 'en' | 'ja', key: string): string =>
  (t[locale] as unknown as (k: string) => string)(key);

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

describe('the domain vocabulary', () => {
  /*
   * `en.json` and the label maps in `src/lib/schema.ts` are two copies of the
   * same English wording — the second exists so the pure view mappers stay
   * callable without a React tree. Two copies drift, so they are held together
   * here rather than by hope.
   */
  it('matches the English label maps the pure mappers default to', () => {
    for (const type of EVENT_TYPES) {
      expect(render('en', `domain.eventType.${type}`)).toBe(
        EVENT_TYPE_LABEL[type],
      );
    }
    for (const position of LANE_POSITIONS) {
      expect(render('en', `domain.lanePosition.${position}`)).toBe(
        LANE_POSITION_LABEL[position],
      );
    }
    for (const priority of PRIORITIES) {
      expect(render('en', `domain.priority.${priority}`)).toBe(
        PRIORITY_LABEL[priority],
      );
    }
    for (const status of STATUSES) {
      expect(render('en', `domain.status.${status}`)).toBe(
        STATUS_LABEL[status],
      );
    }
    for (const reason of DISMISS_REASONS) {
      expect(render('en', `domain.dismissReason.${reason}`)).toBe(
        DISMISS_REASON_LABEL[reason],
      );
    }
  });

  it('covers every value of every enum in both locales', () => {
    // A missing term renders the key on a queue row — the failure the parity
    // check catches for whole keys, one level further in.
    const cases = [
      ['eventType', EVENT_TYPES],
      ['lanePosition', LANE_POSITIONS],
      ['priority', PRIORITIES],
      ['status', STATUSES],
      ['dismissReason', DISMISS_REASONS],
      ['direction', ['NB', 'SB', 'EB', 'WB']],
    ] as const;

    for (const [group, values] of cases) {
      for (const value of values) {
        for (const locale of ['en', 'ja'] as const) {
          const key = `domain.${group}.${value}`;
          const rendered = render(locale, key);
          expect(rendered, `${locale} ${key}`).toBeTruthy();
          expect(rendered, `${key} is missing`).not.toBe(key);
        }
      }
    }
  });

  it('uses established Japanese road-operations terms', () => {
    /*
     * Pinned because these are the terms a machine translation would get wrong
     * — 逆走 in particular is the specific, well-known term in Japanese road
     * safety, where a literal rendering of "wrong-way driver" would not be.
     */
    expect(t.ja('domain.eventType.wrong_way_driver')).toBe('逆走');
    expect(t.ja('domain.eventType.stopped_vehicle')).toBe('停止車両');
    expect(t.ja('domain.eventType.debris')).toBe('落下物');
    expect(t.ja('domain.eventType.congestion')).toBe('渋滞');
    expect(t.ja('domain.lanePosition.hard_shoulder')).toBe('路肩');
    expect(t.ja('domain.marker')).toBe('キロポスト');
  });

  it('keeps compass directions rather than 上り/下り', () => {
    /*
     * The estate is British motorways and the model stores compass bearings.
     * 上り/下り mean "toward/away from Tokyo" and are undefined for the M6 —
     * mapping onto them would be inventing a fact. ADR-0012.
     */
    expect(t.ja('domain.direction.NB')).toBe('北行');
    for (const value of Object.values(flatten(ja))) {
      expect(value).not.toMatch(/上り|下り/);
    }
  });
});

describe('units and formatted values', () => {
  it('localises the unit words rather than leaving "s" and "min"', () => {
    expect(t.en('domain.latency', { seconds: '0.6' })).toBe('0.6s');
    expect(t.ja('domain.latency', { seconds: '0.6' })).toBe('0.6秒');
    expect(t.en('domain.eta', { minutes: 4 })).toBe('4 min');
    expect(t.ja('domain.eta', { minutes: 4 })).toBe('4分');
  });

  it('reorders the dispatched line rather than translating it word for word', () => {
    /*
     * "Unit 12" is a label-then-number; Japanese counts vehicles with 号車 as a
     * suffix. A placeholder-for-placeholder translation would produce
     * "ユニット 12", which is English wearing katakana.
     */
    expect(t.en('domain.dispatchLine', { unit: '12', eta: '4 min' })).toBe(
      'Unit 12 · ETA 4 min',
    );
    expect(t.ja('domain.dispatchLine', { unit: '12', eta: '4分' })).toBe(
      '12 号車 · 到着 4分',
    );
  });

  it('keeps every number in Western Arabic digits', () => {
    for (const rendered of [
      t.ja('domain.latency', { seconds: '12.5' }),
      t.ja('domain.eta', { minutes: 30 }),
      t.ja('domain.dispatchLine', { unit: '7', eta: '4分' }),
    ]) {
      expect(rendered).toMatch(/[0-9]/);
      expect(rendered).not.toMatch(/[〇一二三四五六七八九十百]/);
    }
  });
});

describe('what is deliberately not translated', () => {
  /*
   * D2. These are identifiers and data, not text. A camera ID that changed
   * between locales would break every conversation between two desks, and a
   * roadway designation is a name.
   */
  it('leaves no camera IDs, mile markers or roadway designations in the messages', () => {
    const strings = Object.entries(flatten(ja));

    for (const [key, value] of strings) {
      expect(value, `${key} contains a camera ID`).not.toMatch(/CAM-\d+/);
      expect(value, `${key} contains a mile marker`).not.toMatch(/MM\s*\d/);
      expect(value, `${key} contains a roadway designation`).not.toMatch(
        /\bM\d{1,2}\b/,
      );
    }
  });

  it('keeps UTC as UTC', () => {
    // A timezone abbreviation is a standard, not a word to be localised.
    expect(t.ja('statusBar.utcTime')).toBe('UTC');
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
