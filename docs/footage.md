# Camera footage

Six camera feeds, derived from one Creative Commons clip by
[`scripts/prepare-footage.sh`](../scripts/prepare-footage.sh). Licence and attribution are in
[`ATTRIBUTION.md`](../ATTRIBUTION.md).

You do not need to run any of this to work on the app. `public/footage/` is committed; the script
exists so the derivation is auditable and repeatable, not so every clone repeats it.

## Running it

```bash
./scripts/prepare-footage.sh
```

It downloads the 482MB source into `.footage/` (gitignored) on first run, cuts a master segment, and
writes the derivatives to `public/footage/`. Roughly six minutes on a warm cache, plus the download.
Pass `--clean` to discard the existing derivatives first.

### Prerequisites

**ffmpeg** with `libx264` and `libvpx-vp9`, and **yt-dlp**. Neither is a runtime or CI dependency —
nothing in the app shells out to them.

```bash
winget install Gyan.FFmpeg     # or: brew install ffmpeg / apt install ffmpeg
pip install yt-dlp
```

On Windows, winget puts the shims in `%LOCALAPPDATA%\Microsoft\WinGet\Links`, which needs a new
shell before it is on `PATH`. The script accepts `yt-dlp` either as a console script or as a bare
Python module, because pip installs it differently depending on the platform.

## What it produces

```
public/footage/
  manifest.json
  CAM-011/
    loop.mp4        10s, 1280×720, H.264
    loop.webm       10s, 1280×720, VP9
    frames/01.jpg … 20.jpg   854px wide
  CAM-014/ …
```

Six of the ten seed cameras have footage: `CAM-011`, `CAM-014`, `CAM-017`, `CAM-038`, `CAM-045`,
`CAM-062`. Those are exactly the cameras with `laneCount: 3`, which is not arbitrary —
[`src/lib/detection.ts`](../src/lib/detection.ts) divides the carriageway by the camera's lane count
to place bounding boxes, so pointing a four-lane camera at a three-lane crop would put every box in
the wrong lane.

The other four keep the per-event-type SVG placeholder. A network where some cameras have no live
feed is a real network, and it gives workstream B's "camera offline" tile something true to show.

## The manifest

```jsonc
{
  "source": { "url": "…", "author": "Karol Majek", "license": "CC BY 3.0", … },
  "cameras": {
    "CAM-014": {
      "loop": { "mp4": "/footage/CAM-014/loop.mp4", "webm": "/footage/CAM-014/loop.webm" },
      "durationSeconds": 10,
      "crop": "1280:720:500:0",
      "frames": [{ "index": 0, "src": "/footage/CAM-014/frames/01.jpg", "offsetSeconds": 102 }]
    }
  }
}
```

`offsetSeconds` is the position in the **original clip**, not in the derived loop, so any still can
be traced back to the second it came from.

### The snapshot is near the detection, not at it

The frames are extracted at build time, evenly across each camera's window. An incident's snapshot
is therefore the nearest available frame to the moment of detection, not that exact moment.

This is defensible for a system whose detector is itself sampling frames rather than watching a
continuous stream — but it is a claim the UI makes, so it is worth stating plainly rather than
leaving implied. Build-time extraction is what buys it: the frames are available during SSR and in
the first paint, the snapshot preloading strategy still works, no hidden `<video>` decodes in the
background of a dashboard that is already animating, and a seeded scenario replays identically.

## Why the numbers are what they are

Every encoder setting was measured on the busiest camera, not estimated. The first attempt — 12s
clips, CRF 27/40, 24 stills at 960px — came out at 40MB against a 20MB budget, exactly double. The
settings that fit are documented at the top of the script with the measurements that chose them.

Two findings worth keeping:

- **VP9 is not the smaller format here.** At matched quality it loses to H.264 outright (VP9 CRF 46
  → 1230KB against x264 CRF 31 → 1132KB), and only undercuts it at CRF 50, where the road surface
  visibly blocks up. Short, high-motion 720p is close to VP9's worst case. Both formats are emitted
  because both were asked for, but the MP4 is the better one.
- **`--http-chunk-size` is load-bearing.** Without it the download dies with a hard 403 at the same
  15.8% on every attempt, because YouTube expires the media URL partway through a single long range
  request. `--retries` does not help — each retry restarts into the same expiry.

## Known gap: the boxes are not calibrated to these frames

`src/lib/detection.ts` places bounding boxes on an idealised carriageway — lanes running up the
frame, the hard shoulder at the left edge. That was the right model for the schematic SVG
placeholders it was written against.

These frames are a real road at an oblique angle, and each crop sees it differently. The boxes still
agree with the _record_ — a hard-shoulder call still sits at the frame edge — but the frame edge is
not where that camera's hard shoulder actually is.

Closing it means per-camera calibration in the manifest: the carriageway's quadrilateral in frame
coordinates, and which side the shoulder is on. That is data, not new logic, and `boundingBoxesFor`
would read it instead of its current constants. Tracked in the roadmap.
