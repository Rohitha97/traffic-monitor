# Exported design source

A byte-exact export of the Claude Design project this dashboard implements, taken at the start of
phase 0. File sizes match the project's own listing exactly.

**Live project:** <https://claude.ai/design/p/395265bf-e8ef-4048-bf51-a354b40e2815>

## The three passes

| File | Pass | What it establishes |
| --- | --- | --- |
| `Pass A - Flows and wireframes.dc.html` | **A · Flows** | Greybox only, no colour or type. The journey map for one critical event (96s worst case, 62s of it in noticing and orienting), the incident state machine, three layouts weighed against each other, and the recommendation: master–detail with one pinned critical band borrowed from the priority-lane board |
| `Pass B - Visual system.dc.html` | **B · Visual system** | The token sheet, as a plan for approval — three surfaces lifted off true black for a dim room, four priority ramps that are the only saturated tokens in the system, Public Sans over IBM Plex Mono, a 4px grid, a 3px radius ceiling, and four motion tokens. Also records three visual directions rejected on sight and four moves taken from motorway-signage vernacular |
| `Pass C - Screens and component states.dc.html` | **C · Screens** | The implementation target. Five frames at 1440×900 — default monitoring, critical arrival, incident under review, the component state matrix, and degradation states — plus the arrival choreography as a filmstrip. One incident (a wrong-way driver on CAM-014) runs through frames 1–3 |

## Opening them

These are Claude Design documents: `<x-dc>` templates with a `DCLogic` class supplying the data.
They need `support.js` to render, which is why it and `image-slot.js` are exported alongside, and
why the `_ds/` folder came with them. Open any `.dc.html` directly from this directory in a
browser — no server and no build step, it renders from `file://`.

One caveat: `support.js` injects React from unpkg at runtime, and the frames load Public Sans and
IBM Plex Mono from Google Fonts, so **rendering the exported frames needs a network connection**.
Vendoring those locally would mean editing `support.js`, which would cost the byte-exactness that
makes this export worth keeping. The *application* has no such dependency — its snapshots are
committed stills and its fonts are self-hosted, so `docker compose up` works offline.

Verified on export: all five frames render, `<x-dc>` fully consumed, no unresolved `{{ }}`,
ground `#15181C`, hairline `#23272B`, 2px radius, 52px critical banner on `#262B30`, both type
families active.

## `_ds/nocturne-…/`

The nocturne design system. **It styles the deck, not the product** — the page ground, section
eyebrows and annotation cards around the frames. Every pixel inside the frames is Pass B's token
sheet. Retained here as provenance and as the record of where the process started.

See [`../DESIGN_INVENTORY.md`](../DESIGN_INVENTORY.md) §0 for the evidence, and §1.1 for the
disposition of all 50 nocturne tokens.
