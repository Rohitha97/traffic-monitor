import { publish } from '@/lib/event-bus';
import { generateEvent } from '@/lib/generator';
import { derivePriority } from '@/lib/priority';
import {
  detectionIngestSchema,
  type DetectionEvent,
  type EventType,
} from '@/lib/schema';

/*
 * Where the detection system hands an event to the people.
 *
 * This route is the boundary the brief describes, made real rather than
 * implied: `services/detector-sim` POSTs here, exactly as a detection pipeline
 * would, and everything downstream — priority, the reason string, the audit
 * trail, the received timestamp — is decided on this side of the line.
 *
 * A detector that could set its own priority would make the triage rules
 * unauditable, so `derivePriority` runs here on the detector's raw observation
 * and the posted body is not trusted for anything but what the camera saw.
 */

export const dynamic = 'force-dynamic';

/** Congestion escalates on a repeat from the same camera inside this window. */
const REPEAT_WINDOW_MS = 10 * 60 * 1000;
const lastSeenByCamera = new Map<string, number>();

function isRepeat(cameraId: string, type: EventType, now: number): boolean {
  if (type !== 'congestion') return false;
  const previous = lastSeenByCamera.get(cameraId);
  lastSeenByCamera.set(cameraId, now);
  return previous !== undefined && now - previous < REPEAT_WINDOW_MS;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body is not valid JSON' }, { status: 400 });
  }

  // A demo affordance: an empty body means "make something up", which is what
  // the G keypress and `pnpm seed` use. A body is validated properly.
  if (
    body === null ||
    (typeof body === 'object' && Object.keys(body).length === 0)
  ) {
    const event = generateEvent();
    publish(event);
    return Response.json(
      { id: event.id, priority: event.priority },
      { status: 202 },
    );
  }

  const parsed = detectionIngestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Detection failed validation', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const observation = parsed.data;
  const now = new Date();
  const detectedAt = observation.detectedAt ?? now.toISOString();

  const { priority, reason } = derivePriority({
    type: observation.type,
    lanePosition: observation.lanePosition,
    confidence: observation.confidence,
    ...(observation.laneNumber !== undefined
      ? { laneNumber: observation.laneNumber }
      : {}),
    laneCount: observation.camera.laneCount,
    repeatWithinWindow: isRepeat(
      observation.camera.id,
      observation.type,
      now.getTime(),
    ),
  });

  const event: DetectionEvent = {
    ...observation,
    id: `${observation.camera.id}-${now.getTime()}-${Math.floor(Math.random() * 1e6)}`,
    detectedAt,
    receivedAt: now.toISOString(),
    priority,
    priorityReason: reason,
    status: 'new',
    history: [
      {
        at: detectedAt,
        actor: 'system',
        action: `Detected · confidence ${Math.round(observation.confidence * 100)}%`,
      },
      {
        at: now.toISOString(),
        actor: 'system',
        action: `Priority set ${priority.charAt(0).toUpperCase()}${priority.slice(1)}`,
      },
    ],
  };

  publish(event);

  return Response.json(
    { id: event.id, priority: event.priority },
    { status: 202 },
  );
}
