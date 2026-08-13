'use client';

import { useEffect } from 'react';

import { PRIORITIES } from '@/lib/priority';
import { createCompositionGuard, isTypingTarget } from '@/lib/shortcuts';
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
    /*
     * Two independent guards, in this order, before any binding is considered.
     *
     * `isTypingTarget` is the broad one: while focus is in a field, keystrokes
     * belong to what is being typed. The composition guard is the narrow one,
     * and it is not redundant — an IME can be composing with focus somewhere
     * `isTypingTarget` does not recognise, and the keystroke that *commits* a
     * conversion can arrive after `compositionend` has already fired.
     *
     * Neither is a Japanese feature. `D` firing a dispatch while an operator
     * types has always been possible; Japanese input makes it the normal case
     * rather than the rare one.
     */
    const composition = createCompositionGuard();

    const onCompositionStart = () => composition.start();
    const onCompositionEnd = () => composition.end();

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (composition.blocks(event)) return;
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

    /*
     * Composition events are captured on the window rather than bound to any
     * one field, because the guard has to know an IME is active regardless of
     * where it is composing — including the places `isTypingTarget` cannot
     * recognise, which are exactly the places the broad guard already misses.
     */
    window.addEventListener('compositionstart', onCompositionStart);
    window.addEventListener('compositionend', onCompositionEnd);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('compositionstart', onCompositionStart);
      window.removeEventListener('compositionend', onCompositionEnd);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    onDispatchRequest,
    onDismissRequest,
    onToggleShortcuts,
    onGenerate,
    suspended,
  ]);
}
