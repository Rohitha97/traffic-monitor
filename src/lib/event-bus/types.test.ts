import { describe, expect, it } from 'vitest';

import { applyClaim, applyMark, ownerOf } from '@/lib/event-bus/types';
import { detectionEventSchema, type DetectionEvent } from '@/lib/schema';

/*
 * The two rules the storage layers share.
 *
 * The conformance suite exercises these through both buses, which proves the
 * implementations agree. It does not pin the rules themselves — and these are
 * the definitions the Redis Lua scripts are transliterated from, so anything
 * true here has to stay true in two places at once.
 *
 * Both are pure and must not mutate: callers hold the array an event came from,
 * and correlation reads a snapshot of it.
 */

const AT = '2026-08-12T09:00:00.000Z';
const LATER = '2026-08-12T09:05:00.000Z';

function event(over: Partial<DetectionEvent> = {}): DetectionEvent {
  return {
    id: 'TEST-1',
    type: 'debris',
    camera: {
      id: 'CAM-014',
      name: 'M6 northbound, junction 8–9',
      roadway: 'M6',
      direction: 'NB',
      marker: 'MM 42.3',
      laneCount: 3,
      lat: 52.5218,
      lng: -1.9765,
    },
    lanePosition: 'live_lane',
    laneNumber: 2,
    confidence: 0.9,
    description: 'Object in carriageway.',
    snapshotUrl: '/snapshots/debris.svg',
    boundingBoxes: [],
    detectedAt: AT,
    receivedAt: AT,
    priority: 'high',
    priorityReason: 'High — live lane',
    status: 'new',
    history: [{ at: AT, actor: 'system', action: 'Detected' }],
    ...over,
  };
}

describe('ownerOf', () => {
  it('is null while nobody holds the incident', () => {
    expect(ownerOf(event())).toBeNull();
  });

  it('is the assignee once somebody does', () => {
    expect(ownerOf(event({ assignedTo: 'Position 3' }))).toBe('Position 3');
  });
});

describe('applyClaim', () => {
  it('takes a free incident and records who took it', () => {
    const claimed = applyClaim(event(), 'Position 3', AT)!;

    expect(claimed.status).toBe('acknowledged');
    expect(claimed.assignedTo).toBe('Position 3');
    expect(claimed.history.at(-1)).toEqual({
      at: AT,
      actor: 'Position 3',
      action: 'Acknowledged',
    });
  });

  it('refuses an incident somebody else holds', () => {
    expect(
      applyClaim(event({ assignedTo: 'Position 3' }), 'Position 5', AT),
    ).toBeUndefined();
  });

  it('returns the event unchanged when the holder re-claims it', () => {
    // Identity, not a copy: the callers use it to tell "nothing happened" from
    // "the lock moved", and skip announcing the former.
    const held = event({ assignedTo: 'Position 3', status: 'acknowledged' });
    expect(applyClaim(held, 'Position 3', LATER)).toBe(held);
  });

  it('does not mutate the event it was given', () => {
    const original = event();
    const before = structuredClone(original);

    applyClaim(original, 'Position 3', AT);

    expect(original).toEqual(before);
  });

  it('appends to the audit trail rather than replacing it', () => {
    const original = event({
      history: [
        { at: AT, actor: 'system', action: 'Detected' },
        { at: AT, actor: 'system', action: 'Priority set High' },
      ],
    });

    expect(applyClaim(original, 'Position 3', AT)!.history).toHaveLength(3);
  });

  it('produces an event the contract still accepts', () => {
    const claimed = applyClaim(event(), 'Position 3', AT)!;
    expect(detectionEventSchema.safeParse(claimed).success).toBe(true);
  });

  it('takes an incident that was dispatched but somehow unowned', () => {
    // The lock is `assignedTo`, not the status. Anything unowned is claimable,
    // which keeps one field authoritative instead of two that can disagree.
    const claimed = applyClaim(
      event({ status: 'dispatched' }),
      'Position 2',
      AT,
    );
    expect(claimed?.assignedTo).toBe('Position 2');
  });
});

describe('applyMark', () => {
  it('records a mark on the audit trail', () => {
    const marked = applyMark(event(), 'seen', AT, 'Position 3', 'Opened')!;

    expect(marked.history.at(-1)).toMatchObject({
      at: AT,
      actor: 'Position 3',
      action: 'Opened',
      mark: 'seen',
    });
  });

  it('refuses a second mark of the same kind', () => {
    // An incident re-opened after a decision must not overwrite the moment it
    // was first looked at, and a retried POST must not either.
    const once = applyMark(event(), 'seen', AT, 'Position 3', 'Opened')!;
    expect(
      applyMark(once, 'seen', LATER, 'Position 3', 'Opened'),
    ).toBeUndefined();
  });

  it('accepts a different mark on the same event', () => {
    const seen = applyMark(event(), 'seen', AT, 'Position 3', 'Opened')!;
    const decided = applyMark(
      seen,
      'decided',
      LATER,
      'Position 3',
      'Dispatched',
    );

    expect(decided?.history.map((entry) => entry.mark)).toEqual([
      undefined,
      'seen',
      'decided',
    ]);
  });

  it('sets the dismissal record when a reason is given', () => {
    // What the reopen rule reads. Without it the server knows an incident was
    // decided but not that it was dismissed or why.
    const dismissed = applyMark(
      event(),
      'decided',
      AT,
      'Position 3',
      'Dismissed as false positive',
      'Shadow',
    )!;

    expect(dismissed.status).toBe('dismissed');
    expect(dismissed.dismissal).toEqual({ reason: 'Shadow', at: AT });
    expect(dismissed.history.at(-1)).toMatchObject({ note: 'Shadow' });
  });

  it('leaves status alone when there is no dismissal reason', () => {
    const marked = applyMark(
      event({ status: 'acknowledged' }),
      'decided',
      AT,
      'Position 3',
      'Response dispatched',
    )!;

    expect(marked.status).toBe('acknowledged');
    expect(marked.dismissal).toBeUndefined();
  });

  it('does not mutate the event it was given', () => {
    const original = event();
    const before = structuredClone(original);

    applyMark(original, 'seen', AT, 'Position 3', 'Opened');

    expect(original).toEqual(before);
  });

  it('produces an event the contract still accepts', () => {
    const marked = applyMark(
      event(),
      'decided',
      AT,
      'Position 3',
      'Dismissed as false positive',
      'Shadow',
    )!;
    expect(detectionEventSchema.safeParse(marked).success).toBe(true);
  });
});
