import type { DomainLabels } from '@/i18n/domain';
import { markerValue, nearbyCameras } from '@/lib/cameras';
import { formatAge, formatTimestamp, latencySeconds } from '@/lib/format';
import {
  DISMISS_REASON_LABEL,
  EVENT_TYPE_LABEL,
  isDismissReason,
  LANE_POSITION_LABEL,
  OBJECT_CLASS_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Camera,
  type DetectionEvent,
} from '@/lib/schema';

/**
 * English, as a default argument.
 *
 * Every caller inside the app passes real labels from `useDomainLabels`. This
 * exists so the pure mapping stays callable — and testable — without a React
 * tree, and so `en.json` is not the only place the design's own wording lives.
 * The two are held together by `src/i18n/messages.test.ts`.
 */
const DEFAULT_LABELS: DomainLabels = {
  eventType: (type) => EVENT_TYPE_LABEL[type],
  lanePosition: (position) => LANE_POSITION_LABEL[position],
  priority: (priority) => PRIORITY_LABEL[priority],
  status: (status) => STATUS_LABEL[status],
  direction: (direction) => DIRECTION_LABEL[direction],
  objectClass: (objectClass) => OBJECT_CLASS_LABEL[objectClass],
  dismissReason: (reason) =>
    isDismissReason(reason) ? DISMISS_REASON_LABEL[reason] : reason,
  marker: () => 'Mile marker',
  latency: (seconds) => `${seconds.toFixed(1)}s`,
  eta: (minutes) => `${minutes} min`,
  dispatchLine: (unit, minutes) => `Unit ${unit} · ETA ${minutes} min`,
  time: (iso) => formatTimestamp(iso),
  facts: {
    location: 'Location',
    marker: 'Mile marker',
    latency: 'Detection latency',
    confidence: 'Confidence',
  },
};

/** Compass bearings, kept as compass bearings. See ADR-0012. */
const DIRECTION_LABEL: Record<Camera['direction'], string> = {
  NB: 'northbound',
  SB: 'southbound',
  EB: 'eastbound',
  WB: 'westbound',
};

/*
 * Turning a domain event into what the frames show.
 *
 * Kept out of the components so the mapping is testable and so a component
 * cannot quietly invent a label. Every string here traces to a caption in
 * Pass C.
 */

/**
 * The row's primary line: what the detector saw, plus where on the carriageway.
 *
 * Pass C writes these as "Stopped vehicle, hard shoulder" and "Debris, live
 * lane". Wrong-way drivers are the exception — the lane adds nothing to a
 * hazard that is defined by direction, and the frames render it bare.
 */
export function summaryOf(
  event: DetectionEvent,
  labels: DomainLabels = DEFAULT_LABELS,
): string {
  const label = labels.eventType(event.type);
  if (event.type === 'wrong_way_driver' || event.lanePosition === 'unknown') {
    return label;
  }
  return `${label}, ${labels.lanePosition(event.lanePosition)}`;
}

/** "M6 NB · Jct 8–9", as the queue rows read in Pass C. */
export function locationOf(camera: Camera): string {
  const detail = camera.name.split(', ').slice(1).join(', ');
  const short = detail.replace(/^junctions?\s*/i, 'Jct ').trim();
  return short
    ? `${camera.roadway} ${camera.direction} · ${short}`
    : `${camera.roadway} ${camera.direction}`;
}

/** The long form for the detail-pane header: "M6 northbound, junction 8–9". */
export function fullLocationOf(camera: Camera): string {
  return camera.name;
}

export interface RowView {
  priority: DetectionEvent['priority'];
  camera: string;
  summary: string;
  location: string;
  age: string;
  unread: boolean;
  owner?: string;
  /** The composed secondary line once dispatched — "Unit 12 · ETA 4 min". */
  dispatch?: { summary: string };
  seenBefore?: { reason: string };
}

export function toRowView(
  event: DetectionEvent,
  now: number,
  labels: DomainLabels = DEFAULT_LABELS,
): RowView {
  return {
    priority: event.priority,
    camera: event.camera.id,
    summary: summaryOf(event, labels),
    location: locationOf(event.camera),
    age: formatAge(event.receivedAt, now),
    unread: event.status === 'new',
    ...(event.assignedTo ? { owner: initialsOf(event.assignedTo) } : {}),
    ...(event.dispatch
      ? {
          dispatch: {
            summary: labels.dispatchLine(
              event.dispatch.unit,
              event.dispatch.etaMinutes,
            ),
          },
        }
      : {}),
    /*
     * Translated here rather than stored translated. The reason on the event is
     * a key so it crosses desks intact; what an operator reads is resolved in
     * their own locale, at the moment it is rendered.
     *
     * Lower-cased so the tag reads as prose — "seen before · shadow", which is
     * how Pass C sets it. A no-op in Japanese, which has no letter case.
     */
    ...(event.seenBefore
      ? {
          seenBefore: {
            reason: labels.dismissReason(event.seenBefore.reason).toLowerCase(),
          },
        }
      : {}),
  };
}

/** "Position 3" → "P3". The row has 20px for ownership; a name does not fit. */
export function initialsOf(name: string): string {
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Flow legend for the camera schematic. Only a wrong-way driver contradicts
 * the carriageway's direction, so only it earns the second line.
 */
export function flowNoteFor(event: DetectionEvent): string | undefined {
  return event.type === 'wrong_way_driver' ? '↓ flow\n↑ wrong-way' : undefined;
}

export function toDetailView(
  event: DetectionEvent,
  labels: DomainLabels = DEFAULT_LABELS,
) {
  const neighbours = nearbyCameras(event.camera);
  const flowNote = flowNoteFor(event);

  return {
    priority: event.priority,
    summary: summaryOf(event, labels),
    camera: event.camera.id,
    location: fullLocationOf(event.camera),
    mileMarker: event.camera.marker,
    priorityReason: event.priorityReason,
    ...(event.seenBefore
      ? {
          seenBefore: {
            reason: labels.dismissReason(event.seenBefore.reason).toLowerCase(),
            at: labels.time(event.seenBefore.at),
          },
        }
      : {}),
    description: event.description,
    detectionLatency: labels.latency(
      latencySeconds(event.detectedAt, event.receivedAt),
    ),
    factLabels: labels.facts,
    confidence: event.confidence,
    snapshotUrl: event.snapshotUrl,
    capturedAt: labels.time(event.detectedAt),
    snapshotState: 'loaded' as const,
    /*
     * All of them, not one. Each box carries its own class and its own
     * confidence; collapsing to a single rectangle was what made the frame read
     * as a placeholder with a box on it rather than as detector output.
     *
     * The class is resolved here, like every other term, so the overlay stays a
     * presentational component that cannot invent a label — and so the box in
     * the Japanese detail pane says 車両 without `CameraSnapshot` knowing what
     * a locale is.
     */
    boundingBoxes: event.boundingBoxes.map((box) => ({
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      label: labels.objectClass(box.label),
      confidence: box.confidence,
      ...(box.primary ? { primary: true as const } : {}),
    })),
    nearbyCameras: neighbours.map((camera) => ({
      id: camera.id,
      mileMarker: markerValue(camera),
      ...(camera.id === event.camera.id ? { isIncident: true } : {}),
    })),
    ...(flowNote ? { flowNote } : {}),
    audit: event.history.map((entry) => ({
      at: labels.time(entry.at),
      action:
        entry.actor === 'system'
          ? `${entry.action} (system)`
          : `${entry.action} (${entry.actor})`,
    })),
    ...(event.assignedTo ? { acknowledgedBy: event.assignedTo } : {}),
    ...(event.dispatch ? { dispatched: event.dispatch } : {}),
  };
}

/**
 * Warm every queued snapshot off-screen so opening a detail never shows a
 * spinner. This is the single biggest perceived-speed win available here: the
 * evidence image is what the operator is actually waiting for at the "verify"
 * step, worth ~15 seconds in Pass A's journey map.
 */
export function preloadSnapshot(url: string): void {
  if (typeof window === 'undefined') return;
  const image = new window.Image();
  image.decoding = 'async';
  image.src = url;
}
