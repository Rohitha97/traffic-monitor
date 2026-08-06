'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { BufferedEventsBar } from '@/components/BufferedEventsBar';
import { CriticalBanner } from '@/components/CriticalBanner';
import { DismissedStrip } from '@/components/DismissedStrip';
import { DispatchConfirm } from '@/components/DispatchConfirm';
import { EmptyQueue } from '@/components/EmptyQueue';
import { IncidentDetail } from '@/components/IncidentDetail';
import { IncidentRow } from '@/components/IncidentRow';
import { OfflineNotice } from '@/components/OfflineNotice';
import { ShortcutOverlay } from '@/components/ShortcutOverlay';
import { StatusBar } from '@/components/StatusBar';
import { useEventStream } from '@/hooks/useEventStream';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useLiveClock } from '@/hooks/useLiveClock';
import { FEED_COUNT } from '@/lib/cameras';
import { formatClock, formatClockUtc, formatTimestamp } from '@/lib/format';
import {
  preloadSnapshot,
  summaryOf,
  toDetailView,
  toRowView,
} from '@/lib/incident';
import { PRIORITY } from '@/lib/priority';
import {
  isBreachingSla,
  selectBufferedCritical,
  selectCriticalAlert,
  selectLeavingEvents,
  selectOpenCounts,
  selectQueueEvents,
  selectSelected,
  useEventStore,
} from '@/store/useEventStore';

/**
 * The operator's screen: master–detail with a pinned critical band.
 *
 * Everything is driven from one store slice on one shared tick. The client
 * boundary starts here rather than at the page, so the layout shell stays a
 * server component.
 */
export function OperatorConsole() {
  useEventStream();
  useLiveClock();

  const tick = useEventStore((state) => state.tick);
  const connection = useEventStore((state) => state.connection);
  const dataAsOf = useEventStore((state) => state.dataAsOf);
  const buffered = useEventStore((state) => state.buffered);
  const selectedId = useEventStore((state) => state.selectedId);
  const filters = useEventStore((state) => state.filters);
  const muted = useEventStore((state) => state.muted);

  const select = useEventStore((state) => state.select);
  const flushBuffered = useEventStore((state) => state.flushBuffered);
  const setScrolledAway = useEventStore((state) => state.setScrolledAway);
  const acknowledge = useEventStore((state) => state.acknowledge);
  const dispatchResponse = useEventStore((state) => state.dispatchResponse);
  const dismiss = useEventStore((state) => state.dismiss);
  const undoDismiss = useEventStore((state) => state.undoDismiss);
  const toggleFilter = useEventStore((state) => state.toggleFilter);
  const toggleMute = useEventStore((state) => state.toggleMute);

  /*
   * useShallow on the selectors that build a fresh array or object each call.
   * Zustand v5 compares by reference, so without it these would report a change
   * on every store update — including the once-a-second tick — and React would
   * warn the store snapshot is not cached. Choosing a store over Context only
   * pays off if this is enforced.
   */
  const queue = useEventStore(useShallow(selectQueueEvents));
  const counts = useEventStore(useShallow(selectOpenCounts));
  const selected = useEventStore(selectSelected);
  const bufferedCritical = useEventStore(selectBufferedCritical);
  const criticalAlert = useEventStore(selectCriticalAlert);

  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [dismissOpen, setDismissOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Clocks are client-only: rendering them on the server would ship a build-time
  // timestamp and hydrate into a mismatch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), [tick]);
  const clock = now ?? 0;

  /*
   * Subscribe to the raw list and derive the leaving set outside the selector.
   * An inline selector closing over `clock` would be a new function on every
   * render, which defeats useShallow's memoisation and resubscribes the store
   * every second.
   */
  const allEvents = useEventStore(useShallow((state) => state.events));
  const leaving = useMemo(
    () => selectLeavingEvents(allEvents, clock),
    [allEvents, clock],
  );

  // Buffering turns on as soon as an incident is open — an arrival must never
  // move what is being read.
  useEffect(() => {
    setScrolledAway(selectedId !== null);
  }, [selectedId, setScrolledAway]);

  // Warm every queued snapshot so opening a detail never shows a spinner. The
  // single biggest perceived-speed win available here.
  useEffect(() => {
    for (const event of queue) preloadSnapshot(event.snapshotUrl);
  }, [queue]);

  // Keep the keyboard selection in view as ↑↓ walks past the fold.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`[data-event-id="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const onGenerate = useCallback((critical: boolean) => {
    void fetch('/api/events/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: critical ? JSON.stringify({ preset: 'critical' }) : '{}',
    });
  }, []);

  const onDispatchRequest = useCallback(() => setDispatchOpen(true), []);
  const onDismissRequest = useCallback(() => setDismissOpen(true), []);
  const onToggleShortcuts = useCallback(
    () => setShortcutsOpen((open) => !open),
    [],
  );

  useKeyboardShortcuts({
    onDispatchRequest,
    onDismissRequest,
    onToggleShortcuts,
    onGenerate,
    // Radix owns the keyboard while a dialog or menu is open.
    suspended: dispatchOpen || dismissOpen || shortcutsOpen,
  });

  const filterLabel =
    filters.size === 0
      ? null
      : [...filters].map((p) => PRIORITY[p].title).join(', ');

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
        muted={muted}
        onToggleMute={toggleMute}
        activeFilters={filters}
        onToggleFilter={toggleFilter}
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
        onAcknowledge={
          criticalAlert ? () => acknowledge(criticalAlert.id) : undefined
        }
        onView={criticalAlert ? () => select(criticalAlert.id) : undefined}
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
              Queue · {queue.length} open
              {filterLabel && ` · ${filterLabel} only`}
            </h2>
            <span className="text-micro font-medium text-text-secondary">
              Newest first
            </span>
          </div>

          {buffered.length > 0 && (
            <div className="flex-none border-b border-border-hairline p-2">
              <BufferedEventsBar
                count={buffered.length}
                criticalCount={bufferedCritical}
                onLoad={flushBuffered}
              />
            </div>
          )}

          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto"
            onScroll={(event) =>
              setScrolledAway(
                event.currentTarget.scrollTop > 0 || selectedId !== null,
              )
            }
          >
            {queue.length === 0 && leaving.length === 0 ? (
              <div className="p-3">
                <EmptyQueue feeds={{ online: FEED_COUNT, total: FEED_COUNT }} />
              </div>
            ) : (
              <div role="listbox" aria-label="Open incidents">
                {queue.map((event) => (
                  <div key={event.id} data-event-id={event.id}>
                    <IncidentRow
                      {...toRowView(event, clock)}
                      selected={event.id === selectedId}
                      slaBreached={isBreachingSla(event, clock)}
                      arriving={
                        event.priority === 'critical' && event.status === 'new'
                      }
                      onSelect={() => select(event.id)}
                    />
                  </div>
                ))}

                {/*
                 * Incidents on their way out keep their place for the undo
                 * window rather than vanishing — a row that disappears on click
                 * gives no chance to notice a mis-click.
                 */}
                {leaving.map((event) =>
                  event.status === 'dismissed' && event.dismissal ? (
                    <DismissedStrip
                      key={event.id}
                      camera={event.camera.id}
                      reason={event.dismissal.reason.toLowerCase()}
                      onUndo={() => undoDismiss(event.id)}
                    />
                  ) : null,
                )}
              </div>
            )}
          </div>
        </section>

        <IncidentDetail
          {...(selected ? { incident: toDetailView(selected) } : {})}
          {...(selected
            ? {
                onAcknowledge: () => acknowledge(selected.id),
                onDispatchRequest,
                onDismiss: (reason: string) => {
                  dismiss(selected.id, reason);
                  setDismissOpen(false);
                },
              }
            : {})}
          dismissOpen={dismissOpen}
          onDismissOpenChange={setDismissOpen}
        />
      </div>

      <DispatchConfirm
        open={dispatchOpen}
        onOpenChange={setDispatchOpen}
        onConfirm={() => {
          if (selected) dispatchResponse(selected.id);
          setDispatchOpen(false);
        }}
        {...(selected
          ? {
              incident: {
                priority: selected.priority,
                summary: summaryOf(selected),
                camera: selected.camera.id,
                location: selected.camera.name,
                priorityReason: selected.priorityReason,
              },
            }
          : {})}
      />

      <ShortcutOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
