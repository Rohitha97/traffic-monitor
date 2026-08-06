export const CONNECTION_STATES = ['live', 'reconnecting', 'offline'] as const;

export type ConnectionState = (typeof CONNECTION_STATES)[number];

/*
 * System state is deliberately lower-chroma than the priority ramp: "a glance
 * must never confuse 'connection degraded' with 'high priority'." (Pass B §02)
 *
 * Motion is reserved for change, not for status — only `reconnecting` moves,
 * and it stops the instant the state resolves either way.
 */
const CONNECTION: Record<
  ConnectionState,
  { label: string; dot: string; animate: string }
> = {
  live: { label: 'LIVE', dot: 'bg-live', animate: '' },
  reconnecting: {
    label: 'RECONNECTING',
    dot: 'bg-reconnecting',
    animate: 'motion-safe:animate-pulse-status',
  },
  offline: { label: 'OFFLINE', dot: 'bg-offline', animate: '' },
};

interface ConnectionIndicatorProps {
  state: ConnectionState;
  /**
   * Feed counts, shown beside the dot in the status bar as "18 / 18 feeds
   * live". Omitted in the degraded notice, which shows a frozen timestamp
   * instead.
   */
  feeds?: { online: number; total: number };
  /** Render the uppercase state word. The status bar shows feed counts instead. */
  showLabel?: boolean;
}

export function ConnectionIndicator({
  state,
  feeds,
  showLabel = false,
}: ConnectionIndicatorProps) {
  const { label, dot, animate } = CONNECTION[state];

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`size-2 flex-none rounded-full ${dot} ${animate}`}
      />
      {showLabel && (
        <span className="text-kicker font-semibold text-text-primary">
          {label}
        </span>
      )}
      {feeds && (
        <span className="text-caption font-medium text-text-primary">
          {feeds.online} / {feeds.total} feeds live
        </span>
      )}
      {/*
       * The dot is decorative, so the state needs a text equivalent — but only
       * when it is not already visible, or a screen reader reads "OFFLINE,
       * feed connection offline".
       */}
      {!showLabel && (
        <span className="sr-only">Feed connection {label.toLowerCase()}</span>
      )}
    </div>
  );
}
