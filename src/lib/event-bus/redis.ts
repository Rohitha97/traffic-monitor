import { createClient, type RedisClientType } from 'redis';

import { createMemoryBus } from '@/lib/event-bus/memory';
import {
  RETENTION,
  type BusEntry,
  type BusHealth,
  type ClaimNotice,
  type ClaimResult,
  type ClaimSubscriber,
  type EventBus,
  type Subscriber,
} from '@/lib/event-bus/types';
import { detectionEventSchema, type DetectionEvent } from '@/lib/schema';
import type { HistoryEntry } from '@/lib/schema';

/*
 * The same log, in Redis Streams.
 *
 * Streams already are this interface: `XADD` appends, `XRANGE` reads from a
 * cursor, `MAXLEN ~` bounds retention, and a stream ID is exactly the cursor
 * the SSE `Last-Event-ID` header wants to carry. Nothing here invents a second
 * ordering scheme on top.
 *
 * Two things do not come free, and both are deliberate:
 *
 *  - **Stream entries are immutable, and operator marks are not.** So the
 *    stream carries the event as published, and a per-incident key carries the
 *    amended copy. Reads take the key when it is there. The alternative —
 *    appending mark entries and folding them on read — turns every read into a
 *    replay of the whole window, to store something that is only ever a small
 *    correction to one record.
 *  - **The broker is allowed to be down.** Every operation falls back to an
 *    in-process bus rather than throwing. A monitoring dashboard that dies
 *    because its cache died is worse than one that forgets history.
 */

const STREAM_KEY = 'incidents';
const CLAIM_KEY = 'incident-claims';
const POSITION_KEY = 'positions';
const eventKey = (id: string) => `incident:${id}`;

/**
 * Claims are kept short.
 *
 * They exist to tell already-connected positions about a lock. A position that
 * reconnects gets the owner from the event record itself, so there is nothing
 * for a long claim history to serve.
 */
const CLAIM_RETENTION = 100;

/**
 * How long an amended copy outlives the window it belongs to.
 *
 * Generous on purpose: if the key expires while its stream entry is still
 * retained, a read falls back to the *unamended* copy and an operator's mark
 * quietly disappears. An hour is far longer than a hundred events take to age
 * out at any plausible rate.
 */
const EVENT_TTL_SECONDS = 3600;

/** A stream ID is `<millis>-<sequence>`. Anything else is not our cursor. */
const STREAM_ID = /^\d+-\d+$/;

/** Long enough to be a real attempt, short enough that a dead broker does not hang startup. */
const CONNECT_TIMEOUT_MS = 3000;

/** Blocking read window. Bounded rather than 0 so shutdown is not stuck in a syscall. */
const READ_BLOCK_MS = 5000;

/** Pause between connection attempts while the broker is unreachable. */
const RETRY_MS = 2000;

/*
 * Apply a mark to the stored copy, atomically.
 *
 * A transliteration of `applyMark` in types.ts, and it has to stay one: the
 * conformance suite runs the same assertions against both, which is what keeps
 * these two from drifting.
 *
 * Lua rather than read-modify-write in TypeScript, because that is a race, and
 * this project has already had one — the store dropped five events in twenty-one
 * before it was found. Two operators deciding the same incident in the same
 * moment is exactly the case the mark's idempotency exists to handle, so
 * implementing it non-atomically would defeat its own point.
 */
const MARK_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end

local event = cjson.decode(raw)
local mark, at, actor, action, reason = ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]

local history = event.history or {}
for i = 1, #history do
  if history[i].mark == mark then return 0 end
end

local entry = { at = at, actor = actor, action = action, mark = mark }
if reason ~= '' then entry.note = reason end
history[#history + 1] = entry
event.history = history

if reason ~= '' then
  event.status = 'dismissed'
  event.dismissal = { reason = reason, at = at }
end

redis.call('SET', KEYS[1], cjson.encode(event), 'KEEPTTL')
return 1
`;

/*
 * Compare-and-set the lock, atomically.
 *
 * The whole item is this script. Two positions pressing Enter in the same
 * moment is the failure Pass A names explicitly, and the only place it can be
 * arbitrated is where the record lives — so the read, the comparison and the
 * write have to be one operation the broker will not interleave.
 *
 * Returns the owner either way. `WATCH`/`MULTI` would also work and would mean
 * a retry loop in TypeScript for a conflict that is already decided; a script
 * settles it in one round trip and cannot livelock.
 *
 * Re-claiming an incident you already hold succeeds and writes nothing, so a
 * retried request never reports an operator as their own rival.
 */
const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return { 'missing', '' } end

local event = cjson.decode(raw)
local position, at = ARGV[1], ARGV[2]

if event.assignedTo then
  if event.assignedTo == position then return { 'held', position } end
  return { 'taken', event.assignedTo }
end

event.status = 'acknowledged'
event.assignedTo = position

local history = event.history or {}
history[#history + 1] = { at = at, actor = position, action = 'Acknowledged' }
event.history = history

redis.call('SET', KEYS[1], cjson.encode(event), 'KEEPTTL')
return { 'claimed', position }
`;

function parseEvent(raw: string): DetectionEvent | undefined {
  try {
    const parsed = detectionEventSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Connect, or give up quickly.
 *
 * node-redis retries forever by default, which is the right behaviour for a
 * running process and the wrong one for startup: a dashboard whose broker is
 * missing must come up degraded, not hang.
 */
async function connect(url: string): Promise<RedisClientType> {
  const client: RedisClientType = createClient({
    url,
    socket: { connectTimeout: CONNECT_TIMEOUT_MS, reconnectStrategy: 1000 },
  });

  // node-redis emits `error` on every reconnect attempt. Unhandled, that is an
  // uncaught exception that takes the process down — which is precisely the
  // failure mode this whole file exists to avoid.
  client.on('error', () => {});

  await client.connect();
  return client;
}

export async function createRedisBus(url: string): Promise<EventBus> {
  const subscribers = new Set<Subscriber>();
  const claimSubscribers = new Set<ClaimSubscriber>();

  /*
   * The fallback is a real bus, not a buffer of retries.
   *
   * While the broker is unreachable this instance keeps working on its own:
   * events published here are visible here, and are not shared with other
   * instances until the broker returns. That is the honest degradation — the
   * queue on screen stays live and stops being authoritative — and it is stated
   * in the README rather than discovered.
   */
  const fallback = createMemoryBus();
  fallback.subscribe((entry) => dispatch(entry));
  fallback.subscribeClaims((notice) => dispatchClaim(notice));

  let health: BusHealth = { kind: 'redis', degraded: false };
  let client: RedisClientType | undefined;
  let reader: RedisClientType | undefined;
  let closed = false;

  function dispatch(entry: BusEntry): void {
    for (const subscriber of subscribers) {
      try {
        subscriber(entry);
      } catch {
        subscribers.delete(subscriber);
      }
    }
  }

  function dispatchClaim(notice: ClaimNotice): void {
    for (const subscriber of claimSubscribers) {
      try {
        subscriber(notice);
      } catch {
        claimSubscribers.delete(subscriber);
      }
    }
  }

  function degrade(detail: string): void {
    if (!health.degraded) {
      console.error(
        `[event-bus] Redis unavailable, serving locally: ${detail}`,
      );
    }
    health = { kind: 'redis', degraded: true, detail };
  }

  function recover(): void {
    if (health.degraded) {
      console.info('[event-bus] Redis is answering again');
      health = { kind: 'redis', degraded: false };
    }
  }

  /**
   * Run a Redis operation, or fall back to the local bus.
   *
   * Every path through this file goes through here, so "the broker is down" is
   * handled in one place rather than being remembered at eight call sites.
   */
  async function attempt<T>(
    operation: (redis: RedisClientType) => Promise<T>,
    onFailure: () => Promise<T>,
  ): Promise<T> {
    if (!client) return onFailure();
    try {
      const result = await operation(client);
      recover();
      return result;
    } catch (error) {
      degrade(error instanceof Error ? error.message : String(error));
      return onFailure();
    }
  }

  /** Read the amended copies for a window, preferring them over the published ones. */
  async function withAmendments(
    redis: RedisClientType,
    published: BusEntry[],
  ): Promise<BusEntry[]> {
    if (published.length === 0) return [];

    const amended = await redis.mGet(
      published.map((entry) => eventKey(entry.event.id)),
    );

    return published.map((entry, index) => {
      const raw = amended[index];
      if (typeof raw !== 'string') return entry;
      const event = parseEvent(raw);
      return event ? { cursor: entry.cursor, event } : entry;
    });
  }

  function toEntries(
    messages: readonly { id: string; message: Record<string, string> }[],
  ): BusEntry[] {
    const entries: BusEntry[] = [];
    for (const { id, message } of messages) {
      const raw = message['e'];
      if (raw === undefined) continue;
      const event = parseEvent(raw);
      // A malformed entry is dropped rather than allowed to poison the queue an
      // operator is making dispatch decisions from.
      if (event) entries.push({ cursor: id, event });
    }
    return entries;
  }

  /*
   * Fan-out comes from the broker, never from `publish`.
   *
   * Every instance — including the one that published — learns about an event
   * by reading it back off the stream, so all of them see the same events in
   * the same order. Delivering locally at publish time as well would give the
   * publishing instance a different ordering from every other, and double the
   * event on the instance the operator happened to be connected to.
   */
  async function readLoop(from: string, claimsFrom: string): Promise<void> {
    // Both channels on one blocking read: two loops would mean two connections
    // and two independent reconnect states to keep straight.
    let cursor = from;
    let claimCursor = claimsFrom;

    while (!closed) {
      if (!reader) return;
      try {
        const reply = await reader.xRead(
          [
            { key: STREAM_KEY, id: cursor },
            { key: CLAIM_KEY, id: claimCursor },
          ],
          { BLOCK: READ_BLOCK_MS, COUNT: RETENTION },
        );
        recover();

        for (const stream of reply ?? []) {
          const messages = stream.messages as {
            id: string;
            message: Record<string, string>;
          }[];

          if (stream.name === CLAIM_KEY) {
            for (const { id, message } of messages) {
              claimCursor = id;
              const incident = message['id'];
              const owner = message['owner'];
              const at = message['at'];
              if (incident && owner && at) {
                dispatchClaim({ id: incident, owner, at });
              }
            }
            continue;
          }

          for (const entry of toEntries(messages)) {
            cursor = entry.cursor;
            dispatch(entry);
          }
        }
      } catch (error) {
        if (closed) return;
        degrade(error instanceof Error ? error.message : String(error));
        // The client reconnects underneath; this only paces the retry so a dead
        // broker does not become a busy loop.
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /**
   * Connect, and keep trying.
   *
   * "The broker is not up yet" and "the broker went away" have to have the same
   * outcome, or the dashboard's behaviour depends on container start order —
   * and a one-shot connect would mean a compose stack that came up in the wrong
   * sequence ran on the local fallback until someone restarted it. node-redis
   * reconnects on its own once connected; this covers the gap before that.
   */
  async function establish(): Promise<void> {
    while (!closed) {
      try {
        const primary = await connect(url);
        const secondary = primary.duplicate();
        secondary.on('error', () => {});
        await secondary.connect();

        client = primary;
        reader = secondary;
        recover();

        /*
         * Start from the stream's current end, resolved to a concrete ID —
         * never from `$`.
         *
         * `$` looks equivalent and is not: the server resolves it when the
         * XREAD *executes*, so anything published between connecting and that
         * first read is skipped. And because the cursor only advances on
         * delivery, the next read is still `$` and skips it again — the event
         * is in the stream, `readFrom` can see it, and live subscribers never
         * get it. A dropped incident that is present in the log if you go
         * looking is the worst shape this failure could take.
         *
         * Found by a conformance test that failed roughly one run in three,
         * which is exactly how wide that window is.
         */
        const [tail, claimTail] = await Promise.all([
          primary.xRevRange(STREAM_KEY, '+', '-', { COUNT: 1 }),
          primary.xRevRange(CLAIM_KEY, '+', '-', { COUNT: 1 }),
        ]);
        void readLoop(tail[0]?.id ?? '0-0', claimTail[0]?.id ?? '0-0');
        return;
      } catch (error) {
        degrade(error instanceof Error ? error.message : String(error));
        await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
      }
    }
  }

  /*
   * Awaited so a broker that is already up is connected before the first
   * request is served, but bounded so one that is not does not hold up
   * startup. Whichever way that race lands, `establish` carries on in the
   * background and the fallback covers the interval.
   */
  await Promise.race([
    establish(),
    new Promise((resolve) => setTimeout(resolve, CONNECT_TIMEOUT_MS)),
  ]);

  return {
    async publish(event: DetectionEvent): Promise<string> {
      return attempt(
        async (redis) => {
          const cursor = await redis.xAdd(
            STREAM_KEY,
            '*',
            { e: JSON.stringify(event) },
            {
              TRIM: {
                strategy: 'MAXLEN',
                strategyModifier: '~',
                threshold: RETENTION,
              },
            },
          );
          // The amended copy starts as the published one, so `recordMark` always
          // has a key to work on and never has to reconstruct from the stream.
          await redis.set(eventKey(event.id), JSON.stringify(event), {
            EX: EVENT_TTL_SECONDS,
          });
          return cursor;
        },
        () => fallback.publish(event),
      );
    },

    subscribe(subscriber: Subscriber): () => void {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },

    async readFrom(cursor: string | null): Promise<BusEntry[]> {
      return attempt(
        async (redis) => {
          /*
           * An unrecognisable cursor means a full resync, not an error. It is
           * what a client carries back after reconnecting to a different
           * instance, or after this one spent an outage on the local fallback
           * handing out its own cursors.
           */
          const start = cursor && STREAM_ID.test(cursor) ? `(${cursor}` : '-';
          const published = toEntries(
            (await redis.xRange(STREAM_KEY, start, '+')) as {
              id: string;
              message: Record<string, string>;
            }[],
          );
          return withAmendments(redis, published);
        },
        () => fallback.readFrom(cursor),
      );
    },

    async recordMark(
      id: string,
      mark: HistoryEntry['mark'],
      at: string,
      actor: string,
      action: string,
      dismissalReason?: string,
    ): Promise<boolean> {
      return attempt(
        async (redis) => {
          const result = await redis.eval(MARK_SCRIPT, {
            keys: [eventKey(id)],
            arguments: [
              mark ?? '',
              at,
              actor,
              action,
              // Lua has no undefined; empty string is "no reason given", which
              // the schema already forbids as a real reason (`min(1)`).
              dismissalReason ?? '',
            ],
          });
          return result === 1;
        },
        () => fallback.recordMark(id, mark, at, actor, action, dismissalReason),
      );
    },

    async claim(
      id: string,
      position: string,
      at: string,
    ): Promise<ClaimResult> {
      return attempt(
        async (redis) => {
          const reply = (await redis.eval(CLAIM_SCRIPT, {
            keys: [eventKey(id)],
            arguments: [position, at],
          })) as [string, string];

          const [outcome, owner] = reply;
          if (outcome === 'missing') return { ok: false, owner: null };
          if (outcome === 'taken') return { ok: false, owner };

          /*
           * The notice goes on its own stream so every *connected* position
           * sees the lock, not just the two that raced for it. Published after
           * the CAS settled, so a notice can never announce a claim that did
           * not happen.
           *
           * `held` skips it: re-claiming your own incident changed nothing and
           * has nothing to tell anyone.
           */
          if (outcome === 'claimed') {
            await redis.xAdd(
              CLAIM_KEY,
              '*',
              { id, owner, at },
              {
                TRIM: {
                  strategy: 'MAXLEN',
                  strategyModifier: '~',
                  threshold: CLAIM_RETENTION,
                },
              },
            );
          }

          // Read back rather than reconstruct: the script is the authority on
          // what the record now says, and guessing would be a second copy of
          // the rule.
          const raw = await redis.get(eventKey(id));
          const event = raw ? parseEvent(raw) : undefined;
          return event
            ? { ok: true as const, owner, event }
            : { ok: false as const, owner: null };
        },
        () => fallback.claim(id, position, at),
      );
    },

    subscribeClaims(subscriber: ClaimSubscriber): () => void {
      claimSubscribers.add(subscriber);
      return () => claimSubscribers.delete(subscriber);
    },

    async nextPosition(): Promise<string> {
      return attempt(
        async (redis) => String(await redis.incr(POSITION_KEY)),
        () => fallback.nextPosition(),
      );
    },

    subscriberCount: () => subscribers.size,

    health: () => health,

    async close(): Promise<void> {
      closed = true;
      subscribers.clear();
      claimSubscribers.clear();
      await Promise.allSettled([
        reader?.destroy(),
        client?.destroy(),
        fallback.close(),
      ]);
      reader = undefined;
      client = undefined;
    },
  };
}
