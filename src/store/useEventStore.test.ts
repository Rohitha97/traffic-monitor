import { beforeEach, describe, expect, it } from 'vitest';

import { generateEvent, makeRandom } from '@/lib/generator';
import type { DetectionEvent, Priority } from '@/lib/schema';
import {
  DISMISS_UNDO_MS,
  isBreachingSla,
  OPERATOR,
  selectBufferedCritical,
  selectCriticalAlert,
  selectLeavingEvents,
  selectOpenCounts,
  selectQueueEvents,
  useEventStore,
} from '@/store/useEventStore';

/*
 * The store is the other half of the logic worth testing — the priority rules
 * decide what an event *is*, and these decide what happens to it.
 *
 * The behaviours covered here are the ones that would be quietly wrong without
 * a test: buffering the queue so an arrival cannot move what is being read,
 * the lock that acknowledging takes, and undo restoring the prior status rather
 * than resetting to new.
 */

const INITIAL = useEventStore.getState();

/** Deterministic events, so a failure is reproducible. */
let seed = 1;
function event(overrides: Partial<DetectionEvent> = {}): DetectionEvent {
  seed += 1;
  return { ...generateEvent({ random: makeRandom(seed) }), ...overrides };
}

function critical(): DetectionEvent {
  return event({ priority: 'critical', status: 'new' });
}

beforeEach(() => {
  useEventStore.setState(
    {
      ...INITIAL,
      events: [],
      buffered: [],
      selectedId: null,
      filters: new Set<Priority>(),
      scrolledAway: false,
      muted: true,
      connection: 'live',
      dataAsOf: null,
      tick: 0,
    },
    true,
  );
});

describe('ingest', () => {
  it('puts new events at the head of the queue', () => {
    const first = event();
    const second = event();
    useEventStore.getState().ingest(first);
    useEventStore.getState().ingest(second);

    expect(useEventStore.getState().events.map((e) => e.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it('ignores an event it already holds', () => {
    // A reconnect legitimately replays events the client already has, and a
    // duplicated row is worse than a missed one.
    const only = event();
    useEventStore.getState().ingest(only);
    useEventStore.getState().ingest(only);

    expect(useEventStore.getState().events).toHaveLength(1);
  });

  it('buffers arrivals while an incident is open, rather than reordering', () => {
    const open = event();
    useEventStore.getState().ingest(open);
    useEventStore.getState().select(open.id);

    const arriving = event({ priority: 'medium' });
    useEventStore.getState().ingest(arriving);

    expect(useEventStore.getState().events).toHaveLength(1);
    expect(useEventStore.getState().buffered.map((e) => e.id)).toEqual([
      arriving.id,
    ]);
  });

  it('lets a critical through the buffer even while reading', () => {
    const open = event();
    useEventStore.getState().ingest(open);
    useEventStore.getState().select(open.id);

    const urgent = critical();
    useEventStore.getState().ingest(urgent);

    expect(useEventStore.getState().buffered).toHaveLength(0);
    expect(useEventStore.getState().events[0]?.id).toBe(urgent.id);
  });

  it('keeps every event when a burst arrives in one tick', () => {
    /*
     * Regression. `ingest` used to read state with get() and then set() a
     * computed array — a read-modify-write race. Two events delivered in the
     * same tick both read the same array and the second write discarded the
     * first, which is exactly what a reconnect replay and React's strict
     * double-mount produce. Measured against the running app before the fix:
     * five of twenty-one events survived.
     */
    const burst = Array.from({ length: 20 }, () => event());
    const { ingest } = useEventStore.getState();
    for (const item of burst) ingest(item);

    expect(useEventStore.getState().events).toHaveLength(20);
    expect(new Set(useEventStore.getState().events.map((e) => e.id)).size).toBe(
      20,
    );
  });

  it('releases buffered events in order when flushed', () => {
    const open = event();
    useEventStore.getState().ingest(open);
    useEventStore.getState().select(open.id);
    const a = event();
    const b = event();
    useEventStore.getState().ingest(a);
    useEventStore.getState().ingest(b);

    useEventStore.getState().flushBuffered();

    expect(useEventStore.getState().buffered).toHaveLength(0);
    expect(useEventStore.getState().events.map((e) => e.id)).toEqual([
      b.id,
      a.id,
      open.id,
    ]);
  });
});

describe('keyboard selection', () => {
  it('selects the head of the queue from nothing', () => {
    const first = event();
    const second = event();
    useEventStore.getState().ingest(first);
    useEventStore.getState().ingest(second);

    useEventStore.getState().moveSelection(1);
    expect(useEventStore.getState().selectedId).toBe(second.id);
  });

  it('clamps at both ends rather than wrapping', () => {
    // Wrapping from the last row back to the top is disorienting when the list
    // is also growing underneath you.
    const first = event();
    const second = event();
    useEventStore.getState().ingest(first);
    useEventStore.getState().ingest(second);

    const store = useEventStore.getState();
    store.moveSelection(1);
    store.moveSelection(1);
    store.moveSelection(1);
    expect(useEventStore.getState().selectedId).toBe(first.id);

    store.moveSelection(-1);
    store.moveSelection(-1);
    expect(useEventStore.getState().selectedId).toBe(second.id);
  });

  it('never lands on a row the filter is hiding', () => {
    useEventStore.getState().ingest(event({ priority: 'low' }));
    const high = event({ priority: 'high' });
    useEventStore.getState().ingest(high);

    useEventStore.getState().toggleFilter('high');
    useEventStore.getState().moveSelection(1);
    useEventStore.getState().moveSelection(1);

    expect(useEventStore.getState().selectedId).toBe(high.id);
  });

  it('does nothing on an empty queue', () => {
    useEventStore.getState().moveSelection(1);
    expect(useEventStore.getState().selectedId).toBeNull();
  });
});

describe('decisions', () => {
  it('acknowledging takes the lock and writes the audit trail', () => {
    const incident = event();
    useEventStore.getState().ingest(incident);
    const before = incident.history.length;

    useEventStore.getState().acknowledge(incident.id);

    const after = useEventStore.getState().events[0]!;
    expect(after.status).toBe('acknowledged');
    expect(after.assignedTo).toBe(OPERATOR);
    expect(after.history).toHaveLength(before + 1);
    expect(after.history.at(-1)).toMatchObject({
      actor: OPERATOR,
      action: 'Acknowledged',
    });
  });

  it('acknowledging is idempotent — a second press does not re-lock', () => {
    const incident = event();
    useEventStore.getState().ingest(incident);
    useEventStore.getState().acknowledge(incident.id);
    const afterFirst = useEventStore.getState().events[0]!.history.length;

    useEventStore.getState().acknowledge(incident.id);

    expect(useEventStore.getState().events[0]!.history).toHaveLength(
      afterFirst,
    );
  });

  it('dispatching attaches a unit and an ETA', () => {
    const incident = event();
    useEventStore.getState().ingest(incident);
    useEventStore.getState().dispatchResponse(incident.id);

    const after = useEventStore.getState().events[0]!;
    expect(after.status).toBe('dispatched');
    expect(after.dispatch?.unit).toBeTruthy();
    expect(after.dispatch?.etaMinutes).toBeGreaterThan(0);
    expect(after.history.at(-1)?.action).toContain('Response dispatched');
  });

  it('dismissing records the reason and closes the detail pane', () => {
    const incident = event();
    useEventStore.getState().ingest(incident);
    useEventStore.getState().select(incident.id);

    useEventStore.getState().dismiss(incident.id, 'Shadow');

    const after = useEventStore.getState().events[0]!;
    expect(after.status).toBe('dismissed');
    expect(after.dismissal?.reason).toBe('Shadow');
    expect(after.history.at(-1)?.note).toBe('Shadow');
    expect(useEventStore.getState().selectedId).toBeNull();
  });

  it('undo restores the prior status, not merely "new"', () => {
    // Dismissing an acknowledged incident and undoing must give the operator
    // their incident back — still locked — rather than release it for anyone
    // to claim.
    const incident = event();
    useEventStore.getState().ingest(incident);
    useEventStore.getState().acknowledge(incident.id);
    useEventStore.getState().dismiss(incident.id, 'Camera artefact');

    useEventStore.getState().undoDismiss(incident.id);

    const after = useEventStore.getState().events[0]!;
    expect(after.status).toBe('acknowledged');
    expect(after.assignedTo).toBe(OPERATOR);
    expect(after.dismissal).toBeUndefined();
  });

  it('keeps a dismissed row visible for the undo window, then drops it', () => {
    const incident = event();
    useEventStore.getState().ingest(incident);
    useEventStore.getState().dismiss(incident.id, 'Spray');

    const at = Date.parse(useEventStore.getState().events[0]!.dismissal!.at);
    const state = useEventStore.getState();

    expect(selectLeavingEvents(state.events, at + 1000)).toHaveLength(1);
    expect(
      selectLeavingEvents(state.events, at + DISMISS_UNDO_MS + 1),
    ).toHaveLength(0);
    // And it is out of the open queue immediately either way.
    expect(selectQueueEvents(state)).toHaveLength(0);
  });
});

describe('derived state', () => {
  it('counts only open incidents, by priority', () => {
    useEventStore.getState().ingest(event({ priority: 'critical' }));
    useEventStore.getState().ingest(event({ priority: 'high' }));
    const gone = event({ priority: 'high' });
    useEventStore.getState().ingest(gone);
    useEventStore.getState().dismiss(gone.id, 'Shadow');

    expect(selectOpenCounts(useEventStore.getState())).toEqual({
      critical: 1,
      high: 1,
      medium: 0,
      low: 0,
    });
  });

  it('surfaces the unacknowledged critical, and retires it once acknowledged', () => {
    const urgent = critical();
    useEventStore.getState().ingest(urgent);
    expect(selectCriticalAlert(useEventStore.getState())?.id).toBe(urgent.id);

    useEventStore.getState().acknowledge(urgent.id);
    expect(selectCriticalAlert(useEventStore.getState())).toBeUndefined();
  });

  it('counts criticals waiting in the buffer', () => {
    const open = event();
    useEventStore.getState().ingest(open);
    useEventStore.getState().setScrolledAway(true);
    useEventStore.getState().ingest(event({ priority: 'medium' }));

    expect(selectBufferedCritical(useEventStore.getState())).toBe(0);
    expect(useEventStore.getState().buffered).toHaveLength(1);
  });

  it('breaches SLA only while still new, and only past the threshold', () => {
    const received = new Date('2026-01-01T00:00:00.000Z');
    const incident = event({
      priority: 'critical',
      status: 'new',
      receivedAt: received.toISOString(),
    });

    // Critical's threshold is 20s, matching Pass A's auto-escalation.
    expect(isBreachingSla(incident, received.getTime() + 19_000)).toBe(false);
    expect(isBreachingSla(incident, received.getTime() + 21_000)).toBe(true);
    // Acknowledging stops the breach: someone owns it now.
    expect(
      isBreachingSla(
        { ...incident, status: 'acknowledged' },
        received.getTime() + 60_000,
      ),
    ).toBe(false);
  });
});

describe('filters', () => {
  it('narrows the queue and clears back to everything', () => {
    useEventStore.getState().ingest(event({ priority: 'low' }));
    useEventStore.getState().ingest(event({ priority: 'critical' }));

    useEventStore.getState().toggleFilter('critical');
    expect(selectQueueEvents(useEventStore.getState())).toHaveLength(1);

    useEventStore.getState().toggleFilter('low');
    expect(selectQueueEvents(useEventStore.getState())).toHaveLength(2);

    useEventStore.getState().clearFilters();
    expect(selectQueueEvents(useEventStore.getState())).toHaveLength(2);
  });
});

describe('connection', () => {
  it('freezes the "as of" timestamp when it drops and clears it on recovery', () => {
    useEventStore.getState().setConnection('reconnecting');
    const frozen = useEventStore.getState().dataAsOf;
    expect(frozen).toBeTruthy();

    // Degrading further must not move the timestamp — it marks the moment
    // trust was lost, not the moment it got worse.
    useEventStore.getState().setConnection('offline');
    expect(useEventStore.getState().dataAsOf).toBe(frozen);

    useEventStore.getState().setConnection('live');
    expect(useEventStore.getState().dataAsOf).toBeNull();
  });
});
