# ADR-0010 — IME composition and single-key shortcuts

**Status:** accepted
**Date:** 2026-08-13
**Phase:** 9, workstream B

## Context

Japanese text entry goes through an Input Method Editor. Typing 渋滞 means pressing `j-u-u-t-a-i`
and then converting, and **every one of those keystrokes fires a real `keydown`**.

This application binds `D` to dispatch and `X` to dismiss, unmodified. An operator typing a Japanese
dismissal note or camera note would fire dispatch actions mid-word — in a system whose purpose is
sending safety crews onto a live motorway.

The bug is not new and is not Japanese. `D` firing while someone types has always been possible in
English; Japanese input makes it the normal case rather than the rare one. That is why the fix is a
guard rather than a rebinding, and why it applies in both locales.

## Decisions

### Three overlapping signals, because no single one is reliable

`createCompositionGuard` in `src/lib/shortcuts.ts` tracks composition from:

1. **`compositionstart` / `compositionend`**, listened for on the window rather than bound to a
   field — the guard has to know an IME is active regardless of where it is composing, including
   the places the focus check below cannot recognise.
2. **`event.isComposing`** on each `keydown`, which is the modern per-event signal.
3. **`event.keyCode === 229`**, which several browsers report for every keystroke during
   composition _instead of_ setting `isComposing`. Checking only the modern flag leaves those users
   unprotected.

They are cheap, and they fail in different browsers.

### A 50ms tail after `compositionend`

The keystroke that _commits_ a conversion is the dangerous one. The ordering of `compositionend`
against that key's `keydown` is not consistent across browsers and IMEs, and in the orderings where
`compositionend` lands first, the Enter finishing a Japanese word arrives with `isComposing` already
false. **Enter acknowledges an incident and takes the lock.**

So the guard keeps blocking for a few frames after composition ends. It can swallow a genuine
keystroke pressed within 50ms of committing text, and that is the right trade in both directions:
the alternative is dispatching a safety crew on the keypress that finished a word.

In practice the cost is near zero, because after committing text focus is still in the field and the
broad guard below is already blocking.

### Two guards, not one

`isTypingTarget` — the pre-existing check for `input`, `textarea`, `select` and `contenteditable` —
stays, and runs first. The composition guard is not redundant with it:

- `isTypingTarget` covers _where focus is_. The composition guard covers _what the IME is doing_,
  including composition in a container it does not recognise.
- `isTypingTarget` cannot see the commit-ordering problem at all.

The E2E suite asserts both layers separately, so a regression in the broad one cannot hide behind
the narrow one.

### B2 — the binding audit

Every binding, checked against IME conflict:

| Binding        | Romaji-typed? | Status                                                      |
| -------------- | ------------- | ----------------------------------------------------------- |
| `↑` `↓`        | no            | arrow keys are not produced by romaji input                 |
| `K` / `J`      | **yes**       | safe behind the composition guard                           |
| `Home` / `N`   | **yes** (`n`) | safe behind the composition guard                           |
| `Esc`          | no            | cancels composition rather than reaching the handler        |
| `Enter`        | **yes**       | the commit key — the tail window exists for this            |
| `D` (dispatch) | **yes**       | safe behind the guard; see the proposal below               |
| `X` (dismiss)  | **yes**       | safe behind the guard; see the proposal below               |
| `R` (resolve)  | **yes**       | safe behind the guard                                       |
| `1`–`4`, `0`   | **yes**       | digits appear in romaji input; safe behind the guard        |
| `M` (mute)     | **yes**       | safe behind the guard                                       |
| `G` (generate) | **yes**       | dev affordance; safe behind the guard                       |
| `?`            | no            | requires Shift; also the one binding that survives a dialog |

Every romaji-producible binding is behind the composition guard. None needed a modifier to be made
safe, which is the outcome that keeps the design's "one keyboard axis, no modes" intact.

## Proposal, not a change: modifiers on destructive actions

The brief asks whether `D` and `X` should require a modifier **in all locales**, and asks for a
proposal rather than a unilateral change. Raising it here.

**The case for.** `D` on a single unmodified keypress sends a safety crew. That is a thin margin
regardless of language — a dropped pen, a cat, a lean on the keyboard. The composition guard closes
the IME hole but does nothing about a stray press while the queue has focus.

**The case against, and why I have not changed it.**

- `D` does not dispatch. It opens a confirmation that `Enter` then confirms — the destructive act is
  already two deliberate keystrokes, which is the margin a modifier would be adding. `X` likewise
  opens a reason picker, and dismissal is undoable for eight seconds.
- The design's keyboard model is "one keyboard axis and no modes" (Pass A). Modifiers are a mode.
- Time to decision is the number the whole design argues from, with a 15-second target for a
  critical. Adding a modifier to the two most common decisions costs against the thing the product
  is optimised for, to protect against a risk the confirmation step already covers.

**Recommendation:** leave the bindings as they are, and revisit if the confirmation step is ever
removed for speed — that is the change that would make a modifier necessary, and the two should be
considered together. Logged on the roadmap so it is a decision rather than an omission.

## Verification

**Five E2E specs that drive real composition** (`e2e/ime.spec.ts`), dispatching genuine
`compositionstart` / `keydown` / `compositionupdate` / `compositionend` sequences — including the
commit ordering where `compositionend` precedes an Enter with `isComposing` false. Mocking the flag
would have asserted the assumption rather than checked the browser.

The suite covers both directions:

- composing `juutai` and `dourodxa` opens no dispatch confirmation and no dismissal menu;
- the commit keystroke does not acknowledge;
- **shortcuts still work when nobody is composing** — a dashboard where `D` never dispatches is also
  broken and would pass every other assertion;
- a shortcut works again once the tail has passed, so the guard cannot latch;
- typing in a field never reaches the queue, composing or not.

**Proved load-bearing by disabling the guard**: three of the five fail, and the two that do not
depend on it still pass. The failing set is exactly the three that assert the fix.

**A flaw in the first version of the suite, found by that check.** The "no overlay opened" assertion
used `getByRole('dialog')`, which matches neither Radix's `alertdialog` (dispatch) nor `menu`
(dismiss) — so it passed whether or not a shortcut had fired. It now matches all three roles
explicitly, which is what turned the disabled-guard probe from two failures into three.

**11 unit tests** on the guard itself: each signal independently, the tail window at its boundary,
that it does not block before any composition has happened, and that it re-arms across a second
composition.

## Consequences

- **B3, pluralisation, is implemented alongside this** because it shares the workstream. The
  buffered-events bar is the application's one counted string: English takes `one`/`other`, Japanese
  a single `other` branch with the 件 counter. Writing two identical Japanese branches to mirror
  English would be a translation that had not understood the question.
- **Counter words are asserted, not assumed.** Events are 件, camera feeds are 台. A unit test pins
  both, along with the rule that Japanese keeps Western Arabic digits — kanji numerals appear in no
  Japanese technical interface and the tabular face has no glyphs for them.
- **The Japanese register is asserted too**: no です/ます endings and no apologies in any message.
  Machine-generated status text is plain and declarative, and an apology in a line an operator reads
  a hundred times a shift is noise.
