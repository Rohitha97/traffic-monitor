'use client';

import { useEffect } from 'react';

import { SEEN_DWELL_MS } from '@/lib/metrics';
import { useEventStore } from '@/store/useEventStore';

/**
 * Marks an incident seen once it has held the detail pane long enough to have
 * actually been read.
 *
 * The threshold is the whole design decision here. Pass A's keyboard model is
 * "↑↓ moves *and previews*", so selection and detail-pane render are the same
 * event — there is no separate "open" step to measure from. Marking on render
 * alone would count every row an operator cursored past, which would make time
 * to awareness measure scrolling speed rather than attention.
 *
 * So the timer starts when the incident takes the pane and is cancelled if
 * something else takes it first. Arrow-key repeat fires far faster than the
 * threshold, so walking the queue marks nothing; stopping on a row marks it.
 *
 * See ADR-0004 for why this definition, and what it costs.
 */
export function useSeenMark(selectedId: string | null): void {
  const markSeen = useEventStore((state) => state.markSeen);

  useEffect(() => {
    if (!selectedId) return;

    const timer = setTimeout(() => markSeen(selectedId), SEEN_DWELL_MS);
    return () => clearTimeout(timer);
  }, [selectedId, markSeen]);
}
