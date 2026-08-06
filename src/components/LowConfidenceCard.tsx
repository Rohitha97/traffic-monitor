import { Button } from '@/components/Button';
import { PRIORITY, type Priority } from '@/lib/priority';

interface LowConfidenceCardProps {
  camera: string;
  location: string;
  description: string;
  /** 0–1. Below 0.6 the event is demoted one level and flagged. */
  confidence: number;
  /** The level it would hold if the operator confirms the detection. */
  confirmAs: Priority;
}

/**
 * A detection the model is not sure about.
 *
 * Confidence below 0.6 demotes an event one priority level and flags it for
 * verification — except a wrong-way driver, which never demotes, because
 * under-reacting to one is unrecoverable and over-reacting is cheap.
 *
 * The dashed border is the visual grammar for "provisional", and it is paired
 * with a text tag rather than standing alone. Note the card offers a way *up*
 * as well as out: "Confirm as Medium" lets the operator restore the level the
 * demotion took away. That promotion path is the design's own addition — the
 * build brief only asked for the flag.
 */
export function LowConfidenceCard({
  camera,
  location,
  description,
  confidence,
  confirmAs,
}: LowConfidenceCardProps) {
  return (
    <div className="rounded-control flex flex-col gap-2.5 border border-dashed border-border-component p-3">
      <div className="flex items-center gap-2.5">
        <span className="text-micro tracking-label rounded-control border border-border-component px-1.5 py-0.5 font-semibold text-text-secondary">
          NEEDS VERIFICATION
        </span>
        <span className="text-mono-meta ml-auto font-mono font-semibold text-text-secondary">
          {Math.round(confidence * 100)}% confidence
        </span>
      </div>

      <p className="text-caption font-semibold text-text-primary">
        {camera} · {location}
      </p>
      <p className="text-kicker font-medium text-text-secondary">
        {description}
      </p>

      <div className="flex gap-2">
        <Button size="xs">Confirm as {PRIORITY[confirmAs].title}</Button>
        <Button variant="quiet" size="xs">
          Dismiss, not real
        </Button>
      </div>
    </div>
  );
}
