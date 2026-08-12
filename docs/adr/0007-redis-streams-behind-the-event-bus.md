# ADR-0007 — Redis Streams behind the event bus

**Status:** accepted
**Date:** 2026-08-12
**Roadmap:** #1

## Context

`src/lib/event-bus.ts` was a ring buffer and a set of callbacks in one process. Two consequences,
both stated in the README rather than hidden: it does not survive a restart, and it is not shared
between instances. Two dashboards behind a load balancer showed two different queues.

The swap is small because the semantics already matched. Append, read from a cursor, bounded
retention — that is a ring buffer, and it is also `XADD` / `XRANGE` / `MAXLEN ~`. Nothing here
invents an abstraction to make Redis fit; the abstraction was the shape the code already had.

The constraint that shaped every decision below is phase 8's standing rule: **`docker compose up`
with no broker must keep working.** Redis is an option, not a migration.

## Decisions

### The default is memory, and the default is not a fallback

`EVENT_BUS=memory` unless told otherwise. `pnpm dev`, `pnpm test`, `docker compose up` and the whole
E2E suite run with no broker, and `docker compose config --services` on the plain command lists
exactly `dashboard` and `detector-sim` — Redis is behind a profile, so it is absent from the graph
rather than merely unused.

There is deliberately **no `depends_on: redis`** on the dashboard. A dependency edge would pull the
service into the default graph, and the guarantee is stronger if the default path cannot mention a
broker at all.

The distinction matters for how degradation is reported, too. The memory bus is never "degraded" —
it is the design. Only a configured-but-unreachable broker is.

### The interface is async, including in memory

Every method returns a promise, even the ring buffer's, whose answers are always immediately
available. A synchronous interface would have made the memory implementation the shape of the
contract and Redis the exception, and every caller would have needed rewriting the day a broker
appeared. Four route handlers gained `await` and nothing else changed.

### The SSE cursor is the bus cursor, not the event id

This is the one change visible outside the bus. The stream's `id:` field used to carry
`event.id`, so a reconnect meant searching the buffer for a value. It now carries the bus's own
position — a Redis stream ID, or a zero-padded sequence number in memory — and a reconnect is a
range query.

The brief asked for the `Last-Event-ID` mapping to be kept rather than a second cursor scheme
invented, and this is what that means in practice: ordering is the log's business, and the event id
was never the log's idea of a position.

### Stream entries are immutable; operator marks are not

`recordMark` mutates. Stream entries cannot be edited. So the stream carries the event as published,
and a per-incident key (`incident:<id>`, one hour TTL) carries the amended copy. Reads `XRANGE` the
window, then `MGET` the amendment keys and prefer them.

The alternative — appending mark entries to the stream and folding them on read — turns every read
into a replay of the whole window, to store something that is only ever a small correction to one
record. The cost of the chosen shape is one extra round trip per read and a TTL that must outlive
retention; if the key expires while its stream entry is still retained, a read silently falls back
to the unamended copy and an operator's mark disappears. An hour against a hundred-event window is
not a close call, but it is the thing to watch.

### The mark is applied by a Lua script, not a read-modify-write

Two operators deciding the same incident in the same moment is precisely the case a mark's
idempotency exists to handle, so implementing it non-atomically would defeat its own point. This
project has already paid for one read-modify-write race — the store dropped five events in
twenty-one before it was found.

The script is a transliteration of `applyMark` in `types.ts`, which the memory bus calls directly.
Two implementations of one rule is a drift risk, and the conformance suite is what holds them
together.

### Fan-out comes from the broker, never from `publish`

Every instance — including the one that published — learns about an event by reading it back off
the stream. Delivering locally at publish time as well would give the publishing instance a
different ordering from every other, and double the event on whichever instance the operator
happened to be connected to. The conformance suite asserts exactly-once delivery for this reason.

### A dead broker degrades; it does not fail

Every operation routes through one `attempt` helper: try Redis, and on any error log once, mark the
bus degraded, and serve from an in-process fallback. Connection failure at startup is retried in the
background rather than being terminal, so "the broker is not up yet" and "the broker went away" have
the same outcome — otherwise the dashboard's behaviour would depend on container start order.

`/api/health` reports the bus state and **deliberately still returns `ok`**. If it went unhealthy on
a Redis outage, compose and any orchestrator above it would restart a process that was working,
turning a cache failure into an outage — the exact inversion the fallback exists to prevent.

The honest description of the degraded state is not "reconnecting" but "this instance is on its
own": events published during an outage are visible here and are not shared until the broker
returns. That is in the README.

### Degradation is its own signal, not a fourth connection state

The brief asked for degraded state in the connection indicator. It is rendered there — and
deliberately not as a connection state.

The three states (`live` / `reconnecting` / `offline`) describe the browser's link to the server,
and that link is _fine_ when a broker is down: incidents keep arriving. Showing "reconnecting" would
be a false alarm about the one thing the status bar exists to be trusted about. So the indicator
gains a separate `HISTORY LOCAL` tag, in a word rather than a colour — Pass B's rule is that "a
glance must never confuse 'connection degraded' with 'high priority'", and a second hue competing
with the priority ramp is what that rules out. It borrows the SLA badge's treatment, the frame's own
pattern for "something here is not nominal".

It renders only when a broker was configured and is not answering. In the default deployment nothing
appears, because one instance is not a degraded two.

## Verification

**A conformance suite, 18 assertions, run against both implementations.** This is what makes the
swap trustworthy: "Redis Streams has the same semantics as a ring buffer" is a claim, and the way to
hold it is to run identical assertions against both and watch them agree — especially on the parts
nobody writes by hand, like what an unknown cursor does, or whether a second identical mark is
refused.

`pnpm test` covers the memory bus and skips the Redis half with a stated reason, because a clean
clone must be able to run the tests. `pnpm test:bus` starts a throwaway broker, runs both, and takes
it away again.

**A real bug, found by the suite being flaky.** The reader started from `$`, which looks equivalent
to "the end of the stream" and is not: the server resolves `$` when the XREAD _executes_, so
anything published between connecting and that first read is skipped — and because the cursor only
advances on delivery, the next read is still `$` and skips it again. The event sits in the stream,
`readFrom` can see it, and live subscribers never get it. A dropped incident that is present in the
log if you go looking is about the worst shape that failure could take.

It surfaced as two or three subscriber tests failing per run, a different set each time. Fixed by
resolving the stream tail to a concrete ID with `XREVRANGE` before the loop starts. Five consecutive
clean runs after, against two to four failures per run before.

**`docker compose up` with no broker:** `dashboard` and `detector-sim` only, healthy,
`{"kind":"memory","degraded":false}`, and no bus log output at all.

**Done-when 1 — a dashboard restart loses no events.** 37 events before `docker compose restart
dashboard`, 37 after, **0 lost**. The same script against the default memory stack lost **2 of 2**,
which is what makes the first number mean something.

**Done-when 2 — two instances behind a round-robin proxy show the same queue.** An event posted to
instance A only, then both instances' streams read directly: identical count (32), identical SHA-1
of the full ordered id list (`402c553029d0`), identical first and last cursors, and the A-only event
present on B. The cursors are Redis stream IDs, which is the `Last-Event-ID` mapping visible on the
wire.

**Degradation, end to end.** With the broker stopped under a running dashboard: `/api/health` stays
`ok` with `degraded: true` and a detail string, ingest still succeeds, and the SSE handshake reports
`"history":"local"`. Starting the broker again returns it to `"history":"shared"` with no restart.

**Everything else:** 94 unit tests, 19 behaviour specs, 29 visual captures (the new
`status-bar/history-local` state included), typecheck, lint, build.

## Consequences

- **`/api/metrics` still measures one instance's view.** With Redis the window is now shared, so the
  figures are no longer per-instance — but the route still computes over whatever that instance
  reads, and two instances asked at the same moment can differ by whatever is in flight. Good
  enough for the question it answers; worth stating rather than implying.
- **A dependency the stack table did not list.** `redis` (node-redis). The brief's rule is not to
  substitute without asking, and this is an addition the phase brief asked for by name. Speaking
  RESP over a socket by hand would have been the worse answer.
- **Two implementations of the mark rule**, one in TypeScript and one in Lua. The conformance suite
  is the only thing keeping them honest. If a third storage backend ever appears, the rule should
  move somewhere both can call.
- **The Redis bus has no persistence.** `--save '' --appendonly no`: retention is bounded by
  `MAXLEN` anyway, and losing the buffer when the _broker_ restarts is the same outcome the memory
  bus has when the _dashboard_ restarts. What this option buys is surviving a dashboard restart and
  sharing across instances, and neither needs an AOF.
