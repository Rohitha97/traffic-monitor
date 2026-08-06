'use client';

import { PriorityGlyph } from '@/components/PriorityGlyph';
import { PRIORITY, PRIORITY_ORDER, type Priority } from '@/lib/priority';

interface OpenCountsProps {
  counts: Record<Priority, number>;
  /** Priorities currently filtered to; empty means everything is shown. */
  active: ReadonlySet<Priority>;
  onToggle: (priority: Priority) => void;
}

/**
 * Open incidents by priority, in the status bar — and the filter control.
 *
 * Always all four in descending severity, even at zero: a count that
 * disappeared when empty would make the operator re-find the numbers every
 * time the mix changed.
 *
 * Pass C draws these as a read-only glance. Making them the filter affordance
 * is the smallest honest way to give the brief's 1–4 keys something visible to
 * act on — the alternative was inventing a filter bar the design never drew.
 * Filtering is shown by dimming what is excluded, so the row of counts keeps
 * its shape and the numbers stay where the eye expects them.
 */
export function OpenCounts({ counts, active, onToggle }: OpenCountsProps) {
  const filtering = active.size > 0;

  return (
    <ul className="flex items-center gap-4">
      {PRIORITY_ORDER.map((priority) => {
        const on = active.has(priority);
        return (
          <li key={priority}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(priority)}
              title={`${PRIORITY[priority].title} — ${counts[priority]} open. Click, or press ${PRIORITY_ORDER.indexOf(priority) + 1}, to filter.`}
              className={`rounded-control flex cursor-pointer items-center gap-1.5 px-1 py-0.5 transition-opacity duration-(--duration-state) hover:bg-text-primary/8 ${
                filtering && !on ? 'opacity-40' : 'opacity-100'
              }`}
            >
              <PriorityGlyph priority={priority} size="xs" decorative />
              <span className="text-mono-meta font-mono font-semibold text-text-body">
                {counts[priority]}
              </span>
              <span className="sr-only">
                {PRIORITY[priority].label} open{on ? ', filtered to' : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
