import {
  LANE_POSITION_LABEL,
  PRIORITIES,
  type EventType,
  type LanePosition,
  type Priority,
} from '@/lib/schema';

export { PRIORITIES, type Priority };

/*
 * Priority: how it looks, and how it is decided.
 *
 * Pass B §02 makes priority the only saturated signal in the system, and
 * encodes it five ways at once — colour, border weight, shape, icon and text
 * label. That redundancy is the accessibility spine of the whole design:
 * "assume a colour-blind operator on a badly calibrated monitor".
 *
 * All five cues live in one map so a queue row, a detail chip and a status-bar
 * count can never disagree about what "high" looks like.
 */

interface PriorityPresentation {
  /** Uppercase label for chips and legends. Never rendered alone — always beside the glyph. */
  readonly label: string;
  /** Sentence case, for use inside a sentence ("Confirm as Medium"). */
  readonly title: string;
  /** Sign-taxonomy meaning the shape borrows from. Used in the glyph's alt text. */
  readonly meaning: string;
  /** Text colour utility. */
  readonly text: string;
  /** Fill utility, for the glyph and the row's priority strip. */
  readonly fill: string;
  /** Border colour utility, for outlined treatments. */
  readonly border: string;
  /**
   * Width of the row's priority strip — 4px critical down to 1px low, so
   * severity is legible from the strip alone at the edge of vision. These are
   * fractional steps of the 4px scale, not arbitrary values.
   */
  readonly strip: string;
  /** Shape utility for the glyph. */
  readonly shape: string;
  /**
   * Seconds an incident of this priority may sit unhandled before the row
   * takes the ageing treatment. Critical is 20s, matching Pass A's
   * auto-escalation: "a new critical unacknowledged for 20s re-fires its
   * banner and pushes to the supervisor position."
   */
  readonly slaSeconds: number;
}

export const PRIORITY: Record<Priority, PriorityPresentation> = {
  critical: {
    label: 'CRITICAL',
    title: 'Critical',
    meaning: 'danger',
    text: 'text-critical',
    fill: 'bg-critical',
    border: 'border-critical',
    strip: 'w-1',
    shape: 'clip-triangle',
    slaSeconds: 20,
  },
  high: {
    label: 'HIGH',
    title: 'High',
    meaning: 'warning',
    text: 'text-high',
    fill: 'bg-high',
    border: 'border-high',
    strip: 'w-0.75',
    shape: 'clip-diamond',
    slaSeconds: 120,
  },
  medium: {
    label: 'MEDIUM',
    title: 'Medium',
    meaning: 'caution',
    text: 'text-medium',
    fill: 'bg-medium',
    border: 'border-medium',
    strip: 'w-0.5',
    shape: 'rounded-full',
    slaSeconds: 600,
  },
  low: {
    label: 'LOW',
    title: 'Low',
    meaning: 'info',
    text: 'text-low',
    fill: 'bg-low',
    border: 'border-low',
    strip: 'w-0.25',
    shape: 'rounded-chip',
    slaSeconds: 1800,
  },
};

/** Descending severity — the queue's sort order and the status bar's count order. */
export const PRIORITY_ORDER: readonly Priority[] = PRIORITIES;

/* ────────────────────────────────────────────────────────────────────────
 * Derivation
 * ──────────────────────────────────────────────────────────────────────── */

/** Confidence at or below this demotes one level and flags for verification. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

export interface DerivePriorityInput {
  type: EventType;
  lanePosition: LanePosition;
  confidence: number;
  /** Which live lane, when the detector could localise it. */
  laneNumber?: number;
  /** How many live lanes the camera watches — gives "2 of 3" its denominator. */
  laneCount?: number;
  /** Congestion only: another detection from the same camera inside 10 minutes. */
  repeatWithinWindow?: boolean;
}

export interface DerivedPriority {
  priority: Priority;
  /** The argument for the level, rendered verbatim in the detail pane. */
  reason: string;
  /** Confidence fell below the threshold and the level was demoted. */
  lowConfidence: boolean;
}

/**
 * Base severity per event type and lane position, before confidence is applied.
 *
 * The rules the brief specifies are reproduced exactly. Three cells it does not
 * specify are decided here, and the principle is the same one the brief states
 * for wrong-way drivers — under-reacting to an unrecoverable hazard is far more
 * expensive than over-reacting to a recoverable one:
 *
 *  - `pedestrian` with an unconfirmed lane is treated as a live lane. A person
 *    on a carriageway is the one class where being wrong is fatal.
 *  - `stopped_vehicle` with an unconfirmed lane sits between its live-lane
 *    (critical) and hard-shoulder (medium) outcomes, at high.
 *  - `congestion` and `debris` do not vary with an unconfirmed lane: neither
 *    has an unrecoverable outcome, and escalating them would manufacture
 *    exactly the alert fatigue Pass A names as a failure mode.
 */
const BASE: Record<EventType, Record<LanePosition, Priority>> = {
  wrong_way_driver: {
    live_lane: 'critical',
    hard_shoulder: 'critical',
    off_carriageway: 'critical',
    unknown: 'critical',
  },
  pedestrian: {
    live_lane: 'critical',
    hard_shoulder: 'high',
    off_carriageway: 'high',
    unknown: 'critical',
  },
  stopped_vehicle: {
    live_lane: 'critical',
    hard_shoulder: 'medium',
    off_carriageway: 'low',
    unknown: 'high',
  },
  smoke_fire: {
    live_lane: 'critical',
    hard_shoulder: 'high',
    off_carriageway: 'high',
    unknown: 'high',
  },
  debris: {
    live_lane: 'high',
    hard_shoulder: 'medium',
    off_carriageway: 'medium',
    unknown: 'medium',
  },
  congestion: {
    live_lane: 'medium',
    hard_shoulder: 'medium',
    off_carriageway: 'medium',
    unknown: 'medium',
  },
};

/**
 * Types that never demote on low confidence.
 *
 * Only wrong-way drivers. The reasoning, worth stating because it is the one
 * asymmetry in the whole model: under-reacting to a wrong-way driver is
 * unrecoverable, over-reacting is cheap. A 40%-confidence wrong-way detection
 * is still a wrong-way detection until a human says otherwise.
 */
const NEVER_DEMOTES: ReadonlySet<EventType> = new Set(['wrong_way_driver']);

function demote(priority: Priority): Priority {
  const index = PRIORITIES.indexOf(priority);
  return PRIORITIES[Math.min(index + 1, PRIORITIES.length - 1)] as Priority;
}

/** "live lane 2 of 3", or just "live lane" when the detector could not localise. */
function describeLane(
  lanePosition: LanePosition,
  laneNumber?: number,
  laneCount?: number,
): string {
  const base = LANE_POSITION_LABEL[lanePosition];
  if (lanePosition !== 'live_lane' || laneNumber === undefined) return base;
  return laneCount === undefined
    ? `${base} ${laneNumber}`
    : `${base} ${laneNumber} of ${laneCount}`;
}

function describeRule(
  type: EventType,
  lanePosition: LanePosition,
  lane: string,
  repeatWithinWindow: boolean,
): string {
  switch (type) {
    case 'wrong_way_driver':
      return `vehicle against traffic flow, ${lane}`;
    case 'pedestrian':
      return lanePosition === 'live_lane' || lanePosition === 'unknown'
        ? `person on the carriageway, ${lane}`
        : `person on the ${lane}`;
    case 'stopped_vehicle':
      if (lanePosition === 'live_lane')
        return `stopped vehicle blocking ${lane}`;
      if (lanePosition === 'hard_shoulder')
        return 'stopped on the hard shoulder, live lanes clear';
      if (lanePosition === 'off_carriageway')
        return 'stopped off the carriageway, no obstruction';
      return 'stopped vehicle, lane position unconfirmed';
    case 'smoke_fire':
      return lanePosition === 'live_lane'
        ? `smoke or fire in ${lane}`
        : `smoke or fire, ${lane}`;
    case 'debris':
      return lanePosition === 'live_lane'
        ? `debris in ${lane}`
        : `debris clear of live lanes, ${lane}`;
    case 'congestion':
      return repeatWithinWindow
        ? 'congestion, repeat detection from this camera within 10 minutes'
        : 'congestion building';
  }
}

/**
 * Decide an incident's priority, and say why.
 *
 * Pure and total — same inputs, same output, no clock and no I/O — which is
 * what makes it the one piece of logic here worth unit-testing exhaustively.
 * The reason string it returns is rendered verbatim in the detail pane: showing
 * the level without the argument for it would be showing a conclusion and
 * hiding its evidence, and an operator about to spend money on a dispatch is
 * entitled to the evidence.
 */
export function derivePriority({
  type,
  lanePosition,
  confidence,
  laneNumber,
  laneCount,
  repeatWithinWindow = false,
}: DerivePriorityInput): DerivedPriority {
  let priority = BASE[type][lanePosition];

  // Congestion is the one type with a temporal rule: the same camera reporting
  // again inside ten minutes means it is building, not clearing.
  if (type === 'congestion' && repeatWithinWindow) priority = 'high';

  const lowConfidence =
    confidence < LOW_CONFIDENCE_THRESHOLD && !NEVER_DEMOTES.has(type);
  if (lowConfidence) priority = demote(priority);

  const lane = describeLane(lanePosition, laneNumber, laneCount);
  const rule = describeRule(type, lanePosition, lane, repeatWithinWindow);
  const reason = lowConfidence
    ? `${PRIORITY[priority].title} — ${rule} · Low confidence — verify`
    : `${PRIORITY[priority].title} — ${rule}`;

  return { priority, reason, lowConfidence };
}
