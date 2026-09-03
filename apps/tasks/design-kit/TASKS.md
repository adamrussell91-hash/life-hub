# Tasks Hub — agent design notes

Read `AGENTS.md` first. This file is the extra brief for **Tasks Hub only**. It does not unlock a new palette, type scale, rail, or button system.

Chrome is Teaching. Product surfaces (board, graph, charts) stay in the hub. Data models and persistence are out of scope here.

Canonical kit: `/Users/adamrussell/Projects/hub-design-kit`  
Tasks Hub: `/Users/adamrussell/Projects/tasks-hub`

## Shell

```html
<html lang="en" data-hub="tasks">
```

Load Inter, then kit `tokens.css`, `overlays.css`, `chrome.css` (new hub), then Tasks Hub CSS.

`data-hub="tasks"` **clones Teaching**: more glass, more tiles, the same 15rem labeled rail as every other hub. Values live in `css/overlays.css` — do not retune them in the hub. Rail rules: `RAIL.md`.

Page header stays kit: uppercase eyebrow → `h1` → optional supporting → actions on the right. Rail brand is `<a class="hub-rail__brand" href="…board…">` (single uppercase line, returns to the board from anywhere). Destinations are `.hub-rail__link` (outline icon + title-case label). Refresh and sign out use `.hub-utilities` / `.hub-icon-btn` at the canvas top-right. Tasks does not show `.hub-mark` in the header — the tile stays favicon and sign-in mark only. No supporting copy on the gate. See `ICONS.md`.

Agent writes: propose → **confirm card** → apply.

## Surfaces

| Surface | Role |
|---------|------|
| **Board** | Home. Task / project / excursion cards as Teaching tiles (glass, `--hub-tile-gap`). |
| **Gantt** | Timeline over the same Task records as every other view. New Task adds a dated task (visible on Board, Today, and the rest). Projects sit in lanes. Bars are Cotton Glass micro-cards: drag to reschedule, right-edge resize, ○ handle to link `depends_on` (FS / SS / FF). Critical path is a High Sea outline, not a new colour story. |
| **Goals** | Plan. Area → Goal → Project hierarchy; expand a project for milestones and tasks. |
| **Someday** | Plan. Off-tree holding pen (`bucket: someday`); promote to goal, project, or task. |
| **Graph** | A rail page, not home. Two modes on that page: **blockers** (task nodes, blocked-by edges) and **workstreams** (clustered projects / areas). |
| **Charts** | Blocks on the board (counts, trends). Not a third chrome system. |

Data model: `docs/data-model.md` in the Tasks Hub repo (Area → Goal → Project → Task → Step; milestones on projects; Someday bucket).

Status colour uses existing tokens only: Wave, Marine, Depth, pastel chips. High Sea is accent / decisive, never body text on orange, never focus rings.

## Cards — micro, expanded, full page

Every task/project card surface (Board, Today, Backlog, Search, Projects, calendar agenda) uses the Cotton Glass recipes — do not draw a parallel `task-row` / flat tile. Gantt plots those same tasks as bars, not a second card gallery.

| View | Class | Role |
|------|--------|------|
| **Micro** | `.hub-row` | Title, area chip (`data-area`), priority chip, date badge, “Updated …”, icon edit/delete. Click (or Enter/Space) expands. |
| **Expanded** | `.hub-card` | Eyebrow, status badge, title, chips, date, progress + `.hub-track` (projects), child-task checklist, footer. **Open page** goes to the full page. |
| **Full page** | `.page-card` + Teaching Hub block canvas | Same visual language as the expanded card. Title and task fields are editable on the card. A circular **+** opens the Teaching Hub insert menu (Basic, Media, Teaching, Learning, Visualisation, Layout) — not a side rail. Routes: `#/task/:id`, `#/project/:id`. Not rail items. |

Container transform: the slot keeps a unique `view-transition-name` per instance. `document.startViewTransition` morphs micro ↔ expanded; skip the API under `prefers-reduced-motion`. Expanded project task rows stagger with `--i`.

Priority: urgent → `--danger`, high → pastel-peach, medium → pastel-gold, low → pastel-sage. Area chips are categorical: teaching = blue, wedding = lilac, life = gold, health = lilac, other = shore/muted.

Do not invent a second page builder. Port Teaching Hub’s engine (`src/blocks/*`, `src/teacher/lesson-canvas/*`) and persist `page_blocks` on the task or project. Skip compositions, NESA outcome strips, student publish, and the AI chat column. Media uses a URL/file field (no Drive library).

## Mobile (≤720px)

Same cards and pages — not a second visual system. The chrome already collapses the 15rem rail to a sticky horizontal scroller (do not hide it or invent a hamburger).

| Surface | Phone behaviour |
|---------|-----------------|
| **Micro** | Full-width row, wrapping title/chips, 44px icon hits on coarse pointers. Tap expands. |
| **Expanded** | Same card, stacked footer actions (`Open page` is a full-width `.btn`). Project row stacks title then status/%. |
| **Board / Week** | Horizontal snap-scroll — one status or day at a time — not four skinny columns and not a 4-storey stack. |
| **Board drag** | Tap expands. Fingers need a 12px lift before a card leaves its slot so a scroll or tap is not a move. `touch-action: pan-y` on cards so the page still scrolls. |
| **Month** | 7-column grid fits the viewport (no 42rem min-width). Cells stay tappable; the agenda under the grid is the readable list. |
| **Full page** | Circular **+** under the card opens the insert menu. Title is an input. Back is a small header link, not a full-width footer button. Inputs stay at 1rem so iOS does not zoom. |

Safe-area padding on the canvas. `viewport-fit=cover`. No new colours, type, or button styles.

## Borrow — do not redraw

Copy interaction and rendering from hubs that already have it. Restyle with kit tokens if a copied stylesheet hard-codes hex. Do not invent a Tasks graph library or a new chart look.

**Graphs (Knowledge Hub)**

- Force layout: `src/archive/forceGraph.ts`
- Focus / search / selection colouring: `src/archive/graphFocus.ts`
- Model shape (adapt nodes/edges; do not keep note/keyword semantics): `src/archive/keywordGraph.ts`

Use Knowledge’s habits: search field, select a node, preview card. Universe / fake-sun modes are Knowledge product, not a Tasks requirement.

Path: `/Users/adamrussell/Projects/knowledge-hub`

**Charts (Life Hub)**

- Kit root: `js/app/chart-kit/`
- Prefer **ring**, **columns**, **area-line** for board metrics. Reach for heatmap / pie / sankey / etc. only when the same chart type already exists there and fits the data.

Path: `/Users/adamrussell/Projects/life-hub`

Graph and chart CSS belongs in the hub (or a copy of those modules). Do not add viz packages to this design-kit repo in this pass.

## Hard rules

- Do not fork `--rail-width`. Every hub, including Tasks and Knowledge, uses the 15rem labeled rail.
- Do not flatten glass to Knowledge/Life’s `glass-panel` override. Tasks keeps Teaching frost.
- Do not start a Tasks colour story “because work is serious.”
- If a size or colour is missing, pick the nearest token.
