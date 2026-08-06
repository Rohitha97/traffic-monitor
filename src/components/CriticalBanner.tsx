import { Button } from '@/components/Button';
import { PriorityGlyph } from '@/components/PriorityGlyph';

interface CriticalBannerProps {
  /** "Wrong-way driver — CAM-014, M6 northbound, Jct 8–9" */
  headline: string;
  /** "Live lane 2 of 3 · detected 0.6s ago" */
  detail: string;
  /** False collapses the banner to zero height without unmounting it. */
  present?: boolean;
}

/**
 * The pinned critical band.
 *
 * It *takes* space rather than overlaying — expanding from 0 to 52px and
 * pushing the app down once, so it can never cover what the operator was
 * reading. (Pass A note 1, Pass C frame 2)
 *
 * It does not auto-dismiss. "Banner has not auto-dismissed — nothing does."
 * A critical left unacknowledged for 20s re-fires it and pushes to the
 * supervisor position instead. This is the clearest disagreement between the
 * design and the build brief, and the design wins (DESIGN_INVENTORY.md §6.1).
 */
export function CriticalBanner({
  headline,
  detail,
  present = true,
}: CriticalBannerProps) {
  return (
    <div
      role="alert"
      /*
       * The bottom border is conditional, not just the height: at h-0 a 2px
       * critical rule would still paint, leaving a permanent red line under the
       * status bar on a quiet shift — the opposite of "zero-height when nothing
       * is critical", and a standing false alarm.
       */
      className={`flex-none overflow-hidden bg-raised transition-all ease-banner duration-(--duration-banner) ${
        present
          ? 'h-13 border-b-2 border-critical opacity-100'
          : 'h-0 opacity-0'
      }`}
    >
      {/*
       * Collapsed, the banner's buttons are invisible but would still be in the
       * tab order — a keyboard trap on an empty queue. `inert` removes them
       * from focus and from the accessibility tree together.
       */}
      <div className="flex h-13 items-center gap-3.5 px-4" inert={!present}>
        <PriorityGlyph priority="critical" size="lg" decorative />

        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-caption truncate font-semibold text-text-primary">
            {headline}
          </span>
          <span className="text-kicker truncate font-medium text-text-secondary">
            {detail}
          </span>
        </span>

        <span className="flex-1" />

        <Button variant="primary" size="sm">
          Acknowledge
        </Button>
        <Button variant="secondary" size="sm">
          View
        </Button>
      </div>
    </div>
  );
}
