# Problem Solver — Plan 1: foundation and first usable slice

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Tasks › Tools › Problem Solver with a working gatekeeper coach, saved multi-day sessions, rules for all seven Define tools, and the animated 5 Whys diagram. The other tools show an accessible outline until Plan 2.

**Architecture:** A shared, dependency-free package `packages/problem-solver/` holds skills, models, tool definitions and the slot state machine as plain `.mjs` (imported by both Netlify functions and the Vite app), plus TypeScript renderers. A server service (`netlify/functions/_shared/problem-solver/`) owns sessions, revisions, the coach call and validation; the model never draws a node the state machine rejects. Coach turns run on a background function with client polling, like the cognitive protocols. Sessions are encrypted in R2 via the existing cognitive store.

**Tech Stack:** Node 22 ESM, `node:test` (root tests), Vitest + happy-dom (Tasks unit tests), Playwright (Tasks browser), Vite, vanilla DOM + SVG + Web Animations API, Anthropic Messages API through `netlify/functions/_shared/anthropic-client.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-16-problem-solver-design.md`. Plan 2 (remaining renderers, record and morph) and Plan 3 (thinking profile, Life Hub context and lookup chips, protocol cards and link-back, link chips, proposed tasks) follow this plan.

**Before UI work read:** `apps/tasks/design-kit/AGENTS.md`, `apps/tasks/design-kit/TASKS.md`, `docs/CURSOR-UI-FAILURES.md`. Use design-kit tokens and the locked thread composer classes (`hub-ai-bar hub-ai-bar--thread`) and chat prose classes (`chat-message`, `chat-message__body`).

**Naming note:** skill ids are the glyph file names (`abstract_thinking`, `searching`, `learning`, `decision_making`, `inference`, `reflective_thinking`, `synthesis`, `analysis`, `logical_reasoning`, `critical_thinking`, `metacognition`, `creative_thinking`). These supersede the short ids in the spec's type sketch.

---

## File map

Create:

| Path | Responsibility |
| --- | --- |
| `packages/problem-solver/skills.mjs` | Twelve thinking skills (book p.13) |
| `packages/problem-solver/models.mjs` | Three process models and their steps |
| `packages/problem-solver/slots.mjs` | Slot name parsing and counting helpers |
| `packages/problem-solver/tools/five-whys.mjs` … `smart.mjs` (7 files) | One tool definition each |
| `packages/problem-solver/tools/index.mjs` | Tool registry |
| `packages/problem-solver/machine.mjs` | Pure slot state machine |
| `packages/problem-solver/types.ts` | Client-side TypeScript types for sessions |
| `packages/problem-solver/glyphs.ts` | Skill glyph elements with unique ids |
| `packages/problem-solver/render/five-whys.ts` | Animated 5 Whys SVG |
| `packages/problem-solver/render/outline.ts` | Accessible outline for any tool run |
| `packages/problem-solver/problem-solver.css` | Package tokens and diagram styles |
| `netlify/functions/_shared/problem-solver/session.mjs` | Pure session transitions |
| `netlify/functions/_shared/problem-solver/coach-schema.mjs` | Coach JSON parsing and validation |
| `netlify/functions/_shared/problem-solver/prompts.mjs` | Rubric and prompt building |
| `netlify/functions/_shared/problem-solver/coach.mjs` | Model call, repair, word fit |
| `netlify/functions/_shared/problem-solver/scripted-coach.mjs` | Deterministic coach for dev and tests |
| `netlify/functions/_shared/problem-solver/store.mjs` | Memory store and R2 store factory |
| `netlify/functions/_shared/problem-solver/service.mjs` | list/get/create/action/run |
| `netlify/functions/problem-solver.mjs` | `/api/problem-solver` |
| `netlify/functions/problem-solver-run.mjs` | `/api/problem-solver/run` (background) |
| `apps/tasks/src/views/problem-solver/api.ts` | Client API and polling |
| `apps/tasks/src/views/problem-solver/view.ts` | List and session page |
| `apps/tasks/src/views/problem-solver/coach-panel.ts` | Transcript, chips, actions |
| `apps/tasks/src/views/problem-solver/canvas.ts` | Picks a renderer per run |
| `apps/tasks/src/views/problem-solver/problem-solver-view.css` | Page layout |
| `scripts/problem-solver-eval.mjs` | Live coach evaluation (manual) |
| Tests listed per task | |

Modify:

| Path | Change |
| --- | --- |
| `netlify/functions/_shared/cognitive-store.mjs` | `prefix` and `indexRow` options on the R2 store and its factory |
| `apps/tasks/src/shell/shell.ts` | `problem-solver` view id and Tools nav item |
| `apps/tasks/src/shell/icons.ts` | Rail icon |
| `apps/tasks/src/app/main.ts` | Route case |
| `apps/tasks/scripts/mock-api.ts` | `/api/problem-solver` with memory store and scripted coach |

---

### Task 1: Skills and models

**Files:**
- Create: `packages/problem-solver/skills.mjs`, `packages/problem-solver/models.mjs`
- Test: `tests/unit/problem-solver-catalogue.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/problem-solver-catalogue.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { SKILLS, SKILL_IDS, isSkillId } from '../../packages/problem-solver/skills.mjs';
import { MODELS, MODEL_IDS, defineStepOf } from '../../packages/problem-solver/models.mjs';

test('twelve skills, each with a glyph file', async () => {
  assert.equal(SKILLS.length, 12);
  const files = (await readdir(new URL('../../packages/problem-solver/glyphs/skills/', import.meta.url)))
    .map((f) => f.replace(/\.svg$/, ''))
    .sort();
  assert.deepEqual([...SKILL_IDS].sort(), files);
  assert.ok(isSkillId('metacognition'));
  assert.ok(!isSkillId('vibes'));
});

test('three models, each with a define step', () => {
  assert.deepEqual(MODEL_IDS, ['seven_step', 'polya', 'triz']);
  assert.equal(MODELS.seven_step.steps.length, 7);
  assert.equal(defineStepOf('seven_step'), 'define');
  assert.equal(defineStepOf('polya'), 'identify');
  assert.equal(defineStepOf('triz'), 'specific_problem');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/unit/problem-solver-catalogue.test.js`
Expected: FAIL, `Cannot find module .../skills.mjs`

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/skills.mjs
/** The twelve problem solving thinking skills (Problem Solver toolkit, p.13). Ids match glyphs/skills/<id>.svg. */
export const SKILLS = Object.freeze([
  { id: 'abstract_thinking', name: 'Abstract thinking', description: 'Comprehending and processing ideas and principles that are symbolic, hypothetical or not physically present.' },
  { id: 'searching', name: 'Searching', description: 'Systematically locating, gathering and processing information.' },
  { id: 'learning', name: 'Learning', description: 'Absorbing and integrating new information to expand knowledge and apply it to different situations.' },
  { id: 'decision_making', name: 'Decision making', description: 'Selecting a course of action from multiple alternatives through the consideration of potential outcomes.' },
  { id: 'inference', name: 'Inference', description: 'Drawing conclusions that extend beyond the explicit information provided, relying on reasoning and existing knowledge.' },
  { id: 'reflective_thinking', name: 'Reflective thinking', description: "Contemplating and evaluating one's own thoughts and experiences, leading to self-awareness and personal growth." },
  { id: 'synthesis', name: 'Synthesis', description: 'Combining ideas, information, perspectives or elements to form an integrated or new understanding.' },
  { id: 'analysis', name: 'Analysis', description: 'Breaking down information or situations into elements to comprehend structures, underlying principles and interrelationships.' },
  { id: 'logical_reasoning', name: 'Logical reasoning', description: 'Systematic thinking that follows rules of logic and uses deductive and inductive reasoning to arrive at valid conclusions.' },
  { id: 'critical_thinking', name: 'Critical thinking', description: 'Analysing information objectively to identify biases and assumptions, evaluate evidence and arguments, and draw logical conclusions.' },
  { id: 'metacognition', name: 'Metacognition', description: "Awareness and understanding of one's own thought processes, including the ability to regulate one's thinking and learning strategies." },
  { id: 'creative_thinking', name: 'Creative thinking', description: 'Generating novel ideas, thinking divergently and approaching problems from new perspectives.' }
]);

export const SKILL_IDS = Object.freeze(SKILLS.map((skill) => skill.id));

/** @param {unknown} id */
export function isSkillId(id) {
  return typeof id === 'string' && SKILL_IDS.includes(id);
}
```

```js
// packages/problem-solver/models.mjs
/** Process models. `define` is the step the Define tools fill. */
export const MODELS = Object.freeze({
  seven_step: {
    id: 'seven_step',
    name: 'The problem solving process',
    when: 'The default: most real problems, especially ones that will need analysis, options and a decision.',
    define: 'define',
    steps: [
      { id: 'define', name: 'Define', detail: 'Problem recognition and definition' },
      { id: 'analyse', name: 'Analyse', detail: 'Problem analysis' },
      { id: 'devise', name: 'Devise', detail: 'Generate alternate solutions' },
      { id: 'decide', name: 'Decide', detail: 'Select solution' },
      { id: 'implement', name: 'Implement', detail: 'Plan and act' },
      { id: 'improve', name: 'Improve', detail: 'Evaluate outcome' },
      { id: 'document', name: 'Document', detail: 'Record key information' }
    ]
  },
  polya: {
    id: 'polya',
    name: "Polya's 4-step problem solving",
    when: 'A bounded problem with a clear test of success, where a plan can be tried, checked and retried.',
    define: 'identify',
    steps: [
      { id: 'identify', name: 'Identify the problem', detail: 'Understand the problem' },
      { id: 'devise', name: 'Devise a solution', detail: 'Devise a plan' },
      { id: 'implement', name: 'Implement the solution', detail: 'Carry out the plan' },
      { id: 'evaluate', name: 'Evaluate the solution', detail: 'Look back; if it fails, return' }
    ]
  },
  triz: {
    id: 'triz',
    name: 'TRIZ systematic problem solving',
    when: 'A contradiction: improving one thing makes another worse.',
    define: 'specific_problem',
    steps: [
      { id: 'specific_problem', name: 'Specific problem', detail: 'The problem as it appears' },
      { id: 'general_problem', name: 'General problem', detail: 'The underlying contradiction' },
      { id: 'general_solution', name: 'General solution', detail: 'Inventive principles' },
      { id: 'specific_solution', name: 'Specific solution', detail: 'Applied to this case' }
    ]
  }
});

export const MODEL_IDS = Object.freeze(['seven_step', 'polya', 'triz']);

/** @param {string} id */
export function defineStepOf(id) {
  const model = MODELS[id];
  if (!model) throw new Error(`Unknown model: ${id}`);
  return model.define;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/unit/problem-solver-catalogue.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/problem-solver/skills.mjs packages/problem-solver/models.mjs tests/unit/problem-solver-catalogue.test.js
git commit -m "Problem Solver: skills and process models"
```

---

### Task 2: Slot helpers and the 5 Whys definition

Slots are `name` or `name:N` (1-based). A tool definition says which slots are open next given the nodes already placed.

**Files:**
- Create: `packages/problem-solver/slots.mjs`, `packages/problem-solver/tools/five-whys.mjs`
- Test: `tests/unit/problem-solver-five-whys.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/problem-solver-five-whys.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSlot } from '../../packages/problem-solver/slots.mjs';
import { fiveWhys, MIN_WHYS, MAX_WHYS } from '../../packages/problem-solver/tools/five-whys.mjs';

const run = (...slots) => ({ id: 'r', tool: 'five_whys', status: 'active', edges: [], nodes: slots.map((slot, i) => ({ id: `n${i}`, slot, text: slot })) });

test('parseSlot', () => {
  assert.deepEqual(parseSlot('why:3'), { name: 'why', index: 3 });
  assert.deepEqual(parseSlot('root'), { name: 'root', index: null });
  assert.equal(parseSlot('Why 3'), null);
});

test('problem first, then whys in order', () => {
  assert.deepEqual(fiveWhys.nextSlots(run()), ['problem']);
  assert.deepEqual(fiveWhys.nextSlots(run('problem')), ['why:1']);
  assert.deepEqual(fiveWhys.nextSlots(run('problem', 'why:1')), ['why:2']);
});

test('root opens after the minimum whys and closes the chain', () => {
  const whys = Array.from({ length: MIN_WHYS }, (_, i) => `why:${i + 1}`);
  assert.deepEqual(fiveWhys.nextSlots(run('problem', ...whys)), [`why:${MIN_WHYS + 1}`, 'root']);
  assert.ok(!fiveWhys.complete(run('problem', ...whys)));
  assert.deepEqual(fiveWhys.nextSlots(run('problem', ...whys, 'root')), []);
  assert.ok(fiveWhys.complete(run('problem', ...whys, 'root')));
});

test('at most eight whys', () => {
  const whys = Array.from({ length: MAX_WHYS }, (_, i) => `why:${i + 1}`);
  assert.deepEqual(fiveWhys.nextSlots(run('problem', ...whys)), ['root']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/unit/problem-solver-five-whys.test.js`
Expected: FAIL, module not found

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/slots.mjs
/** @param {unknown} slot @returns {{ name: string, index: number | null } | null} */
export function parseSlot(slot) {
  const match = /^([a-z_]+)(?::([1-9]\d*))?$/.exec(String(slot ?? ''));
  return match ? { name: match[1], index: match[2] ? Number(match[2]) : null } : null;
}

/** @param {{ nodes: { slot: string }[] }} run @param {string} name */
export function countSlots(run, name) {
  return run.nodes.filter((node) => parseSlot(node.slot)?.name === name).length;
}

/** @param {{ nodes: { slot: string }[] }} run @param {string} name */
export function hasSlot(run, name) {
  return countSlots(run, name) > 0;
}

/** Next indexed slot (`cause:3`) or null when `max` is reached. */
export function nextIndexed(run, name, max) {
  const count = countSlots(run, name);
  return count < max ? `${name}:${count + 1}` : null;
}

/** Drop nulls from a slot list. */
export function open(...slots) {
  return slots.filter(Boolean);
}
```

```js
// packages/problem-solver/tools/five-whys.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

export const MIN_WHYS = 5;
export const MAX_WHYS = 8;

export const fiveWhys = Object.freeze({
  id: 'five_whys',
  name: '5 Whys',
  kind: 'diagnostic',
  when: 'One clear symptom with a likely single chain of cause.',
  steps: [
    { id: 'state', title: 'State the problem', prompt: 'Define the problem clearly in one sentence or statement.' },
    { id: 'ask', title: 'Ask why?', prompt: 'Ask why a minimum of five times. Base each why on the answer before it, until you reach the root cause. Seven or eight may be needed; usually five is enough.' },
    { id: 'specific', title: 'Be specific', prompt: 'The final why should point to a specific process, occurrence, action or activity, not something generic like "not enough time" or "not enough budget".' }
  ],
  slots: { problem: 'The problem statement', why: 'An answer to "why?" about the line above', root: 'The specific root cause' },
  edgeKinds: [],
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    if (hasSlot(run, 'root')) return [];
    return open(nextIndexed(run, 'why', MAX_WHYS), countSlots(run, 'why') >= MIN_WHYS ? 'root' : null);
  },
  complete(run) {
    return hasSlot(run, 'root');
  }
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/unit/problem-solver-five-whys.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/problem-solver/slots.mjs packages/problem-solver/tools/five-whys.mjs tests/unit/problem-solver-five-whys.test.js
git commit -m "Problem Solver: slot helpers and 5 Whys rules"
```

---

### Task 3: The other six tool definitions

**Files:**
- Create: `packages/problem-solver/tools/problem-tree.mjs`, `concept-map.mjs`, `gap-basic.mjs`, `gap-radar.mjs`, `problem-statement.mjs`, `smart.mjs`
- Test: `tests/unit/problem-solver-tools.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/problem-solver-tools.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { problemTree } from '../../packages/problem-solver/tools/problem-tree.mjs';
import { conceptMap } from '../../packages/problem-solver/tools/concept-map.mjs';
import { gapBasic } from '../../packages/problem-solver/tools/gap-basic.mjs';
import { gapRadar } from '../../packages/problem-solver/tools/gap-radar.mjs';
import { problemStatement } from '../../packages/problem-solver/tools/problem-statement.mjs';
import { smart } from '../../packages/problem-solver/tools/smart.mjs';

const run = (tool, slots, extra = {}) => ({ id: 'r', tool, status: 'active', edges: [], nodes: slots.map((slot, i) => ({ id: `n${i}`, slot, text: slot })), ...extra });

test('problem tree: trunk, then causes and effects', () => {
  assert.deepEqual(problemTree.nextSlots(run('problem_tree', [])), ['trunk']);
  assert.deepEqual(problemTree.nextSlots(run('problem_tree', ['trunk'])), ['cause:1', 'effect:1']);
  assert.ok(!problemTree.complete(run('problem_tree', ['trunk', 'cause:1', 'effect:1'])));
  assert.ok(problemTree.complete(run('problem_tree', ['trunk', 'cause:1', 'cause:2', 'effect:1'])));
  const r = run('problem_tree', ['trunk', 'cause:1', 'effect:1']);
  assert.ok(problemTree.canEdge(r, 'n1', 'n2', 'relates'));
  assert.ok(!problemTree.canEdge(r, 'n0', 'n1', 'relates'), 'the trunk is linked implicitly');
});

test('concept map: theme, concepts, typed links', () => {
  assert.deepEqual(conceptMap.nextSlots(run('concept_map', [])), ['theme']);
  const r = run('concept_map', ['theme', 'concept:1', 'concept:2', 'concept:3']);
  assert.deepEqual(conceptMap.nextSlots(r), ['concept:4']);
  assert.ok(!conceptMap.complete(r));
  assert.ok(conceptMap.complete({ ...r, edges: [{ from: 'n0', to: 'n1', kind: 'hierarchical' }, { from: 'n1', to: 'n2', kind: 'association' }] }));
  assert.deepEqual(conceptMap.edgeKinds, ['association', 'hierarchical', 'cross']);
});

test('gap basic: actions only after a must', () => {
  assert.deepEqual(gapBasic.nextSlots(run('gap_basic', [])), ['current', 'objective']);
  assert.deepEqual(gapBasic.nextSlots(run('gap_basic', ['objective'])), ['current']);
  const both = run('gap_basic', ['current', 'objective']);
  assert.deepEqual(gapBasic.nextSlots(both), ['known:1', 'done:1', 'must_know:1', 'must_do:1']);
  assert.ok(gapBasic.nextSlots(run('gap_basic', ['current', 'objective', 'must_do:1'])).includes('action:1'));
  assert.ok(gapBasic.complete(run('gap_basic', ['current', 'objective', 'known:1', 'must_do:1', 'action:1'])));
});

test('gap radar: axes then a scored snapshot', () => {
  const r = run('gap_radar', ['current', 'objective', 'axis:1', 'axis:2', 'axis:3'], { radar: { snapshots: [] } });
  assert.deepEqual(gapRadar.nextSlots(r), ['axis:4']);
  assert.ok(!gapRadar.complete(r));
  assert.ok(gapRadar.complete({ ...r, radar: { snapshots: [{ at: 'x', current: [1, 2, 3], objective: [8, 9, 10] }] } }));
  assert.deepEqual(gapRadar.validateScores(r, { current: [1, 2, 3], objective: [8, 9, 10] }), null);
  assert.match(gapRadar.validateScores(r, { current: [1, 2], objective: [8, 9, 10] }), /one score per topic/);
  assert.match(gapRadar.validateScores(r, { current: [0, 2, 3], objective: [8, 9, 10] }), /1 to 10/);
});

test('problem statement: strict order', () => {
  assert.deepEqual(problemStatement.nextSlots(run('problem_statement', [])), ['problem']);
  assert.deepEqual(problemStatement.nextSlots(run('problem_statement', ['problem'])), ['impact']);
  assert.deepEqual(problemStatement.nextSlots(run('problem_statement', ['problem', 'impact', 'benefit'])), ['statement']);
  assert.ok(problemStatement.complete(run('problem_statement', ['problem', 'impact', 'benefit', 'statement'])));
});

test('smart: problem, then the five letters in any order', () => {
  assert.deepEqual(smart.nextSlots(run('smart', [])), ['problem']);
  assert.deepEqual(smart.nextSlots(run('smart', ['problem', 'm'])), ['s', 'a', 'r', 't']);
  assert.ok(smart.complete(run('smart', ['problem', 's', 'm', 'a', 'r', 't'])));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/unit/problem-solver-tools.test.js`
Expected: FAIL, module not found

- [ ] **Step 3: Implement the six definitions**

```js
// packages/problem-solver/tools/problem-tree.mjs
import { countSlots, hasSlot, nextIndexed, open, parseSlot } from '../slots.mjs';

const MAX = 12;

export const problemTree = Object.freeze({
  id: 'problem_tree',
  name: 'Problem tree',
  kind: 'diagnostic',
  when: 'Several causes and effects that need sorting, possibly interacting.',
  steps: [
    { id: 'state', title: 'State the problem', prompt: 'Clearly state the problem in general terms. This becomes the base or trunk of the tree.' },
    { id: 'causes_effects', title: 'Establish causes and effects', prompt: 'Identify causes of the problem; these become the roots. Then list their effects or impacts above the problem; these become the branches. Who, what, where, when, why, how.' },
    { id: 'relationships', title: 'Find relationships', prompt: 'Link causes and effects to show linkages or commonalities, focused on how they relate to the problem.' }
  ],
  slots: { trunk: 'The problem in general terms', cause: 'A cause (root)', effect: 'An effect or impact (branch)' },
  edgeKinds: ['relates'],
  nextSlots(run) {
    if (!hasSlot(run, 'trunk')) return ['trunk'];
    return open(nextIndexed(run, 'cause', MAX), nextIndexed(run, 'effect', MAX));
  },
  canEdge(run, from, to) {
    const kind = (id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;
    return ['cause', 'effect'].includes(kind(from)) && ['cause', 'effect'].includes(kind(to));
  },
  complete(run) {
    return hasSlot(run, 'trunk') && countSlots(run, 'cause') >= 2 && countSlots(run, 'effect') >= 1;
  }
});
```

```js
// packages/problem-solver/tools/concept-map.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

export const conceptMap = Object.freeze({
  id: 'concept_map',
  name: 'Concept mapping',
  kind: 'diagnostic',
  when: 'Many interacting factors; a messy system that needs a holistic view.',
  steps: [
    { id: 'simple', title: 'Keep it simple', prompt: 'Select a central theme or idea. Identify key concepts related to it. Use keywords or short phrases, not sentences.' },
    { id: 'linkages', title: 'Create linkages', prompt: 'Hierarchical links show sequence or cause and effect. Association links connect related concepts. Cross-links connect concepts in different areas of the map.' }
  ],
  slots: { theme: 'The central theme', concept: 'A key concept, a few words' },
  edgeKinds: ['association', 'hierarchical', 'cross'],
  nextSlots(run) {
    if (!hasSlot(run, 'theme')) return ['theme'];
    return open(nextIndexed(run, 'concept', 20));
  },
  complete(run) {
    return hasSlot(run, 'theme') && countSlots(run, 'concept') >= 3 && run.edges.length >= 2;
  }
});
```

```js
// packages/problem-solver/tools/gap-basic.mjs
import { countSlots, hasSlot, nextIndexed, open } from '../slots.mjs';

const MAX = 8;

export const GAP_STEPS = [
  { id: 'current', title: 'Identify the current state', prompt: 'Determine the focus area that needs to be improved. This might be shortfalls in performance, process or expectations.' },
  { id: 'objective', title: 'Define the objective', prompt: 'Outline the desired state by describing a high-level vision of success.' },
  { id: 'shortfalls', title: 'Specify shortfalls', prompt: 'What is currently known and what is currently done that underpins the current state? List these under known and done. Topics might be finances, people or time.' },
  { id: 'goals', title: 'Envisage goals', prompt: 'What would be needed for the objective to be accomplished? For each shortfall, list an achievable goal under must know and must do.' },
  { id: 'gaps', title: 'Determine the gaps', prompt: 'What can be done to bridge the gap between the current state and the objectives? List these under actions.' }
];

export function bothEnds(run) {
  return open(hasSlot(run, 'current') ? null : 'current', hasSlot(run, 'objective') ? null : 'objective');
}

export const gapBasic = Object.freeze({
  id: 'gap_basic',
  name: 'Gap analysis',
  kind: 'diagnostic',
  when: 'A clear present state and a desired state; the work is the distance between them.',
  steps: GAP_STEPS,
  slots: { current: 'The current state', objective: 'The objective', known: 'Currently known', done: 'Currently done', must_know: 'Must know', must_do: 'Must do', action: 'An action that bridges a gap' },
  edgeKinds: [],
  nextSlots(run) {
    const ends = bothEnds(run);
    if (ends.length) return ends;
    const musts = countSlots(run, 'must_know') + countSlots(run, 'must_do');
    return open(
      nextIndexed(run, 'known', MAX),
      nextIndexed(run, 'done', MAX),
      nextIndexed(run, 'must_know', MAX),
      nextIndexed(run, 'must_do', MAX),
      musts > 0 ? nextIndexed(run, 'action', MAX) : null
    );
  },
  complete(run) {
    return bothEnds(run).length === 0 &&
      countSlots(run, 'known') + countSlots(run, 'done') >= 1 &&
      countSlots(run, 'must_know') + countSlots(run, 'must_do') >= 1 &&
      countSlots(run, 'action') >= 1;
  }
});
```

```js
// packages/problem-solver/tools/gap-radar.mjs
import { countSlots, nextIndexed, open, parseSlot } from '../slots.mjs';
import { GAP_STEPS, bothEnds } from './gap-basic.mjs';

/** Axis texts in slot order. */
export function radarAxes(run) {
  return run.nodes
    .filter((node) => parseSlot(node.slot)?.name === 'axis')
    .sort((a, b) => parseSlot(a.slot).index - parseSlot(b.slot).index)
    .map((node) => node.text);
}

export const gapRadar = Object.freeze({
  id: 'gap_radar',
  name: 'Gap analysis (advanced)',
  kind: 'diagnostic',
  when: 'Several dimensions of the gap that can each be scored 1 to 10 and tracked over time.',
  steps: [
    ...GAP_STEPS.slice(0, 3),
    { id: 'score', title: 'Score each topic', prompt: 'For each topic, give the current state and the objective a rating from 1 to 10, with 10 a perfect score. Rescore later to track progress.' }
  ],
  slots: { current: 'The current state', objective: 'The objective', axis: 'A topic to score, a few words' },
  edgeKinds: [],
  nextSlots(run) {
    const ends = bothEnds(run);
    return ends.length ? ends : open(nextIndexed(run, 'axis', 8));
  },
  /** @returns {string | null} an error message, or null when valid */
  validateScores(run, scores) {
    const axes = radarAxes(run);
    if (axes.length < 3) return 'Add at least three topics before scoring.';
    for (const key of ['current', 'objective']) {
      const list = scores?.[key];
      if (!Array.isArray(list) || list.length !== axes.length) return `Give one score per topic for ${key}.`;
      if (!list.every((n) => Number.isInteger(n) && n >= 1 && n <= 10)) return 'Scores run from 1 to 10.';
    }
    return null;
  },
  complete(run) {
    return countSlots(run, 'axis') >= 3 && (run.radar?.snapshots?.length ?? 0) >= 1;
  }
});
```

```js
// packages/problem-solver/tools/problem-statement.mjs
import { hasSlot } from '../slots.mjs';

const ORDER = ['problem', 'impact', 'benefit', 'statement'];

export const problemStatement = Object.freeze({
  id: 'problem_statement',
  name: 'Problem statement',
  kind: 'statement',
  when: 'After a diagnostic tool: summarise the problem, its impacts and the benefits of solving it.',
  steps: [
    { id: 'problem', title: 'State the problem', prompt: 'Identify the gap or issue that currently exists, with essential context. When and where is it occurring? Does it reflect any trends?' },
    { id: 'impact', title: 'Describe the impact', prompt: 'Describe the cost of doing nothing, or the impacts of leaving it unresolved. Quantify impacts with numeric or measurable data where possible.' },
    { id: 'benefit', title: 'Highlight the benefits', prompt: 'What benefits will solving it have? Who will benefit? Use data points to communicate urgency.' },
    { id: 'statement', title: 'Compose the statement', prompt: 'In a few sentences, combine the problem, impacts and solution benefits.' }
  ],
  slots: { problem: 'The problem', impact: 'Impacts of leaving it', benefit: 'Benefits of solving it', statement: 'The composed statement' },
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

```js
// packages/problem-solver/tools/smart.mjs
import { hasSlot } from '../slots.mjs';

const LETTERS = ['s', 'm', 'a', 'r', 't'];

export const smart = Object.freeze({
  id: 'smart',
  name: 'SMART objectives',
  kind: 'objectives',
  when: 'Last in Define: turn the defined problem into goals that can be acted on.',
  steps: [
    { id: 'define', title: 'Define the problem', prompt: 'Make the problem statement specific and measurable, including the issue scope and impact.' },
    { id: 'goals', title: 'Set SMART goals', prompt: 'Specific: who is involved, what, where. Measurable: concrete indicators of progress and success. Attainable: within resources and timeframe. Relevant: aligned with wider objectives and values. Time-based: deadlines.' }
  ],
  slots: { problem: 'The problem, specific and measurable', s: 'Specific', m: 'Measurable', a: 'Attainable', r: 'Relevant', t: 'Time-based' },
  edgeKinds: [],
  nextSlots(run) {
    if (!hasSlot(run, 'problem')) return ['problem'];
    return LETTERS.filter((letter) => !hasSlot(run, letter));
  },
  complete(run) {
    return hasSlot(run, 'problem') && LETTERS.every((letter) => hasSlot(run, letter));
  }
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/unit/problem-solver-tools.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/problem-solver/tools tests/unit/problem-solver-tools.test.js
git commit -m "Problem Solver: rules for problem tree, concept map, gap analysis, statement and SMART"
```

---

### Task 4: Registry and state machine

**Files:**
- Create: `packages/problem-solver/tools/index.mjs`, `packages/problem-solver/machine.mjs`
- Test: `tests/unit/problem-solver-machine.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/problem-solver-machine.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_IDS } from '../../packages/problem-solver/tools/index.mjs';
import { addEdge, canEdge, canPlace, isComplete, newRun, nextSlots, placeNode, toolDef } from '../../packages/problem-solver/machine.mjs';

const node = (id, slot) => ({ id, slot, text: slot, state: 'accepted', skills: [], turnId: 't' });

test('registry lists all seven tools', () => {
  assert.deepEqual(TOOL_IDS, ['five_whys', 'problem_tree', 'concept_map', 'gap_basic', 'gap_radar', 'problem_statement', 'smart']);
  assert.throws(() => toolDef('nope'), /Unknown tool/);
});

test('newRun shapes', () => {
  assert.deepEqual(newRun('five_whys', 'r1'), { id: 'r1', tool: 'five_whys', status: 'active', nodes: [], edges: [] });
  assert.deepEqual(newRun('gap_radar', 'r2').radar, { snapshots: [] });
});

test('placeNode accepts only open slots and never mutates', () => {
  const run = newRun('five_whys', 'r');
  assert.ok(canPlace(run, 'problem'));
  assert.ok(!canPlace(run, 'why:1'));
  assert.throws(() => placeNode(run, node('a', 'why:1')), (err) => err.code === 'illegal_slot');
  const next = placeNode(run, node('a', 'problem'));
  assert.equal(run.nodes.length, 0);
  assert.deepEqual(nextSlots(next), ['why:1']);
});

test('closed runs accept nothing', () => {
  const run = { ...newRun('five_whys', 'r'), status: 'switched' };
  assert.ok(!canPlace(run, 'problem'));
});

test('edges must be a known kind between existing distinct nodes', () => {
  let run = newRun('concept_map', 'r');
  run = placeNode(run, node('t', 'theme'));
  run = placeNode(run, node('c1', 'concept:1'));
  assert.ok(canEdge(run, 't', 'c1', 'hierarchical'));
  assert.ok(!canEdge(run, 't', 'c1', 'relates'));
  assert.ok(!canEdge(run, 't', 't', 'association'));
  assert.ok(!canEdge(run, 't', 'zz', 'association'));
  run = addEdge(run, { from: 't', to: 'c1', kind: 'hierarchical' });
  assert.ok(!canEdge(run, 't', 'c1', 'hierarchical'), 'no duplicates');
  assert.ok(!isComplete(run));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/unit/problem-solver-machine.test.js`
Expected: FAIL, module not found

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/tools/index.mjs
import { fiveWhys } from './five-whys.mjs';
import { problemTree } from './problem-tree.mjs';
import { conceptMap } from './concept-map.mjs';
import { gapBasic } from './gap-basic.mjs';
import { gapRadar } from './gap-radar.mjs';
import { problemStatement } from './problem-statement.mjs';
import { smart } from './smart.mjs';

export const TOOLS = Object.freeze({
  five_whys: fiveWhys,
  problem_tree: problemTree,
  concept_map: conceptMap,
  gap_basic: gapBasic,
  gap_radar: gapRadar,
  problem_statement: problemStatement,
  smart
});

export const TOOL_IDS = Object.freeze(Object.keys(TOOLS));
```

```js
// packages/problem-solver/machine.mjs
import { TOOLS } from './tools/index.mjs';

/** @param {string} id */
export function toolDef(id) {
  const def = TOOLS[id];
  if (!def) throw new Error(`Unknown tool: ${id}`);
  return def;
}

/** @param {string} tool @param {string} id */
export function newRun(tool, id) {
  toolDef(tool);
  return { id, tool, status: 'active', nodes: [], edges: [], ...(tool === 'gap_radar' ? { radar: { snapshots: [] } } : {}) };
}

export function nextSlots(run) {
  return run.status === 'active' ? toolDef(run.tool).nextSlots(run) : [];
}

export function canPlace(run, slot) {
  return nextSlots(run).includes(slot);
}

function illegal(message) {
  return Object.assign(new Error(message), { code: 'illegal_slot' });
}

/** Returns a new run with the node appended. Throws `illegal_slot` when the slot is not open. */
export function placeNode(run, node) {
  if (!canPlace(run, node.slot)) throw illegal(`Slot ${node.slot} is not open. Open slots: ${nextSlots(run).join(', ') || 'none'}.`);
  return { ...run, nodes: [...run.nodes, node] };
}

export function canEdge(run, from, to, kind) {
  const def = toolDef(run.tool);
  if (!def.edgeKinds.includes(kind) || from === to) return false;
  const ids = new Set(run.nodes.map((node) => node.id));
  if (!ids.has(from) || !ids.has(to)) return false;
  if (run.edges.some((edge) => edge.from === from && edge.to === to && edge.kind === kind)) return false;
  return typeof def.canEdge === 'function' ? def.canEdge(run, from, to, kind) : true;
}

export function addEdge(run, edge) {
  if (!canEdge(run, edge.from, edge.to, edge.kind)) throw illegal(`Link ${edge.from} → ${edge.to} (${edge.kind}) is not allowed.`);
  return { ...run, edges: [...run.edges, edge] };
}

export function isComplete(run) {
  return toolDef(run.tool).complete(run);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/unit/problem-solver-machine.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/problem-solver/tools/index.mjs packages/problem-solver/machine.mjs tests/unit/problem-solver-machine.test.js
git commit -m "Problem Solver: tool registry and slot state machine"
```

---

### Task 5: Coach turn schema

The model must return one JSON object. Parsing extracts the first balanced `{…}` (models sometimes wrap JSON in a code fence); validation is strict on shape but forgiving on unknown skills (dropped).

**Files:**
- Create: `netlify/functions/_shared/problem-solver/coach-schema.mjs`
- Test: `tests/unit/problem-solver-coach-schema.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/problem-solver-coach-schema.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson, validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';

test('extractJson finds the object inside a fence', () => {
  assert.deepEqual(extractJson('```json\n{"a":{"b":"}"}}\n```'), { a: { b: '}' } });
  assert.equal(extractJson('no json'), null);
});

test('valid accept turn', () => {
  const out = validateCoachTurn({
    verdict: 'accept',
    message: 'Good. That is a process, not a person. Why does the rota change so late?',
    node: { slot: 'why:2', text: 'The rota is published on Friday afternoon.' },
    skillsSeen: ['analysis', 'vibes'],
    skillsMissing: []
  });
  assert.equal(out.ok, true);
  assert.deepEqual(out.value.skillsSeen, ['analysis']);
  assert.equal(out.value.node.slot, 'why:2');
});

test('rejects bad verdicts, empty messages and malformed nodes', () => {
  assert.equal(validateCoachTurn({ verdict: 'maybe', message: 'x' }).ok, false);
  assert.equal(validateCoachTurn({ verdict: 'accept', message: '  ' }).ok, false);
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', node: { slot: 'Why 2', text: 'x' } }).ok, false);
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', node: { slot: 'why:2', text: '' } }).ok, false);
});

test('suggestions: known tools only; unknown kinds dropped', () => {
  const ok = validateCoachTurn({ verdict: 'clarify', message: 'Try a tree.', suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'Causes branch.' } });
  assert.equal(ok.value.suggestion.tool, 'problem_tree');
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'x', suggestion: { kind: 'next_tool', tool: 'mindmap', reason: 'r' } }).ok, false);
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'x', suggestion: { kind: 'protocol', protocolId: 'mirror' } }).value.suggestion, null);
});

test('model choice and frame fields', () => {
  const out = validateCoachTurn({ verdict: 'accept', message: 'ok', frame: { goal: 'Ship it', other: 'x' }, model: { id: 'polya', reason: 'Bounded.' } });
  assert.deepEqual(out.value.frame, { goal: 'Ship it' });
  assert.deepEqual(out.value.model, { id: 'polya', reason: 'Bounded.' });
  assert.equal(validateCoachTurn({ verdict: 'accept', message: 'ok', model: { id: 'six_hats', reason: 'x' } }).ok, false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/unit/problem-solver-coach-schema.test.js`
Expected: FAIL, module not found

- [ ] **Step 3: Implement**

```js
// netlify/functions/_shared/problem-solver/coach-schema.mjs
import { isSkillId } from '../../../../packages/problem-solver/skills.mjs';
import { MODEL_IDS } from '../../../../packages/problem-solver/models.mjs';
import { TOOL_IDS } from '../../../../packages/problem-solver/tools/index.mjs';
import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';

const VERDICTS = ['accept', 'challenge', 'clarify'];
const FRAME_KEYS = ['goal', 'whatIsTrue', 'whatCanBeDone'];
const TEXT_MAX = 600;

/** First balanced JSON object in text, or null. */
export function extractJson(text) {
  const source = String(text ?? '');
  for (let start = source.indexOf('{'); start !== -1; start = source.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (ch === '\\') i += 1;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}' && --depth === 0) {
        try { return JSON.parse(source.slice(start, i + 1)); } catch { break; }
      }
    }
  }
  return null;
}

const text = (value, max = TEXT_MAX) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
const skills = (value) => (Array.isArray(value) ? [...new Set(value.filter(isSkillId))] : []);
const fail = (error) => ({ ok: false, error });

function suggestionOf(raw) {
  if (!raw || typeof raw !== 'object') return { value: null };
  const reason = text(raw.reason, 300) ?? '';
  if (raw.kind === 'next_tool' || raw.kind === 'switch_tool') {
    if (!TOOL_IDS.includes(raw.tool)) return { error: `Unknown tool in suggestion: ${raw.tool}` };
    return { value: { kind: raw.kind, tool: raw.tool, reason } };
  }
  if (raw.kind === 'finish_define') return { value: { kind: 'finish_define', reason } };
  return { value: null };
}

/** @returns {{ ok: true, value: object } | { ok: false, error: string }} */
export function validateCoachTurn(raw) {
  if (!raw || typeof raw !== 'object') return fail('Coach reply was not a JSON object.');
  if (!VERDICTS.includes(raw.verdict)) return fail('verdict must be accept, challenge or clarify.');
  const message = text(raw.message, 1200);
  if (!message) return fail('message is required.');

  let node = null;
  if (raw.node != null) {
    const slot = typeof raw.node.slot === 'string' ? raw.node.slot.trim() : '';
    const nodeText = text(raw.node.text);
    if (!parseSlot(slot)) return fail(`node.slot "${slot}" is not a slot name.`);
    if (!nodeText) return fail('node.text is required.');
    node = { slot, text: nodeText };
  }

  const edges = [];
  for (const edge of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!parseSlot(edge?.from) || !parseSlot(edge?.to) || typeof edge?.kind !== 'string') return fail('Each edge needs from, to (slot names) and kind.');
    edges.push({ from: edge.from, to: edge.to, kind: edge.kind });
  }

  let frame = null;
  if (raw.frame && typeof raw.frame === 'object') {
    frame = Object.fromEntries(FRAME_KEYS.flatMap((key) => (text(raw.frame[key]) ? [[key, text(raw.frame[key])]] : [])));
    if (!Object.keys(frame).length) frame = null;
  }

  let model = null;
  if (raw.model != null) {
    if (!MODEL_IDS.includes(raw.model?.id)) return fail(`Unknown model: ${raw.model?.id}`);
    model = { id: raw.model.id, reason: text(raw.model.reason, 300) ?? '' };
  }

  const suggestion = suggestionOf(raw.suggestion);
  if (suggestion.error) return fail(suggestion.error);

  return {
    ok: true,
    value: {
      verdict: raw.verdict,
      message,
      node,
      edges,
      skillsSeen: skills(raw.skillsSeen),
      skillsMissing: skills(raw.skillsMissing),
      frame,
      model,
      suggestion: suggestion.value,
      summary: text(raw.summary, 1200),
      exitObjection: text(raw.exitObjection, 400)
    }
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/unit/problem-solver-coach-schema.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/coach-schema.mjs tests/unit/problem-solver-coach-schema.test.js
git commit -m "Problem Solver: coach turn schema"
```

---

### Task 6: Session transitions

Pure functions over a session object. The service (Task 9) handles storage, revisions and the runner.

Session phases: `frame` (three questions) → `define` (model chosen, tools running) → `defined`. The `status` field mirrors this for list views: `active` until defined, then `defined`; `archived` on request.

**Files:**
- Create: `netlify/functions/_shared/problem-solver/session.mjs`
- Test: `tests/unit/problem-solver-session.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/problem-solver-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptSuggestion, activeRun, applyCoachTurn, createSession, dismissSuggestion,
  finishDefine, keepAnyway, say, summaryRow
} from '../../netlify/functions/_shared/problem-solver/session.mjs';

let counter = 0;
const deps = { now: () => '2026-10-16T10:00:00.000Z', newId: () => `id${(counter += 1)}` };
const coach = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, ...fields });

function definedFrame() {
  let s = createSession({ title: 'Late rota', text: 'The rota keeps changing late.' }, deps);
  s = applyCoachTurn(s, coach({ frame: { goal: 'Rota fixed a week ahead', whatIsTrue: 'Changed 3 of 4 weeks', whatCanBeDone: 'Change publish day' }, model: { id: 'seven_step', reason: 'Default.' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'One symptom.' } }), deps);
  return acceptSuggestion(s, deps);
}

test('create queues the first coach turn', () => {
  const s = createSession({ title: '', text: 'The rota keeps changing late.', links: [{ kind: 'task', id: 't1' }] }, deps);
  assert.equal(s.phase, 'frame');
  assert.equal(s.title, 'The rota keeps changing late.');
  assert.equal(s.runner.status, 'queued');
  assert.equal(s.turns[0].role, 'user');
  assert.deepEqual(s.links, [{ kind: 'task', id: 't1' }]);
});

test('frame completes and the model moves the session to define', () => {
  const s = definedFrame();
  assert.equal(s.phase, 'define');
  assert.equal(s.model.id, 'seven_step');
  assert.equal(activeRun(s).tool, 'five_whys');
  assert.equal(s.suggestion, null);
  assert.equal(s.runner.status, 'queued', 'coach opens the tool');
});

test('accepted node is placed; challenged node waits for keep anyway', () => {
  let s = definedFrame();
  s = applyCoachTurn(s, coach({ node: { slot: 'problem', text: 'Rota changes late.' }, skillsSeen: ['analysis'] }), deps);
  assert.equal(activeRun(s).nodes.length, 1);
  assert.deepEqual(activeRun(s).nodes[0].skills, ['analysis']);
  s = applyCoachTurn(s, coach({ verdict: 'challenge', message: 'That is a person, not a process.', node: { slot: 'why:1', text: 'Sam is disorganised.' } }), deps);
  assert.equal(activeRun(s).nodes.length, 1);
  assert.equal(s.pendingKeep.slot, 'why:1');
  s = keepAnyway(s, deps);
  const kept = activeRun(s).nodes[1];
  assert.equal(kept.state, 'contested');
  assert.equal(kept.objection, 'That is a person, not a process.');
  assert.equal(s.pendingKeep, null);
  assert.equal(s.runner.status, 'idle', 'keeping does not call the coach');
});

test('illegal slot from the coach throws for repair', () => {
  const s = definedFrame();
  assert.throws(() => applyCoachTurn(s, coach({ node: { slot: 'why:3', text: 'x' } }), deps), (err) => err.code === 'illegal_slot');
});

test('switching keeps the abandoned run with its reason', () => {
  let s = definedFrame();
  s = applyCoachTurn(s, coach({ verdict: 'clarify', suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'Causes branch.' } }), deps);
  s = acceptSuggestion(s, deps);
  assert.equal(s.define.runs.length, 2);
  assert.equal(s.define.runs[0].status, 'switched');
  assert.equal(s.define.runs[0].switchReason, 'Causes branch.');
  assert.equal(activeRun(s).tool, 'problem_tree');
});

test('dismissing a suggestion clears it', () => {
  let s = definedFrame();
  s = applyCoachTurn(s, coach({ suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'r' } }), deps);
  assert.equal(dismissSuggestion(s, deps).suggestion, null);
});

test('finish define early queues a closing turn and records the objection', () => {
  let s = finishDefine(definedFrame(), deps);
  assert.equal(s.phase, 'defined');
  assert.equal(s.status, 'defined');
  assert.equal(s.define.finishedEarly, true);
  assert.equal(s.runner.status, 'queued');
  assert.equal(s.runner.mode, 'closing');
  s = applyCoachTurn(s, coach({ message: 'Fair enough. Note the root is still open.', exitObjection: 'Root cause not reached.' }), deps);
  assert.equal(s.define.exitObjection, 'Root cause not reached.');
  assert.equal(activeRun(s), null);
});

test('say appends a user turn and queues; summary rows are small', () => {
  const s = say(definedFrame(), 'Because the roster is drafted on Friday.', deps);
  assert.equal(s.turns.at(-1).role, 'user');
  assert.equal(s.runner.status, 'queued');
  const row = summaryRow(s);
  assert.deepEqual(Object.keys(row).sort(), ['createdAt', 'id', 'links', 'model', 'phase', 'status', 'title', 'tool', 'updatedAt']);
  assert.equal(row.tool, 'five_whys');
  assert.equal(summaryRow(row), row, 'index rows pass through');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/unit/problem-solver-session.test.js`
Expected: FAIL, module not found

- [ ] **Step 3: Implement**

```js
// netlify/functions/_shared/problem-solver/session.mjs
import { addEdge, isComplete as isRunComplete, newRun, placeNode } from '../../../../packages/problem-solver/machine.mjs';

const TITLE_MAX = 120;

function touch(session, deps) {
  return { ...session, updatedAt: deps.now() };
}

function queue(session, mode = 'turn') {
  return { ...session, runner: { status: 'queued', mode, error: null } };
}

function userTurn(text, deps) {
  return { id: deps.newId(), role: 'user', text, createdAt: deps.now() };
}

export function activeRun(session) {
  return session.define.runs.find((run) => run.status === 'active') ?? null;
}

function replaceRun(session, run) {
  return { ...session, define: { ...session.define, runs: session.define.runs.map((item) => (item.id === run.id ? run : item)) } };
}

export function createSession({ title = '', text, links = [] }, deps) {
  const at = deps.now();
  const clean = String(text ?? '').trim();
  if (!clean) throw Object.assign(new Error('Describe the problem to start.'), { status: 400, code: 'validation_error' });
  return {
    id: deps.newId(),
    title: (String(title).trim() || clean).slice(0, TITLE_MAX),
    revision: 0,
    status: 'active',
    phase: 'frame',
    frame: {},
    model: null,
    links: links.filter((link) => ['task', 'project', 'goal'].includes(link?.kind) && typeof link.id === 'string').map(({ kind, id }) => ({ kind, id })),
    define: { runs: [], finishedEarly: false, exitObjection: null },
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
  if (!clean) throw Object.assign(new Error('Write something first.'), { status: 400, code: 'validation_error' });
  return queue(touch({ ...session, turns: [...session.turns, userTurn(clean, deps)] }, deps));
}

function frameComplete(frame) {
  return Boolean(frame.goal && frame.whatIsTrue && frame.whatCanBeDone);
}

function slotToId(run, slot) {
  return run.nodes.find((node) => node.slot === slot)?.id ?? null;
}

/** Apply a validated coach turn. Throws `illegal_slot` so the coach can be asked to repair. */
export function applyCoachTurn(session, turn, deps) {
  let next = { ...session, runner: { status: 'idle', mode: 'turn', error: null } };
  const coachTurn = {
    id: deps.newId(),
    role: 'coach',
    text: turn.message,
    verdict: turn.verdict,
    skillsSeen: turn.skillsSeen,
    skillsMissing: turn.skillsMissing,
    createdAt: deps.now()
  };

  if (session.runner.mode === 'closing') {
    next = { ...next, define: { ...next.define, exitObjection: turn.exitObjection ?? next.define.exitObjection } };
  } else if (next.phase === 'frame') {
    if (turn.verdict === 'accept' && turn.frame) next = { ...next, frame: { ...next.frame, ...turn.frame } };
    if (frameComplete(next.frame) && turn.model) next = { ...next, model: turn.model, phase: 'define' };
  } else if (next.phase === 'define') {
    const run = activeRun(next);
    if (run && turn.node && turn.verdict === 'accept') {
      let placed = placeNode(run, {
        id: deps.newId(),
        slot: turn.node.slot,
        text: turn.node.text,
        state: 'accepted',
        skills: turn.skillsSeen,
        turnId: coachTurn.id
      });
      for (const edge of turn.edges) {
        placed = addEdge(placed, { from: slotToId(placed, edge.from), to: slotToId(placed, edge.to), kind: edge.kind });
      }
      next = { ...replaceRun(next, placed), pendingKeep: null };
    } else if (run && turn.node && turn.verdict === 'challenge') {
      next = { ...next, pendingKeep: { slot: turn.node.slot, text: turn.node.text, objection: turn.message, skills: turn.skillsSeen, runId: run.id } };
    }
  }

  return touch({
    ...next,
    turns: [...next.turns, coachTurn],
    suggestion: turn.suggestion ?? null,
    summary: turn.summary ?? next.summary
  }, deps);
}

export function keepAnyway(session, deps) {
  const keep = session.pendingKeep;
  const run = activeRun(session);
  if (!keep || !run || run.id !== keep.runId) throw Object.assign(new Error('Nothing to keep.'), { status: 409, code: 'action_not_allowed' });
  const placed = placeNode(run, { id: deps.newId(), slot: keep.slot, text: keep.text, state: 'contested', objection: keep.objection, skills: keep.skills, turnId: null });
  return touch({ ...replaceRun(session, placed), pendingKeep: null, turns: [...session.turns, userTurn('Keep it anyway.', deps)] }, deps);
}

export function acceptSuggestion(session, deps) {
  const suggestion = session.suggestion;
  if (!suggestion) throw Object.assign(new Error('No suggestion to accept.'), { status: 409, code: 'action_not_allowed' });
  if (suggestion.kind === 'finish_define') return finishDefine({ ...session, suggestion: null }, deps);
  const current = activeRun(session);
  let next = { ...session, suggestion: null, pendingKeep: null };
  if (current) {
    const closed = suggestion.kind === 'switch_tool'
      ? { ...current, status: 'switched', switchReason: suggestion.reason }
      : { ...current, status: 'done' };
    next = replaceRun(next, closed);
  }
  next = { ...next, phase: 'define', define: { ...next.define, runs: [...next.define.runs, newRun(suggestion.tool, deps.newId())] } };
  return queue(touch(next, deps));
}

export function dismissSuggestion(session, deps) {
  return touch({ ...session, suggestion: null }, deps);
}

export function finishDefine(session, deps) {
  const current = activeRun(session);
  const finishedEarly = !current || current.nodes.length === 0 || !isRunComplete(current);
  let next = { ...session, suggestion: null, pendingKeep: null, phase: 'defined', status: 'defined' };
  if (current) next = replaceRun(next, { ...current, status: 'done' });
  next = { ...next, define: { ...next.define, finishedEarly }, turns: [...next.turns, userTurn("I've defined it.", deps)] };
  return queue(touch(next, deps), 'closing');
}

export function rename(session, title, deps) {
  const clean = String(title ?? '').trim().slice(0, TITLE_MAX);
  if (!clean) throw Object.assign(new Error('Title required.'), { status: 400, code: 'validation_error' });
  return touch({ ...session, title: clean }, deps);
}

export function archive(session, deps) {
  return touch({ ...session, status: 'archived' }, deps);
}

/** Small list row. Index rows (no turns) pass through unchanged. */
export function summaryRow(session) {
  if (!Array.isArray(session.turns)) return session;
  const last = session.define.runs.at(-1);
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    phase: session.phase,
    model: session.model?.id ?? null,
    tool: last?.tool ?? null,
    links: session.links,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/unit/problem-solver-session.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/session.mjs tests/unit/problem-solver-session.test.js
git commit -m "Problem Solver: pure session transitions"
```

---

### Task 7: Rubric and prompt building

The rubric is a stable system prompt sent with `cache_control` so repeat turns are cheap. The per-turn user message carries compact state.

**Files:**
- Create: `netlify/functions/_shared/problem-solver/prompts.mjs`
- Test: `tests/unit/problem-solver-prompts.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/problem-solver-prompts.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC, buildCoachPrompt } from '../../netlify/functions/_shared/problem-solver/prompts.mjs';
import { createSession, applyCoachTurn, acceptSuggestion } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-16T10:00:00.000Z', newId: () => `id${(n += 1)}` };

test('rubric names every skill, tool and the voice rule', () => {
  for (const word of ['Metacognition', 'Critical thinking', '5 Whys', 'Problem tree', 'SMART', '25 and 60 words', 'Keep it anyway']) {
    assert.ok(RUBRIC.includes(word), `rubric mentions ${word}`);
  }
});

test('frame prompt asks for the missing frame questions', () => {
  const s = createSession({ text: 'Students hand in work late.' }, deps);
  const prompt = buildCoachPrompt(s);
  assert.equal(prompt.system, RUBRIC);
  assert.match(prompt.user, /PHASE: frame/);
  assert.match(prompt.user, /Missing frame answers: goal, whatIsTrue, whatCanBeDone/);
  assert.match(prompt.user, /Students hand in work late\./);
});

test('define prompt lists the tool steps and open slots', () => {
  let s = createSession({ text: 'Late work.' }, deps);
  s = applyCoachTurn(s, { verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: 'r' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' }, summary: null, exitObjection: null }, deps);
  s = acceptSuggestion(s, deps);
  const prompt = buildCoachPrompt(s);
  assert.match(prompt.user, /ACTIVE TOOL: 5 Whys/);
  assert.match(prompt.user, /Open slots: problem/);
  assert.match(prompt.user, /Ask why\?/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/unit/problem-solver-prompts.test.js`
Expected: FAIL, module not found

- [ ] **Step 3: Implement**

```js
// netlify/functions/_shared/problem-solver/prompts.mjs
import { SKILLS } from '../../../../packages/problem-solver/skills.mjs';
import { MODELS } from '../../../../packages/problem-solver/models.mjs';
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';
import { nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { activeRun } from './session.mjs';

const skillLines = SKILLS.map((skill) => `- ${skill.id} (${skill.name}): ${skill.description}`).join('\n');
const modelLines = Object.values(MODELS).map((model) => `- ${model.id}: ${model.name}. Use when: ${model.when}`).join('\n');
const toolLines = Object.values(TOOLS).map((tool) => `- ${tool.id} (${tool.name}, ${tool.kind}): ${tool.when}`).join('\n');

export const RUBRIC = `You are the Problem Solver coach. You coach one person through defining a real problem, using the Problem Solver toolkit's process. You are a coach, not an assistant: warm, direct, and never flattering. You do not agree by default.

VOICE
- Every message is between 25 and 60 words, usually two or three sentences.
- Ask at most one question per message, and end with it when you ask one.
- When an answer is good, say so in one short clause and name the skill it shows. No praise beyond that.
- Plain words. No lists, headings or markdown in the message.

THINKING SKILLS (tag answers with these ids in skillsSeen and skillsMissing)
${skillLines}

COGNITIVE AND METACOGNITIVE FRAME (Garofalo and Lester)
- Cognitive stages: orientation (assess and understand the problem), organisation (goals and planning), execution (regulate behaviour to carry out plans), verification (evaluate decisions and outcomes).
- Metacognitive knowledge: person (beliefs, emotions, confidence that affect performance), task (features of the problem: content, context, structure), strategy (awareness of strategies that help understand, organise and execute).
- The most common failure is skipping verification, or carrying on with a plan that has already failed.
- Problem orientation matters (D'Zurilla and Nezu): watch for avoidance and for impulsive, careless jumps to a fix.

PROCESS MODELS
${modelLines}

DEFINE TOOLS
${toolLines}

SESSION SHAPE
1. Frame: get clear answers to the book's three questions: What is the goal (the ideal state, outcome or result needed)? What is true (facts and data versus perceptions, beliefs and opinions)? What can be done (can it be solved, or should it be reframed to a more achievable goal or scale)? Record each accepted answer in "frame" as goal, whatIsTrue, whatCanBeDone. Ask for one at a time.
2. When all three are answered, choose a process model and give a one-sentence reason in "model", and suggest the first Define tool with a "next_tool" suggestion. Choose the tool from the problem's shape: one symptom with one likely chain, five_whys; several causes and effects, problem_tree; many interacting factors, concept_map; a clear present and desired state, gap_basic; several scoreable dimensions, gap_radar.
3. In a tool, work its steps in order. Each answer that holds up becomes a node in the open slot it belongs to. Only use slot names from "Open slots". Never invent slots.
4. After the diagnostic tool, suggest problem_statement (next_tool), then smart (next_tool). The person can say they have defined it at any time; do not block them.

GATEKEEPING
- verdict "accept": the answer holds up. Put it in "node" with the slot and a tidy version of their words (keep their meaning; do not add ideas).
- verdict "challenge": the answer does not hold up. Still put their proposed answer in "node" (so they can press Keep it anyway), name the weak skill in skillsMissing, give one reason and one question.
- verdict "clarify": you need more before judging, or you are making a suggestion. No node.
Challenge when:
- a symptom is offered as a cause (analysis)
- a perception, belief or opinion is stated as fact (critical_thinking; "What is true?")
- the answer is generic, like "not enough time" or "not enough budget" (the book's "Be specific")
- a solution is offered while still defining (impulsive orientation; resist the quick fix)
- a why repeats an earlier answer or blames a person rather than a process (logical_reasoning)
- a goal cannot be measured (for SMART and objectives)
- the answer shows thin metacognition: an unexamined assumption, confidence beyond the evidence, or no check on whether it is true (metacognition)
If they argue back with a good reason, change your verdict and accept. If they press Keep it anyway, that is their call; do not repeat the objection.

SWITCHING AND CHECK-INS
- If the same slot has been challenged twice, or causes start branching or interacting, suggest a better tool with "switch_tool" and a one-sentence reason.
- When a tool's steps are complete, ask one metacognitive check-in tied to a stage, for example "How confident are you that this is the real root, and what would change your mind?"

OUTPUT
Reply with one JSON object and nothing else:
{"verdict":"accept|challenge|clarify","message":"...","node":{"slot":"...","text":"..."}|null,"edges":[{"from":"slot","to":"slot","kind":"..."}],"skillsSeen":["..."],"skillsMissing":["..."],"frame":{"goal":"...","whatIsTrue":"...","whatCanBeDone":"..."}|null,"model":{"id":"...","reason":"..."}|null,"suggestion":{"kind":"next_tool|switch_tool|finish_define","tool":"...","reason":"..."}|null,"summary":"..."|null,"exitObjection":"..."|null}
Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "exitObjection" only in closing mode.`;

const RECENT_TURNS = 12;
const SUMMARY_EVERY = 6;

function transcript(session) {
  return session.turns.slice(-RECENT_TURNS).map((turn) => `${turn.role === 'user' ? 'PERSON' : 'COACH'}: ${turn.text}`).join('\n');
}

function runLines(run) {
  const def = TOOLS[run.tool];
  const nodes = run.nodes.map((node) => `  ${node.slot}${node.state === 'contested' ? ' (contested)' : ''}: ${node.text}`).join('\n') || '  (none yet)';
  const edges = run.edges.length ? `\nLinks:\n${run.edges.map((e) => `  ${run.nodes.find((n) => n.id === e.from)?.slot} -> ${run.nodes.find((n) => n.id === e.to)?.slot} (${e.kind})`).join('\n')}` : '';
  return [
    `ACTIVE TOOL: ${def.name} (${def.id})`,
    `Steps:\n${def.steps.map((step, i) => `  ${i + 1}. ${step.title}: ${step.prompt}`).join('\n')}`,
    `Slot meanings: ${Object.entries(def.slots).map(([k, v]) => `${k} = ${v}`).join('; ')}`,
    `Link kinds: ${def.edgeKinds.join(', ') || 'none'}`,
    `Placed:\n${nodes}${edges}`,
    `Open slots: ${nextSlots(run).join(', ') || 'none (tool complete)'}`
  ].join('\n');
}

/** @returns {{ system: string, user: string }} */
export function buildCoachPrompt(session) {
  const parts = [`PROBLEM: ${session.title}`];
  if (session.runner?.mode === 'closing') {
    parts.push('MODE: closing. The person has said they have defined the problem. Give a brief recap in the message. If you think Define is not finished, say so once, kindly, and put a one-sentence reason in exitObjection. Do not ask a question.');
  }
  parts.push(`PHASE: ${session.phase}`);
  const missing = ['goal', 'whatIsTrue', 'whatCanBeDone'].filter((key) => !session.frame[key]);
  parts.push(`Frame: ${JSON.stringify(session.frame)}${missing.length ? `\nMissing frame answers: ${missing.join(', ')}` : ''}`);
  if (session.model) parts.push(`MODEL: ${session.model.id} (${session.model.reason})`);
  for (const run of session.define.runs.filter((item) => item.status !== 'active')) {
    parts.push(`Earlier tool ${run.tool}: ${run.status}${run.switchReason ? ` (${run.switchReason})` : ''}; ${run.nodes.map((node) => `${node.slot}: ${node.text}`).join(' | ')}`);
  }
  const run = activeRun(session);
  if (run) parts.push(runLines(run));
  if (session.pendingKeep) parts.push(`Last challenged answer (${session.pendingKeep.slot}): ${session.pendingKeep.text}`);
  if (session.summary) parts.push(`Summary so far: ${session.summary}`);
  const coachTurns = session.turns.filter((turn) => turn.role === 'coach').length;
  if (coachTurns > 0 && coachTurns % SUMMARY_EVERY === 0) parts.push('A summary is due this turn.');
  parts.push(`RECENT CONVERSATION:\n${transcript(session)}`);
  return { system: RUBRIC, user: parts.join('\n\n') };
}

export function repairPrompt(original, reply, error) {
  return {
    system: original.system,
    user: `${original.user}\n\nYOUR LAST REPLY WAS REJECTED: ${error}\nReply:\n${String(reply).slice(0, 2000)}\n\nSend a corrected JSON object only.`
  };
}

export function rewritePrompt(message) {
  return {
    system: 'You shorten coaching messages. Keep the meaning, the warmth and any final question. Reply with the rewritten message only.',
    user: `Rewrite in at most 60 words:\n${message}`
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/unit/problem-solver-prompts.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/prompts.mjs tests/unit/problem-solver-prompts.test.js
git commit -m "Problem Solver: coach rubric and prompt builder"
```

---

### Task 8: Coach runner (model call, repair, word fit) and the scripted coach

A coach is any function `(session) => Promise<CoachTurn>` where `CoachTurn` is a validated object from Task 5. `createModelCoach` wraps a `model({ system, user, maxTokens }) => Promise<string>`. `scriptedCoach` is deterministic for dev and tests.

**Files:**
- Create: `netlify/functions/_shared/problem-solver/coach.mjs`, `netlify/functions/_shared/problem-solver/scripted-coach.mjs`
- Test: `tests/unit/problem-solver-coach.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/problem-solver-coach.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelCoach, fitWords, wordCount } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { createSession, applyCoachTurn, acceptSuggestion, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-16T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const reply = (fields) => JSON.stringify({ verdict: 'clarify', message: 'What is the goal here, in one sentence, as an ideal state rather than a fix?', ...fields });

function inDefine() {
  const s = createSession({ text: 'Late work.' }, deps);
  return acceptSuggestion(applyCoachTurn(s, { verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: 'r' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' }, summary: null, exitObjection: null }, deps), deps);
}

test('fitWords trims to the last full sentence and keeps a final question', () => {
  const long = `${'This is a sentence that runs on. '.repeat(12)}What will you check first?`;
  const out = fitWords(long, 60);
  assert.ok(wordCount(out) <= 60);
  assert.ok(out.endsWith('What will you check first?'));
});

test('valid reply passes straight through', async () => {
  const calls = [];
  const coach = createModelCoach(async (prompt) => { calls.push(prompt); return reply({}); });
  const turn = await coach(createSession({ text: 'Late work.' }, deps));
  assert.equal(turn.verdict, 'clarify');
  assert.equal(calls.length, 1);
});

test('illegal slot triggers one repair', async () => {
  const replies = [reply({ verdict: 'accept', node: { slot: 'why:9', text: 'x' } }), reply({})];
  const coach = createModelCoach(async () => replies.shift());
  const turn = await coach(inDefine());
  assert.equal(turn.verdict, 'clarify');
  assert.equal(replies.length, 0);
});

test('two bad replies throw coach_lost_thread', async () => {
  const coach = createModelCoach(async () => 'not json');
  await assert.rejects(coach(createSession({ text: 'Late work.' }, deps)), (err) => err.code === 'coach_lost_thread');
});

test('over-long message is rewritten once, then trimmed', async () => {
  const long = `${'Words keep coming here. '.repeat(20)}Why?`;
  const replies = [reply({ message: long }), long];
  const coach = createModelCoach(async () => replies.shift());
  const turn = await coach(createSession({ text: 'Late work.' }, deps));
  assert.ok(wordCount(turn.message) <= 60);
});

test('scripted coach: asks the goal, fills the frame, then gatekeeps 5 Whys', async () => {
  let s = createSession({ text: 'The rota keeps changing late.' }, deps);
  s = applyCoachTurn(s, await scriptedCoach(s), deps);
  assert.deepEqual(s.frame, {}, 'the opening problem is not an answer');
  for (const answer of ['Rota fixed a week ahead every week', 'It changed late three of the last four weeks']) {
    s = say(s, answer, deps);
    s = applyCoachTurn(s, await scriptedCoach(s), deps);
    assert.equal(s.phase, 'frame');
  }
  s = say(s, 'We can change the day it is published', deps);
  s = applyCoachTurn(s, await scriptedCoach(s), deps);
  assert.equal(s.phase, 'define');
  assert.equal(s.model.id, 'seven_step');
  assert.equal(s.suggestion.tool, 'five_whys');
  s = acceptSuggestion(s, deps);
  const opening = await scriptedCoach(s);
  assert.equal(opening.verdict, 'clarify', 'no stale answer is placed when a tool opens');
  assert.equal(opening.node, null);
  s = say(applyCoachTurn(s, opening, deps), 'too short', deps);
  const challenged = await scriptedCoach(s);
  assert.equal(challenged.verdict, 'challenge');
  assert.equal(challenged.node.slot, 'problem');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/unit/problem-solver-coach.test.js`
Expected: FAIL, module not found

- [ ] **Step 3: Implement**

```js
// netlify/functions/_shared/problem-solver/coach.mjs
import { completeMessage } from '../anthropic-client.mjs';
import { canPlace } from '../../../../packages/problem-solver/machine.mjs';
import { extractJson, validateCoachTurn } from './coach-schema.mjs';
import { buildCoachPrompt, repairPrompt, rewritePrompt } from './prompts.mjs';
import { activeRun } from './session.mjs';

const WORD_LIMIT = 60;
const REWRITE_OVER = 70;

export function wordCount(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
}

/** Trim to whole sentences within `limit` words, keeping a final question if there is one. */
export function fitWords(text, limit = WORD_LIMIT) {
  const sentences = String(text ?? '').trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()) ?? [];
  const question = sentences.at(-1)?.endsWith('?') ? sentences.pop() : null;
  const budget = limit - wordCount(question);
  const kept = [];
  for (const sentence of sentences) {
    if (wordCount([...kept, sentence].join(' ')) > budget) break;
    kept.push(sentence);
  }
  const out = [...kept, question].filter(Boolean).join(' ');
  return wordCount(out) <= limit ? out : out.split(/\s+/).slice(0, limit).join(' ');
}

function problemWith(session, value) {
  const run = activeRun(session);
  if (session.phase !== 'define' || !run || !value.node) return null;
  if (!canPlace(run, value.node.slot)) return `Slot ${value.node.slot} is not open for ${run.tool}.`;
  return null;
}

function parse(session, text) {
  const result = validateCoachTurn(extractJson(text));
  if (!result.ok) return result;
  const slotError = problemWith(session, result.value);
  return slotError ? { ok: false, error: slotError } : result;
}

export function createModelCoach(model) {
  return async function modelCoach(session) {
    const prompt = buildCoachPrompt(session);
    const first = await model({ ...prompt, maxTokens: 900 });
    let result = parse(session, first);
    if (!result.ok) result = parse(session, await model({ ...repairPrompt(prompt, first, result.error), maxTokens: 900 }));
    if (!result.ok) throw Object.assign(new Error('Coach lost the thread, try again.'), { code: 'coach_lost_thread', status: 502 });
    let message = result.value.message;
    if (wordCount(message) > REWRITE_OVER) {
      try { message = String(await model({ ...rewritePrompt(message), maxTokens: 300 })).trim() || message; } catch { /* trim below */ }
    }
    return { ...result.value, message: wordCount(message) > WORD_LIMIT ? fitWords(message) : message };
  };
}

/** Production model: one non-streaming call with the rubric cached. */
export function anthropicModel(env, fetchImpl = fetch) {
  return async ({ system, user, maxTokens }) => {
    if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error('The coach needs ANTHROPIC_API_KEY.'), { code: 'provider_unavailable', status: 503 });
    return completeMessage({
      apiKey: env.ANTHROPIC_API_KEY,
      fetchImpl,
      maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }]
    });
  };
}
```

`completeMessage` returns the concatenated text content as a string, and accepts `system` as an array of content blocks, which is how the rubric gets `cache_control`.

```js
// netlify/functions/_shared/problem-solver/scripted-coach.mjs
import { nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';
import { activeRun } from './session.mjs';

/** Deterministic coach for local dev and tests. Short answers (under six words) are challenged. */
const FRAME = [
  ['goal', 'What is the goal, as an ideal state rather than a fix? Say what good looks like.'],
  ['whatIsTrue', 'Good, that is a clear aim. Now, what is actually true here? Separate the facts and data from what you believe or feel.'],
  ['whatCanBeDone', 'That is evidence, not opinion. What can be done: can this be solved as it stands, or should we reframe it to something more achievable?']
];

const base = { node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null };

export async function scriptedCoach(session) {
  const latest = session.turns.at(-1);
  const last = latest?.role === 'user' ? latest.text : '';
  if (session.runner?.mode === 'closing') {
    return { ...base, verdict: 'clarify', message: 'Fair enough, that is your call. You have a clear problem on the page; keep the open questions in mind when you come back to analyse it.' };
  }
  if (session.phase === 'frame') {
    if (session.turns.length === 1) return { ...base, verdict: 'clarify', message: FRAME[0][1] };
    const missing = FRAME.filter(([key]) => !session.frame[key]);
    const [key] = missing[0];
    const frame = { [key]: last };
    if (missing.length === 1) {
      return { ...base, verdict: 'accept', frame, message: 'Clear enough to work with. I suggest the problem solving process, starting with 5 Whys, because there is one symptom here with a likely single chain of cause.', model: { id: 'seven_step', reason: 'A real problem that will need analysis and a decision.' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'One symptom, likely one chain.' }, skillsSeen: ['analysis'] };
    }
    return { ...base, verdict: 'accept', frame, message: missing[1][1], skillsSeen: ['critical_thinking'] };
  }
  const run = activeRun(session);
  if (!run) return { ...base, verdict: 'clarify', message: 'Pick a tool to start defining this problem, and we will work through it one step at a time together.' };
  if (!last) {
    const first = TOOLS[run.tool].steps[0];
    return { ...base, verdict: 'clarify', message: `Let's start the ${TOOLS[run.tool].name}. ${first.title}: ${first.prompt}` };
  }
  const slot = nextSlots(run).find((s) => s !== 'root') ?? 'root';
  if (last.split(/\s+/).filter(Boolean).length < 6) {
    return { ...base, verdict: 'challenge', node: { slot, text: last }, skillsMissing: ['analysis'], message: 'That is too thin to stand on yet. It reads like a symptom rather than a cause. Can you say what specifically happens, and when?' };
  }
  return { ...base, verdict: 'accept', node: { slot, text: last }, skillsSeen: ['analysis'], message: 'That holds up: it names a process, not a person. Now, why does that happen? Base your answer on what you just said.' };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/unit/problem-solver-coach.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/coach.mjs netlify/functions/_shared/problem-solver/scripted-coach.mjs tests/unit/problem-solver-coach.test.js
git commit -m "Problem Solver: model coach with repair and word fit; scripted coach"
```

---

### Task 9: Store and service

Generalise the R2 cognitive store with `prefix` and `indexRow` options (defaults keep protocol behaviour). Add a dependency-free memory store for dev and tests.

**Files:**
- Modify: `netlify/functions/_shared/cognitive-store.mjs`
- Create: `netlify/functions/_shared/problem-solver/store.mjs`, `netlify/functions/_shared/problem-solver/service.mjs`
- Test: `tests/unit/problem-solver-service.test.js`

- [ ] **Step 1: Generalise the R2 store**

In `netlify/functions/_shared/cognitive-store.mjs`:

Replace the key helpers with prefix-aware versions:

```js
const PREFIX = 'cognitive-protocols/v1';

function keyFor(owner, id, prefix = PREFIX) {
  return `${prefix}/${encodeURIComponent(owner)}/${id}.json`;
}

function indexKeyFor(owner, id, prefix = PREFIX) {
  return `${prefix}/${encodeURIComponent(owner)}/index/${id}.json`;
}

function indexPrefix(owner, prefix = PREFIX) {
  return `${prefix}/${encodeURIComponent(owner)}/index/`;
}

function metaKey(owner, name, prefix = PREFIX) {
  return `${prefix}/${encodeURIComponent(owner)}/_ops/${name}.json`;
}
```

Change the R2 factory signature and thread `prefix` and `indexRow` through every call inside it:

```js
export function createR2CognitiveStore({ client, bucket, encryptionSecret = '', prefix = PREFIX, indexRow = sessionIndexRow }) {
```

Inside, replace each `keyFor(owner, id)` with `keyFor(owner, id, prefix)`, `indexKeyFor(owner, …)` with `indexKeyFor(owner, …, prefix)`, `indexPrefix(owner)` with `indexPrefix(owner, prefix)`, `metaKey(owner, name)` with `metaKey(owner, name, prefix)`, and in `putIndex` use `encrypt(indexRow(value), encryptionSecret)`.

Change the default factory:

```js
export async function defaultGetCognitiveStore(env, options = {}) {
```

and its last line to:

```js
  return createR2CognitiveStore({ client, bucket: config.bucket, encryptionSecret, ...options });
```

Leave `createMemoryCognitiveStore` unchanged.

Run: `node --test tests/unit/cognitive-service.test.js tests/unit/cognitive-writeback.test.js tests/unit/cognitive-horizon-cadence.test.js`
Expected: PASS (no behaviour change)

- [ ] **Step 2: Write the failing service test**

```js
// tests/unit/problem-solver-service.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

function service(coach = scriptedCoach) {
  let n = 0;
  return createProblemSolverService({ store: createMemoryProblemStore(), coach, now: () => '2026-10-16T10:00:00.000Z', newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` });
}

test('create, run, act with revisions', async () => {
  const svc = service();
  let s = await svc.create('op', { text: 'The rota keeps changing late.', requestId: 'r1' });
  assert.equal(s.runner.status, 'queued');
  s = await svc.run('op', s.id);
  assert.equal(s.runner.status, 'idle');
  assert.equal(s.turns.at(-1).role, 'coach');
  const rev = s.revision;
  s = await svc.action('op', { id: s.id, revision: rev, requestId: 'r2', action: 'say', text: 'It changed three of four weeks' });
  assert.equal(s.revision, rev + 1);
  await assert.rejects(svc.action('op', { id: s.id, revision: rev, requestId: 'r3', action: 'say', text: 'x' }), (err) => err.status === 409);
});

test('replayed requestId does not apply twice', async () => {
  const svc = service();
  let s = await svc.run('op', (await svc.create('op', { text: 'Late rota.', requestId: 'a' })).id);
  const body = { id: s.id, revision: s.revision, requestId: 'same', action: 'say', text: 'Some answer here' };
  const once = await svc.action('op', body);
  const twice = await svc.action('op', { ...body, revision: once.revision });
  assert.equal(twice.turns.length, once.turns.length);
});

test('coach failure marks the runner failed and retry requeues', async () => {
  const svc = service(async () => { throw Object.assign(new Error('Coach lost the thread, try again.'), { code: 'coach_lost_thread' }); });
  let s = await svc.create('op', { text: 'Late rota.', requestId: 'a' });
  s = await svc.run('op', s.id);
  assert.equal(s.runner.status, 'failed');
  assert.equal(s.runner.error, 'Coach lost the thread, try again.');
  s = await svc.action('op', { id: s.id, revision: s.revision, requestId: 'b', action: 'retry' });
  assert.equal(s.runner.status, 'queued');
});

test('list returns summary rows newest first', async () => {
  const svc = service();
  await svc.create('op', { text: 'First problem', requestId: 'a' });
  await svc.create('op', { text: 'Second problem', requestId: 'b' });
  const rows = await svc.list('op');
  assert.equal(rows.length, 2);
  assert.ok(!('turns' in rows[0]));
});

test('unknown session is 404', async () => {
  await assert.rejects(service().get('op', '00000000-0000-4000-8000-000000000999'), (err) => err.status === 404);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --test tests/unit/problem-solver-service.test.js`
Expected: FAIL, module not found

- [ ] **Step 4: Implement the store and service**

```js
// netlify/functions/_shared/problem-solver/store.mjs
import { randomUUID } from 'node:crypto';
import { summaryRow } from './session.mjs';

export const PROBLEM_SOLVER_PREFIX = 'problem-solver/v1';

/** In-memory store with the same read/write/list contract as the R2 cognitive store. */
export function createMemoryProblemStore() {
  const rows = new Map();
  const key = (owner, id) => `${owner}/${id}`;
  return {
    async read(owner, id) {
      const row = rows.get(key(owner, id));
      return row ? { value: structuredClone(row.value), etag: row.etag } : null;
    },
    async write(owner, id, value, expectedEtag) {
      const prior = rows.get(key(owner, id));
      if (expectedEtag === null ? Boolean(prior) : prior?.etag !== expectedEtag) return null;
      const next = { value: structuredClone(value), etag: `"${randomUUID()}"` };
      rows.set(key(owner, id), next);
      return { value: structuredClone(next.value), etag: next.etag };
    },
    async list(owner, limit = 200, offset = 0) {
      return [...rows.entries()]
        .filter(([k]) => k.startsWith(`${owner}/`))
        .map(([, row]) => ({ value: summaryRow(row.value) }))
        .sort((a, b) => String(b.value.updatedAt).localeCompare(String(a.value.updatedAt)))
        .slice(offset, offset + limit);
    }
  };
}

/** Encrypted R2 store under problem-solver/v1, or null when R2 or SESSION_SECRET is not configured. */
export async function defaultGetProblemStore(env) {
  const { defaultGetCognitiveStore } = await import('../cognitive-store.mjs');
  return defaultGetCognitiveStore(env, { prefix: PROBLEM_SOLVER_PREFIX, indexRow: summaryRow });
}
```

```js
// netlify/functions/_shared/problem-solver/service.mjs
import { randomUUID } from 'node:crypto';
import {
  acceptSuggestion, applyCoachTurn, archive, createSession, dismissSuggestion,
  finishDefine, keepAnyway, rename, say, summaryRow
} from './session.mjs';

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST_IDS_KEPT = 50;
const MAX_TURNS = 500;
const MAX_BYTES = 1_000_000;

const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });

export function createProblemSolverService({ store, coach, now = () => new Date().toISOString(), newId = randomUUID }) {
  const deps = { now, newId };

  async function load(owner, id) {
    if (!ID_RE.test(String(id ?? ''))) throw httpError(400, 'validation_error', 'Valid session id required.');
    const row = await store.read(owner, id);
    if (!row) throw httpError(404, 'not_found', 'Problem not found.');
    return row;
  }

  async function save(owner, value, etag) {
    if (value.turns.length > MAX_TURNS || Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) throw httpError(413, 'limit', 'This problem has reached its size limit.');
    const written = await store.write(owner, value.id, value, etag);
    if (!written) throw httpError(409, 'conflict', 'This problem changed elsewhere. Reloaded the latest.');
    return written.value;
  }

  const ACTIONS = {
    say: (s, body) => say(s, body.text, deps),
    keep_anyway: (s) => keepAnyway(s, deps),
    accept_suggestion: (s) => acceptSuggestion(s, deps),
    dismiss_suggestion: (s) => dismissSuggestion(s, deps),
    finish_define: (s) => finishDefine(s, deps),
    rename: (s, body) => rename(s, body.text, deps),
    archive: (s) => archive(s, deps),
    retry: (s) => {
      if (s.runner.status !== 'failed') throw httpError(409, 'action_not_allowed', 'Nothing to retry.');
      return { ...s, runner: { ...s.runner, status: 'queued', error: null } };
    }
  };

  return {
    async list(owner, { limit = 100, offset = 0 } = {}) {
      return (await store.list(owner, limit, offset)).map((row) => summaryRow(row.value));
    },

    async get(owner, id) {
      return (await load(owner, id)).value;
    },

    async create(owner, body) {
      const session = createSession({ title: body.title, text: body.text, links: Array.isArray(body.links) ? body.links : [] }, deps);
      session.requestIds = body.requestId ? [String(body.requestId)] : [];
      return save(owner, session, null);
    },

    async action(owner, body) {
      const { value, etag } = await load(owner, body.id);
      if (body.requestId && value.requestIds.includes(String(body.requestId))) return value;
      if (Number(body.revision) !== value.revision) throw httpError(409, 'conflict', 'This problem changed elsewhere. Reloaded the latest.');
      const act = ACTIONS[body.action];
      if (!act) throw httpError(400, 'validation_error', `Unknown action: ${body.action}`);
      if (['queued', 'running'].includes(value.runner.status) && body.action !== 'archive') throw httpError(409, 'busy', 'The coach is still thinking.');
      const next = act(value, body);
      next.revision = value.revision + 1;
      next.requestIds = [...value.requestIds, String(body.requestId ?? '')].filter(Boolean).slice(-REQUEST_IDS_KEPT);
      return save(owner, next, etag);
    },

    async run(owner, id) {
      let { value, etag } = await load(owner, id);
      if (value.runner.status !== 'queued') return value;
      value = await save(owner, { ...value, runner: { ...value.runner, status: 'running' } }, etag);
      ({ value, etag } = await load(owner, id));
      let next;
      try {
        next = applyCoachTurn(value, await coach(value), deps);
      } catch (error) {
        next = { ...value, runner: { ...value.runner, status: 'failed', error: error.message || 'The coach could not answer.' } };
      }
      next.revision = value.revision + 1;
      return save(owner, next, etag);
    }
  };
}
```

`save` returns the stored value; the second `load` in `run` fetches the fresh etag after the `running` write.

- [ ] **Step 5: Run it to verify it passes**

Run: `node --test tests/unit/problem-solver-service.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/cognitive-store.mjs netlify/functions/_shared/problem-solver/store.mjs netlify/functions/_shared/problem-solver/service.mjs tests/unit/problem-solver-service.test.js
git commit -m "Problem Solver: store and session service"
```

---

### Task 10: HTTP functions

**Files:**
- Create: `netlify/functions/problem-solver.mjs`, `netlify/functions/problem-solver-run.mjs`
- Test: `tests/unit/problem-solver-http.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/problem-solver-http.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createProblemSolverHandler } from '../../netlify/functions/problem-solver.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';

const NOW = Date.parse('2026-10-16T10:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function harness({ kick = async () => true } = {}) {
  const store = createMemoryProblemStore();
  const kicks = [];
  const handler = createProblemSolverHandler({
    env: ENV,
    now: () => NOW,
    getStore: async () => store,
    coach: scriptedCoach,
    invokeRun: async (request, id) => { kicks.push(id); return kick(); }
  });
  const call = (method, path, body) => handler(new Request(`https://life.example${path}`, {
    method,
    headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  }));
  return { call, kicks };
}

test('unauthenticated requests are refused', async () => {
  const handler = createProblemSolverHandler({ env: ENV, now: () => NOW, getStore: async () => createMemoryProblemStore() });
  const res = await handler(new Request('https://life.example/api/problem-solver?list=1'));
  assert.equal(res.status, 401);
});

test('create returns 202 and kicks the runner', async () => {
  const { call, kicks } = harness();
  const res = await call('POST', '/api/problem-solver', { create: { text: 'Late rota.', requestId: 'r1' } });
  assert.equal(res.status, 202);
  const { data } = await res.json();
  assert.equal(data.session.runner.status, 'queued');
  assert.deepEqual(kicks, [data.session.id]);
});

test('falls back to an inline run when the kick fails', async () => {
  const { call } = harness({ kick: async () => false });
  const res = await call('POST', '/api/problem-solver', { create: { text: 'Late rota.', requestId: 'r1' } });
  assert.equal(res.status, 200);
  const { data } = await res.json();
  assert.equal(data.session.runner.status, 'idle');
  assert.equal(data.session.turns.at(-1).role, 'coach');
});

test('list and get', async () => {
  const { call } = harness({ kick: async () => false });
  const created = (await (await call('POST', '/api/problem-solver', { create: { text: 'Late rota.', requestId: 'r1' } })).json()).data.session;
  const list = (await (await call('GET', '/api/problem-solver?list=1')).json()).data.sessions;
  assert.equal(list[0].id, created.id);
  const got = await call('GET', `/api/problem-solver?id=${created.id}`);
  assert.equal(got.status, 200);
});

test('stale revision is 409', async () => {
  const { call } = harness({ kick: async () => false });
  const s = (await (await call('POST', '/api/problem-solver', { create: { text: 'Late rota.', requestId: 'r1' } })).json()).data.session;
  const res = await call('POST', '/api/problem-solver', { id: s.id, revision: s.revision - 1, requestId: 'r2', action: 'say', text: 'more words here' });
  assert.equal(res.status, 409);
});

test('no store configured is 503', async () => {
  const handler = createProblemSolverHandler({ env: ENV, now: () => NOW, getStore: async () => null });
  const res = await handler(new Request('https://life.example/api/problem-solver?list=1', { headers: { cookie: `life_hub_session=${SESSION}` } }));
  assert.equal(res.status, 503);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/unit/problem-solver-http.test.js`
Expected: FAIL, module not found

- [ ] **Step 3: Implement**

```js
// netlify/functions/problem-solver.mjs
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetProblemStore } from './_shared/problem-solver/store.mjs';
import { createProblemSolverService } from './_shared/problem-solver/service.mjs';
import { anthropicModel, createModelCoach } from './_shared/problem-solver/coach.mjs';

export const config = { path: '/api/problem-solver' };

export function owner(env) {
  return env.COGNITIVE_OWNER_ID || 'operator';
}

export async function problemSolverServiceFor(env, deps = {}) {
  const store = deps.getStore ? await deps.getStore(env) : await defaultGetProblemStore(env);
  if (!store) throw Object.assign(new Error('Problem Solver storage is not configured.'), { status: 503, code: 'store_unbound' });
  const coach = deps.coach ?? createModelCoach(anthropicModel(env, deps.fetchImpl ?? fetch));
  return createProblemSolverService({ store, coach });
}

export async function defaultInvokeRun(request, id, env, fetchImpl = fetch) {
  const response = await fetchImpl(new URL('/api/problem-solver/run', request.url), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(request.headers.get('cookie') ? { cookie: request.headers.get('cookie') } : {}),
      ...(request.headers.get('origin') ? { origin: request.headers.get('origin') } : {})
    },
    body: JSON.stringify({ id })
  });
  return response.status === 202 || response.ok;
}

const fail = (error, request, env) => withCors(errorResponse(error.status ?? 502, error.code ?? 'problem_solver_failed', error.message ?? 'Problem Solver request failed.', (error.status ?? 502) >= 500), request, env);

export function createProblemSolverHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    try {
      const service = await problemSolverServiceFor(env, deps);
      if (request.method === 'GET') {
        const url = new URL(request.url);
        if (url.searchParams.has('list')) return withCors(okResponse(200, { sessions: await service.list(owner(env)) }), request, env);
        return withCors(okResponse(200, { session: await service.get(owner(env), url.searchParams.get('id')) }), request, env);
      }
      if (request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
      const parsed = await readJsonObject(request);
      if (parsed.error) return withCors(parsed.error, request, env);
      const body = parsed.value ?? {};
      const session = body.create ? await service.create(owner(env), body.create) : await service.action(owner(env), body);
      if (session.runner.status !== 'queued') return withCors(okResponse(200, { session }), request, env);
      let kicked = false;
      try { kicked = await (deps.invokeRun ?? defaultInvokeRun)(request, session.id, env, deps.fetchImpl ?? fetch); } catch { kicked = false; }
      if (kicked) return withCors(okResponse(202, { session }), request, env);
      return withCors(okResponse(200, { session: await service.run(owner(env), session.id) }), request, env);
    } catch (error) {
      return fail(error, request, env);
    }
  }, deps);
}

export default createProblemSolverHandler();
```

```js
// netlify/functions/problem-solver-run.mjs
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createSessionOriginHandler } from './_shared/operator-gate.mjs';
import { owner, problemSolverServiceFor } from './problem-solver.mjs';

export const config = { path: '/api/problem-solver/run', background: true };

export function createProblemSolverRunHandler(deps = {}) {
  return createSessionOriginHandler(async (request, context) => {
    const { env } = context;
    if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
    try {
      const { id } = await request.json().catch(() => ({}));
      const service = await problemSolverServiceFor(env, deps);
      return withCors(okResponse(200, { session: await service.run(owner(env), id) }), request, env);
    } catch (error) {
      return withCors(errorResponse(error.status ?? 502, error.code ?? 'problem_solver_run_failed', error.message, (error.status ?? 502) >= 500), request, env);
    }
  }, deps);
}

export default createProblemSolverRunHandler();
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/unit/problem-solver-http.test.js`
Expected: PASS (6 tests). If `createSessionOriginHandler` passes `deps.now` differently, mirror `tests/unit/calendar-ghosts.test.js`, which uses the same gate.

- [ ] **Step 5: Run the whole root suite**

Run: `npm run test:unit`
Expected: PASS, no regressions

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/problem-solver.mjs netlify/functions/problem-solver-run.mjs tests/unit/problem-solver-http.test.js
git commit -m "Problem Solver: /api/problem-solver and background runner"
```

---

### Task 11: Client types, API and the mock route

**Files:**
- Create: `packages/problem-solver/types.ts`, `apps/tasks/src/views/problem-solver/api.ts`
- Modify: `apps/tasks/scripts/mock-api.ts`
- Test: `apps/tasks/tests/unit/problem-solver-api.test.ts`

- [ ] **Step 1: Types**

```ts
// packages/problem-solver/types.ts
export type PsModelId = 'seven_step' | 'polya' | 'triz';
export type PsToolId = 'five_whys' | 'problem_tree' | 'concept_map' | 'gap_basic' | 'gap_radar' | 'problem_statement' | 'smart';

export type PsNode = { id: string; slot: string; text: string; state: 'accepted' | 'contested'; objection?: string; skills: string[]; turnId: string | null };
export type PsEdge = { from: string; to: string; kind: string };
export type PsToolRun = { id: string; tool: PsToolId; status: 'active' | 'done' | 'switched'; switchReason?: string; nodes: PsNode[]; edges: PsEdge[]; radar?: { snapshots: { at: string; current: number[]; objective: number[] }[] } };
export type PsTurn = { id: string; role: 'user' | 'coach'; text: string; verdict?: 'accept' | 'challenge' | 'clarify'; skillsSeen?: string[]; skillsMissing?: string[]; createdAt: string };
export type PsSuggestion = { kind: 'next_tool' | 'switch_tool'; tool: PsToolId; reason: string } | { kind: 'finish_define'; reason: string };

export type PsSession = {
  id: string;
  title: string;
  revision: number;
  status: 'active' | 'defined' | 'archived';
  phase: 'frame' | 'define' | 'defined';
  frame: { goal?: string; whatIsTrue?: string; whatCanBeDone?: string };
  model: { id: PsModelId; reason: string } | null;
  links: { kind: 'task' | 'project' | 'goal'; id: string }[];
  define: { runs: PsToolRun[]; finishedEarly: boolean; exitObjection: string | null };
  turns: PsTurn[];
  summary: string;
  suggestion: PsSuggestion | null;
  pendingKeep: { slot: string; text: string; objection: string } | null;
  runner: { status: 'idle' | 'queued' | 'running' | 'failed'; mode: 'turn' | 'closing'; error: string | null };
  createdAt: string;
  updatedAt: string;
};

export type PsSummary = Pick<PsSession, 'id' | 'title' | 'status' | 'phase' | 'links' | 'createdAt' | 'updatedAt'> & { model: PsModelId | null; tool: PsToolId | null };

export type PsAction = 'say' | 'keep_anyway' | 'accept_suggestion' | 'dismiss_suggestion' | 'finish_define' | 'rename' | 'archive' | 'retry';
```

- [ ] **Step 2: Write the failing client test**

```ts
// apps/tasks/tests/unit/problem-solver-api.test.ts
import { describe, expect, it, vi } from 'vitest';
import { pollUntilSettled } from '@/views/problem-solver/api';
import type { PsSession } from '../../../../packages/problem-solver/types';

const at = (status: PsSession['runner']['status']) => ({ runner: { status, mode: 'turn', error: null } }) as PsSession;

describe('pollUntilSettled', () => {
  it('polls while queued or running and stops when idle', async () => {
    const states = [at('queued'), at('running'), at('idle')];
    const get = vi.fn(async () => states.shift()!);
    const seen: string[] = [];
    const final = await pollUntilSettled('id', (s) => seen.push(s.runner.status), { get, intervalMs: 1 });
    expect(final.runner.status).toBe('idle');
    expect(seen).toEqual(['queued', 'running', 'idle']);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    const get = vi.fn(async () => { controller.abort(); return at('queued'); });
    await expect(pollUntilSettled('id', () => undefined, { get, intervalMs: 1, signal: controller.signal })).rejects.toThrow('aborted');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-api.test.ts`
Expected: FAIL, cannot resolve `@/views/problem-solver/api`

- [ ] **Step 4: Implement the client**

Check `apps/tasks/src/api/client.ts` exports `apiGet` and `apiPost` with `(path, body?)` signatures returning the envelope's `data` (they do in this checkout; see `client-api.ts`).

```ts
// apps/tasks/src/views/problem-solver/api.ts
import { apiGet, apiPost } from '@/api/client';
import type { PsAction, PsSession, PsSummary } from '../../../../../packages/problem-solver/types';

export const problemSolverApi = {
  list: () => apiGet<{ sessions: PsSummary[] }>('/api/problem-solver?list=1').then((r) => r.sessions),
  get: (id: string) => apiGet<{ session: PsSession }>(`/api/problem-solver?id=${encodeURIComponent(id)}`).then((r) => r.session),
  create: (body: { text: string; title?: string; links?: PsSession['links'] }) =>
    apiPost<{ session: PsSession }>('/api/problem-solver', { create: { ...body, requestId: crypto.randomUUID() } }).then((r) => r.session),
  act: (session: PsSession, action: PsAction, text?: string) =>
    apiPost<{ session: PsSession }>('/api/problem-solver', { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action, ...(text ? { text } : {}) }).then((r) => r.session)
};

export function isBusy(session: PsSession): boolean {
  return session.runner.status === 'queued' || session.runner.status === 'running';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll a session while the coach is thinking. Calls onUpdate with every snapshot, including the settled one. */
export async function pollUntilSettled(
  id: string,
  onUpdate: (session: PsSession) => void,
  { get = problemSolverApi.get, intervalMs = 400, signal }: { get?: (id: string) => Promise<PsSession>; intervalMs?: number; signal?: AbortSignal } = {}
): Promise<PsSession> {
  let delay = intervalMs;
  for (;;) {
    let session: PsSession;
    try {
      session = await get(id);
      delay = intervalMs;
    } catch (err) {
      if (signal?.aborted) throw new Error('aborted');
      delay = Math.min(delay * 2, 5000);
      await sleep(delay);
      continue;
    }
    if (signal?.aborted) throw new Error('aborted');
    onUpdate(session);
    if (!isBusy(session)) return session;
    await sleep(delay);
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-api.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Mock API route**

In `apps/tasks/scripts/mock-api.ts`, add imports beside the existing `personal-lines.mjs` import:

```ts
import { createProblemSolverService } from '../../../netlify/functions/_shared/problem-solver/service.mjs';
import { createMemoryProblemStore } from '../../../netlify/functions/_shared/problem-solver/store.mjs';
import { scriptedCoach } from '../../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
```

Next to `const personalLines = new Map…`, create the service once per mock instance:

```ts
  const problemSolver = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach });
```

In `handle`, after the `/api/personal-lines` block, add (runs inline, so the client sees a settled session in one round trip):

```ts
    if (path === '/api/problem-solver') {
      try {
        if (method === 'GET') {
          if (url.searchParams.has('list')) return json(200, { ok: true, data: { sessions: await problemSolver.list('operator') } });
          return json(200, { ok: true, data: { session: await problemSolver.get('operator', url.searchParams.get('id') ?? '') } });
        }
        if (method === 'POST') {
          const payload = (body ?? {}) as Record<string, unknown>;
          let session = payload.create
            ? await problemSolver.create('operator', payload.create as Record<string, unknown>)
            : await problemSolver.action('operator', payload);
          if (session.runner.status === 'queued') session = await problemSolver.run('operator', session.id);
          return json(200, { ok: true, data: { session } });
        }
      } catch (error) {
        const err = error as { status?: number; code?: string; message?: string };
        return json(err.status ?? 500, { ok: false, error: { code: err.code ?? 'problem_solver_failed', message: err.message ?? 'Failed' } });
      }
    }
```

Run: `cd apps/tasks && npx tsc -p tsconfig.json --noEmit`
Expected: no errors. If TypeScript complains that the `.mjs` modules have no types, add `// @ts-expect-error untyped shared module` above each of the three imports only if `allowJs` inference fails; `allowJs` is on, so inference from JSDoc should succeed.

- [ ] **Step 7: Commit**

```bash
git add packages/problem-solver/types.ts apps/tasks/src/views/problem-solver/api.ts apps/tasks/tests/unit/problem-solver-api.test.ts apps/tasks/scripts/mock-api.ts
git commit -m "Problem Solver: client API, polling and mock route"
```

---

### Task 12: Glyphs and package styles

**Files:**
- Create: `packages/problem-solver/glyphs.ts`, `packages/problem-solver/problem-solver.css`
- Test: `apps/tasks/tests/unit/problem-solver-glyphs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/tasks/tests/unit/problem-solver-glyphs.test.ts
import { describe, expect, it } from 'vitest';
import { skillChip, skillGlyph } from '../../../../packages/problem-solver/glyphs';

describe('skill glyphs', () => {
  it('renders an svg with a unique mask id per copy', () => {
    const a = skillGlyph('critical_thinking');
    const b = skillGlyph('critical_thinking');
    const idA = a.querySelector('mask')!.id;
    const idB = b.querySelector('mask')!.id;
    expect(idA).not.toBe(idB);
    expect(a.querySelector('g')!.getAttribute('mask')).toBe(`url(#${idA})`);
  });

  it('chip carries the skill name and missing state', () => {
    const chip = skillChip('metacognition', { missing: true });
    expect(chip.textContent).toContain('Metacognition');
    expect(chip.classList.contains('ps-skill--missing')).toBe(true);
  });

  it('unknown skill returns an empty span', () => {
    expect(skillGlyph('nope').childElementCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-glyphs.test.ts`
Expected: FAIL, cannot resolve module

- [ ] **Step 3: Implement**

```ts
// packages/problem-solver/glyphs.ts
import { SKILLS } from './skills.mjs';
import abstract_thinking from './glyphs/skills/abstract_thinking.svg?raw';
import analysis from './glyphs/skills/analysis.svg?raw';
import creative_thinking from './glyphs/skills/creative_thinking.svg?raw';
import critical_thinking from './glyphs/skills/critical_thinking.svg?raw';
import decision_making from './glyphs/skills/decision_making.svg?raw';
import inference from './glyphs/skills/inference.svg?raw';
import learning from './glyphs/skills/learning.svg?raw';
import logical_reasoning from './glyphs/skills/logical_reasoning.svg?raw';
import metacognition from './glyphs/skills/metacognition.svg?raw';
import reflective_thinking from './glyphs/skills/reflective_thinking.svg?raw';
import searching from './glyphs/skills/searching.svg?raw';
import synthesis from './glyphs/skills/synthesis.svg?raw';

const SOURCES: Record<string, string> = {
  abstract_thinking, analysis, creative_thinking, critical_thinking, decision_making, inference,
  learning, logical_reasoning, metacognition, reflective_thinking, searching, synthesis
};

let copy = 0;

/** The glyph's SVG with its internal ids suffixed, so two copies on one page never share a mask. */
export function skillGlyph(id: string, doc: Document = document): HTMLSpanElement {
  const span = doc.createElement('span');
  span.className = 'ps-glyph';
  span.setAttribute('aria-hidden', 'true');
  const source = SOURCES[id];
  if (!source) return span;
  copy += 1;
  span.innerHTML = source.replace(/id="(ps-[a-z-]+)"/g, `id="$1-${copy}"`).replace(/url\(#(ps-[a-z-]+)\)/g, `url(#$1-${copy})`);
  span.querySelector('title')?.remove();
  return span;
}

export function skillName(id: string): string {
  return SKILLS.find((skill) => skill.id === id)?.name ?? id;
}

/** Small chip: glyph plus name. Missing skills render outlined. */
export function skillChip(id: string, { missing = false }: { missing?: boolean } = {}, doc: Document = document): HTMLSpanElement {
  const chip = doc.createElement('span');
  chip.className = `ps-skill${missing ? ' ps-skill--missing' : ''}`;
  const label = doc.createElement('span');
  label.textContent = skillName(id);
  chip.append(skillGlyph(id, doc), label);
  chip.title = SKILLS.find((skill) => skill.id === id)?.description ?? '';
  return chip;
}
```

```css
/* packages/problem-solver/problem-solver.css */
/* Book palette, scoped to Problem Solver surfaces. Everything else uses design-kit tokens. */
.ps-scope {
  --ps-red: #d7262e;
  --ps-yellow: #f6be2c;
  --ps-blue: #2c55a4;
  --ps-ink: var(--ink);
  --ps-paper: var(--paper);
  --ps-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}

.ps-glyph {
  display: inline-flex;
  width: 1.25em;
  height: 1.25em;
  flex: none;
}

.ps-glyph svg {
  width: 100%;
  height: 100%;
}

.ps-skill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 2px var(--space-2) 2px var(--space-1);
  border-radius: var(--radius-full);
  background: var(--glass);
  color: var(--ink);
  font-size: var(--text-xs);
  line-height: 1.4;
}

.ps-skill .ps-glyph {
  width: 20px;
  height: 20px;
}

.ps-skill--missing {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--line);
  color: var(--muted);
}

.ps-skill--missing .ps-glyph {
  opacity: 0.55;
}

/* 5 Whys */
.ps-whys {
  width: 100%;
  height: auto;
  overflow: visible;
}

.ps-whys__problem { fill: var(--ps-red); }
.ps-whys__why { fill: var(--ps-yellow); }
.ps-whys__root { fill: var(--ps-blue); }
.ps-whys__label { fill: var(--on-dark); font: var(--weight-semibold) 13px var(--font-ui); }
.ps-whys__label--dark { fill: var(--ink); }

.ps-whys__text {
  margin: 0;
  color: var(--ink);
  font: var(--weight-regular) var(--text-sm) / 1.4 var(--font-ui);
}

.is-contested > .ps-whys__problem,
.is-contested > .ps-whys__why,
.is-contested > .ps-whys__root {
  fill-opacity: 0.35;
  stroke: var(--ink);
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
}

.ps-objection {
  display: inline-flex;
  margin-left: var(--space-1);
  padding: 0 var(--space-1);
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--pastel-peach);
  color: var(--pastel-peach-ink);
  font-size: var(--text-2xs);
  cursor: pointer;
}

/* Outline (accessible alternative and fallback) */
.ps-outline { margin: 0; padding-left: var(--space-5); color: var(--ink); }
.ps-outline li { margin: var(--space-1) 0; }
.ps-outline__slot { color: var(--muted); font-size: var(--text-xs); margin-right: var(--space-2); }
```

Check that `vite/client` types cover `?raw` imports for files outside `apps/tasks/src` (they do: the declaration is global). If Vitest cannot resolve `../../../../packages/...` paths, add the package folder to `server.fs.allow` in `apps/tasks/vite.config.ts` the way `graph-blocks` is reached today (search the config for `graph-blocks` or `fs`).

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-glyphs.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/problem-solver/glyphs.ts packages/problem-solver/problem-solver.css apps/tasks/tests/unit/problem-solver-glyphs.test.ts
git commit -m "Problem Solver: skill glyph chips and package styles"
```

---

### Task 13: 5 Whys renderer and outline

The 5 Whys view is an SVG column: red half-circle (problem, dome up), one yellow downward triangle per accepted why, blue half-circle (root, dome down). Answer text sits to the right of each shape in a `foreignObject` so it wraps. `update(run)` diffs by node id and animates only new nodes. Nothing appears before it is accepted (or kept).

**Files:**
- Create: `packages/problem-solver/render/five-whys.ts`, `packages/problem-solver/render/outline.ts`
- Test: `apps/tasks/tests/unit/problem-solver-five-whys-render.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/tasks/tests/unit/problem-solver-five-whys-render.test.ts
import { describe, expect, it } from 'vitest';
import { createFiveWhysView } from '../../../../packages/problem-solver/render/five-whys';
import { renderOutline } from '../../../../packages/problem-solver/render/outline';
import type { PsNode, PsToolRun } from '../../../../packages/problem-solver/types';

const node = (id: string, slot: string, extra: Partial<PsNode> = {}): PsNode => ({ id, slot, text: `${slot} text`, state: 'accepted', skills: [], turnId: 't', ...extra });
const run = (nodes: PsNode[]): PsToolRun => ({ id: 'r', tool: 'five_whys', status: 'active', nodes, edges: [] });

describe('5 Whys view', () => {
  it('starts empty and adds one shape per node', () => {
    const view = createFiveWhysView();
    view.update(run([]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(0);
    view.update(run([node('p', 'problem'), node('w1', 'why:1')]));
    expect(view.el.querySelectorAll('[data-node]').length).toBe(2);
    expect(view.el.querySelector('[data-node="w1"] .ps-whys__why')).not.toBeNull();
  });

  it('does not rebuild existing nodes', () => {
    const view = createFiveWhysView();
    view.update(run([node('p', 'problem')]));
    const first = view.el.querySelector('[data-node="p"]');
    view.update(run([node('p', 'problem'), node('w1', 'why:1')]));
    expect(view.el.querySelector('[data-node="p"]')).toBe(first);
  });

  it('marks contested nodes and exposes the objection', () => {
    const view = createFiveWhysView();
    view.update(run([node('p', 'problem'), node('w1', 'why:1', { state: 'contested', objection: 'That blames a person.' })]));
    const g = view.el.querySelector('[data-node="w1"]')!;
    expect(g.classList.contains('is-contested')).toBe(true);
    expect(g.querySelector('.ps-objection')!.getAttribute('title')).toBe('That blames a person.');
  });

  it('grows the viewBox with the chain and draws the root last', () => {
    const view = createFiveWhysView();
    const whys = [1, 2, 3, 4, 5].map((i) => node(`w${i}`, `why:${i}`));
    view.update(run([node('p', 'problem'), ...whys, node('r', 'root')]));
    const height = Number(view.el.getAttribute('viewBox')!.split(' ')[3]);
    expect(height).toBe(500); // problem 60 + gap + five whys of 64 + gaps + root 60
    expect(view.el.querySelector('[data-node="r"] .ps-whys__root')).not.toBeNull();
  });
});

describe('outline', () => {
  it('lists nodes in order with slot labels and contested marks', () => {
    const list = renderOutline(run([node('p', 'problem'), node('w1', 'why:1', { state: 'contested', objection: 'x' })]));
    expect(list.querySelectorAll('li').length).toBe(2);
    expect(list.textContent).toContain('Why 1');
    expect(list.textContent).toContain('contested');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-five-whys-render.test.ts`
Expected: FAIL, cannot resolve module

- [ ] **Step 3: Implement**

```ts
// packages/problem-solver/render/outline.ts
import type { PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';

const LABELS: Record<string, string> = {
  problem: 'Problem', why: 'Why', root: 'Root cause', trunk: 'Problem', cause: 'Cause', effect: 'Effect',
  theme: 'Theme', concept: 'Concept', current: 'Current state', objective: 'Objective', known: 'Known', done: 'Done',
  must_know: 'Must know', must_do: 'Must do', action: 'Action', axis: 'Topic', impact: 'Impact', benefit: 'Benefit',
  statement: 'Statement', s: 'Specific', m: 'Measurable', a: 'Attainable', r: 'Relevant', t: 'Time-based'
};

export function slotLabel(slot: string): string {
  const parsed = parseSlot(slot);
  if (!parsed) return slot;
  const name = LABELS[parsed.name] ?? parsed.name;
  return parsed.index ? `${name} ${parsed.index}` : name;
}

/** Ordered list of a run's nodes. Used as the screen-reader alternative and as the fallback view. */
export function renderOutline(run: PsToolRun, doc: Document = document): HTMLOListElement {
  const list = doc.createElement('ol');
  list.className = 'ps-outline';
  for (const node of run.nodes) {
    const item = doc.createElement('li');
    const slot = doc.createElement('span');
    slot.className = 'ps-outline__slot';
    slot.textContent = slotLabel(node.slot);
    item.append(slot, doc.createTextNode(node.text));
    if (node.state === 'contested') item.append(doc.createTextNode(` (contested: ${node.objection ?? ''})`));
    list.append(item);
  }
  return list;
}
```

```ts
// packages/problem-solver/render/five-whys.ts
import type { PsNode, PsToolRun } from '../types';
import { parseSlot } from '../slots.mjs';

const SVG = 'http://www.w3.org/2000/svg';
const W = 380;
const SHAPE_W = 120;
const CAP_H = 60;
const WHY_H = 64;
const GAP = 10;
const TEXT_X = SHAPE_W + 20;

export type FiveWhysView = { el: SVGSVGElement; update(run: PsToolRun): void };

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function order(node: PsNode): number {
  const slot = parseSlot(node.slot);
  if (!slot) return 99;
  if (slot.name === 'problem') return 0;
  if (slot.name === 'why') return slot.index ?? 1;
  return 98;
}

function rowY(index: number): number {
  return index === 0 ? 0 : CAP_H + GAP + (index - 1) * (WHY_H + GAP);
}

function shapeFor(doc: Document, node: PsNode): SVGElement {
  const kind = parseSlot(node.slot)?.name;
  const path = doc.createElementNS(SVG, 'path');
  const cx = SHAPE_W / 2;
  if (kind === 'problem') {
    path.setAttribute('d', `M0 ${CAP_H} A${cx} ${CAP_H} 0 0 1 ${SHAPE_W} ${CAP_H} Z`);
    path.setAttribute('class', 'ps-whys__problem');
  } else if (kind === 'root') {
    path.setAttribute('d', `M0 0 A${cx} ${CAP_H} 0 0 0 ${SHAPE_W} 0 Z`);
    path.setAttribute('class', 'ps-whys__root');
  } else {
    path.setAttribute('d', `M0 0 L${SHAPE_W} 0 L${cx} ${WHY_H} Z`);
    path.setAttribute('class', 'ps-whys__why');
  }
  return path;
}

function labelFor(doc: Document, node: PsNode): SVGTextElement {
  const kind = parseSlot(node.slot)?.name;
  const text = doc.createElementNS(SVG, 'text');
  text.setAttribute('class', `ps-whys__label${kind === 'why' ? ' ps-whys__label--dark' : ''}`);
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('x', String(SHAPE_W / 2));
  text.setAttribute('y', kind === 'problem' ? String(CAP_H - 14) : kind === 'root' ? '24' : '24');
  text.textContent = kind === 'problem' ? 'The problem' : kind === 'root' ? 'The root cause' : 'Why?';
  return text;
}

function textFor(doc: Document, node: PsNode, height: number): SVGForeignObjectElement {
  const fo = doc.createElementNS(SVG, 'foreignObject');
  fo.setAttribute('x', String(TEXT_X));
  fo.setAttribute('y', '0');
  fo.setAttribute('width', String(W - TEXT_X));
  fo.setAttribute('height', String(height));
  const p = doc.createElement('p');
  p.className = 'ps-whys__text';
  p.textContent = node.text;
  if (node.state === 'contested') {
    const badge = doc.createElement('button');
    badge.type = 'button';
    badge.className = 'ps-objection';
    badge.textContent = 'Coach objected';
    badge.title = node.objection ?? '';
    badge.setAttribute('aria-label', `Coach's objection: ${node.objection ?? ''}`);
    p.append(badge);
  }
  fo.append(p);
  return fo;
}

function animateIn(group: SVGGElement, kind: string | undefined): void {
  if (reducedMotion() || typeof group.animate !== 'function') return;
  const keyframes = kind === 'root'
    ? [{ opacity: 0, transform: 'scaleY(0)' }, { opacity: 1, transform: 'scaleY(1)' }]
    : [{ opacity: 0, transform: 'translateY(-18px)' }, { opacity: 1, transform: 'translateY(0)' }];
  group.style.transformBox = 'fill-box';
  group.style.transformOrigin = 'top center';
  group.animate(keyframes, { duration: 460, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' });
}

export function createFiveWhysView(doc: Document = document): FiveWhysView {
  const svg = doc.createElementNS(SVG, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'ps-whys');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '5 Whys');
  svg.setAttribute('viewBox', `0 0 ${W} 1`);
  const drawn = new Map<string, SVGGElement>();

  function update(run: PsToolRun): void {
    const nodes = [...run.nodes].sort((a, b) => order(a) - order(b));
    let rows = 0;
    for (const node of nodes) {
      const kind = parseSlot(node.slot)?.name;
      const index = kind === 'root' ? nodes.filter((n) => parseSlot(n.slot)?.name !== 'root').length : rows;
      const y = rowY(index);
      const height = kind === 'why' ? WHY_H : CAP_H;
      let group = drawn.get(node.id);
      if (!group) {
        group = doc.createElementNS(SVG, 'g') as SVGGElement;
        group.setAttribute('data-node', node.id);
        group.append(shapeFor(doc, node), labelFor(doc, node), textFor(doc, node, height));
        svg.append(group);
        drawn.set(node.id, group);
        animateIn(group, kind);
      }
      group.classList.toggle('is-contested', node.state === 'contested');
      group.setAttribute('transform', `translate(0 ${y})`);
      if (kind !== 'root') rows += 1;
    }
    const last = nodes.at(-1);
    const bottom = last ? rowY(parseSlot(last.slot)?.name === 'root' ? rows : rows - 1) + (parseSlot(last.slot)?.name === 'why' ? WHY_H : CAP_H) : 1;
    svg.setAttribute('viewBox', `0 0 ${W} ${bottom}`);
  }

  return { el: svg, update };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-five-whys-render.test.ts`
Expected: PASS (5 tests). happy-dom has no `animate`; the guard skips it.

- [ ] **Step 5: Commit**

```bash
git add packages/problem-solver/render apps/tasks/tests/unit/problem-solver-five-whys-render.test.ts
git commit -m "Problem Solver: animated 5 Whys view and accessible outline"
```

---

### Task 14: Page, coach panel and canvas host

**Files:**
- Create: `apps/tasks/src/views/problem-solver/view.ts`, `coach-panel.ts`, `canvas.ts`, `problem-solver-view.css`
- Modify: `apps/tasks/src/shell/shell.ts`, `apps/tasks/src/shell/icons.ts`, `apps/tasks/src/app/main.ts`
- Test: `apps/tasks/tests/unit/problem-solver-view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/tasks/tests/unit/problem-solver-view.test.ts
import { describe, expect, it } from 'vitest';
import { renderCoachPanel } from '@/views/problem-solver/coach-panel';
import { mountCanvas } from '@/views/problem-solver/canvas';
import type { PsSession } from '../../../../packages/problem-solver/types';

function session(extra: Partial<PsSession> = {}): PsSession {
  return {
    id: 's1', title: 'Late rota', revision: 3, status: 'active', phase: 'define',
    frame: { goal: 'g', whatIsTrue: 't', whatCanBeDone: 'c' }, model: { id: 'seven_step', reason: 'r' }, links: [],
    define: { runs: [{ id: 'r1', tool: 'five_whys', status: 'active', nodes: [], edges: [] }], finishedEarly: false, exitObjection: null },
    turns: [
      { id: 't1', role: 'user', text: 'Late rota.', createdAt: '' },
      { id: 't2', role: 'coach', text: 'That is a person, not a process. What happens?', verdict: 'challenge', skillsSeen: [], skillsMissing: ['analysis'], createdAt: '' }
    ],
    summary: '', suggestion: null, pendingKeep: { slot: 'why:1', text: 'Sam forgets', objection: 'x' },
    runner: { status: 'idle', mode: 'turn', error: null }, createdAt: '', updatedAt: '', ...extra
  };
}

const noop = { onSay: () => undefined, onAction: () => undefined };

describe('coach panel', () => {
  it('renders turns with missing-skill chips and the keep button', () => {
    const panel = renderCoachPanel(session(), noop);
    expect(panel.querySelectorAll('.chat-message').length).toBe(2);
    expect(panel.querySelector('.ps-skill--missing')).not.toBeNull();
    expect(panel.querySelector('[data-action="keep_anyway"]')).not.toBeNull();
    expect(panel.querySelector('[data-action="finish_define"]')).not.toBeNull();
  });

  it('shows a suggestion card and disables the composer while thinking', () => {
    const panel = renderCoachPanel(session({ pendingKeep: null, suggestion: { kind: 'switch_tool', tool: 'problem_tree', reason: 'Causes branch.' }, runner: { status: 'running', mode: 'turn', error: null } }), noop);
    expect(panel.querySelector('.ps-suggestion')!.textContent).toContain('Problem tree');
    expect(panel.querySelector('[data-action="accept_suggestion"]')).not.toBeNull();
    expect((panel.querySelector('textarea') as HTMLTextAreaElement).disabled).toBe(true);
    expect(panel.textContent).toContain('Coach is thinking');
  });

  it('shows the retry action when the coach failed', () => {
    const panel = renderCoachPanel(session({ runner: { status: 'failed', mode: 'turn', error: 'Coach lost the thread, try again.' } }), noop);
    expect(panel.querySelector('[data-action="retry"]')).not.toBeNull();
  });
});

describe('canvas', () => {
  it('shows the frame card in frame phase and the 5 Whys svg in define', () => {
    const host = document.createElement('div');
    const canvas = mountCanvas(host);
    canvas.update(session({ phase: 'frame', frame: { goal: 'Ship it' }, define: { runs: [], finishedEarly: false, exitObjection: null } }));
    expect(host.querySelector('.ps-frame')!.textContent).toContain('Ship it');
    canvas.update(session());
    expect(host.querySelector('svg.ps-whys')).not.toBeNull();
  });

  it('falls back to the outline for tools without a renderer yet', () => {
    const host = document.createElement('div');
    mountCanvas(host).update(session({ define: { runs: [{ id: 'r2', tool: 'smart', status: 'active', nodes: [{ id: 'n', slot: 'problem', text: 'x', state: 'accepted', skills: [], turnId: 't' }], edges: [] }], finishedEarly: false, exitObjection: null } }));
    expect(host.querySelector('.ps-outline')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-view.test.ts`
Expected: FAIL, cannot resolve modules

- [ ] **Step 3: Implement the coach panel**

```ts
// apps/tasks/src/views/problem-solver/coach-panel.ts
import { el } from '@/views/hub-kit';
import { skillChip } from '../../../../../packages/problem-solver/glyphs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import type { PsAction, PsSession } from '../../../../../packages/problem-solver/types';

export type CoachPanelHandlers = { onSay: (text: string) => void; onAction: (action: PsAction) => void };

function actionButton(label: string, action: PsAction, handlers: CoachPanelHandlers, kind = 'btn--ghost'): HTMLButtonElement {
  const button = el('button', `btn ${kind}`, label) as HTMLButtonElement;
  button.type = 'button';
  button.dataset.action = action;
  button.addEventListener('click', () => handlers.onAction(action));
  return button;
}

function message(turn: PsSession['turns'][number]): HTMLLIElement {
  const item = el('li', `chat-message chat-message--${turn.role === 'user' ? 'user' : 'assistant'}`) as HTMLLIElement;
  const body = el('div', 'chat-message__body', turn.text);
  item.append(body);
  const chips = [...(turn.skillsSeen ?? []).map((id) => skillChip(id)), ...(turn.skillsMissing ?? []).map((id) => skillChip(id, { missing: true }))];
  if (chips.length) {
    const row = el('div', 'ps-coach__skills');
    row.append(...chips);
    item.append(row);
  }
  return item;
}

function suggestionCard(session: PsSession, handlers: CoachPanelHandlers): HTMLElement | null {
  const suggestion = session.suggestion;
  if (!suggestion) return null;
  const card = el('div', 'ps-suggestion confirm-card');
  const title = suggestion.kind === 'finish_define' ? 'Ready to move on' : `${suggestion.kind === 'switch_tool' ? 'Switch to' : 'Next'}: ${TOOLS[suggestion.tool].name}`;
  card.append(el('p', 'ps-suggestion__title', title), el('p', 'ps-suggestion__reason', suggestion.reason));
  const row = el('div', 'ps-suggestion__actions');
  row.append(actionButton(suggestion.kind === 'finish_define' ? 'Move on' : 'Start it', 'accept_suggestion', handlers, 'btn--primary'), actionButton('Not now', 'dismiss_suggestion', handlers));
  card.append(row);
  return card;
}

export function renderCoachPanel(session: PsSession, handlers: CoachPanelHandlers): HTMLElement {
  const panel = el('section', 'ps-coach');
  panel.setAttribute('aria-label', 'Coach');
  const list = el('ul', 'chat-messages ps-coach__messages');
  list.setAttribute('aria-live', 'polite');
  list.append(...session.turns.map(message));
  panel.append(list);

  const busy = session.runner.status === 'queued' || session.runner.status === 'running';
  if (busy) panel.append(el('p', 'ps-coach__status', 'Coach is thinking…'));
  if (session.runner.status === 'failed') {
    const failed = el('div', 'ps-coach__status ps-coach__status--failed');
    failed.append(el('span', '', session.runner.error ?? 'The coach could not answer.'), actionButton('Try again', 'retry', handlers));
    panel.append(failed);
  }

  const card = suggestionCard(session, handlers);
  if (card) panel.append(card);

  const actions = el('div', 'ps-coach__actions');
  if (session.pendingKeep && !busy) actions.append(actionButton('Keep it anyway', 'keep_anyway', handlers));
  if (session.phase === 'define' && !busy) actions.append(actionButton("I've defined it", 'finish_define', handlers));
  if (actions.childElementCount) panel.append(actions);

  const form = el('form', 'chat-form hub-ai-bar hub-ai-bar--thread') as HTMLFormElement;
  const field = el('div', 'hub-ai-bar__field');
  const input = el('textarea', 'chat-input hub-ai-bar__input') as HTMLTextAreaElement;
  input.rows = 2;
  input.placeholder = session.phase === 'defined' ? 'Add a note for next time…' : 'Your answer…';
  input.setAttribute('aria-label', 'Your answer');
  input.disabled = busy;
  field.append(input);
  const send = el('button', 'btn btn--primary', 'Send') as HTMLButtonElement;
  send.type = 'submit';
  send.disabled = busy;
  const tools = el('div', 'chat-form__tools hub-ai-bar__tools');
  tools.append(send);
  const aside = el('div', 'hub-ai-bar__aside');
  aside.append(tools);
  form.append(field, aside);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (text) handlers.onSay(text);
  });
  panel.append(form);
  return panel;
}
```

- [ ] **Step 4: Implement the canvas host**

```ts
// apps/tasks/src/views/problem-solver/canvas.ts
import { el } from '@/views/hub-kit';
import { createFiveWhysView, type FiveWhysView } from '../../../../../packages/problem-solver/render/five-whys';
import { renderOutline } from '../../../../../packages/problem-solver/render/outline';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import type { PsSession, PsToolRun } from '../../../../../packages/problem-solver/types';

const FRAME_QUESTIONS: Array<[keyof PsSession['frame'], string]> = [
  ['goal', 'What is the goal?'],
  ['whatIsTrue', 'What is true?'],
  ['whatCanBeDone', 'What can be done?']
];

function frameCard(session: PsSession): HTMLElement {
  const card = el('div', 'ps-frame');
  for (const [key, question] of FRAME_QUESTIONS) {
    const row = el('div', `ps-frame__row${session.frame[key] ? ' is-answered' : ''}`);
    row.append(el('p', 'ps-frame__q', question), el('p', 'ps-frame__a', session.frame[key] ?? ''));
    card.append(row);
  }
  return card;
}

function shownRun(session: PsSession): PsToolRun | null {
  const runs = session.define.runs;
  return runs.find((run) => run.status === 'active') ?? runs.at(-1) ?? null;
}

export function mountCanvas(host: HTMLElement): { update(session: PsSession): void } {
  let whys: { runId: string; view: FiveWhysView } | null = null;

  return {
    update(session) {
      const run = shownRun(session);
      if (!run) {
        whys = null;
        host.replaceChildren(frameCard(session));
        return;
      }
      const heading = el('h2', 'ps-canvas__title', TOOLS[run.tool].name);
      if (run.tool === 'five_whys') {
        if (!whys || whys.runId !== run.id) whys = { runId: run.id, view: createFiveWhysView() };
        whys.view.update(run);
        const outline = renderOutline(run);
        outline.classList.add('sr-only');
        host.replaceChildren(heading, whys.view.el, outline);
        return;
      }
      whys = null;
      host.replaceChildren(heading, renderOutline(run));
    }
  };
}
```

`host.replaceChildren(heading, whys.view.el, …)` re-inserts the same SVG element; existing node groups are kept, so only new nodes animate.

- [ ] **Step 5: Implement the page**

```ts
// apps/tasks/src/views/problem-solver/view.ts
import '../../../../../packages/problem-solver/problem-solver.css';
import './problem-solver-view.css';
import { el } from '@/views/hub-kit';
import { hashQuery } from '@/shell/shell';
import { errorMessage, renderLoadError } from '@/views/feedback';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';
import type { PsAction, PsSession } from '../../../../../packages/problem-solver/types';
import { isBusy, pollUntilSettled, problemSolverApi } from './api';
import { mountCanvas } from './canvas';
import { renderCoachPanel } from './coach-panel';

let poll: AbortController | null = null;

const PHASE_LABEL: Record<PsSession['phase'], string> = { frame: 'Framing', define: 'Defining', defined: 'Defined' };

async function renderList(canvas: HTMLElement): Promise<void> {
  const page = el('div', 'ps-page ps-scope');
  const start = el('form', 'ps-start') as HTMLFormElement;
  const input = el('textarea', 'hub-ai-bar__input ps-start__input') as HTMLTextAreaElement;
  input.rows = 3;
  input.placeholder = 'What problem are you trying to solve?';
  input.setAttribute('aria-label', 'Describe the problem');
  const go = el('button', 'btn btn--primary', 'Start') as HTMLButtonElement;
  go.type = 'submit';
  const status = el('p', 'ps-start__status');
  start.append(el('h2', 'section-title', 'New problem'), input, go, status);
  start.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    go.disabled = true;
    try {
      const session = await problemSolverApi.create({ text });
      location.hash = `#/problem-solver?id=${session.id}`;
    } catch (err) {
      status.textContent = errorMessage(err);
      go.disabled = false;
    }
  });
  page.append(start);

  const sessions = await problemSolverApi.list();
  const list = el('ul', 'ps-list');
  for (const row of sessions.filter((item) => item.status !== 'archived')) {
    const item = el('li', 'ps-list__item');
    const link = el('a', 'ps-list__link', row.title) as HTMLAnchorElement;
    link.href = `#/problem-solver?id=${row.id}`;
    const meta = [PHASE_LABEL[row.phase], row.tool ? TOOLS[row.tool].name : null, formatDisplayDate(row.updatedAt.slice(0, 10))].filter(Boolean).join(' · ');
    item.append(link, el('span', 'ps-list__meta', meta));
    list.append(item);
  }
  page.append(el('h2', 'section-title', 'Problems'), sessions.length ? list : el('p', 'ps-empty', 'Nothing yet. Start with the problem that is bugging you most.'));
  canvas.replaceChildren(page);
}

async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
  let session = await problemSolverApi.get(id);
  const page = el('div', 'ps-page ps-session ps-scope');
  const back = el('a', 'ps-back', '← Problems') as HTMLAnchorElement;
  back.href = '#/problem-solver';
  const title = el('h2', 'ps-session__title', session.title);
  const board = el('div', 'ps-session__board');
  const canvasHost = el('div', 'ps-canvas');
  const coachHost = el('div', 'ps-coach-host');
  board.append(canvasHost, coachHost);
  page.append(back, title, board);
  canvas.replaceChildren(page);
  const diagram = mountCanvas(canvasHost);

  const paint = (next: PsSession) => {
    session = next;
    diagram.update(session);
    coachHost.replaceChildren(renderCoachPanel(session, { onSay: (text) => void act('say', text), onAction: (action) => void act(action) }));
    coachHost.querySelector('.ps-coach__messages')?.lastElementChild?.scrollIntoView?.({ block: 'end' });
  };

  const settle = async () => {
    poll?.abort();
    poll = new AbortController();
    try {
      paint(await pollUntilSettled(session.id, paint, { signal: poll.signal }));
    } catch {
      /* aborted on navigation */
    }
  };

  async function act(action: PsAction, text?: string): Promise<void> {
    try {
      paint(await problemSolverApi.act(session, action, text));
    } catch (err) {
      if ((err as { code?: string }).code === 'conflict') {
        paint(await problemSolverApi.get(session.id));
        return;
      }
      coachHost.prepend(el('p', 'ps-coach__status ps-coach__status--failed', errorMessage(err)));
      return;
    }
    if (isBusy(session)) await settle();
  }

  paint(session);
  if (isBusy(session)) await settle();
}

export async function renderProblemSolverView(canvas: HTMLElement): Promise<void> {
  poll?.abort();
  canvas.replaceChildren(el('p', 'canvas-status', 'Loading…'));
  const id = hashQuery().get('id');
  try {
    if (id) await renderSession(canvas, id);
    else await renderList(canvas);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderProblemSolverView(canvas), 'Could not load Problem Solver');
  }
}
```

Check that `@/views/feedback` exports `errorMessage` and `renderLoadError` (it does: `term-dates.ts` imports both), and that `hashQuery` is exported from `@/shell/shell` (it is, line ~736).

```css
/* apps/tasks/src/views/problem-solver/problem-solver-view.css */
.ps-page { display: grid; gap: var(--space-6); max-width: 1180px; }
.ps-start { display: grid; gap: var(--space-3); max-width: 640px; }
.ps-start__status { color: var(--danger); min-height: 1em; margin: 0; }
.ps-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
.ps-list__item { display: flex; flex-wrap: wrap; gap: var(--space-2) var(--space-4); align-items: baseline; padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); background: var(--glass); }
.ps-list__link { color: var(--ink); font-weight: var(--weight-semibold); text-decoration: none; }
.ps-list__meta, .ps-empty { color: var(--muted); font-size: var(--text-sm); }
.ps-back { color: var(--muted); text-decoration: none; font-size: var(--text-sm); }
.ps-session__title { margin: 0; font: var(--weight-semibold) var(--font-size-section) / 1.3 var(--font-display); }

.ps-session__board { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, 1fr); gap: var(--space-6); align-items: start; }
.ps-canvas { min-height: 360px; padding: var(--space-5); border-radius: var(--radius-lg); background: var(--paper); }
.ps-canvas__title { margin: 0 0 var(--space-4); font-size: var(--text-md); }

.ps-frame { display: grid; gap: var(--space-3); }
.ps-frame__row { padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); box-shadow: inset 0 0 0 1px var(--line); transition: background 300ms var(--ps-ease); }
.ps-frame__row.is-answered { background: var(--glass); box-shadow: none; }
.ps-frame__q { margin: 0; font-weight: var(--weight-semibold); }
.ps-frame__a { margin: var(--space-1) 0 0; color: var(--ink); min-height: 1.4em; }

.ps-coach { display: flex; flex-direction: column; gap: var(--space-3); }
.ps-coach__messages { max-height: 60vh; overflow-y: auto; }
.ps-coach__skills { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-top: var(--space-2); }
.ps-coach__status { margin: 0; color: var(--muted); font-size: var(--text-sm); }
.ps-coach__status--failed { color: var(--danger); display: flex; gap: var(--space-3); align-items: center; }
.ps-coach__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.ps-suggestion__title { margin: 0; font-weight: var(--weight-semibold); }
.ps-suggestion__reason { margin: var(--space-1) 0 var(--space-3); color: var(--muted); }
.ps-suggestion__actions { display: flex; gap: var(--space-2); }

@media (max-width: 720px) {
  .ps-session__board { grid-template-columns: minmax(0, 1fr); }
  .ps-canvas { padding: var(--space-4); min-height: 0; }
  .ps-coach__messages { max-height: none; }
}
```

- [ ] **Step 6: Wire the route and nav**

In `apps/tasks/src/shell/shell.ts`, add `| 'problem-solver'` to `HubViewId` (after `'term-dates'`), and add the Tools item after Maps:

```ts
      { id: 'problem-solver', label: 'Problem Solver', href: '#/problem-solver' },
```

In `apps/tasks/src/shell/icons.ts`, add an entry beside `'term-dates'` (a circle with a downward chevron, matching the 5 Whys emblem; same path-array format as its neighbours):

```ts
  'problem-solver': ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18', 'M8 10l4 4l4-4'],
```

In `apps/tasks/src/app/main.ts`, add a lazy case beside `'term-dates'`:

```ts
    case 'problem-solver': {
      const { renderProblemSolverView } = await import('@/views/problem-solver/view');
      return renderProblemSolverView(canvas);
    }
```

- [ ] **Step 7: Run tests and typecheck**

Run: `cd apps/tasks && npx vitest run tests/unit/problem-solver-view.test.ts && npx tsc -p tsconfig.json --noEmit`
Expected: PASS (5 tests), no type errors. If a shell test asserts the exact Tools items or `KNOWN_VIEWS`, update that test's expected list to include Problem Solver.

Run: `cd apps/tasks && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/tasks/src/views/problem-solver apps/tasks/src/shell/shell.ts apps/tasks/src/shell/icons.ts apps/tasks/src/app/main.ts apps/tasks/tests/unit/problem-solver-view.test.ts
git commit -m "Problem Solver: Tasks page with coach panel and canvas"
```

---

### Task 15: Browser walk

**Files:**
- Create: `apps/tasks/tests/browser/problem-solver.spec.mjs`

- [ ] **Step 1: Write the spec**

```js
// apps/tasks/tests/browser/problem-solver.spec.mjs
import { expect, test } from '@playwright/test';

async function signIn(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const session = await fetch('/api/session').then((res) => res.json());
    if (session?.data?.authenticated) return;
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passphrase: 'tasks-hub-local' }) });
    if (!res.ok) throw new Error('Could not sign in');
  });
  await page.goto('/#/problem-solver');
  await expect(page.getByRole('heading', { name: 'New problem' })).toBeVisible({ timeout: 20_000 });
}

async function answer(page, text) {
  await page.getByLabel('Your answer').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`5 Whys builds one shape per accepted answer at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    await page.getByLabel('Describe the problem').fill('The weekly rota keeps changing at the last minute');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('.ps-frame')).toBeVisible();

    await answer(page, 'A rota that is fixed a full week ahead');
    await expect(page.locator('.ps-frame__row.is-answered')).toHaveCount(1);
    await answer(page, 'It changed late three of the last four weeks');
    await answer(page, 'We could change which day it is published');
    await expect(page.locator('.ps-suggestion')).toContainText('5 Whys');
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('svg.ps-whys')).toBeVisible();
    await expect(page.locator('svg.ps-whys [data-node]')).toHaveCount(0);

    await answer(page, 'The rota is finalised on Friday afternoon each week');
    await expect(page.locator('svg.ps-whys [data-node]')).toHaveCount(1);

    await answer(page, 'too short');
    await expect(page.locator('svg.ps-whys [data-node]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Keep it anyway' }).click();
    await expect(page.locator('svg.ps-whys .is-contested')).toHaveCount(1);

    await page.reload();
    await expect(page.locator('svg.ps-whys [data-node]')).toHaveCount(2, { timeout: 20_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
```

The mock API's memory store survives a page reload because it lives in the Vite dev process. The scripted coach asks for the goal first, so framing takes three answers, then the suggestion card appears.

- [ ] **Step 2: Run it**

Run: `cd apps/tasks && npx playwright test tests/browser/problem-solver.spec.mjs`
Expected: PASS (2 tests). The config starts the dev server itself. Chromium is preinstalled; do not run `playwright install`.

- [ ] **Step 3: Commit**

```bash
git add apps/tasks/tests/browser/problem-solver.spec.mjs
git commit -m "Problem Solver: browser walk at desktop and 390px"
```

---

### Task 16: Live coach evaluation script

Synthetic problems only. Not run in CI. Run it by hand with a key to check the coach actually pushes back.

**Files:**
- Create: `scripts/problem-solver-eval.mjs`

- [ ] **Step 1: Write the script**

```js
// scripts/problem-solver-eval.mjs
// Usage: ANTHROPIC_API_KEY=... node scripts/problem-solver-eval.mjs
import { anthropicModel, createModelCoach, wordCount } from '../netlify/functions/_shared/problem-solver/coach.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, say } from '../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => new Date().toISOString(), newId: () => `eval-${(n += 1)}` };
const coach = createModelCoach(anthropicModel(process.env));

async function inFiveWhys(problem) {
  let s = createSession({ text: problem }, deps);
  s = applyCoachTurn(s, { verdict: 'accept', message: 'x', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: { goal: 'Work handed in on time', whatIsTrue: 'Half the class missed the last two deadlines', whatCanBeDone: 'Change how deadlines are set and checked' }, model: { id: 'seven_step', reason: 'Default.' }, suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'One symptom.' }, summary: null, exitObjection: null }, deps);
  s = acceptSuggestion(s, deps);
  s = applyCoachTurn(s, await coach(s), deps);
  return s;
}

const CASES = [
  { name: 'vague cause', answer: 'Because students are lazy.', expect: 'challenge' },
  { name: 'perception as fact', answer: 'Everyone knows the deadlines are unfair.', expect: 'challenge' },
  { name: 'premature solution', answer: 'We should just add a reminder app.', expect: 'challenge' },
  { name: 'strong answer', answer: 'Half the class missed the last two deadlines for the Year 9 essay, set on a Friday and due the following Monday.', expect: 'accept' }
];

let failures = 0;
for (const testCase of CASES) {
  let s = await inFiveWhys('Year 9 students hand in work late.');
  s = say(s, testCase.answer, deps);
  const turn = await coach(s);
  const words = wordCount(turn.message);
  const ok = turn.verdict === testCase.expect && words >= 15 && words <= 60;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${testCase.name}: ${turn.verdict} (${words} words) ${turn.skillsMissing.join(',')}\n  ${turn.message}`);
}
process.exitCode = failures ? 1 : 0;
```

- [ ] **Step 2: Syntax check without a key**

Run: `node --check scripts/problem-solver-eval.mjs`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add scripts/problem-solver-eval.mjs
git commit -m "Problem Solver: manual live coach evaluation"
```

---

### Task 17: Gate, push, PR update

- [ ] **Step 1: Full gate**

Run from the repo root: `npm run pre-pr-check`
Expected: `pre-pr-check PASSED`. If dependencies are missing, run `npm ci` at the root and in `apps/tasks` first.

- [ ] **Step 2: Push**

```bash
git push -u origin claude/ecstatic-heisenberg-n1om1q
```

- [ ] **Step 3: Update the draft PR description** to list what Plan 1 delivered and what Plans 2 and 3 will add.

---

## Self-review notes

- Spec coverage in this plan: Frame (three questions), model choice, all seven tool rule sets, chaining and switching (`next_tool`/`switch_tool`), finish early with a non-blocking closing objection, gatekeeper verdicts with keep-anyway and objection notes, skill chips (seen and missing), word limits with rewrite and trim, repair retry, encrypted storage, revisions and replay-safe request ids, background runner with polling and inline fallback, failure and retry, 5 Whys animated diagram, accessible outline, desktop and 390px layout, tests at every layer, live evaluation script.
- Deferred to Plan 2: Problem Tree, Concept Map (graph-blocks), Gap basic and radar (consult `apps/tasks/design-kit/CHART-CATALOG.md` and `CHARTS.md` before the radar), Problem Statement, SMART renderers; tool emblems; the black-and-white record and morph (use the kit's `runMorphTransform`); `rescore_radar` action.
- Deferred to Plan 3: thinking profile, Life Hub context and lookup chips, protocol cards and `link_protocol`, link chips on tasks/projects/goals and `link`/`unlink` actions, proposed tasks with confirm cards.
