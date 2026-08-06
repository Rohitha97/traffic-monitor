'use client';

import { useEffect } from 'react';

import { useEventStore } from '@/store/useEventStore';

/**
 * The one interval in the application.
 *
 * Every age counter in the queue ticks from here — not one timer per row. With
 * a dozen rows visible and hundreds of events a shift, per-row intervals would
 * mean a dozen independent timers drifting against each other, each scheduling
 * its own re-render. One store field bumped once a second means one render
 * pass, and every counter on screen showing the same second.
 *
 * Mount it once, at the top of the tree.
 */
export function useLiveClock(): void {
  const advanceTick = useEventStore((state) => state.advanceTick);

  useEffect(() => {
    const interval = setInterval(advanceTick, 1000);
    return () => clearInterval(interval);
  }, [advanceTick]);
}
