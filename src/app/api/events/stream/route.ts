import {
  busHealth,
  nextPosition,
  publish,
  readFrom,
  subscribe,
  subscribeClaims,
} from '@/lib/event-bus';
import type { BusEntry, ClaimNotice } from '@/lib/event-bus';
import { generateEvent } from '@/lib/generator';
import { positionCookie, positionFrom, positionLabel } from '@/lib/position';

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
 *    connection silently loses incidents. The id on the wire is the *bus
 *    cursor* — a Redis stream ID, or a sequence number in memory — not the
 *    event's own id, so a reconnect is a range query rather than a search.
 *  - A heartbeat. Proxies close idle connections, and on a quiet shift this
 *    stream is idle by design. A comment line every 15s keeps it open without
 *    being an event.
 */

export const dynamic = 'force-dynamic';

/** Ambient simulation cadence. `SIM_MODE=external` hands this to detector-sim. */
const SIM_INTERVAL_MS = Number(process.env.SIM_INTERVAL_MS ?? 20_000);
const SIM_MODE = process.env.SIM_MODE ?? 'internal';
const HEARTBEAT_MS = 15_000;

function frame(entry: BusEntry): string {
  return `id: ${entry.cursor}\nevent: detection\ndata: ${JSON.stringify(entry.event)}\n\n`;
}

/*
 * Claims ride the stream but carry no `id:`.
 *
 * The SSE id is the *log's* cursor, and a claim is not a log entry — giving it
 * one would put a claim's position into `Last-Event-ID` and make the next
 * reconnect replay the wrong window of detections. A reconnecting client does
 * not need these replayed anyway: the claim amends the stored event, so the
 * resync already carries the owner on the record.
 */
function claimFrame(notice: ClaimNotice): string {
  return `event: claim\ndata: ${JSON.stringify(notice)}\n\n`;
}

export async function GET(request: Request): Promise<Response> {
  const lastEventId = request.headers.get('last-event-id');
  const encoder = new TextEncoder();

  /*
   * A workstation identity, assigned on connect and kept.
   *
   * The stream is the right place for it because it is the one request every
   * open dashboard makes exactly once, and it is the moment a position starts
   * existing as far as the server is concerned. A reconnect keeps the number it
   * already had — reassigning on every dropped connection would rename desks
   * mid-shift and make "Taken by position 3" mean nothing.
   */
  const existing = positionFrom(request);
  const position = existing ?? (await nextPosition());

  let unsubscribe: (() => void) | undefined;
  let unsubscribeClaims: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let simulator: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      /*
       * Tell the client the stream is alive before anything happens on it, so
       * the connection indicator can go Live on a quiet shift rather than
       * sitting at "connecting" until the first incident.
       *
       * It carries the bus's health too. `degraded` here means a broker was
       * configured and is not answering — the stream itself is fine, which is
       * exactly why it cannot be reported as a connection problem.
       */
      const health = await busHealth();
      send(
        `event: ready\ndata: ${JSON.stringify({
          at: new Date().toISOString(),
          history: health.degraded ? 'local' : 'shared',
          // The cookie is httpOnly, so this frame is how a position learns its
          // own name — which it needs in order to tell "mine" from "theirs"
          // on a row that is already owned.
          position: positionLabel(position),
        })}\n\n`,
      );

      /*
       * A reconnect gets the delta it missed; a fresh load gets the current
       * open queue. One call, because "everything after nothing" correctly
       * returns nothing and would show an operator an empty screen while
       * incidents are live.
       */
      for (const entry of await readFrom(lastEventId)) send(frame(entry));

      unsubscribe = await subscribe((entry) => send(frame(entry)));

      // So a position that is not racing for an incident still sees it get
      // taken. Without this the lock would only reach the two operators who
      // collided, and every other desk would keep showing it as free.
      unsubscribeClaims = await subscribeClaims((notice) =>
        send(claimFrame(notice)),
      );

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
              void publish(generateEvent());
              scheduleNext();
            },
            Math.max(2000, delay),
          );
        };
        scheduleNext();
      }
    },

    cancel() {
      release();
    },
  });

  request.signal.addEventListener('abort', release);

  function release(): void {
    unsubscribe?.();
    unsubscribeClaims?.();
    if (heartbeat) clearInterval(heartbeat);
    if (simulator) clearTimeout(simulator);
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Nginx and friends buffer by default, which would hold events until the
      // buffer fills — fatal for a stream whose whole value is immediacy.
      'X-Accel-Buffering': 'no',
      'Set-Cookie': positionCookie(position),
    },
  });
}
