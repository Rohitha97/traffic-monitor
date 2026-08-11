# Roadmap

Now / Next / Later. Items move out of Next as they ship, and implementing one is allowed to add
work to the list — a roadmap that is only ever written once is decoration.

Numbering is by priority, not by execution order. Phase 8 builds them in a different order and
[ADR-0001](adr/0001-phase-8-sequencing.md) says why.

---

## Now

Phase 8 — the Next block below.

## Next

### 1 · Redis Streams behind the event bus

The in-memory ring buffer does not survive a restart and is not shared between instances.
`src/lib/event-bus.ts` already has exactly the semantics Redis Streams provides — append,
read-from-offset, bounded retention — so this is a swap behind an existing interface rather than a
redesign. The SSE `Last-Event-ID` cursor maps onto a stream ID directly.

The ring buffer stays the default. `docker compose up` must never require a broker.

### 2 · Server-side incident ownership

Acknowledging currently takes a lock in client state. Two positions can dispatch the same call —
the failure Pass A names explicitly — and only the server can actually prevent it. Needs a
compare-and-set on the event record, and the loser needs a specific rejection rendered on the row.

Blocked on identity. It does **not** need a full auth system; a position identity held in a cookie
is enough to make a lock meaningful.

### 3 · Virtualise the queue

Twelve rows is the design target, but a bad hour is hundreds. `IncidentRow` is fixed-height and
every age counter already reads one shared tick, so windowing is a wrapper rather than a rewrite.
The risk is entirely in the keyboard path: `↑↓` must move through rows that are not mounted.

### 6 · The reopen rule

Pass A specifies that a dismissed incident re-detecting within three minutes returns tagged "seen
before", carrying the earlier dismissal reason, so the operator does not re-litigate a call already
made. The schema carries `seenBefore` and `dismissal`; only the correlation logic is missing.

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
