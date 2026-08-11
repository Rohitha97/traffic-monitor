import { describe, expect, it } from 'vitest';

import {
  findPriorDismissal,
  isRepeatDetection,
  isSameObject,
  REOPEN_WINDOW_MS,
  type Observation,
} from '@/lib/correlation';
import type { DetectionEvent, EventType, LanePosition } from '@/lib/schema';

/*
 * The reopen rule is a judgement about identity — "is this the same call the
 * operator already decided?" — and every way of getting it wrong is a real
 * failure with a cost. Merge too eagerly and a genuine second incident is
 * hidden behind the first one's dismissal. Merge too reluctantly and the
 * operator re-litigates a decision they made ninety seconds ago.
 *
 * So the boundaries are tested as boundaries: on each side of the window, and
 * on each side of every clause of the identity test.
 */

const T0 = Date.parse('2026-08-11T09:00:00.000Z');

function observation(over: Partial<Observation> = {}): Observation {
  return {
    cameraId: 'CAM-014',
    type: 'debris',
    lanePosition: 'live_lane',
    laneNumber: 2,
    at: T0,
    ...over,
  };
}

/**
 * A buffered event, built from the same fields the correlation rules read.
 *
 * Only the correlated fields are meaningful; the rest exist because
 * `DetectionEvent` is the real contract and correlating against a hand-made
 * partial would let the shape drift away from what the buffer actually holds.
 */
function event(over: {
  id?: string;
  cameraId?: string;
  type?: EventType;
  lanePosition?: LanePosition;
  laneNumber?: number | undefined;
  receivedAt?: number;
  dismissedAt?: number;
  dismissalReason?: string;
}): DetectionEvent {
  const receivedAt = over.receivedAt ?? T0;
  const dismissed = over.dismissedAt !== undefined;

  return {
    id: over.id ?? 'event-1',
    type: over.type ?? 'debris',
    camera: {
      id: over.cameraId ?? 'CAM-014',
      name: 'M6 northbound, junction 8–9',
      roadway: 'M6',
      direction: 'NB',
      marker: 'MM 118.4',
      laneCount: 3,
      lat: 52.5218,
      lng: -1.9765,
    },
    lanePosition: over.lanePosition ?? 'live_lane',
    ...(over.laneNumber === undefined ? {} : { laneNumber: over.laneNumber }),
    confidence: 0.9,
    description: 'Object in carriageway.',
    snapshotUrl: '/snapshots/debris.svg',
    detectedAt: new Date(receivedAt).toISOString(),
    receivedAt: new Date(receivedAt).toISOString(),
    priority: 'high',
    priorityReason: 'High — live lane',
    status: dismissed ? 'dismissed' : 'new',
    ...(dismissed
      ? {
          dismissal: {
            reason: over.dismissalReason ?? 'Sensor glare',
            at: new Date(over.dismissedAt as number).toISOString(),
          },
        }
      : {}),
    history: [],
  };
}

describe('isSameObject', () => {
  it('merges the same class from the same camera in the same lane', () => {
    expect(isSameObject(observation(), observation())).toBe(true);
  });

  it('does not merge a different event type from the same camera', () => {
    expect(
      isSameObject(observation(), observation({ type: 'stopped_vehicle' })),
    ).toBe(false);
  });

  it('does not merge the same class from a different camera', () => {
    expect(
      isSameObject(observation(), observation({ cameraId: 'CAM-091' })),
    ).toBe(false);
  });

  it('does not merge across lane positions', () => {
    expect(
      isSameObject(
        observation(),
        observation({ lanePosition: 'hard_shoulder', laneNumber: undefined }),
      ),
    ).toBe(false);
  });

  it('merges adjacent lanes — one object the detector disagreed with itself about', () => {
    expect(isSameObject(observation(), observation({ laneNumber: 3 }))).toBe(
      true,
    );
    expect(isSameObject(observation(), observation({ laneNumber: 1 }))).toBe(
      true,
    );
  });

  it('does not merge lanes two apart', () => {
    expect(isSameObject(observation(), observation({ laneNumber: 4 }))).toBe(
      false,
    );
  });

  it('merges when either side is unlocalised', () => {
    expect(
      isSameObject(observation(), observation({ laneNumber: undefined })),
    ).toBe(true);
    expect(
      isSameObject(observation({ laneNumber: undefined }), observation()),
    ).toBe(true);
  });
});

describe('findPriorDismissal', () => {
  it('carries the original reason forward, not just the fact', () => {
    const history = [
      event({ dismissedAt: T0, dismissalReason: 'Shadow on wet road' }),
    ];

    expect(
      findPriorDismissal(history, observation({ at: T0 + 60_000 })),
    ).toEqual({
      reason: 'Shadow on wet road',
      at: new Date(T0).toISOString(),
    });
  });

  it('merges at 2:59 and not at 3:01', () => {
    const history = [event({ dismissedAt: T0 })];

    expect(
      findPriorDismissal(history, observation({ at: T0 + 179_000 })),
    ).toBeDefined();
    expect(
      findPriorDismissal(history, observation({ at: T0 + 181_000 })),
    ).toBeUndefined();
  });

  it('includes the window boundary itself and excludes one millisecond past it', () => {
    const history = [event({ dismissedAt: T0 })];

    expect(
      findPriorDismissal(history, observation({ at: T0 + REOPEN_WINDOW_MS })),
    ).toBeDefined();
    expect(
      findPriorDismissal(
        history,
        observation({ at: T0 + REOPEN_WINDOW_MS + 1 }),
      ),
    ).toBeUndefined();
  });

  it('ignores a same-camera dismissal of a different type', () => {
    const history = [event({ type: 'stopped_vehicle', dismissedAt: T0 })];

    expect(
      findPriorDismissal(history, observation({ at: T0 + 60_000 })),
    ).toBeUndefined();
  });

  it('matches a dismissal one lane over', () => {
    const history = [event({ laneNumber: 3, dismissedAt: T0 })];

    expect(
      findPriorDismissal(history, observation({ at: T0 + 60_000 })),
    ).toBeDefined();
  });

  it('ignores incidents that were resolved rather than dismissed', () => {
    // A resolved incident was real. Re-detection is news, not a re-litigation.
    const history = [event({ receivedAt: T0 })];

    expect(
      findPriorDismissal(history, observation({ at: T0 + 60_000 })),
    ).toBeUndefined();
  });

  it('returns the most recent verdict when a call was dismissed twice', () => {
    const history = [
      event({ id: 'a', dismissedAt: T0, dismissalReason: 'Sensor glare' }),
      event({
        id: 'b',
        dismissedAt: T0 + 60_000,
        dismissalReason: 'Duplicate of CAM-013',
      }),
    ];

    expect(
      findPriorDismissal(history, observation({ at: T0 + 90_000 })),
    ).toMatchObject({ reason: 'Duplicate of CAM-013' });
  });

  it('ignores a dismissal recorded after the detection', () => {
    // Clock skew between the detector and the operator must not make a
    // detection inherit a verdict that had not been given yet.
    const history = [event({ dismissedAt: T0 + 60_000 })];

    expect(
      findPriorDismissal(history, observation({ at: T0 })),
    ).toBeUndefined();
  });
});

describe('isRepeatDetection', () => {
  it('is true for congestion the same camera already reported', () => {
    const history = [event({ type: 'congestion', receivedAt: T0 })];

    expect(
      isRepeatDetection(
        history,
        observation({ type: 'congestion', at: T0 + 5 * 60_000 }),
      ),
    ).toBe(true);
  });

  it('is false past the ten-minute window', () => {
    const history = [event({ type: 'congestion', receivedAt: T0 })];

    expect(
      isRepeatDetection(
        history,
        observation({ type: 'congestion', at: T0 + 11 * 60_000 }),
      ),
    ).toBe(false);
  });

  it('does not count another event type as a congestion repeat', () => {
    // The bug in the map this replaced: one "last seen" per camera, so any
    // detection at all made the next congestion call look like a repeat.
    const history = [event({ type: 'debris', receivedAt: T0 })];

    expect(
      isRepeatDetection(
        history,
        observation({ type: 'congestion', at: T0 + 60_000 }),
      ),
    ).toBe(false);
  });

  it('does not count a different camera', () => {
    const history = [
      event({ type: 'congestion', cameraId: 'CAM-091', receivedAt: T0 }),
    ];

    expect(
      isRepeatDetection(
        history,
        observation({ type: 'congestion', at: T0 + 60_000 }),
      ),
    ).toBe(false);
  });

  it('is false for anything that is not congestion', () => {
    const history = [event({ type: 'debris', receivedAt: T0 })];

    expect(isRepeatDetection(history, observation({ at: T0 + 60_000 }))).toBe(
      false,
    );
  });
});
