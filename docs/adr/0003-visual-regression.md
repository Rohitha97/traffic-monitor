# ADR-0003 — Visual regression against the state matrix

**Status:** accepted
**Date:** 2026-08-10
**Roadmap:** #5

## Context

The adherence lint proves every value in feature code comes from a token. It cannot prove the
result still looks like the frame — a row built entirely from legal tokens can drift two steps of
padding away from Pass C and lint clean. `/dev/states` already renders every component state the
design draws, so the gallery to diff against exists; only the diffing was missing.

## Decisions

### One capture per state, of the element, not the page

A single screenshot of the whole gallery fails opaquely — "something changed" — and gets
`--update-snapshots`'d into uselessness within a week. Each state fails on its own name instead.

Captures target the state's element via a `data-vrt` attribute rather than the viewport. That keeps
the dev-server overlay, the section headings and neighbouring states out of frame, so a diff can
only have been caused by the component itself. The deliberate-regression check below shows what
this buys.

### The suite refuses to run outside Linux

Font rasterisation differs enough between platforms that a snapshot taken on Windows or macOS will
never match CI. Rather than carry a platform suffix — which would let someone generate and commit
`win32` snapshots that nothing ever compares against — the suite skips with an explanatory message,
and both capture and comparison happen in `mcr.microsoft.com/playwright`, pinned to the installed
`@playwright/test` version via `scripts/visual.mjs`.

### `maxDiffPixelRatio: 0.01`

Deliberate, and the two ends were measured rather than guessed. Text antialiasing varies by a pixel
or two between runs even on identical hardware, so zero tolerance flakes within a day. The failure
this has to catch — 2px of padding on a 432×40 row — shifts the text and every glyph after it, a
double-digit percentage of the element. 1% sits comfortably between them.

### The collapsed banner is checked by dimension, not by image

`banner/collapsed` is zero-height by design, so `toBeVisible()` fails and there is nothing to
photograph. An image of an empty element would pass no matter what changed around it.

It gets a dimensional assertion instead: zero height **and zero bottom border**. The second half is
the real regression — a permanent 2px red rule across a quiet screen shipped in phase 3 precisely
because only the height was conditional. A screenshot would never have caught it.

### A completeness test, so coverage cannot rot

`matches the state matrix exactly` compares the ids in the DOM against the list the suite iterates.
Adding a state to the page without adding it to the suite fails loudly rather than going quietly
uncovered.

## Verification

**Deliberate regression.** `IncidentRow` padding `px-2.5` → `px-3` (2px) failed exactly nine
states — `default`, `hovered`, `focused`, `selected`, `unread`, `sla`, `acknowledged`,
`dispatched`, `arriving`. `queue-row/dismissed` passed, correctly: that state renders
`DismissedStrip`, a different component. The suite localises drift to its cause rather than
reporting that the page changed.

**Stability.** Three consecutive runs, 27 passed each, snapshots unchanged.

## What this cost, and what it found

Two flakes surfaced during bring-up, both in my own test code rather than in the application:

- `matches the state matrix exactly` used `evaluateAll`, a single-shot DOM read with no auto-retry,
  so on a slow run it sampled the page mid-render. Now gated behind `toHaveCount`, which retries.
- Two assertions timed out on a run that took 18.9 minutes instead of 1.8 under machine load. The
  5s default expect timeout is optimistic against a dev server that recompiles per navigation;
  raised to 15s, with a 90s per-test ceiling for the visual project.

Neither was a screenshot disagreeing. That matters for the tolerance argument: across every run,
including the pathologically slow one, no image ever flaked.

And one genuine self-inflicted regression, worth recording because the failure mode was opaque.
Adding a second web server to the Playwright config broke **ten of the eleven behaviour tests**.
`next dev` and `next start` share `.next`, so running both meant the dev server rewrote the build
directory out from under the production server mid-suite. The page still server-rendered — the
markup was all there — but its client chunks were gone, so hydration failed silently, the SSE
connection was never opened, and every test that waited for an event timed out against a page that
could never receive one.

Nothing in the failure output pointed at the cause: the symptom was "banner present but collapsed,
no rows", which reads exactly like an application bug. What identified it was checking the server
by hand — `curl` the ingest route, then the stream — and finding both perfect, which moved the
suspicion from the app to the harness. The config now starts exactly one server per run, selected
by `PW_VISUAL_ONLY`.

## Consequences

`/dev/states` is now load-bearing rather than documentation, and it only exists under `next dev` —
phase 6 excluded it from production builds. So the suite runs against a second web server, and the
config carries two projects. That is the right trade: the alternative is shipping development
scaffolding to production to keep a test happy.

Two follow-ups went onto the roadmap as a result:

- `Button`'s hover and active states are not in the matrix, so nothing captures them.
- The matrix renders components from sample props while the app renders them from the store. A
  component could satisfy every snapshot and still be wired up wrongly.
