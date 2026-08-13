# ADR-0011 — The Japanese typography layer

**Status:** accepted
**Date:** 2026-08-13
**Phase:** 9, workstream C

## Context

Pass B's type system was drawn for Latin text. Public Sans has no kanji, so without a fallback the
browser substitutes something arbitrary and the interface looks broken — and the adjustments
Japanese needs (leading, tracking, line breaking) are properties of the whole system rather than of
any component.

## Decisions

### Noto Sans JP, not BIZ UDPGothic

The phase brief suggested BIZ UDPGothic and called it "a defensible choice for a control room, and a
good line in the ADR". It is: BIZ UD is a universal-design face built for legibility on screens and
signage, which is exactly this product's argument. I chose Noto Sans JP anyway, for one concrete
reason.

**BIZ UDPGothic ships only weights 400 and 700.** This design encodes meaning in the 500 and 600
steps — an unread row is 600 where a read one is 500, and a breaching age counter "gains weight
rather than a new hue" (Pass C frame 4). A face that cannot set 500 or 600 would either synthesise
them or collapse them onto 400/700, and either way an encoding the operator reads at a glance stops
working. Noto Sans JP has 100–900.

Legibility is a real argument and weight fidelity is a real argument; this interface spends weight
as information, so weight wins. Worth revisiting if BIZ UD ever ships intermediate weights.

### The Japanese face is in the stack in both locales

Not switched on the locale. A camera name or an operator note can be Japanese on an English screen,
and a stack that only carries kanji when the UI language is Japanese renders those as tofu.

### Position in the stack is the entire mechanism

```
--font-ui:   Public Sans,    Noto Sans JP, system-ui,   sans-serif
--font-mono: IBM Plex Mono,  Noto Sans JP, ui-monospace, monospace
```

Font fallback is per **glyph**, not per string. Public Sans answers for every Latin character and
every digit, so the CJK face is only ever reached by a glyph the design's own face does not have.
That is what keeps numerals in the tabular figures the live age counters depend on.

Two ways to get it wrong, both silent: after a generic (`sans-serif`, `monospace`) the CJK face is
unreachable, because the generic always resolves; before the Latin face it captures Latin.

**`unicode-range` does not save you here** — a thing I assumed and checked. Noto Sans JP declares
Latin ranges of its own, including one covering ASCII digits. `unicode-range` decides which _file_
downloads, not which family wins. Only the ordering does that.

### Locale-conditional tokens, and why not a flat +0.15

The brief suggests roughly +0.15 on body line height. Applied flatly that breaks the product's
density target.

The queue row is a fixed 40px — Pass A's "twelve rows at 40px at 1440×900", and the height the
virtualiser measures against. It stacks a caption over a micro line with a 2px gap: 18 + 2 + 16 =
36px in English. At +0.15 that becomes 20.7 + 2 + 18.4 = 41.1px, which overflows the row and costs a
row of density in a layout whose whole argument is how much is visible at once.

So the block splits by context:

| Tokens                                   | Change                             | Why                                                              |
| ---------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `caption`, `micro`, `kicker`             | one size down, leading up modestly | dense text in a fixed box: 19 + 2 + 17 = 38px, still inside 40   |
| `ui`, `body`, `title`, `panel`, `dialog` | leading up ~0.15, size unchanged   | prose, not in a fixed box — it can take the space CJK wants      |
| `tracking-*`                             | to zero                            | tuned to open up uppercase Latin; on kanji it reads as a mistake |

Dropping the caption from 13px to 12px is the brief's own observation that Japanese carries more
meaning per character — and the size given up is bought back as leading, which is what dense
full-height glyphs are actually short of.

The tracking change has a cost worth naming: the Latin acronyms that survive in a Japanese UI (LIVE,
SLA, camera IDs) lose their tracking too. That is the smaller of the two wrongs, and the one that
does not look broken.

### Line breaking is a correctness rule, not a preference

Japanese has no spaces, so a browser left alone breaks inside words, before closing brackets, and
leaves small kana stranded at line starts. 禁則処理 is a rule, and text that violates it reads as
broken.

`line-break: strict` does most of the work and is supported everywhere. `word-break: auto-phrase`
segments into 文節 where Chromium supports it, behind `@supports` with `normal` as the documented
fallback — without it every genuinely wrong break is still prevented and only the improvement is
lost. `overflow-wrap: anywhere` and `word-break: break-word` are actively wrong and are explicitly
set back to `normal`.

### A build-time font check, because next/font fails silently

`next/font/google` downloads at build and self-hosts, which is what keeps a control-room machine off
a font CDN. It also **logs a fetch failure and carries on**.

That is not hypothetical. A CJK face is ~370 `@font-face` rules across 142 files; Google rate-limits
that, and one build during this workstream produced 18 files, **zero real Japanese faces**, and a
green build log. The interface would have shipped rendering Japanese in whatever the operating
system supplied.

`scripts/check-fonts.mjs` now runs as part of `pnpm build` and fails if the Japanese faces are
absent, partial, missing a required weight, referenced-but-not-emitted, or pointing at a remote host.
Same principle as the message-parity check: a missing translation breaks the build rather than
falling back silently in front of an operator, and a missing glyph is that failure one layer down.

## Verification

**Seven E2E specs** (`e2e/typography.spec.ts`), measured rather than eyeballed:

- `<html lang>` follows the resolved locale, in both.
- Digits resolve to the design's own face in both locales, every digit the same width.
- A real Noto Sans JP face reaches `loaded`, at the weights the design sets.
- Twelve rows still fit at 1440×900 in both locales, every row exactly 40px, none overflowing.
- The tokens retarget under `[lang="ja"]` — smaller caption, more leading, zero tracking.
- Long Japanese truncates on one line with an ellipsis rather than wrapping.
- `line-break: strict` and `overflow-wrap: normal` are in force.

**Two of these were wrong before they were right, and both were found by trying to break them.**

The digit test originally measured with `canvas.measureText`. With the font stack deliberately
inverted — the CJK face put _first_ — it still passed. Canvas resolves fonts separately from layout
and does not reliably pull in `unicode-range` subsets, so it was reporting an answer that had nothing
to do with what the page renders. Rewritten to measure real DOM text, it catches the inverted stack
immediately: 79.8px against the design face's 84px. It also now asserts a control — that the two
faces set digits _differently_ — because if they did not, the comparison would prove nothing.

The kanji test originally compared the advance width of 渋滞 in the stack against a generic font.
That is meaningless: CJK glyphs are full-width by definition, so the string measures exactly 2em in
every correct Japanese face. `document.fonts.check()` is no better — it answers "can this render
without a download", which is true precisely when the family is absent. It now asks which faces
actually reached `loaded`, which is the fact genuinely at risk.

**The font check itself** was verified against the failed build that motivated it, and reports
`372 Noto Sans JP faces (333 CJK) at weights 400/500/600, 142 files, 5.1MB, all self-hosted` on a
good one.

## Consequences

- **The build now needs network access to Google Fonts**, and says so loudly when it does not get
  it. That was already true for Public Sans and IBM Plex Mono; the CJK face makes it 142 files
  rather than 24, so the failure is likely rather than theoretical. A fully offline build would mean
  vendoring the woff2 files into the repository — about 5MB — which is the obvious next step if this
  ever runs in CI without egress.
- **5.1MB of font files ship**, against roughly 250KB before. `unicode-range` means a browser only
  downloads the chunks a page's glyphs actually need, so an English session pays almost none of it —
  but the artefact is larger and a cold Japanese session downloads real bytes.
- **The Japanese caption is 12px against English's 13px.** Deliberate and defensible, and the first
  thing to re-measure if a native speaker finds the queue hard to scan.
