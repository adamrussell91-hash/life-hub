# Problem Solver Plan 3: step engine, coach knowledge layers, step-aware record

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Define-only session into a step engine that can carry a problem through every step of its process model, give the coach layered book knowledge, and make the record, track, canvas and coach panel step-aware, with v1 sessions migrating on read.

**Architecture:** `packages/problem-solver/steps.mjs` maps each process model to ordered plan steps and the book steps (tool families) each one uses. The session's `define` block becomes `steps[stepId] = { runs, status, objection }` with `phase` = the current plan step id (or `frame` / `finished`). Leaving a step ("move on") queues a `boundary` coach turn that records any objection and asks what the person learned about how they solve problems. Prompts split into cached knowledge layers. Stored v1 sessions migrate on every read; nothing is rewritten until the next save.

**Tech Stack:** Plain ESM with JSDoc (package and Netlify functions), TypeScript renderers and views (Vite, Tasks app), `node:test` for root unit tests, Vitest + happy-dom for Tasks unit tests, Playwright for the browser walk.

**Spec:** `docs/superpowers/specs/2026-10-19-problem-solver-full-process-design.md`. This is plan 3 of the v2 build. Plans 4–8 (Analyse and Devise tools; Decide and Implement with Tasks integration; Improve and Document; Lightning; Final-words evaluation and gate) are written after this one lands, against the real code. All plans ship in one PR on `claude/problem-solver-process`.

**Worktree:** `/Users/example/Projects/life-hub-ps-process` (branch `claude/problem-solver-process`). Run every command from there.

**Commands used throughout:**

- Root unit tests for one file: `node --import ./scripts/test-network-guard.mjs --test tests/unit/<file>.test.js`
- Tasks unit tests for one file: `cd apps/tasks && npx vitest run tests/unit/<file>.test.ts`
- All Problem Solver tests: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-*.test.js && (cd apps/tasks && npx vitest run tests/unit/problem-solver)`

---

## File map

| File | Responsibility | Change |
| --- | --- | --- |
| `packages/problem-solver/steps.mjs` | Book steps, per-model step plans, step lookups, default tool per book step | Create |
| `packages/problem-solver/tools/contradiction.mjs` | TRIZ "general problem" tool | Create |
| `packages/problem-solver/tools/*.mjs` (v1 seven) | Gain `step` and `failureModes` | Modify |
| `packages/problem-solver/tools/index.mjs` | Register `contradiction`; `toolsForBookStep` | Modify |
| `packages/problem-solver/machine.mjs` | `applyScores` generic scoring | Modify |
| `packages/problem-solver/tools/gap-radar.mjs` | `scoreKey`, `pickScores` | Modify |
| `packages/problem-solver/types.ts` | v2 session types | Modify |
| `netlify/functions/_shared/problem-solver/migrate.mjs` | v1 → v2 session and index-row migration | Create |
| `netlify/functions/_shared/problem-solver/session.mjs` | Step engine transitions | Rewrite |
| `netlify/functions/_shared/problem-solver/coach-schema.mjs` | `next_step`, `learning` | Modify |
| `netlify/functions/_shared/problem-solver/knowledge/*.mjs` | Process, chapters, final words, selection | Create |
| `netlify/functions/_shared/problem-solver/prompts.mjs` | Layered prompt, step-aware state | Rewrite |
| `netlify/functions/_shared/problem-solver/coach.mjs` | Step-aware fitting; system blocks array | Modify |
| `netlify/functions/_shared/problem-solver/scripted-coach.mjs` | Step-aware deterministic coach | Modify |
| `netlify/functions/_shared/problem-solver/service.mjs` | Migrate on read; `move_on`, `score` actions | Modify |
| `apps/tasks/src/views/problem-solver/api.ts` | `score`, `rescore` alias | Modify |
| `apps/tasks/src/views/problem-solver/coach-panel.ts` | Move on button, step label, next-step card | Modify |
| `apps/tasks/src/views/problem-solver/canvas.ts` | Runs from the current step; record on step change | Modify |
| `apps/tasks/src/views/problem-solver/decor.ts` | Track from steps | Modify |
| `packages/problem-solver/render/record.ts` | Step states for every step; per-step filmstrips; extras row | Modify |
| `packages/problem-solver/problem-solver.css` | Record skipped state, strips, extras | Modify |
| Tests, preview samples, eval script | Follow the new shape | Modify |

---

### Task 1: Step plans (`steps.mjs`)

**Files:**
- Create: `packages/problem-solver/steps.mjs`
- Test: `tests/unit/problem-solver-steps.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/problem-solver-steps.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_STEP_IDS, stepPlan, planStep, firstStep, nextStepAfter, stepName, defaultToolFor } from '../../packages/problem-solver/steps.mjs';
import { MODELS } from '../../packages/problem-solver/models.mjs';

test('book steps follow the seven-step process, plus the TRIZ contradiction step', () => {
  assert.deepEqual(BOOK_STEP_IDS, ['define', 'analyse', 'devise', 'decide', 'implement', 'improve', 'document', 'contradiction']);
});

test('seven step plan is one plan step per book step, in order', () => {
  assert.deepEqual(stepPlan('seven_step').map((s) => [s.step, s.book, s.extra]), [
    ['define', ['define'], false], ['analyse', ['analyse'], false], ['devise', ['devise'], false], ['decide', ['decide'], false],
    ['implement', ['implement'], false], ['improve', ['improve'], false], ['document', ['document'], false]
  ]);
});

test('polya maps devise to devise then decide tools, evaluate to improve, document as an extra', () => {
  assert.deepEqual(stepPlan('polya').map((s) => [s.step, s.book, s.extra]), [
    ['identify', ['define'], false], ['devise', ['devise', 'decide'], false], ['implement', ['implement'], false],
    ['evaluate', ['improve'], false], ['document', ['document'], true]
  ]);
});

test('triz maps general problem to the contradiction step and offers three extras', () => {
  assert.deepEqual(stepPlan('triz').map((s) => [s.step, s.book, s.extra]), [
    ['specific_problem', ['define'], false], ['general_problem', ['contradiction'], false], ['general_solution', ['devise'], false],
    ['specific_solution', ['decide'], false], ['implement', ['implement'], true], ['improve', ['improve'], true], ['document', ['document'], true]
  ]);
});

test('every non-extra plan step is a step of its model', () => {
  for (const id of Object.keys(MODELS)) {
    const ids = MODELS[id].steps.map((s) => s.id);
    for (const s of stepPlan(id).filter((s) => !s.extra)) assert.ok(ids.includes(s.step), `${id}.${s.step}`);
  }
});

test('lookups', () => {
  assert.equal(firstStep('polya'), 'identify');
  assert.equal(nextStepAfter('seven_step', 'define'), 'analyse');
  assert.equal(nextStepAfter('seven_step', 'document'), null);
  assert.equal(nextStepAfter('triz', 'specific_solution'), 'implement');
  assert.equal(planStep('triz', 'general_problem').book[0], 'contradiction');
  assert.equal(planStep('seven_step', 'nope'), null);
  assert.equal(stepName('seven_step', 'analyse'), 'Analyse');
  assert.equal(stepName('polya', 'document'), 'Document');
  assert.equal(stepName('triz', 'general_problem'), 'General problem');
});

test('default tool is the first registered tool for the plan step', () => {
  assert.equal(defaultToolFor('seven_step', 'define'), 'five_whys');
  assert.equal(defaultToolFor('triz', 'general_problem'), 'contradiction');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-steps.test.js`
Expected: FAIL, `Cannot find module .../steps.mjs`.

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/steps.mjs
import { MODELS } from './models.mjs';
import { TOOLS } from './tools/index.mjs';

/** Tool families. A tool's `step` is one of these. `contradiction` is TRIZ only. */
export const BOOK_STEPS = Object.freeze([
  { id: 'define', name: 'Define', detail: 'Problem recognition and definition' },
  { id: 'analyse', name: 'Analyse', detail: 'Problem analysis' },
  { id: 'devise', name: 'Devise', detail: 'Generate alternate solutions' },
  { id: 'decide', name: 'Decide', detail: 'Select solution' },
  { id: 'implement', name: 'Implement', detail: 'Plan and act' },
  { id: 'improve', name: 'Improve', detail: 'Evaluate outcome' },
  { id: 'document', name: 'Document', detail: 'Record key information' },
  { id: 'contradiction', name: 'Contradiction', detail: 'Name what improves and what worsens' }
]);

export const BOOK_STEP_IDS = Object.freeze(BOOK_STEPS.map((s) => s.id));

const entry = (step, book, extra = false) => Object.freeze({ step, book: Object.freeze(book), extra });

/**
 * Ordered steps a session walks for each model. `book` lists the tool families the
 * coach chooses from. `extra` steps come after the model's own steps and are offered,
 * not required (they still appear on the record, under the diagram).
 */
const PLANS = Object.freeze({
  seven_step: Object.freeze(['define', 'analyse', 'devise', 'decide', 'implement', 'improve', 'document'].map((id) => entry(id, [id]))),
  polya: Object.freeze([
    entry('identify', ['define']),
    entry('devise', ['devise', 'decide']),
    entry('implement', ['implement']),
    entry('evaluate', ['improve']),
    entry('document', ['document'], true)
  ]),
  triz: Object.freeze([
    entry('specific_problem', ['define']),
    entry('general_problem', ['contradiction']),
    entry('general_solution', ['devise']),
    entry('specific_solution', ['decide']),
    entry('implement', ['implement'], true),
    entry('improve', ['improve'], true),
    entry('document', ['document'], true)
  ])
});

/** Preferred fallback tool per book step, first registered wins (later plans register the rest). */
const DEFAULTS = Object.freeze({
  define: ['five_whys'],
  contradiction: ['contradiction'],
  analyse: ['causal_map', 'perspective_shift'],
  devise: ['lotus_blossom', 'solution_tree'],
  decide: ['decision_matrix', 'swot'],
  implement: ['kanban', 'fifteen_percent'],
  improve: ['after_action_review', 'double_loop'],
  document: ['five_cs']
});

/** @param {string} modelId */
export function stepPlan(modelId) {
  const plan = PLANS[modelId];
  if (!plan) throw new Error(`Unknown model: ${modelId}`);
  return plan;
}

export function planStep(modelId, stepId) {
  return stepPlan(modelId).find((s) => s.step === stepId) ?? null;
}

export function firstStep(modelId) {
  return stepPlan(modelId)[0].step;
}

export function nextStepAfter(modelId, stepId) {
  const plan = stepPlan(modelId);
  const i = plan.findIndex((s) => s.step === stepId);
  return i >= 0 && i < plan.length - 1 ? plan[i + 1].step : null;
}

export function stepName(modelId, stepId) {
  const own = MODELS[modelId]?.steps.find((s) => s.id === stepId);
  if (own) return own.name;
  return BOOK_STEPS.find((s) => s.id === stepId)?.name ?? stepId;
}

/** Tool ids usable in a plan step, in registry order. */
export function toolsForPlanStep(modelId, stepId) {
  const books = planStep(modelId, stepId)?.book ?? [];
  return Object.values(TOOLS).filter((tool) => books.includes(tool.step)).map((tool) => tool.id);
}

export function defaultToolFor(modelId, stepId) {
  for (const book of planStep(modelId, stepId)?.book ?? []) {
    const id = (DEFAULTS[book] ?? []).find((tool) => TOOLS[tool]);
    if (id) return id;
  }
  return toolsForPlanStep(modelId, stepId)[0] ?? null;
}
```

Note: `defaultToolFor('triz', 'general_problem')` needs the `contradiction` tool from Task 2. The test for it will pass after Task 2; run Task 1's other tests now and expect only that assertion to fail.

- [ ] **Step 4: Run to verify (all but the contradiction default pass)**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-steps.test.js`
Expected: one failure in "default tool is the first registered tool" (`null !== 'contradiction'`). Everything else passes.

- [ ] **Step 5: Commit after Task 2** (the two tasks land together).

---

### Task 2: Tool `step` and `failureModes`, the contradiction tool, registry helpers

**Files:**
- Create: `packages/problem-solver/tools/contradiction.mjs`
- Modify: `packages/problem-solver/tools/{five-whys,problem-tree,concept-map,gap-basic,gap-radar,problem-statement,smart}.mjs`, `packages/problem-solver/tools/index.mjs`
- Test: `tests/unit/problem-solver-tools.test.js` (append)

- [ ] **Step 1: Write the failing tests (append)**

```js
// append to tests/unit/problem-solver-tools.test.js
import { BOOK_STEP_IDS } from '../../packages/problem-solver/steps.mjs';
import { toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { newRun, placeNode, nextSlots, isComplete } from '../../packages/problem-solver/machine.mjs';

test('every tool names its book step and at least two failure modes', () => {
  for (const tool of Object.values(TOOLS)) {
    assert.ok(BOOK_STEP_IDS.includes(tool.step), `${tool.id}.step`);
    assert.ok(Array.isArray(tool.failureModes) && tool.failureModes.length >= 2, `${tool.id}.failureModes`);
    for (const line of tool.failureModes) assert.equal(typeof line, 'string');
  }
});

test('v1 tools are all Define tools', () => {
  assert.deepEqual(toolsForBookStep('define'), ['five_whys', 'problem_tree', 'concept_map', 'gap_basic', 'gap_radar', 'problem_statement', 'smart']);
});

test('contradiction: improving, worsening, then the statement', () => {
  let run = newRun('contradiction', 'r');
  assert.deepEqual(nextSlots(run), ['improving']);
  run = placeNode(run, { id: 'a', slot: 'improving', text: 'Faster replies', state: 'accepted' });
  assert.deepEqual(nextSlots(run), ['worsening']);
  run = placeNode(run, { id: 'b', slot: 'worsening', text: 'Less careful answers', state: 'accepted' });
  assert.deepEqual(nextSlots(run), ['statement']);
  assert.equal(isComplete(run), false);
  run = placeNode(run, { id: 'c', slot: 'statement', text: 'Speeding replies up makes them less careful.', state: 'accepted' });
  assert.equal(isComplete(run), true);
  assert.deepEqual(nextSlots(run), []);
});
```

(If `TOOLS` is not already imported at the top of that test file, add `import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';`.)

- [ ] **Step 2: Run to verify failure**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-tools.test.js`
Expected: FAIL (`toolsForBookStep` is not exported; `step` undefined).

- [ ] **Step 3: Add `step` and `failureModes` to the seven v1 tools**

Insert these two properties directly after each tool's `when:` line (our words; drawn from the book and its cited sources):

```js
// five-whys.mjs
  step: 'define',
  failureModes: [
    'Stopping at a symptom instead of a process, occurrence or activity.',
    'A single chain when the causes clearly branch (switch to a problem tree).',
    'Blaming a person rather than a process.',
    'Whys that are not checked against evidence.'
  ],
```

```js
// problem-tree.mjs
  step: 'define',
  failureModes: [
    'More than one focal problem on the trunk.',
    'Effects listed as causes, or causes as effects.',
    'Vague causes with no who, what, where or when.',
    'Solutions slipped in as causes ("no new software").'
  ],
```

```js
// concept-map.mjs
  step: 'define',
  failureModes: [
    'No clear central theme, so the map sprawls.',
    'Concepts with no labelled linkage.',
    'Every link the same kind, hiding hierarchy and cross-links.'
  ],
```

```js
// gap-basic.mjs
  step: 'define',
  failureModes: [
    'A current state described as opinion rather than fact.',
    'An objective that cannot be measured.',
    'Actions proposed before the gap is clear.'
  ],
```

```js
// gap-radar.mjs
  step: 'define',
  failureModes: [
    'Topics that overlap, so scores double count.',
    'Scores given with no reason or evidence.',
    'An inconsistent scale between snapshots, so progress cannot be compared.'
  ],
```

```js
// problem-statement.mjs
  step: 'define',
  failureModes: [
    'A statement that hides a solution.',
    'Impacts that are not quantified where they could be.',
    'Benefits with no beneficiary named.'
  ],
```

```js
// smart.mjs
  step: 'define',
  failureModes: [
    'Attainable and Relevant asserted rather than tested.',
    'A measure with no baseline or target number.',
    'No date, or a date with no reason.'
  ],
```

- [ ] **Step 4: Create the contradiction tool**

```js
// packages/problem-solver/tools/contradiction.mjs
import { hasSlot } from '../slots.mjs';

const ORDER = ['improving', 'worsening', 'statement'];

/** TRIZ's general problem: the contradiction behind the specific problem. */
export const contradiction = Object.freeze({
  id: 'contradiction',
  name: 'Contradiction',
  kind: 'contradiction',
  step: 'contradiction',
  when: 'TRIZ only: once the specific problem is defined, name what you want to improve and what gets worse when you do.',
  failureModes: [
    'Two separate problems rather than one trade-off.',
    'A worsening factor that does not actually worsen when the first improves.',
    'A statement that already contains a solution.'
  ],
  steps: [
    { id: 'improving', title: 'What should improve', prompt: 'Name the quality you want to improve, in a few words.' },
    { id: 'worsening', title: 'What gets worse', prompt: 'Name what worsens when you improve it. Check it really does.' },
    { id: 'statement', title: 'State the contradiction', prompt: 'One sentence: improving the first makes the second worse.' }
  ],
  slots: { improving: 'The quality to improve', worsening: 'The quality that worsens', statement: 'The contradiction in one sentence' },
  edgeKinds: [],
  nextSlots(run) {
    const next = ORDER.find((name) => !hasSlot(run, name));
    return next ? [next] : [];
  },
  complete(run) {
    return hasSlot(run, 'statement');
  }
});
```

- [ ] **Step 5: Register it and add the helper**

```js
// packages/problem-solver/tools/index.mjs
import { fiveWhys } from './five-whys.mjs';
import { problemTree } from './problem-tree.mjs';
import { conceptMap } from './concept-map.mjs';
import { gapBasic } from './gap-basic.mjs';
import { gapRadar } from './gap-radar.mjs';
import { problemStatement } from './problem-statement.mjs';
import { smart } from './smart.mjs';
import { contradiction } from './contradiction.mjs';

export const TOOLS = Object.freeze({
  five_whys: fiveWhys,
  problem_tree: problemTree,
  concept_map: conceptMap,
  gap_basic: gapBasic,
  gap_radar: gapRadar,
  problem_statement: problemStatement,
  smart,
  contradiction
});

export const TOOL_IDS = Object.freeze(Object.keys(TOOLS));

/** Tool ids whose `step` is the given book step, in registry order. */
export function toolsForBookStep(step) {
  return TOOL_IDS.filter((id) => TOOLS[id].step === step);
}
```

Add `| 'contradiction'` to `PsToolId` in `packages/problem-solver/types.ts`.

- [ ] **Step 6: Run both test files**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-tools.test.js tests/unit/problem-solver-steps.test.js tests/unit/problem-solver-catalogue.test.js`
Expected: PASS. If the catalogue test asserts an exact tool count of 7, update it to 8 and add `'contradiction'` to any explicit list there.

- [ ] **Step 7: Commit**

```bash
git add packages/problem-solver/steps.mjs packages/problem-solver/tools packages/problem-solver/types.ts tests/unit/problem-solver-steps.test.js tests/unit/problem-solver-tools.test.js tests/unit/problem-solver-catalogue.test.js
git commit -m "Problem Solver: step plans per model, tool steps and failure modes, TRIZ contradiction tool

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Generic scoring in the machine

**Files:**
- Modify: `packages/problem-solver/machine.mjs`, `packages/problem-solver/tools/gap-radar.mjs`
- Test: `tests/unit/problem-solver-machine.test.js` (append)

- [ ] **Step 1: Failing test (append)**

```js
// append to tests/unit/problem-solver-machine.test.js
import { applyScores, newRun as makeRun, placeNode as put } from '../../packages/problem-solver/machine.mjs';

test('applyScores appends a snapshot under the tool score key, validated by the tool', () => {
  let run = makeRun('gap_radar', 'r');
  for (const [i, slot] of ['current', 'objective', 'axis:1', 'axis:2', 'axis:3'].entries()) run = put(run, { id: `n${i}`, slot, text: slot, state: 'accepted' });
  const next = applyScores(run, { current: [3, 4, 5], objective: [8, 8, 9], junk: 1 }, '2026-10-19T09:00:00.000Z');
  assert.deepEqual(next.radar.snapshots, [{ at: '2026-10-19T09:00:00.000Z', current: [3, 4, 5], objective: [8, 8, 9] }]);
  assert.throws(() => applyScores(run, { current: [3], objective: [8] }, 'x'), (err) => err.code === 'invalid_scores' && /one score per topic/.test(err.message));
});

test('applyScores refuses tools that take no scores', () => {
  assert.throws(() => applyScores(makeRun('five_whys', 'r'), {}, 'x'), (err) => err.code === 'invalid_scores');
});
```

- [ ] **Step 2: Run, expect FAIL** (`applyScores` not exported).

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-machine.test.js`

- [ ] **Step 3: Implement**

In `packages/problem-solver/tools/gap-radar.mjs`, add inside the tool object (after `validateScores`):

```js
  /** Where snapshots live on the run (kept as `radar` for v1 data). */
  scoreKey: 'radar',
  /** The score fields this tool keeps from a payload. */
  pickScores(payload) {
    return { current: payload?.current, objective: payload?.objective };
  },
```

Append to `packages/problem-solver/machine.mjs`:

```js
function invalidScores(message) {
  return Object.assign(new Error(message), { code: 'invalid_scores' });
}

/**
 * Returns a new run with a timestamped score snapshot appended under the tool's
 * `scoreKey` (default `scores`). Throws `invalid_scores` with the tool's message.
 */
export function applyScores(run, payload, at) {
  const def = toolDef(run.tool);
  if (typeof def.validateScores !== 'function') throw invalidScores(`${def.name} takes no scores.`);
  const data = typeof def.pickScores === 'function' ? def.pickScores(payload) : { ...payload };
  const problem = def.validateScores(run, data);
  if (problem) throw invalidScores(problem);
  const key = def.scoreKey ?? 'scores';
  const prior = run[key]?.snapshots ?? [];
  return { ...run, [key]: { ...(run[key] ?? {}), snapshots: [...prior, { at, ...structuredClone(data) }] } };
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/problem-solver/machine.mjs packages/problem-solver/tools/gap-radar.mjs tests/unit/problem-solver-machine.test.js
git commit -m "Problem Solver: generic score snapshots in the machine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Session types (v2)

**Files:**
- Modify: `packages/problem-solver/types.ts`

- [ ] **Step 1: Replace the session-related types**

Replace `PsSuggestion`, `PsSession`, `PsSummary` and `PsAction` with:

```ts
export type PsStepStatus = 'open' | 'done' | 'skipped';
export type PsStepState = { runs: PsToolRun[]; status: PsStepStatus; objection: string | null };

export type PsSuggestion =
  | { kind: 'next_tool' | 'switch_tool'; tool: PsToolId; reason: string }
  | { kind: 'next_step'; reason: string };

export type PsSession = {
  id: string;
  title: string;
  revision: number;
  kind: 'full';
  status: 'active' | 'finished' | 'archived';
  /** 'frame', a plan step id from steps.mjs, or 'finished'. */
  phase: string;
  frame: { goal?: string; whatIsTrue?: string; whatCanBeDone?: string };
  model: { id: PsModelId; reason: string } | null;
  links: { kind: 'task' | 'project' | 'goal'; id: string }[];
  steps: Record<string, PsStepState>;
  learnings: { step: string; text: string; at: string }[];
  /** The step just left, while the coach waits for what was learned there. */
  pendingLearning: string | null;
  turns: PsTurn[];
  summary: string;
  suggestion: PsSuggestion | null;
  pendingKeep: { slot: string; text: string; objection: string } | null;
  runner: { status: 'idle' | 'queued' | 'running' | 'failed'; mode: 'turn' | 'boundary'; error: string | null; leaving?: string };
  createdAt: string;
  updatedAt: string;
};

export type PsSummary = Pick<PsSession, 'id' | 'title' | 'status' | 'phase' | 'links' | 'createdAt' | 'updatedAt'> & { kind?: 'full'; model: PsModelId | null; tool: PsToolId | null; frame?: number; skills?: Record<string, number> };

export type PsAction = 'say' | 'keep_anyway' | 'accept_suggestion' | 'dismiss_suggestion' | 'move_on' | 'rename' | 'archive' | 'score' | 'rescore_radar' | 'retry';
```

Also widen `PsToolRun` so generic scores type-check:

```ts
export type PsToolRun = { id: string; tool: PsToolId; status: 'active' | 'done' | 'switched'; switchReason?: string; nodes: PsNode[]; edges: PsEdge[]; radar?: { snapshots: { at: string; current: number[]; objective: number[] }[] }; scores?: { snapshots: Array<{ at: string } & Record<string, unknown>> } };
```

- [ ] **Step 2: Do not run the Tasks type check yet.** Views still read `session.define`; Tasks 11–13 fix them. Commit with Task 5.

---

### Task 5: v1 → v2 migration

**Files:**
- Create: `netlify/functions/_shared/problem-solver/migrate.mjs`
- Test: `tests/unit/problem-solver-migrate.test.js`

- [ ] **Step 1: Failing test**

```js
// tests/unit/problem-solver-migrate.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSession, migrateRow } from '../../netlify/functions/_shared/problem-solver/migrate.mjs';

const runs = [
  { id: 'r1', tool: 'five_whys', status: 'switched', switchReason: 'Branches', nodes: [], edges: [] },
  { id: 'r2', tool: 'problem_tree', status: 'done', nodes: [
    { id: 'a', slot: 'trunk', text: 't', state: 'accepted', skills: [], turnId: 'x' },
    { id: 'b', slot: 'cause:1', text: 'c1', state: 'accepted', skills: [], turnId: 'x' },
    { id: 'c', slot: 'cause:2', text: 'c2', state: 'accepted', skills: [], turnId: 'x' },
    { id: 'd', slot: 'effect:1', text: 'e1', state: 'accepted', skills: [], turnId: 'x' }
  ], edges: [] }
];
const v1 = (over = {}) => ({
  id: 's', title: 'T', revision: 4, status: 'defined', phase: 'defined', frame: { goal: 'g' }, model: { id: 'seven_step', reason: 'r' }, links: [],
  define: { runs, finishedEarly: false, exitObjection: 'Root not reached.' }, turns: [{ id: 't', role: 'user', text: 'x', createdAt: 'c' }],
  summary: '', suggestion: null, pendingKeep: null, requestIds: [], runner: { status: 'idle', mode: 'turn', error: null }, createdAt: 'c', updatedAt: 'u', ...over
});

test('a defined v1 session moves on to the step after define', () => {
  const s = migrateSession(v1());
  assert.equal(s.define, undefined);
  assert.equal(s.kind, 'full');
  assert.equal(s.status, 'active');
  assert.equal(s.phase, 'analyse');
  assert.deepEqual(s.steps.define, { runs, status: 'done', objection: 'Root not reached.' });
  assert.deepEqual(s.steps.analyse, { runs: [], status: 'open', objection: null });
  assert.deepEqual(s.learnings, []);
  assert.equal(s.pendingLearning, null);
});

test('a v1 session defined early with no complete run is a skipped define step', () => {
  const s = migrateSession(v1({ define: { runs: [runs[0]], finishedEarly: true, exitObjection: null } }));
  assert.equal(s.steps.define.status, 'skipped');
});

test('a v1 session mid-define stays in its model\'s define step', () => {
  assert.equal(migrateSession(v1({ phase: 'define', status: 'active', model: { id: 'polya', reason: '' } })).phase, 'identify');
  assert.equal(migrateSession(v1({ phase: 'define', status: 'active' })).steps.define.status, 'open');
});

test('a v1 frame session has no steps', () => {
  const s = migrateSession(v1({ phase: 'frame', status: 'active', model: null, define: { runs: [], finishedEarly: false, exitObjection: null } }));
  assert.equal(s.phase, 'frame');
  assert.deepEqual(s.steps, {});
});

test('a queued v1 closing turn becomes a boundary turn leaving define', () => {
  const s = migrateSession(v1({ runner: { status: 'queued', mode: 'closing', error: null } }));
  assert.deepEqual(s.runner, { status: 'queued', mode: 'boundary', error: null, leaving: 'define' });
  assert.equal(s.pendingLearning, null);
});

test('a stored finish_define suggestion becomes next_step', () => {
  const s = migrateSession(v1({ phase: 'define', status: 'active', suggestion: { kind: 'finish_define', reason: 'Done.' } }));
  assert.deepEqual(s.suggestion, { kind: 'next_step', reason: 'Done.' });
});

test('v2 sessions and index rows pass through unchanged', () => {
  const v2 = migrateSession(v1());
  assert.equal(migrateSession(v2), v2);
  const row = { id: 's', title: 'T', status: 'active', phase: 'frame' };
  assert.equal(migrateSession(row), row);
});

test('index rows from v1 move their phase on too', () => {
  assert.deepEqual(migrateRow({ id: 's', status: 'defined', phase: 'defined', model: 'seven_step' }), { id: 's', status: 'active', phase: 'analyse', model: 'seven_step' });
  assert.deepEqual(migrateRow({ id: 's', status: 'active', phase: 'define', model: 'triz' }), { id: 's', status: 'active', phase: 'specific_problem', model: 'triz' });
  const fresh = { id: 's', status: 'active', phase: 'analyse', model: 'seven_step' };
  assert.equal(migrateRow(fresh), fresh);
});
```

- [ ] **Step 2: Run, expect FAIL** (module missing).

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-migrate.test.js`

- [ ] **Step 3: Implement**

```js
// netlify/functions/_shared/problem-solver/migrate.mjs
import { defineStepOf } from '../../../../packages/problem-solver/models.mjs';
import { nextStepAfter } from '../../../../packages/problem-solver/steps.mjs';
import { isComplete } from '../../../../packages/problem-solver/machine.mjs';

const emptyStep = () => ({ runs: [], status: 'open', objection: null });

function defineFor(modelId) {
  return modelId ? defineStepOf(modelId) : 'define';
}

function afterDefine(modelId) {
  return (modelId && nextStepAfter(modelId, defineFor(modelId))) || 'finished';
}

/**
 * v1 stored `define: { runs, finishedEarly, exitObjection }` and phases frame/define/defined.
 * v2 stores `steps[stepId]` and phase = the current plan step. Index rows (no turns) and
 * v2 sessions pass through untouched. Pure; the store is not written.
 */
export function migrateSession(session) {
  if (!session || !Array.isArray(session.turns) || session.steps) return session;
  const { define = { runs: [], finishedEarly: false, exitObjection: null }, ...rest } = session;
  const modelId = rest.model?.id ?? null;
  const defineStep = defineFor(modelId);
  const runs = define.runs ?? [];
  const steps = {};
  let phase = rest.phase;
  if (phase === 'define') {
    phase = defineStep;
    steps[defineStep] = { runs, status: 'open', objection: define.exitObjection ?? null };
  } else if (phase === 'defined') {
    const kept = runs.some((run) => run.status !== 'switched' && isComplete(run));
    steps[defineStep] = { runs, status: kept ? 'done' : 'skipped', objection: define.exitObjection ?? null };
    phase = afterDefine(modelId);
    if (phase !== 'finished') steps[phase] = emptyStep();
  }
  const runner = rest.runner?.mode === 'closing'
    ? { status: rest.runner.status, mode: 'boundary', error: rest.runner.error ?? null, leaving: defineStep }
    : { ...rest.runner, mode: 'turn' };
  const suggestion = rest.suggestion?.kind === 'finish_define' ? { kind: 'next_step', reason: rest.suggestion.reason ?? '' } : rest.suggestion ?? null;
  return {
    ...rest,
    kind: 'full',
    status: rest.status === 'defined' ? (phase === 'finished' ? 'finished' : 'active') : rest.status,
    phase,
    steps,
    learnings: [],
    pendingLearning: null,
    suggestion,
    runner
  };
}

/** List index rows written by v1 carry phase define/defined. */
export function migrateRow(row) {
  if (!row || (row.phase !== 'define' && row.phase !== 'defined')) return row;
  const phase = row.phase === 'define' ? defineFor(row.model) : afterDefine(row.model);
  return { ...row, phase, status: row.status === 'defined' ? (phase === 'finished' ? 'finished' : 'active') : row.status };
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/migrate.mjs tests/unit/problem-solver-migrate.test.js packages/problem-solver/types.ts
git commit -m "Problem Solver: v2 session types and v1 migration on read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Step engine (`session.mjs`)

**Files:**
- Rewrite: `netlify/functions/_shared/problem-solver/session.mjs`
- Rewrite tests: `tests/unit/problem-solver-session.test.js`

- [ ] **Step 1: Rewrite the test file to the v2 shape**

Replace the whole file with:

```js
// tests/unit/problem-solver-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptSuggestion, activeRun, applyCoachTurn, createSession, dismissSuggestion,
  archive, moveOn, keepAnyway, score, rescoreRadar, say, summaryRow, followOn
} from '../../netlify/functions/_shared/problem-solver/session.mjs';

let counter = 0;
const deps = { now: () => '2026-10-19T10:00:00.000Z', newId: () => `id${(counter += 1)}` };
const coach = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, ...fields });

function framed(model = 'seven_step', tool = 'five_whys') {
  let s = createSession({ title: 'Late rota', text: 'The rota keeps changing late.' }, deps);
  s = applyCoachTurn(s, coach({ frame: { goal: 'Rota fixed a week ahead', whatIsTrue: 'Changed 3 of 4 weeks', whatCanBeDone: 'Change publish day' }, model: { id: model, reason: 'Default.' }, suggestion: { kind: 'next_tool', tool, reason: 'One symptom.' } }), deps);
  return acceptSuggestion(s, deps);
}

test('create starts a full session in frame with no steps', () => {
  const s = createSession({ title: '', text: 'The rota keeps changing late.', links: [{ kind: 'task', id: 't1' }] }, deps);
  assert.equal(s.kind, 'full');
  assert.equal(s.phase, 'frame');
  assert.deepEqual(s.steps, {});
  assert.deepEqual(s.learnings, []);
  assert.equal(s.pendingLearning, null);
  assert.equal(s.runner.status, 'queued');
  assert.deepEqual(s.links, [{ kind: 'task', id: 't1' }]);
});

test('the model opens its first plan step with the suggested tool', () => {
  const s = framed();
  assert.equal(s.phase, 'define');
  assert.equal(s.steps.define.status, 'open');
  assert.equal(activeRun(s).tool, 'five_whys');
  assert.equal(s.runner.status, 'queued');
  assert.equal(framed('polya').phase, 'identify');
  assert.equal(activeRun(framed('triz')).tool, 'five_whys');
});

test('accepted node is placed; challenged node waits for keep anyway', () => {
  let s = framed();
  s = applyCoachTurn(s, coach({ node: { slot: 'problem', text: 'Rota changes late.' }, skillsSeen: ['analysis'] }), deps);
  assert.equal(activeRun(s).nodes.length, 1);
  s = applyCoachTurn(s, coach({ verdict: 'challenge', message: 'That is a person, not a process.', node: { slot: 'why:1', text: 'Sam is disorganised.' } }), deps);
  assert.equal(s.pendingKeep.slot, 'why:1');
  s = keepAnyway(s, deps);
  assert.equal(activeRun(s).nodes[1].state, 'contested');
  assert.equal(s.runner.status, 'idle');
});

test('illegal slot from the coach throws for repair', () => {
  assert.throws(() => applyCoachTurn(framed(), coach({ node: { slot: 'why:3', text: 'x' } }), deps), (err) => err.code === 'illegal_slot');
});

test('switching keeps the abandoned run in the same step', () => {
  let s = framed();
  s = applyCoachTurn(s, coach({ verdict: 'clarify', suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'Causes branch.' } }), deps);
  s = acceptSuggestion(s, deps);
  assert.deepEqual(s.steps.define.runs.map((r) => [r.tool, r.status, r.switchReason]), [['five_whys', 'switched', 'Causes branch.'], ['problem_tree', 'active', undefined]]);
});

test('dismissing a suggestion clears it', () => {
  let s = applyCoachTurn(framed(), coach({ suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'r' } }), deps);
  assert.equal(dismissSuggestion(s, deps).suggestion, null);
});

test('moving on with an unfinished tool skips the step, opens the next and queues a boundary turn', () => {
  let s = moveOn(framed(), deps);
  assert.equal(s.steps.define.status, 'skipped');
  assert.equal(s.steps.define.runs[0].status, 'done');
  assert.equal(s.phase, 'analyse');
  assert.deepEqual(s.steps.analyse, { runs: [], status: 'open', objection: null });
  assert.deepEqual(s.runner, { status: 'queued', mode: 'boundary', error: null, leaving: 'define' });
  assert.equal(s.turns.at(-1).text, 'Move on.');
  s = applyCoachTurn(s, coach({ verdict: 'clarify', message: 'Fair. The root is still open. What did you learn about how you work through problems?', exitObjection: 'Root cause not reached.' }), deps);
  assert.equal(s.steps.define.objection, 'Root cause not reached.');
  assert.equal(s.pendingLearning, 'define');
  assert.equal(s.runner.mode, 'turn');
});

test('the answer after a boundary is recorded as a learning against the step left', () => {
  let s = applyCoachTurn(moveOn(framed(), deps), coach({ verdict: 'clarify', message: 'What did you learn?' }), deps);
  s = say(s, 'I jump to blame when I am tired.', deps);
  s = applyCoachTurn(s, coach({ verdict: 'clarify', message: 'Noted.', learning: 'Jumps to blame when tired.' }), deps);
  assert.deepEqual(s.learnings, [{ step: 'define', text: 'Jumps to blame when tired.', at: '2026-10-19T10:00:00.000Z' }]);
  assert.equal(s.pendingLearning, null);
});

test('moving on from a step with a complete run marks it done', () => {
  let s = framed('seven_step', 'contradiction');
  for (const [slot, text] of [['improving', 'Speed'], ['worsening', 'Care'], ['statement', 'Speed costs care.']]) s = applyCoachTurn(s, coach({ node: { slot, text } }), deps);
  assert.equal(moveOn(s, deps).steps.define.status, 'done');
});

test('moving on from the last step finishes the session', () => {
  let s = framed('polya');
  for (const _ of [1, 2, 3, 4]) s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  assert.equal(s.phase, 'document');
  s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  assert.equal(s.phase, 'finished');
  assert.equal(s.status, 'finished');
  assert.equal(s.runner.leaving, 'document');
  assert.equal(s.turns.at(-1).text, 'That is everything.');
});

test('move on before a model exists is refused', () => {
  assert.throws(() => moveOn(createSession({ text: 'ok' }, deps), deps), (err) => err.status === 409);
});

test('a next_step suggestion is accepted as move on', () => {
  let s = framed();
  s = { ...s, suggestion: { kind: 'next_step', reason: 'Ready.' } };
  s = acceptSuggestion(s, deps);
  assert.equal(s.phase, 'analyse');
  assert.equal(s.suggestion, null);
});

test('after the learning is recorded, a step with no tool falls back to its default tool', () => {
  let s = framed('triz');
  s = moveOn(s, deps);
  assert.equal(s.phase, 'general_problem');
  s = applyCoachTurn(s, coach({ verdict: 'clarify', message: 'What did you learn?', suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'ignored at a boundary' } }), deps);
  assert.equal(s.suggestion, null, 'the boundary turn asks the learning question first');
  s = applyCoachTurn(say(s, 'I rush.', deps), coach({ verdict: 'clarify', message: 'Noted.', learning: 'Rushes.' }), deps);
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'contradiction', reason: 'A good first tool for General problem.' });
});

function treeSession() {
  let s = framed('seven_step', 'problem_tree');
  for (const [slot, text] of [['trunk', 'Inconsistent eating'], ['effect:1', 'No progress'], ['cause:1', 'Delayed payoff']]) s = applyCoachTurn(s, coach({ node: { slot, text } }), deps);
  return s;
}

test('Define keeps its chain: diagnostic, then statement, then SMART, then next step', () => {
  let s = treeSession();
  assert.equal(s.suggestion, null);
  s = applyCoachTurn(s, coach({ node: { slot: 'cause:2', text: 'Medication suppresses appetite' } }), deps);
  assert.deepEqual([s.suggestion.kind, s.suggestion.tool], ['next_tool', 'problem_statement']);
  s = acceptSuggestion(s, deps);
  for (const [slot, text] of [['problem', 'p'], ['impact', 'i'], ['benefit', 'b'], ['statement', 'st']]) s = applyCoachTurn(s, coach({ node: { slot, text } }), deps);
  assert.equal(s.suggestion.tool, 'smart');
  s = acceptSuggestion(s, deps);
  assert.deepEqual(s.steps.define.runs.map((r) => r.status), ['done', 'done', 'active']);
});

test('outside Define a complete tool suggests the next step', () => {
  const s = { ...framed(), phase: 'analyse', steps: { define: { runs: [], status: 'done', objection: null }, analyse: { runs: [{ id: 'c', tool: 'contradiction', status: 'active', nodes: ['improving', 'worsening', 'statement'].map((slot, i) => ({ id: `n${i}`, slot, text: slot, state: 'accepted', skills: [], turnId: 't' })), edges: [] }], status: 'open', objection: null } } };
  assert.equal(followOn(s).kind, 'next_step');
});

test('the coach\'s own suggestion wins over the fallback', () => {
  const s = applyCoachTurn(treeSession(), coach({ node: { slot: 'cause:2', text: 'Medication' }, suggestion: { kind: 'switch_tool', tool: 'concept_map', reason: 'Causes interact.' } }), deps);
  assert.equal(s.suggestion.tool, 'concept_map');
});

function radarSession(phase = 'define', status = 'active') {
  const nodes = ['current', 'objective', 'axis:1', 'axis:2', 'axis:3'].map((slot, i) => ({ id: `x${i}`, slot, text: slot, state: 'accepted', skills: [], turnId: 't' }));
  const base = createSession({ title: 'Radar', text: 'Scores to track.' }, deps);
  return { ...base, model: { id: 'seven_step', reason: '' }, phase, runner: { status: 'idle', mode: 'turn', error: null }, steps: { define: { runs: [{ id: 'run', tool: 'gap_radar', status, nodes, edges: [], radar: { snapshots: [] } }], status: phase === 'define' ? 'open' : 'done', objection: null } } };
}

test('score appends a snapshot to the named run, or the active scorable run', () => {
  const s = score(radarSession(), { runId: 'run', current: [3, 4, 5], objective: [8, 8, 9] }, deps);
  assert.deepEqual(s.steps.define.runs[0].radar.snapshots, [{ at: '2026-10-19T10:00:00.000Z', current: [3, 4, 5], objective: [8, 8, 9] }]);
  assert.equal(score(radarSession(), { current: [3, 4, 5], objective: [8, 8, 9] }, deps).steps.define.runs[0].radar.snapshots.length, 1);
  assert.equal(s.runner.status, 'idle');
});

test('score works in later steps and once finished (tracking progress)', () => {
  assert.equal(score(radarSession('analyse', 'done'), { runId: 'run', current: [3, 4, 5], objective: [8, 8, 9] }, deps).steps.define.runs[0].radar.snapshots.length, 1);
  assert.equal(score(radarSession('finished', 'done'), { runId: 'run', current: [3, 4, 5], objective: [8, 8, 9] }, deps).steps.define.runs[0].radar.snapshots.length, 1);
});

test('score rejects bad scores with a 400 and the tool message; frame and missing runs are 409', () => {
  assert.throws(() => score(radarSession(), { runId: 'run', current: [3, 4], objective: [8, 8, 9] }, deps), (err) => err.status === 400 && /one score per topic/.test(err.message));
  assert.throws(() => score(radarSession('frame'), { runId: 'run', current: [3, 4, 5], objective: [8, 8, 9] }, deps), (err) => err.status === 409);
  assert.throws(() => score(radarSession(), { runId: 'nope', current: [3, 4, 5], objective: [8, 8, 9] }, deps), (err) => err.status === 409);
});

test('rescoreRadar is an alias for scoring the latest radar run', () => {
  assert.equal(rescoreRadar(radarSession(), { current: [3, 4, 5], objective: [8, 8, 9] }, deps).steps.define.runs[0].radar.snapshots.length, 1);
});

test('say appends a user turn and queues; summary rows are small', () => {
  const s = say(framed(), 'Because the roster is drafted on Friday.', deps);
  assert.equal(s.runner.status, 'queued');
  const row = summaryRow(s);
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'frame', 'id', 'kind', 'links', 'model', 'phase', 'skills', 'status', 'title', 'tool', 'updatedAt']);
  assert.equal(row.tool, 'five_whys');
  assert.equal(summaryRow(row), row);
});

test('summary rows count answered frame questions and skills seen', () => {
  let s = createSession({ title: 'Late rota', text: 'x' }, deps);
  s = applyCoachTurn(s, coach({ frame: { goal: 'g' }, skillsSeen: ['analysis', 'inference'] }), deps);
  assert.equal(summaryRow(s).frame, 1);
  assert.deepEqual(summaryRow(s).skills, { analysis: 1, inference: 1 });
});

test('limits: text over 12000 chars, title cap, links cap', () => {
  const big = 'x'.repeat(12001);
  assert.throws(() => createSession({ text: big }, deps), (err) => err.status === 413 && err.code === 'limit');
  const s = createSession({ text: 'ok', links: Array.from({ length: 30 }, (_, i) => ({ kind: 'task', id: `t${i}` })) }, deps);
  assert.equal(s.links.length, 20);
  assert.equal(createSession({ title: 't'.repeat(300), text: 'ok' }, deps).title.length, 120);
});

test('archive resets the runner', () => {
  assert.deepEqual(archive(createSession({ text: 'ok' }, deps), deps).runner, { status: 'idle', mode: 'turn', error: null });
});

test('keepAnyway with a slot that no longer fits is a 409', () => {
  let s = framed();
  s = applyCoachTurn(s, coach({ node: { slot: 'problem', text: 'y' } }), deps);
  s = { ...s, pendingKeep: { slot: 'problem', text: 'x', objection: 'o', skills: [], runId: activeRun(s).id } };
  assert.throws(() => keepAnyway(s, deps), (err) => err.status === 409 && err.message === 'That answer no longer fits here.');
});
```

- [ ] **Step 2: Run, expect FAIL** (no `moveOn`, `score`, `steps`).

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-session.test.js`

- [ ] **Step 3: Rewrite `session.mjs`**

```js
// netlify/functions/_shared/problem-solver/session.mjs
import { addEdge, applyScores, canEdge, canPlace, isComplete as isRunComplete, newRun, placeNode, toolDef } from '../../../../packages/problem-solver/machine.mjs';
import { defaultToolFor, firstStep, nextStepAfter, stepName } from '../../../../packages/problem-solver/steps.mjs';

const TITLE_MAX = 120;
const TEXT_MAX = 12000;
const LINKS_MAX = 20;
const FRAME_KEYS = ['goal', 'whatIsTrue', 'whatCanBeDone'];

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });

function checkLength(text) {
  if (text.length > TEXT_MAX) throw fail(413, 'limit', 'That is too long; keep it under 12,000 characters.');
}

const touch = (session, deps) => ({ ...session, updatedAt: deps.now() });
const idle = () => ({ status: 'idle', mode: 'turn', error: null });
const emptyStep = () => ({ runs: [], status: 'open', objection: null });

function queue(session, mode = 'turn', leaving = null) {
  return { ...session, runner: { status: 'queued', mode, error: null, ...(leaving ? { leaving } : {}) } };
}

function userTurn(text, deps) {
  return { id: deps.newId(), role: 'user', text, createdAt: deps.now() };
}

/** The step the session is in, or null in frame and once finished. */
export function currentStep(session) {
  return session.steps?.[session.phase] ?? null;
}

export function activeRun(session) {
  return currentStep(session)?.runs.find((run) => run.status === 'active') ?? null;
}

/** Every run in step order, for summaries and the record. */
export function allRuns(session) {
  return Object.values(session.steps ?? {}).flatMap((step) => step.runs);
}

function withStep(session, id, patch) {
  return { ...session, steps: { ...session.steps, [id]: { ...(session.steps[id] ?? emptyStep()), ...patch } } };
}

function replaceRun(session, run) {
  const steps = Object.fromEntries(Object.entries(session.steps).map(([id, step]) => [id, { ...step, runs: step.runs.map((item) => (item.id === run.id ? run : item)) }]));
  return { ...session, steps };
}

export function createSession({ title = '', text, links = [] }, deps) {
  const at = deps.now();
  const clean = String(text ?? '').trim();
  if (!clean) throw fail(400, 'validation_error', 'Describe the problem to start.');
  checkLength(clean);
  return {
    id: deps.newId(),
    title: (String(title).trim() || clean).slice(0, TITLE_MAX),
    revision: 0,
    kind: 'full',
    status: 'active',
    phase: 'frame',
    frame: {},
    model: null,
    links: links.slice(0, LINKS_MAX).filter((link) => ['task', 'project', 'goal'].includes(link?.kind) && typeof link.id === 'string').map(({ kind, id }) => ({ kind, id })),
    steps: {},
    learnings: [],
    pendingLearning: null,
    turns: [userTurn(clean, deps)],
    summary: '',
    suggestion: null,
    pendingKeep: null,
    requestIds: [],
    runner: { status: 'queued', mode: 'turn', error: null },
    createdAt: at,
    updatedAt: at
  };
}

export function say(session, text, deps) {
  const clean = String(text ?? '').trim();
  if (!clean) throw fail(400, 'validation_error', 'Write something first.');
  checkLength(clean);
  return queue(touch({ ...session, turns: [...session.turns, userTurn(clean, deps)] }, deps));
}

/**
 * What comes after a finished tool. In Define: diagnostic, then problem statement,
 * then SMART, then the next step. In every other step: the next step.
 * Null while the active tool is short of its minimum.
 */
export function followOn(session) {
  const run = activeRun(session);
  if (!run || !isRunComplete(run)) return null;
  const def = toolDef(run.tool);
  if (def.step === 'define') {
    const ran = new Set(currentStep(session).runs.map((item) => item.tool));
    if (def.kind === 'diagnostic' && !ran.has('problem_statement')) {
      return { kind: 'next_tool', tool: 'problem_statement', reason: 'The causes are on the page; now pin the problem down in one statement.' };
    }
    if (def.kind !== 'objectives' && !ran.has('smart')) {
      return { kind: 'next_tool', tool: 'smart', reason: 'Turn the problem into a goal you can measure.' };
    }
  }
  return { kind: 'next_step', reason: 'This step has what it needs; move on when you are ready.' };
}

function frameComplete(frame) {
  return FRAME_KEYS.every((key) => Boolean(frame[key]));
}

const slotToId = (run, slot) => run.nodes.find((node) => node.slot === slot)?.id ?? null;

function placeAccepted(next, turn, coachTurnId, deps) {
  const run = activeRun(next);
  let placed = placeNode(run, { id: deps.newId(), slot: turn.node.slot, text: turn.node.text, title: turn.node.title, state: 'accepted', skills: turn.skillsSeen, turnId: coachTurnId });
  for (const edge of turn.edges) {
    const from = slotToId(placed, edge.from);
    const to = slotToId(placed, edge.to);
    if (canEdge(placed, from, to, edge.kind)) placed = addEdge(placed, { from, to, kind: edge.kind });
  }
  return { ...replaceRun(next, placed), pendingKeep: null };
}

/** The tool suggestion a new step opens with when the coach forgets to give one. */
function openingSuggestion(session) {
  if (!session.model || !currentStep(session) || activeRun(session)) return null;
  const tool = defaultToolFor(session.model.id, session.phase);
  return tool ? { kind: 'next_tool', tool, reason: `A good first tool for ${stepName(session.model.id, session.phase)}.` } : null;
}

/** Apply a validated coach turn. Throws `illegal_slot` so the coach can be asked to repair. */
export function applyCoachTurn(session, turn, deps) {
  const mode = session.runner?.mode ?? 'turn';
  let next = { ...session, runner: idle() };
  const coachTurn = { id: deps.newId(), role: 'coach', text: turn.message, verdict: turn.verdict, skillsSeen: turn.skillsSeen, skillsMissing: turn.skillsMissing, createdAt: deps.now() };

  if (mode === 'boundary') {
    const leaving = session.runner.leaving;
    if (leaving && next.steps[leaving]) next = withStep(next, leaving, { objection: turn.exitObjection ?? next.steps[leaving].objection });
    next = { ...next, pendingLearning: leaving ?? null };
  } else if (next.phase === 'frame') {
    if (turn.verdict === 'accept' && turn.frame) next = { ...next, frame: { ...next.frame, ...turn.frame } };
    if (frameComplete(next.frame) && turn.model) {
      const first = firstStep(turn.model.id);
      next = { ...next, model: turn.model, phase: first, steps: { [first]: emptyStep() } };
    }
  } else if (currentStep(next)) {
    if (turn.learning && next.pendingLearning) {
      next = { ...next, learnings: [...next.learnings, { step: next.pendingLearning, text: turn.learning, at: deps.now() }], pendingLearning: null };
    }
    const run = activeRun(next);
    if (run && turn.node && turn.verdict === 'accept') {
      next = placeAccepted(next, turn, coachTurn.id, deps);
    } else if (run && turn.node && turn.verdict === 'challenge') {
      next = { ...next, pendingKeep: { slot: turn.node.slot, text: turn.node.text, title: turn.node.title, objection: turn.message, skills: turn.skillsSeen, runId: run.id } };
    }
  }

  // A boundary turn asks the learning question first, so it carries no suggestion.
  // Afterwards a finished tool, or a step with no tool open, always leaves a next step.
  const quiet = next.phase === 'finished' || mode === 'boundary';
  const suggestion = quiet ? null : (turn.suggestion ?? followOn(next) ?? (next.pendingLearning ? null : openingSuggestion(next)));
  return touch({ ...next, turns: [...next.turns, coachTurn], suggestion, summary: turn.summary ?? next.summary }, deps);
}

export function keepAnyway(session, deps) {
  const keep = session.pendingKeep;
  const run = activeRun(session);
  if (!keep || !run || run.id !== keep.runId) throw fail(409, 'action_not_allowed', 'Nothing to keep.');
  if (!canPlace(run, keep.slot)) throw fail(409, 'action_not_allowed', 'That answer no longer fits here.');
  const placed = placeNode(run, { id: deps.newId(), slot: keep.slot, text: keep.text, title: keep.title, state: 'contested', objection: keep.objection, skills: keep.skills, turnId: null });
  return touch({ ...replaceRun(session, placed), pendingKeep: null, turns: [...session.turns, userTurn('Keep it anyway.', deps)] }, deps);
}

/**
 * Leave the current step. Its active run closes as done; the step is `done` when any
 * kept run is complete, otherwise `skipped`. The next plan step opens (or the session
 * finishes) and a boundary coach turn is queued for the recap, any objection and the
 * "what did you learn about how you solve problems" question.
 */
export function moveOn(session, deps) {
  const step = currentStep(session);
  if (!session.model || !step) throw fail(409, 'action_not_allowed', 'Nothing to move on from yet.');
  const leaving = session.phase;
  const runs = step.runs.map((run) => (run.status === 'active' ? { ...run, status: 'done' } : run));
  const status = runs.some((run) => run.status !== 'switched' && isRunComplete(run)) ? 'done' : 'skipped';
  const nextId = nextStepAfter(session.model.id, leaving);
  let next = withStep({ ...session, suggestion: null, pendingKeep: null }, leaving, { runs, status });
  next = { ...next, turns: [...next.turns, userTurn(nextId ? 'Move on.' : 'That is everything.', deps)] };
  next = nextId ? withStep({ ...next, phase: nextId }, nextId, {}) : { ...next, phase: 'finished', status: 'finished' };
  return queue(touch(next, deps), 'boundary', leaving);
}

export function acceptSuggestion(session, deps) {
  const suggestion = session.suggestion;
  if (!suggestion) throw fail(409, 'action_not_allowed', 'No suggestion to accept.');
  if (suggestion.kind === 'next_step' || suggestion.kind === 'finish_define') return moveOn({ ...session, suggestion: null }, deps);
  if (!currentStep(session)) throw fail(409, 'action_not_allowed', 'There is no step open for that tool.');
  const current = activeRun(session);
  let next = { ...session, suggestion: null, pendingKeep: null };
  if (current) next = replaceRun(next, suggestion.kind === 'switch_tool' ? { ...current, status: 'switched', switchReason: suggestion.reason } : { ...current, status: 'done' });
  const step = currentStep(next);
  next = withStep(next, next.phase, { runs: [...step.runs, newRun(suggestion.tool, deps.newId())] });
  return queue(touch(next, deps));
}

export function dismissSuggestion(session, deps) {
  return touch({ ...session, suggestion: null }, deps);
}

/**
 * Score a run (radar, and later force field, decision matrix, Pareto). Uses `runId`
 * when given, else the active run. Allowed in any step and once finished (rescoring
 * tracks progress). The coach is not called.
 */
export function score(session, payload, deps) {
  if (!session.model || session.phase === 'frame') throw fail(409, 'action_not_allowed', 'Scoring opens once the problem is being worked on.');
  const { runId, ...scores } = payload ?? {};
  const run = runId ? allRuns(session).find((item) => item.id === runId) : activeRun(session);
  if (!run) throw fail(409, 'action_not_allowed', 'There is nothing to score.');
  try {
    return touch(replaceRun(session, applyScores(run, scores, deps.now())), deps);
  } catch (error) {
    if (error.code === 'invalid_scores') throw fail(400, 'validation_error', error.message);
    throw error;
  }
}

/** v1 action: score the latest Gap analysis (advanced) run. */
export function rescoreRadar(session, payload, deps) {
  const radars = allRuns(session).filter((run) => run.tool === 'gap_radar');
  const run = radars.find((item) => item.status === 'active') ?? radars.at(-1);
  return score(session, { ...payload, runId: run?.id ?? '__none__' }, deps);
}

export function rename(session, title, deps) {
  const clean = String(title ?? '').trim().slice(0, TITLE_MAX);
  if (!clean) throw fail(400, 'validation_error', 'Title required.');
  return touch({ ...session, title: clean }, deps);
}

export function archive(session, deps) {
  return touch({ ...session, status: 'archived', runner: idle() }, deps);
}

function skillCounts(turns) {
  const counts = {};
  for (const turn of turns) for (const id of turn.skillsSeen ?? []) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
}

/** Small list row. Index rows (no turns) pass through unchanged. */
export function summaryRow(session) {
  if (!Array.isArray(session.turns)) return session;
  const last = allRuns(session).at(-1);
  return {
    id: session.id,
    title: session.title,
    kind: session.kind ?? 'full',
    status: session.status,
    phase: session.phase,
    model: session.model?.id ?? null,
    tool: last?.tool ?? null,
    frame: FRAME_KEYS.filter((key) => Boolean(session.frame?.[key])).length,
    skills: skillCounts(session.turns),
    links: session.links,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}
```

- [ ] **Step 4: Run, expect PASS.**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-session.test.js`

- [ ] **Step 5: Commit** (with Task 7, because `service.mjs` still imports `finishDefine`).

---

### Task 7: Service actions and migrate-on-read

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/service.mjs`
- Modify tests: `tests/unit/problem-solver-service.test.js`

- [ ] **Step 1: Update the service test**

In `tests/unit/problem-solver-service.test.js`:

1. Replace the radar seeding at line ~116 with:

```js
  const seeded = { ...s, model: { id: 'seven_step', reason: '' }, phase: 'define', steps: { define: { runs: [{ id: 'run', tool: 'gap_radar', status: 'active', nodes, edges: [], radar: { snapshots: [] } }], status: 'open', objection: null } } };
```

and the following assertion with `assert.equal(next.steps.define.runs[0].radar.snapshots.length, 1);`. Leave that test's `nodes` as they are.

2. Append:

```js
test('get migrates a stored v1 session without writing it', async () => {
  const store = createMemoryProblemStore();
  const v1 = { id: '11111111-1111-4111-8111-111111111111', title: 'Old', revision: 2, status: 'defined', phase: 'defined', frame: {}, model: { id: 'seven_step', reason: '' }, links: [], define: { runs: [], finishedEarly: true, exitObjection: null }, turns: [], summary: '', suggestion: null, pendingKeep: null, requestIds: [], runner: { status: 'idle', mode: 'turn', error: null }, createdAt: 'c', updatedAt: 'u' };
  await store.write('operator', v1.id, v1, null);
  const service = createProblemSolverService({ store, coach: async () => { throw new Error('unused'); }, now: () => '2026-10-19T10:00:00.000Z' });
  const got = await service.get('operator', v1.id);
  assert.equal(got.phase, 'analyse');
  assert.equal(got.steps.define.status, 'skipped');
  assert.ok((await store.read('operator', v1.id)).value.define, 'store untouched');
});

test('move_on and score are actions; finish_define is kept as an alias for move_on', async () => {
  const store = createMemoryProblemStore();
  const service = createProblemSolverService({ store, coach: async () => ({ verdict: 'clarify', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null }), now: () => '2026-10-19T10:00:00.000Z' });
  let s = await service.create('operator', { text: 'Late rota.' });
  s = { ...s, model: { id: 'seven_step', reason: '' }, phase: 'define', steps: { define: { runs: [], status: 'open', objection: null } }, runner: { status: 'idle', mode: 'turn', error: null } };
  const { etag } = await store.read('operator', s.id);
  await store.write('operator', s.id, s, etag);
  const moved = await service.action('operator', { id: s.id, revision: s.revision, action: 'move_on' });
  assert.equal(moved.phase, 'analyse');
  assert.equal(moved.runner.mode, 'boundary');
  const ran = await service.run('operator', s.id);
  assert.equal(ran.pendingLearning, 'define');
  const again = await service.action('operator', { id: s.id, revision: ran.revision, action: 'finish_define' });
  assert.equal(again.phase, 'devise');
});
```

(`createMemoryProblemStore` and `createProblemSolverService` are already imported in that file; if not, import them from `../../netlify/functions/_shared/problem-solver/store.mjs` and `.../service.mjs`.)

- [ ] **Step 2: Run, expect FAIL.**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-service.test.js`

- [ ] **Step 3: Implement**

In `service.mjs`:

1. Replace the session import block with:

```js
import {
  acceptSuggestion, applyCoachTurn, archive, createSession, dismissSuggestion,
  keepAnyway, moveOn, rename, rescoreRadar, say, score, summaryRow
} from './session.mjs';
import { migrateRow, migrateSession } from './migrate.mjs';
```

2. In `load`, migrate the value:

```js
  async function load(owner, id) {
    if (!ID_RE.test(String(id ?? ''))) throw httpError(400, 'validation_error', 'Valid session id required.');
    const row = await store.read(owner, id);
    if (!row) throw httpError(404, 'not_found', 'Problem not found.');
    return { ...row, value: migrateSession(row.value) };
  }
```

3. Replace `ACTIONS` with:

```js
  const ACTIONS = {
    say: (s, body) => say(s, body.text, deps),
    keep_anyway: (s) => keepAnyway(s, deps),
    accept_suggestion: (s) => acceptSuggestion(s, deps),
    dismiss_suggestion: (s) => dismissSuggestion(s, deps),
    move_on: (s) => moveOn(s, deps),
    finish_define: (s) => moveOn(s, deps),
    rename: (s, body) => rename(s, body.text, deps),
    score: (s, body) => score(s, body.payload ?? {}, deps),
    rescore_radar: (s, body) => rescoreRadar(s, { current: body.current, objective: body.objective }, deps),
    archive: (s) => archive(s, deps),
    retry: (s) => {
      if (s.runner.status !== 'failed') throw httpError(409, 'action_not_allowed', 'Nothing to retry.');
      return { ...s, runner: { ...s.runner, status: 'queued', error: null } };
    }
  };
```

4. In `list`, migrate rows:

```js
    async list(owner, { limit = 100, offset = 0 } = {}) {
      const rows = (await store.list(owner, limit, offset)).map((row) => migrateRow(summaryRow(row.value)));
      return Promise.all(rows.map(async (row) => (row.skills ? row : migrateRow(summaryRow(migrateSession((await store.read(owner, row.id))?.value ?? row))))));
    },
```

5. In `unstale`, keep the `leaving` field: replace its body with
`(isStale(s) ? { ...s, runner: { ...s.runner, status: 'failed', error: STALE_ERROR } } : s)`.

6. In `run`'s catch, keep `leaving` too: `next = { ...value, runner: { ...value.runner, status: 'failed', error: error.message || 'The coach could not answer.' } };`

- [ ] **Step 4: Run session, service, migrate tests, expect PASS.**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-session.test.js tests/unit/problem-solver-service.test.js tests/unit/problem-solver-migrate.test.js tests/unit/problem-solver-http.test.js`

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/session.mjs netlify/functions/_shared/problem-solver/service.mjs tests/unit/problem-solver-session.test.js tests/unit/problem-solver-service.test.js
git commit -m "Problem Solver: step engine with move on, boundary turns, learnings and generic scoring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Coach schema (`next_step`, `learning`)

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/coach-schema.mjs`
- Test: `tests/unit/problem-solver-coach-schema.test.js` (append)

- [ ] **Step 1: Failing tests (append)**

```js
test('next_step suggestions are accepted; finish_define is read as next_step', () => {
  const base = { verdict: 'clarify', message: 'Ready to move on?' };
  assert.deepEqual(validateCoachTurn({ ...base, suggestion: { kind: 'next_step', reason: 'Enough here.' } }).value.suggestion, { kind: 'next_step', reason: 'Enough here.' });
  assert.deepEqual(validateCoachTurn({ ...base, suggestion: { kind: 'finish_define', reason: 'Done.' } }).value.suggestion, { kind: 'next_step', reason: 'Done.' });
});

test('learning is kept as trimmed text, else null', () => {
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'Noted.', learning: '  Rushes to fixes.  ' }).value.learning, 'Rushes to fixes.');
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'Noted.' }).value.learning, null);
});
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-coach-schema.test.js`

- [ ] **Step 3: Implement**

In `suggestionOf`, replace the `finish_define` line with:

```js
  if (raw.kind === 'next_step' || raw.kind === 'finish_define') return { value: { kind: 'next_step', reason } };
```

In the returned `value`, add after `exitObjection`:

```js
      learning: text(raw.learning, 600)
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/coach-schema.mjs tests/unit/problem-solver-coach-schema.test.js
git commit -m "Problem Solver: coach schema reads next_step and learning

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Knowledge layers

**Files:**
- Create: `netlify/functions/_shared/problem-solver/knowledge/process.mjs`
- Create: `netlify/functions/_shared/problem-solver/knowledge/chapters.mjs`
- Create: `netlify/functions/_shared/problem-solver/knowledge/final-words.mjs`
- Create: `netlify/functions/_shared/problem-solver/knowledge/selection.mjs`
- Test: `tests/unit/problem-solver-knowledge.test.js`

All text is our own words. No book sentences are copied. Short attributed quotes only where noted.

- [ ] **Step 1: Failing test**

```js
// tests/unit/problem-solver-knowledge.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { PROCESS } from '../../netlify/functions/_shared/problem-solver/knowledge/process.mjs';
import { CHAPTERS } from '../../netlify/functions/_shared/problem-solver/knowledge/chapters.mjs';
import { FINAL_WORDS } from '../../netlify/functions/_shared/problem-solver/knowledge/final-words.mjs';
import { SELECTION } from '../../netlify/functions/_shared/problem-solver/knowledge/selection.mjs';
import { BOOK_STEP_IDS } from '../../packages/problem-solver/steps.mjs';

test('every book step has a chapter paragraph', () => {
  for (const id of BOOK_STEP_IDS) assert.ok(CHAPTERS[id]?.length > 120, id);
});

test('process layer covers the models and the metacognitive frame', () => {
  for (const phrase of ['seven-step', 'Polya', 'TRIZ', 'orientation', 'verification', 'impulsive']) assert.ok(PROCESS.includes(phrase), phrase);
});

test('final words layer covers skill, emotion and Polya\'s heuristic, with guidance on when', () => {
  for (const phrase of ['skill', 'emotion', 'determination, hope and success', 'curiosity', 'WHEN']) assert.ok(FINAL_WORDS.includes(phrase), phrase);
});

test('selection guides exist for define and contradiction and name only registered tools', async () => {
  const { TOOL_IDS } = await import('../../packages/problem-solver/tools/index.mjs');
  for (const id of ['define', 'contradiction']) assert.ok(SELECTION[id], id);
  for (const [step, text] of Object.entries(SELECTION)) {
    for (const match of text.matchAll(/`([a-z_]+)`/g)) assert.ok(TOOL_IDS.includes(match[1]), `${step} names unknown tool ${match[1]}`);
  }
});
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-knowledge.test.js`

- [ ] **Step 3: Create the four modules**

```js
// netlify/functions/_shared/problem-solver/knowledge/process.mjs
/**
 * The process layer, in our words. v1 content moved here unchanged in substance.
 * Rewritten from the book's pp.12–61 in Task 10 once the rescan is supplied.
 */
export const PROCESS = `THE PROCESS
- The default is the seven-step process: Define, Analyse, Devise, Decide, Implement, Improve, with Document running alongside. If an outcome is not successful, feedback returns to Define or Devise; if it is, carry on.
- Polya's four steps suit a bounded problem with a clear test of success: identify, devise, implement, evaluate, and loop back if the solution fails.
- TRIZ suits a contradiction, where improving one thing worsens another: specific problem, general problem (the contradiction), general solution, specific solution.

COGNITIVE AND METACOGNITIVE FRAME (Garofalo and Lester)
- Cognitive stages: orientation (understand the problem), organisation (goals and plans), execution (carry out and regulate), verification (check decisions and outcomes).
- Metacognitive knowledge: person (beliefs, emotions, confidence), task (the problem's content, context and structure), strategy (which approaches help).
- The commonest failure is skipping verification, or carrying on with a plan that has already failed.
- Problem orientation matters (D'Zurilla and Nezu): watch for avoidance and for impulsive, careless jumps to a fix.

STRATEGIES
- Algorithms: step-by-step procedures that guarantee an answer when one exists.
- Heuristics: rules of thumb that are fast but can mislead.
- Trial and error: useful when options are few and cheap to test; wasteful otherwise.`;
```

```js
// netlify/functions/_shared/problem-solver/knowledge/chapters.mjs
/** One paragraph per book step: what the step is for, in our words. */
export const CHAPTERS = Object.freeze({
  define: 'DEFINE: get the problem right before solving it. Separate facts from opinions, find the real cause rather than the loudest symptom, and finish with a statement and goals that can be measured. A fix offered here is usually premature.',
  contradiction: 'CONTRADICTION (TRIZ general problem): restate the specific problem as a trade-off: the quality you want to improve and the one that gets worse when you do. A good contradiction is one sentence and contains no solution.',
  analyse: 'ANALYSE: dig beneath assumptions and symptoms to the underlying causes. A more granular picture leads to better-aimed interventions and fewer unintended consequences, and lets solutions fit the context instead of being generic. Gather enough relevant information but not duplicates or noise. Question presumptions, weigh evidence, look for bias, and consider other possibilities, so the later decision rests on evidence.',
  devise: 'DEVISE: generate options. This needs divergent, creative thinking and often a deliberate change of frame from your habit (a detail person tries the big picture, a visionary gets concrete). In a group, people should generate ideas alone first and pool them after, because pooled solo ideas beat group brainstorming. Encourage debate and scrutiny; new ideas often come from combining distant ones. Every real solution carries trade-offs.',
  decide: 'DECIDE: outside maths and technical problems there is rarely one right answer, only the best fit for the goal. Fast intuitive judgement (Kahneman) relies on patterns and experience; slow analytical judgement reviews data and compares options deliberately, which these tools support. Simple, targeted information beats too little, too much or over-complex information. Bias affects both modes, more so the intuitive one. Switching well between intuition and analysis, given time pressure and what you know, is a mark of expertise.',
  implement: 'IMPLEMENT: often the hardest part. People prefer the status quo, fear loss and regret, and favour what is familiar, so change needs a plan. Break the goal into small, specific actions, some only minutes long. Plan resources, realistic deadlines and stakeholder communication, and anticipate hurdles. Set measurable indicators tied to the goal, learn from similar past cases, and pilot or trial while it is still cheap to change course.',
  improve: 'IMPROVE: continuous improvement. Reflect on how things are going with frequent informal checks, at any stage. Review both the solution and the process that produced it, and adjust either. Small increments count (Kaizen): improve processes and standards, remove waste and steps that add no value, stay adaptable, and keep learning. Reflective practice builds skill whatever the outcome.',
  document: 'DOCUMENT: knowledge is the valuable resource, and much of it is lost to memory. Capture what was learned so it can be found, reused and built on next time. Keep what matters, organise it so it can be found, correct it, and name it consistently.'
});
```

```js
// netlify/functions/_shared/problem-solver/knowledge/final-words.mjs
/** The book's closing message, as coaching guidance. Our words. */
export const FINAL_WORDS = `PROBLEM SOLVING AS A PERSON, NOT JUST A METHOD
- Problem solving is a skill that grows with practice, not a fixed talent. At every step boundary, ask one question about what the person learned about how they solve problems, and record their answer in "learning".
- It is not purely intellectual: beliefs, emotion, temperament and self-regulation shape how well people solve problems. Treat frustration, doubt and confidence as part of the work, not a distraction.
- Polya's heuristic of determination, hope and success: persistence and willpower carry people through the difficulty and disappointment that come with real problems.
- Curiosity, an open mind and persistence make a better problem solver.

WHEN TO USE WHICH (choose what suits the moment; do not recite these)
- Discouraged, stuck, or about to give up: acknowledge it, then appeal to determination and hope with one concrete next step.
- Strong feeling stated as fact ("this is hopeless"): treat it as person knowledge, separate the feeling from the facts.
- Showing curiosity, openness to another view, or sticking with it: name the trait in a short clause, as you would a skill.
- Over-confident or rushing: slow them with a verification question.`;
```

```js
// netlify/functions/_shared/problem-solver/knowledge/selection.mjs
/**
 * How to choose a tool within a book step, keyed by problem shape. Tool ids in
 * backticks must be registered (the test checks). Later plans add their steps.
 */
export const SELECTION = Object.freeze({
  define: 'Choose from the problem\'s shape: one symptom with a likely single chain, `five_whys`; several causes and effects to sort, `problem_tree`; many interacting factors, `concept_map`; a clear present and desired state, `gap_basic`; several dimensions that can each be scored, `gap_radar`. After the diagnostic tool comes `problem_statement`, then `smart`.',
  contradiction: 'Use `contradiction`: name what should improve, what worsens when it does, then state the trade-off in one sentence.'
});
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/knowledge tests/unit/problem-solver-knowledge.test.js
git commit -m "Problem Solver: coach knowledge layers (process, chapters, final words, selection)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Rewrite the process layer from pp.12–61 (BLOCKED)

**Do not start until Adam has supplied the pp.12–61 scan.** If it is not available when you reach this task, skip it, carry on with Task 11, and report it as outstanding. Do not write this layer from memory or from v1's summary.

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/knowledge/process.mjs`
- Test: `tests/unit/problem-solver-knowledge.test.js` (the existing process test must still pass)

- [ ] **Step 1:** Read the scan in full (Read tool with `pages`, at most 20 per call; install poppler with `brew install poppler` if page rendering fails).
- [ ] **Step 2:** Rewrite `PROCESS` in our own words, keeping its four headings and adding: thinking skills (p.13) as a short list keyed to the skill ids in `packages/problem-solver/skills.mjs`; metacognition and self-regulation (pp.14–16); strategies (pp.17–19) with when each fits; Polya (pp.20–21) and TRIZ (p.23) as the book presents them; the seven-step process and its loops (p.37); how to use the toolkit (p.39), including whether every tool must be used. No sentence may be copied from the book; at most one short attributed quote.
- [ ] **Step 3:** Keep `PROCESS` under 900 words (it is sent on every coach turn, cached).
- [ ] **Step 4:** Run `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-knowledge.test.js`. Expected: PASS.
- [ ] **Step 5:** Commit: `git commit -am "Problem Solver: process knowledge from the book's opening chapters"` with the Co-Authored-By trailer.

---

### Task 11: Layered, step-aware prompts

**Files:**
- Rewrite: `netlify/functions/_shared/problem-solver/prompts.mjs`
- Modify tests: `tests/unit/problem-solver-prompts.test.js`

- [ ] **Step 1: Update the prompt tests**

Replace the file with:

```js
// tests/unit/problem-solver-prompts.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC, buildCoachPrompt } from '../../netlify/functions/_shared/problem-solver/prompts.mjs';
import { createSession, applyCoachTurn, acceptSuggestion, moveOn, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-19T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const turn = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, ...fields });

function inTool(tool = 'five_whys', model = 'seven_step') {
  let s = createSession({ text: 'Late work.' }, deps);
  s = applyCoachTurn(s, turn({ frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: model, reason: 'r' }, suggestion: { kind: 'next_tool', tool, reason: 'r' } }), deps);
  return acceptSuggestion(s, deps);
}

test('rubric carries voice, skills, process, chapters and final words', () => {
  for (const word of ['Metacognition', 'Critical thinking', '25 and 60 words', 'Keep it anyway', 'seven-step', 'DEVISE:', 'determination, hope and success', 'Never end on agreement or praise alone.', 'MINIMUM MET']) {
    assert.ok(RUBRIC.includes(word), `rubric mentions ${word}`);
  }
});

test('system is two cached layers: the fixed rubric, then the step layer', () => {
  const prompt = buildCoachPrompt(inTool());
  assert.equal(prompt.system.length, 2);
  assert.equal(prompt.system[0], RUBRIC);
  assert.match(prompt.system[1], /CURRENT STEP: Define/);
  assert.match(prompt.system[1], /`problem_tree`/);
  assert.match(prompt.system[1], /five_whys \(5 Whys\)/);
  assert.match(prompt.system[1], /Watch for: Stopping at a symptom/);
});

test('frame prompt asks for the missing frame questions and has an empty step layer', () => {
  const prompt = buildCoachPrompt(createSession({ text: 'Students hand in work late.' }, deps));
  assert.match(prompt.user, /PHASE: frame/);
  assert.match(prompt.user, /Missing frame answers: goal, whatIsTrue, whatCanBeDone/);
  assert.match(prompt.system[1], /No step yet/);
});

test('tool prompt lists the tool steps, open slots and progress', () => {
  const prompt = buildCoachPrompt(inTool());
  assert.match(prompt.user, /ACTIVE TOOL: 5 Whys/);
  assert.match(prompt.user, /Open slots: problem/);
  assert.match(prompt.user, /Progress: not yet at the minimum/);
});

test('boundary prompt names the step left and asks for the learning question', () => {
  const s = moveOn(inTool(), deps);
  const { user } = buildCoachPrompt(s);
  assert.match(user, /MODE: boundary\. The person has just left Define/);
  assert.match(user, /exitObjection/);
  assert.match(user, /PHASE: analyse/);
});

test('after a boundary the prompt asks the coach to record the learning and open the step', () => {
  let s = applyCoachTurn(moveOn(inTool(), deps), turn({ verdict: 'clarify', message: 'What did you learn?' }), deps);
  s = say(s, 'I rush.', deps);
  assert.match(buildCoachPrompt(s).user, /AWAITING LEARNING from Define: put their answer in "learning"/);
});

test('earlier steps are summarised for carry-forward', () => {
  let s = inTool();
  s = applyCoachTurn(s, turn({ node: { slot: 'problem', text: 'Reports are late.' } }), deps);
  s = moveOn(s, deps);
  assert.match(buildCoachPrompt(s).user, /EARLIER STEPS:\nDefine \(skipped\): 5 Whys done; problem: Reports are late\./);
});

test('finished sessions get a closing instruction', () => {
  let s = inTool('five_whys', 'polya');
  for (const _ of [1, 2, 3, 4, 5]) s = moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps);
  assert.match(buildCoachPrompt(s).user, /PHASE: finished/);
  assert.match(buildCoachPrompt(s).system[1], /The session is finished/);
});
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-prompts.test.js`

- [ ] **Step 3: Rewrite `prompts.mjs`**

```js
// netlify/functions/_shared/problem-solver/prompts.mjs
import { SKILLS } from '../../../../packages/problem-solver/skills.mjs';
import { MODELS } from '../../../../packages/problem-solver/models.mjs';
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';
import { nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { planStep, stepName, stepPlan, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { activeRun, currentStep, followOn } from './session.mjs';
import { PROCESS } from './knowledge/process.mjs';
import { CHAPTERS } from './knowledge/chapters.mjs';
import { FINAL_WORDS } from './knowledge/final-words.mjs';
import { SELECTION } from './knowledge/selection.mjs';

const skillLines = SKILLS.map((skill) => `- ${skill.id} (${skill.name}): ${skill.description}`).join('\n');
const modelLines = Object.values(MODELS).map((model) => `- ${model.id}: ${model.name}. Use when: ${model.when}`).join('\n');
const chapterLines = Object.values(CHAPTERS).join('\n');

/** Fixed layer: identical for every turn of every session, so it caches. */
export const RUBRIC = `You are the Problem Solver coach. You coach one person through a real problem using the Problem Solver toolkit's process, from defining it to documenting what was learned. You are a coach, not an assistant: warm, direct, and never flattering. You do not agree by default.

VOICE
- Every message is between 25 and 60 words, usually two or three sentences.
- Ask at most one question per message, and end with it when you ask one.
- Every message leaves the person knowing what to do next: end with a question or a clear next step. Never end on agreement or praise alone.
- When an answer is good, say so in one short clause and name the skill it shows. No praise beyond that.
- Plain words. No lists, headings or markdown in the message.

THINKING SKILLS (tag answers with these ids in skillsSeen and skillsMissing)
${skillLines}

${PROCESS}

PROCESS MODELS
${modelLines}

THE STEPS
${chapterLines}

${FINAL_WORDS}

SESSION SHAPE
1. Frame: get clear answers to the three questions: What is the goal (the ideal state or result)? What is true (facts and data, not perceptions or opinions)? What can be done (can it be solved as it stands, or should it be reframed to something more achievable)? Record each accepted answer in "frame" as goal, whatIsTrue, whatCanBeDone. Ask one at a time.
2. When all three are answered, choose a process model with a one-sentence reason in "model", and suggest the first tool of its first step with a "next_tool" suggestion.
3. Entering a step, orient the person in one sentence (what the step is for), then recommend one tool with "next_tool", saying why and naming a sibling tool you passed over.
4. In a tool, work its steps in order. Each answer that holds up becomes a node in the open slot it belongs to. Only use slot names from "Open slots". Never invent slots. Use the full slot name with its number (effect:1, not effect). Links join the node you are placing to slots already placed, using only the listed link kinds.
5. Carry forward: use what earlier steps established (listed under EARLIER STEPS) as the starting point for the current tool, and say so. Do not copy it in without the person agreeing.
6. The person can move on at any time. Never block them.

GATEKEEPING
In phase frame, use "frame" for accepted answers instead of "node"; "node" is only used inside a tool.
- verdict "accept": the answer holds up. Put it in "node" with the slot, a tidy version of their words (keep their meaning; add no ideas), and a "title" of two or three words naming the point.
- verdict "challenge": the answer does not hold up. Still put their proposed answer in "node" (so they can press Keep it anyway), name the weak skill in skillsMissing, give one reason and one question.
- verdict "clarify": you need more before judging, or you are suggesting something. No node.
Challenge when:
- a symptom is offered as a cause (analysis)
- a perception, belief or opinion is stated as fact (critical_thinking)
- the answer is generic, like "not enough time" or "not enough budget"
- a solution is offered before its step (impulsive orientation; resist the quick fix)
- an answer repeats an earlier one or blames a person rather than a process (logical_reasoning)
- a goal or criterion cannot be measured
- the answer shows thin metacognition: an unexamined assumption, confidence beyond the evidence, or no check on whether it is true (metacognition)
- anything the current tool lists under "Watch for"
If they argue back with a good reason, change your verdict and accept. If they press Keep it anyway, that is their call; do not repeat the objection.

SWITCHING AND CHECK-INS
- If the same slot has been challenged twice, or the tool no longer fits the problem, suggest a better tool with "switch_tool" and a one-sentence reason.
- When the state says MINIMUM MET, the tool has enough to stop (more slots stay open only so the person can add more). In that reply, ask one metacognitive check-in tied to a stage, and put the named next step in "suggestion".

OUTPUT
Reply with one JSON object and nothing else:
{"verdict":"accept|challenge|clarify","message":"...","node":{"slot":"...","text":"...","title":"..."}|null,"edges":[{"from":"slot","to":"slot","kind":"..."}],"skillsSeen":["..."],"skillsMissing":["..."],"frame":{"goal":"...","whatIsTrue":"...","whatCanBeDone":"..."}|null,"model":{"id":"...","reason":"..."}|null,"suggestion":{"kind":"next_tool|switch_tool|next_step","tool":"...","reason":"..."}|null,"summary":"..."|null,"exitObjection":"..."|null,"learning":"..."|null}
Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.`;

const RECENT_TURNS = 12;
const SUMMARY_EVERY = 6;

function toolKnowledge(id) {
  const tool = TOOLS[id];
  return `- ${tool.id} (${tool.name}): ${tool.when}\n  Steps: ${tool.steps.map((s) => s.title).join('; ')}.\n  Watch for: ${tool.failureModes.join(' ')}`;
}

/** Step layer: stable for the whole of a step, so it caches between turns. */
function stepLayer(session) {
  if (session.phase === 'finished') return 'The session is finished. Recap briefly when asked and help the person carry the learning forward. Do not suggest tools.';
  const step = session.model ? planStep(session.model.id, session.phase) : null;
  if (!step) return 'No step yet: the session is still being framed.';
  const books = step.book;
  const tools = toolsForPlanStep(session.model.id, session.phase);
  return [
    `CURRENT STEP: ${stepName(session.model.id, session.phase)} (tool families: ${books.join(', ')})`,
    books.map((id) => SELECTION[id]).filter(Boolean).join('\n') || 'Pick the tool that best fits the problem\'s shape from the list below.',
    `TOOLS FOR THIS STEP:\n${tools.map(toolKnowledge).join('\n')}`
  ].join('\n\n');
}

function transcript(session) {
  return session.turns.slice(-RECENT_TURNS).map((t) => `${t.role === 'user' ? 'PERSON' : 'COACH'}: ${t.text}`).join('\n');
}

function runLines(session, run) {
  const def = TOOLS[run.tool];
  const nodes = run.nodes.map((node) => `  ${node.slot}${node.state === 'contested' ? ' (contested)' : ''}: ${node.text}`).join('\n') || '  (none yet)';
  const slotOf = (id) => run.nodes.find((n) => n.id === id)?.slot;
  const edges = run.edges.length ? `\nLinks:\n${run.edges.map((e) => `  ${slotOf(e.from)} -> ${slotOf(e.to)} (${e.kind})`).join('\n')}` : '';
  return [
    `ACTIVE TOOL: ${def.name} (${def.id})`,
    `Steps:\n${def.steps.map((step, i) => `  ${i + 1}. ${step.title}: ${step.prompt}`).join('\n')}`,
    `Slot meanings: ${Object.entries(def.slots).map(([k, v]) => `${k} = ${v}`).join('; ')}`,
    `Link kinds: ${def.edgeKinds.join(', ') || 'none'}`,
    `Placed:\n${nodes}${edges}`,
    `Open slots: ${nextSlots(run).join(', ') || 'none (tool complete)'}`,
    progressLine(session)
  ].join('\n');
}

function progressLine(session) {
  const next = followOn(session);
  if (!next) return 'Progress: not yet at the minimum for this tool; keep working its steps.';
  const what = next.kind === 'next_step' ? 'next_step (the person can move on to the next step)' : `next_tool ${next.tool}`;
  return `Progress: MINIMUM MET. Next step to suggest: ${what}.`;
}

function earlierSteps(session) {
  if (!session.model) return null;
  const lines = [];
  for (const { step } of stepPlan(session.model.id)) {
    const state = session.steps[step];
    if (!state || step === session.phase) continue;
    const runs = state.runs.filter((run) => run.status !== 'switched' && run.nodes.length);
    const body = runs.map((run) => `${TOOLS[run.tool].name} ${run.status}; ${run.nodes.map((n) => `${n.slot}: ${n.text}`).join(' | ')}`).join(' // ') || 'nothing kept';
    lines.push(`${stepName(session.model.id, step)} (${state.status}${state.objection ? `, coach objected: ${state.objection}` : ''}): ${body}`);
  }
  return lines.length ? `EARLIER STEPS:\n${lines.join('\n')}` : null;
}

/** @returns {{ system: string[], user: string }} */
export function buildCoachPrompt(session) {
  const parts = [`PROBLEM: ${session.title}`];
  if (session.runner?.mode === 'boundary') {
    const left = session.model && session.runner.leaving ? stepName(session.model.id, session.runner.leaving) : 'the last step';
    const status = session.steps?.[session.runner.leaving]?.status;
    parts.push(`MODE: boundary. The person has just left ${left} (${status ?? 'unknown'}). In one message: a one-sentence recap of what ${left} established; if it was left unfinished in a way that matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask one question about what they learned about how they solve problems in that step. No tool suggestion yet.`);
  }
  parts.push(`PHASE: ${session.phase}`);
  const missing = ['goal', 'whatIsTrue', 'whatCanBeDone'].filter((key) => !session.frame[key]);
  parts.push(`Frame: ${JSON.stringify(session.frame)}${missing.length ? `\nMissing frame answers: ${missing.join(', ')}` : ''}`);
  if (session.model) parts.push(`MODEL: ${session.model.id} (${session.model.reason})`);
  const earlier = earlierSteps(session);
  if (earlier) parts.push(earlier);
  if (session.pendingLearning && session.runner?.mode !== 'boundary') {
    const from = stepName(session.model.id, session.pendingLearning);
    parts.push(`AWAITING LEARNING from ${from}: put their answer in "learning" (one sentence, their meaning). Then, unless the session is finished, orient them to the current step in one sentence and suggest its first tool with next_tool.`);
  }
  const step = currentStep(session);
  if (step) {
    for (const run of step.runs.filter((item) => item.status !== 'active')) {
      parts.push(`Earlier tool in this step ${run.tool}: ${run.status}${run.switchReason ? ` (${run.switchReason})` : ''}; ${run.nodes.map((node) => `${node.slot}: ${node.text}`).join(' | ')}`);
    }
  }
  const run = activeRun(session);
  if (run) parts.push(runLines(session, run));
  else if (step && !session.pendingLearning && session.runner?.mode !== 'boundary') parts.push('No tool is open in this step yet: orient them and suggest one with next_tool.');
  if (session.pendingKeep) parts.push(`Last challenged answer (${session.pendingKeep.slot}): ${session.pendingKeep.text}`);
  if (session.summary) parts.push(`Summary so far: ${session.summary}`);
  const coachTurns = session.turns.filter((t) => t.role === 'coach').length;
  if (coachTurns > 0 && coachTurns % SUMMARY_EVERY === 0) parts.push('A summary is due this turn.');
  parts.push(`RECENT CONVERSATION:\n${transcript(session)}`);
  return { system: [RUBRIC, stepLayer(session)], user: parts.join('\n\n') };
}

export function repairPrompt(original, reply, error) {
  return {
    system: original.system,
    user: `${original.user}\n\nYOUR LAST REPLY WAS REJECTED: ${error}\nReply:\n${String(reply).slice(0, 2000)}\n\nSend a corrected JSON object only.`
  };
}

export function rewritePrompt(message) {
  return {
    system: ['You shorten coaching messages. Keep the meaning, the warmth and any final question. Reply with the rewritten message only.'],
    user: `Rewrite in at most 60 words:\n${message}`
  };
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit** (with Task 12; `coach.mjs` must accept the array).

---

### Task 12: Coach runner accepts layered system blocks; step-aware fitting

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/coach.mjs`
- Modify tests: `tests/unit/problem-solver-coach.test.js`

- [ ] **Step 1: Update coach tests**

In `tests/unit/problem-solver-coach.test.js`:
- Replace `s.define.runs` with `s.steps.define.runs` (lines ~91, 132, 133).
- Add:

```js
test('anthropicModel sends each system layer as its own cached block', async () => {
  let body;
  const fetchImpl = async (_url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn' }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await anthropicModel({ ANTHROPIC_API_KEY: 'k' }, fetchImpl)({ system: ['fixed', 'step'], user: 'u', maxTokens: 10 });
  assert.deepEqual(body.system, [
    { type: 'text', text: 'fixed', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: 'step', cache_control: { type: 'ephemeral' } }
  ]);
});
```

(Import `anthropicModel` from `../../netlify/functions/_shared/problem-solver/coach.mjs` if the file does not already.)

- [ ] **Step 2: Run, expect FAIL.**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-coach.test.js`

- [ ] **Step 3: Implement**

In `coach.mjs`:

1. In `fitToRun`, replace the guard line with:

```js
  const run = activeRun(session);
  if (!session.steps?.[session.phase] || !run || !value.node) return { value };
```

2. Replace `anthropicModel` with:

```js
/** Production model: one non-streaming call; every system layer is its own cached block. */
export function anthropicModel(env, fetchImpl = fetch) {
  return async ({ system, user, maxTokens }) => {
    if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error('The coach needs ANTHROPIC_API_KEY.'), { code: 'provider_unavailable', status: 503 });
    const layers = (Array.isArray(system) ? system : [system]).filter(Boolean);
    return completeMessage({
      apiKey: env.ANTHROPIC_API_KEY,
      fetchImpl,
      maxTokens,
      system: layers.map((text) => ({ type: 'text', text, cache_control: { type: 'ephemeral' } })),
      messages: [{ role: 'user', content: user }]
    });
  };
}
```

- [ ] **Step 4: Run prompts and coach tests, expect PASS.**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-prompts.test.js tests/unit/problem-solver-coach.test.js`

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/prompts.mjs netlify/functions/_shared/problem-solver/coach.mjs tests/unit/problem-solver-prompts.test.js tests/unit/problem-solver-coach.test.js
git commit -m "Problem Solver: layered step-aware coach prompt with cached knowledge blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Scripted coach walks steps

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/scripted-coach.mjs`
- Test: `tests/unit/problem-solver-scripted.test.js` (create)

- [ ] **Step 1: Failing test**

```js
// tests/unit/problem-solver-scripted.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { createSession, applyCoachTurn, acceptSuggestion, moveOn, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-19T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const step = async (s) => applyCoachTurn(s, await scriptedCoach(s), deps);

async function intoDefine() {
  let s = await step(createSession({ text: 'Late rota.' }, deps));
  for (const text of ['Rota fixed a week ahead.', 'Changed three weeks out of four, by the logs.', 'Move the publish day earlier.']) s = await step(say(s, text, deps));
  return acceptSuggestion(s, deps);
}

test('boundary asks what was learned, then records it and suggests the next step\'s tool when there is one', async () => {
  let s = await step(moveOn(await intoDefine(), deps));
  assert.equal(s.pendingLearning, 'define');
  assert.match(s.turns.at(-1).text, /learn/);
  s = await step(say(s, 'I blame people when I am tired.', deps));
  assert.deepEqual(s.learnings.map((l) => l.step), ['define']);
});

test('finished sessions get a closing line', async () => {
  let s = await intoDefine();
  for (const _ of [1, 2, 3, 4, 5, 6, 7]) s = await step(moveOn({ ...s, runner: { status: 'idle', mode: 'turn', error: null } }, deps));
  assert.equal(s.phase, 'finished');
  assert.match(s.turns.at(-1).text, /learn/);
});
```

- [ ] **Step 2: Run, expect FAIL** (scripted coach has no boundary or learning handling).

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-scripted.test.js`

- [ ] **Step 3: Implement**

In `scripted-coach.mjs`:

1. Update the `base` constant to include `learning: null`.
2. Replace the `closing` branch with:

```js
  if (session.runner?.mode === 'boundary') {
    return { ...base, verdict: 'clarify', message: 'Fair enough, that step is behind us now. Before we go on: what did you learn about how you tend to work through problems in that step?' };
  }
  if (session.pendingLearning) {
    return { ...base, verdict: 'clarify', learning: last || 'No answer given.', message: session.phase === 'finished' ? 'Thank you, that is worth keeping. The whole problem is on the record now; come back to it whenever you need to.' : 'Thank you, that is worth keeping. Let us open the next step with a tool that fits; start it when you are ready.' };
  }
  if (session.phase === 'finished') {
    return { ...base, verdict: 'clarify', message: 'The whole problem is on the record. Anything you add now is a note for next time; what would you want to remember?' };
  }
```

3. Replace `if (session.phase === 'frame') {` logic's unchanged; replace the `const run = activeRun(session); if (!run) return …` line with:

```js
  const run = activeRun(session);
  if (!run) return { ...base, verdict: 'clarify', message: 'Pick a tool to start this step, and we will work through it one question at a time together.' };
```

(The `openingSuggestion` fallback in `session.mjs` supplies the tool card.)

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/scripted-coach.mjs tests/unit/problem-solver-scripted.test.js
git commit -m "Problem Solver: scripted coach handles step boundaries and learnings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Client API and coach panel

**Files:**
- Modify: `apps/tasks/src/views/problem-solver/api.ts`, `apps/tasks/src/views/problem-solver/coach-panel.ts`, `apps/tasks/src/views/problem-solver/view.ts`
- Modify tests: `apps/tasks/tests/unit/problem-solver-view.test.ts`

- [ ] **Step 1: Update the view test fixture and coach-panel assertions**

In `apps/tasks/tests/unit/problem-solver-view.test.ts`:

1. In the `session()` factory (around line 10), replace the `status`/`phase`/`define` fields with:

```ts
    id: 's1', title: 'Late rota', revision: 3, kind: 'full', status: 'active', phase: 'define',
    steps: { define: { runs: [{ id: 'r1', tool: 'five_whys', status: 'active', nodes: [], edges: [] }], status: 'open', objection: null } },
    learnings: [], pendingLearning: null,
```

2. Replace `finish_define` (line ~30) with `move_on`, and add after it:

```ts
    expect(panel.querySelector('[data-action="move_on"]')!.textContent).toBe('Move on to Analyse');
```

3. Everywhere the file passes `define: …` overrides, convert with these rules:
   - `define: empty` or `define: { runs: [], finishedEarly: false, exitObjection: null }` → `steps: {}` (frame phase) .
   - `define: { runs: [X], … }` → `steps: { define: { runs: [X], status: 'open', objection: null } }`.
   - The `runs(status)` helper's return type becomes `PsSession['steps']` and returns `{ define: { runs: [...], status: status === 'done' ? 'done' : 'open', objection: null } }`.
   - `phase: 'defined', status: 'defined', define: runs('done')` → `phase: 'analyse', steps: { ...runs('done'), analyse: { runs: [], status: 'open', objection: null } }`.

4. Rename the test "opens on the record once defined …" to "opens on the record when a new step has no tool yet …" and keep its assertions (the define step is `done`, clicking it opens the chart).

5. Append:

```ts
  it('offers a next step card that moves on', () => {
    const onAction = vi.fn();
    const panel = mountCoachPanel({ onSay: () => undefined, onAction });
    panel.update(session({ suggestion: { kind: 'next_step', reason: 'Enough here.' } }));
    expect(panel.el.querySelector('.ps-suggestion__title')!.textContent).toBe('Next step: Analyse');
    panel.el.querySelector<HTMLButtonElement>('.ps-suggestion [data-action="accept_suggestion"]')!.click();
    expect(onAction).toHaveBeenCalledWith('accept_suggestion');
  });

  it('labels the last step\'s button Finish and shows the step being worked', () => {
    const panel = mountCoachPanel(noop);
    panel.update(session({ model: { id: 'seven_step', reason: '' }, phase: 'document', steps: { document: { runs: [], status: 'open', objection: null } } }));
    expect(panel.el.querySelector('[data-action="move_on"]')!.textContent).toBe('Finish');
    expect(panel.el.querySelector('.ps-composer__now')!.textContent).toBe('Step: Document');
  });
```

(Make sure `model: { id: 'seven_step', reason: '' }` is in the default fixture; add it if missing, and import `vi` from `vitest`.)

- [ ] **Step 2: Run, expect FAIL.**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-view.test.ts`

- [ ] **Step 3: Implement**

`api.ts`: replace `rescore` with a generic `score` and keep `rescore` as a wrapper:

```ts
  /** Score a run (radar now; force field, decision matrix and Pareto later). */
  score: (session: PsSession, payload: Record<string, unknown> & { runId?: string }) =>
    apiPost<{ session: PsSession }>('/api/problem-solver', { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action: 'score', payload }).then((r) => r.session),
  rescore: (session: PsSession, payload: { current: number[]; objective: number[] }) => problemSolverApi.score(session, payload),
```

`coach-panel.ts`:

1. Add import: `import { nextStepAfter, stepName } from '../../../../../packages/problem-solver/steps.mjs';`
2. In `suggestionCard`, replace the title and button logic with:

```ts
  const nextName = session.model ? nextStepAfter(session.model.id, session.phase) : null;
  const title = suggestion.kind === 'next_step'
    ? (nextName ? `Next step: ${stepName(session.model!.id, nextName)}` : 'Ready to finish')
    : `${suggestion.kind === 'switch_tool' ? 'Switch to' : 'Next'}: ${TOOLS[suggestion.tool].name}`;
  const heading = el('p', 'ps-suggestion__title', title);
  if (suggestion.kind !== 'next_step') heading.prepend(toolEmblem(suggestion.tool));
  card.append(heading, el('p', 'ps-suggestion__reason', suggestion.reason));
  const row = el('div', 'ps-suggestion__actions');
  row.append(actionButton(suggestion.kind === 'next_step' ? 'Move on' : 'Start it', 'accept_suggestion', handlers, 'btn--primary'), actionButton('Not now', 'dismiss_suggestion', handlers));
```

3. Replace the `finish_define` button line with:

```ts
      const inStep = Boolean(session.model && session.steps?.[session.phase]);
      if (inStep && !busy) {
        const after = nextStepAfter(session.model!.id, session.phase);
        actions.append(actionButton(after ? `Move on to ${stepName(session.model!.id, after)}` : 'Finish', 'move_on', handlers));
      }
```

4. Replace the `now.textContent` and placeholder lines with:

```ts
      const stepLabel = session.model && session.steps?.[session.phase] ? `Step: ${stepName(session.model.id, session.phase)}` : '';
      now.textContent = question >= 0 ? `Answering: ${prompts[question]}` : session.phase === 'finished' ? 'Problem finished' : stepLabel;
      now.dataset.q = String(question);
      input.placeholder = session.phase === 'finished' ? 'Add a note for next time…' : 'Your answer…';
```

`view.ts`: `PHASE_LABEL` and `PHASE_COLOUR` index by phase, which is now any step id. Replace them and their two uses:

```ts
const phaseLabel = (row: PsSummary): string => (row.phase === 'frame' ? 'Framing' : row.phase === 'finished' ? 'Finished' : row.model ? stepName(row.model, row.phase) : row.phase);
const phaseColour = (phase: string): string => (phase === 'frame' ? 'var(--ps-blue)' : phase === 'finished' ? 'var(--ps-red)' : 'var(--ps-yellow)');
```

In `problemCard`: `el('span', 'ps-prob__phase', phaseLabel(row))` and `phase.style.setProperty('--c', phaseColour(row.phase))`. Import `stepName` from the package's `steps.mjs`. In `renderSession`'s `rescore`, keep calling `problemSolverApi.rescore` (unchanged signature).

- [ ] **Step 4: Run, expect PASS.**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-view.test.ts`

- [ ] **Step 5: Commit** (with Task 15; canvas and decor still read `define`).

---

### Task 15: Canvas and track follow the current step

**Files:**
- Modify: `apps/tasks/src/views/problem-solver/canvas.ts`, `apps/tasks/src/views/problem-solver/decor.ts`

- [ ] **Step 1: Tests**

The view test now covers: a frame session shows the frame card; a session in `define` with an active run shows the chart and a Record toggle; a session in `analyse` with no analyse runs opens on the record with define `done`. Run it to see the canvas failures:

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-view.test.ts`
Expected: FAIL in the canvas tests (`session.define` undefined).

- [ ] **Step 2: Implement `canvas.ts`**

1. Replace `shownRun` with:

```ts
/** The run the chart shows: the current step's active run, else its last run, else the last run anywhere. */
function shownRun(session: PsSession): PsToolRun | null {
  const runs = session.steps?.[session.phase]?.runs ?? [];
  return runs.find((run) => run.status === 'active') ?? runs.at(-1) ?? allRunsOf(session).at(-1) ?? null;
}

function allRunsOf(session: PsSession): PsToolRun[] {
  return Object.values(session.steps ?? {}).flatMap((step) => step.runs);
}

/** A step with no runs yet (just entered) shows the record; otherwise the chart. */
function defaultMode(session: PsSession): 'chart' | 'record' {
  if (session.phase === 'finished') return 'record';
  return (session.steps?.[session.phase]?.runs.length ?? 0) > 0 ? 'chart' : 'record';
}
```

2. In `showRecord`, show the Back to chart toggle whenever the current step has runs:

```ts
    if ((session.steps?.[session.phase]?.runs.length ?? 0) > 0) heading.append(toggle('Back to chart', () => openChart(null)));
```

3. In `showChart`, find a pinned run across every step: `const run = (pinned && allRunsOf(session).find((item) => item.id === pinned!.runId)) || shownRun(session);`

4. In `render`, replace `if (!session.define.runs.length)` with `if (!allRunsOf(session).length && !(session.model && session.steps?.[session.phase]))`. When a step is open but the whole session has no runs yet, `showChart` returns null, so fall back: change the last line of `render` to `return showChart(session) ?? (showRecord(session), null);`.

5. In `closeChart`, the fallback anchor run becomes `defineRun(last)` → `shownRun(last)`.

6. Replace the body of `update` with:

```ts
    update(session) {
      last = session;
      if (mode === null || session.phase !== phase) {
        mode = defaultMode(session);
        pinned = null;
      } else if (mode === 'record' && (session.steps?.[session.phase]?.runs.some((run) => run.status === 'active') ?? false) && !pinned) {
        mode = 'chart';
      }
      phase = session.phase;
      render();
    }
```

Change `let phase: PsSession['phase'] | null = null;` to `let phase: string | null = null;`.

- [ ] **Step 3: Implement the track in `decor.ts`**

Replace the `update(session)` body of `createTrack` with:

```ts
    update(session) {
      const modelId = session.model?.id ?? 'seven_step';
      const plan = stepPlan(modelId);
      const names = ['Frame', ...plan.map((s: { step: string }) => stepName(modelId, s.step))];
      const index = plan.findIndex((s: { step: string }) => s.step === session.phase);
      const now = session.phase === 'frame' ? 0 : index >= 0 ? index + 1 : -1;
      const stateOf = (i: number): 'now' | 'done' | 'skipped' | 'future' => {
        if (i === now) return 'now';
        if (i === 0) return session.phase === 'frame' ? 'now' : 'done';
        const st = session.steps?.[plan[i - 1].step]?.status;
        if (session.phase === 'finished' || (now > 0 && i < now)) return st === 'skipped' ? 'skipped' : 'done';
        return 'future';
      };
      const toolOf = (i: number) => {
        const runs = session.steps?.[plan[i - 1]?.step]?.runs ?? [];
        return runs.find((run) => run.status === 'active')?.tool ?? runs.filter((run) => run.status !== 'switched').at(-1)?.tool ?? null;
      };
      const states = names.map((_, i) => stateOf(i));
      const tools = names.map((_, i) => (i === 0 ? null : toolOf(i)));
      const next = `${modelId}|${session.phase}|${states.join(',')}|${tools.join(',')}`;
      if (next === key) return;
      key = next;
      const reach = now >= 0 ? now : names.length - 1;
      list.style.setProperty('--ps-track-p', String(Math.max(0, reach) / Math.max(1, names.length - 1)));
      list.replaceChildren(
        ...names.map((name, i) => {
          const state = states[i];
          const item = el('li', 'ps-track__stn');
          item.dataset.state = state;
          if (state === 'now') item.setAttribute('aria-current', 'step');
          const colour = state === 'future' || state === 'skipped' ? 'var(--ps-ghost)' : COLOURS[(i + 2) % 3];
          const tool = tools[i];
          const markup = i === 0 ? FRAME_MARK : tool && state !== 'future' ? EMBLEM_SVG[tool] ?? '' : STATION_MARKS[(i - 1) % STATION_MARKS.length];
          const mark = el('span', 'ps-track__mark');
          const drawing = svg('0 0 100 100', markup);
          drawing.style.setProperty('--c', colour);
          mark.append(drawing);
          item.append(mark, el('span', 'ps-track__name', name));
          return item;
        })
      );
    }
```

Add `import { stepName, stepPlan } from '../../../../../packages/problem-solver/steps.mjs';` and remove the now-unused `MODELS` import if nothing else in `decor.ts` uses it. Add to `apps/tasks/src/views/problem-solver/problem-solver-view.css`:

```css
.ps-track__stn[data-state='skipped'] .ps-track__name { text-decoration: line-through; text-decoration-thickness: 1px; opacity: 0.6; }
```

- [ ] **Step 4: Run, expect PASS** (record tests may still fail; Task 16 fixes them).

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-view.test.ts`

- [ ] **Step 5: Commit**

```bash
git add apps/tasks/src/views/problem-solver apps/tasks/tests/unit/problem-solver-view.test.ts
git commit -m "Problem Solver: coach panel, canvas and track follow the current step

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Record shows every step, per-step filmstrips and extras

**Files:**
- Modify: `packages/problem-solver/render/record.ts`, `packages/problem-solver/problem-solver.css`
- Modify tests: `apps/tasks/tests/unit/problem-solver-record-render.test.ts`

- [ ] **Step 1: Rewrite the record test**

```ts
// apps/tasks/tests/unit/problem-solver-record-render.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createRecordView, stepRun, stepState } from '../../../../packages/problem-solver/render/record';
import type { PsSession, PsToolRun } from '../../../../packages/problem-solver/types';

const run = (id: string, tool: PsToolRun['tool'], status: PsToolRun['status'], extra: Partial<PsToolRun> = {}): PsToolRun => ({ id, tool, status, nodes: [], edges: [], ...extra });

function session(over: Partial<PsSession> = {}): PsSession {
  return {
    id: 's', title: 'T', revision: 1, kind: 'full', status: 'active', phase: 'devise', frame: {}, model: { id: 'seven_step', reason: '' }, links: [],
    steps: {
      define: { runs: [run('r1', 'five_whys', 'switched', { switchReason: 'Causes branch' }), run('r2', 'problem_tree', 'done'), run('r3', 'smart', 'done')], status: 'done', objection: null },
      analyse: { runs: [], status: 'skipped', objection: 'No causes mapped.' },
      devise: { runs: [run('r4', 'contradiction', 'active')], status: 'open', objection: null }
    },
    learnings: [], pendingLearning: null, turns: [], summary: '', suggestion: null, pendingKeep: null,
    runner: { status: 'idle', mode: 'turn', error: null }, createdAt: 'c', updatedAt: 'u', ...over
  } as PsSession;
}

const state = (view: ReturnType<typeof createRecordView>, step: string) => view.el.querySelector(`[data-step="${step}"]`)!.getAttribute('data-state');

describe('process record', () => {
  it('marks steps done, skipped, current and future', () => {
    const s = session();
    expect(stepState(s, 'define')).toBe('done');
    expect(stepState(s, 'analyse')).toBe('skipped');
    expect(stepState(s, 'devise')).toBe('current');
    expect(stepState(s, 'decide')).toBe('future');
    expect(stepState(session({ phase: 'frame', steps: {} }), 'define')).toBe('future');
    const view = createRecordView();
    view.update(s);
    expect([state(view, 'define'), state(view, 'analyse'), state(view, 'devise'), state(view, 'improve')]).toEqual(['done', 'skipped', 'current', 'future']);
  });

  it('finished sessions show every visited step as done or skipped', () => {
    const s = session({ phase: 'finished', status: 'finished' });
    expect(stepState(s, 'devise')).toBe('done');
    expect(stepState(s, 'analyse')).toBe('skipped');
    expect(stepState(s, 'decide')).toBe('future');
  });

  it('gives each step with runs a filmstrip, switched runs with their reason', () => {
    const view = createRecordView();
    view.update(session());
    const strips = [...view.el.querySelectorAll('.ps-record__strip')].map((el) => el.getAttribute('data-strip'));
    expect(strips).toEqual(['define', 'devise']);
    expect(view.el.querySelector('[data-run="r1"]')!.textContent).toContain('Switched: Causes branch');
  });

  it('opens the last kept run of a step from its box, and any run from its card', () => {
    const open = vi.fn();
    const view = createRecordView();
    view.onOpenStep(open);
    view.update(session());
    expect(stepRun(session(), 'define')!.id).toBe('r3');
    view.el.querySelector<HTMLButtonElement>('[data-step="define"] button')!.click();
    expect(open).toHaveBeenLastCalledWith('r3', view.el.querySelector('[data-step="define"]'));
    view.el.querySelector<HTMLButtonElement>('[data-run="r1"] button')!.click();
    expect(open).toHaveBeenLastCalledWith('r1', view.el.querySelector('[data-run="r1"]'));
    expect(view.el.querySelector('[data-step="analyse"] button')).toBeNull();
    expect(view.anchor('r3', 'step')).toBe(view.el.querySelector('[data-step="define"]'));
    expect(view.anchor('r4', 'step')).toBe(view.el.querySelector('[data-step="devise"]'));
  });

  it('shows extra steps under the diagram for polya and triz', () => {
    const view = createRecordView();
    view.update(session({ model: { id: 'polya', reason: '' }, phase: 'identify', steps: { identify: { runs: [], status: 'open', objection: null } } }));
    expect([...view.el.querySelectorAll('.ps-record__extras [data-step]')].map((el) => el.getAttribute('data-step'))).toEqual(['document']);
    view.update(session({ model: { id: 'triz', reason: '' }, phase: 'specific_problem', steps: { specific_problem: { runs: [], status: 'open', objection: null } } }));
    expect([...view.el.querySelectorAll('.ps-record__extras [data-step]')].map((el) => el.getAttribute('data-step'))).toEqual(['implement', 'improve', 'document']);
  });

  it('shows a skipped step\'s objection as its tooltip', () => {
    const view = createRecordView();
    view.update(session());
    expect(view.el.querySelector('[data-step="analyse"] .ps-record__box')!.getAttribute('title')).toBe('Coach objected: No causes mapped.');
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-record-render.test.ts`

- [ ] **Step 3: Implement in `record.ts`**

1. Imports: add `import { stepName, stepPlan } from '../steps.mjs';`.
2. Replace `StepState`, `stepState` and `defineRun` with:

```ts
export type StepState = 'done' | 'skipped' | 'current' | 'future';

/** A step's state from the session's steps and phase. */
export function stepState(session: PsSession, step: string): StepState {
  const st = session.steps?.[step];
  if (step === session.phase) return 'current';
  if (!st) return 'future';
  if (st.status === 'skipped') return 'skipped';
  if (st.status === 'done' || session.phase === 'finished') return 'done';
  return 'future';
}

/** The run a step's box opens: the last run of that step that was not switched. */
export function stepRun(session: PsSession, step: string): PsToolRun | null {
  const runs = session.steps?.[step]?.runs ?? [];
  return [...runs].reverse().find((run) => run.status !== 'switched') ?? runs.at(-1) ?? null;
}

/** v1 name, kept for callers: the Define step's run. */
export function defineRun(session: PsSession): PsToolRun | null {
  return session.model ? stepRun(session, MODELS[session.model.id].define) : null;
}
```

3. Replace `let stepEl: HTMLElement | null = null;` with `const stepEls = new Map<string, HTMLElement>();` and `const runStep = new Map<string, string>();`.

4. In `paintMap`, replace the loop body's state/button logic so every step can open its run:

```ts
    stepEls.clear();
    for (const box of layout.boxes) {
      const step = model.steps.find((s: { id: string }) => s.id === box.step);
      if (!step) continue;
      stepEls.set(step.id, paintStep(session, step, (item) => place(item, box, layout.h)));
      map.append(stepEls.get(step.id)!);
    }
```

and add this helper inside `createRecordView` (shared by the map and the extras row):

```ts
  function paintStep(session: PsSession, step: { id: string; name: string; detail: string }, position?: (item: HTMLElement) => void): HTMLElement {
    const state = stepState(session, step.id);
    const item = doc.createElement('div');
    item.className = `ps-record__step is-${state}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-step', step.id);
    item.setAttribute('data-state', state);
    position?.(item);
    const words = { done: 'Done', skipped: 'Skipped', current: 'In progress', future: 'Not started' }[state];
    const label = `${step.name}: ${step.detail}. ${words}`;
    const target = stepRun(session, step.id);
    const objection = session.steps?.[step.id]?.objection;
    const box = doc.createElement(target ? 'button' : 'div') as HTMLElement;
    box.className = 'ps-record__box';
    if (target) {
      (box as HTMLButtonElement).type = 'button';
      box.setAttribute('aria-label', `${label}. Show the chart`);
      box.addEventListener('click', () => open(target.id, item));
    } else {
      box.setAttribute('aria-label', label);
    }
    if (objection) box.setAttribute('title', `Coach objected: ${objection}`);
    box.append(span('ps-record__name', step.name), span('ps-record__detail', step.detail));
    item.append(box);
    return item;
  }
```

Remove the old `isDefine` / `target` / `defineRun` code from the loop.

5. Add an extras row after the map:

```ts
  function paintExtras(session: PsSession): HTMLElement | null {
    if (!session.model) return null;
    const extras = stepPlan(session.model.id).filter((s: { extra: boolean }) => s.extra);
    if (!extras.length) return null;
    const row = doc.createElement('div');
    row.className = 'ps-record__extras';
    row.setAttribute('role', 'list');
    row.setAttribute('aria-label', 'Optional steps');
    for (const extra of extras) {
      const el = paintStep(session, { id: extra.step, name: stepName(session.model.id, extra.step), detail: 'Optional' });
      stepEls.set(extra.step, el);
      row.append(el);
    }
    return row;
  }
```

6. Replace `paintFilm` with per-step strips:

```ts
  function paintFilm(session: PsSession): HTMLElement | null {
    cards.clear();
    runStep.clear();
    if (!session.model) return null;
    const wrap = doc.createElement('div');
    wrap.className = 'ps-record__films';
    for (const { step } of stepPlan(session.model.id)) {
      const runs = session.steps?.[step]?.runs ?? [];
      if (!runs.length) continue;
      const strip = doc.createElement('section');
      strip.className = 'ps-record__strip';
      strip.setAttribute('data-strip', step);
      const heading = doc.createElement('h3');
      heading.className = 'ps-record__strip-title';
      heading.textContent = stepName(session.model.id, step);
      const film = doc.createElement('ol');
      film.className = 'ps-record__film';
      film.setAttribute('aria-label', `${heading.textContent} tools`);
      for (const run of runs) {
        runStep.set(run.id, step);
        const item = doc.createElement('li');
        item.className = `ps-record__card is-${run.status}`;
        item.setAttribute('data-run', run.id);
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'ps-record__card-button';
        const name = TOOLS[run.tool]?.name ?? run.tool;
        const note = run.status === 'switched' ? `Switched: ${run.switchReason ?? 'no reason given'}` : run.status === 'active' ? 'In progress' : `${run.nodes.length} ${run.nodes.length === 1 ? 'answer' : 'answers'}`;
        btn.setAttribute('aria-label', `${name}. ${note}. Show the chart`);
        btn.append(toolEmblem(run.tool, doc), span('ps-record__card-name', name), span('ps-record__card-note', note));
        btn.addEventListener('click', () => open(run.id, item));
        item.append(btn);
        film.append(item);
        cards.set(run.id, item);
      }
      strip.append(heading, film);
      wrap.append(strip);
    }
    return wrap.childElementCount ? wrap : null;
  }
```

7. Replace `update` and `anchor`:

```ts
  function update(session: PsSession): void {
    const signature = JSON.stringify([session.model?.id, session.phase, Object.entries(session.steps ?? {}).map(([id, st]) => [id, st.status, st.objection, st.runs.map((run) => [run.id, run.status, run.switchReason, run.nodes.length])])]);
    if (signature === painted) return;
    painted = signature;
    const parts = [paintMap(session), paintExtras(session), paintFilm(session)].filter((part): part is HTMLElement => !!part);
    root.replaceChildren(...parts);
  }
```

```ts
    anchor(runId, via) {
      return (via === 'film' ? cards.get(runId) : null) ?? stepEls.get(runStep.get(runId) ?? '') ?? null;
    }
```

8. CSS in `packages/problem-solver/problem-solver.css`, under the `/* Record` section:

```css
.ps-record__step.is-skipped .ps-record__box { border-style: dashed; opacity: 0.45; }
.ps-record__step.is-skipped .ps-record__name { text-decoration: line-through; text-decoration-thickness: 1px; }
.ps-record__extras { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.ps-record__extras .ps-record__step { position: static; width: auto; height: auto; }
.ps-record__extras .ps-record__box { padding: 8px 14px; }
.ps-record__films { display: grid; gap: 14px; margin-top: 18px; }
.ps-record__strip-title { margin: 0 0 6px; font-size: 12px; letter-spacing: var(--tracking-caps); text-transform: uppercase; opacity: 0.78; }
```

- [ ] **Step 4: Run, expect PASS.**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-record-render.test.ts tests/unit/problem-solver-view.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/problem-solver/render/record.ts packages/problem-solver/problem-solver.css apps/tasks/tests/unit/problem-solver-record-render.test.ts
git commit -m "Problem Solver: record shows every step, skipped steps, extras and per-step filmstrips

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: Preview samples, eval script, browser walk, type check

**Files:**
- Modify: `scripts/problem-solver-preview-samples.mjs`, `scripts/problem-solver-eval.mjs`, `apps/tasks/tests/browser/problem-solver.spec.mjs`

- [ ] **Step 1: Preview samples.** In `scripts/problem-solver-preview-samples.mjs`, replace the `session` helper (line ~110) with:

```js
const session = (model, phase, steps) => ({
  id: `sample-${model}`, title: 'Late deliveries', revision: 1, kind: 'full', status: phase === 'finished' ? 'finished' : 'active', phase,
  frame: {}, model: { id: model, reason: '' }, links: [], steps, learnings: [], pendingLearning: null,
```

(keep the remaining fields as they are), and the three samples with:

```js
const step = (runs, status = 'done', objection = null) => ({ runs, status, objection });
SAMPLES.record = session('seven_step', 'devise', { define: step(chain), analyse: step([], 'skipped', 'No causes mapped.'), devise: step([], 'open') });
SAMPLES.record_polya = session('polya', 'identify', { identify: step([chain[0], { ...chain[1], status: 'active' }], 'open') });
SAMPLES.record_triz = session('triz', 'general_problem', { specific_problem: step(chain.slice(1)), general_problem: step([], 'open') });
```

- [ ] **Step 2: Eval script.** In `scripts/problem-solver-eval.mjs`, replace the one `define` reference with the `steps` equivalent (`s.steps[s.phase]?.runs` for the active step's runs). Run `node scripts/problem-solver-eval.mjs --help` (or with no API key) and confirm it fails only on the missing key, not on a type error.

- [ ] **Step 3: Browser walk.** In `apps/tasks/tests/browser/problem-solver.spec.mjs`, replace the "I've defined it" click and its assertions with:

```js
await page.getByRole('button', { name: 'Move on to Analyse' }).click();
await expect(page.locator('.ps-coach__messages')).toContainText('what did you learn');
await page.getByLabel('Your answer').fill('I reach for blame when I am tired.');
await page.getByRole('button', { name: 'Send' }).click();
await expect(page.locator('[data-step="define"]')).toHaveAttribute('data-state', /done|skipped/);
await expect(page.locator('[data-step="analyse"]')).toHaveAttribute('data-state', 'current');
await page.locator('[data-step="define"] button').click();
await expect(page.locator('.ps-canvas__chart')).toBeVisible();
```

- [ ] **Step 4: Type check and full unit runs.**

```bash
(cd apps/tasks && npx tsc --noEmit -p .)
node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-*.test.js
(cd apps/tasks && npx vitest run tests/unit/problem-solver)
```

Expected: no type errors; all tests pass. Fix any remaining `session.define` reference the compiler finds (search: `git grep -n "\.define\b" -- packages/problem-solver apps/tasks/src netlify/functions/_shared/problem-solver`; the only allowed hits are `MODELS[...].define` and `model.define`).

- [ ] **Step 5: Browser walk and visual check.** Run the walk with the Chromium override config as in Plan 2 Task 10, at desktop and 390px. Then render `record`, `record_polya` and `record_triz` with `node scripts/problem-solver-preview.mjs record <out-dir>` (and the other two) and look at the screenshots: skipped steps dashed and struck, extras row under polya and triz, strips labelled per step. Fix anything cramped or misaligned before committing.

- [ ] **Step 6: Commit**

```bash
git add scripts/problem-solver-preview-samples.mjs scripts/problem-solver-eval.mjs apps/tasks/tests/browser/problem-solver.spec.mjs
git commit -m "Problem Solver: samples, eval and browser walk follow the step engine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Done when

- A v1 session opens (migrated) on its next step with Define done or skipped, and nothing was rewritten in the store until a change was saved.
- A new session frames, opens the model's first step, works Define's chain, moves on with a boundary turn, records the learning, and can move through every plan step to `finished`.
- The record shows each step's state, polya and triz extras, and per-step filmstrips; any step with a run morphs to its chart.
- The coach prompt sends two cached system blocks: fixed knowledge, then the current step's selection guide and tool knowledge.
- Task 10 is either done from the rescan or reported as outstanding.
- All Problem Solver unit tests, the Tasks type check and the browser walk pass.
