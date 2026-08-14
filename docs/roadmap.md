# Roadmap

Now / Next / Later. Items move out of Next as they ship, and implementing one is allowed to add
work to the list — a roadmap that is only ever written once is decoration.

Numbering is by priority, not by execution order. Phase 8 builds them in a different order and
[ADR-0001](adr/0001-phase-8-sequencing.md) says why.

---

## Now

**#7, the snapshot filmstrip.** It was blocked on real frames; real frames have landed, and it is now
the only item with everything it needs sitting there unused.

Each camera has 20 timestamped stills and the manifest records the source second of each, which is
exactly what [ADR-0002](adr/0002-filmstrip-blocked-on-frame-sources.md) said the filmstrip was
missing. Picking the five nearest a trigger offset is now a lookup rather than a fabrication.

Do #15 first or alongside: snapshot preloading still warms every queued incident rather than the
rendered window, and it stopped being harmless the moment the six shared SVGs became per-camera JPEGs.

## Next

### 8 · Hand an incident back

Acknowledging takes the lock and nothing releases it. That is deliberate — an incident does not
become unowned because an operator walked away, and a timeout nobody sees fire would be worse than
no release at all — but it means a position that claims something by mistake, or goes off shift
holding it, has no way to give it up. Needs an action and a supervisor override, both of which want
#9 underneath them.

### 9 · Real authentication

[ADR-0008](adr/0008-position-identity-and-the-ownership-lock.md) records why this was deliberately
not built to unblock ownership: a lock needs to know which desk is asking, not who the person is. A
position identity is a cookie and is not proof of anything, which is honest for an internal tool on
an internal network and not sufficient for anything else. This is the clean addition that decision
left room for, and it would also let positions be bound to workstations rather than counted upward
forever.

### 10 · `priorityReason` is English in both locales

The most prominent line in the detail pane — "Critical — vehicle against traffic flow, live lane 2
of 3" — is derived server-side by `derivePriority` as English prose and stored on the event. It
cannot be translated where it sits: one string is computed once for an event that several positions
read, and those positions may be in different languages.

Localising it means `derivePriority` returns a **key and parameters** rather than a sentence, which
changes the event contract, the ingest route, the generator, the schema, twenty priority tests and
three components. A phase-8-sized item, not a vocabulary one, and doing it badly — a lookup from
English sentences to Japanese ones — would be worse than leaving it.
[ADR-0012](adr/0012-japanese-domain-vocabulary.md).

The same applies, smaller, to the audit trail's `action` strings.

### 11 · A native speaker has not reviewed the Japanese

Phase 9's terminology is researched and internally consistent, and the terms most likely to be wrong
are flagged in [ADR-0012](adr/0012-japanese-domain-vocabulary.md) — but researched is not reviewed,
and terminology is where a confident non-speaker produces something plausible and wrong.

The highest-value hour anyone with Japanese road-operations experience could spend on this codebase.

### 12 · The lane model cannot express 走行 / 追越

Japanese expressway operations distinguishes 走行車線 (cruising lane) from 追越車線 (overtaking
lane). The schema has `laneNumber` but no lane _role_, so it cannot say which a lane is — 走行車線 is
used for "live lane" and is slightly over-specific. A schema change, not a translation one.

### 13 · An intermittent failure in `journey.spec.ts`

`a critical event arrives, is reviewed, and a response is dispatched` fails perhaps one full-suite
run in three, on `toHaveTitle(/^\(\d+\) CRITICAL · Incident Monitor$/)` — the title stays at rest
while the assertion immediately before it, that the pinned banner shows the critical, has already
passed. Both read the same store, so a banner with content and a count of zero should not be
possible.

Observed during phase 9 workstream C and **not caused by it**: the same failure reproduces with that
workstream stashed. It does not reproduce when `journey.spec.ts` runs alone (3/3), nor with only the
specs that precede it in the suite (accessibility, ime), which is what makes it awkward — the
condition needs the whole run.

Ruled out so far: the favicon draw blocking the title (the title is assigned first), and the IME
spec as the polluter. Worth a trace capture on a failing run rather than more guessing.

### 14 · Modifiers on the destructive shortcuts — a decision, not an omission

`D` opens a dispatch confirmation and `X` a dismissal reason picker, both on a single unmodified
keypress. [ADR-0010](adr/0010-ime-composition-and-single-key-shortcuts.md) raises whether they
should require a modifier in all locales and recommends **not** changing them: the destructive act is
already two deliberate keystrokes, dismissal is undoable for eight seconds, and modifiers are a mode
in a design whose keyboard model is explicitly "one axis, no modes".

Revisit **if the confirmation step is ever removed for speed**. That is the change that would make a
modifier necessary, and the two belong in the same conversation.

### 15 · Snapshot preloading should follow the window

The effect still warms every queued incident rather than the rendered window, so 500 incidents warm
500 snapshots.

This was harmless by accident while snapshots were six shared SVGs the browser deduped. Real footage
removed the accident: six cameras now serve 120 distinct JPEGs, so a full queue warms a hundred-odd
images to open one pane. Should follow the window plus a margin ahead of the selection.

### 16 · `maxDiffPixels` has never been measured

The visual suite's tolerance is a ratio, so it scales with element area: 1% of a 432×40 queue row is
173 pixels, and 1% of the 320×200 evidence frame is 640 — a whole line of 11px type. A regression
under that on a large state will not be caught.

The fix is an absolute `maxDiffPixels` floor alongside the ratio, since Playwright applies whichever
is stricter. Choosing the number needs run-to-run antialiasing noise measured on the widest states
first — guessing it low would introduce flake, and flake is how a team learns to run `--update`
without looking.

Nothing is known to have slipped through it. This was noticed while chasing a capture that would not
update, which turned out to be an edit that never reached the file rather than anything to do with
the tolerance — [ADR-0016](adr/0016-update-snapshots-can-keep-the-old-one.md) withdraws that
diagnosis and keeps this observation, which is the part that was real.

### 17 · The snapshot failure state is unreachable, and untranslated

`toDetailView` hardcodes `snapshotState: 'loaded'`, so the "Snapshot unavailable / Retry" panel that
Pass C frame 5 specifies can only be reached from the component gallery. Nothing detects a broken
image, and the `Retry` button has no handler behind it.

Its copy is also still English in both locales — noticed only when phase 7 added the frame to the
visual matrix and the Japanese capture came back in English. The two are the same bug seen twice: a
state the app cannot enter is a state nobody reviews.

Fixing it is not three strings. `CameraSnapshot` is presentational and takes its words as props by
design ([ADR-0014](adr/0014-verifying-two-locales.md) — a hook in it would blank the gallery), so it
needs the copy passed down like `factLabels` already is, plus an `onError` on the image and a real
retry. Worth doing with Now, when snapshots stop being six committed SVGs that cannot fail.

### 18 · The boxes are not calibrated to the real frames

`src/lib/detection.ts` places bounding boxes on an idealised carriageway — lanes running up the
frame, hard shoulder at the left edge. That was right for the schematic SVGs it was written against.

The frames now under it are a real road at an oblique angle, seen differently by each of the six
crops. The boxes still agree with the _record_ — a hard-shoulder call still sits at the frame edge —
but the frame edge is not where that camera's hard shoulder actually is.

The fix is data, not logic: per-camera calibration in the manifest giving the carriageway's
quadrilateral in frame coordinates and which side the shoulder is on, which `boundingBoxesFor` reads
instead of its current constants. The crop rectangle is already recorded per camera, so the manifest
is the right home for it.
[ADR-0017](adr/0017-six-cameras-from-one-clip.md).

### 19 · Four cameras have no footage

`CAM-023`, `CAM-077`, `CAM-091` and `CAM-108` keep the per-event-type schematic, because every
derived crop frames three lanes and those cameras are not all three-lane. Incidents on them look
markedly worse than the rest now that the others are photographs.

Deliberate rather than unfinished — a network with cameras down is a real network, and workstream B's
offline tile needs one — but four in ten is more than a real network would have down at once. Either
derive further crops, or re-map so the odd lane counts are the ones without feeds.

## Later

- **Multi-operator presence.** Beyond the lock in #2: seeing which positions are online and what
  each is looking at.
- **Persistence beyond the buffer.** #1 gives replay and fan-out; a shift log that survives a
  deployment is a different problem.
- **A supervisor view.** Pass A's auto-escalation "pushes to the supervisor position", which
  currently means an audit line and nothing else.
- **The mark and claim rules exist twice**, in TypeScript and in Lua. The conformance suite keeps
  them in step and has caught one divergence already. A third storage backend should mean moving
  each rule somewhere all of them can call.
- **`/api/metrics` computes over one instance's read.** The window is shared under #1, but two
  instances asked at the same moment can still differ by whatever is in flight.

## Shipped

### Real camera frames — phase 7

Six camera feeds derived from one Creative Commons 4K clip by
[`scripts/prepare-footage.sh`](../scripts/prepare-footage.sh), which runs once locally and commits
its derivatives. The 482MB source is not in the repository; the script that turns it into 18MB of
loops and stills is, so the derivation is auditable without anyone re-downloading it.
[ADR-0017](adr/0017-six-cameras-from-one-clip.md), [docs/footage.md](footage.md),
[ATTRIBUTION.md](../ATTRIBUTION.md).

The licence was the thing that had blocked this, and it was blocked on tooling rather than on
anything real: the watch page is client-rendered, but the licence is in the video's own metadata and
yt-dlp prints it. "I cannot verify this" was true; "this cannot be verified" was not.

Crops were chosen by rendering candidates and looking at them. A tidy 3×2 tiling of the 4K frame
points three of its six "cameras" at grass, hatching and a maintenance shed — the traffic runs along
one diagonal band. Each camera also takes a different 10-second window, so the wall does not cut on
the same frame six times.

Implementing it added three things to the list:

- **The boxes are not calibrated to the frames** (#18). The geometry was written against schematic
  roads and these are a real one at an angle.
- **Four cameras still have no footage** (#19), because every crop frames three lanes.
- **Snapshot preloading stopped being harmlessly wrong** (#15). Six deduped SVGs became 120 distinct
  JPEGs.

And it settled one measurement that contradicts the brief: **VP9 is not the smaller format here.** At
matched quality it loses to H.264 outright on short, high-motion 720p.

### Detection overlay on the evidence frame — phase 7

The evidence frame now draws the detector's own boxes: the incident's object in the priority colour,
context traffic in the neutral, each labelled with its class and its **own** confidence — which is
not the event's, because a model can be 0.98 sure it sees a vehicle while the incident is a 0.6
"stopped, or just slow?" call.

Geometry is derived from the record rather than randomised. `src/lib/detection.ts` places a box from
the same `lanePosition` and `laneNumber` the priority rules read, and the tests assert the agreement
across every event type and lane position — a shoulder call clear of the carriageway, lane 1
nearside of lane 2 nearside of lane 3, adjacent lanes non-overlapping. **An incoherent box is worse
than no box:** an incident whose text says "hard shoulder" over a box mid-carriageway tells the
operator the system cannot see straight.

Congestion gets no primary box at all. It is a property of the whole carriageway, and singling out
one car would be a claim the detector never made.
[ADR-0015](adr/0015-detection-overlay-without-footage.md).

Implementing it added two things to the list:

- **The visual tolerance is a ratio, so it scales with element area** (#16). 1% of a 320×200 frame is
  640 pixels where 1% of a queue row is 173. Surfaced while chasing a capture that would not update —
  which turned out to be an edit that never reached the file, not the tolerance.
  [ADR-0016](adr/0016-update-snapshots-can-keep-the-old-one.md) withdraws that diagnosis.
- **`sourceFrame` is still missing from the schema.** Specified alongside the boxes, but it points at
  a frame manifest that cannot exist without the footage. It lands with Now rather than sitting in
  the contract as a permanently-absent field.

### 2 · Server-side incident ownership — phase 8

Acknowledging is now a compare-and-set on the server: a synchronous check-and-set in memory, a Lua
script against Redis. Exactly one of two positions racing `Enter` takes the incident and the other
is told `Taken by position 3` — on the row and in the detail pane, not as a generic error.
[ADR-0008](adr/0008-position-identity-and-the-ownership-lock.md).

**No authentication was built, deliberately.** A lock needs to know which desk is asking, not who
the person is. The server assigns a workstation number when the stream opens and keeps it in an
httpOnly cookie; that is enough for the compare-and-set and enough for the audit trail, and it
leaves real auth as a clean addition rather than a half-built one. It is not proof of identity, and
the README says so.

This is also the item that made "optimistic" mean something: acknowledging is the one action that
can be refused, so the row shows `Claiming…` and then either confirms or rolls back with the reason.
A failed request rolls back **without** naming a rival — "the request did not arrive" is not
"somebody else has it".

Implementing it added three things to the list:

- **A position is never released.** `assignedTo` is set by acknowledging and never cleared, and
  there is no way to hand an incident back. Deliberate — an incident does not become unowned because
  an operator walked away — but it needs an action, not a timeout nobody sees fire.
- **Positions count upward forever and are never reused.** Fine for a demo, wrong for a control room
  with eight physical desks, where the number should be bound to the workstation.
- **The claim rule now exists twice**, like the mark rule before it: `applyClaim` in TypeScript and
  a Lua transliteration. The conformance suite is the only thing keeping them in step, and it has
  already caught one divergence.

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
