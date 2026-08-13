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

/*
 * Input Method Editors, and why single-key shortcuts are dangerous.
 *
 * Japanese text entry goes through an IME. Typing 渋滞 means pressing
 * `j-u-u-t-a-i` and then converting, and **every one of those keystrokes fires
 * a real `keydown`**. This application binds `D` to dispatch and `X` to
 * dismiss. Without a guard, an operator typing a Japanese dismissal note fires
 * dispatch actions mid-word — in a system whose purpose is sending safety crews
 * onto a live motorway.
 *
 * The bug exists in English too. Japanese only makes it constant instead of
 * occasional, which is why the fix is a guard rather than a rebinding.
 */

/**
 * Grace period after `compositionend`.
 *
 * The keystroke that *commits* a conversion is the problem case: the ordering
 * of `compositionend` against that key's `keydown` is not consistent across
 * browsers and IMEs, and in the orderings where `compositionend` lands first,
 * the committing Enter arrives with `isComposing` already false. Enter
 * acknowledges an incident.
 *
 * A few frames of suppression after composition ends closes that window. It can
 * swallow a genuine keystroke pressed within 50ms of committing text — which is
 * the right trade in both directions, because the alternative is dispatching a
 * safety crew on the keypress that finished a word.
 */
const COMPOSITION_TAIL_MS = 50;

/** The parts of a `keydown` that say whether an IME is mid-word. */
export interface CompositionSignals {
  isComposing: boolean;
  /**
   * Legacy, and still necessary: several browsers report `229` for every
   * keystroke during composition rather than setting `isComposing`. Checking
   * only the modern flag leaves those users unprotected.
   */
  keyCode: number;
}

export function isComposingKey(event: CompositionSignals): boolean {
  return event.isComposing || event.keyCode === 229;
}

export interface CompositionGuard {
  start(): void;
  end(now?: number): void;
  /** True when this keystroke is part of composing text, not a command. */
  blocks(event: CompositionSignals, now?: number): boolean;
  readonly composing: boolean;
}

/**
 * Tracks whether an IME is mid-composition.
 *
 * Three overlapping signals rather than one, because no single one is reliable
 * everywhere: the explicit `compositionstart`/`compositionend` pair, the
 * per-event `isComposing` flag, and the legacy `229` key code. They are cheap
 * and they fail in different browsers.
 */
export function createCompositionGuard(
  tailMs: number = COMPOSITION_TAIL_MS,
): CompositionGuard {
  let composing = false;
  let endedAt = Number.NEGATIVE_INFINITY;

  return {
    start() {
      composing = true;
    },
    end(now = performance.now()) {
      composing = false;
      endedAt = now;
    },
    blocks(event, now = performance.now()) {
      if (composing || isComposingKey(event)) return true;
      return now - endedAt < tailMs;
    },
    get composing() {
      return composing;
    },
  };
}
