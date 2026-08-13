# ADR-0012 — Japanese domain vocabulary, and the direction convention

**Status:** accepted
**Date:** 2026-08-13
**Phase:** 9, workstream D

## Context

The English copy is UK motorway vocabulary: carriageway, hard shoulder, live lane, mile marker.
Japanese expressway operations has its own established register, and a machine translation of the
English reads as obviously foreign to anyone in the field. This is terminology work rather than
string swapping.

## Decisions

### Compass bearings stay compass bearings

The brief asks whether to map `NB`/`SB`/`EB`/`WB` onto Japanese expressway convention — 上り / 下り,
inbound and outbound relative to Tokyo — and says either is defensible provided it is consistent
with what the camera naming implies.

**Keep the compass, translate it literally**: 北行 / 南行 / 東行 / 西行.

The camera estate is British motorways — M6, M25, M42, M40, M62, M6 Toll — with names like "M6
northbound, junction 8–9". 上り / 下り is not a translation of "northbound"; it is a different fact,
meaning _toward_ or _away from_ Tokyo. There is no answer to which direction on the M6 is 上り,
because the question does not apply. Mapping onto it would be inventing data to look idiomatic.

A deployment on actual Japanese expressways should use 上り / 下り, and that is a **data-model
change, not a translation change** — the `direction` enum would need those values, because they
cannot be derived from a compass bearing without knowing where Tokyo is relative to each road. Noted
on the roadmap.

`messages.test.ts` asserts no string in `ja.json` contains 上り or 下り, so this decision cannot be
quietly undone by a later edit.

### Terms, verified rather than trusted

The brief supplied a starting list and said to verify it rather than trust it. Applied:

| Concept          | Japanese   | Note                                                                    |
| ---------------- | ---------- | ----------------------------------------------------------------------- |
| stopped vehicle  | 停止車両   | standard operational term                                               |
| wrong-way driver | 逆走       | the specific, well-known term in Japanese road safety                   |
| debris           | 落下物     | "fallen object" — what the hazard actually is                           |
| congestion       | 渋滞       | standard                                                                |
| pedestrian       | 歩行者     | the English adds "on carriageway"; the lane position already says where |
| smoke or fire    | 火災・煙   | 火災 leads, because it is the one that dispatches a crew                |
| hard shoulder    | 路肩       | standard                                                                |
| live lane        | 走行車線   | see the caveat below                                                    |
| mile marker      | キロポスト | the operational term; the _value_ stays untranslated                    |
| dispatch         | 出動       | 出動指示 as a control label, noun form                                  |
| false detection  | 誤検知     | the category the dismissal reasons fall under                           |

**The live-lane caveat is a real finding.** Japanese distinguishes 走行車線 (cruising lane) from
追越車線 (overtaking lane), and expressway operations uses both. The data model has `laneNumber` but
no lane _role_, so it cannot express which a given lane is — 走行車線 is therefore slightly
over-specific for what is really "a lane carrying traffic, as opposed to the shoulder". The brief's
own suggested list contains 追越車線, which is the tell: the vocabulary Japanese operations wants is
richer than the schema can currently say. Recorded rather than papered over.

### Dismissal reasons became keys

`DISMISS_REASONS` were English strings, and the chosen string was written onto the event, sent to
the server, put in the audit trail, and handed back by the reopen rule as "seen before — dismissed
as X".

Every one of those crosses desks. An incident is one record, and a dismissal made by an operator
working in Japanese has to read correctly to the operator at the next position working in English —
so the stored value is now a locale-independent key and the label is resolved at each screen.

Storing the rendered string would have frozen one operator's language into shared data. That is the
same class of mistake as the `priorityReason` problem below, caught early enough to fix cheaply.

### The vocabulary is injected, not imported

`src/lib/incident.ts` exists so the view mapping is testable and so no component can invent a label.
It is pure, so it cannot call a hook — the labels are a parameter, defaulting to the English maps in
`schema.ts`.

That leaves two copies of the English wording, which is a drift risk, so `messages.test.ts` asserts
they are identical.

## What is not translated, and why

Camera IDs, roadway designations, mile-marker values, ISO timestamps, log output and `/dev/states`
names. These are identifiers and data. A camera ID that changed between locales would break every
conversation between two desks. Asserted, not just documented: no string in `ja.json` may contain a
camera ID, a mile marker or a roadway designation.

## The gap this workstream did not close

**`priorityReason` is still English in both locales.** It is the most prominent line in the detail
pane — "Critical — vehicle against traffic flow, live lane 2 of 3" — and it is derived server-side
by `derivePriority` as English prose, then stored on the event.

It cannot be translated where it is. The string is computed once, on the server, for an event that
several positions read, and those positions may be in different languages. Localising it needs
`derivePriority` to return a **key and parameters** instead of a sentence, which changes the event
contract, the ingest route, the generator, the schema, twenty priority tests and three components.

That is a phase-8-sized item rather than part of a vocabulary workstream, and doing it badly — a
lookup table of English sentences to Japanese ones — would be worse than leaving it. Recorded on the
roadmap with the reasoning.

The same is true, smaller, of the audit trail: history `action` strings are written as English prose
by whichever code path took the action.

## Not reviewed by a native speaker

The brief asks for a native-speaker review of this terminology and for the README to name the
reviewer. **There has been no such review.** The terms above are researched and internally
consistent, and the ones most likely to be wrong are flagged (走行車線, 火災・煙, 車道外) — but
"researched" is not "reviewed", and terminology is exactly the area where a confident non-speaker
produces something plausible and wrong.

The README says this rather than leaving the omission to be assumed away. It is the single highest
-value thing an actual Japanese road-operations engineer could do to this codebase in an hour.

## A break only the visual suite caught

Reading the vocabulary through a hook put `useDomainLabels` inside `PriorityChip` — which had no
`'use client'`. The console renders it inside its own client tree, so **all 34 behaviour specs
passed**; `/dev/states` renders it from a Server Component, and every one of the 31 captures came
back blank.

`PriorityChip` is now a client island. Everything else in it would render on the server happily, and
the choice was between a boundary on one small leaf or threading a resolved string down through
every parent that draws a chip. The boundary is cheaper and keeps the vocabulary resolved in one
place.

ADR-0003 argued the visual suite was worth having because "the dev page and the production app can
drift". This is that argument running backwards: the dev page was the only surface exercising a
rendering context the app does not, and it caught a break the behaviour suite structurally could
not see.

## Verification

**30 unit tests** in `src/i18n/messages.test.ts`:

- every value of every enum resolves in both locales, so a missing term cannot reach a queue row;
- the English messages match the label maps the pure mappers default to, holding the two copies
  together;
- the specific terms above are pinned, because they are what a machine translation would get wrong;
- no 上り / 下り anywhere, so the direction decision cannot be quietly reversed;
- no camera IDs, mile markers or roadway designations in the message files;
- the register rules from D3 — no です/ます, no apologies, Western Arabic digits, 件 for events and
  台 for feeds.
