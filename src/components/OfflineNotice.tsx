import { ConnectionIndicator } from '@/components/ConnectionIndicator';

interface OfflineNoticeProps {
  /**
   * The moment the data stopped being trustworthy — frozen, not live. Showing
   * a ticking clock next to stale data would be a lie about its freshness.
   */
  dataAsOf: string;
}

/**
 * Connection lost.
 *
 * Two things have to be true at once: the operator must know the feed is down,
 * and must still be able to read the last known state — so the queue stays on
 * screen at reduced opacity rather than being replaced by an error. Trust
 * comes from saying exactly how stale the data is, not from hiding it.
 */
export function OfflineNotice({ dataAsOf }: OfflineNoticeProps) {
  return (
    <div
      role="status"
      className="flex h-10 flex-none items-center gap-2.5 border-b border-border-hairline bg-panel px-3"
    >
      <ConnectionIndicator state="offline" showLabel />
      <p className="text-kicker font-medium text-text-secondary">
        Feed connection lost. Showing data as of {dataAsOf}. Reconnecting
        automatically.
      </p>
    </div>
  );
}
