# ADR-0002 — The snapshot filmstrip is blocked on frame sources that do not exist

**Status:** blocked, not started
**Date:** 2026-08-06

## Context

Roadmap item #7 asks for t−2 through t+2 in the evidence well, stepped with `←→`. Pass A note 2
specifies it: _"a strip of frames either side of the trigger."_

The phase brief scopes it against work a previous phase was supposed to have done — "phase 7's
frame manifest already emits multiple frames per camera with source timestamps, so pick the five
nearest the trigger offset rather than generating anything new" — and instructs: _"If phase 7 has
not landed, stop and say so — do not build a filmstrip against single-frame sources."_

## What actually exists

Verified against the repository, not assumed:

- The commit log ends at phase 6. There is no phase 7.
- `public/snapshots/` holds **six SVG files, one per event type** — not per camera, and not per
  incident.
- `DetectionEvent.snapshotUrl` is a single string. The generator sets it to
  `` `/snapshots/${type}.svg` ``, so every stopped-vehicle incident on every camera shares one
  still.
- There is no manifest, no source timestamps, and no notion of a trigger offset anywhere in the
  schema.

## Decision

Do not build it.

A filmstrip over these sources could only be one of two things, and both are worse than the single
frame that ships today:

1. **The same image five times**, captioned t−2 … t+2. That is a lie told in the UI about evidence,
   on the one panel whose entire job is to let an operator check the machine's claim.
2. **Synthesised neighbouring frames**, with the trigger frame's detection box interpolated across
   them. The brief warns against exactly this — "do not interpolate boxes onto neighbouring frames
   and imply the detector produced them" — and it is the same lie with more effort behind it.

## Consequences

Item #7 stays in the roadmap's Next block, marked blocked, with its dependency named: several
timestamped frames per camera. That dependency is now written into the Later block as part of
"Real imagery", which is where it actually belongs.

The rest of phase 8 is unaffected — #7 was sequenced fifth precisely because nothing depends on it.

One piece of preparatory work _is_ worth doing when the sources arrive, and is noted here so it is
not rediscovered: item #3 virtualises the queue, which changes which rows are mounted, so the
snapshot preloading that keeps the evidence warm needs re-verifying against a virtualised list
before a filmstrip multiplies the number of images per incident by five.
