# ADR-0015 — A detection overlay, built without the footage it was specified against

**Status:** accepted, partial — A4 shipped, A1–A3 and A5 blocked
**Date:** 2026-08-13

## Context

Phase 7 workstream A asks for real camera frames: vendor a 4K clip, transcode it, derive six
cameras from crops of one source, extract 20–30 stills per camera into a manifest, and then — the
part the brief itself calls "the part that matters" — draw the detector's own boxes on them, because
_"a traffic photo in a card looks like a placeholder. A traffic photo with a detection box on it
looks like output from a vision model."_

Three of the five sub-items cannot be done in this environment, and the reasons are not
negotiable-by-effort:

- **No transcoding toolchain.** `ffmpeg`, `ffprobe`, `yt-dlp` and `youtube-dl` are all absent
  (checked with `command -v`, not assumed). A2 and A3 are an ffmpeg pipeline and nothing else.
- **The licence cannot be read.** The source page is JS-rendered; fetching it returns the video
  title and nothing else — no channel, no licence line, no publication date. The brief states the
  clip is Creative Commons, and that is very likely right, but an `ATTRIBUTION.md` is a file whose
  entire purpose is legal accuracy, and it is the worst possible place to write down something
  taken on trust. Asserting a specific licence that has not been read is not a shortcut, it is a
  different kind of error.
- **A5 has nothing to remove.** It asks for GIF assets and GIF-specific handling to be deleted.
  There are none. `public/snapshots/` holds six SVGs, one per event type, and the ported
  `image-slot` logic never carried GIF handling.

A4 is the only sub-item that does not depend on the footage. It changes the schema, the generator
and the evidence frame — all of which are exercised by the placeholder stills that exist today, and
none of which need re-doing when real frames arrive.

## Decision

Build A4 in full. Report A1–A3 and A5 as blocked rather than approximating them.

### Boxes are geometry, derived from the record

`src/lib/detection.ts` is a pure module: event type and lane position in, boxes out. It exists as a
separate module, rather than as a few lines inside the generator, because the property that matters
is testable only in isolation — **a box that disagrees with the record is worse than no box at
all.** An incident whose text reads "hard shoulder" over a frame with the box mid-carriageway tells
the operator the system cannot see straight, and they would be right.

So the agreement is asserted, for every event type against every lane position, rather than
sampled: the shoulder box clears the carriageway, lane 1 sits nearside of lane 2 sits nearside of
lane 3, adjacent lanes do not overlap, and an unlocalised call centres rather than guessing.

### The object class is not the event type

`boundingBoxSchema.label` is its own enum — vehicle, person, debris, smoke, obstruction. A wrong-way
driver and a stopped vehicle are different incidents about the same class of object, and the box
reports what the model saw, not what the triage rules concluded from it.

### Per-object confidence is not the event's confidence

A model can be 0.98 sure it is looking at a vehicle while the incident is a 0.6 "stopped, or just
slow?" call. Printing the event's number on the box would launder the second as the first, so each
box carries its own.

### Congestion gets no primary box

It is a property of the whole carriageway rather than of one object. Marking one car as _the_
congestion would be a claim the detector never made, and an operator would reasonably read it as
"this vehicle is the problem". Congestion renders context traffic and singles out nothing.

### `sourceFrame` was deliberately not added

The A4 schema block also specifies `sourceFrame: { camera, index, offsetSeconds }`. It references
the frame manifest A3 produces, which cannot exist without the footage. Adding it now would put a
permanently-absent field in the contract — dead code in the one file the whole system agrees
through. It lands with A3.

## Consequences

**Positioned in CSS, not in SVG.** The brief specifies "absolutely-positioned SVG over the image".
The boxes are absolutely-positioned HTML elements instead, at percentage offsets. This is a
mechanism difference with no visual one, and it is the correct mechanism here: the frame is
container-fit with `object-cover`, so an SVG would need `preserveAspectRatio="none"` to keep box
coordinates aligned to the crop — which distorts strokes and, unfixably, distorts text. The labels
also have to set in the design's tabular numeric face, which an SVG `<text>` can only reach by
restating the type scale outside the token system. Percentage-positioned elements scale with the
container and stay crisp, which is what the SVG was specified for.

**Labels move to clear the OSD plate.** The burned-in camera/timestamp plate is the one thing on the
frame that is always in the same place, so a box whose top lands under it sets its label below the
plate rather than above the box. The first draft ran a label straight through it and produced two
lines of mono type interleaved into something neither of them said.

**The primary box paints last.** Boxes overlap and so do their labels — two vehicles a lane apart at
the same distance is an ordinary frame. When labels collide something has to be underneath, and it
must never be the object the operator was called here to look at.

**Two context labels can still collide with each other.** Accepted rather than solved. The brief
asks for every box to be labelled; declining to label context objects would be a cleaner frame and a
quieter answer than the one specified. Real detector overlays collide the same way.

**The snapshots stay placeholders.** The overlay makes the frame read as detector output, but it is
detector output drawn on a schematic SVG of a road. It will look substantially better on real
stills, and nothing about A4 needs revisiting when they land — `boundingBoxesFor` does not know what
image it is drawn on.
