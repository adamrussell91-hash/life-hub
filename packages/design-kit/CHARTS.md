# Charts and graphs — current paths and borrow rules

Copy-paste brief. Checked against `life-hub` `origin/main` at `c9719fc` (5 Sep 2026).

The design kit does **not** ship chart or graph components. Product viz stays in the hubs. Borrow Life charts and Knowledge graphs. Restyle with kit tokens. Do not invent a new look. Do not add viz packages to this kit.

---

## Where the instructions live

Canonical kit on Adam’s Mac: `/Users/adamrussell/Projects/hub-design-kit`  
Live SoT in this monorepo: `packages/design-kit/`  
GitHub `hub-design-kit` repo named in older docs is not reachable (404). Use the in-repo kit.

| File | Role |
|------|------|
| `packages/design-kit/AGENTS.md` | Read first. Tasks agents also read `TASKS.md`. **“Product UI (graphs, lesson blocks, bloods) stays in the hub. Chrome does not.”** |
| `packages/design-kit/TASKS.md` | Borrow brief (full text below). Chrome = Teaching. Board / Graph / Charts stay in the hub. |
| `packages/design-kit/RAIL.md` | Graph is a **rail page**, not a shortcut: icon + “Graph” label. Domain colour on the **canvas** (tiles, charts, chips), not the rail. |
| `packages/design-kit/MOBILE.md` | Knowledge phone destinations include Graph. |
| `packages/design-kit/README.md` | Kit inventory. Charts/graphs are not listed. |
| `packages/design-kit/tokens.css` | Closed colours charts must use. |
| `packages/design-kit/snippets/rail.html` | Only Graph **chrome** in the kit: icon + “Graph” link. |
| `docs/design-kit-compliance.md` | Remaining hex in charts is allowed as domain UI. |

`AGENTS.md` grab-list has no chart CSS/JS. Latest kit additions (toast, AI bar, inline edit, command search, surfaces) are not viz.

---

## Paths (standalone Mac vs this monorepo)

`TASKS.md` still uses standalone-repo paths. In the monorepo they live under `apps/`.

| What | `TASKS.md` / Mac path | Monorepo path |
|------|------------------------|---------------|
| Design kit | `/Users/adamrussell/Projects/hub-design-kit` | `packages/design-kit/` |
| Life Hub | `/Users/adamrussell/Projects/life-hub` | `apps/life/` |
| Life charts | `js/app/chart-kit/` | `apps/life/js/app/chart-kit/` |
| Knowledge Hub | `/Users/adamrussell/Projects/knowledge-hub` | `apps/knowledge/` |
| Knowledge graphs | `src/archive/forceGraph.ts` etc. | `apps/knowledge/src/archive/` |
| Tasks Hub | `/Users/adamrussell/Projects/tasks-hub` | `apps/tasks/` |

Teaching / Knowledge / Tasks symlink `design-kit/` → `packages/design-kit`. Life loads `packages/design-kit/` directly.

---

## Borrow — do not redraw

Copy interaction and rendering from hubs that already have it. Restyle with kit tokens if a copied stylesheet hard-codes hex. Do not invent a Tasks graph library or a new chart look.

### Graphs (Knowledge Hub)

- Force layout: `src/archive/forceGraph.ts` → `apps/knowledge/src/archive/forceGraph.ts`
- Focus / search / selection colouring: `src/archive/graphFocus.ts` → `apps/knowledge/src/archive/graphFocus.ts`
- Model shape (adapt nodes/edges; do not keep note/keyword semantics): `src/archive/keywordGraph.ts` → `apps/knowledge/src/archive/keywordGraph.ts`

Keep Knowledge habits: search field, select a node, preview card.

Universe / fake-sun modes are Knowledge product, not a Tasks requirement.

### Charts (Life Hub)

- Kit root: `js/app/chart-kit/` → `apps/life/js/app/chart-kit/`
- Prefer **ring**, **columns**, **area-line** for board metrics.
- Reach for heatmap / pie / sankey / etc. only when the same chart type already exists there and fits the data.

Graph and chart CSS belongs in the hub (or a copy of those modules). Do not add viz packages to this design-kit repo.

### Colour

Status colour uses existing tokens only: Wave, Marine, Depth, pastel chips.

- High Sea (`--high-sea`) is accent / decisive only.
- Never body text on orange.
- Never focus rings (focus is Wave).
- Charts use `--high-sea-ink`, not `--high-sea`.

Closed clinical series (`apps/life/js/app/chart-kit/clinical-slots.js`):

```text
--wave
--marine
--success
--danger
--high-sea-ink
--pastel-sage-ink
--pastel-peach-ink
--muted
```

Colour write-ups: `docs/superpowers/specs/2026-07-31-life-hub-design.md` (Charts) and `docs/superpowers/specs/2026-08-16-mind-visual-restyle-design.md`.

---

## Tasks Hub surfaces (from `TASKS.md`)

| Surface | Role |
|---------|------|
| **Board** | Home. Task / project / excursion cards as Teaching tiles. |
| **Graph** | A rail page, not home. Two modes: **blockers** (task nodes, blocked-by edges) and **workstreams** (clustered projects / areas). |
| **Charts** | Blocks on the board (counts, trends). Not a third chrome system. |

Shell: `<html lang="en" data-hub="tasks">` — clones Teaching glass/tiles. Rail brand returns to the board.

---

## Life chart-kit inventory

Root: `apps/life/js/app/chart-kit/`

### Prefer first

| File | Type |
|------|------|
| `ring.js` | Progress / target rings (`buildRingTarget`) |
| `apply-ring.js` | Apply ring geometry to the DOM |
| `columns.js` | Column / bar (`buildColumns`) |
| `area-line.js` | Area + line (`buildAreaLine`) |
| `animate.js` | Load animation + `prefers-reduced-motion` |

### Also in the kit (only if the type already exists and fits)

| File | Type |
|------|------|
| `pie.js` | Pie (`buildDistributionPie`, `buildMealProteinPie`) |
| `mood-mix.js` | Mood mix donut |
| `heatmap.js` | Heat row |
| `watchlist-heat.js` | Watchlist heat |
| `stream.js` | Stream / theme topography |
| `sankey-flow.js` | Sankey |
| `chord-layout.js` | Chord |
| `bump.js` | Bump / ranking lines |
| `horizon.js` | Horizon bands, metric strip, grouped bars |
| `radial-year.js` | Radial year |
| `polar-clock.js` | Polar clock |
| `energy-orbit.js` | Energy orbit |
| `mood-radial.js` | Mood radial |
| `theme-orbit.js` | Theme orbit |
| `theme-constellation.js` | Theme constellation |
| `masonry.js` | Column packer |
| `d3-layout.js` | d3 wrapper |
| `clinical-slots.js` | Closed clinical colour slots |
| `vendor/` | Vendored d3-shape, d3-sankey, d3-chord, d3-force (no CDN) |

### Life consumers (not the kit)

| File | Notes |
|------|--------|
| `apps/life/js/app/nutrition-charts.js` | Nutrition |
| `apps/life/js/app/bloods-charts.js` | Bloods |
| `apps/life/js/app/bloods-charts-layout.js` | Bloods layout |
| `apps/life/js/app/central-node-charts.js` | Central Node |
| `apps/life/js/app/fitness-charts-model.js` | Fitness model |
| `apps/life/js/app/render-fitness-charts.js` | Fitness week board (rings, pies, gated trends, volume bars) |
| `apps/life/js/app/render-home.js` | Home rings |
| `apps/life/js/app/render-nutrition.js` | Nutrition canvas |
| `apps/life/js/app/render-mind.js` | Mind tiles |
| `apps/life/js/app/render-skincare.js` | Skincare |
| `apps/life/js/app/render-body.js` | Body |
| `apps/life/js/app/render-bloods.js` | Bloods canvas |
| `apps/life/js/app/render-central-node.js` | Central Node canvas |

---

## Knowledge graph inventory

Borrow these first (`TASKS.md`):

- `apps/knowledge/src/archive/forceGraph.ts`
- `apps/knowledge/src/archive/graphFocus.ts`
- `apps/knowledge/src/archive/keywordGraph.ts`

Related Knowledge product (not required for Tasks):

- `forceGraphBehavior.ts` — interaction
- `graphPreview.ts` — preview card
- `graphMetrics.ts` — layout metrics
- `showAllGraph.ts`, `showAllDraw.ts`, `showAllEdges.ts`, `showAllSimulation.ts`, `showAllCommunities.ts`, `showAllScope.ts`, `showAllTransition.ts`
- `solarModel.ts`, `solarView.ts`
- `universeChrome.ts`, `universeKey.ts`
- `constellationSimulation.ts`

Docs:

- `apps/knowledge/docs/GRAPH_LAYOUT_BRIEF.md`
- `apps/knowledge/docs/GRAPH_LAYOUT_METRICS.md`

---

## Hub copies (product, not kit primitives)

### Tasks

- `apps/tasks/src/chart-kit/ring.ts`
- `apps/tasks/src/chart-kit/apply-ring.ts`
- `apps/tasks/src/chart-kit/columns.ts`
- `apps/tasks/src/chart-kit/animate.ts`
- `apps/tasks/src/blocks/chart-svg.ts`
- `apps/tasks/src/blocks/graph-svg.ts`
- `apps/tasks/src/blocks/graph-layout.ts`
- `apps/tasks/src/views/graph.ts`
- `apps/tasks/src/views/project-portfolio-chart.ts`

### Teaching

- `apps/teaching/src/blocks/chart-svg.ts`
- `apps/teaching/src/blocks/graph-svg.ts`
- `apps/teaching/src/blocks/graph-layout.ts`
- `apps/teaching/src/blocks/graph-maker/graph-maker-engine.js`
- `apps/teaching/src/blocks/graph-maker/content-adapters.ts`
- `apps/teaching/src/blocks/graph-maker/mount.ts`

---

## Rail Graph chrome (only viz markup in the kit)

`packages/design-kit/snippets/rail.html` — `.hub-rail__link` to `/graph`, 18px outline icon (three nodes + edges) + title-case “Graph”.

Rules from `RAIL.md`:

- Graph is a page, so it gets an icon. Not a shortcut.
- No coloured dots or domain swatches on the rail.
- Domain colour belongs on the canvas.

---

## Hard rules (do not skip)

- Do not fork `--rail-width`. Every hub uses the 15rem labeled rail.
- Tasks keeps Teaching frost. Do not flatten glass to Knowledge/Life.
- If a size or colour is missing, pick the nearest token. Do not add a CSS variable unless you are editing the kit on purpose.
- Do not start a new palette, font, or button style for a chart page.
- Agent writes: propose → **confirm card** → apply.
- Display dates: `dd/mm/yy` via `js/format-display-date.js`.
