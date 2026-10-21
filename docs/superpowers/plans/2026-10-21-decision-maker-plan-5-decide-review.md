# Decision Maker Plan 5: Decide, Record and Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 1–6 run in order; each leaves the unit suite green.

**Goal:** Give a decision session its last two steps, on the server and in the shared packages. After this plan:
- **Decide** has one tool, the **decision record** (`dm_record`, `step: 'settle'`). Its slots are the decision, one to five reasons, a Stop Rule's trigger and action, the first step and a review date, taken in that order. `toolsForPlanStep('decision_book', 'decide')` lists it, and it opens by default.
- **Each reason rests on model nodes.** The coach names them in a new `basis` field (`[{ tool, slot }]`). The session keeps the resolved nodes as `session.basis[reasonNodeId] = [{ runId, nodeId }]`, because they sit in other runs. `basisOf(session)` gives the record chart's `setBasis` input. The live coach must rest an accepted reason on at least one placed Explore node, or the reply goes back for repair. A reason with nothing behind it is challenged instead.
- **The first step and the review date become confirm cards.** The first step is a `taskSlots` slot, so the coach offers it as a task. A review date after today becomes the session's `reviewProposal`, which is Problem Solver's review card.
- **The record is composed from the session**, never from the coach's words, as Problem Solver's case file is: `composeRecord`, `recordProvenance` (the main model, its section and the caption "Decided with The Decision Book · <models> · <date>") and `recordOffer` (write, update or graphic). `link_case_file` now accepts a decision session and records whether its provenance graphic wrote (`graphic`). If it did not, the offer is `graphic`, so the card can retry it.
- **Review** names the feedback analysis (`dm_feedback_analysis`) as its one tool. Decide plays Implement's part and Review plays Improve's (a new `serves` field on a plan step), so Problem Solver's review machinery runs unchanged: `reviewState`, waiting, Review now, `review.mjs` and the task snapshot as evidence.
- **The coach's step layers:** Decide names the record, its order and its rules, and the turn lists REASONS CAN REST ON. Review names the feedback analysis and what to seed it from. The turn also shows the review state, TASK STATUS and the decision record on its page.
- **The scripted coach** works a whole decision: it suggests models as `next_model` (read through the coach schema, as a live reply is), offers **another angle** from the see also, moves to Decide, fills the record (each reason resting on an Explore node, the review as a date), and runs the review on the feedback analysis.

**Split (21 Oct):** the old Plan 5, "Decide, Review and the app", was too big to draft and test in one go. This plan covers Decide, the record and Review. **Plan 6** is now the app: the client pages, the record's page blocks and bridge, the mock API route, and the browser check. Quick decision and the checks move to **Plan 7**. The plan set index is updated to match (Task 7).

**Spec:** `docs/superpowers/specs/2026-10-21-decision-book-design.md` ("Experience: Full session" steps 5–7, "Architecture", "Errors").
**Plans 1–4:** done (Plan 4 HEAD `575fc6710`).
**Branch and worktree:** `claude/decision-book` in `/Users/example/Projects/life-hub-decision-book`. Run every command from that worktree's root unless a step says otherwise. Run `npm ci` at the root and in `apps/tasks` first if `node_modules` is missing.

**How this plan was made:** every file below was drafted in the worktree and its tests run green: 17 new unit tests in `decision-book-decide.test.js`; the full unit suite (5,703 tests: 5,692 pass, 11 skipped as before); and the Problem Solver and Decision Book vitest tests (55 files, 1,088 tests, including the new record-basis test). The Tasks type-check showed no errors in these paths. The drafts were then removed, after a check that this plan rebuilds every file byte for byte from a clean tree. New files are given in full. Changed files are given as patches: apply them with `git apply`, then check with `git diff`. Plan 5 has no client pages, so there was no browser check; that moves to Plan 6.

**Rules kept:**
- **Public repo:** no book sentences. The record's steps, rules and Review guidance are in our own words.
- **Problem Solver never lists the `dm_` tools.** A test walks every toolkit step, every Problem Solver plan step, the rubric and a Problem Solver prompt. Problem Solver's rubric hash test stays green. `prompts.mjs` only gains an exported `taskStatusLine`, which `RUBRIC` does not use.
- **No Decision Maker step id is `choose`**, in the plan or in the record tool (tested).
- **Problem Solver's case file is unchanged:** `link_case_file` still needs a Document step for a non-decision session, and ignores `graphic` there (tested).

**Design notes:**
- *Why `serves`:* Problem Solver's review flow is keyed to the plan step whose book is `implement` (it proposes the review) and the one whose book is `improve` (it waits for and runs the review). Decision Maker's Decide uses `settle` tools and its Review names a model, so neither belongs to those toolkit steps. With `serves`, `planStepForBook` and the new `stepServes` find them, and `review.mjs`, `session.mjs` and the client's review code follow without forking.
- *Why the review date is a slot and not `proposeReview`:* the date is part of the record the person settles, and it shows on the chart's back arrow. Taking the proposal from the placed node means the card and the chart cannot disagree. The coach still cannot set a date that is not after today: the node is placed, but no review is proposed. `moveOn` keeps Problem Solver's 14-day fallback if the record has no review card.
- *Why the record reuses `caseFile`:* the client's case-file bridge, link chips and "dated update" logic all read `caseFile`. A decision session has no Document step, so the field is free. Offers differ only in `recordOffer`, which adds `graphic` and `provenance`.

---
### Task 1: Decide and Review in the plan; the decision record tool

**Files:**
- Create: `packages/decision-book/tools/record.mjs`
- Modify: `packages/problem-solver/steps.mjs`, `packages/decision-book/record-slots.mjs`, `packages/problem-solver/review.mjs`, `packages/problem-solver/tools/index.mjs`, `tests/unit/problem-solver-machine.test.js`

- [ ] **Step 1: Create the record tool**

The record meets Problem Solver's tool contract (`machine.mjs`) directly. It is not a family factory, because its slots come from `RECORD_SLOTS` (Plan 2's contract with the record chart). The review must be a real `YYYY-MM-DD` date.

**Create `packages/decision-book/tools/record.mjs`:**

````js
// packages/decision-book/tools/record.mjs
// The decision record, Decide's one tool: the decision, its reasons (each resting on model nodes,
// kept on the session as `basis`), a Stop Rule (a trigger and the action agreed now), the first
// step and the review date. Order: the decision, then reasons; once there is a reason, the Stop
// Rule's trigger, then its action, then the first step, then the review. Reasons can still be
// added until the review is set. The first step can become a task; the review date becomes the
// session's review proposal (session.mjs), so both reach the page as confirm cards.
import { countSlots, hasSlot, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { REASONS_MAX, RECORD_ID, RECORD_SLOTS } from '../record-slots.mjs';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written YYYY-MM-DD. */
export function isRecordDate(text) {
  const value = String(text ?? '').trim();
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const dmRecord = Object.freeze({
  id: RECORD_ID,
  name: 'The decision record',
  kind: 'record',
  step: 'settle',
  family: 'record',
  tier: 'worksheet',
  when: 'The models have done their work: settle the decision, why, what would make you rethink, the first step and when to look again.',
  failureModes: Object.freeze([
    'A reason that rests on nothing a model showed.',
    'A Stop Rule with no trigger anyone could notice, or no action agreed in advance.',
    'A first step too big or too vague to start this week.',
    'No review date, so the decision is never checked against what happened.'
  ]),
  steps: Object.freeze([
    Object.freeze({ id: 'decision', title: 'The decision', prompt: 'Say the decision in one sentence, as you would tell someone it affects.' }),
    Object.freeze({ id: 'reasons', title: 'The reasons', prompt: 'Why this? Give each reason and the model finding it rests on.' }),
    Object.freeze({ id: 'stop_rule', title: 'What would make you rethink', prompt: 'Name one trigger you would notice, and the action you agree to now if it happens.' }),
    Object.freeze({ id: 'first_step', title: 'The first step', prompt: 'What is the first thing you will do, and by when?' }),
    Object.freeze({ id: 'review', title: 'When to review it', prompt: 'On what date will you look at what happened against what you expected?' })
  ]),
  exercise: null,
  pairsWell: Object.freeze([]),
  slots: Object.freeze({ ...RECORD_SLOTS }),
  edgeKinds: Object.freeze([]),
  taskSlots: Object.freeze({ first_step: () => true }),
  validateNode(run, node) {
    if (node.slot === 'review' && !isRecordDate(node.text)) return 'The review is a date: put it in node.text as YYYY-MM-DD.';
    return null;
  },
  nextSlots(run) {
    if (!hasSlot(run, 'decision')) return ['decision'];
    if (hasSlot(run, 'review')) return [];
    const reasoned = countSlots(run, 'reason') >= 1;
    const next = !reasoned ? null
      : !hasSlot(run, 'trigger') ? 'trigger'
        : !hasSlot(run, 'action') ? 'action'
          : !hasSlot(run, 'first_step') ? 'first_step'
            : 'review';
    return open(nextIndexed(run, 'reason', REASONS_MAX), next);
  },
  complete(run) {
    return ['decision', 'reason', 'trigger', 'action', 'first_step', 'review'].every((name) => hasSlot(run, name));
  }
});
````

- [ ] **Step 2: Plan Decide and Review, register the tool, and let Review find Improve's part**

`serves` marks Decide as playing Implement's part and Review as playing Improve's. A step that names exactly one tool now opens with it by default; Explore still names many and has none. `review.mjs`'s `inImprove` uses `stepServes`. The registry adds `dm_record` after the models, so the machine test's registry order gains it at the end.

````diff
diff --git a/packages/decision-book/record-slots.mjs b/packages/decision-book/record-slots.mjs
index 02cc6a0cd..46ce1841b 100644
--- a/packages/decision-book/record-slots.mjs
+++ b/packages/decision-book/record-slots.mjs
@@ -14,3 +14,9 @@ export const RECORD_SLOTS = Object.freeze({
 });
 
 export const RECORD_SLOT_NAMES = Object.freeze(Object.keys(RECORD_SLOTS));
+
+/** Reasons a record holds at most. */
+export const REASONS_MAX = 5;
+
+/** Review's tool: the feedback analysis compares what was expected with what happened. */
+export const FEEDBACK_ID = 'dm_feedback_analysis';
diff --git a/packages/problem-solver/review.mjs b/packages/problem-solver/review.mjs
index 50f1da2db..019cdb8a5 100644
--- a/packages/problem-solver/review.mjs
+++ b/packages/problem-solver/review.mjs
@@ -2,7 +2,7 @@
 // Improve's review rules, shared by the server and the page so the two cannot drift:
 // when a review is live, when Improve is waiting for it, how a review may start, and how a
 // task snapshot is cleaned.
-import { nextPhase, pastStep, planStep, planStepForBook } from './steps.mjs';
+import { nextPhase, pastStep, planStepForBook, stepServes } from './steps.mjs';
 
 /** Task statuses a snapshot counts. Anything else counts as unknown; removed tasks are never counted. */
 export const SNAPSHOT_STATUSES = Object.freeze(['open', 'in_progress', 'deferred', 'done', 'dead', 'unknown']);
@@ -25,7 +25,7 @@ export function reviewLive(session) {
 
 /** True while the session is in its Improve plan step (whatever the review is doing). */
 export function inImprove(session) {
-  return Boolean(session.model && planStep(session.model.id, session.phase)?.book.includes('improve'));
+  return Boolean(session.model && stepServes(session.model.id, session.phase, 'improve'));
 }
 
 /** True while the session sits in its Improve step waiting for the review. */
diff --git a/packages/problem-solver/steps.mjs b/packages/problem-solver/steps.mjs
index 585475b90..fed2e2e7c 100644
--- a/packages/problem-solver/steps.mjs
+++ b/packages/problem-solver/steps.mjs
@@ -3,6 +3,7 @@ import { MODELS } from './models.mjs';
 import { TOOLS } from './tools/index.mjs';
 import { DECISION_MODEL } from '../decision-book/model.mjs';
 import { CATALOGUE_IDS } from '../decision-book/catalogue.mjs';
+import { FEEDBACK_ID } from '../decision-book/record-slots.mjs';
 
 /** Tool families. A tool's `step` is one of these. `contradiction` is TRIZ only. */
 export const BOOK_STEPS = Object.freeze([
@@ -18,7 +19,12 @@ export const BOOK_STEPS = Object.freeze([
 
 export const BOOK_STEP_IDS = Object.freeze(BOOK_STEPS.map((s) => s.id));
 
-const entry = (step, book, extra = false, tools = null) => Object.freeze({ step, book: Object.freeze(book), extra, ...(tools ? { tools } : {}) });
+/**
+ * `tools` names a step's tools explicitly. `serves` is the toolkit role a step plays in the
+ * session's machinery (Decision Maker's Decide plays Implement's part in proposing the review;
+ * its Review plays Improve's), without its tools joining that toolkit step.
+ */
+const entry = (step, book, extra = false, tools = null, serves = null) => Object.freeze({ step, book: Object.freeze(book), extra, ...(tools ? { tools } : {}), ...(serves ? { serves } : {}) });
 
 /**
  * Ordered steps a session walks for each model. `book` lists the tool families the
@@ -44,11 +50,12 @@ const PLANS = Object.freeze({
     entry('document', ['document'], true)
   ]),
   // Decision Maker: the coach discerns the model, so Explore names its tools (every catalogue
-  // model registered as a tool) and has no default.
+  // model registered as a tool) and has no default. Decide's one tool is the decision record;
+  // Review names the feedback analysis, which compares what was expected with what happened.
   decision_book: Object.freeze([
     entry('explore', ['explore'], false, () => CATALOGUE_IDS.filter((id) => TOOLS[id])),
-    entry('decide', ['settle']),
-    entry('review', ['review'], true)
+    entry('decide', ['settle'], false, null, 'implement'),
+    entry('review', ['review'], true, () => [FEEDBACK_ID], 'improve')
   ])
 });
 
@@ -101,10 +108,13 @@ export function toolsForPlanStep(modelId, stepId) {
   return Object.values(TOOLS).filter((tool) => books.includes(tool.step)).map((tool) => tool.id);
 }
 
-/** A step that names its own tools has no default: the coach chooses. */
+/** A step that names its own tools has no default (the coach chooses) unless it names only one. */
 export function defaultToolFor(modelId, stepId) {
   const step = planStep(modelId, stepId);
-  if (step?.tools) return null;
+  if (step?.tools) {
+    const named = step.tools();
+    return named.length === 1 ? named[0] : null;
+  }
   for (const book of step?.book ?? []) {
     const id = (DEFAULTS[book] ?? []).find((tool) => TOOLS[tool]?.step === book);
     if (id) return id;
@@ -112,9 +122,15 @@ export function defaultToolFor(modelId, stepId) {
   return toolsForPlanStep(modelId, stepId)[0] ?? null;
 }
 
-/** The plan step of a model whose tool families include `book`, or null. */
+/** True when plan step `stepId` uses `book`'s tools or plays its part (`serves`). */
+export function stepServes(modelId, stepId, book) {
+  const step = planStep(modelId, stepId);
+  return Boolean(step && (step.book.includes(book) || step.serves === book));
+}
+
+/** The plan step of a model whose tool families include `book`, or that serves it, or null. */
 export function planStepForBook(modelId, book) {
-  return stepPlan(modelId).find((s) => s.book.includes(book))?.step ?? null;
+  return stepPlan(modelId).find((s) => s.book.includes(book) || s.serves === book)?.step ?? null;
 }
 
 /**
diff --git a/packages/problem-solver/tools/index.mjs b/packages/problem-solver/tools/index.mjs
index aae212f0e..c5b1c392a 100644
--- a/packages/problem-solver/tools/index.mjs
+++ b/packages/problem-solver/tools/index.mjs
@@ -32,6 +32,7 @@ import { feedbackMatrix } from './feedback-matrix.mjs';
 import { fiveCs } from './five-cs.mjs';
 import { knowledgeManagement } from './knowledge-management.mjs';
 import { DECISION_TOOLS } from '../../decision-book/models/index.mjs';
+import { dmRecord } from '../../decision-book/tools/record.mjs';
 
 // The container is not frozen (tests register fakes); every definition is frozen.
 export const TOOLS = {
@@ -68,7 +69,9 @@ export const TOOLS = {
   five_cs: fiveCs,
   knowledge_management: knowledgeManagement,
   // Decision Maker's models (step explore, not a toolkit step, so Problem Solver never lists them).
-  ...DECISION_TOOLS
+  ...DECISION_TOOLS,
+  // Decision Maker's Decide step (step settle, likewise not a toolkit step).
+  dm_record: dmRecord
 };
 
 export const TOOL_IDS = Object.freeze(Object.keys(TOOLS));
diff --git a/tests/unit/problem-solver-machine.test.js b/tests/unit/problem-solver-machine.test.js
index 3cc914b0e..c281d4b1e 100644
--- a/tests/unit/problem-solver-machine.test.js
+++ b/tests/unit/problem-solver-machine.test.js
@@ -7,8 +7,9 @@ import { addEdge, applyScores, canEdge, canPropose, checkNode, canPlace, isCompl
 
 const node = (id, slot) => ({ id, slot, text: slot, state: 'accepted', skills: [], turnId: 't' });
 
-test('registry lists every tool in order: the toolkit, then Decision Maker’s models', () => {
-  assert.deepEqual(TOOL_IDS.slice(Object.keys(DECISION_TOOLS).length * -1), Object.keys(DECISION_TOOLS));
+test('registry lists every tool in order: the toolkit, then Decision Maker’s models, then its record', () => {
+  assert.deepEqual(TOOL_IDS.slice(-Object.keys(DECISION_TOOLS).length - 1, -1), Object.keys(DECISION_TOOLS));
+  assert.equal(TOOL_IDS.at(-1), 'dm_record');
   assert.deepEqual(TOOL_IDS.filter((id) => !id.startsWith('dm_')), ['five_whys', 'problem_tree', 'concept_map', 'gap_basic', 'gap_radar', 'problem_statement', 'smart', 'contradiction', 'causal_map', 'perspective_shift', 'radial_tree', 'force_field', 'from_to', 'intent_statement', 'problem_reduction', 'analogical_reasoning', 'solution_tree', 'lotus_blossom', 'duncker', 'decision_matrix', 'swot', 'morphological', 'pareto', 'dmaic', 'fifteen_percent', 'kanban', 'eisenhower', 'after_action_review', 'double_loop', 'feedback_matrix', 'five_cs', 'knowledge_management']);
   assert.throws(() => toolDef('nope'), /Unknown tool/);
 });
````

- [ ] **Step 3: Run the unit suite**

Run: `npm run test:unit`
Expected: PASS (5,686 when drafted: 5,675 pass, 11 skipped). The new behaviour is tested in Task 6.

- [ ] **Step 4: Commit**

```bash
git add packages/decision-book/tools/record.mjs packages/problem-solver/steps.mjs packages/decision-book/record-slots.mjs packages/problem-solver/review.mjs packages/problem-solver/tools/index.mjs tests/unit/problem-solver-machine.test.js
git commit -m "Decision Maker: the decision record opens Decide; Review runs the feedback analysis

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The record composer

**Files:**
- Create: `packages/decision-book/record.mjs`

- [ ] **Step 1: Create the composer**

This file resolves a reason's basis, picks the main model (the one the reasons cite most), builds the provenance caption, composes the record's sections and decides what the card offers. Digests and the hash come from Problem Solver's `case-file.mjs`, so the two records detect changes the same way.

**Create `packages/decision-book/record.mjs`:**

````js
// packages/decision-book/record.mjs
// The decision record Decision Maker writes to a Tasks page: composed from the session (never
// from the coach's words), as Problem Solver's case file is, with a digest per section so a later
// change offers a dated update. It also resolves a reason's basis (the model nodes it rests on)
// and names the provenance the page's graphic shows. Shared by the server's prompt and the page.
import { isComplete } from '../problem-solver/machine.mjs';
import { parseSlot } from '../problem-solver/slots.mjs';
import { stepName } from '../problem-solver/steps.mjs';
import { TOOLS } from '../problem-solver/tools/index.mjs';
import { hashText, sectionDigests } from '../problem-solver/case-file.mjs';
import { catalogueEntry } from './catalogue.mjs';
import { FEEDBACK_ID, RECORD_ID } from './record-slots.mjs';

/** Sections that never call for an update on their own (every step boundary adds a learning). */
const QUIET = new Set(['learnings']);
/** Basis references one reason may carry. */
export const BASIS_MAX = 4;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '2027-02-01' -> '1 February 2027'; anything else as written. */
export function dateWords(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text ?? '').trim());
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : String(text ?? '');
}

const keptRuns = (session, stepId) => (session.steps?.[stepId]?.runs ?? []).filter((run) => run.status !== 'switched');
const nameOf = (node) => parseSlot(node.slot)?.name;
const textsIn = (run, name) => (run ? run.nodes.filter((node) => nameOf(node) === name).map((node) => node.text) : []);
const firstIn = (run, name) => textsIn(run, name)[0] ?? null;
const modelName = (id) => TOOLS[id]?.name ?? id;

/**
 * The latest complete decision record run (switched runs never count), or null.
 * @param {import('../problem-solver/types').PsSession} session
 */
export function recordSource(session) {
  return keptRuns(session, 'decide').filter((run) => run.tool === RECORD_ID && isComplete(run)).at(-1) ?? null;
}

/**
 * Explore nodes a reason can rest on: the latest kept run of each model, every placed node.
 * @returns {{ tool: string, slot: string, runId: string, nodeId: string, title: string }[]}
 */
export function basisCandidates(session) {
  const latest = new Map();
  for (const run of keptRuns(session, 'explore')) if (run.nodes.length) latest.set(run.tool, run);
  return [...latest.values()].flatMap((run) => run.nodes.map((node) => ({ tool: run.tool, slot: node.slot, runId: run.id, nodeId: node.id, title: node.title ?? node.text })));
}

/**
 * The coach's basis references (`{ tool, slot }`) that name a placed Explore node, as stored
 * references (`{ runId, nodeId }`), without repeats and at most BASIS_MAX. Others are dropped.
 */
export function resolveBasis(session, refs) {
  const candidates = basisCandidates(session);
  const out = [];
  for (const ref of Array.isArray(refs) ? refs : []) {
    const hit = candidates.find((c) => c.tool === ref?.tool && c.slot === ref?.slot);
    if (hit && !out.some((item) => item.nodeId === hit.nodeId)) out.push({ runId: hit.runId, nodeId: hit.nodeId });
    if (out.length === BASIS_MAX) break;
  }
  return out;
}

const findNode = (session, ref) => {
  const run = Object.values(session.steps ?? {}).flatMap((step) => step.runs).find((item) => item.id === ref.runId);
  const node = run?.nodes.find((item) => item.id === ref.nodeId);
  return run && node ? { run, node } : null;
};

/**
 * The record chart's basis (`setBasis`): per reason node id, the model and node title it rests on.
 * References whose run or node is gone are left out.
 * @returns {Record<string, { model: string, title: string }[]>}
 */
export function basisOf(session) {
  const out = {};
  for (const [reasonId, refs] of Object.entries(session.basis ?? {})) {
    const list = refs.map((ref) => findNode(session, ref)).filter(Boolean).map(({ run, node }) => ({ model: modelName(run.tool), title: node.title ?? node.text }));
    if (list.length) out[reasonId] = list;
  }
  return out;
}

/**
 * The model the record leans on most: the Explore model its reasons cite most often (the earliest
 * on a tie), else the first kept Explore run with anything placed, else null.
 */
export function mainModel(session) {
  const runs = keptRuns(session, 'explore').filter((run) => run.nodes.length);
  const counts = new Map();
  for (const refs of Object.values(session.basis ?? {})) {
    for (const ref of refs) {
      const hit = findNode(session, ref);
      if (hit) counts.set(hit.run.tool, (counts.get(hit.run.tool) ?? 0) + 1);
    }
  }
  const order = runs.map((run) => run.tool).filter((tool, i, all) => all.indexOf(tool) === i);
  const cited = order.filter((tool) => counts.has(tool)).sort((a, b) => counts.get(b) - counts.get(a))[0];
  return cited ?? order[0] ?? null;
}

/** The date the record was settled: when the review date was accepted, else the session's last change. */
function decidedOn(session, record) {
  const node = record.nodes.find((item) => nameOf(item) === 'review');
  const turn = session.turns?.find((item) => item.id === node?.turnId);
  return String(turn?.createdAt ?? session.updatedAt ?? '').slice(0, 10);
}

/**
 * What the page's provenance graphic shows: the main model's emblem inside its section's, and
 * the caption. Null before a complete record.
 * @returns {{ model: string | null, section: number | null, models: string[], date: string, caption: string } | null}
 */
export function recordProvenance(session) {
  const record = recordSource(session);
  if (!record) return null;
  const main = mainModel(session);
  const models = keptRuns(session, 'explore').filter((run) => run.nodes.length).map((run) => modelName(run.tool)).filter((name, i, all) => all.indexOf(name) === i);
  const date = decidedOn(session, record);
  const caption = `Decided with The Decision Book · ${models.join(', ') || 'the decision record'} · ${dateWords(date)}`;
  return { model: main, section: main ? catalogueEntry(main)?.section ?? null : null, models, date, caption };
}

/** The latest kept feedback analysis in Review, or null. */
const reviewRun = (session) => keptRuns(session, 'review').filter((run) => run.tool === FEEDBACK_ID).at(-1) ?? null;

/**
 * `{ title, version, sections: [{ key, heading, lines }] }`, or null before a complete record.
 * Empty sections are left out. Once Review has a feedback analysis, what happened and what it
 * showed join the record (and so offer an update).
 */
export function composeRecord(session) {
  const record = recordSource(session);
  if (!record) return null;
  const basis = basisOf(session);
  const reasons = record.nodes.filter((node) => nameOf(node) === 'reason').map((node) => {
    const rests = basis[node.id];
    return rests ? `${node.text} (rests on ${rests.map((b) => `${b.model}: ${b.title}`).join('; ')})` : node.text;
  });
  const trigger = firstIn(record, 'trigger');
  const action = firstIn(record, 'action');
  const review = reviewRun(session);
  const actual = review ? review.nodes.filter((node) => nameOf(node) === 'force' && node.tag === 'actual').map((node) => node.text) : [];
  const explored = keptRuns(session, 'explore').filter((run) => run.nodes.length).map((run) => `${modelName(run.tool)}${isComplete(run) ? '' : ' (part done)'}`);
  const raw = [
    ['decision', 'The decision', [firstIn(record, 'decision')]],
    ['reasons', 'Why', reasons],
    ['stop_rule', 'What would make me rethink', [trigger && `If: ${trigger}`, action && `Then: ${action}`]],
    ['first_step', 'First step', [firstIn(record, 'first_step')]],
    ['review', 'Review on', [dateWords(firstIn(record, 'review'))]],
    ['known', 'What was known', [session.frame?.known]],
    ['models', 'Models used', explored],
    ['outcome', 'What happened', [...actual, firstIn(review, 'reflection') && `What it shows: ${firstIn(review, 'reflection')}`]],
    ['learnings', 'How it was decided', (session.learnings ?? []).map((item) => `${session.model ? stepName(session.model.id, item.step) : item.step}: ${item.text}`)]
  ];
  const sections = raw.map(([key, heading, lines]) => ({ key, heading, lines: lines.filter(Boolean) })).filter((section) => section.lines.length);
  return { title: `Decision: ${session.title}`, version: 1, sections };
}

/**
 * What the record card offers now, or null:
 * - `write`: no record on a page yet, every section;
 * - `update`: written before and a section other than the learnings changed (version + 1);
 * - `graphic`: written, nothing changed, but the provenance graphic did not write (retry it).
 * Held until the record is complete, during a review, and when the person said Not now to
 * exactly this content. Only decision sessions have a record.
 */
export function recordOffer(session) {
  if (session.kind !== 'decision' || !session.model || session.status === 'archived') return null;
  if (session.reviewState?.status === 'reviewing') return null;
  const file = composeRecord(session);
  if (!file) return null;
  const provenance = recordProvenance(session);
  const digests = sectionDigests(file);
  const key = hashText(JSON.stringify(digests));
  const written = session.caseFile;
  if (!written) return session.caseFileDeclined === key ? null : { kind: 'write', version: file.version, file, digests, key, changed: file.sections.map((s) => s.key), provenance };
  const changed = file.sections.filter((s) => written.sections[s.key] !== digests[s.key]).map((s) => s.key);
  if (changed.some((k) => !QUIET.has(k)) && session.caseFileDeclined !== key) return { kind: 'update', version: written.version + 1, file, digests, key, changed, provenance };
  if (written.graphic === false) return { kind: 'graphic', version: written.version, file, digests, key, changed: [], provenance };
  return null;
}
````

- [ ] **Step 2: Check it loads**

Run: `node -e "import('./packages/decision-book/record.mjs').then((m) => console.log(Object.keys(m).join(' ')))"`
Expected: `BASIS_MAX basisCandidates basisOf composeRecord dateWords mainModel recordOffer recordProvenance recordSource resolveBasis`

- [ ] **Step 3: Commit**

```bash
git add packages/decision-book/record.mjs
git commit -m "Decision Maker: the decision record composed from the session, with its provenance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The session keeps a reason's basis, proposes the review and links the record

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/session.mjs`, `packages/problem-solver/types.ts`

- [ ] **Step 1: Apply the patch**

- `recordPlaced` runs after a record node is placed, by accept or by Keep it anyway. A reason stores its resolved basis, and a review date after today becomes the review proposal (unless a review task exists or the proposal was set aside).
- A challenged reason keeps its basis in `pendingKeep`.
- `inBook` uses `stepServes`.
- `linkCaseFile` accepts a decision session and records `graphic`. Sending the same version on the same page with `graphic: true` marks a retried graphic.
- The types gain `PsBasisRef`, `basis`, `graphic`, `PsRecordProvenance` and `PsRecordOffer`.

````diff
diff --git a/netlify/functions/_shared/problem-solver/session.mjs b/netlify/functions/_shared/problem-solver/session.mjs
index b35c2de55..69daf86bc 100644
--- a/netlify/functions/_shared/problem-solver/session.mjs
+++ b/netlify/functions/_shared/problem-solver/session.mjs
@@ -1,11 +1,13 @@
 // netlify/functions/_shared/problem-solver/session.mjs
 import { acceptProblem, addEdge, applyScores, canEdge, canPlace, canPropose, isComplete as isRunComplete, newRun, placeNode, toolDef } from '../../../../packages/problem-solver/machine.mjs';
-import { defaultToolFor, firstStep, nextPhase, planStep, planStepForBook, stepName } from '../../../../packages/problem-solver/steps.mjs';
+import { defaultToolFor, firstStep, nextPhase, planStepForBook, stepName, stepServes } from '../../../../packages/problem-solver/steps.mjs';
 import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';
 import { isDate } from './coach-schema.mjs';
 import { cleanOverdue, reviewLive, reviewStart, SNAPSHOT_STATUSES, waitingForReview } from '../../../../packages/problem-solver/review.mjs';
 import { parseCompass } from '../../../../packages/decision-book/compass.mjs';
 import { DECISION_MODEL } from '../../../../packages/decision-book/model.mjs';
+import { RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
+import { resolveBasis } from '../../../../packages/decision-book/record.mjs';
 
 export { waitingForReview };
 
@@ -78,7 +80,7 @@ const reviewTitle = (session) => `Review: ${session.title}`.slice(0, TITLE_MAX);
 const addDays = (iso, days) => new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
 /** A coach date counts only when it is after today; a date in the past cannot be a plan. */
 const afterToday = (due, deps) => typeof due === 'string' && due > deps.now().slice(0, 10);
-const inBook = (session, stepId, book) => Boolean(session.model && planStep(session.model.id, stepId)?.book.includes(book));
+const inBook = (session, stepId, book) => Boolean(session.model && stepServes(session.model.id, stepId, book));
 
 /** A clean snapshot, or null when none was sent. Unknown statuses are dropped; removed tasks are never counted. */
 function cleanSnapshot(raw, deps) {
@@ -203,13 +205,34 @@ function addAllowedEdges(run, edges) {
 
 function placeAccepted(next, turn, coachTurnId, deps) {
   const run = activeRun(next);
-  let placed = placeNode(run, { id: deps.newId(), slot: turn.node.slot, text: turn.node.text, title: turn.node.title, ...(turn.node.tag ? { tag: turn.node.tag } : {}), state: 'accepted', skills: turn.skillsSeen, turnId: coachTurnId });
+  const id = deps.newId();
+  let placed = placeNode(run, { id, slot: turn.node.slot, text: turn.node.text, title: turn.node.title, ...(turn.node.tag ? { tag: turn.node.tag } : {}), state: 'accepted', skills: turn.skillsSeen, turnId: coachTurnId });
   for (const edge of turn.edges) {
     const from = slotToId(placed, edge.from);
     const to = slotToId(placed, edge.to);
     if (canEdge(placed, from, to, edge.kind)) placed = addEdge(placed, { from, to, kind: edge.kind });
   }
-  return { ...replaceRun(next, placed), pendingKeep: null };
+  return recordPlaced({ ...replaceRun(next, placed), pendingKeep: null }, placed, id, turn.basis, deps);
+}
+
+/**
+ * After a node lands in the decision record: a reason keeps the Explore nodes it rests on
+ * (`basis`, on the session, since they sit in other runs), and the review date becomes the
+ * session's review proposal, the page's confirm card (unless one is created or set aside).
+ */
+function recordPlaced(session, run, nodeId, refs, deps) {
+  if (run.tool !== RECORD_ID) return session;
+  const node = run.nodes.find((item) => item.id === nodeId);
+  const name = parseSlot(node.slot)?.name;
+  if (name === 'reason') {
+    const basis = resolveBasis(session, refs);
+    return basis.length ? { ...session, basis: { ...(session.basis ?? {}), [nodeId]: basis } } : session;
+  }
+  const open = !session.reviewTaskId && session.reviewProposal?.status !== 'dismissed';
+  if (name === 'review' && open && afterToday(node.text, deps)) {
+    return { ...session, reviewProposal: { title: reviewTitle(session), due: node.text, reason: 'The review date set in the decision record.', status: 'proposed' } };
+  }
+  return session;
 }
 
 /** The tool suggestion a new step opens with when the coach forgets to give one. */
@@ -259,7 +282,7 @@ export function applyCoachTurn(session, turn, deps) {
     } else if (run && !turn.node && turn.verdict === 'accept' && turn.edges?.length) {
       next = replaceRun(next, addAllowedEdges(run, turn.edges));
     } else if (run && turn.node && turn.verdict === 'challenge') {
-      next = { ...next, pendingKeep: { slot: turn.node.slot, text: turn.node.text, title: turn.node.title, tag: turn.node.tag, edges: turn.edges ?? [], objection: turn.message, skills: turn.skillsSeen, runId: run.id } };
+      next = { ...next, pendingKeep: { slot: turn.node.slot, text: turn.node.text, title: turn.node.title, tag: turn.node.tag, edges: turn.edges ?? [], objection: turn.message, skills: turn.skillsSeen, runId: run.id, ...(turn.basis?.length ? { basis: turn.basis } : {}) } };
     }
   }
 
@@ -288,13 +311,15 @@ export function keepAnyway(session, deps) {
   if (!canPlace(run, keep.slot)) throw fail(409, 'action_not_allowed', 'That answer no longer fits here.');
   const refused = acceptProblem(run, keep);
   if (refused) throw fail(409, 'action_not_allowed', refused);
-  let placed = placeNode(run, { id: deps.newId(), slot: keep.slot, text: keep.text, title: keep.title, ...(keep.tag ? { tag: keep.tag } : {}), state: 'contested', objection: keep.objection, skills: keep.skills, turnId: null });
+  const id = deps.newId();
+  let placed = placeNode(run, { id, slot: keep.slot, text: keep.text, title: keep.title, ...(keep.tag ? { tag: keep.tag } : {}), state: 'contested', objection: keep.objection, skills: keep.skills, turnId: null });
   for (const edge of keep.edges ?? []) {
     const from = slotToId(placed, edge.from);
     const to = slotToId(placed, edge.to);
     if (canEdge(placed, from, to, edge.kind)) placed = addEdge(placed, { from, to, kind: edge.kind });
   }
-  return touch({ ...replaceRun(session, placed), pendingKeep: null, turns: [...session.turns, userTurn('Keep it anyway.', deps)] }, deps);
+  const next = recordPlaced({ ...replaceRun(session, placed), pendingKeep: null }, placed, id, keep.basis, deps);
+  return touch({ ...next, turns: [...session.turns, userTurn('Keep it anyway.', deps)] }, deps);
 }
 
 /**
@@ -518,15 +543,21 @@ function cleanDigests(raw) {
 
 const sameTarget = (a, b) => Boolean(a && b) && a.kind === b.kind && a.id === b.id;
 
+/** A session that writes a page record: Problem Solver's case file (a Document step) or a decision record. */
+const keepsRecord = (session) => Boolean(session.model && (planStepForBook(session.model.id, 'document') || session.kind === 'decision'));
+
 /**
  * The page wrote the case file (or an update) to a task or project page; record it. No coach call.
  * A first write or a move (`moved`: the old page is gone) replaces the section digests; an update
  * merges them and must be the next version on the same page. The same version on the same page
  * again is a no-op, so a retry after a lost response is safe. The page joins the problem's links.
+ * A decision record also says whether its provenance graphic wrote (`graphic`); the same version
+ * on the same page with `graphic: true` records a retried graphic.
  */
 export function linkCaseFile(session, payload, deps) {
   if (session.status === 'archived') throw fail(409, 'action_not_allowed', 'This problem is archived.');
-  if (!session.model || !planStepForBook(session.model.id, 'document')) throw fail(409, 'action_not_allowed', 'This problem has no Document step.');
+  if (!keepsRecord(session)) throw fail(409, 'action_not_allowed', 'This problem has no Document step.');
+  const graphic = session.kind === 'decision' && typeof payload?.graphic === 'boolean' ? { graphic: payload.graphic } : {};
   const target = cleanTarget(payload?.target);
   const version = payload?.version;
   if (!Number.isInteger(version) || version < 1 || version > 999) throw fail(400, 'validation_error', 'A case file version is required.');
@@ -534,7 +565,9 @@ export function linkCaseFile(session, payload, deps) {
   if (!title) throw fail(400, 'validation_error', 'A case file title is required.');
   const sections = cleanDigests(payload?.sections);
   const record = session.caseFile;
-  if (record && record.version === version && sameTarget(record.target, target)) return session;
+  if (record && record.version === version && sameTarget(record.target, target)) {
+    return graphic.graphic === true && record.graphic === false ? touch({ ...session, caseFile: { ...record, graphic: true } }, deps) : session;
+  }
   const moved = payload?.moved === true;
   if (record && version !== record.version + 1) throw fail(409, 'action_not_allowed', `The next case file version is v${record.version + 1}.`);
   if (record && !moved && !sameTarget(record.target, target)) throw fail(409, 'action_not_allowed', 'An update goes on the page the case file is already on.');
@@ -545,7 +578,8 @@ export function linkCaseFile(session, payload, deps) {
     target,
     writtenAt: at,
     sections: record && !moved ? { ...record.sections, ...sections } : sections,
-    history: [...(record?.history ?? []), { version, at, target }]
+    history: [...(record?.history ?? []), { version, at, target }],
+    ...graphic
   };
   const linked = session.links.some((link) => sameTarget(link, target));
   const links = linked ? session.links : [...session.links, target];
diff --git a/packages/problem-solver/types.ts b/packages/problem-solver/types.ts
index 35b0a9202..b7398e46a 100644
--- a/packages/problem-solver/types.ts
+++ b/packages/problem-solver/types.ts
@@ -63,7 +63,9 @@ export type PsSession = {
   suggestion: PsSuggestion | null;
   /** The step whose opening tool suggestion was dismissed with Not now; it stays away there. */
   dismissedOpening?: string | null;
-  pendingKeep: { slot: string; text: string; objection: string } | null;
+  pendingKeep: { slot: string; text: string; objection: string; basis?: PsBasisRef[] } | null;
+  /** Decision Maker: per decision-record reason node, the Explore nodes it rests on. */
+  basis?: Record<string, PsBasisRef[]>;
   runner: { status: 'idle' | 'queued' | 'running' | 'failed'; mode: 'turn' | 'boundary'; error: string | null; leaving?: string };
   /** Tasks the coach proposed from Implement nodes; the page creates them in Tasks. */
   proposedTasks: PsProposedTask[];
@@ -88,7 +90,14 @@ export type PsAction = 'say' | 'keep_anyway' | 'accept_suggestion' | 'dismiss_su
 
 export type PsCaseFileTarget = { kind: 'task' | 'project'; id: string };
 /** What was written where: the section digests written, so later changes can be found. */
-export type PsCaseFileRecord = { title: string; version: number; target: PsCaseFileTarget; writtenAt: string; sections: Record<string, string>; history: { version: number; at: string; target: PsCaseFileTarget }[] };
+export type PsCaseFileRecord = { title: string; version: number; target: PsCaseFileTarget; writtenAt: string; sections: Record<string, string>; history: { version: number; at: string; target: PsCaseFileTarget }[]; graphic?: boolean };
 export type PsCaseFileSection = { key: string; heading: string; lines: string[] };
 export type PsCaseFile = { title: string; version: number; sections: PsCaseFileSection[] };
 export type PsCaseFileOffer = { kind: 'write' | 'update'; version: number; file: PsCaseFile; digests: Record<string, string>; key: string; changed: string[] };
+
+/** A decision record reason's basis: an Explore node, by run and node id. */
+export type PsBasisRef = { runId: string; nodeId: string };
+/** What a decision record's provenance graphic shows (packages/decision-book/record.mjs). */
+export type PsRecordProvenance = { model: string | null; section: number | null; models: string[]; date: string; caption: string };
+/** The decision record card's offer; `graphic` retries a provenance image that did not write. */
+export type PsRecordOffer = Omit<PsCaseFileOffer, 'kind'> & { kind: 'write' | 'update' | 'graphic'; provenance: PsRecordProvenance };
````

- [ ] **Step 2: Run the unit suite**

Run: `npm run test:unit`
Expected: PASS, with the same counts as Task 1.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/_shared/problem-solver/session.mjs packages/problem-solver/types.ts
git commit -m "Decision Maker: reasons keep their basis; the record review becomes the review card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The coach: `basis`, the Decide and Review layers, and the review state

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/coach-schema.mjs`, `netlify/functions/_shared/problem-solver/coach.mjs`, `netlify/functions/_shared/problem-solver/prompts.mjs`, `netlify/functions/_shared/problem-solver/decision-prompts.mjs`, `tests/unit/decision-book-prompts.test.js`

- [ ] **Step 1: Apply the patch**

- **Schema:** reads `basis`, dropping items of the wrong shape, at most four.
- **`withBasis` in the parser:** clears a basis from any node that is not a record reason. When an accepted reason resolves to no placed Explore node while some exist, it sends the reply back for repair, naming up to 20 nodes.
- **`prompts.mjs`:** exports `taskStatusLine` (the TASK STATUS line, unchanged), so Review can share it. `RUBRIC` does not change.
- **`decision-prompts.mjs`:**
  - the Decide and Review step layers, built from the record tool's own steps and slots;
  - the output block's `basis` field, and the first step joining "Can become tasks";
  - progress lines for a complete record and for Review;
  - REASONS CAN REST ON, and what each placed reason rests on;
  - the review card in TASKS, the waiting and in-progress review lines, TASK STATUS, and the decision record's write and update state;
  - after a learning answer, Decide suggests the record. While Review waits, the coach says it picks up on its date.
- **The Plan 4 Decide test** now checks the new layer.

````diff
diff --git a/netlify/functions/_shared/problem-solver/coach-schema.mjs b/netlify/functions/_shared/problem-solver/coach-schema.mjs
index 81f161eb3..9010f9930 100644
--- a/netlify/functions/_shared/problem-solver/coach-schema.mjs
+++ b/netlify/functions/_shared/problem-solver/coach-schema.mjs
@@ -116,6 +116,12 @@ export function validateCoachTurn(raw) {
     proposeTasks.push({ slot: item.slot, title, due: isDate(item.due) ? item.due : null });
   }
   const proposeReview = raw.proposeReview && isDate(raw.proposeReview.due) ? { due: raw.proposeReview.due, reason: text(raw.proposeReview.reason, 300) ?? '' } : null;
+  // A decision record reason's basis: the Explore nodes it rests on, by model id and slot. Items
+  // that are not shaped right are dropped; the session keeps only those naming a placed node.
+  const basis = (Array.isArray(raw.basis) ? raw.basis : [])
+    .filter((item) => typeof item?.tool === 'string' && parseSlot(item?.slot))
+    .slice(0, 4)
+    .map((item) => ({ tool: item.tool, slot: item.slot }));
 
   return {
     ok: true,
@@ -134,7 +140,8 @@ export function validateCoachTurn(raw) {
       learning: text(raw.learning, 600),
       lightning,
       proposeTasks,
-      proposeReview
+      proposeReview,
+      basis
     }
   };
 }
diff --git a/netlify/functions/_shared/problem-solver/coach.mjs b/netlify/functions/_shared/problem-solver/coach.mjs
index 5068178e9..b799960b0 100644
--- a/netlify/functions/_shared/problem-solver/coach.mjs
+++ b/netlify/functions/_shared/problem-solver/coach.mjs
@@ -9,6 +9,8 @@ import { buildLightningPrompt, checkLightningTurn } from './lightning-prompts.mj
 import { toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
 import { TOOLS, toolsForBookStep } from '../../../../packages/problem-solver/tools/index.mjs';
 import { activeRun, frameKeysOf, reopenProblem, waitingForReview } from './session.mjs';
+import { RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
+import { basisCandidates, resolveBasis } from '../../../../packages/decision-book/record.mjs';
 
 const WORD_LIMIT = 60;
 const REWRITE_OVER = 70;
@@ -130,11 +132,27 @@ function parse(session, text) {
   if (waitingForReview(session) && result.value.suggestion && result.value.suggestion.kind !== 'next_step') result.value = { ...result.value, suggestion: null };
   const fitted = fitToRun(session, result.value);
   if (fitted.error) return { ok: false, error: fitted.error };
-  const value = fitted.value;
+  const value = withBasis(session, fitted.value);
+  if (value.error) return { ok: false, error: value.error };
   if (value.suggestion?.kind === 'reopen_step' && reopenProblem(withAcceptedNode(session, value), value.suggestion.step)) return { ok: true, value: { ...value, suggestion: null } };
   return { ok: true, value };
 }
 
+/**
+ * A basis belongs only to a decision record reason. An accepted reason must rest on at least one
+ * placed Explore node when any exist (the repair names them); a reason with nothing behind it is
+ * challenged instead.
+ */
+function withBasis(session, value) {
+  const run = activeRun(session);
+  const reason = run?.tool === RECORD_ID && value.node && parseSlot(value.node.slot)?.name === 'reason';
+  if (!reason) return value.basis?.length ? { ...value, basis: [] } : value;
+  if (value.verdict !== 'accept' || resolveBasis(session, value.basis).length) return value;
+  const candidates = basisCandidates(session);
+  if (!candidates.length) return value;
+  return { error: `A reason rests on what a model showed: put at least one of these in "basis" as {"tool","slot"}, or challenge the reason. ${candidates.slice(0, 20).map((c) => `${c.tool} ${c.slot}`).join('; ')}.` };
+}
+
 function parseLightning(session, text) {
   const result = validateCoachTurn(extractJson(text));
   return result.ok ? checkLightningTurn(session, result.value) : result;
diff --git a/netlify/functions/_shared/problem-solver/decision-prompts.mjs b/netlify/functions/_shared/problem-solver/decision-prompts.mjs
index e19ff67af..0be89e43a 100644
--- a/netlify/functions/_shared/problem-solver/decision-prompts.mjs
+++ b/netlify/functions/_shared/problem-solver/decision-prompts.mjs
@@ -10,9 +10,11 @@ import { isComplete, nextSlots } from '../../../../packages/problem-solver/machi
 import { stepName, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
 import { COMPASS } from '../../../../packages/decision-book/compass.mjs';
 import { DECISION_MODEL } from '../../../../packages/decision-book/model.mjs';
-import { activeRun, currentStep, followOn, frameKeysOf, skippedUntouched } from './session.mjs';
+import { FEEDBACK_ID, RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
+import { basisCandidates, basisOf, recordOffer } from '../../../../packages/decision-book/record.mjs';
+import { activeRun, currentStep, followOn, frameKeysOf, skippedUntouched, waitingForReview } from './session.mjs';
 import { GATEKEEPING, THINKING_SKILLS, VOICE, outputBlock } from './prompts-shared.mjs';
-import { SUMMARY_EVERY, earlierSteps, proposable, scoreNote, transcript } from './prompts.mjs';
+import { SUMMARY_EVERY, earlierSteps, proposable, scoreNote, taskStatusLine, transcript } from './prompts.mjs';
 import { COMPASS_GUIDE, DECISION_TRAPS, SECTION_LINE, STANCE, anotherAngle, catalogueLines, modelNote } from './knowledge/decision-book.mjs';
 
 const MODEL_ID = DECISION_MODEL.id;
@@ -37,7 +39,7 @@ SESSION SHAPE
 6. Another angle: when the state says MINIMUM MET, offer the model's exercise if it has one, or one follow-up from ANOTHER ANGLE with "next_tool" and a one-sentence reason, or "next_step" to go to Decide. Offer one, not a menu. Every model run stays on the record.
 7. Switching: if the same slot has been challenged twice, or the model no longer fits the decision, suggest a better model with "switch_tool" and a one-sentence reason.
 8. Carry forward: use what earlier models established (listed under EARLIER) as the starting point, and say so. Do not copy it in without the person agreeing.
-9. Tasks: only slots listed under "Can become tasks" qualify (the Eisenhower matrix's do-immediately items). When one is specific enough to start (a clear action, ideally a date), offer it in "proposeTasks" with its slot and a short task title. The person confirms each on a card; never say a task exists until TASKS shows it confirmed.
+9. Tasks: only slots listed under "Can become tasks" qualify (the Eisenhower matrix's do-immediately items, and the decision record's first step). When one is specific enough to start (a clear action, ideally a date), offer it in "proposeTasks" with its slot and a short task title. The person confirms each on a card; never say a task exists until TASKS shows it confirmed.
 10. The person can move on at any time. Never block them.
 
 ${DECISION_TRAPS}
@@ -52,15 +54,31 @@ ${outputBlock({
   frame: ['decision', 'compass', 'known'],
   model: false,
   suggestion: '{"kind":"next_tool|switch_tool|next_step","tool":"...","reason":"..."}',
-  tasks: '"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}]',
-  rules: 'Include "proposeTasks" only for slots listed under "Can become tasks". Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "tool" only with next_tool or switch_tool, and only a model id from THE MODELS. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.'
+  tasks: '"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}],"basis":[{"tool":"...","slot":"..."}]',
+  rules: 'Include "proposeTasks" only for slots listed under "Can become tasks". Include "basis" only with a decision record reason. Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "tool" only with next_tool or switch_tool, and only a model id from THE MODELS, or the tool CURRENT STEP names in Decide and Review. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.'
 })}`;
 
+const record = TOOLS[RECORD_ID];
+
 const DECIDE = `CURRENT STEP: Decide
-Settle the decision in conversation: the decision in one sentence; the reasons, each resting on something a model showed; a Stop Rule (one trigger that would make them rethink, and the action agreed now); the first step; and a date to review it. Challenge a decision with no first step or nothing that would make them rethink. Do not suggest a model. Suggest next_step when it has what it needs.`;
+Settle the decision on the decision record (${RECORD_ID}), the one tool in this step. When no record is open, suggest it with next_tool. Work its slots in order, one per answer:
+${record.steps.map((s, i) => `  ${i + 1}. ${s.title}: ${s.prompt}`).join('\n')}
+Slot meanings: ${Object.entries(record.slots).map(([k, v]) => `${k} = ${v}`).join('; ')}.
+DECISION RECORD RULES
+- decision: one sentence the person would say to someone it affects. Seed it from the frame and what the models showed, and confirm before placing.
+- reason: accept only a reason that rests on something a model placed. Put those nodes in "basis" as [{"tool":"<model id>","slot":"<slot>"}], chosen from REASONS CAN REST ON. Never invent a node. A reason that rests on nothing a model showed is challenged (critical_thinking).
+- trigger: something the person would notice, with a date or a number where it can have one. action: what they agree now to do if it happens, not "think again".
+- first_step: small enough to start this week. It can become a task: offer it in "proposeTasks" with a short title and its date if they gave one. The person confirms it on a card; never say a task exists until TASKS shows it confirmed.
+- review: a date after TODAY, in node.text as YYYY-MM-DD. It becomes a review card the person confirms; never say it is set until REVIEW shows it created.
+- Challenge a decision with no first step or nothing that would make them rethink.
+- When the record is complete, suggest next_step: Review then waits for its date.`;
 
 const REVIEW = `CURRENT STEP: Review
-Compare what the person expected when they decided with what actually happened, then what they learned about how they decide. Look at what happened, not the plan. Do not suggest a model. Suggest next_step when it is done.`;
+Review compares what the person expected when they decided with what actually happened, on the feedback analysis (${FEEDBACK_ID}).
+- When REVIEW IS WAITING, the results are not in yet: say Review picks up on its date, and that they can press Review now if results are already in. Do not suggest a model or place nodes.
+- In a review: when no feedback analysis is open, suggest it with next_tool. Seed the centre from the decision; seed the expected side from the record's reasons and Stop Rule, and from any feedback analysis written in Explore before acting; seed the actual side from TASK STATUS and what the person says happened. Confirm before placing. Look at what happened, not the plan.
+- In the reflection, ask what the match or mismatch says about how they decide, and whether the Stop Rule's trigger came.
+- When it is complete, suggest next_step to close the review.`;
 
 /** Step layer: stable for the whole of a step, so it caches between turns. */
 function stepLayer(session) {
@@ -81,6 +99,8 @@ function compassLabels(value) {
 /** Minimum met: the exercise, the book's see also and ours (unused ones only), or Decide. */
 function progressLine(session, run) {
   if (!followOn(session)) return 'Progress: not yet at the minimum for this model; keep working its steps.';
+  if (run.tool === RECORD_ID) return 'Progress: RECORD COMPLETE. Suggest next_step: Review waits for its date.';
+  if (session.phase === 'review') return 'Progress: MINIMUM MET. Suggest next_step to close the review.';
   const used = (currentStep(session)?.runs ?? []).map((item) => item.tool);
   const { book, ours } = anotherAngle(run.tool, used);
   const angle = [book.length ? `the book's see also: ${book.join(', ')}` : '', ours.length ? `ours: ${ours.join(', ')}` : ''].filter(Boolean).join('; ');
@@ -104,10 +124,42 @@ function runState(session, run) {
   ].join('\n');
 }
 
+/** In Decide, the Explore nodes a reason can rest on, and what each placed reason rests on. */
+function basisLines(session, run) {
+  if (run.tool !== RECORD_ID) return [];
+  const candidates = basisCandidates(session);
+  const lines = [`REASONS CAN REST ON (tool slot: node):\n${candidates.map((c) => `  ${c.tool} ${c.slot}: ${c.title}`).join('\n') || '  nothing yet: no model placed anything in Explore'}`];
+  const basis = basisOf(session);
+  const rested = run.nodes.filter((node) => basis[node.id]).map((node) => `  ${node.slot} rests on ${basis[node.id].map((b) => `${b.model}: ${b.title}`).join('; ')}`);
+  if (rested.length) lines.push(`Placed reasons rest on:\n${rested.join('\n')}`);
+  return lines;
+}
+
 function taskLines(session) {
   const tasks = (session.proposedTasks ?? []).filter((p) => !p.removed);
-  if (!tasks.length) return null;
-  return `TASKS FROM THIS DECISION:\n${tasks.map((p) => `  ${p.status}: "${p.title}"${p.due ? ` due ${p.due}` : ''}`).join('\n')}`;
+  const proposal = session.reviewProposal;
+  if (!tasks.length && !proposal && !session.reviewTaskId) return null;
+  const review = session.reviewTaskId
+    ? `created for ${proposal?.due ?? 'its date'}`
+    : proposal?.status === 'dismissed' ? 'set aside by the person' : proposal ? `${proposal.status} for ${proposal.due}` : 'none yet';
+  return `TASKS FROM THIS DECISION:\n${tasks.map((p) => `  ${p.status}: "${p.title}"${p.due ? ` due ${p.due}` : ''}`).join('\n') || '  none'}\nREVIEW: ${review}`;
+}
+
+/** Review's state, the task evidence, and the decision record on its page. */
+function reviewLines(session) {
+  const lines = [];
+  const state = session.reviewState;
+  if (state?.status === 'waiting') lines.push(`REVIEW IS WAITING for results. It is ${session.reviewTaskId ? 'a task' : 'proposed'} for ${state.due ?? 'a date not yet set'}. Do not suggest a model or place nodes.`);
+  if (state?.status === 'reviewing') lines.push(`REVIEW IN PROGRESS since ${String(state.startedAt).slice(0, 10)}. Look at what actually happened, not the plan.`);
+  if (session.taskSnapshot) lines.push(taskStatusLine(session.taskSnapshot));
+  const offer = recordOffer(session);
+  const written = session.caseFile;
+  if (written) {
+    const where = written.target.kind === 'project' ? 'the linked project' : 'the linked task';
+    const changed = offer?.kind === 'update' ? ` Changed since: ${offer.changed.map((key) => offer.file.sections.find((s) => s.key === key)?.heading).join(', ')}. The person can add update v${offer.version} from the card.` : '';
+    lines.push(`DECISION RECORD: v${written.version} written ${written.writtenAt.slice(0, 10)} to ${where}.${changed}`);
+  } else if (offer) lines.push('DECISION RECORD: ready to write. The person writes it onto a task or project page from the card; it is not written yet.');
+  return lines;
 }
 
 function boundaryLine(session) {
@@ -130,10 +182,12 @@ export function buildDecisionPrompt(session) {
   if (session.frame.compass) parts.push(`COMPASS: ${compassLabels(session.frame.compass)}`);
   const earlier = earlierSteps(session);
   if (earlier) parts.push(earlier.replace(/^EARLIER STEPS:/, 'EARLIER:'));
+  if (session.model) parts.push(...reviewLines(session));
   if (session.pendingLearning && session.runner?.mode !== 'boundary') {
     const from = stepName(MODEL_ID, session.pendingLearning);
-    const offer = session.phase === 'explore' && !run ? ' and suggest a model with next_tool' : '';
-    parts.push(`AWAITING LEARNING from ${from}: if they named something they learned about how they decide, put it in "learning" (one sentence, their meaning); otherwise leave learning null. Either way, orient them to the current step in one sentence${offer}.`);
+    const offer = session.phase === 'explore' && !run ? ' and suggest a model with next_tool' : session.phase === 'decide' && !run ? ' and suggest the decision record with next_tool' : '';
+    const orient = waitingForReview(session) ? 'Then say Review picks up on its date, and do not suggest a model.' : `Either way, orient them to the current step in one sentence${offer}.`;
+    parts.push(`AWAITING LEARNING from ${from}: if they named something they learned about how they decide, put it in "learning" (one sentence, their meaning); otherwise leave learning null. ${orient}`);
   }
   const step = currentStep(session);
   if (step) {
@@ -141,8 +195,11 @@ export function buildDecisionPrompt(session) {
       parts.push(`Earlier model in this step ${item.tool}: ${item.status}${item.switchReason ? ` (${item.switchReason})` : ''}; ${item.nodes.map((node) => `${node.slot}: ${node.text}`).join(' | ')}${scoreNote(item)}`);
     }
   }
-  if (run) parts.push(runState(session, run));
-  else if (step && !session.pendingLearning && session.runner?.mode !== 'boundary' && toolsForPlanStep(MODEL_ID, session.phase).length) parts.push('No model is open in this step yet: recommend one with next_tool, naming a sibling you passed over.');
+  if (run) parts.push(runState(session, run), ...basisLines(session, run));
+  else if (step && !session.pendingLearning && session.runner?.mode !== 'boundary' && !waitingForReview(session)) {
+    if (session.phase === 'explore') parts.push('No model is open in this step yet: recommend one with next_tool, naming a sibling you passed over.');
+    else if (toolsForPlanStep(MODEL_ID, session.phase).length) parts.push(`No tool is open in this step yet: suggest ${toolsForPlanStep(MODEL_ID, session.phase)[0]} with next_tool.`);
+  }
   const tasks = taskLines(session);
   if (tasks) parts.push(tasks);
   if (session.pendingKeep) parts.push(`Last challenged answer (${session.pendingKeep.slot}): ${session.pendingKeep.text}`);
diff --git a/netlify/functions/_shared/problem-solver/prompts.mjs b/netlify/functions/_shared/problem-solver/prompts.mjs
index 0f370ee97..b11c25954 100644
--- a/netlify/functions/_shared/problem-solver/prompts.mjs
+++ b/netlify/functions/_shared/problem-solver/prompts.mjs
@@ -158,19 +158,21 @@ function taskLines(session) {
 
 const STATUS_WORDS = { open: 'not started', in_progress: 'in progress', deferred: 'deferred', done: 'done', dead: 'dropped', unknown: 'could not be checked' };
 
+/** The page's latest task snapshot as one line of evidence (shared with Decision Maker's Review). */
+export function taskStatusLine(snap) {
+  const counts = Object.entries(STATUS_WORDS).filter(([key]) => snap.byStatus[key] > 0).map(([key, words]) => `${snap.byStatus[key]} ${words}`);
+  const total = Object.values(snap.byStatus).reduce((sum, value) => sum + value, 0);
+  const overdue = snap.overdue.length ? `; overdue: ${snap.overdue.map((title) => `"${title}"`).join(', ')}` : '';
+  return `TASK STATUS (as of ${snap.at.slice(0, 10)}): ${total} ${total === 1 ? 'task' : 'tasks'}${counts.length ? `: ${counts.join(', ')}` : ''}${overdue}`;
+}
+
 function reviewLines(session) {
   const lines = [];
   const state = session.reviewState;
   const name = (step) => (step === 'finished' ? 'finished' : stepName(session.model.id, step));
   if (state?.status === 'waiting') lines.push(`IMPROVE IS WAITING for results. The review is ${session.reviewTaskId ? 'a task' : 'proposed'} for ${state.due ?? 'a date not yet set'}. Do not suggest a tool or place nodes.`);
   if (state?.status === 'reviewing') lines.push(`REVIEW IN PROGRESS since ${String(state.startedAt).slice(0, 10)}${state.returnTo ? `; afterwards the session returns to ${name(state.returnTo)}` : ''}. Look at what actually happened, not the plan.`);
-  const snap = session.taskSnapshot;
-  if (snap) {
-    const counts = Object.entries(STATUS_WORDS).filter(([key]) => snap.byStatus[key] > 0).map(([key, words]) => `${snap.byStatus[key]} ${words}`);
-    const total = Object.values(snap.byStatus).reduce((sum, value) => sum + value, 0);
-    const overdue = snap.overdue.length ? `; overdue: ${snap.overdue.map((title) => `"${title}"`).join(', ')}` : '';
-    lines.push(`TASK STATUS (as of ${snap.at.slice(0, 10)}): ${total} ${total === 1 ? 'task' : 'tasks'}${counts.length ? `: ${counts.join(', ')}` : ''}${overdue}`);
-  }
+  if (session.taskSnapshot) lines.push(taskStatusLine(session.taskSnapshot));
   const detour = session.detour;
   if (detour && detour.to === session.phase) lines.push(`REOPENED: ${name(detour.to)} was reopened from ${name(detour.from)} because: ${detour.reason} Use a fresh tool run here; earlier runs stay. When it has what it needs, suggest next_step: moving on returns to ${name(detour.from)}.`);
   return lines;
diff --git a/tests/unit/decision-book-prompts.test.js b/tests/unit/decision-book-prompts.test.js
index e3a80931d..6ee4b5af8 100644
--- a/tests/unit/decision-book-prompts.test.js
+++ b/tests/unit/decision-book-prompts.test.js
@@ -134,12 +134,12 @@ test('minimum met: another angle from the book\'s see also, then ours, or Decide
   assert.deepEqual(anotherAngle('dm_eisenhower'), { book: [], ours: ['dm_project_portfolio', 'dm_stop_rule'] });
 });
 
-test('Decide has its own step layer and no model note', () => {
+test('Decide has its own step layer, naming the decision record, and no model note', () => {
   const s = moveOn(inModel('dm_eisenhower'), deps);
   const prompt = buildDecisionPrompt(s);
   assert.equal(s.phase, 'decide');
   assert.equal(prompt.system.length, 2);
-  assert.match(prompt.system[1], /CURRENT STEP: Decide\n.+Stop Rule/);
+  assert.match(prompt.system[1], /^CURRENT STEP: Decide\nSettle the decision on the decision record \(dm_record\)[^]+Stop Rule/);
   assert.match(prompt.user, /MODE: boundary.+what they learned about how they decide/);
 });
 
````

- [ ] **Step 2: Run the prompt and coach tests**

Run: `node --test tests/unit/decision-book-prompts.test.js tests/unit/problem-solver-prompts.test.js tests/unit/decision-book-coach.test.js tests/unit/problem-solver-coach.test.js`
Expected: PASS. Problem Solver's rubric hash test is among them.

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/_shared/problem-solver/coach-schema.mjs netlify/functions/_shared/problem-solver/coach.mjs netlify/functions/_shared/problem-solver/prompts.mjs netlify/functions/_shared/problem-solver/decision-prompts.mjs tests/unit/decision-book-prompts.test.js
git commit -m "Decision Maker: the coach settles the record and runs the review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The scripted coach works a whole decision

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/scripted-coach.mjs`

- [ ] **Step 1: Apply the patch**

`decisionTurn` handles a decision session's own turns before the shared ones:
- opening a model in Explore, as `next_model`;
- `another angle`, which suggests the first unused see-also model, the book's first and then ours, once the minimum is met;
- `decide`;
- the record's reasons, each resting on the first Explore node not yet used;
- the review date, which must be `YYYY-MM-DD`;
- the waiting review, and the review's opening on the feedback analysis.

Suggestions go through `validateCoachTurn`, so `next_model` becomes `next_tool` exactly as a live reply would. Three smaller changes:
- a Decision Book quadrant item goes in the cell its words name;
- a feedback-analysis force is tagged from its words;
- any model's required link is met in the simplest way.

The boundary and learning messages say "decide" and "Review" in a decision session.

````diff
diff --git a/netlify/functions/_shared/problem-solver/scripted-coach.mjs b/netlify/functions/_shared/problem-solver/scripted-coach.mjs
index a15fc8359..f372e5f33 100644
--- a/netlify/functions/_shared/problem-solver/scripted-coach.mjs
+++ b/netlify/functions/_shared/problem-solver/scripted-coach.mjs
@@ -13,7 +13,12 @@ import { MODELS } from '../../../../packages/problem-solver/models.mjs';
 import { namingProblem } from '../../../../packages/problem-solver/naming.mjs';
 import { chosenOption, defaultToolFor, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
 import { applyStep, currentEntry, isQuestion, LIGHTNING_NODES } from '../../../../packages/problem-solver/lightning.mjs';
-import { activeRun, reopenProblem, skippedUntouched, waitingForReview } from './session.mjs';
+import { FEEDBACK_ID, RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
+import { basisCandidates } from '../../../../packages/decision-book/record.mjs';
+import { isRecordDate } from '../../../../packages/decision-book/tools/record.mjs';
+import { anotherAngle } from './knowledge/decision-book.mjs';
+import { validateCoachTurn } from './coach-schema.mjs';
+import { activeRun, currentStep, followOn, reopenProblem, skippedUntouched, waitingForReview } from './session.mjs';
 
 /**
  * Deterministic coach for local dev and tests. Short answers (under six words) are challenged.
@@ -27,7 +32,13 @@ import { activeRun, reopenProblem, skippedUntouched, waitingForReview } from './
  * that breaks a strict naming rule is challenged with that rule's advice. A decision session
  * takes its opening message as the decision, then asks who it is about and what is known; the
  * compass comes from the wording (team, others, them … → others; improve, better, change … →
- * improve).
+ * improve). In a decision session, once a model meets its minimum, `another angle` suggests the
+ * next model from its see also (as `next_model`, read through the coach schema like a live reply)
+ * and `decide` suggests moving on to Decide. The decision record takes its slots in order (a
+ * `reason:` hint adds another reason); each reason rests on the first Explore node it has not
+ * yet used, and the review needs a YYYY-MM-DD date. In Review, a feedback analysis force reads
+ * as expected when it says expected, thought, hoped or planned, otherwise as actual. A quadrant
+ * model's item goes in the cell its words name ("… do immediately").
  */
 const FRAME = [
   ['goal', 'What is the goal, as an ideal state rather than a fix? Say what good looks like.'],
@@ -86,6 +97,13 @@ function linksFor(run, slot) {
     const action = nodesNamed(run, 'action').find((node) => !picked.has(node.id));
     return action ? [{ from: slot, to: action.slot, kind: 'picks' }] : [];
   }
+  // A Decision Book model's required link: the first placed node the tool lets it join.
+  const kind = TOOLS[run.tool].requiredLinks?.[name]?.kind;
+  if (kind) {
+    const candidate = { ...run, nodes: [...run.nodes, { id: '__candidate__', slot }] };
+    const to = run.nodes.find((node) => canEdge(candidate, '__candidate__', node.id, kind));
+    return to ? [{ from: slot, to: to.slot, kind }] : [];
+  }
   return [];
 }
 
@@ -141,6 +159,8 @@ function placement(run, answer) {
     if (run.tool === 'kanban' && card && KANBAN_COLUMNS.includes(name)) return { slot: card, text, tag: name };
   }
   if (open.includes(CHOICE_SLOT)) return { slot: CHOICE_SLOT, text: answer, tag: null };
+  // The decision record moves on in order: a further reason needs its hint.
+  if (run.tool === RECORD_ID) return { slot: open.find((s) => parseSlot(s)?.name !== 'reason') ?? open[0], text: answer, tag: null };
   return { slot: open.find((s) => s !== 'root') ?? 'root', text: answer, tag: null };
 }
 
@@ -152,6 +172,10 @@ function tagFromText(run, slot, text) {
     if (/\b(more|keep)\b/i.test(text)) return 'do_more';
     return /\?|unclear/i.test(text) ? 'question' : 'change';
   }
+  if (run.tool === FEEDBACK_ID && name === 'force') return /\b(expected|thought|hoped|planned)\b/i.test(text) ? 'expected' : 'actual';
+  // A Decision Book quadrant item names its cell in words ("… do immediately").
+  const cells = TOOLS[run.tool].chart?.cells;
+  if (cells && name === 'item') return cells.find((cell) => text.toLowerCase().includes(cell.label.toLowerCase()))?.id ?? null;
   return null;
 }
 
@@ -206,14 +230,68 @@ function decisionFrameTurn(session, last) {
   const frame = { [key]: key === 'compass' ? heardCompass(last) : last };
   if (missing.length > 1) return { ...base, verdict: 'accept', frame, message: missing[1][1], skillsSeen: ['critical_thinking'] };
   const first = toolsForPlanStep('decision_book', 'explore')[0];
-  return {
-    ...base,
+  return asCoachReply({
     verdict: 'accept',
     frame,
     message: 'That frames it well. I suggest starting with one model that lays out the sides to weigh. Shall we begin?',
-    suggestion: first ? { kind: 'next_tool', tool: first, reason: 'A first model with clear sides to weigh.' } : null,
+    suggestion: first ? { kind: 'next_model', tool: first, reason: 'A first model with clear sides to weigh.' } : null,
     skillsSeen: ['decision_making']
-  };
+  });
+}
+
+/** A decision turn read through the coach schema, as a live reply is (so next_model becomes next_tool). */
+function asCoachReply(raw) {
+  const result = validateCoachTurn(raw);
+  if (!result.ok) throw new Error(`Scripted decision turn is invalid: ${result.error}`);
+  return result.value;
+}
+
+/** The Explore node a new reason rests on: the first one no placed reason uses yet, else the first. */
+function restsOn(session) {
+  const candidates = basisCandidates(session);
+  const used = new Set(Object.values(session.basis ?? {}).flat().map((ref) => ref.nodeId));
+  const pick = candidates.find((c) => !used.has(c.nodeId)) ?? candidates[0];
+  return pick ? [{ tool: pick.tool, slot: pick.slot }] : [];
+}
+
+/**
+ * A decision session's own turns, or null to fall through to the shared ones: opening a step's
+ * model, another angle, Decide, the decision record's reasons and date, and the review.
+ */
+function decisionTurn(session, last, run) {
+  if (!run && waitingForReview(session)) return { ...base, verdict: 'clarify', message: `Review picks up on ${dueText(session)}. Press Review now if the results are already in.` };
+  if (!run && session.reviewState?.status === 'reviewing' && session.phase === 'review') {
+    return asCoachReply({ verdict: 'clarify', suggestion: { kind: 'next_model', tool: FEEDBACK_ID, reason: 'Compare what you expected with what happened.' }, message: 'The results are in. The feedback analysis sets what you expected beside what happened; start it when you are ready.' });
+  }
+  if (!run && session.phase === 'explore') {
+    const first = toolsForPlanStep(session.model.id, 'explore')[0];
+    return asCoachReply({ verdict: 'clarify', suggestion: { kind: 'next_model', tool: first, reason: 'A first model with clear sides to weigh.' }, message: 'Pick a model from the shelf, or start with this one: it lays out the sides to weigh.' });
+  }
+  if (!run) return null;
+  if (/^another angle\b/i.test(last.trim()) && session.phase === 'explore') {
+    if (!followOn(session)) return { ...base, verdict: 'clarify', message: 'Finish this model first: it is not at its minimum yet. What goes next on the chart?' };
+    const used = (currentStep(session)?.runs ?? []).map((item) => item.tool);
+    const { book, ours } = anotherAngle(run.tool, used);
+    const tool = book[0] ?? ours[0];
+    if (!tool) return { ...base, verdict: 'clarify', suggestion: { kind: 'next_step', reason: 'No other angle is listed; settle the decision.' }, message: 'There is no other angle listed for this one. Shall we settle the decision?' };
+    return asCoachReply({ verdict: 'clarify', suggestion: { kind: 'next_model', tool, reason: `Another angle on the same decision: ${TOOLS[tool].name}.` }, message: `Another angle would help: ${TOOLS[tool].name} looks at it from a different side. Start it when you are ready.` });
+  }
+  if (/^decide\b/i.test(last.trim()) && session.phase === 'explore') {
+    return { ...base, verdict: 'clarify', suggestion: { kind: 'next_step', reason: 'The models have done their work.' }, message: 'Then let us settle it. Move on to Decide when you are ready.' };
+  }
+  if (run.tool !== RECORD_ID) return null;
+  const { slot, text } = placement(run, last);
+  const name = parseSlot(slot)?.name;
+  if (name === 'review') {
+    const date = /\d{4}-\d{2}-\d{2}/.exec(text)?.[0];
+    if (!isRecordDate(date)) return { ...base, verdict: 'clarify', message: 'Give the review a date, written like 2027-01-21. When will you look at what happened?' };
+    return { ...base, verdict: 'accept', node: { slot, text: date }, skillsSeen: ['metacognition'], message: 'Review set for that date; confirm it on the card. The decision record is complete.' };
+  }
+  if (wordCount(text) < 6) return null;
+  if (name === 'reason') {
+    return { ...base, verdict: 'accept', node: { slot, text }, basis: restsOn(session), skillsSeen: ['decision_making'], message: 'That reason rests on what the model showed. Now, what would make you rethink: what would you notice?' };
+  }
+  return null;
 }
 
 /**
@@ -274,11 +352,13 @@ export async function scriptedCoach(session) {
       const then = session.phase === 'finished' ? 'The whole problem is on the record now.' : 'Tell me what you notice here; the first tool for this step is ready below.';
       return { ...base, verdict: 'clarify', message: `Fair enough, nothing was done in that step, so there is nothing to look back on. ${then}` };
     }
-    return { ...base, verdict: 'clarify', message: 'Fair enough, that step is behind us now. Before we go on: what did you learn about how you tend to work through problems in that step?' };
+    const how = session.kind === 'decision' ? 'decide' : 'tend to work through problems';
+    return { ...base, verdict: 'clarify', message: `Fair enough, that step is behind us now. Before we go on: what did you learn about how you ${how} in that step?` };
   }
   if (session.pendingLearning) {
     if (waitingForReview(session)) {
-      return { ...base, verdict: 'clarify', learning: last || null, message: `Thank you, that is worth keeping. Improve picks up at your review on ${dueText(session)}.` };
+      const step = session.kind === 'decision' ? 'Review' : 'Improve';
+      return { ...base, verdict: 'clarify', learning: last || null, message: `Thank you, that is worth keeping. ${step} picks up at your review on ${dueText(session)}.` };
     }
     const hasTool = session.phase !== 'finished' && session.model && defaultToolFor(session.model.id, session.phase);
     const message = session.phase === 'finished'
@@ -312,6 +392,10 @@ export async function scriptedCoach(session) {
     return { ...base, verdict: 'accept', frame, message: missing[1][1], skillsSeen: ['critical_thinking'] };
   }
   const run = activeRun(session);
+  if (session.kind === 'decision') {
+    const own = decisionTurn(session, last, run);
+    if (own) return own;
+  }
   if (!run && waitingForReview(session)) {
     return { ...base, verdict: 'clarify', message: `Improve picks up at your review on ${dueText(session)}. Until then, tell me anything you notice.` };
   }
@@ -326,7 +410,7 @@ export async function scriptedCoach(session) {
   if (!last) {
     const first = TOOLS[run.tool].steps[0];
     const chosen = TOOLS[run.tool].step === 'implement' ? chosenOption(session) : null;
-    const carry = chosen ? `We are carrying forward: ${chosen.title}. ` : run.tool === 'after_action_review' ? reviewOpening(session) : '';
+    const carry = chosen ? `We are carrying forward: ${chosen.title}. ` : run.tool === 'after_action_review' || (run.tool === FEEDBACK_ID && session.reviewState?.status === 'reviewing') ? reviewOpening(session) : '';
     return { ...base, verdict: 'clarify', message: `${carry}Let's start the ${TOOLS[run.tool].name}. ${first.title}: ${first.prompt}` };
   }
   if (/^link:/i.test(last)) {
@@ -368,6 +452,8 @@ export async function scriptedCoach(session) {
   if (run.tool === 'after_action_review' && slot === 'learned' && wordCount(text) <= longestEarlier(run)) {
     return { ...base, verdict: 'challenge', ...fillNode(run, slot, text, tag), proposeTasks: [], skillsMissing: ['reflective_thinking'], message: `Learning is the heart of the review, yet this is shorter than what you said about what happened. Tell me more: what will you keep, change or try next time, and why?` };
   }
-  const message = slot === CHOICE_SLOT ? choiceMessage(run) : 'That holds up: it names a process, not a person. Now, why does that happen? Base your answer on what you just said.';
+  const message = slot === CHOICE_SLOT ? choiceMessage(run)
+    : session.kind === 'decision' ? 'That holds up, and it is on the chart. What goes next: what else belongs here?'
+      : 'That holds up: it names a process, not a person. Now, why does that happen? Base your answer on what you just said.';
   return { ...base, verdict: 'accept', ...fillNode(run, slot, text, tag), skillsSeen: ['analysis'], message };
 }
````

- [ ] **Step 2: Run the scripted coach tests**

Run: `node --test tests/unit/decision-book-scripted.test.js tests/unit/problem-solver-scripted.test.js`
Expected: PASS (47 when drafted).

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/_shared/problem-solver/scripted-coach.mjs
git commit -m "Decision Maker: the scripted coach takes a decision from frame to review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tests for Decide, the record and Review

**Files:**
- Create: `tests/unit/decision-book-decide.test.js`, `apps/tasks/tests/unit/decision-book-record-basis.test.ts`

- [ ] **Step 1: Create the unit tests**

These cover:
- the plan's tools and defaults, `serves`, and that no step is called `choose`;
- that Problem Solver never lists the record;
- the record's slot order, its date check and its task slot;
- a scripted walk: Explore, another angle, Decide, the record with its basis, the review and task cards, waiting, Review now with the task evidence, and the feedback analysis;
- the composed record and its provenance;
- the record offers (write, graphic retry, update after the review);
- the case-file guard for Problem Solver;
- the live coach's basis repair, a challenged reason's basis surviving Keep it anyway, and the two step layers.

**Create `tests/unit/decision-book-decide.test.js`:**

````js
// tests/unit/decision-book-decide.test.js
// Decision Maker's Decide, record and Review: the plan's tools for each step, the decision record
// tool, a reason's basis, the review date as a confirm card, the record composed from the session
// (with its provenance and update offers), the coach's basis rule, the Decide and Review prompt
// layers, and one scripted walk from frame to a reviewed decision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOOK_STEPS, defaultToolFor, planStepForBook, stepPlan, stepServes, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { TOOLS, toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';
import { canPropose, checkNode, isComplete, newRun, nextSlots, placeNode } from '../../packages/problem-solver/machine.mjs';
import { reviewStart } from '../../packages/problem-solver/review.mjs';
import { MODELS } from '../../packages/problem-solver/models.mjs';
import { FEEDBACK_ID, RECORD_ID } from '../../packages/decision-book/record-slots.mjs';
import { basisCandidates, basisOf, composeRecord, dateWords, mainModel, recordOffer, recordProvenance, resolveBasis } from '../../packages/decision-book/record.mjs';
import { isRecordDate } from '../../packages/decision-book/tools/record.mjs';
import { scriptedCoach } from '../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { buildDecisionPrompt } from '../../netlify/functions/_shared/problem-solver/decision-prompts.mjs';
import { RUBRIC, buildCoachPrompt } from '../../netlify/functions/_shared/problem-solver/prompts.mjs';
import {
  acceptSuggestion, applyCoachTurn, confirmTask, createSession, dismissSuggestion, keepAnyway, linkCaseFile, moveOn, say, setReviewTask, startReview
} from '../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };

/** One coach turn when the runner is queued, after the person's words if any. */
async function step(session, text) {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
}

/** A framed decision with the Eisenhower matrix worked to its minimum. */
async function explored() {
  let s = await step(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps));
  s = await step(s, 'It is about me and I want to understand what I really want.');
  s = await step(s, 'The offer closes Friday and the rent there is double.');
  s = await step(acceptSuggestion(s, deps));
  s = await step(s, 'Reply to the Sydney offer letter, do immediately');
  s = await step(s, 'Talk the move over with my partner, decide when');
  s = await step(s, 'Sort out the lease renewal paperwork, do later');
  s = await step(s, 'reflection: The offer reply is the only thing that cannot wait.');
  return s;
}

/** Explored, then Decide opened on the decision record. */
async function deciding() {
  let s = await explored();
  s = await step(s, 'decide');
  s = await step(acceptSuggestion(s, deps)); // boundary: the learning question
  s = await step(s, 'I decide faster once the urgent part is named.');
  return step(acceptSuggestion(s, deps));
}

/** Deciding, with the record worked to complete. */
async function decided() {
  let s = await deciding();
  for (const answer of [
    'I will take the Sydney job and move in March.',
    'The offer reply cannot wait and it matters most.',
    'The rent there goes above half of my pay.',
    'Then I look at the flats further out instead.',
    'Email my acceptance to the Sydney office on Monday.',
    'Review it on 2027-01-21'
  ]) s = await step(s, answer);
  return s;
}

const recordRun = (s) => s.steps.decide.runs.find((run) => run.tool === RECORD_ID);

// ---------------------------------------------------------------- plan and tool

test('Decide lists only the decision record and Review only the feedback analysis, each its default', () => {
  assert.deepEqual(toolsForPlanStep('decision_book', 'decide'), [RECORD_ID]);
  assert.equal(defaultToolFor('decision_book', 'decide'), RECORD_ID);
  assert.deepEqual(toolsForPlanStep('decision_book', 'review'), [FEEDBACK_ID]);
  assert.equal(defaultToolFor('decision_book', 'review'), FEEDBACK_ID);
  assert.equal(defaultToolFor('decision_book', 'explore'), null);
  assert.ok(!toolsForPlanStep('decision_book', 'explore').includes(RECORD_ID));
});

test('Decide serves as Implement and Review as Improve; Problem Solver keeps its own steps; no step is choose', () => {
  assert.equal(planStepForBook('decision_book', 'implement'), 'decide');
  assert.equal(planStepForBook('decision_book', 'improve'), 'review');
  assert.equal(planStepForBook('decision_book', 'document'), null);
  assert.ok(stepServes('decision_book', 'review', 'improve') && !stepServes('decision_book', 'explore', 'improve'));
  assert.equal(planStepForBook('seven_step', 'improve'), 'improve');
  assert.equal(planStepForBook('polya', 'improve'), 'evaluate');
  assert.ok(stepPlan('decision_book').every((s) => s.step !== 'choose'));
  assert.ok(TOOLS[RECORD_ID].steps.every((s) => s.id !== 'choose'));
});

test('Problem Solver never lists the decision record: no toolkit step, plan step or rubric line', () => {
  for (const book of BOOK_STEPS) assert.ok(!toolsForBookStep(book.id).includes(RECORD_ID), book.id);
  for (const id of Object.keys(MODELS)) for (const { step: stepId } of stepPlan(id)) assert.ok(!toolsForPlanStep(id, stepId).some((tool) => tool.startsWith('dm_')), `${id} ${stepId}`);
  assert.ok(!RUBRIC.includes('dm_'));
  const s = createSession({ text: 'Late rota.' }, deps);
  assert.ok(!buildCoachPrompt(s).system.join('\n').includes('dm_'));
});

test('the record takes its slots in order and completes with every one', () => {
  const place = (run, slot, text = 'An answer here') => placeNode(run, { id: `n${run.nodes.length + 1}`, slot, text, state: 'accepted' });
  let run = newRun(RECORD_ID, 'r');
  assert.deepEqual(nextSlots(run), ['decision']);
  run = place(run, 'decision');
  assert.deepEqual(nextSlots(run), ['reason:1']);
  run = place(run, 'reason:1');
  assert.deepEqual(nextSlots(run), ['reason:2', 'trigger']);
  run = place(run, 'trigger');
  assert.deepEqual(nextSlots(run), ['reason:2', 'action']);
  run = place(run, 'action');
  run = place(run, 'first_step');
  assert.deepEqual(nextSlots(run), ['reason:2', 'review']);
  assert.ok(!isComplete(run));
  assert.equal(checkNode(run, { slot: 'review', text: 'in a month' }), 'The review is a date: put it in node.text as YYYY-MM-DD.');
  assert.equal(checkNode(run, { slot: 'review', text: '2027-02-31' }), 'The review is a date: put it in node.text as YYYY-MM-DD.');
  run = place(run, 'review', '2027-01-21');
  assert.ok(isComplete(run));
  assert.deepEqual(nextSlots(run), []);
  assert.ok(canPropose(run, run.nodes.find((node) => node.slot === 'first_step')));
  assert.ok(!canPropose(run, run.nodes.find((node) => node.slot === 'decision')));
  assert.ok(isRecordDate('2027-01-21') && !isRecordDate('21/01/2027'));
});

// ---------------------------------------------------------------- the walk

test('the scripted coach suggests another angle from the see also as next_model, then Decide', async () => {
  let s = await explored();
  assert.ok(isComplete(s.steps.explore.runs[0]));
  assert.equal(s.proposedTasks.length, 1, 'the do-immediately item is offered as a task');
  s = await step(s, 'another angle');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: 'dm_project_portfolio', reason: 'Another angle on the same decision: The project portfolio matrix.' });
  s = dismissSuggestion(s, deps);
  s = await step(s, 'decide');
  assert.equal(s.suggestion.kind, 'next_step');
});

test('Decide opens on the decision record; a reason keeps the Explore node it rests on', async () => {
  let s = await deciding();
  assert.equal(s.phase, 'decide');
  assert.equal(s.steps.decide.runs[0].tool, RECORD_ID);
  s = await step(s, 'I will take the Sydney job and move in March.');
  s = await step(s, 'The offer reply cannot wait and it matters most.');
  const reason = recordRun(s).nodes.find((node) => node.slot === 'reason:1');
  const item = s.steps.explore.runs[0].nodes.find((node) => node.slot === 'item:1');
  assert.deepEqual(s.basis[reason.id], [{ runId: s.steps.explore.runs[0].id, nodeId: item.id }]);
  assert.deepEqual(basisOf(s)[reason.id], [{ model: 'The Eisenhower matrix', title: item.text }]);
  const prompt = buildDecisionPrompt(s);
  assert.match(prompt.user, /REASONS CAN REST ON \(tool slot: node\):\n {2}dm_eisenhower item:1: /);
  assert.match(prompt.user, /Placed reasons rest on:\n {2}reason:1 rests on The Eisenhower matrix: /);
});

test('the record’s review date becomes the review card; its first step a task card', async () => {
  const s = await decided();
  assert.ok(isComplete(recordRun(s)));
  assert.deepEqual(s.reviewProposal, { title: 'Review: Should I take the Sydney job offer?', due: '2027-01-21', reason: 'The review date set in the decision record.', status: 'proposed' });
  assert.equal(s.proposedTasks.at(-1).title, 'Email my acceptance to the Sydney office on');
  assert.equal(s.suggestion.kind, 'next_step');
  assert.match(buildDecisionPrompt(s).user, /Progress: RECORD COMPLETE\. Suggest next_step: Review waits for its date\./);
  assert.match(buildDecisionPrompt(s).user, /REVIEW: proposed for 2027-01-21/);
});

test('a review date that is not after today is placed but proposes no review', async () => {
  let s = await deciding();
  for (const answer of ['I will take the Sydney job and move in March.', 'The offer reply cannot wait and it matters most.', 'The rent there goes above half of my pay.', 'Then I look at the flats further out instead.', 'Email my acceptance to the Sydney office on Monday.', 'Review it on 2026-10-01']) s = await step(s, answer);
  assert.ok(isComplete(recordRun(s)));
  assert.equal(s.reviewProposal, null);
});

test('moving on waits for the review; Review now opens the feedback analysis with the task evidence', async () => {
  let s = await decided();
  s = confirmTask(s, { proposalId: s.proposedTasks.at(-1).id, taskId: 'task-first' }, deps);
  s = setReviewTask(s, { taskId: 'task-review', due: '2027-01-21' }, deps);
  s = await step(moveOn(s, deps));
  assert.equal(s.phase, 'review');
  assert.deepEqual(s.reviewState, { status: 'waiting', due: '2027-01-21', returnTo: null, startedAt: null });
  assert.match(buildDecisionPrompt(s).user, /REVIEW IS WAITING for results\. It is a task for 2027-01-21\./);
  s = await step(s, 'I learned I set the trigger before I felt sure.');
  assert.match(s.turns.at(-1).text, /Review picks up at your review on/);
  assert.equal(s.suggestion, null);
  assert.equal(reviewStart(s), 'start');
  s = await step(startReview(s, { snapshot: { byStatus: { done: 1, open: 1 }, overdue: [] } }, deps));
  assert.equal(s.reviewState.status, 'reviewing');
  assert.deepEqual(s.suggestion, { kind: 'next_tool', tool: FEEDBACK_ID, reason: 'Compare what you expected with what happened.' });
  assert.match(buildDecisionPrompt(s).user, /TASK STATUS \(as of 2026-10-21\): 2 tasks: 1 not started, 1 done/);
  s = await step(acceptSuggestion(s, deps));
  assert.match(s.turns.at(-1).text, /^Let's look at how it went\. 1 of 2 tasks are done\./);
  s = await step(s, 'Taking the Sydney job and moving in March.');
  s = await step(s, 'I expected the move to settle within two months.');
  s = await step(s, 'The move took four months and cost far more.');
  s = await step(s, 'reflection: I judge timing too hopefully, so I pad my estimates now.');
  const run = s.steps.review.runs[0];
  assert.deepEqual(run.nodes.filter((node) => node.slot.startsWith('force')).map((node) => node.tag), ['expected', 'actual']);
  assert.ok(isComplete(run));
  assert.match(buildDecisionPrompt(s).user, /Suggest next_step to close the review/);
});

// ---------------------------------------------------------------- the record

test('the record composes from the session, never the coach’s words', async () => {
  const s = await decided();
  const file = composeRecord(s);
  assert.equal(file.title, 'Decision: Should I take the Sydney job offer?');
  assert.deepEqual(file.sections.map((section) => section.key), ['decision', 'reasons', 'stop_rule', 'first_step', 'review', 'known', 'models', 'learnings']);
  const lines = Object.fromEntries(file.sections.map((section) => [section.key, section.lines]));
  assert.deepEqual(lines.decision, ['I will take the Sydney job and move in March.']);
  assert.match(lines.reasons[0], /^The offer reply cannot wait and it matters most\. \(rests on The Eisenhower matrix: .+\)$/);
  assert.deepEqual(lines.stop_rule, ['If: The rent there goes above half of my pay.', 'Then: Then I look at the flats further out instead.']);
  assert.deepEqual(lines.review, ['21 January 2027']);
  assert.deepEqual(lines.models, ['The Eisenhower matrix']);
  assert.ok(!JSON.stringify(file).includes('That holds up'), 'no coach message reaches the record');
});

test('the provenance names the main model, its section and the caption', async () => {
  const s = await decided();
  assert.equal(mainModel(s), 'dm_eisenhower');
  assert.deepEqual(recordProvenance(s), {
    model: 'dm_eisenhower',
    section: 1,
    models: ['The Eisenhower matrix'],
    date: '2026-10-21',
    caption: 'Decided with The Decision Book · The Eisenhower matrix · 21 October 2026'
  });
  assert.equal(dateWords('2027-01-01'), '1 January 2027');
  assert.equal(dateWords('soon'), 'soon');
});

test('record offers: write, then nothing, a graphic retry, and a dated update after the review', async () => {
  let s = await decided();
  assert.equal(recordOffer(createSession({ text: 'Late rota.' }, deps)), null, 'only decision sessions keep a record');
  const offer = recordOffer(s);
  assert.equal(offer.kind, 'write');
  assert.equal(offer.provenance.caption, 'Decided with The Decision Book · The Eisenhower matrix · 21 October 2026');
  assert.match(buildDecisionPrompt(s).user, /DECISION RECORD: ready to write\./);
  s = linkCaseFile(s, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: false }, deps);
  assert.equal(s.caseFile.graphic, false);
  assert.equal(recordOffer(s).kind, 'graphic');
  s = linkCaseFile(s, { target: { kind: 'task', id: 'task-page' }, version: 1, title: offer.file.title, sections: offer.digests, graphic: true }, deps);
  assert.equal(s.caseFile.graphic, true);
  assert.equal(recordOffer(s), null);
  assert.deepEqual(s.links, [{ kind: 'task', id: 'task-page' }]);
  assert.match(buildDecisionPrompt(s).user, /DECISION RECORD: v1 written 2026-10-21 to the linked task\./);

  s = setReviewTask(s, { taskId: 'task-review', due: '2027-01-21' }, deps);
  s = await step(moveOn(s, deps));
  s = await step(s, 'Nothing new about how I decide yet.');
  s = await step(startReview(s, {}, deps));
  s = await step(acceptSuggestion(s, deps));
  for (const answer of ['Taking the Sydney job and moving in March.', 'I expected the move to settle within two months.', 'The move took four months and cost far more.']) s = await step(s, answer);
  assert.equal(recordOffer(s), null, 'held while the review is under way');
  s = await step(s, 'reflection: I judge timing too hopefully, so I pad my estimates now.');
  s = await step(moveOn(s, deps));
  assert.equal(s.phase, 'finished');
  const update = recordOffer(s);
  assert.equal(update.kind, 'update');
  assert.equal(update.version, 2);
  assert.ok(update.changed.includes('outcome'));
  assert.deepEqual(update.file.sections.find((section) => section.key === 'outcome').lines, ['The move took four months and cost far more.', 'What it shows: I judge timing too hopefully, so I pad my estimates now.']);
});

test('a session with no record of its own still cannot link one; Problem Solver ignores graphic', () => {
  const unframed = createSession({ text: 'Late rota.' }, deps);
  assert.throws(() => linkCaseFile(unframed, { target: { kind: 'task', id: 't' }, version: 1, title: 'x', sections: { a: '0000000a' } }, deps), /no Document step/);
  const framed = { ...unframed, model: { id: 'polya', reason: 'r' } };
  const linked = linkCaseFile(framed, { target: { kind: 'task', id: 't' }, version: 1, title: 'x', sections: { a: '0000000a' }, graphic: false }, deps);
  assert.equal(linked.caseFile.graphic, undefined);
});

// ---------------------------------------------------------------- the live coach's basis rule

test('the live coach must rest an accepted reason on a placed node; other nodes drop a basis', async () => {
  let s = await deciding();
  s = await step(s, 'I will take the Sydney job and move in March.');
  s = say(s, 'Because the offer reply cannot wait.', deps);
  const replies = [
    { verdict: 'accept', message: 'That holds up. What would make you rethink?', node: { slot: 'reason', text: 'The offer reply cannot wait.' } },
    { verdict: 'accept', message: 'That holds up. What would make you rethink?', node: { slot: 'reason', text: 'The offer reply cannot wait.' }, basis: [{ tool: 'dm_eisenhower', slot: 'item:1' }, { tool: 'dm_nope', slot: 'item:1' }] }
  ];
  const seen = [];
  const coach = createModelCoach(async (prompt) => {
    seen.push(prompt.user);
    return JSON.stringify(replies.shift());
  });
  const turn = await coach(s);
  assert.match(seen[1], /YOUR LAST REPLY WAS REJECTED: A reason rests on what a model showed: put at least one of these in "basis".+dm_eisenhower item:1/);
  assert.deepEqual(turn.basis, [{ tool: 'dm_eisenhower', slot: 'item:1' }, { tool: 'dm_nope', slot: 'item:1' }]);
  const next = applyCoachTurn(s, turn, deps);
  const reason = recordRun(next).nodes.find((node) => node.slot === 'reason:1');
  assert.equal(next.basis[reason.id].length, 1, 'only the placed node is kept');

  const other = createModelCoach(async () => JSON.stringify({ verdict: 'accept', message: 'Noted, now the next one. What else?', node: { slot: 'trigger', text: 'Rent above half my pay.' }, basis: [{ tool: 'dm_eisenhower', slot: 'item:1' }] }));
  assert.deepEqual((await other(say(next, 'If rent tops half my pay.', deps))).basis, []);
});

test('a challenged reason keeps its basis for Keep it anyway', async () => {
  let s = await deciding();
  s = await step(s, 'I will take the Sydney job and move in March.');
  s = say(s, 'Feels right.', deps);
  const turn = { verdict: 'challenge', message: 'That rests on a feeling. What did a model show?', node: { slot: 'reason:1', text: 'Feels right.', title: 'Feels right' }, edges: [], skillsSeen: [], skillsMissing: ['critical_thinking'], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, proposeTasks: [], proposeReview: null, basis: [{ tool: 'dm_eisenhower', slot: 'item:2' }] };
  s = applyCoachTurn(s, turn, deps);
  assert.deepEqual(s.pendingKeep.basis, [{ tool: 'dm_eisenhower', slot: 'item:2' }]);
  s = keepAnyway(s, deps);
  const reason = recordRun(s).nodes.find((node) => node.slot === 'reason:1');
  assert.equal(reason.state, 'contested');
  assert.equal(s.basis[reason.id][0].nodeId, s.steps.explore.runs[0].nodes.find((node) => node.slot === 'item:2').id);
});

test('basis candidates are the latest kept run of each model; unknown references resolve to nothing', async () => {
  const s = await explored();
  const candidates = basisCandidates(s);
  assert.deepEqual(candidates.map((c) => c.slot), ['item:1', 'item:2', 'item:3', 'reflection']);
  assert.deepEqual(resolveBasis(s, [{ tool: 'dm_eisenhower', slot: 'item:9' }, null, { tool: 'swot', slot: 'item:1' }]), []);
});

// ---------------------------------------------------------------- prompt layers

test('the Decide and Review layers name their tool and rules', async () => {
  const s = await deciding();
  const decide = buildDecisionPrompt(s).system[1];
  assert.match(decide, /DECISION RECORD RULES/);
  assert.match(decide, /"basis" as \[\{"tool":"<model id>","slot":"<slot>"\}\]/);
  assert.match(decide, /review: a date after TODAY, in node.text as YYYY-MM-DD/);
  const review = buildDecisionPrompt({ ...s, phase: 'review', steps: { ...s.steps, review: { runs: [], status: 'open', objection: null } } }).system[1];
  assert.match(review, /^CURRENT STEP: Review\nReview compares what the person expected when they decided with what actually happened, on the feedback analysis \(dm_feedback_analysis\)\./);
  assert.match(review, /When REVIEW IS WAITING/);
});
````

- [ ] **Step 2: Create the chart test**

This walks a real session with the scripted coach, then checks that the record chart shows the Explore node a reason rests on, through `basisOf` and `setBasis`.

**Create `apps/tasks/tests/unit/decision-book-record-basis.test.ts`:**

````ts
// The decision record chart on a real session: a reason's basis, kept on the session by the
// server, reaches the chart through basisOf and setBasis. The session is walked by the scripted
// coach, as the browser walks will be.
import { describe, expect, it } from 'vitest';
import { createChartForRun } from '../../../../packages/decision-book/render/charts';
import type { RecordView } from '../../../../packages/decision-book/render/record';
import type { DmToolRun } from '../../../../packages/decision-book/render/core';
import { RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
import { basisOf } from '../../../../packages/decision-book/record.mjs';
import { scriptedCoach } from '../../../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, say } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
type Session = ReturnType<typeof createSession>;

async function step(session: Session, text?: string): Promise<Session> {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
}

describe('decision record basis', () => {
  it('shows the Explore node each reason rests on', async () => {
    let s = await step(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps));
    s = await step(s, 'It is about me and I want to understand what I really want.');
    s = await step(s, 'The offer closes Friday and the rent there is double.');
    s = await step(acceptSuggestion(s, deps));
    for (const answer of ['Reply to the Sydney offer letter, do immediately', 'Talk the move over with my partner, decide when', 'Sort out the lease renewal paperwork, do later', 'reflection: The offer reply is the only thing that cannot wait.', 'decide']) s = await step(s, answer);
    s = await step(acceptSuggestion(s, deps));
    s = await step(s, 'I decide faster once the urgent part is named.');
    s = await step(acceptSuggestion(s, deps));
    for (const answer of ['I will take the Sydney job and move in March.', 'The offer reply cannot wait and it matters most.']) s = await step(s, answer);

    const run = s.steps.decide.runs.find((item: { tool: string }) => item.tool === RECORD_ID) as unknown as DmToolRun;
    const view = createChartForRun(run) as unknown as RecordView;
    view.update(run);
    view.setBasis(basisOf(s));
    const reason = run.nodes.find((node) => node.slot === 'reason:1')!;
    expect(view.el.querySelector(`.dm-entry[data-node="${reason.id}"] .dm-entry__meta`)!.textContent).toBe('Rests on The Eisenhower matrix: Reply to the Sydney offer letter, do immediately');
  });
});
````

- [ ] **Step 3: Run them**

Run: `node --test tests/unit/decision-book-decide.test.js && (cd apps/tasks && npx vitest run tests/unit/decision-book-record-basis.test.ts)`
Expected: PASS (17 and 1).

- [ ] **Step 4: Commit**

```bash
git add tests/unit/decision-book-decide.test.js apps/tasks/tests/unit/decision-book-record-basis.test.ts
git commit -m "Decision Maker: tests for Decide, the record and Review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Plan 5 check, and the plan set

- [ ] **Step 1:** `npm run test:unit`: PASS (5,703 when drafted: 5,692 pass, 11 skipped).
- [ ] **Step 2:** `cd apps/tasks && npx vitest run tests/unit/problem-solver tests/unit/decision-book`: PASS (55 files, 1,088 tests when drafted).
- [ ] **Step 3:** `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep -E "problem-solver|decision-book" | grep -v "TS6059\|Imported via\|rootDir" || echo "no problem-solver or decision-book errors"`
- [ ] **Step 4:** Do not push. Update `decision-book-tool.md` with "Plan 5 done (HEAD <sha>)".

---

## Notes for Plan 6 (the app)

**Client folder.** Everything goes in `apps/tasks/src/views/decision-book/`, with nav "Decision Maker" at `#/decision-maker`. Reuse Problem Solver's client, given a base path, rather than copying it:
- `api.ts` hard-codes `/api/problem-solver`. Make it a factory, `createSessionApi(base)`, keeping `problemSolverApi` as `createSessionApi('/api/problem-solver')`.
- Do the same for the coach panel, task cards, review panel, review sync, session sync, task bridge and link chips. Link chips gain a Decision Maker chip (`/api/decision-book?linked=`).

**Mock API.** `apps/tasks/scripts/mock-api.ts` serves only `/api/problem-solver`. Add a second service:
- `createProblemSolverService({ store: createMemoryProblemStore(), coach: scriptedCoach, kinds: ['decision'] })`;
- the route `/api/decision-book`.

The `tasks-dev` launch configuration and the walks then run on the scripted coach. Its walk vocabulary:
- a quadrant item names its cell ("… do immediately");
- `reflection: …`;
- `another angle`;
- `decide`;
- a `reason: …` hint adds a second reason;
- the review is typed as `2027-01-21`;
- in Review, a force with "expected", "thought", "hoped" or "planned" is expected; any other is actual.

**Record card.** Show it from `recordOffer(session)`, not `caseFileOffer`. `record-blocks.ts` builds:
- an image block whose source is the main model's emblem from the Tasks build's static assets;
- a heading;
- one rich-text block per section;
- a rich-text block with the provenance caption and a link back to `#/decision-maker?id=<id>`.

Writing it:
- Block ids are fixed per session and version, as `caseFileBlockId` does.
- The bridge appends the text blocks first, then the image. It calls `link_case_file` with `graphic: true` or `false`.
- On a `graphic` offer, the card offers "Retry the graphic": append the image block, then link the same version with `graphic: true`.
- Teaching's image block schema is in `@teaching/schemas/block`; check its fields (url, alt text) before building.

**Canvas.**
- `createChartForRun` already returns the record chart for `dm_record` runs.
- Call `view.setBasis(basisOf(session))` after each update. `apps/tasks/tests/unit/decision-book-record-basis.test.ts` shows the call.
- Feed the medal and track from `recordProvenance(session)` (main model and section).
- Review reuses Problem Solver's review panel and `review-sync.ts` unchanged: the review step is found through `planStepForBook(model, 'improve')`.

**Task cards.** The first step comes through `proposedTasks` and the review through `reviewProposal`, so Problem Solver's task cards and review card work as they are. Their wording says "problem"; pass "decision" through the base-path options.

**Browser check.** Check the landing and session pages at desktop and 390px with `tasks-dev`, then renumber: Quick decision and checks are Plan 7.
