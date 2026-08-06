import { Button } from '@/components/Button';
import {
  ConnectionIndicator,
  type ConnectionState,
} from '@/components/ConnectionIndicator';
import { OpenCounts } from '@/components/OpenCounts';
import type { Priority } from '@/lib/priority';

interface StatusBarProps {
  connection: ConnectionState;
  feeds: { online: number; total: number };
  counts: Record<Priority, number>;
  /** Wall clocks, pre-formatted. Both are shown: a motorway log is kept in UTC. */
  localTime: string;
  utcTime: string;
  muted: boolean;
  onToggleMute?: () => void;
  /** Priorities currently filtered to; empty means everything. */
  activeFilters?: ReadonlySet<Priority>;
  onToggleFilter?: (priority: Priority) => void;
}

const NO_FILTERS: ReadonlySet<Priority> = new Set<Priority>();

/**
 * The 48px status bar. Feed health, open counts by priority, both clocks, and
 * the mute control.
 *
 * Deliberately outside the reading path — "it is glanced at, never read"
 * (Pass A note 1) — which is why it carries no priority colour of its own and
 * why the counts are the only saturated thing in it.
 */
export function StatusBar({
  connection,
  feeds,
  counts,
  localTime,
  utcTime,
  muted,
  onToggleMute,
  activeFilters = NO_FILTERS,
  onToggleFilter,
}: StatusBarProps) {
  return (
    <header
      aria-label="System status"
      className="flex h-12 flex-none items-center gap-5 border-b border-border-hairline bg-panel px-4"
    >
      <ConnectionIndicator state={connection} feeds={feeds} />

      <span
        aria-hidden="true"
        className="h-5 w-px flex-none bg-border-hairline"
      />

      <OpenCounts
        counts={counts}
        active={activeFilters}
        onToggle={onToggleFilter ?? (() => {})}
      />

      <span className="flex-1" />

      <div className="text-mono-meta flex items-center gap-4 font-mono font-medium text-text-secondary">
        <span>
          {localTime} <span className="text-text-tertiary">LOCAL</span>
        </span>
        <span>
          {utcTime} <span className="text-text-tertiary">UTC</span>
        </span>
      </div>

      {/*
       * Audio is muted on first load and the control says so. A page that
       * makes noise before consent is hostile; the choice then persists.
       */}
      <Button size="xs" aria-pressed={muted} onClick={onToggleMute}>
        {muted ? 'Unmute' : 'Mute'}
      </Button>
    </header>
  );
}
