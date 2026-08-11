import { create } from 'zustand';

import { ageInSeconds } from '@/lib/format';
import { SEEN_ACTION } from '@/lib/metrics';
import { PRIORITIES, PRIORITY, type Priority } from '@/lib/priority';
import type { DetectionEvent, Mark, Status } from '@/lib/schema';

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

/** A dismissed row holds as a 20px strip with an undo for this long. (Pass C f4) */
export const DISMISS_UNDO_MS = 8000;
/** A resolved row fades out over this long before leaving. (Pass A) */
export const RESOLVED_FADE_MS = 3000;

/** Who is at this position. Single-operator demo; a real deployment would auth. */
export const OPERATOR = 'Rohitha';

export interface EventStoreState {
  /** Insertion-ordered, newest first. */
  events: DetectionEvent[];
  /**
   * Events that arrived while the operator was reading something else. They
   * are held here rather than spliced into `events`, because the one rule the
   * queue must never break is moving what is currently being read.
   */
  buffered: DetectionEvent[];
  /**
   * The incident in the detail pane. ↑↓ moves it and previews immediately —
   * Pass A's "one keyboard axis and no mode" — so there is no separate notion
   * of a focused-but-unopened row to keep in sync.
   */
  selectedId: string | null;
  connection: ConnectionState;
  /** Frozen at the moment the feed dropped, so "as of" never lies. */
  dataAsOf: string | null;
  /** Bumped once a second by a single shared interval — never one timer per row. */
  tick: number;
  /** Priority filter; empty means everything. */
  filters: Set<Priority>;
  /** Audio starts muted: a page that makes noise before consent is hostile. */
  muted: boolean;
  /** True once the operator has scrolled off the top of the queue. */
  scrolledAway: boolean;
  /**
   * Bumped every time an unacknowledged critical crosses its 20-second
   * threshold. The console watches it to re-fire the tone — the alert is a
   * consequence of state rather than something an action remembers to trigger.
   */
  escalations: number;

  ingest: (event: DetectionEvent) => void;
  flushBuffered: () => void;
  select: (id: string | null) => void;
  moveSelection: (delta: 1 | -1) => void;
  acknowledge: (id: string) => void;
  dispatchResponse: (id: string) => void;
  dismiss: (id: string, reason: string) => void;
  resolve: (id: string) => void;
  undoDismiss: (id: string) => void;
  setConnection: (state: ConnectionState) => void;
  setScrolledAway: (value: boolean) => void;
  toggleFilter: (priority: Priority) => void;
  clearFilters: () => void;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  escalateOverdue: (now: number) => void;
  /** Called once an incident has held the detail pane long enough to count as read. */
  markSeen: (id: string) => void;
  advanceTick: () => void;
}

/** The audit line Pass C's frame 3 shows verbatim for an auto-escalation. */
const ESCALATION_ACTION =
  'Unacknowledged 20s — banner re-fired, pushed to supervisor';

function withHistory(
  event: DetectionEvent,
  actor: string,
  action: string,
  note?: string,
  mark?: Mark,
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
        ...(mark !== undefined ? { mark } : {}),
      },
    ],
  };
}

/**
 * Send a mark to the server so the buffered record carries it too.
 *
 * Fire-and-forget, and deliberately so: the operator's action has already
 * taken effect locally, and blocking a keystroke on a metrics write would be
 * the wrong trade in a tool whose whole argument is response time. A dropped
 * mark costs one sample.
 *
 * The `window` guard keeps it out of the unit tests, which run in node and
 * exercise the store directly.
 */
function postMark(
  id: string,
  mark: Mark,
  at: string,
  action: string,
  dismissalReason?: string,
): void {
  if (typeof window === 'undefined') return;
  void fetch('/api/events/mark', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      mark,
      at,
      actor: OPERATOR,
      action,
      ...(dismissalReason !== undefined ? { dismissalReason } : {}),
    }),
  }).catch(() => {
    // Metrics are not worth a console error on an operator's screen.
  });
}

/**
 * The decision mark, if this is the first decision on the incident.
 *
 * Dispatching and dismissing are the two calls Pass A's journey map counts as
 * deciding. Acknowledging is not one: it claims the incident and takes the
 * lock, which is the *start* of deciding, not the end — counting it would make
 * the number measure how fast an operator presses Enter.
 *
 * Returns undefined once a decision has already been recorded, so an
 * undo-and-redo cannot rewrite the original timing.
 */
function decisionMark(
  event: DetectionEvent,
  id: string,
  action: string,
  dismissalReason?: string,
): Mark | undefined {
  if (event.history.some((entry) => entry.mark === 'decided')) return undefined;
  postMark(id, 'decided', new Date().toISOString(), action, dismissalReason);
  return 'decided';
}

/** Records `mark` against `id` once, locally and on the server. */
function markOnce(
  state: EventStoreState,
  id: string,
  mark: Mark,
  action: string,
): Partial<EventStoreState> {
  const target = state.events.find((event) => event.id === id);
  // Idempotent: an incident re-opened after a decision must not overwrite the
  // moment it was first looked at.
  if (!target || target.history.some((entry) => entry.mark === mark)) return {};

  const at = new Date().toISOString();
  postMark(id, mark, at, action);

  return {
    events: state.events.map((event) =>
      event.id === id
        ? {
            ...event,
            history: [...event.history, { at, actor: OPERATOR, action, mark }],
          }
        : event,
    ),
  };
}

/** Units a dispatch can draw on. A real deployment would ask a resourcing service. */
const UNITS = ['12', '07', '31', '18', '25'];

export const useEventStore = create<EventStoreState>()((set) => ({
  events: [],
  buffered: [],
  selectedId: null,
  connection: 'live',
  dataAsOf: null,
  tick: 0,
  filters: new Set<Priority>(),
  muted: true,
  scrolledAway: false,
  escalations: 0,

  /*
   * The updater form is load-bearing, not style.
   *
   * Reading state with `get()` and then calling `set()` with a computed array
   * is a read-modify-write race: two events delivered in the same tick — which
   * happens on every reconnect replay, and on every mount in React's strict
   * double-invoke — both read the same array and the second write silently
   * discards the first. Measured before the fix: five of twenty-one events
   * survived. `set((state) => …)` applies each update against current state.
   */
  ingest: (event) =>
    set((state) => {
      // Idempotent: a reconnect legitimately resends events the client already
      // holds, and a duplicated row is worse than a missed one.
      if (
        state.events.some((e) => e.id === event.id) ||
        state.buffered.some((e) => e.id === event.id)
      ) {
        return {};
      }

      // A critical is the one class that jumps the buffer — but even then it
      // does not reorder the list under the cursor; it arrives at the pinned
      // top band and fires the banner. (Pass A §04, Pass C frame 2)
      const holdBack =
        (state.scrolledAway || state.selectedId !== null) &&
        event.priority !== 'critical';

      return holdBack
        ? { buffered: [event, ...state.buffered] }
        : { events: [event, ...state.events] };
    }),

  flushBuffered: () =>
    set((state) => ({
      events: [...state.buffered, ...state.events],
      buffered: [],
    })),

  select: (id) => set({ selectedId: id }),

  /**
   * ↑↓ across the queue as it is currently rendered — filters included, so the
   * keyboard never lands on a row the operator cannot see. Moving from nothing
   * selects the head of the queue, which is where change appears.
   */
  moveSelection: (delta) =>
    set((state) => {
      const rows = selectQueueEvents(state);
      if (rows.length === 0) return {};

      const current = rows.findIndex((event) => event.id === state.selectedId);
      if (current === -1) {
        return { selectedId: rows[delta === 1 ? 0 : rows.length - 1]!.id };
      }

      // Clamped rather than wrapping: wrapping from the last row back to the
      // top is disorienting when the list is also growing underneath you.
      const next = Math.min(Math.max(current + delta, 0), rows.length - 1);
      return { selectedId: rows[next]!.id };
    }),

  acknowledge: (id) =>
    set((state) => ({
      events: state.events.map((event) =>
        event.id !== id || event.status !== 'new'
          ? event
          : {
              ...withHistory(event, OPERATOR, 'Acknowledged'),
              status: 'acknowledged',
              // Acknowledging takes the lock, and every other position sees it.
              assignedTo: OPERATOR,
            },
      ),
    })),

  dispatchResponse: (id) =>
    set((state) => ({
      events: state.events.map((event) => {
        if (event.id !== id || event.status === 'dispatched') return event;
        const unit = UNITS[Math.floor(Math.random() * UNITS.length)]!;
        const etaMinutes = 3 + Math.floor(Math.random() * 8);
        const action = `Response dispatched · unit ${unit}, ETA ${etaMinutes} min`;
        const mark = decisionMark(event, id, action);
        return {
          ...withHistory(event, OPERATOR, action, undefined, mark),
          status: 'dispatched',
          assignedTo: event.assignedTo ?? OPERATOR,
          dispatch: { unit, etaMinutes },
        };
      }),
    })),

  dismiss: (id, reason) =>
    set((state) => ({
      events: state.events.map((event) => {
        if (event.id !== id) return event;
        const action = 'Dismissed as false positive';
        // The reason travels with the decision: it is what the reopen rule
        // carries forward if this camera reports the same thing again.
        const mark = decisionMark(event, id, action, reason);
        return {
          ...withHistory(event, OPERATOR, action, reason, mark),
          status: 'dismissed',
          dismissal: {
            reason,
            at: new Date().toISOString(),
            previousStatus: event.status,
          },
        };
      }),
      // The detail pane should not keep showing an incident that just left.
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  undoDismiss: (id) =>
    set((state) => ({
      events: state.events.map((event) => {
        if (event.id !== id || event.status !== 'dismissed') return event;
        // Restore the prior status so an acknowledged incident comes back
        // still locked to whoever had it, rather than reset to new for anyone
        // to claim.
        const restored: DetectionEvent = {
          ...withHistory(event, OPERATOR, 'Dismissal undone'),
          status: event.dismissal?.previousStatus ?? 'new',
        };
        delete restored.dismissal;
        return restored;
      }),
    })),

  resolve: (id) =>
    set((state) => ({
      events: state.events.map((event) =>
        event.id !== id
          ? event
          : {
              ...withHistory(event, OPERATOR, 'Resolved'),
              status: 'resolved',
              resolvedAt: new Date().toISOString(),
            },
      ),
      selectedId: state.selectedId === id ? null : state.selectedId,
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

  toggleMute: () => set((state) => ({ muted: !state.muted })),

  setMuted: (muted) => set({ muted }),

  markSeen: (id) => set((state) => markOnce(state, id, 'seen', SEEN_ACTION)),

  /**
   * "A new critical unacknowledged for 20s re-fires its banner and pushes to
   * the supervisor position. Nothing auto-dismisses, ever." (Pass A)
   *
   * Driven from the shared tick rather than a timer per incident, and made
   * idempotent by checking the audit trail itself — the record of having
   * escalated *is* the escalation, so there is no parallel flag to keep in
   * sync with it.
   */
  escalateOverdue: (now) =>
    set((state) => {
      let escalated = 0;

      const events = state.events.map((event) => {
        if (event.priority !== 'critical' || event.status !== 'new') {
          return event;
        }
        if (
          ageInSeconds(event.receivedAt, now) < PRIORITY.critical.slaSeconds
        ) {
          return event;
        }
        if (event.history.some((entry) => entry.action === ESCALATION_ACTION)) {
          return event;
        }
        escalated += 1;
        return withHistory(event, 'system', ESCALATION_ACTION);
      });

      return escalated === 0
        ? {}
        : { events, escalations: state.escalations + escalated };
    }),

  advanceTick: () => set((state) => ({ tick: state.tick + 1 })),
}));

/* ── Selectors ────────────────────────────────────────────────────────────
 * Derived state is computed here rather than stored, so it cannot go stale
 * against the events it describes.
 * ──────────────────────────────────────────────────────────────────────── */

export function selectOpenEvents(state: EventStoreState): DetectionEvent[] {
  return state.events.filter((event) => OPEN_STATUSES.has(event.status));
}

/**
 * Open incidents matching the active filter — what ↑↓ walks and what the
 * detail pane can show.
 */
export function selectQueueEvents(state: EventStoreState): DetectionEvent[] {
  const open = selectOpenEvents(state);
  return state.filters.size === 0
    ? open
    : open.filter((event) => state.filters.has(event.priority));
}

/**
 * Incidents on their way out: dismissed inside the undo window, or resolved
 * inside the fade. They stay in the list so the operator can see what left and
 * take it back — a row that vanishes on click gives no chance to notice a
 * mis-click.
 */
export function selectLeavingEvents(
  events: readonly DetectionEvent[],
  now: number,
): DetectionEvent[] {
  return events.filter((event) => {
    if (event.status === 'dismissed' && event.dismissal) {
      return now - Date.parse(event.dismissal.at) < DISMISS_UNDO_MS;
    }
    if (event.status === 'resolved' && event.resolvedAt) {
      return now - Date.parse(event.resolvedAt) < RESOLVED_FADE_MS;
    }
    return false;
  });
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
 * The newest unacknowledged critical — what the pinned band shows.
 * Acknowledging retires the banner; nothing else does.
 */
export function selectCriticalAlert(
  state: EventStoreState,
): DetectionEvent | undefined {
  return state.events.find(
    (event) => event.priority === 'critical' && event.status === 'new',
  );
}

/** How many criticals are still unacknowledged — the tab title's count. */
export function selectUnacknowledgedCriticals(state: EventStoreState): number {
  return state.events.filter(
    (event) => event.priority === 'critical' && event.status === 'new',
  ).length;
}

/**
 * Has this event sat unhandled past its priority's threshold?
 *
 * Recomputed from the shared tick rather than held as state, so it cannot go
 * stale and no row needs a timer of its own.
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
