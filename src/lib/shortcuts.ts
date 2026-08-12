/*
 * The keyboard model, as data.
 *
 * The `?` overlay renders from this table. The handler is a switch over key
 * literals rather than a loop over these rows — dispatching from data would
 * mean an indirection for one caller — so the two *can* drift, and
 * `shortcuts.test.ts` asserts in both directions that they have not: no
 * published binding without a case, no working binding left unpublished.
 *
 * That check found `N` working as an alias for `Home` with nothing in the
 * overlay saying so, which is the usual failure mode for a help screen
 * maintained by hand.
 *
 * Where the design and the build brief disagree, the design wins
 * (DESIGN_INVENTORY.md §6). The important one: Pass A's state machine has
 * `Enter` *acknowledge and take the lock*, not merely open — because ↑↓
 * already previews, so opening is not an action that needs a key. The brief's
 * J/K and N survive as aliases.
 */

export interface Shortcut {
  /** What the overlay prints. */
  keys: string;
  action: string;
  group: 'Move' | 'Decide' | 'Filter' | 'Session';
}

export const SHORTCUTS: readonly Shortcut[] = [
  {
    keys: '↑ / ↓',
    action: 'Previous / next incident — previews as it moves',
    group: 'Move',
  },
  {
    keys: 'K / J',
    action: 'Same, without leaving the home row',
    group: 'Move',
  },
  { keys: 'Home / N', action: 'Load buffered new events', group: 'Move' },
  { keys: 'Esc', action: 'Close the detail pane', group: 'Move' },

  { keys: 'Enter', action: 'Acknowledge, and take the lock', group: 'Decide' },
  {
    keys: 'D',
    action: 'Dispatch a response — Enter confirms',
    group: 'Decide',
  },
  {
    keys: 'X',
    action: 'Dismiss as a false positive, with a reason',
    group: 'Decide',
  },
  { keys: 'R', action: 'Mark resolved', group: 'Decide' },

  {
    keys: '1 – 4',
    action: 'Filter by priority: critical, high, medium, low',
    group: 'Filter',
  },
  { keys: '0', action: 'Clear all filters', group: 'Filter' },

  {
    keys: 'M',
    action: 'Mute / unmute the critical alert tone',
    group: 'Session',
  },
  {
    keys: 'G',
    action: 'Generate a test event — Shift+G for a critical',
    group: 'Session',
  },
  { keys: '?', action: 'This list', group: 'Session' },
];

export const SHORTCUT_GROUPS = ['Move', 'Decide', 'Filter', 'Session'] as const;

/**
 * True when a keystroke belongs to whatever the operator is typing into rather
 * than to the queue. Without this, typing a dismissal note would dispatch a
 * response on the "d".
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}
