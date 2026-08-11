# ADR-0004 — Instrumenting time to awareness and time to decision

**Status:** accepted
**Date:** 2026-08-11
**Roadmap:** #4

## Context

The README's design thesis argues from two numbers — time to awareness and time to decision — and
every implementation choice in six phases was justified against one of them. Neither was ever
measured. Pass A costs a critical at 96 seconds detection-to-dispatch with 62 of those in noticing
and orienting, "the two steps the design owns outright", and that claim has been asserted rather
than checked since phase 0.

Item #3 virtualises the queue next, which changes render behaviour. Without a before-reading,
"virtualisation made it faster" is an assertion too.

## The definition, which is the actual decision

Three marks per incident: **arrival** (`receivedAt`, already recorded), **seen**, **decided**.
Arrival and decided are unambiguous. Seen is not, and the number is meaningless without pinning it
down.

The phase brief's guidance is that selection is not awareness — "an operator can cursor past
something without reading it" — and to use first render of the detail pane instead.

**That separation does not exist in this design.** Pass A's keyboard model is "↑↓ moves _and
previews_": moving the cursor **is** the detail-pane render. There is no separate open step. Taking
first render literally would mark every row an operator scrolled through, and time to awareness
would measure scrolling speed.

So: **an incident counts as seen once it has held the detail pane continuously for 500ms.**

500ms because held-down arrow repeat fires roughly every 30ms, so walking a queue marks nothing,
while a considered look is comfortably longer than half a second. The threshold sits clear of both.
`e2e/metrics.spec.ts` asserts this in both directions — a worked incident is marked, and a queue
cursored through at key-repeat speed adds no samples.

**Decided is dispatch or dismiss, not acknowledge.** Acknowledging claims the incident and takes
the lock, which is the _start_ of deciding. Counting it would make the number measure how fast an
operator presses Enter.

## Where the marks live

On the existing audit trail, as history entries carrying a typed `mark` field. One timeline, and
the measurement reads a value that cannot drift when someone rewords a line — string-matching the
action prose would have been fragile in exactly the way audit prose invites.

The client marks optimistically, the way it already does every other action, and posts the same
entry to `POST /api/events/mark` so the buffered record carries it. Fire-and-forget: a dropped mark
costs one sample, and blocking an operator's keystroke on a metrics write would be the wrong trade
in a tool whose entire argument is response time.

Both marks are first-write-wins. An incident re-opened after a decision must not rewrite the moment
it was first looked at, and an undo-and-redo must not rewrite the decision.

`GET /api/metrics` returns p50 and p95 for both, over the replay buffer, as plain JSON. Nearest
rank, no interpolation: with a shift's worth of samples, interpolating invents precision the data
does not have, and a reported figure should be a value that actually happened. `n` is in the
response because a p95 over four samples is noise and the endpoint should say so rather than let a
reader assume otherwise.

## Baseline readings

Both taken before virtualisation, with `pnpm baseline`.

**The seeded 90-second scenario** — the acceptance case, with an operator working incidents as they
arrive:

|                   | n   | p50     | p95     |
| ----------------- | --- | ------- | ------- |
| Time to awareness | 3   | 1,327ms | 2,060ms |
| Time to decision  | 3   | 2,347ms | 2,655ms |

**A worked queue of 60 events, 20 decided** — the comparison figure for item #3, because
virtualisation is about queue depth and twelve rows would tell us nothing about four hundred:

|                   | n   | p50      | p95      |
| ----------------- | --- | -------- | -------- |
| Time to awareness | 20  | 31,302ms | 57,353ms |
| Time to decision  | 20  | 2,298ms  | 3,074ms  |

### What these numbers do and do not mean

Stated plainly, because they are misleading otherwise:

- **The dwell is scripted.** Both figures are dominated by the driver's `waitForTimeout`, not by an
  operator. This is a _comparison_ instrument — the same scripted pass before and after a change —
  not a measure of human performance.
- **Awareness in the second reading is queue backlog.** Sixty events arrive in a batch and are
  worked sequentially, so the twentieth waits nearly a minute to be looked at. That 31s p50 says
  nothing about UI responsiveness.
- **Time to decision is the figure item #3 must not regress.** It is the one dominated by how fast
  the queue responds once the operator is looking, so if virtualisation makes the UI slower it will
  show up there as growth beyond the scripted dwell. p50 **2,298ms** / p95 **3,074ms** is the
  number to beat.

## Consequences

The first baseline attempt was wrong and is worth recording. The driver always re-selected the
queue head, and a dispatched incident stays in the queue — so it pressed `d` 39 times across 3
distinct incidents and reported n=3 as though it were a sample. Switching the driver to dismiss,
which removes the row, made each pass land on a new incident. A measurement harness can be broken
in ways that still produce plausible-looking numbers, which is the same failure mode as a lint that
never fires.

Two things went onto the roadmap as a result:

- The marks are posted to the server but the client keeps its own copy, so the two can diverge —
  a browser that never posts still shows its own trail. Item #2 (ownership) makes the server
  authoritative and should fold this in.
- `/api/metrics` measures over one instance's buffer. Once #1 puts the events in Redis, the metrics
  should read from there or they will report per-instance figures behind a load balancer.
