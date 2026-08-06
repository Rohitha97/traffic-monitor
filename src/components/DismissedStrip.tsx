interface DismissedStripProps {
  camera: string;
  /** The false-positive reason the operator picked — it feeds detector tuning. */
  reason: string;
}

/**
 * A dismissed row collapses to this 20px strip, holds 8 seconds with an undo,
 * then leaves. (Pass C frame 4, Pass A dismissed state)
 *
 * The undo lives in the row rather than in a toast so it stays where the
 * operator's eye already is — and so it cannot cover another incident.
 */
export function DismissedStrip({ camera, reason }: DismissedStripProps) {
  return (
    <div className="flex h-5 items-center gap-2 border-b border-border-hairline px-3 opacity-55">
      <span aria-hidden="true" className="h-full w-0.25 flex-none bg-low" />
      <span className="text-micro flex-1 truncate font-medium text-text-secondary">
        {camera} · Dismissed — {reason}
      </span>
      <button
        type="button"
        className="text-micro cursor-pointer font-semibold text-text-body underline underline-offset-2 hover:text-text-primary"
      >
        Undo
      </button>
    </div>
  );
}
