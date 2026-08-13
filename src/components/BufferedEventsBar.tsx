'use client';

import { useTranslations } from 'next-intl';

interface BufferedEventsBarProps {
  count: number;
  /** How many of the buffered events are critical. Non-zero escalates the bar. */
  criticalCount?: number;
  onLoad?: () => void;
}

/**
 * New events never move what the operator is currently reading. When the queue
 * is scrolled away from the top, or an incident is open, arrivals buffer
 * behind this bar instead of reordering the list under the cursor — loading
 * them is an explicit act.
 *
 * The design binds this to Home, not to the brief's N (DESIGN_INVENTORY.md
 * §6.2), and writes the count as "+3 new events".
 *
 * The count is the application's one pluralised string, and it is why the
 * message format is ICU rather than interpolation. English needs one/other;
 * Japanese has no grammatical plural and takes a single `other` branch with the
 * counter word 件 — writing two identical Japanese strings to mirror English's
 * two would be a translation that had not understood the question.
 */
export function BufferedEventsBar({
  count,
  criticalCount = 0,
  onLoad,
}: BufferedEventsBarProps) {
  const t = useTranslations('queue');
  const escalated = criticalCount > 0;

  return (
    <button
      type="button"
      aria-live="polite"
      onClick={onLoad}
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
        {escalated
          ? t('bufferedCritical', { count, criticalCount })
          : t('buffered', { count })}
      </span>
      <span className="text-micro font-medium text-text-secondary">
        {escalated ? t('bufferedCriticalHint') : t('bufferedHint')}
      </span>
    </button>
  );
}
