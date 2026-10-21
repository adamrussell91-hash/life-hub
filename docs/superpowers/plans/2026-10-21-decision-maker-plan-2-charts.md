# Decision Maker Plan 2: Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every chart Decision Maker needs, before any model is configured:
- seven family tool factories that meet Problem Solver's tool contract;
- one chart core and eight family renderers (the decision record is the eighth), plus the two bespoke charts (the nine-dot puzzle and the black box);
- the kit's entry states, phone reflow at 480px and under, labels never under 11px;
- the four reused Problem Solver charts in the Decision Maker palette;
- one contact sheet for Adam to look at once.

**Architecture:**
- **Factories** (`packages/decision-book/families/*.mjs`) turn a model config into a frozen tool definition with `step: 'explore'`. `step: 'explore'` is not a toolkit step, so Problem Solver's shelves, plans and prompts never list these tools. Config errors throw at import, naming the tool. Plot and scales take their numbers through Problem Solver's existing scores mechanism (`pickScores`, `validateScores`, `awaiting`, `applyScores`), so the person places and scores with the chart's own controls and the coach waits, as the force field does today.
- **One chart core** (`render/core.ts`) owns everything about entries, the same way for every family. That covers one pill per node kept as the same element across updates, the details card (Problem Solver's disclosure group and `detailsCard`), contested marks (`syncContested`), task tags and proposals, FLIP moves and drop-ins after the first paint, the kit's states in words, and the subject and reflection boxes. Each family renderer only draws its frame and returns where each node goes (an `EntrySpec`). This is why eight renderers come to about 1,200 lines in all, where Problem Solver's average about 440 each.
- **`DmToolRun`** is Problem Solver's run with `tool: string`. `PsToolId` stays Problem Solver's own closed union: widening it breaks seven places that index the tool registry by id (found by the Tasks type-check while this plan was drafted).
- **The re-skin** remaps Problem Solver's three book tokens inside `.dm-scope` for the four reused charts only: red stays red, blue becomes ink, yellow becomes green with ink text. White text on DM red is 3.8:1, so the eleven selectors that put white on red turn ink (4.6:1). A contrast test enforces this. No reused chart needed the fallback to a family renderer.

**Tech stack:** Node ESM (`.mjs`) with `node:test` for the factories and the stylesheet (root `tests/unit`). TypeScript renderers with vitest and happy-dom in `apps/tasks/tests/unit`. esbuild (from `apps/tasks`) bundles the contact sheet.

**Spec:** `docs/superpowers/specs/2026-10-21-decision-book-design.md` ("Diagrams").
**Plan 1:** `docs/superpowers/plans/2026-10-21-decision-maker-plan-1-foundations.md` (done).
**Branch and worktree:** `claude/decision-book` in `/Users/adamrussell/Projects/life-hub-decision-book`. Run every command from that worktree's root unless a step says otherwise.
**Before starting:** run `npm ci` at the worktree root and in `apps/tasks`. The Tasks Vite config loads the mock API, which needs the root packages. The worktree has neither installed.

**How this plan was made:** every file below was drafted in the worktree and its tests run green before the plan was written: 17 factory tests, 5 stylesheet tests, 205 chart tests, 437 node tests and 981 Problem Solver and Decision Book vitest tests in all. The Tasks type-check showed no errors in these paths. The drafts were then removed, so the code here is the code that passed.

**Public repo rule:** the fixtures and the contact sheet use invented content only. No book text.

---

## File structure

| File | Responsibility |
| --- | --- |
| `packages/decision-book/families/common.mjs` | Config checks, the frozen tool shell, the optional `subject` and the closing `reflection` slots |
| `packages/decision-book/families/{quadrant,plot,scales,curve,tension,path,list}.mjs` | The seven factories and their helpers (`itemsByCell`, `positionsOf`, `valuesOf`, `flowRoute`, `roundOf`, `entriesByGroup`) |
| `packages/decision-book/families/index.mjs` | `FAMILY_FACTORIES`, keyed by the catalogue's `family` |
| `packages/decision-book/curves.mjs` | Conceptual curve shapes (no data, no numbers) |
| `packages/decision-book/record-slots.mjs` | The decision record's slots: the contract between its chart (now) and the Decide tool (Plan 4) |
| `packages/decision-book/tools/{outside-box,black-box}.mjs` | The two bespoke lens tools (registered in Plan 3) |
| `packages/decision-book/fixtures.mjs` | Sample tools and empty, partial and full runs per family, for tests and the contact sheet |
| `packages/decision-book/render/core.ts` | The chart core and `DmToolRun` |
| `packages/decision-book/render/{quadrant,plot,scales,curve,tension,path,list,record,outside-box,black-box}.ts` | The renderers |
| `packages/decision-book/decision-book.css` (modify) | Chart styles, phone rules, the re-skin |
| `packages/decision-book/contact-sheet.ts`, `scripts/build-decision-book-contact-sheet.mjs`, `docs/mockups/decision-maker/contact-sheet.html` | The contact sheet |
| `.gitignore` (modify) | The contact sheet's built `.js` and `.css` |
| `tests/unit/decision-book-families.test.js`, `tests/unit/decision-book-css.test.js` | Factory and stylesheet tests |
| `apps/tasks/tests/unit/decision-book-charts.test.ts`, `decision-book-family-charts.test.ts`, `helpers/decision-book-charts.ts` | The chart contract suite (run against all 16 charts) and each family's own tests |

---

### Task 1: Family factories, the one-off tools and the fixtures

**Files:**
- Create: everything under `packages/decision-book/families/`, `packages/decision-book/curves.mjs`, `packages/decision-book/record-slots.mjs`, `packages/decision-book/tools/outside-box.mjs`, `packages/decision-book/tools/black-box.mjs`, `packages/decision-book/fixtures.mjs`
- Test: `tests/unit/decision-book-families.test.js`

The fixtures sit in this task because the factory tests build on them. The tests register the sample tools in Problem Solver's registry for the file's duration (the registry is left unfrozen for this) and drive them through the real machine: `placeNode`, `checkNode`, `addEdge` and `applyScores`.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/decision-book-families.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';
import { addEdge, applyScores, checkNode, isComplete, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { FAMILY_FACTORIES, curveTool, listTool, pathTool, plotTool, quadrantTool, scalesTool, tensionTool } from '../../packages/decision-book/families/index.mjs';
import { itemsByCell } from '../../packages/decision-book/families/quadrant.mjs';
import { positionsOf } from '../../packages/decision-book/families/plot.mjs';
import { valuesOf } from '../../packages/decision-book/families/scales.mjs';
import { flowRoute } from '../../packages/decision-book/families/path.mjs';
import { entriesByGroup } from '../../packages/decision-book/families/list.mjs';
import { CHASM_GAP, CURVE_IDS, curveAt, curvePoints } from '../../packages/decision-book/curves.mjs';
import { SAMPLE_TOOLS, sampleNode, sampleRun } from '../../packages/decision-book/fixtures.mjs';

// The machine looks tools up in the registry; register the samples for this file only.
for (const def of Object.values(SAMPLE_TOOLS)) TOOLS[def.id] = def;
test.after(() => {
  for (const def of Object.values(SAMPLE_TOOLS)) delete TOOLS[def.id];
});

const T = SAMPLE_TOOLS;
const place = (run, id, slot, text, extra = {}) => placeNode(run, sampleNode(id, slot, text, extra));
const AT = '2026-10-21T10:00:00.000Z';

test('seven factories, keyed by catalogue family', () => {
  assert.deepEqual(Object.keys(FAMILY_FACTORIES), ['quadrant', 'plot', 'scales', 'curve', 'tension', 'path', 'list']);
});

test('every sample tool meets the shared contract', () => {
  for (const def of Object.values(T)) {
    assert.ok(Object.isFrozen(def) && Object.isFrozen(def.chart), def.id);
    assert.equal(def.step, 'explore', def.id);
    assert.ok(def.id.startsWith('dm_'), def.id);
    for (const key of ['name', 'when', 'steps', 'slots', 'edgeKinds', 'nextSlots', 'complete']) assert.ok(def[key], `${def.id} ${key}`);
    assert.equal(isComplete(sampleRun(def.id)), false, def.id);
  }
});

test('a bad config fails at build time, naming the tool', () => {
  const base = { id: 'dm_bad', name: 'Bad', when: 'never', steps: [{ id: 's', title: 's', prompt: 'p' }] };
  const axes = { x: { label: 'X', low: 'l', high: 'h' }, y: { label: 'Y', low: 'l', high: 'h' } };
  const cell = (id, col, row) => ({ id, label: id, col, row, fill: 'red' });
  assert.throws(() => quadrantTool({ ...base, chart: { axes, item: 'i', cells: [cell('a', 0, 0), cell('b', 0, 0), cell('c', 1, 0), cell('d', 1, 1)] } }), /dm_bad: cells must fill the four places once/);
  assert.throws(() => quadrantTool({ ...base, chart: { axes, item: 'i', cells: [cell('a', 0, 0), cell('b', 0, 1), cell('c', 1, 0), { ...cell('d', 1, 1), fill: 'yellow' }] } }), /fill must be one of/);
  assert.throws(() => quadrantTool({ ...base, id: 'bad', chart: {} }), /ids start with dm_/);
  assert.throws(() => curveTool({ ...base, chart: { axes, lines: [{ id: 'm', shape: 'u' }], regions: [{ id: 'a', label: 'A', from: 0, to: 0.5 }, { id: 'b', label: 'B', from: 0.6, to: 1 }], position: 'p' } }), /must start where the last ended/);
  assert.throws(() => pathTool({ ...base, chart: { variant: 'flow', stages: [{ id: 'a', label: 'A', kind: 'question', yes: 'b', no: 'a' }, { id: 'b', label: 'B', kind: 'end' }] } }), /loops back to a/);
  assert.throws(() => scalesTool({ ...base, chart: { mode: 'shares', layout: 'radar', scales: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }] } }), /radar needs axes mode/);
  assert.throws(() => tensionTool({ ...base, chart: { variant: 'pull', centre: 'c', sides: [{ id: 'a', label: 'A', fill: 'red' }] } }), /a pull has 2 sides/);
  assert.throws(() => listTool({ ...base, chart: { layout: 'rows', groups: [{ id: 'a', label: 'A', column: 'x' }, { id: 'b', label: 'B', column: 'y' }], entry: 'e' } }), /columns belong to pyramid or lanes/);
  assert.throws(() => plotTool({ ...base, chart: { axes, point: 'p', band: { label: 'b', x: [0, 5], y: [1, 2] } } }), /band needs a label and 1–10 bounds/);
});

test('quadrant: items tagged by cell; axis direction lives in the cells; reflection after two cells', () => {
  const def = T.quadrant;
  const top = def.chart.cells.filter((cell) => cell.row === 0).map((cell) => cell.id);
  assert.deepEqual(top, ['quick_win', 'big_bet']);
  assert.equal(def.chart.cells.find((cell) => cell.col === 1 && cell.row === 0).id, 'big_bet');
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['item:1']);
  assert.match(checkNode(run, { slot: 'item:1', text: 'x' }), /needs a tag: one of quick_win, big_bet, filler, drain/);
  run = place(run, 'a', 'item:1', 'One', { tag: 'quick_win' });
  run = place(run, 'b', 'item:2', 'Two', { tag: 'quick_win' });
  run = place(run, 'c', 'item:3', 'Three', { tag: 'quick_win' });
  assert.deepEqual(nextSlots(run), ['item:4'], 'one cell is not enough');
  run = place(run, 'd', 'item:4', 'Four', { tag: 'drain' });
  assert.deepEqual(nextSlots(run), ['item:5', 'reflection']);
  assert.equal(isComplete(run), false);
  run = place(run, 'e', 'reflection', 'So what');
  assert.deepEqual(nextSlots(run), []);
  assert.equal(isComplete(run), true);
  assert.deepEqual(Object.fromEntries(Object.entries(itemsByCell(run, def.chart)).map(([k, v]) => [k, v.length])), { quick_win: 3, big_bet: 0, filler: 0, drain: 1 });
});

test('quadrant: an optional subject comes first', () => {
  const def = quadrantTool({ ...T.quadrant, chart: { ...structuredClone(T.quadrant.chart), subject: 'What is being sorted' } });
  assert.deepEqual(def.nextSlots(sampleRun(def.id)), ['subject']);
  assert.equal(def.slots.subject, 'What is being sorted');
  assert.deepEqual(Object.keys(def.slots), ['subject', 'item', 'reflection']);
});

test('plot: the person places points by score snapshots, merged in order', () => {
  const def = T.plot;
  let run = sampleRun(def.id);
  run = place(run, 'a', 'point:1', 'Night class');
  run = place(run, 'b', 'point:2', 'Weekend trip');
  assert.match(def.awaiting(run), /places each point/);
  assert.deepEqual(nextSlots(run), ['point:3']);
  assert.throws(() => applyScores(run, { points: { a: { x: 0, y: 3 } } }, AT), /run from 1 to 10/);
  assert.throws(() => applyScores(run, { points: { zz: { x: 2, y: 3 } } }, AT), /Only placed points/);
  run = applyScores(run, { points: { a: { x: 2, y: 9, size: 4 } } }, AT);
  assert.ok(def.awaiting(run), 'b is not placed yet');
  run = applyScores(run, { points: { b: { x: 8, y: 6 } } }, AT);
  run = applyScores(run, { points: { a: { x: 3, y: 9 } } }, AT);
  assert.deepEqual(positionsOf(run), { a: { x: 3, y: 9, size: 4 }, b: { x: 8, y: 6 } });
  assert.equal(def.awaiting(run), null);
  assert.deepEqual(nextSlots(run), ['point:3', 'reflection']);
});

test('plot: several plots tag their points and never need a size', () => {
  const axes = (a) => ({ x: { label: `${a}x`, low: 'l', high: 'h' }, y: { label: `${a}y`, low: 'l', high: 'h' } });
  const def = plotTool({ id: 'dm_two_plots', name: 'Two', when: 'w', steps: [{ id: 's', title: 's', prompt: 'p' }], chart: { point: 'p', plots: [{ id: 'cost', label: 'Cost', axes: axes('c') }, { id: 'learning', label: 'Learning', axes: axes('l') }] } });
  assert.deepEqual(def.nodeTags, { point: ['cost', 'learning'] });
  const run = { ...sampleRun(def.id), nodes: [sampleNode('a', 'point:1', 'A', { tag: 'cost' })] };
  assert.match(def.validateScores(run, { points: { a: { x: 2, y: 2, size: 3 } } }), /no bubble size/);
});

test('scales: pairs share ten, axes run 1–10, shares sum to 100; reflection once every series is scored', () => {
  const pairs = T.scales;
  let run = sampleRun(pairs.id);
  assert.match(pairs.awaiting(run), /scores now and wanted/);
  assert.throws(() => applyScores(run, { series: 'now', values: { pace: 11, scope: 5, company: 5 } }, AT), /shares 10 points/);
  assert.throws(() => applyScores(run, { series: 'now', values: { pace: 2, scope: 5 } }, AT), /every scale/);
  assert.throws(() => applyScores(run, { series: 'later', values: { pace: 2, scope: 5, company: 5 } }, AT), /Score one of: now, wanted/);
  run = applyScores(run, { series: 'now', values: { pace: 2, scope: 5, company: 8 } }, AT);
  assert.deepEqual(nextSlots(run), ['note:1']);
  run = applyScores(run, { series: 'wanted', values: { pace: 6, scope: 4, company: 4 } }, AT);
  run = applyScores(run, { series: 'now', values: { pace: 3, scope: 5, company: 8 } }, AT);
  assert.deepEqual(valuesOf(run), { now: { pace: 3, scope: 5, company: 8 }, wanted: { pace: 6, scope: 4, company: 4 } });
  assert.deepEqual(nextSlots(run), ['note:1', 'reflection']);
  assert.match(checkNode(run, { slot: 'note:1', text: 'x', tag: 'mood' }), /one of pace, scope, company/);
  assert.match(T.radar.validateScores(sampleRun(T.radar.id), { series: 'now', values: { calm: 0, focus: 2, energy: 2, sleep: 2 } }), /1 to 10/);
  assert.match(T.shares.validateScores(sampleRun(T.shares.id), { series: 'now', values: { work: 50, home: 30, play: 10 } }), /add up to 100/);
  assert.equal(T.shares.validateScores(sampleRun(T.shares.id), { series: 'now', values: { work: 60, home: 30, play: 10 } }), null);
});

test('curve: one position tagged by region, notes optional, reflection after the position', () => {
  const def = T.curve;
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['position', 'note:1']);
  assert.match(checkNode(run, { slot: 'position', text: 'x' }), /one of few, enough, many/);
  run = place(run, 'p', 'position', 'Twelve flats', { tag: 'many' });
  assert.deepEqual(nextSlots(run), ['note:1', 'reflection']);
  run = place(run, 'r', 'reflection', 'Cut to three');
  assert.equal(isComplete(run), true);
});

test('curve shapes are ideas, not data: bounded, and the U is high at both ends', () => {
  for (const id of CURVE_IDS) for (const [, h] of curvePoints(id, 20)) assert.ok(h >= 0 && h <= 1, id);
  assert.ok(curveAt('u', 0) > curveAt('u', 0.5) && curveAt('u', 1) > curveAt('u', 0.5));
  assert.ok(curveAt('rise', 1) > curveAt('rise', 0));
  assert.ok(curveAt('tail', 0) > curveAt('tail', 0.6));
  assert.ok(curveAt('spike', 0.82) > curveAt('spike', 0.4) + 0.5);
  assert.deepEqual(CHASM_GAP, [0.3, 0.36]);
  assert.equal(curvePoints('s', 4).length, 5);
  assert.throws(() => curvePoints('zigzag'), /Unknown curve shape/);
});

test('tension: centre first, a force on every side, then reflection; equal sides have no scores', () => {
  const def = T.tension;
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['centre']);
  assert.equal(def.validateScores, undefined);
  run = place(run, 'c', 'centre', 'Staying');
  run = place(run, 'a', 'force:1', 'Team', { tag: 'holds' });
  assert.deepEqual(nextSlots(run), ['force:2']);
  run = place(run, 'b', 'force:2', 'Role', { tag: 'pulls' });
  assert.deepEqual(nextSlots(run), ['force:3', 'reflection']);
});

test('tension triangle: fix exactly `pick` distinct corners', () => {
  const def = T.triangle;
  let run = place(sampleRun(def.id), 'c', 'centre', 'Refit');
  for (const [i, side] of ['fast', 'good', 'cheap'].entries()) run = place(run, `f${i}`, `force:${i + 1}`, side, { tag: side });
  assert.ok(nextSlots(run).includes('fix:1'));
  run = place(run, 'x1', 'fix:1', 'Quality', { tag: 'good' });
  assert.match(checkNode(run, { slot: 'fix:2', text: 'Again', tag: 'good' }), /already fixed/);
  run = place(run, 'x2', 'fix:2', 'Budget', { tag: 'cheap' });
  assert.deepEqual(nextSlots(run), ['force:4', 'reflection']);
});

test('path flow: answers choose the route; an end closes it', () => {
  const def = T.flow;
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['want']);
  assert.deepEqual(def.nodeTags, { want: ['yes', 'no'], afford: ['yes', 'no'] });
  run = place(run, 'a', 'want', 'Yes', { tag: 'yes' });
  assert.deepEqual(nextSlots(run), ['afford']);
  run = place(run, 'b', 'afford', 'No', { tag: 'no' });
  assert.deepEqual(nextSlots(run), ['wait']);
  assert.deepEqual(flowRoute(run, def.chart.stages).map((step) => step.stage.id), ['want', 'afford', 'wait']);
  run = place(run, 'c', 'wait', 'Save until March');
  assert.deepEqual(nextSlots(run), ['reflection']);
  assert.equal(isComplete(run), false);
  run = place(run, 'r', 'reflection', 'Fine');
  assert.equal(isComplete(run), true);
});

test('path stages: in order, then a new round or the reflection', () => {
  const def = T.stages;
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['plan:1']);
  run = place(run, 'a', 'plan:1', 'Draft');
  run = place(run, 'b', 'try:1', 'Try');
  assert.deepEqual(nextSlots(run), ['check:1']);
  run = place(run, 'c', 'check:1', 'Check');
  assert.deepEqual(nextSlots(run), ['plan:2', 'reflection']);
  run = place(run, 'd', 'plan:2', 'Again');
  assert.deepEqual(nextSlots(run), ['try:2']);
});

test('path layers: holes link into their layer', () => {
  const def = T.layers;
  let run = sampleRun(def.id);
  assert.deepEqual(nextSlots(run), ['layer:1']);
  run = place(run, 'l1', 'layer:1', 'List');
  run = place(run, 'l2', 'layer:2', 'Check');
  assert.match(checkNode(run, { slot: 'hole:1', text: 'Old list' }, []), /Link each hole to the layer/);
  assert.equal(checkNode(run, { slot: 'hole:1', text: 'Old list' }, [{ from: 'hole:1', to: 'layer:1', kind: 'in' }]), null);
  run = place(run, 'h1', 'hole:1', 'Old list');
  run = addEdge(run, { from: 'h1', to: 'l1', kind: 'in' });
  assert.throws(() => addEdge(run, { from: 'h1', to: 'l2', kind: 'in' }), /not allowed/);
  assert.ok(nextSlots(run).includes('reflection'));
});

test('list: entries tagged by group, a full group refuses more', () => {
  const def = listTool({ ...T.list, chart: { ...structuredClone(T.list.chart), perGroup: 1 } });
  TOOLS[def.id] = def;
  let run = sampleRun(def.id);
  run = place(run, 'a', 'entry:1', 'Walk', { tag: 'keep' });
  assert.match(checkNode(run, { slot: 'entry:2', text: 'Run', tag: 'keep' }), /already has 1 entries/);
  delete TOOLS[def.id];
  const pyramid = T.pyramid;
  const full = { ...sampleRun(pyramid.id), nodes: [sampleNode('a', 'entry:1', 'Wage', { tag: 'then_base' })] };
  assert.deepEqual(entriesByGroup(full, pyramid.chart).then_base.map((node) => node.id), ['a']);
  assert.deepEqual([...new Set(pyramid.chart.groups.map((group) => group.column))], ['then', 'now']);
});

test('the one-offs: nine dots and the black box', () => {
  let run = sampleRun(T.outside_box.id);
  assert.deepEqual(nextSlots(run), ['attempt', 'assumption']);
  run = place(run, 'a', 'assumption', 'Must stay in this city');
  assert.deepEqual(nextSlots(run), ['attempt', 'reflection']);
  assert.equal(T.outside_box.tier, 'lens');
  let box = sampleRun(T.black_box.id);
  assert.deepEqual(nextSlots(box), ['input:1', 'output:1']);
  box = place(box, 'i', 'input:1', 'Application');
  box = place(box, 'o', 'output:1', 'Rejection');
  assert.deepEqual(nextSlots(box), ['input:2', 'output:2', 'inside']);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/decision-book-families.test.js`
Expected: FAIL, with `Cannot find module '.../packages/decision-book/families/index.mjs'`.

- [ ] **Step 3: Write the shared base**

```js
// packages/decision-book/families/common.mjs
// What every Decision Book family factory shares: config checks, the frozen tool shell that
// meets Problem Solver's tool contract (machine.mjs), the optional opening `subject` slot and
// the closing `reflection` slot. A family adds its own slots, tags, checks and completeness.
import { countSlots, hasSlot, parseSlot } from '../../problem-solver/slots.mjs';

/** Fills a chart may use, all drawn from the `.dm-scope` tokens. */
export const FILLS = Object.freeze(['red', 'green', 'ink', 'tint']);

export const nameOf = (node) => parseSlot(node?.slot)?.name;
export const indexOf = (node) => parseSlot(node?.slot)?.index ?? 0;
export const bySlot = (a, b) => indexOf(a) - indexOf(b);

/** Placed nodes in one slot family, in slot order. */
export function nodesIn(run, name) {
  return run.nodes.filter((node) => nameOf(node) === name).sort(bySlot);
}

/** Throws a config error naming the tool, so a bad model config fails at import, not mid-session. */
export function check(condition, id, message) {
  if (!condition) throw new Error(`Decision Book tool ${id}: ${message}`);
}

/** Ids are slot names and tags: lower case words joined by underscores. */
export const isKey = (value) => typeof value === 'string' && /^[a-z]+(_[a-z]+)*$/.test(value);

/** Deep-freeze plain config data (arrays and objects), so a chart config cannot drift at run time. */
export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const inner of Object.values(value)) freeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** The fields every model config carries, checked once. */
export function checkCommon(config) {
  const { id } = config;
  check(typeof id === 'string' && id.startsWith('dm_'), id, 'ids start with dm_');
  check(typeof config.name === 'string' && config.name, id, 'needs a name');
  check(typeof config.when === 'string' && config.when, id, 'needs a "use it when" line');
  check(Array.isArray(config.steps) && config.steps.length > 0, id, 'needs coaching steps');
  check(['worksheet', 'lens'].includes(config.tier ?? 'worksheet'), id, 'tier is worksheet or lens');
  check(config.chart && typeof config.chart === 'object', id, 'needs a chart config');
}

/**
 * The slots that frame a family's own: an optional `subject` first (what the model is applied
 * to) and a `reflection` last (what the chart says about the decision), on by default.
 */
export function framing(config) {
  const subject = config.chart.subject ?? null;
  const reflection = config.chart.reflection === false ? null : (config.chart.reflection ?? 'What this shows about the decision');
  return { subject, reflection };
}

/** Before the family's own slots: the subject, if it is asked for and not yet given. */
export function subjectFirst(run, subject) {
  return subject && !hasSlot(run, 'subject') ? ['subject'] : null;
}

/** True when the chart has its reflection, or needs none. */
export function reflected(run, reflection) {
  return !reflection || countSlots(run, 'reflection') === 1;
}

/**
 * The frozen tool definition. `slots` holds the family's own slot descriptions; the subject
 * and reflection descriptions are added around them. Everything in `extra` (nextSlots,
 * complete, nodeTags, validateNode, scores …) passes through unchanged.
 */
export function baseTool(config, family, slots, extra) {
  checkCommon(config);
  const { subject, reflection } = framing(config);
  return Object.freeze({
    id: config.id,
    name: config.name,
    kind: config.kind ?? 'decision',
    step: 'explore',
    family,
    tier: config.tier ?? 'worksheet',
    when: config.when,
    failureModes: freeze([...(config.failureModes ?? [])]),
    steps: freeze(config.steps.map((s) => ({ ...s }))),
    chart: freeze(structuredClone(config.chart)),
    slots: freeze({ ...(subject ? { subject } : {}), ...slots, ...(reflection ? { reflection } : {}) }),
    ...extra,
    edgeKinds: freeze([...(extra.edgeKinds ?? [])])
  });
}
```

- [ ] **Step 4: Write the curve shapes and the record's slots**

```js
// packages/decision-book/curves.mjs
// Conceptual curve shapes for the curve family. Each maps t in [0, 1] (left to right) to a
// height in [0, 1] (bottom to top). They carry no data and no numbers: the kit's rule is that
// a curve shows an idea (a U, a rise, a tail), never a measurement.
const clamp = (v) => Math.min(1, Math.max(0, v));

export const CURVE_SHAPES = Object.freeze({
  /** Both extremes bad, a middle that is better (choice overload). */
  u: (t) => 0.15 + 0.75 * (2 * t - 1) ** 2,
  /** Steady rise (consequences over time). */
  rise: (t) => 0.1 + 0.8 * t,
  /** Steady fall. */
  fall: (t) => 0.9 - 0.8 * t,
  /** Slow start, steep middle, plateau (adoption, potential). */
  s: (t) => 0.08 + 0.84 / (1 + Math.exp(-10 * (t - 0.5))),
  /** A bell (diffusion of adopters). */
  bell: (t) => 0.08 + 0.84 * Math.exp(-((t - 0.5) ** 2) / 0.045),
  /** A high head falling into a long, low tail. */
  tail: (t) => 0.06 + 0.86 * Math.exp(-6 * t),
  /** Calm, then one sudden spike near the end (a black swan). */
  spike: (t) => 0.12 + 0.03 * Math.sin(t * 18) + 0.8 * Math.exp(-((t - 0.82) ** 2) / 0.0016),
  /** A bell with a gap cut after the early adopters (the chasm); the gap is drawn by the renderer. */
  chasm: (t) => 0.08 + 0.84 * Math.exp(-((t - 0.5) ** 2) / 0.045),
  /** Expectation running ahead, then reality catching up below it. */
  lag: (t) => 0.08 + 0.7 * t ** 2
});

export const CURVE_IDS = Object.freeze(Object.keys(CURVE_SHAPES));

/** Where the chasm's gap sits along t, for the shape and its renderer. */
export const CHASM_GAP = Object.freeze([0.3, 0.36]);

/** `n + 1` evenly spaced points [t, height] for a shape, heights clamped to [0, 1]. */
export function curvePoints(shape, n = 48) {
  const f = CURVE_SHAPES[shape];
  if (!f) throw new Error(`Unknown curve shape: ${shape}`);
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [t, clamp(f(t))];
  });
}

/** Height of a shape at t (clamped). */
export function curveAt(shape, t) {
  return clamp(CURVE_SHAPES[shape](t));
}
```

```js
// packages/decision-book/record-slots.mjs
// The decision record's slots: the contract between its chart (render/record.ts, Plan 2) and
// the Decide step's tool (Plan 4). A reason's basis (the model nodes it rests on) lives on the
// session, not the run, so the chart takes it separately (setBasis).
export const RECORD_ID = 'dm_record';

export const RECORD_SLOTS = Object.freeze({
  decision: 'The decision, in one sentence',
  reason: 'A reason, resting on what a model showed',
  trigger: 'Stop Rule: what would make you rethink',
  action: 'Stop Rule: what you will do then, agreed now',
  first_step: 'The first step',
  review: 'When to review it (a date)'
});

export const RECORD_SLOT_NAMES = Object.freeze(Object.keys(RECORD_SLOTS));
```

- [ ] **Step 5: Write the seven factories and their index**

```js
// packages/decision-book/families/quadrant.mjs
// The quadrant family: a 2×2 on two labelled axes, with each entry (an `item` slot) tagged
// with the cell it sits in. Axis direction comes from config: `col` 0 is the x axis's low end
// (left) and `row` 0 is the y axis's high end (top), so a model's "logic" line such as
// "urgency rises to the right, importance upwards" is a checkable fact about its cells.
// A payoff variant (prisoner's dilemma) gives each cell a fixed `note` shown under its label.
import { countSlots, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { FILLS, baseTool, check, checkCommon, framing, isKey, nodesIn, reflected, subjectFirst } from './common.mjs';

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {{x: {label: string, low: string, high: string}, y: {label: string, low: string, high: string}}} config.chart.axes
 * @param {{id: string, label: string, col: 0|1, row: 0|1, fill: string, note?: string}[]} config.chart.cells
 * @param {string} config.chart.item what one entry is
 * @param {number} [config.chart.max] entries in all (16)
 * @param {number} [config.chart.minItems] entries before the reflection opens (3)
 * @param {number} [config.chart.minCells] distinct cells used before the reflection opens (2)
 */
export function quadrantTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(chart.axes?.x?.label && chart.axes?.y?.label, id, 'needs x and y axes with labels');
  for (const axis of ['x', 'y']) check(chart.axes[axis].low && chart.axes[axis].high, id, `axis ${axis} needs low and high words`);
  check(Array.isArray(chart.cells) && chart.cells.length === 4, id, 'needs exactly four cells');
  const places = new Set(chart.cells.map((cell) => `${cell.col}${cell.row}`));
  check(places.size === 4 && [...places].every((p) => /^[01][01]$/.test(p)), id, 'cells must fill the four places once');
  for (const cell of chart.cells) {
    check(isKey(cell.id), id, `cell id ${cell.id} must be a lower-case key`);
    check(typeof cell.label === 'string' && cell.label, id, `cell ${cell.id} needs a label`);
    check(FILLS.includes(cell.fill), id, `cell ${cell.id} fill must be one of ${FILLS.join(', ')}`);
  }
  check(typeof chart.item === 'string' && chart.item, id, 'needs an item description');
  const max = chart.max ?? 16;
  const minItems = chart.minItems ?? 3;
  const minCells = chart.minCells ?? 2;
  const cellIds = chart.cells.map((cell) => cell.id);
  const { subject, reflection } = framing(config);

  const ready = (run) => {
    const items = nodesIn(run, 'item');
    return items.length >= minItems && new Set(items.map((node) => node.tag)).size >= minCells;
  };

  return baseTool(config, 'quadrant', { item: chart.item }, {
    nodeTags: { item: cellIds },
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(nextIndexed(run, 'item', max), reflection && ready(run) ? 'reflection' : null);
    },
    complete(run) {
      return ready(run) && reflected(run, reflection);
    }
  });
}

/** Item nodes per cell id, in slot order, for a quadrant tool's config. */
export function itemsByCell(run, chart) {
  const out = Object.fromEntries(chart.cells.map((cell) => [cell.id, []]));
  for (const node of nodesIn(run, 'item')) if (out[node.tag]) out[node.tag].push(node);
  return out;
}
```

```js
// packages/decision-book/families/plot.mjs
// The plot family: named points (`point` slots) on two qualitative 1–10 axes. The coach places
// the names; the person places each point with the chart's controls, which send a score
// snapshot { points: { nodeId: { x, y, size?, plot? } } } through Problem Solver's scores
// action. Snapshots merge in order, so points can be placed one at a time and moved later.
// Options: a bubble `size` (1–10), a shaded `band` and several `plots` that never share axes
// (the project portfolio's two coordinate systems): a point then names its plot.
import { countSlots, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { baseTool, check, checkCommon, framing, isKey, nodesIn, reflected, subjectFirst } from './common.mjs';

const isScale = (value) => Number.isInteger(value) && value >= 1 && value <= 10;
const isAxes = (axes) => Boolean(axes?.x?.label && axes.x.low && axes.x.high && axes?.y?.label && axes.y.low && axes.y.high);

/** The plots a config draws: its own list, or one plot `main` on the shared axes. */
export function plotsOf(chart) {
  return chart.plots ?? [{ id: 'main', label: '', axes: chart.axes }];
}

/** Every point's latest position, merged across snapshots in order. */
export function positionsOf(run) {
  const out = {};
  for (const snap of run.scores?.snapshots ?? []) for (const [nodeId, place] of Object.entries(snap.points ?? {})) out[nodeId] = { ...out[nodeId], ...place };
  return out;
}

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {{x: object, y: object}} [config.chart.axes] one plot's axes (label, low, high each)
 * @param {{id: string, label: string, axes: object}[]} [config.chart.plots] separate plots instead
 * @param {string} config.chart.point what one point is
 * @param {{label: string}} [config.chart.size] a bubble size, 1–10
 * @param {{label: string, x: [number, number], y: [number, number]}} [config.chart.band] a shaded region
 * @param {number} [config.chart.max] points (10)
 * @param {number} [config.chart.minPoints] placed points before the reflection opens (2)
 */
export function plotTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  const plots = plotsOf(chart);
  check(chart.plots ? !chart.axes : isAxes(chart.axes), id, 'give either axes or plots, not both');
  for (const plot of plots) {
    check(isKey(plot.id), id, `plot id ${plot.id} must be a lower-case key`);
    check(isAxes(plot.axes), id, `plot ${plot.id} needs x and y axes with label, low and high`);
  }
  check(typeof chart.point === 'string' && chart.point, id, 'needs a point description');
  if (chart.band) check(chart.band.label && [...chart.band.x, ...chart.band.y].every(isScale), id, 'band needs a label and 1–10 bounds');
  const max = chart.max ?? 10;
  const minPoints = chart.minPoints ?? 2;
  const plotIds = plots.map((plot) => plot.id);
  const many = plots.length > 1;
  const { subject, reflection } = framing(config);

  const unplaced = (run) => {
    const at = positionsOf(run);
    return nodesIn(run, 'point').filter((node) => !(isScale(at[node.id]?.x) && isScale(at[node.id]?.y)));
  };
  const ready = (run) => countSlots(run, 'point') >= minPoints && unplaced(run).length === 0;

  return baseTool(config, 'plot', { point: chart.point }, {
    ...(many ? { nodeTags: { point: plotIds } } : {}),
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(nextIndexed(run, 'point', max), reflection && ready(run) ? 'reflection' : null);
    },
    pickScores(payload) {
      return { points: payload?.points };
    },
    validateScores(run, { points }) {
      if (!points || typeof points !== 'object' || !Object.keys(points).length) return 'Place at least one point.';
      const placed = new Set(nodesIn(run, 'point').map((node) => node.id));
      for (const [nodeId, place] of Object.entries(points)) {
        if (!placed.has(nodeId)) return 'Only placed points can be positioned.';
        if (!isScale(place?.x) || !isScale(place?.y)) return 'Positions run from 1 to 10 on each axis.';
        if (place.size !== undefined && (!chart.size || !isScale(place.size))) return chart.size ? 'Sizes run from 1 to 10.' : 'This chart has no bubble size.';
      }
      return null;
    },
    awaiting(run) {
      return unplaced(run).length ? 'The person places each point on the chart with its controls; ask them to, and wait.' : null;
    },
    complete(run) {
      return ready(run) && reflected(run, reflection);
    }
  });
}
```

```js
// packages/decision-book/families/scales.mjs
// The scales family: profiles the person scores with the chart's controls, one snapshot per
// series ({ series, values: { scaleId: n } }), the latest snapshot of a series winning.
//   pairs   opposed poles (body/mind); n is the low pole's share of 10, the high pole has 10 − n.
//   axes    independent 1–10 scales, drawn as bars or as a radar.
//   shares  parts of a whole; the values sum to 100.
// Series are the overlays a model compares (now and wanted, two dates, four perspectives).
// Notes (`note` slots) are optional, each tagged with the scale it is about.
import { countSlots, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { baseTool, check, checkCommon, framing, isKey, reflected, subjectFirst } from './common.mjs';

const MODES = Object.freeze(['pairs', 'axes', 'shares']);

/** The latest values of each series that has been scored. */
export function valuesOf(run) {
  const out = {};
  for (const snap of run.scores?.snapshots ?? []) if (snap.series) out[snap.series] = { ...snap.values };
  return out;
}

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {'pairs'|'axes'|'shares'} config.chart.mode
 * @param {{id: string, label?: string, low?: string, high?: string}[]} config.chart.scales pairs need low and high, others a label
 * @param {{id: string, label: string}[]} [config.chart.series] defaults to one series, now
 * @param {'bars'|'radar'} [config.chart.layout] axes mode only (bars)
 */
export function scalesTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(MODES.includes(chart.mode), id, `mode is one of ${MODES.join(', ')}`);
  check(Array.isArray(chart.scales) && chart.scales.length >= 2, id, 'needs at least two scales');
  for (const scale of chart.scales) {
    check(isKey(scale.id), id, `scale id ${scale.id} must be a lower-case key`);
    if (chart.mode === 'pairs') check(scale.low && scale.high, id, `pair ${scale.id} needs low and high poles`);
    else check(scale.label, id, `scale ${scale.id} needs a label`);
  }
  if (chart.layout === 'radar') check(chart.mode === 'axes' && chart.scales.length >= 3, id, 'a radar needs axes mode and three scales');
  const series = chart.series ?? [{ id: 'now', label: 'Now' }];
  for (const s of series) check(isKey(s.id) && s.label, id, `series ${s.id} needs a key and a label`);
  const scaleIds = chart.scales.map((scale) => scale.id);
  const seriesIds = series.map((s) => s.id);
  const { subject, reflection } = framing(config);

  const missing = (run) => seriesIds.filter((s) => !valuesOf(run)[s]);

  return baseTool(config, 'scales', { note: 'A note on one scale: why it sits where it does' }, {
    nodeTags: { note: scaleIds },
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(nextIndexed(run, 'note', scaleIds.length * 2), reflection && !missing(run).length ? 'reflection' : null);
    },
    pickScores(payload) {
      return { series: payload?.series, values: payload?.values };
    },
    validateScores(_run, { series: which, values }) {
      if (!seriesIds.includes(which)) return `Score one of: ${seriesIds.join(', ')}.`;
      if (!values || scaleIds.some((scale) => !Number.isInteger(values[scale])) || Object.keys(values).length !== scaleIds.length) return 'Give a whole number for every scale.';
      const list = scaleIds.map((scale) => values[scale]);
      if (chart.mode === 'pairs' && !list.every((n) => n >= 0 && n <= 10)) return 'Each pair shares 10 points: give the first pole 0 to 10.';
      if (chart.mode === 'axes' && !list.every((n) => n >= 1 && n <= 10)) return 'Scores run from 1 to 10.';
      if (chart.mode === 'shares' && (!list.every((n) => n >= 0) || list.reduce((a, b) => a + b, 0) !== 100)) return 'The shares must add up to 100.';
      return null;
    },
    awaiting(run) {
      const left = missing(run);
      return left.length ? `The person scores ${left.map((s) => series.find((x) => x.id === s).label.toLowerCase()).join(' and ')} with the chart's controls; ask them to, and wait.` : null;
    },
    complete(run) {
      return !missing(run).length && reflected(run, reflection);
    }
  });
}
```

```js
// packages/decision-book/families/curve.mjs
// The curve family: one or more conceptual curves (curves.mjs) over named regions of the
// x axis. The person's `position` (tagged with a region) is where they think they stand;
// `note` slots (each tagged with a region) say why. Regions cover the axis from 0 to 1 in
// order without overlapping. Lenses use this family with no notes required.
import { countSlots, hasSlot, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { CURVE_IDS } from '../curves.mjs';
import { baseTool, check, checkCommon, framing, isKey, reflected, subjectFirst } from './common.mjs';

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {{x: {label: string}, y: {label: string}}} config.chart.axes
 * @param {{id: string, label: string, shape: string}[]} config.chart.lines
 * @param {{id: string, label: string, from: number, to: number}[]} config.chart.regions
 * @param {string} config.chart.position what the marker means
 * @param {number} [config.chart.minNotes] notes before the reflection opens (0)
 */
export function curveTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(chart.axes?.x?.label && chart.axes?.y?.label, id, 'needs labelled x and y axes');
  check(Array.isArray(chart.lines) && chart.lines.length >= 1 && chart.lines.length <= 3, id, 'needs one to three lines');
  for (const line of chart.lines) {
    check(isKey(line.id), id, `line id ${line.id} must be a lower-case key`);
    check(CURVE_IDS.includes(line.shape), id, `line ${line.id} shape must be one of ${CURVE_IDS.join(', ')}`);
    check(chart.lines.length === 1 || line.label, id, `line ${line.id} needs a label when there are several`);
  }
  check(Array.isArray(chart.regions) && chart.regions.length >= 2, id, 'needs at least two regions');
  let edge = 0;
  for (const region of chart.regions) {
    check(isKey(region.id) && region.label, id, `region ${region.id} needs a key and a label`);
    check(region.from === edge && region.to > region.from, id, `region ${region.id} must start where the last ended (${edge})`);
    edge = region.to;
  }
  check(edge === 1, id, 'regions must end at 1');
  check(typeof chart.position === 'string' && chart.position, id, 'needs a position description');
  const regionIds = chart.regions.map((region) => region.id);
  const minNotes = chart.minNotes ?? 0;
  const { subject, reflection } = framing(config);
  const ready = (run) => hasSlot(run, 'position') && countSlots(run, 'note') >= minNotes;

  return baseTool(config, 'curve', { position: chart.position, note: 'Why: what puts you at that point, or what each part of the curve means here' }, {
    nodeTags: { position: regionIds, note: regionIds },
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(hasSlot(run, 'position') ? null : 'position', nextIndexed(run, 'note', 6), reflection && ready(run) ? 'reflection' : null);
    },
    complete(run) {
      return ready(run) && reflected(run, reflection);
    }
  });
}
```

```js
// packages/decision-book/families/tension.mjs
// The tension family: forces set against each other around a `centre` (the situation).
//   pull      two sides pulling opposite ways (what holds you, what pulls you), equal arrows:
//             the kit forbids inventing a numeric balance.
//   gap       two sides with the gap between them named (belief and action, expected and actual).
//   triangle  three corners of which the person fixes `pick` (the project triangle: pick two).
// Each `force` is tagged with its side. In a triangle, `fix` slots name the fixed corners.
import { countSlots, hasSlot, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { FILLS, baseTool, check, checkCommon, framing, isKey, nodesIn, reflected } from './common.mjs';

const VARIANTS = Object.freeze({ pull: 2, gap: 2, triangle: 3 });

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {'pull'|'gap'|'triangle'} config.chart.variant
 * @param {string} config.chart.centre what the centre holds
 * @param {{id: string, label: string, fill: string}[]} config.chart.sides
 * @param {string} [config.chart.gap] the gap's name (gap variant)
 * @param {number} [config.chart.pick] corners to fix (triangle, 2)
 * @param {number} [config.chart.perSide] forces per side (6)
 */
export function tensionTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(chart.variant in VARIANTS, id, `variant is one of ${Object.keys(VARIANTS).join(', ')}`);
  check(Array.isArray(chart.sides) && chart.sides.length === VARIANTS[chart.variant], id, `a ${chart.variant} has ${VARIANTS[chart.variant]} sides`);
  for (const side of chart.sides) {
    check(isKey(side.id) && side.label, id, `side ${side.id} needs a key and a label`);
    check(FILLS.includes(side.fill), id, `side ${side.id} fill must be one of ${FILLS.join(', ')}`);
  }
  check(typeof chart.centre === 'string' && chart.centre, id, 'needs a centre description');
  if (chart.variant === 'gap') check(typeof chart.gap === 'string' && chart.gap, id, 'a gap needs a name');
  const triangle = chart.variant === 'triangle';
  const pick = chart.pick ?? 2;
  if (triangle) check(Number.isInteger(pick) && pick >= 1 && pick <= 2, id, 'pick is 1 or 2');
  const perSide = chart.perSide ?? 6;
  const sideIds = chart.sides.map((side) => side.id);
  check(!chart.subject, id, 'a tension chart starts from its centre, not a subject');
  const { reflection } = framing(config);

  const forcesOn = (run, side) => nodesIn(run, 'force').filter((node) => node.tag === side).length;
  const ready = (run) => sideIds.every((side) => forcesOn(run, side) >= 1) && (!triangle || countSlots(run, 'fix') === pick);

  return baseTool(config, 'tension', {
    centre: chart.centre,
    force: 'One force, on its side',
    ...(triangle ? { fix: 'A corner held fixed: the other must give' } : {})
  }, {
    nodeTags: { force: sideIds, ...(triangle ? { fix: sideIds } : {}) },
    validateNode(run, node) {
      const name = node.slot.split(':')[0];
      if (name === 'force' && forcesOn(run, node.tag) >= perSide) return `That side already has ${perSide} forces; merge or replace one.`;
      if (name === 'fix' && nodesIn(run, 'fix').some((fixed) => fixed.tag === node.tag)) return 'That corner is already fixed; fix a different one.';
      return null;
    },
    nextSlots(run) {
      if (!hasSlot(run, 'centre')) return ['centre'];
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(nextIndexed(run, 'force', perSide * sideIds.length), triangle ? nextIndexed(run, 'fix', pick) : null, reflection && ready(run) ? 'reflection' : null);
    },
    complete(run) {
      return hasSlot(run, 'centre') && ready(run) && reflected(run, reflection);
    }
  });
}
```

```js
// packages/decision-book/families/path.mjs
// The path family: ordered steps.
//   flow    a yes/no decision flow. Each stage's slot is its id. A question stage is tagged
//           yes or no and goes to its `yes` or `no` stage; a step goes to `next`; an end
//           stage closes the path. The flow must be acyclic and every route must end.
//   stages  stages in order, each slot `<stage>:<round>`. With `loop`, finishing a round opens
//           the first stage of the next (up to `rounds`), as in result optimisation.
//   layers  defences (`layer` slots) with the holes in them (`hole` slots, each linked "in"
//           to its layer), as in the Swiss cheese model.
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../../problem-solver/slots.mjs';
import { baseTool, check, checkCommon, framing, isKey, reflected, subjectFirst } from './common.mjs';

const RESERVED = new Set(['subject', 'reflection', 'layer', 'hole']);

function checkFlow(id, stages) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  for (const stage of stages) {
    check(['question', 'step', 'end'].includes(stage.kind), id, `stage ${stage.id} kind is question, step or end`);
    const targets = stage.kind === 'question' ? [stage.yes, stage.no] : stage.kind === 'step' ? [stage.next] : [];
    for (const target of targets) check(byId.has(target), id, `stage ${stage.id} points at missing stage ${target}`);
  }
  // Every route from the first stage reaches an end, with no loops.
  const walk = (stageId, seen) => {
    check(!seen.has(stageId), id, `the flow loops back to ${stageId}`);
    const stage = byId.get(stageId);
    if (stage.kind === 'end') return;
    const next = new Set([...seen, stageId]);
    for (const target of stage.kind === 'question' ? [stage.yes, stage.no] : [stage.next]) walk(target, next);
  };
  walk(stages[0].id, new Set());
}

/** The stages a flow run has taken so far, in order, each with its node (or none yet). */
export function flowRoute(run, stages) {
  const byId = new Map(stages.map((stage) => [stage.id, stage]));
  const placed = new Map(run.nodes.map((node) => [parseSlot(node.slot)?.name, node]));
  const route = [];
  let stage = stages[0];
  while (stage) {
    const node = placed.get(stage.id) ?? null;
    route.push({ stage, node });
    if (!node || stage.kind === 'end') break;
    const target = stage.kind === 'question' ? (node.tag === 'yes' ? stage.yes : stage.no) : stage.next;
    stage = byId.get(target);
  }
  return route;
}

/** The highest round a stages run has reached (1 before anything is placed). */
export function roundOf(run, stages) {
  const ids = new Set(stages.map((stage) => stage.id));
  return Math.max(1, ...run.nodes.filter((node) => ids.has(parseSlot(node.slot)?.name)).map((node) => parseSlot(node.slot).index ?? 1));
}

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {'flow'|'stages'|'layers'} config.chart.variant
 * @param {{id: string, label: string, kind?: string, yes?: string, no?: string, next?: string}[]} [config.chart.stages]
 * @param {boolean} [config.chart.loop] stages may repeat in rounds
 * @param {number} [config.chart.rounds] most rounds (3)
 * @param {{layer: string, hole: string}} [config.chart.layers] what a layer and a hole are
 */
export function pathTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(['flow', 'stages', 'layers'].includes(chart.variant), id, 'variant is flow, stages or layers');
  const { subject, reflection } = framing(config);
  const head = (run) => subjectFirst(run, subject);
  const closing = (run) => (reflection && countSlots(run, 'reflection') ? [] : null);

  if (chart.variant === 'layers') {
    check(chart.layers?.layer && chart.layers?.hole, id, 'layers need layer and hole descriptions');
    const ready = (run) => countSlots(run, 'layer') >= 2 && countSlots(run, 'hole') >= 1;
    const layerOf = (run, nodeId) => parseSlot(run.nodes.find((node) => node.id === nodeId)?.slot)?.name;
    return baseTool(config, 'path', { layer: chart.layers.layer, hole: chart.layers.hole }, {
      edgeKinds: ['in'],
      requiredLinks: { hole: { kind: 'in', message: 'Link each hole to the layer it is in (link kind "in", from the hole to the layer).' } },
      canEdge(run, from, to, kind) {
        return kind === 'in' && layerOf(run, from) === 'hole' && layerOf(run, to) === 'layer' && !run.edges.some((edge) => edge.kind === 'in' && edge.from === from);
      },
      nextSlots(run) {
        return head(run) ?? closing(run) ?? open(nextIndexed(run, 'layer', 6), hasSlot(run, 'layer') ? nextIndexed(run, 'hole', 12) : null, reflection && ready(run) ? 'reflection' : null);
      },
      complete(run) {
        return ready(run) && reflected(run, reflection);
      }
    });
  }

  check(Array.isArray(chart.stages) && chart.stages.length >= 2, id, 'needs at least two stages');
  for (const stage of chart.stages) {
    check(isKey(stage.id) && !RESERVED.has(stage.id), id, `stage id ${stage.id} must be a lower-case key and not ${[...RESERVED].join(', ')}`);
    check(typeof stage.label === 'string' && stage.label, id, `stage ${stage.id} needs a label`);
  }
  check(new Set(chart.stages.map((stage) => stage.id)).size === chart.stages.length, id, 'stage ids are unique');
  const slots = Object.fromEntries(chart.stages.map((stage) => [stage.id, stage.label]));

  if (chart.variant === 'flow') {
    checkFlow(id, chart.stages);
    const questions = chart.stages.filter((stage) => stage.kind === 'question').map((stage) => stage.id);
    const ended = (run) => flowRoute(run, chart.stages).at(-1).stage.kind === 'end' && Boolean(flowRoute(run, chart.stages).at(-1).node);
    return baseTool(config, 'path', slots, {
      nodeTags: Object.fromEntries(questions.map((stageId) => [stageId, ['yes', 'no']])),
      nextSlots(run) {
        const first = head(run) ?? closing(run);
        if (first) return first;
        if (ended(run)) return reflection ? ['reflection'] : [];
        return [flowRoute(run, chart.stages).at(-1).stage.id];
      },
      complete(run) {
        return ended(run) && reflected(run, reflection);
      }
    });
  }

  const rounds = chart.loop ? (chart.rounds ?? 3) : 1;
  const inRound = (run, round) => chart.stages.filter((stage) => run.nodes.some((node) => node.slot === `${stage.id}:${round}`));
  return baseTool(config, 'path', slots, {
    nextSlots(run) {
      const first = head(run) ?? closing(run);
      if (first) return first;
      const round = roundOf(run, chart.stages);
      const done = inRound(run, round).length;
      if (done < chart.stages.length) return [`${chart.stages[done].id}:${round}`];
      return open(round < rounds ? `${chart.stages[0].id}:${round + 1}` : null, reflection ? 'reflection' : null);
    },
    complete(run) {
      return inRound(run, 1).length === chart.stages.length && reflected(run, reflection);
    }
  });
}
```

```js
// packages/decision-book/families/list.mjs
// The list family: entries (`entry` slots) tagged with the group they belong to. The layout
// only changes the drawing:
//   checklist  criteria in order, each ticked once it has an entry (Whitmore)
//   rows       a row per group (cognitive bias)
//   lanes      a column per group (conflict responses)
//   routes     groups as routes out from the centre (crossroads)
//   pyramid    groups stacked from the base up, one pyramid per `column` (Maslow, then and now)
//   roles      a card per group (Belbin roles, de Bono hats)
import { countSlots, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { baseTool, check, checkCommon, framing, isKey, nodesIn, reflected, subjectFirst } from './common.mjs';

export const LIST_LAYOUTS = Object.freeze(['checklist', 'rows', 'lanes', 'routes', 'pyramid', 'roles']);

/** Entry nodes per group id, in slot order. */
export function entriesByGroup(run, chart) {
  const out = Object.fromEntries(chart.groups.map((group) => [group.id, []]));
  for (const node of nodesIn(run, 'entry')) if (out[node.tag]) out[node.tag].push(node);
  return out;
}

/**
 * @param {object} config
 * @param {object} config.chart
 * @param {string} config.chart.layout
 * @param {{id: string, label: string, prompt?: string, column?: string}[]} config.chart.groups
 * @param {string} config.chart.entry what one entry is
 * @param {number} [config.chart.perGroup] (6)
 * @param {number} [config.chart.minGroups] groups with an entry before the reflection opens (2)
 * @param {number} [config.chart.minEntries] entries before the reflection opens (3)
 */
export function listTool(config) {
  checkCommon(config);
  const { id, chart } = config;
  check(LIST_LAYOUTS.includes(chart.layout), id, `layout is one of ${LIST_LAYOUTS.join(', ')}`);
  check(Array.isArray(chart.groups) && chart.groups.length >= 2, id, 'needs at least two groups');
  for (const group of chart.groups) check(isKey(group.id) && group.label, id, `group ${group.id} needs a key and a label`);
  check(new Set(chart.groups.map((group) => group.id)).size === chart.groups.length, id, 'group ids are unique');
  const columns = chart.groups.map((group) => group.column ?? null);
  check(columns.every((c) => c === null) || columns.every((c) => isKey(c)), id, 'give every group a column, or none');
  if (columns[0] !== null) check(chart.layout === 'pyramid' || chart.layout === 'lanes', id, 'columns belong to pyramid or lanes');
  check(typeof chart.entry === 'string' && chart.entry, id, 'needs an entry description');
  const perGroup = chart.perGroup ?? 6;
  const minGroups = chart.minGroups ?? 2;
  const minEntries = chart.minEntries ?? 3;
  const groupIds = chart.groups.map((group) => group.id);
  const { subject, reflection } = framing(config);

  const ready = (run) => {
    const entries = nodesIn(run, 'entry');
    return entries.length >= minEntries && new Set(entries.map((node) => node.tag)).size >= minGroups;
  };

  return baseTool(config, 'list', { entry: chart.entry }, {
    nodeTags: { entry: groupIds },
    validateNode(run, node) {
      if (node.slot.startsWith('entry') && entriesByGroup(run, chart)[node.tag]?.length >= perGroup) return `That group already has ${perGroup} entries; merge or replace one.`;
      return null;
    },
    nextSlots(run) {
      const first = subjectFirst(run, subject);
      if (first) return first;
      if (reflection && countSlots(run, 'reflection')) return [];
      return open(nextIndexed(run, 'entry', perGroup * groupIds.length), reflection && ready(run) ? 'reflection' : null);
    },
    complete(run) {
      return ready(run) && reflected(run, reflection);
    }
  });
}
```

```js
// packages/decision-book/families/index.mjs
// The seven family factories, keyed by the catalogue's `family` values. `table` (a reused
// Problem Solver chart) and `oneoff` (a bespoke chart) have no factory.
import { quadrantTool } from './quadrant.mjs';
import { plotTool } from './plot.mjs';
import { scalesTool } from './scales.mjs';
import { curveTool } from './curve.mjs';
import { tensionTool } from './tension.mjs';
import { pathTool } from './path.mjs';
import { listTool } from './list.mjs';

export { quadrantTool, plotTool, scalesTool, curveTool, tensionTool, pathTool, listTool };

export const FAMILY_FACTORIES = Object.freeze({
  quadrant: quadrantTool,
  plot: plotTool,
  scales: scalesTool,
  curve: curveTool,
  tension: tensionTool,
  path: pathTool,
  list: listTool
});
```

- [ ] **Step 6: Write the two one-off tools**

```js
// packages/decision-book/tools/outside-box.mjs
// Thinking outside the box (lens, bespoke chart): the nine-dot puzzle. Join nine dots in a
// 3×3 square with four straight lines without lifting the pen; it only works once the lines
// leave the square. The person says how they would try it (`attempt`), the chart can show one
// way, and they name the box they had assumed around their own decision (`assumption`).
import { hasSlot, open } from '../../problem-solver/slots.mjs';
import { baseTool, reflected } from '../families/common.mjs';

export const dmOutsideBox = baseTool({
  id: 'dm_outside_box',
  name: 'Thinking outside the box',
  tier: 'lens',
  when: 'The options feel fixed by limits nobody has questioned: test which edges are real.',
  failureModes: ['Treating "think differently" as the answer instead of naming the assumed limit.'],
  steps: [
    { id: 'attempt', title: 'Try the puzzle', prompt: 'Join the nine dots with four straight lines without lifting the pen.' },
    { id: 'assumption', title: 'Name your box', prompt: 'Which limit around this decision have you assumed rather than checked?' }
  ],
  chart: { reflection: 'What changes if that limit is not real' }
}, 'oneoff', {
  attempt: 'How you would join the dots, or where you got stuck',
  assumption: 'A limit you had assumed around the decision'
}, {
  nextSlots(run) {
    if (hasSlot(run, 'reflection')) return [];
    return open(hasSlot(run, 'attempt') ? null : 'attempt', hasSlot(run, 'assumption') ? null : 'assumption', hasSlot(run, 'assumption') ? 'reflection' : null);
  },
  complete(run) {
    return hasSlot(run, 'assumption') && reflected(run, 'yes');
  }
});
```

```js
// packages/decision-book/tools/black-box.mjs
// The black box model (lens, bespoke chart): we see what goes in and what comes out, not the
// working in between. The person lists inputs and outputs, then names what they do not know
// about the inside, and whether they need to.
import { countSlots, hasSlot, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { baseTool, reflected } from '../families/common.mjs';

export const dmBlackBox = baseTool({
  id: 'dm_black_box',
  name: 'The black box model',
  tier: 'lens',
  when: 'A system gives results you can see but not explain: judge it by inputs and outputs, and name what stays hidden.',
  failureModes: ['Inventing a story about the inside instead of saying it is unknown.'],
  steps: [
    { id: 'ends', title: 'What goes in, what comes out', prompt: 'List what you put in and what you see come out.' },
    { id: 'inside', title: 'The hidden part', prompt: 'What happens inside that you cannot see?' }
  ],
  chart: { reflection: 'Whether you need to open the box to decide' }
}, 'oneoff', {
  input: 'Something that goes in',
  output: 'Something that comes out',
  inside: 'What happens inside that you cannot see'
}, {
  nextSlots(run) {
    if (hasSlot(run, 'reflection')) return [];
    const ends = countSlots(run, 'input') >= 1 && countSlots(run, 'output') >= 1;
    return open(nextIndexed(run, 'input', 6), nextIndexed(run, 'output', 6), ends && !hasSlot(run, 'inside') ? 'inside' : null, hasSlot(run, 'inside') ? 'reflection' : null);
  },
  complete(run) {
    return hasSlot(run, 'inside') && reflected(run, 'yes');
  }
});
```

- [ ] **Step 7: Write the fixtures**

```js
// packages/decision-book/fixtures.mjs
// Sample tools and runs for each chart family: invented content (no book text), shared by the
// family tests, the renderer tests and the contact sheet. Each family has an empty run, a
// partial run and a full run whose last entry is contested.
import { curveTool, listTool, pathTool, plotTool, quadrantTool, scalesTool, tensionTool } from './families/index.mjs';
import { dmOutsideBox } from './tools/outside-box.mjs';
import { dmBlackBox } from './tools/black-box.mjs';
import { RECORD_ID } from './record-slots.mjs';

const steps = [{ id: 'work', title: 'Work it', prompt: 'Fill the chart.' }];
const base = (id, name) => ({ id, name, when: `Sample ${name.toLowerCase()} for tests.`, steps });

export const SAMPLE_TOOLS = Object.freeze({
  quadrant: quadrantTool({
    ...base('dm_sample_quadrant', 'Sample quadrant'),
    chart: {
      axes: { x: { label: 'Effort', low: 'Low effort', high: 'High effort' }, y: { label: 'Value', low: 'Low value', high: 'High value' } },
      cells: [
        { id: 'quick_win', label: 'Quick win', col: 0, row: 0, fill: 'green' },
        { id: 'big_bet', label: 'Big bet', col: 1, row: 0, fill: 'red' },
        { id: 'filler', label: 'Filler', col: 0, row: 1, fill: 'tint' },
        { id: 'drain', label: 'Drain', col: 1, row: 1, fill: 'ink' }
      ],
      item: 'A task, sorted into one cell'
    }
  }),
  plot: plotTool({
    ...base('dm_sample_plot', 'Sample plot'),
    chart: {
      axes: { x: { label: 'Cost', low: 'Cheap', high: 'Costly' }, y: { label: 'Joy', low: 'Little joy', high: 'Much joy' } },
      point: 'An option, placed by the person',
      size: { label: 'Time it takes' },
      band: { label: 'Sweet spot', x: [1, 5], y: [6, 10] }
    }
  }),
  scales: scalesTool({
    ...base('dm_sample_scales', 'Sample scales'),
    chart: {
      mode: 'pairs',
      scales: [
        { id: 'pace', low: 'Slow', high: 'Fast' },
        { id: 'scope', low: 'Narrow', high: 'Broad' },
        { id: 'company', low: 'Alone', high: 'Together' }
      ],
      series: [{ id: 'now', label: 'Now' }, { id: 'wanted', label: 'Wanted' }]
    }
  }),
  radar: scalesTool({
    ...base('dm_sample_radar', 'Sample radar'),
    chart: {
      mode: 'axes',
      layout: 'radar',
      scales: [{ id: 'calm', label: 'Calm' }, { id: 'focus', label: 'Focus' }, { id: 'energy', label: 'Energy' }, { id: 'sleep', label: 'Sleep' }],
      series: [{ id: 'now', label: 'Now' }]
    }
  }),
  shares: scalesTool({
    ...base('dm_sample_shares', 'Sample shares'),
    chart: { mode: 'shares', scales: [{ id: 'work', label: 'Work' }, { id: 'home', label: 'Home' }, { id: 'play', label: 'Play' }] }
  }),
  curve: curveTool({
    ...base('dm_sample_curve', 'Sample curve'),
    chart: {
      axes: { x: { label: 'How many options' }, y: { label: 'How hard it feels' } },
      lines: [{ id: 'main', label: '', shape: 'u' }],
      regions: [{ id: 'few', label: 'Too few', from: 0, to: 0.3 }, { id: 'enough', label: 'Enough', from: 0.3, to: 0.7 }, { id: 'many', label: 'Too many', from: 0.7, to: 1 }],
      position: 'Where your options sit now'
    }
  }),
  tension: tensionTool({
    ...base('dm_sample_tension', 'Sample tension'),
    chart: { variant: 'pull', centre: 'Where you stand', sides: [{ id: 'holds', label: 'Holds you', fill: 'red' }, { id: 'pulls', label: 'Pulls you', fill: 'green' }] }
  }),
  triangle: tensionTool({
    ...base('dm_sample_triangle', 'Sample triangle'),
    chart: { variant: 'triangle', centre: 'The project', sides: [{ id: 'fast', label: 'Fast', fill: 'red' }, { id: 'good', label: 'Good', fill: 'green' }, { id: 'cheap', label: 'Cheap', fill: 'ink' }] }
  }),
  flow: pathTool({
    ...base('dm_sample_flow', 'Sample flow'),
    chart: {
      variant: 'flow',
      stages: [
        { id: 'want', label: 'Do you want it?', kind: 'question', yes: 'afford', no: 'drop' },
        { id: 'afford', label: 'Can you afford it?', kind: 'question', yes: 'go', no: 'wait' },
        { id: 'go', label: 'Go ahead', kind: 'end' },
        { id: 'wait', label: 'Wait and save', kind: 'end' },
        { id: 'drop', label: 'Let it go', kind: 'end' }
      ]
    }
  }),
  stages: pathTool({
    ...base('dm_sample_stages', 'Sample stages'),
    chart: { variant: 'stages', loop: true, stages: [{ id: 'plan', label: 'Plan' }, { id: 'try', label: 'Try' }, { id: 'check', label: 'Check' }] }
  }),
  layers: pathTool({
    ...base('dm_sample_layers', 'Sample layers'),
    chart: { variant: 'layers', layers: { layer: 'A safeguard', hole: 'A gap in that safeguard' } }
  }),
  list: listTool({
    ...base('dm_sample_list', 'Sample list'),
    chart: {
      layout: 'lanes',
      groups: [{ id: 'keep', label: 'Keep' }, { id: 'change', label: 'Change' }, { id: 'stop', label: 'Stop' }],
      entry: 'A habit, in one lane'
    }
  }),
  pyramid: listTool({
    ...base('dm_sample_pyramid', 'Sample pyramid'),
    chart: {
      layout: 'pyramid',
      groups: [
        { id: 'then_base', label: 'Basics', column: 'then' },
        { id: 'then_top', label: 'Growth', column: 'then' },
        { id: 'now_base', label: 'Basics', column: 'now' },
        { id: 'now_top', label: 'Growth', column: 'now' }
      ],
      entry: 'A need, at its level'
    }
  }),
  outside_box: dmOutsideBox,
  black_box: dmBlackBox
});

let at = 0;
/** A placed node, accepted unless `extra` says otherwise. */
export function sampleNode(id, slot, text, extra = {}) {
  at += 1;
  return { id, slot, text, title: text.split(/[.,;:]/)[0].slice(0, 40), state: 'accepted', skills: [], turnId: `t${at}`, ...extra };
}

/** A run of a sample tool. */
export function sampleRun(toolId, nodes = [], extra = {}) {
  return { id: `run-${toolId}`, tool: toolId, status: 'active', nodes, edges: [], ...extra };
}

const contested = { state: 'contested', objection: 'Is that really where it belongs?' };

/** Empty, partial and full runs per family key in SAMPLE_TOOLS, plus the decision record. */
export const SAMPLE_RUNS = Object.freeze({
  quadrant: {
    partial: [sampleNode('q1', 'item:1', 'Answer the landlord', { tag: 'quick_win' }), sampleNode('q2', 'item:2', 'Repaint the hall', { tag: 'big_bet' })],
    full: [
      sampleNode('q1', 'item:1', 'Answer the landlord', { tag: 'quick_win' }),
      sampleNode('q2', 'item:2', 'Repaint the hall', { tag: 'big_bet' }),
      sampleNode('q3', 'item:3', 'Sort old cables', { tag: 'filler' }),
      sampleNode('q4', 'item:4', 'Rebuild the shed', { tag: 'drain', ...contested }),
      sampleNode('q5', 'reflection', 'Start with the landlord, then decide on the hall.')
    ]
  },
  plot: {
    partial: [sampleNode('p1', 'point:1', 'Night class'), sampleNode('p2', 'point:2', 'Weekend trip')],
    full: [sampleNode('p1', 'point:1', 'Night class'), sampleNode('p2', 'point:2', 'Weekend trip'), sampleNode('p3', 'point:3', 'New bike', contested)],
    scores: { snapshots: [{ at: '2026-10-21T10:00:00.000Z', points: { p1: { x: 3, y: 8, size: 6 }, p2: { x: 7, y: 7, size: 3 } } }, { at: '2026-10-21T10:01:00.000Z', points: { p3: { x: 9, y: 4, size: 2 } } }] }
  },
  scales: {
    partial: [sampleNode('s1', 'note:1', 'Mornings feel rushed', { tag: 'pace' })],
    full: [sampleNode('s1', 'note:1', 'Mornings feel rushed', { tag: 'pace' }), sampleNode('s2', 'note:2', 'I miss team work', { tag: 'company', ...contested })],
    scores: { snapshots: [{ at: '2026-10-21T10:00:00.000Z', series: 'now', values: { pace: 2, scope: 5, company: 8 } }, { at: '2026-10-21T10:01:00.000Z', series: 'wanted', values: { pace: 5, scope: 4, company: 4 } }] }
  },
  radar: {
    partial: [],
    full: [sampleNode('r1', 'note:1', 'Sleep is the weak point', { tag: 'sleep' }), sampleNode('r2', 'note:2', 'Focus holds up well', { tag: 'focus', ...contested })],
    scores: { snapshots: [{ at: '2026-10-21T10:00:00.000Z', series: 'now', values: { calm: 6, focus: 7, energy: 5, sleep: 3 } }] }
  },
  shares: {
    partial: [],
    full: [sampleNode('h1', 'note:1', 'Work spills into evenings', { tag: 'work' }), sampleNode('h2', 'note:2', 'Play is the first to go', { tag: 'play', ...contested })],
    scores: { snapshots: [{ at: '2026-10-21T10:00:00.000Z', series: 'now', values: { work: 60, home: 30, play: 10 } }] }
  },
  curve: {
    partial: [sampleNode('c1', 'position', 'About twelve flats on the list', { tag: 'many' })],
    full: [sampleNode('c1', 'position', 'About twelve flats on the list', { tag: 'many' }), sampleNode('c2', 'note:1', 'I keep adding more', { tag: 'many', ...contested }), sampleNode('c3', 'reflection', 'Cut the list to three.')]
  },
  tension: {
    partial: [sampleNode('t1', 'centre', 'Staying in this job'), sampleNode('t2', 'force:1', 'The team is good', { tag: 'holds' })],
    full: [sampleNode('t1', 'centre', 'Staying in this job'), sampleNode('t2', 'force:1', 'The team is good', { tag: 'holds' }), sampleNode('t3', 'force:2', 'A bigger role elsewhere', { tag: 'pulls' }), sampleNode('t4', 'force:3', 'Shorter commute', { tag: 'pulls', ...contested })]
  },
  triangle: {
    partial: [sampleNode('g1', 'centre', 'The kitchen refit')],
    full: [sampleNode('g1', 'centre', 'The kitchen refit'), sampleNode('g2', 'force:1', 'Done before the holidays', { tag: 'fast' }), sampleNode('g3', 'force:2', 'Solid oak tops', { tag: 'good' }), sampleNode('g4', 'force:3', 'Under budget', { tag: 'cheap' }), sampleNode('g5', 'fix:1', 'Quality first', { tag: 'good' }), sampleNode('g6', 'fix:2', 'Budget is fixed', { tag: 'cheap', ...contested })]
  },
  flow: {
    partial: [sampleNode('f1', 'want', 'Yes, for the commute', { tag: 'yes' })],
    full: [sampleNode('f1', 'want', 'Yes, for the commute', { tag: 'yes' }), sampleNode('f2', 'afford', 'Not this month', { tag: 'no', ...contested }), sampleNode('f3', 'wait', 'Save until March')]
  },
  stages: {
    partial: [sampleNode('a1', 'plan:1', 'Draft the budget')],
    full: [sampleNode('a1', 'plan:1', 'Draft the budget'), sampleNode('a2', 'try:1', 'Live on it for a month'), sampleNode('a3', 'check:1', 'Food ran over', contested), sampleNode('a4', 'plan:2', 'Raise the food line')]
  },
  layers: {
    partial: [sampleNode('l1', 'layer:1', 'A packing list')],
    full: [sampleNode('l1', 'layer:1', 'A packing list'), sampleNode('l2', 'layer:2', 'A check at the door'), sampleNode('l3', 'hole:1', 'The list is out of date', contested), sampleNode('l4', 'hole:2', 'Nobody checks when late')],
    edges: [{ from: 'l3', to: 'l1', kind: 'in' }, { from: 'l4', to: 'l2', kind: 'in' }]
  },
  list: {
    partial: [sampleNode('i1', 'entry:1', 'Morning walk', { tag: 'keep' })],
    full: [sampleNode('i1', 'entry:1', 'Morning walk', { tag: 'keep' }), sampleNode('i2', 'entry:2', 'Late emails', { tag: 'stop' }), sampleNode('i3', 'entry:3', 'Lunch at the desk', { tag: 'change', ...contested })]
  },
  pyramid: {
    partial: [sampleNode('m1', 'entry:1', 'A steady wage', { tag: 'then_base' })],
    full: [sampleNode('m1', 'entry:1', 'A steady wage', { tag: 'then_base' }), sampleNode('m2', 'entry:2', 'Learning a craft', { tag: 'now_top' }), sampleNode('m3', 'entry:3', 'Savings', { tag: 'now_base', ...contested })]
  },
  outside_box: {
    partial: [sampleNode('o1', 'attempt', 'I stayed inside the square')],
    full: [sampleNode('o1', 'attempt', 'I stayed inside the square'), sampleNode('o2', 'assumption', 'That I must stay in this city', contested)]
  },
  black_box: {
    partial: [sampleNode('b1', 'input:1', 'My application')],
    full: [sampleNode('b1', 'input:1', 'My application'), sampleNode('b2', 'input:2', 'Two references'), sampleNode('b3', 'output:1', 'A rejection, no reason'), sampleNode('b4', 'inside', 'How they rank people', contested)]
  },
  record: {
    partial: [sampleNode('d1', 'decision', 'Take the Sydney job')],
    full: [
      sampleNode('d1', 'decision', 'Take the Sydney job'),
      sampleNode('d2', 'reason:1', 'The role grows what I want to do'),
      sampleNode('d3', 'reason:2', 'The team pull is weaker than I thought', contested),
      sampleNode('d4', 'trigger', 'If the rent is over a third of pay'),
      sampleNode('d5', 'action', 'Take the flat-share offer instead'),
      sampleNode('d6', 'first_step', 'Accept the offer in writing'),
      sampleNode('d7', 'review', '2027-02-01')
    ]
  }
});

/** The run for a family key at a stage: 'empty', 'partial' or 'full'. */
export function runFor(key, stage) {
  const sample = SAMPLE_RUNS[key];
  const toolId = key === 'record' ? RECORD_ID : SAMPLE_TOOLS[key].id;
  if (stage === 'empty') return sampleRun(toolId);
  return sampleRun(toolId, sample[stage], { ...(sample.scores ? { scores: sample.scores } : {}), ...(sample.edges && stage === 'full' ? { edges: sample.edges } : {}) });
}
```

- [ ] **Step 8: Run the test to verify it passes, and that Problem Solver is untouched**

Run: `node --test tests/unit/decision-book-families.test.js tests/unit/problem-solver-*.test.js`
Expected: PASS. The families file has 17 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/decision-book/families packages/decision-book/curves.mjs packages/decision-book/record-slots.mjs packages/decision-book/tools packages/decision-book/fixtures.mjs tests/unit/decision-book-families.test.js
git commit -m "Decision Maker: seven chart family factories, the one-off tools and fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The chart core and the quadrant chart

**Files:**
- Create: `packages/decision-book/render/core.ts`, `packages/decision-book/render/quadrant.ts`
- Test: `apps/tasks/tests/unit/decision-book-charts.test.ts`, `apps/tasks/tests/unit/helpers/decision-book-charts.ts` (quadrant only for now)

The contract suite runs against every sample chart the helper knows about. It checks:
- the empty frame and the state words;
- element identity;
- contested marks that follow later changes;
- one card open at a time, marked Selected;
- titles in pills and full text in the card;
- no motion on the first paint or on an identical update;
- removal;
- task tags and proposals;
- destroy;
- no list roles and no unlabelled buttons.

- [ ] **Step 1: Write the failing tests**

```ts
// The contract every Decision Book chart keeps, run against each family's sample tool and its
// empty, partial and full runs (packages/decision-book/fixtures.mjs).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHARTS, createChartFor } from './helpers/decision-book-charts';
import { runFor } from '../../../../packages/decision-book/fixtures.mjs';
import type { DmToolRun } from '../../../../packages/decision-book/render/core';

const proto = Element.prototype as unknown as { animate?: unknown };
afterEach(() => {
  vi.restoreAllMocks();
  delete proto.animate;
  document.body.replaceChildren();
});
function spyAnimate() {
  proto.animate = () => null;
  return vi.spyOn(Element.prototype, 'animate').mockImplementation(() => ({ cancel() {}, finish() {}, onfinish: null }) as unknown as Animation);
}

const run = (key: string, stage: 'empty' | 'partial' | 'full') => runFor(key, stage) as DmToolRun;
const entry = (root: Element, id: string) => root.querySelector<HTMLElement>(`.dm-entry[data-node="${id}"]`)!;
const pill = (root: Element, id: string) => entry(root, id).querySelector<HTMLButtonElement>('button')!;

describe.each(CHARTS)('%s chart', (key) => {
  it('draws its frame and says Empty for an empty run', () => {
    const view = createChartFor(key);
    view.update(run(key, 'empty'));
    expect(view.el.getAttribute('data-state')).toBe('empty');
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('Empty');
    expect(view.el.querySelector('.dm-chart__frame')!.children.length).toBeGreaterThan(0);
    expect(view.el.querySelectorAll('.dm-entry').length).toBe(0);
  });

  it('draws one entry per node, says In progress, and Completed once the run is done', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    view.update(full);
    expect(view.el.getAttribute('data-state')).toBe('populated');
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('In progress');
    for (const node of full.nodes) expect(entry(view.el, node.id), node.id).not.toBeNull();
    view.update({ ...full, status: 'done' });
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('Completed');
  });

  it('keeps element identity across updates', () => {
    const view = createChartFor(key);
    const partial = run(key, 'partial');
    view.update(partial);
    const first = partial.nodes[0];
    if (!first) return;
    const before = entry(view.el, first.id);
    view.update(run(key, 'full'));
    expect(entry(view.el, first.id)).toBe(before);
  });

  it('marks the contested entry with words and its objection, and follows a later change', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    const node = full.nodes.find((n) => n.state === 'contested')!;
    view.update(full);
    const item = entry(view.el, node.id);
    expect(item.getAttribute('data-state')).toBe('contested');
    expect(item.querySelector('.ps-objection')!.textContent).toBe('Contested');
    expect(pill(view.el, node.id).getAttribute('aria-label')).toContain(', contested');
    pill(view.el, node.id).click();
    expect(view.el.querySelector('.ps-details.is-open .ps-details__note')!.textContent).toContain(node.objection);
    view.update({ ...full, nodes: full.nodes.map((n) => (n.id === node.id ? { ...n, state: 'accepted' as const, objection: undefined } : n)) });
    expect(item.querySelector('.ps-objection')).toBeNull();
    expect(pill(view.el, node.id).getAttribute('aria-label')).not.toContain('contested');
  });

  it('opens one details card at a time and marks the open entry Selected', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    view.update(full);
    const [a, b] = full.nodes;
    pill(view.el, a.id).click();
    expect(entry(view.el, a.id).getAttribute('data-state')).toBe('selected');
    pill(view.el, b.id).click();
    expect(view.el.querySelectorAll('.ps-details.is-open').length).toBe(1);
    expect(entry(view.el, b.id).classList.contains('is-selected')).toBe(true);
    expect(entry(view.el, a.id).classList.contains('is-selected')).toBe(false);
  });

  it('shows titles in pills and the full answer only in details', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    view.update(full);
    const node = full.nodes[0];
    expect(entry(view.el, node.id).querySelector('.dm-entry__title')!.textContent!.length).toBeGreaterThan(0);
    const card = view.el.querySelector(`.ps-details[data-for="${node.id}"]`)!;
    expect(card.textContent).toContain(node.text);
  });

  it('animates only after the first paint, and never on an identical update', () => {
    const animate = spyAnimate();
    const view = createChartFor(key);
    document.body.append(view.el);
    view.update(run(key, 'full'));
    expect(animate).not.toHaveBeenCalled();
    view.update(run(key, 'full'));
    expect(animate).not.toHaveBeenCalled();
    const second = createChartFor(key);
    document.body.append(second.el);
    second.update(run(key, 'empty'));
    second.update(run(key, 'full'));
    expect(animate).toHaveBeenCalled();
  });

  it('drops every element of a removed node', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    view.update(full);
    const gone = full.nodes.at(-1)!;
    view.update({ ...full, nodes: full.nodes.slice(0, -1), edges: full.edges.filter((e) => e.from !== gone.id && e.to !== gone.id) });
    expect(view.el.querySelectorAll(`[data-node="${gone.id}"], [data-for="${gone.id}"]`).length).toBe(0);
  });

  it('shows a task tag with its live status, and a proposal', () => {
    const view = createChartFor(key);
    const full = run(key, 'full');
    view.update(full);
    const node = full.nodes[0];
    view.setProposed([node.id]);
    expect(entry(view.el, node.id).querySelector<HTMLElement>('.dm-entry__proposed')!.hidden).toBe(false);
    view.setTasks([{ nodeId: node.id, taskId: 't1', status: 'in_progress' }]);
    expect(entry(view.el, node.id).querySelector('.dm-entry__task')!.textContent).toBe('TaskDoing');
    expect(pill(view.el, node.id).getAttribute('aria-label')).toContain('task: Doing');
  });

  it('does nothing after destroy', () => {
    const view = createChartFor(key);
    view.update(run(key, 'partial'));
    view.destroy();
    view.update(run(key, 'full'));
    const extra = run(key, 'full').nodes.find((n) => !run(key, 'partial').nodes.some((p) => p.id === n.id));
    if (extra) expect(entry(view.el, extra.id)).toBeNull();
  });

  it('uses no list roles and has no unlabelled buttons', () => {
    const view = createChartFor(key);
    view.update(run(key, 'full'));
    expect(view.el.querySelector('[role="list"], [role="listitem"]')).toBeNull();
    for (const button of view.el.querySelectorAll('button')) expect(button.getAttribute('aria-label') || button.textContent!.trim(), button.outerHTML).toBeTruthy();
  });
});
```

```ts
// Builds the right chart for each sample key, so one contract suite covers every renderer.
// Task 3 replaces this file with the full map.
import { SAMPLE_TOOLS } from '../../../../../packages/decision-book/fixtures.mjs';
import type { ChartView } from '../../../../../packages/decision-book/render/core';
import { createQuadrantView } from '../../../../../packages/decision-book/render/quadrant';

type SampleTool = { id: string; family: string };
const TOOLS = SAMPLE_TOOLS as unknown as Record<string, SampleTool>;

/** Sample keys whose chart exists so far. */
export const CHARTS: string[] = Object.keys(TOOLS).filter((key) => TOOLS[key].family === 'quadrant');

export function createChartFor(key: string): ChartView {
  return createQuadrantView(TOOLS[key] as never);
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/tasks && npx vitest run tests/unit/decision-book-charts.test.ts`
Expected: FAIL, because `render/core` and `render/quadrant` do not exist.

- [ ] **Step 3: Write the core**

```ts
// packages/decision-book/render/core.ts
// The shared chart core for every Decision Book family renderer. A family draws its own frame
// (axes, cells, curves, lanes) and says where each of its nodes sits (an EntrySpec); the core
// owns everything about the entries themselves, the same way for every chart:
//   - one pill per node, kept as the same element across updates (focus survives a move);
//   - the details card under the chart, one open at a time (Problem Solver's disclosure group);
//   - contested marks kept in step (syncContested), task tags with live status, proposals;
//   - motion only after the first paint: entries drop in, moved entries glide (FLIP);
//   - the kit's states as words: the chart says Empty, In progress or Completed, an open
//     entry is Selected, a contested one carries "! Contested";
//   - the optional `subject` above the frame and the `reflection` under it.
// Scores (plot and scales controls) go out through onScore, as in Problem Solver.
import type { PsNode, PsTaskLink, PsToolRun } from '../../problem-solver/types';
import { nodeTitle } from '../../problem-solver/titles.mjs';
import { parseSlot } from '../../problem-solver/slots.mjs';
import { taskStatusLabel } from '../../problem-solver/render/task-status';
import { EASE, canAnimate, cancelAnimations, createDisclosureGroup, detailsCard, nextId, syncContested } from '../../problem-solver/render/details';

export type Fill = 'red' | 'green' | 'ink' | 'tint';

/** A run of a Decision Book tool: Problem Solver's run shape with a `dm_` tool id (PsToolId stays Problem Solver's own). */
export type DmToolRun = Omit<PsToolRun, 'tool'> & { tool: string };

/** Where one node is drawn. `label` starts its accessible name ("Quick win item 2"). */
export type EntrySpec = {
  node: PsNode;
  host: HTMLElement;
  fill: Fill;
  label: string;
  /** Order inside its host (defaults to the slot index). */
  order?: number;
  /** Inline style the family positions it with (a plot's left and top). */
  style?: Record<string, string>;
  /** A short line under the title (a decision reason's basis). */
  meta?: string;
};

export type ChartContext = {
  doc: Document;
  /** The family's drawing area; it persists between updates. */
  frame: HTMLDivElement;
  /** True on the update that first draws this chart. */
  first: boolean;
  /** Send a scores payload to the canvas (the person placed or scored something). */
  emitScore(payload: Record<string, unknown>): void;
};

export type ChartView = {
  el: HTMLDivElement;
  update(run: DmToolRun): void;
  setTasks(links: PsTaskLink[]): void;
  setProposed(nodeIds: string[]): void;
  onScore(cb: (scores: Record<string, unknown>) => void): void;
  destroy(): void;
};

export type ChartOptions = {
  /** The family key, for class names (`dm-chart--quadrant`). */
  family: string;
  /** The chart's accessible name (the model's name). */
  label: string;
  /** Labels for the framing slots, when the tool has them. */
  subject?: string | null;
  reflection?: string | null;
  /** Draw the frame for this run and return where each family node goes (framing slots excluded). */
  draw(run: DmToolRun, ctx: ChartContext): EntrySpec[];
};

type Entry = {
  node: PsNode;
  spec: EntrySpec;
  item: HTMLDivElement;
  button: HTMLButtonElement;
  head: HTMLSpanElement;
  title: HTMLSpanElement;
  meta: HTMLSpanElement;
  proposed: HTMLSpanElement;
  task: HTMLSpanElement | null;
  card: HTMLDivElement;
  cardKey: string;
};

/** Element with a class name and optional text. */
export function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const out = doc.createElement(tag);
  out.className = className;
  if (text) out.textContent = text;
  return out;
}

export function setText(target: Element, value: string): void {
  if (target.textContent !== value) target.textContent = value;
}

export function setAttr(target: Element, name: string, value: string | null): void {
  if (value === null) {
    if (target.hasAttribute(name)) target.removeAttribute(name);
  } else if (target.getAttribute(name) !== value) target.setAttribute(name, value);
}

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** An SVG element with attributes. */
export function svg<K extends keyof SVGElementTagNameMap>(doc: Document, tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] {
  const out = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) out.setAttribute(name, value);
  return out;
}

export const slotName = (node: PsNode): string => parseSlot(node.slot)?.name ?? '';
export const slotIndex = (node: PsNode): number => parseSlot(node.slot)?.index ?? 0;
const FRAMING = new Set(['subject', 'reflection']);

const STATE_WORDS = { empty: 'Empty', populated: 'In progress', completed: 'Completed' } as const;

export function createChart(opts: ChartOptions, doc: Document = document): ChartView {
  const root = el(doc, 'div', `dm-chart dm-chart--${opts.family}`);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', opts.label);
  const state = el(doc, 'p', 'dm-chart__state');
  const subjectBox = el(doc, 'div', 'dm-chart__subject');
  const frame = el(doc, 'div', 'dm-chart__frame');
  const reflectionBox = el(doc, 'div', 'dm-chart__reflection');
  const panel = el(doc, 'div', 'dm-chart__panel');
  if (opts.subject) subjectBox.append(el(doc, 'span', 'dm-chart__slot-label', opts.subject));
  if (opts.reflection) reflectionBox.append(el(doc, 'span', 'dm-chart__slot-label', opts.reflection));
  root.append(state, ...(opts.subject ? [subjectBox] : []), frame, ...(opts.reflection ? [reflectionBox] : []), panel);

  const entries = new Map<string, Entry>();
  const group = createDisclosureGroup({
    onChange() {
      for (const entry of entries.values()) {
        const open = entry.card.classList.contains('is-open');
        entry.item.classList.toggle('is-selected', open);
        setAttr(entry.item, 'data-state', open ? 'selected' : entry.node.state === 'contested' ? 'contested' : 'populated');
      }
    }
  });
  let links = new Map<string, string>();
  let proposed = new Set<string>();
  let scoreCb: ((scores: Record<string, unknown>) => void) | null = null;
  let lastRun: DmToolRun | null = null;
  let painted = false;
  let destroyed = false;

  const ctx: ChartContext = {
    doc,
    frame,
    first: true,
    emitScore(payload) {
      if (!destroyed) scoreCb?.(payload);
    }
  };

  function makeEntry(spec: EntrySpec): Entry {
    const detailsId = nextId('dm-details');
    const item = el(doc, 'div', 'dm-entry');
    item.setAttribute('data-shape', '');
    const button = el(doc, 'button', 'dm-entry__pill');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', detailsId);
    const head = el(doc, 'span', 'dm-entry__head');
    const title = el(doc, 'span', 'dm-entry__title');
    head.append(title);
    const meta = el(doc, 'span', 'dm-entry__meta');
    meta.hidden = true;
    const waiting = el(doc, 'span', 'dm-entry__meta dm-entry__proposed', 'Proposed task');
    waiting.hidden = true;
    button.append(head, meta, waiting);
    item.append(button);
    const card = el(doc, 'div', 'ps-details');
    card.id = detailsId;
    group.register(card, button);
    return { node: spec.node, spec, item, button, head, title, meta, proposed: waiting, task: null, card, cardKey: '' };
  }

  function dropEntry(id: string): void {
    const entry = entries.get(id);
    if (!entry) return;
    if (entry.card.classList.contains('is-open')) group.close();
    group.unregister(entry.card);
    cancelAnimations(entry.item);
    entry.item.remove();
    entry.card.remove();
    entries.delete(id);
  }

  /** Words, fill, meta, task tag and details in step with the node. True when the task tag first appears. */
  function syncEntry(entry: Entry, spec: EntrySpec): boolean {
    const { node } = spec;
    entry.node = node;
    entry.spec = spec;
    setAttr(entry.item, 'data-node', node.id);
    setAttr(entry.card, 'data-for', node.id);
    setAttr(entry.item, 'data-fill', spec.fill);
    setAttr(entry.item, 'data-state', entry.card.classList.contains('is-open') ? 'selected' : node.state === 'contested' ? 'contested' : 'populated');
    entry.item.style.order = String(spec.order ?? slotIndex(node));
    for (const [name, value] of Object.entries(spec.style ?? {})) if (entry.item.style.getPropertyValue(name) !== value) entry.item.style.setProperty(name, value);
    setText(entry.title, nodeTitle(node));
    entry.meta.hidden = !spec.meta;
    setText(entry.meta, spec.meta ?? '');

    const status = links.get(node.id);
    const removed = status === 'removed';
    const linked = status !== undefined && !removed;
    const label = status === undefined ? '' : taskStatusLabel(status);
    setAttr(entry.item, 'data-task-status', status ?? null);
    entry.item.classList.toggle('is-task', linked);
    entry.item.classList.toggle('is-removed', removed);
    const waiting = status === undefined && proposed.has(node.id);
    entry.proposed.hidden = !waiting;

    let born = false;
    if (status === undefined) {
      entry.task?.remove();
      entry.task = null;
    } else {
      if (!entry.task) {
        entry.task = el(doc, 'span', 'dm-entry__task');
        entry.task.append(el(doc, 'span', 'dm-entry__task-mark'), el(doc, 'span', 'dm-entry__task-status'));
        entry.button.append(entry.task);
        born = true;
      }
      entry.task.classList.toggle('is-removed', removed);
      setText(entry.task.children[0], removed ? label : 'Task');
      setText(entry.task.children[1], removed ? '' : label);
      (entry.task.children[1] as HTMLElement).hidden = removed || !label;
    }

    const taskWords = removed ? ', task removed' : linked ? (label ? `, task: ${label}` : ', task') : waiting ? ', proposed task' : '';
    const contested = node.state === 'contested' ? ', contested' : '';
    setAttr(entry.button, 'aria-label', `${spec.label}: ${nodeTitle(node)}${spec.meta ? ` (${spec.meta})` : ''}${taskWords}${contested}. Show details`);
    const key = `${node.text}\u0000${node.state}\u0000${node.objection ?? ''}\u0000${(node.skills ?? []).join(',')}\u0000${spec.fill}`;
    if (entry.cardKey !== key) {
      const fresh = detailsCard(doc, node, 'red', entry.card.id);
      const inner = fresh.querySelector('.ps-details__card');
      if (inner) inner.className = `ps-details__card dm-details__card dm-details__card--${spec.fill}`;
      entry.card.replaceChildren(...fresh.childNodes);
      entry.cardKey = key;
    }
    syncContested(entry.item, node, entry.head, entry.button);
    return born;
  }

  function framingSpecs(run: DmToolRun): EntrySpec[] {
    const out: EntrySpec[] = [];
    for (const node of run.nodes) {
      const name = slotName(node);
      if (name === 'subject' && opts.subject) out.push({ node, host: subjectBox, fill: 'ink', label: opts.subject });
      if (name === 'reflection' && opts.reflection) out.push({ node, host: reflectionBox, fill: 'ink', label: opts.reflection });
    }
    return out;
  }

  function layout(run: DmToolRun, justConfirmed: Set<string> = new Set()): void {
    ctx.first = !painted;
    const familyNodes = { ...run, nodes: run.nodes.filter((node) => !FRAMING.has(slotName(node))) };
    const specs = [...framingSpecs(run), ...opts.draw(familyNodes, ctx)];
    // Scores alone (a radar scored before any note) count as content.
    const kind = run.status === 'done' ? 'completed' : run.nodes.length || run.scores?.snapshots?.length ? 'populated' : 'empty';
    setAttr(root, 'data-state', kind);
    setText(state, STATE_WORDS[kind]);
    const wanted = new Map(specs.map((spec) => [spec.node.id, spec]));

    // Reads first: where each entry stands now, before anything moves.
    const before = new Map<Entry, DOMRect>();
    if (painted) for (const [id, entry] of entries) if (wanted.has(id) && entry.item.isConnected) before.set(entry, entry.item.getBoundingClientRect());
    const active = doc.activeElement;
    const focused = active instanceof HTMLElement && active !== root && root.contains(active) ? active : null;

    for (const id of [...entries.keys()]) if (!wanted.has(id)) dropEntry(id);
    const fresh: Entry[] = [];
    const tagged: Entry[] = [];
    for (const spec of specs) {
      let entry = entries.get(spec.node.id);
      if (!entry) {
        entry = makeEntry(spec);
        entries.set(spec.node.id, entry);
        fresh.push(entry);
      }
      if (syncEntry(entry, spec) && justConfirmed.has(spec.node.id)) tagged.push(entry);
      if (entry.item.parentElement !== spec.host) spec.host.append(entry.item);
    }
    // Hosts keep their entries in order (a node can change slot or host on another device).
    for (const host of new Set(specs.map((spec) => spec.host))) {
      const items = [...host.querySelectorAll(':scope > .dm-entry')] as HTMLDivElement[];
      const sorted = [...items].sort((a, b) => Number(a.style.order) - Number(b.style.order));
      if (sorted.some((item, i) => items[i] !== item)) for (const item of sorted) host.append(item);
    }
    // Details cards in reading order (document order of their entries).
    const order = [...root.querySelectorAll('.dm-entry')].map((item) => [...entries.values()].find((entry) => entry.item === item)!.card);
    order.forEach((card, i) => {
      if (panel.children[i] !== card) panel.insertBefore(card, panel.children[i] ?? null);
    });
    if (focused?.isConnected && doc.activeElement !== focused) focused.focus({ preventScroll: true });

    if (painted) {
      const moving = [...before.keys()];
      for (const entry of moving) cancelAnimations(entry.item);
      const after = new Map<Entry, DOMRect>();
      for (const entry of moving) after.set(entry, entry.item.getBoundingClientRect());
      for (const [entry, rect] of after) {
        const was = before.get(entry)!;
        const dx = was.left + was.width / 2 - (rect.left + rect.width / 2);
        const dy = was.top + was.height / 2 - (rect.top + rect.height / 2);
        if ((Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) || !canAnimate(entry.item)) continue;
        entry.item.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 520, easing: EASE });
      }
      for (const entry of fresh) {
        if (!canAnimate(entry.item)) continue;
        entry.item.animate([{ opacity: 0, transform: 'translateY(-16px)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 80, easing: EASE, fill: 'backwards' });
      }
      for (const entry of tagged) {
        if (!entry.task || !canAnimate(entry.task)) continue;
        entry.task.animate([{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: EASE, fill: 'backwards' });
      }
    }
    painted = true;
  }

  return {
    el: root,
    update(run) {
      if (destroyed) return;
      lastRun = run;
      layout(run);
    },
    setTasks(next) {
      if (destroyed) return;
      const map = new Map(next.map((link) => [link.nodeId, link.status]));
      if (map.size === links.size && [...map].every(([id, status]) => links.get(id) === status)) return;
      const confirmed = new Set([...map.keys()].filter((id) => !links.has(id) && proposed.has(id)));
      links = map;
      if (lastRun) layout(lastRun, confirmed);
    },
    setProposed(nodeIds) {
      if (destroyed) return;
      const next = new Set(nodeIds);
      if (next.size === proposed.size && [...next].every((id) => proposed.has(id))) return;
      proposed = next;
      if (lastRun) layout(lastRun);
    },
    onScore(cb) {
      scoreCb = cb;
    },
    destroy() {
      destroyed = true;
      cancelAnimations(root);
    }
  };
}
```

- [ ] **Step 4: Write the quadrant chart**

```ts
// packages/decision-book/render/quadrant.ts
// The quadrant family's chart: a 2×2 of named cells on two labelled axes, the y axis's words
// running up the left (high at the top) and the x axis's along the foot (high at the right),
// as the cells' `col` and `row` say. Each item is a pill in its cell. A payoff cell shows its
// fixed note under the label. Phone (the chart up to 480px wide): the axes go and the cells
// stack as labelled cards, each saying where it sits on both axes.
import { type DmToolRun, type ChartView, type EntrySpec, type Fill, createChart, el, slotIndex, slotName } from './core';

export type QuadrantCell = { id: string; label: string; col: 0 | 1; row: 0 | 1; fill: Fill; note?: string };
export type QuadrantChart = {
  axes: { x: { label: string; low: string; high: string }; y: { label: string; low: string; high: string } };
  cells: QuadrantCell[];
  item: string;
  subject?: string;
  reflection?: string | false;
};
export type ChartTool = { name: string; slots: Record<string, string> };

/** Where a cell sits, in words: "High value · Low effort". */
export function cellAxes(chart: QuadrantChart, cell: QuadrantCell): string {
  return `${cell.row === 0 ? chart.axes.y.high : chart.axes.y.low} · ${cell.col === 0 ? chart.axes.x.low : chart.axes.x.high}`;
}

export function createQuadrantView(tool: ChartTool & { chart: QuadrantChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const hosts = new Map<string, HTMLDivElement>();
  return createChart({
    family: 'quadrant',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const yAxis = el(doc, 'div', 'dm-quad__y');
        yAxis.setAttribute('aria-hidden', 'true');
        yAxis.append(el(doc, 'span', 'dm-quad__axis-high', chart.axes.y.high), el(doc, 'span', 'dm-quad__axis-label', chart.axes.y.label), el(doc, 'span', 'dm-quad__axis-low', chart.axes.y.low));
        const grid = el(doc, 'div', 'dm-quad__grid');
        for (const cell of chart.cells) {
          const box = el(doc, 'div', 'dm-quad__cell');
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', `${cell.label}: ${cellAxes(chart, cell).toLowerCase()}`);
          box.setAttribute('data-cell', cell.id);
          box.setAttribute('data-fill', cell.fill);
          box.style.gridColumn = String(cell.col + 1);
          box.style.gridRow = String(cell.row + 1);
          const head = el(doc, 'div', 'dm-quad__head');
          head.setAttribute('aria-hidden', 'true');
          head.append(el(doc, 'span', 'dm-quad__label', cell.label), el(doc, 'span', 'dm-quad__axes', cellAxes(chart, cell)));
          if (cell.note) head.append(el(doc, 'span', 'dm-quad__note', cell.note));
          const items = el(doc, 'div', 'dm-quad__items');
          box.append(head, items);
          grid.append(box);
          hosts.set(cell.id, items);
        }
        const xAxis = el(doc, 'div', 'dm-quad__x');
        xAxis.setAttribute('aria-hidden', 'true');
        xAxis.append(el(doc, 'span', 'dm-quad__axis-low', chart.axes.x.low), el(doc, 'span', 'dm-quad__axis-label', chart.axes.x.label), el(doc, 'span', 'dm-quad__axis-high', chart.axes.x.high));
        ctx.frame.append(yAxis, grid, xAxis);
      }
      return run.nodes
        .filter((node) => slotName(node) === 'item' && hosts.has(node.tag ?? ''))
        .map((node) => {
          const cell = chart.cells.find((c) => c.id === node.tag)!;
          return { node, host: hosts.get(cell.id)!, fill: cell.fill, label: `${cell.label} item ${slotIndex(node)}` };
        });
    }
  }, doc);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/tasks && npx vitest run tests/unit/decision-book-charts.test.ts`
Expected: PASS, 11 tests (the quadrant sample).

- [ ] **Step 6: Commit**

```bash
git add packages/decision-book/render/core.ts packages/decision-book/render/quadrant.ts apps/tasks/tests/unit/decision-book-charts.test.ts apps/tasks/tests/unit/helpers/decision-book-charts.ts
git commit -m "Decision Maker: the chart core and the quadrant chart

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The other family charts, the one-offs and the decision record

**Files:**
- Create: `packages/decision-book/render/{plot,scales,curve,tension,path,list,outside-box,black-box,record}.ts`
- Modify: `apps/tasks/tests/unit/helpers/decision-book-charts.ts` (the full map)
- Test: `apps/tasks/tests/unit/decision-book-family-charts.test.ts`

Each chart in brief:
- **Plot:** places points by their merged positions, keeps unplaced points in a tray, and sends a placement from its form. A point near an edge hangs inward (`--dm-shift`).
- **Scales:** draws series as solid, outline or dotted lines, never by colour alone. Pairs and axes get bars; the radar gets polygons with axis names around it; shares get a cut bar with a live total. One form per series sends a snapshot.
- **Curve:** draws its line from `curves.mjs` and puts the marker on the curve at the middle of its region, with no numbers on the axes.
- **Tension:** pull and gap are columns around the centre. The triangle marks its fixed corners "Fixed".
- **Path:** a flow shows the route taken, with Yes and No words and "Now" on the stage being asked. Stages get one track per round. Layers hold their holes, and an unlinked hole waits below.
- **List:** one structure laid out by `data-layout`, with pyramids drawn from the top level down, one per column.
- **The record:** a headline, then reasons with what each rests on (`setBasis`), the Stop Rule "If … then …" band, and the first step and review date (an ISO date is shown in words).

- [ ] **Step 1: Write the failing tests and the full helper**

```ts
// What each Decision Book family chart draws beyond the shared contract.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChartFor } from './helpers/decision-book-charts';
import { runFor, SAMPLE_TOOLS, sampleNode, sampleRun } from '../../../../packages/decision-book/fixtures.mjs';
import { createRecordView, reviewWords } from '../../../../packages/decision-book/render/record';
import { pct } from '../../../../packages/decision-book/render/plot';
import { radarPoints } from '../../../../packages/decision-book/render/scales';
import { curvePath } from '../../../../packages/decision-book/render/curve';
import { NINE_DOT_ANSWER } from '../../../../packages/decision-book/render/outside-box';
import { createListView } from '../../../../packages/decision-book/render/list';
import type { DmToolRun } from '../../../../packages/decision-book/render/core';

afterEach(() => document.body.replaceChildren());
const run = (key: string, stage: 'empty' | 'partial' | 'full') => runFor(key, stage) as DmToolRun;
const texts = (root: Element, selector: string) => [...root.querySelectorAll(selector)].map((e) => e.textContent);
const entryIn = (root: Element, host: string, id: string) => root.querySelector(`${host} .dm-entry[data-node="${id}"]`);

describe('quadrant', () => {
  it('puts each cell at its col and row, with its place on both axes in words', () => {
    const view = createChartFor('quadrant');
    view.update(run('quadrant', 'full'));
    const cell = (id: string) => view.el.querySelector<HTMLElement>(`[data-cell="${id}"]`)!;
    expect([cell('big_bet').style.gridColumn, cell('big_bet').style.gridRow]).toEqual(['2', '1']);
    expect(cell('quick_win').querySelector('.dm-quad__axes')!.textContent).toBe('High value · Low effort');
    expect(cell('drain').getAttribute('data-fill')).toBe('ink');
    expect(entryIn(view.el, '[data-cell="drain"]', 'q4')).not.toBeNull();
    expect(texts(view.el, '.dm-quad__y span')).toEqual(['High value', 'Value', 'Low value']);
    expect(texts(view.el, '.dm-quad__x span')).toEqual(['Low effort', 'Effort', 'High effort']);
  });

  it('moves an item to its new cell as the same element', () => {
    const view = createChartFor('quadrant');
    const full = run('quadrant', 'full');
    view.update(full);
    const item = view.el.querySelector('.dm-entry[data-node="q3"]');
    view.update({ ...full, nodes: full.nodes.map((n) => (n.id === 'q3' ? { ...n, tag: 'big_bet' } : n)) });
    expect(entryIn(view.el, '[data-cell="big_bet"]', 'q3')).toBe(item);
  });

  it('puts the reflection under the frame', () => {
    const view = createChartFor('quadrant');
    view.update(run('quadrant', 'full'));
    expect(entryIn(view.el, '.dm-chart__reflection', 'q5')).not.toBeNull();
  });
});

describe('plot', () => {
  it('places points by their merged positions and keeps the rest in the tray', () => {
    const view = createChartFor('plot');
    const partial = { ...run('plot', 'partial'), scores: { snapshots: [{ at: 'x', points: { p1: { x: 1, y: 10, size: 6 } } }] } };
    view.update(partial);
    const p1 = view.el.querySelector<HTMLElement>('.dm-plot__field .dm-entry[data-node="p1"]')!;
    expect(p1.style.left).toBe(`${pct(1)}%`);
    expect(p1.style.bottom).toBe(`${pct(10)}%`);
    expect(p1.style.getPropertyValue('--dm-size')).toBe('6');
    expect(entryIn(view.el, '.dm-plot__tray', 'p2')).not.toBeNull();
    expect(texts(view.el, '.dm-plot__key-item')).toEqual(['Night class: Cost 1, Joy 10, time it takes 6', 'Weekend trip: not placed yet']);
  });

  it('sends a placement from the form', () => {
    const view = createChartFor('plot');
    const sent: unknown[] = [];
    view.onScore((scores) => sent.push(scores));
    view.update(run('plot', 'partial'));
    const row = view.el.querySelectorAll('.dm-plot__row')[1];
    const [x, y, size] = [...row.querySelectorAll('select')];
    x.value = '2';
    y.value = '9';
    size.value = '5';
    row.querySelector<HTMLButtonElement>('.dm-plot__place')!.click();
    expect(sent).toEqual([{ points: { p2: { x: 2, y: 9, size: 5 } } }]);
  });

  it('draws the band from its 1–10 bounds', () => {
    const view = createChartFor('plot');
    view.update(run('plot', 'empty'));
    const band = view.el.querySelector<HTMLElement>('.dm-plot__band')!;
    expect(band.textContent).toBe('Sweet spot');
    expect(band.style.left).toBe(`${pct(1)}%`);
    expect(band.style.height).toBe(`${pct(10) - pct(6)}%`);
  });
});

describe('scales', () => {
  it('pairs: a bar per series at the low pole share, each in its own line style', () => {
    const view = createChartFor('scales');
    view.update(run('scales', 'full'));
    const bars = [...view.el.querySelectorAll<HTMLElement>('[data-scale="pace"] .dm-scales__bar')];
    expect(bars.map((b) => [b.getAttribute('data-style'), b.style.width])).toEqual([['solid', '20%'], ['outline', '50%']]);
    expect(bars[0].title).toBe('Now: Slow 2, Fast 8');
    expect(entryIn(view.el, '[data-scale="company"]', 's2')).not.toBeNull();
  });

  it('sends a series from its form', () => {
    const view = createChartFor('scales');
    const sent: unknown[] = [];
    view.onScore((scores) => sent.push(scores));
    view.update(run('scales', 'empty'));
    const form = view.el.querySelectorAll('.dm-scales__series-form')[1];
    const inputs = [...form.querySelectorAll('input')];
    inputs.forEach((input, i) => (input.value = String(i + 3)));
    form.querySelector<HTMLButtonElement>('.dm-scales__save')!.click();
    expect(sent).toEqual([{ series: 'wanted', values: { pace: 3, scope: 4, company: 5 } }]);
  });

  it('radar: one polygon per series from the scores', () => {
    const view = createChartFor('radar');
    view.update(run('radar', 'full'));
    expect(view.el.querySelector('.dm-scales__poly')!.getAttribute('points')).toBe(radarPoints([6, 7, 5, 3]));
    expect(radarPoints([10, 10, 10, 10]).split(' ')[0]).toBe('50.0,8.0');
  });

  it('radar: axis names around the rings, starting at the top; its rows keep the notes', () => {
    const view = createChartFor('radar');
    view.update(run('radar', 'full'));
    const labels = [...view.el.querySelectorAll<HTMLElement>('.dm-scales__radar-label')];
    expect(labels.map((l) => l.textContent)).toEqual(['Calm', 'Focus', 'Energy', 'Sleep']);
    expect([labels[0].style.left, labels[0].style.top]).toEqual(['50.0%', '1.0%']);
    expect(view.el.querySelector('.dm-scales__rows')!.getAttribute('data-layout')).toBe('radar');
    expect(entryIn(view.el, '[data-scale="sleep"]', 'r1')).not.toBeNull();
  });

  it('a run with scores and no nodes says In progress', () => {
    const view = createChartFor('radar');
    view.update({ ...run('radar', 'full'), nodes: [] });
    expect(view.el.querySelector('.dm-chart__state')!.textContent).toBe('In progress');
  });

  it('shares: a bar cut into its parts, with a live total in the form', () => {
    const view = createChartFor('shares');
    view.update(run('shares', 'full'));
    expect(texts(view.el, '.dm-scales__part')).toEqual(['Work 60%', 'Home 30%', 'Play 10%']);
    const inputs = [...view.el.querySelectorAll<HTMLInputElement>('.dm-scales__series-form input')];
    inputs[0].value = '50';
    inputs[0].dispatchEvent(new Event('input'));
    expect(view.el.querySelector('.dm-scales__total')!.textContent).toBe('Total 90 of 100');
  });
});

describe('curve', () => {
  it('draws the line from its shape and puts the marker on it in the chosen region', () => {
    const view = createChartFor('curve');
    view.update(run('curve', 'full'));
    expect(view.el.querySelector('.dm-curve__line')!.getAttribute('d')).toBe(curvePath('u'));
    const marker = view.el.querySelector<SVGCircleElement>('.dm-curve__marker')!;
    expect(marker.style.display).toBe('');
    expect(marker.getAttribute('cx')).toBe('85.00');
    expect(view.el.querySelector('[data-region="many"]')!.classList.contains('is-here')).toBe(true);
    expect(entryIn(view.el, '[data-region="many"]', 'c1')).not.toBeNull();
    expect(texts(view.el, '.dm-curve__region-label')).toEqual(['Too few', 'Enough', 'Too many']);
  });

  it('hides the marker before a position is given, and has no numbers on its axes', () => {
    const view = createChartFor('curve');
    view.update(run('curve', 'empty'));
    expect(view.el.querySelector<SVGCircleElement>('.dm-curve__marker')!.style.display).toBe('none');
    expect(view.el.querySelector('.dm-chart__frame')!.textContent).not.toMatch(/\d/);
  });
});

describe('tension', () => {
  it('pull: forces sit on their side around the centre', () => {
    const view = createChartFor('tension');
    view.update(run('tension', 'full'));
    expect(entryIn(view.el, '.dm-tension__centre', 't1')).not.toBeNull();
    expect(entryIn(view.el, '[data-side="holds"]', 't2')).not.toBeNull();
    expect(entryIn(view.el, '[data-side="pulls"]', 't4')).not.toBeNull();
  });

  it('triangle: fixed corners say Fixed', () => {
    const view = createChartFor('triangle');
    view.update(run('triangle', 'full'));
    const fixed = [...view.el.querySelectorAll('.dm-tension__side')].filter((s) => !s.querySelector<HTMLElement>('.dm-tension__fixed')!.hidden).map((s) => s.getAttribute('data-side'));
    expect(fixed).toEqual(['good', 'cheap']);
    expect(entryIn(view.el, '[data-side="cheap"] .dm-tension__fixes', 'g6')).not.toBeNull();
  });
});

describe('path', () => {
  it('flow: the route taken with Yes and No words, then the end', () => {
    const view = createChartFor('flow');
    view.update(run('flow', 'full'));
    expect([...view.el.querySelectorAll('.dm-path__step')].map((s) => s.getAttribute('data-stage'))).toEqual(['want', 'afford', 'wait']);
    expect(texts(view.el, '.dm-path__chip:not([hidden])')).toEqual(['Yes', 'No']);
  });

  it('flow: the stage being asked says Now; a changed answer reroutes', () => {
    const view = createChartFor('flow');
    const partial = run('flow', 'partial');
    view.update(partial);
    const now = view.el.querySelector('.dm-path__step[data-now="true"]')!;
    expect(now.getAttribute('data-stage')).toBe('afford');
    expect(now.querySelector('.dm-path__chip')!.textContent).toBe('Now');
    view.update({ ...partial, nodes: [{ ...partial.nodes[0], tag: 'no' }] });
    expect([...view.el.querySelectorAll('.dm-path__step')].map((s) => s.getAttribute('data-stage'))).toEqual(['want', 'drop']);
  });

  it('stages: a track per round', () => {
    const view = createChartFor('stages');
    view.update(run('stages', 'full'));
    expect(texts(view.el, '.dm-path__round-label')).toEqual(['Round 1', 'Round 2']);
    expect(view.el.querySelectorAll('.dm-path__round')[1].querySelector('.dm-entry[data-node="a4"]')).not.toBeNull();
  });

  it('layers: holes sit in their layer; an unlinked hole waits below', () => {
    const view = createChartFor('layers');
    const full = run('layers', 'full');
    view.update(full);
    expect(view.el.querySelector('.dm-path__layer .dm-path__holes .dm-entry[data-node="l3"]')).not.toBeNull();
    view.update({ ...full, edges: full.edges.slice(0, 1) });
    expect(entryIn(view.el, '.dm-path__loose', 'l4')).not.toBeNull();
    expect(view.el.querySelector<HTMLElement>('.dm-path__loose')!.hidden).toBe(false);
  });
});

describe('list', () => {
  it('lanes: entries in their group; groups carry their fill in order', () => {
    const view = createChartFor('list');
    view.update(run('list', 'full'));
    expect(view.el.querySelector('.dm-list')!.getAttribute('data-layout')).toBe('lanes');
    expect(entryIn(view.el, '[data-group="stop"]', 'i2')!.getAttribute('data-fill')).toBe('tint');
  });

  it('pyramid: one stack per column, drawn from the top level down', () => {
    const view = createChartFor('pyramid');
    view.update(run('pyramid', 'full'));
    expect(texts(view.el, '.dm-list__column-name')).toEqual(['Then', 'Now']);
    const first = view.el.querySelector('.dm-list__column')!;
    expect([...first.querySelectorAll('.dm-list__group')].map((g) => g.getAttribute('data-group'))).toEqual(['then_top', 'then_base']);
    expect(first.querySelector<HTMLElement>('[data-group="then_base"]')!.style.getPropertyValue('--dm-level')).toBe('0');
  });

  it('checklist: a group says Done once it has an entry', () => {
    const tool = { ...(SAMPLE_TOOLS as Record<string, unknown>).list as object, chart: { layout: 'checklist', groups: [{ id: 'keep', label: 'Keep' }, { id: 'stop', label: 'Stop' }], entry: 'e' } };
    const view = createListView(tool as never);
    view.update(sampleRun('dm_sample_list', [sampleNode('k', 'entry:1', 'Walk', { tag: 'keep' })]) as DmToolRun);
    expect(view.el.querySelector<HTMLElement>('[data-group="keep"] .dm-list__done')!.hidden).toBe(false);
    expect(view.el.querySelector<HTMLElement>('[data-group="stop"] .dm-list__done')!.hidden).toBe(true);
  });
});

describe('the one-offs', () => {
  it('nine dots: the answer is four lines and the toggle shows and hides it', () => {
    expect(NINE_DOT_ANSWER.length - 1).toBe(4);
    const view = createChartFor('outside_box');
    view.update(run('outside_box', 'full'));
    expect(view.el.querySelectorAll('.dm-dots__dot').length).toBe(9);
    const toggle = view.el.querySelector<HTMLButtonElement>('.dm-dots__toggle')!;
    toggle.click();
    expect(view.el.querySelector('.dm-dots')!.classList.contains('is-revealed')).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.textContent).toBe('Hide the answer');
  });

  it('black box: a ? until the inside is named', () => {
    const view = createChartFor('black_box');
    view.update(run('black_box', 'partial'));
    expect(view.el.querySelector<HTMLElement>('.dm-box__mark')!.hidden).toBe(false);
    view.update(run('black_box', 'full'));
    expect(view.el.querySelector<HTMLElement>('.dm-box__mark')!.hidden).toBe(true);
    expect(entryIn(view.el, '.dm-box__box', 'b4')).not.toBeNull();
  });
});

describe('decision record', () => {
  it('reads as headline, reasons, an If/then band, first step and review date', () => {
    const view = createRecordView();
    view.update(run('record', 'full'));
    expect(entryIn(view.el, '.dm-record__decision', 'd1')).not.toBeNull();
    expect(entryIn(view.el, '.dm-record__stop .dm-record__if', 'd4')).not.toBeNull();
    expect(entryIn(view.el, '.dm-record__stop .dm-record__then', 'd5')).not.toBeNull();
    expect(view.el.querySelector('.dm-entry[data-node="d7"] .dm-entry__meta')!.textContent).toBe('1 February 2027');
  });

  it('shows what each reason rests on, and keeps the same element when the basis arrives', () => {
    const view = createRecordView();
    view.update(run('record', 'full'));
    const reason = view.el.querySelector('.dm-entry[data-node="d2"]')!;
    view.setBasis({ d2: [{ model: 'Rubber band', title: 'A bigger role' }] });
    expect(view.el.querySelector('.dm-entry[data-node="d2"]')).toBe(reason);
    expect(reason.querySelector('.dm-entry__meta')!.textContent).toBe('Rests on Rubber band: A bigger role');
    expect(reason.querySelector('button')!.getAttribute('aria-label')).toContain('(Rests on Rubber band: A bigger role)');
  });

  it('writes an ISO review date in words and leaves other words alone', () => {
    expect(reviewWords('2027-02-01')).toBe('1 February 2027');
    expect(reviewWords('after the first month')).toBe('after the first month');
  });
});

describe('motion and focus', () => {
  it('keeps focus on a pill that moves', () => {
    const proto = Element.prototype as unknown as { animate?: unknown };
    proto.animate = () => null;
    vi.spyOn(Element.prototype, 'animate').mockImplementation(() => ({ cancel() {} }) as unknown as Animation);
    const view = createChartFor('quadrant');
    document.body.append(view.el);
    const full = run('quadrant', 'full');
    view.update(full);
    const button = view.el.querySelector<HTMLButtonElement>('.dm-entry[data-node="q3"] button')!;
    button.focus();
    view.update({ ...full, nodes: full.nodes.map((n) => (n.id === 'q3' ? { ...n, tag: 'drain' } : n)) });
    expect(document.activeElement).toBe(button);
    delete proto.animate;
    vi.restoreAllMocks();
  });
});
```

Replace `apps/tasks/tests/unit/helpers/decision-book-charts.ts` with:

```ts
// Builds the right chart for each sample key, so one contract suite covers every renderer.
import { SAMPLE_TOOLS } from '../../../../../packages/decision-book/fixtures.mjs';
import type { ChartView } from '../../../../../packages/decision-book/render/core';
import { createQuadrantView } from '../../../../../packages/decision-book/render/quadrant';
import { createPlotView } from '../../../../../packages/decision-book/render/plot';
import { createScalesView } from '../../../../../packages/decision-book/render/scales';
import { createCurveView } from '../../../../../packages/decision-book/render/curve';
import { createTensionView } from '../../../../../packages/decision-book/render/tension';
import { createPathView } from '../../../../../packages/decision-book/render/path';
import { createListView } from '../../../../../packages/decision-book/render/list';
import { createOutsideBoxView } from '../../../../../packages/decision-book/render/outside-box';
import { createBlackBoxView } from '../../../../../packages/decision-book/render/black-box';
import { createRecordView } from '../../../../../packages/decision-book/render/record';

type SampleTool = { id: string; family: string };
const TOOLS = SAMPLE_TOOLS as unknown as Record<string, SampleTool>;
const BY_FAMILY: Record<string, (tool: never) => ChartView> = {
  quadrant: createQuadrantView,
  plot: createPlotView,
  scales: createScalesView,
  curve: createCurveView,
  tension: createTensionView,
  path: createPathView,
  list: createListView
};
const BY_ID: Record<string, (tool: never) => ChartView> = {
  dm_outside_box: createOutsideBoxView,
  dm_black_box: createBlackBoxView
};

/** Every sample key, plus the decision record. */
export const CHARTS: string[] = [...Object.keys(TOOLS), 'record'];

export function createChartFor(key: string): ChartView {
  if (key === 'record') return createRecordView();
  const tool = TOOLS[key];
  const make = BY_ID[tool.id] ?? BY_FAMILY[tool.family];
  return make(tool as never);
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/tasks && npx vitest run tests/unit/decision-book-charts.test.ts tests/unit/decision-book-family-charts.test.ts`
Expected: FAIL, because the renderer modules do not exist.

- [ ] **Step 3: Write the plot and scales charts**

```ts
// packages/decision-book/render/plot.ts
// The plot family's chart: one square field per plot (two qualitative axes, low at the bottom
// left), an optional shaded band, and each point as a pill at its place. A point not yet
// placed waits in a tray under the field. The person places points with the form under the
// chart: per point, a 1–10 select for each axis (and size), then Place, which sends a score
// snapshot. Phone: the field keeps its square (pills shrink to dots with the name in the key);
// the key lists every point with its position in words.
import { positionsOf } from '../families/plot.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setText, slotIndex, slotName } from './core';
import type { ChartTool } from './quadrant';

type Axes = { x: { label: string; low: string; high: string }; y: { label: string; low: string; high: string } };
export type PlotChart = {
  axes?: Axes;
  plots?: { id: string; label: string; axes: Axes }[];
  point: string;
  size?: { label: string };
  band?: { label: string; x: [number, number]; y: [number, number] };
};
type Place = { x?: number; y?: number; size?: number };

/** Percent along an axis for a 1–10 value (1 at 5%, 10 at 95%). */
export const pct = (value: number): number => 5 + ((value - 1) / 9) * 90;
/** How far a pill shifts left of its point: none near the left edge, all of it near the right. */
export const shift = (x: number): string => (x <= 3 ? '0%' : x >= 8 ? '-100%' : '-50%');

export function createPlotView(tool: ChartTool & { chart: PlotChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const plots = chart.plots ?? [{ id: 'main', label: '', axes: chart.axes! }];
  const fields = new Map<string, { field: HTMLDivElement; tray: HTMLDivElement }>();
  const key = el(doc, 'ol', 'dm-plot__key');
  const form = el(doc, 'form', 'dm-plot__form');
  const rows = new Map<string, { row: HTMLFieldSetElement; name: HTMLLegendElement; selects: Record<string, HTMLSelectElement> }>();
  let emit: (payload: Record<string, unknown>) => void = () => {};
  let formHead: HTMLParagraphElement | null = null;

  function select(label: string, value: number | undefined): HTMLLabelElement {
    const wrap = el(doc, 'label', 'dm-plot__pick');
    wrap.append(el(doc, 'span', 'dm-plot__pick-label', label));
    const input = el(doc, 'select', 'dm-plot__select');
    input.append(el(doc, 'option', '', '–'));
    for (let n = 1; n <= 10; n += 1) input.append(Object.assign(el(doc, 'option', '', String(n)), { value: String(n) }));
    input.value = value ? String(value) : '–';
    wrap.append(input);
    return wrap;
  }

  function syncForm(points: { id: string; title: string; plot: (typeof plots)[number] }[], at: Record<string, Place>): void {
    for (const id of [...rows.keys()]) if (!points.some((p) => p.id === id)) {
      rows.get(id)!.row.remove();
      rows.delete(id);
    }
    for (const point of points) {
      let row = rows.get(point.id);
      if (!row) {
        const fieldset = el(doc, 'fieldset', 'dm-plot__row');
        const name = el(doc, 'legend', 'dm-plot__row-name');
        const x = select(point.plot.axes.x.label, at[point.id]?.x);
        const y = select(point.plot.axes.y.label, at[point.id]?.y);
        const size = chart.size ? select(chart.size.label, at[point.id]?.size) : null;
        const go = el(doc, 'button', 'dm-plot__place', 'Place');
        go.type = 'button';
        const selects: Record<string, HTMLSelectElement> = { x: x.querySelector('select')!, y: y.querySelector('select')! };
        if (size) selects.size = size.querySelector('select')!;
        go.addEventListener('click', () => {
          const place: Place = {};
          for (const [axis, input] of Object.entries(selects)) if (input.value !== '–') place[axis as keyof Place] = Number(input.value);
          if (place.x && place.y) emit({ points: { [point.id]: place } });
        });
        fieldset.append(name, x, y, ...(size ? [size] : []), go);
        form.append(fieldset);
        row = { row: fieldset, name, selects };
        rows.set(point.id, row);
      }
      setText(row.name, point.title);
      for (const [axis, input] of Object.entries(row.selects)) {
        const value = at[point.id]?.[axis as keyof Place];
        if (value && doc.activeElement !== input) input.value = String(value);
      }
      form.append(row.row);
    }
  }

  return createChart({
    family: 'plot',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      emit = ctx.emitScore;
      if (!fields.size) {
        for (const plot of plots) {
          const wrap = el(doc, 'div', 'dm-plot__plot');
          if (plot.label) wrap.append(el(doc, 'h3', 'dm-plot__title', plot.label));
          const body = el(doc, 'div', 'dm-plot__body');
          const y = el(doc, 'div', 'dm-plot__y');
          y.setAttribute('aria-hidden', 'true');
          y.append(el(doc, 'span', '', plot.axes.y.high), el(doc, 'span', 'dm-plot__axis-label', plot.axes.y.label), el(doc, 'span', '', plot.axes.y.low));
          const field = el(doc, 'div', 'dm-plot__field');
          field.setAttribute('role', 'group');
          field.setAttribute('aria-label', `${plot.label ? `${plot.label}: ` : ''}${plot.axes.x.label} across, ${plot.axes.y.label} up`);
          if (chart.band) {
            const band = el(doc, 'div', 'dm-plot__band', chart.band.label);
            band.style.left = `${pct(chart.band.x[0])}%`;
            band.style.width = `${pct(chart.band.x[1]) - pct(chart.band.x[0])}%`;
            band.style.bottom = `${pct(chart.band.y[0])}%`;
            band.style.height = `${pct(chart.band.y[1]) - pct(chart.band.y[0])}%`;
            field.append(band);
          }
          const x = el(doc, 'div', 'dm-plot__x');
          x.setAttribute('aria-hidden', 'true');
          x.append(el(doc, 'span', '', plot.axes.x.low), el(doc, 'span', 'dm-plot__axis-label', plot.axes.x.label), el(doc, 'span', '', plot.axes.x.high));
          body.append(y, field, x);
          const tray = el(doc, 'div', 'dm-plot__tray');
          tray.setAttribute('data-label', 'Not placed yet');
          wrap.append(body, tray);
          ctx.frame.append(wrap);
          fields.set(plot.id, { field, tray });
        }
        formHead = el(doc, 'p', 'dm-plot__form-head', 'Place each point: choose where it sits on each axis, then Place.');
        ctx.frame.append(key, formHead, form);
      }
      const at = positionsOf(run) as Record<string, Place>;
      const points = run.nodes.filter((node) => slotName(node) === 'point');
      const plotOf = (tag: string | undefined) => plots.find((p) => p.id === tag) ?? plots[0];
      if (formHead) formHead.hidden = !points.length;
      syncForm(points.map((node) => ({ id: node.id, title: node.title ?? node.text, plot: plotOf(node.tag) })), at);
      key.replaceChildren(...points.map((node) => {
        const place = at[node.id];
        const plot = plotOf(node.tag);
        const words = place?.x && place?.y ? `${plot.axes.x.label} ${place.x}, ${plot.axes.y.label} ${place.y}${place.size ? `, ${chart.size!.label.toLowerCase()} ${place.size}` : ''}` : 'not placed yet';
        return el(doc, 'li', 'dm-plot__key-item', `${node.title ?? node.text}: ${words}`);
      }));
      return points.map((node) => {
        const place = at[node.id];
        const plot = plotOf(node.tag);
        const { field, tray } = fields.get(plot.id)!;
        const placed = Boolean(place?.x && place?.y);
        return {
          node,
          host: placed ? field : tray,
          fill: placed ? 'green' : 'tint',
          label: `Point ${slotIndex(node)}${placed ? ` at ${plot.axes.x.label} ${place!.x}, ${plot.axes.y.label} ${place!.y}` : ', not placed'}`,
          style: placed ? { left: `${pct(place!.x!)}%`, bottom: `${pct(place!.y!)}%`, '--dm-size': String(place!.size ?? 4), '--dm-shift': shift(place!.x!) } : { left: '', bottom: '', '--dm-size': '', '--dm-shift': '' }
        };
      });
    }
  }, doc);
}
```

```ts
// packages/decision-book/render/scales.ts
// The scales family's chart. One row per scale, each series drawn in its own line style (the
// first solid, the next outlined, the third dotted) so overlays never depend on colour:
//   pairs   the low pole on the left, the high pole on the right, a bar split at the low
//           pole's share of ten;
//   axes    a bar per series along a 1–10 track, or (layout radar) a polygon per series;
//   shares  one bar per series cut into its parts of 100.
// Notes sit under the scale they are about. Under the chart, a form per series scores every
// scale and sends one snapshot (Save). Phone: rows stack, poles above their bar; a radar
// becomes bars.
import { valuesOf } from '../families/scales.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setText, slotIndex, slotName, svg } from './core';
import type { ChartTool } from './quadrant';

type Scale = { id: string; label?: string; low?: string; high?: string };
export type ScalesChart = { mode: 'pairs' | 'axes' | 'shares'; scales: Scale[]; series?: { id: string; label: string }[]; layout?: 'bars' | 'radar' };

const STYLES = ['solid', 'outline', 'dotted'];
const scaleName = (scale: Scale): string => scale.label ?? `${scale.low} or ${scale.high}`;

/** The radar polygon's points for values on 1–10 axes, in a 100×100 box. */
export function radarPoints(values: number[]): string {
  return values.map((value, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / values.length;
    const r = (value / 10) * 42;
    return `${(50 + r * Math.cos(angle)).toFixed(1)},${(50 + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

export function createScalesView(tool: ChartTool & { chart: ScalesChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const series = chart.series ?? [{ id: 'now', label: 'Now' }];
  const radar = chart.layout === 'radar';
  const rows = new Map<string, { track: HTMLDivElement; notes: HTMLDivElement }>();
  const bars = new Map<string, HTMLDivElement>();
  let radarSvg: SVGSVGElement | null = null;
  const polygons = new Map<string, SVGPolygonElement>();
  const form = el(doc, 'form', 'dm-scales__form');
  const inputs = new Map<string, Map<string, HTMLInputElement>>();
  const totals = new Map<string, HTMLSpanElement>();
  let emit: (payload: Record<string, unknown>) => void = () => {};

  function buildForm(): void {
    for (const s of series) {
      const fieldset = el(doc, 'fieldset', 'dm-scales__series-form');
      fieldset.append(el(doc, 'legend', 'dm-scales__series-name', `Score ${s.label.toLowerCase()}`));
      const map = new Map<string, HTMLInputElement>();
      for (const scale of chart.scales) {
        const label = el(doc, 'label', 'dm-scales__field');
        const words = chart.mode === 'pairs' ? `${scale.low} (0–10; ${scale.high} gets the rest)` : chart.mode === 'shares' ? `${scale.label} (% of 100)` : `${scale.label} (1–10)`;
        label.append(el(doc, 'span', 'dm-scales__field-label', words));
        const input = el(doc, 'input', 'dm-scales__input');
        input.type = 'number';
        input.min = chart.mode === 'axes' ? '1' : '0';
        input.max = chart.mode === 'shares' ? '100' : '10';
        input.step = '1';
        label.append(input);
        fieldset.append(label);
        map.set(scale.id, input);
      }
      const total = el(doc, 'span', 'dm-scales__total');
      total.setAttribute('aria-live', 'polite');
      if (chart.mode === 'shares') {
        const update = (): void => setText(total, `Total ${[...map.values()].reduce((sum, input) => sum + (Number(input.value) || 0), 0)} of 100`);
        for (const input of map.values()) input.addEventListener('input', update);
        update();
      }
      const save = el(doc, 'button', 'dm-scales__save', `Save ${s.label.toLowerCase()}`);
      save.type = 'button';
      save.addEventListener('click', () => {
        const values: Record<string, number> = {};
        for (const [id, input] of map) values[id] = Number(input.value);
        emit({ series: s.id, values });
      });
      fieldset.append(total, save);
      form.append(fieldset);
      inputs.set(s.id, map);
      totals.set(s.id, total);
    }
  }

  function buildRows(frame: HTMLDivElement): void {
    const legend = el(doc, 'p', 'dm-scales__legend');
    legend.setAttribute('aria-hidden', 'true');
    series.forEach((s, i) => {
      const chip = el(doc, 'span', 'dm-scales__legend-item', s.label);
      chip.setAttribute('data-style', STYLES[i]);
      legend.append(chip);
    });
    if (radar) {
      const wrap = el(doc, 'div', 'dm-scales__radar-wrap');
      wrap.setAttribute('aria-hidden', 'true');
      radarSvg = svg(doc, 'svg', { class: 'dm-scales__radar', viewBox: '0 0 100 100' });
      for (const ring of [42, 28, 14]) radarSvg.append(svg(doc, 'polygon', { class: 'dm-scales__ring', points: radarPoints(chart.scales.map(() => (ring / 42) * 10)) }));
      series.forEach((s, i) => {
        const poly = svg(doc, 'polygon', { class: 'dm-scales__poly', 'data-style': STYLES[i], points: '' });
        radarSvg!.append(poly);
        polygons.set(s.id, poly);
      });
      // Axis names sit just outside the outer ring, at the same angles as the polygon's corners.
      chart.scales.forEach((scale, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / chart.scales.length;
        const label = el(doc, 'span', 'dm-scales__radar-label', scale.label!);
        label.style.left = `${(50 + 49 * Math.cos(angle)).toFixed(1)}%`;
        label.style.top = `${(50 + 49 * Math.sin(angle)).toFixed(1)}%`;
        wrap.append(label);
      });
      wrap.prepend(radarSvg);
      frame.append(legend, wrap);
    } else frame.append(legend);
    const list = el(doc, 'div', 'dm-scales__rows');
    // A radar's rows keep its notes; their bars only show on a phone, where the radar is hidden.
    list.setAttribute('data-layout', radar ? 'radar' : chart.mode);
    if (chart.mode === 'shares') {
      for (const [i, s] of series.entries()) {
        const row = el(doc, 'div', 'dm-scales__share-row');
        row.append(el(doc, 'span', 'dm-scales__row-label', s.label));
        const bar = el(doc, 'div', 'dm-scales__share');
        bar.setAttribute('data-style', STYLES[i]);
        row.append(bar);
        list.append(row);
        bars.set(s.id, bar);
      }
    }
    for (const scale of chart.scales) {
      const row = el(doc, 'div', 'dm-scales__row');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', scaleName(scale));
      row.setAttribute('data-scale', scale.id);
      const track = el(doc, 'div', 'dm-scales__track');
      if (chart.mode === 'pairs') row.append(el(doc, 'span', 'dm-scales__pole dm-scales__pole--low', scale.low!), track, el(doc, 'span', 'dm-scales__pole dm-scales__pole--high', scale.high!));
      else row.append(el(doc, 'span', 'dm-scales__row-label', scale.label!), track);
      const notes = el(doc, 'div', 'dm-scales__notes');
      row.append(notes);
      if (chart.mode === 'shares') track.hidden = true;
      list.append(row);
      rows.set(scale.id, { track, notes });
    }
    frame.append(list, form);
  }

  return createChart({
    family: 'scales',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      emit = ctx.emitScore;
      if (!rows.size) {
        buildRows(ctx.frame);
        buildForm();
      }
      const values = valuesOf(run) as Record<string, Record<string, number>>;
      for (const scale of chart.scales) {
        if (chart.mode === 'shares') break;
        const { track } = rows.get(scale.id)!;
        const wanted = series.filter((s) => values[s.id]).map((s) => {
          const value = values[s.id][scale.id];
          const bar = el(doc, 'span', 'dm-scales__bar');
          bar.setAttribute('data-style', STYLES[series.indexOf(s)]);
          bar.style.width = `${value * 10}%`;
          bar.title = chart.mode === 'pairs' ? `${s.label}: ${scale.low} ${value}, ${scale.high} ${10 - value}` : `${s.label}: ${value} of 10`;
          bar.setAttribute('data-words', bar.title);
          return bar;
        });
        const now = [...track.children].map((child) => (child as HTMLElement).title).join('|');
        if (now !== wanted.map((bar) => bar.title).join('|')) track.replaceChildren(...wanted);
      }
      for (const s of series) {
        if (radar) polygons.get(s.id)!.setAttribute('points', values[s.id] ? radarPoints(chart.scales.map((scale) => values[s.id][scale.id])) : '');
        const bar = bars.get(s.id);
        if (bar) {
          const words = values[s.id] ? chart.scales.map((scale) => `${scale.label} ${values[s.id][scale.id]}%`).join(', ') : 'not scored yet';
          if (bar.title !== words) {
            bar.title = words;
            bar.replaceChildren(...(values[s.id] ? chart.scales.map((scale, j) => {
              const part = el(doc, 'span', 'dm-scales__part', `${scale.label} ${values[s.id][scale.id]}%`);
              part.style.width = `${values[s.id][scale.id]}%`;
              part.setAttribute('data-part', String(j % 3));
              return part;
            }) : [el(doc, 'span', 'dm-scales__unscored', 'Not scored yet')]));
          }
        }
        for (const [scaleId, input] of inputs.get(s.id)!) if (values[s.id] && doc.activeElement !== input) input.value = String(values[s.id][scaleId]);
      }
      return run.nodes
        .filter((node) => slotName(node) === 'note' && rows.has(node.tag ?? ''))
        .map((node) => {
          const scale = chart.scales.find((s) => s.id === node.tag)!;
          return { node, host: rows.get(scale.id)!.notes, fill: 'tint', label: `Note ${slotIndex(node)} on ${scaleName(scale)}` };
        });
    }
  }, doc);
}
```

- [ ] **Step 4: Write the curve, tension and path charts**

```ts
// packages/decision-book/render/curve.ts
// The curve family's chart: the configured conceptual line(s) drawn from curves.mjs over the
// regions of the x axis, with no numbers on either axis. Regions are alternate tint bands with
// their names along the foot; the chasm shape leaves its gap unshaded. The person's position
// is a disc on the first line at the middle of its region, and its pill sits in that region's
// column with any notes. Phone: the drawing keeps its width (the axes are words, not ticks)
// and the region columns stack as labelled cards.
import { CHASM_GAP, curveAt, curvePoints } from '../curves.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setAttr, slotIndex, slotName, svg } from './core';
import type { ChartTool } from './quadrant';

export type CurveChart = {
  axes: { x: { label: string }; y: { label: string } };
  lines: { id: string; label: string; shape: string }[];
  regions: { id: string; label: string; from: number; to: number }[];
  position: string;
};

const W = 100;
const H = 56;
const LINE_STYLES = ['solid', 'dashed', 'dotted'];

/** The SVG path for a shape across the drawing. */
export function curvePath(shape: string): string {
  return curvePoints(shape, 60).map(([t, h], i) => `${i ? 'L' : 'M'}${(t * W).toFixed(2)} ${((1 - h) * H).toFixed(2)}`).join('');
}

export function createCurveView(tool: ChartTool & { chart: CurveChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const columns = new Map<string, HTMLDivElement>();
  let marker: SVGCircleElement | null = null;
  return createChart({
    family: 'curve',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!columns.size) {
        const drawing = svg(doc, 'svg', { class: 'dm-curve__drawing', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
        chart.regions.forEach((region, i) => drawing.append(svg(doc, 'rect', { class: 'dm-curve__band', 'data-band': String(i % 2), x: String(region.from * W), y: '0', width: String((region.to - region.from) * W), height: String(H) })));
        if (chart.lines.some((line) => line.shape === 'chasm')) drawing.append(svg(doc, 'rect', { class: 'dm-curve__gap', x: String(CHASM_GAP[0] * W), y: '0', width: String((CHASM_GAP[1] - CHASM_GAP[0]) * W), height: String(H) }));
        drawing.append(svg(doc, 'path', { class: 'dm-curve__axis', d: `M0 0V${H}H${W}` }));
        chart.lines.forEach((line, i) => drawing.append(svg(doc, 'path', { class: 'dm-curve__line', 'data-style': LINE_STYLES[i], 'data-line': line.id, d: curvePath(line.shape) })));
        marker = svg(doc, 'circle', { class: 'dm-curve__marker', r: '2.6', cx: '0', cy: '0' });
        marker.style.display = 'none';
        drawing.append(marker);
        const plotArea = el(doc, 'div', 'dm-curve__plot');
        const y = el(doc, 'span', 'dm-curve__y', chart.axes.y.label);
        y.setAttribute('aria-hidden', 'true');
        plotArea.append(y, drawing);
        const x = el(doc, 'p', 'dm-curve__x', chart.axes.x.label);
        x.setAttribute('aria-hidden', 'true');
        const legend = el(doc, 'p', 'dm-curve__legend');
        legend.setAttribute('aria-hidden', 'true');
        if (chart.lines.length > 1) chart.lines.forEach((line, i) => {
          const chip = el(doc, 'span', 'dm-curve__legend-item', line.label);
          chip.setAttribute('data-style', LINE_STYLES[i]);
          legend.append(chip);
        });
        const regions = el(doc, 'div', 'dm-curve__regions');
        for (const region of chart.regions) {
          const column = el(doc, 'div', 'dm-curve__region');
          column.setAttribute('role', 'group');
          column.setAttribute('aria-label', region.label);
          column.setAttribute('data-region', region.id);
          column.style.flexGrow = String(region.to - region.from);
          column.append(el(doc, 'span', 'dm-curve__region-label', region.label));
          regions.append(column);
          columns.set(region.id, column);
        }
        ctx.frame.append(legend, plotArea, x, regions);
      }
      const position = run.nodes.find((node) => slotName(node) === 'position' && columns.has(node.tag ?? ''));
      if (marker) {
        const region = chart.regions.find((r) => r.id === position?.tag);
        if (region) {
          const t = (region.from + region.to) / 2;
          setAttr(marker, 'cx', (t * W).toFixed(2));
          setAttr(marker, 'cy', ((1 - curveAt(chart.lines[0].shape, t)) * H).toFixed(2));
          marker.style.display = '';
        } else marker.style.display = 'none';
      }
      for (const column of columns.values()) column.classList.toggle('is-here', column.getAttribute('data-region') === position?.tag);
      return run.nodes
        .filter((node) => ['position', 'note'].includes(slotName(node)) && columns.has(node.tag ?? ''))
        .map((node) => {
          const region = chart.regions.find((r) => r.id === node.tag)!;
          const isPosition = slotName(node) === 'position';
          return {
            node,
            host: columns.get(region.id)!,
            fill: isPosition ? 'red' : 'tint',
            label: isPosition ? `${chart.position}, in ${region.label}` : `Note ${slotIndex(node)} on ${region.label}`,
            order: isPosition ? 0 : slotIndex(node)
          };
        });
    }
  }, doc);
}
```

```ts
// packages/decision-book/render/tension.ts
// The tension family's chart.
//   pull      the centre disc between two columns of equal arrows pointing away from it
//             (no lengths: the kit forbids a made-up balance of forces);
//   gap       two columns facing each other across a named gap;
//   triangle  three corners around the centre; a fixed corner is filled and says "Fixed",
//             and its fix note sits under it.
// Phone: the columns stack (first side, centre, second side); the triangle becomes three
// labelled corner cards.
import { type DmToolRun, type ChartView, type EntrySpec, type Fill, createChart, el, setAttr, slotIndex, slotName, svg } from './core';
import type { ChartTool } from './quadrant';

export type TensionChart = { variant: 'pull' | 'gap' | 'triangle'; centre: string; sides: { id: string; label: string; fill: Fill }[]; gap?: string; pick?: number };

export function createTensionView(tool: ChartTool & { chart: TensionChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const sides = new Map<string, { box: HTMLDivElement; forces: HTMLDivElement; fixes: HTMLDivElement; flag: HTMLSpanElement }>();
  let centreBox: HTMLDivElement | null = null;

  function sideBox(side: TensionChart['sides'][number], index: number): HTMLDivElement {
    const box = el(doc, 'div', 'dm-tension__side');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', side.label);
    box.setAttribute('data-side', side.id);
    box.setAttribute('data-fill', side.fill);
    box.setAttribute('data-at', String(index));
    const head = el(doc, 'div', 'dm-tension__head');
    head.setAttribute('aria-hidden', 'true');
    head.append(el(doc, 'span', 'dm-tension__label', side.label));
    const flag = el(doc, 'span', 'dm-tension__fixed', 'Fixed');
    flag.hidden = true;
    head.append(flag);
    const forces = el(doc, 'div', 'dm-tension__forces');
    const fixes = el(doc, 'div', 'dm-tension__fixes');
    box.append(head, forces, fixes);
    sides.set(side.id, { box, forces, fixes, flag });
    return box;
  }

  return createChart({
    family: 'tension',
    label: tool.name,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!centreBox) {
        const stage = el(doc, 'div', `dm-tension__stage dm-tension__stage--${chart.variant}`);
        centreBox = el(doc, 'div', 'dm-tension__centre');
        centreBox.setAttribute('role', 'group');
        centreBox.setAttribute('aria-label', chart.centre);
        centreBox.append(el(doc, 'span', 'dm-tension__centre-label', chart.centre));
        if (chart.variant === 'triangle') {
          const shape = svg(doc, 'svg', { class: 'dm-tension__triangle', viewBox: '0 0 100 88', 'aria-hidden': 'true' });
          shape.append(svg(doc, 'polygon', { points: '50,4 96,84 4,84' }));
          stage.append(shape, sideBox(chart.sides[0], 0), centreBox, sideBox(chart.sides[1], 1), sideBox(chart.sides[2], 2));
        } else {
          const middle = el(doc, 'div', 'dm-tension__middle');
          if (chart.variant === 'gap') {
            const gap = el(doc, 'span', 'dm-tension__gap', chart.gap!);
            gap.setAttribute('aria-hidden', 'true');
            middle.append(gap);
          }
          middle.append(centreBox);
          stage.append(sideBox(chart.sides[0], 0), middle, sideBox(chart.sides[1], 1));
        }
        ctx.frame.append(stage);
      }
      const fixed = new Set(run.nodes.filter((node) => slotName(node) === 'fix').map((node) => node.tag));
      for (const [id, side] of sides) {
        side.flag.hidden = !fixed.has(id);
        setAttr(side.box, 'data-fixed', fixed.has(id) ? 'true' : null);
      }
      const out: EntrySpec[] = [];
      for (const node of run.nodes) {
        const name = slotName(node);
        if (name === 'centre') out.push({ node, host: centreBox!, fill: 'ink', label: chart.centre });
        const side = chart.sides.find((s) => s.id === node.tag);
        if (!side) continue;
        if (name === 'force') out.push({ node, host: sides.get(side.id)!.forces, fill: side.fill, label: `${side.label}, force ${slotIndex(node)}` });
        if (name === 'fix') out.push({ node, host: sides.get(side.id)!.fixes, fill: 'ink', label: `${side.label} held fixed` });
      }
      return out;
    }
  }, doc);
}
```

```ts
// packages/decision-book/render/path.ts
// The path family's chart.
//   flow    the route taken, top to bottom: each stage a disc on a dotted line, its answer
//           beside it; a question's answer carries a Yes or No word chip; the stage being
//           asked shows as an open disc saying "Now"; an end stage is a filled disc.
//   stages  one track per round, the stages left to right on a dotted line ending in an arrow.
//   layers  the safeguards as stacked slices, each with its holes; a hole not yet linked to a
//           layer waits under them.
// Phone: tracks turn vertical; the flow is already vertical.
import type { PsNode } from '../../problem-solver/types';
import { flowRoute, roundOf } from '../families/path.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, setAttr, setText, slotIndex, slotName } from './core';
import type { ChartTool } from './quadrant';

type Stage = { id: string; label: string; kind?: 'question' | 'step' | 'end'; yes?: string; no?: string; next?: string };
export type PathChart = { variant: 'flow' | 'stages' | 'layers'; stages?: Stage[]; loop?: boolean; rounds?: number; layers?: { layer: string; hole: string } };

export function createPathView(tool: ChartTool & { chart: PathChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const route = el(doc, 'ol', 'dm-path__route');
  const steps = new Map<string, { row: HTMLLIElement; answer: HTMLDivElement; chip: HTMLSpanElement }>();
  const rounds = new Map<number, Map<string, HTMLDivElement>>();
  const layerRows = new Map<string, { row: HTMLDivElement; holes: HTMLDivElement }>();
  const loose = el(doc, 'div', 'dm-path__loose');
  let built = false;

  function stepRow(stage: Stage): { row: HTMLLIElement; answer: HTMLDivElement; chip: HTMLSpanElement } {
    const row = el(doc, 'li', 'dm-path__step');
    row.setAttribute('data-stage', stage.id);
    row.setAttribute('data-kind', stage.kind ?? 'step');
    const disc = el(doc, 'span', 'dm-path__disc');
    disc.setAttribute('aria-hidden', 'true');
    const label = el(doc, 'span', 'dm-path__label', stage.label);
    const chip = el(doc, 'span', 'dm-path__chip');
    chip.hidden = true;
    const answer = el(doc, 'div', 'dm-path__answer');
    row.append(disc, label, chip, answer);
    return { row, answer, chip };
  }

  function roundTrack(round: number, frame: HTMLDivElement): Map<string, HTMLDivElement> {
    let hosts = rounds.get(round);
    if (hosts) return hosts;
    hosts = new Map();
    const track = el(doc, 'div', 'dm-path__round');
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', `Round ${round}`);
    track.append(el(doc, 'span', 'dm-path__round-label', `Round ${round}`));
    const line = el(doc, 'div', 'dm-path__stages');
    for (const stage of chart.stages!) {
      const cell = el(doc, 'div', 'dm-path__stage');
      cell.setAttribute('data-stage', stage.id);
      cell.append(el(doc, 'span', 'dm-path__disc'), el(doc, 'span', 'dm-path__label', stage.label));
      line.append(cell);
      hosts.set(stage.id, cell);
    }
    track.append(line);
    frame.append(track);
    rounds.set(round, hosts);
    return hosts;
  }

  return createChart({
    family: 'path',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!built) {
        built = true;
        if (chart.variant === 'flow') ctx.frame.append(route);
        if (chart.variant === 'stages') roundTrack(1, ctx.frame);
        if (chart.variant === 'layers') {
          const stack = el(doc, 'div', 'dm-path__layers');
          stack.setAttribute('data-empty', chart.layers!.layer);
          loose.setAttribute('data-label', 'Holes not yet linked to a layer');
          ctx.frame.append(stack, loose);
        }
      }
      if (chart.variant === 'flow') return drawFlow(run);
      if (chart.variant === 'stages') return drawStages(run, ctx.frame);
      return drawLayers(run, ctx.frame.querySelector('.dm-path__layers') as HTMLDivElement);
    }
  }, doc);

  function drawFlow(run: DmToolRun): EntrySpec[] {
    const taken = flowRoute(run, chart.stages!) as { stage: Stage; node: PsNode | null }[];
    const wanted = new Set(taken.map((step) => step.stage.id));
    for (const [id, step] of steps) if (!wanted.has(id)) {
      step.row.remove();
      steps.delete(id);
    }
    const out: EntrySpec[] = [];
    taken.forEach(({ stage, node }, i) => {
      let step = steps.get(stage.id);
      if (!step) {
        step = stepRow(stage);
        steps.set(stage.id, step);
      }
      if (route.children[i] !== step.row) route.insertBefore(step.row, route.children[i] ?? null);
      setAttr(step.row, 'data-now', node ? null : 'true');
      const answer = stage.kind === 'question' && node ? (node.tag === 'yes' ? 'Yes' : 'No') : node ? '' : 'Now';
      step.chip.hidden = !answer;
      setText(step.chip, answer);
      if (node) out.push({ node, host: step.answer, fill: stage.kind === 'end' ? 'green' : node.tag === 'no' ? 'red' : 'tint', label: `${stage.label}${answer && answer !== 'Now' ? ` ${answer}` : ''}` });
    });
    return out;
  }

  function drawStages(run: DmToolRun, frame: HTMLDivElement): EntrySpec[] {
    const last = roundOf(run, chart.stages!);
    for (let round = 1; round <= last; round += 1) roundTrack(round, frame);
    for (const [round, hosts] of rounds) if (round > last) {
      hosts.values().next().value?.closest('.dm-path__round')?.remove();
      rounds.delete(round);
    }
    const ids = new Set(chart.stages!.map((stage) => stage.id));
    return run.nodes
      .filter((node) => ids.has(slotName(node)))
      .map((node) => {
        const stage = chart.stages!.find((s) => s.id === slotName(node))!;
        const round = slotIndex(node) || 1;
        return { node, host: rounds.get(round)!.get(stage.id)!, fill: 'tint', label: `Round ${round}, ${stage.label}` };
      });
  }

  function drawLayers(run: DmToolRun, stack: HTMLDivElement): EntrySpec[] {
    const layers = run.nodes.filter((node) => slotName(node) === 'layer');
    for (const [id, layer] of layerRows) if (!layers.some((node) => node.id === id)) {
      layer.row.remove();
      layerRows.delete(id);
    }
    const out: EntrySpec[] = [];
    for (const node of layers) {
      let layer = layerRows.get(node.id);
      if (!layer) {
        const row = el(doc, 'div', 'dm-path__layer');
        row.setAttribute('role', 'group');
        const name = el(doc, 'div', 'dm-path__layer-name');
        const holes = el(doc, 'div', 'dm-path__holes');
        row.append(name, holes);
        stack.append(row);
        layer = { row, holes };
        layerRows.set(node.id, layer);
      }
      layer.row.style.order = String(slotIndex(node));
      setAttr(layer.row, 'aria-label', `${chart.layers!.layer} ${slotIndex(node)}`);
      out.push({ node, host: layer.row.querySelector('.dm-path__layer-name') as HTMLDivElement, fill: 'green', label: `${chart.layers!.layer} ${slotIndex(node)}` });
    }
    for (const node of run.nodes.filter((n) => slotName(n) === 'hole')) {
      const into = run.edges.find((edge) => edge.kind === 'in' && edge.from === node.id)?.to;
      const layer = into ? layerRows.get(into) : undefined;
      out.push({ node, host: layer ? layer.holes : loose, fill: 'red', label: `${chart.layers!.hole} ${slotIndex(node)}${layer ? '' : ', not linked'}` });
    }
    loose.hidden = !out.some((spec) => spec.host === loose);
    return out;
  }
}
```

- [ ] **Step 5: Write the list chart**

```ts
// packages/decision-book/render/list.ts
// The list family's chart: one block per group (its label, its prompt in small type, then its
// entries), laid out by `data-layout` in CSS:
//   checklist  rows in order, a tick and "Done" once a criterion has an entry;
//   rows       full-width rows; lanes  columns side by side;
//   routes     blocks around a centre disc, joined to it by dotted lines;
//   pyramid    levels from the base up, each narrower than the one below, one pyramid per column;
//   roles      a card grid.
// Groups with a `column` are drawn in one stack per column, headed by the column's name.
// Phone: everything becomes one column of labelled blocks; a pyramid keeps its narrowing.
import { type DmToolRun, type ChartView, type EntrySpec, type Fill, createChart, el, setAttr, slotIndex, slotName } from './core';
import type { ChartTool } from './quadrant';

export type ListChart = {
  layout: 'checklist' | 'rows' | 'lanes' | 'routes' | 'pyramid' | 'roles';
  groups: { id: string; label: string; prompt?: string; column?: string }[];
  entry: string;
};

const FILL_CYCLE: Fill[] = ['green', 'red', 'tint'];

/** Words for a column key: "then_and_now" → "Then and now". */
export const columnName = (key: string): string => key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export function createListView(tool: ChartTool & { chart: ListChart }, doc: Document = document): ChartView {
  const { chart } = tool;
  const groups = new Map<string, { block: HTMLDivElement; items: HTMLDivElement; done: HTMLSpanElement }>();
  return createChart({
    family: 'list',
    label: tool.name,
    subject: tool.slots.subject ?? null,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!groups.size) {
        const board = el(doc, 'div', 'dm-list');
        board.setAttribute('data-layout', chart.layout);
        const columnKeys = [...new Set(chart.groups.map((group) => group.column ?? ''))];
        if (chart.layout === 'routes') {
          const hub = el(doc, 'div', 'dm-list__hub');
          hub.setAttribute('aria-hidden', 'true');
          board.append(hub);
        }
        for (const columnKey of columnKeys) {
          const stack = el(doc, 'div', 'dm-list__column');
          if (columnKey) {
            stack.setAttribute('role', 'group');
            stack.setAttribute('aria-label', columnName(columnKey));
            stack.append(el(doc, 'h3', 'dm-list__column-name', columnName(columnKey)));
          }
          const members = chart.groups.filter((group) => (group.column ?? '') === columnKey);
          // A pyramid is listed from its base; it is drawn top down.
          const drawn = chart.layout === 'pyramid' ? [...members].reverse() : members;
          drawn.forEach((group) => {
            const level = members.indexOf(group);
            const block = el(doc, 'div', 'dm-list__group');
            block.setAttribute('role', 'group');
            block.setAttribute('aria-label', group.label);
            block.setAttribute('data-group', group.id);
            block.style.setProperty('--dm-level', String(level));
            block.style.setProperty('--dm-levels', String(members.length));
            const head = el(doc, 'div', 'dm-list__head');
            head.setAttribute('aria-hidden', 'true');
            head.append(el(doc, 'span', 'dm-list__label', group.label));
            const done = el(doc, 'span', 'dm-list__done', 'Done');
            done.hidden = true;
            if (chart.layout === 'checklist') head.append(done);
            if (group.prompt) head.append(el(doc, 'span', 'dm-list__prompt', group.prompt));
            const items = el(doc, 'div', 'dm-list__items');
            block.append(head, items);
            stack.append(block);
            groups.set(group.id, { block, items, done });
          });
          board.append(stack);
        }
        ctx.frame.append(board);
      }
      const entries = run.nodes.filter((node) => slotName(node) === 'entry' && groups.has(node.tag ?? ''));
      for (const [id, group] of groups) {
        const has = entries.some((node) => node.tag === id);
        group.done.hidden = !has;
        setAttr(group.block, 'data-done', has ? 'true' : null);
      }
      return entries.map((node) => {
        const index = chart.groups.findIndex((group) => group.id === node.tag);
        const group = chart.groups[index];
        return { node, host: groups.get(group.id)!.items, fill: FILL_CYCLE[index % FILL_CYCLE.length], label: `${group.column ? `${columnName(group.column)}, ` : ''}${group.label}, entry ${slotIndex(node)}` };
      });
    }
  }, doc);
}
```

- [ ] **Step 6: Write the two one-offs and the decision record**

```ts
// packages/decision-book/render/outside-box.ts
// Thinking outside the box: nine dots in a 3×3 square, with a "Show one way" toggle that
// draws the four-line answer, its lines running past the square. Beside it, the person's
// attempt and the box they had assumed. Phone: the dots sit above the two answers.
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, slotName, svg } from './core';
import type { ChartTool } from './quadrant';

/** Dot centres on a 0–2 grid, drawn 30 apart from (25, 25). */
const at = (n: number): number => 25 + n * 30;
/** One way: up the left column past the top, down through the diagonal past the right, back along the foot, then up the other diagonal. */
export const NINE_DOT_ANSWER: Array<[number, number]> = [[0, 2], [0, -1], [3, 2], [0, 2], [2, 0]];

export function createOutsideBoxView(tool: ChartTool, doc: Document = document): ChartView {
  const hosts = new Map<string, HTMLDivElement>();
  return createChart({
    family: 'outside-box',
    label: tool.name,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const puzzle = el(doc, 'div', 'dm-dots');
        const drawing = svg(doc, 'svg', { class: 'dm-dots__drawing', viewBox: '0 0 130 130', role: 'img', 'aria-label': 'Nine dots in a three by three square' });
        const answer = svg(doc, 'polyline', { class: 'dm-dots__answer', points: NINE_DOT_ANSWER.map(([x, y]) => `${at(x)},${at(y)}`).join(' ') });
        drawing.append(answer);
        for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) drawing.append(svg(doc, 'circle', { class: 'dm-dots__dot', cx: String(at(col)), cy: String(at(row)), r: '6' }));
        const toggle = el(doc, 'button', 'dm-dots__toggle', 'Show one way');
        toggle.type = 'button';
        toggle.setAttribute('aria-pressed', 'false');
        toggle.addEventListener('click', () => {
          const on = toggle.getAttribute('aria-pressed') !== 'true';
          toggle.setAttribute('aria-pressed', String(on));
          toggle.textContent = on ? 'Hide the answer' : 'Show one way';
          puzzle.classList.toggle('is-revealed', on);
        });
        puzzle.append(drawing, toggle);
        const answers = el(doc, 'div', 'dm-dots__answers');
        for (const [slot, label] of [['attempt', tool.slots.attempt], ['assumption', tool.slots.assumption]]) {
          const box = el(doc, 'div', 'dm-dots__answer-box');
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', label);
          box.append(el(doc, 'span', 'dm-chart__slot-label', label));
          answers.append(box);
          hosts.set(slot, box);
        }
        ctx.frame.append(puzzle, answers);
      }
      return run.nodes
        .filter((node) => hosts.has(slotName(node)))
        .map((node) => ({ node, host: hosts.get(slotName(node))!, fill: slotName(node) === 'assumption' ? 'red' : 'tint', label: tool.slots[slotName(node)] }));
    }
  }, doc);
}
```

```ts
// packages/decision-book/render/black-box.ts
// The black box: what goes in on the left, a solid ink square in the middle, what comes out on
// the right, joined by arrows. The hidden part is a "?" inside the square until the person
// names it; then their words sit inside it. Phone: inputs, box and outputs stack top to bottom
// and the arrows turn down.
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, slotIndex, slotName } from './core';
import type { ChartTool } from './quadrant';

export function createBlackBoxView(tool: ChartTool, doc: Document = document): ChartView {
  const hosts = new Map<string, HTMLDivElement>();
  let mark: HTMLSpanElement | null = null;
  return createChart({
    family: 'black-box',
    label: tool.name,
    reflection: tool.slots.reflection ?? null,
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const stage = el(doc, 'div', 'dm-box');
        const column = (slot: string, title: string): HTMLDivElement => {
          const box = el(doc, 'div', `dm-box__side dm-box__side--${slot}`);
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', title);
          box.append(el(doc, 'span', 'dm-box__title', title));
          hosts.set(slot, box);
          return box;
        };
        const arrow = (): HTMLSpanElement => {
          const out = el(doc, 'span', 'dm-box__arrow');
          out.setAttribute('aria-hidden', 'true');
          return out;
        };
        const middle = el(doc, 'div', 'dm-box__box');
        middle.setAttribute('role', 'group');
        middle.setAttribute('aria-label', tool.slots.inside);
        mark = el(doc, 'span', 'dm-box__mark', '?');
        mark.setAttribute('aria-hidden', 'true');
        middle.append(mark);
        hosts.set('inside', middle);
        stage.append(column('input', 'In'), arrow(), middle, arrow(), column('output', 'Out'));
        ctx.frame.append(stage);
      }
      const nodes = run.nodes.filter((node) => hosts.has(slotName(node)));
      if (mark) mark.hidden = nodes.some((node) => slotName(node) === 'inside');
      return nodes.map((node) => {
        const name = slotName(node);
        return { node, host: hosts.get(name)!, fill: name === 'inside' ? 'ink' : name === 'input' ? 'tint' : 'green', label: name === 'inside' ? tool.slots.inside : `${name === 'input' ? 'In' : 'Out'} ${slotIndex(node)}` };
      });
    }
  }, doc);
}
```

```ts
// packages/decision-book/render/record.ts
// The decision record, the Decide step's chart: the decision as a headline, its reasons (each
// saying which model and node it rests on, from setBasis), the Stop Rule as a red band reading
// "If … then …", the first step on a forward arrow and the review date on a back arrow, as on
// the book's cover. Phone: the same order, one column.
import { RECORD_SLOTS } from '../record-slots.mjs';
import { type DmToolRun, type ChartView, type EntrySpec, createChart, el, slotIndex, slotName } from './core';

/** What a reason rests on: the model's name and the node's title. */
export type Basis = { model: string; title: string };
export type RecordView = ChartView & { setBasis(basis: Record<string, Basis[]>): void };

/** "Rests on Eisenhower matrix: Reply by Friday; SWOT: Team" */
export function basisWords(list: Basis[] | undefined): string {
  return list?.length ? `Rests on ${list.map((b) => `${b.model}: ${b.title}`).join('; ')}` : '';
}

/** A review value as a date in words when it is an ISO date ("1 February 2027"), else as written. */
export function reviewWords(text: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return text;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function createRecordView(doc: Document = document): RecordView {
  const hosts = new Map<string, HTMLElement>();
  let basis: Record<string, Basis[]> = {};
  let last: DmToolRun | null = null;
  const view = createChart({
    family: 'record',
    label: 'Decision record',
    draw(run: DmToolRun, ctx): EntrySpec[] {
      if (!hosts.size) {
        const section = (slot: string, className: string, title: string): HTMLDivElement => {
          const box = el(doc, 'div', `dm-record__part ${className}`);
          box.setAttribute('role', 'group');
          box.setAttribute('aria-label', title);
          box.append(el(doc, 'span', 'dm-record__title', title));
          hosts.set(slot, box);
          return box;
        };
        const band = el(doc, 'div', 'dm-record__stop');
        band.setAttribute('role', 'group');
        band.setAttribute('aria-label', 'Stop Rule');
        band.append(el(doc, 'span', 'dm-record__title', 'Stop Rule'));
        const ifPart = section('trigger', 'dm-record__if', 'If');
        const thenPart = section('action', 'dm-record__then', 'then');
        band.append(ifPart, thenPart);
        const ends = el(doc, 'div', 'dm-record__ends');
        ends.append(section('first_step', 'dm-record__forward', 'First step'), section('review', 'dm-record__back', 'Review'));
        ctx.frame.append(section('decision', 'dm-record__decision', 'Decision'), section('reason', 'dm-record__reasons', 'Because'), band, ends);
      }
      return run.nodes
        .filter((node) => hosts.has(slotName(node)))
        .map((node) => {
          const name = slotName(node);
          const fill = name === 'decision' ? 'ink' : name === 'trigger' || name === 'action' ? 'red' : name === 'first_step' ? 'green' : 'tint';
          const title = RECORD_SLOTS[name as keyof typeof RECORD_SLOTS];
          return {
            node,
            host: hosts.get(name)!,
            fill,
            label: name === 'reason' ? `Reason ${slotIndex(node)}` : title,
            meta: name === 'reason' ? basisWords(basis[node.id]) || undefined : name === 'review' ? reviewWords(node.text) : undefined
          };
        });
    }
  }, doc);
  return {
    ...view,
    update(run) {
      last = run;
      view.update(run);
    },
    setBasis(next) {
      basis = next;
      if (last) view.update(last);
    }
  };
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/tasks && npx vitest run tests/unit/decision-book-charts.test.ts tests/unit/decision-book-family-charts.test.ts`
Expected: PASS: 176 contract tests (16 charts × 11) and 29 family tests.

- [ ] **Step 8: Type-check the charts strictly (vitest does not)**

Run: `apps/tasks/node_modules/.bin/tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler --allowJs --checkJs false --skipLibCheck --lib dom,dom.iterable,es2023,esnext.iterator packages/decision-book/render/*.ts apps/tasks/tests/unit/decision-book-*.test.ts apps/tasks/tests/unit/helpers/decision-book-charts.ts 2>&1 | grep -v "glyphs.ts\|svg?raw" || echo clean`
Expected: `clean`. The filter drops Problem Solver's `glyphs.ts`, whose Vite `?raw` imports plain tsc cannot resolve.

- [ ] **Step 9: Commit**

```bash
git add packages/decision-book/render apps/tasks/tests/unit/decision-book-family-charts.test.ts apps/tasks/tests/unit/helpers/decision-book-charts.ts
git commit -m "Decision Maker: plot, scales, curve, tension, path and list charts; nine dots, black box and the decision record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Chart styles, phone reflow and the re-skin

**Files:**
- Modify: `packages/decision-book/decision-book.css` (append below the tokens)
- Test: `tests/unit/decision-book-css.test.js`

The stylesheet's rules:
- Each chart is the one named container `dmchart`. Every family has rules at 480px and under, and the container is never styled inside its own query (Problem Solver's rule).
- Flat: no shadows except `box-shadow: none`, and no gradients. Problem Solver's 9px "Contested" tag becomes 11px inside a chart and gains the kit's "!".
- Vertical axis words: the stack stays vertical and each word turns. Putting `writing-mode` on the stack turns flex's column axis sideways, which laid the words out side by side when this plan was drafted.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/decision-book-css.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../packages/decision-book/decision-book.css', import.meta.url), 'utf8');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
const token = (name) => new RegExp(`--dm-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)[1];

/** WCAG relative luminance and contrast ratio. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('no text under 11px', () => {
  const sizes = [...rules.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 20);
  for (const size of sizes) assert.ok(size >= 11, `font size ${size}px`);
});

test('flat: no shadows except removing one, no gradients', () => {
  for (const m of rules.matchAll(/box-shadow:\s*([^;]+);/g)) assert.equal(m[1].trim(), 'none');
  assert.doesNotMatch(rules, /gradient\(/);
});

test('one named chart container; phone rules for every family, never styling the container itself', () => {
  assert.equal([...rules.matchAll(/container:\s*dmchart \/ inline-size/g)].length, 1);
  assert.doesNotMatch(rules, /@container \(/);
  const phone = rules.slice(rules.indexOf('@container dmchart (max-width: 480px)'));
  assert.ok(phone.length > 100, 'phone block exists');
  assert.doesNotMatch(phone, /\.dm-chart\s*\{/);
  for (const family of ['dm-quad', 'dm-plot', 'dm-scales', 'dm-curve', 'dm-tension', 'dm-path', 'dm-list', 'dm-box', 'outside-box', 'dm-record']) assert.match(phone, new RegExp(family), family);
});

test('the palette pairs the charts use are readable', () => {
  const [ink, paper, red, green, soft] = ['ink', 'paper', 'red', 'green', 'soft'].map(token);
  const [redTint, greenTint] = ['red-tint', 'green-tint'].map(token);
  const pairs = [
    ['ink on red', ink, red],
    ['ink on green', ink, green],
    ['paper on ink', paper, ink],
    ['ink on red tint', ink, redTint],
    ['ink on green tint', ink, greenTint],
    ['ink on soft', ink, soft],
    ['muted text on paper', '#66675d', paper],
    ['contested red on red tint', '#b8301f', redTint],
    ['band green on green tint', '#3c7420', greenTint]
  ];
  for (const [name, fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}`);
  // Why the re-skin turns white text on red to ink:
  assert.ok(contrast('#ffffff', red) < 4.5);
});

test('the re-skin covers exactly the four reused Problem Solver charts', () => {
  assert.match(rules, /\.dm-scope :is\(\.ps-swot, \.ps-morph, \.ps-pareto, \.ps-dloop\) \{\s*--ps-red: var\(--dm-red\);\s*--ps-blue: var\(--dm-ink\);\s*--ps-yellow: var\(--dm-green\);\s*--ps-on-yellow: var\(--dm-ink\);/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/unit/decision-book-css.test.js`
Expected: FAIL. There is no `dmchart` container yet, and the re-skin rule is missing.

- [ ] **Step 3: Append the chart styles and the re-skin**

Append to `packages/decision-book/decision-book.css`, after the `.dm-scope` token block:

```css
/* ------------------------------------------------------------------ charts
   Every Decision Book chart (render/core.ts). Flat paper, ink, red and green: no shadows and
   no gradients. Text is never smaller than 11px. Each chart is the `dmchart` container; its
   phone rules (480px and under) style what is inside it, never the container itself. */
.dm-chart, .dm-chart *, .dm-chart *::before, .dm-chart *::after { box-sizing: border-box; }
.dm-chart [hidden] { display: none !important; }

.dm-chart {
  container: dmchart / inline-size;
  display: grid;
  gap: 14px;
  color: var(--dm-ink);
  font: 400 14px / 1.45 var(--font-ui);
}

.dm-chart__state {
  margin: 0;
  justify-self: end;
  font: 600 11px / 1.4 var(--font-ui);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #66675d;
}
.dm-chart[data-state='completed'] .dm-chart__state { color: var(--dm-ink); }
.dm-chart[data-state='completed'] .dm-chart__state::before { content: '✓ '; color: var(--dm-green); }

.dm-chart__subject,
.dm-chart__reflection {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--dm-line);
  border-radius: 14px;
}
.dm-chart__slot-label {
  font: 600 11px / 1.4 var(--font-ui);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #66675d;
}

/* Entries: the kit's states. Populated is the plain pill; Selected is ringed; Contested is
   dashed red with "! Contested"; a task shows its live status. */
.dm-entry { display: flex; max-width: 100%; }
.dm-entry__pill {
  display: grid;
  gap: 2px;
  max-width: 100%;
  padding: 6px 12px;
  border: 1.5px solid var(--dm-ink);
  border-radius: 999px;
  background: var(--dm-paper);
  color: var(--dm-ink);
  font: 500 13px / 1.3 var(--font-ui);
  text-align: left;
  cursor: pointer;
  transition: transform 180ms var(--dm-ease), background 180ms;
}
.dm-entry__pill:hover { transform: translateY(-1px); }
.dm-entry__pill:focus-visible { outline: 2px solid var(--dm-ink); outline-offset: 2px; }
.dm-entry[data-fill='red'] .dm-entry__pill { background: var(--dm-red-tint); }
.dm-entry[data-fill='green'] .dm-entry__pill { background: var(--dm-green-tint); }
.dm-entry[data-fill='ink'] .dm-entry__pill { background: var(--dm-ink); color: var(--dm-paper); }
.dm-entry[data-fill='tint'] .dm-entry__pill { background: var(--dm-soft); }
.dm-entry__head { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
.dm-entry__title { overflow-wrap: anywhere; }
.dm-entry__meta { font: 400 11px / 1.35 var(--font-ui); opacity: 0.8; }
.dm-entry.is-selected .dm-entry__pill { outline: 3px solid var(--dm-ink); outline-offset: 2px; }
.dm-entry[data-state='contested'] .dm-entry__pill { border-style: dashed; border-color: var(--dm-red); }
.dm-entry[data-fill='ink'][data-state='contested'] .dm-entry__pill { border-color: var(--dm-red); }
.dm-chart .ps-objection {
  margin: 0;
  padding: 0 6px;
  border: 1px solid currentColor;
  border-radius: 999px;
  box-shadow: none;
  font: 600 11px / 1.5 var(--font-ui);
  letter-spacing: 0.04em;
  color: #b8301f;
}
.dm-chart .ps-objection::before { content: '! '; font-weight: 800; }
.dm-entry[data-fill='ink'] .ps-objection { color: var(--dm-red-tint); }
.dm-entry__task { display: inline-flex; gap: 4px; align-items: center; font: 600 11px / 1.4 var(--font-ui); }
.dm-entry__task-mark { padding: 0 6px; border-radius: 999px; background: var(--dm-ink); color: var(--dm-paper); }
.dm-entry.is-removed .dm-entry__title { text-decoration: line-through; }
.dm-entry.is-removed .dm-entry__task-mark { background: transparent; color: var(--dm-ink); border: 1px solid currentColor; }

.dm-chart__panel { display: grid; }
.dm-scope .dm-details__card { box-shadow: none; border-top: 3px solid var(--dm-ink); background: var(--dm-paper); }
.dm-scope .dm-details__card--red { border-top-color: var(--dm-red); }
.dm-scope .dm-details__card--green { border-top-color: var(--dm-green); }
.dm-scope .dm-details__card--tint { border-top-color: var(--dm-line); }

/* Quadrant: y words up the left (high at the top), x words along the foot (high at the right). */
.dm-chart--quadrant .dm-chart__frame { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; gap: 6px; }
/* The words turn to run up the axis; the stack stays vertical: high at the top, low at the foot. */
.dm-quad__y, .dm-plot__y { display: flex; flex-direction: column; justify-content: space-between; align-items: center; font: 500 11px / 1.2 var(--font-ui); color: #66675d; }
.dm-quad__y > span, .dm-plot__y > span { writing-mode: vertical-rl; transform: rotate(180deg); }
.dm-quad__x { grid-column: 2; display: flex; justify-content: space-between; font: 500 11px / 1.2 var(--font-ui); color: #66675d; }
.dm-quad__axis-label { font-weight: 700; color: var(--dm-ink); letter-spacing: 0.06em; text-transform: uppercase; }
.dm-quad__grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 6px; min-height: 320px; }
.dm-quad__cell { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; min-width: 0; }
.dm-quad__cell[data-fill='red'] { background: var(--dm-red-tint); }
.dm-quad__cell[data-fill='green'] { background: var(--dm-green-tint); }
.dm-quad__cell[data-fill='ink'] { background: var(--dm-ink); color: var(--dm-paper); }
.dm-quad__cell[data-fill='tint'] { background: var(--dm-soft); }
.dm-quad__head { display: grid; gap: 2px; }
.dm-quad__label { font: 700 12px / 1.3 var(--font-ui); letter-spacing: 0.06em; text-transform: uppercase; }
.dm-quad__axes, .dm-quad__note { font: 400 11px / 1.35 var(--font-ui); opacity: 0.8; }
.dm-quad__axes { display: none; }
.dm-quad__items { display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; }

/* Plot: a square field per plot, points placed by percent. */
.dm-plot__plot { display: grid; gap: 8px; }
.dm-plot__title { margin: 0; font: 700 13px / 1.3 var(--font-ui); }
.dm-plot__body { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto; gap: 6px; }
.dm-plot__x { grid-column: 2; display: flex; justify-content: space-between; font: 500 11px / 1.2 var(--font-ui); color: #66675d; }
.dm-plot__axis-label { font-weight: 700; color: var(--dm-ink); text-transform: uppercase; letter-spacing: 0.06em; }
.dm-plot__field { position: relative; aspect-ratio: 1; max-width: 520px; width: 100%; border-left: 2px solid var(--dm-ink); border-bottom: 2px solid var(--dm-ink); background: var(--dm-paper); }
.dm-plot__band { position: absolute; display: grid; place-items: start; padding: 4px 6px; border-radius: 10px; background: var(--dm-green-tint); font: 600 11px / 1.2 var(--font-ui); color: #3c7420; }
/* A point near an edge hangs inward (--dm-shift), so its pill never leaves the field. */
.dm-plot__field .dm-entry { position: absolute; max-width: 60%; transform: translate(var(--dm-shift, -50%), 50%); }
.dm-plot__field .dm-entry__pill { padding: calc(4px + var(--dm-size, 4) * 0.6px) 10px; }
.dm-plot__tray { display: flex; flex-wrap: wrap; gap: 6px; }
.dm-plot__tray:not(:empty)::before { content: attr(data-label); flex-basis: 100%; font: 600 11px / 1.4 var(--font-ui); color: #66675d; }
.dm-plot__key { margin: 0; padding-left: 18px; font: 400 12px / 1.5 var(--font-ui); }
.dm-plot__form-head { margin: 0; font: 600 12px / 1.4 var(--font-ui); }
.dm-plot__form { display: grid; gap: 8px; }
.dm-plot__row { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; margin: 0; padding: 8px 10px; border: 1px solid var(--dm-line); border-radius: 14px; }
.dm-plot__row-name { font: 600 12px / 1.3 var(--font-ui); }
.dm-plot__pick { display: grid; gap: 2px; font: 400 11px / 1.3 var(--font-ui); }
.dm-plot__select { min-height: 32px; border: 1px solid var(--dm-line); border-radius: 999px; padding: 0 8px; background: var(--dm-paper); font: inherit; font-size: 13px; }
.dm-plot__place, .dm-scales__save, .dm-dots__toggle { min-height: 32px; padding: 0 14px; border: 0; border-radius: 999px; background: var(--dm-ink); color: var(--dm-paper); font: 600 13px / 1 var(--font-ui); cursor: pointer; }

/* Scales: line styles, not colours, tell series apart. */
.dm-scales__legend { display: flex; gap: 14px; margin: 0; font: 500 11px / 1.4 var(--font-ui); }
.dm-scales__legend-item::before { content: ''; display: inline-block; width: 18px; height: 8px; margin-right: 6px; vertical-align: middle; border: 2px solid var(--dm-ink); border-radius: 4px; }
.dm-scales__legend-item[data-style='solid']::before { background: var(--dm-ink); }
.dm-scales__legend-item[data-style='dotted']::before { border-style: dotted; }
.dm-scales__rows { display: grid; gap: 12px; }
.dm-scales__row { display: grid; grid-template-columns: minmax(70px, auto) minmax(0, 1fr) minmax(70px, auto); align-items: center; gap: 4px 10px; }
.dm-chart--scales .dm-scales__row:not(:has(.dm-scales__pole)) { grid-template-columns: minmax(90px, auto) minmax(0, 1fr); }
.dm-scales__pole, .dm-scales__row-label { font: 600 12px / 1.3 var(--font-ui); }
.dm-scales__pole--high { text-align: right; }
.dm-scales__track { display: grid; gap: 3px; padding: 3px 0; border-radius: 999px; background: var(--dm-soft); min-height: 14px; }
.dm-scales__bar { display: block; height: 8px; border-radius: 999px; border: 2px solid var(--dm-ink); transition: width 420ms var(--dm-ease); }
.dm-scales__bar[data-style='solid'] { background: var(--dm-ink); }
.dm-scales__bar[data-style='outline'] { background: var(--dm-paper); }
.dm-scales__bar[data-style='dotted'] { border-style: dotted; background: transparent; }
.dm-scales__notes { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; }
.dm-scales__notes:empty { display: none; }
.dm-scales__radar-wrap { position: relative; width: min(100% - 96px, 300px); aspect-ratio: 1; justify-self: center; margin: 16px 0; }
.dm-scales__radar { width: 100%; height: 100%; overflow: visible; }
.dm-scales__radar-label { position: absolute; transform: translate(-50%, -50%); padding: 0 4px; background: var(--dm-paper); font: 600 11px / 1.2 var(--font-ui); white-space: nowrap; }
.dm-scales__rows[data-layout='radar'] .dm-scales__track,
.dm-scales__rows[data-layout='radar'] .dm-scales__row:not(:has(.dm-entry)) { display: none; }
.dm-scales__ring { fill: none; stroke: var(--dm-line); stroke-width: 0.6; }
.dm-scales__poly { fill: none; stroke: var(--dm-ink); stroke-width: 1.4; }
.dm-scales__poly[data-style='solid'] { fill: var(--dm-green-tint); }
.dm-scales__poly[data-style='dotted'] { stroke-dasharray: 1.5 2; }
.dm-scales__share-row { display: grid; grid-template-columns: minmax(70px, auto) minmax(0, 1fr); align-items: center; gap: 10px; }
.dm-scales__share { display: flex; min-height: 28px; border: 2px solid var(--dm-ink); border-radius: 999px; overflow: hidden; }
.dm-scales__share[data-style='outline'] { border-style: dashed; }
.dm-scales__part { display: grid; place-items: center; min-width: 0; padding: 0 4px; font: 600 11px / 1.2 var(--font-ui); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dm-scales__part[data-part='0'] { background: var(--dm-green); color: var(--dm-ink); }
.dm-scales__part[data-part='1'] { background: var(--dm-red-tint); }
.dm-scales__part[data-part='2'] { background: var(--dm-soft); }
.dm-scales__unscored { padding: 0 10px; align-self: center; font: 400 12px / 1 var(--font-ui); color: #66675d; }
.dm-scales__form { display: grid; gap: 8px; }
.dm-scales__series-form { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; margin: 0; padding: 8px 10px; border: 1px solid var(--dm-line); border-radius: 14px; }
.dm-scales__series-name { font: 600 12px / 1.3 var(--font-ui); }
.dm-scales__field { display: grid; gap: 2px; font: 400 11px / 1.3 var(--font-ui); }
.dm-scales__input { width: 72px; min-height: 32px; border: 1px solid var(--dm-line); border-radius: 999px; padding: 0 10px; font: 400 13px / 1 var(--font-ui); }
.dm-scales__total { font: 600 12px / 1 var(--font-ui); }

/* Curve: no numbers, only words and the shape. */
.dm-curve__plot { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px; }
.dm-curve__y { writing-mode: vertical-rl; transform: rotate(180deg); font: 700 11px / 1.2 var(--font-ui); text-transform: uppercase; letter-spacing: 0.06em; text-align: center; }
.dm-curve__drawing { width: 100%; height: clamp(140px, 30cqw, 260px); overflow: visible; }
.dm-curve__band[data-band='0'] { fill: var(--dm-soft); }
.dm-curve__band[data-band='1'] { fill: var(--dm-paper); }
.dm-curve__gap { fill: var(--dm-paper); stroke: var(--dm-red); stroke-width: 0.4; stroke-dasharray: 1 1; }
.dm-curve__axis { fill: none; stroke: var(--dm-ink); stroke-width: 0.6; vector-effect: non-scaling-stroke; }
.dm-curve__line { fill: none; stroke: var(--dm-ink); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.dm-curve__line[data-style='dashed'] { stroke: var(--dm-red); stroke-dasharray: 6 4; }
.dm-curve__line[data-style='dotted'] { stroke: var(--dm-green); stroke-dasharray: 1 4; }
.dm-curve__marker { fill: var(--dm-red); stroke: var(--dm-paper); stroke-width: 0.8; }
.dm-curve__x { margin: 0; text-align: right; font: 700 11px / 1.2 var(--font-ui); text-transform: uppercase; letter-spacing: 0.06em; }
.dm-curve__legend { display: flex; gap: 14px; margin: 0; font: 500 11px / 1.4 var(--font-ui); }
.dm-curve__legend:empty { display: none; }
.dm-curve__legend-item::before { content: ''; display: inline-block; width: 18px; margin-right: 6px; vertical-align: middle; border-top: 3px solid var(--dm-ink); }
.dm-curve__legend-item[data-style='dashed']::before { border-top: 3px dashed var(--dm-red); }
.dm-curve__legend-item[data-style='dotted']::before { border-top: 3px dotted var(--dm-green); }
.dm-curve__regions { display: flex; gap: 6px; }
.dm-curve__region { flex-basis: 0; display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 8px; border-radius: 14px; }
.dm-curve__region.is-here { background: var(--dm-red-tint); }
.dm-curve__region-label { font: 700 11px / 1.3 var(--font-ui); text-transform: uppercase; letter-spacing: 0.05em; }

/* Tension: equal arrows, never lengths. */
.dm-tension__stage { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 16px; }
.dm-tension__middle { display: grid; justify-items: center; gap: 8px; }
.dm-tension__centre { display: grid; place-items: center; align-content: center; gap: 6px; width: 132px; aspect-ratio: 1; padding: 12px; border-radius: 50%; background: var(--dm-ink); color: var(--dm-paper); text-align: center; }
.dm-tension__centre-label { font: 600 11px / 1.3 var(--font-ui); text-transform: uppercase; letter-spacing: 0.05em; }
.dm-tension__gap { padding: 2px 10px; border: 1.5px dashed var(--dm-red); border-radius: 999px; font: 600 11px / 1.4 var(--font-ui); }
.dm-tension__side { display: grid; gap: 8px; padding: 12px; border-radius: 18px; min-width: 0; }
.dm-tension__side[data-fill='red'] { background: var(--dm-red-tint); }
.dm-tension__side[data-fill='green'] { background: var(--dm-green-tint); }
.dm-tension__side[data-fill='ink'] { background: var(--dm-soft); }
.dm-tension__side[data-fill='tint'] { background: var(--dm-soft); }
.dm-tension__head { display: flex; gap: 8px; align-items: center; }
.dm-tension__label { font: 700 12px / 1.3 var(--font-ui); text-transform: uppercase; letter-spacing: 0.06em; }
.dm-tension__fixed { padding: 0 8px; border-radius: 999px; background: var(--dm-ink); color: var(--dm-paper); font: 600 11px / 1.6 var(--font-ui); }
.dm-tension__forces, .dm-tension__fixes { display: grid; gap: 6px; }
.dm-tension__fixes:empty { display: none; }
.dm-tension__stage--pull .dm-tension__side[data-at='0'] .dm-entry__pill { border-radius: 999px 10px 10px 999px; }
.dm-tension__stage--pull .dm-tension__side[data-at='0'] .dm-entry::before { content: '←'; align-self: center; margin-right: 6px; font-weight: 800; color: var(--dm-red); }
.dm-tension__stage--pull .dm-tension__side[data-at='1'] .dm-entry::after { content: '→'; align-self: center; margin-left: 6px; font-weight: 800; color: #3c7420; }
.dm-tension__stage--triangle { position: relative; grid-template-columns: 1fr 1fr; grid-template-rows: auto auto auto; justify-items: center; }
.dm-tension__triangle { position: absolute; inset: 10% 18%; width: 64%; height: 80%; fill: none; stroke: var(--dm-ink); stroke-width: 1.2; stroke-dasharray: 2 2; z-index: 0; }
.dm-tension__stage--triangle > :not(svg) { position: relative; z-index: 1; }
.dm-tension__stage--triangle .dm-tension__side[data-at='0'] { grid-column: 1 / -1; }
.dm-tension__stage--triangle .dm-tension__centre { grid-column: 1 / -1; width: 112px; }
.dm-tension__side[data-fixed='true'] { outline: 3px solid var(--dm-ink); outline-offset: -3px; }

/* Path: discs on a dotted line, as on the book's cover. */
.dm-path__route { list-style: none; margin: 0; padding: 0; display: grid; gap: 0; }
.dm-path__step { position: relative; display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; grid-template-rows: auto auto; column-gap: 10px; row-gap: 6px; padding-bottom: 16px; }
.dm-path__step:not(:last-child)::before { content: ''; position: absolute; left: 10px; top: 22px; bottom: 0; border-left: 2px dotted var(--dm-ink); }
.dm-path__disc { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--dm-ink); background: var(--dm-paper); }
.dm-path__step[data-kind='end'] .dm-path__disc { background: var(--dm-green); }
.dm-path__step[data-now='true'] .dm-path__disc { border-style: dashed; }
.dm-path__label { font: 600 13px / 1.4 var(--font-ui); }
.dm-path__chip { padding: 0 8px; border-radius: 999px; background: var(--dm-ink); color: var(--dm-paper); font: 600 11px / 1.6 var(--font-ui); }
.dm-path__step[data-now='true'] .dm-path__chip { background: transparent; color: var(--dm-ink); border: 1px dashed var(--dm-ink); }
.dm-path__answer { grid-column: 2 / -1; display: flex; flex-wrap: wrap; gap: 6px; }
.dm-path__answer:empty { display: none; }
.dm-path__round { display: grid; gap: 8px; }
.dm-path__round-label { font: 700 11px / 1.3 var(--font-ui); text-transform: uppercase; letter-spacing: 0.06em; }
.dm-path__stages { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 10px; }
.dm-path__stages::before { content: ''; position: absolute; left: 11px; right: 14px; top: 10px; border-top: 2px dotted var(--dm-ink); }
.dm-path__stages::after { content: ''; position: absolute; right: 0; top: 4px; width: 12px; height: 14px; background: var(--dm-ink); clip-path: polygon(0 0, 100% 50%, 0 100%); }
.dm-path__stage { position: relative; display: grid; gap: 6px; align-content: start; min-width: 0; }
.dm-path__layers { display: flex; flex-direction: column; gap: 8px; }
.dm-path__layers:empty::before { content: attr(data-empty) 's go here'; font: 400 12px / 1.4 var(--font-ui); color: #66675d; }
.dm-path__layer { display: grid; grid-template-columns: minmax(120px, auto) minmax(0, 1fr); align-items: center; gap: 10px; padding: 10px 12px; border-radius: 999px; background: var(--dm-green-tint); }
.dm-path__holes { display: flex; flex-wrap: wrap; gap: 6px; }
.dm-path__loose { display: flex; flex-wrap: wrap; gap: 6px; }
.dm-path__loose::before { content: attr(data-label); flex-basis: 100%; font: 600 11px / 1.4 var(--font-ui); color: #66675d; }

/* List: one structure, laid out per layout. */
.dm-list { display: grid; gap: 12px; }
.dm-list__column { display: grid; gap: 8px; align-content: start; }
.dm-list__column-name { margin: 0; font: 700 13px / 1.3 var(--font-ui); }
.dm-list__group { display: grid; gap: 6px; padding: 10px 12px; border-radius: 14px; background: var(--dm-soft); min-width: 0; }
.dm-list__head { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }
.dm-list__label { font: 700 12px / 1.3 var(--font-ui); text-transform: uppercase; letter-spacing: 0.05em; }
.dm-list__prompt { flex-basis: 100%; font: 400 11px / 1.4 var(--font-ui); color: #66675d; }
.dm-list__done { padding: 0 8px; border-radius: 999px; background: var(--dm-green); font: 600 11px / 1.6 var(--font-ui); }
.dm-list__done::before { content: '✓ '; }
.dm-list__items { display: flex; flex-wrap: wrap; gap: 6px; }
.dm-list[data-layout='lanes'], .dm-list:has(.dm-list__column-name) { grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
.dm-list[data-layout='lanes'] .dm-list__column { grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
.dm-list[data-layout='lanes'] .dm-list__items { flex-direction: column; align-items: flex-start; }
.dm-list[data-layout='roles'] .dm-list__column { grid-template-columns: repeat(auto-fill, minmax(min(100%, 180px), 1fr)); }
.dm-list[data-layout='checklist'] .dm-list__group[data-done='true'] { background: var(--dm-green-tint); }
.dm-list[data-layout='routes'] { position: relative; }
.dm-list[data-layout='routes'] .dm-list__column { grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr)); }
.dm-list__hub { justify-self: center; width: 56px; height: 56px; border-radius: 50%; background: var(--dm-ink); }
.dm-list[data-layout='routes'] .dm-list__group { border: 2px dotted var(--dm-ink); background: transparent; }
.dm-list[data-layout='pyramid'] .dm-list__group {
  justify-self: center;
  width: calc(100% - (var(--dm-level) * (60% / max(var(--dm-levels) - 1, 1))));
  border-radius: 10px;
  text-align: center;
}
.dm-list[data-layout='pyramid'] .dm-list__head, .dm-list[data-layout='pyramid'] .dm-list__items { justify-content: center; }
.dm-list[data-layout='pyramid'] .dm-list__group:nth-child(odd of .dm-list__group) { background: var(--dm-green-tint); }

/* The nine dots and the black box. */
.dm-chart--outside-box .dm-chart__frame { display: grid; grid-template-columns: minmax(180px, 260px) minmax(0, 1fr); gap: 18px; align-items: start; }
.dm-dots { display: grid; gap: 10px; justify-items: center; }
.dm-dots__drawing { width: 100%; overflow: visible; }
.dm-dots__dot { fill: var(--dm-ink); }
.dm-dots__answer { fill: none; stroke: var(--dm-red); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; opacity: 0; stroke-dasharray: 420; stroke-dashoffset: 420; transition: stroke-dashoffset 1.2s var(--dm-ease), opacity 200ms; }
.dm-dots.is-revealed .dm-dots__answer { opacity: 1; stroke-dashoffset: 0; }
.dm-dots__answers { display: grid; gap: 10px; }
.dm-dots__answer-box { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid var(--dm-line); border-radius: 14px; }
.dm-box { display: grid; grid-template-columns: minmax(0, 1fr) 28px minmax(140px, 200px) 28px minmax(0, 1fr); align-items: center; gap: 8px; }
.dm-box__side { display: grid; gap: 6px; align-content: start; }
.dm-box__title { font: 700 12px / 1.3 var(--font-ui); text-transform: uppercase; letter-spacing: 0.06em; }
.dm-box__arrow { height: 14px; background: var(--dm-ink); clip-path: polygon(0 40%, 70% 40%, 70% 0, 100% 50%, 70% 100%, 70% 60%, 0 60%); }
.dm-box__box { display: grid; place-items: center; align-content: center; gap: 6px; aspect-ratio: 1; padding: 12px; border-radius: 6px; background: var(--dm-ink); color: var(--dm-paper); }
.dm-box__mark { font: 800 48px / 1 var(--font-ui); color: var(--dm-red); }

/* The decision record: headline, reasons, the Stop Rule band, then forward and back. */
.dm-record__part { display: grid; gap: 6px; }
.dm-record__title { font: 700 11px / 1.3 var(--font-ui); text-transform: uppercase; letter-spacing: 0.06em; color: #66675d; }
.dm-record__decision .dm-entry__pill { font-size: 18px; font-weight: 700; padding: 10px 18px; }
.dm-record__reasons { display: flex; flex-wrap: wrap; gap: 6px; }
.dm-record__reasons .dm-record__title { flex-basis: 100%; }
.dm-record__stop { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 10px; padding: 12px 14px; border-radius: 18px; background: var(--dm-red-tint); border: 2px solid var(--dm-red); }
.dm-record__stop > .dm-record__title { color: #b8301f; }
.dm-record__ends { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.dm-record__forward, .dm-record__back { padding: 10px 12px 10px 44px; border-radius: 999px; position: relative; }
.dm-record__forward { background: var(--dm-green-tint); }
.dm-record__back { background: var(--dm-soft); }
.dm-record__forward::before, .dm-record__back::before { content: ''; position: absolute; left: 10px; top: 50%; width: 26px; height: 26px; margin-top: -13px; border-radius: 50%; }
.dm-record__forward::before { background: var(--dm-green); }
.dm-record__back::before { background: var(--dm-red); }

/* Phone: the chart up to 480px wide. */
@container dmchart (max-width: 480px) {
  .dm-chart__frame { gap: 10px; }
  .dm-quad__y, .dm-quad__x, .dm-plot__band { display: none; }
  .dm-chart--quadrant .dm-chart__frame { display: block; }
  .dm-quad__grid { grid-template-columns: 1fr; grid-template-rows: none; min-height: 0; }
  .dm-quad__cell { grid-column: auto !important; grid-row: auto !important; }
  .dm-quad__axes { display: block; }
  .dm-plot__field .dm-entry__head, .dm-plot__field .dm-entry__meta { display: none; }
  .dm-plot__field .dm-entry__pill { width: calc(14px + var(--dm-size, 4) * 1.6px); aspect-ratio: 1; padding: 0; }
  .dm-scales__row { grid-template-columns: 1fr 1fr; }
  .dm-scales__track { grid-column: 1 / -1; grid-row: 2; }
  .dm-scales__radar-wrap { display: none; }
  .dm-scales__rows[data-layout='radar'] .dm-scales__track,
  .dm-scales__rows[data-layout='radar'] .dm-scales__row:not(:has(.dm-entry)) { display: grid; }
  .dm-curve__regions { flex-direction: column; }
  .dm-tension__stage, .dm-tension__stage--triangle { grid-template-columns: 1fr; }
  .dm-tension__triangle { display: none; }
  .dm-tension__centre { width: 108px; justify-self: center; }
  .dm-path__stages { grid-auto-flow: row; }
  .dm-path__stages::before, .dm-path__stages::after { display: none; }
  .dm-list[data-layout='lanes'], .dm-list:has(.dm-list__column-name), .dm-list[data-layout='lanes'] .dm-list__column { grid-auto-flow: row; }
  .dm-chart--outside-box .dm-chart__frame { grid-template-columns: 1fr; }
  .dm-box { grid-template-columns: 1fr; justify-items: stretch; }
  .dm-box__arrow { justify-self: center; width: 14px; height: 24px; clip-path: polygon(40% 0, 60% 0, 60% 70%, 100% 70%, 50% 100%, 0 70%, 40% 70%); }
  .dm-box__box { aspect-ratio: auto; min-height: 96px; }
  .dm-record__stop, .dm-record__ends { grid-template-columns: 1fr; }
}

/* ------------------------------------------------------------------ reused Problem Solver charts
   SWOT, morphological analysis, Pareto and double-loop learning keep their own renderers. Inside
   Decision Maker their book colours become this palette: red stays red, blue becomes ink and
   yellow becomes green (with ink text, as on yellow). White on DM red is under 4.5:1, so text
   that sat white on red turns ink (5.0:1). */
.dm-scope :is(.ps-swot, .ps-morph, .ps-pareto, .ps-dloop) {
  --ps-red: var(--dm-red);
  --ps-blue: var(--dm-ink);
  --ps-yellow: var(--dm-green);
  --ps-on-yellow: var(--dm-ink);
}
.dm-scope :is(
  .ps-swot__quadrant--threat,
  .ps-swot__pill[data-fill='red'],
  .ps-swot__move--red,
  .ps-morph__head,
  .ps-morph__head .ps-objection,
  .ps-morph__tag,
  .ps-morph__key-head .ps-morph__key-code,
  .ps-pareto__value.is-above,
  .ps-pareto__save,
  .ps-dloop__shape.is-filled[data-tone='red'],
  .ps-dloop__key-item.is-filled[data-tone='red'] .ps-dloop__key-code
) { color: var(--dm-ink); }
.dm-scope :is(.ps-swot, .ps-morph, .ps-pareto, .ps-dloop) .ps-details__card { box-shadow: none; border-top: 3px solid var(--dm-ink); }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/unit/decision-book-css.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decision-book/decision-book.css tests/unit/decision-book-css.test.js
git commit -m "Decision Maker: chart styles, phone reflow and the reused charts in this palette

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The contact sheet (one look for Adam)

**Files:**
- Create: `packages/decision-book/contact-sheet.ts`, `scripts/build-decision-book-contact-sheet.mjs`, `docs/mockups/decision-maker/contact-sheet.html`
- Modify: `.gitignore`

- [ ] **Step 1: Write the sheet, its build script and its page**

```ts
// packages/decision-book/contact-sheet.ts
// The contact sheet: every Decision Book chart, empty, partial and full, at desktop width and
// at 390px, then the four reused Problem Solver charts in the Decision Maker palette. Built by
// scripts/build-decision-book-contact-sheet.mjs into docs/mockups/decision-maker/; for one
// look by Adam, not shipped in the app.
import '../design-kit/tokens.css';
import '../problem-solver/problem-solver.css';
import './decision-book.css';
import { SAMPLE_TOOLS, runFor, sampleNode, sampleRun } from './fixtures.mjs';
import type { ChartView, DmToolRun } from './render/core';
import { createQuadrantView } from './render/quadrant';
import { createPlotView } from './render/plot';
import { createScalesView } from './render/scales';
import { createCurveView } from './render/curve';
import { createTensionView } from './render/tension';
import { createPathView } from './render/path';
import { createListView } from './render/list';
import { createOutsideBoxView } from './render/outside-box';
import { createBlackBoxView } from './render/black-box';
import { createRecordView } from './render/record';
import { createSwotView } from '../problem-solver/render/swot';
import { createParetoView } from '../problem-solver/render/pareto';
import { createMorphologicalView } from '../problem-solver/render/morphological';
import { createDoubleLoopView } from '../problem-solver/render/double-loop';
import type { PsToolRun } from '../problem-solver/types';

type Sample = { id: string; name: string; family: string };
const TOOLS = SAMPLE_TOOLS as unknown as Record<string, Sample>;
const BY_FAMILY: Record<string, (tool: never) => ChartView> = {
  quadrant: createQuadrantView,
  plot: createPlotView,
  scales: createScalesView,
  curve: createCurveView,
  tension: createTensionView,
  path: createPathView,
  list: createListView
};
const make = (key: string): ChartView => {
  if (key === 'record') {
    const view = createRecordView();
    view.setBasis({ d2: [{ model: 'Rubber band', title: 'A bigger role elsewhere' }] });
    return view;
  }
  const tool = TOOLS[key];
  if (tool.id === 'dm_outside_box') return createOutsideBoxView(tool as never);
  if (tool.id === 'dm_black_box') return createBlackBoxView(tool as never);
  return BY_FAMILY[tool.family](tool as never);
};

function cell(title: string, width: string, view: { el: HTMLElement }): HTMLElement {
  const figure = document.createElement('figure');
  figure.className = 'sheet__cell';
  figure.style.width = width;
  const caption = document.createElement('figcaption');
  caption.textContent = title;
  figure.append(caption, view.el);
  return figure;
}

const sheet = document.getElementById('sheet')!;
for (const key of [...Object.keys(TOOLS), 'record']) {
  const section = document.createElement('section');
  section.className = 'sheet__row';
  const heading = document.createElement('h2');
  heading.textContent = key === 'record' ? 'Decision record' : `${TOOLS[key].name} (${TOOLS[key].family})`;
  const row = document.createElement('div');
  row.className = 'sheet__cells';
  for (const stage of ['empty', 'partial', 'full'] as const) {
    const view = make(key);
    view.update(runFor(key, stage) as DmToolRun);
    row.append(cell(stage, '560px', view));
  }
  const phone = make(key);
  phone.update(runFor(key, 'full') as DmToolRun);
  row.append(cell('full at 390px', '358px', phone));
  section.append(heading, row);
  sheet.append(section);
}

// The reused Problem Solver charts, re-skinned (invented content).
const n = sampleNode;
const reused: [string, { el: HTMLElement; update(run: PsToolRun): void }, PsToolRun][] = [
  ['SWOT analysis', createSwotView(), {
    ...sampleRun('swot', [n('w1', 'goal', 'A calmer week'), n('w2', 'option:1', 'Four-day week'), n('w3', 'strength:1', 'More time with family'), n('w4', 'weakness:1', 'Less pay'), n('w5', 'opportunity:1', 'Freelance work'), n('w6', 'threat:1', 'Role may be cut', { state: 'contested', objection: 'Is that likely?' })]),
    edges: ['w3', 'w4', 'w5', 'w6'].map((from) => ({ from, to: 'w2', kind: 'of' }))
  } as PsToolRun],
  ['Pareto analysis', createParetoView(), {
    ...sampleRun('pareto', [n('p0', 'target', 'Late starts last month'), n('p1', 'item:1', 'Phone in bed'), n('p2', 'item:2', 'No alarm'), n('p3', 'item:3', 'Late dinner')]),
    scores: { snapshots: [{ at: '2026-10-21T10:00:00.000Z', counts: [14, 4, 2] }] }
  } as PsToolRun],
  ['Morphological analysis', createMorphologicalView(), {
    ...sampleRun('morphological', [n('m0', 'problem', 'A weekend away'), n('m1', 'subject:1', 'Where'), n('m2', 'subject:2', 'How'), n('m3', 'attribute:1', 'Coast'), n('m4', 'attribute:2', 'Hills'), n('m5', 'attribute:3', 'Train'), n('m6', 'attribute:4', 'Car')]),
    edges: [{ from: 'm3', to: 'm1', kind: 'of' }, { from: 'm4', to: 'm1', kind: 'of' }, { from: 'm5', to: 'm2', kind: 'of' }, { from: 'm6', to: 'm2', kind: 'of' }]
  } as PsToolRun],
  ['Double-loop learning', createDoubleLoopView(), sampleRun('double_loop', [n('d0', 'problem', 'Weekly plan slips'), n('d1', 'single', 'Shorter list'), n('d2', 'recurs', 'Still slips by Wednesday', { tag: 'yes' }), n('d3', 'governing:1', 'I must say yes to every request'), n('d4', 'reframe', 'The plan has no room for others')]) as PsToolRun]
];
const section = document.createElement('section');
section.className = 'sheet__row';
const heading = document.createElement('h2');
heading.textContent = 'Reused Problem Solver charts in the Decision Maker palette';
const row = document.createElement('div');
row.className = 'sheet__cells';
for (const [title, view, run] of reused) {
  view.update(run);
  row.append(cell(title, '560px', view));
}
section.append(heading, row);
sheet.append(section);
```

```js
// scripts/build-decision-book-contact-sheet.mjs
// Bundles packages/decision-book/contact-sheet.ts (every chart on fixed sample runs) into
// docs/mockups/decision-maker/contact-sheet.{js,css}, beside contact-sheet.html. The built
// files are git-ignored: rebuild to look.
// Usage: node scripts/build-decision-book-contact-sheet.mjs   (needs apps/tasks dependencies)
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../apps/tasks/node_modules/esbuild/lib/main.js';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Vite's `?raw` imports (Problem Solver's glyphs) as text. */
const raw = {
  name: 'raw',
  setup(b) {
    b.onResolve({ filter: /\?raw$/ }, (args) => ({ path: resolve(dirname(args.importer), args.path.replace(/\?raw$/, '')), namespace: 'raw' }));
    b.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }));
  }
};

await build({
  entryPoints: [`${root}packages/decision-book/contact-sheet.ts`],
  outfile: `${root}docs/mockups/decision-maker/contact-sheet.js`,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  plugins: [raw],
  logLevel: 'info'
});
```

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Decision Maker charts</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="contact-sheet.css">
<style>
  body { margin: 0; background: #faf8ef; color: #171813; font-family: Inter, system-ui, sans-serif; }
  header { padding: 20px 24px 0; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  header p { margin: 0; font-size: 14px; color: #66675d; }
  .sheet__row { padding: 16px 24px; border-bottom: 1px solid #c9cabd; }
  .sheet__row h2 { margin: 0 0 12px; font-size: 16px; }
  .sheet__cells { display: flex; gap: 20px; overflow-x: auto; align-items: flex-start; padding-bottom: 8px; }
  .sheet__cell { flex: none; margin: 0; padding: 14px 16px; border: 1px solid #c9cabd; border-radius: 18px; background: #fff; }
  .sheet__cell figcaption { margin-bottom: 10px; font: 600 11px/1.4 Inter, sans-serif; text-transform: uppercase; letter-spacing: 0.06em; color: #66675d; }
</style>
</head>
<body class="ps-scope dm-scope">
<header>
  <h1>Decision Maker charts</h1>
  <p>Every chart family on invented sample runs: empty, partial and full at desktop width, then full at 390px. The last row is the four reused Problem Solver charts in this palette.</p>
</header>
<main id="sheet"></main>
<script type="module" src="contact-sheet.js"></script>
</body>
</html>
```

Append to `.gitignore` (the comment names no path: a `word/word` comment fails the `.gitignore` secrets-scanning test):

```
# Decision Maker contact sheet build output: rebuild with the build-decision-book-contact-sheet script.
/docs/mockups/decision-maker/contact-sheet.js
/docs/mockups/decision-maker/contact-sheet.css
```

- [ ] **Step 2: Build it**

Run: `node scripts/build-decision-book-contact-sheet.mjs`
Expected: `contact-sheet.css` (about 300kb) and `contact-sheet.js` (about 230kb), then `Done`.

- [ ] **Step 3: Check it in the browser**

Serve with the `mockups` launch configuration from Plan 1 (`preview_start { name: "mockups" }`) and open `/decision-maker/contact-sheet.html` at 2,400px wide (`resize_window` 2400×1300). Then:
- read the console: there are no errors;
- run this check, which must return `[]` (no element of any chart sits outside it, at desktop or at 390px):

```js
const bad = [];
for (const c of document.querySelectorAll('.sheet__cell')) {
  const ch = c.querySelector('.dm-chart');
  if (!ch) continue;
  const r = ch.getBoundingClientRect();
  if ([...ch.querySelectorAll('*')].some((e) => { const b = e.getBoundingClientRect(); return b.width && (b.right > r.right + 1 || b.left < r.left - 1); })) bad.push(c.closest('.sheet__row').querySelector('h2').textContent + ' / ' + c.querySelector('figcaption').textContent);
}
bad;
```

- check that the y axes read high at the top (`.dm-quad__y` children's `top` values rise from first to last);
- look at every row, including the re-skinned Problem Solver row.

- [ ] **Step 4: Capture the sheet**

Run (Chrome headless, with the server up):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=6000 --window-size=2400,11700 --screenshot=/tmp/dm-contact-sheet.png http://localhost:4317/decision-maker/contact-sheet.html
```

- [ ] **Step 5: Commit**

```bash
git add packages/decision-book/contact-sheet.ts scripts/build-decision-book-contact-sheet.mjs docs/mockups/decision-maker/contact-sheet.html .gitignore
git commit -m "Decision Maker: chart contact sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: One look**

Send Adam the capture. This is the spec's single look, not an approval gate: fold in anything he asks for, then go on to Plan 3.

---

### Task 6: Plan 2 check

- [ ] **Step 1: Every node test**

Run: `npm run test:unit`
Expected: PASS, including every `decision-book-*` and `problem-solver-*` file.

- [ ] **Step 2: The Problem Solver and Decision Book vitest suites**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver tests/unit/decision-book`
Expected: PASS (981 tests when this plan was drafted).

- [ ] **Step 3: Type-check the Tasks app for these paths**

Run: `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep -E "problem-solver|decision-book" | grep -v "TS6059\|Imported via\|rootDir" || echo "no problem-solver or decision-book errors"`
Expected: `no problem-solver or decision-book errors`.

- [ ] **Step 4: Record progress**

Do not push and do not open a PR. Update the memory file `decision-book-tool.md` with "Plan 2 done (HEAD <sha>)" and anything Adam asked for on the contact sheet.

---

## Notes for later plans

These came up while drafting and belong to later plans:

- **Plan 3 (models):** build each model with `FAMILY_FACTORIES[entry.family](config)` and register it in `packages/problem-solver/tools/index.mjs`. Write each model's "logic" lines as assertions on its config. For example, Eisenhower's "urgency rises to the right, importance upwards" is a check on its cells' `col` and `row`. The one-off tools already exist (`dmOutsideBox`, `dmBlackBox`) and only need registering. `TOOL_IDS` is computed at import, so registration has to happen in `index.mjs` itself.
- **Plan 4 (app):**
  - **Canvas:** map a Decision Book run to its renderer by the tool's `family` (and by id for the two one-offs), passing the tool definition, which carries `chart` and `slots`. Wire `onScore` exactly as Problem Solver's canvas does. Call `setBasis` on the record view from the session.
  - **Decide-tool wording:** Problem Solver's Decide tools (SWOT, Pareto, morphological) end with a `choice` slot worded "carry into Implement" (`tools/choice.mjs`). Inside a decision session, the prompt or the canvas must word that choice for Decision Maker. The reused tools themselves stay unchanged.
  - **Pareto button colour:** Problem Solver's Pareto "Update the data" button uses the design kit's navy, which the re-skin does not remap. Leave it or remap it in Plan 4.
- **Review step:** the record's review value shows an ISO date in words. Plan 4's Decide tool should store review dates as ISO dates.
