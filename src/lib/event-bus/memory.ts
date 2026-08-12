import {
  applyMark,
  RETENTION,
  type BusEntry,
  type BusHealth,
  type EventBus,
  type Subscriber,
} from '@/lib/event-bus/types';
import type { DetectionEvent, HistoryEntry } from '@/lib/schema';

/*
 * The default. A ring buffer and a set of callbacks, in one process.
 *
 * This is not a stand-in for the "real" implementation — it is what
 * `docker compose up` runs, what `pnpm dev` runs, and what the whole test suite
 * runs against. Redis is the opt-in. A reviewer should be able to clone this
 * repository and see it work without provisioning anything, and every item in
 * phase 8 is held to that.
 *
 * What it does not do is stated plainly rather than papered over: module state
 * does not survive a restart and is not shared between instances. That is the
 * limitation roadmap #1 exists to lift, for deployments that need it lifted.
 */

const HEALTH: BusHealth = { kind: 'memory', degraded: false };

export function createMemoryBus(): EventBus {
  const subscribers = new Set<Subscriber>();
  const entries: BusEntry[] = [];

  /*
   * Monotonic, zero-padded so cursors sort lexically the way Redis stream IDs
   * do. Padding is not cosmetic: it is what lets both implementations be
   * compared by the same conformance assertions.
   */
  let sequence = 0;
  const nextCursor = () => String(++sequence).padStart(12, '0');

  return {
    publish(event: DetectionEvent): Promise<string> {
      const entry: BusEntry = { cursor: nextCursor(), event };
      entries.push(entry);
      if (entries.length > RETENTION) entries.shift();

      for (const subscriber of subscribers) {
        try {
          subscriber(entry);
        } catch {
          // A single broken stream must not stop the others from being fed.
          subscribers.delete(subscriber);
        }
      }

      return Promise.resolve(entry.cursor);
    },

    subscribe(subscriber: Subscriber): () => void {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },

    readFrom(cursor: string | null): Promise<BusEntry[]> {
      if (cursor === null) return Promise.resolve([...entries]);
      const index = entries.findIndex((entry) => entry.cursor === cursor);
      // Unknown cursor — aged out of the window — gets a full resync.
      return Promise.resolve(
        index === -1 ? [...entries] : entries.slice(index + 1),
      );
    },

    recordMark(
      id: string,
      mark: HistoryEntry['mark'],
      at: string,
      actor: string,
      action: string,
      dismissalReason?: string,
    ): Promise<boolean> {
      const index = entries.findIndex((entry) => entry.event.id === id);
      if (index === -1) return Promise.resolve(false);

      const entry = entries[index]!;
      const marked = applyMark(
        entry.event,
        mark,
        at,
        actor,
        action,
        dismissalReason,
      );
      if (!marked) return Promise.resolve(false);

      /*
       * Replaced, not mutated. Callers hold the array this came from — the
       * correlation rules read a snapshot and the metrics route computes over
       * one — and mutating an event under them would make those reads depend on
       * when they happened to run.
       */
      entries[index] = { cursor: entry.cursor, event: marked };
      return Promise.resolve(true);
    },

    subscriberCount: () => subscribers.size,

    health: () => HEALTH,

    close: () => {
      subscribers.clear();
      entries.length = 0;
      return Promise.resolve();
    },
  };
}
