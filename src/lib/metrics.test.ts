import { describe, expect, it } from 'vitest';

import { computeMetrics, percentile, SEEN_ACTION } from '@/lib/metrics';
import type { DetectionEvent, HistoryEntry } from '@/lib/schema';

import { generateEvent, makeRandom } from '@/lib/generator';

/*
 * The numbers this reports are the ones the whole design is argued from, so
 * the arithmetic gets tested rather than eyeballed. A p95 that is quietly wrong
 * is worse than no measurement: it looks like evidence.
 */

const BASE = new Date('2026-01-01T00:00:00.000Z').getTime();
const iso = (offsetMs: number) => new Date(BASE + offsetMs).toISOString();

let seed = 100;
function incident(marks: HistoryEntry[] = []): DetectionEvent {
  seed += 1;
  const event = generateEvent({ random: makeRandom(seed) });
  return {
    ...event,
    receivedAt: iso(0),
    history: [...event.history, ...marks],
  };
}

const seenAt = (ms: number): HistoryEntry => ({
  at: iso(ms),
  actor: 'Rohitha',
  action: SEEN_ACTION,
  mark: 'seen',
});

const decidedAt = (ms: number): HistoryEntry => ({
  at: iso(ms),
  actor: 'Rohitha',
  action: 'Response dispatched · unit 12, ETA 4 min',
  mark: 'decided',
});

describe('percentile', () => {
  it('reports a value that actually occurred, by nearest rank', () => {
    // Deliberately not interpolating: with a shift's worth of samples,
    // interpolation invents precision the data does not have.
    const sorted = [10, 20, 30, 40];
    expect(percentile(sorted, 50)).toBe(20);
    expect(percentile(sorted, 95)).toBe(40);
  });

  it('handles a single sample and an empty set', () => {
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });
});

describe('computeMetrics', () => {
  it('measures awareness from server arrival to the incident being read', () => {
    const report = computeMetrics([
      incident([seenAt(2_000)]),
      incident([seenAt(6_000)]),
      incident([seenAt(4_000)]),
    ]);

    expect(report.timeToAwarenessMs.n).toBe(3);
    expect(report.timeToAwarenessMs.p50).toBe(4_000);
    expect(report.timeToAwarenessMs.p95).toBe(6_000);
  });

  it('measures decision from being read, not from arrival', () => {
    // The operator cannot be held to time they were not yet looking.
    const report = computeMetrics([
      incident([seenAt(10_000), decidedAt(15_000)]),
    ]);

    expect(report.timeToDecisionMs.p50).toBe(5_000);
  });

  it('ignores an incident that was decided but never marked read', () => {
    // Without a start point there is no interval — counting from arrival would
    // silently fold awareness into the decision figure.
    const report = computeMetrics([incident([decidedAt(9_000)])]);

    expect(report.timeToDecisionMs.n).toBe(0);
    expect(report.timeToDecisionMs.p50).toBeNull();
  });

  it('counts unseen and undecided incidents in the event total only', () => {
    const report = computeMetrics([incident(), incident([seenAt(1_000)])]);

    expect(report.events).toBe(2);
    expect(report.timeToAwarenessMs.n).toBe(1);
    expect(report.timeToDecisionMs.n).toBe(0);
  });

  it('takes the first mark of each kind, so a re-open cannot rewrite history', () => {
    const report = computeMetrics([
      incident([seenAt(1_000), seenAt(30_000), decidedAt(4_000)]),
    ]);

    expect(report.timeToAwarenessMs.p50).toBe(1_000);
    expect(report.timeToDecisionMs.p50).toBe(3_000);
  });

  it('clamps a negative interval to zero rather than dropping the sample', () => {
    // A mark timestamped before arrival means clock skew between the marking
    // client and the server. Discarding those would bias the distribution
    // toward whichever clock ran fast.
    const report = computeMetrics([incident([seenAt(-2_000)])]);

    expect(report.timeToAwarenessMs.n).toBe(1);
    expect(report.timeToAwarenessMs.p50).toBe(0);
  });

  it('reports an empty buffer without inventing figures', () => {
    const report = computeMetrics([]);

    expect(report.events).toBe(0);
    expect(report.timeToAwarenessMs).toEqual({ n: 0, p50: null, p95: null });
    expect(report.timeToDecisionMs).toEqual({ n: 0, p50: null, p95: null });
  });
});
