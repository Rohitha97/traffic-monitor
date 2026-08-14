#!/usr/bin/env bash
#
# Turn one Creative Commons traffic clip into six camera feeds.
#
# Runs once, locally, and produces the derivatives that are committed. The
# source is not committed and must never be: it is 482MB, and a repository you
# cannot clone over hotel wifi is a repository nobody reads.
#
#   ./scripts/prepare-footage.sh            download if needed, then build
#   ./scripts/prepare-footage.sh --clean    discard the derivatives first
#
# Requires ffmpeg (libx264 + libvpx-vp9) and yt-dlp. Neither is a runtime
# dependency — nothing in the app shells out to them, and CI never runs this.
#
# ─────────────────────────────────────────────────────────────────────────────
# Where six cameras come from one clip
#
# The source is a single static 4K view of a road and its slip lane. Six
# non-identical crops of a 3840×2160 frame are each a native 720p or better
# region, so every derived camera is a real crop rather than an upscale — and a
# 1280×720 window and a 1920×1080 window over overlapping ground genuinely look
# like two cameras, because they have different fields of view.
#
# Overlap is not cheating. A real motorway network overlaps: that is how you get
# a vehicle handed from one camera to the next. What would be cheating is
# mirroring a crop to make it look different, because the traffic would then run
# against the `direction` the seed data claims — so nothing here is flipped.
#
# Each camera also gets its own grade and sharpening. Cameras on a real network
# are bought in different years from different suppliers and age differently in
# the weather; identical colour across a wall is the tell that it is one feed
# six times.
#
# Each camera takes a *different* window of the master segment, so the six are
# not synchronised. Six tiles cutting at the same instant would give the whole
# wall away in one frame.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

readonly SOURCE_URL='https://www.youtube.com/watch?v=MNn9qKG2UFI'
readonly SOURCE_ID='MNn9qKG2UFI'

# The master segment. 75s of continuous, varied traffic — cars, vans, a bus, and
# a queue building on the slip lane — with no camera movement and no cut.
readonly SEGMENT_START=90
readonly SEGMENT_DURATION=75

# Per-camera loop length. The budget is the whole committed asset set under
# 20MB, and 60s clips cannot meet it at a bitrate that still looks like a camera
# rather than a mosaic — so the clips are cut short, which is what the brief says
# to do before reaching for Git LFS. Ten seconds is also honest for a wall tile:
# nobody watches one for a minute.
#
# Every number below was measured on the busiest camera rather than estimated.
# The first attempt — 12s, CRF 27/40, 24 frames at 960px — came out at 40MB,
# exactly double.
readonly CLIP_SECONDS=10

# x264 at 720p, measured: CRF 28 → 1708KB, 31 → 1132KB, 34 → 770KB per clip.
# 31 is where a 1:1 comparison against a near-lossless encode stops showing a
# difference on vehicles and lane markings, which is what the frame is for.
readonly H264_CRF=31

# VP9 is offered first and the browser falls back to the MP4 — but note that on
# this content it is **not** the smaller format the brief assumes. Measured at
# matched quality it loses to x264 outright (CRF 46 → 1230KB against x264's
# 1132KB), and only undercuts it at CRF 50, where the road surface visibly
# blocks up. Short high-motion 720p is close to VP9's worst case. Both are
# emitted because the brief asks for both and MP4-only would strand nothing —
# but if the budget ever needs another megabyte, this is the line to delete.
readonly VP9_CRF=50

# Stills per camera, and their size. Smaller than the video on purpose: a
# snapshot is shown in a detail pane and as a wall tile's poster, never
# full-bleed, and 144 stills at video resolution would eat the entire budget.
# 20 is the floor of the brief's 20–30, taken because 144 stills at 960px cost
# 14MB on their own. Measured at 854px: q5 → 10.0MB, q6 → 9.0MB, q7 → 8.3MB
# across all six cameras.
readonly FRAMES_PER_CAMERA=20
readonly FRAME_WIDTH=854
# mjpeg's scale runs 2 (best) to 31. 7 is ≈ JPEG quality 75.
readonly FRAME_Q=7

readonly WORK='.footage'
readonly SRC="${WORK}/src"
readonly OUT='public/footage'

# ─────────────────────────────────────────────────────────────────────────────
# The camera table.
#
# id | crop w:h:x:y in the 3840×2160 frame | grade | clip offset into the master
#
# Crops were chosen by rendering candidates and looking at them, not by dividing
# the frame into a grid: the traffic runs along one diagonal band, and a tidy
# 3×2 tiling puts three "cameras" on grass, hatching and a maintenance shed.
#
# Only the six seed cameras with `laneCount: 3` are mapped. The lane geometry in
# src/lib/detection.ts divides the carriageway by the camera's lane count, so
# pointing a 4-lane camera at a 3-lane crop would put every box in the wrong
# lane — the exact incoherence that module exists to prevent.
# ─────────────────────────────────────────────────────────────────────────────
CAMERAS=(
  # Wide, looking up the carriageway at the queue. Neutral grade, mild sharpen.
  "CAM-011|1920:1080:900:0|eq=contrast=1.05:saturation=0.95,unsharp=5:5:0.6|0"
  # Tight on the live lanes. Warmer and the sharpest of the six — this is the
  # camera the seeded scenario puts most of its incidents on.
  "CAM-014|1280:720:500:0|colorbalance=rs=0.03:bs=-0.03,eq=contrast=1.08:saturation=1.05,unsharp=5:5:1.0|12"
  # The slip-lane queue behind the barrier. Cooler and softer.
  "CAM-017|1280:720:900:600|colorbalance=rs=-0.04:bs=0.05,eq=contrast=0.98:saturation=0.9,unsharp=5:5:0.3|24"
  # Wide, with the footway in shot. Hazy — a lens nobody has cleaned this year.
  "CAM-038|1920:1080:300:200|eq=contrast=0.92:brightness=0.03:saturation=0.85,unsharp=5:5:0.2|36"
  # Lower down the carriageway across the hatching. Contrasty, faintly green.
  "CAM-045|1600:900:1000:1200|colorbalance=gs=0.03,eq=contrast=1.12:saturation=0.98,unsharp=5:5:0.8|48"
  # The oldest sensor on the network: dim, desaturated, and visibly noisy.
  "CAM-062|1920:1080:200:1000|eq=contrast=1.02:brightness=-0.04:saturation=0.8,noise=alls=6:allf=t,unsharp=5:5:0.4|60"
)

# ─────────────────────────────────────────────────────────────────────────────

step() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
die() {
  printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2
  exit 1
}

command -v ffmpeg >/dev/null || die 'ffmpeg not found. See docs/footage.md.'
command -v ffprobe >/dev/null || die 'ffprobe not found. See docs/footage.md.'

# Installed as a console script by some package managers and as a bare module by
# pip on Windows. Either is fine; not having it at all is not.
if command -v yt-dlp >/dev/null; then
  ytdlp() { yt-dlp "$@"; }
elif python -c 'import yt_dlp' 2>/dev/null; then
  ytdlp() { python -m yt_dlp "$@"; }
else
  ytdlp() { die 'yt-dlp not found. See docs/footage.md.'; }
fi

if [[ "${1:-}" == '--clean' ]]; then
  step "Discarding ${OUT}"
  rm -rf "${OUT}"
fi

mkdir -p "${SRC}" "${OUT}"

# ── 1. Source ────────────────────────────────────────────────────────────────

readonly MASTER_RAW="${SRC}/${SOURCE_ID}-2160p.webm"

if [[ -f "${MASTER_RAW}" ]]; then
  step "Source already present: ${MASTER_RAW}"
else
  step 'Downloading the source (482MB, 4K VP9)'

  # `--http-chunk-size` is load-bearing, not belt-and-braces. Without it the
  # transfer dies with a hard 403 at the same 15.8% every attempt: YouTube
  # expires the media URL partway through a single long range request, and only
  # a chunked download re-derives it. `--retries` alone does not help, because
  # each retry restarts into the same expiry.
  ytdlp \
    --format 313 \
    --http-chunk-size 5M \
    --retries 20 \
    --fragment-retries 20 \
    --output "${MASTER_RAW}" \
    "${SOURCE_URL}"
fi

readonly MASTER="${SRC}/master-${SEGMENT_START}-${SEGMENT_DURATION}.mp4"

if [[ -f "${MASTER}" ]]; then
  step "Master segment already cut: ${MASTER}"
else
  step "Cutting the master segment (${SEGMENT_START}s +${SEGMENT_DURATION}s)"

  # Re-encoded rather than stream-copied, and near-lossless. Every camera below
  # seeks into this file, and seeking a stream copy lands on the previous
  # keyframe — which would silently shift each camera's window by up to a
  # second and make the "source timestamp" in the manifest a lie.
  ffmpeg -hide_banner -loglevel error -stats \
    -ss "${SEGMENT_START}" -t "${SEGMENT_DURATION}" \
    -i "${MASTER_RAW}" \
    -c:v libx264 -preset veryfast -crf 14 -pix_fmt yuv420p \
    -an -y "${MASTER}"
fi

# ── 2. Per-camera derivatives ────────────────────────────────────────────────

manifest_cameras=()

for row in "${CAMERAS[@]}"; do
  IFS='|' read -r id crop grade offset <<<"${row}"

  step "${id}  crop ${crop}  +${offset}s"

  dir="${OUT}/${id}"
  mkdir -p "${dir}/frames"

  # crop → 720p → grade. Cropping first means the scale and the sharpen operate
  # on the region that survives, not on 4K that is about to be thrown away.
  chain="crop=${crop},scale=1280:720:flags=lanczos,${grade},format=yuv420p"

  # A traffic scene cannot loop seamlessly — the cars are mid-frame at both
  # ends. The brief allows the visible cut, masked. Three frames at each end
  # (0.1s at 30fps) is enough to read as a camera hiccup rather than a jump,
  # which is a thing real CCTV does anyway.
  fade_out=$(awk -v c="${CLIP_SECONDS}" 'BEGIN { printf "%.2f", c - 0.1 }')
  fade="fade=t=in:st=0:d=0.1,fade=t=out:st=${fade_out}:d=0.1"

  # H.264 for compatibility — it is the format that plays everywhere, including
  # the Safari versions a control room's ancient workstation is running, and on
  # this content it is also the better of the two. See VP9_CRF.
  ffmpeg -hide_banner -loglevel error -stats \
    -ss "${offset}" -t "${CLIP_SECONDS}" -i "${MASTER}" \
    -vf "${chain},${fade}" \
    -c:v libx264 -preset slow -crf "${H264_CRF}" -profile:v main -level 4.0 \
    -movflags +faststart -an -y "${dir}/loop.mp4"

  # VP9, offered first so a modern browser takes it. See VP9_CRF for why the
  # "smaller" in that sentence did not survive being measured.
  ffmpeg -hide_banner -loglevel error -stats \
    -ss "${offset}" -t "${CLIP_SECONDS}" -i "${MASTER}" \
    -vf "${chain},${fade}" \
    -c:v libvpx-vp9 -crf "${VP9_CRF}" -b:v 0 -row-mt 1 -deadline good -cpu-used 2 \
    -an -y "${dir}/loop.webm"

  # Stills, evenly spaced across this camera's own window. Extracted at build
  # time rather than captured from a hidden <video> at runtime: they have to be
  # available during SSR and in the first paint, and a dashboard that is already
  # animating does not need a background decoder as well.
  rm -f "${dir}"/frames/*.jpg
  fps=$(awk -v n="${FRAMES_PER_CAMERA}" -v c="${CLIP_SECONDS}" 'BEGIN { printf "%.6f", n / c }')

  ffmpeg -hide_banner -loglevel error \
    -ss "${offset}" -t "${CLIP_SECONDS}" -i "${MASTER}" \
    -vf "crop=${crop},scale=${FRAME_WIDTH}:-2:flags=lanczos,${grade},fps=${fps}" \
    -q:v "${FRAME_Q}" -frames:v "${FRAMES_PER_CAMERA}" \
    -y "${dir}/frames/%02d.jpg"

  # The manifest entry. `offsetSeconds` is the offset into the *source clip*,
  # not into the derived loop, so a frame can always be traced back to the
  # second of the original it came from.
  frames_json=''
  index=0
  for frame in "${dir}"/frames/*.jpg; do
    at=$(awk -v s="${SEGMENT_START}" -v o="${offset}" -v i="${index}" -v c="${CLIP_SECONDS}" -v n="${FRAMES_PER_CAMERA}"       'BEGIN { printf "%.2f", s + o + i * c / n }')
    [[ -n "${frames_json}" ]] && frames_json+=','
    frames_json+=$(printf '\n        { "index": %d, "src": "/footage/%s/frames/%s", "offsetSeconds": %s }' \
      "${index}" "${id}" "$(basename "${frame}")" "${at}")
    index=$((index + 1))
  done

  manifest_cameras+=("$(
    cat <<JSON
    "${id}": {
      "loop": { "mp4": "/footage/${id}/loop.mp4", "webm": "/footage/${id}/loop.webm" },
      "durationSeconds": ${CLIP_SECONDS},
      "crop": "${crop}",
      "frames": [${frames_json}
      ]
    }
JSON
  )")
done

# ── 3. Manifest ──────────────────────────────────────────────────────────────

step 'Writing the manifest'

{
  printf '{\n'
  printf '  "source": {\n'
  printf '    "url": "%s",\n' "${SOURCE_URL}"
  printf '    "title": "4K Road traffic video for object detection and tracking",\n'
  printf '    "author": "Karol Majek",\n'
  printf '    "license": "CC BY 3.0",\n'
  printf '    "segmentStartSeconds": %d,\n' "${SEGMENT_START}"
  printf '    "segmentDurationSeconds": %d\n' "${SEGMENT_DURATION}"
  printf '  },\n'
  printf '  "cameras": {\n'
  printf '%s' "$(
    IFS=$'\n'
    printf '%s' "${manifest_cameras[0]}"
    for entry in "${manifest_cameras[@]:1}"; do printf ',\n%s' "${entry}"; done
  )"
  printf '\n  }\n}\n'
} >"${OUT}/manifest.json"

# ── 4. Budget ────────────────────────────────────────────────────────────────

step 'Committed asset size'

du -sh "${OUT}" | awk '{print "  total   " $1}'
find "${OUT}" -name '*.mp4' -exec du -ch {} + | tail -1 | awk '{print "  mp4     " $1}'
find "${OUT}" -name '*.webm' -exec du -ch {} + | tail -1 | awk '{print "  webm    " $1}'
find "${OUT}" -name '*.jpg' -exec du -ch {} + | tail -1 | awk '{print "  frames  " $1}'

bytes=$(du -sk "${OUT}" | cut -f1)
if ((bytes > 20480)); then
  printf '\n\033[33m! Over the 20MB budget. Cut CLIP_SECONDS or FRAMES_PER_CAMERA.\033[0m\n'
  printf '  Do not reach for Git LFS — a clone that needs a second tool is worse.\n'
else
  printf '\n\033[32m✓ Within the 20MB budget.\033[0m\n'
fi
