# Roadmap

Now / Next / Later. Items move out of Next as they ship, and implementing one is allowed to add
work to the list — a roadmap that is only ever written once is decoration.

Numbering is by priority, not by execution order. Phase 8 builds them in a different order and
[ADR-0001](adr/0001-phase-8-sequencing.md) says why.

---

## Now

Phase 8 — the Next block below.

## Next

### 2 · Server-side incident ownership

Acknowledging currently takes a lock in client state. Two positions can dispatch the same call —
the failure Pass A names explicitly — and only the server can actually prevent it. Needs a
compare-and-set on the event record, and the loser needs a specific rejection rendered on the row.

Blocked on identity. It does **not** need a full auth system; a position identity held in a cookie
is enough to make a lock meaningful.

### 7 · Snapshot filmstrip

Pass A note 2 asks for "a strip of frames either side of the trigger". Only the trigger frame is
shown today.

**Blocked.** This needs multiple timestamped frames per camera. Snapshots are currently one SVG per
_event type_ (`/snapshots/{type}.svg`) — a single frame, shared across every camera and every
incident of that type. Building a filmstrip on that would mean showing the same still five times, or
interpolating frames the detector never produced. See
[ADR-0002](adr/0002-filmstrip-blocked-on-frame-sources.md).

## Later

- **Real imagery.** Snapshots are committed SVG stills drawn in the design's own surface values.
  Real frames — or at least several per camera with source timestamps — would unblock #7 and make
  the evidence panel mean what it claims.
- **Multi-operator presence.** Beyond the lock in #2: seeing which positions are online and what
  each is looking at.
- **Persistence beyond the buffer.** #1 gives replay and fan-out; a shift log that survives a
  deployment is a different problem.
- **A supervisor view.** Pass A's auto-escalation "pushes to the supervisor position", which
  currently means an audit line and nothing else.

## Shipped

### 1 · Redis Streams behind the event bus — phase 8

`EVENT_BUS=redis` puts the log in Redis Streams; `memory` is the default and stays the default.
`XADD` appends, `XRANGE` reads from a cursor, `MAXLEN ~` bounds retention, and the SSE
`Last-Event-ID` now carries the bus cursor — a stream ID — rather than the event's own id, so a
reconnect is a range query instead of a search. A dashboard restart loses **0** events where the
memory bus loses all of them, and two instances behind a round-robin proxy return byte-identical
queues. [ADR-0007](adr/0007-redis-streams-behind-the-event-bus.md).

A broker that is down degrades rather than fails: every operation falls back to an in-process bus,
`/api/health` still returns `ok`, and the status bar shows `HISTORY LOCAL` — its own signal, not a
fourth connection state, because the feed really is live.

The conformance suite is the point of the exercise: 18 assertions run against both implementations,
and they caught a real bug. The reader started from `$`, which the server resolves when the XREAD
_executes_ — so an event published in the gap between connecting and that first read was skipped,
and skipped again on every subsequent read. Present in the stream, invisible to live subscribers.

Implementing it added three things to the list:

- **The mark rule now exists twice**, in TypeScript and in Lua. Only the conformance suite keeps
  them in step. A third backend should mean moving the rule somewhere both can call.
- **`/api/metrics` computes over one instance's read.** The window is shared now, but two instances
  asked at the same moment can still differ by whatever is in flight.
- **Amended copies live on a TTL beside the stream.** If the key expires while its stream entry is
  still retained, an operator's mark silently disappears from replay. An hour against a
  hundred-event window is not close, but it is a coupling between two retention policies that
  nothing currently checks.

### 6 · The reopen rule — phase 8

A dismissed incident that re-detects within three minutes returns as _new_, tagged "seen before" and
carrying the original reason on the row, so the operator does not make the same call twice.
Correlation is a pure function over the event buffer (`src/lib/correlation.ts`) rather than a
parallel index — which is also how the congestion-repeat rule's map turned out to be wrong: it kept
one timestamp per camera across every event type, so a debris call escalated the next congestion
detection. [ADR-0006](adr/0006-the-reopen-rule.md).

The part that would have shipped broken: nothing ever told the server an incident was dismissed.
`POST /api/events/mark` knew a call had been _decided_ and nothing more, so the rule would have
scanned a buffer with no dismissals in it and correctly found nothing, forever. The route now
carries the reason. Caught by the end-to-end test, not the unit tests — which all pass against a
rule that never fires.

Implementing it added two things to the list:

- **The audit entry's `note` is doing double duty as the dismissal reason.** Fine while there is one
  kind of note. #2 should give the action record a proper shape rather than growing a third meaning
  for the same string.
- **The seeded scenario now needs an operator for its last beat.** The tag records a decision, so
  there is nothing to demonstrate until one has been made. A fully scripted walkthrough would need
  the seed to act as an operator as well as a detector, which is a different thing pretending to be
  the same script — worth splitting into a separate demo driver if the walkthrough ever needs to run
  unattended.

### 3 · Virtualise the queue — phase 8

`@tanstack/react-virtual` around `QueueList`. 500 incidents keep `↑↓` at a median of ~14ms —
under one frame — with fewer than 50 rows mounted. The keyboard specs were **not touched**, which
was the brief's own test of whether the refactor changed behaviour.

Two things needed care beyond the wrapper: the selection is brought into view with `scrollToIndex`
rather than `scrollIntoView`, because past the first screenful the selected row is not mounted; and
a layout effect anchors the scroll offset when a critical prepends, or inserting at index 0 would
shift every row under the operator — breaking the guarantee buffering exists to protect, in a place
the original rule never had to consider.
[ADR-0005](adr/0005-virtualising-the-queue.md) has the before/after metrics.

Implementing it added one thing to the list:

- **Snapshot preloading still warms the whole queue, not the window.** Virtualisation did not
  change it: the effect iterates every queued incident, so 500 incidents warm 500 snapshots
  regardless of what is mounted. Harmless today only by accident — snapshots are one SVG per event
  type, so they resolve to six URLs the browser dedupes — but with real per-incident imagery it
  becomes 500 fetches to open one pane. Should follow the window plus a margin ahead of the
  selection. Prerequisite for #7.

### 4 · Instrument time-to-awareness and time-to-decision — phase 8

Three marks per incident on the existing audit trail — arrival, seen, decided — and
`GET /api/metrics` reporting p50 and p95 for both over the replay buffer. The definition of "seen"
was the real decision: in this design ↑↓ previews into the detail pane, so selection _is_ the
render, and an incident counts as seen only once it has held the pane for 500ms. Cursoring through
a queue marks nothing, which `e2e/metrics.spec.ts` asserts in both directions.
[ADR-0004](adr/0004-instrumenting-the-two-numbers.md) carries the baseline readings that #3 must
not regress.

Implementing it added two things to the list:

- **Marks are posted to the server but the client keeps its own copy**, so the two can diverge — a
  browser that never posts still shows its own trail. #2 makes the server authoritative and should
  fold this in.
- **`/api/metrics` measures one instance's buffer.** Once #1 puts events in Redis, metrics should
  read from there or they will report per-instance figures behind a load balancer.

### 5 · Visual regression against `/dev/states` — phase 8

26 states covered — 25 captured as images, and the collapsed critical band checked dimensionally
because it is zero-height by design and a photograph of it would pass whatever changed. Diffed in
CI in the pinned Playwright image so local and CI rasterise identically. `pnpm test:visual`
compares, `pnpm test:visual:update` regenerates, and the suite refuses to run outside Linux rather
than producing snapshots that can never match.

Implementing it added two things to the list:

- **The state matrix has no hover or focus state for buttons.** The queue row has both, because
  Pass C draws them; `Button` has hover and active tints carried forward from nocturne's
  conventions that nothing captures. They belong in the matrix, and therefore in the regression
  cover.
- **The dev page and the production app can drift.** `/dev/states` renders components with sample
  props; the app renders them from the store. A component could satisfy every snapshot and still be
  wired up wrongly. Worth a small set of captures against the real dashboard once #3 lands and the
  queue is virtualised.
