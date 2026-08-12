# ADR-0008 — Position identity and the ownership lock

**Status:** accepted
**Date:** 2026-08-12
**Roadmap:** #2

## Context

Acknowledging took a lock in client state. Two positions could both acknowledge the same incident
and both dispatch a response to it — the failure Pass A names explicitly — and no amount of care in
the browser can prevent that, because neither browser can see the other.

The roadmap said this "needs authentication first". It does not, and that framing is what had kept
it unbuilt.

## Decisions

### We deliberately did not build authentication

A lock needs to know _which desk_ is asking. It does not need to know who the person is, or that
they are who they say. Those are different questions, and answering the second to get the first
would have meant inventing a login, a session store, a password policy and a token lifetime —
a large, security-sensitive subsystem, specified by nobody, sitting underneath a feature that needed
one string.

So: a **position identity**. The server assigns a workstation number when the SSE stream opens and
keeps it in an httpOnly cookie. Every action carries it. `src/lib/position.ts`.

That is enough for a compare-and-set, enough for the audit trail to name who acted, and it leaves
real authentication as a clean addition rather than something half-built to be unpicked.

**What it is not is proof.** Anything that can send an HTTP request can send a cookie, and a
position can be impersonated by anyone who can reach the server. That is an accurate description of
the threat model this deployment actually has — an internal tool, on an internal network, behind a
door — and it is written in the README rather than left to be discovered. A real deployment facing a
hostile network needs authentication, and this decision does not pretend otherwise.

The alternative worth naming: letting the operator _pick_ a position from a list. Rejected because
two operators can then pick the same number, and a lock whose identities collide is worse than no
lock — it would report `Taken by position 3` to position 3.

### The compare-and-set is server-side, in one operation

`EventBus.claim(id, position, at)`. Read, compare, write, with nothing able to interleave:

- **In memory**, a synchronous check-and-set. This looks too easy for a lock and is correct for
  exactly one reason — JavaScript is single-threaded and there is no suspension point between the
  read and the write, so no other request can observe the gap.
- **In Redis**, a Lua script, precisely because that guarantee stops holding the moment the record
  leaves the process. `WATCH`/`MULTI` would also work and would mean a retry loop in TypeScript for
  a conflict that is already decided; a script settles it in one round trip and cannot livelock.

Both return the winner either way, because the loser needs a name, not an error.

**Re-claiming an incident you already hold succeeds and writes nothing.** A retried request must
never report an operator as their own rival.

### The rule exists once, and the suite holds both copies to it

`applyClaim` in `types.ts` is the definition; the Lua script is a transliteration. That is a drift
risk, and the conformance suite is the answer — it already caught one: the memory bus announced a
re-claim that had changed nothing, where the script correctly stayed silent. Two implementations
agreeing by inspection is a hope; agreeing under the same assertions is a fact.

### The claim is announced, on its own channel

A lock that only reaches the two positions that collided leaves every other desk showing the
incident as free. So a claim publishes a notice, and the stream forwards it as `event: claim`.

It is **not** a log entry, and it carries no SSE `id:`. The log is the record of what the detector
said, with its own retention and its own cursor; giving a claim an id would put its position into
`Last-Event-ID` and make the next reconnect replay the wrong window of detections. A reconnecting
client does not need claims replayed anyway — the claim amends the stored event, so a resync already
carries the owner on the record itself.

With Redis the notices are a second stream, read by the same blocking `XREAD` as the event stream:
two channels, one connection, one reconnect state.

### The optimistic UI finally has an unhappy path

Every other action an operator takes applies to an incident they already hold, so the client can
apply it immediately and tell the server afterwards. Acknowledging is a claim on a shared resource,
so it is the one action that can be _refused_ — and refusal is what optimistic UI usually has
nowhere to put.

The row now shows `Claiming…`, then resolves one of three ways:

| Answer         | What happens                                                 |
| -------------- | ------------------------------------------------------------ |
| granted        | the incident becomes acknowledged, assigned to this position |
| `409` taken    | rolls back, row and detail pane show `Taken by position 3`   |
| request failed | rolls back, **no rival named**                               |

The third row is the one worth stating. "The request did not arrive" is not "somebody else has it",
and telling an operator the wrong one of those is worse than telling them neither.

The refusal is transient; the lock is not. So the owner is written onto the event as well as into
the rejection — once the operator has read `Taken by position 3` and moved on, the row must still
show that position 3 has it.

### The refusal is a word, not a colour

`Taken by position 3` uses primary text against the same border the SLA tag uses. It is more urgent
than SLA and still system state rather than severity, and colour on this screen belongs to priority
— Pass B's rule that "a glance must never confuse 'connection degraded' with 'high priority'".
Weight and contrast carry the difference, which is the move the age column already makes when it
breaches.

### The claim outranks the acknowledgement badge in the detail header

If this position was refused, `✓ Acknowledged — Position 3` is technically true and reads as though
_they_ had it. The header shows the refusal instead. The action bar still shows the incident as
acknowledged by the holder, which is correct and is the lock being visible.

## Verification

**Conformance, 9 new assertions against both implementations**, including eight positions claiming
concurrently and exactly one winning, with every loser told the same winner's name. Against Redis
that is the assertion the Lua script exists for.

**End to end, two browser contexts** (`e2e/ownership.spec.ts`) — separate contexts, because the
identity is a cookie and two tabs of one browser are one desk. Both press `Enter` on the same
incident in the same tick; exactly one position is refused, the winner's audit trail names it, and
both screens agree on the owner. A second test proves a position that was _not_ racing sees the lock
appear without touching or reloading anything.

Verified as load-bearing by disabling the compare-and-set: the race test then reported **zero**
positions refused instead of one.

**Against the running stack**, positions as real cookie jars: one winner and one specific loser,
both on the default single-instance memory bus and — four times — through the round-robin proxy with
Redis, where the two positions can land on different instances and only the broker can arbitrate.
Positions came back 1 through 8 with no collisions, which is the shared `INCR` counter doing its job;
a per-instance counter would have handed out two "position 1"s and named the wrong desk.

**The standing rule:** `docker compose up` with no broker — `{"kind":"memory","degraded":false}`, and
the race resolves correctly on the synchronous check-and-set.

**Everything else:** 109 unit tests, 21 behaviour specs, 31 visual captures (`queue-row/claiming`
and `queue-row/taken` added), typecheck, lint, build.

## Consequences

- **The store's `acknowledge` no longer acknowledges.** It asks. Four existing tests asserted the
  old synchronous contract and were re-pointed at the real path rather than relaxed — the lock is
  only worth something if the client cannot grant it to itself.
- **The audit trail now names workstations, not people.** `Acknowledged (Position 3)`. More accurate
  than the hardcoded operator name it replaces, and less informative than a real deployment would
  want. Authentication is what closes that gap.
- **A position is never released.** `assignedTo` is set by acknowledging and never cleared: an
  incident does not become unowned because an operator moved on. Handing one back should be an
  action somebody takes, and there is no UI for it. That is a gap, and it is on the roadmap rather
  than papered over with a timeout nobody would see fire.
- **Positions are handed out monotonically and never reused**, so a long-running deployment counts
  upward forever. Fine for a demo, wrong for a control room with eight physical desks — a real
  version would bind the number to the workstation, which is exactly what authentication or a
  provisioning step would provide.
