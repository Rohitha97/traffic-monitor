import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { isTypingTarget, SHORTCUT_GROUPS, SHORTCUTS } from '@/lib/shortcuts';

/*
 * The keyboard model.
 *
 * This table's own docstring says published bindings and working bindings
 * "cannot drift apart". That is the intent, and it is not quite what the code
 * guarantees: the `?` overlay renders from this table, but the handler is a
 * switch over key literals. Nothing structural stops one from gaining a binding
 * the other does not have.
 *
 * So the guarantee is asserted here instead of assumed. The mapping below is
 * the only place that says "the row labelled `K / J` is the one the handler
 * spells 'k' and 'j'", and it is deliberately written out rather than derived —
 * a derivation clever enough to parse "1 – 4" would be a second thing to trust.
 */

/** Display label → the `event.key` values the handler must have a case for. */
const KEYS_BEHIND_LABEL: Record<string, readonly string[]> = {
  '↑ / ↓': ['ArrowUp', 'ArrowDown'],
  'K / J': ['k', 'K', 'j', 'J'],
  'Home / N': ['Home', 'n', 'N'],
  Esc: ['Escape'],
  Enter: ['Enter'],
  D: ['d', 'D'],
  X: ['x', 'X'],
  R: ['r', 'R'],
  '1 – 4': ['1', '2', '3', '4'],
  '0': ['0'],
  M: ['m', 'M'],
  G: ['g', 'G'],
  '?': ['?'],
};

const handlerSource = readFileSync(
  fileURLToPath(new URL('../hooks/useKeyboardShortcuts.ts', import.meta.url)),
  'utf8',
);

describe('the published table', () => {
  it('lists every binding exactly once', () => {
    const keys = SHORTCUTS.map((shortcut) => shortcut.keys);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('puts every binding in a known group', () => {
    for (const shortcut of SHORTCUTS) {
      expect(SHORTCUT_GROUPS).toContain(shortcut.group);
    }
  });

  it('leaves no group empty, so the overlay never renders a bare heading', () => {
    for (const group of SHORTCUT_GROUPS) {
      expect(
        SHORTCUTS.some((shortcut) => shortcut.group === group),
        `no shortcuts in "${group}"`,
      ).toBe(true);
    }
  });

  it('describes what every binding does', () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.keys.trim()).not.toBe('');
      expect(shortcut.action.trim()).not.toBe('');
    }
  });

  it('says Enter acknowledges, which is where the design overrides the brief', () => {
    // Pass A's state machine: ↑↓ already previews, so opening is not an action
    // that needs a key. DESIGN_INVENTORY §6.
    const enter = SHORTCUTS.find((shortcut) => shortcut.keys === 'Enter');
    expect(enter?.action).toMatch(/acknowledge/i);
    expect(enter?.action).not.toMatch(/\bopen\b/i);
  });
});

describe('published bindings match the handler', () => {
  it('has a case for every key the overlay publishes', () => {
    for (const { keys } of SHORTCUTS) {
      const expected = KEYS_BEHIND_LABEL[keys];
      expect(expected, `no key mapping recorded for "${keys}"`).toBeDefined();

      for (const key of expected!) {
        expect(
          handlerSource.includes(`'${key}'`),
          `the overlay publishes "${keys}" but the handler has no case for '${key}'`,
        ).toBe(true);
      }
    }
  });

  it('publishes every key the handler dispatches on', () => {
    // The other direction, which is the one that rots quietly: a binding that
    // works and is not in the `?` list is a feature nobody can find.
    const cases = [...handlerSource.matchAll(/case '([^']+)':/g)].map(
      (match) => match[1]!,
    );
    const published = new Set(Object.values(KEYS_BEHIND_LABEL).flat());

    for (const key of cases) {
      expect(
        published.has(key),
        `the handler dispatches on '${key}' but nothing publishes it`,
      ).toBe(true);
    }
  });
});

describe('isTypingTarget', () => {
  /*
   * `HTMLElement` is a browser global and this suite runs in node, so it is
   * stubbed with a stand-in the `instanceof` check can succeed against. The
   * function's job is a shape test, not a DOM operation.
   */
  class FakeElement extends EventTarget {
    tagName: string;
    isContentEditable = false;
    constructor(tagName: string) {
      super();
      this.tagName = tagName;
    }
  }

  const element = (tagName: string, contentEditable = false) => {
    const node = new FakeElement(tagName);
    node.isContentEditable = contentEditable;
    (globalThis as { HTMLElement?: unknown }).HTMLElement = FakeElement;
    return node;
  };

  afterEach(() => {
    delete (globalThis as { HTMLElement?: unknown }).HTMLElement;
  });

  it('is true for the fields an operator types into', () => {
    // Without this, typing a dismissal note would dispatch a response on the
    // "d" — the reason the guard exists.
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(isTypingTarget(element(tag))).toBe(true);
    }
  });

  it('is true for a contenteditable element whatever its tag', () => {
    expect(isTypingTarget(element('DIV', true))).toBe(true);
  });

  it('is false for the queue and the rest of the page', () => {
    for (const tag of ['DIV', 'BUTTON', 'MAIN', 'BODY']) {
      expect(isTypingTarget(element(tag))).toBe(false);
    }
  });

  it('is false for null, which is what a keystroke with no focus reports', () => {
    (globalThis as { HTMLElement?: unknown }).HTMLElement = FakeElement;
    expect(isTypingTarget(null)).toBe(false);
  });
});
