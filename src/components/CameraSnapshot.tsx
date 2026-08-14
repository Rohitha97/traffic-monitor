import Image from 'next/image';

import { Button } from '@/components/Button';
import { PRIORITY, type Priority } from '@/lib/priority';

/**
 * The band the burned-in OSD plate occupies, as a fraction of frame height.
 *
 * A box whose top is inside it puts its label below itself instead of above.
 * The plate is the one thing on this frame that is always in the same place,
 * so it is the one collision worth designing around rather than detecting.
 */
const OSD_STRIP = 0.14;

export interface OverlayBox {
  /** Fractions of the frame, 0–1, from the detection model. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The object class, already resolved to this locale's word by `toDetailView`. */
  label: string;
  /** This object's own confidence — not the incident's. Rendered as a percentage. */
  confidence: number;
  /** The object the incident is about. Exactly one box per event carries it. */
  primary?: boolean;
}

interface CameraSnapshotProps {
  src?: string;
  camera: string;
  /** Burned-in capture time, as a camera OSD would show it. */
  capturedAt: string;
  /** Every object the detector reported in this frame. Empty draws nothing. */
  boundingBoxes?: readonly OverlayBox[];
  /** Colours the primary box. The context boxes stay neutral regardless. */
  priority?: Priority;
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
  boundingBoxes = [],
  priority,
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
          className="h-8 w-10 text-text-secondary"
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

  const hasFrame = state === 'loaded' && Boolean(src);

  return (
    <div className="rounded-control relative h-full overflow-hidden border border-border-hairline bg-well">
      {hasFrame && src ? (
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
          <p className="text-micro tracking-field font-semibold text-text-secondary uppercase">
            No snapshot yet
          </p>
        </div>
      )}

      {/* Burned-in OSD plate, as a camera overlay would render it. */}
      <span className="text-mono-micro rounded-control pointer-events-none absolute top-2 left-2 bg-osd-plate px-1.5 py-0.75 font-mono font-semibold text-text-primary">
        {camera} · {capturedAt}
      </span>

      {/*
       * The detector's output, drawn on the frame it came from.
       *
       * Hidden from assistive technology, and this is the considered call
       * rather than the lazy one: everything the overlay encodes is already
       * prose on this pane. The primary box's *class* is the summary line, its
       * *place* is the priority reason ("live lane 2 of 3"), and its
       * *confidence* is a labelled fact in the panel beside it. The context
       * vehicles are scene, not evidence — announcing "vehicle 81%, vehicle
       * 77%" would spend a screen-reader user's attention on traffic that no
       * one is being asked to decide about.
       */}
      {hasFrame &&
        paintOrder(boundingBoxes).map((box, index) => (
          <DetectionBox
            // Position is the identity: the detector sends no per-object id,
            // and two boxes of the same class in one frame are ordinary.
            key={`${box.x},${box.y},${index}`}
            box={box}
            {...(priority ? { priority } : {})}
          />
        ))}
    </div>
  );
}

/**
 * Context first, the incident last.
 *
 * Boxes overlap, and so do their labels — two vehicles a lane apart at the same
 * distance is an ordinary frame, not an edge case. When labels collide,
 * something has to be underneath, and it must never be the object the operator
 * was called here to look at. Painting the primary last puts it on top without
 * a z-index, which would be a second ordering to keep in sync with this one.
 */
function paintOrder(boxes: readonly OverlayBox[]): OverlayBox[] {
  return [
    ...boxes.filter((box) => box.primary !== true),
    ...boxes.filter((box) => box.primary === true),
  ];
}

/**
 * One box and its label.
 *
 * The primary object takes the priority colour; everything else stays on the
 * neutral component border. That is the same rule the rest of the system
 * follows — saturation is reserved for severity — and it is what stops a frame
 * with four cars in it from reading as four incidents.
 */
function DetectionBox({
  box,
  priority = 'low',
}: {
  box: OverlayBox;
  priority?: Priority;
}) {
  const isPrimary = box.primary === true;

  /*
   * Above the box by default, and below it when the box sits high in the frame.
   *
   * Two things live up there: the frame's own overflow, which would clip the
   * label outright, and the burned-in OSD plate, which the first draft of this
   * ran a label straight through — two lines of mono type interleaved into
   * something neither of them said. Below the box is the only placement that
   * clears both, and it beats setting the label *inside* the box, which would
   * cover the object the box was drawn to point at.
   */
  const labelAbove = box.y > OSD_STRIP;
  /* Likewise across: a box on the right of the frame anchors its label right. */
  const labelRight = box.x + box.w > 0.7;

  /*
   * How far below the box's own top edge the label sits, as a percentage of the
   * box's height — which is what `top` resolves against inside this wrapper.
   *
   * Below the box (100%) is the floor, not the answer: a shallow box high in
   * the frame ends *inside* the OSD strip, so "just below the box" is still on
   * the plate. Clearing the strip itself is the actual requirement, and it is
   * arithmetic rather than a guess.
   */
  const labelTop = Math.max(1, (OSD_STRIP - box.y) / box.h) * 100;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={{
        left: `${box.x * 100}%`,
        top: `${box.y * 100}%`,
        width: `${box.w * 100}%`,
        height: `${box.h * 100}%`,
      }}
    >
      <div
        className={`rounded-control size-full border-dashed ${
          isPrimary
            ? `border-2 ${PRIORITY[priority].border}`
            : 'border border-border-component'
        }`}
      />
      <span
        className={`text-mono-micro rounded-control absolute bg-osd-plate px-1 py-0.25 font-mono font-semibold whitespace-nowrap ${
          isPrimary ? PRIORITY[priority].text : 'text-text-secondary'
        } ${labelAbove ? 'bottom-full mb-0.5' : 'mt-0.5'} ${
          labelRight ? 'right-0' : 'left-0'
        }`}
        {...(labelAbove ? {} : { style: { top: `${labelTop}%` } })}
      >
        {box.label} {Math.round(box.confidence * 100)}%
      </span>
    </div>
  );
}
