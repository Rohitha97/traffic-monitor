# ADR-0006 — The reopen rule

**Status:** accepted
**Date:** 2026-08-11
**Roadmap:** #6

## Context

Pass A specifies it in one sentence: "A dismissed incident that re-detects within 3 min returns as
_new_, tagged 'seen before', with the earlier dismissal reason on the row." The schema has carried
`seenBefore` and `dismissal` since phase 1 and the README listed the rule as unbuilt. This item
builds it.

The reason it is worth building is not the tag. It is that a dismissal is a judgement an operator
already made, and a detection pipeline that reports the same shadow every ninety seconds will make
them make it again, and again, until they stop reading. The rule exists so the second encounter
costs a glance instead of a decision.

## Decisions

### Correlation is a pure function over the event buffer, not a parallel index

The obvious implementation is a map of recent dismissals keyed by camera. There was already one in
the ingest route for the congestion-repeat rule — `lastSeenByCamera` — and it had a bug that makes
the argument better than any reasoning would: it stored one timestamp per camera regardless of event
type, so a debris call made the _next congestion detection_ from that camera look like a repeat and
escalated it. Nobody noticed, because the map was a second copy of facts the buffer already held and
nothing compared them.

Both rules now read the buffer directly (`src/lib/correlation.ts`). The buffer already _is_ the
record of what was detected and what was done about it. A second index of the same facts is a second
thing to keep correct, and this one had been wrong for five phases.

The cost is a scan of up to 100 buffered events per ingest, twice. At the volumes this handles that
is not worth an index; if it ever is, the index should be derived from the buffer rather than
maintained beside it.

### "The same call" is camera + type + position, with adjacent lanes merged

Same camera and same class is not enough. Two debris calls on one camera are two incidents, and
merging them would hide the second behind the first's dismissal — a real hazard suppressed by an
unrelated judgement, which is the worst failure available here.

So position has to agree too:

- **Different lane position is a different place.** Hard shoulder and live lane are not the same
  call, even from the same camera a minute apart.
- **Adjacent live lanes are the same object.** A detector that puts a stopped vehicle in lane 2 and
  then lane 3 has almost certainly seen one vehicle and disagreed with itself.
- **An unlocalised detection matches any lane of that position.** There is no evidence to separate
  them on, and the conservative reading is that it is the same thing.

The lane tolerance is the one genuinely arbitrary number here. It is set to ±1 because that is the
width of a detector's disagreement with itself, not a distance across the carriageway.

### The redetect is a new incident, not the old one revived

Pass A says "returns as _new_", and this is the part worth being explicit about. The redetect gets
its own id, its own priority derived from scratch, its own SLA clock, and its own place in the
queue. The earlier verdict rides along as context.

Reviving the dismissed incident would have been less code and would have quietly made the operator's
dismissal reversible by the detector, which is not a thing a detector should be able to do.

### The tag carries the reason, on the row

A tag reading only "seen before" would send the operator to the detail pane to find out what they
had already decided — the exact re-litigation the rule exists to prevent. So the row renders
`Seen before · shadow`, and the detail pane repeats it above the detector's description, where it
changes how that description should be read.

It sits on the row's secondary line rather than in the right-hand badge cluster because reasons are
variable-length free text: on the secondary line it truncates against the location instead of
pushing the age column around.

Deliberately not styled as a warning. It is not a correction; it is the operator's own prior call
handed back to them.

### The dismissal reason had to reach the server first

The rule could not fire at all until this was fixed, and it is the part that would have shipped
broken. `POST /api/events/mark` carried `{id, mark, at, actor, action}` — enough to know an incident
was _decided_, nothing about whether it was dismissed or why. `findPriorDismissal` would have
scanned a buffer in which no event was ever `dismissed` and correctly found nothing, forever.

The route now takes an optional `dismissalReason`, and `recordMark` applies `status: 'dismissed'`
and the `dismissal` object to the buffered copy. This is a narrow, honest version of what roadmap #2
does properly: the client still holds the working copy and still marks optimistically, and the
server still learns about actions by being told. Item #2 makes the server authoritative outright.

## Verification

**Unit tests, 20 across three functions,** including every boundary the brief names: 2:59 merges and
3:01 does not; the window boundary itself is inside and one millisecond past it is outside; same
camera different type does not merge; adjacent lane does; two lanes apart does not.

Both boundaries were verified as load-bearing by breaking them on purpose — widening the window to
six minutes and the lane tolerance to ±2 — which failed exactly the three tests that should fail and
no others.

Also covered, because they are the ways this goes wrong rather than merely fails: a resolved
incident is not a prior dismissal (it was real; re-detection is news), the newest of two dismissals
wins, and a dismissal timestamped _after_ the detection is ignored, so clock skew between the
detector and the operator cannot make a detection inherit a verdict that had not been given yet.

**End-to-end, 2 tests** (`e2e/reopen.spec.ts`), driving the whole chain through the UI: dismiss with
a reason, wait for the mark to reach the server, re-ingest one lane over, and assert the tag and the
reason on the row, in the detail pane and in the audit trail. This is the test that would have
caught the missing `dismissalReason` — the unit tests pass with a perfectly correct rule that never
fires.

Each test owns its own camera. The server's replay buffer is shared across the run and every test
reloads the page, and correlation is _about_ matching against history, so it cannot tolerate another
test's leftovers the way a row-count assertion can. The second test failed on exactly this before
the cameras were separated.

**A frame-budget regression, found and fixed.** The first version of the tag made every row's
secondary line a flex container with a nested span — paid on every row whether tagged or not. The
500-incident ↑↓ measurement went from a 14.7–16.3ms median to 15.7–19.7ms, against a 16.7ms budget,
and failed. Attributed by measuring the same test on the stashed working tree rather than guessing,
because run-to-run noise on this machine is ±4ms and eyeballing it would have proved nothing.

The tag now renders as one of two branches, so an untagged row emits exactly the markup it did
before. Re-measured: 11.5–15.0ms median, and the full suite green.

**Visual regression:** the state matrix gains `queue-row/seen-before`; 28 snapshots pass.

**`docker compose up` with no broker:** dashboard healthy, detector-sim running, and the full path
exercised against the containerised production build by hand — ingest, dismiss with a reason,
re-ingest one lane over, `seenBefore: "Shadow"` on the response. No infrastructure added.

## Consequences

The seeded scenario gains a beat and now runs about two minutes rather than ninety seconds. It also
now has one step that needs the operator: the tag records a decision, so there is nothing to show
until one has been made. Leaving the call alone is a valid path — the redetect is simply a second
incident — and the script says so rather than pretending the demo is fully automatic.

`markSchema`'s `note` field is now doing double duty as the dismissal reason on the audit entry.
That is fine while there is one kind of note; roadmap #2 should give the action record a proper
shape rather than growing a third meaning for the same string.
