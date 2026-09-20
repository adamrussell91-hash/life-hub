# Hub Map: a living flowchart of every hub and page type

**Date:** 2026-09-20
**Status:** Design, awaiting review
**Owner:** Adam

## Purpose

One page that maps the whole of Life Hub so Adam can keep up with his own build. For each node he can log:

1. Whether the page is built out fully.
2. Which UI/UX features are on it.
3. Which other pages it connects to.
4. Build plans for it.

## Scope rule

Nodes are **hubs, main pages, sections and page types** only. A page type is one template card (for example "Task", "Project", "Lesson", "Note"). Individual tasks, lessons, projects or notes are never nodes. The map holds roughly 90 nodes across Life, Teaching, Knowledge, Tasks and Professional (6 visible when opened; about 68 with every hub expanded).

## Layout

A left-to-right tidy tree (Life Hub at the left, then hubs, pages, then sections and page types) so no card can overlap another. Cross-links are curved dashed lines between cards. If a link's endpoint is collapsed, the line attaches to its nearest visible ancestor.

## Entry point

The map is reached from the **Central Node** page in Life Hub (`apps/life/js/app/render-central-node.js`). It is not a rail item. Central Node gets one link tile that opens the Map page. The map's own centre node is Life Hub.

## Starting point in the repo

`apps/knowledge/public/tools/mindmap.html` is a parked, standalone "Mindmap maker" on the kit tokens. Reuse its pan/zoom, SVG edge drawing and animated layout ideas. Do not reuse its data model: it is a strict tree (one parent per node) with text-only nodes and `localStorage` persistence. The map needs cross-link edges, structured cards and repo-backed storage.

## Data

One JSON file in `life-hub-data` (path fixed in the plan). Shape:

- `nodes[]`
  - `id`, `name`, `hub` (`life` | `teaching` | `knowledge` | `tasks` | `professional` | `central`)
  - `kind`: `hub` | `page` | `section` | `page-type`
  - `route`: the live route or hash, when one exists
  - `status`: `unreviewed` | `not-started` | `partial` | `built`. Seeded pages start as `unreviewed`: a route existing in code does not prove the page is fully built, so Adam decides that. The `unreviewed` filter doubles as his review queue.
  - `features[]`: UI/UX features on the page, as short strings
  - `plans[]`: build plans, each `{ text, done }`
  - `notes`: optional free text
- `edges[]`
  - `from`, `to`
  - `type`: `structure` (hub, page, section, page type) or `link` (cross-link between pages)
  - `label`: optional

The initial file is seeded from the real routes and code (Life sections, Tasks routes, Teaching teacher routes, Knowledge, Professional routes), so the first view reflects what exists. Status and features are filled from the code as found. Plans start empty.

## Canvas

- Central node "Life Hub", with the five hubs around it.
- Opens on Life Hub and its five hubs. Expanding a hub reveals its main pages; expanding a page reveals its sections and page types. The card you expand stays where it is on screen, and Fit view centres on Life Hub.
- Structure edges are solid. Cross-link edges are dashed.
- Status chip on every card. A filter shows only `partial` or `not-started`.
- Pan, zoom, fit view. Works at 390px and desktop.
- Kit tokens and components only. No new colours.

## Cards

- Modelled on the Tasks hub cards (`apps/tasks/src/views/hub-cards.ts`, `map-cards.ts`): glass tile, title, hub chip, status badge, feature count.
- Clicking a card opens an edit panel with the four log fields (status, features, links, plans). Edits autosave.

## Storage and errors

- The page loads the JSON and writes edits back through a new Netlify function that follows an existing `life-hub-data` writer (choose the specific one in the plan).
- Export and Import JSON stay as a manual backup.
- A failed save shows an inline error. The edit stays in the panel and is retried on the next change. Nothing is dropped silently.
- Auth: same session as the rest of Life Hub. No new secrets in browser assets.

## Out of scope

- Individual tasks, lessons, projects, notes, people or events as nodes.
- Automatic detection of build status from code after the initial seed.
- Any change to other hubs' behaviour.

## Testing

- Unit tests for the data validation, node and edge integrity (no dangling edge, no duplicate id) and the collapse/expand model.
- Integration test for the save function: success, rejected write, unauthenticated request.
- Browser check at desktop and 390px: open from Central Node, expand a hub, edit a card, reload and confirm it persisted.

## Open items for the plan

- Exact file path in `life-hub-data`.
- Which existing writer function to model the save on.
- Final route inventory per hub, confirmed against the code at seed time.
