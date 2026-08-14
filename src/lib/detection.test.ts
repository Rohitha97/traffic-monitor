import { describe, expect, it } from 'vitest';

import {
  boundingBoxesFor,
  contextBoxes,
  objectClassFor,
  primaryBox,
} from '@/lib/detection';
import { makeRandom } from '@/lib/generator';
import {
  boundingBoxSchema,
  EVENT_TYPES,
  LANE_POSITIONS,
  type EventType,
  type LanePosition,
} from '@/lib/schema';

/*
 * A box that disagrees with the record is worse than no box at all.
 *
 * The whole argument for drawing the detector's output on the frame is that it
 * turns a photograph into evidence. That collapses the moment the geometry and
 * the prose contradict each other: an incident whose text reads "hard shoulder"
 * over a frame with the box in the middle of the carriageway tells the operator
 * the system cannot see straight, and they are right to stop trusting it.
 *
 * So the agreement is asserted rather than assumed — for every event type and
 * every lane position, not for the one case that was convenient to write.
 */

const LANE_COUNT = 3;

/** The carriageway band from `detection.ts`, restated so a drift is a failure. */
const CARRIAGEWAY = { start: 0.2, end: 0.86 };

function placement(over: Partial<Parameters<typeof primaryBox>[0]> = {}) {
  return {
    type: 'debris' as EventType,
    lanePosition: 'live_lane' as LanePosition,
    laneNumber: 2,
    laneCount: LANE_COUNT,
    random: makeRandom(42),
    confidence: 0.9,
    ...over,
  };
}

const centreX = (box: { x: number; w: number }) => box.x + box.w / 2;

describe('objectClassFor', () => {
  it('reports what the model saw, not what the rules concluded', () => {
    // A wrong-way driver and a stopped vehicle are different incidents about
    // the same class of object. The box is about the object.
    expect(objectClassFor('wrong_way_driver')).toBe('vehicle');
    expect(objectClassFor('stopped_vehicle')).toBe('vehicle');
    expect(objectClassFor('congestion')).toBe('vehicle');
    expect(objectClassFor('pedestrian')).toBe('person');
    expect(objectClassFor('debris')).toBe('debris');
    expect(objectClassFor('smoke_fire')).toBe('smoke');
  });

  it('is total over the event types', () => {
    // The switch has no default, so a new event type is a type error rather
    // than a box that silently renders as `undefined`.
    for (const type of EVENT_TYPES) {
      expect(objectClassFor(type)).toBeTruthy();
    }
  });
});

describe('primaryBox · agreement with the record', () => {
  it('puts a hard-shoulder call on the shoulder, clear of the live lanes', () => {
    const box = primaryBox(
      placement({ lanePosition: 'hard_shoulder', laneNumber: undefined }),
    );

    expect(box.x + box.w).toBeLessThan(CARRIAGEWAY.start);
  });

  it('puts an off-carriageway call further out still', () => {
    const shoulder = primaryBox(
      placement({ lanePosition: 'hard_shoulder', laneNumber: undefined }),
    );
    const off = primaryBox(
      placement({ lanePosition: 'off_carriageway', laneNumber: undefined }),
    );

    expect(off.x).toBeLessThan(shoulder.x);
  });

  it('puts each live lane in its own band, nearside first', () => {
    const lanes = [1, 2, 3].map((laneNumber) =>
      centreX(primaryBox(placement({ laneNumber }))),
    );

    // Lane 1 is next to the shoulder and the numbering counts up towards the
    // central reservation — the same convention as "live lane 2 of 3".
    expect(lanes[0]!).toBeLessThan(lanes[1]!);
    expect(lanes[1]!).toBeLessThan(lanes[2]!);
    for (const lane of lanes) {
      expect(lane).toBeGreaterThan(CARRIAGEWAY.start);
      expect(lane).toBeLessThan(CARRIAGEWAY.end);
    }
  });

  it('does not overlap two adjacent lanes into one another', () => {
    // A box that spills a lane's width either side would make "lane 2" and
    // "lane 3" indistinguishable in the frame, which is the failure this whole
    // module exists to prevent.
    const one = primaryBox(placement({ laneNumber: 1 }));
    const two = primaryBox(placement({ laneNumber: 2 }));

    expect(centreX(two) - centreX(one)).toBeGreaterThan(one.w / 2 + two.w / 2);
  });

  it('centres a call the detector could not localise, rather than guessing', () => {
    const unknown = centreX(
      primaryBox(placement({ lanePosition: 'unknown', laneNumber: undefined })),
    );
    const unlocalised = centreX(
      primaryBox(placement({ laneNumber: undefined })),
    );
    const middle = (CARRIAGEWAY.start + CARRIAGEWAY.end) / 2;

    expect(unknown).toBeCloseTo(middle, 2);
    expect(unlocalised).toBeCloseTo(middle, 2);
  });

  it('scales the object to its class', () => {
    // A person is tall and narrow at this angle; a vehicle is wider than tall.
    const person = primaryBox(placement({ type: 'pedestrian' }));
    const vehicle = primaryBox(placement({ type: 'stopped_vehicle' }));

    expect(person.h).toBeGreaterThan(person.w);
    expect(vehicle.w).toBeGreaterThan(vehicle.h);
  });

  it('is the only box marked primary', () => {
    expect(primaryBox(placement()).primary).toBe(true);
    expect(
      contextBoxes(placement()).every((box) => box.primary === undefined),
    ).toBe(true);
  });
});

describe('primaryBox · confidence', () => {
  it('sits near the event’s confidence without repeating it', () => {
    /*
     * Near, not equal. The model's certainty that it is looking at a vehicle is
     * a different measurement from its certainty that the vehicle constitutes
     * an incident, and printing one number twice would imply they are the same.
     */
    const box = primaryBox(placement({ confidence: 0.9 }));

    expect(box.confidence).not.toBe(0.9);
    expect(Math.abs(box.confidence - 0.9)).toBeLessThanOrEqual(0.04);
  });

  it('stays a probability at both extremes', () => {
    for (const confidence of [0, 0.3, 0.5, 1]) {
      for (let seed = 0; seed < 20; seed += 1) {
        const box = primaryBox(
          placement({ confidence, random: makeRandom(seed) }),
        );
        expect(box.confidence).toBeGreaterThanOrEqual(0.3);
        expect(box.confidence).toBeLessThanOrEqual(0.99);
      }
    }
  });
});

describe('boundingBoxesFor', () => {
  it('singles out nothing for congestion', () => {
    /*
     * Congestion is a property of the whole carriageway. Marking one car as
     * "the" congestion would be a claim the detector never made — and the
     * operator would reasonably read it as "this vehicle is the problem".
     */
    for (let seed = 0; seed < 30; seed += 1) {
      const boxes = boundingBoxesFor(
        placement({ type: 'congestion', random: makeRandom(seed) }),
      );
      expect(boxes.some((box) => box.primary)).toBe(false);
    }
  });

  it('marks exactly one primary for every other type', () => {
    for (const type of EVENT_TYPES) {
      if (type === 'congestion') continue;
      for (let seed = 0; seed < 10; seed += 1) {
        const boxes = boundingBoxesFor(
          placement({ type, random: makeRandom(seed) }),
        );
        expect(boxes.filter((box) => box.primary === true)).toHaveLength(1);
      }
    }
  });

  it('keeps context objects off the incident’s own lane', () => {
    // A second vehicle drawn on top of the stopped one would read as two
    // detections of the same object — the exact ambiguity correlation exists to
    // resolve, reintroduced visually.
    for (let seed = 0; seed < 50; seed += 1) {
      const boxes = boundingBoxesFor(
        placement({ type: 'stopped_vehicle', random: makeRandom(seed) }),
      );
      const [primary, ...context] = boxes;

      for (const box of context) {
        expect(Math.abs(centreX(box) - centreX(primary!))).toBeGreaterThan(
          0.05,
        );
      }
    }
  });

  it('keeps context objects clear of the incident, for every class', () => {
    /*
     * Clear of it, not merely above its centre. Further away reads as
     * background; traffic overlapping the incident competes with it for the eye
     * and, at a glance, reads as part of the same object.
     *
     * Swept across types because the incident box's height varies by class —
     * a smoke plume is more than three times the depth of debris — and a fixed
     * band that clears one clips the other. That was the bug: the comment said
     * "further up the frame" while the arithmetic let the two bands overlap for
     * shallow classes.
     */
    for (const type of EVENT_TYPES) {
      if (type === 'congestion') continue;
      for (let seed = 0; seed < 50; seed += 1) {
        const [primary, ...context] = boundingBoxesFor(
          placement({ type, random: makeRandom(seed) }),
        );
        for (const box of context) {
          expect(box.y + box.h).toBeLessThanOrEqual(primary!.y);
        }
      }
    }
  });

  it('keeps context objects below the horizon', () => {
    // The top of the frame is sky. A vehicle drawn there is not background, it
    // is a detector fault being rendered as traffic.
    for (const type of EVENT_TYPES) {
      for (let seed = 0; seed < 30; seed += 1) {
        for (const box of boundingBoxesFor(
          placement({ type, random: makeRandom(seed) }),
        )) {
          expect(box.y).toBeGreaterThanOrEqual(0.14);
        }
      }
    }
  });

  it('draws context as traffic and never as a second incident', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const [, ...context] = boundingBoxesFor(
        placement({ type: 'debris', random: makeRandom(seed) }),
      );
      expect(context.every((box) => box.label === 'vehicle')).toBe(true);
    }
  });

  it('stays inside the frame for every type and lane position', () => {
    // Swept rather than sampled: a box escaping the frame is clipped by the
    // container's overflow, so it fails silently and looks like a box that is
    // merely the wrong size.
    for (const type of EVENT_TYPES) {
      for (const lanePosition of LANE_POSITIONS) {
        for (const laneNumber of [undefined, 1, 2, 3]) {
          for (let seed = 0; seed < 8; seed += 1) {
            const boxes = boundingBoxesFor(
              placement({
                type,
                lanePosition,
                laneNumber,
                random: makeRandom(seed),
              }),
            );

            for (const box of boxes) {
              expect(boundingBoxSchema.safeParse(box).success).toBe(true);
              expect(box.x + box.w).toBeLessThanOrEqual(1);
              expect(box.y + box.h).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it('draws the same frame twice from the same seed', () => {
    // `pnpm seed` replays a scenario; a frame that redrew itself differently
    // each time would make the visual baselines unpinnable.
    expect(boundingBoxesFor(placement({ random: makeRandom(7) }))).toEqual(
      boundingBoxesFor(placement({ random: makeRandom(7) })),
    );
  });

  it('draws different frames from different seeds', () => {
    // Guards the inverse: a placement that ignored its random source would pass
    // every determinism check above while drawing one identical box forever.
    const frames = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        JSON.stringify(
          boundingBoxesFor(placement({ random: makeRandom(seed) })),
        ),
      ),
    );

    expect(frames.size).toBeGreaterThan(1);
  });
});
