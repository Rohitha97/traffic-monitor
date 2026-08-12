# How this was built with AI

A summary of the working method, written from the session that produced the repository. It is
deliberately specific about what the AI got wrong, because that is the more useful half.

## The method

**Design first, in a separate tool.** The UI was designed in Claude Design across three passes —
flows, then a token sheet, then high-fidelity screens — before any code existed. That project is
the authority; this repository implements it. The passes are exported byte-exact into
[`docs/design/`](../design/).

**One long session, six phases, a stop at each boundary.** The opening prompt
([`BUILD_PROMPT.md`](../BUILD_PROMPT.md)) set the rule: work in phases, stop, summarise, wait.
Every phase ends in a commit whose message records what verification actually found, not what it
was hoped to find.

**Write the mapping before the code.** Phase 0 produced no application code at all — only
[`DESIGN_INVENTORY.md`](../DESIGN_INVENTORY.md): every token and where it lands, every component
and its states, every interaction the frames imply but cannot encode, and every conflict found.
That document was reviewed and approved before feature work started.

**Log the trade-off when it is made.** [`DECISIONS.md`](../DECISIONS.md) is written during the
work, in the form _choice → alternative considered → why_. Several entries record a decision being
reversed by later evidence, and say so rather than being quietly edited.

## Three decisions escalated to a human

The AI stopped and asked rather than picking, because each would have changed the build materially:

1. **Which token layer is the product's.** The brief instructed porting the `nocturne` design
   system. Reading the files showed nocturne styles the _deck around_ the frames, while every pixel
   _inside_ the five screens uses a different sheet from Pass B. Porting nocturne would have
   produced a purple, Inter-set dashboard matching none of the frames.
2. **maplibre, or the schematic the design actually draws.** The stack table specified a map
   library; Pass C draws a 120px mile-marker strip with no basemap.
3. **Whether to snap type to Pass B's scale** or carry Pass C's off-scale half-pixel sizes.

## What the AI got wrong, and how it was caught

Every one of these was found by _running_ something, not by reading code:

| What                                                                                                                                                            | How it surfaced                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A read-modify-write race in the store** silently dropped events — measured at five of twenty-one surviving                                                    | The queue looked plausibly short rather than obviously broken. Found by instrumenting `ingest` and seeing two consecutive calls both report `have: 0`     |
| **The production build was broken for two phases** — a server component passing a function to a client one                                                      | `pnpm build` had been dropped from the verification loop in phases 4 and 5. Playwright's `webServer` ran a real build and failed immediately              |
| **The design system's adherence lint did nothing** — oxlint does not implement `no-restricted-syntax`, so all three rules were silent no-ops                    | A deliberate probe file full of violations linted clean                                                                                                   |
| **The critical banner left a permanent red rule** across a quiet screen, and its buttons stayed tabbable while invisible                                        | Measuring the collapsed banner in the browser                                                                                                             |
| **A fresh page load showed an empty queue** while incidents were live                                                                                           | Replaying "after nothing" correctly returns nothing; a first load needs a snapshot                                                                        |
| **The stream hook leaked EventSources**, six open against a browser cap of six                                                                                  | Reading the network panel while debugging something else                                                                                                  |
| **Small text failed WCAG AA contrast** at 3.17–3.45:1                                                                                                           | An axe pass, not an opinion. Pass B had documented the constraint; the implementation had ignored it                                                      |
| **The reopen rule was correct and could never fire** — nothing ever told the server an incident had been dismissed                                              | Unit tests passed on a rule with no dismissals to find. Only the end-to-end test, which drives an actual dismissal, showed it                             |
| **The "seen before" tag cost every untagged row a millisecond** of keystroke latency, against a budget already at ~16 of 16.7ms                                 | The virtualisation frame-budget test failed. Attributed by re-measuring the stashed tree, because run-to-run noise is ±4ms and eyeballing proves nothing  |
| **The Redis reader started from `$`**, so an event published between connecting and the first blocking read was skipped — and skipped again on every read after | Two or three conformance tests failing per run, a different set each time. The flakiness _was_ the bug: the window is exactly as wide as the race         |
| **The in-memory bus announced a re-claim that had changed nothing**, where the Lua script correctly stayed silent                                               | The conformance suite, running the same assertions against both. Two implementations agreeing by inspection is a hope; agreeing under one suite is a fact |

Two smaller ones worth recording because they were the AI's own false trails: a long stretch spent
chasing "vanishing" criticals that turned out to be accumulated state across Fast Refresh resets,
and an E2E assertion that failed because the _test_ was wrong — a random generated event came out
critical and correctly jumped the buffer the test was asserting on.

## What the AI was good and bad at

**Good at:** reading a large design corpus and extracting a defensible mapping; noticing that the
brief's premise about the token layer did not survive contact with the files; writing the
trade-off log as it went; producing exhaustive tests for a pure function.

**Bad at:** believing its own work without running it. Every significant defect above existed
because something looked right. The counter-measure that actually worked was mechanical —
build, lint, unit test, browser, axe, Lighthouse — and the phases where verification was skipped
are exactly the phases that shipped bugs.

## Verification, at the end

- 109 unit tests — priority derivation, the store, the metrics percentiles, event correlation, and a
  bus conformance suite run against both the ring buffer and Redis Streams
- 21 Playwright specs — journey, metrics, virtualisation, correlation, a two-desk ownership race,
  and 4 axe audits at WCAG 2.1 AA with zero violations
- 31 visual-regression captures of the component state matrix, diffed in a pinned container
- Lighthouse: performance 100, accessibility 100, best practices 100, SEO 100
- `docker compose up` verified from a clean state, both services, dependency ordering working

The first two lines read 47 and 11 at the end of phase 6. Phase 8 is where the rest came from.

`pnpm test`, `pnpm test:e2e` and `docker compose up` all run with no infrastructure. That is a rule
of phase 8 rather than a happy accident: `pnpm test:bus` is the one command that wants a broker, and
it starts and disposes of its own.
