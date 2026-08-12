# ADR-0009 — next-intl, and a cookie instead of a `[locale]` route

**Status:** accepted
**Date:** 2026-08-12
**Phase:** 9, workstream A

## Context

Japanese alongside English. Two decisions had to be made before any string moved into a file: which
library, and where the locale lives.

## Decisions

### next-intl

- **Built for the App Router.** Server Components translate without a client boundary. That matters
  here more than in most applications: the queue and the detail pane are the two largest render
  surfaces, and pushing them through a client boundary to read a translation would undo work from
  phases 3 and 8.
- **Type-safe keys.** With the `global.d.ts` augmentation, `t('statusBar.localTimeee')` is a
  compile error rather than the raw key rendering as text on a control-room screen at 3am. Verified
  by introducing exactly that typo and watching `tsc` reject it.
- **ICU MessageFormat built in**, which the Japanese plural handling needs — see below.
- **`useFormatter`** wraps `Intl.*` with the resolved locale, so dates, relative times and numbers
  come from one system instead of three.

Rejected:

- **`react-i18next` / `i18next`** — works, and is the more common answer, but needs a client
  boundary or extra plumbing for Server Components, and its ecosystem weight buys nothing at two
  locales.
- **`next-i18next`** — Pages Router only.
- **`react-intl`** — a solid ICU implementation with no App Router integration story.

### The locale is a cookie, not a URL segment

Every tutorial reaches for `app/[locale]/page.tsx`. That is the right shape for a public
multilingual site with SEO requirements and shareable links. This application has neither.

Language here is a property of **the desk**, like the mute preference — not of what is being looked
at. A URL prefix would mean:

- every route carrying a segment for a value that does not change during a shift;
- deep links carrying a locale, so an operator sharing an incident link imposes their language on
  whoever opens it;
- the API routes and the dev state matrix needing exclusion rules or meaningless prefixes.

So: next-intl's without-i18n-routing setup. No middleware, no segment. `getRequestConfig` resolves
one locale per request down a preference ladder, most deliberate first — **cookie, then
`Accept-Language`, then `en`** — and every Server Component below it renders in that locale.

`<html lang>` is set from the resolved locale. Screen readers switch synthesiser voice on that
attribute, and left hardcoded a Japanese interface is read aloud with English phonemes. It is also
what the `[lang="ja"]` token block will hang off in workstream C, so the typography adjustments key
on the same single fact.

### A cookie, not the mute preference's `localStorage`

The brief says to put the locale "in the same persisted-preferences slice as mute and grid size".
There is no grid-size preference in this application, and mute lives in `localStorage`, which is the
one place this setting cannot live: **the server has to know the locale before it renders.** A
preference only the browser can see would force the whole screen through a client boundary to read
it, which is the cost the library was chosen to avoid.

Same lifetime and same reasoning as the brief intends; different storage, because a server-rendered
setting has to be on the request. Noted here rather than silently diverging.

### The switcher refreshes rather than reloads

It writes the cookie and calls `router.refresh()`. A reload would drop the SSE connection and the
queue with it, so an operator changing language would watch their screen empty and refill.
Confirmed in the browser: the queue grew from four rows to six across the switch and the critical
banner kept its state, because the stream never disconnected.

## Verification

The whole resolution ladder, against the running dev server:

| Request                                    | `<html lang>` |
| ------------------------------------------ | ------------- |
| no cookie, no header                       | `en`          |
| `Accept-Language: ja-JP,ja;q=0.9,en;q=0.8` | `ja`          |
| `Accept-Language: fr-FR,fr;q=0.9`          | `en`          |
| cookie `ja`                                | `ja`          |
| cookie `en` + `Accept-Language: ja`        | `en`          |
| cookie `de` (unsupported)                  | `en`          |

The fifth row is the one worth having: a deliberate choice at the desk outranks the browser default.

**17 unit tests** on the negotiation itself (`src/i18n/locale.test.ts`) — quality values honoured
over header order, `ja-JP` matching `ja`, `q=0` treated as a refusal rather than a weak preference,
and never returning a locale this build cannot render.

**Key parity in `pnpm lint`.** `scripts/check-messages.mjs` fails the build on a missing key, an
empty string, a dropped ICU placeholder, or a key with no English original. Proved by breaking the
Japanese file all four ways at once and watching it report all four.

It compares placeholder **names**, not shapes — `{total, plural, one {# feed} other {# feeds}}` and
`{total, plural, other {# 台}}` must agree on what they interpolate and must be free to disagree on
how, because Japanese has no grammatical plural and a single `other` branch is the correct
translation rather than a missing one.

**Visual regression:** the five status-bar captures changed by 3% of their pixels — the added
switcher — and nothing else moved. Regenerated.

## Consequences

- **Namespaces are created as surfaces convert, not up front.** The brief lists `statusBar`,
  `queue`, `detail`, `wall`, `alerts`, `shortcuts`, `actions`, `domain`, `errors`. Only `statusBar`
  and `language` exist so far, because a namespace nothing reads is dead code and the parity check
  would enforce translations for strings no surface renders. There is no `wall` surface in this
  application and there will be no `wall` namespace.
- **`timeZone` is pinned to UTC in the request config.** Otherwise `useFormatter` adopts the
  server's zone, which is UTC in a container and something else on a laptop — a difference that
  would surface as an unreproducible visual-regression diff.
- **The dev state matrix renders in whatever locale the cookie says.** Workstream F parameterises
  the visual suite over both locales, which is the point of it existing.
