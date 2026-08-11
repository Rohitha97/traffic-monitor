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
 * Where the detection model saw the hazard within the frame, as fractions of
 * the image. Drives the dashed overlay on the snapshot.
 */
export const detectionBoxSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0).max(1),
  h: z.number().min(0).max(1),
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
  detectionBox: detectionBoxSchema.optional(),
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
  /** A dismissed incident that re-detected within 3 minutes comes back tagged. */
  seenBefore: z.boolean().optional(),
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
export type DetectionBox = z.infer<typeof detectionBoxSchema>;
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
