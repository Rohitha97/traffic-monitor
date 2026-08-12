'use client';

import { useTranslations } from 'next-intl';

export const CONNECTION_STATES = ['live', 'reconnecting', 'offline'] as const;

export type ConnectionState = (typeof CONNECTION_STATES)[number];

/*
 * System state is deliberately lower-chroma than the priority ramp: "a glance
 * must never confuse 'connection degraded' with 'high priority'." (Pass B §02)
 *
 * Motion is reserved for change, not for status — only `reconnecting` moves,
 * and it stops the instant the state resolves either way.
 *
 * The label moved into the message files; what stays here is the presentation,
 * which is the same in every locale.
 */
const CONNECTION: Record<ConnectionState, { dot: string; animate: string }> = {
  live: { dot: 'bg-live', animate: '' },
  reconnecting: {
    dot: 'bg-reconnecting',
    animate: 'motion-safe:animate-pulse-status',
  },
  offline: { dot: 'bg-offline', animate: '' },
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
  /**
   * Whether the server's event history is shared across instances.
   *
   * Deliberately its own signal rather than a fourth connection state. The
   * three states describe the browser's link to the server, and that link is
   * *fine* when a broker is down — incidents keep arriving. Rendering it as
   * "reconnecting" would be a false alarm about the one thing this bar exists
   * to be trusted about.
   *
   * Absent — the default deployment, no broker — means there is nothing to
   * report and nothing renders. One instance is not a degraded two.
   */
  history?: 'shared' | 'local';
}

export function ConnectionIndicator({
  state,
  feeds,
  showLabel = false,
  history = 'shared',
}: ConnectionIndicatorProps) {
  const t = useTranslations('statusBar');
  const { dot, animate } = CONNECTION[state];
  const label = t(`connection.${state}`);

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
          {t('feeds', { online: feeds.online, total: feeds.total })}
        </span>
      )}
      {/*
       * The dot is decorative, so the state needs a text equivalent — but only
       * when it is not already visible, or a screen reader reads "OFFLINE,
       * feed connection offline".
       */}
      {!showLabel && (
        <span className="sr-only">
          {t('connectionAnnouncement', { state: label })}
        </span>
      )}

      {/*
       * A word, not a colour. Priority owns colour on this screen, and a second
       * hue in the status bar competing with it is what Pass B's "a glance must
       * never confuse 'connection degraded' with 'high priority'" rules out.
       * The tag borrows the SLA badge's treatment, which is the frame's own
       * pattern for "something about this is not nominal".
       */}
      {history === 'local' && (
        <span
          className="text-micro rounded-control border border-border-component px-1.25 py-0.5 font-semibold text-text-secondary"
          title={t('historyLocalDetail')}
        >
          {t('historyLocal')}
        </span>
      )}
    </div>
  );
}
