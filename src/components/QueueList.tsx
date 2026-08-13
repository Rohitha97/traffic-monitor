'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { DismissedStrip } from '@/components/DismissedStrip';
import { IncidentRow } from '@/components/IncidentRow';
import { useDomainLabels } from '@/i18n/domain';
import { toRowView } from '@/lib/incident';
import type { DetectionEvent } from '@/lib/schema';
import {
  isBreachingSla,
  RESOLVED_FADE_MS,
  type ClaimState,
} from '@/store/useEventStore';

interface QueueListProps {
  events: readonly DetectionEvent[];
  /** Incidents inside their undo window or resolved fade. */
  leaving: readonly DetectionEvent[];
  selectedId: string | null;
  /**
   * In-flight and refused claims, keyed by incident.
   *
   * Passed rather than read from the store so this component stays a pure
   * function of its props — which is what lets `/dev/states` render every row
   * state, including these two, without a store behind it.
   */
  claims: Record<string, ClaimState>;
  now: number;
  onSelect: (id: string) => void;
  onUndoDismiss: (id: string) => void;
  /** True once the operator is no longer looking at the head of the queue. */
  onScrolledAwayChange: (scrolledAway: boolean) => void;
}

/**
 * Queue row height, from Pass A note 3: "twelve rows at 40px visible at
 * 1440×900 without scrolling". Fixed, which is what makes windowing a wrapper
 * rather than a rewrite — every row measures the same, so the virtualiser
 * never has to guess.
 */
const ROW_HEIGHT = 40;

/**
 * Rows rendered beyond the viewport on each side.
 *
 * Enough that a held arrow key never outruns the renderer, small enough that
 * the point of windowing survives. At 40px a row, six covers a quarter-second
 * of key repeat.
 */
const OVERSCAN = 6;

/*
 * Row insertion: 180ms on cubic-bezier(.2,.7,.3,1), sliding down from the
 * pinned band and fading in — "pushed, never jumped". (Pass B §05)
 *
 * The token values are duplicated here rather than read from CSS because
 * Motion animates in JavaScript; they are the same numbers Pass B approved and
 * the same ones `--ease-row` / `--duration-row` carry for the CSS transitions.
 */
const ROW_EASE = [0.2, 0.7, 0.3, 1] as const;
const ROW_DURATION = 0.18;

export function QueueList({
  events,
  leaving,
  selectedId,
  claims,
  now,
  onSelect,
  onUndoDismiss,
  onScrolledAwayChange,
}: QueueListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const labels = useDomainLabels();

  const virtualizer = useVirtualizer({
    count: events.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    // Keyed by incident, not by index: prepending must not make React reuse
    // row 0's DOM for a different incident.
    getItemKey: (index) => events[index]?.id ?? index,
  });

  /*
   * Which incidents have been on screen before.
   *
   * Virtualised rows mount and unmount as they scroll, so a plain mount
   * animation would fire every time a row scrolled into view — the queue would
   * shimmer whenever anyone moved. Only genuinely new incidents animate.
   *
   * Read during render, written after paint: the ref is not state and never
   * drives a re-render of its own.
   */
  const knownRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const known = knownRef.current;
    for (const event of events) known.add(event.id);
  }, [events]);

  /*
   * Keep the view anchored when incidents are prepended.
   *
   * Buffering already stops routine arrivals from reordering the queue, but a
   * critical is designed to jump the buffer — and in a windowed list, inserting
   * at index 0 while scrolled shifts everything under the operator by a row.
   * That is precisely the guarantee the buffering exists to protect, so the
   * scroll offset is compensated by the height of whatever was inserted above
   * the current position.
   *
   * Layout effect, not effect: this has to happen before the browser paints,
   * or the shift is visible as a jump.
   */
  const firstIdRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    const previousFirstId = firstIdRef.current;
    const firstId = events[0]?.id ?? null;
    firstIdRef.current = firstId;

    if (!element || !previousFirstId || firstId === previousFirstId) return;
    if (element.scrollTop === 0) return;

    const inserted = events.findIndex((event) => event.id === previousFirstId);
    if (inserted > 0) element.scrollTop += inserted * ROW_HEIGHT;
  }, [events]);

  /*
   * Bring the selection into view through the virtualiser.
   *
   * Never `scrollIntoView` on the element: at four hundred incidents the
   * selected row is usually not mounted, so there is no element to call it on.
   * Selection lives in the store as a position in the list, and this translates
   * that position into a scroll offset — which works whether or not the row
   * currently exists in the DOM.
   */
  const selectedIndex = useMemo(
    () => events.findIndex((event) => event.id === selectedId),
    [events, selectedId],
  );
  useEffect(() => {
    if (selectedIndex >= 0)
      virtualizer.scrollToIndex(selectedIndex, { align: 'auto' });
  }, [selectedIndex, virtualizer]);

  const enter = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 } };

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto"
      onScroll={(event) =>
        onScrolledAwayChange(event.currentTarget.scrollTop > 0)
      }
    >
      <div
        role="listbox"
        aria-label="Open incidents"
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const event = events[item.index];
          if (!event) return null;
          const isNew = !knownRef.current.has(event.id);

          return (
            <div
              key={item.key}
              data-event-id={event.id}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              {/*
               * The animation sits on an inner element so its transform
               * composes with the virtualiser's positioning transform on the
               * wrapper rather than fighting it.
               */}
              <motion.div
                {...(isNew ? enter : {})}
                transition={{
                  duration: reduced ? 0.1 : ROW_DURATION,
                  ease: ROW_EASE,
                }}
              >
                <IncidentRow
                  {...toRowView(event, now, labels)}
                  selected={event.id === selectedId}
                  slaBreached={isBreachingSla(event, now)}
                  {...(claims[event.id] ? { claim: claims[event.id] } : {})}
                  arriving={
                    event.priority === 'critical' && event.status === 'new'
                  }
                  onSelect={() => onSelect(event.id)}
                  /*
                   * A windowed listbox renders a handful of options out of
                   * hundreds. Without these a screen reader announces "3 of 8"
                   * on a queue of four hundred — the count it can see rather
                   * than the count that exists.
                   */
                  setSize={events.length}
                  posInSet={item.index + 1}
                />
              </motion.div>
            </div>
          );
        })}
      </div>

      {/*
       * Incidents on their way out keep their place rather than vanishing — a
       * row that disappears on click gives no chance to notice a mis-click.
       * Dismissed collapses to the 20px strip with an undo; resolved fades over
       * three seconds and leaves. (Pass C frame 4, Pass A)
       *
       * Deliberately outside the virtualiser and outside the listbox: this set
       * is bounded by an eight-second window, so windowing it would buy
       * nothing, and neither a dismissal strip nor a row that is fading out is
       * an option the operator can still choose.
       */}
      {leaving.length > 0 && (
        <div aria-label="Recently closed">
          {leaving.map((event) =>
            event.status === 'dismissed' && event.dismissal ? (
              <DismissedStrip
                key={event.id}
                camera={event.camera.id}
                reason={labels
                  .dismissReason(event.dismissal.reason)
                  .toLowerCase()}
                onUndo={() => onUndoDismiss(event.id)}
              />
            ) : (
              <motion.div
                key={event.id}
                initial={{ opacity: 1 }}
                animate={{ opacity: reduced ? 1 : 0 }}
                transition={{
                  duration: reduced ? 0.1 : RESOLVED_FADE_MS / 1000,
                }}
              >
                <IncidentRow
                  {...toRowView(event, now, labels)}
                  interactive={false}
                />
              </motion.div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
