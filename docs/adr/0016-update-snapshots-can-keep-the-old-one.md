# ADR-0016 — Withdrawn: `--update-snapshots` was not the problem

**Status:** withdrawn — the premise was wrong
**Date:** 2026-08-14 (superseding the original of 2026-08-13)

## What this record originally claimed

That `--update-snapshots` rewrites a baseline only when the comparison _fails_, so a change landing
inside `maxDiffPixelRatio` leaves the old image in place while the run reports green — and that
passing `--update-snapshots=all` was therefore necessary to make "regenerate the baselines" mean
regenerate them.

The evidence offered was that two consecutive update runs produced byte-identical snapshots of a
layout the source no longer described.

## Why it is withdrawn

That evidence was wrong, and the mistake was mine rather than Playwright's.

The source did still describe that layout during those runs. The label-placement fix I believed was
in the file had been written into a `str.replace` inside a shell command that was never executed, so
the working tree still held the old component. The tool reported nothing, because a Python
`str.replace` whose search string does not match returns the original string and succeeds. Two
identical snapshots of unchanged source is the correct behaviour, not a bug.

The same silent no-op then happened a second time, on the same file, for the same reason: an earlier
`prettier --write` had reformatted the block I was matching against, so the search string no longer
appeared. That run is what finally made it obvious — the container was demonstrably serving the new
page (`curl` inside it returned the new image path) while the capture never changed, which is
impossible under any caching theory and trivial under "the edit did not land".

Two further theories were investigated and are also wrong, recorded so nobody re-runs them:

- **A stale Next compile cache in the container's `.next` volume.** Written, tested, reverted, then
  written again on the second occurrence. Disproved directly: a container started on the same mounts
  compiled `/dev/states` from scratch and served the current markup.
- **`--update-snapshots=all` forcing a rewrite.** It does not force one. A run with `=all` against an
  unchanged render leaves the file untouched, verified by md5 either side.

The `=all` flag has been reverted along with this record. It changed nothing, and a flag kept for a
reason that turned out to be false is worse than no flag.

## What survives

One real observation, which is why this file is superseded rather than deleted:

`maxDiffPixelRatio` is a **ratio**, so the tolerance scales with element area. It was calibrated in
[ADR-0003](0003-visual-regression.md) against a 432×40 queue row, where 1% is 173 pixels. The
evidence frame added in phase 7 is 320×200, where the same 1% is **640** — an entire line of 11px
monospace type. A regression smaller than that on a large state will not be caught.

That gap is real, was never demonstrated to have bitten anything, and is tracked as roadmap #16 with
the fix it needs: an absolute `maxDiffPixels` floor alongside the ratio, chosen from measured
run-to-run antialiasing noise rather than guessed.

## The lesson worth keeping

Three separate theories about the tooling, two of them implemented, before checking whether the edit
had actually reached the file. The check that settled it — grep the working tree for the string I
believed I had written — costs one command and was available from the first minute.

`str.replace` that silently no-ops is a bad instrument for editing code. Prefer an editor that fails
loudly on a missed match, and when a change appears not to take effect, confirm the change exists
before explaining why it did not propagate.
