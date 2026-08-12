import { createMemoryBus } from '@/lib/event-bus/memory';
import type {
  BusEntry,
  BusHealth,
  ClaimResult,
  ClaimSubscriber,
  EventBus,
  Subscriber,
} from '@/lib/event-bus/types';
import type { DetectionEvent, HistoryEntry } from '@/lib/schema';

export { RETENTION } from '@/lib/event-bus/types';
export type {
  BusEntry,
  BusHealth,
  ClaimNotice,
  ClaimResult,
  EventBus,
} from '@/lib/event-bus/types';

/*
 * The server-side fan-out between ingest and the SSE stream.
 *
 * Which implementation answers is a deployment choice, and the default is the
 * one that needs nothing: `EVENT_BUS=memory` unless told otherwise. `pnpm dev`,
 * `docker compose up` and the whole test suite run with no broker, and that is
 * a rule rather than a convenience — a reviewer should be able to clone this
 * and see it work.
 *
 * `EVENT_BUS=redis` puts the log in Redis Streams, which is what makes the
 * dashboard survive a restart and lets two instances behind a proxy show the
 * same queue. If the broker is unreachable the process still starts, still
 * serves, and says so.
 */

let pending: Promise<EventBus> | undefined;

async function create(): Promise<EventBus> {
  const kind = process.env.EVENT_BUS ?? 'memory';
  if (kind !== 'redis') return createMemoryBus();

  const url = process.env.REDIS_URL;
  if (!url) {
    console.error(
      '[event-bus] EVENT_BUS=redis but REDIS_URL is unset. Using the in-memory bus.',
    );
    return createMemoryBus();
  }

  /*
   * Imported here rather than at the top of the file so the Redis client is not
   * pulled into a build that will never use it. The default path should not
   * carry the weight of an option it has turned down.
   */
  const { createRedisBus } = await import('@/lib/event-bus/redis');
  return createRedisBus(url);
}

/**
 * The bus for this process.
 *
 * Memoised on the promise, not on the resolved value: two requests arriving
 * during startup must share one connection attempt rather than opening two
 * clients and leaking one. This project has already paid for a read-modify-write
 * race once; initialisation is the other place they hide.
 */
export function getBus(): Promise<EventBus> {
  pending ??= create();
  return pending;
}

export async function publish(event: DetectionEvent): Promise<string> {
  return (await getBus()).publish(event);
}

export async function subscribe(subscriber: Subscriber): Promise<() => void> {
  return (await getBus()).subscribe(subscriber);
}

/**
 * Everything after `cursor`, oldest first. `null` means everything retained.
 *
 * One call covers both the reconnect and the fresh-load cases, which used to be
 * two functions and one bug: replaying "everything after nothing" correctly
 * returns nothing, and a first load that gets nothing shows an operator an
 * empty screen while incidents are live.
 */
export async function readFrom(cursor: string | null): Promise<BusEntry[]> {
  return (await getBus()).readFrom(cursor);
}

/** The current state of everything retained, for correlation and metrics. */
export async function snapshot(): Promise<DetectionEvent[]> {
  const entries = await readFrom(null);
  return entries.map((entry) => entry.event);
}

/**
 * Record an operator mark against the stored copy of an event.
 *
 * The client holds the working copy and marks it optimistically, the same way
 * it does every other action. This puts the same entry on the server's copy so
 * `/api/metrics` measures over one record rather than asking each browser what
 * it remembers, and so the correlation rules can see that an incident was
 * dismissed and why.
 *
 * Returns false when the mark was already present or the event has aged out, so
 * the caller can tell "recorded" from "nothing to record".
 */
export async function recordMark(
  id: string,
  mark: HistoryEntry['mark'],
  at: string,
  actor: string,
  action: string,
  dismissalReason?: string,
): Promise<boolean> {
  return (await getBus()).recordMark(
    id,
    mark,
    at,
    actor,
    action,
    dismissalReason,
  );
}

/**
 * Take an incident for a position, if nobody else holds it.
 *
 * The compare-and-set is server-side because that is the only place it can be
 * authoritative: two positions pressing Enter in the same moment cannot be
 * arbitrated by either of their browsers.
 */
export async function claim(
  id: string,
  position: string,
  at: string,
): Promise<ClaimResult> {
  return (await getBus()).claim(id, position, at);
}

export async function subscribeClaims(
  subscriber: ClaimSubscriber,
): Promise<() => void> {
  return (await getBus()).subscribeClaims(subscriber);
}

export async function nextPosition(): Promise<string> {
  return (await getBus()).nextPosition();
}

export async function subscriberCount(): Promise<number> {
  return (await getBus()).subscriberCount();
}

export async function busHealth(): Promise<BusHealth> {
  return (await getBus()).health();
}
