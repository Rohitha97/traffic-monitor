import type { DetectionEvent } from '@/lib/schema';

/*
 * The two numbers the whole design argues from, finally measured.
 *
 * Pass A costs a critical incident at 96 seconds from detection to dispatch,
 * with 62 of those in noticing and orienting — the two steps the design claims
 * to own. Every choice in this build is justified against that claim and none
 * of it was ever checked. This turns the thesis into something falsifiable.
 *
 * Both numbers are derived from the audit trail rather than a parallel store,
 * so there is one timeline and the measurement cannot disagree with the record
 * an operator can read on screen.
 */

/**
 * The audit line written when an incident is first genuinely looked at.
 *
 * "Genuinely" is doing work there — see `SEEN_DWELL_MS`.
 */
export const SEEN_ACTION = 'Opened for review';

/**
 * How long an incident must hold the detail pane before it counts as seen.
 *
 * The brief's guidance is that selection is not awareness: an operator can
 * cursor past something without reading it. In this design that separation
 * does not exist — Pass A's model is "↑↓ moves *and previews*", so moving the
 * cursor **is** the detail-pane render, and taking first render literally
 * would mark every row someone scrolled through as "seen".
 *
 * A dwell threshold is the closest faithful equivalent. Held-down arrow repeat
 * fires roughly every 30ms; a considered glance is far longer than half a
 * second. 500ms sits well clear of the first and comfortably under the second,
 * so cursoring through a queue marks nothing and looking at one row marks it.
 */
export const SEEN_DWELL_MS = 500;

export interface Distribution {
  /** Sample count. Small n is reported rather than hidden — p95 of four is noise. */
  n: number;
  p50: number | null;
  p95: number | null;
}

export interface MetricsReport {
  /** Events currently in the replay buffer, which is what these are measured over. */
  events: number;
  /** Detection reaching the client → the operator actually looking at it. */
  timeToAwarenessMs: Distribution;
  /** Looking at it → dispatching or dismissing it. */
  timeToDecisionMs: Distribution;
  generatedAt: string;
}

/**
 * Nearest-rank percentile.
 *
 * No interpolation: with the sample sizes a single shift produces, interpolating
 * invents precision the data does not have, and the reported figure should be a
 * value that actually happened.
 */
export function percentile(
  sorted: readonly number[],
  p: number,
): number | null {
  if (sorted.length === 0) return null;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1] ?? null;
}

function distribution(samples: number[]): Distribution {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
  };
}

function markedAt(
  event: DetectionEvent,
  mark: 'seen' | 'decided',
): number | null {
  // First occurrence only: an incident re-opened after a decision must not
  // overwrite the moment it was first looked at.
  const entry = event.history.find((item) => item.mark === mark);
  return entry ? Date.parse(entry.at) : null;
}

export function computeMetrics(
  events: readonly DetectionEvent[],
): MetricsReport {
  const awareness: number[] = [];
  const decision: number[] = [];

  for (const event of events) {
    const arrived = Date.parse(event.receivedAt);
    const seen = markedAt(event, 'seen');
    const decided = markedAt(event, 'decided');

    // Clamped at zero rather than dropped: a negative gap means clock skew
    // between the marking client and the server, and silently discarding those
    // samples would bias the distribution toward whichever clock ran fast.
    if (seen !== null) awareness.push(Math.max(0, seen - arrived));
    if (seen !== null && decided !== null) {
      decision.push(Math.max(0, decided - seen));
    }
  }

  return {
    events: events.length,
    timeToAwarenessMs: distribution(awareness),
    timeToDecisionMs: distribution(decision),
    generatedAt: new Date().toISOString(),
  };
}
