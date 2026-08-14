import { z } from 'zod';

/*
 * The contract between the detection system and the operator's screen.
 *
 * Defined once, here, with types inferred from it — so the route handler that
 * accepts an event, the store that holds it and the components that render it
 * cannot disagree about its shape. The ingest route validates against this, so
 * a malformed event from the detector fails at the boundary rather than
 * halfway through a render.
 *
 * Field names line up with the labels in Pass C so the mapping to the frames
 * is obvious.
 */

export const EVENT_TYPES = [
  'stopped_vehicle',
  'wrong_way_driver',
  'debris',
  'congestion',
  'pedestrian',
  'smoke_fire',
] as const;

export const LANE_POSITIONS = [
  'live_lane',
  'hard_shoulder',
  'off_carriageway',
  'unknown',
] as const;

export const STATUSES = [
  'new',
  'acknowledged',
  'dispatched',
  'resolved',
  'dismissed',
] as const;

/** Descending severity. The order is load-bearing: `derivePriority` demotes along it. */
export const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

export const eventTypeSchema = z.enum(EVENT_TYPES);
export const lanePositionSchema = z.enum(LANE_POSITIONS);
export const statusSchema = z.enum(STATUSES);
export const prioritySchema = z.enum(PRIORITIES);

export const cameraSchema = z.object({
  /** "M4-EB-114" */
  id: z.string().min(1),
  /** "M4 eastbound, junction 4 approach" */
  name: z.string().min(1),
  roadway: z.string().min(1),
  direction: z.enum(['NB', 'SB', 'EB', 'WB']),
  /** "MP 114.2" */
  marker: z.string().min(1),
  /**
   * How many live lanes this camera watches. Required because the frames say
   * "live lane 2 of 3" — laneNumber alone cannot produce the denominator.
   */
  laneCount: z.number().int().positive(),
  lat: z.number(),
  lng: z.number(),
});

/**
 * The two instrumented moments, carried on the audit entry that records them.
 *
 * A typed field rather than string-matching the action prose: the trail stays
 * one human-readable timeline, but the measurement reads a value that cannot
 * drift when someone rewords a line.
 */
export const MARKS = ['seen', 'decided'] as const;
export const markSchema = z.enum(MARKS);

export const historyEntrySchema = z.object({
  at: z.iso.datetime(),
  /** "system", or an operator's name. */
  actor: z.string().min(1),
  action: z.string().min(1),
  note: z.string().optional(),
  mark: markSchema.optional(),
});

/**
 * What the detector says it saw, per object.
 *
 * A traffic photograph in a card reads as a placeholder. The same photograph
 * with the model's own boxes on it reads as output from a vision system — which
 * is what it is, and which is the difference between evidence an operator
 * trusts and stock imagery they scroll past.
 */
export const OBJECT_CLASSES = [
  'vehicle',
  'person',
  'debris',
  'smoke',
  'obstruction',
] as const;

export const objectClassSchema = z.enum(OBJECT_CLASSES);
export type ObjectClass = z.infer<typeof objectClassSchema>;

export const boundingBoxSchema = z.object({
  /** Fractions of the frame, 0–1, so the overlay scales with the container. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  /**
   * Strictly positive. A zero-area box is not a quiet detection, it is a
   * malformed one — it draws nothing an operator can see, and the label
   * placement divides by the height to work out how far to clear the OSD plate.
   */
  w: z.number().gt(0).max(1),
  h: z.number().gt(0).max(1),
  label: objectClassSchema,
  /**
   * This object's confidence, which is **not** the event's.
   *
   * A model can be 0.95 sure it sees a vehicle and the incident still be a
   * 0.4-confidence "is that stopped or just slow" call. Collapsing the two
   * would let a certain observation launder an uncertain judgement.
   */
  confidence: z.number().min(0).max(1),
  /**
   * The object the incident is about, as opposed to the traffic around it.
   *
   * Exactly one box per event is primary; it takes the priority colour while
   * the rest stay neutral, so the operator's eye lands on the thing that was
   * detected rather than on whichever box happens to be largest.
   */
  primary: z.boolean().optional(),
});

export const detectionEventSchema = z.object({
  id: z.string().min(1),
  /** When the model saw it. */
  detectedAt: z.iso.datetime(),
  /** When the client got it — the gap is pipeline latency, and it is shown. */
  receivedAt: z.iso.datetime(),
  type: eventTypeSchema,
  priority: prioritySchema,
  /** Not just the level — the argument for it. Always rendered. */
  priorityReason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  status: statusSchema,
  camera: cameraSchema,
  lanePosition: lanePositionSchema,
  laneNumber: z.number().int().positive().optional(),
  snapshotUrl: z.string().min(1),
  /**
   * Every object the model reported in the frame, not just the incident's.
   *
   * Empty is legitimate — a congestion call is a property of the whole
   * carriageway rather than of one object — so the overlay renders nothing
   * rather than inventing a box to fill the space.
   */
  boundingBoxes: z.array(boundingBoxSchema).default([]),
  /**
   * Which extracted frame the snapshot is, and where it sits in the source
   * clip.
   *
   * Optional because only the cameras with derived footage have one — the rest
   * fall back to a per-event-type schematic that has no source to point at.
   * The frames are sampled at a fixed spacing, so a snapshot is the nearest
   * frame to the detection rather than the exact instant, and this field is
   * what makes that auditable rather than merely admitted in a doc.
   */
  sourceFrame: z
    .object({
      camera: z.string().min(1),
      index: z.number().int().min(0),
      offsetSeconds: z.number().min(0),
    })
    .optional(),
  /** One plain-English sentence from the detector. */
  description: z.string().min(1),
  assignedTo: z.string().optional(),
  /** Set on dispatch — unit and ETA replace the description on the row. */
  dispatch: z
    .object({
      unit: z.string().min(1),
      etaMinutes: z.number().int().positive(),
    })
    .optional(),
  /**
   * Set on dismissal. The reason is how the detection model improves.
   * `previousStatus` exists so undo restores the lock rather than resetting to
   * new — dismissing an acknowledged incident and undoing it must give the
   * operator their incident back, not somebody else's to claim.
   */
  dismissal: z
    .object({
      reason: z.string().min(1),
      at: z.iso.datetime(),
      previousStatus: statusSchema.optional(),
    })
    .optional(),
  /**
   * Set when this detection re-litigates a call already made: the same object
   * on the same camera, dismissed inside the reopen window.
   *
   * Carries the earlier reason rather than being a flag, because the rule is
   * that the operator can see the judgement already made — a boolean plus a
   * separate reason field would be two things that can disagree, and the tag
   * is useless without the reason.
   */
  seenBefore: z
    .object({ reason: z.string().min(1), at: z.iso.datetime() })
    .optional(),
  resolvedAt: z.iso.datetime().optional(),
  history: z.array(historyEntrySchema),
});

/**
 * What the detector actually posts. Priority, its reason and the timestamps the
 * client owns are all derived server-side rather than trusted from the wire —
 * a detector that could set its own priority would make the triage rules
 * unauditable.
 */
export const detectionIngestSchema = detectionEventSchema
  .omit({
    id: true,
    priority: true,
    priorityReason: true,
    receivedAt: true,
    status: true,
    history: true,
  })
  .extend({
    detectedAt: z.iso.datetime().optional(),
  });

export type EventType = z.infer<typeof eventTypeSchema>;
export type LanePosition = z.infer<typeof lanePositionSchema>;
export type Status = z.infer<typeof statusSchema>;
export type Priority = z.infer<typeof prioritySchema>;
export type Camera = z.infer<typeof cameraSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type Mark = z.infer<typeof markSchema>;
export type BoundingBox = z.infer<typeof boundingBoxSchema>;
export type DetectionEvent = z.infer<typeof detectionEventSchema>;
export type DetectionIngest = z.infer<typeof detectionIngestSchema>;

/** Human-readable labels, matching the wording used across Pass C's frames. */
export const EVENT_TYPE_LABEL: Record<EventType, string> = {
  stopped_vehicle: 'Stopped vehicle',
  wrong_way_driver: 'Wrong-way driver',
  debris: 'Debris',
  congestion: 'Congestion',
  pedestrian: 'Pedestrian on carriageway',
  smoke_fire: 'Smoke or fire',
};

export const LANE_POSITION_LABEL: Record<LanePosition, string> = {
  live_lane: 'live lane',
  hard_shoulder: 'hard shoulder',
  off_carriageway: 'off carriageway',
  unknown: 'lane unconfirmed',
};

/**
 * The false-positive reasons, as keys.
 *
 * Domain vocabulary, so it lives here with the other enums rather than being
 * exported from the menu that happens to render it. The value is written onto
 * the event, sent to the server, and handed back by the reopen rule — all of
 * which cross desks, so it must not be one operator's language.
 */
export const DISMISS_REASONS = [
  'shadow',
  'spray',
  'parked_hard_shoulder',
  'camera_artefact',
  'already_known',
] as const;

export type DismissReason = (typeof DISMISS_REASONS)[number];

export function isDismissReason(value: string): value is DismissReason {
  return (DISMISS_REASONS as readonly string[]).includes(value);
}

export const DISMISS_REASON_LABEL: Record<DismissReason, string> = {
  shadow: 'Shadow',
  spray: 'Spray',
  parked_hard_shoulder: 'Parked on hard shoulder',
  camera_artefact: 'Camera artefact',
  already_known: 'Already known',
};

/**
 * What the box says it is.
 *
 * Lower case: these are set inside a box label beside a percentage
 * ("vehicle 94%"), not as a heading, and title case there reads as a proper
 * noun for a car the model has never met.
 */
export const OBJECT_CLASS_LABEL: Record<ObjectClass, string> = {
  vehicle: 'vehicle',
  person: 'person',
  debris: 'debris',
  smoke: 'smoke',
  obstruction: 'obstruction',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'CRITICAL',
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

export const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  dispatched: 'Dispatched',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};
