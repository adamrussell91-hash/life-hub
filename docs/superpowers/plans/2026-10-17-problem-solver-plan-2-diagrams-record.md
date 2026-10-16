# Problem Solver — Plan 2: remaining diagrams, emblems, record and morph

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Every Define tool draws its own book chart as answers are accepted, each tool has its emblem, and a saved session opens on a black-and-white process record whose steps morph into the coloured chart.

**Reference implementation:** `packages/problem-solver/render/five-whys.ts` and its styles in `packages/problem-solver/problem-solver.css` (section `/* 5 Whys`). Every renderer in this plan follows the same contract and visual language. Read both before starting any task.

**Spec:** `docs/superpowers/specs/2026-10-16-problem-solver-design.md` (Visual language, Diagrams, Record). Plan 1: `docs/superpowers/plans/2026-10-16-problem-solver-plan-1-foundation.md`.

**Book references** (scanned toolkit pages; shapes, proportions and palette must match): 5 Whys p.47, Concept mapping p.49, Problem tree p.51, Gap analysis p.53, Gap analysis advanced p.55, Problem statement p.59, SMART p.61, Problem solving process p.37, Polya p.21, TRIZ p.23. The exact descriptions are in each task below; you do not have the scans.

## Shared visual contract (all renderers)

- **API:** `createXView(doc = document): { el: HTMLElement; update(run: PsToolRun): void }`. `update` is idempotent, diffs by node id, creates DOM only for new nodes, animates only new nodes, keeps existing elements (identity stable across updates).
- **Nothing before acceptance:** a shape for a node appears only when that node exists in `run.nodes`. Structural frames (an empty radar grid, the SMART header row, the problem tree's background oval) may appear once the tool's first node exists, never before.
- **Palette:** `--ps-red #d4282c`, `--ps-yellow #f0bc3c`, `--ps-blue #2e5ba6`, `--ps-on-yellow #2a2210` (defined on `.ps-scope`). Flat fills, no outlines, no gradients, no drop shadows on shapes. White text on red and blue, `--ps-on-yellow` on yellow.
- **Text in shapes:** a tiny uppercase meta label (10px, `--tracking-caps`, opacity .78) and a title (15px semibold) from `nodeTitle(node)` (`packages/problem-solver/titles.mjs`). Never the full answer inside a shape.
- **Details:** every shape is a `<button class="ps-…__shape" aria-expanded aria-controls>`; clicking opens a details card (full answer, skill chips via `skillChip`, "Coach objected:" note when contested). One open card per diagram. Use the shared helper from Task 1.
- **Contested:** shape stays solid; a small outlined `Contested` tag (`.ps-objection`, `title` = objection) beside the title.
- **Motion:** Web Animations API, 300–520ms, `cubic-bezier(0.2, 0.8, 0.2, 1)`, `fill: 'backwards'`, skipped under `prefers-reduced-motion` or when `el.animate` is missing (happy-dom). Never animate an element whose position comes from an SVG `transform` attribute (animate an inner wrapper instead).
- **Layout:** works at 390px with no horizontal scroll; shapes scale with width; text never smaller than 12px.
- **Accessibility:** root has `role="list"` and `aria-label` with the tool name; each node wrapper `role="listitem"` and `data-node`.
- **Classes:** prefix per tool (`ps-tree`, `ps-gap`, `ps-radar`, `ps-statement`, `ps-smart`, `ps-cmap`, `ps-record`). Styles go in `packages/problem-solver/problem-solver.css` under a commented section per tool.
- **Tests:** Vitest + happy-dom in `apps/tasks/tests/unit/problem-solver-<tool>-render.test.ts`: empty run renders no node shapes; nodes render in the right regions; identity stable across updates; contested tag; open/close one at a time; tool-specific rules below.
- **Visual QA:** after tests pass, render a filled sample at 900px and 390px with the preview harness in Task 1 and look at it. Fix anything that looks cramped, misaligned or unlike the book description before committing.

---

### Task 1: Shared details helper, preview harness, canvas registry

**Files:** create `packages/problem-solver/render/details.ts`; modify `packages/problem-solver/render/five-whys.ts` to use it (no visual change); modify `apps/tasks/src/views/problem-solver/canvas.ts`; create `scripts/problem-solver-preview.mjs`.

- [ ] `details.ts` exports:
  - `detailsCard(doc, node, accent: 'red' | 'yellow' | 'blue', id): HTMLDivElement`: the current five-whys details markup, generalised (class `ps-details`, inner `ps-details__inner`, card `ps-details__card ps-details__card--<accent>`, `ps-details__text`, `ps-details__skills`, `ps-details__note`).
  - `createDisclosureGroup(): { register(item: HTMLElement, button: HTMLButtonElement): void }`: one-open-at-a-time toggling, sets `is-open` on the item and `aria-expanded` on the button.
  - Move the five-whys details CSS to generic `.ps-details*` rules. Keep five-whys tests green (update selectors in the five-whys test only where class names change).
- [ ] `canvas.ts`: replace the five-whys special case with a registry `RENDERERS: Partial<Record<PsToolId, () => View>>`, keyed by tool, keeping one view per run id (as today). Unknown tools still fall back to the outline.
- [ ] `scripts/problem-solver-preview.mjs <tool> <out-dir>`: bundles a sample run for the tool with esbuild (`node_modules/.bin/esbuild`, loader `.svg=text`), writes an HTML page linking `apps/tasks/design-kit/tokens.css` and `packages/problem-solver/problem-solver.css` inside `.ps-scope`, and screenshots it at 900px and 390px with Playwright Chromium (`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`, import from `node_modules/playwright-core/index.mjs`) to `<out-dir>/<tool>-900.png` and `<tool>-390.png`. Sample data per tool lives in `scripts/problem-solver-preview-samples.mjs` (synthetic only; one contested node per sample). Optional `--open <nodeId>` clicks that shape before the screenshot.
- [ ] Commit: "Problem Solver: shared details card, renderer registry, preview harness".

### Task 2: Problem tree (p.51)

**Book:** a large blue oval behind the upper half; inside it a yellow rounded rectangle "Effects (who, what, where, when, why)" at the top; a red rounded rectangle "The problem" in the middle with a short red arrow pointing up into the effects; below it a blue rounded rectangle "Causes (who, what, where, when, why, how)" with a red arrow pointing up into the problem. Read bottom to top: causes → problem → effects.

**Build:**
- Trunk (`trunk`): red rounded rect centred, about 46% of width, title inside.
- Causes (`cause:N`): blue rounded rects in a wrapping row below the trunk (2–3 per row desktop, 2 on phone), each with an up arrow (red, flat, chevron head) into the trunk. Effects (`effect:N`): yellow rounded rects in a wrapping row above the trunk, arrows up from the trunk to the effects row.
- Background: a solid `--ps-blue` oval behind the effects band, as in the book, with the yellow effect cards sitting on it. It appears once the first effect exists.
- Relationships (`run.edges`, kind `relates`): thin ink lines (1.5px, `--ink` 40%) drawn in an SVG overlay between card edges, drawing in with stroke-dashoffset on creation; recompute positions on resize (ResizeObserver) and on update.
- Region order in DOM: effects, trunk, causes (screen-reader order top to bottom) but `aria-label` on each region names it.
- Tests: causes land in the causes region, effects in the effects region; oval absent until first effect; an edge renders one line element.

### Task 3: Problem statement (p.59)

**Book:** a square split into a tall red block on the left "The problem" (full height, half width), and on the right a blue block top "Solution benefits" and a yellow block bottom "Impacts".

**Build:**
- Square grid (aspect 1:1 desktop max 420px; phone full width). Each block appears when its node exists: `problem` → red left, `impact` → yellow bottom right, `benefit` → blue top right. Block reveal: clip-path wipe from its outer edge.
- Inside each block: meta label + title; long blocks may show up to 3 lines of the title only.
- `statement` node: a composed-statement card below the square (paper card, 3px top border in red), full text shown (this is the one place the full answer shows without a click), with a details button for skills/objection.
- Tests: blocks placed in correct grid areas; statement card renders full text.

### Task 4: Gap analysis, basic (p.53)

**Book:** a wide shape: a red circle "Current state" on the left edge and a blue circle "Objective" on the right edge, overlapping a central ellipse split vertically into a red left half and a blue right half with a thin paper gap down the middle. The red half has "Known" in the upper lobe and "Done" in the lower lobe; the blue half "Must know" upper and "Must do" lower. A yellow horizontal bar "Actions" runs across the centre, joining the two circles.

**Build:**
- SVG backdrop drawn in stages: `current` → red circle + red half; `objective` → blue circle + blue half; first `action` → yellow bar grows from centre outwards.
- Items: `known:N`, `done:N`, `must_know:N`, `must_do:N` render as small pill buttons (white text) stacked inside their lobe (max 3 visible per lobe, then "+N" pill that opens a list in the details card); `action:N` render as pills on the yellow bar (ink text), wrapping onto a list under the shape on phone.
- Circle titles: `current` and `objective` titles inside their circles.
- Tests: each slot lands in its lobe; yellow bar absent until an action; overflow pill appears past three.

### Task 5: Gap analysis, advanced radar (p.55) and rescoring

**Book:** a red disc with white concentric rings (1 to 10) and white spokes, topic labels around the rim, a yellow polygon (current state) and a blue polygon (objective); legend "Performance: current state (yellow), objective (blue)".

**Build:**
- Axes from `radarAxes(run)` (`packages/problem-solver/tools/gap-radar.mjs`); each `axis:N` node adds a spoke that sweeps in and a rim label button (meta "Topic N", title).
- Polygons from the latest `run.radar.snapshots` entry; on a new snapshot the polygon morphs from the previous points to the new ones (animate `points` via requestAnimationFrame interpolation, 600ms). Before any snapshot: rings and spokes only, plus a "Score each topic" button.
- Scoring UI: a compact form (one row per topic: two 1–10 sliders using the kit's adaptive slider if present in `apps/tasks/design-kit/js/adaptive-slider.js`, else native range inputs styled with tokens) that the page wires to a new action. The renderer exposes `onScore(cb)`; it does not call the API itself.
- Server: add action `rescore_radar` to `netlify/functions/_shared/problem-solver/service.mjs` and a pure `rescoreRadar(session, payload, deps)` in `session.mjs`: active (or last) gap_radar run, `gapRadar.validateScores` must pass (else 400 with its message), appends `{ at: deps.now(), current, objective }`; works when phase is `define` or `defined` (rescoring later tracks progress). Tests in `tests/unit/problem-solver-session.test.js` and `-service.test.js`. Add `'rescore_radar'` to `PsAction` and a `problemSolverApi.rescore(session, payload)` in `apps/tasks/src/views/problem-solver/api.ts`.
- Chart catalogue: add a row for `gap-radar` to `apps/tasks/design-kit/CHART-CATALOG.md` (where used, purpose, limits: 3–8 axes, 2 overlays; code path) and a change-log line in `CHARTS.md`.
- Tests: spokes = axes; polygon point count = axes; snapshot change updates points; `rescore_radar` validation.

### Task 6: SMART objectives (p.61)

**Book:** a blue header band with five yellow triangles each holding a letter (S M A R T) over labels (Specific, Measurable, Attainable, Relevant, Time-based); below, a red grid of cells each holding one flat yellow shape (circle, triangle, square, half-circle), decorative.

**Build:**
- Header band appears with the `problem` node (the problem's title sits in a slim red bar above the band).
- Each letter node (`s`,`m`,`a`,`r`,`t`) fills its column: the column's red cell under the header gets a yellow shape (fixed per column: S triangle, M half-circle, A square, R circle, T triangle-down) with the criterion's title in ink beneath the shape inside the cell; the header triangle for that letter switches from outline to solid yellow when filled.
- Phone: the five columns become five stacked rows (header triangle left, cell right).
- Tests: header renders on problem; each letter fills only its column; phone layout class toggles via container width (use CSS container queries, not JS).

### Task 7: Concept mapping (p.49) via graph-blocks

**Build:** `render/concept-map.ts` adapts the run to `GraphContent` from `packages/graph-blocks` (`renderGraphView(host, 'concept', content)`): theme node as the root, concepts as nodes (`label` = `nodeTitle`), `hierarchical` edges set `parent_id`, `association` and `cross` edges become labelled edges (`label` 'relates to' / 'links across'). Colour mapping: theme `peach`, concepts alternate `blue`/`gold` (closest kit swatches to the book's red/blue/yellow). Re-render on update (graph-blocks owns its layout); details for a concept open from a list of concept pills under the canvas (graph view itself is read-only). Tests: adapter output shape; contested concept marked in its pill.

### Task 8: Tool emblems

**Book emblems** (small circles in each page's corner): 5 Whys: circle split horizontally, red top and blue bottom, with a vertical column of four small yellow downward chevrons over the middle. Concept mapping: blue circle with a cluster of small red, yellow and blue dots. Problem tree: yellow circle with a blue circle (head) above two short red horizontal bars. Gap analysis: circle in horizontal bands, blue top, thin yellow middle band, red bottom. Problem statement: circle with red left half, blue top-right quarter, yellow bottom-right quarter. SMART: circle split diagonally yellow and blue with a red triangle in the centre.

**Build:** `packages/problem-solver/glyphs/tools/<tool_id>.svg` (viewBox 0 0 100 100, real book colours as fills, no ids), `toolEmblem(id, doc)` in `glyphs.ts` returning a span (`ps-emblem`). Use emblems in: the suggestion card title in `coach-panel.ts`, the canvas heading in `canvas.ts`, the session list rows in `view.ts`. Render a contact sheet with the preview harness and compare against the descriptions. Tests: every tool id has an emblem.

### Task 9: Record diagrams and morph

**Book:** p.37 "The problem solving process": rounded boxes Define (problem recognition and definition), Analyse (problem analysis), Devise (generate alternate solutions), Decide (select solution), Implement (plan and act) in a vertical column with down arrows; Improve (evaluate outcome) to the right of Implement; a wide Document (record key information) box beneath, two-way arrow to Improve; feedback arrows from Improve back up to Define and Devise labelled "If not successful, feedback"; "If successful, continue" out of Improve. Polya p.21: four boxes in a column (Identify the problem, Devise a solution, Implement the solution, Evaluate the solution) with a loop back labelled "Solution fails". TRIZ p.23: Specific problem → General problem → General solution → Specific solution in a column, with a "Contradiction matrix" box feeding the middle two.

**Build:**
- `render/record.ts`: `createRecordView(doc): { el, update(session) , onOpenStep(cb) }`, black and white only (ink strokes 1.5px, paper fills, ink text; done steps solid ink fill with paper text; future steps faint outline at 35% opacity; arrows and loop labels as in the book). Steps come from `MODELS[session.model.id].steps`; the model's define step is "done" when `session.phase === 'defined'`, "current" (solid outline, ink text) during define, else future.
- Under the record: a filmstrip of the Define chain (`session.define.runs`): each run a small card with the tool emblem and name; switched runs greyed with "Switched: <reason>"; the done chain in order.
- Morph: clicking the define step (or a filmstrip card) shows that run's coloured chart in the canvas. Capture the step box rect, render the chart container, then call `morphFromRect(rect, chartContainer)` from `apps/tasks/design-kit/js/morphing-dialog.js` (has `.d.ts`); colours fade in over 280ms after the morph. A "Back to record" control reverses (morph from the chart container to the step box rect by rendering the record and calling `morphFromRect(chartRect, stepBox)`).
- Canvas integration (`canvas.ts`): phase `defined` opens on the record; phase `define` shows the active chart with a small "Record" toggle in the heading; a filmstrip card opens that run read-only.
- Tests: step states by phase; filmstrip includes switched runs with reasons; clicking define step calls the open callback with the right run id.

### Task 10: Integration, browser walk, gate

- [ ] Extend `apps/tasks/tests/browser/problem-solver.spec.mjs`: after the 5 Whys steps, accept a switch suggestion to Problem tree (the scripted coach may need a branch: if the user text starts with `switch:` it returns a `switch_tool` suggestion to `problem_tree`), add a cause, click "I've defined it", confirm the record shows Define as done, click Define and confirm the chart appears. Desktop and 390px.
- [ ] Run Tasks vitest, Tasks build, root `npm run test:unit`, the browser walk (with the Chromium executable override as a throwaway config), then `npm run pre-pr-check`.
- [ ] Update the PR description.
