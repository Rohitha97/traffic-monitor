# ADR-0014 — Verifying two locales

**Status:** accepted
**Date:** 2026-08-13
**Phase:** 9, workstream F

## Context

Three workstreams of translation had shipped and nothing had checked the Japanese screen as a whole.
The parity check proves the two message files have the same keys; it says nothing about what an
operator sees, or hears.

## Decisions

### Visual regression runs per locale

`e2e/visual.spec.ts` now captures every state twice, once per locale, and the snapshot name carries
the locale: `queue-row--unread--en.png`, `queue-row--unread--ja.png`. Twenty-nine states, fifty-eight
captures.

This is the cheapest way to catch Japanese text overflowing a component sized for English, and it is
why the phase brief put i18n after phase 8 — the harness already existed and only needed a loop.

**The state matrix's sample data stays English on purpose.** It is lifted verbatim from Pass C so a
reviewer can diff the page against the frames, so the `ja` captures exercise the _localised chrome_
— priority chips, status bar, buffered bar, dismissal menu — rather than Japanese row copy. Japanese
_content_ overflow is covered where it belongs, against real data, in `e2e/typography.spec.ts`.

### The screen-reader pass found the gap this workstream existed for

**Every `aria-label` and `sr-only` string in the interface was still English** after three
workstreams of translation. `Incident detail`, `Open incidents`, `Incident queue`, `Unread`,
`{priority} priority, open {age}`, the offline notice, the empty-detail prompt — none of it is
visible on screen, so nothing had looked at it.

For a sighted operator that is invisible. For a screen-reader user in Japanese it is the whole
interface: the synthesiser picks its voice from `lang`, so a Japanese page reads the English labels
aloud with Japanese phonemes, which is worse than either language alone.

They are now an `a11y` namespace, and four E2E specs hold them: axe finds zero violations on a
Japanese queue, the landmarks announce in Japanese with nothing left in English, the detail pane is a
live region on both its empty and populated branches, and severity reaches a screen reader as
Japanese _text_ — the rule that colour is never the only cue, carried into the other language.

### The pseudo-locale check is weaker than intended, and says so

The brief asks for `en` rendered with every string doubled, to find layout that only survives because
English is short. Implemented by doubling every text node in place rather than adding a third
`messages/*.json`: a real pseudo-locale needs a fake locale code that `isLocale`, the switcher and
the parity check all have to know about — machinery in the shipped product to serve a test — and
doubling the rendered text reflows identically, which is all a _layout_ check needs.

**Three formulations were tried and none could be made to fail.**

1. Assert row and status-bar heights do not grow. Passed with `h-10` deliberately removed from the
   queue row — because every line in a row is `truncate`, so longer text clips instead of wrapping
   and the height cannot move.
2. Assert no element overflows horizontally without being set up to clip. Passed with `truncate`
   deliberately removed — because the text then _wraps_ rather than spilling sideways.
3. Assert both axes. Still passed.

The design truncates and fixes heights aggressively enough that doubled text produces no measurable
change anywhere it was looked for. That is a real finding about the design rather than a passing
test — and it leaves the check as a guard against future layout that is _not_ built that way, not as
proof that today's is safe.

What survives with teeth is the assertion that the document never gets wider and the page never
scrolls sideways. It is recorded here rather than dressed up, because a test whose failure mode
nobody has seen is a test nobody should trust.

### Four more components became client islands

`PriorityGlyph`, `OfflineNotice`, `EmptyQueue` and `IncidentDetail` gained `'use client'`, because
their accessible names are translated and `useTranslations` is a hook.

Worth naming the tension: [ADR-0009](0009-next-intl-and-cookie-locale.md) chose next-intl partly
because "Server Component translations work without a client boundary, which matters here because
the queue and detail pane are the largest render surfaces". In this application that argument turns
out not to bite — `OperatorConsole` is `'use client'` and everything below it is already in the
client tree. The only server-rendering surface is `/dev/states`, a dev page.

So the honest statement is: **this is a client application whose server boundary is the layout.**
The next-intl choice still holds on its other three grounds (typed keys, ICU, one formatter system);
the Server Component argument was speculative and did not pay out.

## Verification

- **58 visual captures**, 29 states × 2 locales, diffed in the pinned container.
- **8 accessibility specs**, four of them Japanese: zero axe violations, landmarks announced in
  Japanese with nothing left in English, the live region on both branches, severity as Japanese text.
- **41 behaviour specs**, 285 unit tests, message parity at 67 × 2, font check, typecheck, lint,
  build.
- **A cookie bug in the test harness, found twice.** Both new helpers set the locale cookie against
  `http://localhost:3000` before the first navigation. The test server answers on
  `http://127.0.0.1:3100`, so the cookie landed on an origin the page never visits and was silently
  ignored — the page stayed English and the assertions failed with no hint why. Both now navigate
  first and read the origin that actually answered.

## Consequences

- **The visual suite takes about twice as long** — roughly 7 minutes to regenerate, 4 to verify.
  Acceptable for a suite that runs on demand rather than per keystroke.
- **58 snapshot files** are committed rather than 29. A locale added later doubles it again, which is
  the point at which capturing a subset per locale starts to be worth the complexity.
