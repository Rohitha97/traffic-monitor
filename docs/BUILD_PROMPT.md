# Build prompt — Traffic Incident Monitoring Dashboard

Paste this into Claude Code as the opening brief. The UI design is already finished in Claude Design; this prompt is an **implementation** brief, not a design brief. Keep it in the repo at `docs/BUILD_PROMPT.md` — it doubles as evidence of process for the AI-log requirement.

---

## 0. Role and standing instructions

You are a senior front-end engineer implementing a finished design for a take-home evaluation project. The reviewers are judging four things:

1. Ability to execute UIs with strong UX considerations, using modern frameworks and CSS methods.
2. Process and capability on UX design tasks.
3. How problems are approached and trade-offs made.
4. Clarity of code and documentation.

Standing rules for the whole build:

- **The design is authoritative.** Colour, type, spacing, radii, elevation, iconography, copy, and component states all come from the Claude Design project described in section 1. You are translating it, not reinterpreting it. If something in the design cannot be built as drawn, say so and propose the closest faithful alternative — do not silently improvise.
- **Work in phases.** Stop at the end of each phase, summarise what you did and any trade-off you made, and wait for me before continuing.
- **Log trade-offs as you go.** Every time you pick one approach over another, write a one-line rationale into `docs/DECISIONS.md`. That file is a deliverable.
- **No dead code, no TODO stubs, no commented-out experiments** in the final tree.
- **Accessibility is not a phase.** Keyboard operability, visible focus, `prefers-reduced-motion`, and non-colour-only encoding ship with every component as it is written.
- If a requirement is ambiguous, ask before inventing.

---

## 1. Read the design first

The Claude Design MCP is already connected. Before writing any code, read the project:

`https://claude.ai/design/p/395265bf-e8ef-4048-bf51-a354b40e2815?file=Pass+C+-+Screens+and+component+states.dc.html`

The whole project is readable. Read these files, in this order — the order matters, because the design system defines the vocabulary that the screens are written in:

1. `_ds/nocturne-ce7bd6a7-39e4-4917-bbec-e38bf6d4ee6c/readme.md` — how the design system is meant to be consumed
2. `_ds/nocturne-ce7bd6a7-39e4-4917-bbec-e38bf6d4ee6c/_ds_manifest.json` — the component and token inventory
3. `_ds/nocturne-ce7bd6a7-39e4-4917-bbec-e38bf6d4ee6c/styles.css` — the token layer; this is the single source of truth for every colour, type, spacing, and radius value in the build
4. `_ds/nocturne-ce7bd6a7-39e4-4917-bbec-e38bf6d4ee6c/_ds_bundle.js` — component implementations
5. `_ds/nocturne-ce7bd6a7-39e4-4917-bbec-e38bf6d4ee6c/_adherence.oxlintrc.json` — the lint rules that enforce design system adherence
6. `Pass B - Visual system.dc.html` — the rationale behind the tokens
7. `Pass C - Screens and component states.dc.html` — **the primary implementation target.** Full screens plus the state matrix for every component
8. `Pass A - Flows and wireframes.dc.html` — flows, journey, and the incident state machine; this tells you what the screens do, not just how they look
9. `support.js` and `image-slot.js` — helpers that the selected files import; port or replace their behaviour deliberately rather than dropping it

**Then, before implementing anything, produce a written inventory** in `docs/DESIGN_INVENTORY.md` covering:

- Every token in `styles.css`, grouped by role, and where each one maps in the Tailwind v4 `@theme` block.
- Every component in `Pass C`, with its full state list, and the React component that will own it.
- Every interaction the frames imply but cannot themselves encode — animation timing, what happens between two states, what the transition is triggered by.
- Anything in the design you cannot build faithfully, with the reason and your proposed alternative.
- What `support.js` and `image-slot.js` are doing, and whether each behaviour is being ported, replaced with a library, or dropped.

I will review that inventory before you write feature code. It is also a deliverable in its own right — it is the artefact that proves the design and the build actually correspond.

### Fidelity rules

- **Tokens are consumed, never re-authored.** Port `styles.css` into a Tailwind v4 `@theme` block, keeping the token names from the design system. Do not rename them to Tailwind defaults and do not add new values. If you need a value that does not exist, that is a signal the design needs a decision, not that you should pick one.
- **No arbitrary Tailwind values in feature code.** `p-[13px]` and `text-[#1a1d21]` are both bugs. Every utility resolves to a token.
- **Wire up the adherence lint config.** Add `_adherence.oxlintrc.json` to the repo and run oxlint in CI and in the `pnpm lint` script. It exists precisely to catch drift between the design system and the implementation, and having it enforced is a strong signal to the reviewers.
- **Component names match the design.** If `Pass C` calls it an incident card, the React component is `IncidentCard`, not `EventListItem`. A reviewer with both artefacts open should be able to trace a name straight across.
- **Build the whole state matrix, not just the happy path.** Every state drawn in `Pass C` gets built and gets a Storybook-style demo route at `/dev/states` (dev-only, excluded from the production build). This is the fastest way for a reviewer to verify you implemented the design completely, and it takes about twenty minutes.

---

## 2. The product

A single-screen operations dashboard for a highway traffic incident monitoring platform. An AI video analysis system watches motorway camera feeds and emits detection events (stopped vehicle, wrong-way driver, debris, congestion, pedestrian on carriageway, smoke or fire). Operators sit in a control room, watch events arrive, review the evidence, and decide whether to dispatch a safety response team.

**Design thesis, already established in Pass A:** this is triage under time pressure, not a table of records. The two numbers that matter are _time to awareness_ (event created → operator notices) and _time to decision_ (operator notices → dispatch or dismiss). Every implementation choice — render strategy, preloading, transport, animation duration — should be defensible in terms of one of those two numbers.

**Operator model:** a trained professional on a 12-hour shift, in a dim room, running one to three monitors at 1440px+, who prefers keyboard over mouse and sees hundreds of events per shift, most of them routine. Dense, quiet, fast. No onboarding, no hand-holding.

---

## 3. Stack

Do not substitute without asking.

| Concern             | Choice                                                                       | Why                                                                                                                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | Next.js 15, App Router, TypeScript strict                                    | Required; route handlers give us a fake backend for free                                                                                                                                                       |
| Runtime             | React 19                                                                     | Ships with Next 15                                                                                                                                                                                             |
| Styling             | Tailwind CSS v4                                                              | CSS-first `@theme`, which is exactly the right shape for importing `styles.css` from the design system                                                                                                         |
| Design system       | `nocturne` from the Claude Design project                                    | Already exists; consume it, do not rebuild it                                                                                                                                                                  |
| Primitives          | Radix UI, unstyled                                                           | Accessible dialog, tooltip, popover, focus trap — styled entirely from nocturne tokens. Prefer this over shadcn/ui here, since shadcn ships its own opinionated token layer that would fight the design system |
| Client state        | Zustand                                                                      | The event store is a single shared, high-frequency slice; Context would re-render the world                                                                                                                    |
| Schema + types      | Zod                                                                          | One schema is the contract between "detector" and UI; infer TS types from it                                                                                                                                   |
| Real-time transport | Server-Sent Events via a route handler                                       | One-way server → client is all we need; no custom server, works behind Docker, auto-reconnects                                                                                                                 |
| Time                | date-fns                                                                     | `formatDistanceToNowStrict` for live age counters                                                                                                                                                              |
| Motion              | `motion` (Framer Motion)                                                     | List enter/exit and banner choreography only, gated on `prefers-reduced-motion`                                                                                                                                |
| Icons               | Whatever `Pass C` uses                                                       | Match the design; only fall back to lucide-react if the design's icons are not extractable                                                                                                                     |
| Map                 | maplibre-gl + react-map-gl, CARTO basemap                                    | No API key, so reviewers can run it with zero setup. Style the map to nocturne's dark surface tokens                                                                                                           |
| Sound               | Native Web Audio API                                                         | One short tone for critical events; a dependency would be overkill                                                                                                                                             |
| Lint                | oxlint with the project's `_adherence.oxlintrc.json`, plus ESLint + Prettier | Design adherence enforced in CI                                                                                                                                                                                |
| Unit tests          | Vitest + React Testing Library                                               | Test the priority logic and the store, not the pixels                                                                                                                                                          |
| E2E                 | Playwright, one spec                                                         | The full journey: event arrives → detail opens → dispatch                                                                                                                                                      |

Explicitly rejected, and say why in `DECISIONS.md`: WebSockets and socket.io (custom server, bidirectional plumbing we do not use), shadcn/ui (competing token layer), a real database (this is a front-end evaluation), Redux Toolkit (ceremony without benefit at this size), CSS-in-JS (runtime cost on a surface that re-renders every second).

---

## 4. Data model

Define once in `src/lib/schema.ts` with Zod and infer types from it. Field names should line up with the labels used in `Pass C` so the mapping is obvious.

```ts
type EventType =
  | 'stopped_vehicle'
  | 'wrong_way_driver'
  | 'debris'
  | 'congestion'
  | 'pedestrian'
  | 'smoke_fire';

type Priority = 'critical' | 'high' | 'medium' | 'low';

type Status = 'new' | 'acknowledged' | 'dispatched' | 'resolved' | 'dismissed';

interface DetectionEvent {
  id: string;
  detectedAt: string; // ISO — when the model saw it
  receivedAt: string; // ISO — when the client got it; the gap is pipeline latency
  type: EventType;
  priority: Priority;
  priorityReason: string; // e.g. "Live lane 2 of 3, junction approach"
  confidence: number; // 0–1, from the detection model
  status: Status;
  camera: {
    id: string; // "M4-EB-114"
    name: string; // "M4 eastbound, junction 4 approach"
    roadway: string;
    direction: 'NB' | 'SB' | 'EB' | 'WB';
    marker: string; // "MP 114.2"
    lat: number;
    lng: number;
  };
  lanePosition: 'hard_shoulder' | 'live_lane' | 'off_carriageway' | 'unknown';
  laneNumber?: number;
  snapshotUrl: string;
  description: string; // one plain-English sentence from the detector
  assignedTo?: string;
  history: Array<{ at: string; actor: string; action: string; note?: string }>;
}
```

If `Pass C` displays a field this schema does not have, add it. If the schema has a field no frame displays, either surface it or delete it — an unused field is a question at interview you would rather not be asked.

**Priority is derived, not random.** Write `derivePriority(type, lanePosition, confidence)` as a pure, unit-tested function, and render its reasoning as `priorityReason`. This is the highest-value logic in the submission: it shows the domain was modelled rather than decorated.

- `wrong_way_driver` → always `critical`.
- `pedestrian` on `live_lane` → `critical`; on `hard_shoulder` → `high`.
- `stopped_vehicle` on `live_lane` → `critical`; `hard_shoulder` → `medium`; `off_carriageway` → `low`.
- `smoke_fire` → `critical` if `live_lane`, else `high`.
- `debris` on `live_lane` → `high`, else `medium`.
- `congestion` → `medium`, or `high` on a repeat detection from the same camera within 10 minutes.
- Confidence below 0.6 demotes one level and flags `Low confidence — verify`, except for `wrong_way_driver`, which never demotes. Reason for the README: under-reacting to a wrong-way driver is unrecoverable, over-reacting is cheap.

---

## 5. Interaction behaviour

`Pass C` gives you the states. It cannot give you the choreography between them, so this section specifies it. Where a frame and this section disagree, **the frame wins** — flag the conflict and ask.

### 5.1 Arrival without disruption

New events must never move what the operator is currently reading.

- Queue at top with no incident open → new events animate in at the top, settle, using the enter transition drawn in `Pass C`.
- Operator scrolled down, or an incident open → **do not reorder.** Show the buffered-events bar from the design (`3 new events — press N to load`), coloured by the highest new priority. Loading is an explicit act.
- Exception: a `critical` event fires the alert banner immediately regardless of scroll state, but still does not reorder the list under the cursor.

### 5.2 The critical alert

- Banner enters as drawn, holds for 8 seconds, collapses into the queue.
- One short non-startling tone, two notes, under 400ms. **Muted by default on first load**, with the unmute control visible in the status bar; persist the choice. A page that makes noise before consent is hostile, and saying so in the README is a good trade-off note.
- Tab title flashes `(1) Critical — wrong-way driver` and the favicon gets a badge, so an operator watching another monitor still sees it.
- Never sound-only, never colour-only.

### 5.3 Time made visible

- Live age counter on every row, ticking once a second from a **single shared interval in the store** — not one timer per row. Tabular-lining numerals so digits do not jitter.
- Age thresholds tied to priority: a critical event unhandled past 60s takes the ageing treatment from the state matrix; past 120s it escalates again. This turns the queue into a self-sorting attention map.
- Detail pane shows `detected → received` latency explicitly. One line of text, and it answers the brief's "speed matters" line directly.

### 5.4 Comprehension in under two seconds

- **Preload every queued event's snapshot** so opening a detail never shows a spinner. Warm them on ingest with an off-screen `Image()`. This is the single biggest perceived-speed win in the build.
- DOM order matches the reading order in the design: priority → type → location → lane position → confidence.
- Priority carries colour, icon, text, and a structural cue. Assume a colour-blind operator on a badly calibrated monitor.
- Always render the _reason_ for the priority, not just the level.

### 5.5 Decision and feedback

- Three actions: `Dispatch response`, `Acknowledge`, `Dismiss` (with a false-positive reason picker — false-positive reasons are how a detection model improves, and showing you know that is worth a lot).
- Optimistic UI: state changes instantly, the row animates to its new section, an undo toast holds 5 seconds.
- Every action appends to the audit trail shown in the detail pane. Safety-critical systems are accountable systems.
- Confirmation only on `Dispatch`, and confirmable with a single keypress. A real dispatch costs money; a four-second modal costs more.

### 5.6 Keyboard-first

Publish in the `?` overlay. If the design already specifies bindings, use those instead.

| Key       | Action                             |
| --------- | ---------------------------------- |
| `J` / `K` | Next / previous event              |
| `Enter`   | Open selected event                |
| `Esc`     | Close detail                       |
| `A`       | Acknowledge                        |
| `D`       | Dispatch (then `Enter` to confirm) |
| `X`       | Dismiss                            |
| `N`       | Load buffered new events           |
| `1`–`4`   | Filter by priority                 |
| `0`       | Clear filters                      |
| `M`       | Mute / unmute                      |
| `G`       | Generate a fake event (demo aid)   |
| `?`       | Shortcut overlay                   |

Focus visible at all times, focus trapped in the dismiss modal, detail pane as an ARIA live region.

### 5.7 Trust and degradation

- SSE connection state always on screen, using the indicator states from `Pass C`: `Live`, `Reconnecting`, `Offline — data may be stale as of 14:31:02` with a frozen timestamp.
- Exponential backoff; on reconnect fetch a delta rather than assuming continuity.
- Empty state is an invitation, not an apology: `No active incidents. 12 feeds online, monitoring.`
- Per-type snapshot fallback rather than a broken image icon. `image-slot.js` from the design project may already handle this — check before writing your own.

---

## 6. Fake event generation

Three routes in, because different reviewers reach for different ones:

1. **Ambient background stream.** A route handler emitting on a Poisson-ish interval (default mean 20s, `SIM_INTERVAL_MS`), weighted roughly 60% low/medium, 30% high, 10% critical. A demo where everything is critical teaches the reviewer nothing about triage.
2. **Keypress `G`** for one event, `Shift+G` for a critical one. This is what you use during the interview walkthrough.
3. **A seeded script**, `pnpm seed`, playing a deterministic 90-second scenario: quiet → debris call → stopped vehicle escalating to critical → wrong-way driver.

Snapshots: committed placeholder stills per event type in `public/snapshots/`, with camera ID and timestamp overlaid at render time. Do not hotlink external images — the reviewer may be offline.

---

## 7. Docker

Ship it so `docker compose up` is the only command in the README quick start.

**`next.config.ts`** — set `output: 'standalone'`. Next traces exactly the dependencies it needs into `.next/standalone`, taking the final image from roughly 1.2GB to under 200MB.

**`Dockerfile`** — four stages:

```dockerfile
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server.js"]
```

Explain the "why" in the README, because that is what is being marked: a separate `deps` stage so a source-only change does not reinvalidate the dependency install layer; a non-root `nextjs` user because a container running as root is a finding in any real security review; a healthcheck because compose dependency ordering needs one; `standalone` for image size.

**`docker-compose.yml`** — two services, because splitting them makes the architecture legible:

```yaml
services:
  dashboard:
    build: { context: ., target: runner }
    ports: ['3000:3000']
    environment:
      SIM_MODE: 'external'
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:3000/api/health']
      interval: 15s
      timeout: 3s
      retries: 3

  detector-sim:
    build: { context: ./services/detector-sim }
    environment:
      DASHBOARD_URL: 'http://dashboard:3000'
      SIM_INTERVAL_MS: '20000'
    depends_on:
      dashboard: { condition: service_healthy }
```

`services/detector-sim` is a ~60-line Node script POSTing generated events to `/api/events/ingest`. It exists to make the boundary the brief describes — _the layer between the detection system and the people_ — visible in the architecture rather than only in prose. If time is short, cut it and run the simulator in-process behind `SIM_MODE=internal`, and note the trade-off.

**`compose.dev.yml`** for hot reload:

```yaml
services:
  dashboard:
    build: { context: ., target: deps }
    command: sh -c "pnpm install && pnpm dev"
    volumes: ['.:/app', '/app/node_modules', '/app/.next']
    ports: ['3000:3000']
```

The anonymous volumes on `node_modules` and `.next` are the detail that trips people up — without them the host bind mount shadows the container's installed dependencies.

**`.dockerignore`**: `node_modules`, `.next`, `.git`, `docs`, `*.md` except README, `.env*.local`, `playwright-report`, `test-results`.

---

## 8. Repository shape

```
.
├─ README.md
├─ docs/
│  ├─ BUILD_PROMPT.md          # this file
│  ├─ DESIGN_INVENTORY.md      # design → code mapping, produced in phase 0
│  ├─ DECISIONS.md             # running trade-off log
│  ├─ ai-log/                  # exported prompts + conversations (required by the brief)
│  └─ design/                  # exported frames from the Claude Design project + the link
├─ services/detector-sim/
├─ src/
│  ├─ app/
│  │  ├─ page.tsx
│  │  ├─ layout.tsx
│  │  ├─ dev/states/page.tsx           # component state matrix, dev-only
│  │  └─ api/
│  │     ├─ events/stream/route.ts     # SSE
│  │     ├─ events/ingest/route.ts     # POST from detector-sim
│  │     └─ health/route.ts
│  ├─ components/                      # names mirror the design's component names
│  ├─ hooks/                           # useEventStream, useKeyboardShortcuts, useLiveClock, useAlertSound
│  ├─ store/                           # Zustand slices: events, ui, connection
│  ├─ styles/
│  │  ├─ theme.css                     # nocturne tokens as a Tailwind v4 @theme block
│  │  └─ globals.css
│  └─ lib/                             # schema.ts, priority.ts, generator.ts, format.ts
├─ .oxlintrc.json                      # from the design project's _adherence config
└─ Dockerfile, docker-compose.yml, compose.dev.yml, .dockerignore
```

---

## 9. Phases

Stop and summarise after each.

0. **Design import** — read all nine files, write `docs/DESIGN_INVENTORY.md`, export the frames into `docs/design/`. No application code. I review the inventory before you continue.
1. **Scaffold** — Next 15 + TS strict + Tailwind v4, nocturne tokens ported into `theme.css`, oxlint adherence config wired into `pnpm lint`, Docker files, health route, empty layout matching the design's grid. Prove `docker compose up` works before writing a single feature.
2. **Design system layer** — every component from `Pass C` built with its full state matrix, rendered at `/dev/states`, no data and no behaviour yet. Purely visual, purely faithful. This is the phase where fidelity gets verified against the frames.
3. **Data and transport** — Zod schema, `derivePriority` with unit tests, generator, SSE route, `useEventStream`, Zustand store, connection state machine. Wire real data into the components from phase 2.
4. **Queue and detail** — filters, sort, keyboard navigation, the buffered-events behaviour, snapshot preloading, evidence panel, mini map, audit trail, three actions with optimistic updates and undo.
5. **Real-time layer** — critical banner choreography, sound with persisted mute, tab title and favicon badging, motion with `prefers-reduced-motion`, degradation states.
6. **Polish and proof** — Playwright journey spec, README, `DECISIONS.md`, AI log export, keyboard-only pass then a screen-reader pass, Lighthouse run.

If time runs out, ship phases 0–4 finished rather than 0–6 half-done, and write a specific "what I would do next and why" section. The brief explicitly says compromises are fine and will be discussed — an honest, specific list of cuts reads as senior judgement; a silent gap reads as an oversight.

---

## 10. README requirements

The README is graded. It must contain, in this order:

1. One-paragraph design thesis (time to awareness, time to decision).
2. Quick start: `docker compose up` and the local `pnpm` path, both verified from a clean clone.
3. How to see it work: the three ways to generate events, the `?` shortcut list, and the `/dev/states` route.
4. **Design process**: a link to the Claude Design project, the three passes summarised in a few lines each, exported frames in `docs/design/`, and a pointer to `DESIGN_INVENTORY.md` as the design-to-code mapping. The brief asks for visibility on design thinking done before coding — this section is where you get those marks, so make the Pass A → B → C progression legible.
5. Architecture, about ten lines plus one diagram.
6. Decisions and trade-offs as a table of _choice → alternative considered → why_. At minimum: SSE over WebSockets, Radix over shadcn (to avoid a competing token layer), Zustand over Context, derived priority, the non-reordering buffer, muted-by-default audio, no database.
7. What I deliberately did not build, and what I would do next.
8. Link to the AI conversation log.
