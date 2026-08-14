# Traffic Incident Monitoring Dashboard

A single-screen control-room dashboard for monitoring motorway traffic incidents.

An AI video system watches motorway camera feeds and reports what it sees — a stopped vehicle, a
wrong-way driver, debris in a lane. Each report arrives here as an **incident**. An operator sitting
in a control room watches incidents arrive, looks at the camera evidence, and decides whether to
send a safety response team, mark it as a false alarm, or leave it.

This repository is the operator's screen: the live queue, the evidence panel, the actions, and the
fake detection feed that keeps it fed with realistic events. There is no real camera network and no
real dispatch system behind it — the detection side is simulated so the whole thing runs from one
command.

---

## Contents

- [What the dashboard does](#what-the-dashboard-does)
- [The idea behind the design](#the-idea-behind-the-design)
- [Requirements](#requirements)
- [Setup](#setup)
- [Using it](#using-it)
- [How it works](#how-it-works)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Design process](#design-process)
- [Decisions and trade-offs](#decisions-and-trade-offs)
- [Testing](#testing)
- [Docker details](#docker-details)
- [Running with Redis](#running-with-redis)
- [Languages](#languages)
- [What this deliberately does not do](#what-this-deliberately-does-not-do)
- [Scripts](#scripts)
- [Documentation map](#documentation-map)

---

## What the dashboard does

- **A live queue of incidents**, newest and most severe first, updating in real time as the
  detection feed reports new events.
- **A severity level the dashboard works out itself** from the type of event, where on the road it
  is, and how confident the detector was — and it always shows the reasoning, not just the label.
- **An evidence panel** for the selected incident: the camera snapshot with the detected object
  boxed on it, the location on the road, how long ago it was detected, and the running history of
  what every operator has done to it.
- **Four actions**: acknowledge (take ownership), dispatch a response team, dismiss as a false
  alarm with a reason, and mark resolved.
- **A loud path for critical events** — a banner, a short tone, the browser tab title, and the
  favicon all change, because the operator may be looking at a different monitor.
- **Full keyboard operation.** Every action has a key. Press `?` in the app for the list.
- **English and Japanese**, switchable from the status bar.

---

## The idea behind the design

This screen is about triage under time pressure, not about browsing a table of records. Two
measurements drive every choice in it:

| Measurement           | What it means                              | Target                    |
| --------------------- | ------------------------------------------ | ------------------------- |
| **Time to awareness** | Incident created → the operator notices it | 2 seconds or less         |
| **Time to decision**  | Operator notices → dispatch or dismiss     | 15 seconds for a critical |

Mapping the worst realistic path from detection to dispatch gave 96 seconds, and 62 of those were
spent just _noticing_ the event and _understanding_ it. Those two steps are the ones a user
interface actually controls, so the build attacks them directly:

- Camera snapshots are loaded into the browser the moment an incident arrives, so opening one never
  shows a loading spinner.
- New incidents never move the row you are currently reading. They wait in a bar at the top until
  you choose to load them.
- Severity is always shown together with the reason for it, so nobody has to reverse-engineer the
  ranking.
- A critical alert reaches an operator who is looking at another screen entirely.

Both numbers are measured live — see [Checking the two numbers](#checking-the-two-numbers).

---

## Requirements

Pick either path. Docker is the simpler one.

| Path       | You need                                    |
| ---------- | ------------------------------------------- |
| **Docker** | Docker Desktop (or Docker Engine + Compose) |
| **Local**  | Node.js 22 or newer, and pnpm 9             |

No API keys, no `.env` file, no database, no accounts. Everything the app needs is in the repository.

---

## Setup

### With Docker (recommended)

```bash
docker compose up
```

Open <http://localhost:3000>.

Two containers start:

- `dashboard` — the Next.js app.
- `detector-sim` — a small Node script standing in for the AI detection system. It posts a new
  observation to the dashboard every ~20 seconds over the network.

The first build takes a couple of minutes; after that it is cached. Stop it with `Ctrl+C`, or
`docker compose down` to remove the containers.

For hot reload while editing source:

```bash
docker compose -f docker-compose.yml -f compose.dev.yml up
```

### Without Docker

```bash
corepack enable
pnpm install
pnpm dev
```

Open <http://localhost:3000>. In this mode the detection simulator runs inside the app process
rather than as a separate container — the behaviour on screen is the same.

To run a production build locally:

```bash
pnpm build
pnpm start
```

Both paths are verified from a clean clone.

---

## Using it

### Getting incidents on screen

There are three ways, because different people reach for different ones.

**1. Just wait.** The simulator posts an event every ~20 seconds on an irregular schedule — clusters
and quiet stretches rather than a steady beat, so the next one is never predictable. The mix is
roughly 60% low/medium, 30% high, 10% critical. A demo where everything is critical teaches you
nothing about triage.

**2. Press `G`.** One test event. `Shift+G` forces a critical one. This is the fastest way to see
the critical alert behaviour on demand.

**3. Run the scripted scenario.** A fixed two-minute sequence: quiet, then a debris call, then a
stopped vehicle on the hard shoulder, then the _same kind of event one lane over_ — which comes out
critical — then a wrong-way driver, then a low-confidence detection that gets demoted a level.

```bash
pnpm seed
```

The last beat of the scenario needs you: dismiss the demoted `CAM-091` debris call when it lands.
Twenty-four seconds later the camera reports the same thing again, and it arrives tagged **seen
before**, carrying the reason you gave the first time. If you leave it alone, the second detection
is simply a second incident — the tag records a _decision_, so there is nothing to show until one
has been made.

**4. Post one yourself.** `/api/events/ingest` is the boundary a real detection pipeline would use.
An empty body means "make something plausible up":

```bash
curl -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:3000/api/events/ingest
```

Look at what comes back: an id, and a **severity the dashboard decided**. The detector posts what
the camera saw — event type, lane position, confidence — and never a severity of its own.

### Keyboard

Press `?` in the app for the live list. It is generated from a single table in
[`src/lib/shortcuts.ts`](src/lib/shortcuts.ts), and a test checks the key handler against that table
in both directions: nothing can be listed but not work, and nothing can work but go unlisted. (That
test paid for itself immediately — `N` had worked as an alias for `Home` for weeks and the overlay
had never mentioned it.)

| Key                  | Does                                             |
| -------------------- | ------------------------------------------------ |
| `↑` `↓` (or `K` `J`) | Previous / next incident — previews as it moves  |
| `Enter`              | Acknowledge, and take ownership                  |
| `D`                  | Dispatch a response — `Enter` confirms           |
| `X`                  | Dismiss as a false alarm, with a reason          |
| `R`                  | Mark resolved                                    |
| `Home` (or `N`)      | Load the incidents waiting at the top            |
| `Esc`                | Close the detail pane                            |
| `1`–`4` / `0`        | Filter by severity / clear the filter            |
| `M`                  | Mute / unmute the alert tone                     |
| `G`                  | Generate a test event (`Shift+G` for a critical) |
| `?`                  | Show this list                                   |

`Enter` **acknowledges** rather than opens. Moving the selection with `↑` `↓` already shows the
incident in the detail pane, so "open" is not an action that needs its own key.

### Taking ownership of an incident

Acknowledging an incident claims it for your workstation, and it is the only action the server is
allowed to refuse. Everything else you do acts on an incident you already hold, so it applies
instantly on screen and reports to the server afterwards.

While the claim is in flight the row shows `Claiming…`. If another workstation got there first, the
row rolls back and says `Taken by position 3` — on the row and in the detail pane, not as a generic
error. If the request simply failed, it rolls back and names nobody, because "the request did not
arrive" is a different thing from "somebody else has it".

The server decides the winner with a single atomic check-and-update on the stored record, so two
browsers cannot both win — including when they are talking to two different app instances. A
workstation that was not even racing still sees the claim appear, because the result is broadcast to
everyone.

Each dashboard is given a workstation number when it connects, stored in a cookie. That is all the
identity an ownership claim needs, and it is deliberately **not** a login — see
[What this deliberately does not do](#what-this-deliberately-does-not-do).

### When a critical arrives

Four channels carry the same alert, because an operator running three monitors may not be looking at
this window — and because no single channel is allowed to be the only one.

- **A banner** grows from nothing to a 52px strip and pushes the rest of the app down. It never
  covers what you are reading, and it never dismisses itself. A critical left unacknowledged for 20
  seconds re-fires it and writes `Unacknowledged 20s — banner re-fired, pushed to supervisor` into
  the incident's history.
- **A two-note tone**, under 400ms, soft. Muted by default, and your choice is remembered.
  Deliberately not startling: this plays hundreds of times in a 12-hour shift, and an alert people
  resent is an alert they mute permanently.
- **The browser tab title** becomes `(1) CRITICAL · Incident Monitor`.
- **The favicon** swaps its green "live" dot for a critical triangle.

### When a dismissed call comes back

Dismissing an incident is a judgement, and a detector that reports the same thing ninety seconds
later should not make the operator make that judgement twice.

If a camera re-detects the same kind of event in the same place within three minutes of a dismissal,
the new incident arrives tagged **seen before**, showing the reason from the first call directly on
the row rather than buried in the detail pane.

It comes back as a genuinely new incident with its own severity, not as the old one revived. The
earlier verdict is context for the new decision, not a replacement for making one.

"The same place" is deliberately not "the same camera". Debris on the hard shoulder and debris in a
live lane are two different calls, and merging them would hide the second one behind the first one's
dismissal. Within the live lanes, neighbouring lanes _do_ merge — a detector that says lane 2 and
then lane 3 has seen one object and disagreed with itself. The rules are in
[`src/lib/correlation.ts`](src/lib/correlation.ts).

### Checking the two numbers

Time to awareness and time to decision are both measured while the app runs:

```bash
curl -s http://localhost:3000/api/metrics
```

You get the median and the 95th-percentile value for each, as plain JSON, with the number of samples
included — a 95th percentile over four samples is noise, and the endpoint says so rather than letting
you read it as a result.

The timestamps live on each incident's own history, so there is one timeline rather than a second
parallel store. "Noticed" is the interesting definition here: because moving the selection with
`↑` `↓` already renders the incident, an incident only counts as noticed once it has held the detail
pane for 500ms. Scrolling through a queue quickly marks nothing, which is asserted in both directions
in `e2e/metrics.spec.ts`.

### The component gallery

`/dev/states` renders every component in every state the design draws, with the design's own captions
beside each one, so the implementation can be compared to the design frames side by side.

It is genuinely excluded from production builds rather than merely hidden: the file is named
`page.dev.tsx`, and `.dev.tsx` is only an allowed page extension outside production. The route does
not exist in the production route table and its component is never compiled — `/dev/states` returns
404 from the container and 200 from `pnpm dev`.

---

## How it works

### The flow of one event

```
detector-sim ──POST──► /api/events/ingest ──► derivePriority ──► event log
 (container or             (the boundary)        (pure fn)       in memory (default)
  in-process)                                                    or Redis
                                                                       │
                                                                       │ Server-Sent Events
                                                                       ▼
                     browser store ◄── useEventStream ◄── /api/events/stream
                          │
            one shared 1-second tick ─── queue · detail · banner · tab title + favicon
```

1. **The detector posts an observation** to `/api/events/ingest`: event type, camera, lane position,
   confidence, a one-line description. It never posts a severity.
2. **The server validates it** against a single schema (written once with Zod, in
   [`src/lib/schema.ts`](src/lib/schema.ts)) and rejects anything malformed.
3. **`derivePriority` decides the severity** and writes the reasoning sentence that the detail pane
   shows. It is a pure function — same inputs, same output, no clock, no network — which is why it
   can be tested exhaustively.
4. **The incident is appended to the event log**, a fixed-size list that keeps the last 100 entries.
5. **Every connected browser receives it** over Server-Sent Events (SSE), a one-way stream from
   server to browser that the browser reconnects by itself.
6. **The browser store applies it** and the queue, the detail pane, the banner and the tab title all
   update from that one piece of state.

### How severity is decided

The full table, before confidence is taken into account:

| Event type       | Live lane    | Hard shoulder | Off carriageway | Lane unknown |
| ---------------- | ------------ | ------------- | --------------- | ------------ |
| Wrong-way driver | **critical** | **critical**  | **critical**    | **critical** |
| Pedestrian       | **critical** | high          | high            | **critical** |
| Stopped vehicle  | **critical** | medium        | low             | high         |
| Smoke or fire    | **critical** | high          | high            | high         |
| Debris           | high         | medium        | medium          | medium       |
| Congestion       | medium       | medium        | medium          | medium       |

Then two adjustments:

- **Congestion reported again by the same camera within 10 minutes** becomes high. Traffic that is
  still there ten minutes later is building, not clearing.
- **Confidence below 0.6 drops the severity one level** and flags the incident `Low confidence —
verify`. The single exception is a wrong-way driver, which never drops: under-reacting to a
  wrong-way driver cannot be undone, over-reacting is cheap. A 40%-confidence wrong-way detection is
  still a wrong-way detection until a person says otherwise.

Where the lane could not be determined, the unknown column follows the same principle — a pedestrian
is treated as though on a live lane, because that is the one case where being wrong is fatal, while
debris and congestion do not escalate, because escalating them would only manufacture alert fatigue.

The logic is [`src/lib/priority.ts`](src/lib/priority.ts), with 20 unit tests.

### Why these technical choices

- **Severity is decided by the server and never sent by the detector.** The incoming schema has no
  severity field at all, so a detection system cannot declare its own importance and the triage
  rules stay in one auditable place.
- **Server-Sent Events rather than WebSockets.** Every message travels one way, server to browser.
  A one-way stream needs no custom server, reconnects itself, and passes through Docker unchanged.
- **A small bounded event log on the server** means a browser that reconnects fetches only what it
  missed, and a fresh page load gets the current queue. A monitoring tool must not silently lose an
  incident. The id sent on the wire _is_ the log's own position marker, so the standard SSE
  `Last-Event-ID` header is a position to resume from rather than a value to go searching for.
- **The log has two interchangeable implementations behind one interface** — an in-memory list by
  default, Redis when asked for. Appending, reading from a position, and dropping the oldest entries
  were already exactly what the in-memory version did, which is why the Redis version is a thin
  wrapper and not a redesign. See [Running with Redis](#running-with-redis).
- **One store, one timer.** Every "3m 12s ago" counter on screen reads from a single shared clock
  field, so a once-a-second update is one render pass rather than a dozen drifting timers.
- **New arrivals wait rather than reorder.** Whenever an incident is open, new ones queue up behind a
  bar at the top instead of pushing the list around. Criticals are the exception: they appear
  immediately in the banner, but still without moving the selected row.

### Tech stack

| Concern            | Choice                                     |
| ------------------ | ------------------------------------------ |
| Framework          | Next.js 15 (App Router), TypeScript strict |
| UI runtime         | React 19                                   |
| Styling            | Tailwind CSS v4, tokens from the design    |
| Accessible widgets | Radix UI primitives, unstyled              |
| Client state       | Zustand                                    |
| Validation + types | Zod (one schema, types inferred from it)   |
| Live updates       | Server-Sent Events                         |
| Long lists         | TanStack Virtual                           |
| Translation        | next-intl                                  |
| Dates              | date-fns                                   |
| Animation          | Motion (formerly Framer Motion)            |
| Sound              | Web Audio API, no dependency               |
| Tests              | Vitest, Playwright, axe-core               |
| Lint               | oxlint + ESLint + Prettier                 |

---

## Configuration

Everything has a working default; nothing has to be set.

| Variable          | Default                  | What it does                                                                                                                       |
| ----------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `SIM_MODE`        | `internal`               | `internal` runs the detection simulator inside the app; `external` expects `detector-sim` to post to it (what Docker Compose sets) |
| `SIM_INTERVAL_MS` | `20000`                  | Average gap between simulated detections, in milliseconds                                                                          |
| `EVENT_BUS`       | `memory`                 | `memory` for the in-process log, `redis` to use Redis                                                                              |
| `REDIS_URL`       | `redis://localhost:6379` | Where to find Redis when `EVENT_BUS=redis`                                                                                         |
| `DASHBOARD_URL`   | `http://localhost:3000`  | Where `detector-sim` and `pnpm seed` post events                                                                                   |
| `PORT`            | `3000`                   | Server port                                                                                                                        |

---

## Project structure

```
.
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                      the dashboard
│  │  ├─ dev/states/page.dev.tsx       component gallery, development only
│  │  └─ api/
│  │     ├─ events/ingest/route.ts     detections come in here
│  │     ├─ events/stream/route.ts     the live stream out to browsers
│  │     ├─ events/claim/route.ts      taking ownership of an incident
│  │     ├─ events/mark/route.ts       dispatch / dismiss / resolve
│  │     ├─ metrics/route.ts           the two timing measurements
│  │     └─ health/route.ts            container healthcheck
│  ├─ components/                      one file per component in the design
│  ├─ hooks/                           stream, keyboard, clock, sound, tab alert
│  ├─ store/                           the shared client state
│  ├─ lib/
│  │  ├─ schema.ts                     the one data contract
│  │  ├─ priority.ts                   severity rules
│  │  ├─ correlation.ts                the "seen before" rules
│  │  ├─ detection.ts                  where to draw the box on the snapshot
│  │  ├─ metrics.ts                    the two numbers
│  │  ├─ shortcuts.ts                  the single keyboard table
│  │  └─ event-bus/                    in-memory and Redis implementations
│  ├─ styles/                          design tokens, global CSS
│  └─ i18n/                            locale wiring
├─ messages/                           en.json, ja.json
├─ services/detector-sim/              the fake detection system
├─ e2e/                                Playwright tests
├─ scripts/                            seed, test runners, footage preparation
├─ public/                             camera snapshots and stills
├─ docs/                               design source, decisions, AI log
└─ Dockerfile, docker-compose.yml, compose.dev.yml
```

---

## Design process

The interface was designed in full before any application code was written, in three passes. Each
pass is exported to `docs/design/` as a PDF you can open directly:

| Pass                                                                                                                   | What it covers                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **[Pass A · Flows and wireframes](docs/design/Pass%20A%20%E2%80%94%20Flows%20and%20wireframes.pdf)**                   | Grey boxes only, no colour and no typefaces. A step-by-step journey for one critical event costed in seconds, the incident state machine, and three candidate layouts compared. The winner: a list on the left and detail on the right, with one pinned band for criticals                                                                                   |
| **[Pass B · Visual system](docs/design/Pass%20B%20%E2%80%94%20Visual%20system.pdf)**                                   | The colour, type and spacing rules. Three background shades lifted off pure black for a dim room and a 12-hour shift; four severity colours that are the _only_ strong colours in the whole system; Public Sans (a descendant of the Interstate highway-signage typeface) with IBM Plex Mono for numbers; a 4px spacing grid and a 3px maximum corner radius |
| **[Pass C · Screens and component states](docs/design/Pass%20C%20%E2%80%94%20Screens%20and%20component%20states.pdf)** | Five full screens at 1440×900, the arrival animation frame by frame, and every component in every state. One incident — a wrong-way driver on CAM-014 — runs through the first three screens so you can see it detected, reviewed, and dispatched                                                                                                            |

The original design source files are in [`docs/design/`](docs/design/) alongside the PDFs; they open
in a browser with no build step (see [`docs/design/README.md`](docs/design/README.md)).

[`docs/DESIGN_INVENTORY.md`](docs/DESIGN_INVENTORY.md) is the map from design to code: every colour
and spacing value and where it lands in the stylesheet, every component and its states, every
interaction the static frames imply but cannot themselves show, and every place where the design and
the written build brief contradicted each other. It was written and agreed **before** any feature
code.

---

## Decisions and trade-offs

The full running log is [`docs/DECISIONS.md`](docs/DECISIONS.md) — around sixty entries, each written
at the moment the decision was made. The ones worth stating up front:

| Choice                                      | Alternative considered                    | Why                                                                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The design's own colour and type system** | The generic starter theme it shipped with | The starter theme styles the _presentation deck around_ the frames, not the product inside them. Adopting it would have produced a purple, 8px-radius dashboard matching none of the five screens |
| **Server-Sent Events**                      | WebSockets / socket.io                    | One-way is the actual shape of the traffic. WebSockets would mean running a custom server and maintaining a return channel nothing ever sends on                                                  |
| **Radix primitives, unstyled**              | shadcn/ui                                 | shadcn brings its own colour and spacing values, which would compete with the design's. Radix gives the same accessible behaviour with no opinions about appearance                               |
| **Zustand for client state**                | React Context                             | One shared slice of state that changes every second. Context would re-render every consumer on every tick                                                                                         |
| **Severity derived on the server**          | A severity field on the incoming data     | A detector that declares its own importance makes the rules unauditable. The derivation is a pure function with 20 tests                                                                          |
| **New arrivals wait, never reorder**        | Always sort newest first, immediately     | Aggressive sorting moves the list under the operator's cursor mid-read. Loading is made an explicit act — one key                                                                                 |
| **Muted by default, choice remembered**     | Sound on from the start                   | A page that makes noise before you agree to it is hostile — and the unmute click doubles as the user gesture browsers require before audio can play at all                                        |
| **A simple linear road diagram**            | A real map library on a tile basemap      | The design draws a 120px strip with no basemap and no zoom. A map would add ~800KB and a network dependency to a screen whose whole point is speed, and still not match the drawing               |
| **No database**                             | Postgres, or even SQLite                  | The scope here is the operator's screen. State lives in the event log; the audit trail lasts as long as the session, and this README says so plainly                                              |
| **Design-adherence rules under ESLint**     | oxlint alone                              | oxlint does not implement the rule type these checks need — verified, they were silently doing nothing. Both linters still run in `pnpm lint`                                                     |

---

## Testing

| Layer         | What it covers                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit          | 241 tests across 13 files — every pure module, the client store, and the data contract itself                                                       |
| Event log     | One shared test suite run against **both** implementations, in-memory and Redis (`pnpm test:bus`)                                                   |
| End to end    | 21 Playwright tests — the full journey by keyboard, the "seen before" rules, long-list rendering, and two workstations racing for the same incident |
| Accessibility | 4 automated audits at WCAG 2.1 AA across four screen states, **zero violations**                                                                    |
| Lighthouse    | performance **100**, accessibility **100**, best practices **100**, SEO **100**                                                                     |
| Visual        | 31 component states — 30 compared as images, 1 checked by measurement                                                                               |

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

`pnpm test:bus` is the only command that wants extra infrastructure, and it starts and disposes of
its own Redis. Everything above runs on a clean clone with nothing provisioned.

### Visual regression

Screenshot comparison runs separately, because screenshots are not portable between machines: fonts
are rasterised differently enough on macOS, Windows and Linux that a reference image taken on a
laptop will never match one taken in CI. Both the capture and the comparison happen inside a pinned
Playwright container.

```bash
pnpm test:visual
```

Outside Linux the suite skips rather than comparing, so nobody can accidentally commit reference
images their own machine produced. `pnpm test:visual:update` regenerates them in the same container.

This catches drift the lint rules cannot see: lint proves that values come from the design's token
list, not that the assembled result still _looks_ like the design.

One state is checked by measurement rather than by image. The collapsed critical banner is
zero-height by design, and a photograph of an empty element passes no matter what breaks. It is
asserted to have no height _and no bottom border_ — the second half being the actual bug it exists
to catch, a permanent red line across an otherwise quiet screen.

---

## Docker details

The `Dockerfile` has four stages:

1. `base` — Node 22 Alpine with pnpm enabled.
2. `deps` — dependency install, isolated so that editing source code never invalidates it.
3. `builder` — the Next.js production build.
4. `runner` — the final image, running as a non-root `nextjs` user.

`output: 'standalone'` in `next.config.ts` has Next trace only the dependencies the server actually
needs into the image. Final image size: **240MB**.

The healthcheck exists because Docker Compose cannot order service startup without one —
`detector-sim` waits for the dashboard to report healthy before it starts posting.

One detail worth knowing if you touch it: the healthcheck probes `127.0.0.1`, not `localhost`. The
image's `/etc/hosts` maps `localhost` to both the IPv4 and IPv6 loopback addresses, the container's
`wget` tries IPv6 first, and the Next.js standalone server listens on IPv4 only. Against `localhost`
the container reports itself unhealthy while serving perfectly — and `detector-sim` would then wait
for it forever.

`compose.dev.yml` adds hot reload. Its two anonymous volumes on `node_modules` and `.next` are
load-bearing: without them, mounting your source directory over `/app` hides the dependencies
installed inside the container.

---

## Running with Redis

The event log has two interchangeable implementations. The default needs nothing installed:

```bash
docker compose up
```

That is the in-memory log inside the dashboard process. Redis is behind an opt-in Compose profile
and nothing depends on it, so the default setup cannot accidentally pull in a broker —
`docker compose config --services` on that command lists `dashboard` and `detector-sim` and nothing
else.

To use Redis instead:

```bash
EVENT_BUS=redis docker compose --profile redis up
```

Now the event log survives a dashboard restart. To prove it is genuinely shared, start a second app
instance behind a round-robin proxy on port 3100:

```bash
EVENT_BUS=redis docker compose --profile redis --profile cluster up
```

Under the hood this uses Redis Streams: `XADD` to append, `XRANGE` to read from a position, and
`MAXLEN ~` to cap retention — and the SSE `Last-Event-ID` header _is_ the stream id, so there is no
second position-tracking scheme to keep in sync. Stream entries are immutable while operator actions
are not, so an amended copy of each incident is kept in a separate key beside the stream, and reads
prefer that copy. Ownership claims are settled with a small Lua script so the check and the write
happen as one indivisible step.

`pnpm test:bus` starts a throwaway Redis and runs the same test suite against both implementations.
`pnpm test` runs it against the in-memory one alone, so a clean clone needs nothing installed to run
its tests.

**If Redis becomes unreachable**, the dashboard degrades instead of failing. Every operation falls
back to the in-process log, `/api/health` reports `degraded: true` while still returning `ok` —
reporting unhealthy would make an orchestrator restart a process that is working fine — and the
status bar shows a `HISTORY LOCAL` tag beside the feed count.

That tag is deliberately not one of the three connection states. The feed is still _live_; incidents
keep arriving. What has stopped is _sharing_ — events published during the outage are visible on this
instance and nowhere else until Redis returns. Calling that "reconnecting" would be a false alarm
about the one thing the status bar exists to be trusted about.

---

## Languages

English and Japanese.

Language is a **workstation setting**, not part of the URL. It lives in a cookie beside the mute
preference, because a control-room position's language belongs to the desk rather than to what is on
screen, and a link shared between operators should not impose one operator's language on another.
There is no locale segment in any route.

The switcher writes the cookie and refreshes the page; the `lang` attribute on `<html>` follows the
resolved language, which is what makes a screen reader switch to the right synthesised voice.

Domain terms use real Japanese expressway vocabulary rather than translated British motorway English
— 逆走 for a wrong-way driver, 落下物 for debris, 路肩 for the hard shoulder. Compass bearings are
kept and translated literally (北行) rather than mapped onto 上り / 下り, because these are British
motorways and 上り / 下り means "toward Tokyo", which is not a fact about the M6.

> **The Japanese has not been reviewed by a native speaker.** It is researched, internally
> consistent, and checked by tests — but that is not the same as review, and specialist terminology
> is exactly where a confident non-speaker produces something plausible and wrong. Treat it as a
> first draft awaiting a road-operations engineer who reads Japanese.

Two strings stay in English in both languages: the severity reasoning sentence in the detail pane,
and the action lines in the audit trail. Both are computed on the server for an incident that several
workstations read at once, so translating them is a change to the data contract rather than a
translation job.

---

## What this deliberately does not do

Each of these is a boundary with a reason, not an oversight.

- **No authentication.** The ownership claim needs to know which _desk_ is asking, not which person.
  The server assigns a workstation number when the stream opens and keeps it in a cookie — enough for
  a claim and enough for the audit trail. It is **not proof of identity**: anything that can send a
  request can send a cookie. That is an accurate description of an internal tool on an internal
  network, and it is the wrong answer for anything exposed to a hostile one.
- **No storage beyond the last 100 events.** Running with Redis makes the log survive a restart and
  be shared between instances, but retention is still bounded. A shift log that outlives a deployment
  is a different problem and needs a real database.
- **Camera coverage is partial.** Six of the ten cameras carry real video stills, derived from a
  single Creative Commons clip by [`scripts/prepare-footage.sh`](scripts/prepare-footage.sh). The
  other four keep a committed illustration for their event type, because every derived crop frames
  three lanes and those four cameras do not all watch three.
- **The detection boxes are not calibrated to the real frames.** The box position is derived from the
  same fields the severity rules read, so it always agrees with the record — a hard-shoulder call
  sits at the edge of the frame. But the stills are a real road at an oblique angle, and the edge of
  the frame is not where any particular camera's hard shoulder actually is. Fixing it means
  per-camera calibration data.
- **Ownership cannot be released.** Acknowledging takes an incident and nothing gives it back. That
  is deliberate — an incident does not become unowned just because an operator walked away, and a
  silent timeout would be worse — but it does mean a mistaken claim is permanent.

### What would come next

Real camera stills have landed, which unblocks the snapshot filmstrip: each camera now has twenty
stills with the source second of each recorded, so picking the five nearest to a detection is a
lookup rather than a fabrication. After that: per-camera calibration for the detection boxes, and
moving the two server-computed English strings into the translation files.

---

## Scripts

| Command                     | Does                                                             |
| --------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                  | Development server, with the detection simulator in-process      |
| `pnpm build` / `pnpm start` | Production build, then serve it                                  |
| `pnpm lint`                 | oxlint + ESLint, including the design-adherence rules            |
| `pnpm typecheck`            | TypeScript, no emit                                              |
| `pnpm test`                 | Unit tests (the Redis block skips)                               |
| `pnpm test:bus`             | Event-log tests against both implementations, with its own Redis |
| `pnpm test:e2e`             | Playwright — journey, accessibility, timing measurements         |
| `pnpm test:visual`          | Screenshot comparison, inside the pinned Playwright container    |
| `pnpm seed`                 | The scripted two-minute scenario                                 |
| `pnpm baseline`             | A measurement run — produces readings, not a pass or fail        |
| `pnpm format`               | Prettier                                                         |

---

## Documentation map

| File                                                   | What it is                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`docs/design/`](docs/design/)                         | The three design passes as PDFs, plus the original exported source                                                                                           |
| [`docs/DESIGN_INVENTORY.md`](docs/DESIGN_INVENTORY.md) | Design → code mapping, written before any feature code                                                                                                       |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)               | Running log of every trade-off, written as each was made                                                                                                     |
| [`docs/design-system.md`](docs/design-system.md)       | How the tokens, typography and interaction rules work in the implementation                                                                                  |
| [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md)         | The implementation brief the build was written against                                                                                                       |
| [`docs/ai-log/`](docs/ai-log/)                         | How the work was structured with AI assistance, what was escalated for a human decision, and an honest list of what the AI got wrong and how each was caught |
