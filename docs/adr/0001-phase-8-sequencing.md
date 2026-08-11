# ADR-0001 — Phase 8 build order

**Status:** accepted
**Date:** 2026-08-06

## Context

Phase 8 implements the seven items in the roadmap's Next block. The roadmap numbers them by
priority — Redis Streams is #1 because durability is the biggest gap. Priority order and safe
execution order are not the same thing, and building in priority order would mean refactoring the
component the entire queue is made of before there was anything in place to catch a regression.

## Decision

Build in this order:

| Order | Roadmap item                  | Why here                                                                                                                                                                                           |
| ----- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | #5 Visual regression          | **First.** It is the safety net for #3, which refactors `IncidentRow`. Snapshotting _after_ that refactor would test the refactor against itself and prove nothing                                 |
| 2     | #4 Instrument the two numbers | Independent and small, and it produces a measurement baseline _before_ #3 changes render behaviour. Without a before-reading, "virtualisation made it faster" is an assertion rather than a result |
| 3     | #3 Virtualise the queue       | Protected by #5, measured by #4                                                                                                                                                                    |
| 4     | #6 The reopen rule            | Pure domain logic. No infrastructure, no dependency on anything above                                                                                                                              |
| 5     | #7 Snapshot filmstrip         | Blocked — see [ADR-0002](0002-filmstrip-blocked-on-frame-sources.md)                                                                                                                               |
| 6     | #1 Redis Streams              | Infrastructure, largest blast radius, so it goes late                                                                                                                                              |
| 7     | #2 Incident ownership         | Depends on #1 for the shared record                                                                                                                                                                |

Two constraints hold across every item:

- **`docker compose up` with no broker keeps working after each one.** Nothing in this phase is
  allowed to make the default path require infrastructure.
- **`docs/roadmap.md` is updated in the same commit as the item.** Moving the item out of Next, and
  adding whatever new work implementing it revealed.

## Consequences

The most valuable item ships last but one, and the cheapest safety net ships first. That is the
right trade: #5 and #4 are both small, and both exist to make the claims about #3 checkable.

The ordering also means the phase can stop cleanly after any item. If it runs out of time at item 4,
what shipped is coherent — regression cover, measurement, a faster queue and a domain rule — rather
than a half-migrated broker.

## Note on the phase's starting assumptions

The phase brief was written against a repository state that does not match this one. Three gaps,
recorded here because they change what the phase can deliver:

1. **`docs/roadmap.md` did not exist.** The brief referenced items by number. Those numbers are
   reconstructed from the brief itself, which restates all seven items in full, seeded from the
   README's existing "what I would do next". The roadmap now exists and is maintained per item.
2. **There were no ADRs.** Phases 0–6 used one running log. Rather than retrofit that log, ADRs
   start here and `DECISIONS.md` continues alongside — see [README](README.md).
3. **There was no phase 7.** The brief refers to it three times, and item #7 depends on a frame
   manifest it was supposed to have produced. It does not exist. See ADR-0002.
