# MindWorks Maps — transit diagram builder

**Date:** 2026-08-20  
**Repo:** `tasks-hub`  
**Route:** `#/maps`

## Purpose

A general transit-map builder that lives as a Tasks Hub rail tab. MindWorks Pathways 2026 is the shipped first map. Adam edits maps here, views them in-hub, and can export a standalone HTML file to share. Stations may optionally link to a Tasks Hub project or excursion.

This replaces the broken GitHub Pages widget (`widgets/MindWorks/MindWorks-Map-builder.html`), which is an HTML shell whose JS/CSS 404.

## Decisions

| Topic | Choice |
|-------|--------|
| Home | Tasks Hub tab, not the widgets site |
| Persistence | Netlify Blobs via the existing store (same as projects) |
| Notion | Reference only. No runtime Notion |
| Coupling | Hybrid — map owns layout; a station/tick may link to a project or excursion |
| Viewer | In-hub View mode + organic HTML export (no publish pipeline) |
| Language | Tube schematic, vertical columns, 90° elbows |
| Stations | Filled capsules. Line arrives at the top curve and leaves from the bottom. No stroke through the fill |
| Competitions | Ticks (stem + circle + angled label) off a **line** or a **capsule** |
| Crossings | Tunnel (gap) unless a program sits on the crossing (interchange) |
| Library | Many named maps. Quiet switcher. Current calendar year is the default |
| First open | MindWorks 2026 already laid out from the poster |
| Builder | General — add any lines; MindWorks is the first map |

## Shell

- Rail item **Maps** next to Graph. Graph stays the task force-layout.
- Page header: eyebrow *Pathways*, title *Maps*.
- Quiet map dropdown (not year pills). One **New map**. View / Edit pills. **Export**.
- Zoom − / Reset / + on the canvas; wheel and pinch too.

## Data

Each map is one JSON document.

- **Map** — `id`, `title`, `year` (number or null; used only to pick the current-year default), timestamps
- **Line** — `name`, `letter`, `color` (hub token name), orthogonal `points` (consecutive points share x or y)
- **Station** — program capsule on one line; `label`; `y` along the line; `in_stroke` / `out_stroke` (`solid` \| `dotted`); optional `link`
- **Tick** — competition; `label`; attaches to `{ kind: "line", line_id, y }` or `{ kind: "station", station_id, side, offset }`; `stroke`; optional `connects_to` (dashed cross-line note); optional `link`
- **Crossing** — computed, not stored: two segments overlap → tunnel, unless a station occupies that point → interchange

`link` is `{ type: "project" \| "excursion", id }` or null. Broken links omit the “open” action; the card still opens.

## Editor

- **+ Line** — vertical column; drag ends; elbows stay 90°.
- **+ Program** — click a line → capsule (line in top, out bottom).
- **+ Competition** — click a line or a capsule → tick on that side.
- Drag capsule along its line. Drag tick; drop on a line or capsule to reattach.
- Click opens a drawer (name, strokes, optional project/excursion link).
- Delete uses a confirm card.
- Two lines cross → tunnel. Drop a program on the crossing → interchange.
- Autosave to Blobs.

## View and export

- View hides add/edit chrome. Click opens a preview card. Zoom still works.
- Export downloads standalone HTML: hub tokens, viewer only, no rail, no sign-in, no Edit. Clicks and zoom still work.

## Errors

- No maps in Blobs → seed MindWorks 2026 (also for stores that were seeded before this feature).
- Save fail → toast; keep last good map on screen.
- Bad import JSON → reject, do not overwrite.
- Export builds from the in-memory map.

## Tests

- Schema validate
- Orthogonal path helper
- Crossing = tunnel vs interchange
- Tick attach to line or station
- Seed 2026 has four lines (J, I, E, R) and poster programs
- Export HTML is viewer-only
- Capsule render: line-in and line-out, no stroke through the fill

## Out of scope

- Live Notion sync
- Rebuilding the widgets GitHub Pages page
- A second graph library
- Formal publish / hosting of exported files
