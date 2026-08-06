'use client';

import { useEffect } from 'react';

import { PRIORITIES } from '@/lib/priority';
import { isTypingTarget } from '@/lib/shortcuts';
import { useEventStore } from '@/store/useEventStore';

interface ShortcutHandlers {
  /** D — opens the confirmation rather than dispatching outright. */
  onDispatchRequest: () => void;
  /** X — opens the reason picker; dismissing always states a reason. */
  onDismissRequest: () => void;
  /** ? — the overlay. */
  onToggleShortcuts: () => void;
  /** G / Shift+G — ask the ingest route for an event. */
  onGenerate: (critical: boolean) => void;
  /** True while a dialog owns the keyboard; Radix handles Esc and focus itself. */
  suspended: boolean;
}

/**
 * One keyboard axis, no modes.
 *
 * Everything reads the store through `getState()` at the moment the key is
 * pressed rather than through closed-over values, so the listener can be
 * registered once and never goes stale — and so holding ↓ moves down the queue
 * that exists now, not the one that existed when the effect ran.
 */
export function useKeyboardShortcuts({
  onDispatchRequest,
  onDismissRequest,
  onToggleShortcuts,
  onGenerate,
  suspended,
}: ShortcutHandlers): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      // `?` is the one binding that still works while a dialog is open, so the
      // overlay can be dismissed by the same key that opened it.
      if (event.key === '?') {
        event.preventDefault();
        onToggleShortcuts();
        return;
      }
      if (suspended) return;

      const store = useEventStore.getState();
      const selectedId = store.selectedId;

      switch (event.key) {
        case 'ArrowDown':
        case 'j':
        case 'J':
          event.preventDefault();
          store.moveSelection(1);
          return;

        case 'ArrowUp':
        case 'k':
        case 'K':
          event.preventDefault();
          store.moveSelection(-1);
          return;

        case 'Home':
        case 'n':
        case 'N':
          event.preventDefault();
          store.flushBuffered();
          return;

        case 'Escape':
          event.preventDefault();
          store.select(null);
          return;

        case 'Enter':
          if (!selectedId) return;
          event.preventDefault();
          store.acknowledge(selectedId);
          return;

        case 'd':
        case 'D':
          if (!selectedId) return;
          event.preventDefault();
          // A real dispatch costs money, so it confirms — but with a single
          // keypress, because a four-second modal costs more.
          onDispatchRequest();
          return;

        case 'x':
        case 'X':
          if (!selectedId) return;
          event.preventDefault();
          onDismissRequest();
          return;

        case 'r':
        case 'R':
          if (!selectedId) return;
          event.preventDefault();
          store.resolve(selectedId);
          return;

        case 'm':
        case 'M':
          event.preventDefault();
          store.toggleMute();
          return;

        case 'g':
          event.preventDefault();
          onGenerate(false);
          return;

        case 'G':
          event.preventDefault();
          onGenerate(true);
          return;

        case '0':
          event.preventDefault();
          store.clearFilters();
          return;

        case '1':
        case '2':
        case '3':
        case '4': {
          event.preventDefault();
          const priority = PRIORITIES[Number(event.key) - 1];
          if (priority) store.toggleFilter(priority);
          return;
        }

        default:
          return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    onDispatchRequest,
    onDismissRequest,
    onToggleShortcuts,
    onGenerate,
    suspended,
  ]);
}
