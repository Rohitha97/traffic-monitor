import type { DetectionEvent, HistoryEntry } from '@/lib/schema';

/*
 * The contract both implementations satisfy.
 *
 * The in-memory ring buffer already had these semantics — append, read from a
 * cursor, bounded retention — which is why Redis Streams is a swap rather than
 * a redesign. Writing the contract down is what makes the swap checkable:
 * `conformance.test.ts` runs one suite against both.
 *
 * Everything is async, including the memory implementation whose answers are
 * always immediately available. A synchronous interface would have made the
 * memory version the shape of the contract and Redis the exception, and every
 * caller would have needed rewriting the day a broker appeared. This way the
 * callers are already correct.
 */

/** How many events stay replayable. Enough to cover a reconnect, not a database. */
export const RETENTION = 100;

/**
 * One entry in the log: the event, and the bus's own cursor for it.
 *
 * The cursor is deliberately *not* the event id. It is whatever the underlying
 * log calls a position — a Redis stream ID, a sequence number in memory — and
 * it is what the SSE `id:` field carries, so a browser's `Last-Event-ID` is a
 * position in the log rather than a value that has to be searched for. Ordering
 * is the bus's business, not the event's.
 */
export interface BusEntry {
  cursor: string;
  event: DetectionEvent;
}

export type Subscriber = (entry: BusEntry) => void;

export interface BusHealth {
  /** Which implementation is answering. */
  kind: 'memory' | 'redis';
  /**
   * True when a broker was configured and is not currently serving.
   *
   * Only ever true for `kind: 'redis'`. The memory bus is not a degraded
   * anything — it is the default, and a dashboard running without a broker is
   * working exactly as designed.
   */
  degraded: boolean;
  /** Set when degraded, for the log and the health endpoint. Never shown to an operator. */
  detail?: string;
}

export interface EventBus {
  /** Append. Returns the cursor the entry landed at. */
  publish(event: DetectionEvent): Promise<string>;

  /**
   * Local fan-out. The returned function unsubscribes.
   *
   * Synchronous on purpose: it registers a callback in this process and has no
   * reason to await anything. With Redis the entries arrive from the broker's
   * stream, so every instance sees every event in the same order — including
   * events this instance did not publish.
   */
  subscribe(subscriber: Subscriber): () => void;

  /**
   * Everything after `cursor`, oldest first. `null` means everything retained.
   *
   * An unknown cursor returns the whole retained window rather than nothing. A
   * client that has been away longer than retention is better served a full
   * resync than a silent gap — which is the one failure a monitoring tool
   * cannot have.
   */
  readFrom(cursor: string | null): Promise<BusEntry[]>;

  /** Record an operator mark against the stored copy. See `recordMark` in `index.ts`. */
  recordMark(
    id: string,
    mark: HistoryEntry['mark'],
    at: string,
    actor: string,
    action: string,
    dismissalReason?: string,
  ): Promise<boolean>;

  /** Local subscribers on this instance. */
  subscriberCount(): number;

  health(): BusHealth;

  /** Release connections. Tests and shutdown; the memory bus has nothing to do. */
  close(): Promise<void>;
}

/**
 * Apply a mark to an event, or report that there was nothing to apply.
 *
 * Shared by both implementations so the *rule* has one definition and only the
 * storage differs — the memory bus calls it directly, and the Redis bus's Lua
 * script is a transliteration of it that the conformance suite holds to the
 * same behaviour.
 *
 * Idempotent per mark: an incident re-opened after a decision must not
 * overwrite the moment it was first looked at, and a duplicate POST from a
 * retry must not either.
 */
export function applyMark(
  event: DetectionEvent,
  mark: HistoryEntry['mark'],
  at: string,
  actor: string,
  action: string,
  dismissalReason?: string,
): DetectionEvent | undefined {
  if (event.history.some((entry) => entry.mark === mark)) return undefined;

  return {
    ...event,
    history: [
      ...event.history,
      {
        at,
        actor,
        action,
        mark,
        ...(dismissalReason !== undefined ? { note: dismissalReason } : {}),
      },
    ],
    ...(dismissalReason !== undefined
      ? {
          status: 'dismissed' as const,
          dismissal: { reason: dismissalReason, at },
        }
      : {}),
  };
}
