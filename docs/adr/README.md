# Architecture decision records

From phase 8 onward, decisions with structural consequences get their own numbered record here.

Phases 0–6 used a single running log, [`../DECISIONS.md`](../DECISIONS.md), in the form
_choice → alternative considered → why_. That file is not being retrofitted: it is an accurate
record of how those phases were actually worked, and rewriting it into fifty ADRs after the fact
would make the process look tidier than it was.

The split is by weight, not by date. A decision gets an ADR here when it changes an interface, adds
infrastructure, or commits the project to something awkward to reverse. Everything smaller stays in
`DECISIONS.md`, which continues.

| ADR                                                      |                                                                      |
| -------------------------------------------------------- | -------------------------------------------------------------------- |
| [0001](0001-phase-8-sequencing.md)                       | Phase 8 build order, and why it is not the roadmap's order           |
| [0002](0002-filmstrip-blocked-on-frame-sources.md)       | The snapshot filmstrip is blocked on frame sources that do not exist |
| [0003](0003-visual-regression.md)                        | Visual regression against the state matrix — roadmap #5              |
| [0004](0004-instrumenting-the-two-numbers.md)            | Instrumenting the two numbers the design argues from — roadmap #4    |
| [0005](0005-virtualising-the-queue.md)                   | Virtualising the queue — roadmap #3                                  |
| [0006](0006-the-reopen-rule.md)                          | The reopen rule — roadmap #6                                         |
| [0007](0007-redis-streams-behind-the-event-bus.md)       | Redis Streams behind the event bus — roadmap #1                      |
| [0008](0008-position-identity-and-the-ownership-lock.md) | Position identity and the ownership lock — roadmap #2                |
| [0009](0009-next-intl-and-cookie-locale.md)              | next-intl, and a cookie instead of a `[locale]` route — phase 9      |
| [0010](0010-ime-composition-and-single-key-shortcuts.md) | IME composition and single-key shortcuts — phase 9                   |
| [0011](0011-japanese-typography.md)                      | The Japanese typography layer — phase 9                              |
| [0012](0012-japanese-domain-vocabulary.md)               | Japanese domain vocabulary, and the direction convention — phase 9   |
| [0013](0013-locale-aware-formatting.md)                  | Locale-aware formatting, and the age counter — phase 9               |
