# Architecture decision records

From phase 8 onward, decisions with structural consequences get their own numbered record here.

Phases 0–6 used a single running log, [`../DECISIONS.md`](../DECISIONS.md), in the form
_choice → alternative considered → why_. That file is not being retrofitted: it is an accurate
record of how those phases were actually worked, and rewriting it into fifty ADRs after the fact
would make the process look tidier than it was.

The split is by weight, not by date. A decision gets an ADR here when it changes an interface, adds
infrastructure, or commits the project to something awkward to reverse. Everything smaller stays in
`DECISIONS.md`, which continues.

| ADR                                                |                                                                      |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| [0001](0001-phase-8-sequencing.md)                 | Phase 8 build order, and why it is not the roadmap's order           |
| [0002](0002-filmstrip-blocked-on-frame-sources.md) | The snapshot filmstrip is blocked on frame sources that do not exist |
| [0003](0003-visual-regression.md)                  | Visual regression against the state matrix — roadmap #5              |
