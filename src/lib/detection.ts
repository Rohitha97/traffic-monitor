import type {
  BoundingBox,
  EventType,
  LanePosition,
  ObjectClass,
} from '@/lib/schema';

/*
 * Where the model's boxes sit in the frame.
 *
 * The point of drawing boxes at all is that a traffic photograph in a card
 * reads as a placeholder, while the same photograph with the detector's own
 * output on it reads as evidence. That only works if the boxes agree with the
 * rest of the record: a `hard_shoulder` call whose box sits mid-carriageway
 * tells the operator the model cannot see straight, and **an incoherent box is
 * worse than no box** — it actively undermines the frame it is drawn on.
 *
 * So geometry is derived from the same fields the priority rules read, in a
 * pure function, with tests that assert the agreement rather than trusting it.
 *
 * The frame is a camera looking along the carriageway, which fixes the
 * convention below: x runs across the road, y runs into the distance, and
 * objects further away sit higher in the frame and smaller.
 */

/** Fractions of the frame width. The shoulder is the left margin of the view. */
const HARD_SHOULDER_X = 0.06;
/** Beyond the shoulder — verge, embankment, the far side of the barrier. */
const OFF_CARRIAGEWAY_X = 0.02;

/** The live lanes occupy the middle of the frame, leaving room for the shoulder. */
const CARRIAGEWAY_START = 0.2;
const CARRIAGEWAY_WIDTH = 0.66;

/**
 * The highest context traffic is drawn. Above this is horizon and sky, where a
 * detector reporting a vehicle is reporting a fault.
 */
const CONTEXT_TOP = 0.14;

/** Where the incident sits when there is no incident box — congestion only. */
const DEFAULT_CEILING = 0.36;

/**
 * The class of object a detection is *about*.
 *
 * Not the same as the event type: a wrong-way driver and a stopped vehicle are
 * different incidents involving the same class of object, and the box says what
 * the model saw rather than what the rules concluded.
 */
export function objectClassFor(type: EventType): ObjectClass {
  switch (type) {
    case 'pedestrian':
      return 'person';
    case 'debris':
      return 'debris';
    case 'smoke_fire':
      return 'smoke';
    case 'congestion':
      return 'vehicle';
    case 'stopped_vehicle':
    case 'wrong_way_driver':
      return 'vehicle';
  }
}

interface Placement {
  type: EventType;
  lanePosition: LanePosition;
  laneNumber?: number | undefined;
  laneCount: number;
  /** Deterministic source, so a seeded scenario draws the same frame twice. */
  random: () => number;
  /** The event's own confidence, which the primary box is anchored near. */
  confidence: number;
}

/**
 * Where across the frame a given lane sits.
 *
 * Lane 1 is the nearside (next to the shoulder) and counts up towards the
 * central reservation, which is the convention the rest of the app already
 * uses when it says "live lane 2 of 3".
 */
function laneCentre(laneNumber: number, laneCount: number): number {
  const width = CARRIAGEWAY_WIDTH / laneCount;
  return CARRIAGEWAY_START + width * (laneNumber - 0.5);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(Math.max(value, min), max);
}

const round = (value: number) => Number(value.toFixed(3));

/**
 * The box for the object the incident is about.
 *
 * Exported for the tests that hold the geometry to the record — the agreement
 * between `lanePosition` and where the box lands is the whole reason this is a
 * function rather than four random numbers.
 */
export function primaryBox({
  type,
  lanePosition,
  laneNumber,
  laneCount,
  random,
  confidence,
}: Placement): BoundingBox {
  const label = objectClassFor(type);

  /*
   * A person is tall and narrow; debris is small and low; a vehicle is wider
   * than it is tall at this angle. Sizes are in frame fractions and deliberately
   * modest — a box covering a third of the frame reads as a selection rather
   * than as a detection.
   */
  const size = {
    person: { w: 0.05, h: 0.13 },
    debris: { w: 0.07, h: 0.05 },
    smoke: { w: 0.16, h: 0.18 },
    vehicle: { w: 0.14, h: 0.11 },
    obstruction: { w: 0.1, h: 0.09 },
  }[label];

  const centreX =
    lanePosition === 'hard_shoulder'
      ? HARD_SHOULDER_X + size.w / 2
      : lanePosition === 'off_carriageway'
        ? OFF_CARRIAGEWAY_X + size.w / 2
        : lanePosition === 'live_lane' && laneNumber !== undefined
          ? laneCentre(laneNumber, laneCount)
          : // Unknown, or a live lane the detector could not localise: the
            // middle of the carriageway, which is where an unplaced object
            // most likely is rather than a guess dressed as a measurement.
            CARRIAGEWAY_START + CARRIAGEWAY_WIDTH / 2;

  /*
   * Distance up the frame. Kept to the middle band: the very top is horizon and
   * the very bottom is the camera's own gantry, and a detector reporting
   * something in either is reporting a fault, not an incident.
   */
  const centreY = 0.38 + random() * 0.26;

  return {
    x: round(clamp(centreX - size.w / 2, 0, 1 - size.w)),
    y: round(clamp(centreY - size.h / 2, 0, 1 - size.h)),
    w: round(size.w),
    h: round(size.h),
    label,
    /*
     * Near the event's own confidence but not equal to it. The model's
     * certainty that it is looking at a vehicle is a different quantity from
     * its certainty that the vehicle constitutes an incident, and showing one
     * number twice would imply they are the same measurement.
     */
    confidence: round(clamp(confidence + (random() - 0.5) * 0.08, 0.3, 0.99)),
    primary: true,
  };
}

/**
 * The traffic around the incident.
 *
 * Context objects are what make the frame read as a scene rather than a crop.
 * They are always vehicles in live lanes, never on the shoulder — a second
 * stopped vehicle on the hard shoulder would be a second incident, and drawing
 * one the queue does not know about would be inventing evidence.
 */
export function contextBoxes({
  lanePosition,
  laneNumber,
  laneCount,
  random,
  ceiling = DEFAULT_CEILING,
}: Omit<Placement, 'type' | 'confidence'> & {
  /**
   * The top edge of the incident's own box. Context traffic is placed entirely
   * above it.
   *
   * Passed in rather than assumed from a fixed band, because the primary box's
   * height varies by class — a smoke plume is more than three times the depth
   * of a piece of debris — and a constant band that clears one clips the other.
   * Deriving it makes "background sits behind the incident" a property of the
   * construction rather than an intention stated in a comment.
   */
  ceiling?: number;
}): BoundingBox[] {
  const count = Math.floor(random() * 3);
  const boxes: BoundingBox[] = [];

  for (let index = 0; index < count; index += 1) {
    const lane = 1 + Math.floor(random() * laneCount);
    // Never stack a context vehicle on the incident itself.
    if (lanePosition === 'live_lane' && lane === laneNumber) continue;

    const w = 0.1 + random() * 0.05;
    const h = 0.08 + random() * 0.04;

    // Whatever is left between the horizon band and the incident. Never
    // negative: a thin band puts every context vehicle at the top of it rather
    // than lifting one out of the frame.
    const band = Math.max(0, ceiling - CONTEXT_TOP - h);

    boxes.push({
      x: round(clamp(laneCentre(lane, laneCount) - w / 2, 0, 1 - w)),
      y: round(clamp(CONTEXT_TOP + random() * band, 0, 1 - h)),
      w: round(w),
      h: round(h),
      label: 'vehicle',
      confidence: round(0.72 + random() * 0.26),
    });
  }

  return boxes;
}

/** The full overlay for one detection: the object, then its surroundings. */
export function boundingBoxesFor(placement: Placement): BoundingBox[] {
  /*
   * Congestion has no single object. It is a property of the whole carriageway,
   * so the frame shows the traffic and nothing is singled out — marking one car
   * as "the" congestion would be a claim the detector never made.
   */
  if (placement.type === 'congestion') {
    return contextBoxes(placement);
  }

  const primary = primaryBox(placement);
  return [primary, ...contextBoxes({ ...placement, ceiling: primary.y })];
}
