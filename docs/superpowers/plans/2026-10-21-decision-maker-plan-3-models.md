# Decision Maker Plan 3: The Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 2–5 (one book section each) are independent and can run as parallel subagents once Task 1 is in.

**Goal:** Turn all 52 catalogue entries into working tools:
- 48 Decision Maker models: 44 built from the family factories, plus the two bespoke lenses gaining their coaching fields. The other four entries are Problem Solver's `swot`, `morphological`, `double_loop` and `pareto`, reused unchanged. Each model has:
  - a chart config that follows the graphic kit's "logic" lines;
  - a coaching note in our own words: "use it when", steps, failure modes and the book's exercise;
  - our own "pairs well with" links beside the book's "see also".
- Registration in Problem Solver's single tool registry with `step: 'explore'`, so Problem Solver never lists them.
- Tests: the kit's logic lines as assertions, a driver that works every model to completion through the real machine, and every model drawn by its own chart.

**What the models needed from the families:** writing all 48 showed six gaps in Plan 2's factories and charts, closed in Task 1:
- **Dimensions the person names:** the gap in the market (plot), and the skills of the team model (scales).
- **A diagonal band:** the flow channel.
- **Task cells:** Eisenhower's "do immediately".
- **Minimum rounds:** result optimisation's three complete loops.
- **Inverted pyramid columns:** Maslow's wants.
- **Two new fields on every tool:** `exercise` and `pairsWell`.

**Where the content came from:**
- **Structure:** each model's `model.json` "logic" lines in the graphic kit. These are design data, not book text, and the configs follow them line by line.
- **Page checks while drafting:** four models where the structure depends on the book's own words: the Yes/No rule, the project portfolio, the crossroads and the AI model. The AI model check corrected a wrong guess about two of its cells.
- **Coaching:** written in our own words. Each section task ends with a read of that section's pages as images, to correct any label or meaning against the book.

**Architecture:**
- Models live in `packages/decision-book/models/section-{1..4}.mjs`. `models/index.mjs` collects them with the two one-offs as `DECISION_TOOLS`, and `packages/problem-solver/tools/index.mjs` spreads that in.
- `step: 'explore'` is not a toolkit step, so Problem Solver's shelves and prompts (which list tools by toolkit step) never show them. The coach schema accepts their ids, and the parse step still limits suggestions to the session's current plan step.
- Three Problem Solver tests checked every registered tool against toolkit rules. Each now scopes itself to toolkit tools: the registry order, book steps and failure modes, and an emblem per tool. Decision Maker's models have their own tests. One rule stays for both: no Decision Maker step may be called `choose`, which is Problem Solver's Decide step. That rule caught two of the drafts.

**Spec:** `docs/superpowers/specs/2026-10-21-decision-book-design.md` ("Catalogue", "Coach knowledge").
**Plans 1 and 2:** done.
**Branch and worktree:** `claude/decision-book` in `/Users/you/Projects/life-hub-decision-book`. Run every command from that worktree's root unless a step says otherwise. Run `npm ci` at the root and in `apps/tasks` first if `node_modules` is missing.
**Book pages:** `.db-book/` (git-ignored; rebuild per Plan 1 Task 4 if missing). Section *n*'s render for printed page *p* is `<section file>-<p − offset>.png`, with offsets 9, 51, 81 and 123 for sections 1–4.

**How this plan was made:** every file below was drafted in the worktree and its tests run green: 51 model tests, 488 decision-book and Problem Solver node tests, 1,033 vitest tests and the full unit suite (5,660). The Tasks type-check showed no errors in these paths, and the contact sheet drew all 48 models with nothing spilling past its chart. The drafts were then removed. New files are given in full; changed files are given as patches (apply with `git apply`, then check with `git diff`).

**Public repo rule:** no book sentences. Labels are the model's own short terms (quadrant and stage names), which the kit and the spec already use.

---

### Task 1: What the models need from the families and charts

**Files:**
- Modify: `packages/decision-book/families/{common,quadrant,plot,scales,path,list}.mjs`, `packages/decision-book/render/{plot,scales,list}.ts`, `packages/decision-book/decision-book.css`, `packages/decision-book/tools/{outside-box,black-box}.mjs`

- [ ] **Step 1: Apply the factory changes**

`common.mjs` adds `exercise` and `pairsWell`. `quadrant.mjs` adds `taskCells`. `plot.mjs` adds named `dimensions` (with `axisLabel`) and a `diagonal` band. `scales.mjs` adds `named` scales (with `scaleLabel`). `path.mjs` adds `minRounds`. `list.mjs` adds `inverted` pyramid columns.

````diff
diff --git a/packages/decision-book/families/common.mjs b/packages/decision-book/families/common.mjs
index 9289ac6b5..d4ccf8118 100644
--- a/packages/decision-book/families/common.mjs
+++ b/packages/decision-book/families/common.mjs
@@ -42,6 +42,8 @@ export function checkCommon(config) {
   check(Array.isArray(config.steps) && config.steps.length > 0, id, 'needs coaching steps');
   check(['worksheet', 'lens'].includes(config.tier ?? 'worksheet'), id, 'tier is worksheet or lens');
   check(config.chart && typeof config.chart === 'object', id, 'needs a chart config');
+  check(config.exercise == null || (typeof config.exercise === 'string' && config.exercise), id, 'an exercise is a sentence');
+  check(config.pairsWell === undefined || (Array.isArray(config.pairsWell) && config.pairsWell.every((other) => typeof other === 'string' && other !== id)), id, 'pairsWell lists other tool ids');
 }
 
 /**
@@ -82,6 +84,10 @@ export function baseTool(config, family, slots, extra) {
     when: config.when,
     failureModes: freeze([...(config.failureModes ?? [])]),
     steps: freeze(config.steps.map((s) => ({ ...s }))),
+    // Our own coaching additions: the book's exercise in our words, and links we add beside the
+    // book's "see also" (catalogue.mjs keeps the book's).
+    exercise: config.exercise ?? null,
+    pairsWell: freeze([...(config.pairsWell ?? [])]),
     chart: freeze(structuredClone(config.chart)),
     slots: freeze({ ...(subject ? { subject } : {}), ...slots, ...(reflection ? { reflection } : {}) }),
     ...extra,
diff --git a/packages/decision-book/families/list.mjs b/packages/decision-book/families/list.mjs
index a9223b4f6..efea09bc1 100644
--- a/packages/decision-book/families/list.mjs
+++ b/packages/decision-book/families/list.mjs
@@ -5,7 +5,8 @@
 //   rows       a row per group (cognitive bias)
 //   lanes      a column per group (conflict responses)
 //   routes     groups as routes out from the centre (crossroads)
-//   pyramid    groups stacked from the base up, one pyramid per `column` (Maslow, then and now)
+//   pyramid    groups stacked from the base up, one pyramid per `column` (Maslow, then and now);
+//              a column listed in `inverted` is drawn widest at the top (Maslow's wants)
 //   roles      a card per group (Belbin roles, de Bono hats)
 import { countSlots, nextIndexed, open } from '../../problem-solver/slots.mjs';
 import { baseTool, check, checkCommon, framing, isKey, nodesIn, reflected, subjectFirst } from './common.mjs';
@@ -28,6 +29,7 @@ export function entriesByGroup(run, chart) {
  * @param {number} [config.chart.perGroup] (6)
  * @param {number} [config.chart.minGroups] groups with an entry before the reflection opens (2)
  * @param {number} [config.chart.minEntries] entries before the reflection opens (3)
+ * @param {string[]} [config.chart.inverted] pyramid columns drawn widest at the top
  */
 export function listTool(config) {
   checkCommon(config);
@@ -39,6 +41,7 @@ export function listTool(config) {
   const columns = chart.groups.map((group) => group.column ?? null);
   check(columns.every((c) => c === null) || columns.every((c) => isKey(c)), id, 'give every group a column, or none');
   if (columns[0] !== null) check(chart.layout === 'pyramid' || chart.layout === 'lanes', id, 'columns belong to pyramid or lanes');
+  check(!chart.inverted || (chart.layout === 'pyramid' && chart.inverted.every((column) => columns.includes(column))), id, 'inverted names pyramid columns');
   check(typeof chart.entry === 'string' && chart.entry, id, 'needs an entry description');
   const perGroup = chart.perGroup ?? 6;
   const minGroups = chart.minGroups ?? 2;
diff --git a/packages/decision-book/families/path.mjs b/packages/decision-book/families/path.mjs
index a4adb8076..bacf70cd7 100644
--- a/packages/decision-book/families/path.mjs
+++ b/packages/decision-book/families/path.mjs
@@ -59,6 +59,7 @@ export function roundOf(run, stages) {
  * @param {{id: string, label: string, kind?: string, yes?: string, no?: string, next?: string}[]} [config.chart.stages]
  * @param {boolean} [config.chart.loop] stages may repeat in rounds
  * @param {number} [config.chart.rounds] most rounds (3)
+ * @param {number} [config.chart.minRounds] complete rounds before the reflection (1)
  * @param {{layer: string, hole: string}} [config.chart.layers] what a layer and a hole are
  */
 export function pathTool(config) {
@@ -115,6 +116,9 @@ export function pathTool(config) {
   }
 
   const rounds = chart.loop ? (chart.rounds ?? 3) : 1;
+  // Rounds that must be complete before the reflection (result optimisation runs three full loops).
+  const minRounds = chart.minRounds ?? 1;
+  check(Number.isInteger(minRounds) && minRounds >= 1 && minRounds <= rounds, id, 'minRounds is between 1 and rounds');
   const inRound = (run, round) => chart.stages.filter((stage) => run.nodes.some((node) => node.slot === `${stage.id}:${round}`));
   return baseTool(config, 'path', slots, {
     nextSlots(run) {
@@ -123,10 +127,11 @@ export function pathTool(config) {
       const round = roundOf(run, chart.stages);
       const done = inRound(run, round).length;
       if (done < chart.stages.length) return [`${chart.stages[done].id}:${round}`];
-      return open(round < rounds ? `${chart.stages[0].id}:${round + 1}` : null, reflection ? 'reflection' : null);
+      return open(round < rounds ? `${chart.stages[0].id}:${round + 1}` : null, reflection && round >= minRounds ? 'reflection' : null);
     },
     complete(run) {
-      return inRound(run, 1).length === chart.stages.length && reflected(run, reflection);
+      const full = Array.from({ length: minRounds }, (_, i) => inRound(run, i + 1).length === chart.stages.length).every(Boolean);
+      return full && reflected(run, reflection);
     }
   });
 }
diff --git a/packages/decision-book/families/plot.mjs b/packages/decision-book/families/plot.mjs
index 652ea3a9b..a7813860d 100644
--- a/packages/decision-book/families/plot.mjs
+++ b/packages/decision-book/families/plot.mjs
@@ -3,13 +3,16 @@
 // the names; the person places each point with the chart's controls, which send a score
 // snapshot { points: { nodeId: { x, y, size?, plot? } } } through Problem Solver's scores
 // action. Snapshots merge in order, so points can be placed one at a time and moved later.
-// Options: a bubble `size` (1–10), a shaded `band` and several `plots` that never share axes
-// (the project portfolio's two coordinate systems): a point then names its plot.
-import { countSlots, nextIndexed, open } from '../../problem-solver/slots.mjs';
+// Options: a bubble `size` (1–10), a shaded `band` (a rectangle, or a `diagonal` channel as in
+// the flow model), several `plots` that never share axes (the project portfolio's two
+// coordinate systems: a point then names its plot), and `dimensions` the person names first
+// (`dimension` slots), which axes use instead of a fixed label (the gap in the market).
+import { countSlots, nextIndexed, open, parseSlot } from '../../problem-solver/slots.mjs';
 import { baseTool, check, checkCommon, framing, isKey, nodesIn, reflected, subjectFirst } from './common.mjs';
 
 const isScale = (value) => Number.isInteger(value) && value >= 1 && value <= 10;
-const isAxes = (axes) => Boolean(axes?.x?.label && axes.x.low && axes.x.high && axes?.y?.label && axes.y.low && axes.y.high);
+const isAxis = (axis, dims) => Boolean(axis && (axis.label || dims.includes(axis.dim)) && axis.low && axis.high);
+const isAxes = (axes, dims = []) => isAxis(axes?.x, dims) && isAxis(axes?.y, dims);
 
 /** The plots a config draws: its own list, or one plot `main` on the shared axes. */
 export function plotsOf(chart) {
@@ -23,6 +26,13 @@ export function positionsOf(run) {
   return out;
 }
 
+/** An axis's words for this run: its fixed label, or the title the person gave its dimension. */
+export function axisLabel(run, axis) {
+  if (!axis.dim) return axis.label;
+  const named = run.nodes.find((node) => parseSlot(node.slot)?.name === 'dimension' && node.tag === axis.dim);
+  return named ? (named.title ?? named.text) : axis.label ?? 'Not named yet';
+}
+
 /**
  * @param {object} config
  * @param {object} config.chart
@@ -30,7 +40,8 @@ export function positionsOf(run) {
  * @param {{id: string, label: string, axes: object}[]} [config.chart.plots] separate plots instead
  * @param {string} config.chart.point what one point is
  * @param {{label: string}} [config.chart.size] a bubble size, 1–10
- * @param {{label: string, x: [number, number], y: [number, number]}} [config.chart.band] a shaded region
+ * @param {{label: string, x?: [number, number], y?: [number, number], diagonal?: number}} [config.chart.band] a shaded region, or a channel of that half-width (percent) along the diagonal
+ * @param {{id: string, label: string}[]} [config.chart.dimensions] axes the person names (2 or 3)
  * @param {number} [config.chart.max] points (10)
  * @param {number} [config.chart.minPoints] placed points before the reflection opens (2)
  */
@@ -38,13 +49,15 @@ export function plotTool(config) {
   checkCommon(config);
   const { id, chart } = config;
   const plots = plotsOf(chart);
-  check(chart.plots ? !chart.axes : isAxes(chart.axes), id, 'give either axes or plots, not both');
+  const dims = (chart.dimensions ?? []).map((dim) => dim.id);
+  if (chart.dimensions) check(dims.length >= 2 && dims.length <= 3 && dims.every(isKey) && chart.dimensions.every((dim) => dim.label), id, 'dimensions are two or three, each with a key and a label');
+  check(chart.plots ? !chart.axes : isAxes(chart.axes, dims), id, 'give either axes or plots, not both');
   for (const plot of plots) {
     check(isKey(plot.id), id, `plot id ${plot.id} must be a lower-case key`);
-    check(isAxes(plot.axes), id, `plot ${plot.id} needs x and y axes with label, low and high`);
+    check(isAxes(plot.axes, dims), id, `plot ${plot.id} needs x and y axes with label (or dim), low and high`);
   }
   check(typeof chart.point === 'string' && chart.point, id, 'needs a point description');
-  if (chart.band) check(chart.band.label && [...chart.band.x, ...chart.band.y].every(isScale), id, 'band needs a label and 1–10 bounds');
+  if (chart.band) check(chart.band.label && (chart.band.diagonal ? chart.band.diagonal > 0 && chart.band.diagonal < 50 : [...(chart.band.x ?? []), ...(chart.band.y ?? [])].length === 4 && [...chart.band.x, ...chart.band.y].every(isScale)), id, 'band needs a label and 1–10 bounds, or a diagonal half-width under 50');
   const max = chart.max ?? 10;
   const minPoints = chart.minPoints ?? 2;
   const plotIds = plots.map((plot) => plot.id);
@@ -56,12 +69,18 @@ export function plotTool(config) {
     return nodesIn(run, 'point').filter((node) => !(isScale(at[node.id]?.x) && isScale(at[node.id]?.y)));
   };
   const ready = (run) => countSlots(run, 'point') >= minPoints && unplaced(run).length === 0;
+  const unnamed = (run) => dims.filter((dim) => !nodesIn(run, 'dimension').some((node) => node.tag === dim));
 
-  return baseTool(config, 'plot', { point: chart.point }, {
-    ...(many ? { nodeTags: { point: plotIds } } : {}),
+  return baseTool(config, 'plot', { ...(dims.length ? { dimension: 'One dimension to compare on, named by you' } : {}), point: chart.point }, {
+    nodeTags: { ...(many ? { point: plotIds } : {}), ...(dims.length ? { dimension: dims } : {}) },
+    validateNode(run, node) {
+      if (node.slot.startsWith('dimension') && !unnamed(run).includes(node.tag)) return 'That dimension already has a name; name another.';
+      return null;
+    },
     nextSlots(run) {
       const first = subjectFirst(run, subject);
       if (first) return first;
+      if (unnamed(run).length) return [nextIndexed(run, 'dimension', dims.length)];
       if (reflection && countSlots(run, 'reflection')) return [];
       return open(nextIndexed(run, 'point', max), reflection && ready(run) ? 'reflection' : null);
     },
diff --git a/packages/decision-book/families/quadrant.mjs b/packages/decision-book/families/quadrant.mjs
index 482504fd4..182bca343 100644
--- a/packages/decision-book/families/quadrant.mjs
+++ b/packages/decision-book/families/quadrant.mjs
@@ -16,6 +16,7 @@ import { FILLS, baseTool, check, checkCommon, framing, isKey, nodesIn, reflected
  * @param {number} [config.chart.max] entries in all (16)
  * @param {number} [config.chart.minItems] entries before the reflection opens (3)
  * @param {number} [config.chart.minCells] distinct cells used before the reflection opens (2)
+ * @param {string[]} [config.chart.taskCells] cells whose items can become real tasks
  */
 export function quadrantTool(config) {
   checkCommon(config);
@@ -35,6 +36,8 @@ export function quadrantTool(config) {
   const minItems = chart.minItems ?? 3;
   const minCells = chart.minCells ?? 2;
   const cellIds = chart.cells.map((cell) => cell.id);
+  const taskCells = chart.taskCells ?? [];
+  check(taskCells.every((cell) => cellIds.includes(cell)), id, 'taskCells name cells of this chart');
   const { subject, reflection } = framing(config);
 
   const ready = (run) => {
@@ -44,6 +47,7 @@ export function quadrantTool(config) {
 
   return baseTool(config, 'quadrant', { item: chart.item }, {
     nodeTags: { item: cellIds },
+    ...(taskCells.length ? { taskSlots: { item: (node) => taskCells.includes(node.tag) } } : {}),
     nextSlots(run) {
       const first = subjectFirst(run, subject);
       if (first) return first;
diff --git a/packages/decision-book/families/scales.mjs b/packages/decision-book/families/scales.mjs
index c1685b2cd..1e121566a 100644
--- a/packages/decision-book/families/scales.mjs
+++ b/packages/decision-book/families/scales.mjs
@@ -5,9 +5,11 @@
 //   axes    independent 1–10 scales, drawn as bars or as a radar.
 //   shares  parts of a whole; the values sum to 100.
 // Series are the overlays a model compares (now and wanted, two dates, four perspectives).
-// Notes (`note` slots) are optional, each tagged with the scale it is about.
-import { countSlots, nextIndexed, open } from '../../problem-solver/slots.mjs';
-import { baseTool, check, checkCommon, framing, isKey, reflected, subjectFirst } from './common.mjs';
+// Notes (`note` slots) are optional, each tagged with the scale it is about. With `named`, the
+// person names each scale first (`scale_name` slots, axes and shares only), as the team model
+// names the skills a team needs; the config's labels are then only placeholders.
+import { countSlots, nextIndexed, open, parseSlot } from '../../problem-solver/slots.mjs';
+import { baseTool, check, checkCommon, framing, isKey, nodesIn, reflected, subjectFirst } from './common.mjs';
 
 const MODES = Object.freeze(['pairs', 'axes', 'shares']);
 
@@ -18,6 +20,12 @@ export function valuesOf(run) {
   return out;
 }
 
+/** A scale's words for this run: the name the person gave it, or its configured label. */
+export function scaleLabel(run, scale) {
+  const named = run.nodes.find((node) => parseSlot(node.slot)?.name === 'scale_name' && node.tag === scale.id);
+  return named ? (named.title ?? named.text) : (scale.label ?? `${scale.low} or ${scale.high}`);
+}
+
 /**
  * @param {object} config
  * @param {object} config.chart
@@ -25,6 +33,7 @@ export function valuesOf(run) {
  * @param {{id: string, label?: string, low?: string, high?: string}[]} config.chart.scales pairs need low and high, others a label
  * @param {{id: string, label: string}[]} [config.chart.series] defaults to one series, now
  * @param {'bars'|'radar'} [config.chart.layout] axes mode only (bars)
+ * @param {{label: string}} [config.chart.named] the person names every scale before scoring
  */
 export function scalesTool(config) {
   checkCommon(config);
@@ -41,22 +50,30 @@ export function scalesTool(config) {
   for (const s of series) check(isKey(s.id) && s.label, id, `series ${s.id} needs a key and a label`);
   const scaleIds = chart.scales.map((scale) => scale.id);
   const seriesIds = series.map((s) => s.id);
+  if (chart.named) check(chart.mode !== 'pairs' && typeof chart.named.label === 'string', id, 'named scales need axes or shares mode and a label');
   const { subject, reflection } = framing(config);
 
   const missing = (run) => seriesIds.filter((s) => !valuesOf(run)[s]);
+  const unnamed = (run) => (chart.named ? scaleIds.filter((scale) => !nodesIn(run, 'scale_name').some((node) => node.tag === scale)) : []);
 
-  return baseTool(config, 'scales', { note: 'A note on one scale: why it sits where it does' }, {
-    nodeTags: { note: scaleIds },
+  return baseTool(config, 'scales', { ...(chart.named ? { scale_name: chart.named.label } : {}), note: 'A note on one scale: why it sits where it does' }, {
+    nodeTags: { note: scaleIds, ...(chart.named ? { scale_name: scaleIds } : {}) },
+    validateNode(run, node) {
+      if (node.slot.startsWith('scale_name') && !unnamed(run).includes(node.tag)) return 'That scale already has a name; name another.';
+      return null;
+    },
     nextSlots(run) {
       const first = subjectFirst(run, subject);
       if (first) return first;
+      if (unnamed(run).length) return [nextIndexed(run, 'scale_name', scaleIds.length)];
       if (reflection && countSlots(run, 'reflection')) return [];
       return open(nextIndexed(run, 'note', scaleIds.length * 2), reflection && !missing(run).length ? 'reflection' : null);
     },
     pickScores(payload) {
       return { series: payload?.series, values: payload?.values };
     },
-    validateScores(_run, { series: which, values }) {
+    validateScores(run, { series: which, values }) {
+      if (unnamed(run).length) return 'Name every scale before scoring.';
       if (!seriesIds.includes(which)) return `Score one of: ${seriesIds.join(', ')}.`;
       if (!values || scaleIds.some((scale) => !Number.isInteger(values[scale])) || Object.keys(values).length !== scaleIds.length) return 'Give a whole number for every scale.';
       const list = scaleIds.map((scale) => values[scale]);
@@ -67,6 +84,7 @@ export function scalesTool(config) {
     },
     awaiting(run) {
       const left = missing(run);
+      if (unnamed(run).length) return null;
       return left.length ? `The person scores ${left.map((s) => series.find((x) => x.id === s).label.toLowerCase()).join(' and ')} with the chart's controls; ask them to, and wait.` : null;
     },
     complete(run) {
````

- [ ] **Step 2: Apply the chart changes**

The plot chart takes its axis words from the person's dimension names, shows those names above the plots, and draws a diagonal band. The scales chart takes its labels from the person's scale names. The list chart draws an inverted column widest at the top.

````diff
diff --git a/packages/decision-book/decision-book.css b/packages/decision-book/decision-book.css
index 38c2b9270..8e390e31a 100644
--- a/packages/decision-book/decision-book.css
+++ b/packages/decision-book/decision-book.css
@@ -136,6 +136,10 @@
 .dm-plot__axis-label { font-weight: 700; color: var(--dm-ink); text-transform: uppercase; letter-spacing: 0.06em; }
 .dm-plot__field { position: relative; aspect-ratio: 1; max-width: 520px; width: 100%; border-left: 2px solid var(--dm-ink); border-bottom: 2px solid var(--dm-ink); background: var(--dm-paper); }
 .dm-plot__band { position: absolute; display: grid; place-items: start; padding: 4px 6px; border-radius: 10px; background: var(--dm-green-tint); font: 600 11px / 1.2 var(--font-ui); color: #3c7420; }
+.dm-plot__band--diagonal { left: 0; bottom: 0; width: 100%; height: 100%; place-items: center; }
+/* Names the person gave (plot dimensions, team skills) sit above the chart they label. */
+.dm-plot__dims, .dm-scales__names { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 10px; border: 1px solid var(--dm-line); border-radius: 14px; }
+.dm-plot__dims .dm-chart__slot-label, .dm-scales__names .dm-chart__slot-label { flex-basis: 100%; }
 /* A point near an edge hangs inward (--dm-shift), so its pill never leaves the field. */
 .dm-plot__field .dm-entry { position: absolute; max-width: 60%; transform: translate(var(--dm-shift, -50%), 50%); }
 .dm-plot__field .dm-entry__pill { padding: calc(4px + var(--dm-size, 4) * 0.6px) 10px; }
diff --git a/packages/decision-book/render/list.ts b/packages/decision-book/render/list.ts
index 3ce9f6de6..42f8bbc61 100644
--- a/packages/decision-book/render/list.ts
+++ b/packages/decision-book/render/list.ts
@@ -4,7 +4,8 @@
 //   checklist  rows in order, a tick and "Done" once a criterion has an entry;
 //   rows       full-width rows; lanes  columns side by side;
 //   routes     blocks around a centre disc, joined to it by dotted lines;
-//   pyramid    levels from the base up, each narrower than the one below, one pyramid per column;
+//   pyramid    levels from the base up, each narrower than the one below, one pyramid per column
+//              (an `inverted` column is drawn widest at the top);
 //   roles      a card grid.
 // Groups with a `column` are drawn in one stack per column, headed by the column's name.
 // Phone: everything becomes one column of labelled blocks; a pyramid keeps its narrowing.
@@ -15,6 +16,7 @@ export type ListChart = {
   layout: 'checklist' | 'rows' | 'lanes' | 'routes' | 'pyramid' | 'roles';
   groups: { id: string; label: string; prompt?: string; column?: string }[];
   entry: string;
+  inverted?: string[];
 };
 
 const FILL_CYCLE: Fill[] = ['green', 'red', 'tint'];
@@ -56,7 +58,9 @@ export function createListView(tool: ChartTool & { chart: ListChart }, doc: Docu
             block.setAttribute('role', 'group');
             block.setAttribute('aria-label', group.label);
             block.setAttribute('data-group', group.id);
-            block.style.setProperty('--dm-level', String(level));
+            // An inverted pyramid keeps its levels in order but is widest at the top.
+            const width = chart.inverted?.includes(columnKey) ? members.length - 1 - level : level;
+            block.style.setProperty('--dm-level', String(width));
             block.style.setProperty('--dm-levels', String(members.length));
             const head = el(doc, 'div', 'dm-list__head');
             head.setAttribute('aria-hidden', 'true');
diff --git a/packages/decision-book/render/plot.ts b/packages/decision-book/render/plot.ts
index e60af4ca9..de133fb35 100644
--- a/packages/decision-book/render/plot.ts
+++ b/packages/decision-book/render/plot.ts
@@ -1,21 +1,25 @@
 // packages/decision-book/render/plot.ts
 // The plot family's chart: one square field per plot (two qualitative axes, low at the bottom
-// left), an optional shaded band, and each point as a pill at its place. A point not yet
-// placed waits in a tray under the field. The person places points with the form under the
-// chart: per point, a 1–10 select for each axis (and size), then Place, which sends a score
-// snapshot. Phone: the field keeps its square (pills shrink to dots with the name in the key);
-// the key lists every point with its position in words.
-import { positionsOf } from '../families/plot.mjs';
-import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setText, slotIndex, slotName } from './core';
+// left), an optional shaded band (a rectangle, or a diagonal channel), and each point as a pill
+// at its place. A point not yet placed waits in a tray under the field. The person places
+// points with the form under the chart: per point, a 1–10 select for each axis (and size),
+// then Place, which sends a score snapshot. When the axes are dimensions the person names, the
+// names they gave sit above the plots and every axis, key line and select uses them.
+// Phone: the field keeps its square (pills shrink to dots with the name in the key); the key
+// lists every point with its position in words.
+import { axisLabel, positionsOf } from '../families/plot.mjs';
+import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setAttr, setText, slotIndex, slotName } from './core';
 import type { ChartTool } from './quadrant';
 
-type Axes = { x: { label: string; low: string; high: string }; y: { label: string; low: string; high: string } };
+type Axis = { label?: string; dim?: string; low: string; high: string };
+type Axes = { x: Axis; y: Axis };
 export type PlotChart = {
   axes?: Axes;
   plots?: { id: string; label: string; axes: Axes }[];
   point: string;
   size?: { label: string };
-  band?: { label: string; x: [number, number]; y: [number, number] };
+  band?: { label: string; x?: [number, number]; y?: [number, number]; diagonal?: number };
+  dimensions?: { id: string; label: string }[];
 };
 type Place = { x?: number; y?: number; size?: number };
 
@@ -23,16 +27,21 @@ type Place = { x?: number; y?: number; size?: number };
 export const pct = (value: number): number => 5 + ((value - 1) / 9) * 90;
 /** How far a pill shifts left of its point: none near the left edge, all of it near the right. */
 export const shift = (x: number): string => (x <= 3 ? '0%' : x >= 8 ? '-100%' : '-50%');
+/** The clip path of a channel `d` percent either side of the rising diagonal. */
+export const diagonalBand = (d: number): string => `polygon(0% ${100 - d}%, 0% 100%, ${d}% 100%, 100% ${d}%, 100% 0%, ${100 - d}% 0%)`;
 
 export function createPlotView(tool: ChartTool & { chart: PlotChart }, doc: Document = document): ChartView {
   const { chart } = tool;
   const plots = chart.plots ?? [{ id: 'main', label: '', axes: chart.axes! }];
-  const fields = new Map<string, { field: HTMLDivElement; tray: HTMLDivElement }>();
+  const fields = new Map<string, { field: HTMLDivElement; tray: HTMLDivElement; xLabel: HTMLSpanElement; yLabel: HTMLSpanElement }>();
   const key = el(doc, 'ol', 'dm-plot__key');
   const form = el(doc, 'form', 'dm-plot__form');
-  const rows = new Map<string, { row: HTMLFieldSetElement; name: HTMLLegendElement; selects: Record<string, HTMLSelectElement> }>();
+  const dims = el(doc, 'div', 'dm-plot__dims');
+  const rows = new Map<string, { row: HTMLFieldSetElement; name: HTMLLegendElement; selects: Record<string, HTMLSelectElement>; labels: Record<string, HTMLSpanElement> }>();
   let emit: (payload: Record<string, unknown>) => void = () => {};
   let formHead: HTMLParagraphElement | null = null;
+  let current: DmToolRun | null = null;
+  const words = (axis: Axis): string => (current ? axisLabel(current, axis) : axis.label ?? '');
 
   function select(label: string, value: number | undefined): HTMLLabelElement {
     const wrap = el(doc, 'label', 'dm-plot__pick');
@@ -55,12 +64,13 @@ export function createPlotView(tool: ChartTool & { chart: PlotChart }, doc: Docu
       if (!row) {
         const fieldset = el(doc, 'fieldset', 'dm-plot__row');
         const name = el(doc, 'legend', 'dm-plot__row-name');
-        const x = select(point.plot.axes.x.label, at[point.id]?.x);
-        const y = select(point.plot.axes.y.label, at[point.id]?.y);
+        const x = select(words(point.plot.axes.x), at[point.id]?.x);
+        const y = select(words(point.plot.axes.y), at[point.id]?.y);
         const size = chart.size ? select(chart.size.label, at[point.id]?.size) : null;
         const go = el(doc, 'button', 'dm-plot__place', 'Place');
         go.type = 'button';
         const selects: Record<string, HTMLSelectElement> = { x: x.querySelector('select')!, y: y.querySelector('select')! };
+        const labels: Record<string, HTMLSpanElement> = { x: x.querySelector('span')!, y: y.querySelector('span')! };
         if (size) selects.size = size.querySelector('select')!;
         go.addEventListener('click', () => {
           const place: Place = {};
@@ -69,10 +79,12 @@ export function createPlotView(tool: ChartTool & { chart: PlotChart }, doc: Docu
         });
         fieldset.append(name, x, y, ...(size ? [size] : []), go);
         form.append(fieldset);
-        row = { row: fieldset, name, selects };
+        row = { row: fieldset, name, selects, labels };
         rows.set(point.id, row);
       }
       setText(row.name, point.title);
+      setText(row.labels.x, words(point.plot.axes.x));
+      setText(row.labels.y, words(point.plot.axes.y));
       for (const [axis, input] of Object.entries(row.selects)) {
         const value = at[point.id]?.[axis as keyof Place];
         if (value && doc.activeElement !== input) input.value = String(value);
@@ -88,38 +100,57 @@ export function createPlotView(tool: ChartTool & { chart: PlotChart }, doc: Docu
     reflection: tool.slots.reflection ?? null,
     draw(run: DmToolRun, ctx): EntrySpec[] {
       emit = ctx.emitScore;
+      current = run;
       if (!fields.size) {
+        if (chart.dimensions) {
+          dims.setAttribute('role', 'group');
+          dims.setAttribute('aria-label', 'Dimensions you named');
+          dims.append(el(doc, 'span', 'dm-chart__slot-label', 'Dimensions you named'));
+          ctx.frame.append(dims);
+        }
         for (const plot of plots) {
           const wrap = el(doc, 'div', 'dm-plot__plot');
           if (plot.label) wrap.append(el(doc, 'h3', 'dm-plot__title', plot.label));
           const body = el(doc, 'div', 'dm-plot__body');
           const y = el(doc, 'div', 'dm-plot__y');
           y.setAttribute('aria-hidden', 'true');
-          y.append(el(doc, 'span', '', plot.axes.y.high), el(doc, 'span', 'dm-plot__axis-label', plot.axes.y.label), el(doc, 'span', '', plot.axes.y.low));
+          const yLabel = el(doc, 'span', 'dm-plot__axis-label');
+          y.append(el(doc, 'span', '', plot.axes.y.high), yLabel, el(doc, 'span', '', plot.axes.y.low));
           const field = el(doc, 'div', 'dm-plot__field');
           field.setAttribute('role', 'group');
-          field.setAttribute('aria-label', `${plot.label ? `${plot.label}: ` : ''}${plot.axes.x.label} across, ${plot.axes.y.label} up`);
           if (chart.band) {
             const band = el(doc, 'div', 'dm-plot__band', chart.band.label);
-            band.style.left = `${pct(chart.band.x[0])}%`;
-            band.style.width = `${pct(chart.band.x[1]) - pct(chart.band.x[0])}%`;
-            band.style.bottom = `${pct(chart.band.y[0])}%`;
-            band.style.height = `${pct(chart.band.y[1]) - pct(chart.band.y[0])}%`;
+            if (chart.band.diagonal) {
+              band.classList.add('dm-plot__band--diagonal');
+              band.style.clipPath = diagonalBand(chart.band.diagonal);
+            } else {
+              band.style.left = `${pct(chart.band.x![0])}%`;
+              band.style.width = `${pct(chart.band.x![1]) - pct(chart.band.x![0])}%`;
+              band.style.bottom = `${pct(chart.band.y![0])}%`;
+              band.style.height = `${pct(chart.band.y![1]) - pct(chart.band.y![0])}%`;
+            }
             field.append(band);
           }
           const x = el(doc, 'div', 'dm-plot__x');
           x.setAttribute('aria-hidden', 'true');
-          x.append(el(doc, 'span', '', plot.axes.x.low), el(doc, 'span', 'dm-plot__axis-label', plot.axes.x.label), el(doc, 'span', '', plot.axes.x.high));
+          const xLabel = el(doc, 'span', 'dm-plot__axis-label');
+          x.append(el(doc, 'span', '', plot.axes.x.low), xLabel, el(doc, 'span', '', plot.axes.x.high));
           body.append(y, field, x);
           const tray = el(doc, 'div', 'dm-plot__tray');
           tray.setAttribute('data-label', 'Not placed yet');
           wrap.append(body, tray);
           ctx.frame.append(wrap);
-          fields.set(plot.id, { field, tray });
+          fields.set(plot.id, { field, tray, xLabel, yLabel });
         }
         formHead = el(doc, 'p', 'dm-plot__form-head', 'Place each point: choose where it sits on each axis, then Place.');
         ctx.frame.append(key, formHead, form);
       }
+      for (const plot of plots) {
+        const { field, xLabel, yLabel } = fields.get(plot.id)!;
+        setText(xLabel, words(plot.axes.x));
+        setText(yLabel, words(plot.axes.y));
+        setAttr(field, 'aria-label', `${plot.label ? `${plot.label}: ` : ''}${words(plot.axes.x)} across, ${words(plot.axes.y)} up`);
+      }
       const at = positionsOf(run) as Record<string, Place>;
       const points = run.nodes.filter((node) => slotName(node) === 'point');
       const plotOf = (tag: string | undefined) => plots.find((p) => p.id === tag) ?? plots[0];
@@ -128,10 +159,13 @@ export function createPlotView(tool: ChartTool & { chart: PlotChart }, doc: Docu
       key.replaceChildren(...points.map((node) => {
         const place = at[node.id];
         const plot = plotOf(node.tag);
-        const words = place?.x && place?.y ? `${plot.axes.x.label} ${place.x}, ${plot.axes.y.label} ${place.y}${place.size ? `, ${chart.size!.label.toLowerCase()} ${place.size}` : ''}` : 'not placed yet';
-        return el(doc, 'li', 'dm-plot__key-item', `${node.title ?? node.text}: ${words}`);
+        const line = place?.x && place?.y ? `${words(plot.axes.x)} ${place.x}, ${words(plot.axes.y)} ${place.y}${place.size ? `, ${chart.size!.label.toLowerCase()} ${place.size}` : ''}` : 'not placed yet';
+        return el(doc, 'li', 'dm-plot__key-item', `${node.title ?? node.text}: ${line}`);
       }));
-      return points.map((node) => {
+      const named: EntrySpec[] = run.nodes
+        .filter((node) => slotName(node) === 'dimension')
+        .map((node) => ({ node, host: dims, fill: 'ink', label: `Dimension ${chart.dimensions?.find((d) => d.id === node.tag)?.label ?? slotIndex(node)}` }));
+      return [...named, ...points.map((node): EntrySpec => {
         const place = at[node.id];
         const plot = plotOf(node.tag);
         const { field, tray } = fields.get(plot.id)!;
@@ -140,10 +174,10 @@ export function createPlotView(tool: ChartTool & { chart: PlotChart }, doc: Docu
           node,
           host: placed ? field : tray,
           fill: placed ? 'green' : 'tint',
-          label: `Point ${slotIndex(node)}${placed ? ` at ${plot.axes.x.label} ${place!.x}, ${plot.axes.y.label} ${place!.y}` : ', not placed'}`,
+          label: `Point ${slotIndex(node)}${placed ? ` at ${words(plot.axes.x)} ${place!.x}, ${words(plot.axes.y)} ${place!.y}` : ', not placed'}`,
           style: placed ? { left: `${pct(place!.x!)}%`, bottom: `${pct(place!.y!)}%`, '--dm-size': String(place!.size ?? 4), '--dm-shift': shift(place!.x!) } : { left: '', bottom: '', '--dm-size': '', '--dm-shift': '' }
         };
-      });
+      })];
     }
   }, doc);
 }
diff --git a/packages/decision-book/render/scales.ts b/packages/decision-book/render/scales.ts
index afa75d4c6..a0d38c46d 100644
--- a/packages/decision-book/render/scales.ts
+++ b/packages/decision-book/render/scales.ts
@@ -6,17 +6,19 @@
 //   axes    a bar per series along a 1–10 track, or (layout radar) a polygon per series;
 //   shares  one bar per series cut into its parts of 100.
 // Notes sit under the scale they are about. Under the chart, a form per series scores every
-// scale and sends one snapshot (Save). Phone: rows stack, poles above their bar; a radar
-// becomes bars.
-import { valuesOf } from '../families/scales.mjs';
-import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setText, slotIndex, slotName, svg } from './core';
+// scale and sends one snapshot (Save). With `named` scales the person's names replace the
+// placeholder labels everywhere and sit above the rows. Phone: rows stack, poles above their
+// bar; a radar becomes bars.
+import { scaleLabel, valuesOf } from '../families/scales.mjs';
+import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setAttr, setText, slotIndex, slotName, svg } from './core';
 import type { ChartTool } from './quadrant';
 
 type Scale = { id: string; label?: string; low?: string; high?: string };
-export type ScalesChart = { mode: 'pairs' | 'axes' | 'shares'; scales: Scale[]; series?: { id: string; label: string }[]; layout?: 'bars' | 'radar' };
+export type ScalesChart = { mode: 'pairs' | 'axes' | 'shares'; scales: Scale[]; series?: { id: string; label: string }[]; layout?: 'bars' | 'radar'; named?: { label: string } };
 
 const STYLES = ['solid', 'outline', 'dotted'];
-const scaleName = (scale: Scale): string => scale.label ?? `${scale.low} or ${scale.high}`;
+/** The words a scale's form field shows, from its current name. */
+const fieldWords = (mode: ScalesChart['mode'], scale: Scale, name: string): string => (mode === 'pairs' ? `${scale.low} (0–10; ${scale.high} gets the rest)` : mode === 'shares' ? `${name} (% of 100)` : `${name} (1–10)`);
 
 /** The radar polygon's points for values on 1–10 axes, in a 100×100 box. */
 export function radarPoints(values: number[]): string {
@@ -36,6 +38,7 @@ export function createScalesView(tool: ChartTool & { chart: ScalesChart }, doc:
   let radarSvg: SVGSVGElement | null = null;
   const polygons = new Map<string, SVGPolygonElement>();
   const form = el(doc, 'form', 'dm-scales__form');
+  const names = el(doc, 'div', 'dm-scales__names');
   const inputs = new Map<string, Map<string, HTMLInputElement>>();
   const totals = new Map<string, HTMLSpanElement>();
   let emit: (payload: Record<string, unknown>) => void = () => {};
@@ -47,8 +50,9 @@ export function createScalesView(tool: ChartTool & { chart: ScalesChart }, doc:
       const map = new Map<string, HTMLInputElement>();
       for (const scale of chart.scales) {
         const label = el(doc, 'label', 'dm-scales__field');
-        const words = chart.mode === 'pairs' ? `${scale.low} (0–10; ${scale.high} gets the rest)` : chart.mode === 'shares' ? `${scale.label} (% of 100)` : `${scale.label} (1–10)`;
-        label.append(el(doc, 'span', 'dm-scales__field-label', words));
+        const words = el(doc, 'span', 'dm-scales__field-label', fieldWords(chart.mode, scale, scale.label ?? ''));
+        words.setAttribute('data-field-for', scale.id);
+        label.append(words);
         const input = el(doc, 'input', 'dm-scales__input');
         input.type = 'number';
         input.min = chart.mode === 'axes' ? '1' : '0';
@@ -101,6 +105,7 @@ export function createScalesView(tool: ChartTool & { chart: ScalesChart }, doc:
       chart.scales.forEach((scale, i) => {
         const angle = -Math.PI / 2 + (i * 2 * Math.PI) / chart.scales.length;
         const label = el(doc, 'span', 'dm-scales__radar-label', scale.label!);
+        label.setAttribute('data-label-for', scale.id);
         label.style.left = `${(50 + 49 * Math.cos(angle)).toFixed(1)}%`;
         label.style.top = `${(50 + 49 * Math.sin(angle)).toFixed(1)}%`;
         wrap.append(label);
@@ -125,11 +130,15 @@ export function createScalesView(tool: ChartTool & { chart: ScalesChart }, doc:
     for (const scale of chart.scales) {
       const row = el(doc, 'div', 'dm-scales__row');
       row.setAttribute('role', 'group');
-      row.setAttribute('aria-label', scaleName(scale));
+      row.setAttribute('aria-label', scale.label ?? `${scale.low} or ${scale.high}`);
       row.setAttribute('data-scale', scale.id);
       const track = el(doc, 'div', 'dm-scales__track');
       if (chart.mode === 'pairs') row.append(el(doc, 'span', 'dm-scales__pole dm-scales__pole--low', scale.low!), track, el(doc, 'span', 'dm-scales__pole dm-scales__pole--high', scale.high!));
-      else row.append(el(doc, 'span', 'dm-scales__row-label', scale.label!), track);
+      else {
+        const name = el(doc, 'span', 'dm-scales__row-label', scale.label!);
+        name.setAttribute('data-label-for', scale.id);
+        row.append(name, track);
+      }
       const notes = el(doc, 'div', 'dm-scales__notes');
       row.append(notes);
       if (chart.mode === 'shares') track.hidden = true;
@@ -147,9 +156,21 @@ export function createScalesView(tool: ChartTool & { chart: ScalesChart }, doc:
     draw(run: DmToolRun, ctx): EntrySpec[] {
       emit = ctx.emitScore;
       if (!rows.size) {
+        if (chart.named) {
+          names.setAttribute('role', 'group');
+          names.setAttribute('aria-label', 'Scales you named');
+          names.append(el(doc, 'span', 'dm-chart__slot-label', 'Scales you named'));
+          ctx.frame.append(names);
+        }
         buildRows(ctx.frame);
         buildForm();
       }
+      const name = (scale: Scale): string => scaleLabel(run, scale);
+      for (const scale of chart.scales) {
+        for (const span of ctx.frame.querySelectorAll(`[data-label-for="${scale.id}"]`)) setText(span, name(scale));
+        for (const span of ctx.frame.querySelectorAll(`[data-field-for="${scale.id}"]`)) setText(span, fieldWords(chart.mode, scale, name(scale)));
+        setAttr(ctx.frame.querySelector(`.dm-scales__row[data-scale="${scale.id}"]`)!, 'aria-label', name(scale));
+      }
       const values = valuesOf(run) as Record<string, Record<string, number>>;
       for (const scale of chart.scales) {
         if (chart.mode === 'shares') break;
@@ -170,11 +191,11 @@ export function createScalesView(tool: ChartTool & { chart: ScalesChart }, doc:
         if (radar) polygons.get(s.id)!.setAttribute('points', values[s.id] ? radarPoints(chart.scales.map((scale) => values[s.id][scale.id])) : '');
         const bar = bars.get(s.id);
         if (bar) {
-          const words = values[s.id] ? chart.scales.map((scale) => `${scale.label} ${values[s.id][scale.id]}%`).join(', ') : 'not scored yet';
+          const words = values[s.id] ? chart.scales.map((scale) => `${name(scale)} ${values[s.id][scale.id]}%`).join(', ') : 'not scored yet';
           if (bar.title !== words) {
             bar.title = words;
             bar.replaceChildren(...(values[s.id] ? chart.scales.map((scale, j) => {
-              const part = el(doc, 'span', 'dm-scales__part', `${scale.label} ${values[s.id][scale.id]}%`);
+              const part = el(doc, 'span', 'dm-scales__part', `${name(scale)} ${values[s.id][scale.id]}%`);
               part.style.width = `${values[s.id][scale.id]}%`;
               part.setAttribute('data-part', String(j % 3));
               return part;
@@ -183,12 +204,15 @@ export function createScalesView(tool: ChartTool & { chart: ScalesChart }, doc:
         }
         for (const [scaleId, input] of inputs.get(s.id)!) if (values[s.id] && doc.activeElement !== input) input.value = String(values[s.id][scaleId]);
       }
-      return run.nodes
+      const named: EntrySpec[] = run.nodes
+        .filter((node) => slotName(node) === 'scale_name' && rows.has(node.tag ?? ''))
+        .map((node) => ({ node, host: names, fill: 'ink', label: `Name of scale ${chart.scales.findIndex((scale) => scale.id === node.tag) + 1}`, order: chart.scales.findIndex((scale) => scale.id === node.tag) }));
+      return [...named, ...run.nodes
         .filter((node) => slotName(node) === 'note' && rows.has(node.tag ?? ''))
-        .map((node) => {
+        .map((node): EntrySpec => {
           const scale = chart.scales.find((s) => s.id === node.tag)!;
-          return { node, host: rows.get(scale.id)!.notes, fill: 'tint', label: `Note ${slotIndex(node)} on ${scaleName(scale)}` };
-        });
+          return { node, host: rows.get(scale.id)!.notes, fill: 'tint', label: `Note ${slotIndex(node)} on ${name(scale)}` };
+        })];
     }
   }, doc);
 }
````

- [ ] **Step 3: Give the two one-off lenses their coaching fields**

````diff
diff --git a/packages/decision-book/tools/black-box.mjs b/packages/decision-book/tools/black-box.mjs
index 198b49a95..59cb67e33 100644
--- a/packages/decision-book/tools/black-box.mjs
+++ b/packages/decision-book/tools/black-box.mjs
@@ -15,6 +15,8 @@ export const dmBlackBox = baseTool({
     { id: 'ends', title: 'What goes in, what comes out', prompt: 'List what you put in and what you see come out.' },
     { id: 'inside', title: 'The hidden part', prompt: 'What happens inside that you cannot see?' }
   ],
+  exercise: 'Name one system you rely on without understanding, and one way to check its outputs.',
+  pairsWell: ['dm_rumsfeld', 'dm_future'],
   chart: { reflection: 'Whether you need to open the box to decide' }
 }, 'oneoff', {
   input: 'Something that goes in',
diff --git a/packages/decision-book/tools/outside-box.mjs b/packages/decision-book/tools/outside-box.mjs
index 6d1938850..01f8ba795 100644
--- a/packages/decision-book/tools/outside-box.mjs
+++ b/packages/decision-book/tools/outside-box.mjs
@@ -16,6 +16,8 @@ export const dmOutsideBox = baseTool({
     { id: 'attempt', title: 'Try the puzzle', prompt: 'Join the nine dots with four straight lines without lifting the pen.' },
     { id: 'assumption', title: 'Name your box', prompt: 'Which limit around this decision have you assumed rather than checked?' }
   ],
+  exercise: 'Try the puzzle before asking for the answer, then list two limits you have never checked.',
+  pairsWell: ['dm_gap_in_market', 'dm_crossroads'],
   chart: { reflection: 'What changes if that limit is not real' }
 }, 'oneoff', {
   attempt: 'How you would join the dots, or where you got stuck',
````

- [ ] **Step 4: Check nothing in Plan 2 moved**

Run: `node --test tests/unit/decision-book-families.test.js tests/unit/decision-book-css.test.js && (cd apps/tasks && npx vitest run tests/unit/decision-book)`
Expected: PASS: 17 and 5 node tests, then 205 vitest tests. The new options are tested through the real models in Task 6.

- [ ] **Step 5: Commit**

```bash
git add packages/decision-book/families packages/decision-book/render packages/decision-book/decision-book.css packages/decision-book/tools
git commit -m "Decision Maker: named dimensions and scales, diagonal band, task cells, rounds and inverted pyramids

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Section 1, How to improve yourself

**Files:**
- Create: `packages/decision-book/models/section-1.mjs`

- [ ] **Step 1: Write the section's models**

````js
// packages/decision-book/models/section-1.mjs
// How to improve yourself (pp.10–49): the section's own models as tools. Chart structure follows
// the kit's "logic" lines (tested in decision-book-models.test.js); every word of coaching is
// our own. SWOT and morphological analysis are Problem Solver's tools, reused as they are;
// thinking outside the box is a bespoke tool (tools/outside-box.mjs).
import { curveTool, pathTool, plotTool, quadrantTool, tensionTool, listTool } from '../families/index.mjs';

const step = (id, title, prompt) => ({ id, title, prompt });

export const dmEisenhower = quadrantTool({
  id: 'dm_eisenhower',
  name: 'The Eisenhower matrix',
  when: 'Too many demands at once: sort them by how important and how urgent each really is, so the important ones stop losing to the merely urgent.',
  failureModes: [
    'Calling everything urgent and important.',
    'Treating urgency as importance: a ringing phone is urgent, rarely important.',
    'Never putting anything in Delegate or Do later.'
  ],
  steps: [
    step('list', 'List what is competing', 'Everything asking for time on this decision, one demand at a time.'),
    step('sort', 'Place each one', 'Important rises upwards, urgent rises to the right. Important but not urgent: decide when. Both: do immediately. Neither: do later. Urgent but not important: delegate.'),
    step('act', 'Act on the top right', 'The do-immediately items can become tasks now; give the decide-when items a date.')
  ],
  exercise: 'Sort this week’s list, then ask which of the decide-when items you have been putting off longest.',
  pairsWell: ['dm_project_portfolio', 'dm_stop_rule'],
  chart: {
    axes: { x: { label: 'Urgency', low: 'Not urgent', high: 'Urgent' }, y: { label: 'Importance', low: 'Not important', high: 'Important' } },
    cells: [
      { id: 'decide_when', label: 'Decide when', col: 0, row: 0, fill: 'green' },
      { id: 'do_now', label: 'Do immediately', col: 1, row: 0, fill: 'red' },
      { id: 'do_later', label: 'Do later', col: 0, row: 1, fill: 'tint' },
      { id: 'delegate', label: 'Delegate', col: 1, row: 1, fill: 'ink' }
    ],
    item: 'A demand on your time, placed by importance and urgency',
    taskCells: ['do_now']
  }
});

export const dmBcgBox = quadrantTool({
  id: 'dm_bcg_box',
  name: 'The BCG box',
  when: 'You have several products, projects or activities and must decide where to invest, what to keep and what to let go: sort them by growth and share.',
  failureModes: [
    'Keeping dogs out of loyalty.',
    'Starving the question marks that could become stars.',
    'Placing items by hope rather than by what you can see of growth and share.'
  ],
  steps: [
    step('list', 'List the portfolio', 'Each product, project or activity you are weighing.'),
    step('place', 'Place each one', 'Share rises to the right, growth rises upwards. Top left: question marks. Top right: stars. Bottom left: dogs. Bottom right: cash cows.'),
    step('decide', 'Decide per box', 'Invest in stars, choose among question marks, use cash cows to fund them, and say what you will stop.')
  ],
  exercise: 'Place everything you spend time on, then name one dog you will stop feeding.',
  pairsWell: ['dm_project_portfolio', 'pareto'],
  chart: {
    axes: { x: { label: 'Relative market share', low: 'Low share', high: 'High share' }, y: { label: 'Market growth', low: 'Low growth', high: 'High growth' } },
    cells: [
      { id: 'question_marks', label: 'Question marks', col: 0, row: 0, fill: 'tint' },
      { id: 'stars', label: 'Stars', col: 1, row: 0, fill: 'green' },
      { id: 'dogs', label: 'Dogs', col: 0, row: 1, fill: 'ink' },
      { id: 'cash_cows', label: 'Cash cows', col: 1, row: 1, fill: 'red' }
    ],
    item: 'A product, project or activity, placed by growth and share'
  }
});

export const dmProjectPortfolio = plotTool({
  id: 'dm_project_portfolio',
  name: 'The project portfolio matrix',
  when: 'You are juggling several projects at once: place them by cost and time, and by what they teach you and how far they serve your main aim.',
  failureModes: [
    'Merging the two views into one chart: cost and time is one picture, aim and learning another.',
    'Counting only money as cost, not energy, people and stress.',
    'Keeping projects that teach nothing and serve no aim.'
  ],
  steps: [
    step('list', 'Name the projects', 'Work and private, one at a time.'),
    step('cost_time', 'Cost and time', 'Is each one on budget and on time? Size shows how big it is.'),
    step('aim_learning', 'Aim and learning', 'How much does each move your main aim, and how much are you learning from it?'),
    step('decide', 'Read the views', 'Drop what teaches nothing and serves no aim; hand on what serves the aim but teaches nothing; reshape what teaches but drifts from the aim.')
  ],
  exercise: 'Place every current project in both views, then decide one to drop, one to hand on and one to reshape.',
  pairsWell: ['dm_eisenhower', 'dm_bcg_box'],
  chart: {
    plots: [
      { id: 'cost_time', label: 'Cost and time', axes: { x: { label: 'Time', low: 'Early', high: 'Late' }, y: { label: 'Cost', low: 'Underspent', high: 'Overspent' } } },
      { id: 'aim_learning', label: 'Aim and learning', axes: { x: { label: 'Main aim served', low: 'Little', high: 'Fully' }, y: { label: 'Amount learned', low: 'Nothing new', high: 'A great deal' } } }
    ],
    point: 'A project, placed in one of the two views',
    size: { label: 'Size of the project' }
  }
});

export const dmFeedbackAnalysis = tensionTool({
  id: 'dm_feedback_analysis',
  name: 'The feedback analysis',
  when: 'You want to learn how good your judgement is: write down what you expect before you act, and compare it with what happens.',
  failureModes: [
    'Writing the expectation after the result is known.',
    'Explaining every gap away as bad luck.',
    'Giving the result more weight than the expectation.'
  ],
  steps: [
    step('expect', 'Write the expectation now', 'Before acting: what do you expect to happen, and by when?'),
    step('actual', 'Record what happened', 'Later: what actually happened?'),
    step('learn', 'Learn from the gap', 'Where did they differ, what does that say about how you judge, and what will you do next?')
  ],
  exercise: 'Before your next important decision, write one sentence on what you expect; read it again in three months.',
  pairsWell: ['dm_stop_rule', 'double_loop'],
  chart: {
    variant: 'gap',
    centre: 'The decision or action',
    sides: [
      { id: 'expected', label: 'What I expected (written before acting)', fill: 'green' },
      { id: 'actual', label: 'What actually happened', fill: 'red' }
    ],
    gap: 'The difference',
    reflection: 'What you learned, and what you will do next'
  }
});

export const dmWhitmore = listTool({
  id: 'dm_whitmore',
  name: 'The John Whitmore model',
  when: 'A goal feels vague or half-hearted: test it against fourteen criteria so it becomes something you can act on and want to.',
  failureModes: [
    'Ticking criteria without evidence.',
    'A goal that is measurable but not wanted.',
    'Dropping the harder criteria: ethical, legal, environmentally sound, agreed.'
  ],
  steps: [
    step('goal', 'State the goal', 'Say the goal the way you would tell someone.'),
    step('smart', 'SMART', 'Specific, measurable, attainable, realistic, time-phased: evidence for each.'),
    step('pure', 'PURE', 'Positively stated, understood, relevant, ethical.'),
    step('clear', 'CLEAR', 'Challenging, legal, environmentally sound, agreed, recorded.')
  ],
  exercise: 'Run one goal you have been putting off through all fourteen; rewrite it where it fails.',
  pairsWell: ['dm_stop_rule', 'dm_feedback_analysis'],
  chart: {
    layout: 'checklist',
    subject: 'The goal, as you would state it',
    groups: [
      { id: 'specific', label: 'Specific', prompt: 'SMART' },
      { id: 'measurable', label: 'Measurable', prompt: 'SMART' },
      { id: 'attainable', label: 'Attainable', prompt: 'SMART' },
      { id: 'realistic', label: 'Realistic', prompt: 'SMART' },
      { id: 'time_phased', label: 'Time-phased', prompt: 'SMART' },
      { id: 'positive', label: 'Positively stated', prompt: 'PURE' },
      { id: 'understood', label: 'Understood', prompt: 'PURE' },
      { id: 'relevant', label: 'Relevant', prompt: 'PURE' },
      { id: 'ethical', label: 'Ethical', prompt: 'PURE' },
      { id: 'challenging', label: 'Challenging', prompt: 'CLEAR' },
      { id: 'legal', label: 'Legal', prompt: 'CLEAR' },
      { id: 'environmentally_sound', label: 'Environmentally sound', prompt: 'CLEAR' },
      { id: 'agreed', label: 'Agreed', prompt: 'CLEAR' },
      { id: 'recorded', label: 'Recorded', prompt: 'CLEAR' }
    ],
    entry: 'Evidence that the goal meets one criterion',
    perGroup: 2,
    minGroups: 14,
    minEntries: 14,
    reflection: 'The goal, rewritten where it fell short'
  }
});

export const dmRubberBand = tensionTool({
  id: 'dm_rubber_band',
  name: 'The rubber band model',
  when: 'You feel pulled two ways about staying or going: lay out what holds you where you are and what pulls you elsewhere.',
  failureModes: [
    'Weighing the forces with numbers the book does not give.',
    'Listing only one side.',
    'Mistaking fear of change for something that holds you.'
  ],
  steps: [
    step('situation', 'Where you stand', 'Name the situation you might stay in or leave.'),
    step('holds', 'What holds you', 'What keeps you here?'),
    step('pulls', 'What pulls you', 'What draws you away?'),
    step('reflect', 'Read the band', 'Which pulls are about what you want, and which holds are only habit?')
  ],
  exercise: 'Write three of each, then cross out any you would not say aloud to a friend.',
  pairsWell: ['dm_crossroads', 'dm_hard_choice'],
  chart: {
    variant: 'pull',
    centre: 'Where you stand now',
    sides: [
      { id: 'holds', label: 'What holds you', fill: 'red' },
      { id: 'pulls', label: 'What pulls you', fill: 'green' }
    ]
  }
});

export const dmFeedbackBox = quadrantTool({
  id: 'dm_feedback_box',
  name: 'The feedback box',
  when: 'You are giving or taking feedback: sort each remark by whether it was judged good or bad and whether it calls for change, so it lands as it should.',
  failureModes: [
    'Hearing every remark as criticism.',
    'Treating a suggestion as a demand: in this edition it is bad but can be lived with.',
    'Praise so vague it says nothing.'
  ],
  steps: [
    step('collect', 'Collect the remarks', 'Each piece of feedback, given or received.'),
    step('sort', 'Place each one', 'Top row judged good, bottom row bad; left column calls for change, right column can stay. Advice, compliment, criticism, suggestion.'),
    step('respond', 'Decide the response', 'What will you change, keep or let go?')
  ],
  exercise: 'Sort the last five pieces of feedback you received and notice which box is empty.',
  pairsWell: ['dm_johari', 'dm_appreciative'],
  chart: {
    axes: { x: { label: 'What it calls for', low: 'Change', high: 'Can stay' }, y: { label: 'How it was judged', low: 'Bad', high: 'Good' } },
    cells: [
      { id: 'advice', label: 'Advice', col: 0, row: 0, fill: 'green' },
      { id: 'compliment', label: 'Compliment', col: 1, row: 0, fill: 'tint' },
      { id: 'criticism', label: 'Criticism', col: 0, row: 1, fill: 'red' },
      { id: 'suggestion', label: 'Suggestion', col: 1, row: 1, fill: 'ink' }
    ],
    item: 'A piece of feedback, given or received',
    reflection: 'How you will respond'
  }
});

export const dmYesNo = pathTool({
  id: 'dm_yes_no',
  name: 'The Yes/No rule',
  when: 'You must decide quickly and the risks are real: set three clear yes-or-no tests in advance and go ahead only if all three are yes.',
  failureModes: [
    'Tests that cannot be answered yes or no.',
    'Changing the tests after seeing the answers.',
    'Going ahead on two yeses.'
  ],
  steps: [
    step('tests', 'Set three tests', 'Three clear questions, each answerable yes or no, decided before you answer any.'),
    step('answer', 'Answer in order', 'Any no ends it: do not proceed. Three yeses: proceed.')
  ],
  exercise: 'Write your three tests for a decision you face often, and keep them.',
  pairsWell: ['dm_stop_rule', 'dm_buyers_decision'],
  chart: {
    variant: 'flow',
    subject: 'What you are deciding',
    stages: [
      { id: 'test_one', label: 'First test', kind: 'question', yes: 'test_two', no: 'stop' },
      { id: 'test_two', label: 'Second test', kind: 'question', yes: 'test_three', no: 'stop' },
      { id: 'test_three', label: 'Third test', kind: 'question', yes: 'proceed', no: 'stop' },
      { id: 'proceed', label: 'Proceed', kind: 'end' },
      { id: 'stop', label: 'Do not proceed', kind: 'end' }
    ]
  }
});

export const dmChoiceOverload = curveTool({
  id: 'dm_choice_overload',
  name: 'The choice overload',
  tier: 'lens',
  when: 'You keep adding options and still cannot choose: too few choices and too many both make people less happy with the result.',
  failureModes: ['Hunting for the perfect number of options; there is none.'],
  steps: [step('place', 'Place yourself', 'Are you short of options, about right, or swamped?')],
  exercise: 'If you are swamped, cut the list to three before you look again.',
  pairsWell: ['dm_buyers_decision', 'dm_stop_rule'],
  chart: {
    axes: { x: { label: 'Number of choices' }, y: { label: 'Unhappiness' } },
    lines: [{ id: 'unhappiness', label: '', shape: 'u' }],
    regions: [
      { id: 'too_few', label: 'Too few', from: 0, to: 0.3 },
      { id: 'enough', label: 'Enough to choose well', from: 0.3, to: 0.7 },
      { id: 'too_many', label: 'Too many', from: 0.7, to: 1 }
    ],
    position: 'Where your options are now'
  }
});

export const dmGapInMarket = plotTool({
  id: 'dm_gap_in_market',
  name: 'The gap-in-the-market model',
  when: 'You are looking for an opening others have missed: name three dimensions that matter, place what exists on them, and look for the empty space.',
  failureModes: [
    'Taking an empty space as proof that people want it.',
    'Choosing dimensions nobody cares about.',
    'Placing rivals from guesswork.'
  ],
  steps: [
    step('dimensions', 'Name three dimensions', 'What do people choose on here? Price, place, popularity, or your own.'),
    step('place', 'Place what exists', 'Every rival or option, in each pair of dimensions.'),
    step('gap', 'Find the gap', 'Where is the empty space, and what tells you anyone would want it?')
  ],
  exercise: 'Place five rivals, then find one person who would want what sits in the gap.',
  pairsWell: ['dm_bcg_box', 'dm_chasm'],
  chart: {
    dimensions: [{ id: 'first', label: 'First dimension' }, { id: 'second', label: 'Second dimension' }, { id: 'third', label: 'Third dimension' }],
    plots: [
      { id: 'first_second', label: 'First against second', axes: { x: { dim: 'first', low: 'Less', high: 'More' }, y: { dim: 'second', low: 'Less', high: 'More' } } },
      { id: 'first_third', label: 'First against third', axes: { x: { dim: 'first', low: 'Less', high: 'More' }, y: { dim: 'third', low: 'Less', high: 'More' } } },
      { id: 'second_third', label: 'Second against third', axes: { x: { dim: 'second', low: 'Less', high: 'More' }, y: { dim: 'third', low: 'Less', high: 'More' } } }
    ],
    point: 'A rival or option, placed in one view',
    minPoints: 3
  }
});

export const dmGift = plotTool({
  id: 'dm_gift',
  name: 'The gift model',
  when: 'You are choosing a gift: weigh what it costs against how much the person will value it.',
  failureModes: ['Equating price with value.', 'Choosing what you would like rather than what they would.'],
  steps: [
    step('ideas', 'List the ideas', 'Every gift you are considering.'),
    step('place', 'Place each one', 'Expense up the side, value to them along the bottom.'),
    step('pick', 'Pick one', 'The best gifts sit low and to the right: cheap and treasured.')
  ],
  exercise: 'Add one idea that costs nothing and see where it lands.',
  pairsWell: ['dm_buyers_decision'],
  chart: {
    axes: { x: { label: 'Value to them', low: 'Little', high: 'Treasured' }, y: { label: 'Expense', low: 'Cheap', high: 'Costly' } },
    point: 'A gift idea'
  }
});

export const dmConsequences = curveTool({
  id: 'dm_consequences',
  name: 'The consequences model',
  tier: 'lens',
  when: 'You are waiting to know more before deciding: the longer you wait, the more you know and the less your decision can change.',
  failureModes: ['Waiting for certainty that never comes.'],
  steps: [step('place', 'Place yourself', 'Is it early, with little known and much still open, or late, with much known and little left to change?')],
  exercise: 'Name the one thing you are waiting to learn, and the date after which it will be too late.',
  pairsWell: ['dm_unconscious', 'dm_buyers_decision'],
  chart: {
    axes: { x: { label: 'Time' }, y: { label: 'How much' } },
    lines: [{ id: 'knowledge', label: 'What you know', shape: 'rise' }, { id: 'consequences', label: 'What deciding can change', shape: 'fall' }],
    regions: [
      { id: 'early', label: 'Early: little known, much open', from: 0, to: 0.35 },
      { id: 'middle', label: 'Middle', from: 0.35, to: 0.65 },
      { id: 'late', label: 'Late: much known, little open', from: 0.65, to: 1 }
    ],
    position: 'Where you are with this decision'
  }
});

export const dmUnconscious = pathTool({
  id: 'dm_unconscious',
  name: 'The theory of unconscious thinking',
  when: 'A complex choice with many factors: make a first choice, then step away to something unrelated and see which option you lean to when you come back.',
  failureModes: [
    'Treating the break as a timer with a proven length.',
    'Thinking about the choice during the break.',
    'Skipping the first choice.'
  ],
  steps: [
    step('first', 'First choice', 'Look at the options and choose one now.'),
    step('away', 'Step away', 'Do something unrelated; a dated reminder brings you back.'),
    step('return', 'Come back', 'Which option do you lean to now, and is it the same?')
  ],
  exercise: 'Decide, sleep on it, then decide again without looking at your first answer.',
  pairsWell: ['dm_consequences', 'dm_cognitive_bias'],
  chart: {
    variant: 'stages',
    stages: [
      { id: 'first_choice', label: 'First choice' },
      { id: 'step_away', label: 'Step away: something unrelated' },
      { id: 'come_back', label: 'Come back: which option now?' }
    ]
  }
});

export const dmStopRule = pathTool({
  id: 'dm_stop_rule',
  name: 'The Stop Rule',
  when: 'You are in something you might need to abandon: agree now the point at which you will stop, and what you will do then, so the moment does not decide for you.',
  failureModes: [
    'A trigger you could argue with in the moment.',
    'No action agreed for when it trips.',
    'Moving the line once you are close to it.'
  ],
  steps: [
    step('goal', 'The goal', 'What are you trying to achieve?'),
    step('trigger', 'The trigger', 'If this happens, I stop: a line that cannot be argued with.'),
    step('action', 'The action', 'Then I will do this, agreed now.')
  ],
  exercise: 'Write the trigger where you will see it, and tell someone who will hold you to it.',
  pairsWell: ['dm_yes_no', 'dm_feedback_analysis'],
  chart: {
    variant: 'stages',
    stages: [
      { id: 'goal', label: 'The goal' },
      { id: 'trigger', label: 'If this happens' },
      { id: 'action', label: 'Then I will do this' }
    ],
    reflection: 'When, and with whom, you will check it'
  }
});

export const dmBuyersDecision = pathTool({
  id: 'dm_buyers_decision',
  name: 'The buyer’s decision model',
  when: 'A purchase or choice where research could go on for ever: bound the search, keep three criteria, look ten days, months and years ahead, and borrow another view.',
  failureModes: [
    'Researching without a limit.',
    'Keeping all five criteria.',
    'Only looking ten days ahead.'
  ],
  steps: [
    step('bounds', 'Bound the search', 'How long and how far will you look?'),
    step('criteria', 'Five criteria, keep three', 'List five things that matter, rank them, keep the top three.'),
    step('horizons', 'Ten days, ten months, ten years', 'How will each option look at each distance?'),
    step('other_view', 'Another view', 'What would someone you trust choose, or what would you choose if these options were gone?')
  ],
  exercise: 'Use it on your next purchase over a week’s pay.',
  pairsWell: ['dm_choice_overload', 'dm_gift'],
  chart: {
    variant: 'stages',
    subject: 'What you are choosing',
    stages: [
      { id: 'bounds', label: 'Bound the search' },
      { id: 'criteria', label: 'Five criteria, keep three' },
      { id: 'horizons', label: 'Ten days, ten months, ten years' },
      { id: 'other_view', label: 'Another view' }
    ]
  }
});

export const SECTION_1 = Object.freeze({
  dm_eisenhower: dmEisenhower,
  dm_bcg_box: dmBcgBox,
  dm_project_portfolio: dmProjectPortfolio,
  dm_feedback_analysis: dmFeedbackAnalysis,
  dm_whitmore: dmWhitmore,
  dm_rubber_band: dmRubberBand,
  dm_feedback_box: dmFeedbackBox,
  dm_yes_no: dmYesNo,
  dm_choice_overload: dmChoiceOverload,
  dm_gap_in_market: dmGapInMarket,
  dm_gift: dmGift,
  dm_consequences: dmConsequences,
  dm_unconscious: dmUnconscious,
  dm_stop_rule: dmStopRule,
  dm_buyers_decision: dmBuyersDecision
});
````

- [ ] **Step 2: Check it loads**

Run: `node -e "import('./packages/decision-book/models/section-1.mjs').then((m) => console.log(Object.keys(m.SECTION_1).length))"`
Expected: the section's model count (15).

- [ ] **Step 3: Check each model against its pages**

Read each model's page renders from `.db-book/` as images (never the OCR text). Confirm that every label, axis direction, cell position, stage and slot matches the book. Correct the config where it does not, and rewrite any coaching line that drifts from the book's meaning, in our own words: never copy a sentence. The "Already checked" column was confirmed while this plan was drafted. Keep a list of every change for the commit message. The model tests in Task 6 assert the kit's logic lines; if a page contradicts one, the page wins: change the config and that test together, and say so in the commit.

| Model | Pages | Renders to read | Already checked |
| --- | --- | --- | --- |
| The Eisenhower matrix (`dm_eisenhower`) | 10–11 | `01_How_to_Improve_Yourself-01.png`, `01_How_to_Improve_Yourself-02.png` |  |
| The BCG box (`dm_bcg_box`) | 14–15 | `01_How_to_Improve_Yourself-05.png`, `01_How_to_Improve_Yourself-06.png` |  |
| The project portfolio matrix (`dm_project_portfolio`) | 16–19 | `01_How_to_Improve_Yourself-07.png`, `01_How_to_Improve_Yourself-08.png`, `01_How_to_Improve_Yourself-09.png`, `01_How_to_Improve_Yourself-10.png` | pp.16–18: cost (underspent to overspent) against time, and aim against learning, as two separate views |
| The feedback analysis (`dm_feedback_analysis`) | 20–21 | `01_How_to_Improve_Yourself-11.png`, `01_How_to_Improve_Yourself-12.png` |  |
| The John Whitmore model (`dm_whitmore`) | 22–23 | `01_How_to_Improve_Yourself-13.png`, `01_How_to_Improve_Yourself-14.png` |  |
| The rubber band model (`dm_rubber_band`) | 24–25 | `01_How_to_Improve_Yourself-15.png`, `01_How_to_Improve_Yourself-16.png` |  |
| The feedback box (`dm_feedback_box`) | 26–27 | `01_How_to_Improve_Yourself-17.png`, `01_How_to_Improve_Yourself-18.png` |  |
| The Yes/No rule (`dm_yes_no`) | 28–29 | `01_How_to_Improve_Yourself-19.png`, `01_How_to_Improve_Yourself-20.png` | pp.28–29: the three tests are the person’s own; all yes proceeds, any no stops |
| The choice overload (`dm_choice_overload`) | 30–31 | `01_How_to_Improve_Yourself-21.png`, `01_How_to_Improve_Yourself-22.png` |  |
| The gap-in-the-market model (`dm_gap_in_market`) | 32–33 | `01_How_to_Improve_Yourself-23.png`, `01_How_to_Improve_Yourself-24.png` |  |
| The gift model (`dm_gift`) | 38–39 | `01_How_to_Improve_Yourself-29.png`, `01_How_to_Improve_Yourself-30.png` |  |
| Thinking outside the box (`dm_outside_box`) | 40–41 | `01_How_to_Improve_Yourself-31.png`, `01_How_to_Improve_Yourself-32.png` |  |
| The consequences model (`dm_consequences`) | 42–43 | `01_How_to_Improve_Yourself-33.png`, `01_How_to_Improve_Yourself-34.png` |  |
| The theory of unconscious thinking (`dm_unconscious`) | 44–45 | `01_How_to_Improve_Yourself-35.png`, `01_How_to_Improve_Yourself-36.png` |  |
| The Stop Rule (`dm_stop_rule`) | 46–47 | `01_How_to_Improve_Yourself-37.png`, `01_How_to_Improve_Yourself-38.png` |  |
| The buyer’s decision model (`dm_buyers_decision`) | 48–49 | `01_How_to_Improve_Yourself-39.png`, `01_How_to_Improve_Yourself-40.png` |  |

- [ ] **Step 4: Commit**

```bash
git add packages/decision-book/models/section-1.mjs
git commit -m "Decision Maker: section 1 models (how to improve yourself)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Section 2, How to understand yourself better

**Files:**
- Create: `packages/decision-book/models/section-2.mjs`

- [ ] **Step 1: Write the section's models**

````js
// packages/decision-book/models/section-2.mjs
// How to understand yourself better (pp.52–81): the section's models as tools. Structure follows
// the kit's "logic" lines (tested); the coaching words are our own.
import { curveTool, listTool, plotTool, quadrantTool, scalesTool, tensionTool } from '../families/index.mjs';

const step = (id, title, prompt) => ({ id, title, prompt });

export const dmFlow = plotTool({
  id: 'dm_flow',
  name: 'The flow model',
  when: 'You want to know why something bores or overwhelms you: place it by how hard it is against how able you are; flow sits where they match.',
  failureModes: ['Raising the challenge without the skill to meet it.', 'Calling comfort flow.'],
  steps: [
    step('activities', 'Name the activities', 'What you do, at work or outside it.'),
    step('place', 'Place each one', 'Challenge rises upwards, ability to the right. Above the band you are overwhelmed, below it bored.'),
    step('adjust', 'Move towards the band', 'For each, what would raise the challenge or your skill?')
  ],
  exercise: 'Place your last working day hour by hour and see how long you spent in the band.',
  pairsWell: ['dm_performance', 'dm_whitmore'],
  chart: {
    axes: { x: { label: 'Ability', low: 'Low', high: 'High' }, y: { label: 'Challenge', low: 'Low', high: 'High' } },
    band: { label: 'Flow', diagonal: 18 },
    point: 'An activity'
  }
});

export const dmJohari = quadrantTool({
  id: 'dm_johari',
  name: 'The Johari window',
  when: 'You want to see yourself as others do: compare the words you choose for yourself with the words others choose for you.',
  failureModes: ['Swapping hidden and blind.', 'Asking only people who agree with you.', 'Treating the boxes as sized by measurement.'],
  steps: [
    step('self', 'Your words', 'Choose words that describe you.'),
    step('others', 'Their words', 'Ask others to choose words for you.'),
    step('sort', 'Sort them', 'Known to both: open. Known to others only: blind. Known to you only: hidden. Known to neither: unknown.')
  ],
  exercise: 'Ask three people for three words each, then read your blind box slowly.',
  pairsWell: ['dm_feedback_box', 'dm_cognitive_bias'],
  chart: {
    axes: { x: { label: 'Me', low: 'Known to me', high: 'Not known to me' }, y: { label: 'Others', low: 'Not known to others', high: 'Known to others' } },
    cells: [
      { id: 'open', label: 'Open (A)', col: 0, row: 0, fill: 'green' },
      { id: 'blind', label: 'Blind (C)', col: 1, row: 0, fill: 'red' },
      { id: 'hidden', label: 'Hidden (B)', col: 0, row: 1, fill: 'tint' },
      { id: 'unknown', label: 'Unknown (D)', col: 1, row: 1, fill: 'ink' }
    ],
    item: 'A word that describes you, sorted by who knows it'
  }
});

export const dmDissonance = tensionTool({
  id: 'dm_dissonance',
  name: 'The cognitive dissonance model',
  when: 'You act against what you believe and feel uneasy: name the belief and the behaviour, and decide which one to change.',
  failureModes: ['Changing the belief to excuse the behaviour without noticing.', 'Treating it as a diagnosis.'],
  steps: [
    step('belief', 'The belief', 'What do you believe here?'),
    step('behaviour', 'The behaviour', 'What do you actually do?'),
    step('settle', 'Settle it', 'Change the behaviour, or honestly change the belief.')
  ],
  exercise: 'Name one belief you keep acting against and the smallest change that would bring them together.',
  pairsWell: ['dm_cognitive_bias', 'double_loop'],
  chart: {
    variant: 'gap',
    centre: 'The situation',
    sides: [
      { id: 'belief', label: 'What I believe', fill: 'green' },
      { id: 'behaviour', label: 'What I do', fill: 'red' }
    ],
    gap: 'The mismatch',
    reflection: 'Which you will change: the behaviour or the belief'
  }
});

export const dmUnimaginable = quadrantTool({
  id: 'dm_unimaginable',
  name: 'The unimaginable model',
  when: 'You are weighing a claim or belief: ask whether it can be proved and whether you can even imagine it.',
  failureModes: ['Treating what you cannot imagine as false.', 'Treating the examples as settled science.'],
  steps: [
    step('claims', 'Name the claims', 'Beliefs or claims behind the decision.'),
    step('sort', 'Sort them', 'Provable to the left, not provable to the right; imaginable at the top, unimaginable at the bottom.'),
    step('reflect', 'Reflect', 'Which claims are you treating as proved when they are not?')
  ],
  exercise: 'Sort the three claims your decision rests on most.',
  pairsWell: ['dm_rumsfeld', 'dm_black_swan'],
  chart: {
    axes: { x: { label: 'Proof', low: 'Provable', high: 'Not provable' }, y: { label: 'Imagination', low: 'Unimaginable', high: 'Imaginable' } },
    cells: [
      { id: 'provable_imaginable', label: 'Provable and imaginable', col: 0, row: 0, fill: 'green' },
      { id: 'unprovable_imaginable', label: 'Imaginable, not provable', col: 1, row: 0, fill: 'tint' },
      { id: 'provable_unimaginable', label: 'Provable, unimaginable', col: 0, row: 1, fill: 'red' },
      { id: 'unprovable_unimaginable', label: 'Neither', col: 1, row: 1, fill: 'ink' }
    ],
    item: 'A belief or claim',
    minItems: 2
  }
});

export const dmElbaek = scalesTool({
  id: 'dm_elbaek',
  name: 'The Uffe Elbæk model',
  when: 'You want a picture of how you work and how you would like to: share ten points across four opposed pairs, now and as you wish it.',
  failureModes: ['Scoring a pair as if both sides could have ten.', 'Drawing only the present.'],
  steps: [
    step('now', 'Score now', 'For each pair, give ten points between the two poles as you are now.'),
    step('wanted', 'Score as you wish', 'Then as you would like to be.'),
    step('compare', 'Compare', 'Where is the biggest gap, and what would close it?')
  ],
  exercise: 'Ask someone who knows you to score you too, and compare their picture with yours.',
  pairsWell: ['dm_performance', 'dm_energy'],
  chart: {
    mode: 'pairs',
    scales: [
      { id: 'body_mind', low: 'Body', high: 'Mind' },
      { id: 'form_content', low: 'Form', high: 'Content' },
      { id: 'global_local', low: 'Global', high: 'Local' },
      { id: 'team_individual', low: 'Team', high: 'Individual' }
    ],
    series: [{ id: 'now', label: 'Now' }, { id: 'wanted', label: 'As I wish' }]
  }
});

export const dmEnergy = scalesTool({
  id: 'dm_energy',
  name: 'The energy model',
  when: 'You want to see where your thinking goes: share it between past, present and future.',
  failureModes: ['Reading the split as a fact about a people or region.', 'Judging one split as right.'],
  steps: [
    step('share', 'Share it out', 'Of your thinking, how much goes to the past, the present and the future? They add up to 100.'),
    step('reflect', 'Reflect', 'What does the split say about this decision?')
  ],
  exercise: 'Share it out for this week, then for the week you would like.',
  pairsWell: ['dm_elbaek', 'dm_making_of'],
  chart: {
    mode: 'shares',
    scales: [{ id: 'past', label: 'Past' }, { id: 'present', label: 'Present' }, { id: 'future', label: 'Future' }]
  }
});

export const dmPoliticalCompass = plotTool({
  id: 'dm_political_compass',
  name: 'The political compass',
  when: 'You want to place a view on two axes rather than one: the economy, and how much the state should decide.',
  failureModes: ['Placing other people or parties for them.', 'Reading old placements as current.'],
  steps: [
    step('positions', 'Name the positions', 'Your view, and any you are weighing.'),
    step('place', 'Place them', 'Left nationalises, right privatises; top is authoritarian, bottom liberal.')
  ],
  exercise: 'Place yourself, then the view you are most tempted to dismiss.',
  pairsWell: ['dm_sinus_bourdieu'],
  chart: {
    axes: { x: { label: 'Economy', low: 'Nationalise', high: 'Privatise' }, y: { label: 'Rights', low: 'Liberal', high: 'Authoritarian' } },
    point: 'A position you supply',
    minPoints: 1
  }
});

export const dmPerformance = scalesTool({
  id: 'dm_performance',
  name: 'The personal performance model',
  when: 'You want to know why work feels heavy or light: score what you have to do, are able to do and want to do.',
  failureModes: ['Adding the three into one verdict.', 'Scoring once and never again.'],
  steps: [
    step('score', 'Score the three', 'Have to, able to, want to: one to ten each.'),
    step('reflect', 'Read the sail', 'Which is pulling the shape out of line?')
  ],
  exercise: 'Score it again in three weeks and lay the two sails side by side.',
  pairsWell: ['dm_elbaek', 'dm_whitmore'],
  chart: {
    mode: 'axes',
    layout: 'radar',
    scales: [{ id: 'have_to', label: 'Have to' }, { id: 'able_to', label: 'Able to' }, { id: 'want_to', label: 'Want to' }],
    series: [{ id: 'today', label: 'Today' }]
  }
});

export const dmMakingOf = listTool({
  id: 'dm_making_of',
  name: 'The making-of model',
  when: 'Looking back over a stretch of time to learn from it: lay out goals, learning, obstacles, successes, people and luck side by side.',
  failureModes: ['Crediting every success to your own ability.', 'Skipping the obstacles.'],
  steps: [
    step('frame', 'Choose the stretch', 'Which year, project or chapter?'),
    step('lanes', 'Fill the six lanes', 'Goals, learning, obstacles, successes, people, luck.'),
    step('reflect', 'Read across', 'What repeats, and what would you keep doing?')
  ],
  exercise: 'Do it for the last year, and be honest in the luck lane.',
  pairsWell: ['dm_crossroads', 'dm_feedback_analysis'],
  chart: {
    layout: 'lanes',
    subject: 'The stretch of time you are looking back over',
    groups: [
      { id: 'goals', label: 'Goals' },
      { id: 'learning', label: 'Learning' },
      { id: 'obstacles', label: 'Obstacles' },
      { id: 'successes', label: 'Successes' },
      { id: 'people', label: 'People' },
      { id: 'luck', label: 'Luck' }
    ],
    entry: 'One moment, in its lane',
    minGroups: 5,
    minEntries: 6
  }
});

export const dmPotentialTrap = curveTool({
  id: 'dm_potential_trap',
  name: 'The personal potential trap',
  when: 'You feel you are falling short: compare your own expectations, others’ expectations and what you have actually done.',
  failureModes: ['Reading the curves as a forecast.', 'Merging your expectations with other people’s.'],
  steps: [
    step('place', 'Place yourself', 'At which stage are you?'),
    step('name', 'Name each line', 'What you expect, what others expect, what you have done.'),
    step('reflect', 'Reflect', 'Whose expectation is setting the bar?')
  ],
  exercise: 'Write whose voice the highest expectation is in.',
  pairsWell: ['dm_expectations', 'dm_crossroads'],
  chart: {
    axes: { x: { label: 'Stages of life' }, y: { label: 'How much' } },
    lines: [
      { id: 'mine', label: 'My expectations', shape: 'rise' },
      { id: 'others', label: 'Others’ expectations', shape: 's' },
      { id: 'achieved', label: 'What I have achieved', shape: 'lag' }
    ],
    regions: [
      { id: 'early', label: 'Early', from: 0, to: 0.33 },
      { id: 'middle', label: 'Middle', from: 0.33, to: 0.66 },
      { id: 'later', label: 'Later', from: 0.66, to: 1 }
    ],
    position: 'Where you are now',
    minNotes: 1
  }
});

export const dmHardChoice = quadrantTool({
  id: 'dm_hard_choice',
  name: 'The hard choice model',
  when: 'You are stuck on a choice: see whether it is hard because the options are hard to compare, because the stakes are high, or both.',
  failureModes: ['Agonising over a no-brainer.', 'Treating a hard choice as if better information will settle it.'],
  steps: [
    step('choices', 'Name the choice', 'The choice in front of you.'),
    step('place', 'Place it', 'Easy to compare at the top, hard at the bottom; small consequences left, large right.'),
    step('reflect', 'Read it', 'A hard choice is about who you want to be, not the right answer.')
  ],
  exercise: 'Place your last three decisions and notice how many were no-brainers you agonised over.',
  pairsWell: ['dm_rubber_band', 'dm_crossroads'],
  chart: {
    axes: { x: { label: 'Consequence', low: 'Small', high: 'Large' }, y: { label: 'Comparability', low: 'Hard to compare', high: 'Easy to compare' } },
    cells: [
      { id: 'no_brainer', label: 'No-brainer', col: 0, row: 0, fill: 'green' },
      { id: 'big_choice', label: 'Big choice', col: 1, row: 0, fill: 'tint' },
      { id: 'apples_pears', label: 'Apples and pears', col: 0, row: 1, fill: 'red' },
      { id: 'hard_choice', label: 'Hard choice', col: 1, row: 1, fill: 'ink' }
    ],
    item: 'A choice, placed by comparability and consequence',
    minItems: 1,
    minCells: 1,
    reflection: 'The reasons for the route you take'
  }
});

export const dmCognitiveBias = listTool({
  id: 'dm_cognitive_bias',
  name: 'Cognitive bias',
  when: 'Before you trust your judgement: check it against four recurring errors.',
  failureModes: ['Spotting the bias in others only.', 'Naming a bias without a counter-check.'],
  steps: [
    step('check', 'Check each error', 'For each: what you assumed, what is actually so, and how you will check.'),
    step('reflect', 'Reflect', 'Which one has the strongest hold on this decision?')
  ],
  exercise: 'Before your next big call, write the first number or example that came to mind and ask where it came from.',
  pairsWell: ['dm_unconscious', 'dm_johari'],
  chart: {
    layout: 'rows',
    groups: [
      { id: 'anchor', label: 'Anchor effect', prompt: 'A first number or idea that set the range' },
      { id: 'confirmation', label: 'Confirmation error', prompt: 'Seeking what agrees with you' },
      { id: 'availability', label: 'Availability error', prompt: 'What comes to mind easily feels likely' },
      { id: 'fast_slow', label: 'Fast/slow error', prompt: 'Deciding fast what needs slow thought' }
    ],
    entry: 'Assumption, reality and counter-check for one error',
    minEntries: 2
  }
});

export const dmCrossroads = listTool({
  id: 'dm_crossroads',
  name: 'The crossroads model',
  when: 'At a turning point in life: answer five questions about where you come from and what matters, then imagine the roads you could take.',
  failureModes: ['Jumping to the roads before the questions.', 'Mistaking the road back for where you came from.'],
  steps: [
    step('questions', 'Five questions', 'Where have you come from? What is really important to you? Which people are important to you? What is hindering you? What are you afraid of?'),
    step('roads', 'The roads', 'The road back, the familiar road, the road not travelled, the beckoning road, the dream road, the sensible road.'),
    step('reflect', 'Choose a road', 'Which road could you take, and what is the first step on it?')
  ],
  exercise: 'Answer the questions with a good friend, then describe two roads aloud.',
  pairsWell: ['dm_making_of', 'dm_rubber_band'],
  chart: {
    layout: 'routes',
    groups: [
      { id: 'come_from', label: 'Where have you come from?' },
      { id: 'important', label: 'What is really important to you?' },
      { id: 'people', label: 'Which people are important to you?' },
      { id: 'hindering', label: 'What is hindering you?' },
      { id: 'afraid', label: 'What are you afraid of?' },
      { id: 'road_back', label: 'The road back' },
      { id: 'familiar_road', label: 'The familiar road' },
      { id: 'road_not_travelled', label: 'The road not travelled' },
      { id: 'beckoning_road', label: 'The beckoning road' },
      { id: 'dream_road', label: 'The dream road' },
      { id: 'sensible_road', label: 'The sensible road' }
    ],
    entry: 'An answer to one question, or a picture of one road',
    perGroup: 4,
    minGroups: 6,
    minEntries: 6
  }
});

export const SECTION_2 = Object.freeze({
  dm_flow: dmFlow,
  dm_johari: dmJohari,
  dm_dissonance: dmDissonance,
  dm_unimaginable: dmUnimaginable,
  dm_elbaek: dmElbaek,
  dm_energy: dmEnergy,
  dm_political_compass: dmPoliticalCompass,
  dm_performance: dmPerformance,
  dm_making_of: dmMakingOf,
  dm_potential_trap: dmPotentialTrap,
  dm_hard_choice: dmHardChoice,
  dm_cognitive_bias: dmCognitiveBias,
  dm_crossroads: dmCrossroads
});
````

- [ ] **Step 2: Check it loads**

Run: `node -e "import('./packages/decision-book/models/section-2.mjs').then((m) => console.log(Object.keys(m.SECTION_2).length))"`
Expected: the section's model count (13).

- [ ] **Step 3: Check each model against its pages**

Read each model's page renders from `.db-book/` as images (never the OCR text). Confirm that every label, axis direction, cell position, stage and slot matches the book. Correct the config where it does not, and rewrite any coaching line that drifts from the book's meaning, in our own words: never copy a sentence. The "Already checked" column was confirmed while this plan was drafted. Keep a list of every change for the commit message. The model tests in Task 6 assert the kit's logic lines; if a page contradicts one, the page wins: change the config and that test together, and say so in the commit.

| Model | Pages | Renders to read | Already checked |
| --- | --- | --- | --- |
| The flow model (`dm_flow`) | 52–53 | `02_How_to_Understand_Yourself_Better-01.png`, `02_How_to_Understand_Yourself_Better-02.png` |  |
| The Johari window (`dm_johari`) | 54–55 | `02_How_to_Understand_Yourself_Better-03.png`, `02_How_to_Understand_Yourself_Better-04.png` |  |
| The cognitive dissonance model (`dm_dissonance`) | 56–57 | `02_How_to_Understand_Yourself_Better-05.png`, `02_How_to_Understand_Yourself_Better-06.png` |  |
| The unimaginable model (`dm_unimaginable`) | 58–59 | `02_How_to_Understand_Yourself_Better-07.png`, `02_How_to_Understand_Yourself_Better-08.png` |  |
| The Uffe Elbæk model (`dm_elbaek`) | 60–61 | `02_How_to_Understand_Yourself_Better-09.png`, `02_How_to_Understand_Yourself_Better-10.png` |  |
| The energy model (`dm_energy`) | 62–63 | `02_How_to_Understand_Yourself_Better-11.png`, `02_How_to_Understand_Yourself_Better-12.png` |  |
| The political compass (`dm_political_compass`) | 64–65 | `02_How_to_Understand_Yourself_Better-13.png`, `02_How_to_Understand_Yourself_Better-14.png` |  |
| The personal performance model (`dm_performance`) | 66–67 | `02_How_to_Understand_Yourself_Better-15.png`, `02_How_to_Understand_Yourself_Better-16.png` |  |
| The making-of model (`dm_making_of`) | 68–71 | `02_How_to_Understand_Yourself_Better-17.png`, `02_How_to_Understand_Yourself_Better-18.png`, `02_How_to_Understand_Yourself_Better-19.png`, `02_How_to_Understand_Yourself_Better-20.png` |  |
| The personal potential trap (`dm_potential_trap`) | 72–73 | `02_How_to_Understand_Yourself_Better-21.png`, `02_How_to_Understand_Yourself_Better-22.png` |  |
| The hard choice model (`dm_hard_choice`) | 74–75 | `02_How_to_Understand_Yourself_Better-23.png`, `02_How_to_Understand_Yourself_Better-24.png` |  |
| Cognitive bias (`dm_cognitive_bias`) | 76–77 | `02_How_to_Understand_Yourself_Better-25.png`, `02_How_to_Understand_Yourself_Better-26.png` |  |
| The crossroads model (`dm_crossroads`) | 78–81 | `02_How_to_Understand_Yourself_Better-27.png`, `02_How_to_Understand_Yourself_Better-28.png`, `02_How_to_Understand_Yourself_Better-29.png`, `02_How_to_Understand_Yourself_Better-30.png` | pp.78–81: five questions and the six named roads |

- [ ] **Step 4: Commit**

```bash
git add packages/decision-book/models/section-2.mjs
git commit -m "Decision Maker: section 2 models (how to understand yourself better)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Section 3, How to understand others better

**Files:**
- Create: `packages/decision-book/models/section-3.mjs`

- [ ] **Step 1: Write the section's models**

````js
// packages/decision-book/models/section-3.mjs
// How to understand others better (pp.84–123): the section's own models as tools. Double-loop
// learning and the Pareto principle are Problem Solver's tools, reused as they are; the black
// box is a bespoke tool (tools/black-box.mjs). Structure follows the kit's "logic" lines and,
// for the AI model, the book's figure (p.103); the coaching words are our own.
import { curveTool, listTool, pathTool, plotTool, quadrantTool } from '../families/index.mjs';

const step = (id, title, prompt) => ({ id, title, prompt });

export const dmRumsfeld = quadrantTool({
  id: 'dm_rumsfeld',
  name: 'The Rumsfeld matrix',
  when: 'A decision with gaps in what you know: sort what you know, what you know you do not know, and what you are not aware of at all.',
  failureModes: [
    'Trying to list the unknown unknowns; they cannot be listed, only prepared for.',
    'Forgetting the unknown knowns: what you know but have not used.',
    'Treating known unknowns as settled.'
  ],
  steps: [
    step('sort', 'Sort what you know', 'Bottom row: what you are aware of, known or unknown. Top row: what you are not aware of, known or unknown.'),
    step('questions', 'Turn gaps into questions', 'For each known unknown, a question; for the unknown unknowns, a contingency.'),
    step('reflect', 'Reflect', 'Which unknown could change the decision most?')
  ],
  exercise: 'Ask someone outside the decision what you might know and not be using.',
  pairsWell: ['dm_unimaginable', 'dm_cognitive_bias'],
  chart: {
    axes: { x: { label: 'The thing itself', low: 'Known', high: 'Unknown' }, y: { label: 'Your awareness', low: 'Aware of it', high: 'Not aware of it' } },
    cells: [
      { id: 'unknown_knowns', label: 'Unknown knowns', col: 0, row: 0, fill: 'tint' },
      { id: 'unknown_unknowns', label: 'Unknown unknowns', col: 1, row: 0, fill: 'ink' },
      { id: 'known_knowns', label: 'Known knowns', col: 0, row: 1, fill: 'green' },
      { id: 'known_unknowns', label: 'Known unknowns', col: 1, row: 1, fill: 'red' }
    ],
    item: 'Something known or unknown, or a question or contingency for it',
    reflection: 'What you will find out, and what you will prepare for'
  }
});

export const dmSwissCheese = pathTool({
  id: 'dm_swiss_cheese',
  name: 'The Swiss cheese model',
  when: 'Something went wrong, or could: look at each safeguard as a slice with holes, and see where the holes line up.',
  failureModes: ['Blaming the last person in the chain.', 'Counting holes as if they were probabilities.'],
  steps: [
    step('layers', 'Name the safeguards', 'Each layer of defence between a hazard and harm.'),
    step('holes', 'Find the holes', 'Where each one can fail.'),
    step('path', 'Trace the path', 'Do the holes line up into a way through, or does a layer block it?')
  ],
  exercise: 'Trace one near miss through every layer and name the hole you can close cheapest.',
  pairsWell: ['dm_black_swan', 'dm_feedback_analysis'],
  chart: {
    variant: 'layers',
    layers: { layer: 'A safeguard', hole: 'A weakness in that safeguard' },
    reflection: 'Whether the holes line up, and which you will close'
  }
});

export const dmMaslow = listTool({
  id: 'dm_maslow',
  name: 'The Maslow pyramids',
  when: 'You want to see what a choice is really meeting: what you need, set against what you want, level by level.',
  failureModes: ['Treating the pyramid as a law.', 'Skipping a level because it feels obvious.'],
  steps: [
    step('needs', 'What you need', 'At each level, from the body up: what do you need?'),
    step('wants', 'What you want', 'At each level: what do you want?'),
    step('reflect', 'Compare', 'Where do needs and wants pull apart in this decision?')
  ],
  exercise: 'Fill both pyramids for the job you have, then for the job you are considering.',
  pairsWell: ['dm_crossroads', 'dm_hard_choice'],
  chart: {
    layout: 'pyramid',
    inverted: ['wants'],
    groups: [
      { id: 'needs_physiological', label: 'Physiological needs', column: 'needs' },
      { id: 'needs_security', label: 'Security', column: 'needs' },
      { id: 'needs_social', label: 'Social relationships', column: 'needs' },
      { id: 'needs_recognition', label: 'Recognition', column: 'needs' },
      { id: 'needs_self', label: 'Self-actualisation', column: 'needs' },
      { id: 'wants_physiological', label: 'Physiological needs', column: 'wants' },
      { id: 'wants_security', label: 'Security', column: 'wants' },
      { id: 'wants_social', label: 'Social relationships', column: 'wants' },
      { id: 'wants_recognition', label: 'Recognition', column: 'wants' },
      { id: 'wants_self', label: 'Self-actualisation', column: 'wants' }
    ],
    entry: 'What you need or want at one level',
    minGroups: 4,
    minEntries: 4
  }
});

export const dmSinusBourdieu = plotTool({
  id: 'dm_sinus_bourdieu',
  name: 'The Sinus Milieu and Bourdieu models',
  tier: 'lens',
  when: 'You want to see how background and status shape a choice: place yourself on two simplified social maps.',
  failureModes: ['Using the maps to label other people.', 'Reading an old, simplified map as today’s society.'],
  steps: [step('place', 'Place yourself', 'On the values and status map, and on the capital map. They do not share axes.')],
  exercise: 'Place yourself, then ask what someone in the opposite corner would choose.',
  pairsWell: ['dm_political_compass', 'dm_maslow'],
  chart: {
    plots: [
      { id: 'sinus', label: 'Values and status (Sinus)', axes: { x: { label: 'Values', low: 'Traditional', high: 'Modern' }, y: { label: 'Social status', low: 'Lower', high: 'Upper' } } },
      { id: 'bourdieu', label: 'Capital (Bourdieu)', axes: { x: { label: 'Mix of capital', low: 'Mostly cultural', high: 'Mostly economic' }, y: { label: 'Total capital', low: 'Less', high: 'More' } } }
    ],
    point: 'Where you place yourself on one map',
    minPoints: 1,
    max: 2
  }
});

export const dmAppreciative = quadrantTool({
  id: 'dm_appreciative',
  name: 'The AI (appreciative inquiry) model',
  when: 'A discussion keeps shooting ideas down: notice how each person answers, and answer with what could be built on.',
  failureModes: ['Reading AI as artificial intelligence; here it is appreciative inquiry.', 'Mistaking “Yes, but” for support.'],
  steps: [
    step('observe', 'Notice the answers', 'In the next discussion, note how each person meets an idea.'),
    step('place', 'Place them', 'Positive to the right, negative to the left; constructive at the top, destructive at the bottom.'),
    step('contribute', 'Your next answer', 'What would “Yes, and …” sound like from you?')
  ],
  exercise: 'In your next meeting, answer one idea with “Yes, and we could also …”.',
  pairsWell: ['dm_feedback_box', 'dm_conflict'],
  chart: {
    axes: { x: { label: 'Tone', low: 'Negative', high: 'Positive' }, y: { label: 'Effect', low: 'Destructive', high: 'Constructive' } },
    cells: [
      { id: 'schoolteacher', label: 'Schoolteacher', note: '“No, because …”', col: 0, row: 0, fill: 'tint' },
      { id: 'ai_thinker', label: 'AI thinker', note: '“Yes, and …”', col: 1, row: 0, fill: 'green' },
      { id: 'dictator', label: 'Dictator', note: '“No!”', col: 0, row: 1, fill: 'ink' },
      { id: 'fault_finder', label: 'Fault-finder', note: '“Yes, but …”', col: 1, row: 1, fill: 'red' }
    ],
    item: 'An answer someone gave, or yours',
    reflection: 'Your next contribution'
  }
});

export const dmLongTail = curveTool({
  id: 'dm_long_tail',
  name: 'The long-tail model',
  tier: 'lens',
  when: 'Weighing a hit against many small niches: a few items sell a lot, and many items each sell a little, which can add up.',
  failureModes: ['Comparing the height of one niche with a hit instead of the tail’s total.'],
  steps: [step('place', 'Place your offer', 'Is it in the head, among the hits, or out in the tail?')],
  exercise: 'If you are in the tail, name the ten neighbours whose small totals you share.',
  pairsWell: ['dm_chasm', 'dm_bcg_box'],
  chart: {
    axes: { x: { label: 'Products, best sellers first' }, y: { label: 'Sales per product' } },
    lines: [{ id: 'sales', label: '', shape: 'tail' }],
    regions: [{ id: 'head', label: 'The head: a few hits', from: 0, to: 0.2 }, { id: 'tail', label: 'The long tail: many niches', from: 0.2, to: 1 }],
    position: 'Where your idea or offer sits'
  }
});

export const dmConflict = listTool({
  id: 'dm_conflict',
  name: 'The conflict resolution model',
  when: 'A conflict you are in or watching: see the six ways people respond, and what each leaves both sides with.',
  failureModes: ['Calling a compromise a consensus.', 'Promising an outcome the other side has not agreed.'],
  steps: [
    step('responses', 'The six responses', 'Flight, fight, giving up, evading responsibility, compromise, consensus: what each would look like here.'),
    step('outcomes', 'What each leaves', 'What does each side end up with?'),
    step('reflect', 'Choose', 'Which response will you try, and what would consensus need?')
  ],
  exercise: 'Name how you usually respond, and try the next one along.',
  pairsWell: ['dm_prisoners', 'dm_appreciative'],
  chart: {
    layout: 'rows',
    groups: [
      { id: 'flight', label: 'Flight' },
      { id: 'fight', label: 'Fight' },
      { id: 'give_up', label: 'Give up' },
      { id: 'evade', label: 'Evade responsibility' },
      { id: 'compromise', label: 'Compromise', prompt: 'Both sides concede something' },
      { id: 'consensus', label: 'Consensus', prompt: 'A new solution found together' }
    ],
    entry: 'What one response would look like, and what it leaves each side with'
  }
});

export const dmBlackSwan = curveTool({
  id: 'dm_black_swan',
  name: 'The black swan model',
  when: 'Your plan rests on things going as they always have: name the assumption, the pattern behind it and the surprise that would break it.',
  failureModes: ['Predicting when the surprise will come.', 'Taking a long calm as proof of safety.'],
  steps: [
    step('assumption', 'The assumption', 'What are you assuming will hold?'),
    step('pattern', 'The pattern', 'What past experience makes it feel safe?'),
    step('surprise', 'The surprise', 'What would break it, and what will you do if it does?')
  ],
  exercise: 'Write one contingency for the surprise you would least like to face.',
  pairsWell: ['dm_swiss_cheese', 'dm_stop_rule'],
  chart: {
    axes: { x: { label: 'Time' }, y: { label: 'How sure you feel' } },
    lines: [{ id: 'certainty', label: '', shape: 'spike' }],
    regions: [{ id: 'pattern', label: 'The pattern so far', from: 0, to: 0.72 }, { id: 'surprise', label: 'The surprise', from: 0.72, to: 1 }],
    position: 'Where you are now',
    minNotes: 2,
    reflection: 'Your contingency'
  }
});

export const dmChasm = curveTool({
  id: 'dm_chasm',
  name: 'The chasm: the diffusion model',
  when: 'A new idea has fans but not the many: see where it stands on the adoption curve and what it needs to cross the gap.',
  failureModes: ['Mistaking early adopters’ enthusiasm for the majority’s.', 'Adding adoption percentages the book does not give.'],
  steps: [
    step('place', 'Place the idea', 'Who is using it now?'),
    step('evidence', 'What the majority needs', 'What proof would the early majority need?')
  ],
  exercise: 'Find one early-majority person and ask what would make them try it.',
  pairsWell: ['dm_gap_in_market', 'dm_bcg_box'],
  chart: {
    axes: { x: { label: 'Who adopts, in order' }, y: { label: 'How many' } },
    lines: [{ id: 'adoption', label: '', shape: 'chasm' }],
    regions: [
      { id: 'innovators', label: 'Innovators', from: 0, to: 0.16 },
      { id: 'early_adopters', label: 'Early adopters', from: 0.16, to: 0.3 },
      { id: 'chasm', label: 'The chasm', from: 0.3, to: 0.36 },
      { id: 'early_majority', label: 'Early majority', from: 0.36, to: 0.66 },
      { id: 'late_majority', label: 'Late majority', from: 0.66, to: 0.84 },
      { id: 'sceptics', label: 'Sceptics', from: 0.84, to: 1 }
    ],
    position: 'Where your idea stands now',
    minNotes: 1,
    reflection: 'The evidence you need to cross'
  }
});

export const dmPrisoners = quadrantTool({
  id: 'dm_prisoners',
  name: 'The prisoner’s dilemma',
  when: 'Your best move depends on what someone else does and you cannot agree it first: see why both sides can lose by each playing safe.',
  failureModes: ['Swapping in another version’s numbers.', 'Forgetting that repeated rounds change the game.'],
  steps: [
    step('sides', 'Name the two sides', 'You are A; who is B?'),
    step('round', 'Place each round', 'A’s choice down the side, B’s across the top; the first number is A’s years, the second B’s. Fewer years is better.'),
    step('reflect', 'Reflect', 'What would trust over many rounds make possible?')
  ],
  exercise: 'Play three rounds of a real choice with someone and note how trust moves.',
  pairsWell: ['dm_conflict'],
  chart: {
    axes: { x: { label: 'B', low: 'B stays silent', high: 'B confesses' }, y: { label: 'A', low: 'A confesses', high: 'A stays silent' } },
    cells: [
      { id: 'both_silent', label: 'Both stay silent', note: 'A 2 years · B 2 years', col: 0, row: 0, fill: 'green' },
      { id: 'b_confesses', label: 'Only B confesses', note: 'A 10 years · B 0 years', col: 1, row: 0, fill: 'red' },
      { id: 'a_confesses', label: 'Only A confesses', note: 'A 0 years · B 10 years', col: 0, row: 1, fill: 'tint' },
      { id: 'both_confess', label: 'Both confess', note: 'A 5 years · B 5 years', col: 1, row: 1, fill: 'ink' }
    ],
    item: 'A round: what each side chose',
    minItems: 1,
    minCells: 1
  }
});

export const SECTION_3 = Object.freeze({
  dm_rumsfeld: dmRumsfeld,
  dm_swiss_cheese: dmSwissCheese,
  dm_maslow: dmMaslow,
  dm_sinus_bourdieu: dmSinusBourdieu,
  dm_appreciative: dmAppreciative,
  dm_long_tail: dmLongTail,
  dm_conflict: dmConflict,
  dm_black_swan: dmBlackSwan,
  dm_chasm: dmChasm,
  dm_prisoners: dmPrisoners
});
````

- [ ] **Step 2: Check it loads**

Run: `node -e "import('./packages/decision-book/models/section-3.mjs').then((m) => console.log(Object.keys(m.SECTION_3).length))"`
Expected: the section's model count (10).

- [ ] **Step 3: Check each model against its pages**

Read each model's page renders from `.db-book/` as images (never the OCR text). Confirm that every label, axis direction, cell position, stage and slot matches the book. Correct the config where it does not, and rewrite any coaching line that drifts from the book's meaning, in our own words: never copy a sentence. The "Already checked" column was confirmed while this plan was drafted. Keep a list of every change for the commit message. The model tests in Task 6 assert the kit's logic lines; if a page contradicts one, the page wins: change the config and that test together, and say so in the commit.

| Model | Pages | Renders to read | Already checked |
| --- | --- | --- | --- |
| The Rumsfeld matrix (`dm_rumsfeld`) | 84–87 | `03_How_to_Understand_Others_Better-03.png`, `03_How_to_Understand_Others_Better-04.png`, `03_How_to_Understand_Others_Better-05.png`, `03_How_to_Understand_Others_Better-06.png` |  |
| The Swiss cheese model (`dm_swiss_cheese`) | 88–91 | `03_How_to_Understand_Others_Better-07.png`, `03_How_to_Understand_Others_Better-08.png`, `03_How_to_Understand_Others_Better-09.png`, `03_How_to_Understand_Others_Better-10.png` |  |
| The Maslow pyramids (`dm_maslow`) | 92–93 | `03_How_to_Understand_Others_Better-11.png`, `03_How_to_Understand_Others_Better-12.png` |  |
| The Sinus Milieu and Bourdieu models (`dm_sinus_bourdieu`) | 94–97 | `03_How_to_Understand_Others_Better-13.png`, `03_How_to_Understand_Others_Better-14.png`, `03_How_to_Understand_Others_Better-15.png`, `03_How_to_Understand_Others_Better-16.png` |  |
| The AI (appreciative inquiry) model (`dm_appreciative`) | 102–103 | `03_How_to_Understand_Others_Better-21.png`, `03_How_to_Understand_Others_Better-22.png` | pp.102–103: positive right, constructive up; schoolteacher top left, AI thinker top right, dictator bottom left, fault-finder bottom right |
| The long-tail model (`dm_long_tail`) | 106–107 | `03_How_to_Understand_Others_Better-25.png`, `03_How_to_Understand_Others_Better-26.png` |  |
| The conflict resolution model (`dm_conflict`) | 108–111 | `03_How_to_Understand_Others_Better-27.png`, `03_How_to_Understand_Others_Better-28.png`, `03_How_to_Understand_Others_Better-29.png`, `03_How_to_Understand_Others_Better-30.png` |  |
| The black swan model (`dm_black_swan`) | 112–113 | `03_How_to_Understand_Others_Better-31.png`, `03_How_to_Understand_Others_Better-32.png` |  |
| The chasm: the diffusion model (`dm_chasm`) | 114–117 | `03_How_to_Understand_Others_Better-33.png`, `03_How_to_Understand_Others_Better-34.png`, `03_How_to_Understand_Others_Better-35.png`, `03_How_to_Understand_Others_Better-36.png` |  |
| The black box model (`dm_black_box`) | 118–119 | `03_How_to_Understand_Others_Better-37.png`, `03_How_to_Understand_Others_Better-38.png` |  |
| The prisoner’s dilemma (`dm_prisoners`) | 120–123 | `03_How_to_Understand_Others_Better-39.png`, `03_How_to_Understand_Others_Better-40.png`, `03_How_to_Understand_Others_Better-41.png`, `03_How_to_Understand_Others_Better-42.png` |  |

- [ ] **Step 4: Commit**

```bash
git add packages/decision-book/models/section-3.mjs
git commit -m "Decision Maker: section 3 models (how to understand others better)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Section 4, How to improve others

**Files:**
- Create: `packages/decision-book/models/section-4.mjs`

- [ ] **Step 1: Write the section's models**

````js
// packages/decision-book/models/section-4.mjs
// How to improve others (pp.126–149): the section's models as tools, including the closing
// essay as a lens. Structure follows the kit's "logic" lines (tested); the coaching words are
// our own.
import { curveTool, listTool, pathTool, quadrantTool, scalesTool, tensionTool } from '../families/index.mjs';

const step = (id, title, prompt) => ({ id, title, prompt });

export const dmTeam = scalesTool({
  id: 'dm_team',
  name: 'The team model',
  when: 'Building or judging a team: name the skills it needs, set the level each needs, and see what the team actually has.',
  failureModes: ['Collapsing different strengths into one team score.', 'Naming only hard skills.'],
  steps: [
    step('skills', 'Name the skills', 'The skills and resources this team needs, hard and soft.'),
    step('needed', 'Set the bar', 'For each, the level the work needs.'),
    step('has', 'Score the team', 'For each, the level the team has; compare it with the bar, skill by skill.')
  ],
  exercise: 'Ask each member to score themselves on the same skills, then compare with your view.',
  pairsWell: ['dm_role_playing', 'dm_hersey_blanchard'],
  chart: {
    mode: 'axes',
    named: { label: 'A skill or resource the team needs' },
    scales: [
      { id: 'skill_one', label: 'First skill' },
      { id: 'skill_two', label: 'Second skill' },
      { id: 'skill_three', label: 'Third skill' },
      { id: 'skill_four', label: 'Fourth skill' },
      { id: 'skill_five', label: 'Fifth skill' }
    ],
    series: [{ id: 'needed', label: 'Needed' }, { id: 'has', label: 'The team has' }]
  }
});

export const dmHerseyBlanchard = quadrantTool({
  id: 'dm_hersey_blanchard',
  name: 'The Hersey–Blanchard model',
  when: 'Leading someone on a task: match how much direction and support you give to how expert and committed they are at that task.',
  failureModes: ['One style for every person.', 'Treating commitment as expertise.'],
  steps: [
    step('person', 'Name the person and task', 'Who, and on what task?'),
    step('place', 'Place your style', 'Direction rises to the right, support upwards. Instructing, coaching, supporting, delegating.'),
    step('path', 'Plan the path', 'As they grow: instruct, then coach, then support, then delegate.')
  ],
  exercise: 'Place each person you lead on their main task and check you are not using one style for all.',
  pairsWell: ['dm_team', 'dm_drexler_sibbet'],
  chart: {
    axes: { x: { label: 'Direction', low: 'Little direction', high: 'Much direction' }, y: { label: 'Support', low: 'Little support', high: 'Much support' } },
    cells: [
      { id: 'supporting', label: 'Supporting', col: 0, row: 0, fill: 'green' },
      { id: 'coaching', label: 'Coaching', col: 1, row: 0, fill: 'tint' },
      { id: 'delegating', label: 'Delegating', col: 0, row: 1, fill: 'ink' },
      { id: 'instructing', label: 'Instructing', col: 1, row: 1, fill: 'red' }
    ],
    item: 'A person and task, placed by the style it needs',
    minItems: 1,
    minCells: 1
  }
});

export const dmRolePlaying = listTool({
  id: 'dm_role_playing',
  name: 'The role-playing model (Belbin and de Bono)',
  when: 'A group decision going round in circles: look at it through six shared thinking hats, and see which team roles are missing.',
  failureModes: ['Giving each person a permanent hat.', 'Skipping the black hat to stay positive.'],
  steps: [
    step('hats', 'Six hats, together', 'Everyone wears the same hat at the same time: facts, feelings, caution, benefits, ideas, process.'),
    step('roles', 'Team roles', 'Which of the nine roles does the team have, and which is missing?')
  ],
  exercise: 'Run the next meeting hat by hat, five minutes each.',
  pairsWell: ['dm_team', 'dm_conflict'],
  chart: {
    layout: 'roles',
    groups: [
      { id: 'white_hat', label: 'White hat', prompt: 'Facts and figures' },
      { id: 'red_hat', label: 'Red hat', prompt: 'Feelings and hunches' },
      { id: 'black_hat', label: 'Black hat', prompt: 'Caution and risks' },
      { id: 'yellow_hat', label: 'Yellow hat', prompt: 'Benefits and hope' },
      { id: 'green_hat', label: 'Green hat', prompt: 'New ideas' },
      { id: 'blue_hat', label: 'Blue hat', prompt: 'Process and summary' },
      { id: 'plant', label: 'Plant', prompt: 'Belbin role' },
      { id: 'resource_investigator', label: 'Resource investigator', prompt: 'Belbin role' },
      { id: 'coordinator', label: 'Co-ordinator', prompt: 'Belbin role' },
      { id: 'shaper', label: 'Shaper', prompt: 'Belbin role' },
      { id: 'monitor_evaluator', label: 'Monitor evaluator', prompt: 'Belbin role' },
      { id: 'teamworker', label: 'Teamworker', prompt: 'Belbin role' },
      { id: 'implementer', label: 'Implementer', prompt: 'Belbin role' },
      { id: 'completer_finisher', label: 'Completer finisher', prompt: 'Belbin role' },
      { id: 'specialist', label: 'Specialist', prompt: 'Belbin role' }
    ],
    entry: 'What one hat brings to the decision, or who fills one role',
    minGroups: 6,
    minEntries: 6
  }
});

export const dmResultOptimisation = pathTool({
  id: 'dm_result_optimisation',
  name: 'The result optimisation model',
  when: 'Work with a deadline: rather than gather, then consolidate, then deliver once, run three complete loops that each finish a version.',
  failureModes: ['One long gathering phase.', 'Loops that do not finish a version.'],
  steps: [
    step('loop', 'Run a loop', 'Gather, consolidate, implement: finish a whole version.'),
    step('repeat', 'Run it again', 'Three loops in the time you have, each better than the last.')
  ],
  exercise: 'Split your next deadline into three equal loops and finish a version in each.',
  pairsWell: ['dm_swiss_cheese', 'dm_drexler_sibbet'],
  chart: {
    variant: 'stages',
    loop: true,
    rounds: 3,
    minRounds: 3,
    subject: 'The work and the time you have',
    stages: [
      { id: 'gather', label: 'Gather' },
      { id: 'consolidate', label: 'Consolidate' },
      { id: 'implement', label: 'Implement' }
    ]
  }
});

export const dmPmTriangle = tensionTool({
  id: 'dm_pm_triangle',
  name: 'The project management triangle',
  when: 'A project that must be good, fast and cheap: you can fix two, and the third will give.',
  failureModes: ['Fixing all three.', 'Not saying what the third corner will cost.'],
  steps: [
    step('corners', 'Each corner', 'What does good, fast and cheap each mean here?'),
    step('fix', 'Fix two', 'Which two will you hold?'),
    step('cost', 'Name the cost', 'What gives on the third?')
  ],
  exercise: 'Tell the people who care which corner is giving, before they find out.',
  pairsWell: ['dm_result_optimisation', 'dm_eisenhower'],
  chart: {
    variant: 'triangle',
    centre: 'The project',
    sides: [
      { id: 'good', label: 'Good', fill: 'green' },
      { id: 'fast', label: 'Fast', fill: 'red' },
      { id: 'cheap', label: 'Cheap', fill: 'ink' }
    ],
    reflection: 'What the third corner will cost'
  }
});

export const dmDrexlerSibbet = pathTool({
  id: 'dm_drexler_sibbet',
  name: 'The Drexler/Sibbet team performance model',
  when: 'A team that is not performing: find the stage it is stuck at, from orientation to renewal, and the question it has not answered.',
  failureModes: ['Forcing the stages as a timetable.', 'Skipping trust to get to the goals.'],
  steps: [
    step('stage', 'Find the stage', 'Which question has the team not yet answered?'),
    step('keys', 'Resolved or not', 'What shows the stage is resolved, and what shows it is not?'),
    step('revisit', 'Go back if needed', 'A team can return to an earlier stage; say which.')
  ],
  exercise: 'Ask each member which question they think is still open.',
  pairsWell: ['dm_hersey_blanchard', 'dm_team'],
  chart: {
    variant: 'stages',
    loop: true,
    rounds: 3,
    subject: 'The team',
    stages: [
      { id: 'orientation', label: 'Orientation: why am I here?' },
      { id: 'trust', label: 'Trust building: who are you?' },
      { id: 'goals', label: 'Goal clarification: what are we doing?' },
      { id: 'commitment', label: 'Commitment: how will we do it?' },
      { id: 'implementation', label: 'Implementation: who does what, when, where?' },
      { id: 'high_performance', label: 'High performance' },
      { id: 'renewal', label: 'Renewal: why continue?' }
    ]
  }
});

export const dmExpectations = curveTool({
  id: 'dm_expectations',
  name: 'The expectations model',
  when: 'You keep being disappointed in someone or something: past a tipping point, higher expectations only make satisfaction fall.',
  failureModes: ['Scoring another person’s worth.', 'Raising the bar after every success.'],
  steps: [
    step('place', 'Place your expectations', 'Are they still achievable, at the tipping point, or past it?'),
    step('relax', 'What could be relaxed?', 'Which expectation could you lower without losing what matters?')
  ],
  exercise: 'Write the one expectation you would drop if you could, and try a week without it.',
  pairsWell: ['dm_potential_trap', 'dm_feedback_analysis'],
  chart: {
    axes: { x: { label: 'How high the expectations' }, y: { label: 'Satisfaction' } },
    lines: [{ id: 'satisfaction', label: '', shape: 'bell' }],
    regions: [
      { id: 'reachable', label: 'Reachable', from: 0, to: 0.42 },
      { id: 'tipping_point', label: 'The tipping point', from: 0.42, to: 0.58 },
      { id: 'too_high', label: 'Too high to meet', from: 0.58, to: 1 }
    ],
    position: 'Where your expectations stand',
    reflection: 'What could be relaxed'
  }
});

export const dmFuture = curveTool({
  id: 'dm_future',
  name: 'How will we decide in the future?',
  tier: 'lens',
  when: 'You are tempted to hand a decision to data or a machine: more data and analysis do not take away the judgement and responsibility that stay with people.',
  failureModes: ['Treating the curves as a forecast.'],
  steps: [step('place', 'Place your decision', 'Where does human judgement still decide in this one?')],
  exercise: 'Name the part of your decision no amount of data would settle.',
  pairsWell: ['dm_black_box', 'dm_hard_choice'],
  chart: {
    axes: { x: { label: 'Time' }, y: { label: 'How much' } },
    lines: [{ id: 'data', label: 'Data available', shape: 'rise' }, { id: 'machines', label: 'Machine analysis', shape: 's' }],
    regions: [{ id: 'now', label: 'Now', from: 0, to: 0.5 }, { id: 'ahead', label: 'Ahead', from: 0.5, to: 1 }],
    position: 'Where judgement still decides',
    reflection: 'Who stays responsible'
  }
});

export const SECTION_4 = Object.freeze({
  dm_team: dmTeam,
  dm_hersey_blanchard: dmHerseyBlanchard,
  dm_role_playing: dmRolePlaying,
  dm_result_optimisation: dmResultOptimisation,
  dm_pm_triangle: dmPmTriangle,
  dm_drexler_sibbet: dmDrexlerSibbet,
  dm_expectations: dmExpectations,
  dm_future: dmFuture
});
````

- [ ] **Step 2: Check it loads**

Run: `node -e "import('./packages/decision-book/models/section-4.mjs').then((m) => console.log(Object.keys(m.SECTION_4).length))"`
Expected: the section's model count (8).

- [ ] **Step 3: Check each model against its pages**

Read each model's page renders from `.db-book/` as images (never the OCR text). Confirm that every label, axis direction, cell position, stage and slot matches the book. Correct the config where it does not, and rewrite any coaching line that drifts from the book's meaning, in our own words: never copy a sentence. The "Already checked" column was confirmed while this plan was drafted. Keep a list of every change for the commit message. The model tests in Task 6 assert the kit's logic lines; if a page contradicts one, the page wins: change the config and that test together, and say so in the commit.

| Model | Pages | Renders to read | Already checked |
| --- | --- | --- | --- |
| The team model (`dm_team`) | 126–127 | `04_How_to_Improve_Others-03.png`, `04_How_to_Improve_Others-04.png` |  |
| The Hersey–Blanchard model (`dm_hersey_blanchard`) | 128–131 | `04_How_to_Improve_Others-05.png`, `04_How_to_Improve_Others-06.png`, `04_How_to_Improve_Others-07.png`, `04_How_to_Improve_Others-08.png` |  |
| The role-playing model (Belbin and de Bono) (`dm_role_playing`) | 132–135 | `04_How_to_Improve_Others-09.png`, `04_How_to_Improve_Others-10.png`, `04_How_to_Improve_Others-11.png`, `04_How_to_Improve_Others-12.png` |  |
| The result optimisation model (`dm_result_optimisation`) | 136–137 | `04_How_to_Improve_Others-13.png`, `04_How_to_Improve_Others-14.png` |  |
| The project management triangle (`dm_pm_triangle`) | 138–139 | `04_How_to_Improve_Others-15.png`, `04_How_to_Improve_Others-16.png` |  |
| The Drexler/Sibbet team performance model (`dm_drexler_sibbet`) | 140–143 | `04_How_to_Improve_Others-17.png`, `04_How_to_Improve_Others-18.png`, `04_How_to_Improve_Others-19.png`, `04_How_to_Improve_Others-20.png` |  |
| The expectations model (`dm_expectations`) | 144–145 | `04_How_to_Improve_Others-21.png`, `04_How_to_Improve_Others-22.png` |  |
| How will we decide in the future? (`dm_future`) | 146–149 | `04_How_to_Improve_Others-23.png`, `04_How_to_Improve_Others-24.png`, `04_How_to_Improve_Others-25.png`, `04_How_to_Improve_Others-26.png` |  |

- [ ] **Step 4: Commit**

```bash
git add packages/decision-book/models/section-4.mjs
git commit -m "Decision Maker: section 4 models (how to improve others)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Register every model, and test them

**Files:**
- Create: `packages/decision-book/models/index.mjs`, `packages/decision-book/work-through.mjs`, `tests/unit/decision-book-models.test.js`, `apps/tasks/tests/unit/decision-book-models-render.test.ts`
- Modify: `packages/problem-solver/tools/index.mjs`, `apps/tasks/tests/unit/helpers/decision-book-charts.ts`, `tests/unit/problem-solver-machine.test.js`, `tests/unit/problem-solver-tools.test.js`, `apps/tasks/tests/unit/problem-solver-glyphs.test.ts`, `tests/unit/decision-book-{steps,http,scripted}.test.js`

- [ ] **Step 1: Write the tests**

The node test covers registration and integrity, the kit's logic lines model by model, and the completion driver:

````js
// tests/unit/decision-book-models.test.js
// Decision Maker's 48 own models (the catalogue's 52 less the four reused Problem Solver tools):
// registration and integrity, each model's "logic" lines from the graphic kit as assertions on
// its config, and a driver that works every model through the real machine to completion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { isComplete, nextSlots } from '../../packages/problem-solver/machine.mjs';
import { workThrough } from '../../packages/decision-book/work-through.mjs';
import { DECISION_TOOLS } from '../../packages/decision-book/models/index.mjs';
import { CATALOGUE, REUSED_TOOL_IDS, catalogueEntry } from '../../packages/decision-book/catalogue.mjs';
import { flowRoute } from '../../packages/decision-book/families/path.mjs';
import { curveAt } from '../../packages/decision-book/curves.mjs';

const T = DECISION_TOOLS;
const cellAt = (id, col, row) => T[id].chart.cells.find((cell) => cell.col === col && cell.row === row);
const cellLabels = (id) => Object.fromEntries(T[id].chart.cells.map((cell) => [`${cell.col}${cell.row}`, cell.label]));
const groupIds = (id) => T[id].chart.groups.map((group) => group.id);

// ---------------------------------------------------------------- integrity

test('every catalogue model has its tool: 48 of ours, 4 reused, registered in the one registry', () => {
  assert.equal(Object.keys(T).length, 48);
  assert.deepEqual(Object.keys(T).sort(), CATALOGUE.filter((entry) => !entry.reuse).map((entry) => entry.id).sort());
  for (const entry of CATALOGUE) assert.ok(TOOLS[entry.id], entry.id);
  for (const id of REUSED_TOOL_IDS) assert.ok(!T[id], `${id} stays Problem Solver's`);
});

test('family, tier and step match the catalogue; Problem Solver never sees them as toolkit tools', () => {
  for (const def of Object.values(T)) {
    const entry = catalogueEntry(def.id);
    assert.equal(def.family, entry.family === 'table' ? undefined : entry.family, `${def.id} family`);
    assert.equal(def.tier, entry.tier, `${def.id} tier`);
    assert.equal(def.step, 'explore', def.id);
    assert.ok(Object.isFrozen(def) && Object.isFrozen(def.chart), def.id);
  }
});

test('every model coaches: a “use it when”, steps, failure modes (two for worksheets), an exercise', () => {
  for (const def of Object.values(T)) {
    assert.match(def.when, /^[A-Z].{30,}[.:a-z]$/, `${def.id} when`);
    assert.ok(def.steps.length >= 1 && def.steps.every((s) => s.id && s.title && s.prompt), `${def.id} steps`);
    assert.ok(!def.steps.some((s) => s.id === 'choose'), `${def.id}: “choose” is Problem Solver's Decide step`);
    assert.ok(def.failureModes.length >= (def.tier === 'lens' ? 1 : 2), `${def.id} failure modes`);
    assert.ok(typeof def.exercise === 'string' && def.exercise.length > 20, `${def.id} exercise`);
    if (def.tier === 'lens') assert.ok(def.steps.length <= 2, `${def.id}: a lens is one idea, one or two steps`);
  }
});

test('our “pairs well with” links resolve, never repeat the book’s own “see also”, never point home', () => {
  for (const def of Object.values(T)) {
    assert.ok(def.pairsWell.length >= 1, def.id);
    const book = catalogueEntry(def.id).seeAlso;
    for (const other of def.pairsWell) {
      assert.ok(catalogueEntry(other), `${def.id} -> ${other}`);
      assert.ok(!book.includes(other), `${def.id} -> ${other} is already the book's`);
      assert.notEqual(other, def.id);
    }
  }
});

test('no number appears in a conceptual curve’s labels', () => {
  for (const def of Object.values(T).filter((d) => d.family === 'curve')) {
    const words = [def.chart.axes.x.label, def.chart.axes.y.label, ...def.chart.regions.map((r) => r.label), ...def.chart.lines.map((l) => l.label)].join(' ');
    assert.doesNotMatch(words, /\d/, def.id);
  }
});

// ---------------------------------------------------------------- the kit's logic lines

test('Eisenhower: importance up, urgency right; this edition’s four labels; do immediately can become tasks', () => {
  const { axes } = T.dm_eisenhower.chart;
  assert.deepEqual([axes.y.high, axes.x.high], ['Important', 'Urgent']);
  assert.deepEqual(cellLabels('dm_eisenhower'), { '00': 'Decide when', '10': 'Do immediately', '01': 'Do later', '11': 'Delegate' });
  assert.equal(T.dm_eisenhower.taskSlots.item({ tag: 'do_now' }), true);
  assert.equal(T.dm_eisenhower.taskSlots.item({ tag: 'decide_when' }), false);
});

test('BCG: share right, growth up; question marks, stars, dogs, cash cows', () => {
  assert.equal(T.dm_bcg_box.chart.axes.x.label, 'Relative market share');
  assert.deepEqual(cellLabels('dm_bcg_box'), { '00': 'Question marks', '10': 'Stars', '01': 'Dogs', '11': 'Cash cows' });
});

test('project portfolio: two separate coordinate systems, never merged; bubble size', () => {
  const [a, b] = T.dm_project_portfolio.chart.plots;
  assert.notDeepEqual(a.axes, b.axes);
  assert.deepEqual([a.axes.x.label, a.axes.y.label, b.axes.x.label, b.axes.y.label], ['Time', 'Cost', 'Main aim served', 'Amount learned']);
  assert.ok(T.dm_project_portfolio.chart.size);
  assert.deepEqual(T.dm_project_portfolio.nodeTags.point, ['cost_time', 'aim_learning']);
});

test('feedback analysis: expected and actual with equal weight, the difference named', () => {
  const { chart } = T.dm_feedback_analysis;
  assert.equal(chart.variant, 'gap');
  assert.deepEqual(chart.sides.map((s) => s.id), ['expected', 'actual']);
  assert.equal(chart.gap, 'The difference');
});

test('Whitmore: fourteen criteria, the book’s Realistic and Time-phased, environmentally sound once', () => {
  const ids = groupIds('dm_whitmore');
  assert.equal(ids.length, 14);
  assert.ok(ids.includes('realistic') && ids.includes('time_phased'));
  assert.equal(ids.filter((id) => id.startsWith('environment')).length, 1);
  assert.deepEqual([...new Set(T.dm_whitmore.chart.groups.map((g) => g.prompt))], ['SMART', 'PURE', 'CLEAR']);
  assert.equal(T.dm_whitmore.chart.minGroups, 14);
});

test('rubber band: holds and pulls, equal arrows with no numeric balance', () => {
  assert.deepEqual(T.dm_rubber_band.chart.sides.map((s) => s.id), ['holds', 'pulls']);
  assert.equal(T.dm_rubber_band.validateScores, undefined);
});

test('feedback box: left calls for change, top was judged good; suggestion is bad but can stay', () => {
  const { axes } = T.dm_feedback_box.chart;
  assert.deepEqual([axes.x.low, axes.y.high], ['Change', 'Good']);
  assert.deepEqual(cellLabels('dm_feedback_box'), { '00': 'Advice', '10': 'Compliment', '01': 'Criticism', '11': 'Suggestion' });
});

test('Yes/No rule: proceed needs all three yeses; any no reaches do not proceed', () => {
  const { stages } = T.dm_yes_no.chart;
  const run = (tags) => ({ nodes: tags.map((tag, i) => ({ id: `n${i}`, slot: ['test_one', 'test_two', 'test_three'][i], tag })) });
  assert.equal(flowRoute(run(['yes', 'yes', 'yes']), stages).at(-1).stage.id, 'proceed');
  for (const tags of [['no'], ['yes', 'no'], ['yes', 'yes', 'no']]) assert.equal(flowRoute(run(tags), stages).at(-1).stage.id, 'stop');
});

test('choice overload: a U, both ends worse than the middle', () => {
  const [line] = T.dm_choice_overload.chart.lines;
  assert.equal(line.shape, 'u');
  assert.ok(curveAt('u', 0.05) > curveAt('u', 0.5) && curveAt('u', 0.95) > curveAt('u', 0.5));
});

test('gap in the market: three dimensions the person names, every pair of them a view', () => {
  const { dimensions, plots } = T.dm_gap_in_market.chart;
  assert.equal(dimensions.length, 3);
  assert.deepEqual(plots.map((p) => `${p.axes.x.dim}/${p.axes.y.dim}`), ['first/second', 'first/third', 'second/third']);
  assert.ok(plots.every((p) => !p.axes.x.label && !p.axes.y.label));
});

test('gift: expense up the side, value along the bottom', () => {
  assert.deepEqual([T.dm_gift.chart.axes.y.label, T.dm_gift.chart.axes.x.label], ['Expense', 'Value to them']);
});

test('consequences: knowledge rises over time, what deciding can change falls', () => {
  const [knowledge, consequences] = T.dm_consequences.chart.lines;
  assert.ok(curveAt(knowledge.shape, 0.9) > curveAt(knowledge.shape, 0.1));
  assert.ok(curveAt(consequences.shape, 0.9) < curveAt(consequences.shape, 0.1));
});

test('unconscious thinking: decide, step away, come back; no timer length', () => {
  assert.deepEqual(T.dm_unconscious.chart.stages.map((s) => s.id), ['first_choice', 'step_away', 'come_back']);
  assert.doesNotMatch(JSON.stringify(T.dm_unconscious.chart), /\d/);
});

test('Stop Rule: goal, then an if, then a then agreed in advance', () => {
  assert.deepEqual(T.dm_stop_rule.chart.stages.map((s) => s.id), ['goal', 'trigger', 'action']);
});

test('buyer’s decision: bounds, five criteria keep three, ten days, months and years, another view', () => {
  assert.deepEqual(T.dm_buyers_decision.chart.stages.map((s) => s.label), ['Bound the search', 'Five criteria, keep three', 'Ten days, ten months, ten years', 'Another view']);
});

test('flow: challenge up, ability right, a diagonal band between them', () => {
  const { axes, band } = T.dm_flow.chart;
  assert.deepEqual([axes.y.label, axes.x.label], ['Challenge', 'Ability']);
  assert.ok(band.diagonal > 0);
});

test('Johari: hidden bottom left and blind top right, never swapped', () => {
  assert.deepEqual(cellLabels('dm_johari'), { '00': 'Open (A)', '10': 'Blind (C)', '01': 'Hidden (B)', '11': 'Unknown (D)' });
  assert.deepEqual([T.dm_johari.chart.axes.x.low, T.dm_johari.chart.axes.y.high], ['Known to me', 'Known to others']);
});

test('cognitive dissonance: belief against behaviour', () => {
  assert.deepEqual(T.dm_dissonance.chart.sides.map((s) => s.id), ['belief', 'behaviour']);
});

test('unimaginable: provable left, imaginable top', () => {
  assert.deepEqual([T.dm_unimaginable.chart.axes.x.low, T.dm_unimaginable.chart.axes.y.high], ['Provable', 'Imaginable']);
});

test('Elbæk: body/mind, form/content, global/local, team/individual, each pair sharing ten; now and wished', () => {
  const { mode, scales, series } = T.dm_elbaek.chart;
  assert.equal(mode, 'pairs');
  assert.deepEqual(scales.map((s) => `${s.low}/${s.high}`), ['Body/Mind', 'Form/Content', 'Global/Local', 'Team/Individual']);
  assert.equal(series.length, 2);
});

test('energy: past, present and future as shares of 100', () => {
  assert.equal(T.dm_energy.chart.mode, 'shares');
  assert.deepEqual(T.dm_energy.chart.scales.map((s) => s.id), ['past', 'present', 'future']);
});

test('political compass: nationalise left, privatise right; authoritarian top, liberal bottom', () => {
  const { axes } = T.dm_political_compass.chart;
  assert.deepEqual([axes.x.low, axes.x.high, axes.y.high, axes.y.low], ['Nationalise', 'Privatise', 'Authoritarian', 'Liberal']);
});

test('personal performance: three independent 1–10 axes, not pairs summing to ten', () => {
  assert.equal(T.dm_performance.chart.mode, 'axes');
  assert.deepEqual(T.dm_performance.chart.scales.map((s) => s.id), ['have_to', 'able_to', 'want_to']);
});

test('making-of: all six lanes, luck recorded explicitly', () => {
  assert.deepEqual(groupIds('dm_making_of'), ['goals', 'learning', 'obstacles', 'successes', 'people', 'luck']);
});

test('potential trap: three distinct series, each its own shape', () => {
  const { lines } = T.dm_potential_trap.chart;
  assert.equal(lines.length, 3);
  assert.equal(new Set(lines.map((l) => l.shape)).size, 3);
});

test('hard choice: comparability up, consequence right; no-brainer, big choice, apples and pears, hard choice', () => {
  assert.deepEqual([T.dm_hard_choice.chart.axes.y.label, T.dm_hard_choice.chart.axes.x.label], ['Comparability', 'Consequence']);
  assert.deepEqual(cellLabels('dm_hard_choice'), { '00': 'No-brainer', '10': 'Big choice', '01': 'Apples and pears', '11': 'Hard choice' });
});

test('cognitive bias: the four named errors, kept separate', () => {
  assert.deepEqual(T.dm_cognitive_bias.chart.groups.map((g) => g.label), ['Anchor effect', 'Confirmation error', 'Availability error', 'Fast/slow error']);
});

test('crossroads: five questions and six roads; the road back is a road, not the past', () => {
  const labels = T.dm_crossroads.chart.groups.map((g) => g.label);
  assert.equal(labels.filter((l) => l.endsWith('?')).length, 5);
  assert.deepEqual(labels.filter((l) => l.startsWith('The ')), ['The road back', 'The familiar road', 'The road not travelled', 'The beckoning road', 'The dream road', 'The sensible road']);
});

test('Rumsfeld: unknown knowns and unknown unknowns on top, known knowns and known unknowns below', () => {
  assert.deepEqual(cellLabels('dm_rumsfeld'), { '00': 'Unknown knowns', '10': 'Unknown unknowns', '01': 'Known knowns', '11': 'Known unknowns' });
});

test('Swiss cheese: layers with holes linked into them', () => {
  assert.equal(T.dm_swiss_cheese.chart.variant, 'layers');
  assert.equal(T.dm_swiss_cheese.requiredLinks.hole.kind, 'in');
});

test('Maslow: five labelled levels, needs upright and wants inverted', () => {
  const levels = (column) => T.dm_maslow.chart.groups.filter((g) => g.column === column).map((g) => g.label);
  assert.deepEqual(levels('needs'), ['Physiological needs', 'Security', 'Social relationships', 'Recognition', 'Self-actualisation']);
  assert.deepEqual(levels('wants'), levels('needs'));
  assert.deepEqual(T.dm_maslow.chart.inverted, ['wants']);
});

test('Sinus and Bourdieu: two maps whose axes are not interchangeable', () => {
  const [sinus, bourdieu] = T.dm_sinus_bourdieu.chart.plots;
  assert.notEqual(sinus.axes.x.label, bourdieu.axes.x.label);
  assert.notEqual(sinus.axes.y.label, bourdieu.axes.y.label);
});

test('AI: positive right, constructive up; the four voices where the book draws them', () => {
  const { axes } = T.dm_appreciative.chart;
  assert.deepEqual([axes.x.high, axes.y.high], ['Positive', 'Constructive']);
  assert.deepEqual(cellLabels('dm_appreciative'), { '00': 'Schoolteacher', '10': 'AI thinker', '01': 'Dictator', '11': 'Fault-finder' });
  assert.equal(cellAt('dm_appreciative', 1, 0).note, '“Yes, and …”');
});

test('long tail: the head first, then a long low tail', () => {
  assert.deepEqual(T.dm_long_tail.chart.regions.map((r) => r.id), ['head', 'tail']);
  assert.ok(curveAt('tail', 0.05) > curveAt('tail', 0.6) * 3);
});

test('conflict: six responses; compromise and consensus are not the same', () => {
  const groups = T.dm_conflict.chart.groups;
  assert.deepEqual(groups.map((g) => g.id), ['flight', 'fight', 'give_up', 'evade', 'compromise', 'consensus']);
  assert.notEqual(groups.find((g) => g.id === 'compromise').prompt, groups.find((g) => g.id === 'consensus').prompt);
});

test('black swan: a calm pattern, then the surprise; no timing', () => {
  assert.equal(T.dm_black_swan.chart.lines[0].shape, 'spike');
  assert.deepEqual(T.dm_black_swan.chart.regions.map((r) => r.id), ['pattern', 'surprise']);
});

test('chasm: between early adopters and the early majority; the late category is sceptics', () => {
  const ids = T.dm_chasm.chart.regions.map((r) => r.id);
  assert.equal(ids[ids.indexOf('chasm') - 1], 'early_adopters');
  assert.equal(ids[ids.indexOf('chasm') + 1], 'early_majority');
  assert.equal(ids.at(-1), 'sceptics');
});

test('prisoner’s dilemma: A down the side, B across; this edition’s 2/2, 10/0, 0/10 and 5/5', () => {
  assert.deepEqual(Object.fromEntries(T.dm_prisoners.chart.cells.map((c) => [`${c.col}${c.row}`, c.note])), {
    '00': 'A 2 years · B 2 years', '10': 'A 10 years · B 0 years', '01': 'A 0 years · B 10 years', '11': 'A 5 years · B 5 years'
  });
  assert.deepEqual([T.dm_prisoners.chart.axes.y.label, T.dm_prisoners.chart.axes.x.label], ['A', 'B']);
});

test('team model: skills the person names, needed against has, never one team score', () => {
  const { chart } = T.dm_team;
  assert.ok(chart.named);
  assert.equal(chart.mode, 'axes');
  assert.deepEqual(chart.series.map((s) => s.id), ['needed', 'has']);
});

test('Hersey–Blanchard: direction right, support up; instructing bottom right, delegating bottom left', () => {
  assert.deepEqual(cellLabels('dm_hersey_blanchard'), { '00': 'Supporting', '10': 'Coaching', '01': 'Delegating', '11': 'Instructing' });
  assert.deepEqual([T.dm_hersey_blanchard.chart.axes.x.label, T.dm_hersey_blanchard.chart.axes.y.label], ['Direction', 'Support']);
});

test('role-playing: six shared hats and nine Belbin roles beside them', () => {
  const ids = groupIds('dm_role_playing');
  assert.equal(ids.filter((id) => id.endsWith('_hat')).length, 6);
  assert.equal(ids.filter((id) => !id.endsWith('_hat')).length, 9);
});

test('result optimisation: three complete gather–consolidate–implement loops', () => {
  const { chart } = T.dm_result_optimisation;
  assert.deepEqual(chart.stages.map((s) => s.id), ['gather', 'consolidate', 'implement']);
  assert.deepEqual([chart.rounds, chart.minRounds], [3, 3]);
});

test('project triangle: good, fast, cheap; pick two', () => {
  assert.deepEqual(T.dm_pm_triangle.chart.sides.map((s) => s.id), ['good', 'fast', 'cheap']);
  assert.equal(T.dm_pm_triangle.chart.variant, 'triangle');
});

test('Drexler/Sibbet: seven stages, and a stage can be revisited', () => {
  assert.equal(T.dm_drexler_sibbet.chart.stages.length, 7);
  assert.equal(T.dm_drexler_sibbet.chart.loop, true);
});

test('expectations: satisfaction rises, then falls past the tipping point', () => {
  const [line] = T.dm_expectations.chart.lines;
  assert.ok(curveAt(line.shape, 0.5) > curveAt(line.shape, 0.1) && curveAt(line.shape, 0.5) > curveAt(line.shape, 0.9));
});

// ---------------------------------------------------------------- every model can be finished

test('every model can be worked to completion through the real machine', () => {
  for (const id of Object.keys(T)) {
    const run = workThrough(id);
    assert.ok(isComplete(run), id);
    assert.deepEqual(nextSlots(run).filter((s) => s === 'reflection'), [], `${id} still offers its reflection once complete`);
  }
});
````

The vitest test draws every model empty and finished, and checks the Task 1 chart options:

````ts
// Every Decision Maker model drawn by its own chart, empty and worked to completion, and the
// chart options Plan 3 adds: dimensions and scales the person names, the diagonal band and the
// inverted pyramid.
import { describe, expect, it } from 'vitest';
import { createChartForTool } from './helpers/decision-book-charts';
import { DECISION_TOOLS } from '../../../../packages/decision-book/models/index.mjs';
import { workThrough } from '../../../../packages/decision-book/work-through.mjs';
import { diagonalBand } from '../../../../packages/decision-book/render/plot';
import type { DmToolRun } from '../../../../packages/decision-book/render/core';

type Tool = { id: string; family: string; chart: Record<string, unknown> };
const TOOLS = DECISION_TOOLS as unknown as Record<string, Tool>;
const empty = (id: string): DmToolRun => ({ id: 'r', tool: id, status: 'active', nodes: [], edges: [] });

describe.each(Object.keys(TOOLS))('%s', (id) => {
  it('draws its frame empty, then every node of a finished run', () => {
    const view = createChartForTool(TOOLS[id]);
    view.update(empty(id));
    expect(view.el.getAttribute('data-state')).toBe('empty');
    expect(view.el.querySelector('.dm-chart__frame')!.children.length).toBeGreaterThan(0);
    const run = workThrough(id, (slot: string, i: number) => `Answer ${i + 1} for ${slot}`) as DmToolRun;
    view.update({ ...run, status: 'done' });
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('Completed');
    for (const node of run.nodes) expect(view.el.querySelector(`.dm-entry[data-node="${node.id}"]`), `${id} ${node.slot}`).not.toBeNull();
  });
});

describe('chart options for the models', () => {
  it('gap in the market: axes and the key use the dimensions the person named', () => {
    const view = createChartForTool(TOOLS.dm_gap_in_market);
    const run = workThrough('dm_gap_in_market', (slot: string) => (slot.startsWith('dimension') ? `Dim ${slot.split(':')[1]}` : `Answer for ${slot}`)) as DmToolRun;
    view.update(run);
    const first = view.el.querySelector('.dm-plot__plot')!;
    expect([...first.querySelectorAll('.dm-plot__axis-label')].map((e) => e.textContent)).toEqual(['Dim 2', 'Dim 1']);
    expect(view.el.querySelectorAll('.dm-plot__dims .dm-entry').length).toBe(3);
    expect(view.el.querySelector('.dm-plot__key-item')!.textContent).toMatch(/Dim 1 \d+, Dim 2 \d+/);
  });

  it('flow: the band runs along the diagonal', () => {
    const view = createChartForTool(TOOLS.dm_flow);
    view.update(empty('dm_flow'));
    const band = view.el.querySelector<HTMLElement>('.dm-plot__band--diagonal')!;
    expect(band.textContent).toBe('Flow');
    expect(band.style.clipPath).toBe(diagonalBand(18));
  });

  it('team model: rows, form fields and radar labels use the skills the person named', () => {
    const view = createChartForTool(TOOLS.dm_team);
    const run = workThrough('dm_team', (slot: string) => (slot.startsWith('scale_name') ? `Skill ${slot.split(':')[1]}` : `Answer for ${slot}`)) as DmToolRun;
    view.update(run);
    expect([...view.el.querySelectorAll('.dm-scales__row-label')].map((e) => e.textContent)).toEqual(['Skill 1', 'Skill 2', 'Skill 3', 'Skill 4', 'Skill 5']);
    expect(view.el.querySelector('.dm-scales__field-label')!.textContent).toBe('Skill 1 (1–10)');
    expect(view.el.querySelectorAll('.dm-scales__names .dm-entry').length).toBe(5);
  });

  it('Maslow: needs upright, wants widest at the top', () => {
    const view = createChartForTool(TOOLS.dm_maslow);
    view.update(empty('dm_maslow'));
    const level = (id: string) => view.el.querySelector<HTMLElement>(`[data-group="${id}"]`)!.style.getPropertyValue('--dm-level');
    expect([level('needs_physiological'), level('needs_self')]).toEqual(['0', '4']);
    expect([level('wants_physiological'), level('wants_self')]).toEqual(['4', '0']);
  });
});
````

Give the helper a renderer lookup by tool:

````diff
diff --git a/apps/tasks/tests/unit/helpers/decision-book-charts.ts b/apps/tasks/tests/unit/helpers/decision-book-charts.ts
index d3bef2c82..95c9060fb 100644
--- a/apps/tasks/tests/unit/helpers/decision-book-charts.ts
+++ b/apps/tasks/tests/unit/helpers/decision-book-charts.ts
@@ -33,7 +33,11 @@ export const CHARTS: string[] = [...Object.keys(TOOLS), 'record'];
 
 export function createChartFor(key: string): ChartView {
   if (key === 'record') return createRecordView();
-  const tool = TOOLS[key];
+  return createChartForTool(TOOLS[key]);
+}
+
+/** The chart for any Decision Book tool definition: its family's renderer, or its own. */
+export function createChartForTool(tool: SampleTool): ChartView {
   const make = BY_ID[tool.id] ?? BY_FAMILY[tool.family];
   return make(tool as never);
 }
````

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/unit/decision-book-models.test.js`
Expected: FAIL, with a module not found error for `models/index.mjs`.

- [ ] **Step 3: Collect the models and write the driver**

````js
// packages/decision-book/models/index.mjs
// Every Decision Book tool Decision Maker owns: the four sections' models and the two bespoke
// lenses, keyed by id. Problem Solver's registry (tools/index.mjs) spreads these in; their
// step, explore, is not a toolkit step, so Problem Solver never lists them. The four reused
// Problem Solver tools (swot, morphological, double_loop, pareto) are not here.
import { SECTION_1 } from './section-1.mjs';
import { SECTION_2 } from './section-2.mjs';
import { SECTION_3 } from './section-3.mjs';
import { SECTION_4 } from './section-4.mjs';
import { dmOutsideBox } from '../tools/outside-box.mjs';
import { dmBlackBox } from '../tools/black-box.mjs';

export const DECISION_TOOLS = Object.freeze({
  ...SECTION_1,
  dm_outside_box: dmOutsideBox,
  ...SECTION_2,
  ...SECTION_3,
  dm_black_box: dmBlackBox,
  ...SECTION_4
});
````

````js
// packages/decision-book/work-through.mjs
// Works a registered tool to completion the way a patient person would: each open slot in
// turn (the reflection last), the least-used tag the tool accepts, the link a slot requires,
// and mid-range scores whenever the tool is waiting for the person's own placing or scoring.
// For tests and the contact sheet; never used in a session.
import { TOOLS } from '../problem-solver/tools/index.mjs';
import { addEdge, applyScores, canEdge, checkNode, isComplete, newRun, nextSlots, placeNode } from '../problem-solver/machine.mjs';
import { parseSlot } from '../problem-solver/slots.mjs';

/** Scores the tool is waiting for: every point in the middle, every series at a valid value. */
function scoreWaiting(run, def) {
  if (def.family === 'plot') {
    const points = Object.fromEntries(run.nodes.filter((n) => parseSlot(n.slot).name === 'point').map((n, i) => [n.id, { x: 2 + ((i * 3) % 8), y: 3 + ((i * 5) % 7), ...(def.chart.size ? { size: 3 + (i % 5) } : {}) }]));
    return applyScores(run, { points }, 'work-through');
  }
  for (const [k, s] of (def.chart.series ?? [{ id: 'now' }]).entries()) {
    const ids = def.chart.scales.map((scale) => scale.id);
    const values = Object.fromEntries(ids.map((id, i) => [id, def.chart.mode === 'shares' ? (i === 0 ? 100 - 15 * (ids.length - 1) : 15) : 2 + ((i * 3 + k * 2) % 8)]));
    run = applyScores(run, { series: s.id, values }, 'work-through');
  }
  return run;
}

/**
 * A completed run of tool `id`. `answer(slot, i)` gives each node's words (default: the slot's
 * own description). Throws if the tool gets stuck or never completes.
 */
export function workThrough(id, answer = (slot) => TOOLS[id].slots[parseSlot(slot).name] ?? slot) {
  const def = TOOLS[id];
  if (!def) throw new Error(`Unknown tool: ${id}`);
  let run = newRun(id, `run-${id}`);
  for (let turn = 0; turn < 160 && !isComplete(run); turn += 1) {
    if (def.awaiting?.(run)) {
      run = scoreWaiting(run, def);
      continue;
    }
    const open = nextSlots(run);
    if (!open.length) throw new Error(`${id} is stuck with nothing open after ${run.nodes.length} nodes`);
    const slot = open.includes('reflection') ? 'reflection' : open[0];
    const name = parseSlot(slot).name;
    const tags = def.nodeTags?.[name] ?? [null];
    const used = (tag) => run.nodes.filter((n) => n.tag === tag).length;
    const nodeId = `n${run.nodes.length + 1}`;
    const kind = def.requiredLinks?.[name]?.kind;
    const linkTo = kind ? run.nodes.find((n) => canEdge({ ...run, nodes: [...run.nodes, { id: '__candidate__', slot }] }, '__candidate__', n.id, kind)) : null;
    const edges = linkTo ? [{ from: slot, to: linkTo.slot, kind }] : [];
    const tag = [...tags].sort((a, b) => used(a) - used(b)).find((t) => !checkNode(run, { slot, text: 'An answer', tag: t ?? undefined }, edges));
    if (tag === undefined) throw new Error(`${id}: no acceptable tag for ${slot}`);
    const text = answer(slot, run.nodes.length);
    run = placeNode(run, { id: nodeId, slot, text, title: text.slice(0, 40), ...(tag ? { tag } : {}), state: 'accepted', skills: [], turnId: null });
    if (linkTo) run = addEdge(run, { from: nodeId, to: linkTo.id, kind });
  }
  if (!isComplete(run)) throw new Error(`${id} did not complete (${run.nodes.length} nodes)`);
  return run;
}
````

- [ ] **Step 4: Register them in the one registry**

````diff
diff --git a/packages/problem-solver/tools/index.mjs b/packages/problem-solver/tools/index.mjs
index 575c1aab0..aae212f0e 100644
--- a/packages/problem-solver/tools/index.mjs
+++ b/packages/problem-solver/tools/index.mjs
@@ -31,6 +31,7 @@ import { doubleLoop } from './double-loop.mjs';
 import { feedbackMatrix } from './feedback-matrix.mjs';
 import { fiveCs } from './five-cs.mjs';
 import { knowledgeManagement } from './knowledge-management.mjs';
+import { DECISION_TOOLS } from '../../decision-book/models/index.mjs';
 
 // The container is not frozen (tests register fakes); every definition is frozen.
 export const TOOLS = {
@@ -65,7 +66,9 @@ export const TOOLS = {
   double_loop: doubleLoop,
   feedback_matrix: feedbackMatrix,
   five_cs: fiveCs,
-  knowledge_management: knowledgeManagement
+  knowledge_management: knowledgeManagement,
+  // Decision Maker's models (step explore, not a toolkit step, so Problem Solver never lists them).
+  ...DECISION_TOOLS
 };
 
 export const TOOL_IDS = Object.freeze(Object.keys(TOOLS));
````

- [ ] **Step 5: Scope Problem Solver's three registry-wide tests to toolkit tools**

The registry now ends with Decision Maker's models. Problem Solver's order, book-step and emblem rules apply to toolkit tools only. The Decide test is left alone: it caught two drafts with a step called `choose`.

````diff
diff --git a/apps/tasks/tests/unit/problem-solver-glyphs.test.ts b/apps/tasks/tests/unit/problem-solver-glyphs.test.ts
index ba17d0bbb..7681c9e46 100644
--- a/apps/tasks/tests/unit/problem-solver-glyphs.test.ts
+++ b/apps/tasks/tests/unit/problem-solver-glyphs.test.ts
@@ -24,10 +24,11 @@ describe('skill glyphs', () => {
 });
 
 describe('tool emblems', () => {
-  it('every tool has an emblem in book colours with no ids', async () => {
+  it('every toolkit tool has an emblem in book colours with no ids', async () => {
     const { toolEmblem } = await import('../../../../packages/problem-solver/glyphs');
     const { TOOLS } = await import('../../../../packages/problem-solver/tools/index.mjs');
-    for (const id of Object.keys(TOOLS) as Array<keyof typeof TOOLS>) {
+    // Decision Maker's models (dm_) carry their own emblems in packages/decision-book/glyphs.
+    for (const id of (Object.keys(TOOLS) as Array<keyof typeof TOOLS>).filter((key) => !String(key).startsWith('dm_'))) {
       const emblem = toolEmblem(id);
       expect(emblem.className).toBe('ps-emblem');
       expect(emblem.getAttribute('aria-hidden')).toBe('true');
diff --git a/tests/unit/problem-solver-machine.test.js b/tests/unit/problem-solver-machine.test.js
index b3b83d87d..3cc914b0e 100644
--- a/tests/unit/problem-solver-machine.test.js
+++ b/tests/unit/problem-solver-machine.test.js
@@ -1,13 +1,15 @@
 // tests/unit/problem-solver-machine.test.js
 import test from 'node:test';
 import assert from 'node:assert/strict';
+import { DECISION_TOOLS } from '../../packages/decision-book/models/index.mjs';
 import { TOOL_IDS, TOOLS as REGISTRY } from '../../packages/problem-solver/tools/index.mjs';
 import { addEdge, applyScores, canEdge, canPropose, checkNode, canPlace, isComplete, newRun, nextSlots, placeNode, toolDef } from '../../packages/problem-solver/machine.mjs';
 
 const node = (id, slot) => ({ id, slot, text: slot, state: 'accepted', skills: [], turnId: 't' });
 
-test('registry lists every tool in order', () => {
-  assert.deepEqual(TOOL_IDS, ['five_whys', 'problem_tree', 'concept_map', 'gap_basic', 'gap_radar', 'problem_statement', 'smart', 'contradiction', 'causal_map', 'perspective_shift', 'radial_tree', 'force_field', 'from_to', 'intent_statement', 'problem_reduction', 'analogical_reasoning', 'solution_tree', 'lotus_blossom', 'duncker', 'decision_matrix', 'swot', 'morphological', 'pareto', 'dmaic', 'fifteen_percent', 'kanban', 'eisenhower', 'after_action_review', 'double_loop', 'feedback_matrix', 'five_cs', 'knowledge_management']);
+test('registry lists every tool in order: the toolkit, then Decision Maker’s models', () => {
+  assert.deepEqual(TOOL_IDS.slice(Object.keys(DECISION_TOOLS).length * -1), Object.keys(DECISION_TOOLS));
+  assert.deepEqual(TOOL_IDS.filter((id) => !id.startsWith('dm_')), ['five_whys', 'problem_tree', 'concept_map', 'gap_basic', 'gap_radar', 'problem_statement', 'smart', 'contradiction', 'causal_map', 'perspective_shift', 'radial_tree', 'force_field', 'from_to', 'intent_statement', 'problem_reduction', 'analogical_reasoning', 'solution_tree', 'lotus_blossom', 'duncker', 'decision_matrix', 'swot', 'morphological', 'pareto', 'dmaic', 'fifteen_percent', 'kanban', 'eisenhower', 'after_action_review', 'double_loop', 'feedback_matrix', 'five_cs', 'knowledge_management']);
   assert.throws(() => toolDef('nope'), /Unknown tool/);
 });
 
diff --git a/tests/unit/problem-solver-tools.test.js b/tests/unit/problem-solver-tools.test.js
index c74c1e8e4..4e044e01d 100644
--- a/tests/unit/problem-solver-tools.test.js
+++ b/tests/unit/problem-solver-tools.test.js
@@ -64,8 +64,9 @@ test('smart: problem, then the five letters in any order', () => {
   assert.ok(smart.complete(run('smart', ['problem', 's', 'm', 'a', 'r', 't'])));
 });
 
-test('every tool names its book step and at least two failure modes', () => {
-  for (const tool of Object.values(TOOLS)) {
+test('every toolkit tool names its book step and at least two failure modes', () => {
+  // Decision Maker's models (dm_) step through explore; decision-book-models.test.js checks them.
+  for (const tool of Object.values(TOOLS).filter((def) => !def.id.startsWith('dm_'))) {
     assert.ok(BOOK_STEP_IDS.includes(tool.step), `${tool.id}.step`);
     assert.ok(Array.isArray(tool.failureModes) && tool.failureModes.length >= 2, `${tool.id}.failureModes`);
     for (const line of tool.failureModes) assert.equal(typeof line, 'string');
````

- [ ] **Step 6: Update Plan 1's expectations: Explore now offers the whole catalogue**

Eisenhower, the catalogue's first model, is now the first Explore suggestion, where SWOT was while only the reused tools existed.

````diff
diff --git a/tests/unit/decision-book-http.test.js b/tests/unit/decision-book-http.test.js
index 951297eeb..8973835ab 100644
--- a/tests/unit/decision-book-http.test.js
+++ b/tests/unit/decision-book-http.test.js
@@ -44,7 +44,7 @@ test('a decision is created, framed in three answers and opens Explore', async (
   }
   assert.equal(s.phase, 'explore');
   assert.equal(s.model.id, 'decision_book');
-  assert.equal(s.suggestion.tool, 'swot');
+  assert.equal(s.suggestion.tool, 'dm_eisenhower');
   const list = (await call('GET', null, '?list=1')).data.sessions;
   assert.equal(list[0].kind, 'decision');
 });
diff --git a/tests/unit/decision-book-scripted.test.js b/tests/unit/decision-book-scripted.test.js
index f306d889c..bbdbbc1b6 100644
--- a/tests/unit/decision-book-scripted.test.js
+++ b/tests/unit/decision-book-scripted.test.js
@@ -19,7 +19,7 @@ test('the scripted coach frames a decision and suggests the first Explore model'
   assert.equal(s.frame.compass, 'self_understand');
   s = await step(s, 'The offer closes Friday and the rent there is double.');
   assert.equal(s.phase, 'explore');
-  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'swot', reason: 'A first model with clear sides to weigh.' });
+  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'dm_eisenhower', reason: 'A first model with clear sides to weigh.' });
 });
 
 test('talk of a team or other people lands on the others side of the compass', async () => {
diff --git a/tests/unit/decision-book-steps.test.js b/tests/unit/decision-book-steps.test.js
index 1b934ea09..5a3494092 100644
--- a/tests/unit/decision-book-steps.test.js
+++ b/tests/unit/decision-book-steps.test.js
@@ -4,6 +4,7 @@ import assert from 'node:assert/strict';
 import { defaultToolFor, firstStep, nextStepAfter, stepName, stepPlan, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
 import { MODEL_IDS } from '../../packages/problem-solver/models.mjs';
 import { DECISION_MODEL } from '../../packages/decision-book/model.mjs';
+import { CATALOGUE_IDS } from '../../packages/decision-book/catalogue.mjs';
 
 test('decision_book plans Explore, Decide and an extra Review', () => {
   assert.deepEqual(stepPlan('decision_book').map((s) => [s.step, s.extra]), [['explore', false], ['decide', false], ['review', true]]);
@@ -13,9 +14,8 @@ test('decision_book plans Explore, Decide and an extra Review', () => {
   assert.equal(stepName('decision_book', 'review'), 'Review');
 });
 
-test('Explore offers the registered catalogue models in catalogue order, with no default', () => {
-  // Until Plan 3 registers the dm_ tools, only the four reused Problem Solver tools exist.
-  assert.deepEqual(toolsForPlanStep('decision_book', 'explore'), ['swot', 'morphological', 'double_loop', 'pareto']);
+test('Explore offers every catalogue model in catalogue order, with no default', () => {
+  assert.deepEqual(toolsForPlanStep('decision_book', 'explore'), [...CATALOGUE_IDS]);
   assert.equal(defaultToolFor('decision_book', 'explore'), null);
 });
 
````

- [ ] **Step 7: Run everything**

Run: `node --test tests/unit/decision-book-*.test.js tests/unit/problem-solver-*.test.js`
Expected: PASS (488 when drafted, 51 of them model tests).

Run: `cd apps/tasks && npx vitest run tests/unit/decision-book tests/unit/problem-solver`
Expected: PASS (1,033 when drafted).

Then check Problem Solver's prompt never lists the models. The prompt lists tools by toolkit step only, so `grep -n "toolsForBookStep\|TOOLS\[" netlify/functions/_shared/problem-solver/prompts.mjs` must show no loop over `Object.values(TOOLS)`.

- [ ] **Step 8: Commit**

```bash
git add packages/decision-book/models/index.mjs packages/decision-book/work-through.mjs packages/problem-solver/tools/index.mjs tests/unit apps/tasks/tests/unit
git commit -m "Decision Maker: register the 48 models; logic, completion and rendering tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Every model on the contact sheet

**Files:**
- Modify: `packages/decision-book/contact-sheet.ts`, `docs/mockups/decision-maker/contact-sheet.html`

- [ ] **Step 1: Add the models row**

````diff
diff --git a/docs/mockups/decision-maker/contact-sheet.html b/docs/mockups/decision-maker/contact-sheet.html
index cd5dd78b4..1c97e0e12 100644
--- a/docs/mockups/decision-maker/contact-sheet.html
+++ b/docs/mockups/decision-maker/contact-sheet.html
@@ -14,6 +14,7 @@
   .sheet__row { padding: 16px 24px; border-bottom: 1px solid #c9cabd; }
   .sheet__row h2 { margin: 0 0 12px; font-size: 16px; }
   .sheet__cells { display: flex; gap: 20px; overflow-x: auto; align-items: flex-start; padding-bottom: 8px; }
+  .sheet__cells--wrap { flex-wrap: wrap; overflow-x: visible; }
   .sheet__cell { flex: none; margin: 0; padding: 14px 16px; border: 1px solid #c9cabd; border-radius: 18px; background: #fff; }
   .sheet__cell figcaption { margin-bottom: 10px; font: 600 11px/1.4 Inter, sans-serif; text-transform: uppercase; letter-spacing: 0.06em; color: #66675d; }
 </style>
@@ -21,7 +22,7 @@
 <body class="ps-scope dm-scope">
 <header>
   <h1>Decision Maker charts</h1>
-  <p>Every chart family on invented sample runs: empty, partial and full at desktop width, then full at 390px. The last row is the four reused Problem Solver charts in this palette.</p>
+  <p>Every chart family on invented sample runs: empty, partial and full at desktop width, then full at 390px. Then the four reused Problem Solver charts in this palette, and every Decision Maker model worked through with placeholder answers.</p>
 </header>
 <main id="sheet"></main>
 <script type="module" src="contact-sheet.js"></script>
diff --git a/packages/decision-book/contact-sheet.ts b/packages/decision-book/contact-sheet.ts
index a689a8125..a30679dc6 100644
--- a/packages/decision-book/contact-sheet.ts
+++ b/packages/decision-book/contact-sheet.ts
@@ -1,6 +1,7 @@
 // packages/decision-book/contact-sheet.ts
 // The contact sheet: every Decision Book chart, empty, partial and full, at desktop width and
-// at 390px, then the four reused Problem Solver charts in the Decision Maker palette. Built by
+// at 390px, then the four reused Problem Solver charts in the Decision Maker palette, then every
+// Decision Maker model worked through (work-through.mjs). Built by
 // scripts/build-decision-book-contact-sheet.mjs into docs/mockups/decision-maker/; for one
 // look by Adam, not shipped in the app.
 import '../design-kit/tokens.css';
@@ -23,6 +24,9 @@ import { createParetoView } from '../problem-solver/render/pareto';
 import { createMorphologicalView } from '../problem-solver/render/morphological';
 import { createDoubleLoopView } from '../problem-solver/render/double-loop';
 import type { PsToolRun } from '../problem-solver/types';
+import { DECISION_TOOLS } from './models/index.mjs';
+import { workThrough } from './work-through.mjs';
+import { CATALOGUE } from './catalogue.mjs';
 
 type Sample = { id: string; name: string; family: string };
 const TOOLS = SAMPLE_TOOLS as unknown as Record<string, Sample>;
@@ -106,3 +110,21 @@ for (const [title, view, run] of reused) {
 }
 section.append(heading, row);
 sheet.append(section);
+
+// Every Decision Maker model, worked through by the patient driver, in book order.
+
+const models = document.createElement('section');
+models.className = 'sheet__row';
+const modelsHeading = document.createElement('h2');
+modelsHeading.textContent = 'Every model, worked through (placeholder answers)';
+const modelsRow = document.createElement('div');
+modelsRow.className = 'sheet__cells sheet__cells--wrap';
+for (const entry of CATALOGUE) {
+  const tool = (DECISION_TOOLS as unknown as Record<string, Sample>)[entry.id];
+  if (!tool) continue;
+  const view = tool.id === 'dm_outside_box' ? createOutsideBoxView(tool as never) : tool.id === 'dm_black_box' ? createBlackBoxView(tool as never) : BY_FAMILY[tool.family](tool as never);
+  view.update(workThrough(tool.id, (slot: string, i: number) => `Answer ${i + 1}`) as DmToolRun);
+  modelsRow.append(cell(`${entry.section}. ${tool.name}`, '560px', view));
+}
+models.append(modelsHeading, modelsRow);
+sheet.append(models);
````

- [ ] **Step 2: Build and check**

Run: `node scripts/build-decision-book-contact-sheet.mjs`. Serve it as in Plan 2 Task 5 and open it at 2,400px wide. Check that the console has no errors, that Plan 2's overflow check returns `[]` and that the last row holds 48 charts.

- [ ] **Step 3: Commit, capture and send**

```bash
git add packages/decision-book/contact-sheet.ts docs/mockups/decision-maker/contact-sheet.html
git commit -m "Decision Maker: every model on the contact sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Capture the sheet as in Plan 2 Task 5 (make the window taller: about 20,000px) and send it to Adam with the list of page-check corrections from Tasks 2–5.

---

### Task 8: Plan 3 check

- [ ] **Step 1:** `npm run test:unit`: PASS (5,660 when drafted).
- [ ] **Step 2:** `cd apps/tasks && npx vitest run tests/unit/problem-solver tests/unit/decision-book`: PASS.
- [ ] **Step 3:** `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep -E "problem-solver|decision-book" | grep -v "TS6059\|Imported via\|rootDir" || echo "no problem-solver or decision-book errors"`
- [ ] **Step 4:** Do not push. Update `decision-book-tool.md` with "Plan 3 done (HEAD <sha>)" and the page-check corrections.

---

## Notes for Plan 4

- **Coach knowledge:** each tool now carries `when`, `steps`, `failureModes`, `exercise`, `pairsWell` and `tier`.
  - **Catalogue lines:** build them from `CATALOGUE` and each tool's `when`. The book's "see also" and our `pairsWell` stay separate.
  - **Per-model note:** for the active model, send `steps`, its slots, `failureModes` and `exercise`.
- **Awaiting:** plot and scales tools have `awaiting()`. The prompt already passes it as "Waiting on", so the coach waits while the person places or scores.
- **Canvas:** map a run to its chart by `TOOLS[run.tool].family`, with the two one-offs by id, as `apps/tasks/tests/unit/helpers/decision-book-charts.ts` already does.
- **Tasks:** `dm_eisenhower` has `taskSlots`, so "do immediately" items can become tasks through Problem Solver's proposal flow.
- **Companions the spec names:** SCAMPER beside the morphological box, and espoused theory against theory in use beside double-loop learning. They belong in the per-model notes for those reused tools, not in new slots.
