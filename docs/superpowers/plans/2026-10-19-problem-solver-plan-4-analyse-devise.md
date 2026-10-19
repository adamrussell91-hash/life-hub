# Problem Solver Plan 4: Analyse and Devise tools and diagrams

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the six Analyse tools and five Devise tools (definitions, coach knowledge, emblems and animated book-faithful diagrams), plus a renderer for the TRIZ contradiction tool, so a session can work through Analyse and Devise with the same gatekeeping and charts as Define.

**Architecture:** Each tool is a pure definition in `packages/problem-solver/tools/` (slots, order, links, completion, failure modes), registered in the tool index and therefore available to the step engine from Plan 3. Two small generic machine hooks are added first: node tags (an enum chosen per node, such as a trend's direction) and per-tool node validation (such as "an idea must be linked to its petal"). Each diagram is a renderer in `packages/problem-solver/render/` following the v1 contract, registered in the canvas and the preview harness.

**Tech Stack:** Plain ESM with JSDoc (tools, machine, server), TypeScript renderers (Vite, Tasks app), Web Animations API, `node:test` for root tests, Vitest + happy-dom for renderer tests, the preview harness (`scripts/problem-solver-preview.mjs`) for visual QA.

**Spec:** `docs/superpowers/specs/2026-10-19-problem-solver-full-process-design.md` (Tool catalogue → Analyse and Devise; Diagrams; Emblems; Coach knowledge). Builds on Plan 3 (`docs/superpowers/plans/2026-10-19-problem-solver-plan-3-step-engine.md`), which is done.

**Worktree:** `/Users/adamrussell/Projects/life-hub-ps-process` (branch `claude/problem-solver-process`). Run every command from there.

**Book references (local only, never commit):** the book's chart pages for every tool in this plan are rendered as images in `/Users/adamrussell/Projects/life-hub-ps-process/.ps-book/ (git-excluded; re-render with pdftoppm from the scans in ~/Downloads if missing)`. They are `causal-map.png`, `perspective-shift.png`, `radial-tree.png`, `force-field.png`, `from-to.png`, `intent-statement.png`, `problem-reduction.png`, `analogical-reasoning.png`, `solution-tree.png`, `lotus-blossom.png` and `duncker-diagram.png`, plus `emblem-sheet.png` (every tool's emblem). Open them with the Read tool before building a tool's emblem or renderer. Shapes, proportions, layout and palette must match the book. The book's wording must not be copied into the repo (public); write labels and prompts in our own words. The short chart labels the book uses as headings ("Influence", "Goal", "Aspect", "Trend", "From", "To") are generic words and may be used.

**Commands used throughout:**

- One root test file: `node --import ./scripts/test-network-guard.mjs --test tests/unit/<file>.test.js`
- All root Problem Solver tests: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-*.test.js`
- One Tasks test file: `cd apps/tasks && npx vitest run tests/unit/<file>.test.ts`
- All Tasks Problem Solver tests: `cd apps/tasks && npx vitest run tests/unit/problem-solver`
- Type gate (the Tasks app has about 125 unrelated pre-existing errors): `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep "error TS" | grep -v TS6059 | grep -i problem-solver` must print nothing.
- Preview: `PS_PREVIEW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/problem-solver-preview.mjs <tool> <out-dir>`, with out-dir `/private/tmp/claude-501/-Users-adamrussell-Projects-life-hub/d4f11baa-e424-4641-a17f-20549745c162/scratchpad/preview`.

---

## File map

| File | Responsibility | Change |
| --- | --- | --- |
| `packages/problem-solver/machine.mjs` | `checkNode` (tags and per-tool validation) | Modify |
| `packages/problem-solver/tools/hierarchy.mjs` | Parent links and levels, shared by radial tree and solution tree | Create |
| `packages/problem-solver/tools/{causal-map,perspective-shift,radial-tree,force-field,from-to,intent-statement}.mjs` | Analyse tools | Create |
| `packages/problem-solver/tools/{problem-reduction,analogical-reasoning,solution-tree,lotus-blossom,duncker}.mjs` | Devise tools | Create |
| `packages/problem-solver/tools/index.mjs` | Register 11 tools | Modify |
| `packages/problem-solver/types.ts` | `PsToolId` additions, `PsNode.tag` | Modify |
| `netlify/functions/_shared/problem-solver/coach-schema.mjs` | `node.tag` | Modify |
| `netlify/functions/_shared/problem-solver/coach.mjs` | Run `checkNode` while fitting | Modify |
| `netlify/functions/_shared/problem-solver/session.mjs` | Keep `tag` on placed and kept nodes | Modify |
| `netlify/functions/_shared/problem-solver/prompts.mjs` | Show tags; step challenge triggers | Modify |
| `netlify/functions/_shared/problem-solver/knowledge/selection.mjs` | Analyse and Devise guides | Modify |
| `netlify/functions/_shared/problem-solver/knowledge/triggers.mjs` | Step-specific challenge triggers | Create |
| `packages/problem-solver/glyphs/tools/*.svg`, `packages/problem-solver/glyphs.ts` | 11 emblems | Create / Modify |
| `apps/tasks/src/views/problem-solver/view.ts` | Landing tool shelf grouped by step | Modify |
| `packages/problem-solver/render/{causal-map,perspective-shift,radial-tree,force-field,from-to,intent-statement,problem-reduction,analogical-reasoning,solution-tree,lotus-blossom,duncker,contradiction}.ts` | Diagrams | Create |
| `packages/problem-solver/problem-solver.css` | One commented section per new diagram | Modify |
| `apps/tasks/src/views/problem-solver/canvas.ts` | Register renderers | Modify |
| `scripts/problem-solver-preview.mjs`, `scripts/problem-solver-preview-samples.mjs` | Renderer registry and synthetic samples | Modify |
| `netlify/functions/_shared/problem-solver/scripted-coach.mjs` | Supply tags and required links for the walk | Modify |
| `apps/tasks/tests/browser/problem-solver.spec.mjs` | Walk into Analyse | Modify |

---

## Shared renderer contract (every diagram task)

Read `packages/problem-solver/render/five-whys.ts`, `packages/problem-solver/render/details.ts`, `packages/problem-solver/render/problem-tree.ts` (link overlay), `packages/problem-solver/render/gap-radar.ts` (score form and morph) and their sections in `packages/problem-solver/problem-solver.css` before building any renderer.

- **API:** `createXView(doc: Document = document): { el: HTMLDivElement; update(run: PsToolRun): void }`, plus `onScore(cb)` for scored tools. `update` is idempotent: it diffs by node id, creates DOM only for new nodes, animates only new nodes, and keeps existing elements identical across updates (tests check `===`).
- **Nothing before acceptance:** a node's shape appears only when that node exists in `run.nodes`. Structural frames (a grid, a header band, a disc) appear once the tool's first node exists, never for an empty run.
- **Palette:** `--ps-red`, `--ps-yellow`, `--ps-blue`, `--ps-on-yellow` on `.ps-scope`. Flat fills, no outlines, gradients or shadows on shapes. White text on red and blue, `--ps-on-yellow` on yellow.
- **Text in shapes:** a tiny uppercase meta label (10px, `--tracking-caps`, opacity .78) and a title (15px semibold, never below 12px) from `nodeTitle(node)`. Never the full answer inside a shape, except where a task says otherwise.
- **Details:** every node shape is a `<button aria-expanded aria-controls>` registered with `createDisclosureGroup()`. Clicking it opens `detailsCard(doc, node, accent, id)` with the full answer, skill chips and any objection. One card open per diagram.
- **Contested:** the shape stays solid, with `contestedTag(doc, node)` beside its title, and `is-contested` on the item.
- **Links:** where a tool has edges, draw them in an SVG overlay as in `problem-tree.ts`: a stroke-dashoffset draw-in on creation, and a recompute on update and on resize (ResizeObserver, guarded where it doesn't exist).
- **Motion:** Web Animations API, 300–520ms, `EASE` from details.ts, `fill: 'backwards'`, skipped when `canAnimate(el)` is false. Never animate an element whose position comes from an SVG `transform` attribute; animate an inner wrapper. Numeric changes morph from the previous snapshot over 600ms (as the radar does).
- **Layout:** works at 390px with no horizontal scroll. Use CSS container queries for the phone layout, not JS.
- **Accessibility:** the root has `role="list"` and `aria-label` set to the tool name. Each node wrapper has `role="listitem"` and `data-node="<id>"`. Region wrappers have `data-region` and `aria-label`.
- **Classes:** a prefix per tool (given in each task). Styles go in `packages/problem-solver/problem-solver.css` under a `/* <Tool name> */` section.
- **Registration (each renderer task):**
  - add the factory to `RENDERERS` in `apps/tasks/src/views/problem-solver/canvas.ts`;
  - add the file and factory to `RENDERERS` in `scripts/problem-solver-preview.mjs`;
  - add a synthetic sample run to `SAMPLES` in `scripts/problem-solver-preview-samples.mjs`, with invented content, no real names, one contested node, and a full run in the tool's usual length.
- **Tests:** Vitest + happy-dom in `apps/tasks/tests/unit/problem-solver-<tool>-render.test.ts`. Use the helpers below and always include the five baseline tests, then the tool-specific tests the task lists.

```ts
import { describe, expect, it } from 'vitest';
import type { PsEdge, PsNode, PsToolRun } from '../../../../packages/problem-solver/types';
const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} answer text`, title: `${slot} title`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (tool: PsToolRun['tool'], nodes: PsNode[], edges: PsEdge[] = [], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id: 'r', tool, status: 'active', nodes, edges, ...extra });
// Baseline (adapt the factory and a valid first node):
//  1. empty run → no [data-node] and no structural frame
//  2. identity: the element for an existing node is === across two updates
//  3. contested node → .is-contested, .ps-objection title = objection, details note contains the objection
//  4. one details card open at a time (click A then B → only B's item has .is-open)
//  5. the shape shows nodeTitle, and the full text appears only inside .ps-details
```

- **Visual QA:** after the tests pass, render the sample at 900px and 390px with the preview command. Look at both PNGs next to the book page image. Fix anything cramped, misaligned or unlike the book before committing.
- **Commit:** one commit per renderer task, message `Problem Solver: <tool name> diagram`, with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Node tags and per-tool node validation

**Files:**
- Modify: `packages/problem-solver/machine.mjs`, `packages/problem-solver/types.ts`
- Modify: `netlify/functions/_shared/problem-solver/coach-schema.mjs`, `coach.mjs`, `session.mjs`, `prompts.mjs`
- Test: `tests/unit/problem-solver-machine.test.js`, `tests/unit/problem-solver-coach-schema.test.js`, `tests/unit/problem-solver-coach.test.js`, `tests/unit/problem-solver-session.test.js`, `tests/unit/problem-solver-prompts.test.js`

Some slots need a choice from a fixed list (a trend's direction, an assessment's outcome, a pathway's kind). Some slots need a link given with them (an idea needs its petal). The machine checks both; the coach repairs when a check fails.

- [ ] **Step 1: Failing machine tests (append to `tests/unit/problem-solver-machine.test.js`; merge imports into the top block)**

```js
import { checkNode } from '../../packages/problem-solver/machine.mjs';
import { TOOLS as REGISTRY } from '../../packages/problem-solver/tools/index.mjs';

const fakeTool = {
  id: 'fake_tagged', name: 'Fake', kind: 'diagnostic', step: 'analyse', when: 'test', failureModes: ['a', 'b'], steps: [], edgeKinds: ['link'],
  slots: { item: 'An item', pick: 'A pick' },
  nodeTags: { pick: ['up', 'down'] },
  validateNode(run, node, edges) { return node.slot.startsWith('item') && !edges.some((e) => e.kind === 'link') ? 'Link each item.' : null; },
  nextSlots: () => ['item:1', 'pick'], complete: () => false
};

test('checkNode requires a listed tag on tagged slots and rejects tags elsewhere', () => {
  REGISTRY.fake_tagged = fakeTool; // test-only registration
  try {
    const run = { id: 'r', tool: 'fake_tagged', status: 'active', nodes: [], edges: [] };
    assert.equal(checkNode(run, { slot: 'pick', text: 'x', tag: 'up' }, []), null);
    assert.match(checkNode(run, { slot: 'pick', text: 'x' }, []), /pick needs a tag: one of up, down/);
    assert.match(checkNode(run, { slot: 'pick', text: 'x', tag: 'sideways' }, []), /pick needs a tag: one of up, down/);
    assert.equal(checkNode(run, { slot: 'item:1', text: 'x', tag: 'up' }, [{ from: 'item:1', to: 'pick', kind: 'link' }]), 'Slot item takes no tag.');
    assert.equal(checkNode(run, { slot: 'item:1', text: 'x' }, []), 'Link each item.');
    assert.equal(checkNode(run, { slot: 'item:1', text: 'x' }, [{ from: 'item:1', to: 'pick', kind: 'link' }]), null);
  } finally {
    delete REGISTRY.fake_tagged;
  }
});
```

`TOOLS` is frozen. Change `tools/index.mjs` so the frozen object is still exported as `TOOLS`, but the test needs a registry it can add to. Implement this by building `TOOLS` as a plain object and freezing only its values' definitions, not the container:

```js
export const TOOLS = { five_whys: fiveWhys, /* … */ };
```

(Remove the `Object.freeze` on the container only. Every tool definition stays frozen. `TOOL_IDS` stays frozen and is computed at load, so a test-only addition does not change it.)

- [ ] **Step 2: Run, expect FAIL** (no `checkNode`).

- [ ] **Step 3: Implement `checkNode` in `machine.mjs`**

```js
/**
 * Checks a proposed node against its tool before it is placed:
 * a tag from the tool's list where the slot needs one (and none elsewhere),
 * then the tool's own `validateNode(run, node, edges)`. `edges` are the proposed
 * links in slot form ({ from, to, kind } with slot names). Returns an error
 * message for the coach to repair, or null.
 */
export function checkNode(run, node, edges = []) {
  const def = toolDef(run.tool);
  const name = parseSlot(node.slot)?.name;
  const tags = def.nodeTags?.[name];
  if (tags && !tags.includes(node.tag)) return `Slot ${name} needs a tag: one of ${tags.join(', ')}.`;
  if (!tags && node.tag != null) return `Slot ${name} takes no tag.`;
  return typeof def.validateNode === 'function' ? def.validateNode(run, node, edges) : null;
}
```

Add `import { parseSlot } from './slots.mjs';` to machine.mjs if it isn't already imported.

- [ ] **Step 4: Schema, coach, session, prompts.** Add tests first:

`tests/unit/problem-solver-coach-schema.test.js`:

```js
test('node.tag is kept, trimmed and lowercased', () => {
  const v = validateCoachTurn({ verdict: 'accept', message: 'ok', node: { slot: 'trend:1', text: 'Fewer walk-ins', tag: ' Declining ' } }).value;
  assert.equal(v.node.tag, 'declining');
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', node: { slot: 'problem', text: 'x' } }).value.node.tag, undefined);
});
```

`tests/unit/problem-solver-session.test.js`:

```js
test('a placed node keeps its tag, and so does a kept challenged node', () => {
  let s = framed('seven_step', 'problem_tree');
  s = applyCoachTurn(s, coach({ node: { slot: 'trunk', text: 'Late deliveries', tag: 'x' } }), deps);
  assert.equal(activeRun(s).nodes[0].tag, 'x');
  s = applyCoachTurn(s, coach({ verdict: 'challenge', message: 'Symptom.', node: { slot: 'cause:1', text: 'Busy', tag: 'y' } }), deps);
  s = keepAnyway(s, deps);
  assert.equal(activeRun(s).nodes[1].tag, 'y');
});
```

(The session does not validate tags; the coach does. This test only proves the field is carried.)

`tests/unit/problem-solver-coach.test.js`: add a test using the same fake tagged tool trick (register a fake tool, open a session with an active run of it, have the model's first reply place `pick` without a tag and its second reply with `tag: 'up'`). Assert exactly one repair call, and that the repair prompt contains `pick needs a tag: one of up, down`. Remove the fake tool in `finally`.

`tests/unit/problem-solver-prompts.test.js`:

```js
test('slot meanings show tag choices and placed nodes show their tag', async () => {
  const { TOOLS: T } = await import('../../packages/problem-solver/tools/index.mjs');
  T.fake_tagged = { id: 'fake_tagged', name: 'Fake', kind: 'diagnostic', step: 'define', when: 'w', failureModes: ['a', 'b'], steps: [{ id: 's', title: 'S', prompt: 'p' }], edgeKinds: [], slots: { pick: 'A pick' }, nodeTags: { pick: ['up', 'down'] }, nextSlots: () => ['pick'], complete: () => false };
  try {
    let s = inTool('five_whys');
    s = { ...s, steps: { define: { ...s.steps.define, runs: [{ id: 'f', tool: 'fake_tagged', status: 'active', nodes: [{ id: 'n', slot: 'pick', text: 'Rising', tag: 'up', state: 'accepted', skills: [], turnId: 't' }], edges: [] }] } } };
    const { user } = buildCoachPrompt(s);
    assert.match(user, /pick = A pick \(tag: up\|down\)/);
    assert.match(user, /pick \[up\]: Rising/);
  } finally {
    delete T.fake_tagged;
  }
});
```

Then implement:

- `coach-schema.mjs`: when building `node`, add `...(typeof raw.node.tag === 'string' && raw.node.tag.trim() ? { tag: raw.node.tag.trim().toLowerCase().slice(0, 40) } : {})`.
- `coach.mjs` `fitToRun`: after computing `node` (with the fitted slot) and the renamed edges, and before the `verdict !== 'accept'` early return, drop any `tag` on a slot whose tool has no `nodeTags` entry for it (a stray tag is harmless and shouldn't cost a repair), then call `const problem = checkNode(run, node, renamedEdges)`. If it returns a message, return `{ error: problem }`. To do this, compute `renamedEdges = value.edges.map((e) => ({ ...e, from: rename(e.from), to: rename(e.to) }))` once and reuse it in the edge loop. Import `checkNode` from machine.mjs.
- `session.mjs`: in `placeAccepted`, add `...(turn.node.tag ? { tag: turn.node.tag } : {})` to the placed node. In the challenge branch of `applyCoachTurn`, add `tag: turn.node.tag` to `pendingKeep`. In `keepAnyway`, add `...(keep.tag ? { tag: keep.tag } : {})` to the placed node.
- `prompts.mjs` `runLines`:
  - In `Slot meanings`, render each slot as `${k} = ${v}${def.nodeTags?.[k] ? ` (tag: ${def.nodeTags[k].join('|')})` : ''}`.
  - In `Placed`, render `  ${node.slot}${node.tag ? ` [${node.tag}]` : ''}${contested}: ${node.text}`.
  - In the RUBRIC OUTPUT example, make the node object `{"slot":"...","text":"...","title":"...","tag":"..."}`.
  - Add one GATEKEEPING line: `- When a slot lists tag choices, put exactly one of them in node.tag; otherwise leave tag out.`
- `types.ts`: add `tag?: string` to `PsNode`.

- [ ] **Step 5: Run all root Problem Solver tests and the Tasks tests. Expect PASS.**

- [ ] **Step 6: Commit**

```bash
git add packages/problem-solver netlify/functions/_shared/problem-solver tests/unit
git commit -m "Problem Solver: node tags and per-tool node checks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Hierarchy helper and the six Analyse tools

**Files:**
- Create: `packages/problem-solver/tools/hierarchy.mjs`, `causal-map.mjs`, `perspective-shift.mjs`, `radial-tree.mjs`, `force-field.mjs`, `from-to.mjs`, `intent-statement.mjs`
- Modify: `packages/problem-solver/tools/index.mjs`, `packages/problem-solver/types.ts`
- Test: `tests/unit/problem-solver-analyse-tools.test.js`

- [ ] **Step 1: Failing tests**

```js
// tests/unit/problem-solver-analyse-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, applyScores, canEdge, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { levels } from '../../packages/problem-solver/tools/hierarchy.mjs';
import { forceTotals } from '../../packages/problem-solver/tools/force-field.mjs';

let n = 0;
const put = (run, slot, extra = {}) => placeNode(run, { id: `n${(n += 1)}`, slot, text: slot, state: 'accepted', ...extra });
const idOf = (run, slot) => run.nodes.find((x) => x.slot === slot).id;
const link = (run, from, to, kind) => addEdge(run, { from: idOf(run, from), to: idOf(run, to), kind });

test('analyse step lists its six tools in order', () => {
  assert.deepEqual(toolsForBookStep('analyse'), ['causal_map', 'perspective_shift', 'radial_tree', 'force_field', 'from_to', 'intent_statement']);
});

test('causal map: problem first; causes and influences; links only toward causes or the problem; complete when every cause leads somewhere', () => {
  let r = newRun('causal_map', 'r');
  assert.deepEqual(nextSlots(r), ['problem']);
  r = put(r, 'problem');
  assert.deepEqual(nextSlots(r), ['cause:1', 'influence:1']);
  for (const s of ['cause:1', 'cause:2', 'cause:3', 'influence:1']) r = put(r, s);
  assert.equal(canEdge(r, idOf(r, 'cause:1'), idOf(r, 'problem'), 'plus'), true);
  assert.equal(canEdge(r, idOf(r, 'influence:1'), idOf(r, 'cause:2'), 'minus_strong'), true);
  assert.equal(canEdge(r, idOf(r, 'problem'), idOf(r, 'cause:1'), 'plus'), false, 'nothing flows out of the problem');
  assert.equal(canEdge(r, idOf(r, 'cause:1'), idOf(r, 'influence:1'), 'plus'), false, 'influences receive nothing');
  r = link(r, 'cause:1', 'problem', 'plus');
  assert.equal(canEdge(r, idOf(r, 'cause:1'), idOf(r, 'problem'), 'minus'), false, 'one link per pair');
  assert.equal(isComplete(r), false);
  r = link(r, 'cause:2', 'problem', 'minus');
  r = link(r, 'cause:3', 'cause:1', 'plus_strong');
  assert.equal(isComplete(r), true);
});

test('perspective shift: each stakeholder gets a view then an insight; reframe after two insights', () => {
  let r = newRun('perspective_shift', 'r');
  assert.deepEqual(nextSlots(r), ['stakeholder:1']);
  r = put(r, 'stakeholder:1');
  assert.deepEqual(nextSlots(r), ['stakeholder:2', 'view:1']);
  r = put(r, 'view:1');
  assert.deepEqual(nextSlots(r), ['stakeholder:2', 'insight:1']);
  r = put(r, 'insight:1');
  r = put(r, 'stakeholder:2');
  r = put(r, 'view:2');
  r = put(r, 'insight:2');
  assert.ok(nextSlots(r).includes('reframe'));
  assert.equal(isComplete(r), false);
  r = put(r, 'reframe');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), []);
});

test('radial tree: nodes hang from the root or another node, one parent each; levels; complete with depth and a review', () => {
  let r = newRun('radial_tree', 'r');
  assert.deepEqual(nextSlots(r), ['root']);
  r = put(r, 'root');
  for (const s of ['node:1', 'node:2', 'node:3']) r = put(r, s);
  r = link(r, 'node:3', 'node:1', 'parent');
  assert.equal(canEdge(r, idOf(r, 'node:3'), idOf(r, 'node:2'), 'parent'), false, 'one parent');
  assert.equal(canEdge(r, idOf(r, 'root'), idOf(r, 'node:1'), 'parent'), false, 'the root has no parent');
  const lv = levels(r, 'root', 'node');
  assert.deepEqual([lv.get(idOf(r, 'root')), lv.get(idOf(r, 'node:1')), lv.get(idOf(r, 'node:2')), lv.get(idOf(r, 'node:3'))], [1, 2, 2, 3]);
  assert.ok(nextSlots(r).includes('review'));
  r = put(r, 'review');
  assert.equal(isComplete(r), true);
});

test('force field: current, goal, then forces; scores 1 to 5 per force; totals from the latest snapshot', () => {
  let r = newRun('force_field', 'r');
  assert.deepEqual(nextSlots(r), ['current']);
  r = put(r, 'current');
  assert.deepEqual(nextSlots(r), ['goal']);
  r = put(r, 'goal');
  assert.deepEqual(nextSlots(r), ['for:1', 'against:1']);
  for (const s of ['for:1', 'for:2', 'against:1']) r = put(r, s);
  assert.equal(isComplete(r), false);
  assert.throws(() => applyScores(r, { for: [3], against: [2] }, 't'), /one score per force/);
  assert.throws(() => applyScores(r, { for: [3, 6], against: [2] }, 't'), /1 to 5/);
  r = applyScores(r, { for: [4, 2], against: [5] }, 't1');
  assert.deepEqual(forceTotals(r), { for: 6, against: 5 });
  assert.equal(isComplete(r), true);
});

test('from…to: aspect, trend (tagged), from, to per row; insight after two rows', () => {
  let r = newRun('from_to', 'r');
  assert.deepEqual(nextSlots(r), ['aspect:1']);
  r = put(r, 'aspect:1');
  assert.deepEqual(nextSlots(r), ['aspect:2', 'trend:1']);
  assert.match(checkNode(r, { slot: 'trend:1', text: 'x' }, []), /needs a tag: one of growing, stable, declining/);
  r = put(r, 'trend:1', { tag: 'declining' });
  r = put(r, 'from:1');
  r = put(r, 'to:1');
  assert.ok(!nextSlots(r).includes('insight'));
  for (const s of ['aspect:2', 'trend:2', 'from:2', 'to:2']) r = put(r, s, s.startsWith('trend') ? { tag: 'growing' } : {});
  assert.ok(nextSlots(r).includes('insight'));
  r = put(r, 'insight');
  assert.equal(isComplete(r), true);
});

test('intent statement: six parts in order', () => {
  let r = newRun('intent_statement', 'r');
  for (const s of ['problem', 'stakeholders', 'failures', 'approach', 'opportunity', 'risk']) {
    assert.deepEqual(nextSlots(r), [s]);
    r = put(r, s);
  }
  assert.equal(isComplete(r), true);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/tools/hierarchy.mjs
import { parseSlot } from '../slots.mjs';

const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;

/** The parent link for a child node, or undefined. */
export function parentEdge(run, id) {
  return run.edges.find((edge) => edge.kind === 'parent' && edge.from === id);
}

/** A child may take one parent: the root or another child node. */
export function canParent(run, from, to, rootName, childName) {
  return nameOf(run, from) === childName && [rootName, childName].includes(nameOf(run, to)) && !parentEdge(run, from);
}

/**
 * Level of every node: the root is 1; a child with no parent link hangs from the root (2);
 * otherwise one more than its parent. Parents are always placed first, so there are no cycles.
 */
export function levels(run, rootName, childName) {
  const out = new Map();
  const root = run.nodes.find((node) => parseSlot(node.slot)?.name === rootName);
  if (root) out.set(root.id, 1);
  for (const node of run.nodes) {
    if (parseSlot(node.slot)?.name !== childName) continue;
    const parent = parentEdge(run, node.id)?.to;
    out.set(node.id, (parent && out.get(parent) ? out.get(parent) : 1) + 1);
  }
  return out;
}

/** Child ids per parent id (root included), in placement order. */
export function childrenOf(run, rootName, childName) {
  const root = run.nodes.find((node) => parseSlot(node.slot)?.name === rootName);
  const map = new Map();
  for (const node of run.nodes) {
    if (parseSlot(node.slot)?.name !== childName) continue;
    const parent = parentEdge(run, node.id)?.to ?? root?.id ?? null;
    if (!map.has(parent)) map.set(parent, []);
    map.get(parent).push(node.id);
  }
  return map;
}
```

```js
// packages/problem-solver/tools/causal-map.mjs
import { hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;

export const causalMap = Object.freeze({
  id: 'causal_map',
  name: 'Causal map',
  kind: 'diagnostic',
  step: 'analyse',
  when: 'Many causes that act on each other and on the problem, where you need to see which way each one pushes and how hard. Deeper than 5 Whys.',
  failureModes: [
    'A cause with no evidence behind it.',
    'A link that does not say whether it makes things more or less.',
    'Every link marked strong, so strength stops meaning anything.',
    'Symptoms of the problem placed as causes.'
  ],
  steps: [
    { id: 'state', title: 'State the problem', prompt: 'Pin the problem down clearly; everything on the map connects back to it.' },
    { id: 'causes', title: 'Identify causes', prompt: 'Gather every plausible cause, from the people involved and from anyone with expertise. Wider forces that act on several causes go in as influences.' },
    { id: 'map', title: 'Map relationships', prompt: 'For each cause or influence, say what it leads to and whether it makes that more (plus) or less (minus). Mark a link strong only when it clearly outweighs the others. Ask why each thing happens and what it leads to.' }
  ],
  slots: { problem: 'The problem', cause: 'A cause, in a few words', influence: 'A wider influence acting on causes' },
  edgeKinds: ['plus', 'minus', 'plus_strong', 'minus_strong'],
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    return open(nextIndexed(run, 'cause', 12), nextIndexed(run, 'influence', 8));
  },
  canEdge(run, from, to) {
    if (run.edges.some((edge) => edge.from === from && edge.to === to)) return false;
    return ['cause', 'influence'].includes(nameOf(run, from)) && ['cause', 'problem'].includes(nameOf(run, to));
  },
  complete(run) {
    const causes = run.nodes.filter((node) => parseSlot(node.slot)?.name === 'cause');
    return hasSlot(run, 'problem') && causes.length >= 3 && causes.every((cause) => run.edges.some((edge) => edge.from === cause.id));
  }
});
```

Note: `machine.canEdge` already rejects an identical (from, to, kind) edge. The extra check above also rejects a second link with a different kind between the same pair.

```js
// packages/problem-solver/tools/perspective-shift.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

const has = (run, slot) => run.nodes.some((node) => node.slot === slot);

export const perspectiveShift = Object.freeze({
  id: 'perspective_shift',
  name: 'Perspective shift',
  kind: 'diagnostic',
  step: 'analyse',
  when: 'Several people are affected or involved, and their needs, worries or views may change what the problem really is. Builds empathy and lowers conflict.',
  failureModes: [
    'One person\'s view presented as everyone\'s.',
    'Imagined views with no input gathered from the person.',
    'Insights that restate a complaint instead of a need ("It helps when…", "I can\'t … when …").',
    'Skipping the reframe, so nothing changes.'
  ],
  steps: [
    { id: 'stakeholders', title: 'Identify stakeholders', prompt: 'List the people affected by the problem or by a solution to it.' },
    { id: 'input', title: 'Gather input', prompt: 'For each, find out what drives them: motivations, concerns and values, ideally from them or from research.' },
    { id: 'viewpoints', title: 'Analyse viewpoints', prompt: 'Step into their view; question the assumptions and biases you have taken as given.' },
    { id: 'insights', title: 'Synthesise insights', prompt: 'Write one insight statement per stakeholder, such as "It helps when…" or "I can\'t … when …".' },
    { id: 'reframe', title: 'Reframe', prompt: 'Revise the problem or the goal in light of what the perspectives showed.' }
  ],
  slots: {
    stakeholder: 'Someone affected by the problem or its solution',
    view: 'Their view of it, in their terms: what they think, question, wish or worry about',
    insight: 'Their insight statement: "It helps when…" or "I can\'t … when …"',
    reframe: 'The problem or goal, reframed by these perspectives'
  },
  edgeKinds: [],
  nextSlots(run) {
    if (hasSlot(run, 'reframe')) return [];
    const rows = [];
    for (let i = 1; i <= countSlots(run, 'stakeholder'); i += 1) {
      if (!has(run, `view:${i}`)) rows.push(`view:${i}`);
      else if (!has(run, `insight:${i}`)) rows.push(`insight:${i}`);
    }
    return open(nextIndexed(run, 'stakeholder', 8), ...rows, countSlots(run, 'insight') >= 2 ? 'reframe' : null);
  },
  complete(run) {
    return countSlots(run, 'insight') >= 2 && hasSlot(run, 'reframe');
  }
});
```

```js
// packages/problem-solver/tools/radial-tree.mjs
import { hasSlot, nextIndexed, open } from '../slots.mjs';
import { canParent, levels } from './hierarchy.mjs';

export const radialTree = Object.freeze({
  id: 'radial_tree',
  name: 'Radial tree',
  kind: 'diagnostic',
  step: 'analyse',
  when: 'Information that breaks down into levels, where seeing clusters, balance and outliers at a glance helps. A vertical tree reads faster; the radial form suits reflection.',
  failureModes: [
    'Levels that mix kinds of thing, so the hierarchy means nothing.',
    'Items hung under the wrong parent.',
    'A lopsided tree accepted without asking why one branch is so thin.'
  ],
  steps: [
    { id: 'hierarchy', title: 'Define the hierarchy', prompt: 'Decide what each level holds; a quick concept map helps find the groupings.' },
    { id: 'nodes', title: 'Draw the nodes', prompt: 'Start with the top level at the centre and work outward, joining each item to the one it belongs under.' },
    { id: 'review', title: 'Review', prompt: 'Look at the whole for balance and legibility, and say what the clusters and gaps show.' }
  ],
  slots: { root: 'The centre: the subject being broken down', node: 'An item, one level below the item it hangs from', review: 'What the finished tree shows: clusters, balance, gaps' },
  edgeKinds: ['parent'],
  nextSlots(run) {
    if (!hasSlot(run, 'root')) return ['root'];
    const deep = [...levels(run, 'root', 'node').values()].some((level) => level >= 3);
    return open(nextIndexed(run, 'node', 40), deep && !hasSlot(run, 'review') ? 'review' : null);
  },
  canEdge(run, from, to) {
    return canParent(run, from, to, 'root', 'node');
  },
  complete(run) {
    return hasSlot(run, 'review') && [...levels(run, 'root', 'node').values()].some((level) => level >= 3);
  }
});
```

```js
// packages/problem-solver/tools/force-field.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const MAX = 6;

/** Sum of the latest for and against scores, or null before any scoring. */
export function forceTotals(run) {
  const latest = run.scores?.snapshots?.at(-1);
  if (!latest) return null;
  const sum = (list) => list.reduce((total, value) => total + value, 0);
  return { for: sum(latest.for), against: sum(latest.against) };
}

/** Force nodes of one side, in slot order. */
export function forces(run, side) {
  return run.nodes.filter((node) => parseSlot(node.slot)?.name === side).sort((a, b) => parseSlot(a.slot).index - parseSlot(b.slot).index);
}

export const forceField = Object.freeze({
  id: 'force_field',
  name: 'Force field analysis',
  kind: 'diagnostic',
  step: 'analyse',
  when: 'Change is needed and forces push for and against it (personal, social, cultural, political, environmental, economic). If restraining forces dominate and cannot be moved, reframe.',
  failureModes: [
    'Forces scored with no reason given.',
    'Only internal forces, missing the outside ones (or the reverse).',
    'Planning to push harder on drivers without weakening the restrainers.',
    'Ignoring that forces change over time.'
  ],
  steps: [
    { id: 'define', title: 'Define the problem and goal', prompt: 'Say clearly where things stand now and the outcome you want.' },
    { id: 'forces', title: 'Uncover forces for and against change', prompt: 'Brainstorm every force, small or large, inside or outside, that helps or hinders the change.' },
    { id: 'assess', title: 'Assess the forces', prompt: 'Score each force from 1 to 5. Then plan how to strengthen the drivers and weaken the restrainers until the drivers outweigh them.' }
  ],
  slots: { current: 'The current state', goal: 'The goal', for: 'A force for change', against: 'A force against change' },
  edgeKinds: [],
  nextSlots(run) {
    if (!hasSlot(run, 'current')) return ['current'];
    if (!hasSlot(run, 'goal')) return ['goal'];
    return open(nextIndexed(run, 'for', MAX), nextIndexed(run, 'against', MAX));
  },
  pickScores(payload) {
    return { for: payload?.for, against: payload?.against };
  },
  validateScores(run, scores) {
    for (const side of ['for', 'against']) {
      const list = scores?.[side];
      if (!Array.isArray(list) || list.length !== countSlots(run, side)) return `Give one score per force ${side === 'for' ? 'for' : 'against'} change.`;
      if (!list.every((value) => Number.isInteger(value) && value >= 1 && value <= 5)) return 'Scores run from 1 to 5.';
    }
    return null;
  },
  complete(run) {
    return hasSlot(run, 'goal') && countSlots(run, 'for') >= 1 && countSlots(run, 'against') >= 1 && (run.scores?.snapshots?.length ?? 0) >= 1;
  }
});
```

```js
// packages/problem-solver/tools/from-to.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

const has = (run, slot) => run.nodes.some((node) => node.slot === slot);
const fullRows = (run) => Array.from({ length: countSlots(run, 'aspect') }, (_, i) => i + 1).filter((i) => has(run, `to:${i}`)).length;

export const fromTo = Object.freeze({
  id: 'from_to',
  name: 'From…to exploration',
  kind: 'diagnostic',
  step: 'analyse',
  when: 'Trends are shaping the problem and you want to move from how things are now toward a desired future, using those trends rather than fighting them.',
  failureModes: [
    'A trend asserted with no source.',
    'A "to" that is just the "from" made bigger, not a real speculation.',
    'Ignoring a declining trend that undercuts the plan.'
  ],
  steps: [
    { id: 'aspects', title: 'Determine problem aspects', prompt: 'List the central features or contexts of the problem.' },
    { id: 'trends', title: 'Identify trends', prompt: 'For each aspect, name the most relevant past or emerging trend and whether it is growing, stable or declining. A second strong trend gets its own row.' },
    { id: 'possibilities', title: 'Speculate possibilities', prompt: 'Write where each aspect is now (from) and where it might go (to), grounded in what you know.' },
    { id: 'insights', title: 'Discover insights', prompt: 'Look across the rows for forces to accommodate or put to use.' }
  ],
  slots: { aspect: 'A feature or context of the problem', trend: 'The trend acting on that aspect', from: 'How that aspect is now', to: 'Where it might go', insight: 'What the rows show: forces to use or accommodate' },
  nodeTags: { trend: ['growing', 'stable', 'declining'] },
  edgeKinds: [],
  nextSlots(run) {
    if (hasSlot(run, 'insight')) return [];
    const rows = [];
    for (let i = 1; i <= countSlots(run, 'aspect'); i += 1) {
      if (!has(run, `trend:${i}`)) rows.push(`trend:${i}`);
      else if (!has(run, `from:${i}`)) rows.push(`from:${i}`);
      else if (!has(run, `to:${i}`)) rows.push(`to:${i}`);
    }
    return open(nextIndexed(run, 'aspect', 6), ...rows, fullRows(run) >= 2 ? 'insight' : null);
  },
  complete(run) {
    return fullRows(run) >= 2 && hasSlot(run, 'insight');
  }
});
```

```js
// packages/problem-solver/tools/intent-statement.mjs
import { hasSlot } from '../slots.mjs';

const ORDER = ['problem', 'stakeholders', 'failures', 'approach', 'opportunity', 'risk'];

export const intentStatement = Object.freeze({
  id: 'intent_statement',
  name: 'Intent statement',
  kind: 'statement',
  step: 'analyse',
  when: 'At the end of Analyse, to set out the problem and the plan to tackle it in a way others can follow: who is involved, what went wrong before, why this approach, what it is worth and what could go wrong.',
  failureModes: [
    'Past failures skipped, so the tone is unrealistically hopeful.',
    'An approach that does not say why it will work this time.',
    'Risks listed with no likelihood or mitigation.'
  ],
  steps: [
    { id: 'problem', title: 'Define the problem', prompt: 'A short definition of the problem in its context.' },
    { id: 'stakeholders', title: 'Identify stakeholders', prompt: 'Who is affected, and who needs to act.' },
    { id: 'failures', title: 'Acknowledge failures', prompt: 'What has gone wrong with past attempts, or could go wrong now.' },
    { id: 'approach', title: 'The approach', prompt: 'Why this effort will succeed: people, timing, processes, methods.' },
    { id: 'opportunity', title: 'Highlight the opportunity', prompt: 'What solving it is worth.' },
    { id: 'risk', title: 'Assess the risks', prompt: 'What could go wrong, how likely, and how to reduce it.' }
  ],
  slots: { problem: 'The problem in context', stakeholders: 'Who is affected or must act', failures: 'Past or likely failures', approach: 'Why this approach will work', opportunity: 'What solving it is worth', risk: 'Risks, likelihood and mitigation' },
  edgeKinds: [],
  nextSlots(run) {
    const next = ORDER.find((name) => !hasSlot(run, name));
    return next ? [next] : [];
  },
  complete(run) {
    return hasSlot(run, 'risk');
  }
});
```

Register all six in `tools/index.mjs` after `contradiction`, in this order: `causal_map: causalMap, perspective_shift: perspectiveShift, radial_tree: radialTree, force_field: forceField, from_to: fromTo, intent_statement: intentStatement`. Add the six ids to `PsToolId` in `types.ts`.

`glyphs.ts` types `EMBLEMS` as `Record<PsToolId, string>`, which will now fail type-checking until Task 4. Change its type to `Partial<Record<PsToolId, string>>` for now. Make `toolEmblem` return an empty `ps-emblem` span when an emblem is missing, and make `EMBLEM_SVG` lookups fall back to `''`. Task 4 restores the full record.

- [ ] **Step 4: Run the new test file and all root Problem Solver tests. Expect PASS.** The machine test that lists every registered tool (`problem-solver-machine.test.js`) needs the new ids appended.

- [ ] **Step 5: Commit**: `Problem Solver: Analyse tool definitions` (with trailer).

---

### Task 3: The five Devise tools

**Files:**
- Create: `packages/problem-solver/tools/problem-reduction.mjs`, `analogical-reasoning.mjs`, `solution-tree.mjs`, `lotus-blossom.mjs`, `duncker.mjs`
- Modify: `packages/problem-solver/tools/index.mjs`, `packages/problem-solver/types.ts`
- Test: `tests/unit/problem-solver-devise-tools.test.js`

- [ ] **Step 1: Failing tests**

```js
// tests/unit/problem-solver-devise-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, canEdge, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { priorityOrder } from '../../packages/problem-solver/tools/problem-reduction.mjs';
import { currentRound } from '../../packages/problem-solver/tools/analogical-reasoning.mjs';

let n = 0;
const put = (run, slot, extra = {}) => placeNode(run, { id: `d${(n += 1)}`, slot, text: slot, state: 'accepted', ...extra });
const idOf = (run, slot) => run.nodes.find((x) => x.slot === slot).id;
const link = (run, from, to, kind) => addEdge(run, { from: idOf(run, from), to: idOf(run, to), kind });

test('devise step lists its five tools in order', () => {
  assert.deepEqual(toolsForBookStep('devise'), ['problem_reduction', 'analogical_reasoning', 'solution_tree', 'lotus_blossom', 'duncker']);
});

test('problem reduction: subs, then a priority order naming each sub once, then a solution per sub, then the integration', () => {
  let r = newRun('problem_reduction', 'r');
  assert.deepEqual(nextSlots(r), ['problem']);
  r = put(r, 'problem');
  r = put(r, 'sub:1');
  assert.deepEqual(nextSlots(r), ['sub:2']);
  r = put(r, 'sub:2');
  r = put(r, 'sub:3');
  assert.ok(nextSlots(r).includes('priority'));
  assert.match(checkNode(r, { slot: 'priority', text: '2, 1' }, []), /every sub-problem number once/);
  assert.match(checkNode(r, { slot: 'priority', text: '2, 1, 1' }, []), /every sub-problem number once/);
  assert.equal(checkNode(r, { slot: 'priority', text: 'Sub 2 first, then 3, then 1' }, []), null);
  r = put(r, 'priority', { text: 'Sub 2 first, then 3, then 1' });
  assert.deepEqual(priorityOrder(r), [2, 3, 1]);
  assert.deepEqual(nextSlots(r), ['solution:1', 'solution:2', 'solution:3']);
  for (const s of ['solution:1', 'solution:2', 'solution:3']) r = put(r, s);
  assert.deepEqual(nextSlots(r), ['integrated']);
  r = put(r, 'integrated');
  assert.equal(isComplete(r), true);
});

test('analogical reasoning: source, target, rules, filter, assess; unsolved opens another target; solved opens retain', () => {
  let r = newRun('analogical_reasoning', 'r');
  assert.deepEqual(nextSlots(r), ['source']);
  r = put(r, 'source');
  assert.deepEqual(nextSlots(r), ['target:1']);
  r = put(r, 'target:1');
  assert.deepEqual(nextSlots(r), ['rule:1']);
  r = put(r, 'rule:1');
  assert.deepEqual(nextSlots(r), ['rule:2', 'filtered:1']);
  r = put(r, 'filtered:1');
  assert.deepEqual(nextSlots(r), ['assess:1']);
  assert.match(checkNode(r, { slot: 'assess:1', text: 'x' }, []), /one of solved, unsolved/);
  r = put(r, 'assess:1', { tag: 'unsolved' });
  assert.deepEqual(nextSlots(r), ['target:2']);
  r = put(r, 'target:2');
  assert.equal(currentRound(r).round, 2);
  assert.deepEqual(nextSlots(r), ['rule:2']);
  r = put(r, 'rule:2');
  r = put(r, 'filtered:2');
  r = put(r, 'assess:2', { tag: 'solved' });
  assert.deepEqual(nextSlots(r), ['retain']);
  assert.equal(isComplete(r), false);
  r = put(r, 'retain');
  assert.equal(isComplete(r), true);
});

test('solution tree: hows hang from the aim or another how; complete with an alternative', () => {
  let r = newRun('solution_tree', 'r');
  r = put(r, 'aim');
  for (const s of ['how:1', 'how:2', 'how:3']) r = put(r, s);
  assert.equal(canEdge(r, idOf(r, 'how:2'), idOf(r, 'how:1'), 'parent'), true);
  r = link(r, 'how:2', 'how:1', 'parent');
  assert.equal(isComplete(r), true, 'aim has two children (how:1, how:3): an alternative');
});

test('lotus blossom: eight solutions; ideas must name their petal; at most eight per petal; preferred marks an idea', () => {
  let r = newRun('lotus_blossom', 'r');
  r = put(r, 'problem');
  for (let i = 1; i <= 8; i += 1) r = put(r, `solution:${i}`);
  assert.ok(!nextSlots(r).includes('solution:9'));
  assert.match(checkNode(r, { slot: 'idea:1', text: 'x' }, []), /Link each idea to the solution it grows from/);
  assert.equal(checkNode(r, { slot: 'idea:1', text: 'x' }, [{ from: 'idea:1', to: 'solution:1', kind: 'petal' }]), null);
  for (let i = 1; i <= 8; i += 1) {
    r = put(r, `idea:${i}`);
    r = link(r, `idea:${i}`, 'solution:1', 'petal');
  }
  r = put(r, 'idea:9');
  assert.equal(canEdge(r, idOf(r, 'idea:9'), idOf(r, 'solution:1'), 'petal'), false, 'petal full');
  r = link(r, 'idea:9', 'solution:2', 'petal');
  r = put(r, 'idea:10');
  r = link(r, 'idea:10', 'solution:3', 'petal');
  assert.equal(isComplete(r), false);
  r = put(r, 'preferred:1');
  r = link(r, 'preferred:1', 'idea:9', 'marks');
  assert.equal(isComplete(r), true);
});

test('duncker: problem, desired, tagged pathways, solutions under pathways, evaluation once both kinds exist', () => {
  let r = newRun('duncker', 'r');
  assert.deepEqual(nextSlots(r), ['problem']);
  r = put(r, 'problem');
  assert.deepEqual(nextSlots(r), ['desired']);
  r = put(r, 'desired');
  assert.match(checkNode(r, { slot: 'pathway:1', text: 'x' }, []), /one of direct, opposite/);
  r = put(r, 'pathway:1', { tag: 'direct' });
  assert.match(checkNode(r, { slot: 'solution:1', text: 'x' }, []), /Put each solution under its pathway/);
  r = put(r, 'solution:1');
  r = link(r, 'solution:1', 'pathway:1', 'under');
  assert.ok(!nextSlots(r).includes('evaluation'));
  r = put(r, 'pathway:2', { tag: 'opposite' });
  assert.ok(nextSlots(r).includes('redefinition'));
  r = put(r, 'solution:2');
  r = link(r, 'solution:2', 'pathway:2', 'under');
  assert.ok(nextSlots(r).includes('evaluation'));
  r = put(r, 'evaluation');
  assert.equal(isComplete(r), true);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/tools/problem-reduction.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

const has = (run, slot) => run.nodes.some((node) => node.slot === slot);

function orderFrom(text, count) {
  const numbers = (String(text).match(/\d+/g) ?? []).map(Number);
  const valid = numbers.length === count && new Set(numbers).size === count && numbers.every((value) => value >= 1 && value <= count);
  return valid ? numbers : null;
}

/** The tackle order as sub-problem numbers, or null before it is set. */
export function priorityOrder(run) {
  const node = run.nodes.find((item) => item.slot === 'priority');
  return node ? orderFrom(node.text, countSlots(run, 'sub')) : null;
}

export const problemReduction = Object.freeze({
  id: 'problem_reduction',
  name: 'Problem reduction',
  kind: 'generative',
  step: 'devise',
  when: 'A problem too big to solve whole, which breaks into smaller parts that can each be solved and then combined (Newell and Simon\'s divide and conquer).',
  failureModes: [
    'Sub-problems that overlap, so work is done twice.',
    'An order chosen by ease rather than impact and feasibility.',
    'Forgetting to put the pieces back together.'
  ],
  steps: [
    { id: 'define', title: 'Define the problem', prompt: 'State the whole problem with the specifics that matter.' },
    { id: 'decompose', title: 'Decompose', prompt: 'Break it into smaller parts. Ask what its elements are, who is affected, the root causes, what happens if it stays unsolved, where and when it occurs.' },
    { id: 'prioritise', title: 'Prioritise', prompt: 'Decide the order to tackle the parts, by impact and feasibility.' },
    { id: 'solve', title: 'Solve each part', prompt: 'Work each sub-problem on its own; split it further if needed.' },
    { id: 'integrate', title: 'Integrate', prompt: 'Combine the part solutions into one solution for the whole.' }
  ],
  slots: {
    problem: 'The whole problem',
    sub: 'A smaller part of it',
    priority: 'The order to tackle the parts, as their numbers, e.g. "2, 3, 1"',
    solution: 'The solution to the sub-problem with the same number',
    integrated: 'How the part solutions combine into one'
  },
  edgeKinds: [],
  validateNode(run, node) {
    if (node.slot !== 'priority') return null;
    return orderFrom(node.text, countSlots(run, 'sub')) ? null : 'List every sub-problem number once, in the order to tackle them, for example "2, 3, 1".';
  },
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    const subs = countSlots(run, 'sub');
    if (!hasSlot(run, 'priority')) return open(nextIndexed(run, 'sub', 6), subs >= 2 ? 'priority' : null);
    const unsolved = Array.from({ length: subs }, (_, i) => `solution:${i + 1}`).filter((slot) => !has(run, slot));
    if (unsolved.length) return unsolved;
    return hasSlot(run, 'integrated') ? [] : ['integrated'];
  },
  complete(run) {
    return hasSlot(run, 'integrated');
  }
});
```

```js
// packages/problem-solver/tools/analogical-reasoning.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const MAX_TARGETS = 3;
const nodeAt = (run, slot) => run.nodes.find((node) => node.slot === slot) ?? null;

/** The current round: its target number, rules placed since that target, and its filter and assessment. */
export function currentRound(run) {
  const round = countSlots(run, 'target');
  const start = run.nodes.findIndex((node) => node.slot === `target:${round}`);
  const rules = start < 0 ? [] : run.nodes.slice(start + 1).filter((node) => parseSlot(node.slot)?.name === 'rule');
  return { round, rules, filtered: nodeAt(run, `filtered:${round}`), assess: nodeAt(run, `assess:${round}`) };
}

export const analogicalReasoning = Object.freeze({
  id: 'analogical_reasoning',
  name: 'Analogical reasoning',
  kind: 'generative',
  step: 'devise',
  when: 'A problem that resembles one already solved somewhere else (another field, another time, someone else\'s life), so its solution can be borrowed and adapted.',
  failureModes: [
    'An analogy that matches on the surface but not on what causes the problem.',
    'Rules that hold for the analogue but not for this problem.',
    'Declaring it solved without testing the borrowed rule.'
  ],
  steps: [
    { id: 'source', title: 'Define the source problem', prompt: 'Name the problem you face and its key characteristics.' },
    { id: 'target', title: 'Identify the analogue', prompt: 'Find a problem solved elsewhere that shares those characteristics, and list them. Park other analogies for later.' },
    { id: 'match', title: 'Match rules', prompt: 'Write rules that hold for both: statements that explain an action, a change, an attribute or a situation.' },
    { id: 'filter', title: 'Filter', prompt: 'Keep the most relevant rules and apply them to your problem.' },
    { id: 'assess', title: 'Assess', prompt: 'Did they solve it? If not, revise, search for another analogue and go round again.' }
  ],
  slots: {
    source: 'The problem faced, with its key characteristics',
    target: 'A solved problem from elsewhere that shares those characteristics',
    rule: 'A rule that holds for both problems',
    filtered: 'The rules kept and how they apply here',
    assess: 'Whether applying them solves the problem, and why',
    retain: 'What to keep from this analogy'
  },
  nodeTags: { assess: ['solved', 'unsolved'] },
  edgeKinds: [],
  nextSlots(run) {
    if (!hasSlot(run, 'source')) return ['source'];
    const { round, rules, filtered, assess } = currentRound(run);
    if (round === 0) return ['target:1'];
    if (assess) {
      if (assess.tag === 'solved') return hasSlot(run, 'retain') ? [] : ['retain'];
      return round < MAX_TARGETS ? [`target:${round + 1}`] : [];
    }
    if (filtered) return [`assess:${round}`];
    return open(nextIndexed(run, 'rule', 24), rules.length >= 1 ? `filtered:${round}` : null);
  },
  complete(run) {
    const { round, assess } = currentRound(run);
    return hasSlot(run, 'retain') || (round === MAX_TARGETS && Boolean(assess));
  }
});
```

```js
// packages/problem-solver/tools/solution-tree.mjs
import { hasSlot, nextIndexed } from '../slots.mjs';
import { canParent, childrenOf } from './hierarchy.mjs';

export const solutionTree = Object.freeze({
  id: 'solution_tree',
  name: 'Solution tree',
  kind: 'generative',
  step: 'devise',
  when: 'You know the aim and need to map every way to reach it: an issue tree asks why, a solution tree asks how, branching into actions and alternatives.',
  failureModes: [
    'Branches that are not real "hows" of their parent.',
    'Stopping at one path when alternatives exist.',
    'Actions too vague to start on.'
  ],
  steps: [
    { id: 'aim', title: 'State the aim', prompt: 'Name the objective; it is the trunk at the base of the tree.' },
    { id: 'possibilities', title: 'Determine possibilities', prompt: 'Add the high-level ways to reach it, then for each, the actions that achieve it, branching until every step is set out.' },
    { id: 'alternatives', title: 'Consider alternatives', prompt: 'Look for other ways to the same outcome; they become twigs off the branches.' }
  ],
  slots: { aim: 'The objective, at the base', how: 'A way to achieve the item it hangs from' },
  edgeKinds: ['parent'],
  nextSlots(run) {
    return hasSlot(run, 'aim') ? [nextIndexed(run, 'how', 30)].filter(Boolean) : ['aim'];
  },
  canEdge(run, from, to) {
    return canParent(run, from, to, 'aim', 'how');
  },
  complete(run) {
    const families = [...childrenOf(run, 'aim', 'how').values()];
    return hasSlot(run, 'aim') && families.flat().length >= 3 && families.some((kids) => kids.length >= 2);
  }
});
```

```js
// packages/problem-solver/tools/lotus-blossom.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const PETALS = 8;
const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;

/** Idea ids per solution id, in placement order. */
export function petalsOf(run) {
  const map = new Map();
  for (const edge of run.edges) {
    if (edge.kind !== 'petal') continue;
    if (!map.has(edge.to)) map.set(edge.to, []);
    map.get(edge.to).push(edge.from);
  }
  return map;
}

export const lotusBlossom = Object.freeze({
  id: 'lotus_blossom',
  name: 'Lotus blossom',
  kind: 'generative',
  step: 'devise',
  when: 'You need many options fast: eight solutions around the problem, then eight ideas around each, for up to sixty-four (Matsumura).',
  failureModes: [
    'Judging ideas while generating them.',
    'Eight petals that are really the same idea.',
    'Ending with a pile of ideas and no preferred few.'
  ],
  steps: [
    { id: 'centre', title: 'The central problem', prompt: 'Put the problem at the centre and generate eight possible solutions around it. Keep them brief.' },
    { id: 'expand', title: 'Solution expansion', prompt: 'Make each solution the centre of its own flower and generate up to eight ideas around it.' },
    { id: 'review', title: 'Iterate and review', prompt: 'Review the ideas for viability, overlap, feasibility and impact; circle and link the preferred ones.' }
  ],
  slots: { problem: 'The problem at the centre', solution: 'One of eight possible solutions', idea: 'An idea that grows from one solution', preferred: 'A preferred idea and why' },
  edgeKinds: ['petal', 'marks'],
  validateNode(run, node, edges) {
    const name = parseSlot(node.slot)?.name;
    if (name === 'idea' && !edges.some((edge) => edge.kind === 'petal' && edge.from === node.slot)) return 'Link each idea to the solution it grows from (link kind "petal", from the idea to the solution).';
    if (name === 'preferred' && !edges.some((edge) => edge.kind === 'marks' && edge.from === node.slot)) return 'Link each preferred note to the idea it picks (link kind "marks").';
    return null;
  },
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    const solutions = countSlots(run, 'solution');
    return open(
      solutions < PETALS ? nextIndexed(run, 'solution', PETALS) : null,
      solutions >= 1 ? nextIndexed(run, 'idea', PETALS * PETALS) : null,
      countSlots(run, 'idea') >= 1 ? nextIndexed(run, 'preferred', 8) : null
    );
  },
  canEdge(run, from, to, kind) {
    if (kind === 'petal') return nameOf(run, from) === 'idea' && nameOf(run, to) === 'solution' && !run.edges.some((edge) => edge.kind === 'petal' && edge.from === from) && (petalsOf(run).get(to)?.length ?? 0) < PETALS;
    if (kind === 'marks') return nameOf(run, from) === 'preferred' && nameOf(run, to) === 'idea' && !run.edges.some((edge) => edge.kind === 'marks' && edge.from === from);
    return false;
  },
  complete(run) {
    const flowered = [...petalsOf(run).values()].filter((ideas) => ideas.length >= 1).length;
    return countSlots(run, 'solution') === PETALS && flowered >= 3 && run.edges.some((edge) => edge.kind === 'marks');
  }
});
```

```js
// packages/problem-solver/tools/duncker.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;
const pathways = (run) => run.nodes.filter((node) => parseSlot(node.slot)?.name === 'pathway');

export const duncker = Object.freeze({
  id: 'duncker',
  name: 'Duncker diagram',
  kind: 'generative',
  step: 'devise',
  when: 'The obvious route keeps failing and you need contrary paths too: one straight to the desired state, one that makes it acceptable not to get there or redefines the problem. Counters functional fixedness.',
  failureModes: [
    'Only obvious pathways, with no functionally opposite one.',
    'Solutions that do not belong under their pathway.',
    'Evaluating without asking whether a redefined problem also reaches the desired state.'
  ],
  steps: [
    { id: 'define', title: 'Define', prompt: 'State the problem (top) and the desired state (bottom).' },
    { id: 'pathways', title: 'Establish pathways', prompt: 'Find at least two broad approaches to an acceptable future, including one functionally opposite to the obvious way.' },
    { id: 'solutions', title: 'Generate specific solutions', prompt: 'Under each pathway list concrete solutions: some remove the obstacles directly, others go round them or change the problem\'s terms.' },
    { id: 'evaluate', title: 'Evaluate', prompt: 'Weigh feasibility, effectiveness and consequences. If the best path redefines the problem, check that solving the new one still reaches the desired state.' }
  ],
  slots: {
    problem: 'The problem, at the top',
    desired: 'The desired state, at the bottom',
    pathway: 'A broad approach (direct, or functionally opposite)',
    solution: 'A specific solution under one pathway',
    redefinition: 'A new problem definition an opposite pathway leads to',
    evaluation: 'The weighing of feasibility, effectiveness and consequences'
  },
  nodeTags: { pathway: ['direct', 'opposite'] },
  edgeKinds: ['under'],
  validateNode(run, node, edges) {
    if (parseSlot(node.slot)?.name !== 'solution') return null;
    return edges.some((edge) => edge.kind === 'under' && edge.from === node.slot) ? null : 'Put each solution under its pathway (link kind "under", from the solution to the pathway).';
  },
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    if (!hasSlot(run, 'desired')) return ['desired'];
    if (hasSlot(run, 'evaluation')) return [];
    const paths = pathways(run);
    const covered = paths.length >= 2 && paths.every((path) => run.edges.some((edge) => edge.kind === 'under' && edge.to === path.id));
    const kinds = new Set(paths.map((path) => path.tag));
    return open(
      nextIndexed(run, 'pathway', 4),
      paths.length ? nextIndexed(run, 'solution', 12) : null,
      kinds.has('opposite') && !hasSlot(run, 'redefinition') ? 'redefinition' : null,
      covered && kinds.has('direct') && kinds.has('opposite') ? 'evaluation' : null
    );
  },
  canEdge(run, from, to, kind) {
    return kind === 'under' && nameOf(run, from) === 'solution' && nameOf(run, to) === 'pathway' && !run.edges.some((edge) => edge.from === from);
  },
  complete(run) {
    return hasSlot(run, 'evaluation');
  }
});
```

Register the five after the Analyse tools: `problem_reduction: problemReduction, analogical_reasoning: analogicalReasoning, solution_tree: solutionTree, lotus_blossom: lotusBlossom, duncker`. Add the ids to `PsToolId`. Append the ids to the machine test's full registry list.

- [ ] **Step 4: Run, expect PASS** (all root Problem Solver tests).

- [ ] **Step 5: Commit**: `Problem Solver: Devise tool definitions` (with trailer).

---

### Task 4: Emblems for the eleven tools, landing shelf by step — then the HUMAN CHECKPOINT

**Files:**
- Create: `packages/problem-solver/glyphs/tools/<tool_id>.svg` × 11
- Modify: `packages/problem-solver/glyphs.ts` (restore `Record<PsToolId, string>` and drop the Task 2 fallbacks), `apps/tasks/src/views/problem-solver/view.ts` (tool shelf)
- Test: `apps/tasks/tests/unit/problem-solver-glyphs.test.ts` (it already checks that every tool has an emblem)

- [ ] **Step 1: Draw the emblems.** Open `.ps-book/emblem-sheet.png` and each tool's page image. Every emblem is a circle in viewBox `0 0 100 100`, using the book colours as literal fills (read the hex values from an existing emblem, such as `glyphs/tools/five_whys.svg`), no ids and no strokes. Match each one to its book emblem:
  - causal_map: red disc; a blue downward triangle at the top; a band of small yellow triangles below it.
  - perspective_shift: blue disc; a yellow bow-tie (two triangles meeting at the centre); a red centre dot.
  - radial_tree: yellow disc; thin blue concentric rings; small red nodes near the centre and blue nodes outward, joined by thin lines. Keep it legible at 24px; fewer nodes than the book is fine.
  - force_field: red disc; a yellow triangle pointing down into the centre from the top and a blue triangle from below.
  - from_to: blue disc; four circles in a 2×2 grid, red on the left and yellow on the right.
  - intent_statement: blue top half; a row of small yellow up-triangles across the middle; red lower half.
  - problem_reduction: yellow disc; a red dot on the left; blue triangles above and below; a blue dot on the right.
  - analogical_reasoning: diagonal bands, blue upper right, yellow middle, red lower left.
  - solution_tree: red disc; a wheel of alternating yellow and blue petals around a yellow centre.
  - lotus_blossom: blue disc; a ring of eight yellow circles; a red centre.
  - duncker: yellow disc; short vertical rounded bars, red on the left and blue on the right, in two rows.

  Then compare your emblems with the sheet. Where this list and the sheet disagree, follow the sheet.
- [ ] **Step 2:** Import the eleven SVGs in `glyphs.ts`, add them to `EMBLEMS`, and restore the strict `Record<PsToolId, string>` type and the strict lookups.
- [ ] **Step 3: Landing shelf by step.** In `view.ts`, `toolShelf()` lists every tool flat under "Seven Define tools". Change it to one group per book step that has tools (Define, Analyse, Devise for now; later steps appear automatically as their tools register). Each group gets a small heading with the step name (from `BOOK_STEPS` in steps.mjs) and that step's tools from `toolsForBookStep(step)`. Leave out the TRIZ-only `contradiction` step. Change the section aside text from "Seven Define tools…" to "The coach picks from these for each step. Here is what each one is for." Add a view test: the shelf has `[data-step="analyse"]` containing the six Analyse tool names.
- [ ] **Step 4: Contact sheet.** Build a throwaway HTML page in the scratchpad with all 19 emblems at 96px and 24px on the paper background. Screenshot it with the Chrome path above (reuse `node_modules/playwright-core`), to `scratchpad/preview/emblems.png`. Compare it with `.ps-book/emblem-sheet.png` and fix any emblem that doesn't read as its book counterpart.
- [ ] **Step 5:** Run the glyph and view tests, the type gate, and all Problem Solver tests. Commit: `Problem Solver: Analyse and Devise emblems; tool shelf grouped by step`.
- [ ] **Step 6: HUMAN CHECKPOINT.** The controller sends `scratchpad/preview/emblems.png` to Adam (SendUserFile) and asks for approval. Renderer tasks may proceed in the meantime. If Adam asks for changes, they become a fix commit before the plan finishes.

---

### Task 5: Coach knowledge for Analyse and Devise

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/knowledge/selection.mjs`, `prompts.mjs`
- Create: `netlify/functions/_shared/problem-solver/knowledge/triggers.mjs`
- Test: `tests/unit/problem-solver-knowledge.test.js`, `tests/unit/problem-solver-prompts.test.js`

- [ ] **Step 1: Failing tests**

Append to `tests/unit/problem-solver-knowledge.test.js`:

```js
import { STEP_TRIGGERS } from '../../netlify/functions/_shared/problem-solver/knowledge/triggers.mjs';

test('selection guides for analyse and devise name every one of their tools', async () => {
  const { toolsForBookStep } = await import('../../packages/problem-solver/tools/index.mjs');
  for (const step of ['analyse', 'devise']) {
    for (const id of toolsForBookStep(step)) assert.ok(SELECTION[step].includes(`\`${id}\``), `${step} guide names ${id}`);
  }
});

test('step triggers exist for analyse and devise as short lines', () => {
  for (const step of ['analyse', 'devise']) {
    assert.ok(Array.isArray(STEP_TRIGGERS[step]) && STEP_TRIGGERS[step].length >= 3, step);
    for (const line of STEP_TRIGGERS[step]) assert.ok(line.length < 200, line);
  }
});
```

Append to `tests/unit/problem-solver-prompts.test.js`:

```js
test('the analyse step layer carries its selection guide, tools and challenge triggers', () => {
  const s = moveOn(inTool(), deps);
  const layer = buildCoachPrompt(s).system[1];
  assert.match(layer, /CURRENT STEP: Analyse/);
  assert.match(layer, /`causal_map`/);
  assert.match(layer, /causal_map \(Causal map\)/);
  assert.match(layer, /CHALLENGE IN THIS STEP:/);
  assert.doesNotMatch(layer, /No tools are available/);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

Add to `SELECTION` in `selection.mjs`:

```js
  analyse: 'Choose from what the problem needs next. Many causes acting on each other: `causal_map`. Several people affected whose views may change the problem: `perspective_shift`. Information that breaks into levels and needs seeing whole: `radial_tree`. Change resisted, with forces for and against: `force_field`. Trends shaping where things are heading: `from_to`. To close Analyse with a plan others can follow: `intent_statement`, usually last.',
  devise: 'Choose from how the problem resists solutions. Too big to solve whole: `problem_reduction`. Resembles a problem solved elsewhere: `analogical_reasoning`. A clear aim needing every route mapped: `solution_tree`. Needing many options fast: `lotus_blossom`. Stuck on the obvious route: `duncker`, which forces a contrary path. Generate before judging; carry the best options into Decide.'
```

Create `triggers.mjs`:

```js
// netlify/functions/_shared/problem-solver/knowledge/triggers.mjs
/** Extra reasons to challenge, per book step, added to the step layer. Our words. Later plans add their steps. */
export const STEP_TRIGGERS = Object.freeze({
  analyse: [
    'A cause or trend asserted with no evidence or source (critical_thinking).',
    'One person\'s view presented as everyone\'s (critical_thinking).',
    'Forces or links scored or weighted with no reason (analysis).',
    'Jumping to solutions before the analysis is done (metacognition).'
  ],
  devise: [
    'Judging or narrowing ideas while still generating them (creative_thinking).',
    'Only obvious options, with no contrary or unusual route considered (creative_thinking).',
    'In a group, pooling ideas before each person has generated their own (creative_thinking).',
    'An option that is a restatement of the problem rather than a way to solve it (logical_reasoning).'
  ]
});
```

In `prompts.mjs` `stepLayer`, after the TOOLS FOR THIS STEP block (only when the step has tools), append the triggers for each of the step's book families: `CHALLENGE IN THIS STEP:\n- …` (one line per trigger), skipping families with no entry.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**: `Problem Solver: coach knowledge for Analyse and Devise` (with trailer).

---

## Renderer tasks (6–17)

Each task below gives the book page, the class prefix, the composition, how it builds, and the tool-specific tests on top of the five baseline tests. Follow the shared contract above for everything else.

### Task 6: Causal map renderer (`render/causal-map.ts`, `createCausalMapView`, prefix `ps-causal`)

**Book:** `.ps-book/causal-map.png`.
- Layout, left to right: a red circle "The problem" at mid-height on the left; a column of yellow half-disc "Cause" shapes (dome up, flat edge down) in the middle; and on the right a tall column of blue downward-pointing arrowheads ("Influence") that interlock into one zig-zag strip. Arrows run from influences to causes and from causes to the problem.
- Always check the image: where this text and the picture disagree, follow the picture.
- Arrows are yellow and thin, each with a small "+/−" label.
- Legend: "+ Positive influences", "− Negative influences".

**Build:**
- **Regions:** `data-region="problem"` (left), `"causes"` (middle column), `"influences"` (right column).
- **Shapes:**
  - The problem circle appears with the `problem` node.
  - Causes are yellow half-discs, dome up, in a vertical column. Each new one scales up from its flat edge.
  - Influences are blue downward-pointing arrowheads stacked into an interlocking zig-zag column on the right. Each new one slides down into place.
- **Links:** an SVG overlay, with each link drawn from the source's edge to the target's edge as a gentle curve.
  - Stroke colour: `--ps-yellow` for plus kinds; for minus kinds, `--ps-ink`, dashed `4 3`.
  - Strong kinds are 3px, normal kinds 1.5px.
  - Each link has a small round badge at its midpoint showing "+" or "−".
  - Links draw in with stroke-dashoffset.
- **Legend:** "+ makes it more" and "− makes it less", plus "Thicker: stronger". It appears with the first link.
- **Phone:** keep the three columns, narrower, with titles clamped to 2 lines in container query units. Under 340px wide, stack them: influences as a horizontal strip on top, then causes, then the problem. Links are still drawn.

**Tests:**
- Causes go in the causes region, influences in the influences region, and the problem in the problem region.
- One link `[data-edge]` per edge, with `data-sign` `plus`/`minus` and `data-strength` `strong`/`normal`.
- The legend is absent until the first edge.
- Adding an edge on a second update creates one more `[data-edge]` and keeps the existing ones (`===`).

### Task 7: Perspective shift renderer (`render/perspective-shift.ts`, `createPerspectiveShiftView`, prefix `ps-persp`)

**Book:** `.ps-book/perspective-shift.png`. A square split by its diagonals into four triangles: top yellow, right blue, bottom yellow, left blue. Each triangle carries a perspective label ("Perspective A–D") and a prompt ("I think…", "Why is…", "I wish…", "What about…"). A red dot sits at the centre.

**Build:**
- **Triangles:** stakeholder *i* fills triangle `(i-1) % 4` in the order top, right, bottom, left.
  - The triangle is drawn (clip-path wipe from its outer edge) when its stakeholder node exists.
  - Inside it: the meta "Perspective A" (letter by index), the prompt in italic small type (use the four prompts above; they are generic words), then the stakeholder's title.
  - When the stakeholder's `insight:i` exists, its title appears under the stakeholder title with a thin rule. When only `view:i` exists, a small "view noted" dot appears.
  - Each of these is its own button with details.
- **More than four stakeholders:** pager dots under the square switch between sets of four ("1–4", "5–8"). The set containing the newest stakeholder shows by default.
- **Reframe:** the red centre dot is always present once the first stakeholder exists. When `reframe` is accepted it pulses once (scale 1 → 1.35 → 1), and a reframe card appears below the square with the full reframe text (like Problem statement's composed card) and a details button.
- **Phone:** the square stays square at full width. Triangle text uses container query units and clamps to 2 lines.

**Tests:**
- Stakeholder 1 is in `[data-quadrant="top"]` and stakeholder 2 in `"right"`.
- Insight 1 renders inside the top quadrant.
- The reframe card has the full text.
- With five stakeholders there are two pager buttons and the second set is shown.

### Task 8: Radial tree renderer (`render/radial-tree.ts`, `createRadialTreeView`, prefix `ps-radial`)

**Book:** `.ps-book/radial-tree.png`. A yellow disc with concentric rings, a large red Level 1 node at the centre, red Level 2 nodes, blue Level 3, and small blue Levels 4–5 at the rim, joined by spokes and lines. Variation: a vertical tree with a blue Level 1 at the top, a red Level 2 row and yellow Level 3 stacks.

**Build (SVG, viewBox `-110 -110 220 220`):**
- The yellow disc and ring guides (one ring per level present) appear with the `root` node.
- **Positions:** use `levels()` and `childrenOf()` from `tools/hierarchy.mjs`.
  - Angles are computed by recursive leaf-count partitioning, so each subtree gets a wedge proportional to its leaves; siblings spread evenly inside their parent's wedge.
  - Radius per level: 0, 38, 66, 88, 102.
  - Node radius shrinks per level: 14, 9, 7, 5, 4.
  - Colours by level: 1 red, 2 red, 3+ blue.
- **Node buttons:** each node is an absolutely positioned HTML button over the SVG at its computed point, so it is focusable.
  - The label (title) shows for levels 1–2 inside or beside the circle.
  - For deeper levels the title shows in a hover or focus tooltip, plus the details card.
- **Motion:**
  - When a node is added, existing nodes glide (600ms) from their old points to their new points. Animate the wrapper's `translate`, not an SVG transform attribute.
  - The new node grows from its parent's point.
  - Links (parent to child, straight lines) are redrawn each update and follow the glide.
- **Vertical toggle:** a "Vertical tree" / "Radial tree" toggle button above the chart. The vertical layout is a top-down tree using the same buttons, with level colours following the book's vertical variation (1 blue, 2 red, 3+ yellow). Store the choice on the view instance only.
- **Review:** the `review` node renders as a card under the chart.

**Tests:**
- The root is at the centre (`data-level="1"`).
- A child with a parent link has `data-level="3"`.
- The level ring count equals the levels present.
- Toggling to vertical sets `data-layout="vertical"` and keeps node elements identical (`===`).
- Existing node elements are identical after a new node is added.

### Task 9: Force field renderer with scoring (`render/force-field.ts`, `createForceFieldView`, prefix `ps-force`)

**Book:** `.ps-book/force-field.png`.
- A wide blue "Goal" bar across the top, and a tall red "The current state" bar in the centre.
- Left: a blue "Forces for change" header with blue right-pointing arrows of decreasing length (numbered 5…1).
- Right: a yellow "Forces against change" header with yellow left-pointing arrows of decreasing length.
- Blue and yellow "Score" pills at the bottom.

**Build:**
- The goal bar appears with `goal`, and the current-state bar with `current` (vertical text on wide screens).
- **Arrows:** each `for:i` is a blue arrow pointing at the centre bar from the left, and each `against:i` a yellow arrow from the right.
  - Before any scores, every arrow is drawn at a neutral length with a faint "unscored" style (lower opacity, no number).
  - After a snapshot, arrow length is proportional to its score (1–5) and the score number sits in the arrowhead.
  - Rows are ordered by score, largest first like the book, and stay stable for equal scores.
  - A rescore morphs lengths over 600ms, and rows re-order with a FLIP animation.
- **Totals:** pills show each side's total from `forceTotals`. When the forces for change are greater, a small "Drivers outweigh restrainers" badge appears; otherwise "Restrainers hold".
- **Score form:** a "Score the forces" button opens a compact form, one row per force with a 1–5 control.
  - Use the same control approach as the radar's scoring form in `gap-radar.ts`; read it.
  - Submitting calls `onScore({ for: number[], against: number[] })` in slot order.
  - The renderer never calls the API. The canvas already forwards `onScore` with the run id (Plan 3).
- **Phone:** the two sides stack (for above against) around a horizontal current-state bar.

**Tests:**
- Arrows are absent until their nodes exist.
- Unscored arrows have `.is-unscored`.
- After a snapshot with `for: [4, 2]`, `data-score` is 4 and 2 and the 4 comes first.
- Totals read 6 and 5 for the Task 2 sample.
- Submitting the form calls `onScore` with arrays in slot order.
- A second snapshot updates `data-score` without replacing the arrow elements.

### Task 10: From…to renderer (`render/from-to.ts`, `createFromToView`, prefix `ps-fromto`)

**Book:** `.ps-book/from-to.png`. A blue field; four red header circles "Aspect", "Trend", "From..", "To"; rows of yellow circles beneath, the trend circle holding red arrows (up, right, down).

**Build:**
- **Header:** the blue field and the four red header circles appear with the first `aspect`.
- **Rows:** each row `i` is four yellow circle cells (aspect, trend, from, to), each appearing with its node (scale in, staggered).
- **Trend cell:** a red arrow, not a title. It is rotated by the node's tag: growing points up-right (−45°), stable points right (0°), declining points down-right (45°). The arrow rotates from 0° on arrival. The trend title shows under the arrow in small type.
- **Details:** each cell is a button with details.
- **Insight:** a card under the grid.
- **Phone:** the grid keeps four columns with smaller circles, and titles are clamped to 2 lines in container query units. Under a width of 340px, each row becomes a stacked card: aspect, then trend, then "from → to".

**Tests:**
- A row's cells are in `[data-row="1"]` in column order.
- The trend cell has `data-direction` matching the tag.
- Empty columns have no cell element.
- The insight card appears only with `insight`.

### Task 11: Intent statement renderer (`render/intent-statement.ts`, `createIntentStatementView`, prefix `ps-intent`)

**Book:** `.ps-book/intent-statement.png`. Six horizontal bands stacked, each a right-pointing chevron with a zig-zag lower edge in alternating red, yellow, blue, red, yellow, blue. The heading is on the left of each band (Problem, Stakeholders, Failures, Approach, Opportunity, Risk) and the prompt on the right.

**Build:**
- Each band appears with its node and unfurls left to right (clip-path from `inset(0 100% 0 0)` to `inset(0)`, 480ms).
- The band shows its heading (meta) and the node's title.
- The zig-zag edge is a CSS clip-path polygon, and the chevron point is on the right.
- The whole band is the button with details.
- **Phone:** headings above titles inside each band; the chevron point shrinks.

**Tests:**
- Bands render in fixed order regardless of node order.
- Each band has `data-part` (problem…risk).
- The colour class follows the book order (`is-red`, `is-yellow`, `is-blue` repeating).

### Task 12: Problem reduction renderer (`render/problem-reduction.ts`, `createProblemReductionView`, prefix `ps-reduce`)

**Book:** `.ps-book/problem-reduction.png`. A large red "Problem A" circle on the left, yellow chevrons to two yellow sub-problem circles, chevrons to blue "Solution for" circles, then a large blue "Solution for A" circle on the right.

**Build:**
- **Columns:** problem (red, large), subs (yellow, stacked), solutions (blue, aligned to their sub), and the integrated solution (blue, large).
- **Chevrons:** small yellow chevrons between columns, drawn when both ends exist.
- **Priority:** once `priority` exists, each sub gets a number badge (1st, 2nd…) from `priorityOrder`, the sub column re-orders by priority (FLIP, 600ms), and a priority details button sits above the sub column.
- **Phone:** the columns become rows, top to bottom.

**Tests:**
- Subs render in the subs region.
- After `priority`, `[data-rank]` follows `priorityOrder`, and the DOM order matches.
- `solution:i` sits in the same row as `sub:i` (`data-row`).
- The integrated circle appears only with `integrated`.

### Task 13: Analogical reasoning renderer (`render/analogical-reasoning.ts`, `createAnalogicalReasoningView`, prefix `ps-analogy`)

**Book:** `.ps-book/analogical-reasoning.png`.
- Main chain: a red "Source problem" box leads to a yellow "Target problem" box (with "Expand" above it and a two-way arrow), then on to "Match", "Filter" and a blue circle "Problem solved?".
- On Yes, the chain reaches a blue "Retain" box. On No, a loop runs through "Revise", then "Search", and back to "Target problem".

**Build:**
- **Flow diagram:** fixed station positions laid out like the book, in an SVG with HTML station buttons on top. Stations are "Source", "Analogue" (the book's target), "Match", "Filter", "Solved?", "Retain", "Revise" and "Search". Use "Analogue" as the visible label for the target station. Its meta still says "Target" to keep the book's vocabulary for people who know it.
- **Station states:**
  - A station lights (filled in its book colour) when its slot for the current round is placed:
    - Source: the `source` node.
    - Analogue: the current `target:r`.
    - Match: at least one rule in the round, with a count badge.
    - Filter: `filtered:r`.
    - Solved?: `assess:r`, showing ✓ or ✕ by tag.
    - Retain: the `retain` node.
  - Revise and Search light when an `assess` is unsolved and the next target has not been placed yet.
- **Loop:** a small marker travels along the No loop over 900ms when a round ends unsolved.
- **Round tabs:** "Round 1 / 2 / 3" tabs above the diagram switch which round's nodes the stations show, defaulting to the newest round.
- **Details:** each station's button opens details for its node(s). Match lists every rule title in the round.
- **Phone:** the stations form a vertical chain with the loop drawn on the right.

**Tests:**
- Source lights with `source`.
- Match shows a count of 2 after two rules.
- An unsolved assess lights Revise and Search.
- Round tabs appear when there are two targets, and selecting round 1 shows round 1's analogue title.
- Retain lights only after `retain`.

### Task 14: Solution tree renderer (`render/solution-tree.ts`, `createSolutionTreeView`, prefix `ps-soltree`)

**Book:** `.ps-book/solution-tree.png`. A large blue upward triangle "Solution" at the bottom centre, then a fan of small red "How" triangles from its apex, then yellow "How" triangles further out, then blue "How" triangles outermost, all radiating upward like a fan.

**Build:**
- **Aim:** the aim is the big blue triangle at the base.
- **Positions:** use `levels` and `childrenOf` from `hierarchy.mjs` with aim and how. Each how is placed on a fan arc above its parent: level 2 red, level 3 yellow, level 4+ blue. Angles are partitioned by leaf count across the upper half-plane (−160° to −20°). Each triangle points away from the base along its radial angle; rotate an inner wrapper, not an SVG transform attribute.
- **Labels:** each triangle is a button showing its title. Small triangles show the title beside the shape.
- **Motion:** new hows grow out from their parent's tip, and siblings re-spread with a glide.
- **Phone:** the fan narrows (−150° to −30°) and labels move to a list under the chart, with the triangles numbered and the numbers matching the list.

**Tests:**
- The aim is `data-level="1"`.
- A how with a parent how is `data-level="3"` and carries the yellow class.
- Existing elements are identical after adding a how.
- On a narrow container the label list exists (use a `data-compact` attribute set by a ResizeObserver; in tests, call the exposed `layout(width)` method to set compact).

### Task 15: Lotus blossom renderer (`render/lotus-blossom.ts`, `createLotusBlossomView`, prefix `ps-lotus`)

**Book:** `.ps-book/lotus-blossom.png`.
- Centre: a red "Problem" disc ringed by eight yellow "Solution" petals.
- Around that, eight blue flowers, each with a yellow solution at its centre and eight blue "Idea" petals.
- Flower positions match the petals' directions.

**Build (SVG layout plus HTML buttons, as in the radial tree):**
- **Centre flower:** the red centre and up to eight yellow petals, at the angles 0°, 45° and so on, starting at the top. Petals unfold (scale and rotate in) as solutions arrive.
- **Outer flowers:** an outer flower appears for a solution once it has at least one idea. It is placed outward along that petal's direction, with its idea petals around a small yellow centre echoing the solution title. Ideas attach by their `petal` edge.
- **Orphan ideas:** ideas without a petal edge (possible from older data) are listed in an "Unplaced ideas" row under the chart.
- **Zoom:**
  - Overview by default: idea petals show as small dots only.
  - Tapping an outer flower (or its solution petal) zooms the view into that flower over 520ms, using a CSS transform on an inner wrapper. Its idea petals are then legible buttons with titles.
  - A "Back to the whole blossom" button zooms out. Escape also zooms out.
  - Only one flower is zoomed at a time. Zoom resets on reduced motion without animating.
- **Preferred:** preferred ideas get an ink ring. Each `preferred` node is a small card listed under the chart, naming the idea, with a details button; hovering a card highlights its idea.
- **Phone:** the same structure; the overview fits the width and zoom is the way to read ideas.

**Tests:**
- Eight solutions create eight `[data-petal]`.
- An idea linked to solution 3 renders inside `[data-flower="<solution 3 id>"]`.
- Ideas with no petal edge appear in `.ps-lotus__orphans`.
- Clicking a flower sets `data-zoom` to that flower id, and Back clears it.
- A preferred mark adds `.is-preferred` to the idea.

### Task 16: Duncker diagram renderer (`render/duncker.ts`, `createDunckerView`, prefix `ps-duncker`)

**Book:** `.ps-book/duncker-diagram.png`.
- Top: a red "Problem" box, with the label "What to do" beneath it.
- Two yellow boxes: "Make it OK not to achieve desired state" (left) and "Path to desired state" (right).
- Under them: "How to do it / Pathways" (Path 1 and Path 2 under each), then "Specific solutions" rows.
- Bottom: a yellow "New problem definition" box on the left and a wide blue "Desired state" box on the right.
- Thin bracket connectors join each parent to its children.

**Build:**
- **Fixed rows:** problem (top); then two family boxes, "Accept or redefine" on the left (opposite) and "Reach the desired state" on the right (direct), using our own wording. The families appear once any pathway of that tag exists.
- **Pathways and solutions:** pathways sit under their family, and solutions under their pathway (via `under` edges).
- **Bottom row:** redefinition (yellow, left) and desired (blue, right). `desired` is placed second in the tool, but it sits at the bottom as in the book.
- **Connectors:** bracket connectors in an SVG overlay, drawn top-down with stroke-dashoffset.
- **Evaluation:** a card under the diagram.
- **Phone:** the two families stack (opposite first, then direct), each with its pathways and solutions indented beneath.

**Tests:**
- A direct pathway sits under `[data-family="direct"]` and an opposite pathway under `"opposite"`.
- A solution sits inside its pathway's group.
- The desired box is in `[data-region="bottom"]`.
- Families appear only once a pathway with that tag exists.
- A redefinition appears bottom left.

### Task 17: Contradiction renderer (`render/contradiction.ts`, `createContradictionView`, prefix `ps-contra`)

There is no book chart; use the contradiction emblem's idea.
- Two large shapes side by side: a blue upward triangle (improving) and a red downward triangle (worsening), each appearing with its node. The triangle rises or drops into place.
- A thin double-headed "tension" line connects them once both exist.
- The `statement` renders below as a composed card with the full text and a 3px red top border, like Problem statement's card.
- **Phone:** the triangles stay side by side and scale down.

**Tests:**
- The improving shape is in `[data-region="improving"]`.
- The tension line appears only when both nodes exist.
- The statement card shows the full text.

---

### Task 18: Scripted coach supplies tags and links; browser walk into Analyse

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/scripted-coach.mjs`, `apps/tasks/tests/browser/problem-solver.spec.mjs`
- Test: `tests/unit/problem-solver-scripted.test.js`

- [ ] **Step 1: Failing test.** In a seven_step session moved on into Analyse (with a learning turn after the boundary), the scripted coach suggests `causal_map` (Plan 3's opening suggestion). Accepting it, then saying the problem and three long causes, places `problem`, `cause:1`, `cause:2` and `cause:3`. Then saying `link: cause 1 to problem, plus` places an edge of kind `plus`.

- [ ] **Step 2: Implement in the scripted coach** (deterministic, local dev and tests only):
  - When the open slot has `nodeTags`, use its first tag.
  - When the tool has `validateNode`, satisfy it simply:
    - an idea links to the first solution with room;
    - a solution in duncker goes under the most recent pathway;
    - a preferred note marks the most recent idea;
    - a priority uses `1, 2, …`.
  - Parse `link: <slot words> to <slot words>, <kind>`. Map words like "cause 1" to `cause:1` and "problem" to `problem`. Return a clarify turn with no node and that edge in `edges`. The session applies edges only with an accepted node, so instead return `verdict: 'accept'` with `node: null` and `edges: [edge]`.
  - Then update `applyCoachTurn`: when the verdict is accept, there is no node and there are edges, add the allowed edges to the active run. Test that path in `problem-solver-session.test.js`:

```js
test('an accepted turn with links and no node adds the links to the active run', () => {
  let s = framed('seven_step', 'problem_tree');
  for (const [slot, text] of [['trunk', 't'], ['cause:1', 'c'], ['effect:1', 'e']]) s = applyCoachTurn(s, coach({ node: { slot, text } }), deps);
  s = applyCoachTurn(s, coach({ node: null, edges: [{ from: 'cause:1', to: 'effect:1', kind: 'relates' }] }), deps);
  assert.equal(activeRun(s).edges.length, 1);
});
```

  - In `coach.mjs` `fitToRun`, allow the same case: an accept with no node but with edges is fitted by checking each edge with `canEdge` on the current run and keeping only the allowed ones.
  - Add to the RUBRIC GATEKEEPING: `- To add links between nodes already placed, reply accept with node null and the links in "edges".`

- [ ] **Step 3: Browser walk.** Extend the spec after the Define part:
  - after the learning turn, the Analyse suggestion card reads "Next: Causal map";
  - start it, answer the problem and three causes, then `link: cause 1 to problem, plus`;
  - the causal map shows four shapes and one `[data-edge]`;
  - repeat at 390px.

  Run it with the throwaway config at `scratchpad/ps-playwright.config.mjs`. Do not commit it.

- [ ] **Step 4: Commit**: `Problem Solver: scripted coach and walk cover Analyse` (with trailer).

---

### Task 19: Gate

- [ ] Run all root Problem Solver tests, all Tasks Problem Solver tests, the type gate, `npm run pre-pr-check` (exit 0) and the browser walk at both widths.
- [ ] Render every new sample at 900 and 390 and look at them all once more as a set: consistent type sizes, palette and motion feel across tools.
- [ ] Commit any fixes: `Problem Solver: Analyse and Devise polish`.

## Done when

- The 11 Analyse and Devise tools and the TRIZ contradiction tool each have a definition, an emblem matching the book (checkpoint sent to Adam), and a renderer that matches its book chart, animates as answers are accepted, works at 390px and passes its tests.
- The coach can suggest only these tools in their steps, and sees their selection guides, failure modes and step triggers.
- Tags and node checks make the coach repair bad placements.
- The scripted coach and the browser walk reach a causal map in Analyse.
- All gates pass.
