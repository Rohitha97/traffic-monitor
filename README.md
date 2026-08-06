# Traffic Incident Monitoring Dashboard

A single-screen operations dashboard for a highway traffic incident monitoring platform. An AI
video analysis system watches motorway camera feeds and emits detection events; operators sit in a
control room, watch events arrive, review the evidence, and decide whether to dispatch a safety
response team.

## Design thesis

This is triage under time pressure, not a table of records. Two numbers matter: **time to
awareness** (event created → operator notices, target ≤ 2s) and **time to decision** (notices →
dispatch or dismiss, target ≤ 15s for a critical). Every implementation choice — render strategy,
snapshot preloading, transport, animation duration — is defensible in terms of one of those two.
The worst realistic path from detection to dispatch is 96 seconds, and 62 of those sit in noticing
and orienting: the two steps the design owns outright.

## Quick start

```bash
docker compose up
```

Then open <http://localhost:3000>. That is the whole quick start — no environment file, no API key,
no database.

Locally, without Docker:

```bash
corepack enable && pnpm install && pnpm dev
```

Requires Node 22+. Both paths are verified from a clean clone.

## Project status

Built in phases. **Phases 0–2 are complete.**

| Phase                   | State | What it covers                                                                                    |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| 0 · Design import       | ✅    | Design read and inventoried; source exported to `docs/design/`                                    |
| 1 · Scaffold            | ✅    | Next 15 + TS strict + Tailwind v4, token layer, adherence lint, Docker, health route, layout grid |
| 2 · Design system layer | ✅    | 17 components, every Pass C state, verified at `/dev/states`                                      |
| 3 · Data and transport  | —     | Zod schema, `derivePriority` + tests, SSE, Zustand store, `detector-sim`                          |
| 4 · Queue and detail    | —     | Filters, keyboard navigation, buffered arrivals, evidence panel, the three actions                |
| 5 · Real-time layer     | —     | Critical banner choreography, sound, tab badging, degradation states                              |
| 6 · Polish and proof    | —     | Playwright journey, full README, AI log, a11y and Lighthouse passes                               |

## Seeing the components

`/dev/states` renders every component in every state Pass C draws, with the design's own captions
beside each one, so it can be diffed directly against the frames. Development-only —
`next.config.ts` rewrites `/dev/*` to a 404 in production.

```bash
pnpm dev
```

Then open <http://localhost:3000/dev/states>.

## Design process

The UI was designed before any code was written, in three passes in Claude Design.

**Project:** <https://claude.ai/design/p/395265bf-e8ef-4048-bf51-a354b40e2815>

- **Pass A · Flows and wireframes** — greybox only. A journey map for one critical event costed in
  seconds per step, the incident state machine, and three layouts weighed against each other.
  Chose master–detail with one pinned critical band borrowed from the priority-lane board: lane
  B's spatial guarantee that a critical always appears in one fixed place, at a tenth of its cost.
- **Pass B · Visual system** — the token sheet, as a plan for approval. Three surfaces lifted off
  true black for a dim room and a 12-hour shift; four priority ramps that are the _only_ saturated
  tokens in the system; Public Sans (descended from Interstate, the highway-signage letterform)
  over IBM Plex Mono for tabular figures; a 4px grid and a 3px radius ceiling. Records three
  directions rejected on sight and four moves taken from motorway-signage vernacular.
- **Pass C · Screens and component states** — five frames at 1440×900 plus the arrival
  choreography and the component state matrix. One incident, a wrong-way driver on CAM-014, runs
  through frames 1–3.

The exported source is in [`docs/design/`](docs/design/) and renders standalone in a browser.
[`docs/DESIGN_INVENTORY.md`](docs/DESIGN_INVENTORY.md) is the design-to-code mapping: every token
and where it lands, every component and its states, every interaction the frames imply but cannot
encode, and every place the design and the brief disagreed.

## Decisions and trade-offs

The full running log is [`docs/DECISIONS.md`](docs/DECISIONS.md). Three worth surfacing here:

- **The design project has two token layers, and the product uses the second one.** Nocturne — the
  design system the brief names — styles the _deck around_ the frames. Every pixel _inside_ all
  five Pass C frames is Pass B's own sheet. `theme.css` therefore ports Pass B; nocturne is kept
  in `docs/design/` as provenance. Porting nocturne instead would have produced a purple,
  Inter-set, 8px-radius dashboard matching none of the frames.
- **The adherence lint did not work as shipped.** oxlint does not implement `no-restricted-syntax`,
  so the design system's three raw-value rules were silent no-ops — a probe file full of
  violations linted clean. They now run under ESLint, where all three fire. A lint that cannot fail
  is worse than no lint, because it reads as a passing check.
- **The frame wins over the brief, in all eleven places they disagree.** Enumerated in
  `DESIGN_INVENTORY.md` §6. Two are substantive: the critical banner never auto-dismisses, and
  `Enter` acknowledges and takes the lock rather than merely opening.

## Architecture

```
Browser ──── SSE ───► /api/events/stream ◄─── POST /api/events/ingest ──── detector-sim
   │                                                                        (phase 3)
   └── Zustand store ─── one shared 1s tick ─── queue · detail · banner
```

One-way server → client over Server-Sent Events, because that is the actual shape of the traffic:
the detector talks, the operator's browser listens. No custom server, no bidirectional plumbing,
auto-reconnect for free, and it works behind Docker unchanged.

## Docker

Four stages. `deps` is isolated so editing source never invalidates the dependency-install layer;
`output: 'standalone'` has Next trace only the dependencies the server actually needs; the runner
drops to a non-root `nextjs` user; and the healthcheck exists because compose cannot order service
startup without one. Current image: **240MB**.

`compose.dev.yml` gives hot reload. Its two anonymous volumes on `node_modules` and `.next` are
load-bearing — without them the host bind mount shadows the container's installed dependencies.

## Scripts

| Command          |                                                       |
| ---------------- | ----------------------------------------------------- |
| `pnpm dev`       | Development server                                    |
| `pnpm build`     | Production build                                      |
| `pnpm lint`      | oxlint + ESLint, including the design-adherence rules |
| `pnpm typecheck` | `tsc --noEmit`                                        |
| `pnpm format`    | Prettier                                              |
