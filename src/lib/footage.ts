import manifest from '../../public/footage/manifest.json';

/*
 * The derived camera footage, as data.
 *
 * `public/footage/manifest.json` is written by `scripts/prepare-footage.sh` and
 * committed alongside the stills it describes. Reading it here rather than
 * globbing the directory means the frame list, the crop rectangle and the
 * source timestamp all come from the same record — and a still that exists on
 * disk but is missing from the manifest is invisible, which is the right way
 * round for something whose whole job is traceability.
 *
 * Imported as JSON rather than read from disk so it resolves at build time.
 * This module is only reachable from the ingest and stream routes, so the
 * manifest never enters a client bundle.
 */

export interface FootageFrame {
  index: number;
  /** Public path, ready for `<img src>`. */
  src: string;
  /** Position in the *original* clip, so a still can be traced to its second. */
  offsetSeconds: number;
}

interface CameraFootage {
  loop: { mp4: string; webm: string };
  durationSeconds: number;
  /** ffmpeg `w:h:x:y` against the 3840×2160 source. Recorded for auditability. */
  crop: string;
  frames: FootageFrame[];
}

const CAMERAS: Record<string, CameraFootage | undefined> = manifest.cameras;

/**
 * Six of the ten seed cameras have footage.
 *
 * The other four are not an oversight: they are the cameras whose `laneCount`
 * does not match any derived crop, and a network where some cameras have no
 * feed is a real network. They keep the per-event-type placeholder.
 */
export function hasFootage(cameraId: string): boolean {
  return CAMERAS[cameraId] !== undefined;
}

/**
 * A still from this camera, near the moment of detection.
 *
 * Near, not at — the frames are extracted at build time at a fixed spacing, so
 * the snapshot is the nearest one available rather than the exact instant. That
 * is defensible for a system whose detector samples frames itself, and it is
 * stated in `docs/footage.md` rather than left for someone to infer.
 */
export function frameFor(
  cameraId: string,
  random: () => number,
): FootageFrame | undefined {
  const footage = CAMERAS[cameraId];
  if (footage === undefined || footage.frames.length === 0) return undefined;

  return footage.frames[Math.floor(random() * footage.frames.length)];
}
