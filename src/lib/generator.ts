import { CAMERAS } from '@/lib/cameras';
import { boundingBoxesFor } from '@/lib/detection';
import { frameFor } from '@/lib/footage';
import { derivePriority } from '@/lib/priority';
import {
  EVENT_TYPES,
  type DetectionEvent,
  type EventType,
  type LanePosition,
} from '@/lib/schema';

/*
 * The stand-in for the detection model.
 *
 * Weighting matters more than it looks. A demo where everything is critical
 * teaches a reviewer nothing about triage — the whole design is about
 * separating the one event that matters from the ninety-nine that do not, so
 * the mix is roughly 60% low/medium, 30% high, 10% critical, as the brief
 * specifies. That is achieved by weighting the *inputs* (event type and lane
 * position) rather than by picking a priority directly, so every event's
 * priority still comes from derivePriority and stays auditable.
 */

/** Relative likelihood of each detection class. Congestion dominates real feeds. */
const TYPE_WEIGHTS: Record<EventType, number> = {
  congestion: 34,
  debris: 22,
  stopped_vehicle: 26,
  smoke_fire: 8,
  pedestrian: 6,
  wrong_way_driver: 4,
};

/**
 * Where each class tends to be seen. A stopped vehicle is usually on the hard
 * shoulder — that is what the hard shoulder is for — which is what keeps
 * criticals rare without ever overriding the priority rules.
 */
const LANE_WEIGHTS: Record<EventType, Record<LanePosition, number>> = {
  congestion: {
    live_lane: 80,
    hard_shoulder: 5,
    off_carriageway: 0,
    unknown: 15,
  },
  debris: { live_lane: 30, hard_shoulder: 55, off_carriageway: 10, unknown: 5 },
  stopped_vehicle: {
    live_lane: 12,
    hard_shoulder: 70,
    off_carriageway: 13,
    unknown: 5,
  },
  smoke_fire: {
    live_lane: 25,
    hard_shoulder: 35,
    off_carriageway: 35,
    unknown: 5,
  },
  pedestrian: {
    live_lane: 20,
    hard_shoulder: 65,
    off_carriageway: 10,
    unknown: 5,
  },
  wrong_way_driver: {
    live_lane: 85,
    hard_shoulder: 10,
    off_carriageway: 0,
    unknown: 5,
  },
};

const DESCRIPTIONS: Record<EventType, (lane: string) => string> = {
  stopped_vehicle: (lane) =>
    `Vehicle stationary in ${lane} for over 4 minutes. Hazard lights not detected.`,
  wrong_way_driver: (lane) =>
    `Vehicle travelling against traffic flow in ${lane}, approaching the next junction.`,
  debris: (lane) => `Object in the carriageway at ${lane}, roughly 1m across.`,
  congestion: (lane) =>
    `Average speed below 20mph across ${lane}, queue building upstream.`,
  pedestrian: (lane) =>
    `Person detected on foot at ${lane}, moving against traffic.`,
  smoke_fire: (lane) =>
    `Smoke plume detected at ${lane}, source not yet visible.`,
};

/** A deterministic PRNG so `pnpm seed` replays the same scenario every time. */
export function makeRandom(seed?: number): () => number {
  if (seed === undefined) return Math.random;
  let state = seed >>> 0;
  return () => {
    // Mulberry32 — small, fast, good enough for a demo, and reproducible.
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedPick<T extends string>(
  weights: Record<T, number>,
  random: () => number,
): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1]![0];
}

export interface GenerateOptions {
  random?: () => number;
  /** Force a class — what Shift+G uses to produce a critical on demand. */
  type?: EventType;
  /** Force a lane position. */
  lanePosition?: LanePosition;
  /** Another detection from this camera inside 10 minutes (congestion only). */
  repeatWithinWindow?: boolean;
  /** Overrides the detection time; defaults to now. */
  now?: Date;
}

/**
 * Produce one detection event, priority and all.
 *
 * `detectedAt` is set a realistic fraction of a second before `receivedAt` —
 * the gap is the pipeline latency the detail pane reports, and it is the
 * honest way to render a number the brief asks to be shown rather than
 * inventing one at display time.
 */
export function generateEvent(options: GenerateOptions = {}): DetectionEvent {
  const random = options.random ?? Math.random;
  const now = options.now ?? new Date();

  const type = options.type ?? weightedPick(TYPE_WEIGHTS, random);
  const lanePosition =
    options.lanePosition ?? weightedPick(LANE_WEIGHTS[type], random);
  const camera = CAMERAS[Math.floor(random() * CAMERAS.length)]!;

  const laneNumber =
    lanePosition === 'live_lane'
      ? 1 + Math.floor(random() * camera.laneCount)
      : undefined;

  // Detectors are confident most of the time; the long tail below 0.6 is what
  // exercises the demotion rule and the "needs verification" treatment.
  const confidence =
    random() < 0.15
      ? 0.3 + random() * 0.29 // 0.30–0.59, demotes
      : 0.72 + random() * 0.27; // 0.72–0.99

  const { priority, reason } = derivePriority({
    type,
    lanePosition,
    confidence,
    ...(laneNumber !== undefined ? { laneNumber } : {}),
    laneCount: camera.laneCount,
    ...(options.repeatWithinWindow !== undefined
      ? { repeatWithinWindow: options.repeatWithinWindow }
      : {}),
  });

  const laneText =
    lanePosition === 'live_lane' && laneNumber !== undefined
      ? `lane ${laneNumber} of ${camera.laneCount}`
      : lanePosition === 'hard_shoulder'
        ? 'the hard shoulder'
        : lanePosition === 'off_carriageway'
          ? 'the verge'
          : 'an unconfirmed position';

  // 200–1400ms of model and clip-buffering latency.
  const latencyMs = 200 + Math.floor(random() * 1200);
  const detectedAt = new Date(now.getTime() - latencyMs);
  const frame = frameFor(camera.id, random);

  return {
    id: `${camera.id}-${now.getTime()}-${Math.floor(random() * 1e6)}`,
    detectedAt: detectedAt.toISOString(),
    receivedAt: now.toISOString(),
    type,
    priority,
    priorityReason: reason,
    confidence: Number(confidence.toFixed(2)),
    status: 'new',
    camera,
    lanePosition,
    ...(laneNumber !== undefined ? { laneNumber } : {}),
    /*
     * A real still from this camera when one exists, and the per-type schematic
     * when it does not. Six of the ten cameras have footage; the rest are a
     * network with cameras that have no feed, which is every network.
     */
    snapshotUrl: frame?.src ?? `/snapshots/${type}.svg`,
    /*
     * Which frame, and where in the source clip it came from. Present only for
     * cameras with footage, which is why it is optional rather than a field
     * that is always absent — the placeholder cameras have no source frame to
     * point at. It is what makes "the snapshot is near the detection, not at
     * it" checkable instead of merely stated. (docs/footage.md)
     */
    ...(frame
      ? {
          sourceFrame: {
            camera: camera.id,
            index: frame.index,
            offsetSeconds: frame.offsetSeconds,
          },
        }
      : {}),
    /*
     * Derived from the same fields the priority rules read, not rolled. A box
     * that contradicts `lanePosition` tells the operator the model cannot see
     * straight, which is worse than drawing nothing. (src/lib/detection.ts)
     */
    boundingBoxes: boundingBoxesFor({
      type,
      lanePosition,
      ...(laneNumber !== undefined ? { laneNumber } : {}),
      laneCount: camera.laneCount,
      random,
      confidence,
    }),
    description: DESCRIPTIONS[type](laneText),
    history: [
      {
        at: detectedAt.toISOString(),
        actor: 'system',
        action: `Detected · confidence ${Math.round(confidence * 100)}%`,
      },
      {
        at: now.toISOString(),
        actor: 'system',
        action: `Priority set ${priority.charAt(0).toUpperCase()}${priority.slice(1)}`,
      },
    ],
  };
}

export { EVENT_TYPES };
