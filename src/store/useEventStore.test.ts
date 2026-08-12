import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

/*
 * Acknowledging is the one action the server decides, so the store's job
 * changed with it: `acknowledge` now *asks*, and `applyClaim` is what actually
 * takes the incident. These tests follow that split rather than pretending the
 * old synchronous contract still holds — the lock is only worth anything if the
 * client cannot grant it to itself.
 */
describe('claiming', () => {
  /**
   * Answer the claim request with whatever the server would have said.
   *
   * Stubbed rather than skipped: the branch worth testing is the one where the
   * answer is *no*, and a store that never issues the request cannot have it.
   */
  function answerWith(
    status: number,
    body: Record<string, unknown>,
  ): ReturnType<typeof vi.fn> {
    const stub = vi.fn(() =>
      Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      }),
    );
    vi.stubGlobal('fetch', stub);
    return stub;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('acknowledging marks the row pending rather than taking it', () => {
    answerWith(200, { ok: true, owner: 'Position 1' });
    const incident = event();
    useEventStore.getState().ingest(incident);

    useEventStore.getState().acknowledge(incident.id);

    // Synchronously after the keystroke, before the server has answered.
    expect(useEventStore.getState().claims[incident.id]).toEqual({
      state: 'pending',
    });
    // Crucially *not* acknowledged: nothing has been granted yet.
    expect(useEventStore.getState().events[0]!.status).toBe('new');
  });

  it('a granted request resolves to the lock', async () => {
    answerWith(200, { ok: true, owner: 'Position 4' });
    const incident = event();
    useEventStore.getState().ingest(incident);

    useEventStore.getState().acknowledge(incident.id);
    await vi.waitFor(() =>
      expect(useEventStore.getState().events[0]!.status).toBe('acknowledged'),
    );

    expect(useEventStore.getState().events[0]!.assignedTo).toBe('Position 4');
    expect(useEventStore.getState().claims[incident.id]).toBeUndefined();
  });

  it('a 409 resolves to a refusal naming the position that won', async () => {
    answerWith(409, { ok: false, reason: 'taken', owner: 'Position 3' });
    const incident = event();
    useEventStore.getState().ingest(incident);

    useEventStore.getState().acknowledge(incident.id);
    await vi.waitFor(() =>
      expect(useEventStore.getState().claims[incident.id]).toEqual({
        state: 'rejected',
        by: 'Position 3',
      }),
    );
  });

  it('a failed request rolls back without inventing a rival', async () => {
    // "The request did not arrive" is not "somebody else has it", and telling
    // an operator the wrong one of those is worse than telling them neither.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    const incident = event();
    useEventStore.getState().ingest(incident);

    useEventStore.getState().acknowledge(incident.id);
    await vi.waitFor(() =>
      expect(useEventStore.getState().claims[incident.id]).toBeUndefined(),
    );

    const after = useEventStore.getState().events[0]!;
    expect(after.status).toBe('new');
    expect(after.assignedTo).toBeUndefined();
  });

  it('a granted claim takes the lock and writes the audit trail', () => {
    const incident = event();
    useEventStore.getState().ingest(incident);
    const before = incident.history.length;

    useEventStore
      .getState()
      .applyClaim(incident.id, 'Position 2', '2026-08-12T09:00:00.000Z');

    const after = useEventStore.getState().events[0]!;
    expect(after.status).toBe('acknowledged');
    expect(after.assignedTo).toBe('Position 2');
    expect(after.history).toHaveLength(before + 1);
    expect(after.history.at(-1)).toMatchObject({
      actor: 'Position 2',
      action: 'Acknowledged',
    });
    // The pending marker clears once the answer is in.
    expect(useEventStore.getState().claims[incident.id]).toBeUndefined();
  });

  it('a refused claim leaves the incident alone and names the holder', () => {
    const incident = event();
    useEventStore.getState().ingest(incident);
    const before = incident.history.length;

    useEventStore.getState().rejectClaim(incident.id, 'Position 3');

    expect(useEventStore.getState().claims[incident.id]).toEqual({
      state: 'rejected',
      by: 'Position 3',
    });

    const after = useEventStore.getState().events[0]!;
    // The owner is recorded even though this position lost: the refusal is
    // transient and the lock is not, so the row must keep showing who has it
    // after the operator has read the rejection and moved on.
    expect(after.assignedTo).toBe('Position 3');
    // No audit entry — this position did not do anything to the incident.
    expect(after.history).toHaveLength(before);
  });

  it('a claim that arrives for an incident somebody already holds is ignored', () => {
    // Two notices for the same incident, or a notice racing a resync. The
    // first owner wins, or the lock would not be a lock.
    const incident = event();
    useEventStore.getState().ingest(incident);

    useEventStore
      .getState()
      .applyClaim(incident.id, 'Position 2', '2026-08-12T09:00:00.000Z');
    useEventStore
      .getState()
      .applyClaim(incident.id, 'Position 5', '2026-08-12T09:00:01.000Z');

    expect(useEventStore.getState().events[0]!.assignedTo).toBe('Position 2');
  });

  it('does not stack requests behind a repeated keypress', () => {
    const incident = event();
    useEventStore.getState().ingest(incident);

    useEventStore.getState().acknowledge(incident.id);
    useEventStore.getState().acknowledge(incident.id);

    expect(useEventStore.getState().claims[incident.id]).toEqual({
      state: 'pending',
    });
    expect(useEventStore.getState().events[0]!.history).toHaveLength(
      incident.history.length,
    );
  });

  it('will not claim an incident that is already owned', () => {
    const incident = event();
    useEventStore.getState().ingest(incident);
    useEventStore
      .getState()
      .applyClaim(incident.id, 'Position 2', '2026-08-12T09:00:00.000Z');

    useEventStore.getState().acknowledge(incident.id);

    expect(useEventStore.getState().claims[incident.id]).toBeUndefined();
  });
});

describe('decisions', () => {
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
    useEventStore
      .getState()
      .applyClaim(incident.id, OPERATOR, '2026-08-12T09:00:00.000Z');
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

    useEventStore
      .getState()
      .applyClaim(urgent.id, OPERATOR, '2026-08-12T09:00:00.000Z');
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

describe('auto-escalation', () => {
  const overdue = (secondsAgo: number) =>
    event({
      priority: 'critical',
      status: 'new',
      receivedAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
    });

  it('re-fires an unacknowledged critical past 20s, and writes why', () => {
    const incident = overdue(25);
    useEventStore.getState().ingest(incident);

    useEventStore.getState().escalateOverdue(Date.now());

    const after = useEventStore.getState().events[0]!;
    expect(useEventStore.getState().escalations).toBe(1);
    expect(after.history.at(-1)).toMatchObject({
      actor: 'system',
      action: 'Unacknowledged 20s — banner re-fired, pushed to supervisor',
    });
  });

  it('escalates each incident only once, however often the tick runs', () => {
    // The audit entry *is* the record of having escalated, so there is no
    // parallel flag that could fall out of sync with it.
    useEventStore.getState().ingest(overdue(25));

    for (let i = 0; i < 5; i += 1) {
      useEventStore.getState().escalateOverdue(Date.now());
    }

    expect(useEventStore.getState().escalations).toBe(1);
  });

  it('leaves a critical alone before the threshold', () => {
    useEventStore.getState().ingest(overdue(10));
    useEventStore.getState().escalateOverdue(Date.now());
    expect(useEventStore.getState().escalations).toBe(0);
  });

  it('does not escalate once acknowledged — someone owns it', () => {
    const incident = overdue(25);
    useEventStore.getState().ingest(incident);
    useEventStore
      .getState()
      .applyClaim(incident.id, OPERATOR, '2026-08-12T09:00:00.000Z');

    useEventStore.getState().escalateOverdue(Date.now());

    expect(useEventStore.getState().escalations).toBe(0);
  });

  it('does not escalate lower priorities on the critical threshold', () => {
    useEventStore.getState().ingest(
      event({
        priority: 'high',
        status: 'new',
        receivedAt: new Date(Date.now() - 30_000).toISOString(),
      }),
    );

    useEventStore.getState().escalateOverdue(Date.now());

    expect(useEventStore.getState().escalations).toBe(0);
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
