import Image from 'next/image';

import { Button } from '@/components/Button';

interface DetectionBox {
  /** Fractions of the frame, 0–1, from the detection model. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 0–1. Rendered as a percentage above the box. */
  confidence: number;
}

interface CameraSnapshotProps {
  src?: string;
  camera: string;
  /** Burned-in capture time, as a camera OSD would show it. */
  capturedAt: string;
  detection?: DetectionBox;
  state?: 'loaded' | 'failed' | 'empty';
}

/**
 * The evidence frame.
 *
 * Ported from the design project's <image-slot> — the container-fit frame,
 * the cover baseline and the empty state. Its drag-to-fill, sidecar
 * persistence, reframe and Unsplash-credit machinery are all authoring-time
 * behaviour and were dropped (DESIGN_INVENTORY.md §7).
 *
 * The failure state is written from Pass C frame 5 rather than reused from
 * image-slot, which has no per-type broken-image fallback — its only error
 * tile is Unsplash attribution compliance.
 */
export function CameraSnapshot({
  src,
  camera,
  capturedAt,
  detection,
  state = 'loaded',
}: CameraSnapshotProps) {
  if (state === 'failed') {
    return (
      <div className="rounded-control flex h-full flex-col items-center justify-center gap-2 border border-dashed border-border-component bg-well p-4">
        {/* Struck-through camera, drawn as an icon rather than assembled from
            a rotated rule — the slash needs an off-scale angle that no utility
            should be inventing. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 40 32"
          className="h-8 w-10 text-text-tertiary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <rect x="3" y="8" width="30" height="20" rx="2" />
          <circle cx="18" cy="18" r="5" />
          <path d="M13 8l3-4h4l3 4" />
          <path d="M2 30L38 2" />
        </svg>
        <p className="text-caption text-center font-semibold text-text-primary">
          Snapshot unavailable
        </p>
        <p className="text-micro max-w-70 text-center font-medium text-text-secondary">
          The camera feed may be delayed. Retry, or continue from the
          description below.
        </p>
        <Button size="xs" className="mt-0.5">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-control relative h-full overflow-hidden border border-border-hairline bg-well">
      {state === 'loaded' && src ? (
        /*
         * `unoptimized` deliberately: snapshots are committed local stills, and
         * every queued event's snapshot is warmed on ingest so that opening a
         * detail never shows a spinner. Routing them through the optimiser
         * would add a request hop to the one asset that must already be in
         * cache — on the single biggest perceived-speed win in the build.
         */
        <Image
          src={src}
          alt={`Camera ${camera} at ${capturedAt}`}
          fill
          unoptimized
          sizes="50vw"
          className="object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <p className="text-micro tracking-field font-semibold text-text-tertiary uppercase">
            No snapshot yet
          </p>
        </div>
      )}

      {/* Burned-in OSD plate, as a camera overlay would render it. */}
      <span className="text-mono-micro rounded-control pointer-events-none absolute top-2 left-2 bg-osd-plate px-1.5 py-0.75 font-mono font-semibold text-text-primary">
        {camera} · {capturedAt}
      </span>

      {detection && (
        <>
          <span
            aria-hidden="true"
            className="rounded-control pointer-events-none absolute border-2 border-dashed border-critical"
            style={{
              left: `${detection.x * 100}%`,
              top: `${detection.y * 100}%`,
              width: `${detection.w * 100}%`,
              height: `${detection.h * 100}%`,
            }}
          />
          <span
            aria-hidden="true"
            className="text-mono-micro pointer-events-none absolute font-mono font-semibold text-critical"
            style={{
              left: `${detection.x * 100}%`,
              top: `calc(${detection.y * 100}% - 1rem)`,
            }}
          >
            {Math.round(detection.confidence * 100)}%
          </span>
        </>
      )}
    </div>
  );
}
