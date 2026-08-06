'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { DismissedStrip } from '@/components/DismissedStrip';
import { IncidentRow } from '@/components/IncidentRow';
import { toRowView } from '@/lib/incident';
import type { DetectionEvent } from '@/lib/schema';
import { isBreachingSla, RESOLVED_FADE_MS } from '@/store/useEventStore';

interface QueueListProps {
  events: readonly DetectionEvent[];
  /** Incidents inside their undo window or resolved fade. */
  leaving: readonly DetectionEvent[];
  selectedId: string | null;
  now: number;
  onSelect: (id: string) => void;
  onUndoDismiss: (id: string) => void;
}

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
  now,
  onSelect,
  onUndoDismiss,
}: QueueListProps) {
  /*
   * "Every duration collapses to 0–100ms and drops its transform in favour of
   * a plain opacity swap." (Pass B §05) The CSS half of this rule lives in a
   * prefers-reduced-motion block in globals.css; this is the JavaScript half,
   * for the animations Motion owns.
   */
  const reduced = useReducedMotion();

  const enter = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: -6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0 },
      };

  return (
    <div role="listbox" aria-label="Open incidents">
      <AnimatePresence initial={false}>
        {events.map((event) => (
          <motion.div
            key={event.id}
            layout={!reduced}
            data-event-id={event.id}
            {...enter}
            transition={{
              duration: reduced ? 0.1 : ROW_DURATION,
              ease: ROW_EASE,
            }}
          >
            <IncidentRow
              {...toRowView(event, now)}
              selected={event.id === selectedId}
              slaBreached={isBreachingSla(event, now)}
              arriving={event.priority === 'critical' && event.status === 'new'}
              onSelect={() => onSelect(event.id)}
            />
          </motion.div>
        ))}

        {/*
         * Incidents on their way out keep their place rather than vanishing —
         * a row that disappears on click gives no chance to notice a mis-click.
         * Dismissed collapses to the 20px strip with an undo; resolved fades
         * over three seconds and leaves. (Pass C frame 4, Pass A)
         */}
        {leaving.map((event) =>
          event.status === 'dismissed' && event.dismissal ? (
            <motion.div
              key={event.id}
              {...enter}
              transition={{ duration: 0.12 }}
            >
              <DismissedStrip
                camera={event.camera.id}
                reason={event.dismissal.reason.toLowerCase()}
                onUndo={() => onUndoDismiss(event.id)}
              />
            </motion.div>
          ) : (
            <motion.div
              key={event.id}
              initial={{ opacity: 1 }}
              animate={{ opacity: reduced ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0.1 : RESOLVED_FADE_MS / 1000 }}
            >
              <IncidentRow {...toRowView(event, now)} />
            </motion.div>
          ),
        )}
      </AnimatePresence>
    </div>
  );
}
