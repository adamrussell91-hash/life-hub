# Decision Maker Plan 4: The Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Tasks 1–3 run in order. Tasks 4 and 5 touch only the client charts and can run beside them.

**Goal:** Give Decision Maker its own coach knowledge, so a decision session is coached from The Decision Book rather than with Problem Solver's toolkit prompt. A decision session today reaches Problem Solver's `RUBRIC` and step layer. After this plan:
- **One shared text:** voice, the thinking skills, gatekeeping and the output schema move out of `prompts.mjs` into `prompts-shared.mjs`. Problem Solver's rubric stays byte for byte the same, and a hash test holds it there.
- **The Decision Maker rubric** (cached, the same for every turn): the book's stance, the section compass and how to place a question on it, the session shape (frame, discern, the quick route, work the model, waiting, another angle, switching, carry forward, tasks), the decision traps, and one catalogue line for each of the 52 models.
- **Catalogue lines** are built from `CATALOGUE` and each tool's `when`. The book's "see also" and our `pairsWell` stay separate on each line.
- **The active model's note** is a third cached layer, sent only while that model is open: its steps, slots, watch-fors and exercise, the lens or worksheet rule, and the companion pass for the two reused tools that have one (SCAMPER beside the morphological box, espoused theory against theory in use beside double-loop learning).
- **The turn state** says what the chart is waiting for (plot and scales `awaiting()`), which Eisenhower items can become tasks, and, once the minimum is met, **another angle**: the book's see also first, then ours, or on to Decide.
- **Routing:** `createModelCoach` sends a `decision` session to `buildDecisionPrompt`. The schema accepts `next_model` as an alias of `next_tool`, limited to the book's models.
- **The canvas map:** `packages/decision-book/render/charts.ts` picks a run's chart through `TOOLS[run.tool].family`, with the one-offs, the reused Problem Solver tools and the decision record by id. The test helper now uses it.
- **Small fix:** the Drexler/Sibbet track (seven stages) stacks top to bottom when its card is narrow, so its labels no longer crowd.

**Not in this plan (Plan 5):** the Decide step's decision record tool (`step: 'settle'`), Review on `reviewState`, and the client pages. Until then the Decide and Review step layers coach in conversation and suggest no model. The plan set index is updated to match (Task 6).

**Spec:** `docs/superpowers/specs/2026-10-21-decision-book-design.md` ("Experience: Full session", "Coach knowledge", "Errors").
**Plans 1–3:** done (Plan 3 HEAD `9cf6c6a31`).
**Branch and worktree:** `claude/decision-book` in `/Users/adamrussell/Projects/life-hub-decision-book`. Run every command from that worktree's root unless a step says otherwise. Run `npm ci` at the root and in `apps/tasks` first if `node_modules` is missing.

**How this plan was made:** every file below was drafted in the worktree and its tests run green: 14 new prompt tests, the full unit suite (5,686 tests: 5,675 pass, 11 skipped as before), and the Problem Solver and Decision Book vitest tests (54 files, 1,087 tests, with the 54 canvas tests among them). The Tasks type-check showed no errors in these paths, and the contact sheet showed the Drexler/Sibbet track stacked and readable with no console errors. The drafts were then removed. New files are given in full; changed files are given as patches (apply with `git apply`, then check with `git diff`).

**Rules kept:**
- **Public repo:** no book sentences. The stance, compass guide, traps and companions are in our own words. Catalogue lines and notes are built from the tools, whose words Plan 3 wrote.
- **Problem Solver never lists the `dm_` models.** A test walks every Problem Solver plan step and toolkit step, the rubric and a framing prompt.
- **No Decision Maker step is called `choose`.**
- **Prompt size:** the Decision Maker rubric is about 22,800 characters, against Problem Solver's 19,000. It is cached, so each turn costs about what a Problem Solver turn does.

---

### Task 1: Move the shared rubric text into `prompts-shared.mjs`

**Files:**
- Create: `netlify/functions/_shared/problem-solver/prompts-shared.mjs`
- Modify: `netlify/functions/_shared/problem-solver/prompts.mjs`, `tests/unit/problem-solver-prompts.test.js`

- [ ] **Step 1: Record the rubric's hash before the move**

Run: `node -e "import('./netlify/functions/_shared/problem-solver/prompts.mjs').then(m=>console.log(require('crypto').createHash('sha256').update(m.RUBRIC).digest('hex'), m.RUBRIC.length))"`
Expected: `46d6842e42b01f31014541a8122ecc225aa181a94ca0cf191144d4cfae55c5a2 19023`. If it differs, Problem Solver's rubric has changed on `main` since this plan was written: use the new hash in Step 3's test, and check that the move itself changes nothing.

- [ ] **Step 2: Create the shared module**

`outputBlock` takes the parts that differ between the coaches: the frame keys, Problem Solver's `model` field, the suggestion shape, the task fields and the line saying when each optional field belongs.

````js
// netlify/functions/_shared/problem-solver/prompts-shared.mjs
// The rubric text both coaches share: voice, the thinking skills, gatekeeping and the output
// schema. Problem Solver's RUBRIC (prompts.mjs) and Decision Maker's (decision-prompts.mjs) are
// built from these, so the wording lives once. Problem Solver's rubric is unchanged by the move
// (tests/unit/problem-solver-prompts.test.js checks it byte for byte).
import { SKILLS } from '../../../../packages/problem-solver/skills.mjs';

export const VOICE = `VOICE
- Every message is between 25 and 60 words, usually two or three sentences.
- Ask at most one question per message, and end with it when you ask one.
- Every message leaves the person knowing what to do next: end with a question or a clear next step. Never end on agreement or praise alone.
- When an answer is good, say so in one short clause and name the skill it shows. No praise beyond that.
- Plain words. No lists, headings or markdown in the message.`;

const skillLines = SKILLS.map((skill) => `- ${skill.id} (${skill.name}): ${skill.description}`).join('\n');

export const THINKING_SKILLS = `THINKING SKILLS (tag answers with these ids in skillsSeen and skillsMissing)
${skillLines}`;

export const GATEKEEPING = `GATEKEEPING
In phase frame, use "frame" for accepted answers instead of "node"; "node" is only used inside a tool.
- verdict "accept": the answer holds up. Put it in "node" with the slot, a tidy version of their words (keep their meaning; add no ideas), and a "title" of two or three words naming the point.
- verdict "challenge": the answer does not hold up. Include its tag and links as you would on accept. Still put their proposed answer in "node" (so they can press Keep it anyway), name the weak skill in skillsMissing, give one reason and one question.
- verdict "clarify": you need more before judging, or you are suggesting something. No node.
- To add links between nodes already placed, reply accept with node null and the links in "edges".
- When a slot lists tag choices, put exactly one of them in node.tag; otherwise leave tag out.
Challenge when:
- a symptom is offered as a cause (analysis)
- a perception, belief or opinion is stated as fact (critical_thinking)
- the answer is generic, like "not enough time" or "not enough budget"
- a solution is offered before its step (impulsive orientation; resist the quick fix)
- an answer repeats an earlier one or blames a person rather than a process (logical_reasoning)
- a goal or criterion cannot be measured
- the answer shows thin metacognition: an unexamined assumption, confidence beyond the evidence, or no check on whether it is true (metacognition)
- anything the current tool lists under "Watch for"
If they argue back with a good reason, change your verdict and accept. If they press Keep it anyway, that is their call; do not repeat the objection.`;

/**
 * The OUTPUT block. The parts that differ between the coaches are passed in: the frame keys,
 * the model field (Problem Solver only), the suggestion shape, the trailing task fields and the
 * line saying when each optional field belongs.
 * @param {{ frame: string[], model: boolean, suggestion: string, tasks: string, rules: string }} parts
 */
export function outputBlock({ frame, model, suggestion, tasks, rules }) {
  const frameShape = `{${frame.map((key) => `"${key}":"..."`).join(',')}}`;
  return `OUTPUT
Reply with one JSON object and nothing else:
{"verdict":"accept|challenge|clarify","message":"...","node":{"slot":"...","text":"...","title":"...","tag":"..."}|null,"edges":[{"from":"slot","to":"slot","kind":"..."}],"skillsSeen":["..."],"skillsMissing":["..."],"frame":${frameShape}|null,${model ? '"model":{"id":"...","reason":"..."}|null,' : ''}"suggestion":${suggestion}|null,"summary":"..."|null,"exitObjection":"..."|null,"learning":"..."|null,${tasks}}
${rules}`;
}
````

- [ ] **Step 3: Build Problem Solver's rubric from it, export the turn helpers, and pin the rubric**

`prompts.mjs` keeps its own process, models, steps and switching text, and builds the rest from the shared module. It also exports five things Decision Maker's prompt reuses: `SUMMARY_EVERY`, `transcript`, `scoreNote`, `proposable` and `earlierSteps`. Exporting them changes nothing for Problem Solver.

````diff
diff --git a/netlify/functions/_shared/problem-solver/prompts.mjs b/netlify/functions/_shared/problem-solver/prompts.mjs
index cdeaa364a..0f370ee97 100644
--- a/netlify/functions/_shared/problem-solver/prompts.mjs
+++ b/netlify/functions/_shared/problem-solver/prompts.mjs
@@ -1,5 +1,4 @@
 // netlify/functions/_shared/problem-solver/prompts.mjs
-import { SKILLS } from '../../../../packages/problem-solver/skills.mjs';
 import { MODELS } from '../../../../packages/problem-solver/models.mjs';
 import { TOOLS, toolsForBookStep } from '../../../../packages/problem-solver/tools/index.mjs';
 import { canPropose, isComplete, nextSlots } from '../../../../packages/problem-solver/machine.mjs';
@@ -11,23 +10,17 @@ import { CHAPTERS } from './knowledge/chapters.mjs';
 import { FINAL_WORDS } from './knowledge/final-words.mjs';
 import { SELECTION } from './knowledge/selection.mjs';
 import { STEP_TRIGGERS } from './knowledge/triggers.mjs';
+import { GATEKEEPING, THINKING_SKILLS, VOICE, outputBlock } from './prompts-shared.mjs';
 
-const skillLines = SKILLS.map((skill) => `- ${skill.id} (${skill.name}): ${skill.description}`).join('\n');
 const modelLines = Object.values(MODELS).map((model) => `- ${model.id}: ${model.name}. Use when: ${model.when}`).join('\n');
 const chapterLines = Object.values(CHAPTERS).join('\n');
 
 /** Fixed layer: identical for every turn of every session, so it caches. */
 export const RUBRIC = `You are the Problem Solver coach. You coach one person through a real problem using the Problem Solver toolkit's process, from defining it to documenting what was learned. You are a coach, not an assistant: warm, direct, and never flattering. You do not agree by default.
 
-VOICE
-- Every message is between 25 and 60 words, usually two or three sentences.
-- Ask at most one question per message, and end with it when you ask one.
-- Every message leaves the person knowing what to do next: end with a question or a clear next step. Never end on agreement or praise alone.
-- When an answer is good, say so in one short clause and name the skill it shows. No praise beyond that.
-- Plain words. No lists, headings or markdown in the message.
+${VOICE}
 
-THINKING SKILLS (tag answers with these ids in skillsSeen and skillsMissing)
-${skillLines}
+${THINKING_SKILLS}
 
 ${PROCESS}
 
@@ -51,35 +44,22 @@ SESSION SHAPE
 
 9. Document: the case file is built from the 5 Cs (and knowledge management when it is done), together with what earlier steps established. In correspond, put the agreed name exactly in node.text. The machine refuses a name that breaks a strict rule, so challenge such a name and name the rule. The person writes the case file onto a page from a card. Never say it is written until CASE FILE says so. When CASE FILE lists changes since it was written, the person can add a dated update from the card; say so once.
 
-GATEKEEPING
-In phase frame, use "frame" for accepted answers instead of "node"; "node" is only used inside a tool.
-- verdict "accept": the answer holds up. Put it in "node" with the slot, a tidy version of their words (keep their meaning; add no ideas), and a "title" of two or three words naming the point.
-- verdict "challenge": the answer does not hold up. Include its tag and links as you would on accept. Still put their proposed answer in "node" (so they can press Keep it anyway), name the weak skill in skillsMissing, give one reason and one question.
-- verdict "clarify": you need more before judging, or you are suggesting something. No node.
-- To add links between nodes already placed, reply accept with node null and the links in "edges".
-- When a slot lists tag choices, put exactly one of them in node.tag; otherwise leave tag out.
-Challenge when:
-- a symptom is offered as a cause (analysis)
-- a perception, belief or opinion is stated as fact (critical_thinking)
-- the answer is generic, like "not enough time" or "not enough budget"
-- a solution is offered before its step (impulsive orientation; resist the quick fix)
-- an answer repeats an earlier one or blames a person rather than a process (logical_reasoning)
-- a goal or criterion cannot be measured
-- the answer shows thin metacognition: an unexamined assumption, confidence beyond the evidence, or no check on whether it is true (metacognition)
-- anything the current tool lists under "Watch for"
-If they argue back with a good reason, change your verdict and accept. If they press Keep it anyway, that is their call; do not repeat the objection.
+${GATEKEEPING}
 
 SWITCHING AND CHECK-INS
 - If the same slot has been challenged twice, or the tool no longer fits the problem, suggest a better tool with "switch_tool" and a one-sentence reason.
 - When the state says MINIMUM MET, the tool has enough to stop (more slots stay open only so the person can add more). In that reply, ask one metacognitive check-in tied to a stage, and put the named next step in "suggestion".
 
-OUTPUT
-Reply with one JSON object and nothing else:
-{"verdict":"accept|challenge|clarify","message":"...","node":{"slot":"...","text":"...","title":"...","tag":"..."}|null,"edges":[{"from":"slot","to":"slot","kind":"..."}],"skillsSeen":["..."],"skillsMissing":["..."],"frame":{"goal":"...","whatIsTrue":"...","whatCanBeDone":"..."}|null,"model":{"id":"...","reason":"..."}|null,"suggestion":{"kind":"next_tool|switch_tool|next_step|reopen_step","tool":"...","step":"define|analyse","reason":"..."}|null,"summary":"..."|null,"exitObjection":"..."|null,"learning":"..."|null,"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}],"proposeReview":{"due":"YYYY-MM-DD","reason":"..."}|null}
-Include "proposeTasks" and "proposeReview" only in Implement. Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "step" only with reopen_step, and "tool" only with next_tool or switch_tool. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.`;
+${outputBlock({
+  frame: ['goal', 'whatIsTrue', 'whatCanBeDone'],
+  model: true,
+  suggestion: '{"kind":"next_tool|switch_tool|next_step|reopen_step","tool":"...","step":"define|analyse","reason":"..."}',
+  tasks: '"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}],"proposeReview":{"due":"YYYY-MM-DD","reason":"..."}|null',
+  rules: 'Include "proposeTasks" and "proposeReview" only in Implement. Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "step" only with reopen_step, and "tool" only with next_tool or switch_tool. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.'
+})}`;
 
 const RECENT_TURNS = 12;
-const SUMMARY_EVERY = 6;
+export const SUMMARY_EVERY = 6;
 
 function toolKnowledge(id) {
   const tool = TOOLS[id];
@@ -122,11 +102,11 @@ function stepLayer(session) {
   ].join('\n\n');
 }
 
-function transcript(session) {
+export function transcript(session) {
   return session.turns.slice(-RECENT_TURNS).map((t) => `${t.role === 'user' ? 'PERSON' : 'COACH'}: ${t.text}`).join('\n');
 }
 
-const scoreNote = (run) => {
+export const scoreNote = (run) => {
   const line = TOOLS[run.tool].scoreLine?.(run);
   return line ? `; ${line}` : '';
 };
@@ -155,7 +135,7 @@ function runLines(session, run) {
  * Slots of placed nodes the tool lets become tasks and that have no live proposal. A node
  * whose task was deleted in Tasks is never offered again (Adam's decision).
  */
-function proposable(session, run) {
+export function proposable(session, run) {
   const proposals = session.proposedTasks ?? [];
   return run.nodes
     .filter((node) => canPropose(run, node) && !proposals.some((p) => p.source.nodeId === node.id && (p.status !== 'dismissed' || p.removed)))
@@ -216,7 +196,7 @@ function progressLine(session) {
   return `Progress: MINIMUM MET. Next step to suggest: ${what}.`;
 }
 
-function earlierSteps(session) {
+export function earlierSteps(session) {
   if (!session.model) return null;
   const lines = [];
   for (const { step } of stepPlan(session.model.id)) {
diff --git a/tests/unit/problem-solver-prompts.test.js b/tests/unit/problem-solver-prompts.test.js
index d5180d0a3..844c4f061 100644
--- a/tests/unit/problem-solver-prompts.test.js
+++ b/tests/unit/problem-solver-prompts.test.js
@@ -1,6 +1,7 @@
 // tests/unit/problem-solver-prompts.test.js
 import test from 'node:test';
 import assert from 'node:assert/strict';
+import { createHash } from 'node:crypto';
 import { RUBRIC, buildCoachPrompt } from '../../netlify/functions/_shared/problem-solver/prompts.mjs';
 import { createSession, applyCoachTurn, acceptSuggestion, moveOn, say } from '../../netlify/functions/_shared/problem-solver/session.mjs';
 
@@ -33,6 +34,10 @@ test('rubric carries voice, skills, process, chapters and final words', () => {
   }
 });
 
+test('the rubric is unchanged by the move to prompts-shared.mjs', () => {
+  assert.equal(createHash('sha256').update(RUBRIC).digest('hex'), '46d6842e42b01f31014541a8122ecc225aa181a94ca0cf191144d4cfae55c5a2');
+});
+
 test('system is two cached layers: the fixed rubric, then the step layer', () => {
   const prompt = buildCoachPrompt(inTool());
   assert.equal(prompt.system.length, 2);
````

- [ ] **Step 4: Run the tests**

Run: `node --test tests/unit/problem-solver-prompts.test.js tests/unit/problem-solver-coach.test.js`
Expected: PASS, including "the rubric is unchanged by the move to prompts-shared.mjs".

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/problem-solver/prompts-shared.mjs netlify/functions/_shared/problem-solver/prompts.mjs tests/unit/problem-solver-prompts.test.js
git commit -m "Decision Maker: voice, gatekeeping and output shared with Problem Solver, its rubric unchanged

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Decision Maker's coach knowledge and prompt

**Files:**
- Create: `netlify/functions/_shared/problem-solver/knowledge/decision-book.mjs`, `netlify/functions/_shared/problem-solver/decision-prompts.mjs`

- [ ] **Step 1: The knowledge**

The stance, the compass guide, the decision traps (the spec's list, each tied to a thinking skill) and the two companions are written here in our own words. The catalogue lines, the model notes and another angle are built from `CATALOGUE` and the registered tools, so nothing Plan 3 wrote is copied. Every reused Problem Solver tool's note adds one line: where its words say Implement, read Decide.

````js
// netlify/functions/_shared/problem-solver/knowledge/decision-book.mjs
// Decision Maker's coach knowledge, in our own words (the repo is public: no book sentences).
// The catalogue lines and the per-model notes are built from the tools themselves, so a model's
// "use it when", steps and watch-fors are written once, in packages/decision-book/models/.
import { CATALOGUE, SECTIONS } from '../../../../../packages/decision-book/catalogue.mjs';
import { COMPASS } from '../../../../../packages/decision-book/compass.mjs';
import { TOOLS } from '../../../../../packages/problem-solver/tools/index.mjs';

export const STANCE = `THE BOOK'S STANCE
The Decision Book's models simplify on purpose. A model does not hand over an answer: it asks a sharper question, and the answer comes from the person working it with their own facts. When someone wants the model to decide for them, say so kindly and ask the model's next question. A model that does not fit is put down, never forced.`;

export const COMPASS_GUIDE = `THE SECTION COMPASS
The book's four sections form a 2×2: who the question is about (yourself or others) against what the person wants (to understand or to improve).
${COMPASS.map((q) => `- ${q.id}: ${q.label} (section ${q.section})`).join('\n')}
Place the question from the person's answer to "who is it about, and what do you want?". Record one id in frame.compass, or two joined with "+" when the question truly spans both (self_improve+others_improve). Use only these ids. Most decisions about your own next move are self_improve; wanting to see why you keep choosing the same way is self_understand.`;

export const DECISION_TRAPS = `DECISION TRAPS (challenge these too, naming the skill)
- deciding before the options are on the table (decision_making)
- a single option dressed up as a choice: "should I do X" with no real alternative, not even "not now" (decision_making)
- criteria nobody could check afterwards (critical_thinking)
- the sunk-cost pull: keeping on because of what is already spent (metacognition)
- status-quo bias: treating "stay as I am" as free of cost (critical_thinking)
- overconfidence: certainty beyond the evidence (metacognition)
- letting the most vivid example or the first number heard set the answer (critical_thinking)
- blaming a person rather than looking at the situation (logical_reasoning)
- a "decision" with no first step and nothing that would make you rethink (decision_making)`;

/**
 * Companion passes the spec gives two reused Problem Solver tools. They live in the per-model
 * note, not in new slots: answers go into the tool's own slots.
 */
export const COMPANIONS = Object.freeze({
  morphological: 'SCAMPER companion: once the box has a promising combination, run one SCAMPER pass over it, one prompt per message: substitute, combine, adapt, modify (bigger or smaller), put to another use, eliminate, reverse or rearrange. An idea that holds up goes into the box as a new attribute in its open slot.',
  double_loop: 'Espoused theory and theory in use: when naming a governing assumption, ask what the person says guides them, then what their actual behaviour shows guides them. The gap between the two is often the assumption to name. Both go in the governing slots, not new ones.'
});

const familyWord = (family) => (family === 'oneoff' ? 'own chart' : family === 'table' ? 'Problem Solver chart' : `${family} chart`);
const ids = (list) => list.join(', ');

/** Our pairs-well links: a Decision Maker model's own list; a reused tool has none. */
const pairsOf = (id) => TOOLS[id]?.pairsWell ?? [];

/** One line per catalogue model: id, where it sits, use it when, the book's see also and ours. */
export function catalogueLines() {
  return CATALOGUE.map((entry) => {
    const tool = TOOLS[entry.id];
    const links = [
      entry.seeAlso.length ? `Book's see also: ${ids(entry.seeAlso)}.` : '',
      pairsOf(entry.id).length ? `Pairs well (ours): ${ids(pairsOf(entry.id))}.` : ''
    ].filter(Boolean).join(' ');
    return `- ${entry.id} (${tool.name}) [s${entry.section} ${entry.tier}]: ${tool.when}${links ? ` ${links}` : ''}`;
  }).join('\n');
}

/** The section headings the catalogue lines refer to. */
export const SECTION_LINE = `Sections: ${SECTIONS.map((s) => `s${s.id} ${s.title}`).join('; ')}.`;

/**
 * The active model's note: a cached system block of its own, so only the model in use is sent.
 * Steps, slot meanings, watch-fors, the book's exercise in our words, and any companion pass.
 */
export function modelNote(id) {
  const tool = TOOLS[id];
  const entry = CATALOGUE.find((item) => item.id === id);
  if (!tool || !entry) return null;
  const tier = entry.tier === 'lens'
    ? 'Lens: explain the idea in two sentences, ask for the one marker or answer it needs, and it is done.'
    : 'Worksheet: work its steps in order, one slot per answer.';
  return [
    `MODEL NOTE: ${tool.name} (${id}), section ${entry.section}, ${familyWord(entry.family)}`,
    tier,
    `Use it when: ${tool.when}`,
    `Steps:\n${tool.steps.map((s, i) => `  ${i + 1}. ${s.title}: ${s.prompt}`).join('\n')}`,
    `Slot meanings: ${Object.entries(tool.slots).map(([k, v]) => `${k} = ${v}${tool.nodeTags?.[k] ? ` (tag: ${tool.nodeTags[k].join('|')})` : ''}`).join('; ')}`,
    `Link kinds: ${tool.edgeKinds.join(', ') || 'none'}`,
    `Watch for: ${tool.failureModes.join(' ')}`,
    ...(entry.reuse ? ['Reused from Problem Solver: where its words say Implement, read Decide.'] : []),
    ...(tool.exercise ? [`Exercise (offer once, when the minimum is met): ${tool.exercise}`] : []),
    ...(COMPANIONS[id] ? [COMPANIONS[id]] : [])
  ].join('\n');
}

/** Follow-ups for "another angle": the book's see also first, then ours, without repeats. */
export function anotherAngle(id, done = []) {
  const entry = CATALOGUE.find((item) => item.id === id);
  if (!entry) return { book: [], ours: [] };
  const skip = new Set([id, ...done]);
  const book = entry.seeAlso.filter((other) => TOOLS[other] && !skip.has(other));
  const ours = pairsOf(id).filter((other) => TOOLS[other] && !skip.has(other) && !book.includes(other));
  return { book, ours };
}
````

- [ ] **Step 2: The prompt**

There are three cached system layers: the rubric, the step layer and the active model's note. The anthropic client already marks every layer `cache_control` (at most three here, within the API's four). The turn carries only what changes: the frame and the lit compass, earlier models, the run's placed nodes and open slots, Waiting on, Can become tasks, progress with another angle, tasks, the summary and recent conversation. The model's steps and slot meanings are not repeated there, because they are in its cached note.

Session flow, as the spec sets it:
- **Frame:** three questions, one at a time, recorded as `decision`, `compass` and `known`. The engine already completes the frame and opens Explore on the third answer (Plan 1).
- **Discern:** on that turn, the coach recommends one model with `next_tool`, says why in one sentence and names a sibling it passed over. It looks in the lit compass section first, then the "use it when" lines.
- **Quick route:** for a small everyday call with its options on the table, `dm_yes_no` and then `dm_stop_rule`. The dedicated Quick decision route, with its own chart and Go deeper, is Plan 6.
- **Lenses:** two sentences, one marker or answer, done.
- **Boundary and learning:** the decision form of the one-shot question, "what did you learn about how you decide?".

````js
// netlify/functions/_shared/problem-solver/decision-prompts.mjs
// Decision Maker's coach prompt. Three cached system layers, then the turn:
//   1. the rubric: shared voice, skills and gatekeeping, the book's stance, the compass, the
//      session shape, the decision traps and one catalogue line per model (fixed for every turn);
//   2. the step layer: what the current step is for (stable for the whole step);
//   3. the active model's note: steps, slots, watch-fors and exercise (stable while it is open).
// Problem Solver's prompt (prompts.mjs) never lists these models.
import { TOOLS } from '../../../../packages/problem-solver/tools/index.mjs';
import { isComplete, nextSlots } from '../../../../packages/problem-solver/machine.mjs';
import { stepName, toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { COMPASS } from '../../../../packages/decision-book/compass.mjs';
import { DECISION_MODEL } from '../../../../packages/decision-book/model.mjs';
import { activeRun, currentStep, followOn, frameKeysOf, skippedUntouched } from './session.mjs';
import { GATEKEEPING, THINKING_SKILLS, VOICE, outputBlock } from './prompts-shared.mjs';
import { SUMMARY_EVERY, earlierSteps, proposable, scoreNote, transcript } from './prompts.mjs';
import { COMPASS_GUIDE, DECISION_TRAPS, SECTION_LINE, STANCE, anotherAngle, catalogueLines, modelNote } from './knowledge/decision-book.mjs';

const MODEL_ID = DECISION_MODEL.id;

/** Fixed layer: identical for every turn of every decision session, so it caches. */
export const DECISION_RUBRIC = `You are the Decision Maker coach. You coach one person through a real decision, or something they want to see clearly, using the models in The Decision Book (Krogerus and Tschäppeler). You are a coach, not an assistant: warm, direct, and never flattering. You do not agree by default.

${VOICE}

${THINKING_SKILLS}

${STANCE}

${COMPASS_GUIDE}

SESSION SHAPE
1. Frame: get clear answers to three questions, one at a time. What are you deciding, or trying to see clearly (one sentence)? Who is it about, and what do you want (this places it on the compass)? What do you already know: the options, the facts, the deadline and what is at stake? Record each accepted answer in "frame" as decision, compass and known.
2. Discern: on the turn the last frame answer is accepted, recommend one model with "next_tool". Give one sentence on why it fits and name one sibling you passed over. Look in the lit compass section first, then match the "use it when" lines below to the frame. The person may pick another model from the shelf instead; go with their choice.
3. Quick route: for a small, everyday call where the options are already on the table, recommend dm_yes_no; once they decide to go ahead, dm_stop_rule sets the one trigger that would make them stop. Do not send a big or tangled decision down this route.
4. Work the model: follow its MODEL NOTE, one slot per answer, using only slot names from "Open slots". Never invent slots. Use the full slot name with its number (item:1, not item). Links join the node you are placing to slots already placed, using only the listed link kinds. A lens is short: explain the idea in two sentences, take the one marker or answer, and it is done.
5. Waiting: when the state shows "Waiting on", the person places or scores on the chart themselves. Do not place nodes or invent scores for them. Say what to place, then wait; talk about the picture once it is in.
6. Another angle: when the state says MINIMUM MET, offer the model's exercise if it has one, or one follow-up from ANOTHER ANGLE with "next_tool" and a one-sentence reason, or "next_step" to go to Decide. Offer one, not a menu. Every model run stays on the record.
7. Switching: if the same slot has been challenged twice, or the model no longer fits the decision, suggest a better model with "switch_tool" and a one-sentence reason.
8. Carry forward: use what earlier models established (listed under EARLIER) as the starting point, and say so. Do not copy it in without the person agreeing.
9. Tasks: only slots listed under "Can become tasks" qualify (the Eisenhower matrix's do-immediately items). When one is specific enough to start (a clear action, ideally a date), offer it in "proposeTasks" with its slot and a short task title. The person confirms each on a card; never say a task exists until TASKS shows it confirmed.
10. The person can move on at any time. Never block them.

${DECISION_TRAPS}

${GATEKEEPING}

THE MODELS (id (name) [section, worksheet or lens]: use it when; the book's own see also; our pairs well)
${SECTION_LINE}
${catalogueLines()}

${outputBlock({
  frame: ['decision', 'compass', 'known'],
  model: false,
  suggestion: '{"kind":"next_tool|switch_tool|next_step","tool":"...","reason":"..."}',
  tasks: '"proposeTasks":[{"slot":"...","title":"...","due":"YYYY-MM-DD"|null}]',
  rules: 'Include "proposeTasks" only for slots listed under "Can become tasks". Include "summary" (at most 120 words, a running record of what is established) only when the state says a summary is due. Include "tool" only with next_tool or switch_tool, and only a model id from THE MODELS. Include "exitObjection" only in boundary mode. Include "learning" only when the state says AWAITING LEARNING.'
})}`;

const DECIDE = `CURRENT STEP: Decide
Settle the decision in conversation: the decision in one sentence; the reasons, each resting on something a model showed; a Stop Rule (one trigger that would make them rethink, and the action agreed now); the first step; and a date to review it. Challenge a decision with no first step or nothing that would make them rethink. Do not suggest a model. Suggest next_step when it has what it needs.`;

const REVIEW = `CURRENT STEP: Review
Compare what the person expected when they decided with what actually happened, then what they learned about how they decide. Look at what happened, not the plan. Do not suggest a model. Suggest next_step when it is done.`;

/** Step layer: stable for the whole of a step, so it caches between turns. */
function stepLayer(session) {
  if (session.phase === 'finished') return 'The session is finished. Recap briefly when asked and help the person carry the learning forward. Do not suggest a model.';
  if (session.phase === 'frame') return 'NEXT AFTER FRAMING: Explore, where you discern the first model from the compass and the frame.';
  if (session.phase === 'decide') return DECIDE;
  if (session.phase === 'review') return REVIEW;
  return `CURRENT STEP: ${stepName(MODEL_ID, session.phase)}
Work the model that fits, then offer another angle or Decide. Choose only from THE MODELS.`;
}

/** The compass value as its labels: 'self_improve+others_improve' -> 'Improve yourself, Improve others'. */
function compassLabels(value) {
  const lit = String(value ?? '').split('+');
  return COMPASS.filter((q) => lit.includes(q.id)).map((q) => q.label).join(', ');
}

/** Minimum met: the exercise, the book's see also and ours (unused ones only), or Decide. */
function progressLine(session, run) {
  if (!followOn(session)) return 'Progress: not yet at the minimum for this model; keep working its steps.';
  const used = (currentStep(session)?.runs ?? []).map((item) => item.tool);
  const { book, ours } = anotherAngle(run.tool, used);
  const angle = [book.length ? `the book's see also: ${book.join(', ')}` : '', ours.length ? `ours: ${ours.join(', ')}` : ''].filter(Boolean).join('; ');
  return `Progress: MINIMUM MET. ANOTHER ANGLE: ${angle || 'none listed; pick from the compass section'}; or next_step to Decide.`;
}

function runState(session, run) {
  const def = TOOLS[run.tool];
  const nodes = run.nodes.map((node) => `  ${node.slot}${node.tag ? ` [${node.tag}]` : ''}${node.state === 'contested' ? ' (contested)' : ''}: ${node.text}`).join('\n') || '  (none yet)';
  const slotOf = (id) => run.nodes.find((n) => n.id === id)?.slot;
  const edges = run.edges.length ? `\nLinks:\n${run.edges.map((e) => `  ${slotOf(e.from)} -> ${slotOf(e.to)} (${e.kind})`).join('\n')}` : '';
  return [
    `ACTIVE MODEL: ${def.name} (${def.id})`,
    `Placed:\n${nodes}${edges}`,
    `Open slots: ${nextSlots(run).join(', ') || (isComplete(run) ? 'none (model complete)' : 'none open, but the model is not complete: see Waiting on or add links')}`,
    ...(def.scoreLine?.(run) ? [`Scores: ${def.scoreLine(run)}`] : []),
    ...(def.awaiting?.(run) ? [`Waiting on: ${def.awaiting(run)}`] : []),
    ...(def.promptNote?.(run) ? [`Note: ${def.promptNote(run)}`] : []),
    ...(def.taskSlots ? [`Can become tasks: ${proposable(session, run).join(', ') || 'none yet'}`] : []),
    progressLine(session, run)
  ].join('\n');
}

function taskLines(session) {
  const tasks = (session.proposedTasks ?? []).filter((p) => !p.removed);
  if (!tasks.length) return null;
  return `TASKS FROM THIS DECISION:\n${tasks.map((p) => `  ${p.status}: "${p.title}"${p.due ? ` due ${p.due}` : ''}`).join('\n')}`;
}

function boundaryLine(session) {
  const left = session.runner.leaving ? stepName(MODEL_ID, session.runner.leaving) : 'the last step';
  const leftStep = session.steps?.[session.runner.leaving];
  const ahead = session.phase === 'finished' ? 'what they want to take forward from this decision' : `what they want from ${stepName(MODEL_ID, session.phase)}`;
  if (skippedUntouched(leftStep)) return `MODE: boundary. The person has skipped ${left} without working a model. In one message: acknowledge the skip in one line; if skipping it matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask one question about ${ahead}. Do not ask a learning question.`;
  return `MODE: boundary. The person has just left ${left} (${leftStep?.status ?? 'unknown'}). In one message: a one-sentence recap of what ${left} established; if it was left unfinished in a way that matters, say so once, kindly, and put a one-sentence reason in exitObjection; then ask what they learned about how they decide. No model suggestion yet.`;
}

/** @returns {{ system: string[], user: string }} */
export function buildDecisionPrompt(session) {
  const run = activeRun(session);
  const parts = [`DECISION: ${session.title}`];
  if (session.runner?.mode === 'boundary') parts.push(boundaryLine(session));
  parts.push(`PHASE: ${session.phase}`);
  parts.push(`TODAY: ${String(session.updatedAt ?? '').slice(0, 10)}`);
  const missing = frameKeysOf(session).filter((key) => !session.frame[key]);
  parts.push(`Frame: ${JSON.stringify(session.frame)}${missing.length ? `\nMissing frame answers: ${missing.join(', ')}` : ''}`);
  if (session.frame.compass) parts.push(`COMPASS: ${compassLabels(session.frame.compass)}`);
  const earlier = earlierSteps(session);
  if (earlier) parts.push(earlier.replace(/^EARLIER STEPS:/, 'EARLIER:'));
  if (session.pendingLearning && session.runner?.mode !== 'boundary') {
    const from = stepName(MODEL_ID, session.pendingLearning);
    const offer = session.phase === 'explore' && !run ? ' and suggest a model with next_tool' : '';
    parts.push(`AWAITING LEARNING from ${from}: if they named something they learned about how they decide, put it in "learning" (one sentence, their meaning); otherwise leave learning null. Either way, orient them to the current step in one sentence${offer}.`);
  }
  const step = currentStep(session);
  if (step) {
    for (const item of step.runs.filter((r) => r.status !== 'active')) {
      parts.push(`Earlier model in this step ${item.tool}: ${item.status}${item.switchReason ? ` (${item.switchReason})` : ''}; ${item.nodes.map((node) => `${node.slot}: ${node.text}`).join(' | ')}${scoreNote(item)}`);
    }
  }
  if (run) parts.push(runState(session, run));
  else if (step && !session.pendingLearning && session.runner?.mode !== 'boundary' && toolsForPlanStep(MODEL_ID, session.phase).length) parts.push('No model is open in this step yet: recommend one with next_tool, naming a sibling you passed over.');
  const tasks = taskLines(session);
  if (tasks) parts.push(tasks);
  if (session.pendingKeep) parts.push(`Last challenged answer (${session.pendingKeep.slot}): ${session.pendingKeep.text}`);
  if (session.summary) parts.push(`Summary so far: ${session.summary}`);
  const coachTurns = session.turns.filter((t) => t.role === 'coach').length;
  if (coachTurns > 0 && coachTurns % SUMMARY_EVERY === 0) parts.push('A summary is due this turn.');
  parts.push(`RECENT CONVERSATION:\n${transcript(session)}`);
  const note = run ? modelNote(run.tool) : null;
  return { system: [DECISION_RUBRIC, stepLayer(session), ...(note ? [note] : [])], user: parts.join('\n\n') };
}
````

- [ ] **Step 3: Check it loads**

Run: `node -e "import('./netlify/functions/_shared/problem-solver/decision-prompts.mjs').then(m=>console.log(m.DECISION_RUBRIC.length))"`
Expected: about 22,800.

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/_shared/problem-solver/knowledge/decision-book.mjs netlify/functions/_shared/problem-solver/decision-prompts.mjs
git commit -m "Decision Maker: the coach rubric, catalogue lines, model notes and another angle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Route decision sessions to their prompt; `next_model`; tests

**Files:**
- Modify: `netlify/functions/_shared/problem-solver/coach.mjs`, `netlify/functions/_shared/problem-solver/coach-schema.mjs`
- Create: `tests/unit/decision-book-prompts.test.js`

- [ ] **Step 1: Route and alias**

The parse step is unchanged. It already limits a suggestion to the session's current plan step, so in a decision session a toolkit tool is refused with the allowed list (one repair, as now). In a Problem Solver session a `dm_` model is refused, because no toolkit step lists one.

````diff
diff --git a/netlify/functions/_shared/problem-solver/coach-schema.mjs b/netlify/functions/_shared/problem-solver/coach-schema.mjs
index 09997fe44..81f161eb3 100644
--- a/netlify/functions/_shared/problem-solver/coach-schema.mjs
+++ b/netlify/functions/_shared/problem-solver/coach-schema.mjs
@@ -2,6 +2,7 @@
 import { isSkillId } from '../../../../packages/problem-solver/skills.mjs';
 import { MODEL_IDS } from '../../../../packages/problem-solver/models.mjs';
 import { TOOL_IDS } from '../../../../packages/problem-solver/tools/index.mjs';
+import { CATALOGUE_IDS } from '../../../../packages/decision-book/catalogue.mjs';
 import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';
 import { LIGHTNING_NODE_IDS } from '../../../../packages/problem-solver/lightning.mjs';
 import { tidyTitle, titleFromText } from '../../../../packages/problem-solver/titles.mjs';
@@ -45,6 +46,11 @@ export function isDate(value) {
 function suggestionOf(raw) {
   if (!raw || typeof raw !== 'object') return { value: null };
   const reason = text(raw.reason, 300) ?? '';
+  // next_model is Decision Maker's name for next_tool, limited to the book's models.
+  if (raw.kind === 'next_model') {
+    if (!CATALOGUE_IDS.includes(raw.tool) || !TOOL_IDS.includes(raw.tool)) return { error: `Unknown model in suggestion: ${raw.tool}` };
+    return { value: { kind: 'next_tool', tool: raw.tool, reason } };
+  }
   if (raw.kind === 'next_tool' || raw.kind === 'switch_tool') {
     if (!TOOL_IDS.includes(raw.tool)) return { error: `Unknown tool in suggestion: ${raw.tool}` };
     return { value: { kind: raw.kind, tool: raw.tool, reason } };
diff --git a/netlify/functions/_shared/problem-solver/coach.mjs b/netlify/functions/_shared/problem-solver/coach.mjs
index 8e2c18140..5068178e9 100644
--- a/netlify/functions/_shared/problem-solver/coach.mjs
+++ b/netlify/functions/_shared/problem-solver/coach.mjs
@@ -4,6 +4,7 @@ import { acceptProblem, addEdge, canEdge, canPlace, checkNode, nextSlots, placeN
 import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';
 import { extractJson, validateCoachTurn } from './coach-schema.mjs';
 import { buildCoachPrompt, repairPrompt, rewritePrompt } from './prompts.mjs';
+import { buildDecisionPrompt } from './decision-prompts.mjs';
 import { buildLightningPrompt, checkLightningTurn } from './lightning-prompts.mjs';
 import { toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
 import { TOOLS, toolsForBookStep } from '../../../../packages/problem-solver/tools/index.mjs';
@@ -142,7 +143,7 @@ function parseLightning(session, text) {
 export function createModelCoach(model) {
   return async function modelCoach(session) {
     const lightning = session.kind === 'lightning';
-    const prompt = lightning ? buildLightningPrompt(session) : buildCoachPrompt(session);
+    const prompt = lightning ? buildLightningPrompt(session) : session.kind === 'decision' ? buildDecisionPrompt(session) : buildCoachPrompt(session);
     const read = lightning ? parseLightning : parse;
     const first = await model({ ...prompt, maxTokens: 900 });
     let result = read(session, first);
````

- [ ] **Step 2: The tests**

These cover the rubric's parts, 52 catalogue lines in book order with see also and pairs well kept apart, Problem Solver never listing `dm_`, a note for every model, the companions, the three layers, waiting, Eisenhower tasks through the proposal flow, another angle, the Decide layer and boundary, the coach routing, `next_model`, and no `choose` step.

````js
// tests/unit/decision-book-prompts.test.js
// Decision Maker's coach knowledge: the rubric and its catalogue lines, the step layer, the
// active model's note, waiting, tasks, another angle, and the route from coach to prompt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DECISION_RUBRIC, buildDecisionPrompt } from '../../netlify/functions/_shared/problem-solver/decision-prompts.mjs';
import { RUBRIC, buildCoachPrompt } from '../../netlify/functions/_shared/problem-solver/prompts.mjs';
import { GATEKEEPING, VOICE } from '../../netlify/functions/_shared/problem-solver/prompts-shared.mjs';
import { COMPANIONS, anotherAngle, catalogueLines, modelNote } from '../../netlify/functions/_shared/problem-solver/knowledge/decision-book.mjs';
import { createModelCoach } from '../../netlify/functions/_shared/problem-solver/coach.mjs';
import { validateCoachTurn } from '../../netlify/functions/_shared/problem-solver/coach-schema.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, moveOn } from '../../netlify/functions/_shared/problem-solver/session.mjs';
import { CATALOGUE } from '../../packages/decision-book/catalogue.mjs';
import { COMPASS_IDS } from '../../packages/decision-book/compass.mjs';
import { DECISION_MODEL } from '../../packages/decision-book/model.mjs';
import { workThrough } from '../../packages/decision-book/work-through.mjs';
import { MODELS } from '../../packages/problem-solver/models.mjs';
import { BOOK_STEPS, stepPlan, toolsForPlanStep } from '../../packages/problem-solver/steps.mjs';
import { toolsForBookStep } from '../../packages/problem-solver/tools/index.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
const turn = (fields) => ({ verdict: 'accept', message: 'ok', node: null, edges: [], skillsSeen: [], skillsMissing: [], frame: null, model: null, suggestion: null, summary: null, exitObjection: null, learning: null, proposeTasks: [], proposeReview: null, ...fields });

/** A framed decision with `tool` open in Explore. */
function inModel(tool) {
  let s = createSession({ text: 'Too much on this term.', kind: 'decision' }, deps);
  s = applyCoachTurn(s, turn({ frame: { decision: 'What to drop this term.' } }), deps);
  s = applyCoachTurn(s, turn({ frame: { compass: 'self_improve' } }), deps);
  s = applyCoachTurn(s, turn({ frame: { known: 'Five commitments, two due in May.' }, suggestion: { kind: 'next_tool', tool, reason: 'r' } }), deps);
  return acceptSuggestion(s, deps);
}

/** The session with its active run swapped for `run`. */
function withRun(session, run) {
  const step = session.steps.explore;
  return { ...session, steps: { ...session.steps, explore: { ...step, runs: step.runs.map((r) => (r.status === 'active' ? { ...run, id: r.id, status: 'active' } : r)) } } };
}

test('the rubric shares voice and gatekeeping, and adds the stance, compass, flow and traps', () => {
  assert.ok(DECISION_RUBRIC.includes(VOICE));
  assert.ok(DECISION_RUBRIC.includes(GATEKEEPING));
  for (const words of ['THE BOOK\'S STANCE', 'THE SECTION COMPASS', 'DECISION TRAPS', 'sunk-cost', 'single option dressed up as a choice', 'name one sibling you passed over', 'dm_yes_no', 'dm_stop_rule', 'Waiting on', 'ANOTHER ANGLE', 'Can become tasks']) {
    assert.ok(DECISION_RUBRIC.includes(words), `rubric mentions ${words}`);
  }
  for (const id of COMPASS_IDS) assert.ok(DECISION_RUBRIC.includes(`- ${id}:`), `compass ${id}`);
  assert.match(DECISION_RUBRIC, /"frame":\{"decision":"...","compass":"...","known":"..."\}\|null,"suggestion"/);
  assert.doesNotMatch(DECISION_RUBRIC, /whatIsTrue|"model":|proposeReview|reopen_step/);
});

test('one catalogue line per model, the book\'s see also and our pairs kept apart', () => {
  const lines = catalogueLines().split('\n');
  assert.equal(lines.length, 52);
  assert.deepEqual(lines.map((line) => line.match(/^- (\S+) \(/)[1]), CATALOGUE.map((entry) => entry.id));
  for (const line of lines) assert.match(line, /\[s[1-4] (worksheet|lens)\]: \S/);
  const whitmore = lines.find((line) => line.startsWith('- dm_whitmore '));
  assert.match(whitmore, /Book's see also: dm_flow\./);
  const eisenhower = lines.find((line) => line.startsWith('- dm_eisenhower '));
  assert.doesNotMatch(eisenhower, /Book's see also/);
  assert.match(eisenhower, /Pairs well \(ours\): dm_project_portfolio, dm_stop_rule\./);
  assert.ok(DECISION_RUBRIC.includes(catalogueLines()));
});

test('Problem Solver\'s prompts never list the Decision Maker models', () => {
  assert.doesNotMatch(RUBRIC, /dm_/);
  assert.doesNotMatch(buildCoachPrompt(createSession({ text: 'Students hand in work late.' }, deps)).system.join('\n'), /dm_/);
  for (const model of Object.keys(MODELS)) {
    for (const { step } of stepPlan(model)) assert.ok(!toolsForPlanStep(model, step).some((id) => id.startsWith('dm_')), `${model} ${step}`);
  }
  for (const { id } of BOOK_STEPS) assert.ok(!toolsForBookStep(id).some((tool) => tool.startsWith('dm_')), id);
});

test('every model has a note: steps, slots, watch-fors, and the lens or worksheet rule', () => {
  for (const entry of CATALOGUE) {
    const note = modelNote(entry.id);
    assert.match(note, new RegExp(`^MODEL NOTE: .+ \\(${entry.id}\\), section ${entry.section}`));
    for (const part of ['Use it when:', 'Steps:\n  1. ', 'Slot meanings:', 'Watch for:']) assert.ok(note.includes(part), `${entry.id} ${part}`);
    assert.ok(note.includes(entry.tier === 'lens' ? 'Lens: explain the idea in two sentences' : 'Worksheet: work its steps'), entry.id);
  }
  assert.match(modelNote('dm_eisenhower'), /Exercise \(offer once, when the minimum is met\): Sort this week/);
  assert.match(modelNote('dm_eisenhower'), /item = .+\(tag: decide_when\|do_now\|do_later\|delegate\)/);
  assert.equal(modelNote('five_whys'), null);
});

test('companions sit in the reused tools\' notes, not in new slots', () => {
  assert.match(modelNote('morphological'), /SCAMPER companion: .+substitute, combine, adapt/);
  assert.match(modelNote('double_loop'), /Espoused theory and theory in use/);
  assert.match(modelNote('swot'), /Reused from Problem Solver: where its words say Implement, read Decide\./);
  assert.doesNotMatch(modelNote('swot'), /SCAMPER|Espoused/);
  assert.deepEqual(Object.keys(COMPANIONS), ['morphological', 'double_loop']);
});

test('framing: two cached layers, the missing answers, and no model note', () => {
  const prompt = buildDecisionPrompt(createSession({ text: 'Should I move?', kind: 'decision' }, deps));
  assert.equal(prompt.system.length, 2);
  assert.equal(prompt.system[0], DECISION_RUBRIC);
  assert.match(prompt.system[1], /NEXT AFTER FRAMING: Explore/);
  assert.match(prompt.user, /^DECISION: Should I move\?/);
  assert.match(prompt.user, /Missing frame answers: decision, compass, known/);
});

test('in a model: a third cached layer with its note, and the run state in the turn', () => {
  const prompt = buildDecisionPrompt(inModel('dm_eisenhower'));
  assert.equal(prompt.system.length, 3);
  assert.match(prompt.system[1], /CURRENT STEP: Explore/);
  assert.equal(prompt.system[2], modelNote('dm_eisenhower'));
  assert.match(prompt.user, /COMPASS: Improve yourself/);
  assert.match(prompt.user, /ACTIVE MODEL: The Eisenhower matrix \(dm_eisenhower\)/);
  assert.match(prompt.user, /Open slots: item:1/);
  assert.match(prompt.user, /Progress: not yet at the minimum/);
  assert.doesNotMatch(prompt.user, /Steps:|Slot meanings:/); // static parts stay in the cached note
});

test('the coach waits while the person places points on a plot', () => {
  let s = inModel('dm_gift');
  s = applyCoachTurn(s, turn({ node: { slot: 'point:1', text: 'A book for my sister', title: 'Book' } }), deps);
  assert.match(buildDecisionPrompt(s).user, /Waiting on: The person places each point on the chart/);
});

test('do-immediately items can become tasks through the proposal flow', () => {
  let s = inModel('dm_eisenhower');
  s = applyCoachTurn(s, turn({ node: { slot: 'item:1', text: 'Reply to the head of year', title: 'Reply', tag: 'do_now' } }), deps);
  s = applyCoachTurn(s, turn({ node: { slot: 'item:2', text: 'Sort the shed', title: 'Shed', tag: 'do_later' } }), deps);
  assert.match(buildDecisionPrompt(s).user, /Can become tasks: item:1\n/);
  s = applyCoachTurn(s, turn({ proposeTasks: [{ slot: 'item:1', title: 'Reply to the head of year', due: null }, { slot: 'item:2', title: 'Sort the shed', due: null }] }), deps);
  assert.deepEqual(s.proposedTasks.map((p) => [p.title, p.status]), [['Reply to the head of year', 'proposed']]);
  assert.match(buildDecisionPrompt(s).user, /TASKS FROM THIS DECISION:\n {2}proposed: "Reply to the head of year"/);
});

test('minimum met: another angle from the book\'s see also, then ours, or Decide', () => {
  const s = withRun(inModel('dm_whitmore'), workThrough('dm_whitmore'));
  assert.match(buildDecisionPrompt(s).user, /Progress: MINIMUM MET\. ANOTHER ANGLE: the book's see also: dm_flow; ours: .+; or next_step to Decide\./);
  assert.deepEqual(anotherAngle('dm_whitmore', ['dm_flow']).book, []);
  assert.deepEqual(anotherAngle('dm_eisenhower'), { book: [], ours: ['dm_project_portfolio', 'dm_stop_rule'] });
});

test('Decide has its own step layer and no model note', () => {
  const s = moveOn(inModel('dm_eisenhower'), deps);
  const prompt = buildDecisionPrompt(s);
  assert.equal(s.phase, 'decide');
  assert.equal(prompt.system.length, 2);
  assert.match(prompt.system[1], /CURRENT STEP: Decide\n.+Stop Rule/);
  assert.match(prompt.user, /MODE: boundary.+what they learned about how they decide/);
});

test('a decision session is coached with the decision prompt, a Problem Solver one with its own', async () => {
  const seen = [];
  const coach = createModelCoach(async (prompt) => {
    seen.push(prompt.system[0]);
    return JSON.stringify({ verdict: 'clarify', message: 'Tell me a little more about what is at stake, and by when it has to be settled?' });
  });
  await coach(createSession({ text: 'Should I move?', kind: 'decision' }, deps));
  await coach(createSession({ text: 'Late work.' }, deps));
  assert.deepEqual(seen, [DECISION_RUBRIC, RUBRIC]);
});

test('next_model is next_tool for the book\'s models only', () => {
  const ok = validateCoachTurn({ verdict: 'clarify', message: 'm', suggestion: { kind: 'next_model', tool: 'dm_flow', reason: 'r' } });
  assert.deepEqual(ok.value.suggestion, { kind: 'next_tool', tool: 'dm_flow', reason: 'r' });
  assert.equal(validateCoachTurn({ verdict: 'clarify', message: 'm', suggestion: { kind: 'next_model', tool: 'five_whys', reason: 'r' } }).ok, false);
});

test('no Decision Maker step is called choose', () => {
  assert.ok(!DECISION_MODEL.steps.some((step) => step.id === 'choose'));
});
````

- [ ] **Step 3: Run them**

Run: `node --test tests/unit/decision-book-prompts.test.js tests/unit/decision-book-coach.test.js tests/unit/problem-solver-coach-schema.test.js tests/unit/problem-solver-prompts.test.js`
Expected: PASS (14 new tests).

- [ ] **Step 4: Commit**

```bash
git add netlify/functions/_shared/problem-solver/coach.mjs netlify/functions/_shared/problem-solver/coach-schema.mjs tests/unit/decision-book-prompts.test.js
git commit -m "Decision Maker: decision sessions coached from the book; next_model; prompt tests

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The canvas map

**Files:**
- Create: `packages/decision-book/render/charts.ts`, `apps/tasks/tests/unit/decision-book-canvas.test.ts`
- Modify: `apps/tasks/tests/unit/helpers/decision-book-charts.ts`

- [ ] **Step 1: One place that picks a run's chart**

Plan 5's session canvas calls `createChartForRun(run)`. The four reused Problem Solver renderers take no tool, and they re-skin under `.dm-scope` (Plan 2). A Problem Solver toolkit tool returns `null`.

````ts
// packages/decision-book/render/charts.ts
// Which chart draws a Decision Maker run: the family renderer named by the tool's `family`,
// the two one-offs by id, the four reused Problem Solver tools by their own renderers (re-skinned
// under .dm-scope), and the decision record. The session canvas and the tests both use this.
import { TOOLS } from '../../problem-solver/tools/index.mjs';
import { RECORD_ID } from '../record-slots.mjs';
import { createQuadrantView } from './quadrant';
import { createPlotView } from './plot';
import { createScalesView } from './scales';
import { createCurveView } from './curve';
import { createTensionView } from './tension';
import { createPathView } from './path';
import { createListView } from './list';
import { createOutsideBoxView } from './outside-box';
import { createBlackBoxView } from './black-box';
import { createRecordView } from './record';
import { createSwotView } from '../../problem-solver/render/swot';
import { createParetoView } from '../../problem-solver/render/pareto';
import { createMorphologicalView } from '../../problem-solver/render/morphological';
import { createDoubleLoopView } from '../../problem-solver/render/double-loop';

/** What the canvas needs of any chart: its element and a way to redraw from a run. */
export type RunChart = { el: HTMLElement; update(run: never): void; destroy?(): void };

type ToolLike = { id: string; family?: string };

const BY_FAMILY: Record<string, (tool: never) => RunChart> = {
  quadrant: createQuadrantView,
  plot: createPlotView,
  scales: createScalesView,
  curve: createCurveView,
  tension: createTensionView,
  path: createPathView,
  list: createListView
};

const BY_ID: Record<string, (tool: never) => RunChart> = {
  dm_outside_box: createOutsideBoxView,
  dm_black_box: createBlackBoxView,
  swot: () => createSwotView(),
  pareto: () => createParetoView(),
  morphological: () => createMorphologicalView(),
  double_loop: () => createDoubleLoopView(),
  [RECORD_ID]: () => createRecordView()
};

/** The chart for a tool definition, or null when Decision Maker has none for it. */
export function createChartForTool(tool: ToolLike): RunChart | null {
  const make = BY_ID[tool.id] ?? (tool.family ? BY_FAMILY[tool.family] : undefined);
  return make ? make(tool as never) : null;
}

/** The chart for a run, looked up through the shared tool registry. */
export function createChartForRun(run: { tool: string }): RunChart | null {
  const tool = (TOOLS as Record<string, ToolLike>)[run.tool] ?? (run.tool === RECORD_ID ? { id: RECORD_ID } : null);
  return tool ? createChartForTool(tool) : null;
}
````

- [ ] **Step 2: The test helper uses it**

````diff
diff --git a/apps/tasks/tests/unit/helpers/decision-book-charts.ts b/apps/tasks/tests/unit/helpers/decision-book-charts.ts
index 95c9060fb..dcbad5187 100644
--- a/apps/tasks/tests/unit/helpers/decision-book-charts.ts
+++ b/apps/tasks/tests/unit/helpers/decision-book-charts.ts
@@ -1,32 +1,11 @@
 // Builds the right chart for each sample key, so one contract suite covers every renderer.
 import { SAMPLE_TOOLS } from '../../../../../packages/decision-book/fixtures.mjs';
 import type { ChartView } from '../../../../../packages/decision-book/render/core';
-import { createQuadrantView } from '../../../../../packages/decision-book/render/quadrant';
-import { createPlotView } from '../../../../../packages/decision-book/render/plot';
-import { createScalesView } from '../../../../../packages/decision-book/render/scales';
-import { createCurveView } from '../../../../../packages/decision-book/render/curve';
-import { createTensionView } from '../../../../../packages/decision-book/render/tension';
-import { createPathView } from '../../../../../packages/decision-book/render/path';
-import { createListView } from '../../../../../packages/decision-book/render/list';
-import { createOutsideBoxView } from '../../../../../packages/decision-book/render/outside-box';
-import { createBlackBoxView } from '../../../../../packages/decision-book/render/black-box';
+import { createChartForTool as chartFor } from '../../../../../packages/decision-book/render/charts';
 import { createRecordView } from '../../../../../packages/decision-book/render/record';
 
 type SampleTool = { id: string; family: string };
 const TOOLS = SAMPLE_TOOLS as unknown as Record<string, SampleTool>;
-const BY_FAMILY: Record<string, (tool: never) => ChartView> = {
-  quadrant: createQuadrantView,
-  plot: createPlotView,
-  scales: createScalesView,
-  curve: createCurveView,
-  tension: createTensionView,
-  path: createPathView,
-  list: createListView
-};
-const BY_ID: Record<string, (tool: never) => ChartView> = {
-  dm_outside_box: createOutsideBoxView,
-  dm_black_box: createBlackBoxView
-};
 
 /** Every sample key, plus the decision record. */
 export const CHARTS: string[] = [...Object.keys(TOOLS), 'record'];
@@ -36,8 +15,7 @@ export function createChartFor(key: string): ChartView {
   return createChartForTool(TOOLS[key]);
 }
 
-/** The chart for any Decision Book tool definition: its family's renderer, or its own. */
+/** The chart for any Decision Book tool definition: the canvas's own choice (render/charts.ts). */
 export function createChartForTool(tool: SampleTool): ChartView {
-  const make = BY_ID[tool.id] ?? BY_FAMILY[tool.family];
-  return make(tool as never);
+  return chartFor(tool) as unknown as ChartView;
 }
````

- [ ] **Step 3: The canvas test**

````ts
// The canvas map: every catalogue model and the decision record get a chart through the shared
// registry; a family model gets its family's chart, the one-offs and reused tools their own.
import { describe, expect, it } from 'vitest';
import { createChartForRun } from '../../../../packages/decision-book/render/charts';
import { CATALOGUE } from '../../../../packages/decision-book/catalogue.mjs';
import { RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';

describe('Decision Maker canvas', () => {
  it.each(CATALOGUE.map((entry) => [entry.id, entry.family, entry.reuse] as const))('%s has a chart', (id, family, reuse) => {
    const chart = createChartForRun({ tool: id });
    expect(chart, id).not.toBeNull();
    expect(chart!.el).toBeInstanceOf(HTMLElement);
    if (family !== 'oneoff' && !reuse) expect(chart!.el.className).toContain(`dm-chart--${family}`);
  });

  it('draws the decision record and refuses a tool it does not know', () => {
    expect(createChartForRun({ tool: RECORD_ID })).not.toBeNull();
    expect(createChartForRun({ tool: 'five_whys' })).toBeNull();
    expect(createChartForRun({ tool: 'nope' })).toBeNull();
  });

});
````

- [ ] **Step 4: Run the chart tests**

Run: `cd apps/tasks && npx vitest run tests/unit/decision-book-canvas.test.ts tests/unit/decision-book-charts.test.ts tests/unit/decision-book-models-render.test.ts tests/unit/decision-book-family-charts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/decision-book/render/charts.ts apps/tasks/tests/unit/decision-book-canvas.test.ts apps/tasks/tests/unit/helpers/decision-book-charts.ts
git commit -m "Decision Maker: one canvas map from a run to its chart

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Long stage tracks stack on a narrow card

At contact-sheet card width (560px), Drexler/Sibbet's seven stages got about 65px each, and labels such as "Implementation: who does what, when, where?" crowded each other. A track of more than five stages is now marked `data-many`. A container query on the round turns it vertical below 840px, with a disc and a dotted line on the left, as the flow variant draws. Tracks of three or four stages (result optimisation, buyer's decision, Stop Rule, unconscious thinking) are unchanged. The phone reflow already stacks every track.

**Files:**
- Modify: `packages/decision-book/render/path.ts`, `packages/decision-book/decision-book.css`, `apps/tasks/tests/unit/decision-book-canvas.test.ts`

- [ ] **Step 1: Apply**

````diff
diff --git a/packages/decision-book/decision-book.css b/packages/decision-book/decision-book.css
index 8e390e31a..110300bd1 100644
--- a/packages/decision-book/decision-book.css
+++ b/packages/decision-book/decision-book.css
@@ -262,6 +262,14 @@
 .dm-path__stages::before { content: ''; position: absolute; left: 11px; right: 14px; top: 10px; border-top: 2px dotted var(--dm-ink); }
 .dm-path__stages::after { content: ''; position: absolute; right: 0; top: 4px; width: 12px; height: 14px; background: var(--dm-ink); clip-path: polygon(0 0, 100% 50%, 0 100%); }
 .dm-path__stage { position: relative; display: grid; gap: 6px; align-content: start; min-width: 0; }
+.dm-path__round { container: dm-path / inline-size; }
+@container dm-path (max-width: 840px) {
+  .dm-path__stages[data-many] { grid-auto-flow: row; gap: 0; }
+  .dm-path__stages[data-many]::before, .dm-path__stages[data-many]::after { display: none; }
+  .dm-path__stages[data-many] .dm-path__stage { grid-template-columns: 22px minmax(0, 1fr); column-gap: 10px; row-gap: 6px; padding-bottom: 14px; }
+  .dm-path__stages[data-many] .dm-path__stage > :not(.dm-path__disc) { grid-column: 2; }
+  .dm-path__stages[data-many] .dm-path__stage:not(:last-child)::before { content: ''; position: absolute; left: 10px; top: 22px; bottom: 0; border-left: 2px dotted var(--dm-ink); }
+}
 .dm-path__layers { display: flex; flex-direction: column; gap: 8px; }
 .dm-path__layers:empty::before { content: attr(data-empty) 's go here'; font: 400 12px / 1.4 var(--font-ui); color: #66675d; }
 .dm-path__layer { display: grid; grid-template-columns: minmax(120px, auto) minmax(0, 1fr); align-items: center; gap: 10px; padding: 10px 12px; border-radius: 999px; background: var(--dm-green-tint); }
diff --git a/packages/decision-book/render/path.ts b/packages/decision-book/render/path.ts
index 72b6e6754..effe29ef4 100644
--- a/packages/decision-book/render/path.ts
+++ b/packages/decision-book/render/path.ts
@@ -3,7 +3,8 @@
 //   flow    the route taken, top to bottom: each stage a disc on a dotted line, its answer
 //           beside it; a question's answer carries a Yes or No word chip; the stage being
 //           asked shows as an open disc saying "Now"; an end stage is a filled disc.
-//   stages  one track per round, the stages left to right on a dotted line ending in an arrow.
+//   stages  one track per round, the stages left to right on a dotted line ending in an arrow;
+//           a track of more than five stages runs top to bottom when its card is narrow.
 //   layers  the safeguards as stacked slices, each with its holes; a hole not yet linked to a
 //           layer waits under them.
 // Phone: tracks turn vertical; the flow is already vertical.
@@ -47,6 +48,8 @@ export function createPathView(tool: ChartTool & { chart: PathChart }, doc: Docu
     track.setAttribute('aria-label', `Round ${round}`);
     track.append(el(doc, 'span', 'dm-path__round-label', `Round ${round}`));
     const line = el(doc, 'div', 'dm-path__stages');
+    // Seven stages cannot share a narrow card's width: the CSS turns a long track vertical.
+    if (chart.stages!.length > 5) line.setAttribute('data-many', 'true');
     for (const stage of chart.stages!) {
       const cell = el(doc, 'div', 'dm-path__stage');
       cell.setAttribute('data-stage', stage.id);
diff --git a/apps/tasks/tests/unit/decision-book-canvas.test.ts b/apps/tasks/tests/unit/decision-book-canvas.test.ts
index b65445d..36048d4 100644
--- a/apps/tasks/tests/unit/decision-book-canvas.test.ts
+++ b/apps/tasks/tests/unit/decision-book-canvas.test.ts
@@ -19,4 +19,12 @@ describe('Decision Maker canvas', () => {
     expect(createChartForRun({ tool: 'nope' })).toBeNull();
   });
 
+  it('marks a track of more than five stages, so a narrow card stacks it', () => {
+    const many = createChartForRun({ tool: 'dm_drexler_sibbet' })!;
+    many.update({ id: 'r', tool: 'dm_drexler_sibbet', status: 'active', nodes: [], edges: [] } as never);
+    expect(many.el.querySelector('.dm-path__stages')!.getAttribute('data-many')).toBe('true');
+    const few = createChartForRun({ tool: 'dm_result_optimisation' })!;
+    few.update({ id: 'r', tool: 'dm_result_optimisation', status: 'active', nodes: [], edges: [] } as never);
+    expect(few.el.querySelector('.dm-path__stages')!.hasAttribute('data-many')).toBe(false);
+  });
 });
````

- [ ] **Step 2: Test and look**

Run: `cd apps/tasks && npx vitest run tests/unit/decision-book-canvas.test.ts && cd ../.. && node --test tests/unit/decision-book-css.test.js`
Expected: PASS.

Then run `node scripts/build-decision-book-contact-sheet.mjs`, serve with `preview_start { name: "mockups" }`, open `/decision-maker/contact-sheet.html`, and scroll to "4. The Drexler/Sibbet team performance model". Check that the seven stages run top to bottom, each label on one line beside its disc with its answer below, and that the console has no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/decision-book/render/path.ts packages/decision-book/decision-book.css apps/tasks/tests/unit/decision-book-canvas.test.ts
git commit -m "Decision Maker: a long stage track stacks on a narrow card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Plan 4 check, and the plan set

- [ ] **Step 1:** `npm run test:unit`: PASS (5,686 when drafted: 5,675 pass, 11 skipped).
- [ ] **Step 2:** `cd apps/tasks && npx vitest run tests/unit/problem-solver tests/unit/decision-book`: PASS (54 files, 1,087 tests when drafted).
- [ ] **Step 3:** `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep -E "problem-solver|decision-book" | grep -v "TS6059\|Imported via\|rootDir" || echo "no problem-solver or decision-book errors"`
- [ ] **Step 4:** Do not push. Update `decision-book-tool.md` with "Plan 4 done (HEAD <sha>)".

---

## Notes for Plan 5 (the Decide step, Review and the app)

- **Decide:** register the decision record tool `dm_record` (`RECORD_ID` and `RECORD_SLOTS` in `packages/decision-book/record-slots.mjs`) with `step: 'settle'`, so `toolsForPlanStep('decision_book', 'decide')` lists it. Then replace the `DECIDE` text in `decision-prompts.mjs` with a step layer that names the tool, and add `modelNote` support for it, or a note of its own. Its first step and review become confirm cards.
- **Reasons and their basis:** the record chart takes a reason's basis with `setBasis` (Plan 2). The coach links a reason to the model nodes it rests on, and the composer keeps that link on the session.
- **Review:** the plan's Review step lists no tools yet. Either name `dm_feedback_analysis` in the step's own tool list, or add a `review` tool, and drive it from `reviewState` as Problem Solver's Improve does.
- **Canvas:** `createChartForRun(run)` already returns the record chart for `dm_record` runs.
- **Prompt state already in place:** "Can become tasks", "Waiting on", ANOTHER ANGLE and TASKS FROM THIS DECISION. The client shows `proposedTasks` with Problem Solver's task cards.
- **Scripted coach:** `scripted-coach.mjs` frames a decision and suggests the first Explore model. It does not yet use `next_model` or another angle, and Plan 5's walks will need both.

