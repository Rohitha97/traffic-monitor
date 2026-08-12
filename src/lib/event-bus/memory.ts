import {
  applyClaim,
  applyMark,
  ownerOf,
  RETENTION,
  type BusEntry,
  type BusHealth,
  type ClaimResult,
  type ClaimSubscriber,
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
  const claimSubscribers = new Set<ClaimSubscriber>();
  const entries: BusEntry[] = [];
  let positions = 0;

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

    claim(id: string, position: string, at: string): Promise<ClaimResult> {
      const index = entries.findIndex((entry) => entry.event.id === id);
      if (index === -1) return Promise.resolve({ ok: false, owner: null });

      const entry = entries[index]!;
      const claimed = applyClaim(entry.event, position, at);

      /*
       * Check and set with nothing awaited between them.
       *
       * This looks too easy for a lock, and it is correct for exactly one
       * reason: JavaScript is single-threaded and there is no suspension point
       * in here, so no other request can observe the gap. The Redis
       * implementation has to do the same work in Lua precisely because that
       * guarantee stops holding the moment the record leaves this process.
       */
      if (!claimed) {
        return Promise.resolve({ ok: false, owner: ownerOf(entry.event)! });
      }

      /*
       * Re-claiming what you already hold succeeds and changes nothing — so
       * there is nothing to write and nobody to tell. Announcing it anyway
       * would have every retry re-broadcast a lock that had not moved, which
       * the conformance suite caught: the Lua script skips the notice on that
       * path and this did not.
       */
      if (claimed === entry.event) {
        return Promise.resolve({ ok: true, owner: position, event: claimed });
      }

      entries[index] = { cursor: entry.cursor, event: claimed };

      const notice = { id, owner: position, at };
      for (const subscriber of claimSubscribers) {
        try {
          subscriber(notice);
        } catch {
          claimSubscribers.delete(subscriber);
        }
      }

      return Promise.resolve({ ok: true, owner: position, event: claimed });
    },

    subscribeClaims(subscriber: ClaimSubscriber): () => void {
      claimSubscribers.add(subscriber);
      return () => claimSubscribers.delete(subscriber);
    },

    nextPosition: () => Promise.resolve(String(++positions)),

    subscriberCount: () => subscribers.size,

    health: () => HEALTH,

    close: () => {
      subscribers.clear();
      claimSubscribers.clear();
      entries.length = 0;
      return Promise.resolve();
    },
  };
}
