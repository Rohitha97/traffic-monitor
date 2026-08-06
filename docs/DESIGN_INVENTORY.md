# Design inventory — design → code mapping

Produced in phase 0, before any application code. This is the artefact that proves the design
and the build correspond. Every claim here is traceable to a file in [`docs/design/`](design/),
which is a byte-exact export of the Claude Design project.

**Design project:** <https://claude.ai/design/p/395265bf-e8ef-4048-bf51-a354b40e2815>

**Source files read, in the order the brief specifies:**

| #   | File                                            | What it contributed                                                  |
| --- | ----------------------------------------------- | -------------------------------------------------------------------- |
| 1   | `_ds/nocturne-…/readme.md`                      | How the design system is consumed; interaction-state conventions     |
| 2   | `_ds/nocturne-…/_ds_manifest.json`              | Token inventory (50 tokens), component class list                    |
| 3   | `_ds/nocturne-…/styles.css`                     | The nocturne token layer + component classes                         |
| 4   | `_ds/nocturne-…/_ds_bundle.js`                  | Empty — no compiled components (see §7)                              |
| 5   | `_ds/nocturne-…/_adherence.oxlintrc.json`       | Lint rules enforcing design-system adherence                         |
| 6   | `Pass B - Visual system.dc.html`                | **The product token sheet** — surfaces, priority ramps, type, motion |
| 7   | `Pass C - Screens and component states.dc.html` | **Primary implementation target** — 5 frames + state matrix          |
| 8   | `Pass A - Flows and wireframes.dc.html`         | Incident state machine, keyboard model, layout rationale             |
| 9   | `support.js`, `image-slot.js`                   | Authoring-runtime helpers (see §7)                                   |

---

## 0. The headline finding: there are two token layers, and the product uses the second one

This changes how §1 of the build prompt should be executed, so it goes first.

The build prompt instructs: _"Port `styles.css` into a Tailwind v4 `@theme` block… this is the
single source of truth for every colour, type, spacing, and radius value in the build."_

Reading the files, that premise does not hold. **Nocturne styles the presentation wrapper around
the frames; it does not style the product.** The evidence is unambiguous:

| Layer                                                                                         | Painted with                                                                                     | Appears where                                                   |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **Deck chrome** — page background, section eyebrows, headings, caption text, annotation cards | nocturne: `#161826` ground, Inter, `#968ae0` accent, 8px radii                                   | The area _outside_ the 1296×810 frame boxes in all three passes |
| **Product UI** — everything inside the frame boxes                                            | Pass B tokens: `#15181C` ground, Public Sans + IBM Plex Mono, 0/2/3px radii, four priority ramps | Inside every frame in Pass C                                    |

Pass C's own header states it: _"Rendered on the tokens approved in Pass B — three surfaces,
four priority ramps, Public Sans and IBM Plex Mono, a 3px radius ceiling."_ Not one nocturne
colour, font, radius or spacing value appears inside any frame.

This is not a defect in the design — it is the normal shape of a Claude Design project. Nocturne
is the design system the _deck_ is written in; Pass B is the domain token sheet the _product_ is
designed in, derived deliberately from motorway signage vernacular (Pass B §01 documents three
rejected directions and four borrowed moves).

### Resolution ✅ confirmed

Port **both**, in two clearly-separated layers, and hold the fidelity rule where it actually bites:

- `src/styles/theme.css` — the Pass B product tokens as the Tailwind v4 `@theme` block. This is
  what feature code consumes. Token names come from Pass B's own role names, not Tailwind defaults.
- `docs/design/_ds/nocturne-…/styles.css` — retained in the export as the provenance record, and
  cited in the README. Not shipped in the app bundle, because no product surface uses it.

The rule _"tokens are consumed, never re-authored; no arbitrary values in feature code"_ is
enforced exactly as written — against the Pass B layer, which is the layer the screens are drawn in.
Porting nocturne instead would produce a purple, 8px-radius, Inter-set dashboard that matches
none of the five frames.

This is a deviation from the literal wording of the brief, so it was escalated for sign-off at the
end of phase 0 and confirmed before any feature code was written. Everything below assumes it.
Implemented in [`src/styles/theme.css`](../src/styles/theme.css); verified in phase 1 against the
running container — ground `#15181c`, panel `#1c2024`, critical `#ff4433`, 4px grid, 3px chip
radius, Public Sans at 14px/500.

---

## 1. Token inventory

### 1.1 nocturne (`styles.css`) — 50 tokens, and where each one lands

Grouped by role. "Ported" means it enters `theme.css`; "provenance" means it stays in the export
as a record but has no consumer, because no product surface uses it.

| Role             | Tokens                                                   | Value                                  | Disposition                                                                                     |
| ---------------- | -------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Ground / surface | `--color-bg`, `--color-surface`                          | `#161826`, `#232532`                   | Provenance — superseded by Pass B surfaces                                                      |
| Text             | `--color-text`                                           | `#e9e9ed`                              | Provenance — superseded by Pass B text ramp                                                     |
| Accent           | `--color-accent`, `--color-accent-2`                     | `#9184d9`, `#a7a1db`                   | Provenance — the product has no accent hue; saturation is reserved for priority                 |
| Divider          | `--color-divider`                                        | `color-mix(#e9e9ed 16%)`               | Provenance — superseded by `#23272B`                                                            |
| Neutral ramp     | `--color-neutral-100…900` (9)                            | `#f3f5fe` → `#292b31`                  | Provenance                                                                                      |
| Accent ramp      | `--color-accent-100…900` (9)                             | `#f5f4ff` → `#2b2741`                  | Provenance                                                                                      |
| Accent-2 ramp    | `--color-accent-2-100…900` (9)                           | `#f5f4ff` → `#2b293a`                  | Provenance — readme states this is a machine-derived stand-in, "treat them as one role"         |
| Section          | `--color-section`, `-glow`, `-ghost`                     | `#262a60`, `#353b80`, `#4c5397`        | Provenance — readme states these are "deck-scale fills only — not interface colors"             |
| Font             | `--font-heading`, `--font-heading-weight`, `--font-body` | Inter / 500 / Inter                    | Provenance — superseded by Public Sans + IBM Plex Mono                                          |
| Spacing          | `--space-1…8` (6)                                        | 2.8 / 5.6 / 8.4 / 11.2 / 16.8 / 22.4px | Provenance — 0.70× density scale; Pass B replaces it with a 4px grid                            |
| Radius           | `--radius-sm/md/lg`                                      | 4 / 8 / 14px                           | Provenance — Pass B sets a 3px ceiling and explicitly rejects 12px as "soft and consumer-grade" |
| Shadow           | `--shadow-sm/md/lg`                                      | hairline + ambient                     | Provenance — Pass C uses `inset` box-shadows for row state instead                              |

**Carried forward as principle, not as value** — three nocturne conventions survive into the build
because Pass B/C do not contradict them and they are good practice:

- `:focus-visible` is always themed, never a browser default (nocturne readme → our focus ring is
  the Pass C `inset 0 0 0 2px #E8EAED`, neutral, never the priority colour).
- Disabled controls drop to 45% opacity.
- Elevation on a dark ground is "an edge plus ambient darkness", not stacked shadows.

### 1.2 Pass B product tokens → Tailwind v4 `@theme`

This is the real port. Tailwind v4 namespaces used: `--color-*`, `--font-*`, `--text-*`,
`--spacing`, `--radius-*`, `--ease-*`.

#### Surfaces

| Design name           | Value     | `@theme` token   | Utility     | Notes                                                                |
| --------------------- | --------- | ---------------- | ----------- | -------------------------------------------------------------------- |
| Surface 0 · ground    | `#15181C` | `--color-ground` | `bg-ground` | ~9% luminance floor; lifted off true black deliberately (Pass B §02) |
| Surface 1 · panel     | `#1C2024` | `--color-panel`  | `bg-panel`  | Status bar, queue rows, side panels                                  |
| Surface 2 · raised    | `#262B30` | `--color-raised` | `bg-raised` | Banner, modal, selected row                                          |
| _(unnamed in Pass B)_ | `#0D0F12` | `--color-well`   | `bg-well`   | ⚠️ Used in Pass C for the snapshot well only. See §5.1               |

#### Text

| Design name           | Value     | `@theme` token           | Contrast vs ground                    |
| --------------------- | --------- | ------------------------ | ------------------------------------- |
| Text primary          | `#E8EAED` | `--color-text-primary`   | 14.77 : 1                             |
| Text secondary        | `#9AA1AB` | `--color-text-secondary` | 6.83 : 1                              |
| Text tertiary         | `#676E77` | `--color-text-tertiary`  | 3.45 : 1 — large or tabular only      |
| _(unnamed in Pass B)_ | `#CFD3E0` | `--color-text-body`      | ⚠️ Used 20+ times in Pass C. See §5.1 |

#### Borders

| Design name       | Value     | `@theme` token             | Notes                                                    |
| ----------------- | --------- | -------------------------- | -------------------------------------------------------- |
| Border, hairline  | `#23272B` | `--color-border-hairline`  | Row and rule dividers. Decorative — not contrast-bearing |
| Border, component | `#6B737B` | `--color-border-component` | Inputs, region boundaries. Held to the 3:1 UI floor      |

#### Priority — the only saturated tokens

Each priority carries **five** cues, not one. This is the accessibility spine of the whole design.

| Priority | Colour    | Ratio     | Border-left | Shape                                            | Sign taxonomy |
| -------- | --------- | --------- | ----------- | ------------------------------------------------ | ------------- |
| Critical | `#FF4433` | 5.2 : 1   | 4px         | triangle `polygon(50% 0,0 100%,100% 100%)`       | danger        |
| High     | `#FFA426` | 8.98 : 1  | 3px         | diamond `polygon(50% 0,100% 50%,50% 100%,0 50%)` | warning       |
| Medium   | `#E4C230` | 10.22 : 1 | 2px         | circle `border-radius:50%`                       | caution       |
| Low      | `#5B8DEF` | 5.51 : 1  | 1px         | square `border-radius:3px`                       | info          |

`@theme`: `--color-critical`, `--color-high`, `--color-medium`, `--color-low`.
Border widths and clip-paths are not colours — they live in a typed `PRIORITY` map in
`src/lib/priority.ts` so a row and a chip and a status-bar count can never disagree.

#### System state — deliberately lower chroma than the priority ramp

Pass B §02: _"a glance must never confuse 'connection degraded' with 'high priority'."_

| State        | Colour    | Ratio    | Motion                                             |
| ------------ | --------- | -------- | -------------------------------------------------- |
| Live         | `#5BA98C` | 6.36 : 1 | none — steady                                      |
| Reconnecting | `#B98A4A` | 5.76 : 1 | `pulse 1.6s ease-in-out infinite`, opacity 1 ↔ 0.5 |
| Offline      | `#9B5C5C` | 3.46 : 1 | none — static, paired with a frozen timestamp      |

`@theme`: `--color-live`, `--color-reconnecting`, `--color-offline`, `--animate-pulse-status`.

#### Type

Two families, both justified in Pass B §03 and both load-bearing:

| Token         | Family                                 | Why                                                                                                |
| ------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `--font-ui`   | `"Public Sans", system-ui, sans-serif` | Descends from Interstate, the US highway-signage letterform. A road typeface, not a marketing face |
| `--font-mono` | `"IBM Plex Mono", monospace`           | True tabular-lining figures, so a counter ticking once a second never reflows its neighbours       |

Every numeric surface sets `font-variant-numeric: tabular-nums`.

UI scale (Pass B) → `--text-*`:

| px / weight / line-height | Token            | Use                                             |
| ------------------------- | ---------------- | ----------------------------------------------- |
| 11 / 500 / 16             | `--text-micro`   | Dense micro-metadata — queue row secondary line |
| 12 / 500 / 16             | `--text-kicker`  | Kicker labels, section eyebrows                 |
| 13 / 500 / 18             | `--text-caption` | Captions                                        |
| 14 / 500 / 20             | `--text-ui`      | UI default — buttons, inputs, queue row primary |
| 16 / 500 / 22             | `--text-body`    | Detail-pane body copy                           |
| 18 / 600 / 24             | `--text-title`   | Incident title, subsection headings             |
| 20 / 600 / 26             | `--text-panel`   | Panel headings                                  |
| 24 / 600 / 30             | `--text-dialog`  | Dialog title — the only heading this large      |

Mono scale: 11 (`--text-mono-micro`), 12 (`--text-mono-meta`), 14 (`--text-mono-age`),
16/600 (`--text-mono-hero`).

⚠️ Pass C does not sit on this scale. See §5.2.

#### Spacing

Pass B: _"4px base grid. Every gap, padding and offset in the system is a multiple of 4."_
Ticks drawn: 4, 8, 12, 16, 20, 24, 32, 40, 48.

Tailwind v4 maps this in one line — `--spacing: 4px` — which generates the whole dynamic scale
(`p-1`=4px … `p-12`=48px) with no per-step tokens and no arbitrary values. The nine drawn ticks
become `1 2 3 4 5 6 8 10 12`.

#### Radius — a ceiling, not a scale

| Value | `@theme` token     | Applies to                                              |
| ----- | ------------------ | ------------------------------------------------------- |
| 0px   | `--radius-panel`   | Panels, rows, cells — "an instrument bezel, not a card" |
| 2px   | `--radius-control` | Buttons, inputs, frames                                 |
| 3px   | `--radius-chip`    | Priority chips — the ceiling                            |

Pass B explicitly renders and rejects 12px. That rejection is worth preserving in the token names.

#### Motion

| Token                    | Value                        | Applies to                                            |
| ------------------------ | ---------------------------- | ----------------------------------------------------- |
| `--ease-row`             | `cubic-bezier(.2,.7,.3,1)`   | Row insertion, 180ms                                  |
| `--ease-banner`          | `cubic-bezier(.16,.8,.24,1)` | Banner entry, 220ms                                   |
| _(linear)_               | `120ms linear`               | State transition — crossfade only, zero layout change |
| `--animate-pulse-status` | `1.6s ease-in-out infinite`  | Reconnecting dot only                                 |

Durations live beside the easings as `--duration-row: 180ms` etc. so no component hard-codes them.

---

## 2. Component inventory — every component in Pass C, its states, and its owner

Names follow the design's own vocabulary, per the fidelity rule. A reviewer with Pass C open
should be able to trace each name straight across.

| #   | Design element                | React component       | States drawn in Pass C                                                                                                                                 |
| --- | ----------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Status bar (48px)             | `StatusBar`           | Live / reconnecting / offline · muted / unmuted · with and without open-counts (F1 vs F2)                                                              |
| 2   | Connection indicator          | `ConnectionIndicator` | `LIVE`, `RECONNECTING` (pulsing), `OFFLINE` (+ frozen timestamp) — 3                                                                                   |
| 3   | Open counts by priority       | `OpenCounts`          | 4 priority shapes with tabular counts                                                                                                                  |
| 4   | Priority chip                 | `PriorityChip`        | 4 priorities × 3 sizes (row 10px, detail-header 9–11px, matrix 12px)                                                                                   |
| 5   | Queue row                     | `IncidentRow`         | Default, Hovered, Keyboard-focused, Selected, New & unread, Ageing past SLA, Acknowledged, Dispatched, Dismissed-strip, Critical-arrival tint — **10** |
| 6   | Critical banner (52px)        | `CriticalBanner`      | Hidden (0px) → entering → present. Does **not** auto-dismiss                                                                                           |
| 7   | Buffered new-events bar       | `BufferedEventsBar`   | Neutral (`+3 new events`), Critical-escalated (`+4 new · 1 critical`) — 2                                                                              |
| 8   | Detail pane                   | `IncidentDetail`      | New, Acknowledged (owner block + acknowledged action bar), Empty/no-selection                                                                          |
| 9   | Snapshot                      | `CameraSnapshot`      | Loaded, Loaded + detection box, Failed (`Snapshot unavailable` + Retry), Empty — 4                                                                     |
| 10  | Facts panel                   | `FactsPanel`          | Fixed 4 rows: Location · Mile marker · Detection latency · Confidence                                                                                  |
| 11  | Nearby cameras                | `NearbyCameras`       | Linear mile-marker schematic, this-incident pin pulsing. ⚠️ See §5.3                                                                                   |
| 12  | Audit trail                   | `AuditTrail`          | System entries and operator entries                                                                                                                    |
| 13  | Decision bar                  | `ActionBar`           | Unacknowledged (3 buttons), Acknowledged (Dispatch + owner line + Dismiss) — 2                                                                         |
| 14  | Empty queue                   | `EmptyQueue`          | 1                                                                                                                                                      |
| 15  | Offline banner + dimmed queue | `OfflineNotice`       | 1                                                                                                                                                      |
| 16  | Low-confidence card           | `LowConfidenceCard`   | 1 — `NEEDS VERIFICATION` tag, `Confirm as Medium` / `Dismiss, not real`                                                                                |
| 17  | Tab title + favicon           | `useTabAlert` (hook)  | `Incident Monitor — Sector 4` ↔ `(1) CRITICAL · Incident Monitor`                                                                                      |
| 18  | Dismiss reason picker         | `DismissReasonDialog` | 5 reasons, from Pass A: shadow · spray · parked on hard shoulder · camera artefact · already known                                                     |

All 18 get a demo at `/dev/states`, grouped in this order.

### 2.1 The state matrix in detail (Pass C frame 4)

Verbatim from the frames, because this is the part a reviewer will diff against the design:

| State            | Visual treatment                                    | Caption in the design                                         |
| ---------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| Default          | Baseline row, no shadow                             | "Baseline row — no special state."                            |
| Hovered          | `inset 0 0 0 1px #23272B`                           | "background lifts one step, no colour added"                  |
| Keyboard-focused | `inset 0 0 0 2px #E8EAED`                           | "2px inset, neutral, **never the priority colour**"           |
| Selected         | Text weight 600, `bg-raised`                        | "Persistent highlight — stays while the detail pane shows it" |
| New & unread     | Weight 600 + white dot + age in primary             | "Clears the moment it's opened"                               |
| Ageing past SLA  | Age gains weight + `SLA` outline tag                | "contrast, not a new hue"                                     |
| Acknowledged     | Owner initials badge (`JK`) replaces the unread dot | "Clock keeps running"                                         |
| Dispatched       | Unit + ETA replace the raw description              | "Calm treatment"                                              |
| Dismissed        | Collapses to a **20px** strip, reason + Undo, 8s    | "holds 8s, then leaves"                                       |

Two rules from that table are worth calling out because they are easy to get wrong and both are
accessibility decisions: the focus ring is **neutral, never the priority colour** (so focus is
never confusable with severity), and hover adds **no colour at all** (so colour stays exclusively
a priority signal).

---

## 3. Interactions the frames imply but cannot themselves encode

Sources: Pass B §05 (motion tokens, with live replay), Pass C frame 2 (filmstrip + live replay),
Pass A §02 (state machine).

### 3.1 Motion tokens

| Transition         | Duration  | Easing                       | What actually moves                                                                              |
| ------------------ | --------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| Row insertion      | 180ms     | `cubic-bezier(.2,.7,.3,1)`   | `translateY(-6px) → 0`, opacity `0 → 1`. "Pushed, never jumped"                                  |
| Banner entry       | 220ms     | `cubic-bezier(.16,.8,.24,1)` | `height 0 → 52px` + opacity. **Expands and pushes content down — never overlays**                |
| State transition   | 120ms     | `linear`                     | Colour and label crossfade only. **Zero layout change**, so the row never moves under the cursor |
| Reconnecting pulse | 1.6s loop | `ease-in-out`                | opacity 1 ↔ 0.5. Runs only while degraded, stops the instant the state changes                   |
| Dismissed strip    | holds 8s  | —                            | Row collapses to 20px, then leaves                                                               |
| Resolved row       | 3s fade   | —                            | Leaves the queue, lands in the shift log (Pass A)                                                |

### 3.2 The arrival choreography, frame by frame

Pass C frame 2 draws this as a three-cell filmstrip with exact clock values:

- **T + 0.0s** (`02:14:07.0`) — nothing on screen. "The detector has fired but the UI hasn't painted it."
- **T + 0.3s** (`02:14:07.3`) — banner expanded from 0; row inserted into the pinned band. "Both
  finish inside 220ms." Row carries the critical tint `rgba(255,68,51,0.10)` and the unread dot.
- **T + 8s** (`02:14:15.0`) — **"Banner has not auto-dismissed — nothing does."** Row still unread.
  "The age counter is the only thing moving." Row tint has cleared; the unread dot has not.

The tab title flips in the same frame as the banner: `Incident Monitor — Sector 4` →
`(1) CRITICAL · Incident Monitor`, with the tab dot going `#6B737B` → `#FF4433`.

### 3.3 The incident state machine (Pass A §02)

```
        Enter                D                     R
New ──────────────► Acknowledged ──────────► Dispatched ──────────► Resolved
 │                       │
 │  X + reason           │  X + reason
 └───────────┬───────────┘
             ▼
        Dismissed  ──── re-detect within 3 min ────►  New ("seen before")
```

Rules the diagram carries that the frames cannot:

- **Acknowledge takes the lock.** Other operator positions see the row greyed with the owner's
  initials — "two operators never dispatch the same call."
- **Dismissed is reachable from `new` or `acknowledged`, never from `dispatched`.**
- **Auto-escalation:** a `new` critical unacknowledged for **20s** re-fires its banner and pushes
  to the supervisor position. This appears in Pass C's audit trail as a real entry:
  `02:14:19 — Unacknowledged 20s — banner re-fired, pushed to supervisor (system)`.
- **Nothing auto-dismisses, ever.**
- **Resolved** on team clearance, or when the detector's condition stops holding for 60s.
- **Reopen:** a dismissed incident re-detecting within 3 minutes returns as `new`, tagged
  "seen before", carrying the earlier dismissal reason on the row.
- Acknowledged rows show the age counter "in amber past 60s".

### 3.4 Reduced motion

Pass B §05, verbatim intent: every duration collapses to 0–100ms and drops its transform in
favour of a plain opacity swap; anything that loops (only the reconnecting pulse) stops looping
and becomes a static state plus its label. _"No token here relies on motion to carry information
that colour, icon and text don't already carry."_

Implementation: one `@media (prefers-reduced-motion: reduce)` block in `globals.css` that
retargets the duration custom properties, so no component branches on it in JS.

### 3.5 The eye path (Pass A), which fixes DOM order

- **Queue (frame 1):** queue head first (1 → 2) _because that is where change appears_; detail
  pane second (3); action bar third (4). The status bar is **deliberately outside the path** —
  "glanced at, never read."
- **Detail (frame 3):** priority strip and its stated reason (1) → snapshot (2) → the four facts
  that change the decision (3) → action bar (4). Audit trail and map are "reference, not path."

DOM order will match this exactly, which also gives a sensible screen-reader and tab order for free.

---

## 4. Schema deltas — fields the frames display that the brief's schema lacks

The brief says: _"If `Pass C` displays a field this schema does not have, add it."_ Six additions,
each with the frame that demands it.

| Field                             | Needed by                         | Why the frame cannot render without it                                                                           |
| --------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `camera.laneCount: number`        | F2 banner, F3 reason              | "Live lane **2 of 3**" — `laneNumber` alone gives "2", not "of 3"                                                |
| `detectionBox?: { x, y, w, h }`   | F3 snapshot                       | The 2px dashed critical rectangle over the snapshot, positioned at 36%/28%/24%/36% with a `96%` confidence label |
| `dispatch?: { unit, etaMinutes }` | Matrix "Dispatched"               | Row reads `Unit 12 · ETA 4 min` in place of the description                                                      |
| `dismissal?: { reason, at }`      | Matrix "Dismissed", Pass A reopen | The 20px strip shows the reason; a reopened event carries the prior one                                          |
| `seenBefore?: boolean`            | Pass A reopen rule                | The "seen before" tag on a re-detected event                                                                     |
| `resolvedAt?: string`             | Pass A `Resolved`                 | Row leaves after a 3s fade and lands in the shift log                                                            |

Plus one **system-level** field that is not on the event at all — the status bar's `18 / 18 feeds
live` needs a `feeds: { online, total }` on the connection slice, not on `DetectionEvent`.

Derived, not stored (so they cannot drift): detection latency (`receivedAt − detectedAt`, rendered
as `0.6s`), live age, open counts by priority, `SLA` breach.

No field in the brief's schema is unused. `status: 'resolved'` is exercised by Pass A's exit
transition even though no Pass C frame draws it.

---

## 5. What cannot be built exactly as drawn — with proposed alternatives

Five items. Three I can resolve myself and have; two need your call and are flagged.

### 5.1 Four values are used in Pass C that Pass B never defined

`#0D0F12` (snapshot well, 3 frames) and `#CFD3E0` (a fourth text level, 20+ uses) appear in Pass C
but are absent from Pass B's approved token sheet. Pass C's header claims _"Nothing below
introduces a new colour"_ — it does, twice. Also `rgba(255,68,51,0.10)` (new-critical row tint) and
`rgba(13,15,18,.6)` (OSD plate) are compositions rather than tokens.

**Proposed:** promote all four to named tokens — `--color-well`, `--color-text-body`,
`--color-critical-tint`, `--color-osd-plate` — with this section as the record of why they exist.
The alternative (hard-coding them at each use site) is exactly the drift the adherence lint exists
to catch. **Resolved this way unless you object.**

### 5.2 Pass C does not sit on Pass B's own type scale

Pass B declares 11 / 12 / 13 / 14 / 16 / 18 / 20 / 24. Pass C renders 9.5, 10, 10.5, 11, 11.5,
12, 12.5, 13, 15, 18, 20 — six sizes that are not on the approved scale, most of them half-pixel.
Pass C also uses 18px detail-pane padding and a 118px panel, both off the declared 4px grid.

**Proposed:** snap to Pass B's scale, since it is the approved token sheet and the brief's own rule
is that tokens are consumed rather than re-authored. Every delta is ≤1px and none changes a line
count or a layout break. The one exception is the queue row's 12.5px primary line, which sits
between two scale steps and is load-bearing for the "twelve rows at 1440×900 without scrolling"
density target — I will verify the row count at 13px before snapping it, and keep 12.5px as a
token if 13px costs a row. **Resolved this way unless you object;** the density check is a phase-2
verification item.

### 5.3 ⚠️ "Nearby cameras" is a schematic strip, not a map — and the stack mandates maplibre

The brief's stack table specifies maplibre-gl + react-map-gl on a CARTO basemap. Pass C frame 3
draws something quite different: a **118px linear schematic** — one vertical roadway line, three
camera pins at mile markers 41.0 / 42.3 / 43.6, the incident pin pulsing at 12px with a glow ring,
and a `↓ flow / ↑ wrong-way` legend. No basemap, no geography, no pan or zoom. Pass A classes it
as "reference, not path."

The two are not reconcilable — this is the conflict the brief asks me to surface rather than
silently resolve. **This one needs your decision** and is question 2 in my phase-0 summary.

### 5.4 ⚠️ The adherence lint config contradicts the design's own type choices

`_adherence.oxlintrc.json` declares `fontFamilies: ["Inter"]` and a rule that flags any
`font-family` that is not Inter. The product is set in Public Sans and IBM Plex Mono. Run as
shipped, the adherence config flags the design's own decisions.

**Resolved:** the config is wired in with one amendment — `fontFamilies` and the font selector
carry the two families the design actually uses. Both raw-value rules are kept unchanged; they are
the valuable ones and they catch precisely the `p-[13px]` / `text-[#1a1d21]` drift the brief names.
`.oxlintrc.json` in the repo root can be diffed against the original in `docs/design/_ds/…/` so
the amendment is auditable.

> **Verified in phase 1, and the finding changed the plan.** Two things I asserted here turned out
> to be wrong, both caught by actually running the linter rather than reasoning about it:
>
> 1. **oxlint does not implement `no-restricted-syntax` at all.** Version 0.15.15 does not list the
>    rule, so all three adherence selectors were silent no-ops — a probe file containing
>    `p-[13px]`, `text-[#1a1d21]` and a bad `font-family` linted clean. The rules now live in
>    `eslint.config.mjs`, whose implementation supports the esquery attribute-regex selectors the
>    config is written in; all three fire on the probe. oxlint stays in `pnpm lint` for its fast
>    general rule set. Adherence is enforced as the brief requires — only the engine changed.
> 2. **No `theme.css` exemption is needed.** Neither linter reads CSS, so the hex and `px` rules
>    were never going to flag the token layer. The claim was wrong and the exemption was dropped.
>
> The rules earned their place immediately: the first run against real code caught a raw
> `themeColor: '#15181c'` in `layout.tsx`. Fixed by removing it rather than suppressing it — the
> codebase carries zero lint exceptions.

Two rules in the config (`react/forbid-elements`, `no-restricted-imports`) ship with empty lists and
are inert. Left empty rather than inventing restrictions the design did not ask for.

### 5.5 The `HIGH` chip is drawn inconsistently

Frame 2's detail header renders `HIGH` as a **triangle**; the priority legend, the `PR` map that
drives every queue row, and the status-bar counts all render it as a **diamond**. Three of four
occurrences say diamond, and diamond is what Pass B's sign-taxonomy rationale specifies (danger /
warning / caution / info → triangle / diamond / circle / square).

**Proposed:** diamond, everywhere. Frame 2's header is a one-off slip. **Resolved this way.**

---

## 6. Conflicts between the build prompt's §5 and the frames

The brief states: _"Where a frame and this section disagree, the frame wins — flag the conflict
and ask."_ Eleven disagreements. The frame wins in all of them; listed so the choice is auditable.

| #   | Build prompt §5                                                 | The design                                                                                                 | Resolution                                                                        |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | Banner "holds for 8 seconds, collapses into the queue"          | _"Banner has not auto-dismissed — nothing does"_ (F2 filmstrip); _"Nothing auto-dismisses, ever"_ (Pass A) | Banner persists until Acknowledge or View. Auto-escalation at 20s **re-fires** it |
| 2   | `N` loads buffered events                                       | `Press Home, or click to jump to newest`                                                                   | `Home`. `N` kept as an undocumented alias                                         |
| 3   | Buffered copy: `3 new events — press N to load`                 | `+3 new events` / `+4 new · 1 critical`                                                                    | Design copy                                                                       |
| 4   | Undo toast, holds 5s                                            | Row collapses to a 20px inline strip with Undo, holds 8s                                                   | Inline strip, 8s. No toast component                                              |
| 5   | Age thresholds 60s / 120s by priority                           | 20s critical auto-escalation; amber past 60s once acknowledged; `SLA` outline tag                          | Design timings                                                                    |
| 6   | `J`/`K` next/previous                                           | `↑↓ moves and previews`                                                                                    | `↑↓` primary, `J`/`K` aliases                                                     |
| 7   | `Enter` **opens** the selected event                            | `Enter` **acknowledges and takes the lock** (Pass A state machine + note 3)                                | Design semantics. This is a real difference: selection previews, Enter commits    |
| 8   | `A` acknowledge                                                 | `Enter` acknowledges                                                                                       | `Enter` primary, `A` alias                                                        |
| 9   | _(absent)_                                                      | `R` clears → Resolved                                                                                      | `R` added                                                                         |
| 10  | `Dispatch response` / `Acknowledge` / `Dismiss`                 | `Dispatch` / `Acknowledge only` / `Dismiss, not real ▾`                                                    | Design copy — "a control's verb becomes its confirmation" (Pass C copy rules)     |
| 11  | Empty state `No active incidents. 12 feeds online, monitoring.` | `Queue clear` / `All 18 feeds live. New detections appear here automatically.`                             | Design copy                                                                       |

Also reconciled, no conflict: `Esc`, `X`, `D`, `1`–`4`, `0`, `M`, `G`, `?` are all compatible with
the design and ship as specified.

One more, not a conflict but a gap the design fills: the brief asks for a low-confidence flag.
Pass C frame 5 goes further and draws the whole affordance — a dashed-border card, a
`NEEDS VERIFICATION` outline tag, the confidence in mono, and a `Confirm as Medium` button that
lets the operator _promote_ the demoted event. That promotion path is not in the brief. It ships.

---

## 7. `support.js` and `image-slot.js`

| Behaviour                                                                                                                                                                 | What it is                                                                  | Disposition                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **support.js** (1,911 lines) — `<x-dc>` template parsing, `{{ }}` interpolation, `sc-for`, `sc-if`, the `DCLogic` class, `data-props` Tweaks panel, React/Babel bootstrap | The Claude Design authoring runtime. Renders design documents in the editor | **Dropped in full.** Zero product behaviour. React replaces every part natively: `sc-for` → `.map()`, `sc-if` → conditional render, `DCLogic.renderVals()` → the component body, the Tweaks panel → controls on `/dev/states` |
| **image-slot.js** (1,225 lines) — `<image-slot>` custom element                                                                                                           | A user-fillable image placeholder for design documents                      | **Split** — see below                                                                                                                                                                                                         |
| ↳ sized-to-container image frame, `fit: cover` baseline                                                                                                                   | Product-relevant                                                            | **Ported** into `CameraSnapshot` as plain CSS `object-fit: cover`                                                                                                                                                             |
| ↳ empty state with a `placeholder` caption                                                                                                                                | Product-relevant                                                            | **Ported** — becomes the "no snapshot yet" state                                                                                                                                                                              |
| ↳ drag-and-drop fill, click-to-browse                                                                                                                                     | Authoring-time only                                                         | **Dropped** — snapshots come from the detector, not the operator                                                                                                                                                              |
| ↳ `.image-slots.state.json` sidecar persistence via `window.omelette`                                                                                                     | Authoring-time only, and depends on the Claude Design host bridge           | **Dropped**                                                                                                                                                                                                                   |
| ↳ double-click reframe: pan, scale, corner handles, crop persistence                                                                                                      | Authoring-time only                                                         | **Dropped**                                                                                                                                                                                                                   |
| ↳ Unsplash credit overlay + utm referral enforcement                                                                                                                      | Authoring-time only; our snapshots are committed local stills               | **Dropped**                                                                                                                                                                                                                   |

**Checked, as the brief asks:** `image-slot.js` does **not** provide a per-type broken-image
fallback. Its only error tile is the Unsplash-attribution compliance case
(`isUnsplashHost` → error rather than render). So §5.7's per-type snapshot fallback is written
fresh — and the design already draws it, in Pass C frame 5: a dashed `#6B737B` border on the well,
a struck-through camera glyph, `Snapshot unavailable`, _"The camera feed may be delayed. Retry, or
continue from the description below."_, and a `Retry` button. That frame is the spec.

`_ds_bundle.js` contains no components — it is an empty namespace shim
(`components: []`, `sourceHashes: {}`). Nothing to port. Nocturne is a CSS-only system whose
components are plain classes, which is consistent with its readme: _"the component pages are plain
HTML, so view source and copy the markup."_

---

## 8. Layout constants extracted from the frames

Not tokens, but load-bearing, and a reviewer will measure them. All from Pass C unless noted.

| Region                         | Value                                 | Source                                            |
| ------------------------------ | ------------------------------------- | ------------------------------------------------- |
| Frame canvas                   | 1440 × 900 (drawn at 1296 × 810, 90%) | Pass C header                                     |
| Status bar height              | 48px                                  | F1, F2 (Pass A wireframe said 44px — Pass C wins) |
| Critical banner height         | 52px                                  | F2 (Pass A wireframe said 64px — Pass C wins)     |
| Queue width                    | 432px                                 | F1, F2                                            |
| Queue header height            | 36px                                  | F1, F2                                            |
| Queue row height               | 40px                                  | F1, F2                                            |
| Rows visible without scrolling | 12                                    | Pass A note 3, Pass B "density over comfort"      |
| Detail pane padding            | 18px (F1/F2), 20px (F3)               | See §5.2                                          |
| Evidence / facts split         | `flex: 1.3` / `flex: 1`               | F1, F3                                            |
| Nearby-cameras panel           | 118px                                 | F3                                                |
| Action bar                     | 44px, buttons 36px                    | F1, F3                                            |
| Matrix row height              | 52px                                  | F4                                                |
| Dismissed strip height         | 20px                                  | F4                                                |

---

## 9. Open questions — all resolved

Three decisions were escalated at the end of phase 0. All three were confirmed as proposed.

| #    | Question                                                         | Resolution                                                                                            |
| ---- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| §0   | Which token layer becomes the product `@theme`?                  | **Pass B.** Nocturne stays in `docs/design/` as provenance and is cited in the README                 |
| §5.3 | maplibre + CARTO, or the linear schematic?                       | **The schematic**, as drawn. Recorded as a deliberate deviation from the stack table                  |
| §5.2 | Snap type to Pass B's scale, or carry Pass C's half-pixel sizes? | **Snap to Pass B**, with the queue row's 12.5px line verified against the 12-row density target first |

§5.1 (four undeclared values promoted to tokens), §5.4 (adherence config amended for the two extra
font families and the token layer) and §5.5 (`HIGH` is a diamond everywhere) were resolved as
proposed. All six are logged in [`DECISIONS.md`](DECISIONS.md).
