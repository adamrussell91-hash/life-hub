# Problem Solver Plan 8: Lightning problem solving

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **Lightning problem solving**: a quick, coach-led route through an everyday snag, from a black-and-white card on the Problem Solver landing page.
- **Walk:** the coach walks the book's flowchart one box at a time. At a yes/no box it asks; at a strategy box it applies the strategy to the snag and asks whether it worked.
- **Chart:** the whole flowchart sits faint, and the path inks in solid black as the run goes. A strip of the four questions across the top lights as the run reaches them.
- **Escalation:** the coach may offer "This needs the full process". Accepting creates a full session seeded with the goal and what was tried, which the coach confirms. The two are linked, and the Lightning chart shows on the full session's page.
- **It came back:** a finished run can take a new round from the start.

**Architecture:**
- **The graph:** `packages/problem-solver/lightning.mjs` holds the flowchart as data, in our own words, with pure transitions. A run's state is a path of entries, and the last entry is the box waiting for an answer.
  - `applyStep` answers it. A strategy may carry whether it worked, so one reply can say what was tried and whether it helped.
  - `again` starts a new round; `strategiesTried` and `escalationSeeds` read the path.
- **The session:** a Lightning run is a session of kind `'lightning'` (phase `'lightning'`, no model) in the same store. Its functions live in a new `lightning-session.mjs`, so `session.mjs` stays about the full process.
- **The service:**
  - it dispatches the coach turn by kind;
  - it creates runs with `{ kind: 'lightning' }`;
  - it gains `lightning_answer` and `lightning_again`;
  - `escalate` is the one action that writes two sessions. The full session is written first, with the request id as its id, so a retry finds it.
- **The coach:** a separate, smaller prompt (`lightning-prompts.mjs`) and a check that a turn answers the current box. The full session's prompt shows the carried seeds while framing, and maps failed strategies to the full tools.
- **The page:**
  - a Lightning card on the landing page;
  - Lightning rows in the Problems list;
  - a Lightning run page: the question strip, the chart, Yes/No buttons on the current box, the coach panel, the escalation card and "It came back";
  - a "From Lightning" panel on an escalated full session.
- **The chart:** a renderer, `render/lightning.ts`, in ink and paper only.

**Tech Stack:** Plain ESM with JSDoc (graph, server), TypeScript renderer and page code (Vite, Tasks app), Web Animations API, `node:test` for root tests, Vitest + happy-dom for renderer and page tests, the preview harness with `--audit`, Playwright on the Tasks mock API for the walk.

**Spec:** `docs/superpowers/specs/2026-10-19-problem-solver-full-process-design.md`, these sections:
- Decisions (Lightning location, mode, chart, close, escalation)
- Experience → Lightning, with the flowchart graph
- Diagrams: Lightning
- Emblems (the Lightning glyph)
- Coach knowledge: the Lightning prompt
- Architecture: `lightning.mjs`; the session model's `kind`, `lightning`, `escalatedFrom`; the `lightning_answer` and `escalate` actions; create accepting `{ kind: 'lightning', text }`
- Errors: Lightning answer on a stale node
- Testing

It builds on Plan 7 (`docs/superpowers/plans/2026-10-20-problem-solver-plan-7-document.md`), done on this branch. Its "Hooks the later plans need" section says an escalated full session starts with no case file, and that a Lightning run never writes one.

**Worktree and branch:** `/Users/you/Projects/life-hub-ps-process`, branch `claude/problem-solver-document` (Plan 7's commits are on it). Run every command from the worktree. Never touch `/Users/you/Projects/life-hub`.

**Book references (local only, never commit):** in `/Users/you/Projects/life-hub-ps-process/.ps-book/` (git-excluded):
- `lightning-intro.png` (p.155)
- `lightning-intro-157.png` (p.157: the four questions)
- `lightning-chart.png` (pp.158–159: the whole flowchart as one spread)

If one is missing, re-render it from `~/Downloads/scan_adam.russell_2026-10-19-11-19-09.pdf`. Scan page *k* holds book pages 2k+98 and 2k+99, so these are k = 28 to 30; k = 30 is the chart spread, kept whole. In zsh, write each command out:
1. `pdftoppm -f <k> -l <k> -r 150 -png -singlefile <pdf> <name>`
2. `sips -r 90 <name>.png`
3. For a single page: `sips -c 1240 877 --cropOffset 0 877 <name>.png` (right) or `--cropOffset 0 0` (left).

Open `lightning-chart.png` with the Read tool before building the chart.

**What the picture shows (the picture wins over the spec):**
- **The graph:** it matches the spec's flowchart graph node for node. Three strategies (via negativa, guess and check, draw a diagram) all feed the same first "Is the problem solved?" box at the bottom of p.159. Its No leads up the right-hand column: work backwards, make a list, take a break, analogy, each with its own "solved?" box, then reframing back on p.158.
- **Relax:** the book draws **three** Relax circles: one under Start, one in the middle of p.159 and one at the bottom of p.159. The graph has one `relax` node, but the chart draws it at all three places and inks the one the path reached. Reaching it from `start` inks the first. Reaching it from `solved_1` inks the bottom one. Any other "solved?" inks the middle one.
- **Yes and No:** small white circles with "Yes" or "No" sit on the arrows.
- **Box styles:**
  - Black rounded boxes hold the checks: Start, "Define the goal" and every "Is the problem solved?".
  - White rounded boxes with ink outlines hold the choices and strategies.
  - Relax is a black circle.
- **Added boxes:** the two closing boxes ("What can I learn?", "What next?") are ours, not the book's.

The book's wording must not be copied into the repo (it is public). Every box label, strategy intent and prompt is in our own words (see `LIGHTNING_NODES` and `LIGHTNING_INTENTS` below). These may be used:
- the short strategy names, which are ordinary headings: "Draw a diagram", "Work backwards", "Make a list", "Take a break", "Guess and check", "Relax", "Start", "Define the goal";
- the four short question headings: "Can I fix this?", "What can I do?", "What can I learn?", "What next?".

**Commands used throughout:**

- One root test file: `node --import ./scripts/test-network-guard.mjs --test tests/unit/<file>.test.js`
- All root Problem Solver tests: `node --import ./scripts/test-network-guard.mjs --test tests/unit/problem-solver-*.test.js`
- One Tasks test file: `cd apps/tasks && npx vitest run tests/unit/<file>.test.ts`
- All Tasks Problem Solver tests: `cd apps/tasks && npx vitest run tests/unit/problem-solver`
- Type gate: `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep "error TS" | grep -v TS6059 | grep -i -E "problem-solver|page-editor"` must print nothing.
- Preview with audit: `PS_PREVIEW_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node scripts/problem-solver-preview.mjs <name> "$PS_SCRATCH/preview" --audit` must print `audit: clean` at every width.

---

## Execution notes (read first)

- **Rules learned in Plans 4–7. Copy this list into every subagent prompt:**
  - **Public repo:** no real names anywhere. No copied book wording; short generic headings are fine. Invented samples only.
  - **Git:** stage only your own files (explicit paths). Never use `git stash`, `git reset --hard` or force-push. Sync branches by merging. Never touch `.claude/launch.json`.
  - **Page actions** go through the session sync (`confirmed()` then `settle()`), never `problemSolverApi.actWith` directly.
  - **Shared rules** live in `packages/problem-solver/`. The Lightning graph and its transitions are `lightning.mjs`; the page and the server both use it.
  - **Renderer lessons:**
    - batch every layout read before any write (FLIP);
    - a click on an aria-hidden key item must focus the real control;
    - named containers need a role;
    - removal tests use `[data-node~=...]`;
    - CSS scale on an already-rotated element scales along the screen axis, so draw lines in on an inner span;
    - fit stage heights to the real content extent;
    - nothing animates on first paint, on a no-op update, on an undo, or under reduced motion.
- **Before Task 1:** run the root and Tasks Problem Solver tests; all must pass.
- **One PR for Plans 7, 8 and 9.** Plan 9 (filmstrips, the Final-words pass with the live evaluation, the walks and the skipped-step gap) follows on this branch. The PR opens when Plan 9 is done. Each task ends in one commit with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push.
- **Review weight:**
  - **Full review** (spec, then quality; one opus reviewer may do both in one pass): Task 2 (Lightning session), Task 6 (the chart) and Task 8 (the Lightning page and the escalation flow).
  - **Single controller check:** the other tasks.
- **Adam's decisions** are listed under "Decisions" at the end.
- **Dry run:** the pure code in Tasks 1–4 was run against these tests on 20 October before the plan was committed. All passed (355 root tests). One bug the dry run caught is already fixed in the code below: a strategy still waiting was counted as tried.

---

## File map

| File | Responsibility | Change |
| --- | --- | --- |
| `packages/problem-solver/lightning.mjs` | The graph (`LIGHTNING_NODES`, `LIGHTNING_EDGES`, `LIGHTNING_QUESTIONS`), `applyStep`, `again`, `currentEntry`, `passes`, `strategiesTried`, `escalationSeeds` | Create |
| `packages/problem-solver/types.ts` | `PsLightningEntry`, `PsLightningState`, `PsFrameSeeds`, session `kind`, three fields, the `escalate` suggestion, three actions | Modify |
| `netlify/functions/_shared/problem-solver/lightning-session.mjs` | `createLightningSession`, `applyLightningTurn`, `lightningAnswer`, `lightningAgain`, `escalateLightning` | Create |
| `netlify/functions/_shared/problem-solver/session.mjs` | Three new fields on create; `summaryRow` carries `escalatedTo` | Modify |
| `netlify/functions/_shared/problem-solver/migrate.mjs` | Default the three fields on read | Modify |
| `netlify/functions/_shared/problem-solver/service.mjs` | Create by kind, two actions, `escalate`, coach dispatch by kind | Modify |
| `netlify/functions/problem-solver.mjs`, `apps/tasks/scripts/mock-api.ts` | Run the escalated full session's first coach turn | Modify |
| `netlify/functions/_shared/problem-solver/coach-schema.mjs` | `lightning` field, `escalate` suggestion | Modify |
| `netlify/functions/_shared/problem-solver/lightning-prompts.mjs` | `LIGHTNING_RUBRIC`, `LIGHTNING_INTENTS`, `buildLightningPrompt`, `checkLightningTurn` | Create |
| `netlify/functions/_shared/problem-solver/coach.mjs` | The model coach routes Lightning runs to the Lightning prompt and check | Modify |
| `netlify/functions/_shared/problem-solver/prompts.mjs` | `lightningLines`: carried seeds while framing; tried strategies mapped to full tools | Modify |
| `netlify/functions/_shared/problem-solver/scripted-coach.mjs` | Lightning turns | Modify |
| `packages/problem-solver/render/lightning.ts` | The chart | Create |
| `packages/problem-solver/glyphs/lightning.svg`, `glyphs.ts` | The black-and-white lightning glyph | Create / Modify |
| `apps/tasks/src/views/problem-solver/lightning-view.ts` | The Lightning run page and the "From Lightning" panel | Create |
| `apps/tasks/src/views/problem-solver/view.ts`, `api.ts`, `coach-panel.ts` | Landing card, list rows, routing by kind, the escalate card | Modify |
| `packages/problem-solver/problem-solver.css` | Lightning card, page and chart sections | Modify |
| `scripts/problem-solver-preview.mjs`, `scripts/problem-solver-preview-samples.mjs` | The chart in the harness | Modify |
| `apps/tasks/tests/browser/problem-solver.spec.mjs` | Lightning walks | Modify |

---

### Task 1: The graph and its transitions

**Files:**
- Create: `packages/problem-solver/lightning.mjs`
- Modify: `packages/problem-solver/types.ts`
- Test: `tests/unit/problem-solver-lightning.test.js`

- [ ] **Step 1: Failing tests**

```js
// tests/unit/problem-solver-lightning.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIGHTNING_EDGES, LIGHTNING_NODES, LIGHTNING_QUESTIONS, again, applyStep, currentEntry,
  escalationSeeds, isQuestion, newLightning, passes, questionOf, strategiesTried
} from '../../packages/problem-solver/lightning.mjs';

const AT = '2026-10-20T09:00:00.000Z';
const walk = (state, ...steps) => steps.reduce((s, step) => applyStep(s, step, AT), state);
const nodes = (state) => state.path.map((e) => e.node);

test('the graph: every link lands on a node, every question has yes and no', () => {
  for (const edge of LIGHTNING_EDGES) assert.ok(LIGHTNING_NODES[edge.to], `${edge.from} -> ${edge.to}`);
  for (const [id, def] of Object.entries(LIGHTNING_NODES)) {
    if (def.yes) assert.ok(def.no, id);
    if (['strategy', 'end', 'close'].includes(def.kind)) assert.equal(def.yes, undefined, id);
  }
  assert.deepEqual(LIGHTNING_QUESTIONS.map((q) => q.id), ['fix', 'do', 'learn', 'next']);
  assert.equal(questionOf('start'), 'fix');
  assert.equal(questionOf('make_list'), 'do');
  assert.equal(questionOf('learn'), 'learn');
});

test('accepting the status quo goes to Relax, then the two closing questions, then finishes', () => {
  let s = newLightning(AT);
  assert.equal(currentEntry(s).node, 'start');
  s = walk(s, { node: 'start', answer: 'yes' });
  assert.deepEqual(nodes(s), ['start', 'relax', 'learn']);
  s = walk(s, { node: 'learn', note: 'Not every snag needs fixing' });
  assert.equal(currentEntry(s).node, 'next');
  s = walk(s, { node: 'next', note: 'Notice it sooner next time' });
  assert.equal(currentEntry(s), null);
  assert.equal(s.finishedAt, AT);
});

test('a strategy can carry whether it worked; a no moves down the chain', () => {
  let s = walk(newLightning(AT), { node: 'start', answer: 'no' }, { node: 'goal', note: 'Leave the house by eight' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'no' });
  assert.equal(currentEntry(s).node, 'diagram');
  s = walk(s, { node: 'diagram', note: 'Sketched the morning', answer: 'no' });
  assert.deepEqual(nodes(s).slice(-3), ['diagram', 'solved_1', 'work_backwards']);
  s = walk(s, { node: 'work_backwards', note: 'Planned back from eight' });
  assert.equal(currentEntry(s).node, 'solved_2');
  s = walk(s, { node: 'solved_2', answer: 'yes' });
  assert.deepEqual(nodes(s).slice(-3), ['solved_2', 'relax', 'learn']);
  assert.deepEqual(strategiesTried(s).map((t) => [t.node, t.outcome]), [['diagram', 'not solved'], ['work_backwards', 'solved']]);
});

test('reframing loops back to the goal and counts passes', () => {
  let s = walk(newLightning(AT), { node: 'start', answer: 'no' }, { node: 'goal', note: 'g' }, { node: 'subtract', answer: 'yes' }, { node: 'via_negativa', answer: 'no' });
  for (const id of ['work_backwards', 'make_list', 'take_break', 'analogy']) s = walk(s, { node: id, answer: 'no' });
  assert.equal(currentEntry(s).node, 'reframing');
  assert.equal(passes(s), 1);
  s = walk(s, { node: 'reframing', answer: 'yes' });
  assert.equal(currentEntry(s).node, 'goal');
  assert.equal(passes(s), 2);
  s = walk(s, { node: 'goal', note: 'A smaller goal' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'yes' }, { node: 'guess_check', answer: 'no' });
  for (const id of ['work_backwards', 'make_list', 'take_break', 'analogy']) s = walk(s, { node: id, answer: 'no' });
  s = walk(s, { node: 'reframing', answer: 'no' });
  assert.equal(currentEntry(s).node, 'cannot');
  s = walk(s, { node: 'cannot' });
  assert.equal(currentEntry(s).node, 'learn');
});

test('a stale node or a missing answer is refused', () => {
  const s = newLightning(AT);
  assert.throws(() => applyStep(s, { node: 'goal' }, AT), (e) => e.code === 'stale_node');
  assert.throws(() => applyStep(s, { node: 'start' }, AT), (e) => e.code === 'invalid_answer');
  assert.throws(() => applyStep({ ...s, finishedAt: AT }, { node: 'start', answer: 'no' }, AT), (e) => e.code === 'stale_node');
  assert.equal(isQuestion('start'), true);
  assert.equal(isQuestion('goal'), false);
});

test('it came back: a finished run starts a new round, keeping the old path', () => {
  let s = walk(newLightning(AT), { node: 'start', answer: 'yes' }, { node: 'learn' }, { node: 'next' });
  assert.throws(() => again(newLightning(AT), AT), /still going/);
  s = again(s, AT);
  assert.equal(s.rounds, 2);
  assert.equal(s.finishedAt, null);
  assert.deepEqual(currentEntry(s), { node: 'start', round: 2, at: AT });
  assert.equal(s.path.filter((e) => e.round === 1).length, 4);
});

test('escalation seeds: the latest goal and what was tried, with outcomes', () => {
  const s = walk(newLightning(AT), { node: 'start', answer: 'no' }, { node: 'goal', note: 'Leave the house by eight' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'no' }, { node: 'diagram', note: 'Sketched the morning', answer: 'no' });
  const seeds = escalationSeeds(s);
  assert.equal(seeds.goal, 'Leave the house by eight');
  assert.equal(seeds.whatIsTrue, 'Tried draw a diagram (Sketched the morning): not solved.');
  assert.equal(seeds.tried.length, 1);
  assert.deepEqual(escalationSeeds(newLightning(AT)), { goal: null, whatIsTrue: null, tried: [] });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
// packages/problem-solver/lightning.mjs
// Lightning problem solving as data: the flowchart graph (toolkit pp.158–159, labels in our
// words) and its pure transitions. A run's state is a path of entries; the last entry is the
// node waiting for an answer. Shared by the server, the coach prompt and the chart.

const node = (kind, label, links = {}) => Object.freeze({ kind, label, ...links });

/**
 * Kinds: `check` (black), `choice` (white, a yes/no question), `strategy` (white), `end`
 * (black circle), `close` (added after the book's chart: the p.157 questions).
 */
export const LIGHTNING_NODES = Object.freeze({
  start: node('check', 'Could you accept things as they are?', { yes: 'relax', no: 'goal' }),
  goal: node('check', 'Define the goal', { next: 'subtract' }),
  subtract: node('choice', 'Could taking something away solve it?', { yes: 'via_negativa', no: 'one_step' }),
  one_step: node('choice', 'Could one step solve it?', { yes: 'guess_check', no: 'diagram' }),
  via_negativa: node('strategy', 'Take something away', { next: 'solved_1' }),
  guess_check: node('strategy', 'Guess and check', { next: 'solved_1' }),
  diagram: node('strategy', 'Draw a diagram', { next: 'solved_1' }),
  solved_1: node('check', 'Is it solved?', { yes: 'relax', no: 'work_backwards' }),
  work_backwards: node('strategy', 'Work backwards', { next: 'solved_2' }),
  solved_2: node('check', 'Is it solved?', { yes: 'relax', no: 'make_list' }),
  make_list: node('strategy', 'Make a list', { next: 'solved_3' }),
  solved_3: node('check', 'Is it solved?', { yes: 'relax', no: 'take_break' }),
  take_break: node('strategy', 'Take a break', { next: 'solved_4' }),
  solved_4: node('check', 'Is it solved?', { yes: 'relax', no: 'analogy' }),
  analogy: node('strategy', 'Find an analogy', { next: 'solved_5' }),
  solved_5: node('check', 'Is it solved?', { yes: 'relax', no: 'reframing' }),
  reframing: node('choice', 'Can the constraints, the problem or the resources change?', { yes: 'goal', no: 'cannot' }),
  cannot: node('strategy', 'Not solvable as things stand: try another problem, or take a walk', { next: 'learn' }),
  relax: node('end', 'Relax', { next: 'learn' }),
  learn: node('close', 'What can I learn?', { next: 'next' }),
  next: node('close', 'What next?', { next: null })
});

export const LIGHTNING_NODE_IDS = Object.freeze(Object.keys(LIGHTNING_NODES));

/** The four questions the strip across the top lights as a run goes. */
export const LIGHTNING_QUESTIONS = Object.freeze([
  { id: 'fix', label: 'Can I fix this?' },
  { id: 'do', label: 'What can I do?' },
  { id: 'learn', label: 'What can I learn?' },
  { id: 'next', label: 'What next?' }
]);

export function questionOf(id) {
  if (id === 'start') return 'fix';
  if (id === 'learn' || id === 'next') return id;
  return 'do';
}

/** True when the node is answered yes or no. */
export const isQuestion = (id) => Boolean(LIGHTNING_NODES[id]?.yes);

/** Every edge of the graph, for the chart: { from, to, label: 'yes' | 'no' | null }. */
export const LIGHTNING_EDGES = Object.freeze(LIGHTNING_NODE_IDS.flatMap((from) => {
  const def = LIGHTNING_NODES[from];
  return def.yes ? [{ from, to: def.yes, label: 'yes' }, { from, to: def.no, label: 'no' }] : def.next ? [{ from, to: def.next, label: null }] : [];
}));

const invalid = (code, message) => Object.assign(new Error(message), { code });

export function newLightning(at) {
  return { path: [{ node: 'start', round: 1, at }], rounds: 1, finishedAt: null, escalatedTo: null };
}

/** The entry waiting for an answer, or null once the run is finished. */
export function currentEntry(state) {
  return state.finishedAt ? null : state.path.at(-1) ?? null;
}

/**
 * Answer the current node and move on. `step` is { node, answer?, note? }:
 * - a yes/no node needs `answer`;
 * - a strategy whose next box asks "Is it solved?" may carry that answer too, so one reply
 *   can say what was tried and whether it worked;
 * - Relax passes straight on to "What can I learn?"; answering "What next?" finishes the run.
 * Throws `stale_node` when `step.node` is not the current node, `invalid_answer` otherwise.
 */
export function applyStep(state, step, at) {
  const current = currentEntry(state);
  if (!current || current.node !== step?.node) throw invalid('stale_node', 'That question has moved on.');
  const def = LIGHTNING_NODES[current.node];
  const note = typeof step.note === 'string' && step.note.trim() ? step.note.trim().slice(0, 600) : undefined;
  const answer = step.answer === 'yes' || step.answer === 'no' ? step.answer : undefined;
  const round = state.rounds;
  const path = state.path.slice(0, -1);
  let target;
  if (def.yes) {
    if (!answer) throw invalid('invalid_answer', `${def.label} needs a yes or no.`);
    path.push({ ...current, answer, ...(note ? { note } : {}) });
    target = def[answer];
  } else if (def.kind === 'strategy' && answer && isQuestion(def.next)) {
    path.push({ ...current, ...(note ? { note } : {}) });
    path.push({ node: def.next, round, at, answer });
    target = LIGHTNING_NODES[def.next][answer];
  } else {
    path.push({ ...current, ...(note ? { note } : {}) });
    target = def.next;
  }
  if (target === 'relax') {
    path.push({ node: 'relax', round, at });
    target = LIGHTNING_NODES.relax.next;
  }
  if (!target) return { ...state, path, finishedAt: at };
  path.push({ node: target, round, at });
  return { ...state, path };
}

/** "It came back": a finished run starts a new round from the start. */
export function again(state, at) {
  if (!state.finishedAt) throw invalid('invalid_answer', 'This run is still going.');
  const rounds = state.rounds + 1;
  return { ...state, rounds, finishedAt: null, path: [...state.path, { node: 'start', round: rounds, at }] };
}

/** How many times the current round has defined the goal (more than 1 means a reframing loop). */
export function passes(state) {
  return state.path.filter((entry) => entry.round === state.rounds && entry.node === 'goal').length;
}

/** Strategies tried in every round with what was tried and whether it worked, in order. The one waiting now is not tried yet. */
export function strategiesTried(state) {
  const out = [];
  const waiting = currentEntry(state);
  state.path.forEach((entry, i) => {
    const def = LIGHTNING_NODES[entry.node];
    if (def.kind !== 'strategy' || entry.node === 'cannot' || entry === waiting) return;
    const after = state.path[i + 1];
    const outcome = after && isQuestion(after.node) && after.answer ? (after.answer === 'yes' ? 'solved' : 'not solved') : null;
    out.push({ node: entry.node, label: def.label, note: entry.note ?? null, outcome, round: entry.round });
  });
  return out;
}

/** What a full session starts from when a Lightning run is escalated (the coach confirms each). */
export function escalationSeeds(state) {
  const goal = state.path.filter((entry) => entry.node === 'goal' && entry.note).at(-1)?.note ?? null;
  const tried = strategiesTried(state);
  const whatIsTrue = tried.length
    ? tried.map((t) => `Tried ${t.label.toLowerCase()}${t.note ? ` (${t.note})` : ''}: ${t.outcome ?? 'no result yet'}.`).join(' ')
    : null;
  return { goal, whatIsTrue, tried };
}
```

In `types.ts`:

```ts
export type PsLightningNodeId = 'start' | 'goal' | 'subtract' | 'one_step' | 'via_negativa' | 'guess_check' | 'diagram' | 'solved_1' | 'work_backwards' | 'solved_2' | 'make_list' | 'solved_3' | 'take_break' | 'solved_4' | 'analogy' | 'solved_5' | 'reframing' | 'cannot' | 'relax' | 'learn' | 'next';
export type PsLightningEntry = { node: PsLightningNodeId; round: number; at: string; answer?: 'yes' | 'no'; note?: string };
export type PsLightningState = { path: PsLightningEntry[]; rounds: number; finishedAt: string | null; escalatedTo: string | null };
export type PsLightningTried = { node: PsLightningNodeId; label: string; note: string | null; outcome: 'solved' | 'not solved' | null; round: number };
/** What an escalated full session starts from; seeds, not answers, until the coach confirms them. */
export type PsFrameSeeds = { goal: string | null; whatIsTrue: string | null; tried: PsLightningTried[] };
```

Give `lightning.mjs`'s exports JSDoc types from these.

- [ ] **Step 4: Run** the new file and the type gate. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: the Lightning flowchart as data` (with trailer).

---

### Task 2: Lightning runs on the session (FULL REVIEW)

**Files:**
- Create: `netlify/functions/_shared/problem-solver/lightning-session.mjs`
- Modify: `netlify/functions/_shared/problem-solver/session.mjs`, `migrate.mjs`, `packages/problem-solver/types.ts`
- Test: `tests/unit/problem-solver-lightning-session.test.js`, `tests/unit/problem-solver-migrate.test.js`

- [ ] **Step 1: Failing tests**

```js
// tests/unit/problem-solver-lightning-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLightningTurn, createLightningSession, escalateLightning, lightningAgain, lightningAnswer } from '../../netlify/functions/_shared/problem-solver/lightning-session.mjs';
import { currentEntry } from '../../packages/problem-solver/lightning.mjs';
import { migrateSession } from '../../netlify/functions/_shared/problem-solver/migrate.mjs';
import { summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';

let counter = 0;
const deps = { now: () => '2026-10-20T09:00:00.000Z', newId: () => `id${(counter += 1)}` };
const turn = (fields) => ({ verdict: 'clarify', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, ...fields });
const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });
const run = () => idle(createLightningSession({ text: 'I keep missing the 8.05 bus.' }, deps));

test('a Lightning run starts at the first box, queued for the coach', () => {
  const s = createLightningSession({ text: 'I keep missing the 8.05 bus.' }, deps);
  assert.equal(s.kind, 'lightning');
  assert.equal(s.phase, 'lightning');
  assert.equal(s.model, null);
  assert.equal(currentEntry(s.lightning).node, 'start');
  assert.equal(s.runner.status, 'queued');
  assert.equal(s.escalatedFrom, null);
  assert.equal(migrateSession(s), s, 'a fresh run needs no migration');
});

test('the coach answers the current box; a stale step is dropped and the turn kept', () => {
  let s = applyLightningTurn(run(), turn({ lightning: { node: 'start', answer: 'no' } }), deps);
  assert.equal(currentEntry(s.lightning).node, 'goal');
  s = applyLightningTurn(idle(s), turn({ lightning: { node: 'subtract', answer: 'no' } }), deps);
  assert.equal(currentEntry(s.lightning).node, 'goal');
  assert.equal(s.turns.at(-1).role, 'coach');
});

test('the last closing answer finishes the run', () => {
  let s = run();
  for (const step of [{ node: 'start', answer: 'yes' }, { node: 'learn', note: 'It was not worth the worry' }, { node: 'next', note: 'Leave five minutes earlier' }]) s = idle(applyLightningTurn(s, turn({ lightning: step }), deps));
  assert.equal(s.status, 'finished');
  assert.equal(currentEntry(s.lightning), null);
});

test('an escalate suggestion is kept while the run is open', () => {
  let s = applyLightningTurn(run(), turn({ suggestion: { kind: 'escalate', reason: 'Three people are involved.' } }), deps);
  assert.deepEqual(s.suggestion, { kind: 'escalate', reason: 'Three people are involved.' });
  s = applyLightningTurn(idle(s), turn({}), deps);
  assert.equal(s.suggestion.kind, 'escalate');
  s = applyLightningTurn(idle(s), turn({ suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } }), deps);
  assert.equal(s.suggestion.kind, 'escalate', 'only escalate suggestions mean anything here');
});

test('the person answers a yes/no box; a box that moved on is a conflict', () => {
  const s = lightningAnswer(run(), { node: 'start', answer: 'no' }, deps);
  assert.equal(currentEntry(s.lightning).node, 'goal');
  assert.equal(s.turns.at(-1).text, 'No.');
  assert.equal(s.runner.status, 'queued');
  assert.throws(() => lightningAnswer(idle(s), { node: 'start', answer: 'no' }, deps), (e) => e.code === 'conflict');
  assert.throws(() => lightningAnswer(idle(s), { node: 'goal', answer: 'yes' }, deps), /yes or no/);
});

test('it came back: only a finished, unescalated run starts a new round', () => {
  let s = run();
  assert.throws(() => lightningAgain(s, deps), /still going/);
  for (const step of [{ node: 'start', answer: 'yes' }, { node: 'learn' }, { node: 'next' }]) s = idle(applyLightningTurn(s, turn({ lightning: step }), deps));
  s = lightningAgain(s, deps);
  assert.equal(s.status, 'active');
  assert.equal(s.lightning.rounds, 2);
  assert.equal(currentEntry(s.lightning).node, 'start');
  assert.equal(s.turns.at(-1).text, 'It came back.');
});

test('escalate: a full session seeded from the run; the run is marked and finished', () => {
  let s = run();
  for (const step of [{ node: 'start', answer: 'no' }, { node: 'goal', note: 'Catch the 8.05 every weekday' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'no' }, { node: 'diagram', note: 'Mapped the morning', answer: 'no' }]) s = idle(applyLightningTurn(s, turn({ lightning: step }), deps));
  const { full, lightning } = escalateLightning(s, 'full-1', deps);
  assert.equal(full.id, 'full-1');
  assert.equal(full.kind, 'full');
  assert.equal(full.phase, 'frame');
  assert.deepEqual(full.frame, {}, 'seeds are not answers until the coach confirms them');
  assert.equal(full.escalatedFrom, s.id);
  assert.equal(full.frameSeeds.goal, 'Catch the 8.05 every weekday');
  assert.match(full.frameSeeds.whatIsTrue, /Tried draw a diagram \(Mapped the morning\): not solved\./);
  assert.equal(full.turns[0].text, 'I keep missing the 8.05 bus.');
  assert.equal(lightning.lightning.escalatedTo, 'full-1');
  assert.equal(lightning.status, 'finished');
  assert.throws(() => escalateLightning(lightning, 'full-2', deps), /already went/);
  assert.throws(() => lightningAgain(lightning, deps), /went to the full process/);
});

test('summary rows say a run is Lightning, and where it went', () => {
  const row = summaryRow(run());
  assert.equal(row.kind, 'lightning');
  assert.equal(row.escalatedTo, null);
});
```

In `problem-solver-migrate.test.js`:
- add a test that a v2 session without the three fields gains `lightning: null, escalatedFrom: null, frameSeeds: null`;
- extend the "pass through unchanged" fixture with the three fields.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
// netlify/functions/_shared/problem-solver/lightning-session.mjs
// Lightning runs: a session of kind 'lightning' whose state is the flowchart path. The coach
// walks it one node at a time; the person can also answer a yes/no box on the chart.
// Escalating creates a full session seeded from the run (the coach confirms each seed).
import { again, applyStep, currentEntry, escalationSeeds, LIGHTNING_NODES, newLightning } from '../../../../packages/problem-solver/lightning.mjs';
import { createSession } from './session.mjs';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const touch = (session, deps) => ({ ...session, updatedAt: deps.now() });
const idle = () => ({ status: 'idle', mode: 'turn', error: null });
const queue = (session) => ({ ...session, runner: { status: 'queued', mode: 'turn', error: null } });
const userTurn = (text, deps) => ({ id: deps.newId(), role: 'user', text, createdAt: deps.now() });

export function createLightningSession({ title = '', text, links = [] }, deps) {
  const base = createSession({ title, text, links }, deps);
  return { ...base, kind: 'lightning', phase: 'lightning', lightning: newLightning(deps.now()) };
}

const isLightning = (session) => session.kind === 'lightning' && session.lightning;

function finish(session, state, deps) {
  return state.finishedAt ? { ...session, lightning: state, status: 'finished', suggestion: null } : { ...session, lightning: state, status: 'active' };
}

/**
 * The coach's turn on a Lightning run. Its `lightning` step (if any) answers the current node;
 * a step for a node that has moved on is dropped, and the turn is kept. An `escalate`
 * suggestion is kept until the run finishes or is escalated.
 */
export function applyLightningTurn(session, turn, deps) {
  let next = { ...session, runner: idle() };
  const coachTurn = { id: deps.newId(), role: 'coach', text: turn.message, verdict: turn.verdict, skillsSeen: turn.skillsSeen, skillsMissing: turn.skillsMissing, createdAt: deps.now() };
  if (turn.lightning && next.status === 'active') {
    try {
      next = finish(next, applyStep(next.lightning, turn.lightning, deps.now()), deps);
    } catch (error) {
      if (!['stale_node', 'invalid_answer'].includes(error.code)) throw error;
    }
  }
  const open = next.status === 'active' && !next.lightning.escalatedTo;
  const suggestion = open && turn.suggestion?.kind === 'escalate' ? { kind: 'escalate', reason: turn.suggestion.reason ?? '' } : open && next.suggestion?.kind === 'escalate' ? next.suggestion : null;
  return touch({ ...next, turns: [...next.turns, coachTurn], suggestion, summary: turn.summary ?? next.summary }, deps);
}

/** The person answered a yes/no box on the chart. A box that has moved on is a 409 (refetch). */
export function lightningAnswer(session, payload, deps) {
  if (!isLightning(session)) throw fail(409, 'action_not_allowed', 'This is not a Lightning run.');
  if (session.status !== 'active') throw fail(409, 'action_not_allowed', 'This run is finished.');
  const current = currentEntry(session.lightning);
  if (!current || current.node !== payload?.node) throw fail(409, 'conflict', 'That question has moved on. Reloaded the latest.');
  if (!LIGHTNING_NODES[current.node].yes || !['yes', 'no'].includes(payload?.answer)) throw fail(400, 'validation_error', 'Answer yes or no.');
  const state = applyStep(session.lightning, { node: current.node, answer: payload.answer }, deps.now());
  const next = finish({ ...session, turns: [...session.turns, userTurn(payload.answer === 'yes' ? 'Yes.' : 'No.', deps)] }, state, deps);
  return queue(touch(next, deps));
}

/** "It came back": a finished, unescalated run starts a new round from the start. */
export function lightningAgain(session, deps) {
  if (!isLightning(session)) throw fail(409, 'action_not_allowed', 'This is not a Lightning run.');
  if (session.lightning.escalatedTo) throw fail(409, 'action_not_allowed', 'This run went to the full process.');
  if (!session.lightning.finishedAt) throw fail(409, 'action_not_allowed', 'This run is still going.');
  const state = again(session.lightning, deps.now());
  return queue(touch({ ...session, status: 'active', lightning: state, suggestion: null, turns: [...session.turns, userTurn('It came back.', deps)] }, deps));
}

/**
 * Escalate: a full session (id `fullId`) seeded from the run, and the run marked as escalated
 * and finished. Returns both; the service writes the full session first. Refused when already
 * escalated (the service returns the existing one).
 */
export function escalateLightning(session, fullId, deps) {
  if (!isLightning(session)) throw fail(409, 'action_not_allowed', 'This is not a Lightning run.');
  if (session.lightning.escalatedTo) throw fail(409, 'action_not_allowed', 'This run already went to the full process.');
  const seeds = escalationSeeds(session.lightning);
  const snag = session.turns.find((t) => t.role === 'user')?.text ?? session.title;
  const full = { ...createSession({ title: session.title, text: snag, links: session.links }, deps), id: fullId, escalatedFrom: session.id, frameSeeds: seeds };
  const at = deps.now();
  const lightning = touch({
    ...session,
    status: 'finished',
    suggestion: null,
    runner: idle(),
    lightning: { ...session.lightning, escalatedTo: fullId, finishedAt: session.lightning.finishedAt ?? at },
    turns: [...session.turns, userTurn('Take this to the full process.', deps)]
  }, deps);
  return { full, lightning };
}
```

- **`session.mjs`:**
  - `createSession` adds `lightning: null, escalatedFrom: null, frameSeeds: null` after `caseFileDeclined: null`.
  - `summaryRow` adds `escalatedTo: session.lightning?.escalatedTo ?? null`. `kind` already passes through.
- **`migrate.mjs`:** add the three fields to `LATER_FIELDS`, and change the comment to "Sessions saved before Plans 5 to 8 gain these fields".
- **`types.ts`:**
  - `PsSession.kind: 'full' | 'lightning'`, and add `lightning: PsLightningState | null; escalatedFrom: string | null; frameSeeds: PsFrameSeeds | null;`.
  - `PsSuggestion` gains `| { kind: 'escalate'; reason: string }`.
  - `PsAction` gains `'lightning_answer' | 'lightning_again' | 'escalate'`.
  - `PsSummary.kind?: 'full' | 'lightning'` and `escalatedTo?: string | null`.

- [ ] **Step 4: Run** the new file, the migrate tests and every root Problem Solver test, plus the type gate. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: Lightning runs, the yes/no answer, it came back and escalation` (with trailer).

---

### Task 3: The service, the handler and the coach schema

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/service.mjs`, `coach-schema.mjs`, `netlify/functions/problem-solver.mjs`, `apps/tasks/scripts/mock-api.ts`
- Test: `tests/unit/problem-solver-lightning-service.test.js`, `tests/unit/problem-solver-coach-schema.test.js`, `tests/unit/problem-solver-http.test.js`

- [ ] **Step 1: Failing tests**

```js
// tests/unit/problem-solver-lightning-service.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';

const turn = (fields) => ({ verdict: 'clarify', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, ...fields });
function service(coach) {
  let n = 0;
  return createProblemSolverService({ store: createMemoryProblemStore(), coach, now: () => '2026-10-20T09:00:00.000Z', newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` });
}
const RID = '11111111-1111-4111-8111-111111111111';

test('create a Lightning run, answer a box, and the coach turn goes through the Lightning rules', async () => {
  const svc = service(async () => turn({ message: 'Could you live with it?' }));
  let s = await svc.create('op', { kind: 'lightning', text: 'The printer jams every Monday.', requestId: 'a' });
  assert.equal(s.kind, 'lightning');
  s = await svc.run('op', s.id);
  assert.equal(s.turns.at(-1).text, 'Could you live with it?');
  s = await svc.action('op', { id: s.id, revision: s.revision, requestId: 'b', action: 'lightning_answer', payload: { node: 'start', answer: 'no' } });
  assert.equal(s.lightning.path.at(-1).node, 'goal');
  assert.equal(s.runner.status, 'queued');
});

test('escalate writes the full session once and marks the run; a retry finds the same one', async () => {
  const svc = service(async () => turn({ suggestion: { kind: 'escalate', reason: 'It keeps coming back.' } }));
  let s = await svc.run('op', (await svc.create('op', { kind: 'lightning', text: 'The printer jams every Monday.', requestId: 'a' })).id);
  assert.equal(s.suggestion.kind, 'escalate');
  const after = await svc.action('op', { id: s.id, revision: s.revision, requestId: RID, action: 'escalate' });
  assert.equal(after.lightning.escalatedTo, RID);
  assert.equal(after.status, 'finished');
  const full = await svc.get('op', RID);
  assert.equal(full.kind, 'full');
  assert.equal(full.escalatedFrom, s.id);
  assert.equal(full.runner.status, 'queued');
  const again = await svc.action('op', { id: s.id, revision: s.revision, requestId: RID, action: 'escalate' });
  assert.equal(again.lightning.escalatedTo, RID, 'a replayed request returns the escalated run');
  assert.equal((await svc.list('op')).length, 2);
});
```

- **Schema** (append to `problem-solver-coach-schema.test.js`):
  - `validateCoachTurn` with `lightning: { node: 'start', answer: 'no', note: 'It wastes an hour' }` returns it as given.
  - `{ node: 'nowhere' }` fails with `/Unknown Lightning box/`.
  - An absent field gives `lightning: null`.
  - `suggestion: { kind: 'escalate', reason: 'It recurs.' }` is kept.
- **Handler** (`problem-solver-http.test.js`): an `escalate` action starts a coach run for the new full session. With `invokeRun` stubbed, it is called with the escalated id, and the response carries the Lightning run.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

In `service.mjs`:
- import `applyLightningTurn, createLightningSession, escalateLightning, lightningAgain, lightningAnswer` from `./lightning-session.mjs`;
- `ACTIONS` gains:

```js
    lightning_answer: (s, body) => lightningAnswer(s, body.payload ?? {}, deps),
    lightning_again: (s) => lightningAgain(s, deps),
```

- `create`: `const make = body.kind === 'lightning' ? createLightningSession : createSession;` and build the session with `make(...)`;
- `action`: after the revision check and before the `ACTIONS` lookup, `if (body.action === 'escalate') return escalate(owner, value, etag, body);`;
- `run`: `const apply = value.kind === 'lightning' ? applyLightningTurn : applyCoachTurn; next = apply(value, await coach(value), deps);`;
- the new function, beside `listRows`:

```js
  /**
   * Lightning to the full process: write the seeded full session first (its id is the request id,
   * so a retry finds it instead of making another), then mark the run. Returns the run.
   */
  async function escalate(owner, value, etag, body) {
    if (['queued', 'running'].includes(value.runner.status)) throw httpError(409, 'busy', 'The coach is still thinking.');
    const fullId = ID_RE.test(String(body.requestId ?? '')) ? String(body.requestId) : newId();
    const { full, lightning } = escalateLightning(value, fullId, deps);
    const written = await store.write(owner, full.id, { ...full, requestIds: [] }, null);
    if (!written && !(await store.read(owner, full.id))) throw httpError(409, 'conflict', 'This problem changed elsewhere. Reloaded the latest.');
    const next = { ...lightning, revision: value.revision + 1, requestIds: [...value.requestIds, String(body.requestId ?? '')].filter(Boolean).slice(-REQUEST_IDS_KEPT) };
    return save(owner, next, etag);
  }
```

(A replayed request id is caught by the existing `requestIds` check before this runs, so a retry returns the escalated run.)

In `coach-schema.mjs`:
- import `LIGHTNING_NODE_IDS` from `packages/problem-solver/lightning.mjs`;
- in `suggestionOf`, before the `reopen_step` branch: `if (raw.kind === 'escalate') return { value: { kind: 'escalate', reason } };`;
- in `validateCoachTurn`, before `proposeTasks`:

```js
  let lightning = null;
  if (raw.lightning != null) {
    if (!LIGHTNING_NODE_IDS.includes(raw.lightning?.node)) return fail(`Unknown Lightning box: ${raw.lightning?.node}`);
    const answer = ['yes', 'no'].includes(raw.lightning.answer) ? raw.lightning.answer : null;
    const note = text(raw.lightning.note);
    lightning = { node: raw.lightning.node, ...(answer ? { answer } : {}), ...(note ? { note } : {}) };
  }
```

- add `lightning` to the returned value.

The full-process parser must not let `escalate` through. In `coach.mjs` `parse`, drop an `escalate` suggestion for full sessions: `if (result.value.suggestion?.kind === 'escalate') result.value = { ...result.value, suggestion: null };`.

**Handler** (`netlify/functions/problem-solver.mjs`): after `service.action` returns, work out which session's coach turn to start:

```js
      const runId = body.action === 'escalate' ? session.lightning?.escalatedTo ?? null : session.runner.status === 'queued' ? session.id : null;
      if (!runId) return withCors(okResponse(200, { session }), request, env);
      let kicked = false;
      try { kicked = await (deps.invokeRun ?? defaultInvokeRun)(request, runId, env, deps.fetchImpl ?? fetch); } catch { kicked = false; }
      if (kicked) return withCors(okResponse(202, { session }), request, env);
      if (runId !== session.id) {
        await service.run(owner(env), runId);
        return withCors(okResponse(200, { session }), request, env);
      }
      return withCors(okResponse(200, { session: await service.run(owner(env), session.id) }), request, env);
```

**Mock API** (`apps/tasks/scripts/mock-api.ts`): after the action, `if (payload.action === 'escalate' && session.lightning?.escalatedTo) await problemSolver.run('operator', session.lightning.escalatedTo);`.

- [ ] **Step 4: Run** the three test files and all root Problem Solver tests. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: Lightning in the service; escalate writes the full session first` (with trailer).

---

### Task 4: The Lightning coach and the carried seeds

**Files:**
- Create: `netlify/functions/_shared/problem-solver/lightning-prompts.mjs`
- Modify: `netlify/functions/_shared/problem-solver/coach.mjs`, `prompts.mjs`
- Test: `tests/unit/problem-solver-lightning-coach.test.js`, `tests/unit/problem-solver-prompts.test.js`, `tests/unit/problem-solver-coach.test.js`

- [ ] **Step 1: Failing tests**

```js
// tests/unit/problem-solver-lightning-coach.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { buildLightningPrompt, checkLightningTurn, LIGHTNING_INTENTS, LIGHTNING_RUBRIC } from '../../netlify/functions/_shared/problem-solver/lightning-prompts.mjs';
import { createLightningSession, applyLightningTurn } from '../../netlify/functions/_shared/problem-solver/lightning-session.mjs';
import { LIGHTNING_NODE_IDS } from '../../packages/problem-solver/lightning.mjs';

let n = 0;
const deps = { now: () => '2026-10-20T09:00:00.000Z', newId: () => `id${(n += 1)}` };
const run = () => ({ ...createLightningSession({ text: 'The printer jams every Monday.' }, deps), runner: { status: 'idle', mode: 'turn', error: null } });
const turn = (fields) => ({ verdict: 'clarify', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, ...fields });

test('schema: a lightning step and an escalate suggestion', () => {
  const ok = validateCoachTurn({ verdict: 'clarify', message: 'Could you live with it?', lightning: { node: 'start', answer: 'no', note: 'It wastes an hour' }, suggestion: { kind: 'escalate', reason: 'It recurs.' } });
  assert.deepEqual(ok.value.lightning, { node: 'start', answer: 'no', note: 'It wastes an hour' });
  assert.deepEqual(ok.value.suggestion, { kind: 'escalate', reason: 'It recurs.' });
  assert.match(validateCoachTurn({ verdict: 'clarify', message: 'm', lightning: { node: 'nowhere' } }).error, /Unknown Lightning box/);
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'm' }).value.lightning, null);
});

test('every box has an intent, and the rubric names the escalation reasons', () => {
  for (const id of LIGHTNING_NODE_IDS) assert.ok(LIGHTNING_INTENTS[id], id);
  for (const word of ['escalate', 'stakeholders', 'three or more strategies', 'Can I fix this?']) assert.ok(LIGHTNING_RUBRIC.includes(word), word);
});

test('the prompt names the current box and both ways on', () => {
  const { system, user } = buildLightningPrompt(run());
  assert.equal(system.length, 1);
  assert.match(user, /CURRENT BOX: start \(check\)/);
  assert.match(user, /NEXT: yes -> relax .*; no -> goal/);
});

test('after a strategy, the prompt carries what was tried; a second round says so', () => {
  let s = run();
  for (const step of [{ node: 'start', answer: 'no' }, { node: 'goal', note: 'Print the rota on Monday' }, { node: 'subtract', answer: 'no' }, { node: 'one_step', answer: 'no' }, { node: 'diagram', note: 'Sketched the paper path', answer: 'no' }]) s = { ...applyLightningTurn(s, turn({ lightning: step }), deps), runner: { status: 'idle', mode: 'turn', error: null } };
  const { user } = buildLightningPrompt(s);
  assert.match(user, /CURRENT BOX: work_backwards/);
  assert.match(user, /TRIED SO FAR: Draw a diagram \(Sketched the paper path\): not solved/);
  assert.match(user, /GOAL: Print the rota on Monday/);
  assert.match(buildLightningPrompt({ ...s, lightning: { ...s.lightning, rounds: 2 } }).user, /it came back/);
});

test('the parser check: the current box only, yes/no where asked; escalate kept until escalated', () => {
  const s = run();
  assert.equal(checkLightningTurn(s, turn({ lightning: { node: 'start', answer: 'no' } })).ok, true);
  assert.match(checkLightningTurn(s, turn({ lightning: { node: 'goal' } })).error, /current box \(start\)/);
  assert.match(checkLightningTurn(s, turn({ lightning: { node: 'start' } })).error, /yes or no/);
  const kept = checkLightningTurn(s, turn({ suggestion: { kind: 'escalate', reason: 'r' } }));
  assert.equal(kept.value.suggestion.kind, 'escalate');
  const gone = checkLightningTurn({ ...s, lightning: { ...s.lightning, escalatedTo: 'x' } }, turn({ suggestion: { kind: 'escalate', reason: 'r' } }));
  assert.equal(gone.value.suggestion, null);
  assert.equal(checkLightningTurn(s, turn({ suggestion: { kind: 'next_tool', tool: 'five_whys', reason: 'r' } })).value.suggestion, null);
});
```

Also add:
- **Coach** (`problem-solver-coach.test.js`): `createModelCoach(fakeModel)` on a Lightning run sends the Lightning prompt (`system[0]` starts "You are the Problem Solver coach in Lightning mode"). A reply answering the wrong box gets one repair whose prompt contains "Answer the current box".
- **Full prompt** (`problem-solver-prompts.test.js`):
  - a framing session with `frameSeeds: { goal: 'Catch the 8.05 every weekday', whatIsTrue: 'Tried draw a diagram: not solved.', tried: [{ node: 'diagram', label: 'Draw a diagram', note: null, outcome: 'not solved', round: 1 }] }` has `CARRIED FROM LIGHTNING` with both seeds in `user`, and `TRIED IN LIGHTNING: Draw a diagram: not solved` naming `causal_map`;
  - once past frame, the CARRIED line is gone and the TRIED line stays.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement**

```js
// netlify/functions/_shared/problem-solver/lightning-prompts.mjs
// The Lightning coach's smaller prompt: the flowchart, each strategy's intent, the four
// questions, when to offer the full process, and the same voice. Our words throughout.
import { currentEntry, isQuestion, LIGHTNING_NODES, passes, strategiesTried } from '../../../../packages/problem-solver/lightning.mjs';

/** What each box asks of the coach, in our words. */
export const LIGHTNING_INTENTS = Object.freeze({
  start: 'Ask whether this really needs solving, or whether they could accept or work around things as they are.',
  goal: 'Ask what result they want, in one short line. Record it as the note.',
  subtract: 'Ask whether removing something (a step, a habit, an item, a commitment) could solve it before adding anything.',
  one_step: 'Ask whether one small action could solve it.',
  via_negativa: 'Apply it: name one thing to stop, drop or remove that could solve this snag, in one or two sentences.',
  guess_check: 'Apply it: suggest one quick guess to try now, and how they will know if it worked.',
  diagram: 'Apply it: suggest a quick sketch of the snag (what leads to what, or where things sit) to show what was missed.',
  solved_1: 'Ask whether it is solved now.',
  work_backwards: 'Apply it: start from the result they want and trace the steps back to now.',
  solved_2: 'Ask whether it is solved now.',
  make_list: 'Apply it: list two or three options not yet tried and ask them to work through the first.',
  solved_3: 'Ask whether it is solved now.',
  take_break: 'Apply it: suggest stepping away for a while and coming back fresh; ask them to tell you when they are back.',
  solved_4: 'Ask whether it is solved now.',
  analogy: 'Apply it: name a similar problem that has been solved, or someone who has solved one, and what to borrow.',
  solved_5: 'Ask whether it is solved now.',
  reframing: 'Ask whether the constraints, the problem itself or the resources could change. Yes goes back to defining the goal.',
  cannot: 'Say kindly that it cannot be solved as things stand; suggest putting it down, trying another problem or taking a walk.',
  relax: 'It is solved or accepted: say so in a line.',
  learn: 'Ask what they can learn from the snag and from trying to solve it. Record the answer as the note.',
  next: 'Ask what they will do to stop it happening again, or to be ready if it does. Record the answer as the note.'
});

export const LIGHTNING_RUBRIC = `You are the Problem Solver coach in Lightning mode: a quick route through an everyday snag. Warm, direct and brief; never flattering.

VOICE
- Every message is between 15 and 50 words. Ask at most one question, and end with it.
- Plain words. No lists, headings or markdown.

HOW IT WORKS
- The run follows a flowchart one box at a time. The state names the CURRENT BOX and what to do there.
- When the person's latest reply answers the current box, put it in "lightning": {"node": <the current box id>, "answer": "yes"|"no" for a yes/no box, "note": what they said or tried, in a short line}. Then, in the same message, do what the NEXT box asks (it is given for yes and for no).
- At a strategy box, apply the strategy to their snag in one or two sentences, then ask whether it worked. When they reply, answer the strategy box with "answer" set to whether it worked: yes means solved.
- If the reply does not answer the current box, set "lightning" to null and ask again more simply.
- The four questions frame the run: Can I fix this? What can I do? What can I learn? What next?

THE FULL PROCESS
Offer it with a suggestion {"kind":"escalate","reason":"..."} (one sentence) when any of these hold: several people or stakeholders are involved; the problem keeps recurring (a second round is a strong sign); the stakes are high; three or more strategies have failed. Offer it once; never insist.

OUTPUT
Reply with one JSON object and nothing else:
{"verdict":"clarify","message":"...","lightning":{"node":"...","answer":"yes|no","note":"..."}|null,"suggestion":{"kind":"escalate","reason":"..."}|null,"skillsSeen":["..."],"skillsMissing":[],"summary":null}`;

const yesNo = (def) => `yes -> ${def.yes} (${LIGHTNING_INTENTS[def.yes]}); no -> ${def.no} (${LIGHTNING_INTENTS[def.no]})`;

/** @returns {{ system: string[], user: string }} */
export function buildLightningPrompt(session) {
  const state = session.lightning;
  const current = currentEntry(state);
  const parts = [`SNAG: ${session.title}`, `ROUND: ${state.rounds}${state.rounds > 1 ? ' (it came back, so think about the full process)' : ''}`];
  if (current) {
    const def = LIGHTNING_NODES[current.node];
    parts.push(`CURRENT BOX: ${current.node} (${def.kind}): ${def.label}. ${LIGHTNING_INTENTS[current.node]}`);
    if (isQuestion(current.node)) parts.push(`NEXT: ${yesNo(def)}`);
    else if (def.kind === 'strategy' && isQuestion(def.next)) parts.push(`NEXT: after it is tried, ${yesNo(LIGHTNING_NODES[def.next])}`);
    else if (def.next) parts.push(`NEXT: ${def.next} (${LIGHTNING_INTENTS[def.next]})`);
    else parts.push('NEXT: the run finishes; close warmly in a line.');
  } else parts.push('The run is finished. Answer briefly; do not set "lightning".');
  const tried = strategiesTried(state);
  if (tried.length) parts.push(`TRIED SO FAR: ${tried.map((t) => `${t.label}${t.note ? ` (${t.note})` : ''}: ${t.outcome ?? 'pending'}`).join('; ')}`);
  if (passes(state) > 1) parts.push(`REFRAMED: the goal has been defined ${passes(state)} times this round.`);
  const goal = state.path.filter((e) => e.node === 'goal' && e.note).at(-1)?.note;
  if (goal) parts.push(`GOAL: ${goal}`);
  parts.push(`RECENT CONVERSATION:\n${session.turns.slice(-10).map((t) => `${t.role === 'user' ? 'PERSON' : 'COACH'}: ${t.text}`).join('\n')}`);
  return { system: [LIGHTNING_RUBRIC], user: parts.join('\n\n') };
}

/** The coach's reply checked against the run: the step must answer the current box, with yes/no where it asks. */
export function checkLightningTurn(session, value) {
  const current = currentEntry(session.lightning);
  const step = value.lightning;
  const suggestion = value.suggestion?.kind === 'escalate' && !session.lightning.escalatedTo ? value.suggestion : null;
  if (!step) return { ok: true, value: { ...value, suggestion } };
  if (!current) return { ok: true, value: { ...value, lightning: null, suggestion: null } };
  if (step.node !== current.node) return { ok: false, error: `Answer the current box (${current.node}), or set lightning to null.` };
  if (isQuestion(current.node) && !step.answer) return { ok: false, error: `${current.node} is a yes/no box: set lightning.answer to yes or no.` };
  return { ok: true, value: { ...value, suggestion } };
}
```

In `coach.mjs`, route by kind inside `createModelCoach`:

```js
function parseLightning(session, text) {
  const result = validateCoachTurn(extractJson(text));
  return result.ok ? checkLightningTurn(session, result.value) : result;
}
```

and in `modelCoach`: `const lightning = session.kind === 'lightning'; const prompt = lightning ? buildLightningPrompt(session) : buildCoachPrompt(session); const read = lightning ? parseLightning : parse;`. Use `read` for both the first try and the repair. Keep the word limit and the rewrite as they are.

In `prompts.mjs`, add `lightningLines(session)`, pushed straight after the MODEL line:

```js
const FULL_TOOLS = 'Draw a diagram -> causal_map or concept_map; Find an analogy -> analogical_reasoning; reframing -> perspective_shift; Make a list -> lotus_blossom';

function lightningLines(session) {
  const seeds = session.frameSeeds;
  if (!seeds) return [];
  const lines = [];
  if (session.phase === 'frame') lines.push(`CARRIED FROM LIGHTNING (seeds, not answers: show them, ask the person to confirm or change each, and record only what they confirm in "frame"): goal: ${seeds.goal ?? 'not defined'}; what is true: ${seeds.whatIsTrue ?? 'nothing tried yet'}.`);
  if (seeds.tried?.length) lines.push(`TRIED IN LIGHTNING: ${seeds.tried.map((t) => `${t.label}: ${t.outcome ?? 'no result'}`).join('; ')}. Their full tools: ${FULL_TOOLS}. When a strategy that did not work has a full tool in the current step, say so when you suggest a tool.`);
  return lines;
}
```

- [ ] **Step 4: Run** the three test files and all root Problem Solver tests. Expect PASS.

- [ ] **Step 5: Commit**: `Problem Solver: the Lightning coach; seeds carried into the full process` (with trailer).

---

### Task 5: Scripted coach for Lightning

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/scripted-coach.mjs`
- Test: `tests/unit/problem-solver-scripted.test.js`

The scripted coach is deterministic, for local dev, the mock API and the walk. On a Lightning run (`session.kind === 'lightning'`) it does the following:
- **Opening:** with no reply yet, or straight after "It came back.", it asks the current box's label.
- **Replies:** a reply starting `yes` or `no` (case-insensitive, optionally followed by a comma and words) answers a yes/no box, or a strategy box with whether it worked. The words after it become the note.
- **Other boxes:** at `goal`, `learn`, `next` and `cannot`, any reply of three words or more is the note. Shorter replies get a clarify ("Say a little more about that.").
- **Unclear yes/no:** a yes/no box with an unclear reply gets `lightning: null` and the box's label again.
- **Escalate:** the reply `escalate` gives `suggestion: { kind: 'escalate', reason: 'Named as needing the full process.' }` with `lightning: null`.
- **Messages:** work out the next box by applying the step to a copy of the state (`applyStep` from `lightning.mjs`). Then say `Next: <label>.`, plus the strategy name for a strategy box, or "That run is done." once finished.
- **Finished run:** a turn on a finished run is a one-line clarify.

- [ ] **Step 1: Failing tests** for each rule above. The core one: walk a run to Relax with `no`, a goal line, `no`, `no`, `no, sketched it`, `yes`, a learn line and a next line, and check the run ends finished.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run** the scripted tests and all root Problem Solver tests. Commit: `Problem Solver: scripted coach walks Lightning` (with trailer).

---

### Task 6: The Lightning chart (`render/lightning.ts`, `createLightningView`, prefix `ps-ltn`, container `ltn`) — FULL REVIEW

**Book:** pp.158–159 (`lightning-chart.png`). Look at it closely, with the picture notes at the top of this plan.

**Contract:** this chart draws a run, not a tool run.
- **Interface:** `createLightningView(doc, opts?: { onAnswer?(node: PsLightningNodeId, answer: 'yes' | 'no'): void }): { el, update(state: PsLightningState): void, destroy(): void }`.
- **Otherwise:** the v1 renderer contract and the Plan 5 addendum apply: an idempotent update, stable identity, a text outline, `role` on named containers, nothing animating on first paint or a no-op, and reduced motion respected.

**Composition (ink and paper only: `--ps-ink`, `--ps-paper`; no colour):**
- **Stage:** a fixed stage of about 1000×600 units laid out like the spread, left page then right page. Write positions as a `LAYOUT` table in the renderer: `{ x, y, w, h }` per node, plus the three Relax spots (`relax_start`, `relax_middle`, `relax_bottom`).
  - **Left page:**
    - Start at the top left, with Relax (first spot) under it.
    - Define the goal in the middle left.
    - Subtract and One step across the lower middle, with Via negativa and Guess and check under them.
    - Reframing and Cannot in the upper middle.
  - **Right page:**
    - Draw a diagram, with the first "solved?" under it and Relax (bottom spot) under that.
    - The "solved?" boxes and strategies in the book's places: Work backwards, Make a list and Take a break up the right column; Analogy and its "solved?" in the middle; Relax (middle spot).
  - **Close boxes:** What can I learn? and What next? sit in a row along the bottom of the left page, below the strategies, as the added closing boxes. Thin ink arrows run to them from each Relax spot and from Cannot.
- **Node styles:**
  - checks: black rounded boxes with paper text;
  - choices and strategies: paper rounded boxes with a 1.5px ink outline;
  - Relax: a black circle with paper text;
  - close boxes: paper with a double ink outline.
- **Labels:** box labels are `LIGHTNING_NODES[id].label`; strategy boxes show their name in bold.
- **Edges:** orthogonal SVG paths with arrowheads, following the book's routes. Yes and No sit in small paper circles with an ink ring on the arrow.

**States:**
- `data-state="ghost"` on every node and edge to start, at about 0.18 opacity.
- A node on the path is `data-state="done"`, solid ink; the current node is `data-state="current"`, with a 3px outline and `aria-current="step"`.
- An edge the path took is `data-inked="true"`. It draws in along its length (stroke-dashoffset, 360ms) only when it newly inks.
- **Relax:** the spot inked is chosen by the entry before it: `start` gives the first spot, `solved_1` the bottom spot, any other "solved?" the middle spot.
- **Rounds:** entries from earlier rounds are `data-round="old"` at 0.5 opacity; the current round is full ink.
- **Loop:** when `passes(state) > 1`, a small badge `×N` sits on the reframing → goal arrow.

**Answer buttons:** when the current node is a yes/no box and `onAnswer` is given, two buttons "Yes" and "No" (at least 44px) sit beside it. They call `onAnswer(node, answer)` once each and disable until the next update. Without `onAnswer` (the read-only panel), there are no buttons.

**Outline:** a visually hidden `ol` (`role="list"`, label "Lightning path") with one item per entry: label, answer and note.

**Phone (390):**
- The stage keeps its size (text ≥12px) inside a horizontally scrolling container. That container scrolls; the page does not overflow.
- On each update that moves the current node, the current node scrolls into view (`scrollIntoView({ block: 'nearest', inline: 'center' })`, instant under reduced motion and on first paint).

**Tests (on top of the baseline):**
- Every node id has one `[data-lnode]` (Relax three), all ghost, with no state.
- After `start: no` and `goal`, those two are done and `subtract` is current. The edge `[data-edge="start>goal"]` is inked; `[data-edge="start>relax"]` is not.
- Answer buttons call `onAnswer('start', 'no')`, and are absent without `onAnswer` or at a strategy.
- Relax from `start` inks `relax_start`; from `solved_1` inks `relax_bottom`; from `solved_3` inks `relax_middle`.
- A reframing loop shows `×2`.
- After "It came back", round 1 entries are `data-round="old"`.
- A no-op update starts no animation.
- `destroy` cancels running animations.

**Preview:** add a `lightning` entry to the preview harness. It takes a state, not a run, so adapt the registry for this one entry, keeping the tools' entries unchanged. Add three invented samples:
- a run to Relax by the second strategy;
- a reframing loop;
- a second round.

`--audit` must be clean at 900 and 390.

- [ ] Steps: failing tests → implement → run the render tests, the type gate and the audit → look at the PNGs beside the book → commit `Problem Solver: the Lightning chart` (with trailer).

---

### Task 7: The landing card, list rows and the glyph

**Files:**
- Create: `packages/problem-solver/glyphs/lightning.svg`
- Modify: `packages/problem-solver/glyphs.ts`, `apps/tasks/src/views/problem-solver/view.ts`, `api.ts`, `packages/problem-solver/problem-solver.css`
- Test: `apps/tasks/tests/unit/problem-solver-view.test.ts`, `apps/tasks/tests/unit/problem-solver-api.test.ts`

- [ ] **Step 1: Failing tests**
  - **API:** `problemSolverApi.create({ text, kind: 'lightning' })` posts `create.kind = 'lightning'`.
  - **Landing:**
    - The landing page has `section.ps-lightning-card` beside the start form, in the hero copy, after `.ps-start`.
    - It holds the lightning glyph, the heading "Lightning", the line "A quick route for everyday snags.", a text input labelled "Describe the snag" and a "Go" button.
    - Submitting an empty box focuses it. Submitting text creates a Lightning run and navigates to `#/problem-solver?id=<id>`.
  - **List rows:**
    - A summary row with `kind: 'lightning'` renders the lightning glyph instead of the problem medal.
    - The phase label reads "Lightning", "Done" (finished) or "Went to full process" (`escalatedTo` set).
- [ ] **Step 2: Implement.**
  - **Glyph:** 24×24 viewBox, ink only (`currentColor`), a simple zig-zag bolt. Export it as `lightningGlyph()` from `glyphs.ts`.
  - **Card:** paper background, a 2px ink border, ink text. No colour, because it is the black-and-white mode. At 390px it stacks under the start form at full width; it must fit with no overflow.
- [ ] **Step 3: Run** the view and API tests and the type gate. Commit `Problem Solver: Lightning on the landing page` (with trailer).

---

### Task 8: The Lightning run page and the escalation flow (FULL REVIEW)

**Files:**
- Create: `apps/tasks/src/views/problem-solver/lightning-view.ts`
- Modify: `apps/tasks/src/views/problem-solver/view.ts`, `coach-panel.ts`, `packages/problem-solver/problem-solver.css`
- Test: `apps/tasks/tests/unit/problem-solver-lightning-view.test.ts`, `apps/tasks/tests/unit/problem-solver-coach-panel.test.ts`

- [ ] **Step 1: Failing tests**

**Routing:** `renderSession` sends a `kind: 'lightning'` session to `renderLightningSession(canvas, session)`, which keeps the same poll, sync and cleanup as a full session (reuse `createSessionSync`).

**The page holds:**
1. A back link "← Problems" and the title.
2. **The question strip:** `ol.ps-ltn-strip` with the four `LIGHTNING_QUESTIONS`, each `li[data-question]`. A question is `data-lit="true"` once any entry in the current round has reached it (`questionOf`). The one holding the current node is `aria-current="step"`.
3. **The chart:** `createLightningView` with `onAnswer`. An answer goes through `sync.confirmed('lightning_answer', { node, answer })`, then `settle()`. A conflict refetches (the sync already does).
4. **The coach panel:**
   - `mountCoachPanel` with the composer. It shows no step controls for a Lightning run: no Move on and no step label. Gate these on `session.kind`.
   - **The escalate card:** for `suggestion.kind === 'escalate'`, the title is "This needs the full process", with the reason and the buttons "Start the full process" and "Not now".
   - **Start:** posts `confirmed('escalate', {})`, then navigates to `#/problem-solver?id=<lightning.escalatedTo>`.
   - **Not now:** posts `dismiss_suggestion`.
5. **When finished and not escalated:** a "That run is done" line and an "It came back" button. The button posts `confirmed('lightning_again', {})`, then `settle()`.
6. **When escalated:** a `[role="status"]` banner "This went to the full process." with a link to the full session.

**The "From Lightning" panel:** a full session with `escalatedFrom` shows a `details.ps-ltn-from` under the canvas.
- Its summary reads "From Lightning: the quick route tried first".
- Opened, it fetches the run (`problemSolverApi.get`) once and shows its chart read-only (no `onAnswer`), with a link to the run.
- A failed fetch shows "Could not load the Lightning run." and a retry button.

**Tests:** each item above, with the API, the sync and the chart mocked as the existing view tests do.

- [ ] **Step 2: Implement.**
- [ ] **CSS:** a `/* Lightning page */` section. Ink and paper only. The strip runs in one row on desktop and as a 2×2 grid at 390px. Buttons are at least 44px. No horizontal page overflow at 390px.
- [ ] **Step 3: Run** the two test files, all Tasks Problem Solver tests and the type gate. Commit `Problem Solver: the Lightning run page and escalation` (with trailer).

---

### Task 9: Browser walks through Lightning

**Files:**
- Modify: `apps/tasks/tests/browser/problem-solver.spec.mjs`

Add a `describe('Lightning')` with two walks. Each runs at desktop and 390px, with no horizontal overflow at each stage and screenshots when `PS_SHOT_DIR` is set.

1. **To Relax and round two:**
   - From the landing page, type a snag in the Lightning card and press Go.
   - Expect the strip with "Can I fix this?" current, and the chart's Start current.
   - Click the chart's "No". Expect "Define the goal" current. Answer it with a goal line.
   - Answer:
     - `no` (subtract);
     - `no` (one step);
     - `no, sketched how the jam happens` (the diagram did not solve it);
     - `yes, working backwards found it` (work backwards solved it).
   - Expect the bottom path inked and the middle Relax spot inked. Answer the learn and next questions.
   - Expect "That run is done" and "It came back". Click it, and expect Start current again with the earlier path faded.
2. **Escalation:**
   - Start a new Lightning run. Answer `no` and a goal line, then send `escalate`.
   - Expect the card "This needs the full process". Click "Start the full process".
   - Expect a full session page whose first coach message comes from the scripted coach in frame, and whose page shows `details.ps-ltn-from`. Open it and expect the chart, read-only.
   - Return to the Problems list and expect the Lightning row labelled "Went to full process".

Run with the throwaway config at `$PS_SCRATCH/ps-playwright.config.mjs` (use system Chrome). Do not commit it. Commit `Problem Solver: walks through Lightning` (with trailer).

---

### Task 10: Gate

- [ ] Run all root Problem Solver tests, all Tasks Problem Solver tests, the type gate, both Lightning walks and Plan 7's walk at both widths.
- [ ] Render the Lightning samples at 900 and 390 with `--audit`, and look at them beside `lightning-chart.png`.
- [ ] Public-repo checks over the diff:
  - no `.ps-book` path;
  - none of the book's box wording: compare `LIGHTNING_NODES` labels and `LIGHTNING_INTENTS` with the picture;
  - no real names.
- [ ] Commit any fixes: `Problem Solver: Lightning polish`. Do not push; Plan 9 continues on this branch.

---

## Hooks the later plans need

- **Plan 9 (final pass):**
  - **Filmstrips:** a full session escalated from Lightning shows the Lightning chart as the first frame of its record's filmstrip, before Frame.
  - **Live evaluation:** include one invented Lightning snag that should escalate (several people involved, a second round), and one that should stay quick and end at Relax. The coach must offer the full process for the first and not for the second.
  - **The skipped-step gap:** after a step is skipped untouched, the next step's tool suggestion only appears once the person replies. Plan 9 should make the boundary turn's follow-up give the opening suggestion straight away.

## Decisions (Adam, 20 October 2026)

1. **Where Lightning lives. Decided: its own card beside New problem.**
   - A black-and-white card next to the New problem form (stacked under it on a phone), with its own one-line box and a Go button.
   - Lightning runs appear in the Problems list with the lightning glyph instead of the badge.
2. **What carries into the full process. Decided: seeds the coach confirms.**
   - The full session opens in Frame with the goal and "what is true" (the strategies tried and how each went) as seeds, not answers. The coach's first turn shows both and asks the person to confirm or change each, then asks the third question.
   - The Lightning chart shows on the full session's page, and the two are linked.
3. **Reopening a finished run. Decided: "It came back" adds a round.**
   - A finished run offers "It came back", which starts a new round from Start on the same run.
   - The earlier round stays inked, faded a step, and the coach knows what was tried before. A second round is a strong reason to offer the full process.
4. **The final build items. Decided: a short Plan 9 on the same branch, then one PR.** The remaining items are filmstrips for every step, the Final-words pass with the live evaluation, the Playwright walks and the skipped-step gap.

Choices this plan makes inside those answers (change them here if Adam disagrees):
- **Three Relax circles:** the chart draws Relax where the book does (three places), and the path inks the one it reached.
- **One reply can say what was tried and whether it worked:** a strategy box takes the "solved?" answer with it, so the person is not asked twice.
- **Escalating ends the run:** an escalated run is finished and cannot take another round; the full session carries on from it.
- **Lightning runs share the store** with full problems (kind `'lightning'`) rather than a separate one, so listing, links and the poll all work unchanged.

## Done when

- The Lightning card on the landing page starts a run.
- The coach walks the flowchart one box at a time:
  - asking at yes/no boxes;
  - applying strategies to the snag;
  - recording the goal, what was tried and the two closing answers.
- The person can answer yes/no boxes on the chart.
- The chart shows the whole flowchart faint and the path in ink. The current box is marked, Relax inks where it was reached, and loops and rounds are visible. It works at 390px and passes `--audit`.
- The coach offers the full process when the criteria hold. Accepting it creates one full session seeded from the run, which the coach confirms in Frame, and shows the run's chart on the full session's page.
- "It came back" starts a new round on a finished run.
- The scripted coach and the browser walks cover a run to Relax, a second round and an escalation, at both widths.
- All gates pass.
