import { describe, expect, it } from 'vitest';

import {
  ageInSeconds,
  formatAge,
  formatClock,
  formatClockUtc,
  formatLatency,
  formatTimestamp,
} from '@/lib/format';

/*
 * The numbers an operator watches.
 *
 * Width is the property under test as much as the value: these render in
 * tabular figures beside a counter that ticks once a second, and a format whose
 * character count changes makes the row twitch. That is why the age is
 * zero-padded and why it is mm:ss rather than "3 minutes ago".
 */

const T0 = Date.parse('2026-08-12T09:00:00.000Z');
const at = (seconds: number) => new Date(T0 - seconds * 1000).toISOString();

describe('formatAge', () => {
  it('is mm:ss under an hour, zero-padded on both halves', () => {
    expect(formatAge(at(0), T0)).toBe('00:00');
    expect(formatAge(at(5), T0)).toBe('00:05');
    expect(formatAge(at(65), T0)).toBe('01:05');
    expect(formatAge(at(599), T0)).toBe('09:59');
  });

  it('keeps a constant width across the whole sub-hour range', () => {
    // The reason for the padding. A row whose age is 5 characters at 9:59 and
    // 4 at 10:00 shifts the column beside it once a second.
    const widths = new Set(
      [0, 9, 59, 60, 599, 600, 3599].map((s) => formatAge(at(s), T0).length),
    );
    expect(widths).toEqual(new Set([5]));
  });

  it('grows to h:mm:ss on the hour and not before', () => {
    expect(formatAge(at(3599), T0)).toBe('59:59');
    expect(formatAge(at(3600), T0)).toBe('1:00:00');
    expect(formatAge(at(3661), T0)).toBe('1:01:01');
    expect(formatAge(at(36000), T0)).toBe('10:00:00');
  });

  it('floors rather than rounds, so an age never reads ahead of itself', () => {
    expect(formatAge(new Date(T0 - 1999).toISOString(), T0)).toBe('00:01');
  });

  it('clamps a future timestamp to zero rather than counting backwards', () => {
    // Clock skew between the detector and this machine is normal. "-00:03" on a
    // queue row would be worse than a moment of 00:00.
    expect(formatAge(new Date(T0 + 5000).toISOString(), T0)).toBe('00:00');
  });
});

describe('ageInSeconds', () => {
  it('floors to whole seconds', () => {
    expect(ageInSeconds(new Date(T0 - 4900).toISOString(), T0)).toBe(4);
  });

  it('clamps the future to zero, like formatAge', () => {
    expect(ageInSeconds(new Date(T0 + 9000).toISOString(), T0)).toBe(0);
  });

  it('agrees with formatAge about which second it is', () => {
    // These drive the same column — the SLA check reads one and the row prints
    // the other, so a disagreement would breach an SLA a second early.
    for (const seconds of [0, 1, 59, 60, 61, 3599, 3600]) {
      const iso = at(seconds);
      const total = ageInSeconds(iso, T0);
      const [mm, ss] = formatAge(iso, T0).split(':').slice(-2).map(Number);
      expect(mm! * 60 + ss!).toBe(total % 3600);
    }
  });
});

describe('formatLatency', () => {
  it('reports one decimal of a second', () => {
    expect(
      formatLatency('2026-08-12T09:00:00.000Z', '2026-08-12T09:00:00.600Z'),
    ).toBe('0.6s');
    expect(
      formatLatency('2026-08-12T09:00:00.000Z', '2026-08-12T09:00:02.450Z'),
    ).toBe('2.5s');
  });

  it('is 0.0s when the two moments coincide', () => {
    const iso = '2026-08-12T09:00:00.000Z';
    expect(formatLatency(iso, iso)).toBe('0.0s');
  });

  it('clamps rather than reporting a negative pipeline latency', () => {
    // The detector's clock can legitimately be ahead of ours. "-0.4s of
    // latency" is not a thing to show an operator on a trust indicator.
    expect(
      formatLatency('2026-08-12T09:00:01.000Z', '2026-08-12T09:00:00.600Z'),
    ).toBe('0.0s');
  });
});

describe('clocks', () => {
  it('renders 24-hour HH:MM:SS', () => {
    expect(formatClock(T0)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(formatClockUtc(T0)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('pins the UTC clock to UTC regardless of where this runs', () => {
    // The local clock is the machine's and cannot be asserted portably; the UTC
    // one is the whole point of showing both, so it must be exact.
    expect(formatClockUtc(T0)).toBe('09:00:00');
    expect(formatClockUtc(Date.parse('2026-08-12T23:59:59.000Z'))).toBe(
      '23:59:59',
    );
  });

  it('formats an ISO string for the audit trail', () => {
    expect(formatTimestamp('2026-08-12T09:00:00.000Z')).toMatch(
      /^\d{2}:\d{2}:\d{2}$/,
    );
  });

  it('never uses a 12-hour clock', () => {
    // A control-room log that says "9:00:00 pm" is a log that has to be read
    // twice. Midnight is where hour12 formatting shows itself.
    expect(formatClockUtc(Date.parse('2026-08-12T00:30:00.000Z'))).toBe(
      '00:30:00',
    );
    expect(formatClockUtc(Date.parse('2026-08-12T13:00:00.000Z'))).toBe(
      '13:00:00',
    );
  });
});
