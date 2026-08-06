import type { DetectionEvent } from '@/lib/schema';

/*
 * The server-side fan-out between ingest and the SSE stream.
 *
 * Deliberately in-memory: this is a front-end evaluation, and a real broker
 * would be answering a question nobody asked. What it does have to get right is
 * the small ring buffer — a client that reconnects asks for everything after
 * the last id it saw, so a brief drop does not silently lose an incident.
 * Without that, "reconnected" would quietly mean "missed whatever happened
 * while you were away", which is the one failure a monitoring tool cannot have.
 *
 * Module state persists across requests within a server instance. It does not
 * survive a restart, and it is not shared between instances — both stated in
 * the README rather than papered over.
 */

type Subscriber = (event: DetectionEvent) => void;

const subscribers = new Set<Subscriber>();

/** Enough to cover a reconnect, not enough to be a database. */
const REPLAY_LIMIT = 100;
const recent: DetectionEvent[] = [];

export function publish(event: DetectionEvent): void {
  recent.push(event);
  if (recent.length > REPLAY_LIMIT) recent.shift();

  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch {
      // A single broken stream must not stop the others from being fed.
      subscribers.delete(subscriber);
    }
  }
}

export function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

/**
 * Everything after `lastEventId`. Returns the whole buffer when the id is
 * unknown — a client that has been away longer than the buffer is better served
 * a full resync than a silent gap.
 */
export function replayAfter(lastEventId: string): DetectionEvent[] {
  const index = recent.findIndex((event) => event.id === lastEventId);
  return index === -1 ? [...recent] : recent.slice(index + 1);
}

/**
 * What is currently open, for a client that has just loaded.
 *
 * A fresh connection is not a reconnect: it has no `Last-Event-ID` and no local
 * state, so replaying "everything after nothing" would correctly send zero
 * events and incorrectly show an operator an empty queue while incidents are
 * live. Opening the dashboard has to show the shift as it actually stands.
 */
export function snapshot(): DetectionEvent[] {
  return [...recent];
}

export function subscriberCount(): number {
  return subscribers.size;
}
