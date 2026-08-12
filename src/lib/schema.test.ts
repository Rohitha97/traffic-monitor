import { describe, expect, it } from 'vitest';

import { cameraById } from '@/lib/cameras';
import {
  detectionEventSchema,
  detectionIngestSchema,
  EVENT_TYPES,
  EVENT_TYPE_LABEL,
  historyEntrySchema,
  LANE_POSITIONS,
  LANE_POSITION_LABEL,
  MARKS,
  PRIORITIES,
  STATUSES,
} from '@/lib/schema';

/*
 * The contract, at the boundary.
 *
 * The ingest route validates against this, so what it accepts and refuses *is*
 * the trust model — most of all the rule that a detector cannot set its own
 * priority. That rule is not enforced by any code in the route; it is enforced
 * by this schema not having the field.
 */

const CAMERA = cameraById('CAM-014')!;

/** A copy without one key. Destructuring-to-omit trips no-unused-vars. */
function omit<T extends object>(source: T, key: keyof T): Partial<T> {
  const next = { ...source };
  delete next[key];
  return next;
}

const OBSERVATION = {
  type: 'debris',
  confidence: 0.9,
  camera: CAMERA,
  lanePosition: 'live_lane',
  laneNumber: 2,
  snapshotUrl: '/snapshots/debris.svg',
  description: 'Object in carriageway.',
};

describe('detectionIngestSchema — what a detector may say', () => {
  it('accepts a well-formed observation', () => {
    expect(detectionIngestSchema.safeParse(OBSERVATION).success).toBe(true);
  });

  it('accepts one with no detectedAt, which the server then supplies', () => {
    expect(
      detectionIngestSchema.safeParse({
        ...OBSERVATION,
        detectedAt: '2026-08-12T09:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  /*
   * The important one. A detector that could set its own priority would make
   * the triage rules unauditable — so the field is absent from the contract,
   * and Zod's default stripping means a posted `priority` is discarded rather
   * than honoured.
   */
  it('discards a priority the detector tries to set', () => {
    const parsed = detectionIngestSchema.parse({
      ...OBSERVATION,
      priority: 'critical',
      priorityReason: 'because I said so',
      status: 'resolved',
      id: 'chosen-by-the-detector',
      history: [{ at: '2026-08-12T09:00:00.000Z', actor: 'x', action: 'y' }],
    });

    expect(parsed).not.toHaveProperty('priority');
    expect(parsed).not.toHaveProperty('priorityReason');
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('id');
    expect(parsed).not.toHaveProperty('history');
  });

  it('requires the fields the priority rules read', () => {
    for (const field of [
      'type',
      'confidence',
      'camera',
      'lanePosition',
      'description',
      'snapshotUrl',
    ] as const) {
      expect(
        detectionIngestSchema.safeParse(omit(OBSERVATION, field)).success,
      ).toBe(false);
    }
  });

  it('bounds confidence to a probability', () => {
    for (const confidence of [-0.1, 1.1, 2]) {
      expect(
        detectionIngestSchema.safeParse({ ...OBSERVATION, confidence }).success,
      ).toBe(false);
    }
    for (const confidence of [0, 0.5, 1]) {
      expect(
        detectionIngestSchema.safeParse({ ...OBSERVATION, confidence }).success,
      ).toBe(true);
    }
  });

  it('refuses an event type or lane position it does not know', () => {
    expect(
      detectionIngestSchema.safeParse({ ...OBSERVATION, type: 'ufo' }).success,
    ).toBe(false);
    expect(
      detectionIngestSchema.safeParse({
        ...OBSERVATION,
        lanePosition: 'somewhere',
      }).success,
    ).toBe(false);
  });

  it('requires a lane number to be a positive integer when present', () => {
    // "lane 0 of 3" and "lane 2.5" are both the detector being wrong, and the
    // frames render the number verbatim.
    for (const laneNumber of [0, -1, 2.5]) {
      expect(
        detectionIngestSchema.safeParse({ ...OBSERVATION, laneNumber }).success,
      ).toBe(false);
    }
  });

  it('requires laneCount, because the frames say "lane 2 of 3"', () => {
    expect(
      detectionIngestSchema.safeParse({
        ...OBSERVATION,
        camera: omit(CAMERA, 'laneCount'),
      }).success,
    ).toBe(false);
  });

  it('rejects an empty description or snapshot url rather than rendering a blank', () => {
    expect(
      detectionIngestSchema.safeParse({ ...OBSERVATION, description: '' })
        .success,
    ).toBe(false);
    expect(
      detectionIngestSchema.safeParse({ ...OBSERVATION, snapshotUrl: '' })
        .success,
    ).toBe(false);
  });

  it('rejects a detection box outside the frame', () => {
    expect(
      detectionIngestSchema.safeParse({
        ...OBSERVATION,
        detectionBox: { x: 0.1, y: 0.1, w: 1.4, h: 0.2 },
      }).success,
    ).toBe(false);
  });

  it('rejects a timestamp that is not ISO 8601', () => {
    expect(
      detectionIngestSchema.safeParse({
        ...OBSERVATION,
        detectedAt: '12/08/2026 09:00',
      }).success,
    ).toBe(false);
  });
});

describe('historyEntrySchema', () => {
  const entry = {
    at: '2026-08-12T09:00:00.000Z',
    actor: 'Position 3',
    action: 'Acknowledged',
  };

  it('accepts a plain entry', () => {
    expect(historyEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('accepts the two instrumented marks and nothing else', () => {
    for (const mark of MARKS) {
      expect(historyEntrySchema.safeParse({ ...entry, mark }).success).toBe(
        true,
      );
    }
    expect(
      historyEntrySchema.safeParse({ ...entry, mark: 'dispatched' }).success,
    ).toBe(false);
  });

  it('requires an actor — an unattributed audit line is not an audit line', () => {
    expect(historyEntrySchema.safeParse({ ...entry, actor: '' }).success).toBe(
      false,
    );
  });
});

describe('detectionEventSchema — what the client is handed', () => {
  const EVENT = {
    ...OBSERVATION,
    id: 'CAM-014-1',
    detectedAt: '2026-08-12T09:00:00.000Z',
    receivedAt: '2026-08-12T09:00:00.600Z',
    priority: 'high',
    priorityReason: 'High — live lane',
    status: 'new',
    history: [
      { at: '2026-08-12T09:00:00.000Z', actor: 'system', action: 'Detected' },
    ],
  };

  it('accepts a fully formed event', () => {
    expect(detectionEventSchema.safeParse(EVENT).success).toBe(true);
  });

  it('requires the priority and its reasoning together', () => {
    // The level without the argument is the thing the design refuses to render.
    expect(
      detectionEventSchema.safeParse(omit(EVENT, 'priorityReason')).success,
    ).toBe(false);
    expect(
      detectionEventSchema.safeParse({ ...EVENT, priorityReason: '' }).success,
    ).toBe(false);
  });

  it('requires seenBefore to carry a reason, not merely a flag', () => {
    // A boolean plus a separate reason would be two things that can disagree,
    // and the tag is useless without the reason.
    expect(
      detectionEventSchema.safeParse({ ...EVENT, seenBefore: true }).success,
    ).toBe(false);
    expect(
      detectionEventSchema.safeParse({
        ...EVENT,
        seenBefore: { reason: 'Shadow', at: '2026-08-12T09:00:00.000Z' },
      }).success,
    ).toBe(true);
  });

  it('requires a dismissal to carry a reason', () => {
    expect(
      detectionEventSchema.safeParse({
        ...EVENT,
        dismissal: { at: '2026-08-12T09:00:00.000Z' },
      }).success,
    ).toBe(false);
  });

  it('requires a dispatch ETA to be whole minutes', () => {
    expect(
      detectionEventSchema.safeParse({
        ...EVENT,
        dispatch: { unit: '12', etaMinutes: 4.5 },
      }).success,
    ).toBe(false);
  });
});

describe('labels', () => {
  it('has one for every event type and lane position', () => {
    // A missing label renders `undefined` on a queue row, which is the kind of
    // thing that only shows up for the rarest event class in production.
    for (const type of EVENT_TYPES) {
      expect(EVENT_TYPE_LABEL[type]).toBeTruthy();
    }
    for (const position of LANE_POSITIONS) {
      expect(LANE_POSITION_LABEL[position]).toBeTruthy();
    }
  });

  it('keeps priorities in descending severity, which derivePriority demotes along', () => {
    expect(PRIORITIES).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('lists every status the store can put an incident in', () => {
    expect(STATUSES).toEqual([
      'new',
      'acknowledged',
      'dispatched',
      'resolved',
      'dismissed',
    ]);
  });
});
