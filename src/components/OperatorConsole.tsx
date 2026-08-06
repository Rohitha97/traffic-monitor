'use client';

import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { BufferedEventsBar } from '@/components/BufferedEventsBar';
import { CriticalBanner } from '@/components/CriticalBanner';
import { EmptyQueue } from '@/components/EmptyQueue';
import { IncidentDetail } from '@/components/IncidentDetail';
import { IncidentRow } from '@/components/IncidentRow';
import { OfflineNotice } from '@/components/OfflineNotice';
import { StatusBar } from '@/components/StatusBar';
import { useEventStream } from '@/hooks/useEventStream';
import { useLiveClock } from '@/hooks/useLiveClock';
import { FEED_COUNT } from '@/lib/cameras';
import { formatClock, formatClockUtc, formatTimestamp } from '@/lib/format';
import {
  preloadSnapshot,
  summaryOf,
  toDetailView,
  toRowView,
} from '@/lib/incident';
import {
  isBreachingSla,
  selectBufferedCritical,
  selectOpenCounts,
  selectSelected,
  selectVisibleEvents,
  useEventStore,
} from '@/store/useEventStore';

/**
 * The operator's screen: master–detail with a pinned critical band.
 *
 * Everything here is driven from one store slice on one shared tick. The
 * client boundary starts at this component rather than at the page so the
 * layout shell stays a server component.
 */
export function OperatorConsole() {
  useEventStream();
  useLiveClock();

  const tick = useEventStore((state) => state.tick);
  const connection = useEventStore((state) => state.connection);
  const dataAsOf = useEventStore((state) => state.dataAsOf);
  const buffered = useEventStore((state) => state.buffered);
  const selectedId = useEventStore((state) => state.selectedId);
  const select = useEventStore((state) => state.select);
  const flushBuffered = useEventStore((state) => state.flushBuffered);
  const setScrolledAway = useEventStore((state) => state.setScrolledAway);

  /*
   * useShallow on the two selectors that build a fresh array or object each
   * call. Zustand v5 compares by reference, so without it these would report a
   * change on every store update — including the once-a-second tick — and
   * React would warn that the store snapshot is not cached. The whole reason
   * for choosing a store over Context was to keep a one-second clock from
   * re-rendering the world; this is where that is actually enforced.
   */
  const visible = useEventStore(useShallow(selectVisibleEvents));
  const counts = useEventStore(useShallow(selectOpenCounts));
  const selected = useEventStore(selectSelected);
  const bufferedCritical = useEventStore(selectBufferedCritical);

  // Clocks are client-only state: rendering them on the server would ship a
  // timestamp from build time and hydrate into a mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [tick]);

  // Buffering turns on as soon as an incident is open — an arrival must never
  // move what is being read.
  useEffect(() => {
    setScrolledAway(selectedId !== null);
  }, [selectedId, setScrolledAway]);

  // Warm every queued snapshot so opening a detail never shows a spinner.
  useEffect(() => {
    for (const event of visible) preloadSnapshot(event.snapshotUrl);
  }, [visible]);

  // The banner shows the newest unacknowledged critical, and retires the
  // moment it is acknowledged. Nothing auto-dismisses it. (Pass A, Pass C f2)
  const criticalAlert = useMemo(
    () => visible.find((e) => e.priority === 'critical' && e.status === 'new'),
    [visible],
  );

  const clock = now ?? 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ground">
      <StatusBar
        connection={connection}
        feeds={{
          online: connection === 'offline' ? 0 : FEED_COUNT,
          total: FEED_COUNT,
        }}
        counts={counts}
        localTime={now === null ? '--:--:--' : formatClock(now)}
        utcTime={now === null ? '--:--:--' : formatClockUtc(now)}
        muted
      />

      {/*
       * Pinned critical band — zero-height whenever nothing is critical, and
       * the one place on screen a critical can ever appear. (Pass A §04)
       */}
      <CriticalBanner
        present={criticalAlert !== undefined}
        headline={
          criticalAlert
            ? `${summaryOf(criticalAlert)} — ${criticalAlert.camera.id}, ${criticalAlert.camera.name}`
            : ''
        }
        detail={
          criticalAlert
            ? `${criticalAlert.priorityReason.split(' — ')[1] ?? ''} · detected ${formatTimestamp(criticalAlert.detectedAt)}`
            : ''
        }
      />

      {connection === 'offline' && dataAsOf && (
        <OfflineNotice dataAsOf={formatTimestamp(dataAsOf)} />
      )}

      <div className="flex min-h-0 flex-1">
        <section
          aria-label="Incident queue"
          className="flex w-108 flex-none flex-col border-r border-border-hairline"
        >
          <div className="flex h-9 flex-none items-center justify-between border-b border-border-hairline px-3">
            <h2 className="text-micro tracking-kicker font-semibold text-text-tertiary uppercase">
              Queue · {visible.length} open
            </h2>
            <span className="text-micro font-medium text-text-secondary">
              Newest first
            </span>
          </div>

          {buffered.length > 0 && (
            <div className="flex-none border-b border-border-hairline p-2">
              <button
                type="button"
                onClick={flushBuffered}
                className="w-full cursor-pointer text-left"
              >
                <BufferedEventsBar
                  count={buffered.length}
                  criticalCount={bufferedCritical}
                />
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {visible.length === 0 ? (
              <div className="p-3">
                <EmptyQueue feeds={{ online: FEED_COUNT, total: FEED_COUNT }} />
              </div>
            ) : (
              <div role="listbox" aria-label="Open incidents">
                {visible.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => select(event.id)}
                    className="block w-full text-left"
                  >
                    <IncidentRow
                      {...toRowView(event, clock)}
                      selected={event.id === selectedId}
                      slaBreached={isBreachingSla(event, clock)}
                      arriving={
                        event.priority === 'critical' && event.status === 'new'
                      }
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <IncidentDetail
          {...(selected ? { incident: toDetailView(selected) } : {})}
        />
      </div>
    </div>
  );
}
