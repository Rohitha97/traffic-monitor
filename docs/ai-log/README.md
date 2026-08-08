# AI log

The brief asks for visibility on how AI was used. This directory holds that record.

## What is here

| File                                       |                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| [`PROCESS.md`](PROCESS.md)                 | How the work was structured, what the AI got wrong, and what it caught |
| [`../BUILD_PROMPT.md`](../BUILD_PROMPT.md) | The opening brief, verbatim — the single largest prompt in the project |
| `transcript.md`                            | **Not yet exported.** See below                                        |

## Exporting the full transcript

The build ran as one long Claude Code session. The verbatim transcript is held by the client, not
by the repository, so it has to be exported deliberately:

```bash
claude --resume
```

Pick the session, then use `/export` to write the conversation to a file, and save it here as
`docs/ai-log/transcript.md`.

`PROCESS.md` is written from that session and is accurate about it, but it is a summary. Where a
reviewer wants to see the actual back-and-forth — particularly the three points where the design
and the brief conflicted and a decision was escalated — the transcript is the primary source.

## How to read this alongside the code

The two documents that matter most for judging process are not in this directory:

- [`../DESIGN_INVENTORY.md`](../DESIGN_INVENTORY.md) — written **before** any feature code, and
  reviewed before it was allowed to continue. It is the artefact that proves the design and the
  build correspond.
- [`../DECISIONS.md`](../DECISIONS.md) — a running trade-off log, written at the moment each
  decision was made rather than reconstructed at the end. Sixty-odd entries across six phases,
  each in the form _choice → alternative considered → why_.

The commit history is also deliberately legible: one commit per phase, each message stating what
was built, what was decided, and what verification actually found.
