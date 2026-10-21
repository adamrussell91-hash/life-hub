# Decision Maker Plan 7: Quick Decision and Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 1–6 run in order; each leaves its tests green. Task 7 merges `main`, runs the gate and opens the one PR for the whole build.

**Goal:** Decision Maker gets its quick route, its checks and its PR. After this plan:
- **Quick decision:** a short route for everyday calls, from the landing page's card.
  - **The Yes/No rule:** the coach helps set three tests, each answerable yes or no, before any is answered. Then they are asked in order; any no means do not proceed.
  - **The Stop Rule:** on three yeses, one trigger and the action it forces, agreed now.
  - **A dated check**, if wanted: a card offers a Tasks task due on that date.
  - **The close:** "What did I learn?" and "What next?".
  - **The chart:** the Yes/No flow in Decision Book style, with your path inked and the Stop Rule as an if/then band underneath. The test being asked can be answered on the chart.
  - **It came back** adds a round at the tests.
  - **Go deeper** makes a full decision seeded with the decision, the tests with their answers and any Stop Rule. The coach confirms each seed, and the full decision shows the quick run's chart.
- **The light source check** of the five models with a fixed published structure, as a test; Belbin's roles use their source names.
- **The live coach evaluation:** eleven invented cases and a runner with a stub mode. The live run costs money and waits for Adam's go.
- **Playwright walks** at desktop and 390px: the landing page, a whole decision, a quick decision and Go deeper.
- **The PR:** `main` merged in, generated files rerun, `npm run pre-pr-check` passed, then the PR opened ready with auto-merge (merge commit).

**Architecture:** the quick route is built the way Problem Solver's Lightning is.
- **Data:** a flow as data (`packages/decision-book/quick.mjs`).
- **Server:** a session kind (`quick`) on `/api/decision-book` with its own small coach prompt, and a page (`views/decision-book/quick-view.ts`).
- **Shared engine:** Lightning and the quick route become two *flows* in the service, one table saying how each is created, takes a coach turn and escalates. Problem Solver's behaviour and tests are unchanged.

**Tech Stack:** plain ES modules on the server (Netlify functions, node:test), TypeScript in the Tasks hub (Vite, vitest with happy-dom), Playwright 1.54 for the walks.

**Spec:** `docs/superpowers/specs/2026-10-21-decision-book-design.md` ("Experience: Quick decision", "Sources", "Testing", "Build order" 10–11).
**Plans 1–6:** done (Plan 6 HEAD `54e9947fc`).
**Branch and worktree:** `claude/decision-book` in `/Users/adamrussell/Projects/life-hub-decision-book`. Run every command from that worktree's root unless a step says otherwise. Run `npm ci` at the root and in `apps/tasks` first if `node_modules` is missing.

**How this plan was made:** every file below was drafted in the worktree and its tests run green:
- **Unit suite:** 5,739 tests (5,728 pass, 11 skipped), 29 of them new.
- **Tasks vitest:** all 251 files and 2,641 tests, including 10 new ones in `decision-book-quick.test.ts`. Two slow, timing-sensitive files (`grove-annual-roaming`, `problem-solver-lightning-view`) can fail under load in a full run; both pass alone and on a rerun.
- **Type-check:** the Tasks tsc showed no errors in these paths.
- **Playwright:** `decision-maker.spec.mjs` 8 passed, and Problem Solver's Lightning walks 4 passed. The quick pages were also checked by screenshot at both widths.
- **Stub evaluation:** `DM_EVAL_STUB=1 node scripts/decision-book-eval.mjs` ran every case (the live run was not made).
- **Merge:** a dry run (`git merge-tree`) of `origin/main`, 44 commits ahead, merged with no conflicts. `main` changed Teaching's blocks, so Task 7 reruns the block CSS generator.

The drafts were then removed, after a check that this plan rebuilds every file byte for byte from a clean tree. New files are given in full. Changed files are given as patches: apply them with `git apply`, then check with `git diff`.

**Rules kept:**
- **Public repo:** no book sentences and no real names. Every decision in the tests, walks and evaluation is invented, and every line of copy is our own. The suggested tests are close to the book's three, in our words.
- **Problem Solver is unchanged for its own users:**
  - its tests pass unchanged;
  - the coach panel's escalate card keeps its words unless a look gives others;
  - the schema adds `quick` to a reply only when the coach sends one.
- **Flat design:** paper, ink, red and green; hairline borders, no shadows; no text under 11px (the CSS test checks the new rules).

**Design notes:**
- **The tests are set together.** The book's rule is to fix the three tests before answering any, so the flow has one `tests` box that takes all three, and the tests cannot change once a round is under way. A new round (It came back) sets them again; the prompt offers last round's.
- **Proceed and Do not proceed are passed straight through**, as Lightning's Relax is, so a single reply can answer the third test and open the Stop Rule.
- **The check task is made by the page, not the server**, by Problem Solver's rule that the server never writes Tasks. The task is created first, then linked with `quick_check`; a retry reuses the created task.
- **A full decision keeps the quick run as seeds, not answers.** `frameSeeds` (`from: 'quick'`) carries the decision and a `known` line. The coach shows them while framing and records only what the person confirms, as Lightning's seeds work in Problem Solver.
- **Go deeper is on the page as well as on the coach's card.** The coach offers it once, when the call looks too big; the person can choose it at any time.

---

### Task 1: Quick decision as data
**Files:**
- Create: `packages/decision-book/quick.mjs`
- Create: `tests/unit/decision-book-quick.test.js`
- Modify: `packages/problem-solver/types.ts`

`quick.mjs` holds the flow and its pure transitions, as `lightning.mjs` does for Lightning. A run's state is a path of entries; the last entry is the box waiting for an answer.
- **Boxes:** `decision` (filled from the opening message), `tests` (the three tests, set together), `test_one` to `test_three` (yes/no; any no goes to `stop`), `proceed` and `stop` (passed straight through), `trigger` and `action` (the Stop Rule, words required), `check` (a date, or no), then `learn` and `next`.
- **It came back** starts a new round at the tests, with the same decision.
- **`quickSeeds`** is what a full decision starts from: the decision, the tests with their answers, and any Stop Rule, joined into a `known` line.
- **Types:** `DmQuickState` and friends; a session's `kind` gains `quick`, its `quick` state and `DmQuickSeeds` frame seeds; a list row gains `outcome`; three new actions.

- [ ] **Step 1: Create the flow**

**Create `packages/decision-book/quick.mjs`:**

````js
// packages/decision-book/quick.mjs
// Quick decision as data: the Yes/No rule (three tests set before any is answered; any no means
// do not proceed), then on three yeses the Stop Rule (a trigger and the action it forces), an
// optional check date, and two closing questions. A run's state is a path of entries, as a
// Lightning run's is: the last entry is the box waiting for an answer. Shared by the server,
// the coach prompt and the chart. Our words throughout.

const node = (kind, label, links = {}) => Object.freeze({ kind, label, ...links });

/**
 * Kinds: `note` (a line of their own words), `tests` (the three tests, set together), `test`
 * (a yes/no box), `end` (passed straight through), `check` (a date, or no) and `close`.
 */
export const QUICK_NODES = Object.freeze({
  decision: node('note', 'What are you deciding?', { next: 'tests' }),
  tests: node('tests', 'Set three yes/no tests', { next: 'test_one' }),
  test_one: node('test', 'First test', { yes: 'test_two', no: 'stop' }),
  test_two: node('test', 'Second test', { yes: 'test_three', no: 'stop' }),
  test_three: node('test', 'Third test', { yes: 'proceed', no: 'stop' }),
  proceed: node('end', 'Proceed', { next: 'trigger' }),
  stop: node('end', 'Do not proceed', { next: 'learn' }),
  trigger: node('note', 'If this happens', { next: 'action' }),
  action: node('note', 'Then I will do this', { next: 'check' }),
  check: node('check', 'When will you check how it went?', { next: 'learn' }),
  learn: node('close', 'What did I learn?', { next: 'next' }),
  next: node('close', 'What next?', { next: null })
});

export const QUICK_NODE_IDS = Object.freeze(Object.keys(QUICK_NODES));
export const TEST_IDS = Object.freeze(['test_one', 'test_two', 'test_three']);

/** Tests close to the book's, offered when the person has none of their own. */
export const SUGGESTED_TESTS = Object.freeze(['Do I want it?', 'Can I do it?', 'Is it worth it?']);

const TEXT_MAX = 600;
const TEST_MAX = 120;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const invalid = (code, message) => Object.assign(new Error(message), { code });
const clean = (value, max = TEXT_MAX) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

/** @param {string} id */
export const isTest = (id) => QUICK_NODES[id]?.kind === 'test';

/** @param {unknown} value */
export const isCheckDate = (value) => typeof value === 'string' && DATE_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/**
 * @param {string} decision the opening message, which states the decision
 * @param {string} at
 * @returns {import('../problem-solver/types').DmQuickState}
 */
export function newQuick(decision, at) {
  return {
    path: [{ node: 'decision', round: 1, at, note: clean(decision) ?? '' }, { node: 'tests', round: 1, at }],
    rounds: 1,
    finishedAt: null,
    escalatedTo: null,
    check: null
  };
}

/**
 * The entry waiting for an answer, or null once the run is finished.
 * @param {import('../problem-solver/types').DmQuickState} state
 */
export function currentEntry(state) {
  return state.finishedAt ? null : state.path.at(-1) ?? null;
}

/** The decision as first stated. */
export const decisionOf = (state) => state.path.find((entry) => entry.node === 'decision')?.note ?? '';

/**
 * The tests of a round (the latest by default), or null before they are set.
 * @returns {string[] | null}
 */
export function testsOf(state, round = state.rounds) {
  return state.path.find((entry) => entry.node === 'tests' && entry.round === round && entry.tests)?.tests ?? null;
}

/** What a test box asks: its test once set, else its label. */
export function testLabel(state, id, round = state.rounds) {
  return testsOf(state, round)?.[TEST_IDS.indexOf(id)] ?? QUICK_NODES[id].label;
}

/** A round's answers in test order: 'yes', 'no', or null for a test not reached. */
export function answersOf(state, round = state.rounds) {
  return TEST_IDS.map((id) => state.path.find((entry) => entry.node === id && entry.round === round)?.answer ?? null);
}

/**
 * How a round came out: 'proceed' on three yeses, 'stop' on any no, null while it is open.
 * @returns {'proceed' | 'stop' | null}
 */
export function outcomeOf(state, round = state.rounds) {
  const end = state.path.find((entry) => entry.round === round && (entry.node === 'proceed' || entry.node === 'stop'));
  return end ? end.node : null;
}

const latestNote = (state, id) => state.path.filter((entry) => entry.node === id && entry.note).at(-1)?.note ?? null;

/** The latest Stop Rule, or null before a trigger is set. */
export function stopRuleOf(state) {
  const trigger = latestNote(state, 'trigger');
  return trigger ? { trigger, action: latestNote(state, 'action') } : null;
}

/**
 * Answer the current box and move on. `step` is { node, answer?, note?, tests? }:
 * - the tests box needs `tests`: three questions, each answerable yes or no;
 * - a test needs `answer`; the trigger and the action need `note`;
 * - the check box takes a date (YYYY-MM-DD) as `note`, or `answer: 'no'` for no check;
 * - Proceed and Do not proceed pass straight on; answering "What next?" finishes the run.
 * Throws `stale_node` when `step.node` is not the current box, `invalid_answer` otherwise.
 * @param {import('../problem-solver/types').DmQuickState} state
 * @param {{ node: string, answer?: string, note?: string, tests?: string[] }} step
 * @param {string} at
 */
export function applyStep(state, step, at) {
  const current = currentEntry(state);
  if (!current || current.node !== step?.node) throw invalid('stale_node', 'That question has moved on.');
  const def = QUICK_NODES[current.node];
  const note = clean(step.note);
  const answer = step.answer === 'yes' || step.answer === 'no' ? step.answer : undefined;
  const round = state.rounds;
  const path = state.path.slice(0, -1);
  let check = state.check;
  let target;
  if (def.kind === 'tests') {
    const tests = Array.isArray(step.tests) ? step.tests.map((test) => clean(test, TEST_MAX)).filter(Boolean) : [];
    if (tests.length !== 3) throw invalid('invalid_answer', 'Set three tests, each answerable yes or no.');
    path.push({ ...current, tests });
    target = def.next;
  } else if (def.kind === 'test') {
    if (!answer) throw invalid('invalid_answer', `${testLabel(state, current.node)} needs a yes or no.`);
    path.push({ ...current, answer, ...(note ? { note } : {}) });
    target = def[answer];
  } else if (def.kind === 'check') {
    if (answer === 'no') path.push({ ...current, answer });
    else if (isCheckDate(note)) {
      path.push({ ...current, note });
      check = { due: note, taskId: null, dismissed: false };
    } else throw invalid('invalid_answer', 'Give the check a date (YYYY-MM-DD), or say no check.');
    target = def.next;
  } else {
    if (def.kind === 'note' && !note) throw invalid('invalid_answer', `${def.label} needs a few words.`);
    path.push({ ...current, ...(note ? { note } : {}) });
    target = def.next;
  }
  if (QUICK_NODES[target]?.kind === 'end') {
    path.push({ node: target, round, at });
    target = QUICK_NODES[target].next;
  }
  if (!target) return { ...state, path, check, finishedAt: at };
  path.push({ node: target, round, at });
  return { ...state, path, check };
}

/**
 * "It came back": a finished run starts a new round at the tests, with the same decision.
 * @param {import('../problem-solver/types').DmQuickState} state
 * @param {string} at
 */
export function again(state, at) {
  if (!state.finishedAt) throw invalid('invalid_answer', 'This run is still going.');
  const rounds = state.rounds + 1;
  return { ...state, rounds, finishedAt: null, path: [...state.path, { node: 'tests', round: rounds, at }] };
}

/**
 * What a full decision starts from when a quick run goes deeper: the decision, the tests with
 * their answers and any Stop Rule, as seeds the coach confirms with the person.
 * @param {import('../problem-solver/types').DmQuickState} state
 * @returns {import('../problem-solver/types').DmQuickSeeds}
 */
export function quickSeeds(state) {
  const tests = (testsOf(state) ?? []).map((test, i) => ({ test, answer: answersOf(state)[i] }));
  const rule = stopRuleOf(state);
  const lines = [
    tests.length ? `Yes/No tests: ${tests.map((t) => `${t.test} ${t.answer ?? 'not answered'}`).join('; ')}.` : '',
    rule ? `Stop Rule: if ${rule.trigger}, then ${rule.action ?? 'no action agreed yet'}.` : ''
  ].filter(Boolean);
  return { from: 'quick', decision: decisionOf(state), known: lines.join(' ') || null, tests, stopRule: rule };
}
````

- [ ] **Step 2: Create its tests**

**Create `tests/unit/decision-book-quick.test.js`:**

````js
// tests/unit/decision-book-quick.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUICK_NODES, SUGGESTED_TESTS, TEST_IDS, again, answersOf, applyStep, currentEntry, decisionOf, isCheckDate,
  newQuick, outcomeOf, quickSeeds, stopRuleOf, testLabel, testsOf
} from '../../packages/decision-book/quick.mjs';

const AT = '2026-10-21T09:00:00.000Z';
const walk = (state, ...steps) => steps.reduce((s, step) => applyStep(s, step, AT), state);
const nodes = (state) => state.path.map((e) => e.node);
const TESTS = { node: 'tests', tests: ['Do I want the course?', 'Can I fit it in?', 'Is it worth the fee?'] };
const yes = (node) => ({ node, answer: 'yes' });

test('the flow: every link lands on a box, and only tests branch', () => {
  for (const [id, def] of Object.entries(QUICK_NODES)) {
    for (const to of [def.next, def.yes, def.no].filter(Boolean)) assert.ok(QUICK_NODES[to], `${id} -> ${to}`);
    assert.equal(Boolean(def.yes), def.kind === 'test', id);
  }
  assert.deepEqual(TEST_IDS.map((id) => QUICK_NODES[id].no), ['stop', 'stop', 'stop']);
  assert.equal(SUGGESTED_TESTS.length, 3);
});

test('a new run holds the decision and waits for the tests', () => {
  const s = newQuick('  Take the weekend course?  ', AT);
  assert.equal(decisionOf(s), 'Take the weekend course?');
  assert.equal(currentEntry(s).node, 'tests');
  assert.equal(testsOf(s), null);
  assert.equal(testLabel(s, 'test_one'), 'First test');
});

test('the tests are set together, three of them, before any is answered', () => {
  const s = newQuick('Take the course?', AT);
  assert.throws(() => applyStep(s, { node: 'tests', tests: ['One?', 'Two?'] }, AT), { code: 'invalid_answer' });
  assert.throws(() => applyStep(s, yes('test_one'), AT), { code: 'stale_node' });
  const set = walk(s, TESTS);
  assert.deepEqual(testsOf(set), TESTS.tests);
  assert.equal(currentEntry(set).node, 'test_one');
  assert.equal(testLabel(set, 'test_two'), 'Can I fit it in?');
});

test('any no ends at Do not proceed, then the closing questions, then finishes', () => {
  let s = walk(newQuick('Take the course?', AT), TESTS, yes('test_one'), { node: 'test_two', answer: 'no', note: 'Weekends are full' });
  assert.deepEqual(nodes(s).slice(-2), ['stop', 'learn']);
  assert.equal(outcomeOf(s), 'stop');
  assert.deepEqual(answersOf(s), ['yes', 'no', null]);
  assert.throws(() => applyStep(s, { node: 'test_three', answer: 'yes' }, AT), { code: 'stale_node' });
  s = walk(s, { node: 'learn', note: 'I say yes before checking the calendar' }, { node: 'next' });
  assert.equal(s.finishedAt, AT);
  assert.equal(currentEntry(s), null);
});

test('three yeses proceed to the Stop Rule, an optional check, and the close', () => {
  let s = walk(newQuick('Take the course?', AT), TESTS, yes('test_one'), yes('test_two'), yes('test_three'));
  assert.deepEqual(nodes(s).slice(-2), ['proceed', 'trigger']);
  assert.equal(outcomeOf(s), 'proceed');
  assert.throws(() => applyStep(s, { node: 'trigger' }, AT), { code: 'invalid_answer' }, 'a trigger needs words');
  s = walk(s, { node: 'trigger', note: 'I miss two sessions' }, { node: 'action', note: 'Ask for a transfer to the spring run' });
  assert.deepEqual(stopRuleOf(s), { trigger: 'I miss two sessions', action: 'Ask for a transfer to the spring run' });
  assert.throws(() => applyStep(s, { node: 'check', note: 'next week' }, AT), { code: 'invalid_answer' });
  s = walk(s, { node: 'check', note: '2027-01-21' });
  assert.deepEqual(s.check, { due: '2027-01-21', taskId: null, dismissed: false });
  assert.equal(currentEntry(s).node, 'learn');
});

test('no check leaves the check unset', () => {
  const s = walk(newQuick('Take the course?', AT), TESTS, yes('test_one'), yes('test_two'), yes('test_three'),
    { node: 'trigger', note: 'I miss two sessions' }, { node: 'action', note: 'Transfer' }, { node: 'check', answer: 'no' });
  assert.equal(s.check, null);
  assert.equal(currentEntry(s).node, 'learn');
});

test('check dates are real dates', () => {
  assert.equal(isCheckDate('2027-01-21'), true);
  assert.equal(isCheckDate('2027-13-40'), false);
  assert.equal(isCheckDate('21/01/2027'), false);
});

test('It came back starts a new round at the tests, keeping the first round on the path', () => {
  const done = walk(newQuick('Take the course?', AT), TESTS, { node: 'test_one', answer: 'no' }, { node: 'learn' }, { node: 'next' });
  assert.throws(() => again(newQuick('x', AT), AT), { code: 'invalid_answer' });
  const s = again(done, AT);
  assert.equal(s.rounds, 2);
  assert.equal(s.finishedAt, null);
  assert.equal(currentEntry(s).node, 'tests');
  assert.equal(testsOf(s), null);
  assert.deepEqual(testsOf(s, 1), TESTS.tests);
  assert.equal(outcomeOf(s, 1), 'stop');
  assert.equal(outcomeOf(s), null);
});

test('going deeper seeds the decision, the tests with their answers and the Stop Rule', () => {
  const s = walk(newQuick('Take the course?', AT), TESTS, yes('test_one'), yes('test_two'), yes('test_three'),
    { node: 'trigger', note: 'I miss two sessions' });
  assert.deepEqual(quickSeeds(s), {
    from: 'quick',
    decision: 'Take the course?',
    known: 'Yes/No tests: Do I want the course? yes; Can I fit it in? yes; Is it worth the fee? yes. Stop Rule: if I miss two sessions, then no action agreed yet.',
    tests: TESTS.tests.map((test) => ({ test, answer: 'yes' })),
    stopRule: { trigger: 'I miss two sessions', action: null }
  });
  assert.equal(quickSeeds(newQuick('Take the course?', AT)).known, null);
});
````

- [ ] **Step 3: Apply the types patch**

````diff
diff --git a/packages/problem-solver/types.ts b/packages/problem-solver/types.ts
index cac49f3f3..024ab58f4 100644
--- a/packages/problem-solver/types.ts
+++ b/packages/problem-solver/types.ts
@@ -39,6 +39,14 @@ export type PsLightningState = { path: PsLightningEntry[]; rounds: number; finis
 export type PsLightningTried = { node: PsLightningNodeId; label: string; note: string | null; outcome: 'solved' | 'not solved' | null; round: number };
 /** What an escalated full session starts from; seeds, not answers, until the coach confirms them. */
 export type PsFrameSeeds = { goal: string | null; whatIsTrue: string | null; tried: PsLightningTried[] };
+/** Decision Maker's quick route (packages/decision-book/quick.mjs). */
+export type DmQuickNodeId = 'decision' | 'tests' | 'test_one' | 'test_two' | 'test_three' | 'proceed' | 'stop' | 'trigger' | 'action' | 'check' | 'learn' | 'next';
+export type DmQuickEntry = { node: DmQuickNodeId; round: number; at: string; answer?: 'yes' | 'no'; note?: string; tests?: string[] };
+/** The check date, and the task made for it (or set aside with Not now). */
+export type DmQuickCheck = { due: string; taskId: string | null; dismissed: boolean };
+export type DmQuickState = { path: DmQuickEntry[]; rounds: number; finishedAt: string | null; escalatedTo: string | null; check: DmQuickCheck | null };
+/** What a full decision starts from when a quick run goes deeper; seeds, not answers. */
+export type DmQuickSeeds = { from: 'quick'; decision: string; known: string | null; tests: { test: string; answer: 'yes' | 'no' | null }[]; stopRule: { trigger: string; action: string | null } | null };
 
 /** A confirmed task's live state, passed from the page to a chart (never stored). */
 export type PsTaskLink = { nodeId: string; taskId: string; status: string };
@@ -47,7 +55,7 @@ export type PsSession = {
   id: string;
   title: string;
   revision: number;
-  kind: 'full' | 'lightning' | 'decision';
+  kind: 'full' | 'lightning' | 'decision' | 'quick';
   status: 'active' | 'finished' | 'archived';
   /** 'frame', a plan step id from steps.mjs, or 'finished'. */
   phase: string;
@@ -78,17 +86,19 @@ export type PsSession = {
   /** The key of a case-file offer set aside with Not now. */
   caseFileDeclined: string | null;
   lightning: PsLightningState | null;
+  /** Decision Maker: a quick decision's run. */
+  quick?: DmQuickState | null;
   escalatedFrom: string | null;
-  frameSeeds: PsFrameSeeds | null;
+  frameSeeds: PsFrameSeeds | DmQuickSeeds | null;
   taskSnapshot: PsTaskSnapshot | null;
   detour: PsDetour | null;
   createdAt: string;
   updatedAt: string;
 };
 
-export type PsSummary = Pick<PsSession, 'id' | 'title' | 'status' | 'phase' | 'links' | 'createdAt' | 'updatedAt'> & { kind?: 'full' | 'lightning' | 'decision'; escalatedTo?: string | null; model: PsModelId | null; tool: PsToolId | null; frame?: number; skills?: Record<string, number>; taskIds?: string[]; reviewTaskId?: string | null; reviewDue?: string | null; main?: string | null };
+export type PsSummary = Pick<PsSession, 'id' | 'title' | 'status' | 'phase' | 'links' | 'createdAt' | 'updatedAt'> & { kind?: 'full' | 'lightning' | 'decision' | 'quick'; escalatedTo?: string | null; outcome?: 'proceed' | 'stop' | null; model: PsModelId | null; tool: PsToolId | null; frame?: number; skills?: Record<string, number>; taskIds?: string[]; reviewTaskId?: string | null; reviewDue?: string | null; main?: string | null };
 
-export type PsAction = 'say' | 'keep_anyway' | 'accept_suggestion' | 'dismiss_suggestion' | 'move_on' | 'rename' | 'archive' | 'score' | 'rescore_radar' | 'retry' | 'confirm_task' | 'dismiss_task' | 'set_review_task' | 'dismiss_review' | 'start_review' | 'task_status' | 'link_case_file' | 'dismiss_case_file' | 'lightning_answer' | 'lightning_again' | 'escalate';
+export type PsAction = 'say' | 'keep_anyway' | 'accept_suggestion' | 'dismiss_suggestion' | 'move_on' | 'rename' | 'archive' | 'score' | 'rescore_radar' | 'retry' | 'confirm_task' | 'dismiss_task' | 'set_review_task' | 'dismiss_review' | 'start_review' | 'task_status' | 'link_case_file' | 'dismiss_case_file' | 'lightning_answer' | 'lightning_again' | 'quick_answer' | 'quick_again' | 'quick_check' | 'escalate';
 
 export type PsCaseFileTarget = { kind: 'task' | 'project'; id: string };
 /** What was written where: the section digests written, so later changes can be found. */
````

- [ ] **Step 4: Run them**

Run: `node --test tests/unit/decision-book-quick.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/decision-book/quick.mjs tests/unit/decision-book-quick.test.js packages/problem-solver/types.ts
git commit -m "Decision Maker: the quick decision flow as data

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Server: the quick session, its coach and Go deeper
**Files:**
- Create: `netlify/functions/_shared/problem-solver/quick-session.mjs`
- Create: `netlify/functions/_shared/problem-solver/quick-prompts.mjs`
- Create: `tests/unit/decision-book-quick-session.test.js`
- Modify: `apps/tasks/scripts/mock-api.ts`
- Modify: `netlify/functions/_shared/problem-solver/coach-schema.mjs`
- Modify: `netlify/functions/_shared/problem-solver/coach.mjs`
- Modify: `netlify/functions/_shared/problem-solver/decision-prompts.mjs`
- Modify: `netlify/functions/_shared/problem-solver/scripted-coach.mjs`
- Modify: `netlify/functions/_shared/problem-solver/service.mjs`
- Modify: `netlify/functions/_shared/problem-solver/session.mjs`
- Modify: `netlify/functions/decision-book.mjs`
- Modify: `netlify/functions/problem-solver.mjs`
- Modify: `tests/unit/decision-book-http.test.js`

- **`quick-session.mjs`** (shaped like `lightning-session.mjs`): create, the coach's turn, `quick_answer` (a test answered on the chart; a box that has moved on is a 409), `quick_again` (It came back), `quick_check` (the check task made, or set aside) and `escalateQuick` (Go deeper: a seeded full decision with `escalatedFrom`).
- **`quick-prompts.mjs`**: the small rubric (the tests fixed before any is answered, any no means do not proceed, when to offer a full decision), the per-turn state and the reply check.
- **Schema:** a `quick` step (`node`, `answer`, `note`, `tests`). It is added to a reply only when present, so every existing reply keeps its shape.
- **Coach:** one table of prompt and reply check per session kind.
- **Service:** Lightning and the quick route are both *flows*: one table says how each is created, how a coach turn lands and how it escalates. Problem Solver's behaviour is unchanged.
- **Decision prompt:** a decision that went deeper shows its seeds while framing (`CARRIED FROM A QUICK DECISION`), then one line on where it came from.
- **Scripted coach:** `use those` (or `tests: a? / b? / c?`), yes or no, a few words, a date or `no`, and `go deeper`.
- **Wiring:** `/api/decision-book` takes `quick` sessions; the list row has `outcome`; the handler kicks the full decision's first turn after Go deeper; the mock API serves both kinds.

- [ ] **Step 1: Create the quick session**

**Create `netlify/functions/_shared/problem-solver/quick-session.mjs`:**

````js
// netlify/functions/_shared/problem-solver/quick-session.mjs
// Quick decisions: a Decision Maker session of kind 'quick' whose state is the Yes/No flow. The
// coach walks it one box at a time; the person can also answer a test on the chart. Going deeper
// creates a full decision seeded from the run (the coach confirms each seed). Shaped like
// lightning-session.mjs.
import { again, applyStep, currentEntry, decisionOf, isTest, newQuick, quickSeeds } from '../../../../packages/decision-book/quick.mjs';
import { createSession } from './session.mjs';

const fail = (status, code, message) => Object.assign(new Error(message), { status, code });
const touch = (session, deps) => ({ ...session, updatedAt: deps.now() });
const idle = () => ({ status: 'idle', mode: 'turn', error: null });
const queue = (session) => ({ ...session, runner: { status: 'queued', mode: 'turn', error: null } });
const userTurn = (text, deps) => ({ id: deps.newId(), role: 'user', text, createdAt: deps.now() });

export function createQuickSession({ title = '', text, links = [] }, deps) {
  const base = createSession({ title, text, links }, deps);
  return { ...base, kind: 'quick', phase: 'quick', quick: newQuick(base.turns[0].text, deps.now()) };
}

const isQuick = (session) => session.kind === 'quick' && session.quick;

function finish(session, state) {
  return state.finishedAt ? { ...session, quick: state, status: 'finished', suggestion: null } : { ...session, quick: state, status: 'active' };
}

/**
 * The coach's turn on a quick run. Its `quick` step (if any) answers the current box; a step for
 * a box that has moved on, or one that does not hold, is dropped and the turn kept. An `escalate`
 * suggestion (Go deeper) is kept until the run finishes or goes deeper.
 */
export function applyQuickTurn(session, turn, deps) {
  let next = { ...session, runner: idle() };
  const coachTurn = { id: deps.newId(), role: 'coach', text: turn.message, verdict: turn.verdict, skillsSeen: turn.skillsSeen, skillsMissing: turn.skillsMissing, createdAt: deps.now() };
  if (turn.quick && next.status === 'active') {
    try {
      next = finish(next, applyStep(next.quick, turn.quick, deps.now()));
    } catch (error) {
      if (!['stale_node', 'invalid_answer'].includes(error.code)) throw error;
    }
  }
  const open = next.status === 'active' && !next.quick.escalatedTo;
  const suggestion = open && turn.suggestion?.kind === 'escalate' ? { kind: 'escalate', reason: turn.suggestion.reason ?? '' } : open && next.suggestion?.kind === 'escalate' ? next.suggestion : null;
  return touch({ ...next, turns: [...next.turns, coachTurn], suggestion, summary: turn.summary ?? next.summary }, deps);
}

/** The person answered a test on the chart. A test that has moved on is a 409 (refetch). */
export function quickAnswer(session, payload, deps) {
  if (!isQuick(session)) throw fail(409, 'action_not_allowed', 'This is not a quick decision.');
  if (session.status !== 'active') throw fail(409, 'action_not_allowed', 'This run is finished.');
  const current = currentEntry(session.quick);
  if (!current || current.node !== payload?.node) throw fail(409, 'conflict', 'That question has moved on. Reloaded the latest.');
  if (!isTest(current.node) || !['yes', 'no'].includes(payload?.answer)) throw fail(400, 'validation_error', 'Answer yes or no.');
  const state = applyStep(session.quick, { node: current.node, answer: payload.answer }, deps.now());
  const next = finish({ ...session, turns: [...session.turns, userTurn(payload.answer === 'yes' ? 'Yes.' : 'No.', deps)] }, state);
  return queue(touch(next, deps));
}

/** "It came back": a finished run that did not go deeper starts a new round at the tests. */
export function quickAgain(session, deps) {
  if (!isQuick(session)) throw fail(409, 'action_not_allowed', 'This is not a quick decision.');
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This run is archived.');
  if (session.quick.escalatedTo) throw fail(409, 'action_not_allowed', 'This run went to a full decision.');
  if (!session.quick.finishedAt) throw fail(409, 'action_not_allowed', 'This run is still going.');
  const state = again(session.quick, deps.now());
  return queue(touch({ ...session, status: 'active', quick: state, suggestion: null, turns: [...session.turns, userTurn('It came back.', deps)] }, deps));
}

/** The check card: the task made for the check date (`taskId`), or set aside (`dismissed`). */
export function quickCheck(session, payload, deps) {
  if (!isQuick(session)) throw fail(409, 'action_not_allowed', 'This is not a quick decision.');
  const check = session.quick.check;
  if (!check) throw fail(409, 'action_not_allowed', 'No check date is set.');
  if (check.taskId) throw fail(409, 'action_not_allowed', 'The check task is already made.');
  const taskId = typeof payload?.taskId === 'string' && payload.taskId.trim() ? payload.taskId.trim().slice(0, 200) : null;
  if (!taskId && payload?.dismissed !== true) throw fail(400, 'validation_error', 'A check task id, or dismissed.');
  return touch({ ...session, quick: { ...session.quick, check: taskId ? { ...check, taskId, dismissed: false } : { ...check, dismissed: true } } }, deps);
}

/**
 * Go deeper: a full decision (id `fullId`) seeded from the run, and the run marked as gone deeper
 * and finished. Returns both; the service writes the full decision first. Refused once it has
 * gone deeper (a replay with the same request id is handled by the service).
 */
export function escalateQuick(session, fullId, deps) {
  if (!isQuick(session)) throw fail(409, 'action_not_allowed', 'This is not a quick decision.');
  if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This run is archived.');
  if (session.quick.escalatedTo) throw fail(409, 'action_not_allowed', 'This run already went to a full decision.');
  const text = decisionOf(session.quick) || session.title;
  const full = { ...createSession({ title: session.title, text, links: session.links, kind: 'decision' }, deps), id: fullId, escalatedFrom: session.id, frameSeeds: quickSeeds(session.quick) };
  const at = deps.now();
  const quick = touch({
    ...session,
    status: 'finished',
    suggestion: null,
    runner: idle(),
    quick: { ...session.quick, escalatedTo: fullId, finishedAt: session.quick.finishedAt ?? at },
    turns: [...session.turns, userTurn('Go deeper.', deps)]
  }, deps);
  return { full, quick };
}
````

- [ ] **Step 2: Create the quick coach prompt**

**Create `netlify/functions/_shared/problem-solver/quick-prompts.mjs`:**

````js
// netlify/functions/_shared/problem-solver/quick-prompts.mjs
// The quick decision coach's small prompt: the Yes/No flow, what each box asks, when to offer a
// full decision, and the same voice. Shaped like lightning-prompts.mjs. Our words throughout.
import { QUICK_NODES, SUGGESTED_TESTS, TEST_IDS, answersOf, currentEntry, decisionOf, isTest, outcomeOf, stopRuleOf, testLabel, testsOf } from '../../../../packages/decision-book/quick.mjs';

/** What each box asks of the coach, in our words. */
export const QUICK_INTENTS = Object.freeze({
  decision: 'The decision is already stated.',
  tests: `Help them set three tests, each answerable yes or no, before answering any. Offer these if they have none: ${SUGGESTED_TESTS.join(' ')} Once they agree, record all three as "tests" and ask the first.`,
  test_one: 'Ask the first test, as set.',
  test_two: 'Ask the second test, as set.',
  test_three: 'Ask the third test, as set.',
  proceed: 'Three yeses: they go ahead.',
  stop: 'A no: they do not go ahead. Say so plainly, without arguing them out of it.',
  trigger: 'Ask what would make them stop or rethink: one thing they would notice, with a date or a number where it can have one. Record it as the note.',
  action: 'Ask what they agree now to do if that happens, not "think again". Record it as the note.',
  check: 'Ask whether they want a dated check on how it went. Record a date as YYYY-MM-DD in the note, after TODAY, or answer "no" for no check.',
  learn: 'Ask what this taught them about how they decide. Record the answer as the note.',
  next: 'Ask what they will do next. Record the answer as the note.'
});

export const QUICK_RUBRIC = `You are the Decision Maker coach in Quick decision mode: a short route for an everyday call, built from The Decision Book's Yes/No rule and Stop Rule. Warm, direct and brief; never flattering.

VOICE
- Every message is between 15 and 50 words. Ask at most one question, and end with it.
- Plain words. No lists, headings or markdown.

HOW IT WORKS
- The run follows a flow one box at a time. The state names the CURRENT BOX and what to do there.
- The three tests are set together, before any is answered, and are not changed once answered. Each must be answerable yes or no. Any no means do not proceed; three yeses mean proceed.
- When the person's latest reply settles the current box, put it in "quick": {"node": <the current box id>, "answer": "yes"|"no" for a test or for no check, "note": their words in a short line, "tests": ["...","...","..."] only at the tests box}. Then, in the same message, do what the NEXT box asks.
- If the reply does not settle the current box, set "quick" to null and ask again more simply.
- Challenge a test that cannot be answered yes or no, and a trigger they could argue with in the moment.

A FULL DECISION
Offer one with a suggestion {"kind":"escalate","reason":"..."} (one sentence) when any of these hold: the options are not on the table yet; other people are part of the decision; the stakes are high; the same call keeps coming back (a second round is a strong sign). Offer it once; never insist.

OUTPUT
Reply with one JSON object and nothing else:
{"verdict":"clarify","message":"...","quick":{"node":"...","answer":"yes|no","note":"...","tests":["...","...","..."]}|null,"suggestion":{"kind":"escalate","reason":"..."}|null,"skillsSeen":["..."],"skillsMissing":[],"summary":null}`;

/** What the box after `id` asks, for yes and no where it branches. */
function nextLine(state, id) {
  const def = QUICK_NODES[id];
  const follow = (to) => (QUICK_NODES[to].kind === 'end' ? `${QUICK_NODES[to].label}, then ${QUICK_NODES[to].next} (${QUICK_INTENTS[QUICK_NODES[to].next]})` : `${to} (${isTest(to) ? `"${testLabel(state, to)}"` : QUICK_INTENTS[to]})`);
  if (def.yes) return `NEXT: yes -> ${follow(def.yes)}; no -> ${follow(def.no)}`;
  if (def.kind === 'tests') return `NEXT: test_one (ask the first of the tests just set)`;
  return def.next ? `NEXT: ${follow(def.next)}` : 'NEXT: the run finishes; close warmly in a line.';
}

/** @returns {{ system: string[], user: string }} */
export function buildQuickPrompt(session) {
  const state = session.quick;
  const current = currentEntry(state);
  const parts = [
    `DECISION: ${decisionOf(state) || session.title}`,
    `TODAY: ${String(session.updatedAt ?? '').slice(0, 10)}`,
    `ROUND: ${state.rounds}${state.rounds > 1 ? ' (it came back, so think about a full decision)' : ''}`
  ];
  const tests = testsOf(state);
  if (tests) parts.push(`TESTS: ${tests.map((test, i) => `${TEST_IDS[i]} "${test}": ${answersOf(state)[i] ?? 'not answered'}`).join('; ')}`);
  else if (state.rounds > 1 && testsOf(state, state.rounds - 1)) parts.push(`LAST ROUND'S TESTS (offer them again, or new ones): ${testsOf(state, state.rounds - 1).join(' ')}`);
  const outcome = outcomeOf(state);
  if (outcome) parts.push(`OUTCOME: ${outcome === 'proceed' ? 'proceed' : 'do not proceed'}`);
  const rule = stopRuleOf(state);
  if (rule && outcome === 'proceed') parts.push(`STOP RULE: if ${rule.trigger}, then ${rule.action ?? '(not set yet)'}`);
  if (current) {
    const def = QUICK_NODES[current.node];
    const asks = isTest(current.node) ? `"${testLabel(state, current.node)}"` : def.label;
    parts.push(`CURRENT BOX: ${current.node} (${def.kind}): ${asks}. ${QUICK_INTENTS[current.node]}`, nextLine(state, current.node));
  } else parts.push('The run is finished. Answer briefly; do not set "quick".');
  parts.push(`RECENT CONVERSATION:\n${session.turns.slice(-10).map((t) => `${t.role === 'user' ? 'PERSON' : 'COACH'}: ${t.text}`).join('\n')}`);
  return { system: [QUICK_RUBRIC], user: parts.join('\n\n') };
}

/** The coach's reply checked against the run: the step must answer the current box in its own form. */
export function checkQuickTurn(session, value) {
  const current = currentEntry(session.quick);
  const step = value.quick;
  const suggestion = value.suggestion?.kind === 'escalate' && !session.quick.escalatedTo ? value.suggestion : null;
  if (!step) return { ok: true, value: { ...value, suggestion } };
  if (!current) return { ok: true, value: { ...value, quick: null, suggestion: null } };
  if (step.node !== current.node) return { ok: false, error: `Answer the current box (${current.node}), or set quick to null.` };
  const kind = QUICK_NODES[current.node].kind;
  if (kind === 'tests' && step.tests?.length !== 3) return { ok: false, error: 'At the tests box, set "tests" to the three agreed tests.' };
  if (kind === 'test' && !step.answer) return { ok: false, error: `${current.node} is a test: set quick.answer to yes or no.` };
  if (kind === 'note' && !step.note) return { ok: false, error: `${current.node} needs their words in quick.note.` };
  return { ok: true, value: { ...value, suggestion } };
}
````

- [ ] **Step 3: Apply the patch**

````diff
diff --git a/apps/tasks/scripts/mock-api.ts b/apps/tasks/scripts/mock-api.ts
index 470d4cdc8..424f90132 100644
--- a/apps/tasks/scripts/mock-api.ts
+++ b/apps/tasks/scripts/mock-api.ts
@@ -148,7 +148,7 @@ export function createMockApi({ seed }: MockApiOptions) {
   // Problem Solver and Decision Maker: one service each over its own memory store, both on the scripted coach.
   const coachServices: Record<string, ReturnType<typeof createProblemSolverService>> = {
     '/api/problem-solver': createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach }),
-    '/api/decision-book': createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['decision'] })
+    '/api/decision-book': createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['decision', 'quick'] })
   };
 
   async function handle(method: string, urlPath: string, body?: unknown) {
diff --git a/netlify/functions/_shared/problem-solver/coach-schema.mjs b/netlify/functions/_shared/problem-solver/coach-schema.mjs
index 9010f9930..b9a19d9b3 100644
--- a/netlify/functions/_shared/problem-solver/coach-schema.mjs
+++ b/netlify/functions/_shared/problem-solver/coach-schema.mjs
@@ -5,6 +5,7 @@ import { TOOL_IDS } from '../../../../packages/problem-solver/tools/index.mjs';
 import { CATALOGUE_IDS } from '../../../../packages/decision-book/catalogue.mjs';
 import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';
 import { LIGHTNING_NODE_IDS } from '../../../../packages/problem-solver/lightning.mjs';
+import { QUICK_NODE_IDS } from '../../../../packages/decision-book/quick.mjs';
 import { tidyTitle, titleFromText } from '../../../../packages/problem-solver/titles.mjs';
 
 const VERDICTS = ['accept', 'challenge', 'clarify'];
@@ -109,6 +110,16 @@ export function validateCoachTurn(raw) {
     lightning = { node: raw.lightning.node, ...(answer ? { answer } : {}), ...(note ? { note } : {}) };
   }
 
+  // A quick decision's step: Lightning's shape, plus the three tests at the tests box.
+  let quick = null;
+  if (raw.quick != null) {
+    if (!QUICK_NODE_IDS.includes(raw.quick?.node)) return fail(`Unknown quick decision box: ${raw.quick?.node}`);
+    const answer = ['yes', 'no'].includes(raw.quick.answer) ? raw.quick.answer : null;
+    const note = text(raw.quick.note);
+    const tests = Array.isArray(raw.quick.tests) ? raw.quick.tests.map((item) => text(item, 120)).filter(Boolean).slice(0, 3) : [];
+    quick = { node: raw.quick.node, ...(answer ? { answer } : {}), ...(note ? { note } : {}), ...(tests.length ? { tests } : {}) };
+  }
+
   const proposeTasks = [];
   for (const item of Array.isArray(raw.proposeTasks) ? raw.proposeTasks.slice(0, 5) : []) {
     const title = text(item?.title, 120);
@@ -139,6 +150,7 @@ export function validateCoachTurn(raw) {
       exitObjection: text(raw.exitObjection, 400),
       learning: text(raw.learning, 600),
       lightning,
+      ...(quick ? { quick } : {}),
       proposeTasks,
       proposeReview,
       basis
diff --git a/netlify/functions/_shared/problem-solver/coach.mjs b/netlify/functions/_shared/problem-solver/coach.mjs
index b799960b0..985abf9b6 100644
--- a/netlify/functions/_shared/problem-solver/coach.mjs
+++ b/netlify/functions/_shared/problem-solver/coach.mjs
@@ -6,6 +6,7 @@ import { extractJson, validateCoachTurn } from './coach-schema.mjs';
 import { buildCoachPrompt, repairPrompt, rewritePrompt } from './prompts.mjs';
 import { buildDecisionPrompt } from './decision-prompts.mjs';
 import { buildLightningPrompt, checkLightningTurn } from './lightning-prompts.mjs';
+import { buildQuickPrompt, checkQuickTurn } from './quick-prompts.mjs';
 import { toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
 import { TOOLS, toolsForBookStep } from '../../../../packages/problem-solver/tools/index.mjs';
 import { activeRun, frameKeysOf, reopenProblem, waitingForReview } from './session.mjs';
@@ -158,11 +159,23 @@ function parseLightning(session, text) {
   return result.ok ? checkLightningTurn(session, result.value) : result;
 }
 
+function parseQuick(session, text) {
+  const result = validateCoachTurn(extractJson(text));
+  return result.ok ? checkQuickTurn(session, result.value) : result;
+}
+
+/** Each session kind's prompt and reply check; full and decision sessions share the step parser. */
+const PROMPTS = {
+  lightning: { build: buildLightningPrompt, read: parseLightning },
+  quick: { build: buildQuickPrompt, read: parseQuick },
+  decision: { build: buildDecisionPrompt, read: parse },
+  full: { build: buildCoachPrompt, read: parse }
+};
+
 export function createModelCoach(model) {
   return async function modelCoach(session) {
-    const lightning = session.kind === 'lightning';
-    const prompt = lightning ? buildLightningPrompt(session) : session.kind === 'decision' ? buildDecisionPrompt(session) : buildCoachPrompt(session);
-    const read = lightning ? parseLightning : parse;
+    const { build, read } = PROMPTS[session.kind] ?? PROMPTS.full;
+    const prompt = build(session);
     const first = await model({ ...prompt, maxTokens: 900 });
     let result = read(session, first);
     if (!result.ok) result = read(session, await model({ ...repairPrompt(prompt, first, result.error), maxTokens: 900 }));
diff --git a/netlify/functions/_shared/problem-solver/decision-prompts.mjs b/netlify/functions/_shared/problem-solver/decision-prompts.mjs
index 276ec3bd8..9eb1fe761 100644
--- a/netlify/functions/_shared/problem-solver/decision-prompts.mjs
+++ b/netlify/functions/_shared/problem-solver/decision-prompts.mjs
@@ -80,6 +80,14 @@ Review compares what the person expected when they decided with what actually ha
 - In the reflection, ask what the match or mismatch says about how they decide, and whether the Stop Rule's trigger came.
 - When it is complete, suggest next_step to close the review.`;
 
+/** A decision that went deeper from a quick run: its seeds while framing, then where it came from. */
+function quickLines(session) {
+  const seeds = session.frameSeeds;
+  if (seeds?.from !== 'quick') return [];
+  if (session.phase === 'frame') return [`CARRIED FROM A QUICK DECISION (seeds, not answers: show them, ask the person to confirm or change each, and record only what they confirm in "frame"): decision: ${seeds.decision}; known: ${seeds.known ?? 'the tests were not set'}.`];
+  return [`CAME FROM A QUICK DECISION: ${seeds.known ?? 'the tests were not set.'} Its tests and Stop Rule can carry into dm_yes_no, dm_stop_rule and Decide, once the person agrees.`];
+}
+
 /** Step layer: stable for the whole of a step, so it caches between turns. */
 function stepLayer(session) {
   if (session.phase === 'finished') return 'The session is finished. Recap briefly when asked and help the person carry the learning forward. Do not suggest a model.';
@@ -181,6 +189,7 @@ export function buildDecisionPrompt(session) {
   parts.push(`Frame: ${JSON.stringify(session.frame)}${missing.length ? `\nMissing frame answers: ${missing.join(', ')}` : ''}`);
   if (session.frame.compass) parts.push(`COMPASS: ${compassLabels(session.frame.compass)}`);
   if (session.phase === 'frame' && session.startModel) parts.push(`SHELF PICK: the person started from ${TOOLS[session.startModel].name} (${session.startModel}). When framing ends it opens on that model: suggest it with next_tool and say in one sentence how it fits the frame.`);
+  parts.push(...quickLines(session));
   const earlier = earlierSteps(session);
   if (earlier) parts.push(earlier.replace(/^EARLIER STEPS:/, 'EARLIER:'));
   if (session.model) parts.push(...reviewLines(session));
diff --git a/netlify/functions/_shared/problem-solver/scripted-coach.mjs b/netlify/functions/_shared/problem-solver/scripted-coach.mjs
index f372e5f33..66dbcade2 100644
--- a/netlify/functions/_shared/problem-solver/scripted-coach.mjs
+++ b/netlify/functions/_shared/problem-solver/scripted-coach.mjs
@@ -13,6 +13,7 @@ import { MODELS } from '../../../../packages/problem-solver/models.mjs';
 import { namingProblem } from '../../../../packages/problem-solver/naming.mjs';
 import { chosenOption, defaultToolFor, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
 import { applyStep, currentEntry, isQuestion, LIGHTNING_NODES } from '../../../../packages/problem-solver/lightning.mjs';
+import * as quickFlow from '../../../../packages/decision-book/quick.mjs';
 import { FEEDBACK_ID, RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
 import { basisCandidates } from '../../../../packages/decision-book/record.mjs';
 import { isRecordDate } from '../../../../packages/decision-book/tools/record.mjs';
@@ -339,11 +340,74 @@ function lightningTurn(session, last) {
   return turn('clarify', asking);
 }
 
+/**
+ * A quick decision walked by rule. The tests are set with `tests: one? / two? / three?`, or `use
+ * those` for the suggested three; a test takes yes or no; the trigger, action and closing boxes
+ * take a few words; the check takes a date (YYYY-MM-DD) or `no`. `go deeper` (or `escalate`)
+ * suggests a full decision.
+ */
+const QUICK_ASKS = {
+  tests: `Set three yes/no tests before you answer any, such as: ${quickFlow.SUGGESTED_TESTS.join(' ')} Say "tests: one? / two? / three?", or "use those".`,
+  trigger: 'Now a Stop Rule. If this happens, you stop or rethink: what would you notice?',
+  action: 'And then you will do what? Agree it now.',
+  check: 'Do you want a dated check on how it went? Give a date, or say no.',
+  learn: 'What did this teach you about how you decide?',
+  next: 'What next?'
+};
+
+function quickMessage(state, before = '') {
+  const entry = quickFlow.currentEntry(state);
+  if (!entry) return `${before}That is decided. Press It came back if the call comes up again.`;
+  const outcome = quickFlow.outcomeOf(state);
+  const ended = entry.node === 'trigger' ? 'Three yeses: go ahead. ' : entry.node === 'learn' && outcome === 'stop' && !state.path.some((e) => e.round === state.rounds && e.node === 'learn' && e.note) ? 'A no, so do not go ahead. ' : '';
+  const ask = quickFlow.isTest(entry.node) ? quickFlow.testLabel(state, entry.node) : QUICK_ASKS[entry.node];
+  return `${before}${ended}${ask}`;
+}
+
+function quickTurn(session, last) {
+  const state = session.quick;
+  const entry = quickFlow.currentEntry(state);
+  const turn = (verdict, message, quick = null, extra = {}) => ({ ...base, verdict, message, quick, ...extra });
+  if (!entry) return turn('clarify', 'That is decided. Say "it came back" if the call comes up again.');
+  if (session.turns.length === 1 || last === 'It came back.') return turn('clarify', quickMessage(state));
+  if (/^(escalate|go deeper)$/i.test(last.trim())) {
+    return turn('clarify', 'This sounds bigger than a quick call. A full decision may suit it better.', null, { suggestion: { kind: 'escalate', reason: 'Named as needing a full decision.' } });
+  }
+  const accept = (step, skills = ['decision_making']) => turn('accept', quickMessage(quickFlow.applyStep(state, step, session.updatedAt)), step, { skillsSeen: skills });
+  const kind = quickFlow.QUICK_NODES[entry.node].kind;
+  if (kind === 'tests') {
+    const tests = /^use those\b/i.test(last.trim()) ? [...quickFlow.SUGGESTED_TESTS] : (/^tests:\s*(.+)$/is.exec(last.trim())?.[1].split('/').map((t) => t.trim()).filter(Boolean) ?? []);
+    if (tests.length !== 3) return turn('clarify', QUICK_ASKS.tests);
+    return accept({ node: 'tests', tests }, ['critical_thinking']);
+  }
+  if (kind === 'test') {
+    const reply = /^(yes|no)\b[\s,.]*(.*)$/is.exec(last.trim());
+    const answer = reply?.[1].toLowerCase();
+    const words = reply?.[2].trim() ?? '';
+    // A Yes or No pressed on the chart has already moved the run on.
+    if (reply && !words && /^(yes|no)\.$/i.test(last.trim()) && state.path.at(-2)?.answer === answer) return turn('clarify', quickMessage(state, 'Noted. '));
+    if (!answer) return turn('clarify', `Yes or no: ${quickFlow.testLabel(state, entry.node)}`);
+    return accept({ node: entry.node, answer, ...(words ? { note: words } : {}) });
+  }
+  if (kind === 'check') {
+    const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(last)?.[1];
+    if (date && quickFlow.isCheckDate(date)) return accept({ node: 'check', note: date }, ['metacognition']);
+    if (/^(no|skip)\b/i.test(last.trim())) return accept({ node: 'check', answer: 'no' });
+    return turn('clarify', QUICK_ASKS.check);
+  }
+  if (wordCount(last) < 2) return turn('clarify', 'Say a little more about that.');
+  return accept({ node: entry.node, note: last.trim() }, entry.node === 'learn' ? ['metacognition'] : ['decision_making']);
+}
+
 export async function scriptedCoach(session) {
   if (session.kind === 'lightning') {
     const turn = session.turns.at(-1);
     return lightningTurn(session, turn?.role === 'user' ? turn.text : '');
   }
+  if (session.kind === 'quick') {
+    const turn = session.turns.at(-1);
+    return quickTurn(session, turn?.role === 'user' ? turn.text : '');
+  }
   const latest = session.turns.at(-1);
   const last = latest?.role === 'user' ? latest.text : '';
   if (session.runner?.mode === 'boundary') {
diff --git a/netlify/functions/_shared/problem-solver/service.mjs b/netlify/functions/_shared/problem-solver/service.mjs
index 7ba176b27..9faae24af 100644
--- a/netlify/functions/_shared/problem-solver/service.mjs
+++ b/netlify/functions/_shared/problem-solver/service.mjs
@@ -5,6 +5,7 @@ import {
   keepAnyway, linkCaseFile, dismissCaseFile, moveOn, rename, rescoreRadar, say, score, setReviewTask, summaryRow
 } from './session.mjs';
 import { applyLightningTurn, createLightningSession, escalateLightning, lightningAgain, lightningAnswer } from './lightning-session.mjs';
+import { applyQuickTurn, createQuickSession, escalateQuick, quickAgain, quickAnswer, quickCheck } from './quick-session.mjs';
 import { migrateRow, migrateSession } from './migrate.mjs';
 
 const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
@@ -16,6 +17,16 @@ const STALE_ERROR = 'The coach timed out, try again.';
 
 const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });
 
+/**
+ * Session kinds that run as a fixed flow rather than steps: how each is created, how a coach
+ * turn lands, and how it goes on to a full session. The flow's state sits under the kind's name.
+ */
+const FLOWS = {
+  lightning: { create: createLightningSession, turn: applyLightningTurn, escalate: (s, id, deps) => { const { full, lightning } = escalateLightning(s, id, deps); return { full, run: lightning }; } },
+  quick: { create: createQuickSession, turn: applyQuickTurn, escalate: (s, id, deps) => { const { full, quick } = escalateQuick(s, id, deps); return { full, run: quick }; } }
+};
+const flowOf = (session) => FLOWS[session.kind] ?? null;
+
 export function createProblemSolverService({ store, coach, kinds = ['full', 'lightning'], now = () => new Date().toISOString(), newId = randomUUID }) {
   const deps = { now, newId };
 
@@ -56,6 +67,9 @@ export function createProblemSolverService({ store, coach, kinds = ['full', 'lig
     dismiss_case_file: (s, body) => dismissCaseFile(s, body.payload ?? {}, deps),
     lightning_answer: (s, body) => lightningAnswer(s, body.payload ?? {}, deps),
     lightning_again: (s) => lightningAgain(s, deps),
+    quick_answer: (s, body) => quickAnswer(s, body.payload ?? {}, deps),
+    quick_again: (s) => quickAgain(s, deps),
+    quick_check: (s, body) => quickCheck(s, body.payload ?? {}, deps),
     archive: (s) => archive(s, deps),
     retry: (s) => {
       if (s.runner.status !== 'failed') throw httpError(409, 'action_not_allowed', 'Nothing to retry.');
@@ -69,16 +83,19 @@ export function createProblemSolverService({ store, coach, kinds = ['full', 'lig
   }
 
   /**
-   * Lightning to the full process: write the seeded full session first (its id is the request id,
-   * so a retry finds it instead of making another), then mark the run. Returns the run.
+   * A flow (Lightning, or a quick decision) to a full session: write the seeded full session first
+   * (its id is the request id, so a retry finds it instead of making another), then mark the run.
+   * Returns the run.
    */
   async function escalate(owner, value, etag, body) {
     if (['queued', 'running'].includes(value.runner.status)) throw httpError(409, 'busy', 'The coach is still thinking.');
+    const flow = flowOf(value);
+    if (!flow) throw httpError(409, 'action_not_allowed', 'Only a quick route goes on to a full session.');
     const fullId = ID_RE.test(String(body.requestId ?? '')) ? String(body.requestId) : newId();
-    const { full, lightning } = escalateLightning(value, fullId, deps);
+    const { full, run } = flow.escalate(value, fullId, deps);
     const written = await store.write(owner, full.id, { ...full, requestIds: [] }, null);
     if (!written && !(await store.read(owner, full.id))) throw httpError(409, 'conflict', 'This problem changed elsewhere. Reloaded the latest.');
-    const next = { ...lightning, revision: value.revision + 1, requestIds: [...value.requestIds, String(body.requestId ?? '')].filter(Boolean).slice(-REQUEST_IDS_KEPT) };
+    const next = { ...run, revision: value.revision + 1, requestIds: [...value.requestIds, String(body.requestId ?? '')].filter(Boolean).slice(-REQUEST_IDS_KEPT) };
     return save(owner, next, etag);
   }
 
@@ -106,7 +123,7 @@ export function createProblemSolverService({ store, coach, kinds = ['full', 'lig
     async create(owner, body) {
       const kind = body.kind ?? kinds[0];
       if (!kinds.includes(kind)) throw httpError(400, 'validation_error', `This tool does not start ${kind} sessions.`);
-      const make = kind === 'lightning' ? createLightningSession : (input, d) => createSession({ ...input, kind }, d);
+      const make = FLOWS[kind]?.create ?? ((input, d) => createSession({ ...input, kind }, d));
       const session = make({ title: body.title, text: body.text, links: Array.isArray(body.links) ? body.links : [], startModel: body.startModel ?? null }, deps);
       session.requestIds = body.requestId ? [String(body.requestId)] : [];
       if (!ID_RE.test(String(body.requestId ?? ''))) return save(owner, session, null);
@@ -127,7 +144,7 @@ export function createProblemSolverService({ store, coach, kinds = ['full', 'lig
       if (body.action === 'escalate') return escalate(owner, value, etag, body);
       const act = ACTIONS[body.action];
       if (!act) throw httpError(400, 'validation_error', `Unknown action: ${body.action}`);
-      if (value.kind === 'lightning' && value.status !== 'active' && body.action === 'say') throw httpError(409, 'action_not_allowed', 'This run is finished. Press It came back if it returned.');
+      if (flowOf(value) && value.status !== 'active' && body.action === 'say') throw httpError(409, 'action_not_allowed', 'This run is finished. Press It came back if it returned.');
       if (['queued', 'running'].includes(value.runner.status) && body.action !== 'archive') throw httpError(409, 'busy', 'The coach is still thinking.');
       if (value.runner.status === 'failed' && value.runner.mode === 'boundary' && !['retry', 'archive'].includes(body.action)) {
         throw httpError(409, 'action_not_allowed', 'The coach did not finish wrapping up that step. Try again first.');
@@ -145,7 +162,7 @@ export function createProblemSolverService({ store, coach, kinds = ['full', 'lig
       ({ value, etag } = await load(owner, id));
       let next;
       try {
-        const apply = value.kind === 'lightning' ? applyLightningTurn : applyCoachTurn;
+        const apply = flowOf(value)?.turn ?? applyCoachTurn;
         next = apply(value, await coach(value), deps);
       } catch (error) {
         next = { ...value, runner: { ...value.runner, status: 'failed', error: error.message || 'The coach could not answer.' } };
diff --git a/netlify/functions/_shared/problem-solver/session.mjs b/netlify/functions/_shared/problem-solver/session.mjs
index 6a8930db1..a70dbb9fa 100644
--- a/netlify/functions/_shared/problem-solver/session.mjs
+++ b/netlify/functions/_shared/problem-solver/session.mjs
@@ -8,6 +8,7 @@ import { parseCompass } from '../../../../packages/decision-book/compass.mjs';
 import { DECISION_MODEL } from '../../../../packages/decision-book/model.mjs';
 import { RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
 import { mainModel, resolveBasis } from '../../../../packages/decision-book/record.mjs';
+import { outcomeOf } from '../../../../packages/decision-book/quick.mjs';
 
 export { waitingForReview };
 
@@ -633,7 +634,9 @@ export function summaryRow(session) {
     taskIds: (session.proposedTasks ?? []).filter((p) => p.status === 'confirmed').map((p) => p.taskId),
     reviewTaskId: session.reviewTaskId ?? null,
     reviewDue: session.reviewState?.status === 'waiting' ? session.reviewState.due : null,
-    escalatedTo: session.lightning?.escalatedTo ?? null,
+    escalatedTo: session.lightning?.escalatedTo ?? session.quick?.escalatedTo ?? null,
+    // A quick decision's row says how its latest round came out.
+    ...(session.kind === 'quick' ? { outcome: outcomeOf(session.quick) } : {}),
     // A decision's medal shows the model its reasons lean on most.
     ...(session.kind === 'decision' ? { main: mainModel(session) } : {}),
     createdAt: session.createdAt,
diff --git a/netlify/functions/decision-book.mjs b/netlify/functions/decision-book.mjs
index e98fcd1ce..30b33227a 100644
--- a/netlify/functions/decision-book.mjs
+++ b/netlify/functions/decision-book.mjs
@@ -6,7 +6,7 @@ import { DECISION_BOOK_PREFIX } from './_shared/problem-solver/store.mjs';
 
 export const config = { path: '/api/decision-book' };
 
-export const DECISION_BOOK_DEPS = Object.freeze({ prefix: DECISION_BOOK_PREFIX, runPath: '/api/decision-book/run', kinds: ['decision'] });
+export const DECISION_BOOK_DEPS = Object.freeze({ prefix: DECISION_BOOK_PREFIX, runPath: '/api/decision-book/run', kinds: ['decision', 'quick'] });
 
 export function createDecisionBookHandler(deps = {}) {
   return createProblemSolverHandler({ ...DECISION_BOOK_DEPS, ...deps });
diff --git a/netlify/functions/problem-solver.mjs b/netlify/functions/problem-solver.mjs
index 5eb5a2c1d..ee2fa34fa 100644
--- a/netlify/functions/problem-solver.mjs
+++ b/netlify/functions/problem-solver.mjs
@@ -53,7 +53,7 @@ export function createProblemSolverHandler(deps = {}) {
       if (parsed.error) return withCors(parsed.error, request, env);
       const body = parsed.value ?? {};
       const session = body.create ? await service.create(owner(env), body.create) : await service.action(owner(env), body);
-      const runId = body.action === 'escalate' ? session.lightning?.escalatedTo ?? null : session.runner.status === 'queued' ? session.id : null;
+      const runId = body.action === 'escalate' ? session.lightning?.escalatedTo ?? session.quick?.escalatedTo ?? null : session.runner.status === 'queued' ? session.id : null;
       if (!runId) return withCors(okResponse(200, { session }), request, env);
       let kicked = false;
       try { kicked = await (deps.invokeRun ?? defaultInvokeRun)(request, runId, env, deps.fetchImpl ?? fetch, deps.runPath); } catch { kicked = false; }
diff --git a/tests/unit/decision-book-http.test.js b/tests/unit/decision-book-http.test.js
index 8973835ab..3c261e91c 100644
--- a/tests/unit/decision-book-http.test.js
+++ b/tests/unit/decision-book-http.test.js
@@ -29,7 +29,7 @@ function harness(make, path) {
 
 test('the API uses its own store prefix and run path', () => {
   assert.equal(DECISION_BOOK_PREFIX, 'decision-book/v1');
-  assert.deepEqual(DECISION_BOOK_DEPS, { prefix: 'decision-book/v1', runPath: '/api/decision-book/run', kinds: ['decision'] });
+  assert.deepEqual(DECISION_BOOK_DEPS, { prefix: 'decision-book/v1', runPath: '/api/decision-book/run', kinds: ['decision', 'quick'] });
 });
 
 test('a decision is created, framed in three answers and opens Explore', async () => {
````

- [ ] **Step 4: Create the server tests**

They walk a quick decision over HTTP with the scripted coach (to proceed, with a check task; to a no and It came back; and through Go deeper), and check the schema, the prompt, the reply check, the model coach's repair and the list row.

**Create `tests/unit/decision-book-quick-session.test.js`:**

````js
// tests/unit/decision-book-quick-session.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createDecisionBookHandler } from '../../netlify/functions/decision-book.mjs';
import { createProblemSolverHandler } from '../../netlify/functions/problem-solver.mjs';
import { createMemoryProblemStore } from '../../netlify/functions/_shared/problem-solver/store.mjs';
import { createProblemSolverService } from '../../netlify/functions/_shared/problem-solver/service.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { buildDecisionPrompt } from '../../netlify/functions/_shared/problem-solver/decision-prompts.mjs';
import { buildQuickPrompt, checkQuickTurn, QUICK_INTENTS, QUICK_RUBRIC } from '../../netlify/functions/_shared/problem-solver/quick-prompts.mjs';
import { applyQuickTurn, createQuickSession, escalateQuick } from '../../netlify/functions/_shared/problem-solver/quick-session.mjs';
import { summaryRow } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { QUICK_NODE_IDS } from '../../packages/decision-book/quick.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T09:00:00.000Z', newId: () => `id${(n += 1)}` };
const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });
const turn = (fields) => ({ verdict: 'clarify', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], suggestion: null, summary: null, lightning: null, ...fields });
const TESTS = ['Do I want the course?', 'Can I fit it in?', 'Is it worth the fee?'];
const fresh = () => idle(createQuickSession({ text: 'Should I take the weekend course?' }, deps));
const walked = (...steps) => steps.reduce((s, step) => idle(applyQuickTurn(s, turn({ verdict: 'accept', quick: step }), deps)), fresh());

const NOW = Date.parse('2026-10-21T10:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function harness(make = createDecisionBookHandler, path = '/api/decision-book') {
  const store = createMemoryProblemStore();
  const kicks = [];
  const handler = make({ env: ENV, now: () => NOW, getStore: async () => store, coach: scriptedCoach, invokeRun: async (request, id) => { kicks.push(id); return false; } });
  const call = async (method, body, query = '') => {
    const res = await handler(new Request(`https://life.example${path}${query}`, {
      method,
      headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {})
    }));
    return { status: res.status, data: (await res.json()).data };
  };
  let r = 0;
  const say = async (s, text) => (await call('POST', { id: s.id, revision: s.revision, requestId: `say${(r += 1)}`, action: 'say', text })).data.session;
  const act = async (s, action, payload) => call('POST', { id: s.id, revision: s.revision, requestId: `act${(r += 1)}`, action, ...(payload ? { payload } : {}) });
  return { call, kicks, say, act };
}

test('a quick run starts with the decision stated and the tests waiting', () => {
  const s = fresh();
  assert.equal(s.kind, 'quick');
  assert.equal(s.phase, 'quick');
  assert.equal(s.quick.path[0].note, 'Should I take the weekend course?');
  assert.equal(s.quick.path.at(-1).node, 'tests');
});

test('schema: a quick step with its tests; unknown boxes are refused; other replies carry no quick field', () => {
  const ok = validateCoachTurn({ verdict: 'accept', message: 'm', quick: { node: 'tests', tests: [...TESTS, 'A fourth?'] } });
  assert.deepEqual(ok.value.quick, { node: 'tests', tests: TESTS });
  assert.match(validateCoachTurn({ verdict: 'clarify', message: 'm', quick: { node: 'nowhere' } }).error, /Unknown quick decision box/);
  assert.equal('quick' in validateCoachTurn({ verdict: 'clarify', message: 'm' }).value, false);
});

test('every box has an intent; the rubric keeps the tests fixed and names when to go deeper', () => {
  for (const id of QUICK_NODE_IDS) assert.ok(QUICK_INTENTS[id], id);
  for (const words of ['before any is answered', 'Any no means do not proceed', 'escalate', 'a second round']) assert.ok(QUICK_RUBRIC.includes(words), words);
});

test('the prompt names the current box, the tests with their answers and both ways on', () => {
  const s = walked({ node: 'tests', tests: TESTS }, { node: 'test_one', answer: 'yes' });
  const { system, user } = buildQuickPrompt(s);
  assert.deepEqual(system, [QUICK_RUBRIC]);
  assert.match(user, /DECISION: Should I take the weekend course\?/);
  assert.match(user, /test_one "Do I want the course\?": yes; test_two "Can I fit it in\?": not answered/);
  assert.match(user, /CURRENT BOX: test_two \(test\): "Can I fit it in\?"/);
  assert.match(user, /NEXT: yes -> test_three \("Is it worth the fee\?"\); no -> Do not proceed, then learn/);
});

test('the parser check: the current box only, in its own form; escalate kept until it has gone deeper', () => {
  const s = fresh();
  assert.match(checkQuickTurn(s, turn({ quick: { node: 'test_one', answer: 'yes' } })).error, /current box \(tests\)/);
  assert.match(checkQuickTurn(s, turn({ quick: { node: 'tests', tests: TESTS.slice(0, 2) } })).error, /three agreed tests/);
  const set = walked({ node: 'tests', tests: TESTS });
  assert.match(checkQuickTurn(set, turn({ quick: { node: 'test_one' } })).error, /yes or no/);
  assert.equal(checkQuickTurn(set, turn({ suggestion: { kind: 'escalate', reason: 'Big.' } })).value.suggestion.kind, 'escalate');
  const deeper = { ...set, quick: { ...set.quick, escalatedTo: 'full' } };
  assert.equal(checkQuickTurn(deeper, turn({ suggestion: { kind: 'escalate', reason: 'Big.' } })).value.suggestion, null);
});

test('the model coach uses the quick prompt and repairs a step for the wrong box once', async () => {
  const replies = [
    JSON.stringify(turn({ message: 'Ask the first.', quick: { node: 'test_one', answer: 'yes' } })),
    JSON.stringify(turn({ verdict: 'accept', message: 'Three good tests. First: do you want the course?', quick: { node: 'tests', tests: TESTS } }))
  ];
  const prompts = [];
  const coach = createModelCoach(async (prompt) => { prompts.push(prompt); return replies.shift(); });
  const reply = await coach(fresh());
  assert.deepEqual(reply.quick, { node: 'tests', tests: TESTS });
  assert.deepEqual(prompts[0].system, [QUICK_RUBRIC]);
  assert.equal(prompts.length, 2);
});

test('a coach step that does not hold is dropped and the turn kept', () => {
  const s = idle(applyQuickTurn(fresh(), turn({ message: 'Pick three.', quick: { node: 'tests', tests: ['Only one?'] } }), deps));
  assert.equal(s.quick.path.at(-1).node, 'tests');
  assert.equal(s.turns.at(-1).text, 'Pick three.');
});

test('the list row says how the latest round came out', () => {
  assert.equal(summaryRow(fresh()).outcome, null);
  assert.equal(summaryRow(walked({ node: 'tests', tests: TESTS }, { node: 'test_one', answer: 'no' })).outcome, 'stop');
  assert.equal('outcome' in summaryRow({ ...fresh(), kind: 'decision', quick: null }), false);
});

test('HTTP: a quick decision walked with the scripted coach, answered on the chart, to proceed and a check task', async () => {
  const { call, say, act } = harness();
  let s = (await call('POST', { create: { text: 'Should I take the weekend course?', kind: 'quick', requestId: 'q1' } })).data.session;
  assert.equal(s.kind, 'quick');
  assert.match(s.turns.at(-1).text, /Set three yes\/no tests/);
  s = await say(s, 'use those');
  assert.equal(s.turns.at(-1).text, 'Do I want it?');
  let res = await act(s, 'quick_answer', { node: 'test_one', answer: 'yes' });
  s = res.data.session;
  assert.equal(s.turns.at(-1).text, 'Noted. Can I do it?');
  assert.equal((await act(s, 'quick_answer', { node: 'test_one', answer: 'yes' })).status, 409, 'a box that has moved on');
  s = await say(s, 'yes');
  s = await say(s, 'yes, it pays for itself');
  assert.match(s.turns.at(-1).text, /^Three yeses: go ahead\./);
  s = await say(s, 'I miss two sessions');
  s = await say(s, 'Ask to move to the spring run');
  s = await say(s, 'Check on 2027-01-21');
  assert.deepEqual(s.quick.check, { due: '2027-01-21', taskId: null, dismissed: false });
  s = await say(s, 'I decide faster with the tests written down');
  s = await say(s, 'Book the first session');
  assert.equal(s.status, 'finished');
  res = await act(s, 'quick_check', { taskId: 'task-9' });
  assert.equal(res.data.session.quick.check.taskId, 'task-9');
  assert.equal((await act(res.data.session, 'quick_check', { dismissed: true })).status, 409, 'made once');
  const row = (await call('GET', null, '?list=1')).data.sessions[0];
  assert.equal(row.kind, 'quick');
  assert.equal(row.outcome, 'proceed');
});

test('HTTP: a no stops it; It came back opens a new round; a finished run takes no replies', async () => {
  const { call, say, act } = harness();
  let s = (await call('POST', { create: { text: 'Buy the bigger tent?', kind: 'quick', requestId: 'q2' } })).data.session;
  s = await say(s, 'tests: Do I need it? / Can I store it? / Will I use it twice a year?');
  assert.deepEqual(s.quick.path.find((e) => e.node === 'tests').tests, ['Do I need it?', 'Can I store it?', 'Will I use it twice a year?']);
  s = await say(s, 'no, the old one is fine');
  assert.match(s.turns.at(-1).text, /^A no, so do not go ahead\./);
  s = await say(s, 'I wanted it because it was on sale');
  s = await say(s, 'Leave it');
  assert.equal(s.status, 'finished');
  const refused = await call('POST', { id: s.id, revision: s.revision, requestId: 'late', action: 'say', text: 'one more thing' });
  assert.equal(refused.status, 409);
  s = (await act(s, 'quick_again')).data.session;
  assert.equal(s.quick.rounds, 2);
  assert.equal(s.status, 'active');
  assert.match(s.turns.at(-1).text, /Set three yes\/no tests/);
});

test('HTTP: go deeper writes a seeded full decision once, kicks its first turn, and the run points at it', async () => {
  const { call, say, kicks } = harness();
  let s = (await call('POST', { create: { text: 'Should I take the weekend course?', kind: 'quick', requestId: 'q3' } })).data.session;
  s = await say(s, 'use those');
  s = await say(s, 'yes');
  s = await say(s, 'go deeper');
  assert.equal(s.suggestion.kind, 'escalate');
  const fullId = '22222222-2222-4222-8222-222222222222';
  const res = await call('POST', { id: s.id, revision: s.revision, requestId: fullId, action: 'escalate' });
  assert.equal(res.status, 200);
  assert.equal(res.data.session.quick.escalatedTo, fullId);
  assert.equal(res.data.session.status, 'finished');
  assert.equal(kicks.at(-1), fullId);
  const full = (await call('GET', null, `?id=${fullId}`)).data.session;
  assert.equal(full.kind, 'decision');
  assert.equal(full.escalatedFrom, s.id);
  assert.equal(full.frameSeeds.from, 'quick');
  assert.match(full.frameSeeds.known, /Do I want it\? yes; Can I do it\? not answered/);
  assert.match(buildDecisionPrompt(full).user, /CARRIED FROM A QUICK DECISION .*decision: Should I take the weekend course\?/);
  const replay = await call('POST', { id: s.id, revision: s.revision, requestId: fullId, action: 'escalate' });
  assert.equal(replay.data.session.quick.escalatedTo, fullId, 'a replay returns the run');
  const later = await call('POST', { id: s.id, revision: res.data.session.revision, requestId: 'other', action: 'escalate' });
  assert.equal(later.status, 409);
});

test('once framed, the decision prompt still says where it came from', () => {
  const run = walked({ node: 'tests', tests: TESTS }, { node: 'test_one', answer: 'no' });
  const { full } = escalateQuick(run, 'full-1', deps);
  const framed = { ...full, phase: 'explore', frame: { decision: 'd', compass: 'self_improve', known: 'k' } };
  assert.match(buildDecisionPrompt(framed).user, /CAME FROM A QUICK DECISION: Yes\/No tests: Do I want the course\? no/);
});

test('Problem Solver refuses quick runs, and a full decision cannot go deeper', async () => {
  const problem = harness(createProblemSolverHandler, '/api/problem-solver');
  assert.equal((await problem.call('POST', { create: { text: 'Buy a tent?', kind: 'quick', requestId: 'p1' } })).status, 400);
  const svc = createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['decision', 'quick'], now: deps.now });
  const d = await svc.create('op', { text: 'Should I move?', kind: 'decision', requestId: 'd1' });
  await assert.rejects(svc.action('op', { id: d.id, revision: d.revision, requestId: 'e1', action: 'escalate' }), { status: 409 });
});
````

- [ ] **Step 5: Run the unit suite**

Run: `npm run test:unit`
Expected: PASS (5,732 when drafted: 5,721 pass, 11 skipped).

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/problem-solver/quick-session.mjs netlify/functions/_shared/problem-solver/quick-prompts.mjs tests/unit/decision-book-quick-session.test.js apps/tasks/scripts/mock-api.ts netlify/functions/_shared/problem-solver/coach-schema.mjs netlify/functions/_shared/problem-solver/coach.mjs netlify/functions/_shared/problem-solver/decision-prompts.mjs netlify/functions/_shared/problem-solver/scripted-coach.mjs netlify/functions/_shared/problem-solver/service.mjs netlify/functions/_shared/problem-solver/session.mjs netlify/functions/decision-book.mjs netlify/functions/problem-solver.mjs tests/unit/decision-book-http.test.js
git commit -m "Decision Maker: quick decision sessions, their coach, and Go deeper to a full decision

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The quick decision pages
**Files:**
- Create: `packages/decision-book/render/quick.ts`
- Create: `apps/tasks/src/views/decision-book/quick-view.ts`
- Create: `apps/tasks/tests/unit/decision-book-quick.test.ts`
- Modify: `apps/tasks/src/views/decision-book/decision-book-view.css`
- Modify: `apps/tasks/src/views/decision-book/decor.ts`
- Modify: `apps/tasks/src/views/decision-book/view.ts`
- Modify: `apps/tasks/src/views/problem-solver/api.ts`
- Modify: `apps/tasks/src/views/problem-solver/coach-panel.ts`
- Modify: `packages/decision-book/decision-book.css`

- **The chart** (`render/quick.ts`): the decision, the three tests with the path inked (a test after a no is faint), then Proceed (green) or Do not proceed (red). The Stop Rule is an if/then band underneath, then the check date and the closing answers. The test being asked carries Yes and No; earlier rounds are summed up in a line.
- **The page** (`quick-view.ts`, shaped like Problem Solver's `lightning-view.ts`): the chart beside the coach on desktop, stacked on a phone; the check card (**Create check task** makes a Tasks task due on the check date, tagged `check`, then links it); **It came back** once it is done; **Go deeper** while it has not gone deeper; and a link to the full decision once it has.
- **From a quick decision:** a full decision that went deeper shows the run's chart in a closed panel above the skill tray.
- **Landing:** the Quick decision card becomes a form that starts a quick run. A quick row's badge is its end (forward disc, back disc, or the pair while open), labelled Proceed, Do not proceed, Went deeper or Quick decision.
- **Shared components:** the coach panel treats a quick run as a flow (no frame, no steps, closed once done), and its escalate card takes its words from the look: Decision Maker's says **Go deeper**.

- [ ] **Step 1: Create the chart**

**Create `packages/decision-book/render/quick.ts`:**

````ts
// packages/decision-book/render/quick.ts
// The quick decision's chart: the Yes/No flow top to bottom in Decision Book style (the decision,
// the three tests with your path inked, then Proceed or Do not proceed), the Stop Rule as an
// if/then band underneath, the check date and the closing answers. With `onAnswer`, the test
// being asked carries Yes and No buttons. Earlier rounds are summed up in a line.
import { QUICK_NODES, TEST_IDS, answersOf, currentEntry, decisionOf, isTest, outcomeOf, stopRuleOf, testLabel, testsOf } from '../quick.mjs';
import type { DmQuickState } from '../../problem-solver/types';
import { el, setAttr, setText } from './core';

export type QuickAnswer = 'yes' | 'no';
export type QuickView = { el: HTMLElement; update(state: DmQuickState): void; destroy(): void };

const ROUND_WORDS = { proceed: 'went ahead', stop: 'did not go ahead' } as const;

/** 2027-01-21 as 21 Jan 2027. */
export function checkDateText(due: string): string {
  const date = new Date(`${due}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? due : date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function createQuickView(doc: Document = document, opts: { onAnswer?(node: string, answer: QuickAnswer): void } = {}): QuickView {
  const root = el(doc, 'section', 'dm-qk');
  root.setAttribute('aria-label', 'The Yes/No flow');
  const rounds = el(doc, 'p', 'dm-qk__rounds');
  rounds.hidden = true;
  const flow = el(doc, 'ol', 'dm-qk__flow');

  function row(box: string, kind: string): { row: HTMLLIElement; label: HTMLSpanElement; chip: HTMLSpanElement; text: HTMLParagraphElement } {
    const item = el(doc, 'li', 'dm-qk__row');
    item.dataset.box = box;
    item.dataset.kind = kind;
    const disc = el(doc, 'span', 'dm-qk__disc');
    disc.setAttribute('aria-hidden', 'true');
    const label = el(doc, 'span', 'dm-qk__label');
    const chip = el(doc, 'span', 'dm-qk__chip');
    chip.hidden = true;
    const text = el(doc, 'p', 'dm-qk__text');
    text.hidden = true;
    item.append(disc, label, chip, text);
    flow.append(item);
    return { row: item, label, chip, text };
  }

  const decision = row('decision', 'note');
  setText(decision.label, 'The decision');
  const tests = TEST_IDS.map((id) => ({ id, ...row(id, 'test') }));
  const end = row('end', 'end');

  const ask = el(doc, 'div', 'dm-qk__ask');
  ask.hidden = true;
  const buttons = (['yes', 'no'] as const).map((answer) => {
    const button = el(doc, 'button', 'dm-qk__answer', answer === 'yes' ? 'Yes' : 'No') as HTMLButtonElement;
    button.type = 'button';
    button.dataset.answer = answer;
    button.addEventListener('click', () => {
      const node = ask.dataset.node;
      if (!node || button.getAttribute('aria-disabled') === 'true') return;
      for (const b of buttons) b.setAttribute('aria-disabled', 'true');
      opts.onAnswer?.(node, answer);
    });
    ask.append(button);
    return button;
  });

  const band = el(doc, 'div', 'dm-qk__band');
  band.setAttribute('role', 'group');
  band.setAttribute('aria-label', 'The Stop Rule');
  const ifText = el(doc, 'span', 'dm-qk__band-text');
  const thenText = el(doc, 'span', 'dm-qk__band-text');
  band.append(el(doc, 'span', 'dm-qk__band-word', 'If'), ifText, el(doc, 'span', 'dm-qk__band-word', 'then'), thenText);
  band.hidden = true;

  const check = el(doc, 'p', 'dm-qk__check');
  check.hidden = true;
  const close = el(doc, 'dl', 'dm-qk__close');
  close.hidden = true;

  root.append(rounds, flow, band, check, close);

  return {
    el: root,
    update(state) {
      const now = currentEntry(state);
      const set = testsOf(state);
      const answers = answersOf(state);
      const outcome = outcomeOf(state);
      setAttr(root, 'data-outcome', outcome);

      setText(decision.text, decisionOf(state));
      decision.text.hidden = !decisionOf(state);
      setAttr(decision.row, 'data-now', null);

      tests.forEach(({ id, row: item, label, chip, text }, i) => {
        setText(label, testLabel(state, id));
        const answer = answers[i];
        chip.hidden = !answer;
        setText(chip, answer === 'yes' ? 'Yes' : answer === 'no' ? 'No' : '');
        setAttr(item, 'data-answer', answer);
        const note = state.path.find((entry) => entry.node === id && entry.round === state.rounds)?.note ?? '';
        setText(text, note);
        text.hidden = !note;
        // A test after a no, or before the tests are set, is not on the path.
        setAttr(item, 'data-off', !set || answers.slice(0, i).includes('no') ? 'true' : null);
        setAttr(item, 'data-now', now?.node === id ? 'true' : null);
      });

      setText(end.label, outcome === 'proceed' ? 'Proceed' : outcome === 'stop' ? 'Do not proceed' : 'Three yeses to proceed');
      setAttr(end.row, 'data-end', outcome);

      const asking = now && isTest(now.node) && opts.onAnswer ? now.node : null;
      if (asking) {
        const host = tests.find((t) => t.id === asking)!.row;
        if (ask.parentElement !== host) host.append(ask);
        if (ask.dataset.node !== asking) {
          ask.dataset.node = asking;
          for (const b of buttons) b.removeAttribute('aria-disabled');
        }
        ask.hidden = false;
        for (const b of buttons) b.setAttribute('aria-label', `${b.dataset.answer === 'yes' ? 'Yes' : 'No'}: ${testLabel(state, asking)}`);
      } else {
        ask.hidden = true;
        delete ask.dataset.node;
      }

      const rule = stopRuleOf(state);
      band.hidden = outcome !== 'proceed';
      setText(ifText, rule?.trigger ?? 'what would make you stop');
      setText(thenText, rule?.action ?? 'what you will do, agreed now');
      setAttr(band, 'data-set', rule?.action ? 'true' : null);

      check.hidden = !state.check;
      setText(check, state.check ? `Check on ${checkDateText(state.check.due)}` : '');

      const closing = (['learn', 'next'] as const).flatMap((id) => {
        const note = state.path.filter((entry) => entry.node === id && entry.round === state.rounds && entry.note).at(-1)?.note;
        return note ? [[QUICK_NODES[id].label, note] as const] : [];
      });
      const sig = JSON.stringify(closing);
      if (close.dataset.sig !== sig) {
        close.dataset.sig = sig;
        close.replaceChildren(...closing.flatMap(([term, note]) => [el(doc, 'dt', 'dm-qk__term', term), el(doc, 'dd', 'dm-qk__note', note)]));
      }
      close.hidden = !closing.length;

      const earlier = Array.from({ length: state.rounds - 1 }, (_, i) => outcomeOf(state, i + 1)).map((o, i) => `Round ${i + 1} ${o ? ROUND_WORDS[o] : 'was left open'}.`);
      rounds.hidden = !earlier.length;
      setText(rounds, earlier.length ? `Round ${state.rounds}. ${earlier.join(' ')}` : '');
    },
    destroy() {
      root.remove();
    }
  };
}
````

- [ ] **Step 2: Create the page**

**Create `apps/tasks/src/views/decision-book/quick-view.ts`:**

````ts
// apps/tasks/src/views/decision-book/quick-view.ts
// The quick decision page (the Yes/No chart with the Stop Rule band, the coach, the check card,
// It came back and Go deeper) and the "From a quick decision" panel a full decision shows when
// it came from one. Shaped like Problem Solver's lightning-view.ts. The page owns no network
// calls: view.ts passes handlers that go through the session sync.
import { el } from '@/views/hub-kit';
import { errorMessage } from '@/views/feedback';
import { decisionOf } from '../../../../../packages/decision-book/quick.mjs';
import { checkDateText, createQuickView, type QuickAnswer, type QuickView } from '../../../../../packages/decision-book/render/quick';
import type { DmQuickState, PsAction, PsSession } from '../../../../../packages/problem-solver/types';
import { mountCoachPanel, type CoachPanel } from '../problem-solver/coach-panel';
import { isBusy } from '../problem-solver/api';
import { DM_LOOK } from './decor';

const sessionHref = (id: string): string => `#/decision-maker?id=${encodeURIComponent(id)}`;

export type QuickPageHandlers = {
  /** A Yes or No on the test being asked. */
  onAnswer(node: string, answer: QuickAnswer): void;
  onSay(text: string): void;
  /** Coach panel actions: retry, escalate (Go deeper) and dismiss_suggestion. */
  onAction(action: PsAction): void;
  /** "It came back"; resolves once the new round is posted (or failed). */
  onAgain(): Promise<void>;
  /** The check card: make the task (resolves once it is linked) or set it aside. */
  onCheck(create: boolean): Promise<void>;
};

export type QuickPage = {
  el: HTMLElement;
  coach: CoachPanel;
  update(session: PsSession): void;
  /** A short failure note above the composer, replaced by the next one. */
  flash(err: unknown): void;
  /** Let the chart's Yes and No be pressed again after an answer that did not go through. */
  releaseAnswer(): void;
  /** Hold Go deeper while its post is out ("Opening a full decision…"). */
  setEscalating(pending: boolean): void;
  focusComposer(): void;
  destroy(): void;
};

/** The check card: the date the run set, offered as a task until it is made or set aside. */
function checkCard(onCheck: QuickPageHandlers['onCheck']): { el: HTMLElement; update(state: DmQuickState | null | undefined, title: string): void } {
  const card = el('div', 'dm-qk-check confirm-card');
  card.hidden = true;
  const line = el('p', 'dm-qk-check__line');
  const status = el('p', 'dm-qk-check__status');
  status.setAttribute('role', 'status');
  const create = el('button', 'btn btn--primary', 'Create check task') as HTMLButtonElement;
  create.type = 'button';
  const later = el('button', 'btn btn--ghost', 'Not now') as HTMLButtonElement;
  later.type = 'button';
  const row = el('div', 'dm-qk-check__actions');
  row.append(create, later);
  card.append(el('p', 'dm-qk-check__title', 'A dated check'), line, row, status);
  const press = async (make: boolean) => {
    if (create.disabled) return;
    create.disabled = later.disabled = true;
    status.textContent = '';
    try {
      await onCheck(make);
    } catch (err) {
      status.textContent = errorMessage(err);
    } finally {
      create.disabled = later.disabled = false;
    }
  };
  create.addEventListener('click', () => void press(true));
  later.addEventListener('click', () => void press(false));
  return {
    el: card,
    update(state, title) {
      const check = state?.check;
      card.hidden = !check || Boolean(check.taskId) || check.dismissed;
      if (check) line.textContent = `Check "${title}" on ${checkDateText(check.due)}.`;
    }
  };
}

export function mountQuickPage(session: PsSession, handlers: QuickPageHandlers): QuickPage {
  const page = el('div', 'ps-page ps-session ps-scope dm-scope dm-page dm-qk-page');
  const back = el('a', 'ps-back', '← Decisions') as HTMLAnchorElement;
  back.href = '#/decision-maker';
  const title = el('h2', 'ps-session__title', session.title);
  const kicker = el('p', 'dm-qk-page__kicker', 'Quick decision: three yes/no tests, then a Stop Rule');

  const chart = createQuickView(document, { onAnswer: (node, answer) => handlers.onAnswer(node, answer) });
  const chartRow = el('section', 'dm-qk-page__chart');
  chartRow.append(chart.el);

  const check = checkCard((make) => handlers.onCheck(make));

  // How the run goes on: It came back once it is done; Go deeper while it has not gone deeper.
  const actions = el('div', 'dm-qk-page__actions');
  const doneLine = el('p', 'dm-qk-page__done-line', 'That call is made');
  const again = el('button', 'btn btn--ghost dm-qk-page__again', 'It came back') as HTMLButtonElement;
  again.type = 'button';
  again.addEventListener('click', async () => {
    if (again.disabled) return;
    again.disabled = true;
    try {
      await handlers.onAgain();
    } finally {
      again.disabled = false;
    }
  });
  const deeper = el('button', 'btn btn--ghost dm-qk-page__deeper', 'Go deeper') as HTMLButtonElement;
  deeper.type = 'button';
  deeper.addEventListener('click', () => {
    if (!deeper.disabled) handlers.onAction('escalate');
  });
  const pending = el('p', 'dm-qk-page__pending', 'Opening a full decision…');
  pending.setAttribute('role', 'status');
  pending.hidden = true;
  actions.append(doneLine, again, deeper, pending);

  const sent = el('div', 'dm-qk-page__sent');
  sent.setAttribute('role', 'status');
  sent.hidden = true;
  const sentLink = el('a', 'dm-qk-page__sent-link', 'Open the full decision') as HTMLAnchorElement;
  sent.append(el('p', 'dm-qk-page__sent-line', 'This went on to a full decision.'), sentLink);

  const coach = mountCoachPanel({ onSay: (text) => handlers.onSay(text), onAction: (action) => handlers.onAction(action) }, { look: DM_LOOK });
  const board = el('div', 'dm-qk-page__board');
  board.append(check.el, actions, sent, coach.el);
  const body = el('div', 'dm-qk-page__body');
  body.append(chartRow, board);
  page.append(back, title, kicker, body);

  let destroyed = false;
  let busy = isBusy(session);
  let escalating = false;
  const answerButtons = () => [...chart.el.querySelectorAll<HTMLButtonElement>('.dm-qk__answer')];

  /** While the coach is thinking, the chart's Yes and No wait with it; they come back once it has answered. */
  let lockedForCoach = false;
  function lockAnswers(): void {
    if (busy) {
      lockedForCoach = true;
      for (const button of answerButtons()) button.setAttribute('aria-disabled', 'true');
    } else if (lockedForCoach) {
      lockedForCoach = false;
      for (const button of answerButtons()) button.removeAttribute('aria-disabled');
    }
  }

  /** Go deeper, on the page and on the coach's card, waits while its post is out or the coach is thinking. */
  function holdDeeper(): void {
    deeper.disabled = escalating || busy;
    pending.hidden = !escalating;
    for (const button of coach.el.querySelectorAll<HTMLButtonElement>('.ps-suggestion__actions button')) button.disabled = escalating || busy;
  }

  return {
    el: page,
    coach,
    update(next) {
      if (destroyed) return;
      if (title.textContent !== next.title) title.textContent = next.title;
      const state = next.quick;
      busy = isBusy(next);
      if (state) chart.update(state);
      lockAnswers();
      check.update(state, state ? decisionOf(state) || next.title : next.title);
      const escalatedTo = state?.escalatedTo ?? null;
      sent.hidden = !escalatedTo;
      if (escalatedTo && sentLink.getAttribute('href') !== sessionHref(escalatedTo)) sentLink.href = sessionHref(escalatedTo);
      const finished = Boolean(state?.finishedAt);
      actions.hidden = Boolean(escalatedTo);
      doneLine.hidden = !finished;
      again.hidden = !finished;
      coach.update(next);
      holdDeeper();
    },
    flash(err) {
      coach.el.querySelector('.ps-coach__status--failed.is-transient')?.remove();
      coach.el.querySelector('.ps-coach__extras')?.prepend(el('p', 'ps-coach__status ps-coach__status--failed is-transient', errorMessage(err)));
    },
    releaseAnswer() {
      if (busy) return;
      for (const button of answerButtons()) button.removeAttribute('aria-disabled');
    },
    setEscalating(value) {
      escalating = value;
      holdDeeper();
    },
    focusComposer() {
      const input = coach.el.querySelector<HTMLTextAreaElement>('textarea');
      if (input && !input.disabled) input.focus();
    },
    destroy() {
      destroyed = true;
      chart.destroy();
    }
  };
}

/**
 * On a full decision that came from a quick run: a closed panel that, opened, fetches the run once
 * and shows its chart read-only, with a link back to it. A failed fetch offers a retry.
 */
export function mountFromQuick(runId: string, get: (id: string) => Promise<PsSession>): { el: HTMLDetailsElement; destroy(): void } {
  const panel = el('details', 'ps-ltn-from dm-qk-from') as HTMLDetailsElement;
  const summary = el('summary', 'ps-ltn-from__summary', 'From a quick decision: the tests tried first');
  const body = el('div', 'ps-ltn-from__body');
  panel.append(summary, body);
  let chart: QuickView | null = null;
  let loading = false;
  let destroyed = false;

  async function load(): Promise<void> {
    if (chart || loading || destroyed) return;
    loading = true;
    const focused = body.contains(document.activeElement);
    body.replaceChildren(el('p', 'ps-ltn-from__status', 'Loading…'));
    try {
      const run = await get(runId);
      if (destroyed) return;
      const view = createQuickView(document);
      if (run.quick) view.update(run.quick);
      chart = view;
      const link = el('a', 'ps-ltn-from__link', 'Open the quick decision') as HTMLAnchorElement;
      link.href = sessionHref(runId);
      body.replaceChildren(view.el, link);
    } catch {
      if (destroyed) return;
      const retry = el('button', 'ps-ltn-from__retry', 'Try again') as HTMLButtonElement;
      retry.type = 'button';
      retry.addEventListener('click', () => void load());
      const failed = el('div', 'ps-ltn-from__failed');
      failed.setAttribute('role', 'alert');
      failed.append(el('p', 'ps-ltn-from__status', 'Could not load the quick decision.'), retry);
      body.replaceChildren(failed);
      if (focused) retry.focus();
    } finally {
      loading = false;
    }
  }

  panel.addEventListener('toggle', () => {
    if (panel.open) void load();
  });
  return {
    el: panel,
    destroy() {
      destroyed = true;
      chart?.destroy();
      chart = null;
    }
  };
}
````

- [ ] **Step 3: Apply the patch**

````diff
diff --git a/apps/tasks/src/views/decision-book/decision-book-view.css b/apps/tasks/src/views/decision-book/decision-book-view.css
index 7c2e70515..dbea473e9 100644
--- a/apps/tasks/src/views/decision-book/decision-book-view.css
+++ b/apps/tasks/src/views/decision-book/decision-book-view.css
@@ -31,6 +31,10 @@
 .dm-quick { border-color: transparent; background: var(--dm-green-tint); }
 .dm-quick__mark { display: inline-grid; width: 2rem; height: 2rem; }
 .dm-quick__mark svg { width: 100%; height: 100%; }
+.dm-quick .ps-lightning-card__input, .dm-quick .ps-lightning-card__go { border-color: var(--dm-ink); }
+.dm-quick .ps-lightning-card__go { background: var(--dm-ink); color: var(--dm-paper); }
+.ps-prob__medal--quick { display: grid; place-items: center; }
+.ps-prob__medal--quick svg { width: 100%; height: 100%; }
 
 .dm-medal { display: block; width: 100%; height: 100%; overflow: visible; }
 .dm-medal__piece { transform-box: fill-box; transform-origin: center; transition: transform 420ms var(--dm-spring); }
@@ -102,3 +106,22 @@
 @media (prefers-reduced-motion: reduce) {
   .dm-build__pair path, .dm-go, .dm-turn { animation: none; }
 }
+
+/* ── Quick decision ── */
+.ps-scope.dm-qk-page { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
+.dm-qk-page__kicker { margin: 0; color: var(--muted); font-size: var(--text-sm); }
+.dm-qk-page__body { display: grid; gap: var(--space-4); grid-template-columns: minmax(0, 1fr); align-items: start; }
+@media (min-width: 900px) { .dm-qk-page__body { grid-template-columns: minmax(18rem, 26rem) minmax(0, 1fr); } }
+.dm-qk-page__chart { min-width: 0; padding: var(--space-4); border: 2px solid var(--dm-ink); border-radius: var(--radius-xl); background: var(--dm-paper); }
+.dm-qk-page__board { display: grid; gap: var(--space-3); min-width: 0; }
+.dm-qk-page__actions, .dm-qk-page__sent { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); }
+.dm-qk-page__actions[hidden], .dm-qk-page__sent[hidden], .dm-qk-page__actions [hidden], .dm-qk-check[hidden] { display: none; }
+.dm-qk-page__done-line, .dm-qk-page__sent-line { flex: 1 1 10rem; margin: 0; font-weight: var(--weight-semibold); }
+.dm-qk-page__pending { margin: 0; color: var(--muted); font-size: var(--text-sm); }
+.dm-qk-page__sent { padding: var(--space-3) var(--space-4); border: 1.5px solid var(--dm-ink); border-radius: var(--radius-lg); }
+.dm-qk-page__sent-link { display: inline-flex; align-items: center; min-height: 44px; color: var(--dm-ink); font-weight: var(--weight-semibold); text-underline-offset: 3px; }
+.dm-qk-check { display: grid; gap: var(--space-2); }
+.dm-qk-check__title { margin: 0; font-weight: var(--weight-bold); }
+.dm-qk-check__line, .dm-qk-check__status { margin: 0; font-size: var(--text-sm); }
+.dm-qk-check__status:empty { display: none; }
+.dm-qk-check__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
diff --git a/apps/tasks/src/views/decision-book/decor.ts b/apps/tasks/src/views/decision-book/decor.ts
index 685fd2396..4609605b7 100644
--- a/apps/tasks/src/views/decision-book/decor.ts
+++ b/apps/tasks/src/views/decision-book/decor.ts
@@ -289,5 +289,6 @@ export const DM_LOOK: CoachLook = {
       prompts: ['What are you deciding?', 'Who is it about, and what do you want?', 'What do you already know?']
     }
   },
-  noun: 'Decision'
+  noun: 'Decision',
+  escalate: { title: 'This needs a full decision', accept: 'Go deeper' }
 };
diff --git a/apps/tasks/src/views/decision-book/view.ts b/apps/tasks/src/views/decision-book/view.ts
index 215893571..b0b37a96e 100644
--- a/apps/tasks/src/views/decision-book/view.ts
+++ b/apps/tasks/src/views/decision-book/view.ts
@@ -4,6 +4,7 @@
 // (track, compass above the canvas, coach, skill tray, review panel, task and record cards).
 // Its structure is Problem Solver's: the coach panel, task cards, bridges, review panel and
 // syncs are Problem Solver's own components, given Decision Maker's API, look and record.
+// A quick decision has its own page (quick-view.ts), as a Lightning run does in Problem Solver.
 import '../../../../../packages/problem-solver/problem-solver.css';
 import '../../../../../packages/decision-book/decision-book.css';
 import '../problem-solver/problem-solver-view.css';
@@ -20,10 +21,11 @@ import { reviewStart, waitingForReview } from '../../../../../packages/problem-s
 import type { PsAction, PsRecordOffer, PsSession, PsSummary } from '../../../../../packages/problem-solver/types';
 import { SECTIONS, modelsInSection } from '../../../../../packages/decision-book/catalogue.mjs';
 import { composeRecord, recordOffer } from '../../../../../packages/decision-book/record.mjs';
+import { currentEntry as quickEntry, decisionOf } from '../../../../../packages/decision-book/quick.mjs';
 import { modelEmblem, sectionEmblem } from '../../../../../packages/decision-book/glyphs';
 import { decisionBookApi, isBusy, pollUntilSettled, problemSolverApi } from '../problem-solver/api';
 import { mountCoachPanel } from '../problem-solver/coach-panel';
-import { createTaskBridge, type TaskOrigin } from '../problem-solver/task-bridge';
+import { createTaskBridge, taskBody, type TaskOrigin } from '../problem-solver/task-bridge';
 import { mountReviewPanel, reviewBanner, type ReviewEntry } from '../problem-solver/review-panel';
 import { createReviewSync } from '../problem-solver/review-sync';
 import { compactToday, mountTaskCards, type PlaceOption } from '../problem-solver/task-cards';
@@ -34,6 +36,7 @@ import { caseFilePlaces, createSkillTray, section } from '../problem-solver/view
 import { BACK_DISC, DM_LOOK, FORWARD_DISC, createCompass, createShapeBoard, createTrack, decisionMedal, plainName, toolNamed } from './decor';
 import { mountDecisionCanvas, type DmRunScores } from './canvas';
 import { recordBlocks, recordGraphic } from './record-blocks';
+import { mountFromQuick, mountQuickPage } from './quick-view';
 
 let poll: AbortController | null = null;
 /** The open session's canvas and Tasks listeners, dropped when the page changes. */
@@ -54,12 +57,19 @@ function art(markup: string, className?: string): SVGSVGElement {
 
 /* ── Landing ────────────────────────────────────────────────────────── */
 
+const QUICK_LABELS = { proceed: 'Proceed', stop: 'Do not proceed' } as const;
+
+/** A quick row's label: where it went, how it came out, or still going. */
+const quickLabel = (row: PsSummary): string => (row.escalatedTo ? 'Went deeper' : row.outcome ? QUICK_LABELS[row.outcome] : 'Quick decision');
+
 const phaseLabel = (row: PsSummary): string =>
-  row.phase === 'frame' ? 'Framing' : row.phase === 'finished' ? 'Finished' : row.model ? stepName(row.model, row.phase) : row.phase;
+  row.kind === 'quick' ? quickLabel(row)
+    : row.phase === 'frame' ? 'Framing' : row.phase === 'finished' ? 'Finished' : row.model ? stepName(row.model, row.phase) : row.phase;
 const phaseColour = (phase: string): string => (phase === 'frame' ? 'var(--dm-red)' : phase === 'finished' ? 'var(--dm-ink)' : 'var(--dm-green)');
 
 /** The meta line's middle part: the question being framed, the model in hand, or the review date. */
 function metaNote(row: PsSummary): string {
+  if (row.kind === 'quick') return row.status === 'active' ? 'Quick decision' : '';
   if (row.phase === 'frame') return `Question ${Math.min((row.frame ?? 0) + 1, 3)} of 3`;
   if (row.reviewDue) return `Review due ${formatDisplayDate(row.reviewDue)}`;
   const model = row.main ?? row.tool;
@@ -72,12 +82,18 @@ function decisionCard(row: PsSummary, index: number): HTMLLIElement {
   const link = el('a', 'ps-prob__link') as HTMLAnchorElement;
   link.href = `#/decision-maker?id=${row.id}`;
   const medal = el('span', 'ps-prob__medal');
-  const frame = row.frame ?? (row.phase === 'frame' ? 0 : 3);
-  medal.append(decisionMedal(frame, row.main ?? null));
+  if (row.kind === 'quick') {
+    // A quick decision's badge is its end: green forward on proceed, red back on do not proceed.
+    medal.classList.add('ps-prob__medal--quick');
+    medal.append(art(row.outcome === 'stop' ? BACK_DISC : row.outcome === 'proceed' ? FORWARD_DISC : QUICK_PAIR));
+  } else {
+    const frame = row.frame ?? (row.phase === 'frame' ? 0 : 3);
+    medal.append(decisionMedal(frame, row.main ?? null));
+  }
   const body = el('span', 'ps-prob__body');
   const meta = el('span', 'ps-prob__meta');
   const phase = el('span', 'ps-prob__phase', phaseLabel(row));
-  phase.style.setProperty('--c', phaseColour(row.phase));
+  phase.style.setProperty('--c', row.kind === 'quick' ? (row.outcome === 'stop' ? 'var(--dm-red)' : 'var(--dm-green)') : phaseColour(row.phase));
   meta.append(phase, el('span', '', metaNote(row)), el('span', '', formatDisplayDate(row.updatedAt.slice(0, 10))));
   body.append(el('span', 'ps-prob__title', row.title), meta);
   const seen = Object.keys(row.skills ?? {});
@@ -150,14 +166,46 @@ function startForm(onType: () => void): StartForm {
   };
 }
 
-/** The quick route's card. Its flow arrives with the Quick decision plan; until then it says so. */
+/** The two cover discs side by side: the quick route's mark, and a quick run's badge while it is open. */
+const QUICK_PAIR = '<g transform="translate(-2 26) scale(0.52)">' + BACK_DISC + '</g><g transform="translate(50 26) scale(0.52)">' + FORWARD_DISC + '</g>';
+
+/** The quick route's card: one line, then a quick session (as Problem Solver's Lightning card). */
 function quickCard(): HTMLElement {
   const card = el('section', 'ps-lightning-card dm-quick');
   const head = el('div', 'ps-lightning-card__head');
   const mark = el('span', 'dm-quick__mark');
-  mark.append(art('<g transform="translate(-2 26) scale(0.52)">' + BACK_DISC + '</g><g transform="translate(50 26) scale(0.52)">' + FORWARD_DISC + '</g>'));
+  mark.append(art(QUICK_PAIR));
   head.append(mark, el('h2', 'ps-lightning-card__title', 'Quick decision'));
-  card.append(head, el('p', 'ps-lightning-card__line', 'A yes/no check and a Stop Rule for everyday calls. Coming soon: for now, start a decision above.'));
+  const form = el('form', 'ps-lightning-card__form') as HTMLFormElement;
+  const input = el('input', 'ps-lightning-card__input') as HTMLInputElement;
+  input.type = 'text';
+  input.placeholder = 'What is the call?';
+  input.setAttribute('aria-label', 'Describe the quick decision');
+  const go = el('button', 'ps-lightning-card__go', 'Go') as HTMLButtonElement;
+  go.type = 'submit';
+  const status = el('p', 'ps-lightning-card__status');
+  status.setAttribute('role', 'status');
+  const row = el('div', 'ps-lightning-card__row');
+  row.append(input, go);
+  form.append(row, status);
+  card.append(head, el('p', 'ps-lightning-card__line', 'Three yes/no tests and a Stop Rule, for everyday calls.'), form);
+  form.addEventListener('submit', async (event) => {
+    event.preventDefault();
+    const text = input.value.trim();
+    if (!text) {
+      input.focus();
+      return;
+    }
+    go.disabled = true;
+    status.textContent = '';
+    try {
+      const session = await decisionBookApi.create({ text, kind: 'quick' });
+      location.hash = `#/decision-maker?id=${session.id}`;
+    } catch (err) {
+      status.textContent = errorMessage(err);
+      go.disabled = false;
+    }
+  });
   return card;
 }
 
@@ -317,8 +365,124 @@ function syncFor(initial: PsSession, render: (session: PsSession) => void, alive
   });
 }
 
+const isConflict = (err: unknown): boolean => (err as { code?: string }).code === 'conflict';
+
+/**
+ * A quick decision: the Yes/No chart (Yes and No on the test being asked), the coach, the check
+ * card, It came back and Go deeper. Every action goes through the session sync; a conflict refetches.
+ */
+async function renderQuickSession(canvas: HTMLElement, initial: PsSession): Promise<void> {
+  const view = mountQuickPage(initial, {
+    onAnswer: (node, answer) => void answerTest(node, answer),
+    onSay: (text) => void say(text),
+    onAction: (action) => void coachAction(action),
+    onAgain: () => again(),
+    onCheck: (create) => check(create)
+  });
+  canvas.replaceChildren(view.el);
+  canvasNow = view;
+  const alive = () => view.el.isConnected;
+  const sync = syncFor(initial, (next) => view.update(next), alive);
+
+  async function recover(err: unknown): Promise<void> {
+    if (!alive()) return;
+    if (!isConflict(err)) return view.flash(err);
+    try {
+      sync.paint(await decisionBookApi.get(sync.session().id));
+    } catch (fetchErr) {
+      view.flash(fetchErr);
+    }
+  }
+
+  async function post(action: PsAction, payload: Record<string, unknown>): Promise<boolean> {
+    try {
+      await sync.confirmed(action, payload);
+      return true;
+    } catch (err) {
+      await recover(err);
+      return false;
+    }
+  }
+  const settleIfBusy = async () => {
+    if (alive() && isBusy(sync.session())) await sync.settle();
+  };
+
+  /** A click on a test that has moved on, or while the coach is thinking, is dropped, not posted. */
+  async function answerTest(node: string, answer: 'yes' | 'no'): Promise<void> {
+    const now = sync.session();
+    const current = now.quick ? quickEntry(now.quick) : null;
+    if (!current || current.node !== node || isBusy(now)) {
+      view.releaseAnswer();
+      return;
+    }
+    if (await post('quick_answer', { node, answer })) await settleIfBusy();
+    else view.releaseAnswer();
+  }
+
+  async function again(): Promise<void> {
+    if (!(await post('quick_again', {}))) return;
+    await settleIfBusy();
+    if (alive()) view.focusComposer();
+  }
+
+  /** The check card: a task due on the check date, then linked; or set aside. A failure stays on the card. */
+  let checkTask: string | null = null;
+  async function check(create: boolean): Promise<void> {
+    const now = sync.session();
+    const due = now.quick?.check?.due;
+    if (!create || !due) {
+      await sync.confirmed('quick_check', { dismissed: true });
+      return;
+    }
+    const title = `Check: ${decisionOf(now.quick!) || now.title}`;
+    if (!checkTask) checkTask = (await tasksApi.createTask({ ...taskBody(now, { title, due }, 'life', undefined, ORIGIN), tags: [ORIGIN.tag, 'check'] })).id;
+    await sync.confirmed('quick_check', { taskId: checkTask });
+    checkTask = null;
+  }
+
+  const openFull = (to: string) => {
+    if (alive()) location.hash = `#/decision-maker?id=${encodeURIComponent(to)}`;
+  };
+
+  /** Go deeper. A run that already went deeper (in another tab, say) opens its full decision. */
+  async function escalate(): Promise<void> {
+    view.setEscalating(true);
+    try {
+      await sync.confirmed('escalate', {});
+    } catch (err) {
+      const already = sync.session().quick?.escalatedTo;
+      if (already) return openFull(already);
+      view.setEscalating(false);
+      await recover(err);
+      return;
+    }
+    const to = sync.session().quick?.escalatedTo;
+    if (to) openFull(to);
+    else view.setEscalating(false);
+  }
+
+  async function coachAction(action: PsAction): Promise<void> {
+    if (action === 'escalate') return escalate();
+    if (await post(action, {})) await settleIfBusy();
+  }
+
+  async function say(text: string): Promise<void> {
+    try {
+      sync.paint(await sync.enqueue(() => decisionBookApi.act(sync.session(), 'say', text)));
+    } catch (err) {
+      await recover(err);
+      return;
+    }
+    await settleIfBusy();
+  }
+
+  view.update(initial);
+  await settleIfBusy();
+}
+
 async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
   let session = await decisionBookApi.get(id);
+  if (session.kind === 'quick') return renderQuickSession(canvas, session);
   const page = el('div', 'ps-page ps-session ps-scope dm-scope dm-page');
   const back = el('a', 'ps-back', '← Decisions') as HTMLAnchorElement;
   back.href = '#/decision-maker';
@@ -330,7 +494,10 @@ async function renderSession(canvas: HTMLElement, id: string): Promise<void> {
   const canvasHost = el('div', 'ps-canvas dm-canvas');
   const tray = createSkillTray();
   const review = mountReviewPanel({ start: () => void reviews.startReview() });
-  bench.append(review.el, compass.el, canvasHost, tray.el);
+  // A decision that went deeper from a quick run shows that run's chart, closed until opened.
+  const fromQuick = session.escalatedFrom ? mountFromQuick(session.escalatedFrom, (runId) => decisionBookApi.get(runId)) : null;
+  if (fromQuick) unsubscribeNow.push(() => fromQuick.destroy());
+  bench.append(review.el, compass.el, canvasHost, ...(fromQuick ? [fromQuick.el] : []), tray.el);
   const cards = mountTaskCards({
     create: (proposal, edits) => bridge.create(session, proposal, edits),
     dismiss: (proposal) => confirmed('dismiss_task', { proposalId: proposal.id }),
diff --git a/apps/tasks/src/views/problem-solver/api.ts b/apps/tasks/src/views/problem-solver/api.ts
index 1111dfa33..c92b9a041 100644
--- a/apps/tasks/src/views/problem-solver/api.ts
+++ b/apps/tasks/src/views/problem-solver/api.ts
@@ -14,7 +14,7 @@ export function createSessionApi(base: string) {
   const api = {
     list: () => apiGet<{ sessions: PsSummary[] }>(`${base}?list=1`).then((r) => r.sessions),
     get: (id: string) => apiGet<{ session: PsSession }>(`${base}?id=${encodeURIComponent(id)}`).then((r) => r.session),
-    create: (body: { text: string; title?: string; links?: PsSession['links']; kind?: 'full' | 'lightning' | 'decision'; startModel?: string }) =>
+    create: (body: { text: string; title?: string; links?: PsSession['links']; kind?: 'full' | 'lightning' | 'decision' | 'quick'; startModel?: string }) =>
       apiPost<{ session: PsSession }>(base, { create: { ...body, requestId: crypto.randomUUID() } }).then((r) => r.session),
     act: (session: PsSession, action: PsAction, text?: string) =>
       apiPost<{ session: PsSession }>(base, { id: session.id, revision: session.revision, requestId: crypto.randomUUID(), action, ...(text ? { text } : {}) }).then((r) => r.session),
diff --git a/apps/tasks/src/views/problem-solver/coach-panel.ts b/apps/tasks/src/views/problem-solver/coach-panel.ts
index f82d881f7..1e68ee029 100644
--- a/apps/tasks/src/views/problem-solver/coach-panel.ts
+++ b/apps/tasks/src/views/problem-solver/coach-panel.ts
@@ -19,6 +19,8 @@ export type CoachLook = {
   emblem(tool: string): Element;
   frames: Record<string, { keys: string[]; prompts: string[] }>;
   noun: string;
+  /** The card that offers a quick route's way on to a full session. */
+  escalate?: { title: string; accept: string };
 };
 
 const PS_LOOK: CoachLook = {
@@ -89,8 +91,8 @@ function suggestionCard(session: PsSession, handlers: CoachPanelHandlers, look:
     title = `Reopen: ${model && target ? stepName(model, target) : suggestion.step}`;
     accept = 'Reopen it';
   } else if (suggestion.kind === 'escalate') {
-    title = 'This needs the full process';
-    accept = 'Start the full process';
+    title = look.escalate?.title ?? 'This needs the full process';
+    accept = look.escalate?.accept ?? 'Start the full process';
     acceptAction = 'escalate';
   } else {
     title = `${suggestion.kind === 'switch_tool' ? 'Switch to' : 'Next'}: ${TOOLS[suggestion.tool].name}`;
@@ -157,7 +159,8 @@ export function mountCoachPanel(handlers: CoachPanelHandlers, slots: { cards?: H
       const busy = session.runner.status === 'queued' || session.runner.status === 'running';
       // A failed boundary turn must be retried before anything else: the step has already moved.
       const boundaryFailed = session.runner.status === 'failed' && session.runner.mode === 'boundary';
-      const lightning = session.kind === 'lightning';
+      // A Lightning run or a quick decision: a fixed flow with no frame and no steps.
+      const lightning = session.kind === 'lightning' || session.kind === 'quick';
       // A finished Lightning run takes no more replies until It came back starts a new round.
       const closed = lightning && session.status !== 'active';
       const locked = busy || boundaryFailed || closed;
diff --git a/packages/decision-book/decision-book.css b/packages/decision-book/decision-book.css
index 110300bd1..5218543e3 100644
--- a/packages/decision-book/decision-book.css
+++ b/packages/decision-book/decision-book.css
@@ -367,6 +367,48 @@
   .dm-record__stop, .dm-record__ends { grid-template-columns: 1fr; }
 }
 
+/* ------------------------------------------------------------------ quick decision
+   The Yes/No flow (render/quick.ts): discs on a dotted line, the answered path inked, a test
+   off the path faint; Proceed is a green disc, Do not proceed a red one; the Stop Rule is an
+   if/then band underneath. */
+.dm-qk { display: grid; gap: 14px; min-width: 0; color: var(--dm-ink); }
+.dm-qk [hidden] { display: none !important; }
+.dm-qk__rounds { margin: 0; font: 600 12px / 1.4 var(--font-ui); color: #66675d; }
+.dm-qk__flow { list-style: none; margin: 0; padding: 0; display: grid; }
+.dm-qk__row { position: relative; display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; column-gap: 12px; row-gap: 6px; align-items: center; padding-bottom: 18px; }
+.dm-qk__row:not(:last-child)::before { content: ''; position: absolute; left: 12px; top: 26px; bottom: 0; border-left: 2px dotted var(--dm-ink); }
+.dm-qk__disc { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--dm-ink); background: var(--dm-paper); }
+.dm-qk__row[data-box='decision'] .dm-qk__disc { border-color: var(--dm-red); background: var(--dm-red); }
+.dm-qk__row[data-answer='yes'] .dm-qk__disc { border-color: var(--dm-ink); background: var(--dm-ink); }
+.dm-qk__row[data-answer='no'] .dm-qk__disc { border-color: var(--dm-red); background: var(--dm-red); }
+.dm-qk__row[data-now='true'] .dm-qk__disc { border-style: dashed; }
+.dm-qk__row[data-off='true'] :is(.dm-qk__disc, .dm-qk__label) { opacity: 0.4; }
+.dm-qk__row[data-end='proceed'] .dm-qk__disc { border-color: var(--dm-green); background: var(--dm-green); }
+.dm-qk__row[data-end='stop'] .dm-qk__disc { border-color: var(--dm-red); background: var(--dm-red); }
+.dm-qk__row[data-box='end']:not([data-end]) :is(.dm-qk__disc, .dm-qk__label) { opacity: 0.4; }
+.dm-qk__label { font: 600 14px / 1.4 var(--font-ui); min-width: 0; overflow-wrap: anywhere; }
+.dm-qk__chip { padding: 0 10px; border-radius: 999px; background: var(--dm-ink); color: var(--dm-paper); font: 600 12px / 1.7 var(--font-ui); }
+.dm-qk__row[data-answer='no'] .dm-qk__chip { background: var(--dm-red); color: var(--dm-ink); }
+.dm-qk__text { grid-column: 2 / -1; margin: 0; font: 400 13px / 1.45 var(--font-ui); overflow-wrap: anywhere; }
+.dm-qk__ask { grid-column: 2 / -1; display: flex; gap: 8px; }
+.dm-qk__answer { min-width: 64px; min-height: 40px; padding: 0 16px; border: 2px solid var(--dm-ink); border-radius: 999px; background: var(--dm-paper); color: var(--dm-ink); font: 600 14px / 1 var(--font-ui); cursor: pointer; }
+.dm-qk__answer[data-answer='yes'] { background: var(--dm-green); border-color: var(--dm-green); }
+.dm-qk__answer[data-answer='no'] { background: var(--dm-red); border-color: var(--dm-red); }
+.dm-qk__answer:focus-visible { outline: 2px solid var(--dm-ink); outline-offset: 2px; }
+.dm-qk__answer[aria-disabled='true'] { opacity: 0.5; cursor: default; }
+.dm-qk__band { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: baseline; gap: 6px 12px; padding: 12px 16px; border: 2px solid var(--dm-red); border-radius: 18px; background: var(--dm-red-tint); }
+.dm-qk__band:not([data-set]) .dm-qk__band-text { color: #66675d; }
+.dm-qk__band-word { font: 700 11px / 1.3 var(--font-ui); text-transform: uppercase; letter-spacing: 0.06em; color: #b8301f; }
+.dm-qk__band-text { font: 400 14px / 1.45 var(--font-ui); overflow-wrap: anywhere; }
+.dm-qk__check { margin: 0; justify-self: start; padding: 4px 12px; border-radius: 999px; background: var(--dm-green-tint); font: 600 12px / 1.6 var(--font-ui); }
+.dm-qk__close { display: grid; gap: 4px 12px; grid-template-columns: max-content minmax(0, 1fr); margin: 0; }
+.dm-qk__term { font: 700 12px / 1.45 var(--font-ui); }
+.dm-qk__note { margin: 0; font: 400 13px / 1.45 var(--font-ui); overflow-wrap: anywhere; }
+@media (max-width: 480px) {
+  .dm-qk__close { grid-template-columns: minmax(0, 1fr); }
+  .dm-qk__ask { flex-wrap: wrap; }
+}
+
 /* ------------------------------------------------------------------ reused Problem Solver charts
    SWOT, morphological analysis, Pareto and double-loop learning keep their own renderers. Inside
    Decision Maker their book colours become this palette: red stays red, blue becomes ink and
````

- [ ] **Step 4: Type-check**

Run: `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep -E "problem-solver|decision-book" | grep -v "TS6059\|Imported via\|rootDir" || echo "no problem-solver or decision-book errors"`
Expected: `no problem-solver or decision-book errors`.

- [ ] **Step 5: Create the client tests**

**Create `apps/tasks/tests/unit/decision-book-quick.test.ts`:**

````ts
// Decision Maker's quick route on the client: the Yes/No chart with its Stop Rule band, the quick
// page (answers on the chart, the check card, It came back, Go deeper and where it went), the
// "From a quick decision" panel, the landing card and the list row.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkDateText, createQuickView } from '../../../../packages/decision-book/render/quick';
import { mountFromQuick, mountQuickPage, type QuickPageHandlers } from '../../src/views/decision-book/quick-view';
import { renderDecisionMakerView, unmountDecisionMakerView } from '../../src/views/decision-book/view';
import { decisionBookApi, problemSolverApi } from '../../src/views/problem-solver/api';
import { scriptedCoach } from '../../../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { applyQuickTurn, createQuickSession, escalateQuick, quickAgain, quickCheck } from '../../../../netlify/functions/_shared/problem-solver/quick-session.mjs';
import { say, summaryRow } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';
import type { PsSession, PsSummary } from '../../../../packages/problem-solver/types';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}` };
const idle = (s: PsSession): PsSession => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });

async function step(session: PsSession, text?: string): Promise<PsSession> {
  const next = text ? say(session, text, deps) : session;
  return idle(applyQuickTurn(next, await scriptedCoach(next), deps) as PsSession);
}

/** A quick run walked by the scripted coach through `replies`. */
async function walk(...replies: string[]): Promise<PsSession> {
  let s = await step(createQuickSession({ text: 'Should I take the weekend course?' }, deps) as PsSession);
  for (const reply of replies) s = await step(s, reply);
  return s;
}
const PROCEED = ['use those', 'yes', 'yes', 'yes', 'I miss two sessions', 'Ask to move to the spring run', '2027-01-21'];
const texts = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map((e) => e.textContent);
const handlers = (): QuickPageHandlers & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    onAnswer: (node, answer) => calls.push(`answer ${node} ${answer}`),
    onSay: (text) => calls.push(`say ${text}`),
    onAction: (action) => calls.push(`action ${action}`),
    onAgain: async () => { calls.push('again'); },
    onCheck: async (create) => { calls.push(`check ${create}`); }
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  unmountDecisionMakerView();
  document.body.replaceChildren();
});

describe('the Yes/No chart', () => {
  it('waits for the tests, then inks the path, with Yes and No on the test being asked', async () => {
    const picked: string[] = [];
    const chart = createQuickView(document, { onAnswer: (node, answer) => picked.push(`${node} ${answer}`) });
    chart.update((await walk()).quick!);
    expect(texts(chart.el, '.dm-qk__label')).toEqual(['The decision', 'First test', 'Second test', 'Third test', 'Three yeses to proceed']);
    expect(chart.el.querySelector('[data-box="decision"] .dm-qk__text')!.textContent).toBe('Should I take the weekend course?');
    expect(chart.el.querySelector('.dm-qk__ask')).toBeNull();
    const s = await walk('use those', 'yes');
    chart.update(s.quick!);
    expect(texts(chart.el, '.dm-qk__label').slice(1, 4)).toEqual(['Do I want it?', 'Can I do it?', 'Is it worth it?']);
    expect(chart.el.querySelector('[data-box="test_one"]')!.getAttribute('data-answer')).toBe('yes');
    const now = chart.el.querySelector('[data-now="true"]')!;
    expect(now.getAttribute('data-box')).toBe('test_two');
    expect(now.querySelector('.dm-qk__ask')).not.toBeNull();
    now.querySelector<HTMLButtonElement>('[data-answer="no"]')!.click();
    now.querySelector<HTMLButtonElement>('[data-answer="yes"]')!.click();
    expect(picked).toEqual(['test_two no'], 'one answer per test until the chart moves on');
  });

  it('a no ends at Do not proceed, with the later test off the path and no band', async () => {
    const chart = createQuickView(document);
    chart.update((await walk('use those', 'yes', 'no, weekends are full', 'I agree to things before checking the calendar', 'Leave it for this year')).quick!);
    expect(chart.el.getAttribute('data-outcome')).toBe('stop');
    expect(chart.el.querySelector('[data-box="end"] .dm-qk__label')!.textContent).toBe('Do not proceed');
    expect(chart.el.querySelector('[data-box="test_three"]')!.getAttribute('data-off')).toBe('true');
    expect(chart.el.querySelector('[data-box="test_two"] .dm-qk__text')!.textContent).toBe('weekends are full');
    expect(chart.el.querySelector<HTMLElement>('.dm-qk__band')!.hidden).toBe(true);
    expect(texts(chart.el, '.dm-qk__term')).toEqual(['What did I learn?', 'What next?']);
    expect(chart.el.querySelector('.dm-qk__ask')).toBeNull();
  });

  it('three yeses proceed, with the Stop Rule as an if/then band and the check date', async () => {
    const chart = createQuickView(document);
    chart.update((await walk('use those', 'yes', 'yes', 'yes', 'I miss two sessions')).quick!);
    const band = chart.el.querySelector<HTMLElement>('.dm-qk__band')!;
    expect(band.hidden).toBe(false);
    expect(texts(band, '.dm-qk__band-text')).toEqual(['I miss two sessions', 'what you will do, agreed now']);
    expect(band.hasAttribute('data-set')).toBe(false);
    chart.update((await walk(...PROCEED)).quick!);
    expect(texts(band, '.dm-qk__band-text')).toEqual(['I miss two sessions', 'Ask to move to the spring run']);
    expect(chart.el.querySelector('.dm-qk__check')!.textContent).toBe('Check on 21 Jan 2027');
    expect(checkDateText('2027-01-21')).toBe('21 Jan 2027');
  });

  it('a second round says how the first came out', async () => {
    const done = await walk('use those', 'no', 'It was never wanted', 'Drop it');
    const chart = createQuickView(document);
    chart.update(idle(quickAgain(done, deps) as PsSession).quick!);
    expect(chart.el.querySelector('.dm-qk__rounds')!.textContent).toBe('Round 2. Round 1 did not go ahead.');
    expect(texts(chart.el, '.dm-qk__label')[1]).toBe('First test');
  });
});

describe('the quick page', () => {
  it('answers on the chart, waits while the coach thinks, and offers Go deeper', async () => {
    const h = handlers();
    const s = await walk('use those');
    const page = mountQuickPage(s, h);
    document.body.append(page.el);
    page.update(s);
    page.el.querySelector<HTMLButtonElement>('.dm-qk__answer[data-answer="yes"]')!.click();
    expect(h.calls).toEqual(['answer test_one yes']);
    page.update({ ...s, runner: { status: 'queued', mode: 'turn', error: null } });
    expect(page.el.querySelector('.dm-qk__answer')!.getAttribute('aria-disabled')).toBe('true');
    expect(page.el.querySelector<HTMLButtonElement>('.dm-qk-page__deeper')!.disabled).toBe(true);
    page.update(s);
    expect(page.el.querySelector<HTMLButtonElement>('.dm-qk-page__deeper')!.disabled).toBe(false);
    page.el.querySelector<HTMLButtonElement>('.dm-qk-page__deeper')!.click();
    expect(h.calls.at(-1)).toBe('action escalate');
    expect(page.el.querySelector<HTMLElement>('.dm-qk-page__again')!.hidden).toBe(true);
  });

  it('the coach offers a full decision as Go deeper', async () => {
    const h = handlers();
    const s = await walk('use those', 'go deeper');
    const page = mountQuickPage(s, h);
    page.update(s);
    expect(page.el.querySelector('.ps-suggestion__title')!.textContent).toBe('This needs a full decision');
    page.el.querySelector<HTMLButtonElement>('.ps-suggestion [data-action="escalate"]')!.click();
    expect(h.calls).toEqual(['action escalate']);
  });

  it('a check date offers a task until it is made or set aside; a finished run offers It came back', async () => {
    const h = handlers();
    const s = await walk(...PROCEED, 'I decide faster with the tests written down', 'Book the first session');
    const page = mountQuickPage(s, h);
    page.update(s);
    const card = page.el.querySelector<HTMLElement>('.dm-qk-check')!;
    expect(card.hidden).toBe(false);
    expect(card.querySelector('.dm-qk-check__line')!.textContent).toBe('Check "Should I take the weekend course?" on 21 Jan 2027.');
    card.querySelector<HTMLButtonElement>('.btn--primary')!.click();
    await Promise.resolve();
    expect(h.calls).toContain('check true');
    page.update(quickCheck(s, { taskId: 'task-9' }, deps) as PsSession);
    expect(card.hidden).toBe(true);
    expect(page.el.querySelector<HTMLElement>('.dm-qk-page__again')!.hidden).toBe(false);
    expect(page.el.querySelector('textarea')!.disabled).toBe(true);
  });

  it('once it went deeper the page links to the full decision and offers nothing else', async () => {
    const s = await walk('use those', 'yes');
    const { quick } = escalateQuick(s, 'full-1', deps);
    const page = mountQuickPage(quick as PsSession, handlers());
    page.update(quick as PsSession);
    expect(page.el.querySelector<HTMLElement>('.dm-qk-page__sent')!.hidden).toBe(false);
    expect(page.el.querySelector('.dm-qk-page__sent-link')!.getAttribute('href')).toBe('#/decision-maker?id=full-1');
    expect(page.el.querySelector<HTMLElement>('.dm-qk-page__actions')!.hidden).toBe(true);
  });
});

describe('from a quick decision', () => {
  it('opens closed, loads the run once, and offers a retry when it fails', async () => {
    const run = await walk('use those', 'yes');
    const get = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(run);
    const panel = mountFromQuick(run.id, get);
    document.body.append(panel.el);
    expect(panel.el.open).toBe(false);
    panel.el.open = true;
    panel.el.dispatchEvent(new Event('toggle'));
    await vi.waitFor(() => expect(panel.el.querySelector('.ps-ltn-from__retry')).not.toBeNull());
    panel.el.querySelector<HTMLButtonElement>('.ps-ltn-from__retry')!.click();
    await vi.waitFor(() => expect(panel.el.querySelector('.dm-qk')).not.toBeNull());
    expect(panel.el.querySelector('.ps-ltn-from__link')!.getAttribute('href')).toBe(`#/decision-maker?id=${encodeURIComponent(run.id)}`);
    expect(panel.el.querySelector('.dm-qk__ask')).toBeNull();
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('landing', () => {
  it('the Quick decision card starts a quick run, and a quick row wears its end as the badge', async () => {
    const stopped = summaryRow(await walk('use those', 'no', 'It was never wanted', 'Drop it')) as PsSummary;
    vi.spyOn(decisionBookApi, 'list').mockResolvedValue([stopped]);
    vi.spyOn(problemSolverApi, 'list').mockResolvedValue([]);
    const create = vi.spyOn(decisionBookApi, 'create').mockResolvedValue({ id: 'q-new' } as PsSession);
    location.hash = '#/decision-maker';
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderDecisionMakerView(canvas);
    const row = canvas.querySelector('.dm-prob')!;
    expect(row.querySelector('.ps-prob__phase')!.textContent).toBe('Do not proceed');
    expect(row.querySelector('.ps-prob__medal--quick svg')).not.toBeNull();
    const input = canvas.querySelector<HTMLInputElement>('.dm-quick input')!;
    input.value = 'Buy the bigger tent?';
    canvas.querySelector<HTMLFormElement>('.dm-quick form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(location.hash).toBe('#/decision-maker?id=q-new'));
    expect(create).toHaveBeenCalledWith({ text: 'Buy the bigger tent?', kind: 'quick' });
  });
});
````

- [ ] **Step 6: Run them**

Run: `node --test tests/unit/decision-book-css.test.js && (cd apps/tasks && npx vitest run tests/unit/decision-book-quick.test.ts tests/unit/problem-solver-coach-panel.test.ts tests/unit/problem-solver-lightning-view.test.ts)`
Expected: PASS (the new file has 10 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/decision-book/render/quick.ts apps/tasks/src/views/decision-book/quick-view.ts apps/tasks/tests/unit/decision-book-quick.test.ts apps/tasks/src/views/decision-book/decision-book-view.css apps/tasks/src/views/decision-book/decor.ts apps/tasks/src/views/decision-book/view.ts apps/tasks/src/views/problem-solver/api.ts apps/tasks/src/views/problem-solver/coach-panel.ts packages/decision-book/decision-book.css
git commit -m "Decision Maker: the quick decision page, its chart, the landing card and From a quick decision

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The light source check
**Files:**
- Create: `tests/unit/decision-book-source-check.test.js`
- Modify: `packages/decision-book/models/section-4.mjs`

The spec asks for a light check of the five models with a fixed published structure, so names and order are exact. It was done while drafting this plan:
- **Drexler/Sibbet:** the seven stages and their questions, in order. Correct.
- **Hersey–Blanchard:** direction (leadership) to the right and support upwards. Instructing is high direction and low support, coaching high both, supporting low direction and high support, delegating low both. Correct. The book's word *instructing* stands for the source's first style (telling, or directing).
- **Belbin:** nine roles. Three labels were shortened (*Monitor*, *Team worker*, *Completer*). They now use the source names: Monitor evaluator, Teamworker, Completer finisher.
- **Whitmore:** SMART (5), PURE (4) and CLEAR (5), fourteen in all. Correct.
- **de Bono:** the six hats and what each stands for. Correct.

The test pins only the structure each source fixes; the book stays the authority for how it draws them.

- [ ] **Step 1: Apply the patch**

````diff
diff --git a/packages/decision-book/models/section-4.mjs b/packages/decision-book/models/section-4.mjs
index e2ea50b82..d338cf0f3 100644
--- a/packages/decision-book/models/section-4.mjs
+++ b/packages/decision-book/models/section-4.mjs
@@ -82,10 +82,10 @@ export const dmRolePlaying = listTool({
       { id: 'resource_investigator', label: 'Resource investigator', prompt: 'Explores options, builds contacts' },
       { id: 'coordinator', label: 'Coordinator', prompt: 'Moves decisions along, hands out work' },
       { id: 'shaper', label: 'Shaper', prompt: 'Pushes past obstacles' },
-      { id: 'monitor_evaluator', label: 'Monitor', prompt: 'Tests whether it will work' },
-      { id: 'teamworker', label: 'Team worker', prompt: 'Keeps people talking and things moving' },
+      { id: 'monitor_evaluator', label: 'Monitor evaluator', prompt: 'Tests whether it will work' },
+      { id: 'teamworker', label: 'Teamworker', prompt: 'Keeps people talking and things moving' },
       { id: 'implementer', label: 'Implementer', prompt: 'Turns ideas into practice' },
-      { id: 'completer_finisher', label: 'Completer', prompt: 'Careful, and on time' },
+      { id: 'completer_finisher', label: 'Completer finisher', prompt: 'Careful, and on time' },
       { id: 'specialist', label: 'Specialist', prompt: 'Brings expert knowledge' }
     ],
     entry: 'What one hat brings to the decision, or who fills one role',
````

- [ ] **Step 2: Create the test**

**Create `tests/unit/decision-book-source-check.test.js`:**

````js
// tests/unit/decision-book-source-check.test.js
// The light source check (spec, "Sources"): the five models with a fixed published structure,
// checked against their original sources so names and order are exact. The book is the authority
// for how it draws them; these pin only the structure each source fixes.
//   Drexler/Sibbet  team performance model: seven stages, each with its question, in order.
//   Hersey–Blanchard  situational leadership: four styles from high direction and low support,
//                     through high both and low direction with high support, to low both.
//   Belbin  nine team roles.
//   Whitmore  goals: SMART (5), PURE (4) and CLEAR (5) criteria, fourteen in all.
//   de Bono  six thinking hats: white facts, red feelings, black caution, yellow benefits,
//            green ideas, blue process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';

const chart = (id) => TOOLS[id].chart;
const groups = (id) => chart(id).groups;

test('Drexler/Sibbet: the seven stages, in order, each with its question', () => {
  assert.deepEqual(chart('dm_drexler_sibbet').stages.map((s) => s.id), ['orientation', 'trust', 'goals', 'commitment', 'implementation', 'high_performance', 'renewal']);
  assert.deepEqual(chart('dm_drexler_sibbet').stages.map((s) => s.label.split(':')[1].trim()), [
    'why am I here?', 'who are you?', 'what are we doing?', 'how will we do it?', 'who does what, when, where?', 'wow!', 'why continue?'
  ]);
});

test('Hersey–Blanchard: direction to the right, support upwards, and the four styles where the source puts them', () => {
  const { axes, cells } = chart('dm_hersey_blanchard');
  assert.equal(axes.x.label, 'Leadership');
  assert.equal(axes.y.label, 'Support');
  // col 1 is much leadership (direction); row 0 is much support (the top).
  const at = Object.fromEntries(cells.map((c) => [c.id, `${c.col}${c.row}`]));
  assert.deepEqual(at, { instructing: '11', coaching: '10', supporting: '00', delegating: '01' });
});

test('Belbin: the nine team roles by their source names', () => {
  const roles = groups('dm_role_playing').filter((g) => !g.id.endsWith('_hat'));
  assert.deepEqual(roles.map((g) => g.label), ['Plant', 'Resource investigator', 'Coordinator', 'Shaper', 'Monitor evaluator', 'Teamworker', 'Implementer', 'Completer finisher', 'Specialist']);
});

test('de Bono: the six hats and what each stands for', () => {
  const hats = groups('dm_role_playing').filter((g) => g.id.endsWith('_hat'));
  assert.deepEqual(hats.map((g) => g.id), ['white_hat', 'red_hat', 'black_hat', 'yellow_hat', 'green_hat', 'blue_hat']);
  const said = hats.map((g) => g.prompt.toLowerCase());
  for (const [i, word] of ['facts', 'feelings', 'risks', 'optimism', 'ideas', 'process'].entries()) assert.match(said[i], new RegExp(word), hats[i].id);
});

test('Whitmore: SMART, PURE and CLEAR in order, fourteen criteria', () => {
  const byAcronym = {};
  for (const g of groups('dm_whitmore')) (byAcronym[g.prompt] ??= []).push(g.label);
  assert.deepEqual(byAcronym, {
    SMART: ['Specific', 'Measurable', 'Attainable', 'Realistic', 'Time-phased'],
    PURE: ['Positively stated', 'Understood', 'Relevant', 'Ethical'],
    CLEAR: ['Challenging', 'Legal', 'Environmentally sound', 'Agreed', 'Recorded']
  });
  for (const [acronym, labels] of Object.entries(byAcronym)) assert.equal(labels.map((l) => l[0]).join(''), acronym);
});
````

- [ ] **Step 3: Run it**

Run: `node --test tests/unit/decision-book-source-check.test.js && node --test tests/unit/decision-book-models.test.js`
Expected: PASS (5 new tests).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/decision-book-source-check.test.js packages/decision-book/models/section-4.mjs
git commit -m "Decision Maker: the light source check, and Belbin roles by their source names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The live coach evaluation
**Files:**
- Create: `scripts/decision-book-eval-cases.mjs`
- Create: `scripts/decision-book-eval.mjs`
- Create: `tests/unit/decision-book-eval-cases.test.js`

Shaped like Problem Solver's `problem-solver-eval*.mjs`. Eleven invented cases, each a session at a point (framing, the record in Decide, a quick run) with one answer:
- a strong decision accepted without flattery, and a single option dressed up as a choice;
- one discernment case per section: a Decision Book model with `next_tool` and a sibling named;
- a sunk-cost reason and a trigger nobody can check, both challenged;
- quick runs that stay quick, that refuse a test with no yes or no, and that should go deeper.

Every reply must keep to the word limits (15–60, or 10–50 in a quick run).

- [ ] **Step 1: Create the cases**

**Create `scripts/decision-book-eval-cases.mjs`:**

````js
// The Decision Maker live evaluation's cases: an invented decision placed at a point in a session
// (framing, the record in Decide, or a quick run), one answer, and what a good coach does with it.
// Pure session building (no model), so the cases are unit-tested; scripts/decision-book-eval.mjs
// runs them against the real coach. Every decision here is invented.
import { acceptSuggestion, applyCoachTurn, createSession, moveOn, say } from '../netlify/functions/_shared/problem-solver/session.mjs';
import { applyQuickTurn, createQuickSession } from '../netlify/functions/_shared/problem-solver/quick-session.mjs';
import { CATALOGUE } from '../packages/decision-book/catalogue.mjs';
import { RECORD_ID } from '../packages/decision-book/record-slots.mjs';

let n = 0;
export const deps = { now: () => '2026-10-21T09:00:00.000Z', newId: () => `dm-eval-${(n += 1)}` };
const idle = (s) => ({ ...s, runner: { status: 'idle', mode: 'turn', error: null } });
const turn = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, proposeTasks: [], proposeReview: null, lightning: null, basis: [], ...fields });
const FRAME_KEYS = ['decision', 'compass', 'known'];

/** A decision with its frame answered up to `answers` (decision, then compass, then known). */
export function framed(text, answers = []) {
  let s = idle(createSession({ text, kind: 'decision' }, deps));
  answers.forEach((answer, i) => {
    s = idle(applyCoachTurn(s, turn({ frame: { [FRAME_KEYS[i]]: answer }, message: 'Noted.' }), deps));
  });
  return s;
}

/** A framed decision that worked one model, now in Decide with the record open and `nodes` ([slot, text]) placed. */
export function atRecord(text, frame, model, modelNodes, nodes = []) {
  let s = framed(text, frame);
  s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'next_tool', tool: model, reason: 'r' } }, deps));
  for (const [slot, value] of modelNodes) s = idle(applyCoachTurn(s, turn({ node: { slot, text: value } }), deps));
  s = { ...idle(moveOn(s, deps)), pendingLearning: null };
  s = idle(acceptSuggestion({ ...s, suggestion: { kind: 'next_tool', tool: RECORD_ID, reason: 'r' } }, deps));
  for (const [slot, value] of nodes) s = idle(applyCoachTurn(s, turn({ node: { slot, text: value } }), deps));
  return s;
}

/** A quick run walked through `steps`. */
export function quickAt(text, steps = []) {
  let s = idle(createQuickSession({ text }, deps));
  for (const step of steps) s = idle(applyQuickTurn(s, turn({ verdict: 'clarify', quick: step }), deps));
  return s;
}

const JOB = 'Whether to take the Sydney job offer';
const JOB_FRAME = ['Whether to accept the Sydney offer by Friday, or stay in my Melbourne role another year', 'self_understand'];
const EISENHOWER = [['item:1', 'Reply to the Sydney offer letter'], ['item:2', 'Talk the move over with my partner']];
const COURSE = 'Whether to finish my part-time law degree';
const COURSE_RECORD = [['decision', 'I will leave the law degree at the end of this term']];

/** Each case: build(), the person's answer, and the checks a good reply passes. */
export const CASES = [
  {
    name: 'Frame: a strong decision, accepted without flattery',
    build: () => framed('Work stuff, the job thing'),
    answer: 'Whether to accept the Sydney offer by Friday or stay in my Melbourne role for another year.',
    expect: { verdict: 'accept', noFlattery: true }
  },
  {
    name: 'Frame: a single option dressed up as a choice',
    build: () => framed(JOB, JOB_FRAME),
    answer: 'There is only one real option, I am taking the job. I just want to feel sure about it before I sign.',
    expect: { verdictNot: 'accept' }
  },
  {
    name: 'Discern, understand yourself: a model and a sibling',
    build: () => framed(JOB, JOB_FRAME),
    answer: 'The offer pays fifteen percent more, rent there is double, my partner can work remotely, and I must reply by Friday.',
    expect: { verdict: 'accept', model: true, sibling: true }
  },
  {
    name: 'Discern, improve yourself: a model and a sibling',
    build: () => framed('Too much on this term', ['What to drop this term: I have marking, a course, coaching and the house move', 'self_improve']),
    answer: 'Marking is due weekly, the course ends in March, coaching is twice a week and the move is in five weeks.',
    expect: { verdict: 'accept', model: true, sibling: true }
  },
  {
    name: 'Discern, understand others: a model and a sibling',
    build: () => framed('The supplier keeps missing dates', ['Whether to keep the catering supplier who missed three of the last five dates', 'others_understand']),
    answer: 'They are the cheapest by a fifth, they blame their drivers, two other caterers have quoted, and the contract renews in December.',
    expect: { verdict: 'accept', model: true, sibling: true }
  },
  {
    name: 'Discern, improve others: a model and a sibling',
    build: () => framed('My team is stuck', ['How to get my four-person team delivering again after a reshuffle', 'others_improve']),
    answer: 'Two are new, one wanted my job, meetings go round in circles, and the first release is due in eight weeks.',
    expect: { verdict: 'accept', model: true, sibling: true }
  },
  {
    name: 'Decide: a sunk-cost reason',
    build: () => atRecord(COURSE, ['Whether to finish my part-time law degree or leave at the end of term', 'self_improve', 'Two years done, two to go, it costs eight thousand a year and I no longer want to practise'], 'dm_eisenhower', [['item:1', 'Tell the faculty by the census date'], ['item:2', 'Look at teaching courses for next year']], COURSE_RECORD),
    answer: 'I have already put two years and sixteen thousand dollars into it, so I should not waste that by stopping now.',
    expect: { verdictNot: 'accept' }
  },
  {
    name: 'Decide: a trigger nobody can check',
    build: () => atRecord(COURSE, ['Whether to finish my part-time law degree or leave at the end of term', 'self_improve', 'Two years done, two to go, it costs eight thousand a year and I no longer want to practise'], 'dm_eisenhower', [['item:1', 'Tell the faculty by the census date'], ['item:2', 'Look at teaching courses for next year']], [...COURSE_RECORD, ['reason:1', 'I no longer want to practise law, and the census date makes it urgent']]),
    answer: 'If it stops feeling right.',
    expect: { verdictNot: 'accept' }
  },
  {
    name: 'Quick: stays quick and sets the tests',
    build: () => quickAt('Should I buy the bigger tent for the summer trip?'),
    answer: 'Those three work for me: do I want it, can I store it, and will I use it at least twice a year.',
    quick: true,
    expect: { suggestionNot: 'escalate', quickNode: 'tests' }
  },
  {
    name: 'Quick: a test that cannot be answered yes or no',
    build: () => quickAt('Should I sign up for the evening pottery class?'),
    answer: 'My first test is how much I would enjoy it, and the others can wait.',
    quick: true,
    expect: { quickNot: 'tests' }
  },
  {
    name: 'Quick: should go deeper',
    build: () => quickAt('Should we move interstate for the job?', [{ node: 'tests', tests: ['Do we want it?', 'Can we afford it?', 'Is it worth it?'] }]),
    answer: 'Honestly it is not a quick one: it means selling the house, both kids changing schools, and my partner leaving a job they love.',
    quick: true,
    expect: { suggestion: 'escalate' }
  }
];

/** The session the coach sees: the case's session with the answer said. */
export function prepare(testCase) {
  return say(testCase.build(), testCase.answer, deps);
}

const FLATTERY = /\b(great|excellent|fantastic|brilliant|amazing|wonderful|perfect|love (that|this|it))\b/i;
/** A model's name as a coach might say it: lower case, without a leading "the" (and, in the check, a trailing "model"). */
const plain = (name) => name.toLowerCase().replace(/^the /, '').replace(/[’']/g, "'");

/** Why a coach reply fails the case's checks, or null. */
export function judge(testCase, reply) {
  const words = String(reply.message ?? '').trim().split(/\s+/).filter(Boolean).length;
  const [min, max] = testCase.quick ? [10, 50] : [15, 60];
  const e = testCase.expect;
  if (words < min || words > max) return `message is ${words} words (want ${min}-${max})`;
  if (e.verdict && reply.verdict !== e.verdict) return `verdict ${reply.verdict}, want ${e.verdict}`;
  if (e.verdictNot && reply.verdict === e.verdictNot) return `verdict should not be ${e.verdictNot}`;
  if (e.noFlattery && FLATTERY.test(reply.message)) return 'message flatters';
  if (e.suggestion && reply.suggestion?.kind !== e.suggestion) return `suggestion ${reply.suggestion?.kind ?? 'none'}, want ${e.suggestion}`;
  if (e.suggestionNot && reply.suggestion?.kind === e.suggestionNot) return `should not suggest ${e.suggestionNot}`;
  if (e.model && !(reply.suggestion?.kind === 'next_tool' && String(reply.suggestion.tool).startsWith('dm_'))) return `suggestion ${JSON.stringify(reply.suggestion)}, want a Decision Book model`;
  if (e.sibling) {
    const others = CATALOGUE.filter((entry) => entry.id !== reply.suggestion?.tool).map((entry) => plain(entry.title).replace(/ model$/, ''));
    const text = plain(reply.message);
    if (!others.some((name) => text.includes(name))) return 'message names no sibling model';
  }
  if (e.quickNode && reply.quick?.node !== e.quickNode) return `quick step ${JSON.stringify(reply.quick ?? null)}, want ${e.quickNode}`;
  if (e.quickNode === 'tests' && reply.quick?.tests?.length !== 3) return 'quick step sets no three tests';
  if (e.quickNot && reply.quick?.node === e.quickNot) return `should not settle ${e.quickNot}`;
  return null;
}
````

- [ ] **Step 2: Create the runner**

**Create `scripts/decision-book-eval.mjs`:**

````js
// Runs the Decision Maker live evaluation cases (scripts/decision-book-eval-cases.mjs) against the
// real coach. Not part of CI: each case is one coach call (two with a repair).
// Usage: ANTHROPIC_API_KEY=... node scripts/decision-book-eval.mjs [name filter]
// Check the runner without a key: DM_EVAL_STUB=1 node scripts/decision-book-eval.mjs
//   swaps the model coach for a stub that always returns the same clarify reply, so the run
//   prints a line per case and exits 1 because the stub fails most cases.
import { anthropicModel, createModelCoach, wordCount } from '../netlify/functions/_shared/problem-solver/coach.mjs';
import { CASES, judge, prepare } from './decision-book-eval-cases.mjs';

const STUB_REPLY = {
  verdict: 'clarify',
  message: 'Thanks for that. Could you tell me a little more about what you mean, with one concrete example from the last few weeks?',
  node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, proposeTasks: [], proposeReview: null, lightning: null, basis: []
};

const coach = process.env.DM_EVAL_STUB ? async () => STUB_REPLY : createModelCoach(anthropicModel(process.env));
const filter = process.argv[2]?.toLowerCase();
const cases = filter ? CASES.filter((c) => c.name.toLowerCase().includes(filter)) : CASES;

let failures = 0;
for (const testCase of cases) {
  const reply = await coach(prepare(testCase));
  const reason = judge(testCase, reply);
  if (reason) failures += 1;
  const suggestion = reply.suggestion ? `${reply.suggestion.kind}${reply.suggestion.tool ? ` ${reply.suggestion.tool}` : ''}` : 'none';
  console.log(`${reason ? `FAIL ${testCase.name}: ${reason}` : `PASS ${testCase.name}`}\n  verdict ${reply.verdict}, ${wordCount(reply.message)} words, suggestion ${suggestion}${reply.quick ? `, quick ${reply.quick.node}` : ''}\n  ${reply.message}`);
}
console.log(`${cases.length - failures}/${cases.length} passed`);
process.exitCode = failures ? 1 : 0;
````

- [ ] **Step 3: Create the cases' unit test**

**Create `tests/unit/decision-book-eval-cases.test.js`:**

````js
// tests/unit/decision-book-eval-cases.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, judge, prepare } from '../../scripts/decision-book-eval-cases.mjs';
import { activeRun } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { buildDecisionPrompt } from '../../netlify/functions/_shared/problem-solver/decision-prompts.mjs';
import { currentEntry } from '../../packages/decision-book/quick.mjs';
import { nextSlots } from '../../packages/problem-solver/machine.mjs';

const find = (words) => CASES.find((c) => c.name.includes(words));

test('every case builds its session with the answer last: framing, the record in Decide, or a quick run', () => {
  for (const c of CASES) {
    const s = prepare(c);
    assert.equal(s.turns.at(-1).text, c.answer, c.name);
    if (c.quick) assert.ok(currentEntry(s.quick), c.name);
    else assert.equal(s.kind, 'decision', c.name);
  }
  const discern = prepare(find('understand yourself'));
  assert.equal(discern.phase, 'frame');
  assert.deepEqual(Object.keys(discern.frame), ['decision', 'compass']);
  const trigger = prepare(find('trigger'));
  assert.equal(trigger.phase, 'decide');
  assert.equal(activeRun(trigger).tool, 'dm_record');
  assert.deepEqual(nextSlots(activeRun(trigger)), ['reason:2', 'trigger']);
  assert.doesNotMatch(buildDecisionPrompt(trigger).user, /AWAITING LEARNING/);
  assert.equal(currentEntry(prepare(find('go deeper')).quick).node, 'test_one');
  assert.ok(CASES.filter((c) => c.name.startsWith('Discern')).length === 4, 'one discernment case per section');
});

test('judge: word limits, verdicts, flattery, a model with a sibling, and the quick step', () => {
  const long = 'word '.repeat(20).trim();
  const strong = find('without flattery');
  assert.equal(judge(strong, { verdict: 'accept', message: long }), null);
  assert.match(judge(strong, { verdict: 'accept', message: `${long} That is a great frame.` }), /flatters/);
  assert.match(judge(strong, { verdict: 'accept', message: 'too short' }), /words/);
  const discern = find('understand yourself');
  const named = 'The rubber band model fits a pull between two places; I passed over the consequences model because the stakes here are about what you want.';
  assert.equal(judge(discern, { verdict: 'accept', message: named, suggestion: { kind: 'next_tool', tool: 'dm_rubber_band' } }), null);
  assert.match(judge(discern, { verdict: 'accept', message: named.replace('the consequences model', 'another one'), suggestion: { kind: 'next_tool', tool: 'dm_rubber_band' } }), /no sibling/);
  assert.match(judge(discern, { verdict: 'accept', message: named, suggestion: { kind: 'next_tool', tool: 'five_whys' } }), /Decision Book model/);
  const quick = find('stays quick');
  assert.equal(judge(quick, { verdict: 'accept', message: long, quick: { node: 'tests', tests: ['a?', 'b?', 'c?'] } }), null);
  assert.match(judge(quick, { verdict: 'accept', message: long, quick: { node: 'tests', tests: ['a?'] } }), /three tests/);
  assert.match(judge(find('cannot be answered'), { verdict: 'accept', message: long, quick: { node: 'tests', tests: ['a?', 'b?', 'c?'] } }), /should not settle/);
});
````

- [ ] **Step 4: Run the test and the stub**

Run: `node --test tests/unit/decision-book-eval-cases.test.js && DM_EVAL_STUB=1 node scripts/decision-book-eval.mjs; echo "exit $?"`
Expected: the test passes (2); the stub prints a line per case, `4/11 passed`, and exits 1.

- [ ] **Step 5: Run the live evaluation (ask Adam first)**

This calls the real coach, so it costs money. Tell Adam the cost first: 11 cases, about 12–15 Sonnet calls, each a cached rubric of roughly 8–10k tokens plus a short turn. That is well under A$1. Run it only on his go:

```bash
ANTHROPIC_API_KEY=... node scripts/decision-book-eval.mjs
```

Record the score and any failures in the PR description. A failure is a prompt issue to raise with Adam, not something to fix here unless he says so.

- [ ] **Step 6: Commit**

```bash
git add scripts/decision-book-eval-cases.mjs scripts/decision-book-eval.mjs tests/unit/decision-book-eval-cases.test.js
git commit -m "Decision Maker: the live coach evaluation and its cases

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Playwright walks at both widths
**Files:**
- Create: `apps/tasks/tests/browser/decision-maker.spec.mjs`

Four walks on the Tasks mock API, each at 1280px and 390px, with no sideways scroll at any point:
- **the landing page**, with Quick decision, the four sections and the shared skills ribbon;
- **a whole decision:** framed, the Eisenhower matrix with a task, another angle set aside, Decide with the record, the first step's task, the review task, and the record written to a new project page (image block first, then the heading); then Move on to Review and Review now;
- **a quick decision:** tests by `use those`, two answered on the chart and one by reply, the Stop Rule band, the check task (due on its date, source `decision_maker`), the close, It came back, and the list row;
- **Go deeper:** the full decision opens seeded, with the quick run's chart in its panel; the run says where it went; both rows say so.

Set `DM_SHOT_DIR` to a folder to save full-page screenshots of each stage.

- [ ] **Step 1: Create the spec**

**Create `apps/tasks/tests/browser/decision-maker.spec.mjs`:**

````js
// apps/tasks/tests/browser/decision-maker.spec.mjs
// Decision Maker on the Tasks mock API (its scripted coach), at desktop and phone widths: the
// landing page with the shared skills ribbon; a whole decision from framing through a model,
// another angle, Decide with the record on a new project page, to the waiting review and Review
// now; and the quick route, to proceed with a check task and It came back, and on to a full
// decision with Go deeper.
import { expect, test } from '@playwright/test';

async function signIn(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const session = await fetch('/api/session').then((res) => res.json());
    if (session?.data?.authenticated) return;
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passphrase: 'tasks-hub-local' }) });
    if (!res.ok) throw new Error('Could not sign in');
  });
  await page.goto('/#/decision-maker');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'New decision' })).toBeVisible({ timeout: 20_000 });
}

const noOverflow = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

async function shot(page, name, viewport) {
  if (process.env.DM_SHOT_DIR) await page.screenshot({ path: `${process.env.DM_SHOT_DIR}/dm-${name}-${viewport.width > 600 ? 'desktop' : 'mobile'}.png`, fullPage: true });
}

async function answer(page, text) {
  await page.getByLabel('Your answer').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
}

/** The open session's saved state, read from the mock API. */
async function sessionReader(page) {
  const id = await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('id'));
  return { id, now: () => page.evaluate(async (sid) => (await fetch(`/api/decision-book?id=${encodeURIComponent(sid)}`).then((r) => r.json())).data.session, id) };
}

const tasksNamed = (page, title) => page.evaluate(async (wanted) => {
  const res = await fetch('/api/tasks').then((r) => r.json());
  return res.data.tasks.filter((task) => task.title === wanted);
}, title);

/** The quick chart's box waiting for an answer. */
const quickNow = (page) => page.locator('.dm-qk-page .dm-qk__row[data-now="true"]');

async function startQuick(page, text) {
  await page.getByLabel('Describe the quick decision').fill(text);
  await page.getByRole('button', { name: 'Go' }).click();
  await expect(page.locator('.dm-qk-page')).toBeVisible();
  await expect(page.locator('.ps-coach__messages')).toContainText('Set three yes/no tests', { timeout: 20_000 });
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`the landing page: hero, Quick decision, the sections and the shared skills ribbon at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Quick decision' })).toBeVisible();
    await expect(page.getByLabel('Describe the quick decision')).toBeVisible();
    await expect(page.locator('.dm-sect')).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'Thinking skills you have used' })).toBeVisible();
    await expect(page.locator('.ps-ribbon, .ps-skills-ribbon').first()).toBeVisible();
    await noOverflow(page);
    await shot(page, 'landing', viewport);
  });

  test(`a whole decision: framed, a model, another angle, Decide with the record on a page, then Review at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    const title = `Should I take the Sydney job offer? (${viewport.width}px)`;
    await page.getByLabel('Describe the decision').fill(title);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('.ps-track')).toBeVisible();
    const { now } = await sessionReader(page);
    await answer(page, 'It is about me and I want to understand what I really want.');
    await answer(page, 'The offer closes Friday and the rent there is double.');
    await expect(page.locator('.dm-compass')).toBeVisible();
    await expect(page.locator('.ps-suggestion')).toContainText('Eisenhower');
    await noOverflow(page);
    await shot(page, 'framed', viewport);

    // Explore: the Eisenhower matrix, one item a cell, then the reflection.
    await page.getByRole('button', { name: 'Start it' }).click();
    for (const text of ['Reply to the Sydney offer letter, do immediately', 'Talk the move over with my partner, decide when', 'Sort out the lease renewal paperwork, do later', 'reflection: The offer reply is the only thing that cannot wait.']) await answer(page, text);
    await expect.poll(async () => (await now()).steps.explore.runs[0].nodes.length).toBe(4);
    const taskCard = page.locator('.ps-taskcard');
    await expect(taskCard).toBeVisible();
    await taskCard.getByRole('button', { name: 'Create task' }).click();
    // The mock API is shared by both widths, so look the task up by the id the proposal links.
    await expect.poll(async () => (await now()).proposedTasks[0]?.status).toBe('confirmed');
    const linked = (await now()).proposedTasks[0];
    expect((await tasksNamed(page, linked.title)).map((task) => task.id)).toContain(linked.taskId);
    await noOverflow(page);
    await shot(page, 'explore', viewport);

    // Another angle is offered, set aside, then Decide.
    await answer(page, 'another angle');
    await expect(page.locator('.ps-suggestion .ps-suggestion__title')).toContainText('Next:');
    await page.locator('.ps-suggestion').getByRole('button', { name: 'Not now' }).click();
    await answer(page, 'decide');
    await page.locator('.ps-suggestion').getByRole('button', { name: 'Move on' }).click();
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I decide faster once the urgent part is named.');
    await page.locator('.ps-suggestion').getByRole('button', { name: 'Start it' }).click();
    for (const text of ['I will take the Sydney job and move in March.', 'The offer reply cannot wait and it matters most.', 'The rent there goes above half of my pay.', 'Then I look at the flats further out instead.', 'Email my acceptance to the Sydney office on Monday.', 'Review it on 2027-01-21']) await answer(page, text);
    await expect(page.locator('.dm-record__stop')).toBeVisible();
    await noOverflow(page);
    await shot(page, 'record', viewport);

    // The first step's task, the review task and the record on a new project page.
    await page.locator('.ps-taskcard').getByRole('button', { name: 'Create task' }).click();
    await expect(page.locator('.ps-taskcard')).toHaveCount(0);
    const reviewCard = page.locator('.ps-reviewcard');
    await expect(reviewCard.locator('input[name="due"]')).toHaveValue('2027-01-21');
    await reviewCard.getByRole('button', { name: 'Create review task' }).click();
    await expect.poll(async () => Boolean((await now()).reviewTaskId)).toBe(true);
    const recordCard = page.locator('.ps-casefilecard');
    await expect(recordCard).toContainText('decision record');
    // The decision's own tasks are offered as places too; this one goes on a new project page.
    await recordCard.locator('select[name="place"]').selectOption('new');
    await recordCard.getByRole('button', { name: 'Write decision record' }).click();
    await expect.poll(async () => (await now()).caseFile?.version).toBe(1);
    const target = (await now()).caseFile.target;
    expect(target.kind).toBe('project');
    const blocks = await page.evaluate(async (id) => (await fetch('/api/projects').then((r) => r.json())).data.projects.find((project) => project.id === id).page_blocks, target.id);
    expect(blocks[0].block_type).toBe('image');
    expect(blocks[1].block_type).toBe('heading');
    await noOverflow(page);
    await shot(page, 'written', viewport);

    // Review waits for its date; Review now opens the feedback analysis.
    await page.getByRole('button', { name: 'Move on to Review' }).click();
    await expect(page.getByRole('button', { name: 'Review now' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Review now' }).click();
    await expect.poll(async () => (await now()).reviewState?.status).toBe('reviewing');
    await noOverflow(page);
    await shot(page, 'review', viewport);
  });

  test(`a quick decision: tests answered on the chart, proceed with a Stop Rule and a check task, then It came back at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    const call = `Should I take the weekend course? (${viewport.width}px)`;
    await startQuick(page, call);
    const { now } = await sessionReader(page);
    await answer(page, 'use those');
    await expect(quickNow(page)).toHaveAttribute('data-box', 'test_one');
    await expect(quickNow(page).locator('.dm-qk__label')).toHaveText('Do I want it?');
    await noOverflow(page);
    await shot(page, 'quick-tests', viewport);

    // Yes on the chart, twice; the third by reply.
    await quickNow(page).getByRole('button', { name: 'Yes: Do I want it?' }).click();
    await expect(quickNow(page)).toHaveAttribute('data-box', 'test_two');
    await expect(page.getByLabel('Your answer')).toBeEnabled();
    await quickNow(page).getByRole('button', { name: 'Yes: Can I do it?' }).click();
    await expect(quickNow(page)).toHaveAttribute('data-box', 'test_three');
    await expect(page.getByLabel('Your answer')).toBeEnabled();
    await answer(page, 'yes, it pays for itself');
    await expect(page.locator('.dm-qk-page .dm-qk__row[data-box="end"]')).toHaveAttribute('data-end', 'proceed');
    await answer(page, 'I miss two sessions');
    await answer(page, 'Ask to move to the spring run');
    await expect(page.locator('.dm-qk-page .dm-qk__band')).toContainText('Ask to move to the spring run');
    await answer(page, 'Check on 2027-01-21');
    await expect(page.locator('.dm-qk-page .dm-qk__check')).toHaveText('Check on 21 Jan 2027');
    await noOverflow(page);
    await shot(page, 'quick-band', viewport);

    const check = page.locator('.dm-qk-check');
    await expect(check).toContainText('on 21 Jan 2027');
    await check.getByRole('button', { name: 'Create check task' }).click();
    await expect(check).toBeHidden();
    await expect.poll(async () => (await now()).quick.check.taskId).toBeTruthy();
    const [task] = await tasksNamed(page, `Check: ${call}`);
    expect(task.due_date).toBe('2027-01-21');
    expect(task.source).toBe('decision_maker');

    await answer(page, 'I decide faster with the tests written down');
    await page.getByLabel('Your answer').fill('Book the first session');
    await page.getByRole('button', { name: 'Send' }).click();
    const again = page.getByRole('button', { name: 'It came back' });
    await expect(again).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.dm-qk-page .dm-qk__close')).toContainText('Book the first session');
    await noOverflow(page);
    await shot(page, 'quick-done', viewport);

    await again.click();
    await expect(page.locator('.dm-qk-page .dm-qk__rounds')).toHaveText('Round 2. Round 1 went ahead.');
    await expect(page.getByLabel('Your answer')).toBeFocused();
    await expect(again).toBeHidden();

    await page.getByRole('link', { name: '← Decisions' }).click();
    const row = page.locator('.dm-prob', { hasText: call });
    await expect(row.locator('.ps-prob__phase')).toHaveText('Quick decision');
    await noOverflow(page);
  });

  test(`Go deeper: a full decision starts seeded, shows the quick run, and both rows say so at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    const call = `Should we move interstate for the job? (${viewport.width}px)`;
    await startQuick(page, call);
    await answer(page, 'use those');
    await answer(page, 'go deeper');
    const card = page.locator('.ps-suggestion');
    await expect(card.locator('.ps-suggestion__title')).toHaveText('This needs a full decision');
    await noOverflow(page);
    await shot(page, 'quick-deeper', viewport);
    const runHash = await page.evaluate(() => location.hash);

    await card.getByRole('button', { name: 'Go deeper' }).click();
    await expect(page.locator('.dm-qk-page')).toHaveCount(0);
    await expect(page.locator('.ps-track')).toBeVisible();
    const from = page.locator('details.dm-qk-from');
    await expect(from).toBeVisible();
    await from.locator('summary').click();
    await expect(from.locator('.dm-qk')).toBeVisible();
    await expect(from.locator('.dm-qk__row[data-box="test_one"] .dm-qk__label')).toHaveText('Do I want it?');
    await expect(from.locator('.dm-qk__ask')).toHaveCount(0);
    await expect(from.getByRole('link', { name: 'Open the quick decision' })).toHaveAttribute('href', runHash);
    const { now } = await sessionReader(page);
    expect((await now()).frameSeeds.from).toBe('quick');
    await noOverflow(page);
    await shot(page, 'quick-from', viewport);

    await page.goto(`/${runHash}`);
    await expect(page.locator('.dm-qk-page__sent[role="status"]')).toContainText('This went on to a full decision.');
    await page.getByRole('link', { name: '← Decisions' }).click();
    const rows = page.locator('.dm-prob', { hasText: call });
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ has: page.locator('.ps-prob__medal--quick') }).locator('.ps-prob__phase')).toHaveText('Went deeper');
    await expect(rows.filter({ hasNot: page.locator('.ps-prob__medal--quick') }).locator('.ps-prob__phase')).toHaveText('Framing');
    await noOverflow(page);
  });
}
````

- [ ] **Step 2: Run it**

Run: `cd apps/tasks && npx playwright test tests/browser/decision-maker.spec.mjs`
Expected: 8 passed. Also run `npx playwright test tests/browser/problem-solver.spec.mjs --grep Lightning` (4 passed): the coach panel's flow change touches Lightning too.

If Playwright says its Chromium is missing, run `npx playwright install chromium` in `apps/tasks`: the app pins Playwright 1.54.2, whose browser build differs from the root's 1.61.1. When this plan was drafted, the walks ran against the Chromium already on the machine through a throwaway config with `launchOptions.executablePath`, to avoid the download.

- [ ] **Step 3: Commit**

```bash
git add apps/tasks/tests/browser/decision-maker.spec.mjs
git commit -m "Decision Maker: Playwright walks of a decision, a quick decision and Go deeper at both widths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Merge main, the gate and the PR

This is the end of the build: one PR for Plans 1–7, by the "Minimise PRs" rule.

- [ ] **Step 1: The whole build's checks, before the merge**

Run: `npm run test:unit` (5,739 when drafted: 5,728 pass, 11 skipped), `cd apps/tasks && npx vitest run` (251 files, 2,641 tests), and the Tasks tsc check from Task 3, Step 4. If one of the two slow Tasks files fails in the full run, rerun it alone before treating it as a failure.

- [ ] **Step 2: Merge `main`**

```bash
git fetch origin main
git merge origin/main --no-edit
```

When drafted, `main` was 44 commits ahead and merged with no conflicts. If there is a conflict, resolve it keeping both sides' intent, and say what it was in the PR description.

- [ ] **Step 3: Regenerate what the merge may have changed**

```bash
node scripts/generate-block-css.mjs
node scripts/generate-alchemy-schema.mjs
node scripts/generate-decision-book-provenance.mjs --check
git status --short
```

If the first two change files, commit them: `git commit -am "Regenerate block CSS and Alchemy schema after merging main"`, with the co-author line. The provenance check must exit 0; if it does not, run the generator without `--check` and commit the images.

- [ ] **Step 4: The gate**

Run: `npm run pre-pr-check`
Expected: exit 0. A failure is fixed at its cause, never by weakening a check. Rerun it until it exits 0.

- [ ] **Step 5: Push and open the PR, ready, with auto-merge**

```bash
git push -u origin claude/decision-book
gh pr create --base main --head claude/decision-book --title "Decision Maker: a coached decision tool from The Decision Book" --body-file <path to the body>
gh pr merge --auto --merge
```

The body says what the tool does, lists the seven plans with their docs, gives the checks with their numbers (unit, vitest, tsc, Playwright, the live evaluation's score or "not run, waiting for Adam"), notes the Belbin label fix, and ends with:

```text
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Then bind the PR in the app with the ccd_pr tools (`get_status`, then `bind_pr` if needed) and offer Auto-fix. If auto-merge stalls on a conflict, merge `main` again, rerun Step 3 and the gate, and push.

- [ ] **Step 6: Mark the build done**

Mark Plan 7 **Done** with its HEAD sha in `docs/superpowers/plans/2026-10-21-decision-maker-plans.md`, commit and push it to the PR branch. Update `decision-book-tool.md` in memory with "Plan 7 done, PR <number> (auto-merge on)", and its pointer line in `MEMORY.md`.

---

## Notes after the build

- **The live evaluation** waits for Adam's go (Task 5, Step 5). Its failures are prompt work for a follow-up, not part of this PR unless he says so.
- **Playwright's browser:** `apps/tasks` pins Playwright 1.54.2. A machine with only the root's 1.61.1 browsers needs `npx playwright install chromium` in `apps/tasks` before its walks run.
- **The mock API** still 404s `/api/chat/pending`, which puts two errors in the console on every Tasks page. That is not Decision Maker's.
