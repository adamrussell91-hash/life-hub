# Charts and graphs — design-kit library

**Read this file. Do not hunt Life, Knowledge, Tasks, Teaching, or old specs for a chart or graph look.**

This is the one source of truth for hub charts and graphs. Same job as `tokens.css` for colour and `RAIL.md` for the rail: a closed library. Pick a type from the catalog. Import from the implementation root listed. If the type is not here, do not invent one.

Implementation still lives in one root per family (Life chart-kit, Knowledge archive graph). Those roots are the library code. This file is the catalog, the rules, and the log. When a type is added, changed, or retired, update **this file in the same PR**.

---

## Agent rule

1. Open `packages/design-kit/CHARTS.md` (this file).
2. Choose a catalog id.
3. Import the listed export from the listed root.
4. Use kit tokens (`tokens.css`). Clinical series: `CLINICAL_CHART_SLOTS`.
5. Stop.

Do not open `TASKS.md` for viz. Do not copy hex from a screenshot. Do not start a second chart library in a hub.

New type? Add the module under the implementation root **and** a row + log entry here. Same PR. Otherwise it does not exist.

---

## Implementation roots

| Family | Root | Use |
|--------|------|-----|
| **Charts** | `apps/life/js/app/chart-kit/` | Geometry + motion. Prefer ring, columns, area-line. |
| **Graphs** | `apps/knowledge/src/archive/` | Force canvas, focus/search colour, node/edge model, preview card. |

Hub copies (`apps/tasks/src/chart-kit/`, `apps/tasks/src/blocks/*graph*`, `apps/teaching/src/blocks/*graph*`) are **consumers**. Restyle with tokens if they still hard-code hex. Do not treat them as a second library.

Standalone Mac paths (same files): Life `js/app/chart-kit/`, Knowledge `src/archive/`.

---

## Locked look

| Rule | Detail |
|------|--------|
| Tokens only | `tokens.css`. Nearest token if something is missing. No new CSS variables unless you are editing the kit. |
| Clinical series | `--wave`, `--marine`, `--success`, `--danger`, `--high-sea-ink`, `--pastel-sage-ink`, `--pastel-peach-ink`, `--muted` (`clinical-slots.js`) |
| High Sea | `--high-sea` is accent / decisive only. Charts use `--high-sea-ink`. Never body text on orange. Never focus rings (focus is Wave). |
| Motion | `animate.js`. Honour `prefers-reduced-motion`. Quiet ancestor: `[data-sync-quiet]`. |
| Dates | Axis / labels that are calendar days: `dd/mm/yy` via `js/format-display-date.js`. |
| Rail | Graph is a **page** (icon + “Graph”), not a shortcut. Domain colour on the canvas, never the rail. Snippet: `snippets/rail.html`. |
| Chrome | Charts and graphs sit on hub tiles / glass. They are not a third chrome system. |

---

## Charts — prefer these

Default for board metrics, counts, targets, trends.

### `ring` — progress against a target

- **When:** One value vs one target (macros, completion, streak toward a goal).
- **Root:** `apps/life/js/app/chart-kit/ring.js`
- **API:** `buildRingTarget({ value, target }, { size = 64, strokeWidth = 8 })` → `{ size, strokeWidth, center, radius, circumference, fraction, dashoffset, value, target }`. Fraction is capped at 1.
- **DOM:** `applyRingTarget(svg, { value, target }, options)` in `apply-ring.js`. SVG needs `[data-role="track"]` and `[data-role="fill"]` circles. Fills with `animateRingFill`.
- **Used on:** Home macros, Nutrition rings, Fitness labeled rings, Central Node completion, Tasks board copies.

### `columns` — counts / comparison

- **When:** A short set of labeled magnitudes (week volume, status counts, grouped totals).
- **Root:** `apps/life/js/app/chart-kit/columns.js`
- **API:** `buildColumns(items, { height = 96 })` where `items` are `{ key, label, value }`. Returns `{ height, bars: [{ key, label, value, heightPct }] }`.
- **Motion:** `animateColumnGrow(element, heightPct)`.
- **Used on:** Fitness volume, soft-medical columns, Tasks board, Central Node week bars.

### `area-line` — trend over a series

- **When:** A time series (labs, weight, rolling intake). Irregular events: `straightLinePath`. Continuous signal: `smoothLinePath`.
- **Root:** `apps/life/js/app/chart-kit/area-line.js`
- **API:** `buildAreaLine(series, { width = 320, height = 120, padding = 12, paddingBottom, valueKey = 'value', rollingAverage = 0, guideValue, yDomain = 'zero' \| 'padded' \| 'fixed', includeValues, min, max })`. Also `smoothLinePath`, `straightLinePath`, `smoothAreaPath`.
- **Motion:** `animateAreaReveal(svg)` — SVG `[data-role="line"]`.
- **Used on:** Nutrition, Bloods, Body, Central Node.

### `animate` — shared motion

- **Root:** `apps/life/js/app/chart-kit/animate.js`
- **API:** `prefersReducedMotion()`, `animateRingFill(circle, { circumference, dashoffset })`, `animateAreaReveal(svg)`, `animateColumnGrow(element, heightPct)`.

---

## Charts — also in the library

Use only when the data matches the type. Do not pick these for a generic count if ring / columns / area-line will do.

| Id | When | Export | File |
|----|------|--------|------|
| `pie` | Parts of a whole (distribution, meal protein). | `buildDistributionPie(items, { size = 72 })`, `buildMealProteinPie(meals, { size })` | `pie.js` |
| `mood-mix` | Mood mix donut. | `buildMoodMixDonut(items, { size, radius, gap })` | `mood-mix.js` |
| `heatmap` | Day-hit row (consistency). | `buildHeatmapRow({ from, to, today, hitDates })` | `heatmap.js` |
| `watchlist-heat` | Watchlist intensity. | `buildWatchlistHeat(series)`, `WATCHLIST_SLOTS`, `watchlistDelta` | `watchlist-heat.js` |
| `stream` | Stacked theme flow over weeks. | `buildStreamPaths(weekly, { width, height, padding })`, `buildThemeTopography(weekly)` | `stream.js` |
| `sankey` | Transition flows. | `buildSankeyFlow(transitions, { width, height })` | `sankey-flow.js` |
| `chord` | Co-occurrence. | `buildChordLayout(cooccurrence)` | `chord-layout.js` |
| `bump` | Rank over time. | `buildBumpChart(…)` / `buildBumpLines(ranks, themes, { width, height })` | `bump.js` |
| `horizon` | Compact multi-metric bands / strip / grouped bars. | `buildHorizonBands`, `buildMetricStrip`, `buildGroupedMetricBars`, `moodLevelFromScore` | `horizon.js` |
| `radial-year` | Year of daily hits. | `buildRadialYear({ year, byDate })` | `radial-year.js` |
| `polar-clock` | Date → angle helpers for polar charts. | `thetaForDate`, `polar`, `windowDays`, `MONTHS`, … | `polar-clock.js` |
| `energy-orbit` | Energy over a date window. | `buildEnergyOrbit(series, { bounds, range, previous })` | `energy-orbit.js` |
| `mood-radial` | Mood over a date window. | `buildMoodRadial(series, { bounds, range })` | `mood-radial.js` |
| `theme-orbit` | Theme arms from mean mood. | `buildThemeOrbit(themes)`, `THEME_ARMS`, `armForMeanMood` | `theme-orbit.js` |
| `theme-constellation` | Theme co-occurrence map. | `buildThemeConstellation({ nodes, edges, minEdgeCount = 2, … })`, `pairKey`, `neighborhood`, `arcFor` | `theme-constellation.js` |
| `masonry` | Tile packer (Mind). | `packMasonry(items, { columns, gap, columnWidth, flowOffset })` | `masonry.js` |
| `range-bar` | Value on a reference span, with an optional balance tick. | `rangeBarLayout(value, refLow, refHigh, { width, padding })`, `rangeBarTick(fraction, { width, padding })` | `range-bar.js` |
| `clinical-slots` | Closed multi-series colours. | `CLINICAL_CHART_SLOTS` | `clinical-slots.js` |
| `d3-layout` | Vendored d3-shape / sankey / chord / force. No CDN. | `d3api()`, `stack`, `sankey`, `chord`, `forceSimulation` | `d3-layout.js`, `vendor/` |

---

## Graphs — library (copy these habits)

Default for a hub Graph **page**: search, select a node, preview card. Two Tasks modes (blockers / workstreams) reuse this look with a different model.

### `force-graph` — canvas layout + interaction

- **When:** A node/edge page (Knowledge archive, Tasks blockers / workstreams).
- **Root:** `apps/knowledge/src/archive/forceGraph.ts`
- **API:** `mountForceGraph(host, model, handlers, options) → GraphMount`. Options: `{ variant, search, excerptFor }`. Handlers: `{ onNoteSelect }`.
- **Behaviour helper:** `forceGraphBehavior.ts` (stage size, search attach, click/hover, show-all tuning). Do not rewrite force physics.

### `graph-focus` — search and selection colour

- **When:** Colouring the graph from a query or a selected node.
- **Root:** `apps/knowledge/src/archive/graphFocus.ts`
- **API:** `nodeMatchesQuery`, `searchCluster`, `selectionCluster`, `isFocusLink`, `isFocusNode`, `isSearchHot`.

### `graph-model` — nodes and edges

- **When:** Building the model you pass to `mountForceGraph`. Adapt kinds; drop note/keyword semantics if the hub is not Knowledge.
- **Root:** `apps/knowledge/src/archive/keywordGraph.ts`
- **API:** `buildArchiveGraph(entries) → ArchiveGraphModel`. Types: `GraphNodeDatum`, `GraphLinkDatum`, `GraphNodeKind` (`major` \| `minor` \| `leaf`), `GraphLinkKind` (`backbone` \| `orbit` \| `spoke` \| `overlap`). Constellation helpers: `applyConstellationHubClick`, `collapseConstellation`, `placeHubLeaves`.

### `graph-preview` — selected-node card

- **When:** The side card after a node click.
- **Root:** `apps/knowledge/src/archive/graphPreview.ts`
- **API:** `mountGraphPreview(host, handlers)`.

---

## Graphs — Knowledge product only

Do **not** copy these onto Tasks or Teaching unless you add them to the library section above and log it.

- Show-all: `showAllGraph.ts`, `showAllDraw.ts`, `showAllEdges.ts`, `showAllSimulation.ts`, `showAllCommunities.ts`, `showAllScope.ts`, `showAllTransition.ts`
- Universe / solar: `solarModel.ts`, `solarView.ts`, `universeChrome.ts`, `universeKey.ts`
- Layout notes (Knowledge): `apps/knowledge/docs/GRAPH_LAYOUT_BRIEF.md`, `GRAPH_LAYOUT_METRICS.md`

---

## Where each hub consumes the library

Consumers are not a second catalog. Open them only to wire data, not to restyle.

| Hub | Charts | Graphs |
|-----|--------|--------|
| Life | `nutrition-charts.js`, `bloods-charts.js`, `central-node-charts.js`, `fitness-charts-model.js`, `render-fitness-charts.js`, `render-home.js`, `render-nutrition.js`, `render-mind.js`, `render-skincare.js`, `render-body.js`, `render-bloods.js`, `render-central-node.js` (all under `apps/life/js/app/`) | — |
| Knowledge | — | `apps/knowledge/src/archive/` (library root) |
| Tasks | `apps/tasks/src/chart-kit/{ring,apply-ring,columns,area-line,animate}.ts`, `blocks/chart-svg.ts`, `views/project-portfolio-chart.ts`, `views/dashboard-overview.ts` | `apps/tasks/src/views/graph.ts`, `blocks/graph-svg.ts`, `blocks/graph-layout.ts` — blockers + workstreams |
| Teaching | `apps/teaching/src/blocks/chart-svg.ts` | `blocks/graph-svg.ts`, `graph-layout.ts`, `graph-maker/` |

Tasks Graph is a rail page, not home. Charts on Tasks are board blocks (counts, trends).

---

## Visual grammar (multi-representation)

Shared encoding so the same object feels related across chart / calendar / Gantt / timeline / graph. Not a new library — conventions only.

| Axis | Encoding | Apply on |
|------|----------|----------|
| **Time** | Past = muted; today = Wave focus; future = default ink | Calendar chips, Gantt/timeline bars, area-line markers |
| **State** | Planned / Active / Done / Blocked via existing status chips | Board, Gantt, calendar |
| **Selection** | Wave inset/outline (`.is-focused`) | Board card, calendar item, Gantt row, chronology bar, graph node |
| **Importance** | Primary series = clinical slots; secondary = muted | Multi-series charts |
| **Relationship** | Direct = solid; inferred = soft/dashed | Knowledge spokes vs overlap; Tasks deps |

Agents may name catalog ids + focus/schedule payloads. They must not emit third-party chart option trees.

---

## How to add or change a type

1. Edit the module under the implementation root (or add one file there).
2. Add or edit the row in this file (id, when, export, path).
3. Append a **Log** line below (date, id, what changed).
4. Same PR. If it is not in this file, the next agent must not use it.

Retire a type by marking the row **retired** and logging it. Leave the id so nobody reintroduces a look-alike.

---

## Log

Newest first. This is the running record of the library.

| Date | Id | Change |
|------|----|--------|
| 2026-09-06 | `area-line` | Tasks dashboard completion trend consumes Life `area-line` (typed consumer + `animateAreaReveal`). No new catalog types. |
| 2026-09-05 | Fitness | Polar labels sit outside the plot with leader lines; week volume bars animate width, not height. No new catalog types. |
| 2026-09-05 | grammar | Documented multi-representation visual grammar (time/state/selection/importance/relationship) + agent catalog rule. No new chart types. |
| 2026-09-05 | Fitness | Fitness painters now consume Mind / Bloods interaction chrome: axis and ring labels, `mind-chart-legend`, `mind-bump__tooltip` hover, `animateAreaReveal` / `animateColumnGrow`. Polar cards cap at 18–20rem. No new catalog types. |
| 2026-09-05 | `theme-constellation` | Optional `minEdgeCount` (default 2). Fitness library map uses 1 so a same-session pair draws an edge. Caller `node.colour` is kept when set. |
| 2026-09-05 | `range-bar` | Promoted from Bloods `rangeBarLayout` into chart-kit. Fitness uses it for push/pull and trained/rest gauges. |
| 2026-09-05 | `polar-clock` | Added `thetaForTime` / `minutesFromTime` for training time-of-day. |
| 2026-09-05 | Fitness | Fitness tab consumes 18 catalog forms (polar-clock, energy-orbit, mood-radial, chord, bump, stream, watchlist-heat, horizon, mood-mix, range-bar, area-line, columns, radial-year, sankey, theme-constellation). Two-ring region volume uses mood-mix stroke rings. No invented types. |
| 2026-09-05 | library | `CHARTS.md` is the design-kit source of truth. Agents stop being sent to Life / Knowledge / TASKS.md for viz. Implementation roots unchanged. |
| 2026-09-05 | `ring` `pie` `columns` | Fitness week board consumes labeled rings, pies, gated trends, denser volume bars. No new types. |
| 2026-09-01 | chart-kit | Life chart-kit remounted to `apps/life/js/app/chart-kit/` in the monorepo. Catalog ids already in that tree: ring, columns, area-line, pie, heatmap, stream, sankey, chord, bump, horizon, radial-year, polar-clock, energy-orbit, mood-radial, mood-mix, theme-orbit, theme-constellation, watchlist-heat, masonry, clinical-slots, animate. |
| 2026-09-01 | `force-graph` `graph-focus` `graph-model` | Knowledge archive graph is the graph library. Universe / show-all / solar stay Knowledge-only. |
