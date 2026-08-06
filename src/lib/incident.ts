import { markerValue, nearbyCameras } from '@/lib/cameras';
import { formatAge, formatLatency, formatTimestamp } from '@/lib/format';
import {
  EVENT_TYPE_LABEL,
  LANE_POSITION_LABEL,
  type Camera,
  type DetectionEvent,
} from '@/lib/schema';

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
export function summaryOf(event: DetectionEvent): string {
  const label = EVENT_TYPE_LABEL[event.type];
  if (event.type === 'wrong_way_driver' || event.lanePosition === 'unknown') {
    return label;
  }
  return `${label}, ${LANE_POSITION_LABEL[event.lanePosition]}`;
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
  dispatch?: { unit: string; eta: string };
}

export function toRowView(event: DetectionEvent, now: number): RowView {
  return {
    priority: event.priority,
    camera: event.camera.id,
    summary: summaryOf(event),
    location: locationOf(event.camera),
    age: formatAge(event.receivedAt, now),
    unread: event.status === 'new',
    ...(event.assignedTo ? { owner: initialsOf(event.assignedTo) } : {}),
    ...(event.dispatch
      ? {
          dispatch: {
            unit: event.dispatch.unit,
            eta: `${event.dispatch.etaMinutes} min`,
          },
        }
      : {}),
  };
}

/** "J. Kavanagh" → "JK". The row has 20px for ownership; a name does not fit. */
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

export function toDetailView(event: DetectionEvent) {
  const neighbours = nearbyCameras(event.camera);
  const flowNote = flowNoteFor(event);

  return {
    priority: event.priority,
    summary: summaryOf(event),
    camera: event.camera.id,
    location: fullLocationOf(event.camera),
    mileMarker: event.camera.marker,
    priorityReason: event.priorityReason,
    description: event.description,
    detectionLatency: formatLatency(event.detectedAt, event.receivedAt),
    confidence: event.confidence,
    snapshotUrl: event.snapshotUrl,
    capturedAt: formatTimestamp(event.detectedAt),
    snapshotState: 'loaded' as const,
    ...(event.detectionBox
      ? {
          detection: { ...event.detectionBox, confidence: event.confidence },
        }
      : {}),
    nearbyCameras: neighbours.map((camera) => ({
      id: camera.id,
      mileMarker: markerValue(camera),
      ...(camera.id === event.camera.id ? { isIncident: true } : {}),
    })),
    ...(flowNote ? { flowNote } : {}),
    audit: event.history.map((entry) => ({
      at: formatTimestamp(entry.at),
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
