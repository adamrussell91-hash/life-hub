# Group Sets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teachers add question sets to a quiz for saved markbook groups. Each student gets the shared questions plus their groups' sets interleaved. Results feed the markbook, and a dated History records joining, practice received, results, leaving and retiring.

**Architecture:** A group set is a quiz-lesson section marked `content.group_set` (the same way tutorial tabs are marked). On publish, `prepareQuizPublish` lifts each set out of the public blocks into `record.sets`. `narrow()` (already used by tutorial exit checks) then gives each student the shared order with their sets interleaved and marks those ids as `practice`. `scoreAttempt` keeps practice outside the quiz score. Saved groups and History live in the class markbook record. The markbook client works out leaving and received/result events from evidence and quiz columns, then writes them once through a `record_history` action. The server dedupes by event id and never recomputes.

**Tech Stack:** TypeScript (apps/teaching, Vitest + happy-dom), Netlify functions in `.mjs` (node:test), zod schemas generated to `.mjs` by `scripts/generate-alchemy-schema.mjs`.

**Spec:** `docs/superpowers/specs/2026-10-26-group-sets-design.md`

**Worktree:** `/Users/example/Projects/life-hub-group-sets`, branch `claude/group-sets`. Run every command from there.

**Test commands:**
- Server: `node --import ./scripts/test-network-guard.mjs --test tests/unit/<file>.test.js`
- Teaching app: `cd apps/teaching && npx vitest run tests/unit/<file>.test.ts`
- Gate before PR: `npm run pre-pr-check` (must exit 0)

**Rules from Adam that bind this build:**
- Public repo: invented student names only (`Ann Bell`, `Cy Dale`, `Ed Fox`, as in the existing tests).
- State what students CAN do: no "can't / not / without" wording in student-facing text. The student label is "Practice for you".
- Ann stays plan-first with an A$ quote before she builds. The set's "Ann drafts" shows "about A$0.35" before starting.
- One PR for the whole build; the phases are commits.

---

## File map

**Server (netlify/functions/_shared):**
- `group-sets.mjs` (new): pure helpers `liftGroupSets(blocks)`, `interleave(shared, sets)`, `GROUP_SET_LIMITS`.
- `quiz.mjs`: `prepareQuizPublish` uses `liftGroupSets`; `narrow` handles `record.sets`; `scoreAttempt` splits practice; status, results, insight and `classQuizScores` carry practice and set info; `INSIGHT_SCHEMA` → 2.
- `teaching-student.mjs`: `withoutQuizQuestions` also drops `group_set` sections.
- `markbook.mjs`: actions `save_group`, `add_members`, `remove_member`, `rename_group`, `record_history`; `quizColumns` passes `sets`.
- `markbook-schema.mjs`, `teaching-block-schema.mjs`: regenerated.

**Teaching app (apps/teaching/src):**
- `schemas/block.ts`: section `group_set` field.
- `markbook/schema.ts`: `groups`, `history` schemas and limits.
- `markbook/types.ts`: quiz column `sets`, score `practice`, row `set`.
- `markbook/api.ts`: five new calls.
- `evidence/groups.ts` (new): `leavesFor`, `historyEventsFor`, `flaggedFor`, `joinWhy`, `newGroupId`, `activeMembers`.
- `markbook/history-view.ts` (new): History mode.
- `markbook/next-view.ts`: Save group on group cards; saved groups list; overlap hiding.
- `markbook/student-panel.ts`: History section.
- `teacher/sections/markbook.ts`: History mode, sync on load, wiring.
- `quiz/group-set-picker.ts` (new): the Personalise control in quiz Settings.
- `quiz/group-set-tools.ts` (new): editor strip on a group set section (header, Refresh, Write it myself, Ann drafts).
- `quiz/teacher-panel.ts`: mounts the picker; Results per-set columns.
- `teacher/lesson-canvas/mount-page.ts`: wires the group set tools into `decorateRow`.
- `quiz/student-quiz.ts`: practice chip, end-screen practice line.
- `quiz/quiz.css`, `markbook/markbook.css`: styles.
- `ai/block-recipes.ts`, `ai/quiz-proposal.ts`, `ai/apply-proposal.ts`: Ann may fill a group set section; markers are kept.
- `scripts/mock-api.ts`: seed a saved group and a set for the dev walk.

---

## Phase 1: Quiz server

### Task 1: Group set helpers

**Files:**
- Create: `netlify/functions/_shared/group-sets.mjs`
- Test: `tests/unit/group-sets.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/group-sets.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_SET_LIMITS, interleave, isGroupSet, liftGroupSets } from '../../netlify/functions/_shared/group-sets.mjs';

const block = (id, block_type, content = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content });
const mc = (id) => block(id, 'quiz_question', { question: { id, kind: 'multiple_choice', prompt: `Q ${id}`, marks: 1, options: [{ id: 'a', text: 'Right' }, { id: 'b', text: 'Wrong' }], correct: ['a'] } });
const set = (id, group, students, children) =>
  block(id, 'section', { title: 'Practice', blocks: children, group_set: { group_id: group, class_id: 'class1', name: `Group ${group}`, tags: ['fam:repetition'], students, target: children.length } });

test('isGroupSet spots only marked sections', () => {
  assert.equal(isGroupSet(set('s1', 'g1', [], [])), true);
  assert.equal(isGroupSet(block('s2', 'section', { title: 'x', blocks: [] })), false);
  assert.equal(isGroupSet(mc('q1')), false);
});

test('liftGroupSets takes top-level sets out and keeps the rest in order', () => {
  const { blocks, sets } = liftGroupSets([mc('q1'), set('s1', 'g1', ['st_ann'], [mc('p1'), mc('p2')]), mc('q2')]);
  assert.deepEqual(blocks.map((b) => b.id), ['q1', 'q2']);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].id, 's1');
  assert.deepEqual(sets[0].blocks.map((b) => b.id), ['p1', 'p2']);
  assert.deepEqual(sets[0].config.students, ['st_ann']);
});

test('liftGroupSets drops sets nested in a section, column or tab', () => {
  const nested = block('outer', 'section', { title: 'Part A', blocks: [set('s1', 'g1', ['st_ann'], [mc('p1')])] });
  const { blocks, sets, problems } = liftGroupSets([nested]);
  assert.deepEqual(sets, []);
  assert.deepEqual(blocks[0].content.blocks, []);
  assert.match(problems[0], /top of the quiz/);
});

test('liftGroupSets refuses too many sets and too many questions', () => {
  const many = Array.from({ length: GROUP_SET_LIMITS.sets + 1 }, (_, i) => set(`s${i}`, `g${i}`, [], [mc(`p${i}`)]));
  assert.match(liftGroupSets(many).problems[0], /at most 6/);
  const big = set('s1', 'g1', [], Array.from({ length: GROUP_SET_LIMITS.questions + 1 }, (_, i) => mc(`p${i}`)));
  assert.match(liftGroupSets([big]).problems[0], /at most 10/);
});

test('interleave spreads practice evenly through the shared questions', () => {
  assert.deepEqual(interleave(['a', 'b', 'c', 'd'], [['x', 'y']]), ['a', 'x', 'b', 'c', 'y', 'd']);
  assert.deepEqual(interleave(['a', 'b'], [['x'], ['y']]), ['a', 'x', 'y', 'b']);
  assert.deepEqual(interleave([], [['x', 'y']]), ['x', 'y']);
  assert.deepEqual(interleave(['a'], []), ['a']);
});

test('interleave takes sets in turn so two groups share the spread', () => {
  assert.deepEqual(interleave(['a', 'b', 'c', 'd', 'e'], [['x1', 'x2'], ['y1', 'y2']]), ['a', 'x1', 'b', 'y1', 'c', 'x2', 'd', 'y2', 'e']);
});
```

- [ ] **Step 2: Run the test and check it fails**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/group-sets.test.js`
Expected: FAIL, `Cannot find module .../group-sets.mjs`

- [ ] **Step 3: Write the helpers**

```js
// netlify/functions/_shared/group-sets.mjs
/**
 * Group sets: a quiz section marked `group_set` holds questions for one saved
 * markbook group. On publish the set leaves the public blocks (its name, tags
 * and students are the teacher's) and its questions go into the quiz key under
 * `sets`, where narrow() hands them only to the set's students.
 */

export const GROUP_SET_LIMITS = { sets: 6, questions: 10 };

export function isGroupSet(block) {
  return block?.block_type === 'section' && !!block.content?.group_set && typeof block.content.group_set.group_id === 'string';
}

/** Removes any group set below the top level; returns the cleaned blocks and whether one was found. */
function dropNested(blocks) {
  let found = false;
  const walk = (list) =>
    (Array.isArray(list) ? list : []).flatMap((block) => {
      if (isGroupSet(block)) {
        found = true;
        return [];
      }
      const c = block.content ?? {};
      if (Array.isArray(c.blocks)) return [{ ...block, content: { ...c, blocks: walk(c.blocks) } }];
      if (Array.isArray(c.columns)) return [{ ...block, content: { ...c, columns: c.columns.map((col) => ({ ...col, blocks: walk(col.blocks) })) } }];
      if (Array.isArray(c.tabs)) return [{ ...block, content: { ...c, tabs: c.tabs.map((tab) => ({ ...tab, blocks: walk(tab.blocks) })) } }];
      return [block];
    });
  return { blocks: walk(blocks), found };
}

/**
 * Splits a quiz's student blocks into the public blocks and its group sets.
 * Only top-level sets count; a set inside a section, column or tab is dropped
 * with a problem, so its questions never ship to everyone.
 */
export function liftGroupSets(blocks) {
  const kept = [];
  const sets = [];
  const problems = [];
  let nested = false;
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (isGroupSet(block)) {
      const inner = dropNested(block.content.blocks ?? []);
      nested ||= inner.found;
      sets.push({ id: block.id, config: block.content.group_set, blocks: inner.blocks });
      continue;
    }
    const cleaned = dropNested([block]);
    nested ||= cleaned.found;
    kept.push(...cleaned.blocks);
  }
  if (nested) problems.push('A group set must sit at the top of the quiz, not inside a section, column or tab.');
  if (sets.length > GROUP_SET_LIMITS.sets) problems.push(`A quiz holds at most ${GROUP_SET_LIMITS.sets} group sets.`);
  for (const s of sets) {
    const count = s.blocks.filter((b) => b.block_type === 'quiz_question').length;
    if (count > GROUP_SET_LIMITS.questions) problems.push(`A group set holds at most ${GROUP_SET_LIMITS.questions} questions (${s.config.name ?? 'a set'} has ${count}).`);
  }
  return { blocks: kept, sets, problems };
}

/**
 * The shared questions with practice spread evenly through them. Sets take
 * turns (x1, y1, x2, y2…), and practice question k goes after shared question
 * slot(k), so practice never bunches at the start or the end.
 */
export function interleave(shared, sets) {
  const extra = [];
  const lists = sets.map((s) => [...s]);
  while (lists.some((l) => l.length)) for (const l of lists) if (l.length) extra.push(l.shift());
  if (!extra.length) return [...shared];
  if (!shared.length) return extra;
  // Evenly spaced, 1-based: after which shared question practice k goes.
  const slot = (k) => Math.max(1, Math.round(((k + 1) * shared.length) / (extra.length + 1)));
  const out = [];
  let k = 0;
  for (let i = 1; i <= shared.length; i += 1) {
    out.push(shared[i - 1]);
    while (k < extra.length && slot(k) === i) out.push(extra[k++]);
  }
  while (k < extra.length) out.push(extra[k++]);
  return out;
}
```

Worked check: shared `[a,b,c,d]` with extra `[x,y]` gives slots 1 and 3, so `a x b c y d`. Shared `[a,b]` with extra `[x,y]` gives slots 1 and 1, so `a x y b`. Five shared with four extra give slots 1–4, so the two sets alternate.

- [ ] **Step 4: Run the test and check it passes**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/group-sets.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/group-sets.mjs tests/unit/group-sets.test.js
git commit -m "Teaching: group set helpers (lift sets off a quiz, interleave practice)"
```

### Task 2: Publish lifts sets into the quiz key

**Files:**
- Modify: `netlify/functions/_shared/quiz.mjs` (`prepareQuizPublish`, around lines 121–153)
- Modify: `netlify/functions/_shared/teaching-student.mjs` (`withoutQuizQuestions`, around line 208)
- Create: `tests/unit/helpers/group-sets-fixture.js` (shared by the quiz and markbook tests; not matched by `*.test.js`)
- Test: `tests/unit/group-sets-quiz.test.js` (new)

- [ ] **Step 1: Write the fixture and the failing test**

```js
// tests/unit/helpers/group-sets-fixture.js
import { prepareQuizPublish, storeQuizKey } from '../../../netlify/functions/_shared/quiz.mjs';
import { classKey, draftLessonKey, publishedLessonKey } from '../../../netlify/functions/_shared/teaching-blobs.mjs';

export const block = (id, block_type, content = {}) => ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content });
export const mc = (id) => block(id, 'quiz_question', { question: { id, kind: 'multiple_choice', prompt: `Q ${id}`, marks: 1, options: [{ id: 'a', text: 'Right' }, { id: 'b', text: 'Wrong' }], correct: ['a'] } });
export const set = (id, group, students, children) =>
  block(id, 'section', { title: 'Practice', blocks: children, group_set: { group_id: group, class_id: 'class1', name: `Group ${group}`, tags: ['fam:repetition'], students, target: children.length } });
export const draft = { id: 'quiz1', title: 'Week 3 review', unit_id: 'u1', pedagogical_mode: 'quiz', quiz: {} };
export const ROSTER = [{ id: 'st_ann', name: 'Ann Bell', initials: 'AB' }, { id: 'st_cy', name: 'Cy Dale', initials: 'CD' }, { id: 'st_ed', name: 'Ed Fox', initials: 'EF' }];

/** A blob store in memory, with etags so markbook writes work too. */
export function memoryStore() {
  const data = new Map();
  const etags = new Map();
  let n = 0;
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: etags.get(key) ?? 'e0' } : null; },
    async setJSON(key, value, opts = {}) {
      if (opts.onlyIfNew && data.has(key)) return { modified: false };
      if (opts.onlyIfMatch && (etags.get(key) ?? 'e0') !== opts.onlyIfMatch) return { modified: false };
      data.set(key, structuredClone(value));
      etags.set(key, `e${++n}`);
      return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

/** Week 3 review: q1–q3 shared, set s1 (g1: Ann, Cy) with p1, p2, set s2 (g2: Ann) with r1. */
export async function setupSets(settings = {}) {
  const store = memoryStore();
  const d = { ...draft, quiz: settings };
  const blocks = [mc('q1'), mc('q2'), mc('q3'), set('s1', 'g1', ['st_ann', 'st_cy'], [mc('p1'), mc('p2')]), set('s2', 'g2', ['st_ann'], [mc('r1')])];
  const prepared = prepareQuizPublish(d, blocks);
  await storeQuizKey(store, 'quiz1', prepared.quiz);
  store.data.set(draftLessonKey('quiz1'), { ...d, blocks });
  store.data.set(publishedLessonKey('quiz1'), { lesson_id: 'quiz1', title: 'Week 3 review', unit_id: 'u1', pedagogical_mode: 'quiz', blocks: prepared.blocks, quiz: prepared.quiz.snapshot });
  store.data.set(classKey('class1'), { id: 'class1', type: 'class', status: 'active', title: '7B', active_unit_ids: ['u1'], students: ROSTER });
  return { store, record: prepared.quiz.record };
}
export const tok = (n) => String(n).repeat(48).slice(0, 48);
export const who = (n) => ({ class_id: 'class1', class_token: tok(n), token: tok(n + 5) });
```

```js
// tests/unit/group-sets-quiz.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { classQuizScores, narrow, prepareQuizPublish, quizAction, quizTeacherAction } from '../../netlify/functions/_shared/quiz.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';
import { block, draft, mc, set, setupSets, who } from './helpers/group-sets-fixture.js';

test('publish keeps sets out of the public blocks and the shared order', () => {
  const out = prepareQuizPublish(draft, [mc('q1'), set('s1', 'g1', ['st_ann'], [mc('p1'), mc('p2')]), mc('q2')]);
  assert.deepEqual(out.problems, []);
  assert.deepEqual(out.blocks.map((b) => b.id), ['q1', 'q2']);
  assert.deepEqual(out.quiz.record.order, ['q1', 'q2']);
  assert.deepEqual(Object.keys(out.quiz.record.questions).sort(), ['p1', 'p2', 'q1', 'q2']);
  assert.deepEqual(out.quiz.record.sets, {
    s1: { group_id: 'g1', class_id: 'class1', name: 'Group g1', tags: ['fam:repetition'], students: ['st_ann'], questions: ['p1', 'p2'] }
  });
  assert.equal(out.quiz.record.questions.p1.key.set, 's1');
  assert.equal(out.quiz.snapshot.question_count, 2, 'the public count is the shared questions');
});

test('a quiz with no sets has no sets field', () => {
  const out = prepareQuizPublish(draft, [mc('q1')]);
  assert.equal('sets' in out.quiz.record, false);
});

test('a set outside a quiz lesson is dropped whole', () => {
  const out = prepareQuizPublish({ ...draft, pedagogical_mode: 'lesson' }, [set('s1', 'g1', ['st_ann'], [mc('p1')])]);
  assert.deepEqual(out.blocks, []);
});

test('an unfinished set question is a publish problem', () => {
  const bad = block('p1', 'quiz_question', { question: { id: 'p1', kind: 'multiple_choice', prompt: '', marks: 1, options: [], correct: [] } });
  const out = prepareQuizPublish(draft, [mc('q1'), set('s1', 'g1', [], [bad])]);
  assert.equal(out.problems.length, 1);
});

test('student surfaces never see a group set', () => {
  const blocks = [block('h', 'heading', { text: 'Hi', level: 2 }), set('s1', 'g1', ['st_ann'], [mc('p1')])];
  assert.deepEqual(filterBlocksForStudent(blocks).map((b) => b.id), ['h']);
  assert.deepEqual(filterBlocksForStudent(blocks, { keepQuizQuestions: true }).map((b) => b.id), ['h', 's1'], 'publish still sees it, to lift it');
});
```

- [ ] **Step 2: Run the test and check it fails**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/group-sets-quiz.test.js`
Expected: FAIL. `out.blocks` still includes `s1`, and there is no `record.sets`.

- [ ] **Step 3: Change `prepareQuizPublish`**

In `quiz.mjs`, add to the imports:

```js
import { isGroupSet, liftGroupSets } from './group-sets.mjs';
```

Replace the body of `prepareQuizPublish` up to `if (!isQuiz) return …` with:

```js
export function prepareQuizPublish(draft, studentBlocks, random = cryptoRandom) {
  const isQuiz = draft?.pedagogical_mode === 'quiz';
  const questions = {};
  const order = [];
  const problems = [];
  // Group sets leave the public blocks; outside a quiz they are dropped whole.
  const lifted = isQuiz ? liftGroupSets(studentBlocks) : { blocks: mapTree(studentBlocks, (b) => (isGroupSet(b) ? null : b)), sets: [], problems: [] };
  problems.push(...lifted.problems);
  const split = (block, setId) => {
    const checked = checkQuestion({ ...(block.content?.question ?? {}), id: block.id });
    if (!checked.ok) {
      problems.push(checked.message);
      return null;
    }
    const { question, key } = splitQuestion(checked.question, random);
    questions[block.id] = { question, key: setId ? { ...key, set: setId } : key };
    return question;
  };
  const blocks = mapTree(lifted.blocks, (block) => {
    if (block.block_type !== 'quiz_question') return block;
    if (!isQuiz) return null;
    const question = split(block, null);
    if (!question) return null;
    order.push(block.id);
    return { ...block, content: { question } };
  });
  const sets = {};
  for (const s of lifted.sets) {
    const ids = [];
    mapTree(s.blocks, (block) => {
      if (block.block_type === 'quiz_question' && split(block, s.id)) ids.push(block.id);
      return block;
    });
    const { group_id, class_id, name, tags, students } = s.config;
    sets[s.id] = { group_id, class_id, name, tags: [...(tags ?? [])], students: [...(students ?? [])], questions: ids };
  }
  if (!isQuiz) return { blocks, quiz: null, problems };
```

Then, where the record is built (`record: { version, order, questions, settings, created_at }`), add the sets only when there are some:

```js
      record: { version, order, questions, settings, created_at: new Date().toISOString(), ...(Object.keys(sets).length ? { sets } : {}) },
```

`total` and `question_count` already use `order`, so they stay shared-only.

- [ ] **Step 4: Change `withoutQuizQuestions` in teaching-student.mjs**

```js
function withoutQuizQuestions(blocks) {
  return blocks
    // A group set's name, tags and students are the teacher's; publish lifts it, everywhere else drops it.
    .filter(block => block?.block_type !== 'quiz_question' && !(block?.block_type === 'section' && block.content?.group_set))
    .map(block => {
```

(The rest of the function stays as it is.)

- [ ] **Step 5: Run the tests and check they pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/group-sets-quiz.test.js tests/unit/quiz.test.js tests/unit/tutorial-quiz.test.js`
Expected: PASS, and the existing quiz and tutorial tests still pass.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/quiz.mjs netlify/functions/_shared/teaching-student.mjs tests/unit/group-sets-quiz.test.js tests/unit/helpers/group-sets-fixture.js
git commit -m "Teaching: quiz publish lifts group sets into the key"
```

### Task 3: narrow() hands each student their sets, interleaved

**Files:**
- Modify: `netlify/functions/_shared/quiz.mjs` (`narrow`, around line 262; `quizAction` gate around line 379)
- Test: `tests/unit/group-sets-quiz.test.js` (append)

- [ ] **Step 1: Write the failing tests (append)**

```js
test('narrow gives a set student the shared questions with their practice spread through', async () => {
  const { record } = await setupSets();
  const ann = narrow(record, 'st_ann');
  assert.deepEqual(ann.order, ['q1', 'p1', 'q2', 'r1', 'p2', 'q3']);
  assert.deepEqual(ann.practice, { p1: 's1', p2: 's1', r1: 's2' });
  const cy = narrow(record, 'st_cy');
  assert.deepEqual(cy.order.filter((id) => !id.startsWith('q')), ['p1', 'p2']);
  const ed = narrow(record, 'st_ed');
  assert.deepEqual(ed.order, ['q1', 'q2', 'q3']);
  assert.deepEqual(Object.keys(ed.questions).sort(), ['q1', 'q2', 'q3'], 'other sets’ questions are unreachable');
  assert.deepEqual(ed.practice, {});
});

test('narrow on an unknown student gives the shared quiz', async () => {
  const { record } = await setupSets();
  assert.deepEqual(narrow(record, undefined).order, ['q1', 'q2', 'q3']);
});

test('narrow leaves a plain quiz as it is', () => {
  const out = prepareQuizPublish(draft, [mc('q1')]);
  assert.equal(narrow(out.quiz.record, 'st_ann'), out.quiz.record);
});

test('status sends a set student their questions and which are practice', async () => {
  const { store } = await setupSets();
  await quizAction(store, 'quiz1', { action: 'claim', ...who(1), initials: 'AB' });
  const ann = await quizAction(store, 'quiz1', { action: 'status', ...who(1) });
  assert.deepEqual(ann.questions.map((q) => q.id), ['q1', 'p1', 'q2', 'r1', 'p2', 'q3']);
  assert.deepEqual(ann.practice.sort(), ['p1', 'p2', 'r1']);
  assert.equal(ann.settings.question_count, 3, 'the quiz count is shared questions');
  assert.equal(ann.settings.practice_count, 3);
  await quizAction(store, 'quiz1', { action: 'claim', ...who(3), initials: 'EF' });
  const ed = await quizAction(store, 'quiz1', { action: 'status', ...who(3) });
  assert.deepEqual(ed.practice, []);
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/group-sets-quiz.test.js`
Expected: FAIL. `narrow` returns the record unchanged because there is no `groups`.

- [ ] **Step 3: Rewrite `narrow`**

```js
/**
 * Each student's own questions. A tutorial's exit check holds every group's
 * questions and `groups` maps student id → question ids. A quiz with group
 * sets (`sets`) gives everyone the shared order, and each set's students its
 * questions too, spread through the shared ones; `practice` maps those ids to
 * their set. Questions a student doesn't get are dropped from `questions` too,
 * so a hint or check can't reach them by id. A plain quiz is returned as it is.
 */
export function narrow(record, studentId) {
  if (!record?.groups && !record?.sets) return record;
  let order = record.order;
  if (record.groups) {
    const own = Object.hasOwn(record.groups, studentId ?? '') ? record.groups[studentId] : null;
    const mine = new Set(Array.isArray(own) ? own : []);
    order = order.filter((id) => mine.has(id));
  }
  const practice = {};
  if (record.sets) {
    const mineSets = Object.entries(record.sets).filter(([, s]) => typeof studentId === 'string' && Array.isArray(s.students) && s.students.includes(studentId));
    for (const [setId, s] of mineSets) for (const id of s.questions) practice[id] = setId;
    order = interleave(order, mineSets.map(([, s]) => s.questions.filter((id) => Object.hasOwn(record.questions, id))));
  }
  return { ...record, order, practice, questions: Object.fromEntries(order.map((id) => [id, record.questions[id]])) };
}
```

Add `interleave` to the group-sets import:

```js
import { interleave, isGroupSet, liftGroupSets } from './group-sets.mjs';
```

- [ ] **Step 4: Change the `quizAction` gate and status**

In `quizAction`, replace `if (record.groups) {` (around line 379) with:

```js
  if (record.groups || record.sets) {
    if (record.groups && !who.student && !['status', 'claim'].includes(action)) reject(403, 'no_list', 'Your teacher hasn’t added a class list yet.');
```

Leave the lines inside unchanged. A plain quiz with sets but no class list just gets the shared questions.

In `shared`, replace the `settings` and `questions` lines with:

```js
    settings: {
      ...publicSettings(record.settings),
      version: record.version,
      question_count: sharedIds(record).length,
      total_marks: sharedIds(record).reduce((sum, id) => sum + record.questions[id].key.marks, 0),
      ...(record.practice && Object.keys(record.practice).length ? { practice_count: Object.keys(record.practice).length } : {})
    },
    questions: publicQuestions(record),
    practice: Object.keys(record.practice ?? {}),
```

Next to `publicQuestions`, add:

```js
/** The quiz's own questions, without a student's practice. */
const sharedIds = (record) => record.order.filter((id) => !record.practice?.[id]);
```

In the returned `current` object, add `practice: Object.keys(attemptRecord.practice ?? {}),` after `questions`.

- [ ] **Step 5: Run the tests and check they pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/group-sets-quiz.test.js tests/unit/quiz.test.js tests/unit/tutorial-quiz.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/quiz.mjs tests/unit/group-sets-quiz.test.js
git commit -m "Teaching: each student gets their group sets interleaved"
```

### Task 4: Practice sits outside the quiz score

**Files:**
- Modify: `netlify/functions/_shared/quiz.mjs` (`scoreAttempt` ~line 271; student `results` ~line 514; teacher `attempt`/`results` ~lines 678–730; `buildInsight` ~line 790; `classInsight` return; `classQuizScores`)
- Test: `tests/unit/group-sets-quiz.test.js` (append)

- [ ] **Step 1: Write the failing tests (append)**

```js
const rightOption = (record, id) => record.questions[id].question.options.find((o) => o.text === 'Right').id;

async function annSits(store, record, rightIds) {
  await quizAction(store, 'quiz1', { action: 'claim', ...who(1), initials: 'AB' });
  await quizAction(store, 'quiz1', { action: 'start', ...who(1) });
  const responses = Object.fromEntries(rightIds.map((id) => [id, { selected: [rightOption(record, id)] }]));
  return quizAction(store, 'quiz1', { action: 'submit', ...who(1), responses });
}

test('the quiz score covers shared questions; practice has its own line', async () => {
  const { store, record } = await setupSets();
  const done = await annSits(store, record, ['q1', 'q2', 'p1', 'r1']);
  const r = done.results[0];
  assert.equal(r.score, 2);
  assert.equal(r.max, 3);
  assert.deepEqual(r.practice, { score: 2, max: 3, pending: 0 });
  assert.equal(r.rows.find((x) => x.id === 'p1').practice, true);
  assert.equal(r.rows.find((x) => x.id === 'q1').practice, false);
});

test('teacher results show each set’s score per attempt and list the sets', async () => {
  const { store, record } = await setupSets();
  await annSits(store, record, ['q1', 'p1', 'p2']);
  const res = await quizTeacherAction(store, 'quiz1', { action: 'results' });
  assert.deepEqual(res.sets, [
    { id: 's1', name: 'Group g1', questions: 2 },
    { id: 's2', name: 'Group g2', questions: 1 }
  ]);
  const a = res.attempts[0];
  assert.equal(a.score, 1);
  assert.equal(a.max, 3);
  assert.deepEqual(a.practice, { s1: { score: 2, max: 2, pending: 0 }, s2: { score: 0, max: 1, pending: 0 } });
});

test('markbook scores carry practice, set ids on rows, and the sets', async () => {
  const { store, record } = await setupSets();
  await annSits(store, record, ['p1']);
  const scores = await classQuizScores(store, 'quiz1', 'class1', ['st_ann', 'st_cy']);
  const ann = scores.scores.st_ann;
  assert.equal(ann.max, 3);
  assert.deepEqual(ann.practice, { s1: { score: 1, max: 2, pending: 0 }, s2: { score: 0, max: 1, pending: 0 } });
  assert.equal(ann.rows.find((r) => r.id === 'p1').set, 's1');
  assert.equal(ann.rows.find((r) => r.id === 'q1').set, undefined);
  assert.deepEqual(scores.sets, [
    { id: 's1', group_id: 'g1', name: 'Group g1', students: ['st_ann', 'st_cy'], questions: 2 },
    { id: 's2', group_id: 'g2', name: 'Group g2', students: ['st_ann'], questions: 1 }
  ]);
  assert.deepEqual(scores.questions.map((q) => q.id), ['q1', 'q2', 'q3'], 'markbook question columns are the shared ones');
});
```

- [ ] **Step 2: Run the tests and check they fail**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/group-sets-quiz.test.js`
Expected: FAIL. `r.max` is 6, not 3.

- [ ] **Step 3: Split the totals in `scoreAttempt`**

Replace the last four lines of `scoreAttempt` (from `const max = …` to the `return`) with:

```js
  const setOf = (id) => record.practice?.[id] ?? null;
  const shared = rows.filter((r) => !setOf(r.id));
  const max = shared.reduce((s, r) => s + r.mark.max, 0);
  const score = shared.reduce((s, r) => s + (r.awarded ?? 0), 0);
  // Pending counts every row, practice too: a quiz is fully marked only when everything is.
  const pending = rows.filter((r) => r.awarded === null).length;
  const practice = {};
  for (const r of rows) {
    const set = setOf(r.id);
    if (!set) continue;
    const p = (practice[set] ??= { score: 0, max: 0, pending: 0 });
    p.max += r.mark.max;
    p.score = roundMarks(p.score + (r.awarded ?? 0));
    if (r.awarded === null) p.pending += 1;
  }
  return { rows: rows.map((r) => (setOf(r.id) ? { ...r, set: setOf(r.id) } : r)), score: roundMarks(score), max, pending, practice };
}

/** All of a student's practice as one line: "Practice for you: 3/5". Null with none. */
function practiceTotal(practice) {
  const parts = Object.values(practice ?? {});
  if (!parts.length) return null;
  return parts.reduce((t, p) => ({ score: roundMarks(t.score + p.score), max: t.max + p.max, pending: t.pending + p.pending }), { score: 0, max: 0, pending: 0 });
}
```

- [ ] **Step 4: Pass practice through every reader**

Student `results` in `quizAction`: after `pending: scored.pending,` add `practice: practiceTotal(scored.practice),`. In each mapped row, add `practice: !!r.set,`.

Teacher `attempt`/`mark` reply: after `pending: scored.pending,` add `practice: scored.practice,`. The rows already spread `...r`, so they carry `set`.

Teacher `results` rows: after `pending: scored.pending,` add `practice: scored.practice,`. At the end of the results reply object (the code after the loop that returns `{ published: true, version, … attempts, questions }`), add:

```js
      sets: Object.entries(record.sets ?? {}).map(([id, s]) => ({ id, name: s.name, questions: s.questions.length })),
```

Also make `stats` cover practice questions, so per-question stats exist for them: replace `new Map(record.order.map(` with `new Map([...record.order, ...Object.values(record.sets ?? {}).flatMap((s) => s.questions)].map(`.

`buildInsight`: bump `const INSIGHT_SCHEMA = 1;` to `2` (the saved shape changes). In `attempts.push({ … })`, add `practice: scored.practice,` after `pending`, and in the row map return add `...(r.set ? { set: r.set } : {})`.

`classInsight` return: add after `tutorial_groups`:

```js
    sets: Object.entries(record.sets ?? {}).map(([id, s]) => ({ id, group_id: s.group_id, name: s.name, students: s.students, questions: s.questions.length }))
```

`classQuizScores`: in the `scores[a.student] = { … }` object add `practice: a.practice ?? {},`. In the return object add `...(insight.sets.length ? { sets: insight.sets } : {}),`.

- [ ] **Step 5: Run the tests and check they pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/group-sets-quiz.test.js tests/unit/quiz.test.js tests/unit/tutorial-quiz.test.js tests/unit/markbook.test.js`
Expected: PASS. If an existing test deep-equals a scores object or a results attempt, add the new `practice: {}` / `practice: null` field to its expectation. A quiz without sets has `practice: {}` on scores and `practice: null` on student results.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/quiz.mjs tests/unit/group-sets-quiz.test.js tests/unit/*.test.js
git commit -m "Teaching: group set practice is scored apart from the quiz"
```

---

## Phase 2: Schemas

### Task 5: Section `group_set` field

**Files:**
- Modify: `apps/teaching/src/schemas/block.ts` (section content, ~line 1866)
- Regenerate: `netlify/functions/_shared/teaching-block-schema.mjs`
- Test: `apps/teaching/tests/unit/group-set-schema.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/group-set-schema.test.ts
import { describe, expect, it } from 'vitest';
import { BlockSchema } from '@/schemas/block';

const section = (group_set: unknown) => ({
  id: 's1', type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher',
  content: { title: 'Practice', blocks: [], group_set }
});

describe('section group_set', () => {
  it('accepts a group set', () => {
    const ok = BlockSchema.safeParse(section({ group_id: 'grp0000001', class_id: 'class1', name: 'Repetition', tags: ['fam:repetition'], students: ['st_ann'], target: 5 }));
    expect(ok.success).toBe(true);
  });
  it('refuses a target over 10 and more than 60 students', () => {
    expect(BlockSchema.safeParse(section({ group_id: 'g', class_id: 'c', name: 'R', tags: ['fam:x'], students: [], target: 11 })).success).toBe(false);
    const many = Array.from({ length: 61 }, (_, i) => `st_${i}`);
    expect(BlockSchema.safeParse(section({ group_id: 'g', class_id: 'c', name: 'R', tags: ['fam:x'], students: many, target: 3 })).success).toBe(false);
  });
});
```

Before running, check how `BlockSchema` is exported: `grep -n "^export const BlockSchema\|^export const LessonBlockSchema" apps/teaching/src/schemas/block.ts`. Use whichever name parses a single top-level block.

- [ ] **Step 2: Run the test and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/group-set-schema.test.ts`
Expected: FAIL. The first case fails because zod strips the unknown key or the parse refuses it. If zod strips unknown keys and the first case passes, add `expect(ok.data.content.group_set).toBeDefined()` so it fails.

- [ ] **Step 3: Add the field**

Above `SectionBlockObjectSchema`:

```ts
/** A quiz section holding practice questions for one saved markbook group (see group-sets.mjs). */
export const GroupSetSchema = z.object({
  group_id: z.string().min(1).max(64),
  class_id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  tags: z.array(z.string().min(1).max(120)).min(1).max(8),
  students: z.array(z.string().min(1).max(64)).max(60),
  target: z.number().int().min(1).max(10)
});
export type GroupSet = z.infer<typeof GroupSetSchema>;
```

In the section `content` object, after `sprint_phase`:

```ts
    /** Quiz: this top-level section is a group set, practice for one markbook group's students only. */
    group_set: GroupSetSchema.optional()
```

- [ ] **Step 4: Regenerate and test**

Run: `node scripts/generate-alchemy-schema.mjs && cd apps/teaching && npx vitest run tests/unit/group-set-schema.test.ts`
Expected: PASS. `git diff --stat` shows `teaching-block-schema.mjs` and `teaching-ai-runtime.mjs` changed. If the runtime freshness test complains, also run `node scripts/generate-teaching-ai-runtime.mjs`.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/schemas/block.ts apps/teaching/tests/unit/group-set-schema.test.ts netlify/functions/_shared/*.mjs
git commit -m "Teaching: section group_set field"
```

### Task 6: Markbook groups and history schema

**Files:**
- Modify: `apps/teaching/src/markbook/schema.ts`
- Regenerate: `netlify/functions/_shared/markbook-schema.mjs`
- Test: `apps/teaching/tests/unit/markbook-groups-schema.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/markbook-groups-schema.test.ts
import { describe, expect, it } from 'vitest';
import { MarkbookSchema } from '@/markbook/schema';

const group = {
  id: 'grp0000001', name: 'Repetition', tags: ['fam:repetition'], started: '2026-10-14', retired: null,
  members: [{ student: 'st_ann', joined: '2026-10-14', left: null, why_joined: 'Week 2 pre-test: 1/4 on repetition', why_left: null }]
};
const joined = { id: 'joined:grp0000001:st_ann:2026-10-14', kind: 'joined', group: 'grp0000001', name: 'Repetition', tags: ['fam:repetition'], student: 'st_ann', day: '2026-10-14', why: 'Week 2 pre-test: 1/4 on repetition' };

describe('markbook groups and history', () => {
  it('defaults to none', () => {
    const book = MarkbookSchema.parse({});
    expect(book.groups).toEqual([]);
    expect(book.history).toEqual([]);
  });
  it('keeps a group and its events', () => {
    const book = MarkbookSchema.parse({ groups: [group], history: [joined, { ...joined, id: 'result:grp0000001:st_ann:quiz1', kind: 'result', source: 'quiz:quiz1', title: 'Week 3 review', score: 3, max: 5, why: undefined }] });
    expect(book.groups[0]?.members[0]?.student).toBe('st_ann');
    expect(book.history).toHaveLength(2);
  });
  it('refuses an unknown event kind', () => {
    expect(MarkbookSchema.safeParse({ history: [{ ...joined, kind: 'moved' }] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-groups-schema.test.ts`
Expected: FAIL, `book.groups` is undefined.

- [ ] **Step 3: Add the schemas**

In `MARKBOOK_LIMITS`, add `groups: 100, members: 60, history: 3000, why: 200`.

After `CheckMarkSchema`:

```ts
const Why = z.string().trim().max(MARKBOOK_LIMITS.why);
export const GroupMemberSchema = z.object({ student: z.string().min(1).max(64), joined: Day, left: Day.nullable().default(null), why_joined: Why.default(''), why_left: Why.nullable().default(null) });
/** A saved group: students behind on the same tags. Members leave on evidence; the group retires when none are left. */
export const SavedGroupSchema = z.object({
  id: MarkbookIdSchema,
  name: z.string().trim().min(1).max(MARKBOOK_LIMITS.title),
  tags: z.array(z.string().min(1).max(120)).min(1).max(8),
  started: Day,
  retired: Day.nullable().default(null),
  members: z.array(GroupMemberSchema).max(MARKBOOK_LIMITS.members)
});
const EventBase = { id: z.string().min(1).max(200), group: MarkbookIdSchema, name: z.string().max(MARKBOOK_LIMITS.title), tags: z.array(z.string().max(120)).max(8), day: Day };
/** Written once and kept: what happened to whom, for interviews and records. */
export const HistoryEventSchema = z.discriminatedUnion('kind', [
  z.object({ ...EventBase, kind: z.literal('joined'), student: z.string().min(1).max(64), why: Why }),
  z.object({ ...EventBase, kind: z.literal('received'), student: z.string().min(1).max(64), source: z.string().max(120), title: z.string().max(MARKBOOK_LIMITS.title), questions: z.number().int().min(0).max(50) }),
  z.object({ ...EventBase, kind: z.literal('result'), student: z.string().min(1).max(64), source: z.string().max(120), title: z.string().max(MARKBOOK_LIMITS.title), score: z.number().min(0), max: z.number().min(0) }),
  z.object({ ...EventBase, kind: z.literal('left'), student: z.string().min(1).max(64), why: Why }),
  z.object({ ...EventBase, kind: z.literal('retired') })
]);
```

In `MarkbookSchema`, before `updated_at`:

```ts
  /** Saved groups (Next steps, quiz group sets). */
  groups: z.array(SavedGroupSchema).max(MARKBOOK_LIMITS.groups).default([]),
  /** Group history, appended and never recomputed. */
  history: z.array(HistoryEventSchema).max(MARKBOOK_LIMITS.history).default([]),
```

Export the types:

```ts
export type SavedGroup = z.infer<typeof SavedGroupSchema>;
export type GroupMember = z.infer<typeof GroupMemberSchema>;
export type HistoryEvent = z.infer<typeof HistoryEventSchema>;
```

- [ ] **Step 4: Regenerate and test**

Run: `node scripts/generate-alchemy-schema.mjs && cd apps/teaching && npx vitest run tests/unit/markbook-groups-schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/markbook/schema.ts apps/teaching/tests/unit/markbook-groups-schema.test.ts netlify/functions/_shared/markbook-schema.mjs
git commit -m "Teaching: markbook saved groups and history schema"
```

---

## Phase 3: Markbook server

### Task 7: Group actions and history writes

**Files:**
- Modify: `netlify/functions/_shared/markbook.mjs`
- Test: `tests/unit/markbook-groups.test.js` (new)

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/markbook-groups.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { markbookAction } from '../../netlify/functions/_shared/markbook.mjs';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  const etags = new Map();
  let n = 0;
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: etags.get(key) ?? 'e0' } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      if (options?.onlyIfMatch && (etags.get(key) ?? 'e0') !== options.onlyIfMatch) return { modified: false };
      data.set(key, structuredClone(value)); etags.set(key, `e${++n}`); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

async function setup() {
  const store = storeFixture([['classes/class1', { id: 'class1', type: 'class', title: '7B', active_unit_ids: [], students: [{ name: 'Ann Bell' }, { name: 'Cy Dale' }, { name: 'Ed Fox' }] }]]);
  const roster = await loadRoster(store, 'class1');
  const [ann, cy, ed] = roster.students.map((s) => s.id);
  return { store, ann, cy, ed, call: (body) => markbookAction(store, 'class1', body) };
}
const NOW = '2026-10-24';

test('save_group stores the group and a joined event per member', async () => {
  const { call, ann, cy } = await setup();
  const { markbook } = await call({ action: 'save_group', today: NOW, group: { id: 'grp0000001', name: 'Repetition', tags: ['fam:repetition'], members: [{ student: ann, why: 'Pre-test: 1/4' }, { student: cy, why: 'Pre-test: 0/4' }] } });
  assert.equal(markbook.groups.length, 1);
  assert.equal(markbook.groups[0].started, NOW);
  assert.deepEqual(markbook.groups[0].members.map((m) => [m.student, m.joined, m.left]), [[ann, NOW, null], [cy, NOW, null]]);
  assert.deepEqual(markbook.history.map((e) => [e.kind, e.student, e.why]), [['joined', ann, 'Pre-test: 1/4'], ['joined', cy, 'Pre-test: 0/4']]);
});

test('save_group refuses a student off the list and an empty group', async () => {
  const { call } = await setup();
  await assert.rejects(call({ action: 'save_group', today: NOW, group: { id: 'grp0000001', name: 'R', tags: ['fam:x'], members: [{ student: 'nobody', why: '' }] } }), { code: 'not_found' });
  await assert.rejects(call({ action: 'save_group', today: NOW, group: { id: 'grp0000001', name: 'R', tags: ['fam:x'], members: [] } }), { code: 'bad_request' });
});

test('add_members joins new students today and rejoins one who left', async () => {
  const { call, ann, cy, ed } = await setup();
  await call({ action: 'save_group', today: '2026-10-14', group: { id: 'grp0000001', name: 'R', tags: ['fam:x'], members: [{ student: ann, why: 'a' }, { student: cy, why: 'c' }] } });
  await call({ action: 'record_history', events: [], leaves: [{ group_id: 'grp0000001', student: cy, day: '2026-10-20', why: 'Quiz: 2/2' }] });
  const { markbook } = await call({ action: 'add_members', today: NOW, group_id: 'grp0000001', members: [{ student: ed, why: 'e' }, { student: cy, why: 'c again' }, { student: ann, why: 'already in' }] });
  const m = Object.fromEntries(markbook.groups[0].members.map((x) => [x.student, x]));
  assert.equal(m[ed].joined, NOW);
  assert.equal(m[cy].left, null);
  assert.equal(m[cy].joined, NOW);
  assert.equal(m[ann].joined, '2026-10-14', 'a current member is left alone');
  assert.equal(markbook.history.filter((e) => e.kind === 'joined').length, 4);
});

test('record_history dedupes by id, applies leaves, and retires an empty group', async () => {
  const { call, ann } = await setup();
  await call({ action: 'save_group', today: '2026-10-14', group: { id: 'grp0000001', name: 'R', tags: ['fam:x'], members: [{ student: ann, why: 'a' }] } });
  const received = { id: `received:grp0000001:${ann}:quiz1`, kind: 'received', group: 'grp0000001', name: 'R', tags: ['fam:x'], student: ann, day: '2026-10-24', source: 'quiz:quiz1', title: 'Week 3 review', questions: 5 };
  await call({ action: 'record_history', events: [received], leaves: [] });
  await call({ action: 'record_history', events: [received], leaves: [] });
  const { markbook } = await call({ action: 'record_history', events: [], leaves: [{ group_id: 'grp0000001', student: ann, day: '2026-10-31', why: 'Week 4 quiz: 2/2' }] });
  assert.equal(markbook.history.filter((e) => e.kind === 'received').length, 1);
  assert.equal(markbook.groups[0].members[0].left, '2026-10-31');
  assert.equal(markbook.groups[0].members[0].why_left, 'Week 4 quiz: 2/2');
  assert.equal(markbook.groups[0].retired, '2026-10-31');
  assert.deepEqual(markbook.history.slice(-2).map((e) => e.kind), ['left', 'retired']);
});

test('a second leave for the same member is ignored', async () => {
  const { call, ann, cy } = await setup();
  await call({ action: 'save_group', today: '2026-10-14', group: { id: 'grp0000001', name: 'R', tags: ['fam:x'], members: [{ student: ann, why: 'a' }, { student: cy, why: 'c' }] } });
  await call({ action: 'record_history', events: [], leaves: [{ group_id: 'grp0000001', student: ann, day: '2026-10-20', why: 'x' }] });
  const { markbook } = await call({ action: 'record_history', events: [], leaves: [{ group_id: 'grp0000001', student: ann, day: '2026-10-25', why: 'y' }] });
  assert.equal(markbook.groups[0].members.find((m) => m.student === ann).left, '2026-10-20');
  assert.equal(markbook.history.filter((e) => e.kind === 'left').length, 1);
});

test('remove_member records a teacher removal; rename_group renames', async () => {
  const { call, ann, cy } = await setup();
  await call({ action: 'save_group', today: '2026-10-14', group: { id: 'grp0000001', name: 'R', tags: ['fam:x'], members: [{ student: ann, why: 'a' }, { student: cy, why: 'c' }] } });
  await call({ action: 'remove_member', today: NOW, group_id: 'grp0000001', student: cy });
  const { markbook } = await call({ action: 'rename_group', group_id: 'grp0000001', name: 'Repetitive techniques' });
  const cyM = markbook.groups[0].members.find((m) => m.student === cy);
  assert.equal(cyM.left, NOW);
  assert.equal(cyM.why_left, 'Removed by teacher');
  assert.equal(markbook.groups[0].name, 'Repetitive techniques');
  assert.equal(markbook.history.find((e) => e.kind === 'left').name, 'R', 'history keeps the name at the time');
});
```

- [ ] **Step 2: Run the test and check it fails**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/markbook-groups.test.js`
Expected: FAIL with `bad_action`.

- [ ] **Step 3: Add the actions**

In `markbook.mjs`, add above `markbookAction`:

```js
const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The teacher's Sydney day, sent by the browser; the server's when missing or malformed. */
const dayOf = (body) => (typeof body.today === 'string' && DAY.test(body.today) ? body.today : sydneyDay(new Date().toISOString()));
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const eventBase = (group, day) => ({ group: group.id, name: group.name, tags: group.tags, day });

/** Members to add: on the list, once each. */
function cleanMembers(roster, list) {
  const onList = new Set(roster.students.map((s) => s.id));
  const seen = new Set();
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || typeof m.student !== 'string' || seen.has(m.student)) continue;
    if (!onList.has(m.student)) reject(404, 'not_found', 'That student isn’t on the class list.');
    seen.add(m.student);
    out.push({ student: m.student, why: text(m.why, 200) });
  }
  return out;
}

/** Adds or rejoins members, writing a joined event for each one that changed. */
function joinMembers(book, group, members, day) {
  for (const m of members) {
    const at = group.members.findIndex((x) => x.student === m.student);
    if (at >= 0 && group.members[at].left === null) continue;
    const member = { student: m.student, joined: day, left: null, why_joined: m.why, why_left: null };
    if (at >= 0) group.members[at] = member;
    else group.members.push(member);
    group.retired = null;
    book.history.push({ id: `joined:${group.id}:${m.student}:${day}`, kind: 'joined', ...eventBase(group, day), student: m.student, why: m.why });
  }
}

/** Marks a member as left; retires the group when nobody is left. Ignores one who already left. */
function leaveMember(book, group, student, day, why) {
  const member = group.members.find((m) => m.student === student);
  if (!member || member.left !== null) return;
  member.left = day;
  member.why_left = why;
  book.history.push({ id: `left:${group.id}:${student}:${day}`, kind: 'left', ...eventBase(group, day), student, why });
  if (group.retired === null && group.members.every((m) => m.left !== null)) {
    group.retired = group.members.reduce((top, m) => (m.left > top ? m.left : top), day);
    book.history.push({ id: `retired:${group.id}:${group.retired}`, kind: 'retired', ...eventBase(group, group.retired) });
  }
}

const findGroup = (book, id) => book.groups.find((g) => g.id === id) ?? reject(404, 'not_found', 'That group is gone.');
```

Inside `markbookAction`, before the final `reject(400, 'bad_action' …)`:

```js
  if (action === 'save_group') {
    const g = body.group ?? {};
    const members = cleanMembers(roster, g.members);
    const tags = Array.isArray(g.tags) ? [...new Set(g.tags.filter((t) => typeof t === 'string' && t.length && t.length <= 120))].slice(0, 8) : [];
    if (!members.length || !tags.length || !text(g.name, 120)) reject(400, 'bad_request', 'A group needs a name, a tag and at least one student.');
    const day = dayOf(body);
    const markbook = await changeBook(store, classId, (book) => {
      if (book.groups.some((x) => x.id === g.id)) reject(409, 'exists', 'That group is already saved.');
      if (book.groups.length >= MARKBOOK_LIMITS.groups) reject(400, 'too_many', 'This markbook has as many groups as it can hold.');
      const group = { id: g.id, name: text(g.name, 120), tags, started: day, retired: null, members: [] };
      book.groups.push(group);
      joinMembers(book, group, members, day);
      return book;
    });
    return { markbook };
  }

  if (action === 'add_members') {
    const members = cleanMembers(roster, body.members);
    const day = dayOf(body);
    const markbook = await changeBook(store, classId, (book) => {
      joinMembers(book, findGroup(book, body.group_id), members, day);
      return book;
    });
    return { markbook };
  }

  if (action === 'remove_member') {
    const day = dayOf(body);
    const markbook = await changeBook(store, classId, (book) => {
      leaveMember(book, findGroup(book, body.group_id), body.student, day, 'Removed by teacher');
      return book;
    });
    return { markbook };
  }

  if (action === 'rename_group') {
    const name = text(body.name, 120);
    if (!name) reject(400, 'bad_request', 'Give the group a name.');
    const markbook = await changeBook(store, classId, (book) => {
      findGroup(book, body.group_id).name = name;
      return book;
    });
    return { markbook };
  }

  if (action === 'record_history') {
    const events = (Array.isArray(body.events) ? body.events : []).slice(0, 500);
    const leaves = (Array.isArray(body.leaves) ? body.leaves : []).slice(0, 200);
    const markbook = await changeBook(store, classId, (book) => {
      const have = new Set(book.history.map((e) => e.id));
      for (const e of events) {
        if (!e || typeof e.id !== 'string' || have.has(e.id) || !['received', 'result'].includes(e.kind)) continue;
        if (!book.groups.some((g) => g.id === e.group)) continue;
        book.history.push(e);
        have.add(e.id);
      }
      for (const l of leaves) {
        const group = book.groups.find((g) => g.id === l?.group_id);
        if (group && typeof l.day === 'string' && DAY.test(l.day)) leaveMember(book, group, l.student, l.day, text(l.why, 200));
      }
      // Oldest first, so the record reads in order.
      book.history.sort((a, b) => a.day.localeCompare(b.day));
      return book;
    });
    return { markbook };
  }
```

`changeBook` parses the result with `MarkbookSchema`, so a malformed `received`/`result` event from the browser makes the write refuse with `bad_request`, and nothing bad is ever stored. That is the right behaviour. `Array.prototype.sort` is stable, so same-day events keep their push order (left before retired).

- [ ] **Step 4: Run the tests and check they pass**

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/markbook-groups.test.js tests/unit/markbook.test.js`
Expected: PASS

- [ ] **Step 5: Pass sets into quiz columns**

In `quizColumns`, add to the mapped object: `...(q.sets ? { sets: q.sets } : {}),`. Append to `tests/unit/markbook-groups.test.js`:

```js
import { quizColumns } from '../../netlify/functions/_shared/markbook.mjs';
import { quizAction } from '../../netlify/functions/_shared/quiz.mjs';
import { unitKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import { setupSets, who } from './helpers/group-sets-fixture.js';

test('quiz columns carry their group sets', async () => {
  const { store } = await setupSets();
  store.data.set(unitKey('u1'), { id: 'u1', lesson_ids: ['quiz1'] });
  await quizAction(store, 'quiz1', { action: 'claim', ...who(1), initials: 'AB' });
  await quizAction(store, 'quiz1', { action: 'start', ...who(1) });
  await quizAction(store, 'quiz1', { action: 'submit', ...who(1), responses: {} });
  const roster = await loadRoster(store, 'class1');
  const cols = await quizColumns(store, roster, { hidden_quizzes: [] });
  assert.deepEqual(cols[0].sets.map((x) => x.id), ['s1', 's2']);
});
```

Run: `node --import ./scripts/test-network-guard.mjs --test tests/unit/markbook-groups.test.js tests/unit/group-sets-quiz.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/markbook.mjs tests/unit/markbook-groups.test.js
git commit -m "Teaching: markbook saves groups and writes their history"
```

---

## Phase 4: Client logic

### Task 8: Types and API calls

**Files:**
- Modify: `apps/teaching/src/markbook/types.ts`
- Modify: `apps/teaching/src/markbook/api.ts`

- [ ] **Step 1: Extend the types**

In `types.ts`:

```ts
export type QuizRow = { id: string; awarded: number | null; max: number; confidence: 1 | 2 | 3 | null; outcomes: string[]; codes?: string[]; items?: EvidenceItem[]; set?: string };
export type PracticeScore = { score: number; max: number; pending: number };
export type QuizScore = { attempt_id: string; submitted_at: string; score: number; max: number; pending: number; rows: QuizRow[]; practice?: Record<string, PracticeScore> };
/** A quiz's group set, as the markbook sees it. */
export type QuizSet = { id: string; group_id: string; name: string; students: string[]; questions: number };
```

Add `sets?: QuizSet[];` to `QuizColumn` after `groups`.

- [ ] **Step 2: Add the API calls**

In `api.ts`:

```ts
export type NewMember = { student: string; why: string };
```

Add to `MarkbookApi`:

```ts
  saveGroup: (classId: string, group: { id: string; name: string; tags: string[]; members: NewMember[] }, today: string) => Promise<Markbook>;
  addMembers: (classId: string, groupId: string, members: NewMember[], today: string) => Promise<Markbook>;
  removeMember: (classId: string, groupId: string, student: string, today: string) => Promise<Markbook>;
  renameGroup: (classId: string, groupId: string, name: string) => Promise<Markbook>;
  recordHistory: (classId: string, events: HistoryEvent[], leaves: Array<{ group_id: string; student: string; day: string; why: string }>) => Promise<Markbook>;
```

Add to `httpMarkbookApi`:

```ts
  saveGroup: (classId, group, today) => write(classId, { action: 'save_group', group, today }),
  addMembers: (classId, groupId, members, today) => write(classId, { action: 'add_members', group_id: groupId, members, today }),
  removeMember: (classId, groupId, student, today) => write(classId, { action: 'remove_member', group_id: groupId, student, today }),
  renameGroup: (classId, groupId, name) => write(classId, { action: 'rename_group', group_id: groupId, name }),
  recordHistory: (classId, events, leaves) => write(classId, { action: 'record_history', events, leaves })
```

Import `HistoryEvent` from `./schema`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/teaching && npx tsc --noEmit -p .`
Expected: errors only in test fakes of `MarkbookApi` (they lack the new members). In each fake (`grep -rln "setTook:" apps/teaching/tests`), add the five members as `vi.fn(async () => markbook)` or whatever the fake already returns for `setTook`. Rerun until clean.

- [ ] **Step 4: Commit**

```bash
git add apps/teaching/src/markbook/types.ts apps/teaching/src/markbook/api.ts apps/teaching/tests
git commit -m "Teaching: markbook types and calls for groups"
```

### Task 9: Group logic (leaving, events, flagged students)

**Files:**
- Create: `apps/teaching/src/evidence/groups.ts`
- Test: `apps/teaching/tests/unit/evidence-groups.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/evidence-groups.test.ts
import { describe, expect, it } from 'vitest';
import { activeMembers, flaggedFor, historyEventsFor, joinWhy, leavesFor, overlapsSaved } from '@/evidence/groups';
import type { Evidence } from '@/evidence/types';
import type { SavedGroup } from '@/markbook/schema';
import type { QuizColumn } from '@/markbook/types';

const ev = (student: string, tag: string, share: number, date: string, source = 'quiz:q1', item = `${source}:${Math.random()}`): Evidence => ({ item, tags: [tag], share, why: [], student, source, date, confidence: null });
const group: SavedGroup = {
  id: 'grp0000001', name: 'Repetition', tags: ['fam:repetition'], started: '2026-10-14', retired: null,
  members: [
    { student: 'ann', joined: '2026-10-14', left: null, why_joined: '', why_left: null },
    { student: 'cy', joined: '2026-10-14', left: null, why_joined: '', why_left: null }
  ]
};
const titles = new Map([['quiz:q1', 'Week 2 pre-test'], ['quiz:q2', 'Week 3 review']]);

describe('leavesFor', () => {
  it('a member secure on every tag since joining leaves, dated by the quiz that showed it', () => {
    const evidence = [ev('ann', 'fam:repetition', 0, '2026-10-10'), ev('ann', 'fam:repetition', 1, '2026-10-24', 'quiz:q2'), ev('ann', 'fam:repetition', 1, '2026-10-24', 'quiz:q2'), ev('cy', 'fam:repetition', 0.5, '2026-10-24', 'quiz:q2'), ev('cy', 'fam:repetition', 0.5, '2026-10-24', 'quiz:q2')];
    expect(leavesFor([group], evidence, titles)).toEqual([{ group_id: 'grp0000001', student: 'ann', day: '2026-10-24', why: 'Week 3 review: secure on 2 questions' }]);
  });
  it('evidence from before joining never counts', () => {
    const evidence = [ev('ann', 'fam:repetition', 1, '2026-10-01'), ev('ann', 'fam:repetition', 1, '2026-10-02')];
    expect(leavesFor([group], evidence, titles)).toEqual([]);
  });
  it('one item is not enough', () => {
    expect(leavesFor([group], [ev('ann', 'fam:repetition', 1, '2026-10-24')], titles)).toEqual([]);
  });
  it('needs every tag of the group', () => {
    const two = { ...group, tags: ['tech:anaphora', 'tech:epistrophe'] };
    const evidence = [ev('ann', 'tech:anaphora', 1, '2026-10-24'), ev('ann', 'tech:anaphora', 1, '2026-10-24')];
    expect(leavesFor([two], evidence, titles)).toEqual([]);
  });
  it('skips retired groups and members who left', () => {
    const evidence = [ev('ann', 'fam:repetition', 1, '2026-10-24'), ev('ann', 'fam:repetition', 1, '2026-10-24')];
    expect(leavesFor([{ ...group, retired: '2026-10-20' }], evidence, titles)).toEqual([]);
    const gone = { ...group, members: [{ ...group.members[0]!, left: '2026-10-20' }] };
    expect(leavesFor([gone], evidence, titles)).toEqual([]);
  });
});

describe('historyEventsFor', () => {
  const quiz: QuizColumn = {
    kind: 'quiz', id: 'quiz:q2', lesson_id: 'q2', title: 'Week 3 review', date: '2026-10-24', hidden: false, confidence: false, closed: true, questions: [],
    scores: {
      ann: { attempt_id: 'a', submitted_at: '2026-10-24T01:00:00.000Z', score: 2, max: 3, pending: 0, rows: [], practice: { s1: { score: 3, max: 5, pending: 0 } } },
      cy: { attempt_id: 'c', submitted_at: '2026-10-24T01:00:00.000Z', score: 2, max: 3, pending: 0, rows: [], practice: { s1: { score: 1, max: 5, pending: 1 } } }
    },
    sets: [{ id: 's1', group_id: 'grp0000001', name: 'Repetition', students: ['ann', 'cy', 'ed'], questions: 5 }]
  };
  it('received for each set student who sat it; result once closed and marked', () => {
    const events = historyEventsFor([group], [quiz]);
    expect(events.map((e) => `${e.kind}:${'student' in e ? e.student : ''}`).sort()).toEqual(['received:ann', 'received:cy', 'result:ann']);
    const result = events.find((e) => e.kind === 'result');
    expect(result).toMatchObject({ id: 'result:grp0000001:ann:q2', score: 3, max: 5, source: 'quiz:q2', title: 'Week 3 review', day: '2026-10-24' });
  });
  it('no result while the quiz is open', () => {
    expect(historyEventsFor([group], [{ ...quiz, closed: false }]).some((e) => e.kind === 'result')).toBe(false);
  });
  it('ignores sets for groups that are not saved', () => {
    expect(historyEventsFor([], [quiz])).toEqual([]);
  });
});

describe('flaggedFor, joinWhy, overlapsSaved, activeMembers', () => {
  const evidence = [ev('ed', 'fam:repetition', 0, '2026-10-24', 'quiz:q2'), ev('ed', 'fam:repetition', 0.25, '2026-10-24', 'quiz:q2'), ev('fay', 'fam:repetition', 1, '2026-10-24', 'quiz:q2'), ev('fay', 'fam:repetition', 1, '2026-10-24', 'quiz:q2')];
  it('flags students weak on any of the tags', () => {
    expect(flaggedFor(['fam:repetition'], evidence)).toEqual(['ed']);
  });
  it('says why from the latest quiz on the tag', () => {
    expect(joinWhy('ed', ['fam:repetition'], evidence, titles, (t) => (t === 'fam:repetition' ? 'repetition' : t))).toBe('Week 3 review: 0.3 of 2 on repetition');
  });
  it('a suggestion overlapping a saved group is hidden', () => {
    expect(overlapsSaved(['ann', 'cy'], ['fam:repetition'], [group])).toBe(group);
    expect(overlapsSaved(['ed'], ['fam:repetition'], [group])).toBe(null);
    expect(overlapsSaved(['ann', 'cy'], ['tech:simile'], [group])).toBe(null);
  });
  it('active members are those who have not left', () => {
    expect(activeMembers({ ...group, members: [{ ...group.members[0]!, left: '2026-10-20' }, group.members[1]!] })).toEqual(['cy']);
  });
});
```

- [ ] **Step 2: Run the test and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-groups.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Write `groups.ts`**

```ts
// apps/teaching/src/evidence/groups.ts
import { BANDS, NEXT } from './constants';
import { studentBand } from './patterns';
import type { Evidence } from './types';
import type { HistoryEvent, SavedGroup } from '@/markbook/schema';
import type { QuizColumn } from '@/markbook/types';
import { sydneyDay } from '@/markbook/calc';

/**
 * Saved groups over time: who has shown they are secure (and leaves), what
 * each member received and scored in a quiz's group set, and who the evidence
 * now flags. The markbook writes what these return once; nothing here is stored.
 */

const scored = (list: Evidence[]) => list.filter((e) => e.share !== null);
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export const activeMembers = (group: SavedGroup): string[] => group.members.filter((m) => m.left === null).map((m) => m.student);

/** A random id the markbook schema accepts. */
export function newGroupId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
}

export type Leave = { group_id: string; student: string; day: string; why: string };

/**
 * Members now secure on every one of their group's tags, counting only
 * evidence dated on or after they joined. Secure is the markbook's rule:
 * at least BANDS.groupMin items on the tag, averaging BANDS.secure or more.
 * The day is the latest evidence that showed it.
 */
export function leavesFor(groups: SavedGroup[], evidence: Evidence[], titles: ReadonlyMap<string, string>): Leave[] {
  const out: Leave[] = [];
  for (const group of groups) {
    if (group.retired !== null) continue;
    for (const member of group.members) {
      if (member.left !== null) continue;
      const since = scored(evidence).filter((e) => e.student === member.student && e.date >= member.joined);
      const perTag = group.tags.map((tag) => since.filter((e) => e.tags.includes(tag)));
      const secure = perTag.every((list) => list.length >= BANDS.groupMin && studentBand(avg(list.map((e) => e.share as number))) === 'secure');
      if (!secure) continue;
      const all = perTag.flat();
      const last = all.reduce((top, e) => (e.date > top.date ? e : top), all[0]!);
      const fromLast = all.filter((e) => e.source === last.source).length;
      out.push({ group_id: group.id, student: member.student, day: last.date, why: `${titles.get(last.source) ?? 'Latest marks'}: secure on ${fromLast} ${fromLast === 1 ? 'question' : 'questions'}` });
    }
  }
  return out;
}

/**
 * For each quiz group set naming a saved group: `received` for each set
 * student who handed in, and `result` once the quiz is closed and their
 * practice is fully marked. Ids make the server keep each one once.
 */
export function historyEventsFor(groups: SavedGroup[], quizzes: QuizColumn[]): HistoryEvent[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out: HistoryEvent[] = [];
  for (const quiz of quizzes) {
    for (const set of quiz.sets ?? []) {
      const group = byId.get(set.group_id);
      if (!group) continue;
      const base = { group: group.id, name: group.name, tags: group.tags, source: quiz.id, title: quiz.title };
      for (const student of set.students) {
        const score = quiz.scores[student];
        if (!score) continue;
        const day = sydneyDay(score.submitted_at);
        out.push({ ...base, id: `received:${group.id}:${student}:${quiz.lesson_id}`, kind: 'received', student, day, questions: set.questions });
        const p = score.practice?.[set.id];
        if (quiz.closed && p && p.pending === 0) out.push({ ...base, id: `result:${group.id}:${student}:${quiz.lesson_id}`, kind: 'result', student, day, score: p.score, max: p.max });
      }
    }
  }
  return out;
}

/** Students weak on any of these tags, the same rule Next steps uses for a group. */
export function flaggedFor(tags: string[], evidence: Evidence[]): string[] {
  const out = new Set<string>();
  for (const tag of tags) {
    const byStudent = new Map<string, number[]>();
    for (const e of scored(evidence)) if (e.tags.includes(tag)) byStudent.set(e.student, [...(byStudent.get(e.student) ?? []), e.share as number]);
    for (const [student, shares] of byStudent) if (shares.length >= BANDS.groupMin && studentBand(avg(shares)) === 'weak') out.add(student);
  }
  return [...out].sort();
}

/** Why a student joins: their marks on the tags in the latest quiz or task that has them. */
export function joinWhy(student: string, tags: string[], evidence: Evidence[], titles: ReadonlyMap<string, string>, label: (tag: string) => string): string {
  const mine = scored(evidence).filter((e) => e.student === student && e.tags.some((t) => tags.includes(t)));
  if (!mine.length) return 'Added by teacher';
  const latest = mine.reduce((top, e) => (e.date > top.date ? e : top), mine[0]!).source;
  const fromLatest = mine.filter((e) => e.source === latest);
  const got = Math.round(fromLatest.reduce((s, e) => s + (e.share as number), 0) * 10) / 10;
  return `${titles.get(latest) ?? 'Latest marks'}: ${got} of ${fromLatest.length} on ${tags.map(label).join(', ')}`;
}

/** The saved, active group a suggestion repeats: a shared tag and much the same students. */
export function overlapsSaved(students: string[], tags: string[], groups: SavedGroup[]): SavedGroup | null {
  for (const g of groups) {
    if (g.retired !== null || !g.tags.some((t) => tags.includes(t))) continue;
    const active = activeMembers(g);
    const union = new Set([...active, ...students]).size;
    const shared = students.filter((s) => active.includes(s)).length;
    if (union && shared / union >= NEXT.sameGroup) return g;
  }
  return null;
}
```

Check `joinWhy` against its test. Ed has shares 0 and 0.25, so the total is 0.25, which `Math.round(2.5) / 10` turns into 0.3 (JS rounds half up). The text reads "Week 3 review: 0.3 of 2 on repetition" ✓.

- [ ] **Step 4: Run the test and check it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/evidence-groups.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/evidence/groups.ts apps/teaching/tests/unit/evidence-groups.test.ts
git commit -m "Teaching: group leaving, history events and flagged students"
```

---

## Phase 5: Markbook UI

### Task 10: Sync history on load, and the group actions in the markbook shell

**Files:**
- Modify: `apps/teaching/src/teacher/sections/markbook.ts`
- Test: `apps/teaching/tests/unit/markbook-groups-sync.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Look at how `apps/teaching/tests/unit/markbook-next-steps.test.ts` mounts the markbook with a fake API and `outcomes`, and copy its fake-API builder (`fakeApi(view)`) and its `ctx` stubbing (it mocks `@/evidence/context` with `vi.mock`). Then:

```ts
// apps/teaching/tests/unit/markbook-groups-sync.test.ts
import { describe, expect, it, vi } from 'vitest';
// …copy the imports, the vi.mock of '@/evidence/context' and the fakeApi/view builders from markbook-next-steps.test.ts…

describe('markbook group sync', () => {
  it('writes leaves and quiz events once on load', async () => {
    const view = viewWithSavedGroupAndQuizSet(); // builder below
    const api = fakeApi(view);
    mountMarkbook(document.createElement('div'), cls, { api, today: () => '2026-10-26' });
    await vi.waitFor(() => expect(api.recordHistory).toHaveBeenCalledTimes(1));
    const [, events, leaves] = api.recordHistory.mock.calls[0]!;
    expect(events.map((e: { kind: string }) => e.kind).sort()).toEqual(['received', 'result']);
    expect(leaves).toEqual([{ group_id: 'grp0000001', student: 'st_ann', day: '2026-10-24', why: 'Week 3 review: secure on 2 questions' }]);
  });
  it('does not write when nothing is new', async () => {
    const view = viewWithSavedGroupAndQuizSet({ alreadyRecorded: true });
    const api = fakeApi(view);
    mountMarkbook(document.createElement('div'), cls, { api, today: () => '2026-10-26' });
    await new Promise((r) => setTimeout(r, 50));
    expect(api.recordHistory).not.toHaveBeenCalled();
  });
});
```

Write `viewWithSavedGroupAndQuizSet({ alreadyRecorded })` in the test file. It is a `MarkbookView` whose `markbook.groups` holds the group from Task 9's test with member `st_ann` (joined 2026-10-14), and one closed quiz column `quiz:q2` titled "Week 3 review", dated 2026-10-24. That column has `sets: [{ id: 's1', group_id: 'grp0000001', name: 'Repetition', students: ['st_ann'], questions: 2 }]` and `st_ann`'s score has `practice: { s1: { score: 2, max: 2, pending: 0 } }`, plus two rows with `set: 's1'` and items tagged `fam:repetition` with `share: 1`. When `alreadyRecorded` is set, `markbook.history` already holds the `received` and `result` events with those ids, and the member has `left: '2026-10-24'`.

- [ ] **Step 2: Run the test and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-groups-sync.test.ts`
Expected: FAIL, `recordHistory` is never called.

- [ ] **Step 3: Add the sync**

In `markbook.ts`, import:

```ts
import { historyEventsFor, leavesFor } from '@/evidence/groups';
```

Add inside `mountMarkbook`:

```ts
  /** Quiz and task titles by evidence source, for history wording. */
  function sourceTitles(current: MarkbookView): Map<string, string> {
    const titles = new Map<string, string>();
    for (const q of current.quizzes) titles.set(q.id, q.title);
    for (const c of current.markbook.columns) titles.set(c.id, c.title);
    return titles;
  }

  /** Once per load: write what the evidence now shows about saved groups. The server keeps each event once. */
  let synced = false;
  async function syncGroups(current: MarkbookView, context: InsightContext): Promise<void> {
    if (synced || !current.markbook.groups.length) return;
    synced = true;
    const { evidence } = classEvidence(current, context);
    const have = new Set(current.markbook.history.map((e) => e.id));
    const events = historyEventsFor(current.markbook.groups, current.quizzes).filter((e) => !have.has(e.id));
    const leaves = leavesFor(current.markbook.groups, evidence, sourceTitles(current));
    if (!events.length && !leaves.length) return;
    try {
      const markbook = await api.recordHistory(cls.id, events, leaves);
      if (disposed || !view) return;
      view = { ...view, markbook };
      confirmed = confirmed ? { ...confirmed, markbook } : confirmed;
      paint();
    } catch {
      // The next load tries again; nothing is lost.
      synced = false;
    }
  }
```

Call `void syncGroups(view, ctx)` wherever both `view` and `ctx` first become available. Find the place where `ctx` is set after `loadInsightContext()` resolves and the place where the first `api.load` resolves, and call it after each (it no-ops until both exist and runs only once). Pass `cls.id` the same way other calls in this file do.

- [ ] **Step 4: Add group actions for the views**

In the same file, add:

```ts
  async function saveGroup(current: MarkbookView, context: InsightContext, tags: string[], students: string[]): Promise<void> {
    const { evidence } = classEvidence(current, context);
    const label = (t: string) => tagLabel(t, context);
    const titles = sourceTitles(current);
    const group = { id: newGroupId(), name: tags.map(label).join(' · '), tags, members: students.map((s) => ({ student: s, why: joinWhy(s, tags, evidence, titles, label) })) };
    await writeGroups(() => api.saveGroup(cls.id, group, today()));
  }
  async function addFlagged(current: MarkbookView, context: InsightContext, groupId: string, students: string[]): Promise<void> {
    const group = current.markbook.groups.find((g) => g.id === groupId);
    if (!group) return;
    const { evidence } = classEvidence(current, context);
    const label = (t: string) => tagLabel(t, context);
    const members = students.map((s) => ({ student: s, why: joinWhy(s, group.tags, evidence, sourceTitles(current), label) }));
    await writeGroups(() => api.addMembers(cls.id, groupId, members, today()));
  }
  async function writeGroups(call: () => Promise<Markbook>): Promise<void> {
    try {
      const markbook = await call();
      if (disposed || !view) return;
      view = { ...view, markbook };
      confirmed = confirmed ? { ...confirmed, markbook } : confirmed;
      status.textContent = '';
      paint();
    } catch (error) {
      status.textContent = error instanceof ApiClientError ? error.message : 'That didn’t save. Try again.';
    }
  }
```

Import `newGroupId` and `joinWhy` from `@/evidence/groups`, and `Markbook` is already imported.

- [ ] **Step 5: Run the tests and check they pass**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-groups-sync.test.ts tests/unit/markbook-next-steps.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/teacher/sections/markbook.ts apps/teaching/tests/unit/markbook-groups-sync.test.ts
git commit -m "Teaching: markbook writes group history on load"
```

### Task 11: Next steps: Save group, saved groups, overlap hiding

**Files:**
- Modify: `apps/teaching/src/markbook/next-view.ts`
- Modify: `apps/teaching/src/teacher/sections/markbook.ts` (pass the new actions)
- Modify: `apps/teaching/src/markbook/markbook.css`
- Test: `apps/teaching/tests/unit/markbook-next-steps.test.ts` (append)

- [ ] **Step 1: Write the failing tests (append)**

Use the file's existing view builder, which makes a class with a "group" move on one tag, and add:

```ts
describe('saved groups in Next steps', () => {
  it('a group card offers Save group with its tags and students', () => {
    const saveGroup = vi.fn();
    const root = renderNextSteps(viewWithGroupMove(), students, ctx, newNextState(), { ...actions, saveGroup });
    const btn = root.querySelector<HTMLButtonElement>('.mb-move--group .mb-move__save')!;
    expect(btn.textContent).toBe('Save group');
    btn.click();
    expect(saveGroup).toHaveBeenCalledWith(['tech:anaphora'], expect.arrayContaining(['st_ann']));
  });
  it('a suggestion that repeats a saved group is folded into it with “add?”', () => {
    const view = viewWithGroupMove();
    const saved = { id: 'grp0000001', name: 'Anaphora', tags: ['tech:anaphora'], started: '2026-10-14', retired: null, members: view_groupStudents(view).slice(0, 2).map((s) => ({ student: s, joined: '2026-10-14', left: null, why_joined: '', why_left: null })) };
    const addFlagged = vi.fn();
    const root = renderNextSteps({ ...view, markbook: { ...view.markbook, groups: [saved] } }, students, ctx, newNextState(), { ...actions, saveGroup: vi.fn(), addFlagged });
    expect(root.querySelector('.mb-move--group .mb-move__save')).toBeNull();
    const card = root.querySelector('.mb-saved')!;
    expect(card.textContent).toContain('Anaphora');
    card.querySelector<HTMLButtonElement>('.mb-saved__add')?.click();
    expect(addFlagged).toHaveBeenCalled();
  });
  it('retired groups are not listed', () => {
    const view = viewWithGroupMove();
    const retired = { id: 'grp0000002', name: 'Old', tags: ['tech:simile'], started: '2026-09-01', retired: '2026-10-01', members: [] };
    const root = renderNextSteps({ ...view, markbook: { ...view.markbook, groups: [retired] } }, students, ctx, newNextState(), actions);
    expect(root.querySelector('.mb-saved')).toBeNull();
  });
});
```

Write `view_groupStudents(view)` by running `nextMoves` on the same evidence and returning the group move's students. If the existing builder already exposes the students, use that instead.

- [ ] **Step 2: Run the tests and check they fail**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-next-steps.test.ts`
Expected: FAIL, there is no `.mb-move__save`.

- [ ] **Step 3: Add the controls**

In `NextActions`, add:

```ts
  /** Save a suggested group so it can be targeted and tracked. */
  saveGroup?: (tags: string[], students: string[]) => void;
  /** Add students the evidence now flags to a saved group. */
  addFlagged?: (groupId: string, students: string[]) => void;
```

At the top of `renderNextSteps`, after evidence and moves are computed, add `const saved = view.markbook.groups.filter((g) => g.retired === null);`.

In the move loop, before building a `group` card:

```ts
    if (move.kind === 'group') {
      const tags = move.parts.map((p) => p.tag);
      const same = overlapsSaved(move.students, tags, saved);
      if (same) {
        repeats.set(same.id, [...new Set([...(repeats.get(same.id) ?? []), ...move.students.filter((s) => !activeMembers(same).includes(s))])]);
        continue;
      }
    }
```

Declare `const repeats = new Map<string, string[]>();` before the loop. Inside the `move.kind === 'group'` tools, add:

```ts
    if (move.kind === 'group' && actions.saveGroup) {
      const save = el('button', 'btn btn--secondary mb-move__save', 'Save group');
      save.type = 'button';
      save.addEventListener('click', () => actions.saveGroup?.(move.parts.map((p) => p.tag), move.students));
      tools.append(save);
    }
```

The `continue` skips the shown count, so filter `shown` from the moves the loop actually draws. To keep it simple, build `const drawn = moves.filter((m) => m.kind !== 'group' || !overlapsSaved(m.students, m.parts.map((p) => p.tag), saved));` first, then use `drawn` where `moves` was used for `shown` and the "Show all" count. Fill `repeats` in a separate loop over `moves` before drawing.

After the moves, render saved groups:

```ts
  if (saved.length) {
    const host = el('section', 'mb-saved-list');
    host.append(sectionHead('Saved groups', 'Students leave as their marks show they’re secure.'));
    for (const g of saved) {
      const card = el('article', 'mb-saved');
      card.dataset.group = g.id;
      const active = activeMembers(g);
      card.append(el('h4', 'mb-saved__name', g.name), el('p', 'mb-move__meta', `${g.tags.map(label).join(' · ')} · since ${formatDay(g.started)} · ${active.length} of ${g.members.length} still in`), el('p', 'mb-move__who', names(active)));
      const extra = repeats.get(g.id) ?? [];
      if (extra.length && actions.addFlagged) {
        const add = el('button', 'btn btn--secondary mb-saved__add', `${extra.length} more flagged, add?`);
        add.type = 'button';
        add.addEventListener('click', () => actions.addFlagged?.(g.id, extra));
        card.append(add);
      }
      host.append(card);
    }
    root.append(host);
  }
```

Use the file's existing `names`, `label`, `sectionHead` and `root` names. If the root variable is named differently, use that. Import `overlapsSaved` and `activeMembers` from `@/evidence/groups`, and `formatDay` from `./calc`. Check `sectionHead`'s signature in `@/evidence/views/parts` before calling it. If it takes one argument, put the subtitle in a following `el('p', 'mb__empty', …)`.

In `markbook.ts` `draw()`, pass:

```ts
            saveGroup: (tags, ids) => void saveGroup(current, context, tags, ids),
            addFlagged: (groupId, ids) => void addFlagged(current, context, groupId, ids),
```

CSS in `markbook.css`, following the existing `.mb-move` rules:

```css
.mb-saved-list { display: grid; gap: var(--space-3, 12px); margin-top: var(--space-5, 24px); }
.mb-saved { border: 1px solid var(--line, rgba(0,0,0,.12)); border-radius: var(--radius-md, 10px); padding: var(--space-3, 12px) var(--space-4, 16px); background: var(--surface-soft, transparent); }
.mb-saved__name { margin: 0 0 4px; font-size: 1rem; }
.mb-saved__add { margin-top: 8px; }
```

Before writing these, check `markbook.css` for the real token names used by `.mb-move` and use those exact variables.

- [ ] **Step 4: Run the tests and check they pass**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-next-steps.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/markbook/next-view.ts apps/teaching/src/markbook/markbook.css apps/teaching/src/teacher/sections/markbook.ts apps/teaching/tests/unit/markbook-next-steps.test.ts
git commit -m "Teaching: save groups from Next steps"
```

### Task 12: History view

**Files:**
- Create: `apps/teaching/src/markbook/history-view.ts`
- Modify: `apps/teaching/src/teacher/sections/markbook.ts` (mode)
- Modify: `apps/teaching/src/markbook/markbook.css`
- Test: `apps/teaching/tests/unit/markbook-history.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/markbook-history.test.ts
import { describe, expect, it } from 'vitest';
import { renderHistory, studentTimeline, newHistoryState } from '@/markbook/history-view';
import type { HistoryEvent, SavedGroup } from '@/markbook/schema';

const g = (id: string, tags: string[], retired: string | null): SavedGroup => ({
  id, name: id === 'grp0000001' ? 'Repetition' : 'Simile', tags, started: '2026-10-14', retired,
  members: [{ student: 'st_ann', joined: '2026-10-14', left: retired, why_joined: 'Pre-test: 1/4', why_left: retired ? 'Week 4 quiz: secure' : null }]
});
const base = { group: 'grp0000001', name: 'Repetition', tags: ['fam:repetition'] };
const history: HistoryEvent[] = [
  { ...base, id: 'j', kind: 'joined', student: 'st_ann', day: '2026-10-14', why: 'Week 2 pre-test: 1 of 4 on repetition' },
  { ...base, id: 'r', kind: 'received', student: 'st_ann', day: '2026-10-24', source: 'quiz:q2', title: 'Week 3 review', questions: 5 },
  { ...base, id: 's', kind: 'result', student: 'st_ann', day: '2026-10-24', source: 'quiz:q2', title: 'Week 3 review', score: 3, max: 5 },
  { ...base, id: 'l', kind: 'left', student: 'st_ann', day: '2026-10-31', why: 'Week 4 quiz: secure on 2 questions' }
];
const names = new Map([['st_ann', 'AB · Ann Bell']]);
const label = (t: string) => t.replace(/^\w+:/, '');

describe('history view', () => {
  it('lists groups filtered by status and tag kind', () => {
    const groups = [g('grp0000001', ['fam:repetition'], null), g('grp0000002', ['tech:simile'], '2026-10-20')];
    const state = newHistoryState();
    const root = renderHistory({ groups, history, names, label, state, repaint: () => {} });
    expect([...root.querySelectorAll('.mb-hist__group')].map((x) => x.querySelector('.mb-hist__name')?.textContent)).toEqual(['Repetition', 'Simile']);
    state.status = 'retired';
    const retired = renderHistory({ groups, history, names, label, state, repaint: () => {} });
    expect(retired.querySelectorAll('.mb-hist__group')).toHaveLength(1);
    state.status = 'all';
    state.kind = 'tech';
    expect(renderHistory({ groups, history, names, label, state, repaint: () => {} }).querySelectorAll('.mb-hist__group')).toHaveLength(1);
  });
  it('a student timeline reads like the record', () => {
    const lines = studentTimeline('st_ann', history).map((x) => x.text);
    expect(lines).toEqual([
      'Repetition: joined 14 Oct (Week 2 pre-test: 1 of 4 on repetition)',
      'Week 3 review, 24 Oct: 5 practice questions, 3/5',
      'Left 31 Oct (Week 4 quiz: secure on 2 questions)'
    ]);
  });
});
```

`received` and `result` for the same quiz fold into one line. A `received` line with no result yet reads "Week 3 review, 24 Oct: 5 practice questions".

- [ ] **Step 2: Run the test and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-history.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Write the view**

```ts
// apps/teaching/src/markbook/history-view.ts
import { el } from '@/quiz/dom';
import { TAG_KINDS, TAG_KIND_LABEL, type TagKind } from '@/evidence/types';
import type { HistoryEvent, SavedGroup } from './schema';
import { formatDay } from './calc';

/**
 * History: every saved group, active and retired, with each member's record —
 * when they joined and why, the practice they received and how they did, and
 * when their marks showed they were secure. Read from the stored events only.
 */

export type HistoryStatus = 'active' | 'retired' | 'all';
export type HistoryState = { status: HistoryStatus; kind: TagKind | 'any'; open: Set<string> };
export const newHistoryState = (): HistoryState => ({ status: 'all', kind: 'any', open: new Set() });

export type HistoryLine = { day: string; text: string; kind: HistoryEvent['kind'] };

/** One student's record, oldest first; a quiz's received and result share a line. */
export function studentTimeline(student: string, history: HistoryEvent[], groupId?: string): HistoryLine[] {
  const mine = history.filter((e) => 'student' in e && e.student === student && (!groupId || e.group === groupId));
  const results = new Map(mine.filter((e) => e.kind === 'result').map((e) => [`${e.group}:${e.source}`, e]));
  const lines: HistoryLine[] = [];
  for (const e of mine) {
    if (e.kind === 'joined') lines.push({ day: e.day, kind: e.kind, text: `${e.name}: joined ${formatDay(e.day)}${e.why ? ` (${e.why})` : ''}` });
    else if (e.kind === 'received') {
      const r = results.get(`${e.group}:${e.source}`);
      const n = `${e.questions} practice ${e.questions === 1 ? 'question' : 'questions'}`;
      lines.push({ day: e.day, kind: e.kind, text: `${e.title}, ${formatDay(e.day)}: ${n}${r && r.kind === 'result' ? `, ${r.score}/${r.max}` : ''}` });
    } else if (e.kind === 'left') lines.push({ day: e.day, kind: e.kind, text: `Left ${formatDay(e.day)}${e.why ? ` (${e.why})` : ''}` });
  }
  return lines;
}

const kindOf = (tag: string): string => tag.slice(0, tag.indexOf(':'));

function pills<T extends string>(label: string, options: Array<[T, string]>, current: T, onPick: (v: T) => void): HTMLElement {
  const group = el('div', 'ev-switch');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  for (const [value, text] of options) {
    const b = el('button', 'ev-switch__pill', text);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(value === current));
    b.addEventListener('click', () => onPick(value));
    group.append(b);
  }
  return group;
}

export type HistoryOptions = {
  groups: SavedGroup[];
  history: HistoryEvent[];
  names: ReadonlyMap<string, string>;
  label: (tag: string) => string;
  state: HistoryState;
  repaint: () => void;
  openStudent?: (studentId: string) => void;
};

export function renderHistory(o: HistoryOptions): HTMLElement {
  const root = el('div', 'mb-hist');
  const { state } = o;
  const bar = el('div', 'mb-hist__bar');
  bar.append(
    pills('Status', [['all', 'All'], ['active', 'Active'], ['retired', 'Retired']], state.status, (v) => {
      state.status = v;
      o.repaint();
    }),
    pills('Tag kind', [['any', 'Any'], ...TAG_KINDS.map((k): [TagKind, string] => [k, TAG_KIND_LABEL[k]])], state.kind, (v) => {
      state.kind = v;
      o.repaint();
    })
  );
  root.append(bar);
  const shown = o.groups
    .filter((g) => (state.status === 'all' ? true : state.status === 'active' ? g.retired === null : g.retired !== null))
    .filter((g) => state.kind === 'any' || g.tags.some((t) => kindOf(t) === state.kind))
    .sort((a, b) => b.started.localeCompare(a.started));
  if (!shown.length) {
    root.append(el('p', 'mb__empty', o.groups.length ? 'No groups match.' : 'Save a group from Next steps to start its history.'));
    return root;
  }
  for (const g of shown) {
    const card = el('article', 'mb-hist__group');
    const left = g.members.filter((m) => m.left !== null).length;
    const head = el('button', 'mb-hist__head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(state.open.has(g.id)));
    head.append(
      el('span', 'mb-hist__name', g.name),
      el('span', 'mb-hist__meta', `${g.tags.map(o.label).join(' · ')} · ${formatDay(g.started)}${g.retired ? `–${formatDay(g.retired)} · retired` : ' · active'} · ${g.members.length} joined · ${left} left`)
    );
    head.addEventListener('click', () => {
      if (state.open.has(g.id)) state.open.delete(g.id);
      else state.open.add(g.id);
      o.repaint();
    });
    card.append(head);
    if (state.open.has(g.id)) {
      const list = el('div', 'mb-hist__members');
      for (const m of g.members) {
        const row = el('div', 'mb-hist__member');
        const who = el('button', 'mb-hist__who', o.names.get(m.student) ?? 'Removed student');
        who.type = 'button';
        who.addEventListener('click', () => o.openStudent?.(m.student));
        const lines = el('ol', 'mb-hist__lines');
        for (const line of studentTimeline(m.student, o.history, g.id)) lines.append(el('li', `mb-hist__line mb-hist__line--${line.kind}`, line.text));
        row.append(who, lines);
        list.append(row);
      }
      card.append(list);
    }
    root.append(card);
  }
  return root;
}
```

Check that `TAG_KINDS` and `TAG_KIND_LABEL` are exported from `@/evidence/types`. They are, at lines 6–7.

- [ ] **Step 4: Add the mode**

In `markbook.ts`: `type Mode = 'next' | 'grid' | 'detail' | 'history';`. Add `['history', 'History']` to `MODES` after Detail. Add `const historyState = newHistoryState();`. In `draw()`, inside `if (mode !== 'grid')` after the context check, add a branch before `else renderPatterns`:

```ts
      else if (mode === 'history')
        body.replaceChildren(
          renderHistory({
            groups: current.markbook.groups,
            history: current.markbook.history,
            names: new Map(current.students.map((s) => [s.id, `${s.initials} · ${s.name}`])),
            label: (t) => tagLabel(t, context),
            state: historyState,
            repaint: paint,
            openStudent: actions.openStudent
          })
        );
```

CSS:

```css
.mb-hist { display: grid; gap: 12px; }
.mb-hist__bar { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.mb-hist__group { border: 1px solid var(--line, rgba(0,0,0,.12)); border-radius: 10px; }
.mb-hist__head { all: unset; box-sizing: border-box; cursor: pointer; display: grid; gap: 2px; width: 100%; padding: 12px 16px; }
.mb-hist__head:focus-visible { outline: 2px solid var(--focus, currentColor); outline-offset: 2px; }
.mb-hist__name { font-weight: 600; }
.mb-hist__meta { font-size: .875rem; opacity: .75; }
.mb-hist__members { display: grid; gap: 12px; padding: 0 16px 12px; }
.mb-hist__member { display: grid; grid-template-columns: minmax(120px, 200px) 1fr; gap: 8px 16px; }
.mb-hist__who { all: unset; cursor: pointer; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
.mb-hist__lines { margin: 0; padding-left: 1.1em; display: grid; gap: 4px; }
.mb-hist__line--left { font-weight: 600; }
@media (max-width: 600px) { .mb-hist__member { grid-template-columns: 1fr; } }
```

Swap in the real tokens from `markbook.css`, as in Task 11.

- [ ] **Step 5: Run the tests and check they pass**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-history.test.ts tests/unit/markbook-next-steps.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/markbook/history-view.ts apps/teaching/src/markbook/markbook.css apps/teaching/src/teacher/sections/markbook.ts apps/teaching/tests/unit/markbook-history.test.ts
git commit -m "Teaching: markbook History view"
```

### Task 13: Student panel History

**Files:**
- Modify: `apps/teaching/src/markbook/student-panel.ts`
- Modify: `apps/teaching/src/teacher/sections/markbook.ts` (pass history)
- Test: `apps/teaching/tests/unit/markbook-panel.test.ts` (append)

- [ ] **Step 1: Write the failing test (append)**

```ts
it('shows the student’s group history, newest group first', () => {
  const body = studentPanelBody({ ...baseOptions, history: [
    { id: 'j', kind: 'joined', group: 'grp0000001', name: 'Repetition', tags: ['fam:repetition'], student: baseOptions.student.id, day: '2026-10-14', why: 'Pre-test: 1 of 4' },
    { id: 'l', kind: 'left', group: 'grp0000001', name: 'Repetition', tags: ['fam:repetition'], student: baseOptions.student.id, day: '2026-10-31', why: 'Week 4 quiz: secure on 2 questions' }
  ] });
  const section = body.querySelector('.mb-panel-history')!;
  expect(section.textContent).toContain('Repetition: joined 14 Oct (Pre-test: 1 of 4)');
  expect(section.textContent).toContain('Left 31 Oct');
});
it('says so when there is no history', () => {
  expect(studentPanelBody({ ...baseOptions, history: [] }).querySelector('.mb-panel-history')?.textContent).toContain('Not in any group yet.');
});
```

Use the test file's existing options object, or `baseOptions` if one exists. If not, build one from the existing test's call.

- [ ] **Step 2: Run the test and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-panel.test.ts`
Expected: FAIL

- [ ] **Step 3: Add the section**

In `StudentPanelOptions`, add `history?: HistoryEvent[];`. At the end of `studentPanelBody`, before `return body`:

```ts
  const history = el('section', 'mb-panel-history');
  history.append(el('h4', 'mb-form__label', 'History'));
  const mine = (o.history ?? []).filter((e) => 'student' in e && e.student === o.student.id);
  const groupIds = [...new Set(mine.map((e) => e.group))].reverse();
  if (!groupIds.length) history.append(el('p', 'mb__empty', 'Not in any group yet.'));
  for (const id of groupIds) {
    const list = el('ol', 'mb-hist__lines');
    for (const line of studentTimeline(o.student.id, mine, id)) list.append(el('li', `mb-hist__line mb-hist__line--${line.kind}`, line.text));
    history.append(list);
  }
  body.append(history);
```

Import `studentTimeline` from `./history-view` and `HistoryEvent` from `./schema`. In `markbook.ts`, where `openStudentPanel` gets its options, add `history: current.markbook.history`. Find the options object by searching for `openStudentPanel(`.

- [ ] **Step 4: Run the tests and check they pass**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/markbook/student-panel.ts apps/teaching/src/teacher/sections/markbook.ts apps/teaching/tests/unit/markbook-panel.test.ts
git commit -m "Teaching: student panel shows group history"
```

### Task 14: Markbook quiz cell shows the practice line

**Files:**
- Modify: the quiz cell renderer (find it with `grep -n "kind === 'quiz'" apps/teaching/src/markbook/cells.ts apps/teaching/src/markbook/grid.ts`)
- Test: `apps/teaching/tests/unit/markbook-grid.test.ts` (append)

- [ ] **Step 1: Write the failing test (append)**

```ts
it('a quiz cell with practice shows a small practice line', () => {
  const view = gridViewWithQuiz({ practice: { s1: { score: 3, max: 5, pending: 0 } } }); // extend the file's quiz builder with an optional practice
  const root = renderGrid(view, view.students, actions, '2026-10-26');
  const cell = root.querySelector('[data-column="quiz:q1"] .mb-cell__practice');
  expect(cell?.textContent).toBe('+3/5');
  expect(cell?.getAttribute('title')).toBe('Practice for their group: 3/5');
});
```

- [ ] **Step 2: Run the test and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-grid.test.ts`
Expected: FAIL

- [ ] **Step 3: Add the line**

In the quiz cell renderer, after the score text is appended:

```ts
  const practice = Object.values(score.practice ?? {});
  if (practice.length) {
    const got = practice.reduce((s, p) => s + p.score, 0);
    const max = practice.reduce((s, p) => s + p.max, 0);
    const line = el('span', 'mb-cell__practice', `+${formatMarks(got)}/${formatMarks(max)}`);
    line.title = `Practice for their group: ${formatMarks(got)}/${formatMarks(max)}`;
    cell.append(line);
  }
```

Use the names the renderer already has (`score`, `cell`). `formatMarks` is in `@/quiz/dom`. CSS: `.mb-cell__practice { display: block; font-size: .75rem; opacity: .7; }`.

- [ ] **Step 4: Run the test and check it passes**

Run: `cd apps/teaching && npx vitest run tests/unit/markbook-grid.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/markbook apps/teaching/tests/unit/markbook-grid.test.ts
git commit -m "Teaching: markbook quiz cells show group practice"
```

---

## Phase 6: Quiz editor

### Task 15: Personalise control in quiz Settings

**Files:**
- Create: `apps/teaching/src/quiz/group-set-picker.ts`
- Modify: `apps/teaching/src/quiz/teacher-panel.ts` (settings view)
- Modify: `apps/teaching/src/quiz/quiz.css`
- Test: `apps/teaching/tests/unit/group-set-picker.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/group-set-picker.test.ts
import { describe, expect, it, vi } from 'vitest';
import { groupChoices, groupSetSection, renderGroupSetPicker } from '@/quiz/group-set-picker';
import type { SavedGroup } from '@/markbook/schema';
import type { Move } from '@/evidence/next-moves';

const saved: SavedGroup = { id: 'grp0000001', name: 'Repetition', tags: ['fam:repetition'], started: '2026-10-14', retired: null, members: [{ student: 'st_ann', joined: '2026-10-14', left: null, why_joined: '', why_left: null }] };
const move: Move = { kind: 'group', tag: 'tech:simile', parts: [{ tag: 'tech:simile', students: ['st_cy', 'st_ed'] }], mean: 0.4, assessed: 8, students: ['st_cy', 'st_ed'], secure: [] };

describe('group set picker', () => {
  it('lists saved groups first, then suggestions not already saved', () => {
    const choices = groupChoices([saved, { ...saved, id: 'grp0000002', retired: '2026-10-20' }], [move]);
    expect(choices.map((c) => [c.kind, c.name, c.students.length])).toEqual([['saved', 'Repetition', 1], ['suggested', 'tech:simile', 2]]);
  });
  it('builds a section marked as a group set with blank-free content', () => {
    const block = groupSetSection('sec0001', { group_id: 'grp0000001', class_id: 'class1', name: 'Repetition', tags: ['fam:repetition'], students: ['st_ann'], target: 5 });
    expect(block.block_type).toBe('section');
    expect(block.content).toMatchObject({ title: 'Practice: Repetition', blocks: [], group_set: { target: 5 } });
  });
  it('Add calls back with the picked group and count', async () => {
    const onAdd = vi.fn();
    const root = renderGroupSetPicker({ classes: [{ id: 'class1', title: '7B' }], load: async () => ({ saved: [saved], moves: [move], label: (t) => t }), onAdd, saveSuggestion: vi.fn() });
    await vi.waitFor(() => expect(root.querySelector('select[name="group"]')).not.toBeNull());
    (root.querySelector('input[name="count"]') as HTMLInputElement).value = '5';
    root.querySelector<HTMLButtonElement>('.qz-gs__add')!.click();
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledWith({ group_id: 'grp0000001', class_id: 'class1', name: 'Repetition', tags: ['fam:repetition'], students: ['st_ann'], target: 5 }));
  });
  it('a suggestion is saved first, then added', async () => {
    const onAdd = vi.fn();
    const saveSuggestion = vi.fn(async () => ({ ...saved, id: 'grp0000009', name: 'Simile', tags: ['tech:simile'], members: [] }));
    const root = renderGroupSetPicker({ classes: [{ id: 'class1', title: '7B' }], load: async () => ({ saved: [], moves: [move], label: (t) => t }), onAdd, saveSuggestion });
    await vi.waitFor(() => expect(root.querySelector('select[name="group"]')).not.toBeNull());
    root.querySelector<HTMLButtonElement>('.qz-gs__add')!.click();
    await vi.waitFor(() => expect(saveSuggestion).toHaveBeenCalledWith('class1', ['tech:simile'], ['st_cy', 'st_ed']));
    await vi.waitFor(() => expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ group_id: 'grp0000009', students: ['st_cy', 'st_ed'] })));
  });
  it('a class with no list says so', async () => {
    const root = renderGroupSetPicker({ classes: [], load: vi.fn(), onAdd: vi.fn(), saveSuggestion: vi.fn() });
    expect(root.textContent).toContain('Group sets need a class with a class list.');
  });
});
```

`groupChoices` shows a suggestion's name as its raw tag in the test because `label` is the identity. The rendered picker uses `label`.

- [ ] **Step 2: Run the test and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/group-set-picker.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Write the picker**

```ts
// apps/teaching/src/quiz/group-set-picker.ts
import type { Block, GroupSet } from '@/schemas/block';
import type { SavedGroup } from '@/markbook/schema';
import type { Move } from '@/evidence/next-moves';
import { activeMembers, overlapsSaved } from '@/evidence/groups';
import { button, el, errorText, labelled, select } from '@/quiz/dom';

/**
 * Personalise, in quiz Settings: add a set of questions for one of the class's
 * groups. Saved groups come first, then the markbook's suggested groups (a
 * suggestion is saved when picked). The set goes on the canvas as a section.
 */

export type GroupChoice = { kind: 'saved' | 'suggested'; key: string; name: string; tags: string[]; students: string[]; group?: SavedGroup };

export function groupChoices(saved: SavedGroup[], moves: Move[], label: (tag: string) => string = (t) => t): GroupChoice[] {
  const active = saved.filter((g) => g.retired === null);
  const out: GroupChoice[] = active.map((g) => ({ kind: 'saved', key: g.id, name: g.name, tags: g.tags, students: activeMembers(g), group: g }));
  for (const m of moves) {
    if (m.kind !== 'group') continue;
    const tags = m.parts.map((p) => p.tag);
    if (overlapsSaved(m.students, tags, active)) continue;
    out.push({ kind: 'suggested', key: `suggest:${tags.join('+')}`, name: tags.map(label).join(' · '), tags, students: m.students });
  }
  return out;
}

export function groupSetSection(id: string, config: GroupSet): Block {
  return { id, type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: `Practice: ${config.name}`, blocks: [], group_set: config } } as Block;
}

export type PickerOptions = {
  classes: Array<{ id: string; title: string }>;
  load: (classId: string) => Promise<{ saved: SavedGroup[]; moves: Move[]; label: (tag: string) => string }>;
  saveSuggestion: (classId: string, tags: string[], students: string[]) => Promise<SavedGroup>;
  onAdd: (config: GroupSet) => void;
};

export function renderGroupSetPicker(o: PickerOptions): HTMLElement {
  const root = el('div', 'qz-gs');
  root.append(el('h4', 'qz-settings__heading', 'Personalise'), el('p', 'qz-note block-secondary', 'Add practice questions for a markbook group. Only that group’s students get them, mixed in with the quiz. They don’t count in the quiz score.'));
  if (!o.classes.length) {
    root.append(el('p', 'qz-note', 'Group sets need a class with a class list. Open Results once to load this unit’s classes.'));
    return root;
  }
  const form = el('div', 'qz-gs__form');
  const status = el('p', 'qz-note');
  root.append(form, status);
  const classPick = select(o.classes.map((c) => ({ value: c.id, label: c.title })), o.classes[0]!.id);
  classPick.name = 'class';
  let choices: GroupChoice[] = [];
  async function fill(): Promise<void> {
    status.textContent = 'Loading groups…';
    try {
      const loaded = await o.load(classPick.value);
      choices = groupChoices(loaded.saved, loaded.moves, loaded.label);
      status.textContent = choices.length ? '' : 'No groups yet. Groups come from the markbook’s Next steps.';
      draw();
    } catch (error) {
      status.textContent = errorText(error);
    }
  }
  function draw(): void {
    const groupPick = select(choices.map((c) => ({ value: c.key, label: `${c.name} · ${c.students.length} ${c.students.length === 1 ? 'student' : 'students'}${c.kind === 'suggested' ? ' (suggested)' : ''}` })), choices[0]?.key ?? '');
    groupPick.name = 'group';
    const count = el('input', 'qz-input qz-gs__count');
    count.type = 'number';
    count.name = 'count';
    count.min = '1';
    count.max = '10';
    count.value = '3';
    const add = button('Add group set', 'btn btn--secondary qz-gs__add');
    add.disabled = !choices.length;
    add.addEventListener('click', async () => {
      const choice = choices.find((c) => c.key === groupPick.value);
      const target = Math.max(1, Math.min(10, Number(count.value) || 3));
      if (!choice) return;
      add.disabled = true;
      try {
        const group = choice.group ?? (await o.saveSuggestion(classPick.value, choice.tags, choice.students));
        o.onAdd({ group_id: group.id, class_id: classPick.value, name: group.name, tags: group.tags, students: choice.students, target });
        status.textContent = `Added a set for ${group.name}. Write its questions on the canvas, or ask Ann.`;
      } catch (error) {
        status.textContent = errorText(error);
      } finally {
        add.disabled = false;
      }
    });
    form.replaceChildren(labelled('Class', classPick), labelled('Group', groupPick), labelled('Questions', count), add);
  }
  classPick.addEventListener('change', () => void fill());
  form.append(labelled('Class', classPick));
  void fill();
  return root;
}
```

Check the signatures of `button`, `labelled`, `select` and `errorText` in `apps/teaching/src/quiz/dom.ts` before using them. `labelled(label, control, note?)` and `select(options, value)` are used this way in teacher-panel.ts. Match `button`'s argument order to its definition.

- [ ] **Step 4: Mount it in quiz Settings**

In `teacher-panel.ts`, add to `QuizPanelOptions`:

```ts
  /** Loads a class's saved groups and suggested group moves, for Personalise. */
  loadGroups?: PickerOptions['load'];
  saveSuggestion?: PickerOptions['saveSuggestion'];
```

In the settings view, after the `for_students` note and before `wrap.append(grid)`, add:

```ts
    if (options.loadGroups && options.saveSuggestion && !raw.for_students?.length) {
      wrap.append(
        renderGroupSetPicker({
          classes: classes ?? [],
          load: options.loadGroups,
          saveSuggestion: options.saveSuggestion,
          onAdd: (config) => options.onAddBlocks([groupSetSection(options.idFactory(), config)])
        })
      );
    }
```

Where `mountQuizPanel` is created (in `mount-page.ts`, search for `mountQuizPanel(`), pass:

```ts
      loadGroups: async (classId) => {
        const [view, context] = await Promise.all([httpMarkbookApi.load(classId), loadInsightContext()]);
        const { evidence } = classEvidence(view, context);
        const kind = moveKind(evidence);
        return { saved: view.markbook.groups, moves: kind ? nextMoves(evidence, kind) : [], label: (t) => tagLabel(t, context) };
      },
      saveSuggestion: async (classId, tags, students) => {
        const context = await loadInsightContext();
        const view = await httpMarkbookApi.load(classId);
        const { evidence } = classEvidence(view, context);
        const label = (t: string) => tagLabel(t, context);
        const titles = new Map(view.quizzes.map((q) => [q.id, q.title]));
        const id = newGroupId();
        const markbook = await httpMarkbookApi.saveGroup(classId, { id, name: tags.map(label).join(' · '), tags, members: students.map((s) => ({ student: s, why: joinWhy(s, tags, evidence, titles, label) })) }, todayInSydney());
        return markbook.groups.find((g) => g.id === id)!;
      },
```

with these imports: `httpMarkbookApi` (`@/markbook/api`), `loadInsightContext` (`@/evidence/context`), `classEvidence` (`@/evidence/class-evidence`), `moveKind`, `nextMoves` (`@/evidence/next-moves`), `tagLabel` (`@/evidence/tags`), `newGroupId`, `joinWhy` (`@/evidence/groups`), `todayInSydney` (`@/markbook/calc`).

`onAddBlocks` appends at the end of the canvas, which is the top level, as a set must be.

CSS (`quiz.css`):

```css
.qz-gs { display: grid; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line, rgba(0,0,0,.12)); }
.qz-gs__form { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: end; }
.qz-gs__count { width: 5em; }
```

- [ ] **Step 5: Run the tests and check they pass**

Run: `cd apps/teaching && npx vitest run tests/unit/group-set-picker.test.ts tests/unit/quiz-panel*.test.ts`
Expected: PASS. If there is no quiz panel test file, run only the first.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/quiz/group-set-picker.ts apps/teaching/src/quiz/teacher-panel.ts apps/teaching/src/quiz/quiz.css apps/teaching/src/teacher/lesson-canvas/mount-page.ts apps/teaching/tests/unit/group-set-picker.test.ts
git commit -m "Teaching: Personalise adds a group set to a quiz"
```

### Task 16: Group set strip on the canvas (Refresh, Write it myself, Ann drafts)

**Files:**
- Create: `apps/teaching/src/quiz/group-set-tools.ts`
- Modify: `apps/teaching/src/teacher/lesson-canvas/mount-page.ts` (`decorateRow`)
- Modify: `apps/teaching/src/quiz/quiz.css`
- Test: `apps/teaching/tests/unit/group-set-tools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/group-set-tools.test.ts
import { describe, expect, it, vi } from 'vitest';
import { blankQuestions, createGroupSetTools, groupSetBrief, refreshedStudents } from '@/quiz/group-set-tools';
import { groupSetSection } from '@/quiz/group-set-picker';
import type { Block } from '@/schemas/block';

const config = { group_id: 'grp0000001', class_id: 'class1', name: 'Repetition', tags: ['fam:repetition'], students: ['st_ann'], target: 3 };

describe('group set tools', () => {
  it('Refresh keeps everyone already in the set and adds active members', () => {
    expect(refreshedStudents(['st_ann'], ['st_cy', 'st_ann'])).toEqual(['st_ann', 'st_cy']);
  });
  it('Write it myself adds `target` blank multiple choice cards', () => {
    const blocks = blankQuestions(3, (() => { let n = 0; return () => `b${++n}`; })());
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toMatchObject({ block_type: 'quiz_question', content: { question: { kind: 'multiple_choice' } } });
  });
  it('the brief names the section, count, tags and keeps the marker', () => {
    const brief = groupSetBrief({ sectionId: 'sec1', config, label: () => 'repetition', lessonTitle: 'Week 3 review', mistakes: ['- Named anaphora as epistrophe (2 students)'] });
    expect(brief).toContain('propose_replace_section');
    expect(brief).toContain('sec1');
    expect(brief).toContain('3 quiz_question');
    expect(brief).toContain('group_set');
    expect(brief).toContain('Named anaphora as epistrophe');
    expect(brief).not.toContain('st_ann');
  });
  it('decorates only group set rows with a header naming the group and members', () => {
    const block = groupSetSection('sec1', config);
    const tools = createGroupSetTools({ getBlocks: () => [block], onBlocks: vi.fn(), idFactory: () => 'x', names: () => new Map([['st_ann', 'AB']]), refreshMembers: vi.fn(), startAnn: vi.fn() });
    const row = document.createElement('div');
    tools.decorate(row, block);
    expect(row.querySelector('.qz-gs-strip')?.textContent).toContain('For Repetition · 1 student');
    expect(row.querySelector('.qz-gs-strip')?.textContent).toContain('AB');
    const plain = document.createElement('div');
    tools.decorate(plain, { ...block, content: { title: 'x', blocks: [] } } as Block);
    expect(plain.querySelector('.qz-gs-strip')).toBeNull();
  });
  it('Ann drafts asks first, with the cost', () => {
    const block = groupSetSection('sec1', config);
    const startAnn = vi.fn();
    const tools = createGroupSetTools({ getBlocks: () => [block], onBlocks: vi.fn(), idFactory: () => 'x', names: () => new Map(), refreshMembers: vi.fn(), startAnn });
    const row = document.createElement('div');
    tools.decorate(row, block);
    row.querySelector<HTMLButtonElement>('.qz-gs-strip__ann')!.click();
    expect(row.textContent).toContain('about A$0.35');
    expect(startAnn).not.toHaveBeenCalled();
    row.querySelector<HTMLButtonElement>('.qz-gs-strip__go')!.click();
    expect(startAnn).toHaveBeenCalledWith('sec1', config);
  });
});
```

- [ ] **Step 2: Run the test and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/group-set-tools.test.ts`
Expected: FAIL, the module is not found.

- [ ] **Step 3: Write the tools**

```ts
// apps/teaching/src/quiz/group-set-tools.ts
import type { Block, GroupSet } from '@/schemas/block';
import { mapBlockById } from '@/blocks/block-pulse';
import { button, el } from '@/quiz/dom';

/**
 * The strip on a group set section: who it is for, Refresh, Write it myself
 * and Ann drafts. It rides on the canvas row like the lecture tools, so the
 * section and its question cards are edited as usual.
 */

/** Ann writing a handful of questions has cost about this much (see the quiz builder runs). */
export const ANN_SET_COST = 'about A$0.35';

const isSet = (block: Block): block is Extract<Block, { block_type: 'section' }> =>
  block.block_type === 'section' && !!(block.content as { group_set?: GroupSet }).group_set;

export const refreshedStudents = (inSet: string[], active: string[]): string[] => [...new Set([...inSet, ...active])];

export function blankQuestions(n: number, idFactory: () => string): Block[] {
  return Array.from({ length: n }, () => {
    const id = idFactory();
    return {
      id, type: 'block', block_type: 'quiz_question', variant: 'medium', visibility: 'student_teacher',
      content: { question: { id, kind: 'multiple_choice', prompt: '', marks: 1, options: [{ id: `${id}a`, text: '' }, { id: `${id}b`, text: '' }], correct: [] } }
    } as Block;
  });
}

export type BriefInput = { sectionId: string; config: GroupSet; label: (tag: string) => string; lessonTitle: string; mistakes: string[] };

/** What Ann is told. No names or initials leave the app. */
export function groupSetBrief(i: BriefInput): string {
  const need = i.config.tags.map(i.label).join(', ');
  return [
    'Go ahead and build without a plan: the teacher has already confirmed this group set.',
    `Fill the group set section ${i.sectionId} in "${i.lessonTitle}" with ${i.config.target} quiz_question blocks for students working on ${need}.`,
    'Use propose_replace_section on that section. Keep its id, its title and its group_set exactly as they are; only replace its blocks.',
    'Write the questions on this lesson’s own texts and content, so they sit naturally among the quiz’s other questions.',
    i.mistakes.length ? `These students made these mistakes:\n${i.mistakes.join('\n')}` : `These students scored low on ${need}.`,
    `Tag every question so its results land on ${i.config.tags.join(', ')}: for a technique use quote_technique or spot_technique with technique_id on the option that names it.`,
    'Keep each question to a single technique or idea.'
  ].join('\n\n');
}

export type GroupSetToolsOptions = {
  getBlocks: () => Block[];
  onBlocks: (blocks: Block[]) => void;
  idFactory: () => string;
  /** Initials by student id, for the strip. */
  names: () => ReadonlyMap<string, string>;
  /** The group's active members now (loads the markbook). */
  refreshMembers: (config: GroupSet) => Promise<string[]> | void;
  startAnn: (sectionId: string, config: GroupSet) => void;
};

export function createGroupSetTools(o: GroupSetToolsOptions) {
  const patchSet = (id: string, fn: (block: Extract<Block, { block_type: 'section' }>) => Block) =>
    o.onBlocks(mapBlockById(o.getBlocks(), id, (b) => (isSet(b) ? fn(b) : b)));

  return {
    decorate(row: HTMLElement, block: Block): void {
      row.querySelector(':scope > .qz-gs-strip')?.remove();
      if (!isSet(block)) return;
      const config = (block.content as { group_set: GroupSet }).group_set;
      const strip = el('div', 'qz-gs-strip');
      const n = config.students.length;
      const who = config.students.map((s) => o.names().get(s) ?? '–').join(', ');
      strip.append(el('p', 'qz-gs-strip__for', `For ${config.name} · ${n} ${n === 1 ? 'student' : 'students'}`), el('p', 'qz-gs-strip__who', who));
      const tools = el('div', 'qz-gs-strip__tools');
      const refresh = button('Refresh', 'btn btn--ghost qz-gs-strip__refresh');
      refresh.addEventListener('click', async () => {
        const active = await o.refreshMembers(config);
        if (!active) return;
        patchSet(block.id, (b) => ({ ...b, content: { ...b.content, group_set: { ...config, students: refreshedStudents(config.students, active) } } }) as Block);
      });
      const have = (block.content.blocks ?? []).filter((b) => b.block_type === 'quiz_question').length;
      const write = button('Write it myself', 'btn btn--ghost qz-gs-strip__write');
      write.disabled = have >= config.target;
      write.addEventListener('click', () =>
        patchSet(block.id, (b) => ({ ...b, content: { ...b.content, blocks: [...(b.content.blocks ?? []), ...blankQuestions(config.target - have, o.idFactory)] } }) as Block)
      );
      const ann = button('Ann drafts', 'btn btn--secondary qz-gs-strip__ann');
      const confirm = el('div', 'qz-gs-strip__confirm');
      confirm.hidden = true;
      ann.addEventListener('click', () => {
        confirm.hidden = false;
        const go = button(`Ann writes ${config.target} (${ANN_SET_COST})`, 'btn btn--primary qz-gs-strip__go');
        go.addEventListener('click', () => {
          confirm.hidden = true;
          o.startAnn(block.id, config);
        });
        const cancel = button('Not now', 'btn btn--ghost');
        cancel.addEventListener('click', () => (confirm.hidden = true));
        confirm.replaceChildren(el('p', 'qz-note', `Ann writes ${config.target} questions on this lesson for ${config.name}, ${ANN_SET_COST}. You review them before publishing.`), go, cancel);
      });
      tools.append(refresh, write, ann);
      strip.append(tools, confirm);
      row.prepend(strip);
    }
  };
}
```

Check `mapBlockById`'s signature in `@/blocks/block-pulse` (used by `lecture/editor-tools.ts` as `mapBlockById(blocks, id, fn)`). Check `button`'s argument order in `@/quiz/dom`.

- [ ] **Step 4: Wire it into the canvas**

In `mount-page.ts`, next to `lectureTools`:

```ts
  let rosterNames = new Map<string, string>();
  const groupSetTools = createGroupSetTools({
    getBlocks: () => lesson.blocks,
    onBlocks: (blocks) => {
      emitLesson({ ...lesson, blocks });
      canvas.update(blocks, media);
    },
    idFactory: options.idFactory,
    names: () => rosterNames,
    refreshMembers: async (config) => {
      const view = await httpMarkbookApi.load(config.class_id);
      rosterNames = new Map(view.students.map((s) => [s.id, s.initials]));
      const group = view.markbook.groups.find((g) => g.id === config.group_id);
      return group ? activeMembers(group) : [];
    },
    startAnn: (sectionId, config) => {
      void (async () => {
        const context = await loadInsightContext();
        const view = await httpMarkbookApi.load(config.class_id);
        const { evidence } = classEvidence(view, context);
        const label = (t: string) => tagLabel(t, context);
        const inGroup = new Set(config.students);
        const mistakes = config.tags.flatMap((tag) =>
          mixUps(evidence.filter((e) => inGroup.has(e.student) && e.tags.includes(tag)), tag.slice(0, tag.indexOf(':')) as TagKind)
            .slice(0, 3)
            .map((m) => `- ${mixUpText(m, label, (id) => codeLabel(id, context))} (${m.count} ${m.count === 1 ? 'student' : 'students'})`)
        );
        await startAnn(lesson.id, groupSetBrief({ sectionId, config, label, lessonTitle: lesson.title, mistakes }));
      })().catch((error) => showCanvasError(error));
    }
  });
```

Use this file's existing way of showing an error. Search for how `lectureTools` or the quiz panel surface errors and use that in place of `showCanvasError`. `startAnn(lessonId, brief)` is exported from `@/evidence/follow-up`. `mixUps` is in `@/evidence/patterns`, `mixUpText` in `@/evidence/views/parts`, and `codeLabel` in `@/evidence/context` (check its signature). In `decorateRow`, after `lectureTools.decorate(row, block);`, add `if (resolvePedagogicalMode(lesson.pedagogical_mode) === 'quiz') groupSetTools.decorate(row, block);`.

To show initials before the first Refresh, load names once when the quiz panel mounts and the lesson has a group set. Call `refreshMembers(firstSet.group_set)` and ignore the result, which fills `rosterNames`, then `canvas.update(lesson.blocks, media)`.

CSS:

```css
.qz-gs-strip { display: grid; gap: 4px; margin-bottom: 8px; padding: 8px 12px; border-radius: 10px; background: var(--tint-practice, color-mix(in srgb, var(--accent, #5b7) 10%, transparent)); }
.qz-gs-strip__for { margin: 0; font-weight: 600; }
.qz-gs-strip__who { margin: 0; font-size: .875rem; opacity: .75; }
.qz-gs-strip__tools, .qz-gs-strip__confirm { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
```

Before writing the tint, check `quiz.css` for an existing accent token and use it.

- [ ] **Step 5: Run the tests and check they pass**

Run: `cd apps/teaching && npx vitest run tests/unit/group-set-tools.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/quiz/group-set-tools.ts apps/teaching/src/quiz/quiz.css apps/teaching/src/teacher/lesson-canvas/mount-page.ts apps/teaching/tests/unit/group-set-tools.test.ts
git commit -m "Teaching: group set strip with Refresh, Write it myself and Ann drafts"
```

### Task 17: Ann fills a group set and keeps its marker

**Files:**
- Modify: `apps/teaching/src/ai/apply-proposal.ts` (`keepTutorialMarkers`)
- Modify: `apps/teaching/src/ai/block-recipes.ts` (one paragraph)
- Test: `apps/teaching/tests/unit/ai-apply-group-set.test.ts` (new)

- [ ] **Step 1: Write the failing test**

```ts
// apps/teaching/tests/unit/ai-apply-group-set.test.ts
import { describe, expect, it } from 'vitest';
import { applyProposalToLesson } from '@/ai/apply-proposal';
import { groupSetSection } from '@/quiz/group-set-picker';

const config = { group_id: 'grp0000001', class_id: 'class1', name: 'Repetition', tags: ['fam:repetition'], students: ['st_ann'], target: 2 };

describe('Ann and group sets', () => {
  it('a replaced group set keeps its group_set even if the proposal drops it', () => {
    const lesson = { id: 'l1', title: 'Week 3 review', pedagogical_mode: 'quiz', blocks: [groupSetSection('sec1', config)] } as never;
    const proposal = { kind: 'replace_section', section_id: 'sec1', section: { id: 'sec1', type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { title: 'Practice: Repetition', blocks: [] } } } as never;
    const out = applyProposalToLesson(lesson, proposal, () => 'n1');
    expect(out.ok).toBe(true);
    if (out.ok) expect((out.lesson.blocks[0] as { content: { group_set?: unknown } }).content.group_set).toEqual(config);
  });
});
```

Before writing this test, check the real `replace_section` proposal shape in `apps/teaching/src/ai/proposals.ts` (field names for the section id and the new section). Then adjust the `proposal` literal to match.

- [ ] **Step 2: Run the test and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/ai-apply-group-set.test.ts`
Expected: FAIL, `group_set` is undefined.

- [ ] **Step 3: Keep the marker**

Rename `keepTutorialMarkers` to `keepSectionMarkers` (update its callers) and extend it:

```ts
/** A redrafted tutorial tab, exit check or group set stays what it was, even if the proposal dropped the markers. */
function keepSectionMarkers(old: Block, next: Block): Block {
  if (old.block_type !== 'section' || next.block_type !== 'section') return next;
  const was = old.content as { tutorial_group?: string; tutorial_exit?: boolean; group_set?: unknown };
  if (was.tutorial_group === undefined && was.group_set === undefined) return next;
  const content = { ...next.content } as typeof next.content & { group_set?: unknown };
  if (was.tutorial_group !== undefined && content.tutorial_group === undefined) content.tutorial_group = was.tutorial_group;
  if (was.tutorial_exit !== undefined && content.tutorial_exit === undefined) content.tutorial_exit = was.tutorial_exit;
  // A group set's group and students are the teacher's: Ann never changes them.
  if (was.group_set !== undefined) content.group_set = was.group_set as never;
  return { ...next, content } as Block;
}
```

In `block-recipes.ts`, after the Tutorials paragraph, add:

```
## Group sets
A quiz may hold group sets: top-level sections with group_set { group_id, class_id, name, tags, students, target }. Only that group's students get a set's questions, mixed in with the quiz. To fill one, use propose_replace_section on it, keeping its id, title and group_set exactly; put target quiz_question blocks inside, written on the lesson's own content and tagged so results land on the set's tags. Never add a group set yourself and never move quiz questions into or out of one.
```

Regenerate the AI runtime, because the recipes are bundled: `node scripts/generate-teaching-ai-runtime.mjs`.

- [ ] **Step 4: Run the tests and check they pass**

Run: `cd apps/teaching && npx vitest run tests/unit/ai-apply-group-set.test.ts tests/unit/ai-*.test.ts`
Expected: PASS. If a test asserts a frozen static prompt (the cache test from PR 1011), it should still pass, because only the text changed and the test checks the prompt is identical between calls. If a snapshot of the prompt exists, update it.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/ai netlify/functions/_shared/teaching-ai-runtime.mjs apps/teaching/tests/unit/ai-apply-group-set.test.ts
git commit -m "Teaching: Ann fills group sets and keeps their marker"
```

---

## Phase 7: Student and teacher results UI

### Task 18: Student sees "Practice for you"

**Files:**
- Modify: `apps/teaching/src/quiz/student-quiz.ts` (`Status`/`Current` types; question bar ~line 330; result view)
- Modify: `apps/teaching/src/quiz/quiz.css`
- Test: `apps/teaching/tests/unit/student-quiz-practice.test.ts` (new)

- [ ] **Step 1: Write the failing test**

Copy the mount-with-fake-fetch setup from the closest existing student quiz test (`ls apps/teaching/tests/unit | grep -i student-quiz`). Then:

```ts
it('a practice question shows the chip; others do not', async () => {
  const root = await mountWith({ current: { …current, questions: [q('q1'), q('p1')], practice: ['p1'] }, practice: ['p1'] });
  expect(root.querySelector('.qz-practice')).toBeNull(); // q1 first
  root.querySelector<HTMLButtonElement>('.qz-dot[data-index="1"], .qz-dots li:nth-child(2) button')!.click();
  expect(root.querySelector('.qz-practice')?.textContent).toBe('Practice for you');
});
it('the result shows the practice line', async () => {
  const root = await mountWith({ results: [{ …result, score: 2, max: 3, practice: { score: 3, max: 5, pending: 0 } }] });
  expect(root.textContent).toContain('Practice for you: 3/5');
});
```

`q(id)` is the file's public question builder. Click the second dot whichever way the existing tests navigate between questions.

- [ ] **Step 2: Run the test and check it fails**

Run: `cd apps/teaching && npx vitest run tests/unit/student-quiz-practice.test.ts`
Expected: FAIL

- [ ] **Step 3: Add the chip and the line**

Add `practice?: string[]` to the `Status` and `Current` types. Keep a set alongside `questions`:

```ts
  let practice = new Set<string>();
```

In `call()`, after `useQuestions(...)`, add `practice = new Set(next.current?.practice ?? next.practice ?? []);`.

In the taking view, after `bar.append(el('span', 'qz-taking__where', …))`:

```ts
    if (practice.has(id)) {
      const chip = el('span', 'qz-practice', 'Practice for you');
      chip.prepend(practiceIcon());
      bar.append(chip);
    }
```

Add at the bottom of the file:

```ts
/** Two strands crossing: the interleaved mark on a practice question. */
function practiceIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('qz-practice__icon');
  for (const d of ['M2 4c4 0 8 8 12 8', 'M2 12c4 0 8-8 12-8']) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}
```

"Question X of Y" should count all questions the student answers, so it stays `d.order.length`.

Where a result's score is shown (search for `result.score` or `r.score` in the result view), add after it:

```ts
    if (r.practice) wrap.append(el('p', 'qz-result__practice', `Practice for you: ${formatMarks(r.practice.score)}/${formatMarks(r.practice.max)}${r.practice.pending ? ' (some still to mark)' : ''}`));
```

In review rows, a row with `practice: true` gets the same chip next to its prompt.

CSS:

```css
.qz-practice { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; font-size: .8125rem; background: color-mix(in srgb, var(--accent, #5b7) 14%, transparent); }
.qz-practice__icon { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
.qz-result__practice { margin: 4px 0 0; }
```

- [ ] **Step 4: Run the tests and check they pass**

Run: `cd apps/teaching && npx vitest run tests/unit/student-quiz-practice.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/quiz/student-quiz.ts apps/teaching/src/quiz/quiz.css apps/teaching/tests/unit/student-quiz-practice.test.ts
git commit -m "Teaching: students see Practice for you on group set questions"
```

### Task 19: Teacher Results show each set

**Files:**
- Modify: `apps/teaching/src/quiz/teacher-panel.ts` (types `AttemptSummary`, `Results`, results table, attempt detail)
- Test: append to the closest existing quiz panel results test (`grep -ln "resultsView\|qz-results" apps/teaching/tests/unit`)

- [ ] **Step 1: Write the failing test**

```ts
it('results add a column per group set, blank for students outside it', async () => {
  // Fake `results` reply with sets: [{ id: 's1', name: 'Repetition', questions: 2 }] and two attempts, one with practice { s1: { score: 1, max: 2, pending: 0 } }, one with practice {}.
  const root = await openResults(fakeResults);
  const heads = [...root.querySelectorAll('.qz-results th')].map((th) => th.textContent);
  expect(heads).toContain('Repetition');
  const cells = [...root.querySelectorAll('[data-set="s1"]')].map((td) => td.textContent);
  expect(cells).toEqual(['1/2', '']);
});
```

- [ ] **Step 2: Run the test and check it fails**

Expected: FAIL

- [ ] **Step 3: Add the columns**

Add `practice?: Record<string, { score: number; max: number; pending: number }>` to `AttemptSummary`, and `sets?: Array<{ id: string; name: string; questions: number }>` to the published `Results` branch. In the attempts table, after the score header, add one `th` per `r.sets ?? []` with `set.name`. In each row, add one `td` per set with `dataset.set = set.id` and text `p ? `${formatMarks(p.score)}/${formatMarks(p.max)}` : ''`, where `p = a.practice?.[set.id]`. In the attempt detail, a row with `set` gets a `qz-practice` chip (export `practiceIcon` from `student-quiz.ts`, or move it to `@/quiz/dom` and import it in both).

- [ ] **Step 4: Run the tests and check they pass**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/quiz apps/teaching/tests/unit
git commit -m "Teaching: quiz Results show each group set"
```

---

## Phase 8: Dev mock, walk, gate, PR

### Task 20: Mock API seed and browser walk

**Files:**
- Modify: `apps/teaching/scripts/mock-api.ts`

- [ ] **Step 1: Route the new markbook actions in the mock**

Check how the mock routes `/api/classes/:id/markbook` (`grep -n "markbook" apps/teaching/scripts/mock-api.ts`). If it calls the real `markbookAction`, nothing is needed. If it emulates actions, add `save_group`, `add_members`, `remove_member`, `rename_group` and `record_history` by calling the real `markbookAction` with the mock store.

- [ ] **Step 2: Seed a walkable case**

In the mock's seed data, add a quiz lesson "Week 3 review: Finn" with three shared multiple-choice questions and one group set section for a saved group "Repetition" with two members. Use invented students from the mock's class (e.g. Ann Bell, Cy Dale). Also seed that class's markbook `groups`, so Next steps shows the saved group.

- [ ] **Step 3: Walk it in the browser**

Start the dev preview with `preview_start` (see the quiz-insights memory note: for a worktree, add a temporary launch.json entry with absolute `--prefix` paths in the original checkout, then restore it). At desktop width, then at 390px:

1. Markbook → Next steps: a group card shows **Save group**. Press it, and a **Saved groups** card appears.
2. The quiz lesson → quiz panel → Settings → **Personalise**: the class and group are listed. Add a set of 3. A tinted section appears on the canvas with "For Repetition · 2 students".
3. **Write it myself** adds 3 blank cards. Fill one. **Ann drafts** shows the A$ note and does nothing until **Ann writes 3** is pressed. Do NOT press it (no live AI cost without Adam's go).
4. Publish. As Ann Bell (claim AB), the questions include the practice ones with **Practice for you**. As Ed Fox, there is no practice. Hand in both.
5. Results: there is a Repetition column, filled for AB and blank for EF.
6. Markbook: the quiz cell shows "+n/m". **History** lists Repetition. Ann Bell's panel shows the History lines.
7. Check the console for errors. Take screenshots of the strip, the student chip and History.

Fix anything found (with a failing test first where it is logic) and commit each fix.

- [ ] **Step 4: Commit the mock**

```bash
git add apps/teaching/scripts/mock-api.ts
git commit -m "Teaching: dev mock seeds a group set quiz"
```

### Task 21: Gate and PR

- [ ] **Step 1: Run the full gate**

Run: `npm run pre-pr-check`
Expected: exit 0. Fix anything it reports. Generated files must be fresh (`node scripts/generate-alchemy-schema.mjs`, `node scripts/generate-teaching-ai-runtime.mjs`, `node scripts/generate-block-css.mjs` if block CSS changed).

- [ ] **Step 2: Push and open the PR (ready, not draft)**

```bash
git push -u origin claude/group-sets
gh pr create --title "Teaching: group sets — personalised quiz questions for markbook groups" --body "$(cat <<'EOF'
Adds group sets: practice questions in a quiz for saved markbook groups, interleaved for those students only, scored apart from the quiz, with a dated History of joining, practice, results and leaving.

- Saved groups in the markbook (Save group on Next steps; students leave on evidence; groups retire when empty)
- Personalise in quiz Settings adds a group set; canvas strip with Refresh, Write it myself, Ann drafts (cost shown first)
- Publish lifts sets into the quiz key; narrow() interleaves each student's sets; practice outside the quiz score
- Results column per set; markbook cell practice line; History view; student panel History

Spec: docs/superpowers/specs/2026-10-26-group-sets-design.md
Plan: docs/superpowers/plans/2026-10-26-group-sets.md

Not verified: a live Ann drafting run (needs Adam's go), Safari.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Enable auto-merge (merge commit)**, as CLAUDE.md requires, and bind the PR with the ccd_pr tools.

---

## Self-review notes

- **Spec coverage:** saved groups (T6, T7, T11), leaving and retiring (T7, T9, T10), group set block (T5, T15, T16), publish and privacy (T2), interleaving (T1, T3), score apart (T4, T18, T19), History events (T7, T9, T10), History view (T12), student profile (T13), Ann drafting with cost (T16, T17), edge cases: started attempt keeps its questions (the existing `recordFor` + `narrow` per attempt version, covered by T3's design), no class list (T15 message; T3 gives the shared quiz), limits (T1), quiz in several classes (each set names its `class_id`, and narrowing is by student id, which is unique across classes), removed student (History shows "Removed student", T12).
- **Live quiz:** `liveTeacher` uses `record.order` for everyone, so practice never shows in a live round. That is correct for a whole-class round.
- **Evidence dates:** quiz evidence is dated by the quiz column's first-attempt day (`markbook-evidence.ts`). So "since joined" is judged by that day. That is close enough for weekly quizzes, and the History wording names the quiz.
