interface BufferedEventsBarProps {
  count: number;
  /** How many of the buffered events are critical. Non-zero escalates the bar. */
  criticalCount?: number;
}

/**
 * New events never move what the operator is currently reading. When the queue
 * is scrolled away from the top, or an incident is open, arrivals buffer
 * behind this bar instead of reordering the list under the cursor — loading
 * them is an explicit act.
 *
 * The design binds this to Home, not to the brief's N (DESIGN_INVENTORY.md
 * §6.2), and writes the count as "+3 new events".
 */
export function BufferedEventsBar({
  count,
  criticalCount = 0,
}: BufferedEventsBarProps) {
  const escalated = criticalCount > 0;

  return (
    <button
      type="button"
      aria-live="polite"
      className={`rounded-control flex w-fit cursor-pointer items-center gap-2.5 border px-3 py-2 transition-colors duration-(--duration-state) hover:bg-text-primary/6 ${
        escalated ? 'border-l-3 border-critical' : 'border-border-component'
      }`}
    >
      <span
        aria-hidden="true"
        className={`clip-triangle h-1.5 w-2 flex-none ${
          escalated ? 'bg-critical' : 'bg-text-body'
        }`}
      />
      <span className="text-caption font-semibold text-text-primary">
        +{count} new{escalated ? ` · ${criticalCount} critical` : ' events'}
      </span>
      <span className="text-micro font-medium text-text-secondary">
        {escalated
          ? 'Escalates even while the operator has scrolled away'
          : 'Press Home, or click to jump to newest'}
      </span>
    </button>
  );
}
