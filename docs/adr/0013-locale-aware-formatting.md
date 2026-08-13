# ADR-0013 — Locale-aware formatting, and the age counter

**Status:** accepted
**Date:** 2026-08-13
**Phase:** 9, workstream E

## Context

Numbers and times were formatted by raw `Intl` calls pinned to `en-GB`, and their units were English
string literals — `"0.6s"`, `"4 min"`, `"Unit 12 · ETA 4 min"`. None of that changes with the
locale, so a Japanese screen would have carried English units beside Japanese vocabulary.

## Decisions

### Units are vocabulary, so they live in the `domain` namespace

秒 and 分 are suffixes in the same family as the 件 and 台 counters from workstream B. Splitting "the
words" from "the numbers" would have put two halves of one sentence in two places, so the unit
formatters sit beside the terms in `useDomainLabels()` and the pure mappers take them as an
argument, exactly as the vocabulary does.

### The dispatched line is composed upstream, not assembled in the row

`Unit 12 · ETA 4 min` became `{unit} 号車 · 到着 {eta}` — a different _order_, not a different set of
words. Japanese counts vehicles with 号車 as a suffix, so a placeholder-for-placeholder translation
produces `ユニット 12`, which is English wearing katakana.

A component that received `{unit, eta}` and joined them would have baked the English ordering into
the markup, so `toRowView` now emits the finished line and `IncidentRow` renders it.

### Formatters are cached per locale

`Intl.DateTimeFormat` is expensive to construct and the clocks run on the shared one-second tick
across every visible row. The instances are held in a map keyed by locale and time zone rather than
built per call — at five hundred incidents, constructing one inside a render is a real cost, which
is the brief's own point about `Intl.RelativeTimeFormat`.

### Digits stay Western Arabic, everywhere

Asserted, not assumed: no rendered number in `ja.json` may contain a kanji numeral. Japanese
technical interfaces do not use them, and the tabular face the counters set in has no glyphs for
them — so a stray 十 would fall through to a different font mid-number.

### The age counter stays `mm:ss`, and this is a deliberate departure

The brief asks that the live age counter's output localise, giving `2分14秒` as the example.

**It already satisfies the rule that matters, and adopting the example would break a stronger one.**

This interface has never used `formatDistanceToNowStrict`. Pass B rejected it in phase 1 because a
counter whose _width_ changes as its words change makes the column beside it twitch — once a second,
on every visible row, on a screen an operator watches for twelve hours. That is why the age is
zero-padded `mm:ss` set in tabular figures, and why `format.test.ts` asserts a constant character
count across the whole sub-hour range.

`2分14秒` has exactly the problem the design rejected: `1分5秒` is four characters shorter than
`12分14秒`, and it reflows every time a digit rolls over.

The rule the brief is protecting is that no English words leak onto a Japanese screen. `mm:ss`
satisfies it by having no words at all — it is digits and a colon, and it reads identically to both
operators. Verified in both locales rather than argued: `e2e/typography.spec.ts` asserts the counter
matches `\d{2}:\d{2}` and contains neither 分 nor 秒.

If a future design wants elapsed time spelled out, it belongs somewhere that is not on a
once-a-second tick beside a fixed column.

### No date formatter, because nothing renders a date

Every timestamp on screen is a time within the shift, and `HH:mm:ss` is identical in `en-GB` and
`ja` — which is why making the clocks locale-driven changes nothing visible today.

Adding a date formatter now would be dead code, so `format.ts` carries a note instead: when a date
does appear it must be locale-driven, because Japanese writes `2026/08/12` where `en-GB` writes
`12/08/2026`, and the two are indistinguishable for the first twelve days of a month and silently
wrong after.

### The metrics endpoint is not translated

`/api/metrics` returns `timeToAwarenessMs` / `timeToDecisionMs` with `p50` / `p95` and a sample
count. It is a machine contract with no UI, the unit is carried in the key name, and `p50` is a
statistical term rather than a word. Translating any of it would break every consumer for no reader's
benefit — the same rule as log output and error codes in ADR-0012's do-not-translate list.

## Verification

- **Message tests**: units localise (`0.6秒`, `4分`), the dispatched line reorders rather than
  translating word for word, and no rendered number contains a kanji numeral.
- **`e2e/typography.spec.ts`**: the age counter is `mm:ss` with no 分/秒 in either locale, and the
  `↓ ↑` arrows in the flow legend measure the same in the full stack as in the Latin face alone —
  the brief's specific question about whether the arrow glyph survives. A full-width CJK substitute
  would have measured noticeably wider and broken the two-line legend's alignment.
- **`latencySeconds` returns a number**, not a string. The unit is a word, and `s` against 秒 is a
  locale decision that does not belong in a duration calculation — the test says so.

## Consequences

- **`FactsPanel` takes its four labels as props** rather than calling a hook. It renders from a
  Server Component on `/dev/states`, and a hook there would blank the state matrix — the failure
  `PriorityChip` found in workstream D, avoided this time by knowing about it.
- **`RowView.dispatch` changed shape** from `{unit, eta}` to `{summary}`. The parts are no longer
  available to a component that wants to lay them out differently; if one ever does, the labels
  belong in the view model rather than back in the markup.
