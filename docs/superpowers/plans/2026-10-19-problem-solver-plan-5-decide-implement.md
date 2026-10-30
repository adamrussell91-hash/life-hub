# Problem Solver Plan 5: Decide and Implement tools, diagrams and real Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the four Decide tools and four Implement tools (definitions, coach knowledge, emblems and animated book-faithful diagrams), and connect Implement to the Tasks hub: the coach proposes real tasks, the person confirms each on a card before anything is created, a dated Review task is proposed at the end of Implement, and linked tasks show their live status on the Kanban and a Problem Solver chip on their page.

**Architecture:** Each tool is a pure definition in `packages/problem-solver/tools/`, registered in the tool index and so available to the step engine (Plan 3). Two small generic hooks come first: `taskSlots` (which nodes may become tasks) and `scoreLine` (a one-line summary of computed scores for the coach). Every Decide tool ends with a `choice` slot (the chosen option), added by one shared wrapper, `withChoice`; Implement reads the latest choice as its aim. The session gains `proposedTasks`, `reviewProposal` and `reviewTaskId` and four actions; the server records proposals and confirmations but never writes Tasks. The page creates tasks through the existing `tasksApi.createTask` and then posts `confirm_task`. Each diagram is a renderer in `packages/problem-solver/render/` following the v1 contract plus the addendum below, registered in the canvas and the preview harness.

**Tech Stack:** Plain ESM with JSDoc (tools, machine, server), TypeScript renderers and page code (Vite, Tasks app), Web Animations API, `node:test` for root tests, Vitest + happy-dom for renderer and page tests, the preview harness (`scripts/problem-solver-preview.mjs`) with a new `--audit` pass for visual QA, Playwright on the Tasks mock API for the walk.

**Spec:** `docs/superpowers/specs/2026-10-19-problem-solver-full-process-design.md` (Tool catalogue → Decide and Implement; Experience 5–6; Diagrams; Emblems; Coach knowledge; Tasks hub writes; Errors). Builds on Plan 3 (`docs/superpowers/plans/2026-10-19-problem-solver-plan-3-step-engine.md`) and Plan 4 (`docs/superpowers/plans/2026-10-19-problem-solver-plan-4-analyse-devise.md`), both done.

**Worktree:** `/Users/you/Projects/life-hub-ps-process` (branch `claude/problem-solver-process`). Run every command from there. Never touch `/Users/you/Projects/life-hub`.

**Book references (local only, never commit):** the chart pages for every tool in this plan are rendered in `/Users/you/Projects/life-hub-ps-process/.ps-book/` (git-excluded). They are `decision-matrix.png` (p.105), `swot.png` (p.107), `morphological.png` (p.111), `pareto.png` (p.115), `pareto-summary.png` (p.113), `dmaic.png` (p.121), `fifteen-percent.png` (p.123), `kanban.png` (p.127) and `eisenhower.png` (p.129), plus `decide-intro.png`, `implement-intro.png`, `implement-intro-2.png` and `emblem-sheet.png`. If any is missing, re-render it from `~/Downloads/scan_adam.russell_2026-10-19-11-19-09.pdf`: scan page *k* holds book pages 2k+98 and 2k+99, so `pdftoppm -f <k> -l <k> -r 150 -png -singlefile <pdf> <name>`, then `sips -r 90 <name>.png`, then crop the right-hand page with `sips -c 1240 877 --cropOffset 0 877 <name>.png`. Open the image with the Read tool before building a tool's emblem or renderer. Shapes, proportions, layout and palette must match the book. **Where this plan's text and the book picture disagree, follow the picture** (Plan 4's text was wrong several times). The book's wording must not be copied into the repo (it is public): write labels, prompts and synthesis questions in our own words. Short generic headings the book uses ("Criteria", "Weight", "Rating", "Score", "Total", "Option", "Goal", "Internal", "External", "Strengths", "Weaknesses", "Opportunities", "Threats", "Subject", "Attribute", "Define", "Measure", "Analyse", "Improve", "Control", "What", "Now", "Go", "To do", "Doing", "Review", "Done", "Urgent", "Not urgent", "Important", "Not important", "Do first", "Schedule", "Delegate", "Eliminate") are ordinary words and may be used.

**Commands used throughout:**

- One root test file: `node --import ./scripts/test-network-guard.mjs --test tests/unit/<file>.test.js`
- All root Problem Solver tests: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-*.test.js`
- One Tasks test file: `cd apps/tasks && npx vitest run tests/unit/<file>.test.ts`
- All Tasks Problem Solver tests: `cd apps/tasks && npx vitest run tests/unit/problem-solver`
- Type gate (the Tasks app has about 125 unrelated pre-existing errors): `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep "error TS" | grep -v TS6059 | grep -i -E "problem-solver|page-editor"` must print nothing.
- Preview with audit: `PS_PREVIEW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/problem-solver-preview.mjs <tool> "$PS_SCRATCH/preview" --audit`, where `$PS_SCRATCH` is the executing session's scratchpad directory. The audit must print `audit: clean` at every width.

---

## Execution notes (read first)

- **One PR for the whole build.** This plan adds commits to `claude/problem-solver-process`; it does not push or open a PR. The PR is opened once, when the last plan is done. Each task ends in one commit with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Review weight follows complexity.** The full build, review and fix loop was too slow in Plan 4, so:
  - **Full review** (spec-compliance reviewer, then code-quality reviewer, then fixes): Task 7 (session proposals), Task 9 (Tasks bridge and confirm cards), Task 11 (decision matrix), Task 13 (morphological), Task 14 (Pareto), Task 17 (Kanban).
  - **Single controller check** (the controller reads the diff, runs the task's tests, looks at both preview PNGs next to the book page and reads the audit output; no reviewer subagents): every other task.
- **Human checkpoint:** Task 5 (emblems). Renderer tasks may proceed while Adam looks.
- **Adam's decisions** on the points the spec left open are listed under "Decisions" at the end. The plan is written to them.

---

## File map

| File | Responsibility | Change |
| --- | --- | --- |
| `packages/problem-solver/machine.mjs` | `canPropose(run, node)` | Modify |
| `packages/problem-solver/steps.mjs` | `planStepForBook(modelId, book)`, `chosenOption(session)` | Modify |
| `packages/problem-solver/tools/choice.mjs` | `withChoice`: the chosen-option slot every Decide tool ends with | Create |
| `packages/problem-solver/tools/{decision-matrix,swot,morphological,pareto}.mjs` | Decide tools | Create |
| `packages/problem-solver/tools/{dmaic,fifteen-percent,kanban,eisenhower}.mjs` | Implement tools | Create |
| `packages/problem-solver/tools/index.mjs` | Register 8 tools | Modify |
| `packages/problem-solver/types.ts` | Tool ids, proposal and review types, `PsTaskLink`, actions | Modify |
| `packages/problem-solver/glyphs/tools/*.svg`, `packages/problem-solver/glyphs.ts` | 8 emblems | Create / Modify |
| `netlify/functions/_shared/problem-solver/coach-schema.mjs` | `proposeTasks`, `proposeReview` | Modify |
| `netlify/functions/_shared/problem-solver/coach.mjs` | Fit proposal slots; drop proposals at boundaries | Modify |
| `netlify/functions/_shared/problem-solver/session.mjs` | Proposals, review proposal, four actions, summary row ids | Modify |
| `netlify/functions/_shared/problem-solver/migrate.mjs` | Default the new fields on read | Modify |
| `netlify/functions/_shared/problem-solver/service.mjs` | Four actions, `linked(owner, ref)` | Modify |
| `netlify/functions/problem-solver.mjs` | `GET ?linked=task:<id>` | Modify |
| `netlify/functions/_shared/problem-solver/prompts.mjs` | Score lines, task lines, TODAY, rubric fields | Modify |
| `netlify/functions/_shared/problem-solver/knowledge/{selection,triggers}.mjs` | Decide and Implement guides and triggers | Modify |
| `netlify/functions/_shared/problem-solver/scripted-coach.mjs` | Slot hints, proposals, tags and links for the new tools | Modify |
| `apps/tasks/scripts/mock-api.ts` | `GET /api/problem-solver?linked=` | Modify |
| `apps/tasks/src/views/problem-solver/api.ts` | `actWith`, `linked` | Modify |
| `apps/tasks/src/views/problem-solver/task-bridge.ts` | Task bodies, create-then-confirm, live statuses | Create |
| `apps/tasks/src/views/problem-solver/task-cards.ts` | Confirm cards for tasks and the review | Create |
| `apps/tasks/src/views/problem-solver/coach-panel.ts` | A stable slot for the cards | Modify |
| `apps/tasks/src/views/problem-solver/canvas.ts` | Register renderers; forward task links to views | Modify |
| `apps/tasks/src/views/problem-solver/view.ts` | Wire bridge, cards, statuses, resume banner | Modify |
| `apps/tasks/src/views/problem-solver/link-chips.ts` | Problem Solver chip on linked task and project pages | Create |
| `apps/tasks/src/views/page-editor.ts` | Mount the chip in `paintTaskPage` and `paintProjectPage` | Modify |
| `packages/problem-solver/render/{decision-matrix,swot,morphological,pareto,dmaic,fifteen-percent,kanban,eisenhower}.ts` | Diagrams | Create |
| `packages/problem-solver/problem-solver.css` | One commented section per new diagram, plus the task cards and chip | Modify |
| `scripts/problem-solver-audit.mjs` | In-page audit for the Plan 4 lessons | Create |
| `scripts/problem-solver-preview.mjs`, `scripts/problem-solver-preview-samples.mjs` | `--audit`, renderer registry, samples | Modify |
| `apps/tasks/tests/browser/problem-solver.spec.mjs` | Walk into Decide and Implement with confirm cards | Modify |

---

## Shared renderer contract (every diagram task)

Plan 4's "Shared renderer contract" applies unchanged: read it in `docs/superpowers/plans/2026-10-19-problem-solver-plan-4-analyse-devise.md` (API, nothing before acceptance, palette, text in shapes, details, contested, links, motion, layout, accessibility, classes, registration, tests with the five baseline tests and helpers, visual QA, commit). Also read `packages/problem-solver/render/force-field.ts` (score form, morph, `destroy`) and `packages/problem-solver/render/duncker.ts` (named container, focus ring, connectors) before building any renderer here.

### Addendum: lessons from the Plan 4 reviews

Every renderer in this plan must meet all of these. Each renderer task's tests include the items marked **(test)**; the `--audit` pass checks the items marked **(audit)**.

1. **Text stays inside its shape at 390px.** Every shape wrapper carries `data-shape` and `data-fill="red|yellow|blue|paper|ink|card"` (the fill token behind its text). No text element inside a `[data-shape]` may cross that shape's box at 390px or 900px. Clamp titles with `-webkit-line-clamp` in container units rather than letting them spill. **(audit)**
2. **Minimum sizes.** Titles 12px, meta 10px, tags 9px, after container scaling. Name classes `__title`, `__meta` and `__tag` so the audit can find them. **(audit)**
3. **One named container per renderer.** The root sets `container: <prefix> / inline-size` (for example `container: matrix / inline-size`), and every phone rule is written `@container <prefix> (max-width: …)`. Never use an unnamed `@container`, so a query never measures a different box. **(test: the CSS section for the prefix contains no `@container (` without the name; a Vitest reads `problem-solver.css` as text and checks it.)**
4. **Focus and open ring.** The ring is the paper-and-ink double ring: `box-shadow: 0 0 0 2px var(--ps-paper), 0 0 0 3.5px var(--ps-ink)` on rectangular shapes. A shape cut with `clip-path` cannot show a box-shadow, so use a layered ring (a sibling element with the same clip-path, scaled up, in ink under paper) or an SVG stroke. The focused or open item is raised (`z-index`) with `:has(:focus-visible)` and `:has(.is-open)` on the item, so no neighbour covers the ring.
5. **Contrast computed, not guessed.** Meta text runs at full opacity wherever opacity .78 would fall below 4.5:1 against its fill (it does on yellow with `--ps-on-yellow` only at full opacity, and on red at .78 for 10px text; compute each pair). Hover and open states must not lower contrast (no opacity drop, no lighter fill under white text). **(audit, including a hover pass)**
6. **Motion only on change.** A rAF loop or animation runs only when something changed, never every frame at rest. Cancel any in-flight animation on the element first (`cancelAnimations` from details.ts). Batch all layout reads (`getBoundingClientRect`) before any writes. FLIP moves use measured geometry, comparing rect centres, not top-left corners. **(test: a second identical `update` starts no animation; spy on `Element.prototype.animate`)**
7. **Undo removes whole families.** When a node disappears from the run (undo, another device), its element goes, and so do its tabs, links, cards, chips, satellites and any child shapes that hang from it. **(test)**
8. **No animation on first render of a saved run.** The first `update` of a view draws the run's current state without entrance animations, number count-ups or line draw-ins. Only later updates animate. **(test)**
9. **No orphaned details.** A details card is never left open when its button has gone or is hidden (a pager, tab or zoom change closes it first). **(test)**
10. **Escape goes innermost first.** A renderer's own Escape handler (closing a zoom, a form or a pager) calls `event.stopPropagation()` only when it handled the key, and runs before `createDisclosureGroup`'s handler only when its element is the innermost open thing.
11. **`syncContested` for existing nodes.** Every update calls `syncContested(item, node, tagHost, button)` for nodes that already exist, so a state change after creation updates the tag and aria label. **(test)**
12. **`destroy()`** is required on any view with a ResizeObserver, MutationObserver, rAF loop, timer or document listener. The canvas already calls it. **(test: after `destroy()`, a resize callback or keydown does nothing)**
13. **Codes and a key.** Where phone shapes would be too small to carry a name, give each shape a short code (A, B, C or 1, 2, 3) and show a key list under the chart pairing each code with its title. The key items are the 44px targets.
14. **44px targets** for every button, or an explicit equivalent control: a small mark may be smaller than 44px only when a 44px control for the same node exists nearby (a key item, a list row). Mark such small marks with `data-target-ok`. **(audit)**
15. **Follow the picture.** Each task's "Book" text is a guide; the image decides.

Add to the five baseline tests (Plan 4) these three in every renderer test file: (6) a second identical update calls `animate` zero times; (7) the first update of a run that already has nodes and scores calls `animate` zero times; (8) removing a node removes every element carrying its id (`[data-node="<id>"]`, `[data-for="<id>"]`, `[data-edge*="<id>"]`).

---

### Task 1: Generic hooks: task slots and score lines

**Files:**
- Modify: `packages/problem-solver/machine.mjs`, `netlify/functions/_shared/problem-solver/prompts.mjs`
- Test: `tests/unit/problem-solver-machine.test.js`, `tests/unit/problem-solver-prompts.test.js`

Two optional fields on a tool definition:
- `taskSlots: { [slotName]: (node, run) => boolean }` says which placed nodes may become real tasks.
- `scoreLine(run) => string | null` summarises the computed results of the latest score snapshot for the coach (totals, ranks, the vital few), because the coach must never compute numbers itself.

- [ ] **Step 1: Failing tests**

Append to `tests/unit/problem-solver-machine.test.js` (merge imports into the top block):

```js
import { canPropose } from '../../packages/problem-solver/machine.mjs';

test('canPropose follows the tool\'s taskSlots and is false without them', () => {
  REGISTRY.fake_tasks = {
    id: 'fake_tasks', name: 'Fake', kind: 'plan', step: 'implement', when: 'w', failureModes: ['a', 'b'], steps: [], edgeKinds: [],
    slots: { card: 'A card', note: 'A note' },
    taskSlots: { card: (node) => node.tag !== 'done' },
    nextSlots: () => ['card:1', 'note'], complete: () => false
  };
  try {
    const run = { id: 'r', tool: 'fake_tasks', status: 'active', nodes: [], edges: [] };
    assert.equal(canPropose(run, { slot: 'card:1', text: 'x', tag: 'todo' }), true);
    assert.equal(canPropose(run, { slot: 'card:2', text: 'x', tag: 'done' }), false);
    assert.equal(canPropose(run, { slot: 'note', text: 'x' }), false);
    assert.equal(canPropose({ ...run, tool: 'five_whys' }, { slot: 'why:1', text: 'x' }), false);
  } finally {
    delete REGISTRY.fake_tasks;
  }
});
```

Append to `tests/unit/problem-solver-prompts.test.js`:

```js
test('a tool\'s scoreLine shows under its run and in earlier steps', async () => {
  const { TOOLS: T } = await import('../../packages/problem-solver/tools/index.mjs');
  T.fake_scored = { id: 'fake_scored', name: 'Fake scored', kind: 'decision', step: 'define', when: 'w', failureModes: ['a', 'b'], steps: [{ id: 's', title: 'S', prompt: 'p' }], edgeKinds: [], slots: { item: 'An item' }, nextSlots: () => ['item:1'], complete: () => true, scoreLine: () => 'Totals: A 7.2 (leading), B 6.8' };
  try {
    let s = inTool('five_whys');
    s = { ...s, steps: { define: { ...s.steps.define, runs: [{ id: 'f', tool: 'fake_scored', status: 'active', nodes: [{ id: 'n', slot: 'item:1', text: 'Thing', state: 'accepted', skills: [], turnId: 't' }], edges: [] }] } } };
    assert.match(buildCoachPrompt(s).user, /Scores: Totals: A 7\.2 \(leading\), B 6\.8/);
    const moved = moveOn(s, deps);
    assert.match(buildCoachPrompt(moved).user, /EARLIER STEPS:[\s\S]*Totals: A 7\.2/);
  } finally {
    delete T.fake_scored;
  }
});
```

- [ ] **Step 2: Run, expect FAIL** (no `canPropose`; no score line).

- [ ] **Step 3: Implement**

In `machine.mjs`:

```js
/** True when the tool lets this placed node become a real task (its `taskSlots` test passes). */
export function canPropose(run, node) {
  const test = toolDef(run.tool).taskSlots?.[parseSlot(node.slot)?.name];
  return typeof test === 'function' ? Boolean(test(node, run)) : false;
}
```

In `prompts.mjs`:
- `runLines`: after the `Waiting on` line add `...(def.scoreLine?.(run) ? [`Scores: ${def.scoreLine(run)}`] : []),`.
- `earlierSteps`: after each run's node list append `; ${TOOLS[run.tool].scoreLine?.(run) ?? ''}` only when the line is non-empty. Write it as a helper:

```js
const scoreNote = (run) => {
  const line = TOOLS[run.tool].scoreLine?.(run);
  return line ? `; ${line}` : '';
};
```

and use `${run.nodes.map(...).join(' | ')}${scoreNote(run)}` in both `earlierSteps` and the "Earlier tool in this step" line.

- [ ] **Step 4: Run all root Problem Solver tests. Expect PASS.**

- [ ] **Step 5: Commit**: `Problem Solver: task slots and score lines` (with trailer).

---

### Task 2: Preview audit for the renderer lessons

**Files:**
- Create: `scripts/problem-solver-audit.mjs`
- Modify: `scripts/problem-solver-preview.mjs`

The audit runs inside the preview page after render, and again while hovering each shape button. It prints every problem and ends with `audit: clean` or `audit: N problems`. It is a QA aid, not a CI test.

- [ ] **Step 1: Create the audit**

```js
// scripts/problem-solver-audit.mjs
/**
 * Runs in the preview page (serialised with Function.prototype.toString, so it must be
 * self-contained). Checks the renderer lessons: text inside its [data-shape], minimum
 * sizes, contrast against the shape's data-fill token, and 44px targets.
 * `scope` limits the text checks to one subtree (used for the hover pass).
 */
export function auditChart(scope = null) {
  const root = document.querySelector('#mount > *');
  const problems = [];
  const label = (el) => `${el.className?.baseVal ?? el.className} "${(el.textContent ?? '').trim().slice(0, 30)}"`;
  const probe = document.createElement('i');
  probe.style.cssText = 'position:absolute;width:0;height:0';
  root.append(probe);
  const rgba = (s) => {
    const m = String(s).match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0];
    return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 };
  };
  const token = (name) => {
    probe.style.background = `var(--ps-${name})`;
    return rgba(getComputedStyle(probe).backgroundColor);
  };
  const lum = ({ r, g, b }) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const minimum = (el) => {
    const cls = String(el.className?.baseVal ?? el.className);
    if (/__title/.test(cls)) return 12;
    if (/__meta/.test(cls)) return 10;
    return 9;
  };
  const texts = [...(scope ?? root).querySelectorAll('*')].filter(
    (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.getClientRects().length && !el.closest('.sr-only')
  );
  for (const el of texts) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minimum(el)) problems.push(`font ${size}px below ${minimum(el)}px: ${label(el)}`);
    const shape = el.closest('[data-shape]');
    if (!shape) continue;
    const a = el.getBoundingClientRect();
    const b = shape.getBoundingClientRect();
    if (a.left < b.left - 0.5 || a.right > b.right + 0.5 || a.top < b.top - 0.5 || a.bottom > b.bottom + 0.5) problems.push(`text crosses its shape: ${label(el)}`);
    const fill = shape.getAttribute('data-fill');
    if (!fill) continue;
    const bg = token(fill);
    const fg = rgba(getComputedStyle(el).color);
    const alpha = fg.a * opacityOf(el);
    const mix = { r: fg.r * alpha + bg.r * (1 - alpha), g: fg.g * alpha + bg.g * (1 - alpha), b: fg.b * alpha + bg.b * (1 - alpha) };
    const [hi, lo] = [lum(mix), lum(bg)].sort((x, y) => y - x);
    const ratio = (hi + 0.05) / (lo + 0.05);
    if (ratio < 4.5) problems.push(`contrast ${ratio.toFixed(2)}:1 on ${fill}: ${label(el)}`);
  }
  if (!scope) {
    for (const el of root.querySelectorAll('button, a[href], [role="button"], [role="tab"]')) {
      const r = el.getBoundingClientRect();
      if (!r.width || el.closest('[data-target-ok]')) continue;
      if (r.width < 44 || r.height < 44) problems.push(`target ${Math.round(r.width)}x${Math.round(r.height)} under 44px: ${label(el)}`);
    }
  }
  probe.remove();
  return problems;
}
```

- [ ] **Step 2: Wire `--audit` into the preview.** Parse the flag like `--next`. After the screenshot at each width, when auditing:

```js
if (audit) {
  const { auditChart } = await import('./problem-solver-audit.mjs');
  const source = `(${auditChart.toString()})`;
  const found = await tab.evaluate((src) => eval(src)(), source);
  const shapes = await tab.$$('[data-shape] button, button[data-shape]');
  for (const shape of shapes.slice(0, 16)) {
    await shape.hover();
    await tab.waitForTimeout(80);
    found.push(...(await tab.evaluate(([src, el]) => eval(src)(el.closest('[data-shape]') ?? el), [source, shape])).map((p) => `hover: ${p}`));
  }
  console.log(found.length ? `audit at ${width}px: ${found.length} problems\n  ${found.join('\n  ')}` : `audit at ${width}px: clean`);
}
```

Add `--audit` to the usage comment and message.

- [ ] **Step 3: Check it runs** on an existing renderer: `node scripts/problem-solver-preview.mjs duncker "$PS_SCRATCH/preview" --audit`. It will report problems on Plan 4 renderers that do not yet carry `data-shape`/`data-fill`; that is expected (text checks skip unmarked shapes, target checks still run). Do not fix Plan 4 renderers here.

- [ ] **Step 4: Commit**: `Problem Solver: preview audit for renderer lessons` (with trailer).

---

### Task 3: The four Decide tools

**Files:**
- Create: `packages/problem-solver/tools/choice.mjs`, `decision-matrix.mjs`, `swot.mjs`, `morphological.mjs`, `pareto.mjs`
- Modify: `packages/problem-solver/tools/index.mjs`, `packages/problem-solver/types.ts`, `packages/problem-solver/glyphs.ts` (temporary `Partial`, as Plan 4 Task 2 did)
- Test: `tests/unit/problem-solver-decide-tools.test.js`

**The chosen option (Adam's decision: both).** Decide ends with an explicit chosen option, *and* the coach names the leading option in conversation and confirms it as the Implement aim. The slot lives on each Decide tool as its final slot, `choice`, added by one wrapper so the rule is written once:
- `choice` opens once the tool's own minimum is met (a scored matrix; a full SWOT option and the synthesis; an evaluated morphological scenario; Pareto with data);
- the tool's other slots stay open after it, so a rescore or a new item is still possible;
- the tool is complete only when its own minimum is met *and* `choice` is placed, so Decide is `done` only with a chosen option;
- in Polya, whose Devise step uses both Devise and Decide tools, the same applies to the Decide tools there.

A step-level node was considered and rejected: it would need its own placement path, record rendering and migration, while a final slot reuses the machine, the coach's slot contract, contested handling and the renderers.

- [ ] **Step 1: Failing tests**

```js
// tests/unit/problem-solver-decide-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, applyScores, canEdge, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { matrixTotals } from '../../packages/problem-solver/tools/decision-matrix.mjs';
import { quadrantsOf } from '../../packages/problem-solver/tools/swot.mjs';
import { consistent } from '../../packages/problem-solver/tools/morphological.mjs';
import { paretoRows } from '../../packages/problem-solver/tools/pareto.mjs';
import { CHOICE_SLOT } from '../../packages/problem-solver/tools/choice.mjs';

let n = 0;
const put = (run, slot, extra = {}) => placeNode(run, { id: `c${(n += 1)}`, slot, text: slot, title: slot, state: 'accepted', ...extra });
const idOf = (run, slot) => run.nodes.find((x) => x.slot === slot).id;
const link = (run, from, to, kind) => addEdge(run, { from: idOf(run, from), to: idOf(run, to), kind });

test('decide step lists its four tools in order', () => {
  assert.deepEqual(toolsForBookStep('decide'), ['decision_matrix', 'swot', 'morphological', 'pareto']);
});

test('every Decide tool, and only Decide tools, end with the choice slot and a Choose step', () => {
  for (const [id, def] of Object.entries(TOOLS)) {
    const decide = def.step === 'decide';
    assert.equal(CHOICE_SLOT in def.slots, decide, id);
    assert.equal(def.steps.at(-1).id === 'choose', decide, id);
    assert.ok(Object.isFrozen(def), id);
  }
});

test('decision matrix: criteria and options open together; weights and ratings validated; totals and leader', () => {
  let r = newRun('decision_matrix', 'r');
  assert.deepEqual(nextSlots(r), ['criterion:1', 'option:1']);
  for (const s of ['criterion:1', 'criterion:2', 'option:1', 'option:2']) r = put(r, s);
  assert.equal(isComplete(r), false);
  assert.throws(() => applyScores(r, { mode: 'percent', weights: [60, 30], ratings: [[8, 5], [6, 9]] }, 't'), /add up to 100/);
  assert.throws(() => applyScores(r, { mode: 'rank', weights: [2, 2], ratings: [[8, 5], [6, 9]] }, 't'), /each number from 1 to 2/);
  assert.throws(() => applyScores(r, { mode: 'percent', weights: [60, 40], ratings: [[8, 11], [6, 9]] }, 't'), /1 to 10/);
  assert.throws(() => applyScores(r, { mode: 'percent', weights: [60, 40], ratings: [[8, 5]] }, 't'), /every option against every criterion/);
  assert.throws(() => applyScores(r, { mode: 'guess', weights: [60, 40], ratings: [[8, 5], [6, 9]] }, 't'), /percentage weights or ranks/);
  r = applyScores(r, { mode: 'percent', weights: [60, 40], ratings: [[8, 5], [6, 9]] }, 't1');
  assert.deepEqual(matrixTotals(r), { totals: [6.8, 7.2], leader: 1 });
  assert.equal(isComplete(r), false, 'scored, but no option chosen yet');
  assert.deepEqual(nextSlots(r), ['criterion:3', 'option:3', 'choice']);
  assert.match(TOOLS.decision_matrix.scoreLine(r), /option:2 7\.2 \(leading\)/);
  r = put(r, 'choice');
  assert.equal(isComplete(r), true);
  assert.ok(!nextSlots(r).includes('choice'), 'one choice per run');
  assert.ok(nextSlots(r).includes('criterion:3'), 'other slots stay open after the choice');
  r = applyScores(r, { mode: 'rank', weights: [2, 1], ratings: [[8, 5], [6, 9]] }, 't2');
  assert.deepEqual(matrixTotals(r), { totals: [21, 21], leader: null });
  r = put(r, 'criterion:3');
  assert.equal(isComplete(r), false, 'a new criterion needs rescoring');
});

test('swot: goal, options, quadrant items linked to their option, synthesis once one option is full', () => {
  let r = newRun('swot', 'r');
  assert.deepEqual(nextSlots(r), ['goal']);
  r = put(r, 'goal');
  assert.deepEqual(nextSlots(r), ['option:1']);
  r = put(r, 'option:1');
  assert.deepEqual(nextSlots(r), ['option:2', 'strength:1', 'weakness:1', 'opportunity:1', 'threat:1']);
  assert.match(checkNode(r, { slot: 'strength:1', text: 'x' }, []), /Link each strength to the option/);
  assert.equal(checkNode(r, { slot: 'strength:1', text: 'x' }, [{ from: 'strength:1', to: 'option:1', kind: 'of' }]), null);
  for (const q of ['strength', 'weakness', 'opportunity']) {
    r = put(r, `${q}:1`);
    r = link(r, `${q}:1`, 'option:1', 'of');
  }
  assert.ok(!nextSlots(r).includes('synthesis'));
  r = put(r, 'threat:1');
  r = link(r, 'threat:1', 'option:1', 'of');
  assert.equal(quadrantsOf(r, idOf(r, 'option:1')).threat.length, 1);
  assert.equal(canEdge(r, idOf(r, 'threat:1'), idOf(r, 'option:1'), 'of'), false, 'one option per item');
  assert.ok(nextSlots(r).includes('synthesis'));
  r = put(r, 'synthesis');
  assert.equal(isComplete(r), false);
  assert.deepEqual(nextSlots(r), ['choice']);
  r = put(r, 'choice');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), []);
});

test('morphological: subjects with linked attributes; contradictions pair two subjects; scenarios pick one per subject; evaluation after a consistent scenario', () => {
  let r = newRun('morphological', 'r');
  assert.deepEqual(nextSlots(r), ['problem']);
  r = put(r, 'problem');
  assert.deepEqual(nextSlots(r), ['subject:1']);
  r = put(r, 'subject:1');
  assert.deepEqual(nextSlots(r), ['subject:2', 'attribute:1']);
  assert.match(checkNode(r, { slot: 'attribute:1', text: 'x' }, []), /Link each attribute to its subject/);
  let a = 0;
  const attr = (subject) => {
    a += 1;
    r = put(r, `attribute:${a}`);
    r = link(r, `attribute:${a}`, subject, 'of');
  };
  for (const s of ['subject:2', 'subject:3']) r = put(r, s);
  attr('subject:1'); attr('subject:1'); attr('subject:2'); attr('subject:2'); attr('subject:3');
  assert.ok(!nextSlots(r).includes('scenario:1'), 'needs two attributes on every subject');
  attr('subject:3');
  assert.ok(nextSlots(r).includes('scenario:1') && nextSlots(r).includes('contradiction:1'));
  const pair = (x, y) => [{ from: 'contradiction:1', to: x, kind: 'pair' }, { from: 'contradiction:1', to: y, kind: 'pair' }];
  assert.match(checkNode(r, { slot: 'contradiction:1', text: 'x' }, pair('attribute:1', 'attribute:2')), /two attributes that cannot go together, from different subjects/);
  assert.equal(checkNode(r, { slot: 'contradiction:1', text: 'x' }, pair('attribute:1', 'attribute:3')), null);
  r = put(r, 'contradiction:1');
  r = link(r, 'contradiction:1', 'attribute:1', 'pair');
  r = link(r, 'contradiction:1', 'attribute:3', 'pair');
  const picks = (slot, ...targets) => targets.map((to) => ({ from: slot, to, kind: 'picks' }));
  assert.match(checkNode(r, { slot: 'scenario:1', text: 'x' }, picks('scenario:1', 'attribute:1', 'attribute:3')), /one attribute from every subject/);
  assert.match(checkNode(r, { slot: 'scenario:1', text: 'x' }, picks('scenario:1', 'attribute:1', 'attribute:2', 'attribute:5')), /one attribute from every subject/);
  r = put(r, 'scenario:1');
  for (const t of ['attribute:1', 'attribute:3', 'attribute:5']) r = link(r, 'scenario:1', t, 'picks');
  assert.equal(consistent(r, idOf(r, 'scenario:1')), false);
  assert.ok(!nextSlots(r).includes('evaluation'));
  assert.ok(!nextSlots(r).some((s) => s.startsWith('subject')), 'subjects close once a scenario exists');
  r = put(r, 'scenario:2');
  for (const t of ['attribute:2', 'attribute:3', 'attribute:6']) r = link(r, 'scenario:2', t, 'picks');
  assert.equal(consistent(r, idOf(r, 'scenario:2')), true);
  assert.ok(nextSlots(r).includes('evaluation'));
  r = put(r, 'evaluation');
  assert.equal(isComplete(r), false);
  assert.deepEqual(nextSlots(r), ['choice'], 'evaluation closes the grid; only the choice remains');
  r = put(r, 'choice');
  assert.equal(isComplete(r), true);
});

test('pareto: target, items, one figure per item; rows ranked with percent, cumulative and the vital few', () => {
  let r = newRun('pareto', 'r');
  assert.deepEqual(nextSlots(r), ['target']);
  r = put(r, 'target');
  assert.deepEqual(nextSlots(r), ['item:1']);
  for (const s of ['item:1', 'item:2', 'item:3', 'item:4']) r = put(r, s);
  assert.throws(() => applyScores(r, { counts: [5, 3, 2] }, 't'), /one figure per item/);
  assert.throws(() => applyScores(r, { counts: [5, -1, 2, 1] }, 't'), /zero or more/);
  assert.throws(() => applyScores(r, { counts: [0, 0, 0, 0] }, 't'), /at least one item above zero/);
  r = applyScores(r, { counts: [10, 45, 30, 15] }, 't1');
  const rows = paretoRows(r);
  assert.deepEqual(rows.map((x) => x.node.slot), ['item:2', 'item:3', 'item:4', 'item:1']);
  assert.deepEqual(rows.map((x) => x.percent), [45, 30, 15, 10]);
  assert.deepEqual(rows.map((x) => x.cumulative), [45, 75, 90, 100]);
  assert.deepEqual(rows.map((x) => x.vital), [true, true, true, false]);
  assert.equal(isComplete(r), false);
  assert.ok(nextSlots(r).includes('choice'));
  r = put(r, 'choice');
  assert.equal(isComplete(r), true);
  assert.match(TOOLS.pareto.scoreLine(r), /Vital few: item:2, item:3, item:4 \(90%\)/);
  r = put(r, 'item:5');
  assert.equal(isComplete(r), false, 'a new item needs its figure');
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/tools/choice.mjs
import { hasSlot } from '../slots.mjs';

/** The slot every Decide tool ends with: the option carried into Implement as its aim. */
export const CHOICE_SLOT = 'choice';

/**
 * Wraps a Decide tool definition so it ends with the chosen option. `choice` opens once the
 * tool's own minimum is met; the tool's other slots stay open; the tool is complete only
 * with a choice. Returns a frozen definition.
 */
export function withChoice(def) {
  return Object.freeze({
    ...def,
    steps: Object.freeze([...def.steps, { id: 'choose', title: 'Choose', prompt: 'Name the option to carry into Implement, and why, in light of what this tool showed. The coach names the leading option first; the choice is yours.' }]),
    slots: Object.freeze({ ...def.slots, [CHOICE_SLOT]: 'The option chosen to carry into Implement as its aim, and why' }),
    nextSlots(run) {
      const base = def.nextSlots(run);
      return !hasSlot(run, CHOICE_SLOT) && def.complete(run) ? [...base, CHOICE_SLOT] : base;
    },
    complete(run) {
      return def.complete(run) && hasSlot(run, CHOICE_SLOT);
    }
  });
}
```

Each Decide tool below imports `withChoice` from `./choice.mjs` and is written `withChoice({ … })` instead of `Object.freeze({ … })`. Its own `nextSlots` and `complete` describe only the tool's minimum; the wrapper adds the choice. The base definitions never call `this`, so spreading them is safe.

```js
// packages/problem-solver/tools/decision-matrix.mjs
import { countSlots, nextIndexed, open, parseSlot } from '../slots.mjs';
import { withChoice } from './choice.mjs';

const ordered = (run, name) => run.nodes.filter((node) => parseSlot(node.slot)?.name === name).sort((a, b) => parseSlot(a.slot).index - parseSlot(b.slot).index);
const latest = (run) => run.scores?.snapshots?.at(-1) ?? null;
const titleOf = (node) => node.title ?? node.text;

export const criteria = (run) => ordered(run, 'criterion');
export const options = (run) => ordered(run, 'option');

/** True when the latest snapshot covers exactly the criteria and options now placed. */
function scoresCurrent(run) {
  const s = latest(run);
  const nc = countSlots(run, 'criterion');
  return Boolean(s) && s.weights?.length === nc && s.ratings?.length === countSlots(run, 'option') && s.ratings.every((row) => row.length === nc);
}

/**
 * Weighted totals per option from the latest snapshot, or null before scoring.
 * Percentage weights give totals out of 10 (rating x weight / 100); ranks give raw sums.
 * `leader` is the index of the single highest total, or null on a tie.
 */
export function matrixTotals(run) {
  const s = latest(run);
  if (!s) return null;
  const scale = s.mode === 'percent' ? 100 : 1;
  const totals = s.ratings.map((row) => Math.round((row.reduce((sum, rating, i) => sum + rating * (s.weights[i] ?? 0), 0) / scale) * 100) / 100);
  const top = Math.max(...totals);
  return { totals, leader: totals.filter((t) => t === top).length === 1 ? totals.indexOf(top) : null };
}

export const decisionMatrix = withChoice({
  id: 'decision_matrix',
  name: 'Decision matrix',
  kind: 'decision',
  step: 'decide',
  when: 'Several options to compare against several factors that do not matter equally. Weighting the factors and rating each option shows which performs best overall (multiple-criteria decision analysis).',
  failureModes: [
    'Criteria too vague to rate against, such as "good" or "works".',
    'Weights left equal, or not adding to 100, with no reason given.',
    'Ratings that do not match the evidence already stated.',
    'Choosing the winner first and fitting the numbers afterwards.',
    'Treating a narrow lead as decisive.'
  ],
  steps: [
    { id: 'criteria', title: 'Identify the criteria', prompt: 'Name the factors the options will be judged on. Make each one specific, measurable and central to the decision.' },
    { id: 'weights', title: 'Weight the criteria', prompt: 'Give each criterion a weight: percentages that add up to 100, or ranks where the most important gets the highest number.' },
    { id: 'rate', title: 'Rate the options', prompt: 'List the options (carry them over from Devise) and rate each one from 1 to 10 against every criterion.' },
    { id: 'totals', title: 'Total the scores', prompt: 'Multiply each rating by its weight and add them up per option. The highest total performs best; check it against your judgement.' }
  ],
  slots: { criterion: 'A factor the options are judged on, specific and measurable', option: 'An option being compared' },
  edgeKinds: [],
  nextSlots(run) {
    return open(nextIndexed(run, 'criterion', 8), nextIndexed(run, 'option', 6));
  },
  pickScores(payload) {
    return { mode: payload?.mode, weights: payload?.weights, ratings: payload?.ratings };
  },
  validateScores(run, s) {
    const nc = countSlots(run, 'criterion');
    const no = countSlots(run, 'option');
    if (nc < 2 || no < 2) return 'Add at least two criteria and two options before scoring.';
    if (!['percent', 'rank'].includes(s?.mode)) return 'Choose percentage weights or ranks.';
    const w = s.weights;
    if (!Array.isArray(w) || w.length !== nc || !w.every(Number.isInteger)) return 'Give one whole-number weight per criterion.';
    if (s.mode === 'percent' && (w.some((v) => v < 0 || v > 100) || w.reduce((a, b) => a + b, 0) !== 100)) return 'Percentage weights must add up to 100.';
    if (s.mode === 'rank' && [...w].sort((a, b) => a - b).some((v, i) => v !== i + 1)) return `Ranks use each number from 1 to ${nc} once; the most important criterion gets ${nc}.`;
    const r = s.ratings;
    if (!Array.isArray(r) || r.length !== no || !r.every((row) => Array.isArray(row) && row.length === nc)) return 'Rate every option against every criterion.';
    if (!r.flat().every((v) => Number.isInteger(v) && v >= 1 && v <= 10)) return 'Ratings run from 1 to 10.';
    return null;
  },
  awaiting(run) {
    return countSlots(run, 'criterion') >= 2 && countSlots(run, 'option') >= 2 && !scoresCurrent(run)
      ? 'The person weights the criteria and rates each option with the Score the options button; ask them to, and wait.'
      : null;
  },
  scoreLine(run) {
    const result = matrixTotals(run);
    if (!result) return null;
    const s = latest(run);
    const weights = criteria(run).map((node, i) => `${titleOf(node)} ${s.weights[i]}`).join(', ');
    const totals = options(run).map((node, i) => `${node.slot} ${result.totals[i]}${result.leader === i ? ' (leading)' : ''}`).join(', ');
    return `Weights (${s.mode === 'percent' ? 'percent' : 'rank'}): ${weights}. Totals: ${totals}${result.leader === null ? ' (tied at the top)' : ''}.`;
  },
  complete(run) {
    return countSlots(run, 'criterion') >= 2 && countSlots(run, 'option') >= 2 && scoresCurrent(run);
  }
});
```

```js
// packages/problem-solver/tools/swot.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';
import { withChoice } from './choice.mjs';

export const QUADRANTS = Object.freeze(['strength', 'weakness', 'opportunity', 'threat']);
const PER_QUADRANT = 6;
const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;

/** Quadrant items (nodes) for one option id, in placement order. */
export function quadrantsOf(run, optionId) {
  const out = Object.fromEntries(QUADRANTS.map((q) => [q, []]));
  for (const edge of run.edges) {
    if (edge.kind !== 'of' || edge.to !== optionId) continue;
    const node = run.nodes.find((item) => item.id === edge.from);
    const name = parseSlot(node?.slot)?.name;
    if (QUADRANTS.includes(name)) out[name].push(node);
  }
  return out;
}

const fullOption = (run) => run.nodes.some((node) => parseSlot(node.slot)?.name === 'option' && QUADRANTS.every((q) => quadrantsOf(run, node.id)[q].length > 0));

export const swot = withChoice({
  id: 'swot',
  name: 'SWOT analysis',
  kind: 'decision',
  step: 'decide',
  when: 'An option needs weighing against a goal: what it has going for it and against it inside your control, and what helps or threatens it from outside. One grid per option.',
  failureModes: [
    'Internal and external mixed up: a strength that is really an outside opportunity.',
    'Long lists with no judgement about which items matter.',
    'Stopping at the grid without asking what to do about it.'
  ],
  steps: [
    { id: 'goal', title: 'State the goal', prompt: 'Say what the option has to achieve.' },
    { id: 'option', title: 'Name the option', prompt: 'Pick the option to examine; each option gets its own grid.' },
    { id: 'internal', title: 'Strengths and weaknesses', prompt: 'Inside your control: what helps this option succeed, and what holds it back that you could improve.' },
    { id: 'external', title: 'Opportunities and threats', prompt: 'Outside your control: what could help it, and what could put it at risk.' },
    { id: 'synthesis', title: 'Draw it together', prompt: 'Ask how to build on the strengths and openings, how to shrink the weaknesses and threats, how strengths can counter threats, and how weaknesses might become openings.' }
  ],
  slots: {
    goal: 'What the option has to achieve',
    option: 'An option being examined',
    strength: 'A help inside your control',
    weakness: 'A limitation inside your control that could be improved',
    opportunity: 'An outside factor that could help',
    threat: 'An outside factor that puts it at risk',
    synthesis: 'What to do: build on, shrink, counter and convert'
  },
  edgeKinds: ['of'],
  requiredLinks: Object.fromEntries(QUADRANTS.map((q) => [q, { kind: 'of', message: `Link each ${q} to the option it belongs to (link kind "of", from the ${q} to the option).` }])),
  nextSlots(run) {
    if (!hasSlot(run, 'goal')) return ['goal'];
    if (!hasSlot(run, 'option')) return ['option:1'];
    if (hasSlot(run, 'synthesis')) return [];
    return open(nextIndexed(run, 'option', 4), ...QUADRANTS.map((q) => nextIndexed(run, q, 24)), fullOption(run) ? 'synthesis' : null);
  },
  canEdge(run, from, to, kind) {
    const name = nameOf(run, from);
    return kind === 'of' && QUADRANTS.includes(name) && nameOf(run, to) === 'option' && !run.edges.some((edge) => edge.kind === 'of' && edge.from === from) && quadrantsOf(run, to)[name].length < PER_QUADRANT;
  },
  complete(run) {
    return hasSlot(run, 'synthesis') && fullOption(run) && countSlots(run, 'goal') === 1;
  }
});
```

```js
// packages/problem-solver/tools/morphological.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';
import { withChoice } from './choice.mjs';

const PER_SUBJECT = 8;
const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;
const named = (run, name) => run.nodes.filter((node) => parseSlot(node.slot)?.name === name);

export const subjectsOf = (run) => named(run, 'subject');

/** Attribute nodes of one subject id, in placement order. */
export function attributesOf(run, subjectId) {
  const ids = run.edges.filter((edge) => edge.kind === 'of' && edge.to === subjectId).map((edge) => edge.from);
  return run.nodes.filter((node) => ids.includes(node.id));
}

const subjectOfId = (run, attributeId) => run.edges.find((edge) => edge.kind === 'of' && edge.from === attributeId)?.to ?? null;
const subjectOfSlot = (run, slot) => {
  const node = run.nodes.find((item) => item.slot === slot);
  return node && parseSlot(node.slot)?.name === 'attribute' ? subjectOfId(run, node.id) : null;
};

/** Attribute ids a scenario picks. */
export const picksOf = (run, scenarioId) => run.edges.filter((edge) => edge.kind === 'picks' && edge.from === scenarioId).map((edge) => edge.to);

/** Attribute id pairs that cannot go together. */
export const contradictionPairs = (run) => named(run, 'contradiction').map((node) => run.edges.filter((edge) => edge.kind === 'pair' && edge.from === node.id).map((edge) => edge.to)).filter((pair) => pair.length === 2);

/** A scenario is consistent when it picks no contradictory pair. */
export function consistent(run, scenarioId) {
  const picked = new Set(picksOf(run, scenarioId));
  return !contradictionPairs(run).some(([a, b]) => picked.has(a) && picked.has(b));
}

const gridReady = (run) => {
  const subjects = subjectsOf(run);
  return subjects.length >= 3 && subjects.every((subject) => attributesOf(run, subject.id).length >= 2);
};

export const morphological = withChoice({
  id: 'morphological',
  name: 'Morphological analysis',
  kind: 'decision',
  step: 'decide',
  when: 'An ill-defined or many-sided problem where the answer is a combination of choices: lay out the parts and their possible forms, then test which combinations hold together (Zwicky\'s box, with cross-consistency checks).',
  failureModes: [
    'Subjects that overlap, so one choice is counted twice.',
    'Too few attributes per subject to give real alternatives.',
    'Keeping a scenario that contains a pair already shown to clash.',
    'Evaluating only the first scenario found.'
  ],
  steps: [
    { id: 'define', title: 'Define the problem', prompt: 'State the problem and what a good solution must do.' },
    { id: 'grid', title: 'Build the grid', prompt: 'List the subjects (the parts of the solution) and, under each, the different forms it could take.' },
    { id: 'explore', title: 'Explore combinations', prompt: 'Make scenarios by picking one form from every subject.' },
    { id: 'consistency', title: 'Remove what clashes', prompt: 'Name pairs of forms that cannot go together; any scenario holding such a pair drops out.' },
    { id: 'evaluate', title: 'Evaluate', prompt: 'Weigh the scenarios that hold together and say which is most promising and why.' }
  ],
  slots: {
    problem: 'The problem and what a solution must do',
    subject: 'A part of the solution that can take several forms',
    attribute: 'One form a subject could take',
    contradiction: 'Two forms, from different subjects, that cannot go together, and why',
    scenario: 'A combination: one form from every subject',
    evaluation: 'Which consistent scenario is most promising, and why'
  },
  edgeKinds: ['of', 'pair', 'picks'],
  requiredLinks: { attribute: { kind: 'of', message: 'Link each attribute to its subject (link kind "of", from the attribute to the subject).' } },
  validateNode(run, node, edges) {
    const name = parseSlot(node.slot)?.name;
    if (name === 'contradiction') {
      const pair = edges.filter((edge) => edge.kind === 'pair' && edge.from === node.slot).map((edge) => subjectOfSlot(run, edge.to));
      return pair.length === 2 && !pair.includes(null) && pair[0] !== pair[1] ? null : 'Link a contradiction to two attributes that cannot go together, from different subjects (link kind "pair").';
    }
    if (name === 'scenario') {
      const picked = edges.filter((edge) => edge.kind === 'picks' && edge.from === node.slot).map((edge) => subjectOfSlot(run, edge.to));
      const all = subjectsOf(run).map((subject) => subject.id);
      return picked.length === all.length && new Set(picked).size === all.length && picked.every((id) => all.includes(id)) ? null : 'A scenario picks exactly one attribute from every subject (link kind "picks", from the scenario to each attribute).';
    }
    return null;
  },
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    if (hasSlot(run, 'evaluation')) return [];
    const ready = gridReady(run);
    const scenarios = named(run, 'scenario');
    return open(
      scenarios.length ? null : nextIndexed(run, 'subject', 6),
      countSlots(run, 'subject') ? nextIndexed(run, 'attribute', 48) : null,
      ready ? nextIndexed(run, 'contradiction', 12) : null,
      ready ? nextIndexed(run, 'scenario', 6) : null,
      scenarios.some((scenario) => consistent(run, scenario.id)) ? 'evaluation' : null
    );
  },
  canEdge(run, from, to, kind) {
    const source = nameOf(run, from);
    const target = nameOf(run, to);
    if (kind === 'of') return source === 'attribute' && target === 'subject' && !subjectOfId(run, from) && attributesOf(run, to).length < PER_SUBJECT;
    if (kind === 'pair') {
      if (source !== 'contradiction' || target !== 'attribute') return false;
      const existing = run.edges.filter((edge) => edge.kind === 'pair' && edge.from === from).map((edge) => edge.to);
      return existing.length < 2 && existing.every((id) => subjectOfId(run, id) !== subjectOfId(run, to));
    }
    if (kind === 'picks') {
      if (source !== 'scenario' || target !== 'attribute') return false;
      return picksOf(run, from).every((id) => subjectOfId(run, id) !== subjectOfId(run, to));
    }
    return false;
  },
  complete(run) {
    return hasSlot(run, 'evaluation') && gridReady(run);
  }
});
```

```js
// packages/problem-solver/tools/pareto.mjs
import { countSlots, hasSlot, nextIndexed, parseSlot } from '../slots.mjs';
import { withChoice } from './choice.mjs';

const CUT = 80;
const latest = (run) => run.scores?.snapshots?.at(-1) ?? null;
const items = (run) => run.nodes.filter((node) => parseSlot(node.slot)?.name === 'item').sort((a, b) => parseSlot(a.slot).index - parseSlot(b.slot).index);
const scoresCurrent = (run) => latest(run)?.counts?.length === countSlots(run, 'item');
const round1 = (value) => Math.round(value * 10) / 10;

/**
 * Items ranked by their latest figure, largest first (ties keep slot order), with percent
 * of the total, cumulative percent, and `vital` for every row up to and including the
 * first whose cumulative reaches 80%. Empty before data.
 */
export function paretoRows(run) {
  const s = latest(run);
  if (!s) return [];
  const list = items(run).map((node, i) => ({ node, count: s.counts[i] ?? 0, order: i }));
  const total = list.reduce((sum, row) => sum + row.count, 0) || 1;
  list.sort((a, b) => b.count - a.count || a.order - b.order);
  let running = 0;
  let reached = false;
  return list.map(({ node, count }) => {
    running += count;
    const vital = !reached;
    if (running / total * 100 >= CUT) reached = true;
    return { node, count, percent: round1(count / total * 100), cumulative: round1(running / total * 100), vital };
  });
}

export const pareto = withChoice({
  id: 'pareto',
  name: 'Pareto analysis',
  kind: 'decision',
  step: 'decide',
  when: 'Many contributing items and limited effort: find the vital few that account for most of the effect (roughly 80% from 20% of causes), using real counts, costs or time.',
  failureModes: [
    'A ranking with no data behind it.',
    'Items at different levels, so one swallows several others.',
    'Treating 80/20 as exact rather than a guide.',
    'Measuring what is easy to count instead of what matters.'
  ],
  steps: [
    { id: 'target', title: 'Set the target', prompt: 'Say what is being measured (how often, how much it costs, how long it takes) and over what period.' },
    { id: 'items', title: 'List the components', prompt: 'List the items that contribute: causes, categories or activities, at the same level.' },
    { id: 'data', title: 'Collect the data', prompt: 'Give each item its figure; the chart ranks them and works out the percentages.' },
    { id: 'read', title: 'Read the chart', prompt: 'Find where the cumulative line crosses 80%; the items to its left are the vital few to tackle first.' }
  ],
  slots: { target: 'What is measured, how, and over what period', item: 'A contributing item, at the same level as the others' },
  edgeKinds: [],
  nextSlots(run) {
    return hasSlot(run, 'target') ? [nextIndexed(run, 'item', 12)].filter(Boolean) : ['target'];
  },
  pickScores(payload) {
    return { counts: payload?.counts };
  },
  validateScores(run, s) {
    const count = countSlots(run, 'item');
    if (count < 3) return 'List at least three items before adding the data.';
    if (!Array.isArray(s?.counts) || s.counts.length !== count) return 'Give one figure per item.';
    if (!s.counts.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0)) return 'Figures are zero or more.';
    if (!s.counts.some((v) => v > 0)) return 'Give at least one item above zero.';
    return null;
  },
  awaiting(run) {
    return countSlots(run, 'item') >= 3 && !scoresCurrent(run) ? 'The person enters a figure for each item with the Add the data button; ask them to, and wait.' : null;
  },
  scoreLine(run) {
    const rows = paretoRows(run);
    if (!rows.length) return null;
    const vital = rows.filter((row) => row.vital);
    return `Ranked: ${rows.map((row) => `${row.node.slot} ${row.count} (${row.percent}%, cumulative ${row.cumulative}%)`).join('; ')}. Vital few: ${vital.map((row) => row.node.slot).join(', ')} (${vital.at(-1).cumulative}%).`;
  },
  complete(run) {
    return countSlots(run, 'item') >= 3 && scoresCurrent(run);
  }
});
```

Register the four after `duncker` in `tools/index.mjs`, in this order: `decision_matrix: decisionMatrix, swot, morphological, pareto`. Add the ids to `PsToolId`. Append them to the machine test's full registry list. Change `glyphs.ts` `EMBLEMS` to `Partial<Record<PsToolId, string>>` with the empty-span and `''` fallbacks, exactly as Plan 4 Task 2 did; Task 5 restores the strict record.

- [ ] **Step 4: Run the new test file and all root Problem Solver tests. Expect PASS.**

- [ ] **Step 5: Commit**: `Problem Solver: Decide tool definitions` (with trailer).

---

### Task 4: The four Implement tools

**Files:**
- Create: `packages/problem-solver/tools/dmaic.mjs`, `fifteen-percent.mjs`, `kanban.mjs`, `eisenhower.mjs`
- Modify: `packages/problem-solver/tools/index.mjs`, `packages/problem-solver/types.ts`
- Test: `tests/unit/problem-solver-implement-tools.test.js`

- [ ] **Step 1: Failing tests**

```js
// tests/unit/problem-solver-implement-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { addEdge, canEdge, canPropose, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { currentPass } from '../../packages/problem-solver/tools/dmaic.mjs';
import { columnForStatus, wipLimit } from '../../packages/problem-solver/tools/kanban.mjs';
import { byQuadrant } from '../../packages/problem-solver/tools/eisenhower.mjs';

let n = 0;
const put = (run, slot, extra = {}) => placeNode(run, { id: `m${(n += 1)}`, slot, text: slot, title: slot, state: 'accepted', ...extra });
const idOf = (run, slot) => run.nodes.find((x) => x.slot === slot).id;
const nodeAt = (run, slot) => run.nodes.find((x) => x.slot === slot);
const link = (run, from, to, kind) => addEdge(run, { from: idOf(run, from), to: idOf(run, to), kind });

test('implement step lists its four tools in order', () => {
  assert.deepEqual(toolsForBookStep('implement'), ['dmaic', 'fifteen_percent', 'kanban', 'eisenhower']);
});

test('dmaic: five phases in order; a repeat starts a new pass from define; control ends it', () => {
  let r = newRun('dmaic', 'r');
  for (const s of ['define:1', 'measure:1', 'analyse:1', 'improve:1']) {
    assert.deepEqual(nextSlots(r), [s]);
    r = put(r, s);
  }
  assert.deepEqual(nextSlots(r), ['control', 'repeat:1']);
  r = put(r, 'repeat:1');
  assert.deepEqual(nextSlots(r), ['define:2']);
  assert.equal(currentPass(r), 1);
  for (const s of ['define:2', 'measure:2', 'analyse:2', 'improve:2']) r = put(r, s);
  assert.equal(currentPass(r), 2);
  r = put(r, 'repeat:2');
  for (const s of ['define:3', 'measure:3', 'analyse:3', 'improve:3']) r = put(r, s);
  assert.deepEqual(nextSlots(r), ['control'], 'three passes at most');
  assert.equal(isComplete(r), false);
  r = put(r, 'control');
  assert.equal(isComplete(r), true);
  assert.deepEqual(nextSlots(r), []);
});

test('15% solutions: reflect, actions, then chosen notes that each pick one action; chosen actions can become tasks', () => {
  let r = newRun('fifteen_percent', 'r');
  assert.deepEqual(nextSlots(r), ['reflect']);
  r = put(r, 'reflect');
  assert.deepEqual(nextSlots(r), ['action:1']);
  r = put(r, 'action:1');
  assert.deepEqual(nextSlots(r), ['action:2']);
  r = put(r, 'action:2');
  assert.deepEqual(nextSlots(r), ['action:3', 'chosen:1']);
  assert.match(checkNode(r, { slot: 'chosen:1', text: 'x' }, []), /Link each chosen note to the action it picks/);
  r = put(r, 'chosen:1');
  r = link(r, 'chosen:1', 'action:2', 'picks');
  assert.equal(canEdge(r, idOf(r, 'chosen:1'), idOf(r, 'action:1'), 'picks'), false, 'one pick per note');
  assert.equal(isComplete(r), true);
  assert.equal(canPropose(r, nodeAt(r, 'chosen:1')), true);
  assert.equal(canPropose(r, nodeAt(r, 'action:1')), false);
});

test('kanban: tagged cards, an optional WIP limit as a whole number, live columns from task status; open cards can become tasks', () => {
  let r = newRun('kanban', 'r');
  assert.deepEqual(nextSlots(r), ['card:1', 'wip']);
  assert.match(checkNode(r, { slot: 'card:1', text: 'x' }, []), /one of todo, doing, review, done/);
  r = put(r, 'card:1', { tag: 'todo' });
  r = put(r, 'card:2', { tag: 'doing' });
  assert.match(checkNode(r, { slot: 'wip', text: 'Keep it small' }, []), /whole number from 1 to 20/);
  r = put(r, 'wip', { text: '3 at a time' });
  assert.equal(wipLimit(r), 3);
  assert.deepEqual(nextSlots(r), ['card:3']);
  assert.equal(isComplete(r), false);
  r = put(r, 'card:3', { tag: 'done' });
  assert.equal(isComplete(r), true);
  assert.equal(canPropose(r, nodeAt(r, 'card:1')), true);
  assert.equal(canPropose(r, nodeAt(r, 'card:3')), false);
  assert.deepEqual(['open', 'in_progress', 'done', 'dead', 'deferred', 'mystery'].map(columnForStatus), ['todo', 'doing', 'done', 'done', 'todo', 'todo']);
});

test('eisenhower: tagged items; complete with items in two quadrants; do-first items can become tasks', () => {
  let r = newRun('eisenhower', 'r');
  assert.deepEqual(nextSlots(r), ['item:1']);
  assert.match(checkNode(r, { slot: 'item:1', text: 'x' }, []), /one of do, schedule, delegate, eliminate/);
  r = put(r, 'item:1', { tag: 'do' });
  r = put(r, 'item:2', { tag: 'do' });
  assert.equal(isComplete(r), false);
  r = put(r, 'item:3', { tag: 'eliminate' });
  assert.equal(isComplete(r), true);
  assert.equal(byQuadrant(r).do.length, 2);
  assert.equal(canPropose(r, nodeAt(r, 'item:1')), true);
  assert.equal(canPropose(r, nodeAt(r, 'item:3')), false);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/tools/dmaic.mjs
import { countSlots, hasSlot, open } from '../slots.mjs';

export const DMAIC_PHASES = Object.freeze(['define', 'measure', 'analyse', 'improve']);
const MAX_PASSES = 3;
const has = (run, slot) => run.nodes.some((node) => node.slot === slot);

/** The pass being worked: the number of define nodes, at least 1. */
export function currentPass(run) {
  return Math.max(1, countSlots(run, 'define'));
}

export const dmaic = Object.freeze({
  id: 'dmaic',
  name: 'DMAIC cycle',
  kind: 'plan',
  step: 'implement',
  when: 'Improving a process or a result that can be measured, where you want data before and after, a pilot, and a plan to keep the gain (Six Sigma\'s define, measure, analyse, improve, control).',
  failureModes: [
    'No baseline, so improvement cannot be shown.',
    'Measures that track activity rather than the result.',
    'Rolling out everywhere without a pilot when one is cheap.',
    'No plan for who keeps the gain and how.'
  ],
  steps: [
    { id: 'define', title: 'Define', prompt: 'The problem, the objectives, the scope and who is involved.' },
    { id: 'measure', title: 'Measure', prompt: 'The key measures of success, today\'s baseline, and how progress will be tracked. SMART measures from Define carry over here.' },
    { id: 'analyse', title: 'Analyse', prompt: 'What the data shows: patterns and the root causes to target.' },
    { id: 'improve', title: 'Improve', prompt: 'Prioritise solutions, pilot the best, then implement it. Go round again if the results fall short.' },
    { id: 'control', title: 'Control', prompt: 'How the gain is kept: who monitors what, how often, and when the plan is revised.' }
  ],
  slots: {
    define: 'This pass: problem, objectives, scope and stakeholders',
    measure: 'This pass: key measures, the baseline, how it is tracked',
    analyse: 'This pass: what the data shows and the root causes to target',
    improve: 'This pass: the chosen solutions, the pilot and its results',
    repeat: 'Why go round again, and what changes next pass',
    control: 'How the gain is kept, monitored and revised'
  },
  edgeKinds: [],
  nextSlots(run) {
    if (hasSlot(run, 'control')) return [];
    const pass = countSlots(run, 'define');
    if (pass === 0) return ['define:1'];
    const missing = DMAIC_PHASES.find((phase) => !has(run, `${phase}:${pass}`));
    if (missing) return [`${missing}:${pass}`];
    if (has(run, `repeat:${pass}`)) return [`define:${pass + 1}`];
    return open('control', pass < MAX_PASSES ? `repeat:${pass}` : null);
  },
  complete(run) {
    return hasSlot(run, 'control');
  }
});
```

```js
// packages/problem-solver/tools/fifteen-percent.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;
const picked = (run) => new Set(run.edges.filter((edge) => edge.kind === 'picks').map((edge) => edge.to));

/** The action node a chosen note picks, or null. */
export function pickedAction(run, chosenId) {
  const to = run.edges.find((edge) => edge.kind === 'picks' && edge.from === chosenId)?.to;
  return run.nodes.find((node) => node.id === to) ?? null;
}

export const fifteenPercent = Object.freeze({
  id: 'fifteen_percent',
  name: '15% solutions',
  kind: 'plan',
  step: 'implement',
  when: 'Change feels too big or stuck waiting for others: find what you can do now, within your own discretion, with no new resources or permission, and start.',
  failureModes: [
    'Actions that need someone else\'s approval or new money, so they are not really yours.',
    'Picking the easiest action instead of the one with most effect.',
    'Choosing an action and setting no time to do it.'
  ],
  steps: [
    { id: 'reflect', title: 'Reflect', prompt: 'Look at the problem and the plan so far: where do you have freedom to act?' },
    { id: 'what', title: 'Find your 15%', prompt: 'List the actions you could take now, on your own authority, with what you already have.' },
    { id: 'go', title: 'Go', prompt: 'Pick the action with most effect and do it now; it can become a task.' }
  ],
  slots: { reflect: 'Where you have freedom to act', action: 'Something you can do now, on your own authority', chosen: 'The action picked to do now, and when' },
  edgeKinds: ['picks'],
  requiredLinks: { chosen: { kind: 'picks', message: 'Link each chosen note to the action it picks (link kind "picks", from the note to the action).' } },
  taskSlots: { chosen: () => true },
  nextSlots(run) {
    if (!hasSlot(run, 'reflect')) return ['reflect'];
    const actions = countSlots(run, 'action');
    const unpicked = actions > picked(run).size;
    return open(nextIndexed(run, 'action', 8), actions >= 2 && unpicked ? nextIndexed(run, 'chosen', 8) : null);
  },
  canEdge(run, from, to, kind) {
    return kind === 'picks' && nameOf(run, from) === 'chosen' && nameOf(run, to) === 'action' && !run.edges.some((edge) => edge.kind === 'picks' && edge.from === from) && !picked(run).has(to);
  },
  complete(run) {
    return hasSlot(run, 'reflect') && countSlots(run, 'action') >= 2 && run.edges.some((edge) => edge.kind === 'picks');
  }
});
```

```js
// packages/problem-solver/tools/kanban.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

export const KANBAN_COLUMNS = Object.freeze(['todo', 'doing', 'review', 'done']);

/** Board column for a Tasks hub status (the hub has no review status). */
export function columnForStatus(status) {
  if (status === 'in_progress') return 'doing';
  if (status === 'done' || status === 'dead') return 'done';
  return 'todo';
}

/** The work-in-progress limit, or null when not set. */
export function wipLimit(run) {
  const node = run.nodes.find((item) => item.slot === 'wip');
  const match = node && /\b([1-9]|1\d|20)\b/.exec(node.text);
  return match ? Number(match[1]) : null;
}

export const kanban = Object.freeze({
  id: 'kanban',
  name: 'Kanban',
  kind: 'plan',
  step: 'implement',
  when: 'Several tasks moving through stages, where seeing everything at once and limiting how much is in progress keeps work flowing.',
  failureModes: [
    'Cards too big to finish, such as "sort the rota".',
    'Cards with no owner or due date.',
    'Too much in Doing at once, so nothing finishes.',
    'A board set up once and never updated.'
  ],
  steps: [
    { id: 'columns', title: 'Set up the stages', prompt: 'Work moves from To do through Doing (with a Review stop) to Done.' },
    { id: 'cards', title: 'Add the tasks', prompt: 'One specific task per card, small enough to finish, with a due date where it matters.' },
    { id: 'wip', title: 'Limit work in progress', prompt: 'Decide how many cards can be in Doing at once.' },
    { id: 'update', title: 'Keep it current', prompt: 'Cards that are real tasks move by themselves as you work on them in Tasks.' }
  ],
  slots: { card: 'One specific task, small enough to finish', wip: 'How many cards may be in Doing at once (a whole number)' },
  nodeTags: { card: KANBAN_COLUMNS },
  taskSlots: { card: (node) => node.tag !== 'done' },
  validateNode(run, node) {
    if (node.slot !== 'wip') return null;
    return wipLimit({ nodes: [{ slot: 'wip', text: node.text }] }) ? null : 'Give the limit as a whole number from 1 to 20.';
  },
  edgeKinds: [],
  nextSlots(run) {
    return open(nextIndexed(run, 'card', 20), hasSlot(run, 'wip') ? null : 'wip');
  },
  complete(run) {
    return countSlots(run, 'card') >= 3;
  }
});
```

```js
// packages/problem-solver/tools/eisenhower.mjs
import { nextIndexed, parseSlot } from '../slots.mjs';

export const EISENHOWER_QUADRANTS = Object.freeze(['do', 'schedule', 'delegate', 'eliminate']);

/** Item nodes per quadrant tag, in placement order. */
export function byQuadrant(run) {
  const out = Object.fromEntries(EISENHOWER_QUADRANTS.map((q) => [q, []]));
  for (const node of run.nodes) if (parseSlot(node.slot)?.name === 'item' && out[node.tag]) out[node.tag].push(node);
  return out;
}

export const eisenhower = Object.freeze({
  id: 'eisenhower',
  name: 'Eisenhower matrix',
  kind: 'plan',
  step: 'implement',
  when: 'Too many things competing for time: sort them by urgent and important to decide what to do now, schedule, hand on or drop.',
  failureModes: [
    'Everything marked urgent and important.',
    'Delegating what only you can do, or keeping what someone else could.',
    'Never eliminating anything.'
  ],
  steps: [
    { id: 'list', title: 'List the demands', prompt: 'Everything competing for time on this problem.' },
    { id: 'sort', title: 'Sort them', prompt: 'Do first: important and pressing. Schedule: important, not yet due. Delegate: someone else can do it and it does not move your goal. Eliminate: distractions.' }
  ],
  slots: { item: 'A demand on your time, sorted into one quadrant' },
  nodeTags: { item: EISENHOWER_QUADRANTS },
  taskSlots: { item: (node) => node.tag === 'do' },
  edgeKinds: [],
  nextSlots(run) {
    return [nextIndexed(run, 'item', 16)].filter(Boolean);
  },
  complete(run) {
    return Object.values(byQuadrant(run)).filter((list) => list.length > 0).length >= 2;
  }
});
```

Register the four after `pareto`: `dmaic, fifteen_percent: fifteenPercent, kanban, eisenhower`. Add the ids to `PsToolId`. Append them to the machine test's full registry list.

- [ ] **Step 4: Run, expect PASS** (all root Problem Solver tests).

- [ ] **Step 5: Commit**: `Problem Solver: Implement tool definitions` (with trailer).

---

### Task 5: Emblems for the eight tools — then the HUMAN CHECKPOINT

**Files:**
- Create: `packages/problem-solver/glyphs/tools/<tool_id>.svg` × 8
- Modify: `packages/problem-solver/glyphs.ts` (restore `Record<PsToolId, string>`, drop the Task 3 fallbacks)
- Test: `apps/tasks/tests/unit/problem-solver-glyphs.test.ts` (already checks that every tool has an emblem)

- [ ] **Step 1: Draw the emblems.** Open `.ps-book/emblem-sheet.png` and each tool's page image (the emblem sits beside the page title). Every emblem is a circle in viewBox `0 0 100 100` with literal book fills (copy the hex values from `glyphs/tools/smart.svg`), no ids, no strokes except where noted. Match each to the sheet:
  - decision_matrix: red disc; a yellow half-disc on the left with its flat side facing right; to its right a blue column of three stacked bumps facing right.
  - swot: yellow disc; a red triangle and a larger blue triangle overlapping, both leaning up and to the right.
  - morphological: red rim; blue upper part and yellow lower part divided by a stepped zig-zag edge.
  - pareto: blue disc; a red cap across the top; three rows of yellow half-discs (domes downward) stacked below it.
  - dmaic: blue disc with a red band across the middle; along the band, alternately a yellow dot and a small yellow right-pointing triangle.
  - fifteen_percent: a disc in four quarters, blue top-left and bottom-right, yellow top-right and bottom-left, with thin red cross lines between them (two thin red rects, not strokes).
  - kanban: red disc; three right-pointing triangles in a row, two yellow then one blue.
  - eisenhower: blue disc; a large yellow half-disc on the right (flat side left); a small red half-disc on the left against that flat side.

  Where this list and the sheet disagree, follow the sheet.
- [ ] **Step 2:** Import the eight SVGs in `glyphs.ts`, add them to `EMBLEMS`, restore the strict type and lookups.
- [ ] **Step 3: Contact sheet.** Build a throwaway HTML page in the scratchpad with all 27 emblems at 96px and 24px on the paper background, screenshot it with the Chrome path (reuse `node_modules/playwright-core`) to `$PS_SCRATCH/preview/emblems-plan5.png`, compare with `.ps-book/emblem-sheet.png`, and fix any emblem that does not read as its book counterpart.
- [ ] **Step 4:** Run the glyph and view tests, the type gate and all Problem Solver tests. The landing shelf picks up the Decide and Implement groups by itself (Plan 4 grouped it by `BOOK_STEPS`); add a view test that `[data-step="implement"]` contains the four Implement tool names. Commit: `Problem Solver: Decide and Implement emblems`.
- [ ] **Step 5: HUMAN CHECKPOINT.** The controller sends `emblems-plan5.png` to Adam (SendUserFile) and asks for approval. Renderer tasks may proceed meanwhile; requested changes become a fix commit before the plan finishes.

---

### Task 6: Coach knowledge for Decide and Implement

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/knowledge/selection.mjs`, `knowledge/triggers.mjs`
- Test: `tests/unit/problem-solver-knowledge.test.js`, `tests/unit/problem-solver-prompts.test.js`

The chapter paragraphs for Decide and Implement already exist (Plan 3). This task adds the selection guides, the step triggers and the carry-forward guidance.

- [ ] **Step 1: Failing tests**

Append to `tests/unit/problem-solver-knowledge.test.js` (extend the existing loops' step lists rather than duplicating, if that reads better):

```js
test('selection guides for decide and implement name every one of their tools', async () => {
  const { toolsForBookStep } = await import('../../packages/problem-solver/tools/index.mjs');
  for (const step of ['decide', 'implement']) {
    for (const id of toolsForBookStep(step)) assert.ok(SELECTION[step].includes(`\`${id}\``), `${step} guide names ${id}`);
  }
});

test('step triggers exist for decide and implement as short lines', () => {
  for (const step of ['decide', 'implement']) {
    assert.ok(Array.isArray(STEP_TRIGGERS[step]) && STEP_TRIGGERS[step].length >= 4, step);
    for (const line of STEP_TRIGGERS[step]) assert.ok(line.length < 200, line);
  }
});
```

Append to `tests/unit/problem-solver-prompts.test.js`:

```js
test('the decide step layer carries its guide, tools, triggers and carry-forward', () => {
  let s = inTool();
  for (let i = 0; i < 3; i += 1) s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  const layer = buildCoachPrompt(s).system[1];
  assert.match(layer, /CURRENT STEP: Decide/);
  assert.match(layer, /decision_matrix \(Decision matrix\)/);
  assert.match(layer, /CHALLENGE IN THIS STEP:/);
  assert.match(layer, /CARRY FORWARD:/);
  assert.match(layer, /choice slot/);
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

Add to `SELECTION`:

```js
  decide: 'Choose from what the decision turns on. Several options against several factors of unequal importance: `decision_matrix`. One or two options to weigh against a goal, inside and outside your control: `swot`. A solution made of several parts, each with alternatives, where some combinations clash: `morphological`. Many contributing items and limited effort, with data available: `pareto`. Name whether this decision suits fast judgement or slow analysis, and say so. Every Decide tool ends with the choice slot: when the tool\'s minimum is met, name the leading option from the scores or the evaluation in one sentence, ask which option the person will carry into Implement, and place their answer in the choice slot. The choice is theirs; if it is not the leader, ask for the reason once and accept it.',
  implement: 'Choose from what stands between the plan and action. A measurable process to improve with data and a pilot: `dmaic`. Stuck waiting for others or for resources: `fifteen_percent`. Several tasks to move through stages: `kanban`. Too many demands competing for time: `eisenhower`. Small, specific actions with an owner and a date beat a large plan; offer concrete ones as real tasks.'
```

Add to `STEP_TRIGGERS`:

```js
  decide: [
    'A criterion too vague to rate, such as "good" or "works" (critical_thinking).',
    'Weights all equal, or not adding to 100, with no reason (analysis).',
    'A rating that contradicts evidence already given (logical_reasoning).',
    'A Pareto ranking or 80/20 claim with no figures behind it (critical_thinking).',
    'The answer decided before the analysis, with numbers fitted afterwards (metacognition).',
    'A chosen option that goes against the scores with no reason given (decision_making).'
  ],
  implement: [
    'A task too large to start this week (decision_making).',
    'A task with no owner or no date (decision_making).',
    'Status quo, loss or regret talk left unexamined ("we have always done it this way") (metacognition).',
    'No measure of success, so nobody will know whether it worked (critical_thinking).',
    'Rolling out everywhere when a cheap pilot was possible (decision_making).'
  ]
```

Every id in parentheses is a skill id from `packages/problem-solver/skills.mjs`; keep it that way if you reword a line.

In `prompts.mjs` `stepLayer`, after the triggers block, add a carry-forward line for these two families:

```js
const CARRY = {
  decide: 'CARRY FORWARD: seed options from Devise (preferred lotus ideas, solution-tree branches, Duncker solutions, the integrated reduction) and confirm each with the person before placing it.',
  implement: 'CARRY FORWARD: the CHOSEN OPTION from Decide is the aim of Implement. Open by confirming it in one sentence, then seed it into DMAIC\'s Define, the 15% Reflect or the first Kanban cards. If none is recorded, ask what was decided before placing anything. SMART measures from Define seed DMAIC\'s Measure. Confirm before placing.'
};
```

and push `...books.map((id) => CARRY[id]).filter(Boolean)` into the returned list.

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**: `Problem Solver: coach knowledge for Decide and Implement` (with trailer).

---

### Task 7: Session: proposed tasks, the review proposal and the chosen option as Implement's aim (FULL REVIEW)

**Files:**
- Modify: `packages/problem-solver/types.ts`, `packages/problem-solver/steps.mjs`
- Modify: `netlify/functions/_shared/problem-solver/coach-schema.mjs`, `coach.mjs`, `session.mjs`, `migrate.mjs`, `prompts.mjs`
- Test: `tests/unit/problem-solver-coach-schema.test.js`, `problem-solver-coach.test.js`, `problem-solver-session.test.js`, `problem-solver-migrate.test.js`, `problem-solver-prompts.test.js`, `problem-solver-steps.test.js`

The server records what the coach proposes and what the person confirms. It never creates or edits a Task.

- [ ] **Step 1: Types**

In `types.ts`:

```ts
export type PsProposedTask = {
  id: string;
  title: string;
  status: 'proposed' | 'confirmed' | 'dismissed';
  due: string | null;
  taskId?: string;
  /** Set when a confirmed task was deleted in Tasks and the proposal reverted. */
  removed?: boolean;
  source: { runId: string; nodeId: string };
};
export type PsReviewProposal = { title: string; due: string; reason: string; status: 'proposed' | 'confirmed' | 'dismissed' };
/** A confirmed task's live state, passed from the page to a chart (never stored). */
export type PsTaskLink = { nodeId: string; taskId: string; status: string };
```

Add to `PsSession`: `proposedTasks: PsProposedTask[]; reviewProposal: PsReviewProposal | null; reviewTaskId: string | null;`. Add to `PsSummary`: `taskIds?: string[]; reviewTaskId?: string | null`. Add to `PsAction`: `'confirm_task' | 'dismiss_task' | 'set_review_task' | 'dismiss_review'`.

- [ ] **Step 2: Failing tests**

`tests/unit/problem-solver-steps.test.js` (add `planStepForBook` and `chosenOption` to its import from steps.mjs):

```js
test('planStepForBook finds the plan step that uses a book step', () => {
  assert.equal(planStepForBook('seven_step', 'improve'), 'improve');
  assert.equal(planStepForBook('polya', 'improve'), 'evaluate');
  assert.equal(planStepForBook('polya', 'decide'), 'devise');
  assert.equal(planStepForBook('triz', 'nothing'), null);
});

test('chosenOption is the choice of the latest kept Decide run', () => {
  const run = (id, text, status = 'done') => ({ id, tool: 'swot', status, nodes: [{ id: `${id}-c`, slot: 'choice', text, title: text, state: 'accepted', skills: [], turnId: 't' }], edges: [] });
  assert.equal(chosenOption({ steps: {} }), null);
  const session = { steps: { decide: { runs: [run('a', 'Publish the rota on Wednesdays'), run('b', 'Swap shifts in a shared app'), run('c', 'Switched away', 'switched')], status: 'done', objection: null } } };
  assert.deepEqual(chosenOption(session), { text: 'Swap shifts in a shared app', title: 'Swap shifts in a shared app', contested: false, runId: 'b', tool: 'swot' });
});
```

`tests/unit/problem-solver-coach-schema.test.js`:

```js
test('proposeTasks needs a slot and a title; bad dates become null; at most five', () => {
  const ok = validateCoachTurn({ verdict: 'accept', message: 'ok', proposeTasks: [{ slot: 'card:1', title: ' Draft the rota template ', due: '2026-10-24' }, { slot: 'card:2', title: 'Ask the team', due: '24/10' }] }).value;
  assert.deepEqual(ok.proposeTasks, [{ slot: 'card:1', title: 'Draft the rota template', due: '2026-10-24' }, { slot: 'card:2', title: 'Ask the team', due: null }]);
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', proposeTasks: [{ slot: 'card:1' }] }).ok, false);
  const many = Array.from({ length: 7 }, (_, i) => ({ slot: `card:${i + 1}`, title: `Task ${i + 1}` }));
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', proposeTasks: many }).value.proposeTasks.length, 5);
  assert.deepEqual(validateCoachTurn({ verdict: 'clarify', message: 'ok' }).value.proposeTasks, []);
});

test('proposeReview needs a real date', () => {
  assert.deepEqual(validateCoachTurn({ verdict: 'clarify', message: 'ok', proposeReview: { due: '2026-11-02', reason: 'First results by then.' } }).value.proposeReview, { due: '2026-11-02', reason: 'First results by then.' });
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'ok', proposeReview: { due: '2026-02-31' } }).value.proposeReview, null);
});
```

`tests/unit/problem-solver-session.test.js` (add `confirmTask, dismissTask, setReviewTask, dismissReview` to the import; import `newRun` from machine.mjs):

```js
function inStep(step, tool) {
  const s = framed('seven_step', 'five_whys');
  return { ...s, phase: step, runner: { status: 'idle', mode: 'turn', error: null }, steps: { ...s.steps, [step]: { runs: [newRun(tool, `run-${step}`)], status: 'open', objection: null } } };
}
const card = (i, tag = 'todo') => ({ slot: `card:${i}`, text: `Draft rota task number ${i} for the team`, tag });

test('a new session starts with no proposals and no review', () => {
  const s = createSession({ text: 'Late rota.' }, deps);
  assert.deepEqual(s.proposedTasks, []);
  assert.equal(s.reviewProposal, null);
  assert.equal(s.reviewTaskId, null);
});

test('an accepted card proposed as a task becomes one proposal tied to its node; repeats, done cards and unknown slots are dropped', () => {
  let s = inStep('implement', 'kanban');
  s = applyCoachTurn(s, coach({ node: card(1), proposeTasks: [{ slot: 'card:1', title: 'Draft the rota template', due: '2026-10-24' }] }), deps);
  assert.equal(s.proposedTasks.length, 1);
  const [p] = s.proposedTasks;
  assert.equal(p.status, 'proposed');
  assert.equal(p.due, '2026-10-24');
  assert.deepEqual(p.source, { runId: 'run-implement', nodeId: activeRun(s).nodes[0].id });
  s = applyCoachTurn(s, coach({ node: card(2, 'done'), proposeTasks: [{ slot: 'card:1', title: 'Again', due: null }, { slot: 'card:2', title: 'Done one', due: null }, { slot: 'card:9', title: 'Ghost', due: null }] }), deps);
  assert.equal(s.proposedTasks.length, 1);
});

test('proposals outside Implement tools are dropped', () => {
  let s = framed('seven_step', 'five_whys');
  s = applyCoachTurn(s, coach({ node: { slot: 'why:1', text: 'Swaps are agreed by text message' }, proposeTasks: [{ slot: 'why:1', title: 'Fix it', due: null }] }), deps);
  assert.deepEqual(s.proposedTasks, []);
});

test('confirm_task records the created task once; dismissed proposals cannot be confirmed', () => {
  let s = applyCoachTurn(inStep('implement', 'kanban'), coach({ node: card(1), proposeTasks: [{ slot: 'card:1', title: 'Draft', due: null }] }), deps);
  const id = s.proposedTasks[0].id;
  s = confirmTask(s, { proposalId: id, taskId: 'task-1' }, deps);
  assert.equal(s.proposedTasks[0].status, 'confirmed');
  assert.equal(s.proposedTasks[0].taskId, 'task-1');
  assert.equal(confirmTask(s, { proposalId: id, taskId: 'task-1' }, deps).proposedTasks[0].taskId, 'task-1', 'same id is a no-op');
  assert.throws(() => confirmTask(s, { proposalId: id, taskId: 'task-2' }, deps), (err) => err.status === 409);
  assert.throws(() => confirmTask(s, { proposalId: 'nope', taskId: 'task-2' }, deps), (err) => err.status === 404);
  assert.throws(() => confirmTask(s, { proposalId: id, taskId: '' }, deps), (err) => err.status === 400);
});

test('dismiss_task drops a proposal; a confirmed one reverts only when its task was removed', () => {
  let s = applyCoachTurn(inStep('implement', 'kanban'), coach({ node: card(1), proposeTasks: [{ slot: 'card:1', title: 'Draft', due: null }] }), deps);
  s = applyCoachTurn(s, coach({ node: card(2), proposeTasks: [{ slot: 'card:2', title: 'Ask', due: null }] }), deps);
  const [a, b] = s.proposedTasks.map((p) => p.id);
  s = dismissTask(s, { proposalId: a }, deps);
  assert.equal(s.proposedTasks[0].status, 'dismissed');
  s = confirmTask(s, { proposalId: b, taskId: 'task-2' }, deps);
  assert.throws(() => dismissTask(s, { proposalId: b }, deps), (err) => err.status === 409);
  s = dismissTask(s, { proposalId: b, reason: 'removed' }, deps);
  assert.equal(s.proposedTasks[1].status, 'dismissed');
  assert.equal(s.proposedTasks[1].removed, true);
  assert.throws(() => confirmTask(s, { proposalId: a, taskId: 'x' }, deps), (err) => err.status === 409);
  // Adam's decision: a node whose task was deleted is never proposed again.
  s = applyCoachTurn(s, coach({ verdict: 'clarify', proposeTasks: [{ slot: 'card:2', title: 'Ask again', due: null }] }), deps);
  assert.equal(s.proposedTasks.length, 2);
  // A proposal the person set aside (not deleted) may be offered again.
  s = applyCoachTurn(s, coach({ verdict: 'clarify', proposeTasks: [{ slot: 'card:1', title: 'Draft again', due: null }] }), deps);
  assert.equal(s.proposedTasks.length, 3);
});

test('leaving Implement with a finished tool proposes a review in two weeks; leaving it untouched does not', () => {
  let s = inStep('implement', 'kanban');
  for (const i of [1, 2, 3]) s = applyCoachTurn(s, coach({ node: card(i) }), deps);
  const left = moveOn(s, deps);
  assert.deepEqual(left.reviewProposal, { title: 'Review: Late rota', due: '2026-11-02', reason: 'A first look at how the plan is going.', status: 'proposed' });
  const untouched = { ...s, steps: { ...s.steps, implement: { runs: [], status: 'open', objection: null } } };
  assert.equal(moveOn(untouched, deps).reviewProposal, null);
});

test('the coach can propose the review date in Implement; the person confirms or dismisses it', () => {
  let s = inStep('implement', 'kanban');
  s = applyCoachTurn(s, coach({ verdict: 'clarify', proposeReview: { due: '2026-11-09', reason: 'The pilot ends then.' } }), deps);
  assert.equal(s.reviewProposal.due, '2026-11-09');
  assert.equal(s.reviewProposal.status, 'proposed');
  const dismissed = dismissReview(s, deps);
  assert.equal(dismissed.reviewProposal.status, 'dismissed');
  s = setReviewTask(s, { taskId: 'review-1', due: '2026-11-10' }, deps);
  assert.equal(s.reviewTaskId, 'review-1');
  assert.equal(s.reviewProposal.status, 'confirmed');
  assert.equal(s.reviewProposal.due, '2026-11-10');
  assert.throws(() => setReviewTask(s, { taskId: 'review-2', due: '2026-11-10' }, deps), (err) => err.status === 409);
  const moved = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  assert.equal(moved.reviewProposal.due, '2026-11-10', 'an existing review is never replaced on leaving');
});

test('a review proposed outside Implement is ignored', () => {
  const s = applyCoachTurn(framed('seven_step', 'five_whys'), coach({ verdict: 'clarify', proposeReview: { due: '2026-11-09', reason: 'x' } }), deps);
  assert.equal(s.reviewProposal, null);
});

test('summary rows carry confirmed task ids and the review task id', () => {
  let s = applyCoachTurn(inStep('implement', 'kanban'), coach({ node: card(1), proposeTasks: [{ slot: 'card:1', title: 'Draft', due: null }] }), deps);
  s = confirmTask(s, { proposalId: s.proposedTasks[0].id, taskId: 'task-1' }, deps);
  s = setReviewTask(s, { taskId: 'review-1', due: '2026-11-02' }, deps);
  const row = summaryRow(s);
  assert.deepEqual(row.taskIds, ['task-1']);
  assert.equal(row.reviewTaskId, 'review-1');
});
```

`tests/unit/problem-solver-migrate.test.js`:

```js
test('a v2 session saved before tasks existed gains empty task fields on read', () => {
  const old = { id: 'x', turns: [], steps: {}, phase: 'frame', title: 't' };
  const read = migrateSession(old);
  assert.deepEqual(read.proposedTasks, []);
  assert.equal(read.reviewProposal, null);
  assert.equal(read.reviewTaskId, null);
  assert.equal(old.proposedTasks, undefined, 'the input is not mutated');
});
```

Also assert in the existing v1 fixture test that the migrated session has `proposedTasks: []`.

`tests/unit/problem-solver-coach.test.js`: add a test where the model's reply places `card` (bare name) with `tag: 'todo'` and `proposeTasks: [{ slot: 'card', title: 'Draft' }]` on an active kanban run, and assert the fitted value's `proposeTasks[0].slot` is `card:1`. Add a second test: in boundary mode the parsed value has `proposeTasks: []` and `proposeReview: null`.

`tests/unit/problem-solver-prompts.test.js`:

```js
test('implement prompts show TODAY, nodes that can become tasks, and the task and review state', () => {
  let s = { ...inTool('five_whys'), updatedAt: '2026-10-19T10:00:00.000Z' };
  s = { ...s, phase: 'implement', steps: { ...s.steps, implement: { runs: [{ id: 'k', tool: 'kanban', status: 'active', nodes: [{ id: 'n1', slot: 'card:1', text: 'Draft the template', tag: 'todo', state: 'accepted', skills: [], turnId: 't' }, { id: 'n2', slot: 'card:2', text: 'Ask the team', tag: 'todo', state: 'accepted', skills: [], turnId: 't' }], edges: [] }], status: 'open', objection: null } } };
  s.steps.implement.runs[0].nodes.push({ id: 'n3', slot: 'card:3', text: 'Old removed task', tag: 'todo', state: 'accepted', skills: [], turnId: 't' });
  s = { ...s, proposedTasks: [{ id: 'p1', title: 'Draft the template', status: 'confirmed', due: null, taskId: 'task-1', source: { runId: 'k', nodeId: 'n1' } }, { id: 'p3', title: 'Old removed task', status: 'dismissed', removed: true, due: null, taskId: 'task-3', source: { runId: 'k', nodeId: 'n3' } }], reviewProposal: null, reviewTaskId: null };
  const { user, system } = buildCoachPrompt(s);
  assert.match(user, /TODAY: 2026-10-19/);
  assert.match(user, /Can become tasks: card:2/);
  assert.doesNotMatch(user, /Can become tasks: card:1/);
  assert.match(user, /TASKS FROM THIS PROBLEM:\n  confirmed: "Draft the template"/);
  assert.match(user, /REVIEW TASK: none yet/);
  assert.match(system[0], /"proposeTasks"/);
  assert.match(system[0], /"proposeReview"/);
  assert.doesNotMatch(user, /TASKS FROM THIS PROBLEM:[\s\S]*Old removed task/, 'the coach is not told about deleted tasks');
  assert.doesNotMatch(user, /Can become tasks:[^\n]*card:3/, 'nor offered them again');
});

test('outside Decide the chosen option is shown as the aim; in Implement without one, the coach asks', () => {
  const base = { ...inTool('five_whys'), updatedAt: '2026-10-19T10:00:00.000Z' };
  const choice = { id: 'd', tool: 'decision_matrix', status: 'done', nodes: [{ id: 'c', slot: 'choice', text: 'Publish the rota on Wednesdays', title: 'Wednesday rota', state: 'accepted', skills: [], turnId: 't' }], edges: [] };
  const implement = { runs: [], status: 'open', objection: null };
  const withChoice = { ...base, phase: 'implement', steps: { ...base.steps, decide: { runs: [choice], status: 'done', objection: null }, implement } };
  assert.match(buildCoachPrompt(withChoice).user, /CHOSEN OPTION \(the aim for Implement\): Publish the rota on Wednesdays/);
  const without = { ...base, phase: 'implement', steps: { ...base.steps, implement } };
  assert.match(buildCoachPrompt(without).user, /CHOSEN OPTION: none recorded/);
});
```

- [ ] **Step 3: Run, expect FAIL.**

- [ ] **Step 4: Implement**

`steps.mjs`:

```js
/** The plan step of a model whose tool families include `book`, or null. */
export function planStepForBook(modelId, book) {
  return stepPlan(modelId).find((s) => s.book.includes(book))?.step ?? null;
}

/**
 * The option chosen in Decide and carried into Implement as its aim: the `choice` node of
 * the latest Decide run that was not switched away from, or null. Read by the prompt, the
 * canvas aim caption and (Plan 6) Improve.
 */
export function chosenOption(session) {
  const runs = Object.values(session.steps ?? {}).flatMap((step) => step.runs).filter((run) => run.status !== 'switched' && TOOLS[run.tool]?.step === 'decide');
  for (const run of runs.reverse()) {
    const node = run.nodes.find((item) => item.slot === 'choice');
    if (node) return { text: node.text, title: node.title ?? node.text, contested: node.state === 'contested', runId: run.id, tool: run.tool };
  }
  return null;
}
```

`coach-schema.mjs`, inside `validateCoachTurn` before the return:

```js
/** A real calendar date as YYYY-MM-DD (rejects 2026-02-31 and 2026-13-01). Module level. */
function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
```

```js
  const proposeTasks = [];
  for (const item of Array.isArray(raw.proposeTasks) ? raw.proposeTasks.slice(0, 5) : []) {
    const title = text(item?.title, 120);
    if (!parseSlot(item?.slot) || !title) return fail('Each proposed task needs a slot and a title.');
    proposeTasks.push({ slot: item.slot, title, due: isDate(item.due) ? item.due : null });
  }
  const proposeReview = raw.proposeReview && isDate(raw.proposeReview.due) ? { due: raw.proposeReview.due, reason: text(raw.proposeReview.reason, 300) ?? '' } : null;
```

and add `proposeTasks, proposeReview` to the returned value.

`coach.mjs`:
- In `parse`, the boundary/finished early return becomes `{ ok: true, value: { ...result.value, suggestion: null, proposeTasks: [], proposeReview: null } }`.
- In `fitToRun`, the final accept/challenge return renames proposal slots: `proposeTasks: value.proposeTasks.map((p) => ({ ...p, slot: rename(p.slot) }))`. The clarify return keeps `value.proposeTasks` as given (a clarify turn may propose existing cards).

`session.mjs`:

```js
import { addEdge, applyScores, canEdge, canPlace, canPropose, isComplete as isRunComplete, newRun, placeNode, toolDef } from '../../../../packages/problem-solver/machine.mjs';
import { defaultToolFor, firstStep, nextStepAfter, planStep, stepName } from '../../../../packages/problem-solver/steps.mjs';

const PROPOSALS_MAX = 40;
const REVIEW_AFTER_DAYS = 14;
const DAY_MS = 86_400_000;

const reviewTitle = (session) => `Review: ${session.title}`.slice(0, TITLE_MAX);
const addDays = (iso, days) => new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
const inBook = (session, stepId, book) => Boolean(session.model && planStep(session.model.id, stepId)?.book.includes(book));

/** Add the coach's proposals for placed nodes the tool lets become tasks, once per node. */
function addProposals(session, items, deps) {
  const run = activeRun(session);
  if (!run || !items?.length) return session;
  let list = session.proposedTasks ?? [];
  for (const item of items) {
    const node = run.nodes.find((n) => n.slot === item.slot);
    if (!node || !canPropose(run, node)) continue;
    // One live proposal per node. A node whose task was deleted in Tasks is never proposed again.
    if (list.some((p) => p.source.nodeId === node.id && (p.status !== 'dismissed' || p.removed))) continue;
    if (list.length >= PROPOSALS_MAX) break;
    list = [...list, { id: deps.newId(), title: item.title.slice(0, TITLE_MAX), status: 'proposed', due: item.due ?? null, source: { runId: run.id, nodeId: node.id } }];
  }
  return { ...session, proposedTasks: list };
}
```

- `createSession`: add `proposedTasks: [], reviewProposal: null, reviewTaskId: null`.
- `applyCoachTurn`: after the `if (mode === 'boundary') … else if … else if (currentStep(next)) { … }` block, add:

```js
  if (mode !== 'boundary' && currentStep(next)) {
    next = addProposals(next, turn.proposeTasks, deps);
    if (turn.proposeReview && inBook(next, next.phase, 'implement') && !next.reviewTaskId) {
      next = { ...next, reviewProposal: { title: reviewTitle(next), due: turn.proposeReview.due, reason: turn.proposeReview.reason, status: 'proposed' } };
    }
  }
```

- `moveOn`: after `next` has the leaving step's status and before switching phase:

```js
  if (inBook(session, leaving, 'implement') && status === 'done' && !session.reviewTaskId && !session.reviewProposal) {
    next = { ...next, reviewProposal: { title: reviewTitle(session), due: addDays(deps.now(), REVIEW_AFTER_DAYS), reason: 'A first look at how the plan is going.', status: 'proposed' } };
  }
```

- New exports:

```js
const findProposal = (session, id) => {
  const proposal = (session.proposedTasks ?? []).find((p) => p.id === id);
  if (!proposal) throw fail(404, 'not_found', 'That proposed task is gone.');
  return proposal;
};
const withProposal = (session, id, patch) => ({ ...session, proposedTasks: session.proposedTasks.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

/** The page created the task through the Tasks API; record its id. Same id again is a no-op. */
export function confirmTask(session, payload, deps) {
  const taskId = typeof payload?.taskId === 'string' ? payload.taskId.trim() : '';
  if (!taskId || taskId.length > 200) throw fail(400, 'validation_error', 'A task id is required.');
  const proposal = findProposal(session, payload.proposalId);
  if (proposal.status === 'confirmed' && proposal.taskId === taskId) return session;
  if (proposal.status !== 'proposed') throw fail(409, 'action_not_allowed', proposal.status === 'confirmed' ? 'That task is already created.' : 'That proposal was set aside.');
  return touch(withProposal(session, proposal.id, { status: 'confirmed', taskId }), deps);
}

/**
 * Set a proposal aside; a confirmed one only reverts when its task was deleted in Tasks.
 * Deleted tasks (Adam's decision): the Kanban card shows "Task removed", the proposal is
 * dismissed with `removed: true`, the coach is not told (it never appears in the prompt)
 * and the node is never proposed again.
 */
export function dismissTask(session, payload, deps) {
  const proposal = findProposal(session, payload?.proposalId);
  if (proposal.status === 'dismissed') return session;
  if (proposal.status === 'confirmed' && payload?.reason !== 'removed') throw fail(409, 'action_not_allowed', 'That task already exists; change it in Tasks.');
  return touch(withProposal(session, proposal.id, { status: 'dismissed', ...(proposal.status === 'confirmed' ? { removed: true } : {}) }), deps);
}

/** The page created the review task; record it with the date the person picked. */
export function setReviewTask(session, payload, deps) {
  const taskId = typeof payload?.taskId === 'string' ? payload.taskId.trim() : '';
  if (!taskId || taskId.length > 200) throw fail(400, 'validation_error', 'A task id is required.');
  if (session.reviewTaskId && session.reviewTaskId !== taskId) throw fail(409, 'action_not_allowed', 'This problem already has a review task.');
  if (session.reviewTaskId === taskId) return session;
  const due = /^\d{4}-\d{2}-\d{2}$/.test(payload?.due ?? '') ? payload.due : session.reviewProposal?.due ?? addDays(deps.now(), REVIEW_AFTER_DAYS);
  const proposal = session.reviewProposal ?? { title: reviewTitle(session), reason: '', due };
  return touch({ ...session, reviewTaskId: taskId, reviewProposal: { ...proposal, due, status: 'confirmed' } }, deps);
}

export function dismissReview(session, deps) {
  if (!session.reviewProposal || session.reviewProposal.status !== 'proposed') throw fail(409, 'action_not_allowed', 'There is no review to set aside.');
  return touch({ ...session, reviewProposal: { ...session.reviewProposal, status: 'dismissed' } }, deps);
}
```

- `summaryRow`: add `taskIds: (session.proposedTasks ?? []).filter((p) => p.status === 'confirmed').map((p) => p.taskId)` and `reviewTaskId: session.reviewTaskId ?? null`.

`migrate.mjs`:

```js
const TASK_FIELDS = Object.freeze({ proposedTasks: [], reviewProposal: null, reviewTaskId: null });

/** Sessions saved before Plan 5 gain the task fields; nothing is written until the next save. */
function withTaskFields(session) {
  if (!session || !Array.isArray(session.turns) || Object.keys(TASK_FIELDS).every((key) => key in session)) return session;
  return { ...structuredClone(TASK_FIELDS), ...session };
}
```

Wrap both exits of `migrateSession`: the early `return session` for v2 sessions becomes `return withTaskFields(session)`, and the migrated v1 result is passed through `withTaskFields` too.

`prompts.mjs`:
- `RUBRIC`, SESSION SHAPE, add item 7:
  `7. Tasks: in Implement, when a card, a do-first item or a chosen 15% action is specific enough to start (a clear action, ideally an owner and a date), offer it as a real task in "proposeTasks" with its slot and a short task title. Only slots listed under "Can become tasks" qualify. The person confirms each one on a card; never say a task exists until TASKS shows it confirmed. Before Implement ends, propose a dated review in "proposeReview", timed for when the first results should show (a date after TODAY).`
- `RUBRIC`, OUTPUT: add `,"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}],"proposeReview":{"due":"YYYY-MM-DD","reason":"..."}|null` to the JSON shape, and the sentence `Include "proposeTasks" and "proposeReview" only in Implement.`
- `runLines`: when `def.taskSlots` exists, add `Can become tasks: ${open.join(', ') || 'none yet'}` where `open` is the slots of nodes with `canPropose(run, node)`, no proposal for that node that is not dismissed, and no removed proposal for it. Import `canPropose` from machine.mjs.
- `buildCoachPrompt`: after the EARLIER STEPS part, push the chosen option. Import `chosenOption` and `planStep` from steps.mjs:

```js
  const chosen = chosenOption(session);
  const books = session.model ? planStep(session.model.id, session.phase)?.book ?? [] : [];
  if (chosen && !books.includes('decide')) parts.push(`CHOSEN OPTION (the aim for Implement): ${chosen.text}${chosen.contested ? ' (kept against the coach\'s objection)' : ''}`);
  else if (!chosen && books.includes('implement')) parts.push('CHOSEN OPTION: none recorded. Ask what was decided and confirm it as the aim before placing anything.');
```

  (Inside a Decide step the run lines already show the `choice` slot, so the line is not repeated there.)
- `buildCoachPrompt`: push `TODAY: ${String(session.updatedAt ?? '').slice(0, 10)}` after the PHASE line, and push `taskLines(session)` when it is non-null:

```js
function taskLines(session) {
  // Proposals whose task was deleted in Tasks are left out: the coach is not told about them.
  const tasks = (session.proposedTasks ?? []).filter((p) => !p.removed);
  if (!tasks.length && !session.reviewProposal && !session.reviewTaskId) return null;
  const lines = tasks.map((p) => `  ${p.status}: "${p.title}"${p.due ? ` due ${p.due}` : ''}`);
  const review = session.reviewTaskId ? `created for ${session.reviewProposal?.due ?? 'its date'}` : session.reviewProposal ? `${session.reviewProposal.status} for ${session.reviewProposal.due}` : 'none yet';
  return `TASKS FROM THIS PROBLEM:\n${lines.join('\n') || '  none'}\nREVIEW TASK: ${review}`;
}
```

- [ ] **Step 5: Run all root Problem Solver tests. Expect PASS.**

- [ ] **Step 6: Commit**: `Problem Solver: proposed tasks and the review proposal` (with trailer).

---

### Task 8: Service actions, the linked lookup and the handler

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/service.mjs`, `netlify/functions/problem-solver.mjs`, `apps/tasks/scripts/mock-api.ts`
- Test: `tests/unit/problem-solver-service.test.js`, `tests/unit/problem-solver-http.test.js`

- [ ] **Step 1: Failing tests**

`tests/unit/problem-solver-service.test.js`:

```js
import { createSession, confirmTask } from '../../netlify/functions/_shared/problem-solver/session.mjs';

const NOW = '2026-10-19T10:00:00.000Z';
const uuid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

async function seeded(patch) {
  const store = createMemoryProblemStore();
  let i = 100;
  const deps = { now: () => NOW, newId: () => uuid((i += 1)) };
  const base = { ...createSession({ text: 'Late rota.' }, deps), runner: { status: 'idle', mode: 'turn', error: null }, ...patch };
  await store.write('op', base.id, base, null);
  const svc = createProblemSolverService({ store, coach: async () => { throw new Error('the coach must not run'); }, now: () => NOW, newId: deps.newId });
  return { svc, store, id: base.id };
}

test('confirm_task, dismiss_task, set_review_task and dismiss_review apply their payloads without the coach', async () => {
  const proposal = { id: 'p1', title: 'Draft', status: 'proposed', due: null, source: { runId: 'k', nodeId: 'n' } };
  const { svc, id } = await seeded({ proposedTasks: [proposal, { ...proposal, id: 'p2' }], reviewProposal: { title: 'Review: Late rota.', due: '2026-11-02', reason: '', status: 'proposed' } });
  let s = await svc.get('op', id);
  s = await svc.action('op', { id, revision: s.revision, requestId: 'a1', action: 'confirm_task', payload: { proposalId: 'p1', taskId: 'task-1' } });
  assert.equal(s.proposedTasks[0].taskId, 'task-1');
  assert.equal(s.runner.status, 'idle');
  s = await svc.action('op', { id, revision: s.revision, requestId: 'a2', action: 'dismiss_task', payload: { proposalId: 'p2' } });
  assert.equal(s.proposedTasks[1].status, 'dismissed');
  s = await svc.action('op', { id, revision: s.revision, requestId: 'a3', action: 'set_review_task', payload: { taskId: 'review-1', due: '2026-11-05' } });
  assert.equal(s.reviewTaskId, 'review-1');
  await assert.rejects(svc.action('op', { id, revision: s.revision, requestId: 'a4', action: 'dismiss_review' }), (err) => err.status === 409);
});

test('linked lists sessions that link, created or review a task, and rejects bad refs', async () => {
  const { svc, store, id } = await seeded({ links: [{ kind: 'project', id: 'proj-1' }], proposedTasks: [{ id: 'p1', title: 'Draft', status: 'confirmed', taskId: 'task-1', due: null, source: { runId: 'k', nodeId: 'n' } }], reviewTaskId: 'review-1' });
  assert.deepEqual((await svc.linked('op', 'task:task-1')).map((row) => [row.id, row.role]), [[id, 'task']]);
  assert.deepEqual((await svc.linked('op', 'task:review-1')).map((row) => row.role), ['review']);
  assert.deepEqual((await svc.linked('op', 'project:proj-1')).map((row) => row.role), ['link']);
  assert.deepEqual(await svc.linked('op', 'task:other'), []);
  await assert.rejects(svc.linked('op', 'goal:x'), (err) => err.status === 400);
  void store;
});
```

`tests/unit/problem-solver-http.test.js`: add a GET with `?linked=task:task-1` that returns `200` and `{ sessions: [...] }`, following the file's existing request helpers.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

`service.mjs`: import `confirmTask, dismissTask, setReviewTask, dismissReview`. Add to `ACTIONS`:

```js
    confirm_task: (s, body) => confirmTask(s, body.payload ?? {}, deps),
    dismiss_task: (s, body) => dismissTask(s, body.payload ?? {}, deps),
    set_review_task: (s, body) => setReviewTask(s, body.payload ?? {}, deps),
    dismiss_review: (s) => dismissReview(s, deps),
```

The busy check stays: these actions are refused while the coach is thinking, because a write during a run would make the run's save conflict and lose the coach turn. The page waits for the coach to settle before confirming (Task 9).

Move the body of `list` into a local `async function listRows(owner, opts)` and use it from `list` and from:

```js
    /** Sessions that link to, created, or review a task or project, for the chips on its page. */
    async linked(owner, ref) {
      const match = /^(task|project):(.{1,200})$/.exec(String(ref ?? ''));
      if (!match) throw httpError(400, 'validation_error', 'linked must be task:<id> or project:<id>.');
      const [, kind, id] = match;
      const rows = await listRows(owner, { limit: 500 });
      return rows.filter((row) => row.status !== 'archived').flatMap((row) => {
        const role = kind === 'task' && row.reviewTaskId === id ? 'review'
          : kind === 'task' && (row.taskIds ?? []).includes(id) ? 'task'
            : (row.links ?? []).some((l) => l.kind === kind && l.id === id) ? 'link' : null;
        return role ? [{ id: row.id, title: row.title, phase: row.phase, model: row.model, role }] : [];
      });
    },
```

`netlify/functions/problem-solver.mjs`, GET branch: before the `list` check, `if (url.searchParams.has('linked')) return withCors(okResponse(200, { sessions: await service.linked(owner(env), url.searchParams.get('linked')) }), request, env);`.

`apps/tasks/scripts/mock-api.ts`, `/api/problem-solver` GET: the same, returning `json(200, { ok: true, data: { sessions: await problemSolver.linked('operator', url.searchParams.get('linked') ?? '') } })`.

- [ ] **Step 4: Run all root Problem Solver tests. Expect PASS.**

- [ ] **Step 5: Commit**: `Problem Solver: task actions and linked lookup` (with trailer).

---

### Task 9: The Tasks bridge, confirm cards and live statuses (FULL REVIEW)

**Files:**
- Create: `apps/tasks/src/views/problem-solver/task-bridge.ts`, `apps/tasks/src/views/problem-solver/task-cards.ts`
- Modify: `apps/tasks/src/views/problem-solver/api.ts`, `coach-panel.ts`, `canvas.ts`, `view.ts`, `packages/problem-solver/problem-solver.css`
- Test: `apps/tasks/tests/unit/problem-solver-task-bridge.test.ts`, `apps/tasks/tests/unit/problem-solver-task-cards.test.ts`, `apps/tasks/tests/unit/problem-solver-api.test.ts`

Task creation goes through the existing `tasksApi.createTask` (`apps/tasks/src/services/client-api.ts`), which posts to `/api/tasks` and calls `notifyTasksChanged`. `TaskCreateSchema` requires `title` and `domain`; everything else is optional. Statuses are the hub's stock ids (`open`, `in_progress`, `done`, `deferred`, `dead`).

- [ ] **Step 1: API additions** in `api.ts`:

```ts
  /** An action with a JSON payload (task confirmations, review). */
  actWith: (session: PsSession, action: PsAction, payload: Record<string, unknown>) =>
    apiPost<{ session: PsSession }>('/api/problem-solver', { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action, payload }).then((r) => r.session),
  /** Sessions linked to a task or project, for the chip on its page. */
  linked: (ref: string) =>
    apiGet<{ sessions: PsLinkedSession[] }>(`/api/problem-solver?linked=${encodeURIComponent(ref)}`).then((r) => r.sessions),
```

with, at the top of `api.ts` (import `PsModelId` from types):

```ts
export type PsLinkedSession = { id: string; title: string; phase: string; model: PsModelId | null; role: 'link' | 'task' | 'review' };
```

Add an api test that `actWith` posts `{ action, payload }` with the revision, using the file's existing fetch stub.

- [ ] **Step 2: Failing bridge tests**

```ts
// apps/tasks/tests/unit/problem-solver-task-bridge.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createTaskBridge, reviewBody, taskBody } from '../../src/views/problem-solver/task-bridge';
import type { PsProposedTask, PsSession } from '../../../../packages/problem-solver/types';

const session = { id: 's1', title: 'Late rota', revision: 4, links: [{ kind: 'project', id: 'proj-1' }], proposedTasks: [], reviewProposal: null, reviewTaskId: null } as unknown as PsSession;
const proposal: PsProposedTask = { id: 'p1', title: 'Draft the template', status: 'proposed', due: '2026-10-24', source: { runId: 'k', nodeId: 'n1' } };

describe('task bodies', () => {
  it('a proposed task becomes a Tasks body tagged and sourced from Problem Solver, under the linked project', () => {
    expect(taskBody(session, { title: 'Draft the rota template', due: '2026-10-24' }, 'life')).toEqual({
      title: 'Draft the rota template', domain: 'life', due_date: '2026-10-24', description: 'From Problem Solver: Late rota', source: 'problem_solver', tags: ['problem-solver'], parent_project_id: 'proj-1'
    });
  });
  it('the review task carries review_at and the review tag', () => {
    expect(reviewBody(session, { title: 'Review: Late rota', due: '2026-11-02' }, 'life')).toMatchObject({ title: 'Review: Late rota', due_date: '2026-11-02', review_at: '2026-11-02', tags: ['problem-solver', 'review'] });
  });
});

describe('createTaskBridge', () => {
  it('creates the task then confirms it; a failed confirm retries without creating twice', async () => {
    const createTask = vi.fn().mockResolvedValue({ id: 'task-1' });
    const confirm = vi.fn().mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: 'conflict' })).mockResolvedValue(undefined);
    const bridge = createTaskBridge({ createTask, getTask: vi.fn(), domainFor: async () => 'life', confirm, dismiss: vi.fn(), setReview: vi.fn() });
    await expect(bridge.create(session, proposal, { title: 'Draft', due: null })).rejects.toThrow('conflict');
    await bridge.create(session, proposal, { title: 'Draft', due: null });
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenLastCalledWith('p1', 'task-1');
  });
  it('statuses: found tasks give their status; a 404 gives removed and dismisses the proposal', async () => {
    const getTask = vi.fn(async (id: string) => {
      if (id === 'gone') throw Object.assign(new Error('Task not found'), { status: 404 });
      return { id, status: 'in_progress' };
    });
    const dismiss = vi.fn().mockResolvedValue(undefined);
    const bridge = createTaskBridge({ createTask: vi.fn(), getTask, domainFor: async () => 'life', confirm: vi.fn(), dismiss, setReview: vi.fn() });
    const confirmed = (id: string, taskId: string): PsProposedTask => ({ ...proposal, id, status: 'confirmed', taskId });
    const statuses = await bridge.statuses([confirmed('a', 'task-1'), confirmed('b', 'gone')]);
    expect(statuses).toEqual({ 'task-1': 'in_progress', gone: 'removed' });
    expect(dismiss).toHaveBeenCalledWith('b', 'removed');
  });
  it('a network failure leaves the status unknown and dismisses nothing', async () => {
    const dismiss = vi.fn();
    const bridge = createTaskBridge({ createTask: vi.fn(), getTask: vi.fn().mockRejectedValue(new Error('offline')), domainFor: async () => 'life', confirm: vi.fn(), dismiss, setReview: vi.fn() });
    expect(await bridge.statuses([{ ...proposal, status: 'confirmed', taskId: 't' }])).toEqual({ t: 'unknown' });
    expect(dismiss).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Implement the bridge**

```ts
// apps/tasks/src/views/problem-solver/task-bridge.ts
// The only place Problem Solver writes to Tasks. The server never does: the page creates
// the task through tasksApi, then tells the session its id (confirm_task / set_review_task).
import type { PsProposedTask, PsSession } from '../../../../../packages/problem-solver/types';

export type TaskEdits = { title: string; due: string | null };
type Deps = {
  createTask(body: Record<string, unknown>): Promise<{ id: string }>;
  getTask(id: string): Promise<{ id: string; status: string }>;
  domainFor(session: PsSession): Promise<string>;
  confirm(proposalId: string, taskId: string): Promise<void>;
  dismiss(proposalId: string, reason?: 'removed'): Promise<void>;
  setReview(taskId: string, due: string): Promise<void>;
};

const projectOf = (session: PsSession) => session.links.find((link) => link.kind === 'project')?.id ?? null;

export function taskBody(session: PsSession, edits: TaskEdits, domain: string): Record<string, unknown> {
  return {
    title: edits.title.trim().slice(0, 120),
    domain,
    due_date: edits.due,
    description: `From Problem Solver: ${session.title}`,
    source: 'problem_solver',
    tags: ['problem-solver'],
    parent_project_id: projectOf(session)
  };
}

export function reviewBody(session: PsSession, edits: { title: string; due: string }, domain: string): Record<string, unknown> {
  return { ...taskBody(session, edits, domain), review_at: edits.due, description: `Review how the plan for "${session.title}" is going, then open the problem to work through Improve.`, tags: ['problem-solver', 'review'] };
}

export function createTaskBridge(deps: Deps) {
  /** Proposal id → created task id, kept until the confirm lands so a retry never creates twice. */
  const created = new Map<string, string>();
  let reviewCreated: string | null = null;
  return {
    async create(session: PsSession, proposal: PsProposedTask, edits: TaskEdits): Promise<void> {
      let taskId = created.get(proposal.id);
      if (!taskId) {
        taskId = (await deps.createTask(taskBody(session, edits, await deps.domainFor(session)))).id;
        created.set(proposal.id, taskId);
      }
      await deps.confirm(proposal.id, taskId);
      created.delete(proposal.id);
    },
    async createReview(session: PsSession, edits: { title: string; due: string }): Promise<void> {
      if (!reviewCreated) reviewCreated = (await deps.createTask(reviewBody(session, edits, await deps.domainFor(session)))).id;
      await deps.setReview(reviewCreated, edits.due);
      reviewCreated = null;
    },
    /** Live status per confirmed task id: its status, 'removed' (404; the proposal is dismissed) or 'unknown'. */
    async statuses(proposals: PsProposedTask[]): Promise<Record<string, string>> {
      const confirmed = proposals.filter((p) => p.status === 'confirmed' && p.taskId);
      const out: Record<string, string> = {};
      await Promise.all(confirmed.map(async (p) => {
        try {
          out[p.taskId!] = (await deps.getTask(p.taskId!)).status;
        } catch (err) {
          const status = (err as { status?: number }).status;
          out[p.taskId!] = status === 404 ? 'removed' : 'unknown';
          if (status === 404) await deps.dismiss(p.id, 'removed').catch(() => undefined);
        }
      }));
      return out;
    }
  };
}
```

Check how `apiGet` errors expose the HTTP status (read `ApiClientError` in `apps/tasks/src/api/client.ts`) and use that field in place of `status` if it differs; keep the test's fake in step.

- [ ] **Step 4: Failing card tests**

```ts
// apps/tasks/tests/unit/problem-solver-task-cards.test.ts
import { describe, expect, it, vi } from 'vitest';
import { mountTaskCards } from '../../src/views/problem-solver/task-cards';
import type { PsSession } from '../../../../packages/problem-solver/types';

const base = { id: 's', title: 'Late rota', runner: { status: 'idle', mode: 'turn', error: null }, proposedTasks: [], reviewProposal: null, reviewTaskId: null } as unknown as PsSession;
const p = (id: string, status = 'proposed') => ({ id, title: `Task ${id}`, status, due: '2026-10-24', source: { runId: 'k', nodeId: id } });
const handlers = () => ({ create: vi.fn().mockResolvedValue(undefined), dismiss: vi.fn().mockResolvedValue(undefined), createReview: vi.fn().mockResolvedValue(undefined), dismissReview: vi.fn().mockResolvedValue(undefined) });

describe('task cards', () => {
  it('one card per proposed task; confirmed and dismissed ones show none', () => {
    const cards = mountTaskCards(handlers());
    cards.update({ ...base, proposedTasks: [p('a'), p('b', 'confirmed'), p('c', 'dismissed')] } as PsSession);
    expect(cards.el.querySelectorAll('.ps-taskcard')).toHaveLength(1);
  });
  it('edits survive an update and are sent on Create task', async () => {
    const h = handlers();
    const cards = mountTaskCards(h);
    const s = { ...base, proposedTasks: [p('a')] } as PsSession;
    cards.update(s);
    const title = cards.el.querySelector<HTMLInputElement>('.ps-taskcard input[name="title"]')!;
    title.value = 'Draft the rota template';
    cards.update(s);
    expect(cards.el.querySelector<HTMLInputElement>('.ps-taskcard input[name="title"]')).toBe(title);
    cards.el.querySelector<HTMLButtonElement>('[data-act="create"]')!.click();
    await Promise.resolve();
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), { title: 'Draft the rota template', due: '2026-10-24' });
  });
  it('a failed create keeps the card, shows the error and re-enables the button', async () => {
    const h = handlers();
    h.create.mockRejectedValueOnce(new Error('Tasks is offline'));
    const cards = mountTaskCards(h);
    cards.update({ ...base, proposedTasks: [p('a')] } as PsSession);
    const button = cards.el.querySelector<HTMLButtonElement>('[data-act="create"]')!;
    button.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(cards.el.querySelector('.ps-taskcard__error')!.textContent).toContain('Tasks is offline');
    expect(button.disabled).toBe(false);
  });
  it('buttons are disabled while the coach is thinking', () => {
    const cards = mountTaskCards(handlers());
    cards.update({ ...base, runner: { status: 'running', mode: 'turn', error: null }, proposedTasks: [p('a')] } as PsSession);
    expect(cards.el.querySelector<HTMLButtonElement>('[data-act="create"]')!.disabled).toBe(true);
  });
  it('the review card shows a date picker set to the proposal date, and sends the picked date', async () => {
    const h = handlers();
    const cards = mountTaskCards(h);
    cards.update({ ...base, reviewProposal: { title: 'Review: Late rota', due: '2026-11-02', reason: 'A first look.', status: 'proposed' } } as PsSession);
    const date = cards.el.querySelector<HTMLInputElement>('.ps-reviewcard input[type="date"]')!;
    expect(date.value).toBe('2026-11-02');
    date.value = '2026-11-09';
    cards.el.querySelector<HTMLButtonElement>('[data-act="create-review"]')!.click();
    await Promise.resolve();
    expect(h.createReview).toHaveBeenCalledWith({ title: 'Review: Late rota', due: '2026-11-09' });
  });
});
```

- [ ] **Step 5: Implement the cards** (`task-cards.ts`):
  - `mountTaskCards(handlers: { create(p, edits); dismiss(p); createReview(edits); dismissReview() }): { el: HTMLElement; update(session: PsSession): void }`.
  - The root is `section.ps-taskcards` with `aria-label="Proposed tasks"`. It is empty and `hidden` when nothing is proposed.
  - Cards are keyed by proposal id in a `Map` and kept between updates, so typed edits survive polling. A card whose proposal is no longer `proposed` is removed.
  - Each card is `article.ps-taskcard.confirm-card` and holds:
    - a meta line "Make this a task?";
    - a title `input[name="title"]` with a visible label;
    - a due `input[type="date"][name="due"]`;
    - `button[data-act="create"]` "Create task" (`btn--primary`) and `button[data-act="dismiss"]` "Not this one" (`btn--ghost`);
    - `p.ps-taskcard__error[role="alert"]`, empty until a failure.
  - While a click is in flight, the button reads "Creating…" and both buttons are disabled. On failure, show `errorMessage(err)` (from `@/views/feedback`) and re-enable. While the coach is busy (`runner.status` queued or running), both buttons are disabled with the hint "Waiting for the coach…".
  - The review card is `article.ps-reviewcard.confirm-card`, shown while `reviewProposal?.status === 'proposed'` and `!reviewTaskId`:
    - a title input;
    - a date input defaulting to the proposal's due date, with `min` set to today;
    - the reason text;
    - `button[data-act="create-review"]` "Create review task" and `button[data-act="dismiss-review"]` "Not now".
  - Every button and input is at least 44px tall. On a phone the fields stack.
  - Styles go under `/* Task confirm cards */` in `problem-solver.css`, reusing the `ps-suggestion` card look.

- [ ] **Step 6: Wire it into the page**

- `coach-panel.ts`: `mountCoachPanel(handlers, slots: { cards?: HTMLElement } = {})` inserts `slots.cards` between `extras` and the form once (`panel.insertBefore(slots.cards, form)`), so the cards keep their DOM when `extras` is replaced.
- `canvas.ts`:
  - Widen `Scores` to `Record<string, unknown>` and `RunScores` to `{ runId: string; [series: string]: unknown }`; the decision matrix sends a mode and a matrix.
  - Add `setTasks?(links: PsTaskLink[]): void` to `View`.
  - Add `setTaskStatuses(statuses: Record<string, string>)` to the returned canvas object. It stores the map and calls `pushTasks()`, which, for the run on screen, calls `view.setTasks?.(links)` with `links = last.proposedTasks.filter((p) => p.status === 'confirmed' && p.source.runId === run.id).map((p) => ({ nodeId: p.source.nodeId, taskId: p.taskId!, status: statuses[p.taskId!] ?? 'unknown' }))`.
  - Call `pushTasks()` at the end of `showChart` as well.
  - **Aim caption.** When the run on screen belongs to an Implement tool (`TOOLS[run.tool].step === 'implement'`) and `chosenOption(session)` is not null, `showChart` puts `p.ps-canvas__aim` under the heading: a small "Aim" meta and the choice's title, with the full text in its `title` attribute. It is absent otherwise. Test it in `apps/tasks/tests/unit/problem-solver-canvas-aim.test.ts`: mount the canvas on a host with a session in `implement` holding an active kanban run and a Decide run with a `choice` node; `.ps-canvas__aim` contains the choice title. Remove the Decide run and update; the caption is gone.
- `view.ts`, in `renderSession`:
  - Build the bridge:

```ts
const bridge = createTaskBridge({
  createTask: (body) => tasksApi.createTask(body),
  getTask: (id) => tasksApi.getTask(id),
  domainFor: (s) => domainFor(s),
  confirm: (proposalId, taskId) => confirmed('confirm_task', { proposalId, taskId }),
  dismiss: (proposalId, reason) => confirmed('dismiss_task', { proposalId, ...(reason ? { reason } : {}) }),
  setReview: (taskId, due) => confirmed('set_review_task', { taskId, due })
});
```

  - `confirmed(action, payload)`:
    - wait for `settle()` while the session is busy;
    - post `actWith`;
    - on a `conflict` error, refetch the session and post once more with the new revision;
    - `paint` the result;
    - rethrow any other error, so the card shows it.
  - `domainFor(session)`: when the session links a task, fetch that task once and use its `domain`; otherwise use `'life'` (Decision 1). Cache the result per session.
  - `mountTaskCards({ create: (p, e) => bridge.create(session, p, e), dismiss: (p) => confirmed('dismiss_task', { proposalId: p.id }), createReview: (e) => bridge.createReview(session, e), dismissReview: () => confirmed('dismiss_review', {}) })`. Pass its `el` as `cards` to `mountCoachPanel`, and call `cards.update(session)` in `paint`.
  - Live statuses: in `paint`, when the sorted list of confirmed task ids changes, call `refreshStatuses()`. It runs `bridge.statuses(session.proposedTasks)` and then `diagram.setTaskStatuses(map)`.
  - Also refresh on `onTasksChanged`, on `onTasksDeleted` (from `@/services/task-cache`) and on `visibilitychange` to visible. Store the unsubscribe functions beside `diagramNow`, and call them in `renderProblemSolverView` when the page changes.

- [ ] **Step 7:** Run the bridge, cards, api and view tests, all Tasks Problem Solver tests and the type gate. Expect PASS.

- [ ] **Step 8: Commit**: `Problem Solver: confirm cards create real tasks and the review task` (with trailer).

---

### Task 10: Problem Solver chips on linked pages, and resuming at Improve

**Files:**
- Create: `apps/tasks/src/views/problem-solver/link-chips.ts`
- Modify: `apps/tasks/src/views/page-editor.ts`, `apps/tasks/src/views/problem-solver/view.ts`, `packages/problem-solver/problem-solver.css`
- Test: `apps/tasks/tests/unit/problem-solver-link-chips.test.ts`, `apps/tasks/tests/unit/problem-solver-view.test.ts`

- [ ] **Step 1: Failing tests**

```ts
// apps/tasks/tests/unit/problem-solver-link-chips.test.ts
import { describe, expect, it, vi } from 'vitest';
import { problemSolverChips } from '../../src/views/problem-solver/link-chips';

describe('problemSolverChips', () => {
  it('shows one chip per session; a review chip opens the session at Improve', async () => {
    const linked = vi.fn().mockResolvedValue([{ id: 's1', title: 'Late rota', phase: 'implement', model: 'seven_step', role: 'review' }, { id: 's2', title: 'Noisy office', phase: 'analyse', model: 'seven_step', role: 'task' }]);
    const host = problemSolverChips({ kind: 'task', id: 't1' }, { linked });
    await vi.waitFor(() => expect(host.querySelectorAll('a.ps-linkchip')).toHaveLength(2));
    const [review, task] = [...host.querySelectorAll<HTMLAnchorElement>('a.ps-linkchip')];
    expect(review.getAttribute('href')).toBe('#/problem-solver?id=s1&step=improve');
    expect(review.textContent).toContain('Review');
    expect(task.getAttribute('href')).toBe('#/problem-solver?id=s2');
    expect(linked).toHaveBeenCalledWith('task:t1');
  });
  it('stays hidden when nothing links here or the lookup fails', async () => {
    const host = problemSolverChips({ kind: 'project', id: 'p1' }, { linked: vi.fn().mockRejectedValue(new Error('offline')) });
    await new Promise((r) => setTimeout(r, 0));
    expect(host.hidden).toBe(true);
  });
});
```

In `problem-solver-view.test.ts`, add a test for the exported `resumeTarget(session, wanted)`:
- it returns `'improve'` for a seven_step session in `implement` with `wanted = 'improve'`;
- it returns `'evaluate'` for a polya session in `implement`;
- it returns null when the session is already at or past that step, or when the step is not next.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**
  - `link-chips.ts`:
    - `problemSolverChips(ref, api = problemSolverApi)` returns a `span.ps-linkchips` that starts `hidden`.
    - It fetches `api.linked(`${ref.kind}:${ref.id}`)` and, for each session, adds `a.ps-linkchip` with the Problem Solver mark (the `problemMedal` art is too big; use the tool emblem of the session's last tool if known, otherwise a small three-colour dot) and the text `Problem Solver: <title>`. A review chip's text is `Review in Problem Solver: <title>`.
    - Review chips link to `#/problem-solver?id=<id>&step=improve`, others to `#/problem-solver?id=<id>`. Each chip is at least 44px tall.
    - It shows the host when at least one chip exists. Failures leave it hidden.
  - `page-editor.ts`: in `paintTaskPage` after `head.append(backLink('#/board', '← Dashboard'))`, add `head.append(problemSolverChips({ kind: 'task', id: task.id }))`. In `paintProjectPage` after `head.append(backLink('#/projects', '← Projects'))`, add the project equivalent. Use a dynamic `import()` only if the static import pulls Problem Solver CSS into every page; the chip styles live in `problem-solver.css`, so put the chip's few rules in `apps/tasks/src/views/problem-solver/link-chips.css` imported by `link-chips.ts` instead.
  - `view.ts`:
    - Export `resumeTarget(session, wanted)`. It maps the book step `wanted` to the plan step with `planStepForBook`, and returns it only when it is `nextStepAfter(session.model.id, session.phase)`.
    - In `renderSession`, read `hashQuery().get('step')`. When `resumeTarget` returns a step, show a banner `div.ps-resume[role="status"]` above the board: "This review picks up at <step name>." with a "Move on to <step name>" button that runs `act('move_on')` and removes the banner.
    - Otherwise show nothing. Plan 6 will make Improve itself read the review context.

- [ ] **Step 4:** Run the chip and view tests, the type gate. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: link chips on task and project pages; resume at Improve` (with trailer).

---

## Renderer tasks (11–18)

Each task gives the book page, the class prefix and container name, the composition, how it builds, the phone layout and the tool-specific tests on top of the eight baseline tests. Follow the shared contract and the addendum for everything else. Each renderer registers in `canvas.ts` `RENDERERS`, in `scripts/problem-solver-preview.mjs` `RENDERERS`, and adds an invented sample to `SAMPLES` (no real names, one contested node, a full run, scores where the tool has them, and a `<tool>:next` sample for scored tools so `--next` shows the morph). Each preview must pass `--audit` at 900 and 390.

**The chosen option in the four Decide renderers (Tasks 11–14).** Each one renders the `choice` node as a composed "Chosen option" card under its chart (`[data-choice]`), with a 3px blue top border like Problem statement's card, the full text, a details button and the contested tag when contested. It appears with the node, rising in, and never before. Where the choice names an option shown on the chart, do not try to match it automatically; the card is the record. Each of Tasks 11–14 adds this test: the `[data-choice]` card is absent until `choice` exists, then shows its full text; removing the node removes the card. Each sample in `SAMPLES` includes a `choice` node.

### Task 11: Decision matrix renderer with scoring (`render/decision-matrix.ts`, `createDecisionMatrixView`, prefix `ps-matrix`, container `matrix`) — FULL REVIEW

**Book:** `.ps-book/decision-matrix.png`.
- A red header band runs across the top. On its left it carries "Criteria" and "Weight", with a large red dome and a smaller red dome rising above the band there, so the left of the header is scalloped.
- Over each option column sits a yellow arched head with the option name. Under it, inside the red band, are two sub-heads, "Rating" and "Score".
- The body is yellow with thin paper rules between rows and columns. Each criterion row has a red half-disc tab bulging out of its left edge.
- Under each option column hangs a blue "Total" tag.

**Build:**
- **Frame:** the frame (the red header and the scalloped domes) appears with the first criterion or option. Use CSS grid: the first column is criteria, the second is weight, then two columns per option.
- **Rows and columns:**
  - Each criterion row (`[data-row="<index>"]`, its red tab and its title button) appears with its node and slides down into place.
  - Each option column (`[data-option="<index>"]`) appears with its node; its yellow dome rises (scaleY from the base).
- **Before scoring:** weight, rating and score cells show a faint dash. The Total tags are absent.
- **After a snapshot:**
  - Weight cells show "40%" in percent mode, or "Rank 3" in rank mode.
  - Rating cells show the rating; score cells show weight × rating, with one decimal and the percent weight divided by 100.
  - Totals come from `matrixTotals` and count up over 600ms from the previous snapshot. There is no count-up on the first render (addendum 8).
  - The leading option's column gets `.is-leading` and lifts 4px. On a tie, no column lifts and a small "Tied at the top" note sits under the totals.
- **Score form:** a "Score the options" button opens a form with:
  - a mode switch (Percent / Rank, radio buttons);
  - one weight input per criterion, labelled "Weight for <criterion title>", with a live line "Adds up to 85 of 100" (percent) or "Use 1 to n once each" (rank);
  - one fieldset per option with one 1–10 input per criterion, labelled "Rating for <option> on <criterion>".
  - Validate live with `decisionMatrix.validateScores` (import it from the tool). Save is disabled with that message shown until it passes.
  - Save calls `onScore({ mode, weights, ratings })` in slot order. Reopening the form fills it from the latest snapshot.
  - Escape closes the form first (addendum 10).
- **Contested** criteria and options show the contested tag on their title button.
- **Phone (`@container matrix (max-width: 560px)`):**
  - Show one option at a time. Option tabs (pills, 44px) sit above the grid, coded A, B, C with the option title. The grid shows the criteria, the weight and the selected option's rating and score.
  - A totals strip below lists every option's code, title and total. The selected tab follows the leader after a new snapshot only if the person has not picked a tab.
  - Criteria titles clamp to two lines inside their row.

**Tests:**
- Criteria render as `[data-row]` in slot order, and options as `[data-option]`.
- Before scores, there is no `[data-total]`.
- After the Task 3 sample snapshot, the totals read 6.8 and 7.2, and option 2 has `.is-leading`.
- A rank-mode tie shows no `.is-leading` and does show the tie note.
- A second snapshot keeps the row, column and total elements identical (`===`).
- The form: a percent sum of 90 disables Save and shows the message; a valid form calls `onScore` with `{ mode, weights, ratings }`.
- `layout(360)` sets `data-compact`, renders the option tabs, and clicking tab B shows option 2's cells.
- Removing an option removes its column, tab and total (addendum 7).

### Task 12: SWOT renderer (`render/swot.ts`, `createSwotView`, prefix `ps-swot`, container `swot`)

**Book:** `.ps-book/swot.png`.
- Two full-width blue bands sit on top: "Goal" and "Option".
- Down the left runs a blue side band split into "Internal" (upper) and "External" (lower), with vertical text.
- The 2×2 grid has yellow Strengths top-left, red Weaknesses top-right, yellow Opportunities bottom-left and red Threats bottom-right. Each quadrant has a heading and a one-line description.

**Build:**
- **Bands:** the Goal band appears with `goal` and shows its title. The Option band shows the selected option's title.
- **Quadrants:**
  - The grid appears with the first option.
  - Each quadrant shows its heading and a short description in our own words: "Helps, in your control"; "Holds it back, in your control"; "Could help, outside your control"; "Puts it at risk, outside your control".
  - Under the heading, the quadrant lists its items for the selected option as pill buttons (title only), each dropping in on arrival.
  - An item with no `of` edge (possible in older data) is listed in an "Unplaced" row under the grid.
- **Several options:** option tabs above the grid (44px pills, "Option 1: <title>"). The newest option with an item shows by default. Horizontal pointer swipes on the grid switch options. A tab change closes any open details card (addendum 9).
- **Synthesis:** a card under the grid with four small headings in our own words ("Build on", "Shrink", "Counter", "Convert") above the synthesis text.
- **Phone (`@container swot (max-width: 520px)`):** the side band becomes small meta headings ("Internal", "External") above the stacked quadrants, in the order S, W, O, T. Pills wrap.

**Tests:**
- A strength linked to option 1 renders in `[data-quadrant="strength"]`.
- Switching to option 2 shows only option 2's items, and an open card is closed.
- Unlinked items go in `.ps-swot__unplaced`.
- The synthesis card appears only with `synthesis`.
- The Goal band shows the goal title.

### Task 13: Morphological analysis renderer (`render/morphological.ts`, `createMorphologicalView`, prefix `ps-morph`, container `morph`) — FULL REVIEW

**Book:** `.ps-book/morphological.png`.
- A red header row holds the subject names. Under each subject is a column of attribute cells in alternating light and darker yellow rows, with thin paper gaps between columns.
- A scenario shows as one blue oval per column, the oval sitting on the chosen attribute, joined by a blue line that zig-zags from column to column.

**Build:**
- **Grid:**
  - The header appears with the first subject.
  - Each subject header (`[data-subject]`) appears with its node.
  - Attribute cells (`[data-attribute]`) fill their subject's column top to bottom, in edge order, each fading in.
- **Scenario:**
  - The selected scenario's picked cells become blue ovals with white text.
  - An SVG overlay draws a blue polyline through the oval centres (measured rect centres, reads batched before writes), drawing in left to right with stroke-dashoffset on change. It is recomputed on resize.
  - Several scenarios get tabs above the grid ("Scenario 1", "Scenario 2"). Other scenarios' ovals are not shown.
- **Contradictions:**
  - Each contradiction is a chip under the grid reading "<attribute A> cannot go with <attribute B>", with a details button.
  - Both of its cells get a small red corner notch.
  - A selected scenario that contains a contradictory pair draws its line dashed in `--ps-red`, with a ✕ marker at the midpoint between the two clashing ovals, and its tab shows "Clashes".
  - Hovering or focusing a chip outlines both cells.
- **Problem and evaluation:** the problem is a card above the grid. The evaluation is a card below it.
- **Phone (`@container morph (max-width: 560px)`):** keep the grid with codes. Subjects are S1–S6 in the header, and each cell shows a code such as "S2·3" instead of its text. A key list under the grid is grouped by subject: each subject heading, then its attributes with codes and titles. Key items are the 44px targets; cells carry `data-target-ok`. The scenario line still draws.

**Tests:**
- An attribute linked to subject 2 renders in subject 2's column.
- The selected scenario marks exactly one `.is-picked` cell per subject.
- The scenario line `[data-scenario-line]` exists only once a scenario exists.
- A clashing scenario has `data-consistent="false"` and a ✕ marker; a consistent one has `"true"`.
- Selecting the other tab moves `.is-picked` without replacing cell elements.
- The contradiction chip names both attributes.
- The compact layout shows codes and the key list.
- Removing a subject removes its column, its attributes, their key items and any scenario oval in that column.

### Task 14: Pareto renderer with data entry (`render/pareto.ts`, `createParetoView`, prefix `ps-pareto`, container `pareto`) — FULL REVIEW

**Book:** `.ps-book/pareto.png` (the chart) and `.ps-book/pareto-summary.png` (the 80/20 square).
- The chart is a red field with paper gridlines every tenth. It has a count axis on the left and a cumulative percent axis on the right.
- Yellow bars sit in descending order, each with its value inside near the top, and lettered A, B, C along the bottom.
- A blue cumulative line with dots rises left to right.
- A dashed line runs from 80% on the right axis across to the line, then straight down to the axis at the cut.
- The summary is a red-rimmed yellow square with a large "80", and a blue inset square in its lower right with "20".

**Build (SVG chart, HTML buttons over it):**
- **Before data:**
  - The target is a card above the chart, appearing with `target`.
  - Once items exist, the red field and gridlines appear with zero-height bars, a key list of items (codes A, B, … in slot order) and a "Waiting for the figures" note.
- **After a snapshot:** use `paretoRows`.
  - Bars order largest first; each bar's code follows its rank.
  - Heights morph over 600ms from the previous snapshot, and re-ordered bars glide by FLIP using bar centres. There is no animation on first render.
  - Value labels sit inside the top of each bar (above it when the bar is too short for the label, with `--ps-on-yellow` on paper).
  - The cumulative polyline and dots draw left to right.
  - The dashed 80% guide runs from the right axis to the point where the cumulative line first reaches 80% (interpolated between dots), then down. Vital bars carry `data-vital="true"`.
  - Left axis ticks scale to the largest figure (rounded up to a tidy step). Right axis ticks run 0–100%.
- **Key list:** code, title, figure and percent per row, in rank order; each row is a details button. The key items are the targets; the bars carry `data-target-ok`.
- **80/20 summary:** a small square after the chart, in the book's summary look (red rim, yellow field, blue inset). It shows the vital few's share (for example "90%") in the yellow and "3 of 4" (vital items of all items) in the blue inset, with a caption in our words, "The vital few".
- **Data form:** an "Add the data" button opens a form with one non-negative number input per item, labelled with its title, validated with `pareto.validateScores`. Save calls `onScore({ counts })` in slot order. The button reads "Update the data" after the first snapshot.
- **Phone (`@container pareto (max-width: 520px)`):** the chart keeps its proportions at full width, with axis labels at 10px minimum. The key list is the main reading surface.

**Tests:**
- Before data there are no `[data-bar-height]` values above zero, and the key list exists.
- After the Task 3 sample, the bar order by code is item:2, item:3, item:4, item:1, and `data-vital` is true, true, true, false.
- The 80% guide `[data-cut]` has its x between the third and fourth bars' centres.
- A second snapshot keeps bar elements identical.
- The form submits `{ counts }` in slot order, and a negative value disables Save.
- The summary shows "90%" and "3 of 4".
- Removing an item removes its bar, its key row and its dot.

### Task 15: DMAIC renderer (`render/dmaic.ts`, `createDmaicView`, prefix `ps-dmaic`, container `dmaic`)

**Book:** `.ps-book/dmaic.png`.
- Five rounded blue bands are stacked. Each has a red disc with a large yellow letter (D, M, A, I, C) at its left, a yellow right-pointing triangle, the phase name in white, and on the right the phase's description.
- A dashed yellow line runs down the right edge from beside Improve back up to Define, with an arrowhead at each end: an arrow points left into Define, and Improve has an arrowhead at its own end.

**Build:**
- **Bands:**
  - The five bands are present once the first `define` node exists. Each shows the letter disc, the triangle, the phase name and the node title for the pass shown.
  - A band whose node for that pass is not yet placed is faint (blue at reduced opacity, with paper text kept at full contrast by darkening rather than fading the text; addendum 5).
  - On arrival a band fills left to right (clip-path wipe on an inner layer, with the focus ring layered per addendum 4).
- **Repeat loop:** the dashed loop draws in (stroke-dashoffset) when `repeat:<pass>` exists, and a "Pass 2" badge appears beside the D disc.
- **Passes:** pass tabs ("Pass 1", "Pass 2", "Pass 3") show which pass's titles the bands carry. The default is the current pass. Each pass's `repeat` reason shows in a small card under the loop for that pass.
- **Control** shows on the C band and does not depend on the pass.
- **Phone (`@container dmaic (max-width: 480px)`):** the description moves under the phase name and the loop moves inside the right padding. Titles clamp to two lines.

**Tests:**
- `define:1` shows on the D band, and `[data-phase="measure"]` is faint until `measure:1` exists.
- The loop `[data-loop]` exists only after `repeat:1`.
- Pass tabs appear at pass 2, and selecting pass 1 shows pass 1's titles without replacing band elements.
- Control shows on C.

### Task 16: 15% solutions renderer (`render/fifteen-percent.ts`, `createFifteenPercentView`, prefix `ps-fifteen`, container `fifteen`)

**Book:** `.ps-book/fifteen-percent.png`. Three large discs are stacked vertically and touching:
- "What": red, with its top-right quarter blue and the word in yellow.
- "Now": yellow, with a red ring inside it and the word in blue.
- "Go": blue, with its top-left quarter red and the word in yellow.

**Build:**
- **What:** the What disc appears with `reflect`. Its title sits beside the disc (right on wide screens), with a details button.
- **Now:** the Now disc appears with the first action. Actions are pill buttons arranged beside the Now disc, alternating left and right on wide screens; each arrives sliding toward the disc.
- **Go:** the Go disc appears with the first `chosen`. Each chosen note moves its picked action's pill: the pill rolls (FLIP by measured centres, with a quarter turn on the inner wrapper) from beside Now to a list beside Go, with the chosen note's text as its details. A picked action keeps the same element (`===`).
- **Tasks:** a chosen action whose proposal is confirmed shows a small "Task" mark (from `setTasks`) with its live status label (To do, Doing, Done) as text.
- **Phone (`@container fifteen (max-width: 480px)`):** the discs shrink to container units and the action lists move under their disc.

**Tests:**
- Actions render in `[data-region="now"]`.
- After `chosen:1` picks `action:2`, action 2's element is in `[data-region="go"]` and is the same element.
- `setTasks([{ nodeId: <chosen id>, taskId: 't', status: 'in_progress' }])` shows "Doing" on that pill.
- The What disc is absent until `reflect`.

### Task 17: Kanban renderer with live task status (`render/kanban.ts`, `createKanbanView`, prefix `ps-kanban`, container `kanban`) — FULL REVIEW

**Book:** `.ps-book/kanban.png`.
- Three tall rounded columns:
  - red "To do", with a yellow right-pointing triangle under its heading;
  - blue "Doing", with a yellow triangle;
  - yellow "Done", with a blue triangle.
- Cards are rounded pills: yellow in To do and Doing, blue in Done.
- Inside the Doing column, below its cards, sits a "Review" sub-lane with a red downward triangle and red pills.

**Build:**
- **Columns:** the three columns and the Review sub-lane appear with the first card.
- **Cards:** each card is a pill button with its title, placed by its column (`[data-column]`).
  - An unlinked card's column is its tag.
  - A card with a confirmed task takes its column from the live status via `columnForStatus` (review stays where its tag put it unless the task is `in_progress` or done), and carries `data-task-status` and a small link mark.
  - A card whose status is `removed` stays in its tag column with a struck title and a "Task removed" meta. `unknown` keeps the last known column.
- **Motion:** when a status update moves a card between columns, the same element moves (FLIP by rect centres, 520ms, reads batched before writes, in-flight animation cancelled first). A new card drops in from above its column. No motion on first render.
- **WIP:** with `wip` placed, a badge on the Doing heading reads "Limit 3". When Doing holds more cards than the limit, the badge turns to an alert style with the text "Over limit (4 of 3)". It never relies on colour alone.
- **Proposals:** a card with a pending proposal shows a small "Proposed task" meta. The confirm card itself lives in the coach panel (Task 9).
- **Phone (`@container kanban (max-width: 560px)`):** columns stack (To do, Doing with Review, Done), each as a wrapping row of pills with the heading above. Pills keep a 44px height.

**Tests:**
- A `todo` card is in `[data-column="todo"]`, and `review` cards are in `[data-column="review"]` inside Doing.
- `setTasks` with `in_progress` for card 1's node moves the same element into `doing` and sets `data-task-status`.
- `removed` shows "Task removed" and leaves the card in its tag column.
- The WIP badge reads the limit and shows the over-limit text when exceeded.
- A second identical `setTasks` starts no animation.
- `destroy()` disconnects the observer.
- Removing a card removes its pill.

### Task 18: Eisenhower matrix renderer (`render/eisenhower.ts`, `createEisenhowerView`, prefix `ps-eisen`, container `eisen`)

**Book:** `.ps-book/eisenhower.png`.
- A yellow header band carries "Urgent" and "Not urgent", and a yellow side band carries "Important" and "Not important" in vertical text.
- The quadrants are:
  - blue "Do first" with a large yellow tick;
  - yellow "Schedule" with a blue pie that has a red quarter;
  - yellow "Delegate" with a red right-pointing triangle;
  - red "Eliminate" with a blue square crossed by a yellow X.

**Build:**
- **Grid:** the grid, bands and the four quadrant headings and icons appear with the first item (the icons are drawn as inline SVG in the book colours).
- **Items:** items are pill buttons under their quadrant's icon, dropping in on arrival. A do-first item whose proposal is confirmed shows the Task mark and live status label, as in Task 16.
- **Phone (`@container eisen (max-width: 480px)`):** keep the 2×2 with smaller icons and wrapping pills. Under 340px, stack the quadrants in the order Do first, Schedule, Delegate, Eliminate, with the urgency and importance shown as meta on each.

**Tests:**
- A `do` item is in `[data-quadrant="do"]`.
- The icons exist once any item exists and not before.
- `setTasks` shows the status label on a do-first item.
- Removing an item removes its pill.

---

### Task 19: Scripted coach and the browser walk into Decide and Implement

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/scripted-coach.mjs`, `apps/tasks/tests/browser/problem-solver.spec.mjs`
- Test: `tests/unit/problem-solver-scripted.test.js`

- [ ] **Step 1: Failing tests** (`tests/unit/problem-solver-scripted.test.js`):
  - **Slot hints:** in an active decision matrix run, the answer `option: Publish the rota every Wednesday morning` places `option:1` with the text after the prefix. The answer `criterion: Staff can plan their week ahead` places `criterion:1`.
  - **SWOT links:** in an active SWOT run with a goal and option 1, an answer placing `strength:1` carries an `of` link to the latest option.
  - **Morphological links:** an attribute links to the subject with the fewest attributes, a contradiction pairs the first attributes of the first two subjects, and a scenario picks the first attribute not in a contradiction for each subject.
  - **15% links:** `chosen` picks the first unpicked action.
  - **Kanban proposals:** in an active kanban run, a long answer places `card:1` with tag `todo` and returns `proposeTasks: [{ slot: 'card:1', title: <the first 8 words>, due: null }]`.
  - **No proposal for done cards:** a `done:` hint places a card tagged `done` and proposes nothing.
  - **Choice:** after a scored decision matrix (scores applied with `score()` in the test), an answer with no hint places `choice` (the choice takes priority over the still-open criterion and option slots), the run is complete, and the message names the leading option's title from `matrixTotals`. The answer `choice: Publish the rota every Wednesday morning` does the same through the hint.

- [ ] **Step 2: Implement in the scripted coach** (deterministic, local dev and tests only):
  - **Slot hint:** an answer beginning `<name>:` where `<name>` is the name of an open slot (not `link` or `switch`) places in that slot, with the prefix stripped. For a Kanban card, the hint may instead be a column tag (`todo:`, `doing:`, `review:`, `done:`): it places the next card with that tag.
  - **Required links in `linksFor`:**
    - SWOT quadrant items link `of` the latest option.
    - Morphological attributes link `of` the subject with the fewest attributes (ties go to the earliest).
    - A contradiction links `pair` to the first attribute of subject 1 and the first of subject 2.
    - A scenario links `picks` to, for each subject, its first attribute not paired in a contradiction (or its first, if all are).
    - A 15% `chosen` links `picks` to the first unpicked action.
  - **Proposals:** when the placed node would pass `canPropose`, add `proposeTasks: [{ slot, title: text.split(/\s+/).slice(0, 8).join(' '), due: null }]`.
  - Count the six-word challenge threshold on the text after any prefix.
  - **Choice:** when `choice` is among the open slots and the answer has no slot hint, place it in `choice`. The accept message names the leader when the tool can tell: for the decision matrix, "The scores lead with <title of the leading option>; carrying your choice into Implement."; for the others, "Carrying your choice into Implement."
  - **Implement opening:** when the scripted coach starts an Implement tool and `chosenOption(session)` exists, its first message begins "We are carrying forward: <choice title>." 

- [ ] **Step 3: Browser walk.** Extend the spec after the causal map part:
  - **Leave Analyse and skip Devise:**
    - Click "Move on to Devise". Answer the learning question. Expect the suggestion "Next: Lotus blossom".
    - Click "Move on to Decide" (Devise skipped untouched). Answer `Ready to compare the options now please`. Expect "Next: Decision matrix".
  - **Decide:**
    - Start the decision matrix. Answer `criterion: Staff can plan their week well ahead`, `criterion: The manager spends less time on swaps`, `option: Publish the rota every Wednesday morning` and `option: Let staff swap shifts in a shared app`. Expect `.ps-matrix [data-row]` ×2 and `[data-option]` ×2.
    - Click "Score the options", choose Percent, and enter weights 60 and 40 and ratings 8, 5, 6 and 9. Save. Expect `[data-total]` ×2 and one `.is-leading`.
    - Answer `choice: Let staff swap shifts in a shared app`. Expect `.ps-matrix [data-choice]` containing that text, and the record's Decide step `data-state="done"` after moving on.
  - **Implement:**
    - Click "Move on to Implement". Answer the learning question. Expect "Next: Kanban". Start it. Expect the coach's message to contain "We are carrying forward" and `.ps-canvas__aim` to contain "swap shifts".
    - Answer `Draft the new Wednesday rota template for the team`. Expect `.ps-taskcard` with that title prefix.
    - Click "Create task". The card disappears. A fetch to `/api/tasks` contains a task with that title, `source` `problem_solver` and the tag `problem-solver`. Expect `.ps-kanban [data-task-status="open"]` ×1 in `[data-column="todo"]`.
  - **Live status:** PATCH that task to `in_progress` with `fetch` in `page.evaluate` (the mock API supports PATCH), then trigger a refresh by dispatching `visibilitychange`, or reload. Expect the card in `[data-column="doing"]`.
  - **Finish the board:** answer `doing: Tell the team about the Wednesday change` and `done: Old Friday rota process retired last month`. Click "Not this one" on the remaining confirm card; the `done` card proposes nothing.
  - **Review:**
    - Click "Move on to Improve". Expect `.ps-reviewcard` with a date input whose value matches `^\d{4}-\d{2}-\d{2}$`.
    - Click "Create review task". The card disappears. `/api/tasks` has a task titled `Review: <problem title>` whose `due_date` equals the input's value. The session's `reviewTaskId` is that task's id.
  - **Chip:** go to `#/task/<review task id>`. Expect `a.ps-linkchip` with an href containing `step=improve`. Click it and the problem page opens.
  - **Width:** repeat at 390px. Expect no horizontal overflow at each stage, and take screenshots when `PS_SHOT_DIR` is set.

  Run it with the throwaway config at `$PS_SCRATCH/ps-playwright.config.mjs` (copy of `apps/tasks/playwright.config.ts` pointing at the spec). Do not commit it.

- [ ] **Step 4: Commit**: `Problem Solver: scripted coach and walk cover Decide and Implement` (with trailer).

---

### Task 20: Gate

- [ ] Run all root Problem Solver tests, all Tasks Problem Solver tests, the type gate, `npm run pre-pr-check` (exit 0) and the browser walk at both widths.
- [ ] Render every new sample at 900 and 390 with `--audit` and look at them together, with the Plan 4 charts, as a set: consistent type sizes, palette, ring and motion feel. Every audit prints clean.
- [ ] Check the public-repo rules over the diff: `git diff main --stat` has no `.ps-book` path; grep the diff for long runs of book wording (any sentence you did not write); grep for real names (there are none in samples or fixtures).
- [ ] Commit any fixes: `Problem Solver: Decide and Implement polish`.

---

## Hooks the later plans need

- **Plan 6 (Improve):**
  - `reviewTaskId` and the `step=improve` deep link from the review chip exist. Plan 6 makes Improve read them: open on the after action review, and seed "what did we set out to achieve" from SMART and DMAIC Measure.
  - The server cannot see task statuses (the page fetches them). Plan 6 should add a `task_status` snapshot the page posts when entering Improve (counts by status, titles of overdue tasks), so the coach can talk about what actually happened.
  - The `reopen_step` loop belongs to Plan 6.
- **Plan 7 (Document):**
  - Reuse `task-cards.ts` for the case-file confirm card.
  - Reuse the `confirmed()` wait-then-act helper and the bridge pattern for writing blocks to the linked page.
  - Use `problemSolverChips` on the project created for the case file.
  - `session.links` plus `proposedTasks[].taskId` give the candidate targets.
- **Plan 8 (Lightning):** nothing in this plan blocks it. An escalated session starts with empty task fields.

## Decisions (Adam, 19 October 2026)

These were open questions; Adam has answered them and the plan above is built to the answers.

1. **Task domain. Decided:** the linked task's domain if the problem links a task; otherwise `life`.
2. **Review timing. Decided:** proposed automatically 14 days after leaving Implement with a finished tool, unless the coach proposed a date earlier. The person can change the date on the card.
3. **Review with Implement skipped. Decided:** no review is proposed when Implement was skipped untouched.
4. **Which items can become tasks. Decided:** Kanban cards not tagged Done; Eisenhower "Do first" items only (not "Schedule"); 15% chosen actions. DMAIC Improve steps cannot.
5. **Kanban columns. Decided:** the book's fixed four (To do, Doing, Review, Done) as tags, not editable columns.
6. **WIP badge. Decided:** on Doing, where work in progress is.
7. **Unlinked Kanban cards. Decided:** cards that are not real tasks stay in the column the coach placed them in; only linked tasks move.
8. **A deleted task. Decided:** the Kanban card shows "Task removed" and the proposal reverts to dismissed (`removed: true`). The coach is **not** told: removed proposals never appear in the prompt's task lines or in "Can become tasks", and the coach does **not** offer to re-propose. The session drops any later proposal for that node (Task 7 tests both).
9. **The chosen option. Decided: both.** Every Decide tool ends with a `choice` slot (Task 3, via `withChoice`), and a Decide tool is complete only with it. The coach also names the leading option in conversation, asks which option the person will carry forward, and confirms it as the Implement aim (Task 6). Implement reads `chosenOption(session)` as its aim: the prompt's CHOSEN OPTION line (Task 7), the canvas aim caption (Task 9), and the coach's carry-forward into DMAIC Define, 15% Reflect or the first Kanban cards.
10. **Confirming while the coach is thinking. Decided:** confirmations wait until the coach has settled, because a save during a coach turn would lose that turn. The task itself is created at once, and a retry never creates a duplicate.

## Done when

- The four Decide and four Implement tools each have:
  - a definition;
  - an emblem matching the book, with the checkpoint sent to Adam;
  - a renderer that matches its book chart, animates only on change, works at 390px, passes its tests and passes `--audit`.
- The decision matrix and Pareto take scores through their own forms, and the coach sees their computed results as score lines.
- Every Decide tool ends with a `choice` slot and is complete only with it; each Decide chart shows the chosen-option card.
- The coach names the leading option and confirms the choice; Implement shows it as its aim (prompt line and canvas caption) and the coach carries it into the first Implement tool.
- A task deleted in Tasks shows "Task removed" on its card, its proposal is dismissed, and the coach is neither told nor allowed to propose it again.
- The coach proposes tasks only from qualifying Implement nodes.
- Every real task is created by the page through `tasksApi.createTask`, only after the person confirms its card.
- The Review task is proposed with a date, created on confirm, linked back with a chip that opens the problem at Improve.
- Kanban cards follow their tasks' live status.
- The scripted coach and the browser walk choose an option in Decide, see it as the aim in Implement, create a task and the review task, and follow the chip, at both widths.
- All gates pass.
