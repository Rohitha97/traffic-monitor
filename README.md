# Traffic Incident Monitoring Dashboard

A single-screen operations dashboard for a highway traffic incident monitoring platform. An AI
video analysis system watches motorway camera feeds and emits detection events; operators sit in a
control room, watch events arrive, review the evidence, and decide whether to dispatch a safety
response team.

## Design thesis

This is triage under time pressure, not a table of records. Two numbers matter: **time to
awareness** (event created → operator notices, target ≤ 2s) and **time to decision** (notices →
dispatch or dismiss, target ≤ 15s for a critical). The worst realistic path from detection to
dispatch is 96 seconds, and 62 of those sit in _noticing_ and _orienting_ — the two steps the
design owns outright. Every implementation choice here is defensible against one of those two
numbers: snapshots are preloaded so the evidence is already warm, arrivals never move what is being
read, priority is derived and always shown with its reasoning, and the alert reaches an operator
who is looking at a different monitor.

## Quick start

```bash
docker compose up
```

Then open <http://localhost:3000>. That is the whole quick start — no environment file, no API key,
no database. Two services come up: the dashboard, and a detector simulator that posts observations
to it over the network.

Locally, without Docker:

```bash
corepack enable && pnpm install && pnpm dev
```

Requires Node 22+. Both paths are verified from a clean clone.

## How to see it work

Three ways to get events on screen, because different people reach for different ones.

**1. Ambient background stream.** `docker compose up` starts `detector-sim`, which posts an
observation every ~20 seconds on a Poisson-ish interval — clusters and lulls rather than a
metronome, so the next event is never predictable. Roughly 60% low/medium, 30% high, 10% critical:
a demo where everything is critical teaches you nothing about triage. Running locally with
`pnpm dev` instead, the same simulator runs in-process.

**2. A seeded scenario.** A deterministic 90 seconds — quiet, a debris call, a stopped vehicle on
the hard shoulder, then the _same class of event one lane over_ deriving critical, then a wrong-way
driver, then a low-confidence detection that demotes:

```bash
pnpm seed
```

**3. Post an observation yourself.** The ingest route is the boundary a real detection pipeline
would use. An empty body means "make something up":

```bash
curl -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:3000/api/events/ingest
```

Note what comes back: an id and a **priority the dashboard decided**. The detector posts what the
camera saw — type, lane position, confidence — and never a priority.

### The two numbers, measured

The design thesis above argues from time to awareness and time to decision. Both are instrumented:

```bash
curl -s http://localhost:3000/api/metrics
```

p50 and p95 for each, over the replay buffer, as plain JSON with the sample count included — a p95
over four samples is noise and the endpoint says so rather than letting you assume otherwise.

The marks live on the incident's own audit trail, so there is one timeline rather than a parallel
store. "Seen" is the interesting definition: `↑↓` previews into the detail pane, so selection _is_
the render — an incident only counts as seen once it has held the pane for 500ms. Cursoring through
a queue marks nothing, which is asserted both ways in `e2e/metrics.spec.ts`.
[ADR-0004](docs/adr/0004-instrumenting-the-two-numbers.md) explains why, and carries the baseline
readings.

### Keyboard

Press `?` in the app for the live list. It renders from the same table the key handler dispatches
from, so it cannot drift from what actually works.

| Key                  |                                                  |
| -------------------- | ------------------------------------------------ |
| `↑` `↓` (or `K` `J`) | Previous / next incident — previews as it moves  |
| `Enter`              | Acknowledge, and take the lock                   |
| `D`                  | Dispatch a response — `Enter` confirms           |
| `X`                  | Dismiss as a false positive, with a reason       |
| `R`                  | Mark resolved                                    |
| `Home`               | Load buffered new events                         |
| `Esc`                | Close the detail pane                            |
| `1`–`4` / `0`        | Filter by priority / clear                       |
| `M`                  | Mute / unmute the alert tone                     |
| `G`                  | Generate a test event (`Shift+G` for a critical) |

`Enter` **acknowledges** rather than opens: `↑↓` already previews, so opening is not an action that
needs a key. That is Pass A's state machine, and one of eleven places the design and the build
brief disagree — all enumerated in [`DESIGN_INVENTORY.md`](docs/DESIGN_INVENTORY.md) §6.

### Component states

`/dev/states` renders every component in every state Pass C draws, with the design's own captions
beside each one, so it can be diffed directly against the frames.

It is genuinely excluded from production, not merely hidden: the file is `page.dev.tsx`, and
`dev.tsx` is only an allowed page extension outside production builds. The route does not exist in
the production route table and the component is never compiled — verified, `/dev/states` returns
404 from the container and 200 from `pnpm dev`.

### When a critical arrives

Four channels carry the same alert, because an operator on a three-monitor position may not be
looking at this window — and because none of them is allowed to be the only one.

- **The pinned band** expands from zero to 52px and pushes the app down. It never overlays what is
  being read, and it **never auto-dismisses**. A critical left unacknowledged for 20 seconds
  re-fires it and writes `Unacknowledged 20s — banner re-fired, pushed to supervisor` into the
  audit trail.
- **A two-note tone**, under 400ms on a soft envelope, muted by default and persisted. Deliberately
  not startling: this plays hundreds of times a shift, and a resented alert gets muted permanently.
- **The tab title** becomes `(1) CRITICAL · Incident Monitor`.
- **The favicon** swaps its live-green dot for the critical triangle.

## Design process

The UI was designed before any code was written, in three passes in Claude Design.

**Project:** <https://claude.ai/design/p/395265bf-e8ef-4048-bf51-a354b40e2815>

- **Pass A · Flows and wireframes** — greybox only, no colour or type. A journey map for one
  critical event costed in seconds per step, the incident state machine, and three layouts weighed
  against each other. Chose master–detail with one pinned critical band borrowed from the
  priority-lane board: lane B's guarantee that a critical always appears in one fixed place, at a
  tenth of its cost.
- **Pass B · Visual system** — the token sheet, as a plan for approval. Three surfaces lifted off
  true black for a dim room and a 12-hour shift; four priority ramps that are the _only_ saturated
  tokens in the system; Public Sans (descended from Interstate, the highway-signage letterform)
  over IBM Plex Mono for tabular figures; a 4px grid and a 3px radius ceiling. Records three visual
  directions rejected on sight and four moves taken from motorway-signage vernacular.
- **Pass C · Screens and component states** — five frames at 1440×900 plus the arrival
  choreography and the component state matrix. One incident, a wrong-way driver on CAM-014, runs
  through frames 1–3 so it can be seen detected, reviewed and dispatched.

The exported source is in [`docs/design/`](docs/design/) — byte-exact, and it renders standalone in
a browser. [`docs/DESIGN_INVENTORY.md`](docs/DESIGN_INVENTORY.md) is the design-to-code mapping:
every token and where it lands, every component and its states, every interaction the frames imply
but cannot encode, and every place the design and the brief disagreed. It was written and reviewed
**before** any feature code.

## Architecture

```
detector-sim ──POST──► /api/events/ingest ──► derivePriority ──► event bus (ring buffer)
  (container)              (the boundary)         (pure)                 │
                                                                        │ SSE
                                                                        ▼
                        Zustand store ◄── useEventStream ◄── /api/events/stream
                              │
              one shared 1s tick ─── queue · detail · pinned band · tab + favicon
```

Ten lines on why:

- **Priority is derived server-side, never sent.** The ingest schema omits it, so a detector cannot
  set its own severity and the triage rules stay auditable.
- **SSE, not WebSockets.** Every message flows detector → operator. One-way needs no custom server,
  reconnects itself, and passes through Docker unchanged.
- **A small ring buffer** on the server means a reconnect fetches the delta it missed and a fresh
  load gets the current queue — a monitoring tool cannot silently lose an incident.
- **One store, one interval.** Every age counter ticks from a single shared field, so a
  once-a-second clock is one render pass rather than a dozen drifting timers.
- **Arrivals buffer rather than reorder** whenever an incident is open, except criticals, which
  arrive at the pinned band without moving the selected row.

## Decisions and trade-offs

The full running log is [`docs/DECISIONS.md`](docs/DECISIONS.md) — around sixty entries across six
phases, each written when the decision was made. The ones worth stating up front:

| Choice                                   | Alternative considered                                       | Why                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pass B's tokens as the product theme** | Port `nocturne`, as the brief instructs                      | Nocturne styles the _deck around_ the frames; every pixel _inside_ all five screens is Pass B. Porting nocturne would have produced a purple, Inter-set, 8px-radius dashboard matching none of the frames |
| **SSE**                                  | WebSockets / socket.io                                       | One-way is the actual shape of the traffic. WebSockets would mean a custom server and a bidirectional channel we never send anything back over                                                            |
| **Radix, unstyled**                      | shadcn/ui                                                    | shadcn ships its own token layer, which would fight Pass B's. Radix gives the same primitives with no competing values                                                                                    |
| **Zustand**                              | Context                                                      | One shared, high-frequency slice. Context would re-render every consumer on every one-second tick                                                                                                         |
| **Derived priority**                     | A `priority` field on the wire                               | A detector that sets its own severity makes the rules unauditable. `derivePriority` is pure and has 20 tests                                                                                              |
| **Arrivals buffer, never reorder**       | Sort aggressively and always show newest first               | Aggressive sorting reorders the list under the operator's cursor. Loading is an explicit act — `Home`                                                                                                     |
| **Muted by default, persisted**          | Sound on                                                     | A page that makes noise before consent is hostile — and the unmute click is also the gesture browsers require to unlock audio                                                                             |
| **A linear mile-marker schematic**       | maplibre-gl on a CARTO basemap, as the stack table specifies | Pass C draws a 120px strip with no basemap or zoom. A map would add ~800KB and a network tile dependency to a surface whose thesis is speed, and still not match the frame                                |
| **No database**                          | Postgres, or even SQLite                                     | This is a front-end evaluation. State lives in the store; the audit trail is per-session and this README says so                                                                                          |
| **Adherence rules under ESLint**         | oxlint, as the design system ships them                      | oxlint does not implement `no-restricted-syntax` — verified, the rules were silent no-ops. Both linters still run in `pnpm lint`                                                                          |

## Verification

|               |                                                                                       |
| ------------- | ------------------------------------------------------------------------------------- |
| Unit          | 47 tests — `derivePriority` exhaustively, and the store's buffering, locking and undo |
| E2E           | 11 Playwright specs — the full journey driven from the keyboard                       |
| Accessibility | 4 axe audits at WCAG 2.1 AA across four states, **zero violations**                   |
| Lighthouse    | performance **100**, accessibility **100**, best practices **100**, SEO **100**       |
| Visual        | 26 component states — 25 captured as images, 1 checked dimensionally                  |

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

Visual regression runs separately, because screenshots are not portable: font rasterisation differs
enough between platforms that a snapshot taken on a laptop will never match CI. Capture and
comparison both happen in the Playwright image, pinned to the installed version.

```bash
pnpm test:visual
```

The suite skips outside Linux rather than diffing, so nobody can commit snapshots their own machine
produced. `pnpm test:visual:update` regenerates them in the same container. It catches the drift the
adherence lint cannot see — the lint proves values come from tokens, not that the result still looks
like the frame.

One state is checked by dimension rather than by image: the collapsed critical band is zero-height
by design, and a photograph of an empty element passes no matter what changes. It is asserted to
have no height _and no bottom border_ — the second half being the actual bug it exists to catch, a
permanent red rule across a quiet screen.

## Docker

Four stages. `deps` is isolated so editing source never invalidates the dependency-install layer;
`output: 'standalone'` has Next trace only the dependencies the server actually needs; the runner
drops to a non-root `nextjs` user; and the healthcheck exists because compose cannot order service
startup without one — `detector-sim` waits on `service_healthy`. Current image: **240MB**.

One detail worth flagging: the healthcheck probes `127.0.0.1`, not `localhost`. The image's
`/etc/hosts` maps `localhost` to both `127.0.0.1` and `::1`, busybox wget tries `::1` first, and
Next's standalone server binds IPv4 only. Against `localhost` the container reports unhealthy while
serving perfectly — and `detector-sim` would wait on it forever.

`compose.dev.yml` gives hot reload. Its two anonymous volumes on `node_modules` and `.next` are
load-bearing: without them the host bind mount shadows the container's installed dependencies.

## What I deliberately did not build

- **Multi-operator presence.** Acknowledging takes a lock and the owner's initials show on the row,
  but there is one position and one operator name. Real ownership needs auth and a server-side
  lock; the UI is already shaped for it.
- **Persistence.** The event bus is in-memory. It does not survive a restart and is not shared
  between instances. A real deployment needs a broker and a store — but that is backend work the
  brief explicitly scoped out.
- **The reopen rule.** Pass A specifies that a dismissed incident re-detecting within three minutes
  returns tagged "seen before" with its earlier reason. The schema carries `seenBefore` and
  `dismissal` for it; the correlation logic is not written.
- **Snapshot filmstrip.** Pass A note 2 mentions "a strip of frames either side of the trigger".
  Only the single trigger frame is shown.
- **Real imagery.** Snapshots are committed SVG stills per event type, drawn in the design's own
  surface values so they sit in the evidence well without a seam.

## What I would do next

1. **Make the ring buffer a real broker.** Redis Streams would give the replay semantics already
   relied on, plus fan-out across instances — the current design maps onto it almost unchanged.
2. **Virtualise the queue.** Twelve rows is the design target, but a bad hour is hundreds. The row
   is fixed-height, so windowing is cheap and the shared tick already keeps re-renders to one pass.
3. **Server-side ownership.** The lock is currently a client-side field. Two positions dispatching
   the same call is the failure Pass A names, and only the server can actually prevent it.
4. **A visual regression pass.** `/dev/states` is a natural target for snapshot diffing against the
   Pass C frames, which would catch drift the adherence lint cannot see.
5. **Measure the two numbers.** The whole design argues from time-to-awareness and time-to-decision
   but never instruments them. Recording arrival → first keystroke → decision would turn the thesis
   into something falsifiable.

## AI log

[`docs/ai-log/`](docs/ai-log/) — how the work was structured, the three decisions escalated for a
human call, and an honest list of what the AI got wrong and how each was caught.

## Scripts

| Command                     |                                                       |
| --------------------------- | ----------------------------------------------------- |
| `pnpm dev`                  | Development server, with the simulator in-process     |
| `pnpm build` / `pnpm start` | Production build and serve                            |
| `pnpm lint`                 | oxlint + ESLint, including the design-adherence rules |
| `pnpm typecheck`            | `tsc --noEmit`                                        |
| `pnpm test`                 | Vitest                                                |
| `pnpm test:e2e`             | Playwright — journey, accessibility, metrics          |
| `pnpm test:visual`          | Visual regression, in the pinned Playwright container |
| `pnpm seed`                 | The 90-second scenario                                |
| `pnpm baseline`             | Measurement run — produces a reading, not a pass/fail |
| `pnpm format`               | Prettier                                              |
