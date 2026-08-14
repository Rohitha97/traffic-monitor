# The design source

The finished UI design this dashboard implements, exported unmodified before any application code
was written.

## Read the design (PDF)

The quickest way to read the design is the three PDFs. They need nothing installed and open
anywhere.

| Pass | PDF |
| --- | --- |
| **A · Flows and wireframes** | [Pass A — Flows and wireframes.pdf](Pass%20A%20%E2%80%94%20Flows%20and%20wireframes.pdf) |
| **B · Visual system** | [Pass B — Visual system.pdf](Pass%20B%20%E2%80%94%20Visual%20system.pdf) |
| **C · Screens and component states** | [Pass C — Screens and component states.pdf](Pass%20C%20%E2%80%94%20Screens%20and%20component%20states.pdf) |

## What each pass establishes

The `.dc.html` files are the original source the PDFs were produced from.

| File | Pass | What it establishes |
| --- | --- | --- |
| `Pass A - Flows and wireframes.dc.html` | **A · Flows** | Greybox only, no colour or type. The journey map for one critical event (96s worst case, 62s of it in noticing and orienting), the incident state machine, three layouts weighed against each other, and the recommendation: master–detail with one pinned critical band borrowed from the priority-lane board |
| `Pass B - Visual system.dc.html` | **B · Visual system** | The token sheet, as a plan for approval — three surfaces lifted off true black for a dim room, four priority ramps that are the only saturated tokens in the system, Public Sans over IBM Plex Mono, a 4px grid, a 3px radius ceiling, and four motion tokens. Also records three visual directions rejected on sight and four moves taken from motorway-signage vernacular |
| `Pass C - Screens and component states.dc.html` | **C · Screens** | The implementation target. Five frames at 1440×900 — default monitoring, critical arrival, incident under review, the component state matrix, and degradation states — plus the arrival choreography as a filmstrip. One incident (a wrong-way driver on CAM-014) runs through frames 1–3 |

## Opening the source files

The `.dc.html` files are templates with a small JavaScript class supplying their data. They need
`support.js` to render, which is why it and `image-slot.js` are exported alongside them, and why the
`_ds/` folder came with them. Open any `.dc.html` directly from this directory in a browser — no
server and no build step, it renders straight from the filesystem.

One caveat: `support.js` loads React from a CDN at runtime, and the frames load Public Sans and
IBM Plex Mono from Google Fonts, so **rendering the source files needs a network connection**.
Bundling those locally would mean editing `support.js`, which would cost the exactness that makes
this export worth keeping — the PDFs above exist precisely so nobody has to. The *application* has no
such dependency: its snapshots are committed images and its fonts are self-hosted, so
`docker compose up` works offline.

Checked on export: all five frames render, no unresolved template placeholders, background `#15181C`,
divider `#23272B`, 2px corner radius, 52px critical banner on `#262B30`, and both typefaces active.

## `_ds/nocturne-…/`

The generic design system the design project was started from. **It styles the presentation deck,
not the product** — the page background, section headings and annotation cards *around* the frames.
Every pixel inside the frames comes from Pass B instead. Kept here as a record of where the process
started.
