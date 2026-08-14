# ADR-0017 — Six cameras from one clip

**Status:** accepted
**Date:** 2026-08-14

## Context

The snapshots were six committed SVGs, one per _event type_ — a schematic road, shared by every
camera and every incident of that type. It was the largest gap between what the evidence panel
claims and what it shows, and the roadmap's whole "Now" block was waiting on closing it.

[ADR-0015](0015-detection-overlay-without-footage.md) recorded this as blocked on three things:
no `ffmpeg`, no downloader, and a licence that could not be read because the source's watch page is
rendered client-side. Two of those turned out to be blocked on tooling rather than on anything real —
`winget` and `pip` are both available, and installing ffmpeg and yt-dlp took two minutes.

The third dissolved once yt-dlp existed. The licence is in the video's own metadata:

```
license=Creative Commons Attribution license (reuse allowed)
uploader=Karol Majek
upload_date=20180716
```

Which is the difference between an attribution file that records something and one that assumes it.
The lesson worth keeping is that "I cannot verify this" was true and "this cannot be verified" was
not — the tool that answers the question was one `pip install` away.

## Decision

`scripts/prepare-footage.sh` derives six cameras from one 4K clip. It runs once, locally; its
outputs are committed and the 482MB source is not.

### Crops were chosen by looking, not by tiling

The obvious approach — divide the 4K frame into a 3×2 grid — produces three "cameras" pointed at
grass, hatching and a maintenance shed. The traffic in this clip runs along one diagonal band.
Candidate crops were rendered and inspected, twice, and the six that ship all frame moving vehicles
across their whole window.

Overlap between them is accepted and is not a cheat: a real motorway network overlaps, which is how
a vehicle is handed from one camera to the next. A 1280×720 window and a 1920×1080 window over
common ground genuinely look like two cameras, because they have different fields of view. What
would be a cheat is mirroring a crop to force variety — the traffic would then run against the
`direction` the seed data claims — so nothing is flipped.

### Only the three-lane cameras are mapped

Six of the ten seed cameras get footage: exactly those with `laneCount: 3`. Every crop frames a
three-lane view, and `src/lib/detection.ts` divides the carriageway by the camera's lane count to
place boxes — so mapping a four-lane camera onto a three-lane crop would put every box in the wrong
lane. That is the incoherence that module exists to prevent, reintroduced through data instead of
code. `src/lib/footage.test.ts` asserts it rather than trusting the table.

The other four keep the per-type schematic. A network where some cameras have no feed is a real
network, and it gives workstream B's "camera offline" tile something true to show.

### The numbers were measured

The first build came in at **40MB against a 20MB budget** — exactly double. Rather than tuning by
feel, each knob was measured on the busiest camera and the measurements are in the script beside the
values they chose. Final: 18MB, of which 6.0MB MP4, 4.2MB WebM, 7.5MB stills.

The brief says to cut the clip shorter before reaching for Git LFS, and that is what happened: the
master segment is the specified 75 seconds, but each camera's loop is a 10-second window of it —
which also desynchronises the six, so the wall does not cut on the same frame six times.

## Consequences

**VP9 is not the smaller format here, and the brief assumes it is.** Measured at matched quality it
loses to H.264 outright — VP9 CRF 46 at 1230KB against x264 CRF 31 at 1132KB — and only undercuts it
at CRF 50, where the road surface visibly blocks up. Short, high-motion 720p is close to VP9's worst
case. Both are emitted because both were asked for, but if the budget ever needs another megabyte,
the WebM is the line to delete.

**The snapshot is a frame near the detection, not at it.** Stills are extracted at a fixed spacing at
build time, so an incident gets the nearest available frame. This is defensible for a system whose
detector samples frames itself, and build-time extraction is what buys the rest: frames available
during SSR and first paint, no hidden `<video>` decoding behind a dashboard that is already
animating, and a seeded scenario that replays identically. `sourceFrame` on the event records which
frame and its offset in the source, so the claim is auditable rather than merely admitted.

That field was deliberately left out in ADR-0015 as an always-absent one. It is now optional rather
than absent, which is a different thing: the four cameras without footage genuinely have no source
frame to point at.

**The boxes are not calibrated to these frames.** `detection.ts` places boxes on an idealised
carriageway — lanes running up the frame, hard shoulder at the left edge — which was right for the
schematics it was written against. These are a real road at an oblique angle, seen differently by
each crop. The boxes still agree with the _record_, but the frame edge is not where a given camera's
hard shoulder actually is. Closing it means per-camera calibration in the manifest: the carriageway
quadrilateral in frame coordinates and which side the shoulder is on. That is data, not new logic.
Tracked as roadmap #18.

**`--http-chunk-size` is load-bearing.** Without it the download dies with a hard 403 at the same
15.8% every attempt, because YouTube expires the media URL partway through one long range request.
`--retries` does not help — each retry restarts into the same expiry. Recorded because the failure
looks like a network problem and is not.

**The repository grew by 18MB.** That is the real cost, paid once, and the reason the source stays
out and the script stays in: the derivation is auditable without anyone re-downloading half a
gigabyte.
