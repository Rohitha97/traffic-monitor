# ADR-0005 — Virtualising the queue

**Status:** accepted
**Date:** 2026-08-11
**Roadmap:** #3

## Context

Twelve rows is the design target — Pass A specifies "twelve rows at 40px visible at 1440×900
without scrolling" — but a bad hour on a real motorway is hundreds of open incidents, and every one
of them was a mounted DOM node re-rendering on the shared one-second tick.

Two things made this a wrapper rather than a rewrite, and both were decided long before this item:
`IncidentRow` is a fixed 40px, so the virtualiser never has to measure or guess; and every age
counter reads one shared store field, so a windowed row costs nothing extra to keep current.

## Decisions

### Navigation reads the store, never the DOM

This was already true and is the reason the refactor was safe. `moveSelection` finds the current
index in the filtered queue array and clamps — it has never touched the DOM. In a windowed list
that stops being an implementation detail and becomes the whole ballgame: the selected row is
usually not mounted, so anything reading the DOM to navigate would simply stop working past the
first screenful.

The one place that _did_ read the DOM was bringing the selection into view — a
`querySelector('[data-event-id=…]')` and `scrollIntoView`. That is now
`virtualizer.scrollToIndex(index)`, which works whether or not the row exists.

### The view stays anchored when incidents are prepended

Buffering already stops routine arrivals from reordering the queue while an operator is reading.
But a critical is designed to jump the buffer, and in a windowed list inserting at index 0 shifts
every row by 40px under the operator's eye — breaking the exact guarantee buffering exists to
protect, in a place the original rule never had to consider.

A layout effect compensates the scroll offset by the height of whatever was inserted above the
current position. Layout effect rather than effect, because after paint is too late: the shift
would be visible as a jump.

Verified by disabling the compensation and re-running the test, which then reported a _different
incident_ under the operator's eye — the failure the assertion exists to catch.

### Only genuinely new incidents animate

Virtualised rows mount and unmount as they scroll, so the row-insertion animation would have fired
every time a row scrolled into view and the queue would shimmer whenever anyone moved. A ref of
already-seen ids gates it, so the 180ms insertion still plays for an arrival and never for a scroll.

`AnimatePresence` came out for the same reason: an exit animation on a windowed list animates rows
_leaving the viewport_, which is not what it means.

### Rows on their way out are not virtualised, and not options

The dismissal strips and fading resolved rows sit outside the virtualiser. They are bounded by an
eight-second window so windowing buys nothing, and — a pre-existing bug this exposed — neither a
dismissal strip nor a row that is fading out is something the operator can still choose, so neither
belongs inside the listbox. Resolved rows now render with `interactive={false}`, dropping out of
the tab order and the accessibility tree.

### `aria-setsize` and `aria-posinset`

Without them a windowed listbox announces the count it rendered. An operator on a screen reader
would be told there are twenty incidents when there are five hundred.

## Verification

**The keyboard specs were not touched.** `git diff --stat -- e2e/` was empty across the refactor and
all of `journey.spec.ts` passed unchanged. That was the brief's own test — "if a spec needs editing
to pass, the refactor broke behaviour" — and it is the strongest evidence here.

**500 incidents, ↑↓ response measured from keystroke to React committing the new selection:**

|                      | median        | p95           |
| -------------------- | ------------- | ------------- |
| Observed across runs | 13.4 – 15.1ms | 18.5 – 27.6ms |

Under one frame at 60Hz, with roughly 15% headroom on the median. Measured to DOM commit rather
than to paint deliberately: waiting for a frame would measure the display's refresh interval rather
than this application's render cost. The first ten samples are discarded as warm-up.

**Mounted rows:** fewer than 50 out of 500, which is a viewport's worth plus overscan.

**Visual regression: 27 passed, no snapshot changes.** The refactor altered no component's
appearance, which is what item #5 was sequenced first to be able to say.

**Metrics, before and after** (`pnpm baseline`, same scripted pass):

|                   | before p50 | after p50   | before p95 | after p95   |
| ----------------- | ---------- | ----------- | ---------- | ----------- |
| Time to decision  | 2,298ms    | **2,253ms** | 3,074ms    | **3,115ms** |
| Time to awareness | 31,302ms   | 25,679ms    | 57,353ms   | 51,378ms    |

No regression in time to decision — the figure that could have moved. Both differences are inside
run-to-run noise, which is the honest reading: the harness's scripted dwell dominates both numbers,
so this shows _absence of regression_ rather than improvement. The improvement claim, if there is
one, rests on the 500-incident keystroke measurement, which is a direct reading of the thing
virtualisation actually changes.

## Consequences

One flake was observed across five full E2E runs and its cause was not isolated; the perf test's
median bound sits about 15% below observed values, so it is the most likely candidate under CI
load. CI already retries once. Worth watching rather than pre-emptively loosening — a bound that
never fails proves nothing.

Snapshot preloading is **unchanged**, and I initially wrote here that it now followed the window —
which was wrong, and checking rather than assuming is the only reason it is not in the commit. The
effect iterates the whole `queue` array, not the mounted rows, so a 500-incident queue still warms
500 snapshots regardless of what is rendered.

That is harmless today only by accident: snapshots are one SVG per _event type_, so five hundred
incidents resolve to six distinct URLs and the browser dedupes them. With real per-incident imagery
it becomes five hundred fetches to open one detail pane. The fix is to preload the window plus a
margin ahead of the selection rather than the whole queue — on the roadmap, and a prerequisite for
the filmstrip in #7, which would multiply images per incident by five.
