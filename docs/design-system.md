# Design system — working notes

The token sheet itself is [`src/styles/theme.css`](../src/styles/theme.css), ported from Pass B and
mapped in [`DESIGN_INVENTORY.md`](DESIGN_INVENTORY.md) §1.2. This file is the part that cannot live
in CSS: the rules for _using_ the system, written down where someone adding a component will find
them.

## Localization

Two locales, English and Japanese. Language is a **workstation setting**, not a route — it lives in
a cookie beside the mute preference, and [ADR-0009](adr/0009-next-intl-and-cookie-locale.md) says
why there is no `[locale]` segment.

### How to add a string

1. Put it in `messages/en.json` **and** `messages/ja.json`. `pnpm lint` fails if the key sets or the
   ICU placeholders differ — a missing translation breaks the build rather than falling back
   silently to English in front of an operator.
2. Namespace by surface, mirroring the component tree: `statusBar`, `queue`, `detail`, `alerts`,
   `shortcuts`, `actions`, `errors`.
3. Read it with `useTranslations('<namespace>')`. Keys are type-checked, so a typo is a build error
   rather than raw text on a control-room screen at 3am.

### The `domain` namespace is different

Event types, lane positions, priority levels, statuses, directions and dismissal reasons are
**vocabulary**, not copy. The same term appears on a row, in the detail pane, in the audit trail and
in a dialog, and it has to be the same term in all four — so it is defined once in `domain` and
never duplicated per component.

Read it through `useDomainLabels()`, which resolves the whole vocabulary once per locale. The pure
view mappers in `src/lib/incident.ts` take a `DomainLabels` argument rather than calling the hook:
they exist so the mapping is testable and so no component can invent a label, and a hook inside them
would make them React-only.

### Store keys, render labels

Anything written onto an event — a dismissal reason, a status — is stored as a **key** and
translated at the moment it is rendered.

An incident is one record read by several desks. A dismissal made by an operator working in Japanese
has to read correctly to the operator at the next position working in English, and storing the
rendered string would freeze one operator's language into shared data.

### Register (Japanese)

Control-room Japanese is **plain and declarative**. Machine-generated status text is not a
conversation.

- **No です/ます.** Unnecessarily polite for a status line, and it costs width a dense layout does
  not have.
- **Noun-form labels for controls.** 出動指示, not 出動を指示します.
- **Errors state the condition. They do not apologise.** No 申し訳, no すみません — an apology in a
  line an operator reads a hundred times a shift is noise.
- **Western Arabic digits, always.** Japanese technical interfaces do not use kanji numerals, and the
  tabular face the counters set in has no glyphs for them.
- **Counter words matter.** Events are 件, camera feeds are 台. Not interchangeable, and a wrong one
  is instantly visible to a native speaker and invisible to everyone else.

`src/i18n/messages.test.ts` asserts each of these against every string in `ja.json`.

### Units and formatted values

Units are vocabulary. 秒 and 分 are suffixes in the same family as the 件 and 台 counters, so they
live in `domain` beside the terms rather than in a separate formatting layer.

- **Compose whole lines upstream.** `Unit 12 · ETA 4 min` becomes `12 号車 · 到着 4分` — a different
  order, not a different set of words. A component that joins `{unit}` and `{eta}` itself bakes the
  English ordering into the markup.
- **Cache formatters per locale.** `Intl.DateTimeFormat` is expensive and the clocks run on the
  shared one-second tick across every visible row.
- **The live age counter is `mm:ss` and stays that way.** Not `2分14秒`: a counter whose width
  changes as it ticks makes the column beside it twitch, which is the reason it is set in tabular
  figures. Digits and a colon need no translation.
  [ADR-0013](adr/0013-locale-aware-formatting.md).

### Do not translate

Identifiers and data, not text:

- Camera IDs (`CAM-014`), roadway designations (`M6`), mile-marker values (`MM 42.3`)
- ISO timestamps in the audit trail's data layer
- Log output and error codes
- `/dev/states` state names, which a developer greps for
- `/api/metrics` — a machine contract whose units are in the key names (`timeToAwarenessMs`)

The _label_ beside a value may be translated — キロポスト against an untranslated `MM 42.3`.

### Locale-conditional tokens

Japanese typography is handled at the token layer, in a `[lang="ja"]` block, **never per component**.
Line height up, tracking to zero, dense row text one size down.

The binding constraint is the 40px queue row: a flat line-height increase overflows it and costs a
row of the density the whole layout is built on. [ADR-0011](adr/0011-japanese-typography.md) has the
arithmetic, and `e2e/typography.spec.ts` holds it — twelve rows at 1440×900, in both locales.

## Keyboard

Bindings are published from one table, `src/lib/shortcuts.ts`, and `shortcuts.test.ts` asserts in
both directions that the handler and the `?` overlay agree.

**Every binding sits behind the IME composition guard.** Typing 渋滞 is `j-u-u-t-a-i`, and every one
of those keystrokes fires a `keydown` — without the guard, an operator typing a Japanese note fires
dispatch actions mid-word. [ADR-0010](adr/0010-ime-composition-and-single-key-shortcuts.md).

## Colour

Colour belongs to priority. Nothing else on the screen may use a saturated token — system state is
deliberately lower-chroma so "connection degraded" can never be mistaken for "high priority", and
new signals (the SLA tag, `HISTORY LOCAL`, `Taken by position 3`) carry meaning in **weight and
contrast** instead.

Priority is never encoded in colour alone: every level also carries a border weight, a shape from
sign taxonomy, a glyph and a text label.

## The evidence frame

`CameraSnapshot` draws the detector's output over the still. It is presentational — it takes boxes
whose class has already been resolved to a word by `toDetailView`, and never reaches for a locale
itself, for the same reason `IncidentRow` does not.

The overlay obeys the colour rule above rather than inventing a second language for it. The
**primary** box — the object the incident is about, exactly one per event — takes the priority
colour. Every other box is context traffic and stays on the neutral component border. A frame with
four cars in it must not read as four incidents.

Three placement rules, all of which exist because breaking them was tried first:

- **The primary paints last.** Boxes and labels overlap; when they do, the thing the operator was
  called here to look at has to be the one on top.
- **A label clears the OSD plate.** The burned-in camera and timestamp is the one fixed object on
  the frame, so a box whose top lands under it sets its label below the plate rather than above the
  box. Running a label through it produced two lines of mono type interleaved into something neither
  of them said.
- **A label anchors right near the right edge**, or it runs out of a frame that clips it.

Boxes are absolutely-positioned elements at percentage offsets, not SVG. The frame is
container-fit, so an SVG would need `preserveAspectRatio="none"` to stay aligned to the crop, which
distorts strokes and text — and labels have to set in the tabular numeric face, which SVG `<text>`
can only reach by restating the type scale outside the tokens.
[ADR-0015](adr/0015-detection-overlay-without-footage.md).

Geometry is not a rendering concern. `src/lib/detection.ts` derives it from the same fields the
priority rules read, because **an incoherent box is worse than no box** — a "hard shoulder" call
drawn mid-carriageway tells the operator the system cannot see straight.
