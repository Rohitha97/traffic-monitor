import type { DetectionEvent, EventType, LanePosition } from '@/lib/schema';

/*
 * Whether a new detection is about something the queue has already seen.
 *
 * Two rules live here because they are the same lookup: both ask "has this
 * camera reported something like this recently?" and differ only in the window
 * and in what they do with the answer. Splitting them would mean two indexes
 * over the same history drifting apart.
 *
 * Both are pure functions over the event buffer rather than a parallel map.
 * The buffer already *is* the record of what was detected and what was done
 * about it, and a second index of the same facts is a second thing to keep
 * correct — the congestion rule previously kept one, and it counted every
 * detection from a camera as a congestion repeat regardless of type.
 */

/**
 * How long a dismissal suppresses re-litigating the same call.
 *
 * Pass A: "A dismissed incident that re-detects within 3 min returns as *new*,
 * tagged 'seen before', with the earlier dismissal reason on the row." The
 * point is that the operator does not make the same judgement twice from
 * scratch — not that the incident is hidden.
 */
export const REOPEN_WINDOW_MS = 3 * 60 * 1000;

/** Congestion escalates when the same camera reports again inside this window. */
export const CONGESTION_REPEAT_WINDOW_MS = 10 * 60 * 1000;

export interface Observation {
  cameraId: string;
  type: EventType;
  lanePosition: LanePosition;
  laneNumber?: number | undefined;
  /** Epoch milliseconds. */
  at: number;
}

/**
 * Whether two detections are plausibly the same object.
 *
 * Same camera and same class is not enough — two separate debris calls on one
 * camera are two incidents, and merging them would hide the second behind the
 * first's dismissal. So position has to agree too:
 *
 *  - Different lane *position* is a different place. Debris on the hard
 *    shoulder and debris in a live lane are not the same call, even from the
 *    same camera a minute apart.
 *  - Within the live lanes, **adjacent lanes count as the same object**. A
 *    detector that put a stopped vehicle in lane 2 and then lane 3 has almost
 *    certainly seen one vehicle and disagreed with itself, and the operator
 *    should not be asked twice.
 *  - An unlocalised detection (`unknown`, or a live lane with no number)
 *    matches any lane of the same position, because there is no evidence to
 *    separate them on and the conservative reading is that it is the same
 *    thing.
 */
export function isSameObject(a: Observation, b: Observation): boolean {
  if (a.cameraId !== b.cameraId || a.type !== b.type) return false;
  if (a.lanePosition !== b.lanePosition) return false;

  if (a.laneNumber === undefined || b.laneNumber === undefined) return true;
  return Math.abs(a.laneNumber - b.laneNumber) <= 1;
}

function observationOf(event: DetectionEvent): Observation {
  return {
    cameraId: event.camera.id,
    type: event.type,
    lanePosition: event.lanePosition,
    laneNumber: event.laneNumber,
    at: Date.parse(event.receivedAt),
  };
}

export interface PriorDismissal {
  reason: string;
  at: string;
}

/**
 * The most recent dismissal this detection would be re-litigating, if any.
 *
 * Returns the *reason*, not merely the fact — the whole point of the rule is
 * that an operator meeting the same call again can see the judgement already
 * made rather than starting over.
 */
export function findPriorDismissal(
  events: readonly DetectionEvent[],
  observation: Observation,
): PriorDismissal | undefined {
  let best: PriorDismissal | undefined;
  let bestAt = -Infinity;

  for (const event of events) {
    if (event.status !== 'dismissed' || !event.dismissal) continue;
    if (!isSameObject(observationOf(event), observation)) continue;

    const dismissedAt = Date.parse(event.dismissal.at);
    const age = observation.at - dismissedAt;
    if (age < 0 || age > REOPEN_WINDOW_MS) continue;

    // Newest wins: a call dismissed twice should show the most recent verdict.
    if (dismissedAt > bestAt) {
      bestAt = dismissedAt;
      best = { reason: event.dismissal.reason, at: event.dismissal.at };
    }
  }

  return best;
}

/**
 * Whether this camera has already reported congestion inside the window.
 *
 * Scoped to congestion and to the same camera, which the previous
 * implementation was not — it keyed a single "last seen" timestamp per camera
 * across every event type, so a debris call would make the next congestion
 * detection look like a repeat.
 */
export function isRepeatDetection(
  events: readonly DetectionEvent[],
  observation: Observation,
): boolean {
  if (observation.type !== 'congestion') return false;

  return events.some((event) => {
    if (event.type !== 'congestion') return false;
    if (event.camera.id !== observation.cameraId) return false;
    const age = observation.at - Date.parse(event.receivedAt);
    return age >= 0 && age < CONGESTION_REPEAT_WINDOW_MS;
  });
}
