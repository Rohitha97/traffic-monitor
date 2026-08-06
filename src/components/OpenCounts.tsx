import { PriorityGlyph } from '@/components/PriorityGlyph';
import { PRIORITY, PRIORITY_ORDER, type Priority } from '@/lib/priority';

interface OpenCountsProps {
  counts: Record<Priority, number>;
}

/**
 * Open incidents by priority, in the status bar. Always all four in descending
 * severity, even at zero — a count that disappears when empty would mean the
 * operator has to re-find the numbers every time the mix changes.
 */
export function OpenCounts({ counts }: OpenCountsProps) {
  return (
    <ul className="flex items-center gap-4">
      {PRIORITY_ORDER.map((priority) => (
        <li key={priority} className="flex items-center gap-1.5">
          <PriorityGlyph priority={priority} size="xs" decorative />
          <span className="text-mono-meta font-mono font-semibold text-text-body">
            {counts[priority]}
          </span>
          <span className="sr-only">{PRIORITY[priority].label} open</span>
        </li>
      ))}
    </ul>
  );
}
