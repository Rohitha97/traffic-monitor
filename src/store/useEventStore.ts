import { create } from 'zustand';

import { ageInSeconds } from '@/lib/format';
import { PRIORITY, PRIORITIES, type Priority } from '@/lib/priority';
import type { DetectionEvent, Status } from '@/lib/schema';

/*
 * The event store.
 *
 * Zustand rather than Context: this is one shared, high-frequency slice — a
 * single interval ticks the whole queue's age counters once a second — and
 * Context would re-render every consumer on every tick. Selector subscriptions
 * keep a second-by-second clock from repainting the world.
 *
 * The connection state machine lives here too rather than in the transport
 * hook, because "what the operator can trust right now" is one fact and
 * splitting it across two owners is how a UI ends up claiming Live while
 * showing stale rows.
 */

export type ConnectionState = 'live' | 'reconnecting' | 'offline';

/** Terminal states leave the queue; everything else is open work. */
const OPEN_STATUSES: ReadonlySet<Status> = new Set([
  'new',
  'acknowledged',
  'dispatched',
]);

export interface EventStoreState {
  /** Insertion-ordered, newest first. */
  events: DetectionEvent[];
  /**
   * Events that arrived while the operator was reading something else. They
   * are held here rather than spliced into `events`, because the one rule the
   * queue must never break is moving what is currently being read.
   */
  buffered: DetectionEvent[];
  selectedId: string | null;
  /** Row the keyboard is on. Separate from selection: ↑↓ previews, Enter commits. */
  focusedId: string | null;
  connection: ConnectionState;
  /** Frozen at the moment the feed dropped, so "as of" never lies. */
  dataAsOf: string | null;
  /** Bumped once a second by a single shared interval — never one timer per row. */
  tick: number;
  /** Priority filter; empty means everything. */
  filters: Set<Priority>;
  /** Buffering is on whenever the operator is not looking at the top of a quiet queue. */
  scrolledAway: boolean;

  ingest: (event: DetectionEvent) => void;
  flushBuffered: () => void;
  select: (id: string | null) => void;
  focus: (id: string | null) => void;
  setStatus: (id: string, status: Status, actor: string, note?: string) => void;
  setConnection: (state: ConnectionState) => void;
  setScrolledAway: (value: boolean) => void;
  toggleFilter: (priority: Priority) => void;
  clearFilters: () => void;
  advanceTick: () => void;
}

function appendHistory(
  event: DetectionEvent,
  actor: string,
  action: string,
  note?: string,
): DetectionEvent {
  return {
    ...event,
    history: [
      ...event.history,
      {
        at: new Date().toISOString(),
        actor,
        action,
        ...(note !== undefined ? { note } : {}),
      },
    ],
  };
}

export const useEventStore = create<EventStoreState>()((set, get) => ({
  events: [],
  buffered: [],
  selectedId: null,
  focusedId: null,
  connection: 'live',
  dataAsOf: null,
  tick: 0,
  filters: new Set<Priority>(),
  scrolledAway: false,

  ingest: (event) => {
    const { events, buffered, selectedId, scrolledAway } = get();

    // Idempotent: the delta fetch on reconnect can legitimately resend events
    // the client already holds, and a duplicated row is worse than a missed one.
    if (
      events.some((e) => e.id === event.id) ||
      buffered.some((e) => e.id === event.id)
    ) {
      return;
    }

    // A critical is the one class that jumps the buffer — but even then it does
    // not reorder the list under the cursor; it arrives at the pinned top band
    // and fires the banner. (Pass A §04, Pass C frame 2)
    const holdBack =
      (scrolledAway || selectedId !== null) && event.priority !== 'critical';

    set(
      holdBack
        ? { buffered: [event, ...buffered] }
        : { events: [event, ...events] },
    );
  },

  flushBuffered: () =>
    set((state) => ({
      events: [...state.buffered, ...state.events],
      buffered: [],
    })),

  select: (id) => set({ selectedId: id, ...(id ? { focusedId: id } : {}) }),

  focus: (id) => set({ focusedId: id }),

  setStatus: (id, status, actor, note) =>
    set((state) => ({
      events: state.events.map((event) => {
        if (event.id !== id) return event;
        const next = appendHistory(event, actor, STATUS_ACTION[status], note);
        return {
          ...next,
          status,
          ...(status === 'acknowledged' ? { assignedTo: actor } : {}),
          ...(status === 'dismissed' && note
            ? { dismissal: { reason: note, at: new Date().toISOString() } }
            : {}),
          ...(status === 'resolved'
            ? { resolvedAt: new Date().toISOString() }
            : {}),
        };
      }),
    })),

  setConnection: (connection) =>
    set((state) => ({
      connection,
      // Freeze the moment trust was lost; clear it once the feed is back.
      dataAsOf:
        connection === 'live'
          ? null
          : (state.dataAsOf ?? new Date().toISOString()),
    })),

  setScrolledAway: (scrolledAway) => set({ scrolledAway }),

  toggleFilter: (priority) =>
    set((state) => {
      const filters = new Set(state.filters);
      if (filters.has(priority)) filters.delete(priority);
      else filters.add(priority);
      return { filters };
    }),

  clearFilters: () => set({ filters: new Set<Priority>() }),

  advanceTick: () => set((state) => ({ tick: state.tick + 1 })),
}));

const STATUS_ACTION: Record<Status, string> = {
  new: 'Detected',
  acknowledged: 'Acknowledged',
  dispatched: 'Response dispatched',
  resolved: 'Resolved',
  dismissed: 'Dismissed as false positive',
};

/* ── Selectors ────────────────────────────────────────────────────────────
 * Derived state is computed here rather than stored, so it cannot go stale
 * against the events it describes.
 * ──────────────────────────────────────────────────────────────────────── */

export function selectOpenEvents(state: EventStoreState): DetectionEvent[] {
  return state.events.filter((event) => OPEN_STATUSES.has(event.status));
}

export function selectVisibleEvents(state: EventStoreState): DetectionEvent[] {
  const open = selectOpenEvents(state);
  return state.filters.size === 0
    ? open
    : open.filter((event) => state.filters.has(event.priority));
}

export function selectOpenCounts(
  state: EventStoreState,
): Record<Priority, number> {
  const counts = Object.fromEntries(PRIORITIES.map((p) => [p, 0])) as Record<
    Priority,
    number
  >;
  for (const event of selectOpenEvents(state)) counts[event.priority] += 1;
  return counts;
}

export function selectSelected(
  state: EventStoreState,
): DetectionEvent | undefined {
  return state.events.find((event) => event.id === state.selectedId);
}

/** Highest priority among buffered events — colours the buffered bar. */
export function selectBufferedCritical(state: EventStoreState): number {
  return state.buffered.filter((e) => e.priority === 'critical').length;
}

/**
 * Has this event sat unhandled past its priority's threshold?
 *
 * Reads `tick` so that every row recomputes on the shared interval rather than
 * holding a timer of its own.
 */
export function isBreachingSla(
  event: DetectionEvent,
  now: number = Date.now(),
): boolean {
  if (event.status !== 'new') return false;
  return (
    ageInSeconds(event.receivedAt, now) > PRIORITY[event.priority].slaSeconds
  );
}
