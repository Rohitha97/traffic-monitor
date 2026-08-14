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

**2. A seeded scenario.** A deterministic two minutes — quiet, a debris call, a stopped vehicle on
the hard shoulder, then the _same class of event one lane over_ deriving critical, then a wrong-way
driver, then a low-confidence detection that demotes:

```bash
pnpm seed
```

The last beat needs you. Dismiss the demoted CAM-091 debris call when it lands; twenty-four seconds
later the camera reports it again and it arrives tagged **seen before**, carrying the reason you
gave. Leave it alone and the redetect is simply a second incident — the tag records a decision, so
there is nothing to show until one has been made.

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

Press `?` in the app for the live list. It renders from one table
([`src/lib/shortcuts.ts`](src/lib/shortcuts.ts)), and a unit test holds the key handler to that same
table in both directions — no published binding without a case, no working binding left unpublished.

That test earned its place immediately: `N` had worked as an alias for `Home` since phase 2 and the
overlay had never mentioned it.

| Key                  |                                                  |
| -------------------- | ------------------------------------------------ |
| `↑` `↓` (or `K` `J`) | Previous / next incident — previews as it moves  |
| `Enter`              | Acknowledge, and take the lock                   |
| `D`                  | Dispatch a response — `Enter` confirms           |
| `X`                  | Dismiss as a false positive, with a reason       |
| `R`                  | Mark resolved                                    |
| `Home` (or `N`)      | Load buffered new events                         |
| `Esc`                | Close the detail pane                            |
| `1`–`4` / `0`        | Filter by priority / clear                       |
| `M`                  | Mute / unmute the alert tone                     |
| `G`                  | Generate a test event (`Shift+G` for a critical) |

`Enter` **acknowledges** rather than opens: `↑↓` already previews, so opening is not an action that
needs a key. That is Pass A's state machine, and one of eleven places the design and the build
brief disagree — all enumerated in [`DESIGN_INVENTORY.md`](docs/DESIGN_INVENTORY.md) §6.

### Who owns an incident

Acknowledging takes a lock, and it is the only action the server can refuse. Everything else an
operator does acts on an incident they already hold, so it applies locally and reports afterwards;
this is a claim on a shared resource, and Pass A names the failure it prevents — two positions
dispatching the same call.

So the row shows `Claiming…` and then resolves. If another position got there first it rolls back
and says `Taken by position 3`, on the row and in the detail pane, rather than a generic error. If
the request simply failed it rolls back and names nobody: "the request did not arrive" is not
"somebody else has it".

The decision is a compare-and-set on the stored record — a synchronous check-and-set in memory, a
Lua script against Redis — so two browsers cannot both win, including when they are talking to
different instances. A position that was not racing sees the lock appear too, over the stream.

Each dashboard is assigned a workstation number when its stream opens, held in an httpOnly cookie.
That is as much identity as a lock needs and is explicitly not authentication — see
[Non-goals](#non-goals).

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

### When a call comes back

A dismissal is a judgement, and a detector that reports the same thing ninety seconds later should
not make the operator repeat it. If a camera re-detects the same class of event in the same place
within three minutes of it being dismissed, the incident arrives tagged **seen before**, carrying
the reason from the first call — on the row, not buried in the detail pane.

It comes back as a live incident with its own priority, not as the old one revived. The earlier
verdict is context for the decision, not a substitute for making one.

"The same place" is deliberately not "the same camera": debris on the hard shoulder and debris in a
live lane are two calls, and merging them would hide the second behind the first's dismissal.
Within the live lanes, adjacent lanes _do_ merge — a detector that says lane 2 and then lane 3 has
seen one object and disagreed with itself. `src/lib/correlation.ts`.

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
detector-sim ──POST──► /api/events/ingest ──► derivePriority ──► event bus
  (container)              (the boundary)         (pure)          ring buffer (default)
                                                                  or Redis Streams
                                                                         │
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
- **A small bounded log** on the server means a reconnect fetches the delta it missed and a fresh
  load gets the current queue — a monitoring tool cannot silently lose an incident. The `id` on the
  wire is the log's own cursor, so `Last-Event-ID` is a position rather than a value to search for.
- **The log has two implementations behind one interface** — an in-process ring buffer by default,
  Redis Streams when asked. Append, read-from-cursor and bounded retention were already the ring
  buffer's semantics, which is why the swap is a wrapper and not a redesign.
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

|               |                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------- |
| Unit          | 241 tests across 13 files — every pure module, the store, and the Zod contract itself             |
| Bus           | one conformance suite run against **both** the ring buffer and Redis Streams (`pnpm test:bus`)    |
| E2E           | 21 Playwright specs — the journey from the keyboard, correlation, virtualisation, a two-desk race |
| Accessibility | 4 axe audits at WCAG 2.1 AA across four states, **zero violations**                               |
| Lighthouse    | performance **100**, accessibility **100**, best practices **100**, SEO **100**                   |
| Visual        | 31 component states — 30 captured as images, 1 checked dimensionally                              |

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

`pnpm test:bus` is the one command that wants infrastructure, and it starts and disposes of its own
broker. Everything above runs on a clean clone with nothing provisioned.

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

## Running with a broker

The event bus has two implementations behind one interface. The default needs nothing:

```bash
docker compose up
```

`EVENT_BUS=memory`, a ring buffer in the dashboard process. `docker compose config --services` on
that command lists `dashboard` and `detector-sim` and nothing else — Redis is behind a profile and
there is no `depends_on` edge to it, so the default graph cannot pull in a broker.

Redis Streams is opt-in:

```bash
EVENT_BUS=redis docker compose --profile redis up
```

Now the log survives a dashboard restart. Add the second instance and a round-robin proxy on `:3100`
to see that it is genuinely shared:

```bash
EVENT_BUS=redis docker compose --profile redis --profile cluster up
```

`XADD` appends, `XRANGE` reads from the cursor, `MAXLEN ~` bounds retention, and the SSE
`Last-Event-ID` is the stream ID — no second cursor scheme. Stream entries are immutable and
operator marks are not, so an amended copy of each incident lives in a keyed value beside the
stream and reads prefer it. `pnpm test:bus` starts a throwaway broker and runs the conformance
suite against both implementations; `pnpm test` runs it against memory alone, so a clean clone needs
no infrastructure to test.

**When the broker is unreachable** the dashboard degrades rather than failing. Every operation falls
back to the in-process bus, `/api/health` reports `degraded: true` and still returns `ok` — going
unhealthy would have an orchestrator restart a process that is working — and the status bar shows a
`HISTORY LOCAL` tag beside the feed count.

That tag is deliberately not one of the three connection states. The feed is _live_: incidents keep
arriving. What has stopped is sharing — events published during the outage are visible on this
instance and nowhere else until the broker returns. Calling that "reconnecting" would be a false
alarm about the one thing the status bar exists to be trusted about.

## Languages

English and Japanese. Language is a **workstation setting**, not a URL — it lives in a cookie beside
the mute preference, because a control-room position's language is a property of the desk rather
than of what is on screen, and a deep link should not impose one operator's language on another.
There is no `[locale]` route segment.
[ADR-0009](docs/adr/0009-next-intl-and-cookie-locale.md).

The switcher writes the cookie and refreshes; `<html lang>` follows the resolved locale, which is
what makes a screen reader switch synthesiser voice.

Domain terms use Japanese expressway vocabulary rather than translated British motorway English —
逆走 for a wrong-way driver, 落下物 for debris, 路肩 for the hard shoulder. Compass bearings are
kept and translated literally (北行) rather than mapped to 上り / 下り, because the estate is British
motorways and 上り / 下り means "toward Tokyo", which is not a fact about the M6.
[ADR-0012](docs/adr/0012-japanese-domain-vocabulary.md).

> **The Japanese has not been reviewed by a native speaker.** It is researched, internally
> consistent and asserted by tests, and the terms most likely to be wrong are named in ADR-0012 —
> but that is not the same as review, and terminology is exactly where a confident non-speaker
> produces something plausible and wrong. Treat it as a first draft awaiting a road-operations
> engineer who reads Japanese.

Two strings are still English in both locales: the derived priority reason on the detail pane, and
the audit trail's action lines. Both are computed server-side for an event several positions read,
so localising them is a contract change rather than a translation — roadmap #10.

## Non-goals

Things this does not do, and the reason each is a boundary rather than an omission.

- **Authentication.** The ownership lock needs to know which _desk_ is asking, not who the person
  is. The server assigns a workstation number when the stream opens and keeps it in an httpOnly
  cookie — enough for a compare-and-set and enough for the audit trail. It is **not proof of
  identity**: anything that can send a request can send a cookie. That is an accurate description of
  an internal tool on an internal network, and it is the wrong answer for anything facing a hostile
  one. [ADR-0008](docs/adr/0008-position-identity-and-the-ownership-lock.md) records the decision
  rather than leaving a half-built login behind.
- **Persistence beyond the replay window.** `EVENT_BUS=redis` makes the log survive a dashboard
  restart and be shared across instances, but retention is still a hundred events. A shift log that
  outlives a deployment is a different problem, and a database is backend work the brief scoped out.
- **Camera coverage is partial.** Six of the ten cameras carry real footage, derived from one
  Creative Commons clip by [`scripts/prepare-footage.sh`](scripts/prepare-footage.sh). The other four
  keep the committed SVG still for their event type, because every derived crop frames three lanes
  and those cameras do not all watch three.
  [docs/footage.md](docs/footage.md), [ATTRIBUTION.md](ATTRIBUTION.md).
- **The detection boxes are not calibrated to those frames.** Box geometry is derived from the same
  fields the priority rules read, so it agrees with the record — a hard-shoulder call sits at the
  frame edge. But the frames are a real road at an oblique angle, and the frame edge is not where a
  given camera's hard shoulder actually is. Closing it means per-camera calibration in the manifest.
  [ADR-0017](docs/adr/0017-six-cameras-from-one-clip.md).
- **Releasing a lock.** Acknowledging takes an incident and nothing gives it back. Deliberate — an
  incident does not become unowned because an operator walked away, and a timeout nobody sees fire
  would be worse — but it does mean a mistaken claim is permanent.

## What I would do next

[`docs/roadmap.md`](docs/roadmap.md) is the live list, with Now / Next / Later and a record of what
each shipped item added to it. The short version: real camera frames have landed, which unblocks the
snapshot filmstrip — each camera now has twenty stills with the source second of each recorded, so
picking the five nearest a trigger is a lookup rather than a fabrication.

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
| `pnpm test`                 | Vitest — the Redis conformance block skips            |
| `pnpm test:bus`             | Bus conformance against both implementations          |
| `pnpm test:e2e`             | Playwright — journey, accessibility, metrics          |
| `pnpm test:visual`          | Visual regression, in the pinned Playwright container |
| `pnpm seed`                 | The two-minute scenario                               |
| `pnpm baseline`             | Measurement run — produces a reading, not a pass/fail |
| `pnpm format`               | Prettier                                              |
