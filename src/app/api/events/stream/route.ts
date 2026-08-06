import { publish, replayAfter, snapshot, subscribe } from '@/lib/event-bus';
import { generateEvent } from '@/lib/generator';
import type { DetectionEvent } from '@/lib/schema';

/*
 * Server-Sent Events.
 *
 * One-way server → client is the actual shape of this traffic: the detector
 * talks, the operator's browser listens. SSE needs no custom server, reconnects
 * on its own, and passes through Docker unchanged — where WebSockets would mean
 * a bidirectional channel we would never send anything back over.
 *
 * Two things this route has to get right beyond "send the events":
 *
 *  - `Last-Event-ID`. The browser sends it automatically on reconnect, and the
 *    stream replays anything published in the gap. Without it a dropped
 *    connection silently loses incidents.
 *  - A heartbeat. Proxies close idle connections, and on a quiet shift this
 *    stream is idle by design. A comment line every 15s keeps it open without
 *    being an event.
 */

export const dynamic = 'force-dynamic';

/** Ambient simulation cadence. `SIM_MODE=external` hands this to detector-sim. */
const SIM_INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS ?? 20_000);
const SIM_MODE = process.env.SIM_MODE ?? 'internal';
const HEARTBEAT_MS = 15_000;

function frame(event: DetectionEvent): string {
  return `id: ${event.id}\nevent: detection\ndata: ${JSON.stringify(event)}\n\n`;
}

export function GET(request: Request): Response {
  const lastEventId = request.headers.get('last-event-id');
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let simulator: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Tell the client the stream is alive before anything happens on it, so
      // the connection indicator can go Live on a quiet shift rather than
      // sitting at "connecting" until the first incident.
      send(
        `event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`,
      );

      // A reconnect gets the delta it missed; a fresh load gets the current
      // open queue. Sending nothing to a fresh load would show an operator an
      // empty screen while incidents are live.
      const initial = lastEventId ? replayAfter(lastEventId) : snapshot();
      for (const event of initial) send(frame(event));

      unsubscribe = subscribe((event) => send(frame(event)));

      heartbeat = setInterval(() => send(`: keep-alive\n\n`), HEARTBEAT_MS);

      /*
       * Ambient background stream. Poisson-ish rather than a fixed metronome:
       * real detections arrive in clusters and lulls, and a perfectly regular
       * beat would let a reviewer predict the next event, which is the one
       * thing a triage demo should not do.
       */
      if (SIM_MODE === 'internal') {
        const scheduleNext = () => {
          const delay = -Math.log(1 - Math.random()) * SIM_INTERVAL_MS;
          simulator = setTimeout(
            () => {
              if (closed) return;
              publish(generateEvent());
              scheduleNext();
            },
            Math.max(2000, delay),
          );
        };
        scheduleNext();
      }
    },

    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
      if (simulator) clearTimeout(simulator);
    },
  });

  request.signal.addEventListener('abort', () => {
    unsubscribe?.();
    if (heartbeat) clearInterval(heartbeat);
    if (simulator) clearTimeout(simulator);
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Nginx and friends buffer by default, which would hold events until the
      // buffer fills — fatal for a stream whose whole value is immediacy.
      'X-Accel-Buffering': 'no',
    },
  });
}
