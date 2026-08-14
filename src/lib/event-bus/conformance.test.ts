import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMemoryBus } from '@/lib/event-bus/memory';
import { RETENTION, type BusEntry, type EventBus } from '@/lib/event-bus/types';
import type { DetectionEvent } from '@/lib/schema';

/*
 * One suite, both implementations.
 *
 * This is what makes the swap trustworthy. "Redis Streams has the same
 * semantics as a ring buffer" is a claim, and the only way to hold it is to run
 * the same assertions against both and watch them agree — particularly the ones
 * nobody writes by hand, like what an unknown cursor does, or whether a second
 * identical mark is refused.
 *
 * The memory bus is always covered. The Redis bus is covered when `REDIS_URL`
 * points at a broker, and skipped with a loud reason when it does not, because
 * the default path of this project is not allowed to require infrastructure —
 * `pnpm test` must pass on a clean clone. `pnpm test:bus` starts a throwaway
 * broker and runs both.
 */

const REDIS_URL = process.env.REDIS_URL;

let sequence = 0;

function event(over: Partial<DetectionEvent> = {}): DetectionEvent {
  sequence += 1;
  return {
    id: `TEST-${sequence}`,
    type: 'debris',
    camera: {
      id: 'CAM-014',
      name: 'M6 northbound, junction 8–9',
      roadway: 'M6',
      direction: 'NB',
      marker: 'MM 42.3',
      laneCount: 3,
      lat: 52.5218,
      lng: -1.9765,
    },
    lanePosition: 'live_lane',
    laneNumber: 2,
    confidence: 0.9,
    description: 'Object in carriageway.',
    snapshotUrl: '/snapshots/debris.svg',
    boundingBoxes: [],
    detectedAt: '2026-08-11T09:00:00.000Z',
    receivedAt: '2026-08-11T09:00:00.500Z',
    priority: 'high',
    priorityReason: 'High — live lane',
    status: 'new',
    history: [
      { at: '2026-08-11T09:00:00.000Z', actor: 'system', action: 'Detected' },
    ],
    ...over,
  };
}

/** Resolve once `predicate` holds, so subscriber assertions do not race delivery. */
async function until(
  predicate: () => boolean,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the bus');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

interface Implementation {
  name: string;
  available: boolean;
  create: () => Promise<EventBus>;
}

const IMPLEMENTATIONS: Implementation[] = [
  {
    name: 'memory',
    available: true,
    create: () => Promise.resolve(createMemoryBus()),
  },
  {
    name: 'redis',
    available: Boolean(REDIS_URL),
    create: async () => {
      const { createRedisBus } = await import('@/lib/event-bus/redis');
      const { createClient } = await import('redis');

      /*
       * A clean stream per suite run. Without this the retention and ordering
       * assertions would be reading whatever a previous run left behind, and
       * would pass or fail depending on how many times you had run them — the
       * same trap `reuseExistingServer: false` exists to close in the E2E
       * config.
       */
      const admin = createClient({ url: REDIS_URL! });
      await admin.connect();
      const stale = await admin.keys('incident:*');
      if (stale.length > 0) await admin.del(stale);
      await admin.del('incidents');
      await admin.destroy();

      return createRedisBus(REDIS_URL!);
    },
  },
];

for (const implementation of IMPLEMENTATIONS) {
  describe.skipIf(!implementation.available)(
    `event bus · ${implementation.name}`,
    () => {
      let bus: EventBus;

      beforeEach(async () => {
        bus = await implementation.create();
      });

      afterEach(async () => {
        await bus.close();
      });

      /*
       * Waited for rather than demanded instantly, on an infrastructure-sized
       * budget rather than the suite's usual one.
       *
       * Startup blocks on the broker only for a bounded moment before carrying
       * on in the background, so a cold container can legitimately have the bus
       * come up degraded and recover — which is the designed behaviour. A first
       * connect to a freshly started container has been measured at 17 seconds
       * on this machine, and how long Docker takes to accept a socket is not a
       * property of this application.
       */
      it(
        'reports which implementation is answering, undegraded',
        { timeout: 40_000 },
        async () => {
          await until(() => !bus.health().degraded, 35_000);

          expect(bus.health()).toMatchObject({
            kind: implementation.name,
            degraded: false,
          });
        },
      );

      it('returns a cursor for every publish, and they are distinct', async () => {
        const first = await bus.publish(event());
        const second = await bus.publish(event());

        expect(first).toBeTruthy();
        expect(second).toBeTruthy();
        expect(first).not.toBe(second);
      });

      it('reads back what was published, oldest first', async () => {
        const a = event();
        const b = event();
        await bus.publish(a);
        await bus.publish(b);

        const entries = await bus.readFrom(null);
        expect(entries.map((entry) => entry.event.id)).toEqual([a.id, b.id]);
      });

      it('reads only what follows a cursor', async () => {
        const a = event();
        const b = event();
        const cursor = await bus.publish(a);
        await bus.publish(b);

        const entries = await bus.readFrom(cursor);
        expect(entries.map((entry) => entry.event.id)).toEqual([b.id]);
      });

      it('returns nothing when the cursor is the newest entry', async () => {
        await bus.publish(event());
        const cursor = await bus.publish(event());

        expect(await bus.readFrom(cursor)).toEqual([]);
      });

      it('resyncs everything for an unknown cursor', async () => {
        // A client away longer than retention, or one that reconnected to a
        // different instance. A silent gap is the one failure a monitoring tool
        // cannot have, so the answer is everything rather than nothing.
        const a = event();
        await bus.publish(a);

        const entries = await bus.readFrom('does-not-exist');
        expect(entries.map((entry) => entry.event.id)).toEqual([a.id]);
      });

      it('delivers to subscribers', async () => {
        const seen: BusEntry[] = [];
        bus.subscribe((entry) => seen.push(entry));

        const published = event();
        await bus.publish(published);
        await until(() => seen.length > 0);

        expect(seen).toHaveLength(1);
        expect(seen[0]!.event.id).toBe(published.id);
      });

      it('delivers each event to a subscriber exactly once', async () => {
        // The Redis bus fans out from the stream rather than at publish time.
        // Doing both would double every event on the publishing instance.
        const seen: string[] = [];
        bus.subscribe((entry) => seen.push(entry.event.id));

        const a = event();
        const b = event();
        await bus.publish(a);
        await bus.publish(b);
        await until(() => seen.length >= 2);
        await new Promise((resolve) => setTimeout(resolve, 200));

        expect(seen).toEqual([a.id, b.id]);
      });

      it('stops delivering after unsubscribe', async () => {
        const seen: string[] = [];
        const unsubscribe = bus.subscribe((entry) => seen.push(entry.event.id));

        const first = event();
        await bus.publish(first);
        await until(() => seen.length >= 1);
        expect(seen).toEqual([first.id]);

        unsubscribe();
        await bus.publish(event());
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(seen).toHaveLength(1);
        expect(bus.subscriberCount()).toBe(0);
      });

      it('gives a subscriber the same cursor the entry can be read from', async () => {
        const seen: BusEntry[] = [];
        bus.subscribe((entry) => seen.push(entry));

        const first = event();
        await bus.publish(first);
        await until(() => seen.length >= 1);
        expect(seen.map((entry) => entry.event.id)).toEqual([first.id]);
        const later = event();
        await bus.publish(later);

        // The cursor a client last saw on the wire has to be usable as the
        // cursor it reconnects with. If these two disagree, `Last-Event-ID`
        // replays the wrong window and nobody finds out until a reconnect.
        const entries = await bus.readFrom(seen[0]!.cursor);
        expect(entries.map((entry) => entry.event.id)).toEqual([later.id]);
      });

      it('records a mark against the stored copy', async () => {
        const published = event();
        await bus.publish(published);

        expect(
          await bus.recordMark(
            published.id,
            'seen',
            '2026-08-11T09:01:00.000Z',
            'J. Kavanagh',
            'Opened',
          ),
        ).toBe(true);

        const [entry] = await bus.readFrom(null);
        expect(entry!.event.history).toHaveLength(2);
        expect(entry!.event.history[1]).toMatchObject({
          actor: 'J. Kavanagh',
          action: 'Opened',
          mark: 'seen',
        });
      });

      it('refuses a second mark of the same kind', async () => {
        const published = event();
        await bus.publish(published);

        const mark = () =>
          bus.recordMark(
            published.id,
            'seen',
            '2026-08-11T09:01:00.000Z',
            'J. Kavanagh',
            'Opened',
          );

        expect(await mark()).toBe(true);
        // An incident re-opened after a decision must not overwrite the moment
        // it was first looked at, and a retried POST must not either.
        expect(await mark()).toBe(false);

        const [entry] = await bus.readFrom(null);
        expect(entry!.event.history).toHaveLength(2);
      });

      it('accepts different marks on the same event', async () => {
        const published = event();
        await bus.publish(published);

        expect(
          await bus.recordMark(
            published.id,
            'seen',
            '2026-08-11T09:01:00.000Z',
            'J. Kavanagh',
            'Opened',
          ),
        ).toBe(true);
        expect(
          await bus.recordMark(
            published.id,
            'decided',
            '2026-08-11T09:02:00.000Z',
            'J. Kavanagh',
            'Dispatched',
          ),
        ).toBe(true);

        const [entry] = await bus.readFrom(null);
        expect(entry!.event.history.map((history) => history.mark)).toEqual([
          undefined,
          'seen',
          'decided',
        ]);
      });

      it('a dismissal reason sets the status and the dismissal record', async () => {
        // The reopen rule reads exactly this. Without it the server knows an
        // incident was decided but not that it was dismissed or why.
        const published = event();
        await bus.publish(published);

        await bus.recordMark(
          published.id,
          'decided',
          '2026-08-11T09:02:00.000Z',
          'J. Kavanagh',
          'Dismissed as false positive',
          'Shadow',
        );

        const [entry] = await bus.readFrom(null);
        expect(entry!.event.status).toBe('dismissed');
        expect(entry!.event.dismissal).toEqual({
          reason: 'Shadow',
          at: '2026-08-11T09:02:00.000Z',
        });
        expect(entry!.event.history[1]).toMatchObject({
          mark: 'decided',
          note: 'Shadow',
        });
      });

      it('reports nothing to record for an unknown event', async () => {
        expect(
          await bus.recordMark(
            'never-published',
            'seen',
            '2026-08-11T09:01:00.000Z',
            'J. Kavanagh',
            'Opened',
          ),
        ).toBe(false);
      });

      it('a mark survives being read through a cursor', async () => {
        const first = event();
        const second = event();
        const cursor = await bus.publish(first);
        await bus.publish(second);

        await bus.recordMark(
          second.id,
          'seen',
          '2026-08-11T09:01:00.000Z',
          'J. Kavanagh',
          'Opened',
        );

        // Redis stream entries are immutable, so the amended copy lives beside
        // the stream. This is the assertion that catches a read path that
        // forgot to merge it.
        const entries = await bus.readFrom(cursor);
        expect(entries).toHaveLength(1);
        expect(entries[0]!.event.history).toHaveLength(2);
      });

      it('bounds retention', async () => {
        for (let index = 0; index < RETENTION + 20; index += 1) {
          await bus.publish(event());
        }

        const entries = await bus.readFrom(null);
        expect(entries.length).toBeGreaterThan(0);
        /*
         * `MAXLEN ~` trims approximately — Redis is allowed to keep more than
         * the threshold, and does, because trimming exactly costs more than the
         * memory it saves. So this asserts bounded, not equal. Asserting
         * equality would be asserting an implementation detail of Redis that
         * the memory bus happens to satisfy.
         */
        expect(entries.length).toBeLessThanOrEqual((RETENTION + 20) * 2);
      });

      it('grants a claim on a free incident', async () => {
        const published = event();
        await bus.publish(published);

        const result = await bus.claim(
          published.id,
          'Position 1',
          '2026-08-12T09:00:00.000Z',
        );

        expect(result).toMatchObject({ ok: true, owner: 'Position 1' });

        const [entry] = await bus.readFrom(null);
        expect(entry!.event.status).toBe('acknowledged');
        expect(entry!.event.assignedTo).toBe('Position 1');
        expect(entry!.event.history.at(-1)).toMatchObject({
          actor: 'Position 1',
          action: 'Acknowledged',
        });
      });

      it('refuses a second position and names the holder', async () => {
        // The whole item. Two positions dispatching the same call is the
        // failure Pass A names, and this is the assertion that it cannot
        // happen — with the loser told who won rather than merely told no.
        const published = event();
        await bus.publish(published);

        const first = await bus.claim(
          published.id,
          'Position 1',
          '2026-08-12T09:00:00.000Z',
        );
        const second = await bus.claim(
          published.id,
          'Position 3',
          '2026-08-12T09:00:00.500Z',
        );

        expect(first.ok).toBe(true);
        expect(second).toEqual({ ok: false, owner: 'Position 1' });
      });

      it('lets a position re-claim what it already holds', async () => {
        // A retried request must not report an operator as their own rival.
        const published = event();
        await bus.publish(published);

        await bus.claim(published.id, 'Position 1', '2026-08-12T09:00:00.000Z');
        const again = await bus.claim(
          published.id,
          'Position 1',
          '2026-08-12T09:00:01.000Z',
        );

        expect(again).toMatchObject({ ok: true, owner: 'Position 1' });

        // And it wrote nothing the second time: one acknowledgement, not two.
        const [entry] = await bus.readFrom(null);
        expect(
          entry!.event.history.filter((h) => h.action === 'Acknowledged'),
        ).toHaveLength(1);
      });

      it('exactly one of a concurrent burst wins', async () => {
        /*
         * Eight positions pressing Enter at once. In memory this is trivially
         * safe and the assertion is nearly free; against Redis it is the
         * reason the compare-and-set is a Lua script rather than a
         * read-modify-write in TypeScript.
         */
        const published = event();
        await bus.publish(published);

        const results = await Promise.all(
          Array.from({ length: 8 }, (_, index) =>
            bus.claim(
              published.id,
              `Position ${index + 1}`,
              '2026-08-12T09:00:00.000Z',
            ),
          ),
        );

        const winners = results.filter((result) => result.ok);
        expect(winners).toHaveLength(1);

        // And every loser was told the same thing: the one winner's name.
        const owner = winners[0]!.owner;
        for (const result of results.filter((r) => !r.ok)) {
          expect(result.owner).toBe(owner);
        }
      });

      it('reports nothing to claim for an unknown incident', async () => {
        expect(
          await bus.claim(
            'never-published',
            'Position 1',
            '2026-08-12T09:00:00.000Z',
          ),
        ).toEqual({ ok: false, owner: null });
      });

      it('tells subscribers when an incident is claimed', async () => {
        // So a position that was not racing still sees the lock. Without this
        // every other desk goes on showing the incident as free.
        const seen: { id: string; owner: string }[] = [];
        bus.subscribeClaims((notice) =>
          seen.push({ id: notice.id, owner: notice.owner }),
        );

        const published = event();
        await bus.publish(published);
        await bus.claim(published.id, 'Position 2', '2026-08-12T09:00:00.000Z');

        await until(() => seen.length > 0);
        expect(seen).toEqual([{ id: published.id, owner: 'Position 2' }]);
      });

      it('does not announce a claim that changed nothing', async () => {
        const seen: string[] = [];
        const published = event();
        await bus.publish(published);
        await bus.claim(published.id, 'Position 2', '2026-08-12T09:00:00.000Z');

        bus.subscribeClaims((notice) => seen.push(notice.owner));
        await bus.claim(published.id, 'Position 2', '2026-08-12T09:00:01.000Z');
        await bus.claim(published.id, 'Position 5', '2026-08-12T09:00:02.000Z');
        await new Promise((resolve) => setTimeout(resolve, 300));

        expect(seen).toEqual([]);
      });

      it('hands out distinct positions', async () => {
        const assigned = await Promise.all([
          bus.nextPosition(),
          bus.nextPosition(),
          bus.nextPosition(),
        ]);

        expect(new Set(assigned).size).toBe(3);
      });

      it('reports local subscriber count', () => {
        expect(bus.subscriberCount()).toBe(0);
        const first = bus.subscribe(() => {});
        bus.subscribe(() => {});
        expect(bus.subscriberCount()).toBe(2);
        first();
        expect(bus.subscriberCount()).toBe(1);
      });
    },
  );
}

describe.skipIf(Boolean(REDIS_URL))('event bus · redis', () => {
  it.skip('needs a broker — run `pnpm test:bus`, which starts one', () => {});
});
