# Redrafting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher can return a written piece for a redraft of one section or the whole piece; the student rewrites on the returned piece; the redraft comes back to To mark showing what changed.

**Architecture:** `work_handins` and `piece_feedback` stay the latest draft, so existing readers still see one piece. Each earlier draft is frozen in `work_drafts/...` when the next is sent. Student actions run through the existing `/api/published/work/:id` route, which already takes a large body and a class claim.

**Tech Stack:** Netlify Functions (`.mjs`), Blobs via the `store` argument, `node:test` for the server, TypeScript and Vitest for `apps/teaching`.

**Spec:** `docs/superpowers/specs/2026-11-03-redrafting-design.md`. Mockup: `docs/mockups/redrafting/redrafting.html`.

**Execution (Adam's standing preference):** three subagent chunks, no per-task reviewers, one browser walk, the gate once at the end, one PR.

| Chunk | Tasks | Touches |
|---|---|---|
| A, server | 1 to 4 | `netlify/functions/`, `tests/unit/` |
| B, teacher UI | 5, 6 | `apps/teaching/src/marking/` |
| C, student UI | 7, 8 | `apps/teaching/src/student/` |
| Main session | 9 | Walk, gate, PR |

Run A first. B and C can then run in parallel, since their files don't overlap.

**Where this plan refines the spec, found by reading the code:**

- No new endpoint. `published-profile` caps bodies at 4,000 characters, so student saves go through `published-work` (300,000), one field per save.
- `earlier_tags` is rolled up on the feedback record at each send, so pattern reads don't open every draft.
- `to-mark-flow.mjs` only handles `q:` and `r:` pieces, so it needs no change. The draft reaches the flow through `to-mark.mjs` rows and the `load` action.
- The dev mock runs the real handlers, so the flow can be walked without new seed data.
- On Draft 2 and later, the return choice stays radio buttons with reworded labels ("Ask for another redraft: this section") instead of a second button. The action bar's single button follows the choice, which also makes the To mark flow's own Return work.
- The first-step line uses Markbook criteria. A rubric skill with no matching criterion shows only its latest rung, and rubric panel rows don't get the pale previous-step mark.

---

## Chunk A: server

### Task 1: Draft keys, statuses, return with an ask

**Files:**
- Modify: `netlify/functions/_shared/lesson-work.mjs`
- Modify: `netlify/functions/_shared/piece-feedback.mjs`
- Modify: `netlify/functions/_shared/to-mark.mjs`
- Test: `tests/unit/piece-feedback.test.js`

- [ ] **Step 1: Write the failing tests.** Append to `tests/unit/piece-feedback.test.js`:

```js
const saved = async (store, ava) => {
  await piecesAction(store, 'class1', { action: 'save', column_id: 'column001', student_id: ava.id, tags: [tag], comment: 'Name the effect.' });
};

test('return can ask for a whole-piece redraft, and list shows it as asked', async () => {
  const { store, ava } = await setup();
  await saved(store, ava);
  const out = await piecesAction(store, 'class1', { action: 'return', column_id: 'column001', student_id: ava.id, redraft: { scope: 'whole' } });
  assert.equal(out.feedback.status, 'returned');
  assert.equal(out.feedback.redraft.scope, 'whole');
  const list = await piecesAction(store, 'class1', { action: 'list', column_id: 'column001' });
  assert.equal(list.students.find((s) => s.id === ava.id).status, 'redraft_asked');
});

test('a section ask snaps to whole words and refuses a range off the text', async () => {
  const { store, ava } = await setup();
  await saved(store, ava);
  const out = await piecesAction(store, 'class1', { action: 'return', column_id: 'column001', student_id: ava.id, redraft: { scope: { part: 'answers', field: 'q1', start: 8, end: 12 } } });
  assert.deepEqual(out.feedback.redraft.scope, { part: 'answers', field: 'q1', start: 7, end: 15 });
  await assert.rejects(
    piecesAction(store, 'class1', { action: 'return', column_id: 'column001', student_id: ava.id, redraft: { scope: { part: 'answers', field: 'q1', start: 5, end: 9000 } } }),
    /section/
  );
});

test('take back clears the ask, and saving keeps it', async () => {
  const { store, ava } = await setup();
  await saved(store, ava);
  await piecesAction(store, 'class1', { action: 'return', column_id: 'column001', student_id: ava.id, redraft: { scope: 'whole' } });
  const edited = await piecesAction(store, 'class1', { action: 'save', column_id: 'column001', student_id: ava.id, tags: [tag], comment: 'Changed.' });
  assert.equal(edited.feedback.redraft.scope, 'whole');
  const back = await piecesAction(store, 'class1', { action: 'take_back', column_id: 'column001', student_id: ava.id });
  assert.equal(back.feedback.redraft, undefined);
});

test('a plain return carries no ask', async () => {
  const { store, ava } = await setup();
  await saved(store, ava);
  const out = await piecesAction(store, 'class1', { action: 'return', column_id: 'column001', student_id: ava.id });
  assert.equal(out.feedback.redraft, undefined);
});

test('unionTags takes the largest count per code and sign across drafts', () => {
  const row = { tags: [{ code_id: 'ts', positive: false }], earlier_tags: [{ code_id: 'ts', positive: false }, { code_id: 'ts', positive: false }, { code_id: 'qu', positive: true }] };
  assert.deepEqual(unionTags(row).sort((a, b) => a.code_id.localeCompare(b.code_id)), [
    { code_id: 'qu', positive: true },
    { code_id: 'ts', positive: false },
    { code_id: 'ts', positive: false }
  ]);
});
```

Change the import on line 3 to `import { piecesAction, pieceKey, unionTags } from '../../netlify/functions/_shared/piece-feedback.mjs';`. The fixture text is `In the poem the poet uses imagery.`: offset 8 is inside "poem" (7 to 11) and offset 12 is the start of the next "the" (12 to 15), so the range grows to 7 to 15.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/unit/piece-feedback.test.js`
Expected: FAIL, `unionTags` isn't exported.

- [ ] **Step 3: Add the keys.** In `lesson-work.mjs`, after `handinKey`:

```js
export const draftKey = (lesson, block, student, n) => `work_drafts/${lesson}/${block}/${student}/${n}`;
export const redraftKey = (lesson, block, student) => `work_redraft/${lesson}/${block}/${student}`;
```

Export `blockLabels` too (add `export` to its `function`), and export `STEP_PART` (`export const STEP_PART = ...`).

- [ ] **Step 4: Implement in `piece-feedback.mjs`.** Add `draftKey` to the `lesson-work.mjs` import. Add above `recentCodes`:

```js
/** Every code on a piece across its drafts: for each code and sign, the most it appeared on any one draft. */
export function unionTags(row) {
  const most = new Map();
  for (const list of [row?.earlier_tags ?? [], row?.tags ?? []]) {
    const here = new Map();
    for (const t of list) {
      const key = `${t.code_id}|${Boolean(t.positive)}`;
      here.set(key, (here.get(key) ?? 0) + 1);
    }
    for (const [key, n] of here) most.set(key, Math.max(most.get(key) ?? 0, n));
  }
  return [...most].flatMap(([key, n]) => {
    const [code_id, positive] = key.split('|');
    return Array.from({ length: n }, () => ({ code_id, positive: positive === 'true' }));
  });
}

const WORD = /[\p{L}\p{N}'’]/u;

/** A redraft's scope: 'whole', or a section grown to the whole words it touches. Refuses a range off the frozen text. */
export function cleanScope(raw, text) {
  if (raw === 'whole') return 'whole';
  const body = raw?.part && !raw.part.startsWith('step.') ? text?.[raw.part]?.[raw.field] : undefined;
  let start = Math.floor(Number(raw?.start));
  let end = Math.floor(Number(raw?.end));
  if (typeof body !== 'string' || !(start >= 0) || !(end > start) || end > body.length) reject(400, 'bad_section', 'That section can’t be used. Select it again.');
  while (start > 0 && WORD.test(body[start - 1])) start -= 1;
  while (end < body.length && WORD.test(body[end])) end += 1;
  return { part: raw.part, field: raw.field, start, end };
}

/** The drafts before `upTo`, oldest first. */
export async function readDrafts(store, lessonId, blockId, studentId, upTo) {
  const rows = [];
  for (let n = 1; n < upTo; n += 1) {
    const row = await read(store, draftKey(lessonId, blockId, studentId, n));
    if (row) rows.push({ n, ...row, text: writingParts(row.text) });
  }
  return rows;
}
```

Replace the push line in `recentCodes` so a piece with a redraft being marked still counts:

```js
    if ((row?.status === 'returned' || row?.draft > 1) && k !== exceptKey) recent.push({ at: row.returned_at ?? row.first?.returned_at, codes: [...new Set(unionTags(row).filter((t) => !t.positive).map((t) => t.code_id))] });
```

Replace `statusOf`:

```js
const statusOf = (handin, feedback) => {
  if (!handin) return 'not_in';
  if (feedback?.status === 'returned') return feedback.redraft ? 'redraft_asked' : 'returned';
  if (!feedback) return 'waiting';
  // A redraft just sent has no marking on it yet.
  return feedback.sent_at && feedback.sent_at === feedback.updated_at ? 'waiting' : 'marking';
};
```

In `list`, add `draft: feedback?.draft ?? 1, asked_at: feedback?.redraft?.asked_at ?? null, sent_scope: feedback?.sent_scope ?? null` to each pushed student.

In `load`, replace the returned object's start by reading the drafts first:

```js
    const draft = feedback?.draft ?? 1;
    const drafts = draft > 1 ? await readDrafts(store, lesson_id, block_id, student.id, draft) : [];
```

and add to the returned object: `draft, drafts: drafts.map(({ n, text, tags, comment, returned_at, steps, scope }) => ({ n, text, tags: tags ?? [], comment: comment ?? '', returned_at, steps: steps ?? {}, scope: scope ?? null })), ...(feedback?.redraft ? { redraft: feedback.redraft } : {})`.

In `save`, add to `next`, after the `seen_at` line:

```js
      ...(feedback?.redraft ? { redraft: feedback.redraft } : {}),
      ...(feedback?.draft ? { draft: feedback.draft } : {}),
      ...(feedback?.first ? { first: feedback.first } : {}),
      ...(feedback?.earlier_tags ? { earlier_tags: feedback.earlier_tags } : {}),
      ...(feedback?.sent_at ? { sent_at: feedback.sent_at } : {}),
      ...(feedback?.sent_scope ? { sent_scope: feedback.sent_scope } : {}),
```

Replace the end of `piecesAction`:

```js
  if (!feedback) reject(409, 'not_marked', 'Mark this piece before you return it.');
  const { redraft: _asked, ...kept } = feedback;
  if (action === 'return') {
    const ask = body.redraft ? { redraft: { scope: cleanScope(body.redraft.scope, handin.text), asked_at: now } } : {};
    const next = { ...kept, ...ask, status: 'returned', returned_at: now, updated_at: now };
    await store.setJSON(key, next);
    return { feedback: next };
  }
  const { returned_at: _at, seen_at: _seen, ...rest } = kept;
  const next = { ...rest, status: 'draft', updated_at: now };
  await store.setJSON(key, next);
  return { feedback: next };
```

A redraft's new feedback row has no `seen_at`, so it shows as New when it comes back.

- [ ] **Step 5: Update `to-mark.mjs` `pieceItems`.** Inside the loop, after `const handed`:

```js
    const asked = students.filter((s) => s.status === 'redraft_asked');
```

and in the pushed item change `who` and `rows`, and add `asked`:

```js
      who: waiting.map((s) => (s.initials && s.draft > 1 ? `${s.initials} · Redraft ${s.draft}, ${s.sent_scope === 'whole' ? 'whole piece' : 'one section'}` : s.initials)).filter(Boolean),
      rows: waiting.map((s) => ({ student_id: s.id, initials: s.initials, ...(s.draft > 1 ? { draft: s.draft } : {}) })),
      ...(asked.length ? { asked: asked.map((s) => ({ initials: s.initials, asked_at: s.asked_at })) } : {}),
```

- [ ] **Step 6: Run to verify they pass**

Run: `node --test tests/unit/piece-feedback.test.js tests/unit/one-chain-server.test.js tests/unit/lesson-work.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/lesson-work.mjs netlify/functions/_shared/piece-feedback.mjs netlify/functions/_shared/to-mark.mjs tests/unit/piece-feedback.test.js
git commit -m "Redrafting: draft keys, statuses and return with an ask"
```

### Task 2: Student load, save and send

**Files:**
- Create: `netlify/functions/_shared/redraft.mjs`
- Modify: `netlify/functions/published-work.mjs`
- Test: `tests/unit/redraft.test.js`

- [ ] **Step 1: Write the failing tests.** Create `tests/unit/redraft.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { redraftAction } from '../../netlify/functions/_shared/redraft.mjs';
import { piecesAction, pieceKey } from '../../netlify/functions/_shared/piece-feedback.mjs';
import { claimInitials, loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { publishedLessonKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e0' } : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); return { modified: true }; },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const TEXT = 'The cranes lean over the water. This is effective because it is good. The water stays.';
const column = { id: 'column001', kind: 'assessment', title: 'Harbour paragraph', date: '2026-10-27', weight: 0, criteria: [{ id: 'c1', label: 'Analysis', max: 10, outcomes: ['o1'], concepts: [] }], piece: { lesson_id: 'lesson1', block_id: 'qset1' } };
const tag = { code_id: 'ts', positive: false, part: 'answers', field: 'q1', start: 0, end: 10 };
const SECTION = { part: 'answers', field: 'q1', start: 32, end: 69 };

async function setup(scope = 'whole') {
  const store = storeFixture([
    ['classes/class1', { id: 'class1', type: 'class', title: '11 English', active_unit_ids: [], students: [{ name: 'Mina Okafor' }] }],
    ['markbook/class1', { columns: [column], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] }],
    ['feedback_codes/library', { codes: [{ id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', criterion: 1, colour: 'peach', descriptor: 'Open with the claim.' }] }]
  ]);
  const roster = await loadRoster(store, 'class1');
  const [mina] = roster.students;
  await claimInitials(store, roster, 'device-1', mina.initials);
  store.data.set(`work_handins/lesson1/qset1/${mina.id}`, { class_id: 'class1', student_id: mina.id, text: { answers: { q1: TEXT } }, handed_in_at: '2026-10-28T00:00:00Z' });
  const teacher = (action, extra = {}) => piecesAction(store, 'class1', { action, column_id: 'column001', student_id: mina.id, ...extra });
  await teacher('save', { tags: [tag], comment: 'Name the effect.' });
  await teacher('return', { redraft: { scope } });
  const call = (action, extra = {}) => redraftAction(store, 'lesson1', { action, class_id: 'class1', class_token: 'device-1', block_id: 'qset1', ...extra });
  return { store, mina, teacher, call, key: pieceKey('class1', mina.id, 'w:lesson1:qset1'), handin: `work_handins/lesson1/qset1/${mina.id}` };
}

test('a section redraft splices the new words and nothing else changes', async () => {
  const { store, call, handin, key, mina } = await setup(SECTION);
  const loaded = await call('redraft_load');
  assert.deepEqual(loaded.scope, SECTION);
  await call('redraft_save', { part: 'answers', field: 'q1', text: 'The word lean makes them seem to wait.' });
  await call('redraft_send');
  assert.equal(store.data.get(handin).text.answers.q1, 'The cranes lean over the water. The word lean makes them seem to wait. The water stays.');
  assert.equal(store.data.get(handin).draft, 2);
  const archived = store.data.get(`work_drafts/lesson1/qset1/${mina.id}/1`);
  assert.equal(archived.text.answers.q1, TEXT);
  assert.equal(archived.comment, 'Name the effect.');
  assert.equal(archived.tags.length, 1);
  const row = store.data.get(key);
  assert.equal(row.draft, 2);
  assert.equal(row.status, 'draft');
  assert.deepEqual(row.tags, []);
  assert.equal(row.comment, '');
  assert.equal(row.redraft, undefined);
  assert.equal(row.earlier_tags.length, 1);
  assert.deepEqual(row.sent_scope, SECTION);
  assert.equal(store.data.has(`work_redraft/lesson1/qset1/${mina.id}`), false);
});

test('a save outside the section is refused', async () => {
  const { call } = await setup(SECTION);
  await assert.rejects(call('redraft_save', { part: 'answers', field: 'q2', text: 'x' }), /isn’t part of this redraft/);
});

test('a whole redraft replaces the field', async () => {
  const { store, call, handin } = await setup('whole');
  await call('redraft_save', { part: 'answers', field: 'q1', text: 'All new words.' });
  await call('redraft_send');
  assert.equal(store.data.get(handin).text.answers.q1, 'All new words.');
});

test('take back and a double send both get not_asked', async () => {
  const { call, teacher } = await setup('whole');
  await call('redraft_send');
  await assert.rejects(call('redraft_send'), /changed this/);
  await teacher('return', { redraft: { scope: 'whole' } });
  await teacher('take_back');
  await assert.rejects(call('redraft_load'), /changed this/);
});

test('blank and over-long redrafts are refused', async () => {
  const { call } = await setup(SECTION);
  await call('redraft_save', { part: 'answers', field: 'q1', text: '   ' });
  await assert.rejects(call('redraft_send'), /Write something/);
  await call('redraft_save', { part: 'answers', field: 'q1', text: 'x'.repeat(3990) });
  await assert.rejects(call('redraft_send'), /too long/);
});

test('sending with no edits is allowed and keeps the text', async () => {
  const { store, call, handin } = await setup(SECTION);
  await call('redraft_send');
  assert.equal(store.data.get(handin).text.answers.q1, TEXT);
});

test('working words resume for the same scope and restart for another', async () => {
  const { call, teacher } = await setup(SECTION);
  await call('redraft_save', { part: 'answers', field: 'q1', text: 'Kept words.' });
  await teacher('take_back');
  await teacher('return', { redraft: { scope: SECTION } });
  assert.equal((await call('redraft_load')).working.answers.q1, 'Kept words.');
  await teacher('take_back');
  await teacher('return', { redraft: { scope: 'whole' } });
  assert.deepEqual((await call('redraft_load')).working, {});
});

test('an unlinked task says so', async () => {
  const { store, call } = await setup('whole');
  const book = store.data.get('markbook/class1');
  store.data.set('markbook/class1', { ...book, columns: [] });
  await assert.rejects(call('redraft_load'), /task has changed/);
});

test('load gives the student only their words, the scope and the prompts', async () => {
  const { call } = await setup('whole');
  assert.deepEqual(Object.keys(await call('redraft_load')).sort(), ['prompts', 'scope', 'text', 'working']);
});

test('a next-step pick survives on an untouched answer and drops on a changed one', async () => {
  const { store, call, handin, mina } = await setup('whole');
  store.data.set(publishedLessonKey('lesson1'), { blocks: [{ id: 'qset1', block_type: 'question_set', content: { questions: [{ id: 'q1', prompt: 'One' }, { id: 'q2', prompt: 'Two' }] } }] });
  const row = store.data.get(handin);
  store.data.set(handin, { ...row, text: { answers: { q1: TEXT, q2: 'Same.' }, 'step.0': { pick: '{}' }, 'step.1': { pick: '{}' } } });
  await call('redraft_save', { part: 'answers', field: 'q1', text: 'Changed.' });
  await call('redraft_send');
  const text = store.data.get(`work_handins/lesson1/qset1/${mina.id}`).text;
  assert.equal(text['step.0'], undefined);
  assert.deepEqual(text['step.1'], { pick: '{}' });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/unit/redraft.test.js`
Expected: FAIL, cannot find `redraft.mjs`.

- [ ] **Step 3: Implement.** Create `netlify/functions/_shared/redraft.mjs`:

```js
/**
 * A student rewriting a piece their teacher asked them to redraft. The current
 * hand-in and feedback stay the latest draft; sending freezes them as a draft
 * and starts the next. Only this student, and only what they can already see.
 *
 *   work_drafts/{lesson}/{block}/{student}/{n}   an earlier draft
 *   work_redraft/{lesson}/{block}/{student}      { scope, fields, at }, the words so far
 */
import { claimFor, loadRoster } from './class-claims.mjs';
import { isSafeId } from './class-examples.mjs';
import { readBook } from './markbook.mjs';
import { read, reject, walkBlocks } from './question-drop.mjs';
import { publishedLessonKey } from './teaching-blobs.mjs';
import { blockLabels, draftKey, handinKey, pieceId, redraftKey, STEP_PART, WORK_LIMITS, writingParts } from './lesson-work.mjs';
import { pieceKey, unionTags } from './piece-feedback.mjs';

export const REDRAFT_ACTIONS = ['redraft_load', 'redraft_save', 'redraft_send'];

const sameScope = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const inScope = (scope, part, field, text) => (scope === 'whole' ? typeof text?.[part]?.[field] === 'string' : scope.part === part && scope.field === field);

/** The piece's text after this redraft, or a refusal. Words outside a section can't change. */
export function redraftText(text, scope, fields) {
  const next = structuredClone(writingParts(text));
  if (scope === 'whole') {
    for (const [part, row] of Object.entries(next)) {
      for (const field of Object.keys(row)) {
        const words = fields?.[part]?.[field];
        if (typeof words === 'string') row[field] = words;
      }
    }
    if (!Object.values(next).some((row) => Object.values(row).some((v) => v.trim()))) reject(400, 'empty', 'Write something before you send it.');
  } else {
    const was = next[scope.part][scope.field];
    const words = fields?.[scope.part]?.[scope.field];
    if (typeof words === 'string' && !words.trim()) reject(400, 'empty', 'Write something before you send it.');
    next[scope.part][scope.field] = `${was.slice(0, scope.start)}${words ?? was.slice(scope.start, scope.end)}${was.slice(scope.end)}`;
  }
  if (Object.values(next).some((row) => Object.values(row).some((v) => v.length > WORK_LIMITS.text))) reject(400, 'too_long', 'That’s too long to send. Shorten it a little.');
  return next;
}

/** Next-step picks on answers this redraft left alone. A changed answer's pick no longer fits it. */
function keptPicks(oldText, next, block) {
  const questions = Array.isArray(block?.content?.questions) ? block.content.questions : [];
  const kept = {};
  for (const [part, fields] of Object.entries(oldText)) {
    const index = STEP_PART.exec(part)?.[1];
    const id = index === undefined ? null : questions[Number(index)]?.id;
    if (id && next.answers?.[id] === oldText.answers?.[id]) kept[part] = fields;
  }
  return kept;
}

export async function redraftAction(store, lessonId, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !REDRAFT_ACTIONS.includes(body.action)) reject(400, 'bad_action', 'Unknown action.');
  if (!isSafeId(lessonId) || !isSafeId(body.block_id)) reject(404, 'not_found', 'That piece can’t be found.');
  const roster = await loadRoster(store, body.class_id);
  if (!roster) reject(404, 'need_class', 'Open this from your class page.');
  const student = await claimFor(store, roster, body.class_token);
  if (!student) reject(403, 'need_initials', 'Type your initials first.');
  const classId = roster.cls.id;
  const key = pieceKey(classId, student.id, pieceId(lessonId, body.block_id));
  const [feedback, handin, { book }] = await Promise.all([read(store, key), read(store, handinKey(lessonId, body.block_id, student.id)), readBook(store, classId)]);
  if (!feedback?.redraft) reject(409, 'not_asked', 'Your teacher has changed this. Reopen Returned work.');
  const column = book.columns.find((c) => c.id === feedback.column_id && c.kind === 'assessment' && c.piece?.lesson_id === lessonId && c.piece.block_id === body.block_id);
  if (!column || !handin) reject(409, 'task_changed', 'This task has changed. Ask your teacher.');
  const { scope } = feedback.redraft;
  const workingKey = redraftKey(lessonId, body.block_id, student.id);
  const stored = await read(store, workingKey);
  const working = stored && sameScope(stored.scope, scope) ? stored.fields : {};
  const lessonBlock = async () => {
    const lesson = await read(store, publishedLessonKey(lessonId));
    return lesson ? [...walkBlocks(lesson.blocks)].find((b) => b.id === body.block_id) ?? null : null;
  };

  if (body.action === 'redraft_load') {
    const block = await lessonBlock();
    return { scope, text: writingParts(handin.text), prompts: block ? blockLabels(block).prompts : {}, working };
  }

  if (body.action === 'redraft_save') {
    if (typeof body.part !== 'string' || typeof body.field !== 'string' || typeof body.text !== 'string' || !inScope(scope, body.part, body.field, handin.text)) reject(400, 'out_of_scope', 'That isn’t part of this redraft.');
    if (body.text.length > WORK_LIMITS.text) reject(400, 'too_long', 'That’s too long to save. Shorten it a little.');
    const fields = { ...working, [body.part]: { ...(working[body.part] ?? {}), [body.field]: body.text } };
    const at = new Date().toISOString();
    await store.setJSON(workingKey, { scope, fields, at });
    return { saved: true, at };
  }

  const next = redraftText(handin.text, scope, working);
  const block = await lessonBlock();
  const now = new Date().toISOString();
  const n = feedback.draft ?? 1;
  const steps = book.marks?.[column.id]?.[student.id]?.steps ?? {};
  await store.setJSON(draftKey(lessonId, body.block_id, student.id, n), {
    text: handin.text, tags: feedback.tags ?? [], comment: feedback.comment ?? '', rubric: feedback.rubric ?? null, steps, scope,
    handed_in_at: handin.handed_in_at, returned_at: feedback.returned_at, seen_at: feedback.seen_at ?? null
  });
  await store.setJSON(handinKey(lessonId, body.block_id, student.id), { ...handin, text: { ...next, ...keptPicks(handin.text, next, block) }, handed_in_at: now, draft: n + 1 });
  await store.setJSON(key, {
    kind: feedback.kind, title: feedback.title, ...(feedback.short ? { short: feedback.short } : {}),
    lesson_id: lessonId, block_id: body.block_id, column_id: column.id,
    tags: [], comment: '', ...(feedback.rubric ? { rubric: feedback.rubric } : {}),
    status: 'draft', draft: n + 1,
    first: feedback.first ?? { steps, rubric: feedback.rubric ?? null, returned_at: feedback.returned_at },
    earlier_tags: unionTags(feedback),
    sent_scope: scope, sent_at: now, updated_at: now
  });
  await store.delete(workingKey);
  return { sent: true, at: now, draft: n + 1 };
}
```

- [ ] **Step 4: Route it.** In `netlify/functions/published-work.mjs`, add `import { redraftAction, REDRAFT_ACTIONS } from './_shared/redraft.mjs';` and replace the `result` line:

```js
      const result = await withClaimRequest({ ip: clientIpOf(request, context) }, () => (REDRAFT_ACTIONS.includes(parsedBody?.action) ? redraftAction : workAction)(store, match?.[1], parsedBody));
```

- [ ] **Step 5: Run to verify they pass**

Run: `node --test tests/unit/redraft.test.js`
Expected: PASS. In `'blank and over-long'`, 3,990 new characters pass the save but take the spliced field past 4,000.

- [ ] **Step 6: Add a rubric carry test.** Append to `tests/unit/redraft.test.js`:

```js
test('a carried rubric saves with nothing blocked, so a one-tap return goes through', async () => {
  const { call, teacher, store, key } = await setup('whole');
  const held = { skills: {}, pieces: {}, steps: {}, next_step: '' };
  store.data.set(key, { ...store.data.get(key), rubric: held });
  await call('redraft_send');
  const saved = await teacher('save', { tags: [], comment: '', rubric: store.data.get(key).rubric });
  assert.deepEqual(saved.blocked ?? [], []);
  const back = await teacher('return');
  assert.equal(back.feedback.status, 'returned');
  assert.equal(back.feedback.draft, 2);
});
```

Run: `node --test tests/unit/redraft.test.js`
Expected: PASS. If `cleanRubric` rejects this shape, copy a valid one from `tests/unit/one-chain-server.test.js`.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/redraft.mjs netlify/functions/published-work.mjs tests/unit/redraft.test.js
git commit -m "Redrafting: student load, save and send"
```

### Task 3: What the student sees, and patterns

**Files:**
- Modify: `netlify/functions/_shared/profile-feedback.mjs`
- Test: `tests/unit/profile-feedback.test.js`

- [ ] **Step 1: Write the failing tests.** Add `import { studentPieces } from '../../netlify/functions/_shared/profile-feedback.mjs';` to `tests/unit/profile-feedback.test.js`, and append:

```js
async function redraftFixture() {
  const { store, ava } = await setup();
  const key = `piece_feedback/class1/${ava.id}/w:lesson1:b`;
  const { returned_at, ...was } = store.data.get(key);
  const book = store.data.get('markbook/class1');
  book.marks.column001[ava.id].steps = { crit0001: 'secure' };
  store.data.set('markbook/class1', book);
  store.data.set(`work_handins/lesson1/b/${ava.id}`, { text: { answers: { q1: 'Second words.' } }, draft: 2, handed_in_at: '2026-10-29T00:00:00Z' });
  store.data.set(`work_drafts/lesson1/b/${ava.id}/1`, { text: { answers: { q1: 'First words.' } }, tags: was.tags, comment: 'Draft 1 comment', rubric: null, steps: { crit0001: 'building' }, scope: 'whole', returned_at });
  store.data.set(key, { ...was, tags: [], comment: '', status: 'draft', draft: 2, first: { steps: { crit0001: 'building' }, rubric: null, returned_at }, earlier_tags: [{ code_id: 'ts', positive: false }], sent_scope: 'whole', sent_at: '2026-10-29T00:00:00Z', updated_at: '2026-10-29T00:00:00Z' });
  return { store, ava, key };
}
const ITEM = 'w:lesson1:b';
const listed = async (store) => (await profileAction(store, 'class1', { action: 'returned', ...device })).items.find((i) => i.id === ITEM);
const opened = (store) => profileAction(store, 'class1', { action: 'piece', item: ITEM, ...device });

test('a redraft being marked stays listed with its last returned draft, and says it was sent', async () => {
  const { store, key } = await redraftFixture();
  assert.equal((await listed(store)).redraft, 'sent');
  const piece = await opened(store);
  assert.equal(piece.sent, true);
  assert.equal(piece.comment, 'Draft 1 comment');
  assert.equal(piece.text.answers.q1, 'First words.');
  await profileAction(store, 'class1', { action: 'seen', item: ITEM, ...device });
  assert.equal(store.data.get(key).seen_at, undefined);
});

test('a code on an earlier draft still counts in patterns, once', async () => {
  const { store, ava } = await redraftFixture();
  const row = (await studentPieces(store, 'class1', ava.id)).find((p) => p.id === ITEM);
  assert.deepEqual(row.tags, [{ code_id: 'ts', positive: false }]);
});

test('a finished redraft shows the first step and earlier drafts, and never their marks', async () => {
  const { store, key } = await redraftFixture();
  store.data.set(key, { ...store.data.get(key), status: 'returned', returned_at: '2026-10-30T00:00:00Z', comment: 'Well found.' });
  const piece = await opened(store);
  assert.equal(piece.comment, 'Well found.');
  assert.equal(piece.drafts.length, 1);
  assert.equal(piece.drafts[0].comment, 'Draft 1 comment');
  assert.equal(piece.criteria[0].first, 'building');
  assert.equal(piece.criteria[0].step, 'secure');
  assert.equal('rubric' in piece.drafts[0], false);
  assert.equal('steps' in piece.drafts[0], false);
});

test('a piece with an ask says so in the list and carries the scope', async () => {
  const { store, key } = await redraftFixture();
  store.data.set(key, { ...store.data.get(key), status: 'returned', returned_at: '2026-10-30T00:00:00Z', redraft: { scope: 'whole', asked_at: '2026-10-30T00:00:00Z' } });
  assert.equal((await listed(store)).redraft, 'asked');
  assert.deepEqual((await opened(store)).redraft, { scope: 'whole' });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/unit/profile-feedback.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `profile-feedback.mjs`, extend the imports: `import { piecePrefix, pieceKey, readDrafts, unionTags } from './piece-feedback.mjs';` and add `draftKey` to the `lesson-work.mjs` import. Add above `studentPieces`:

```js
/**
 * The returned state of a piece as its student sees it. A redraft with the
 * teacher shows the last draft that came back; a piece never returned shows nothing.
 */
async function shownRow(store, row, studentId) {
  if (row?.status === 'returned') return row;
  if (!(row?.draft > 1)) return null;
  const last = await read(store, draftKey(row.lesson_id, row.block_id, studentId, row.draft - 1));
  if (!last) return null;
  return { ...row, tags: last.tags ?? [], comment: last.comment ?? '', returned_at: last.returned_at, seen_at: last.seen_at ?? last.returned_at, text: writingParts(last.text), sent: true };
}
```

In `studentPieces`, replace the loop's start and `tags` and `pieces.push`:

```js
  for (const [key, stored] of await mapBounded(keys, 8, async (k) => [k, await read(store, k)])) {
    const row = await shownRow(store, stored, studentId);
    if (!row) continue;
```

```js
    const tags = row.kind === 'viva' ? vivaTags(takes) : unionTags(stored);
```

and add `redraft: stored.redraft ? 'asked' : row.sent ? 'sent' : null` to the pushed piece.

In `returnedFor`, add `...(p.redraft ? { redraft: p.redraft } : {})` to the piece's `item`.

In `pieceFor`, replace the read and refusal:

```js
  const stored = await read(store, pieceKey(roster.cls.id, student.id, item));
  const row = await shownRow(store, stored, student.id);
  if (!row) reject(404, 'not_found', 'That piece isn’t back yet.');
```

After the `const tags = ...` line, add:

```js
  const shownDraft = row.sent ? stored.draft - 1 : stored?.draft ?? 1;
  const drafts = shownDraft > 1 ? await readDrafts(store, row.lesson_id, row.block_id, student.id, shownDraft) : [];
```

Add to the returned object, after `tags,`:

```js
    draft: shownDraft,
    drafts: drafts.map((d) => ({ n: d.n, text: d.text, comment: d.comment ?? '', date: day(d.returned_at), tags: (d.tags ?? []).map((t) => ({ part: t.part, field: t.field, start: t.start, end: t.end, ...explain(t, codes.get(t.code_id)) })) })),
    ...(row.sent ? { sent: true } : {}),
    ...(stored?.redraft ? { redraft: { scope: stored.redraft.scope } } : {}),
```

Replace the `criteria` map body:

```js
    criteria: (column?.criteria ?? []).map((c) => {
      const placeKey = c.skill ? `skill:${c.skill}` : c.outcomes?.[0] ? `out:${c.outcomes[0]}` : `con:${c.concepts?.[0]}`;
      const step = placesFor({ criteria: [c] }, mark)[placeKey] ?? null;
      const first = stored?.first ? placesFor({ criteria: [c] }, { steps: stored.first.steps })[placeKey] ?? null : null;
      return { label: c.label, step, was: earlier?.places?.[placeKey] ?? null, ...(first ? { first } : {}) };
    })
```

In `markSeen`, replace the refusal:

```js
  if (row?.status !== 'returned') {
    if (row?.draft > 1) return { ok: true };
    reject(404, 'not_found', 'That piece isn’t back yet.');
  }
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/unit/profile-feedback.test.js tests/unit/profile-steps.test.js tests/unit/markbook-analysis.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/profile-feedback.mjs tests/unit/profile-feedback.test.js
git commit -m "Redrafting: student sees drafts, patterns keep earlier codes"
```

### Task 4: Lesson hand-in can't overwrite a redraft

**Files:**
- Modify: `netlify/functions/_shared/lesson-work.mjs`
- Test: `tests/unit/lesson-work.test.js`

- [ ] **Step 1: Write the failing test.** Append to `tests/unit/lesson-work.test.js`, which already has `setup`, `linkColumn`, `bobDevice` and `save`:

```js
test('hand in is refused while a redraft is out, and status says why', async () => {
  const { store, bob } = await setup();
  linkColumn(store);
  await workAction(store, 'lesson1', { ...bobDevice, action: 'claim', initials: 'BB' });
  await save(store, { block_id: 'qset1', part: 'answers', fields: { q1: 'First go.' } });
  await workAction(store, 'lesson1', { ...bobDevice, action: 'handin', block_id: 'qset1' });
  const key = `piece_feedback/class1/${bob.id}/w:lesson1:qset1`;
  store.data.set(key, { status: 'draft', draft: 2 });
  await assert.rejects(workAction(store, 'lesson1', { ...bobDevice, action: 'handin', block_id: 'qset1' }), /with your teacher/);
  assert.deepEqual((await workAction(store, 'lesson1', { ...bobDevice, action: 'status' })).redrafts, { qset1: 'with_teacher' });
  store.data.set(key, { status: 'returned', redraft: { scope: 'whole' } });
  assert.deepEqual((await workAction(store, 'lesson1', { ...bobDevice, action: 'status' })).redrafts, { qset1: 'asked' });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/unit/lesson-work.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `lesson-work.mjs`, add above `workAction`:

```js
/** Marked blocks with a redraft out: 'asked' while the student rewrites, 'with_teacher' once it's sent. */
async function redraftStates(store, classId, studentId, lessonId, marked) {
  const states = {};
  for (const id of marked) {
    const row = await read(store, `piece_feedback/${classId}/${studentId}/${pieceId(lessonId, id)}`);
    if (row?.redraft) states[id] = 'asked';
    else if (row?.draft > 1 && row.status !== 'returned') states[id] = 'with_teacher';
  }
  return states;
}
```

Replace the status line:

```js
  if (action === 'status' || action === 'claim') {
    const redrafts = marked.length ? await redraftStates(store, roster.cls.id, student.id, lessonId, marked) : {};
    return { ...identity, ...(marked.length ? { handin_blocks: marked } : {}), ...(Object.keys(redrafts).length ? { redrafts } : {}) };
  }
```

After the `returned` refusal in `handin`, add:

```js
    if (feedback?.draft > 1) reject(409, 'with_teacher', 'Your redraft is with your teacher.');
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/unit/lesson-work.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/lesson-work.mjs tests/unit/lesson-work.test.js
git commit -m "Redrafting: lesson hand-in leaves a redraft alone"
```

---

## Chunk B: teacher UI

### Task 5: Marking page

**Files:**
- Create: `apps/teaching/src/marking/draft-diff.ts`
- Modify: `apps/teaching/src/marking/mark-piece.ts`, `mark-page.ts`, `to-mark-flow.ts`, `marking.css`
- Test: `apps/teaching/tests/unit/draft-diff.test.ts`, `apps/teaching/tests/unit/mark-redraft.test.ts`

- [ ] **Step 1: Write the failing tests.** Create `apps/teaching/tests/unit/draft-diff.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { wordDiff, changesSheet } from '@/marking/draft-diff';

const flat = (a: string, b: string) => wordDiff(a, b).map((s) => `${s.kind[0]}:${s.text}`).join('|');

describe('wordDiff', () => {
  it('shows a swapped word', () => expect(flat('the big dog', 'the small dog')).toBe('s:the |r:big|a:small|s: dog'));
  it('shows added words', () => expect(flat('the dog', 'the old dog')).toBe('s:the |a:old |s:dog'));
  it('shows removed words', () => expect(flat('the old dog', 'the dog')).toBe('s:the |r:old |s:dog'));
  it('keeps punctuation apart from the word', () => expect(flat('a dog.', 'a dog!')).toBe('s:a dog|r:.|a:!'));
  it('joins back to both texts', () => {
    const parts = wordDiff('one two three', 'one four three');
    expect(parts.filter((p) => p.kind !== 'added').map((p) => p.text).join('')).toBe('one two three');
    expect(parts.filter((p) => p.kind !== 'removed').map((p) => p.text).join('')).toBe('one four three');
  });
  it('says when nothing changed', () => expect(changesSheet('same', 'same').textContent).toBe('No changes'));
});
```

Create `apps/teaching/tests/unit/mark-redraft.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { openMarkPiece, type MarkPieceData } from '@/marking/mark-piece';

const data = (over: Partial<MarkPieceData> = {}): MarkPieceData => ({
  column: { id: 'c', title: 'Harbour', criteria: [{ id: 'c1', label: 'Analysis', outcomes: [], concepts: [] }] },
  student: { id: 's1', initials: 'MO', name: 'Mina Okafor' },
  text: { answers: { q1: 'New words here.' } },
  feedback: { tags: [], comment: '', status: 'draft' },
  mark: { steps: { c1: 'building' } },
  codes: [],
  recent_codes: [],
  position: { index: 0, total: 1 },
  ...over
});
const acts = () => ({ save: vi.fn().mockResolvedValue({}), returnIt: vi.fn().mockResolvedValue({}), takeBack: vi.fn().mockResolvedValue({}), move: vi.fn() });
const choose = (root: HTMLElement, value: string) => {
  const r = root.querySelector<HTMLInputElement>(`input[name="mk-ask"][value="${value}"]`)!;
  r.checked = true;
  r.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('return for a redraft', () => {
  it('has no choice unless the page offers it', () => {
    expect(openMarkPiece(data(), acts()).el.querySelector('input[name="mk-ask"]')).toBeNull();
  });
  it('a plain return sends no ask', async () => {
    const a = acts();
    await openMarkPiece(data(), a, { redraft: true }).finish();
    expect(a.returnIt).toHaveBeenCalledWith(undefined);
  });
  it('a whole-piece ask sends it, and the button says so', async () => {
    const a = acts();
    const view = openMarkPiece(data(), a, { redraft: true });
    choose(view.el, 'whole');
    expect(view.el.querySelector('[data-action="return"]')!.textContent).toBe('Return for a redraft');
    await view.finish();
    expect(a.returnIt).toHaveBeenCalledWith({ redraft: { scope: 'whole' } });
  });
  it('a section ask waits for a section', async () => {
    const a = acts();
    const view = openMarkPiece(data(), a, { redraft: true });
    choose(view.el, 'section');
    expect(await view.finish()).toBe(false);
    expect(a.returnIt).not.toHaveBeenCalled();
    view.el.dispatchEvent(new CustomEvent('pm:select', { detail: { part: 'answers', field: 'q1', start: 0, end: 3 } }));
    expect(await view.finish()).toBe(true);
    expect(a.returnIt).toHaveBeenCalledWith({ redraft: { scope: { part: 'answers', field: 'q1', start: 0, end: 3 } } });
  });
});

describe('a redraft that came back', () => {
  const back = data({
    draft: 2,
    drafts: [{ n: 1, text: { answers: { q1: 'Old words here.' } }, tags: [], comment: 'Name the effect.', returned_at: '2026-10-28T00:00:00Z', steps: { c1: 'building' }, scope: 'whole' }]
  });
  it('opens on Changes, with the palette hidden and the old comment beside it', () => {
    const root = openMarkPiece(back, acts(), { redraft: true }).el;
    expect(root.querySelector('.mk-draft-pill.is-on')!.textContent).toBe('Changes');
    expect(root.querySelector<HTMLElement>('.mk-palette')!.hidden).toBe(true);
    expect(root.querySelector('del')!.textContent).toBe('Old');
    expect(root.querySelector('ins')!.textContent).toBe('New');
    expect(root.querySelector('.mk-earlier')!.textContent).toContain('Name the effect.');
  });
  it('the latest draft can be coded, and a chosen step leaves the old one marked', () => {
    const root = openMarkPiece(back, acts(), { redraft: true }).el;
    [...root.querySelectorAll<HTMLElement>('.mk-draft-pill')].find((b) => b.textContent === 'Draft 2')!.click();
    expect(root.querySelector<HTMLElement>('.mk-palette')!.hidden).toBe(false);
    root.querySelector<HTMLElement>('[data-step="c1:secure"]')!.click();
    expect(root.querySelector('[data-step="c1:building"]')!.classList.contains('is-was')).toBe(true);
  });
  it('words the next ask as another redraft', () => {
    const root = openMarkPiece(back, acts(), { redraft: true }).el;
    expect(root.querySelector('.mk-ask')!.textContent).toContain('Ask for another redraft: the whole piece');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run --root apps/teaching tests/unit/draft-diff.test.ts tests/unit/mark-redraft.test.ts`
Expected: FAIL.

- [ ] **Step 3: Create `apps/teaching/src/marking/draft-diff.ts`:**

```ts
/** What changed between two drafts of a student's words, word by word. Pure, apart from drawing it. */
import { el } from '@/quiz/dom';

export type DiffPart = { kind: 'same' | 'removed' | 'added'; text: string };

const tokens = (text: string): string[] => text.match(/[\p{L}\p{N}'’]+|\s+|[^\p{L}\p{N}'’\s]/gu) ?? [];

export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  const lcs: Uint16Array[] = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const parts: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string): void => {
    const last = parts.at(-1);
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { push('same', a[i]!); i += 1; j += 1; }
    else if (i < a.length && (j === b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) { push('removed', a[i]!); i += 1; }
    else { push('added', b[j]!); j += 1; }
  }
  return parts;
}

export function changesSheet(before: string, after: string): HTMLElement {
  const sheet = el('p', 'mk-changes');
  if (before === after) {
    sheet.textContent = 'No changes';
    return sheet;
  }
  for (const part of wordDiff(before, after)) {
    if (part.kind === 'same') sheet.append(part.text);
    else sheet.append(el(part.kind === 'removed' ? 'del' : 'ins', undefined, part.text));
  }
  return sheet;
}
```

- [ ] **Step 4: Update `mark-piece.ts`.** Add `import { changesSheet } from './draft-diff';`. Add the types and extend `MarkPieceData`, `MarkPieceActions` and `MarkPieceOptions`:

```ts
export type RedraftScope = 'whole' | { part: string; field: string; start: number; end: number };
export type EarlierDraft = { n: number; text: Record<string, Record<string, string>>; tags: Tag[]; comment: string; returned_at: string; steps: Record<string, string>; scope: RedraftScope | null };
```

```ts
  // In MarkPieceData:
  draft?: number;
  drafts?: EarlierDraft[];
  redraft?: { scope: RedraftScope; asked_at: string };
  // In MarkPieceActions, replacing returnIt:
  returnIt: (ask?: { redraft: { scope: RedraftScope } }) => Promise<unknown>;
  // In MarkPieceOptions:
  /** Handed-in writing only: offers Return for a redraft. */
  redraft?: boolean;
```

Add at the top of `openMarkPiece`, after `const codes = ...`:

```ts
  const draft = d.draft ?? 1;
  const drafts = d.drafts ?? [];
  const lastDraft = drafts.at(-1);
  // A redraft opens on what changed; codes only go on the latest words.
  let view: 'changes' | 'latest' | number = lastDraft ? 'changes' : 'latest';
  let ask: 'none' | 'section' | 'whole' = 'none';
  let section: { part: string; field: string; start: number; end: number } | null = null;
  const askBody = (): { redraft: { scope: RedraftScope } } | undefined =>
    ask === 'whole' ? { redraft: { scope: 'whole' } } : ask === 'section' && section ? { redraft: { scope: section } } : undefined;
  const missingSection = (): boolean => ask === 'section' && !section;
```

Replace the `retBtn` handler's non-returned branch:

```ts
    else if (missingSection()) askHint.textContent = 'Drag across the section first.';
    else void save().then(() => act.returnIt(askBody())).then(() => { status = 'returned'; paint(); });
```

In the `pm:select` listener, add first:

```ts
    if (ask === 'section') {
      section = sel;
      selected = null;
      justTagged = true;
      window.getSelection()?.removeAllRanges();
      askHint.textContent = '';
      paint();
      return;
    }
```

After the `side.append(el('h3', 'mk-side__title', 'Codes on this piece'), ...)` line, add the earlier-feedback box and the choice:

```ts
  if (lastDraft) {
    const earlier = el('div', 'mk-earlier');
    earlier.append(el('h3', 'mk-side__title', `What you said on Draft ${lastDraft.n}`));
    for (const id of new Set(lastDraft.tags.map((t) => t.code_id))) {
      const c = codes.get(id);
      if (c) earlier.append(el('p', 'mk-hint', `${c.code} ${c.label}`));
    }
    if (lastDraft.comment) earlier.append(el('p', 'mk-earlier__comment', lastDraft.comment));
    side.prepend(earlier);
  }
  const askHint = el('p', 'mk-hint');
  askHint.setAttribute('role', 'status');
  if (o.redraft) {
    const box = el('fieldset', 'mk-ask');
    box.append(el('legend', 'mk-side__title', 'When you return it'));
    const again = draft > 1 ? 'Ask for another redraft' : 'Return for a redraft';
    const options: Array<['none' | 'section' | 'whole', string]> = [['none', 'Return, finished'], ['section', `${again}: this section`], ['whole', `${again}: the whole piece`]];
    for (const [value, label] of options) {
      const line = el('label', 'mk-ask__line');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'mk-ask';
      radio.value = value;
      radio.checked = value === 'none';
      radio.addEventListener('change', () => {
        ask = value;
        askHint.textContent = value === 'section' && !section ? 'Drag across the words you want rewritten.' : '';
        if (value === 'section') view = 'latest';
        paint();
      });
      line.append(radio, document.createTextNode(` ${label}`));
      box.append(line);
    }
    box.append(askHint);
    side.append(box);
  }
```

The `askHint` const must come before the `retBtn` handler runs, not before it's defined, so this order is fine: the handler only reads it on click.

Replace the loop's opening in `paint()`:

```ts
  function draftPills(): HTMLElement | null {
    if (!lastDraft) return null;
    const row = el('div', 'mk-drafts');
    const pill = (label: string, to: typeof view): void => {
      const b = el('button', `mk-draft-pill${view === to ? ' is-on' : ''}`, label);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(view === to));
      b.addEventListener('click', () => { view = to; paint(); });
      row.append(b);
    };
    pill('Changes', 'changes');
    pill(`Draft ${draft}`, 'latest');
    for (const past of [...drafts].reverse()) pill(`Draft ${past.n}`, past.n);
    return row;
  }

  /** The non-editable views: what changed, or an earlier draft with its own codes. */
  function readOnlySheets(): HTMLElement[] {
    const out: HTMLElement[] = [];
    if (view === 'changes') {
      for (const [part, fields] of Object.entries(d.text)) {
        if (part.startsWith('step.')) continue;
        for (const [field, text] of Object.entries(fields)) out.push(changesSheet(lastDraft?.text[part]?.[field] ?? '', text));
      }
      return out;
    }
    const past = drafts.find((x) => x.n === view);
    for (const [part, fields] of Object.entries(past?.text ?? {})) {
      for (const [field, text] of Object.entries(fields)) {
        const mine = (past?.tags ?? []).filter((t) => t.part === part && t.field === field);
        out.push(paper(text, mine.map((t, i) => ({ start: t.start, end: t.end, layer: i, colour: `var(--pastel-${codes.get(t.code_id)?.colour ?? 'blue'}-ink)` })), null));
      }
    }
    return out;
  }

  function paint(): void {
    sheets.replaceChildren();
    const pills = draftPills();
    if (pills) sheets.append(pills);
    palette.hidden = view !== 'latest';
    if (view !== 'latest') sheets.append(...readOnlySheets());
    else for (const [part, fields] of Object.entries(d.text)) {
```

Keep the rest of that loop as it is, except add the gold mark right after `const marks`:

```ts
        const onSection = section?.part === part && section.field === field;
        if (section && onSection) marks.push({ start: section.start, end: section.end, layer: marks.length, colour: 'var(--pastel-gold-ink)' });
```

In the rubric loop in `paint`, add after `b.setAttribute('aria-pressed', String(on));`:

```ts
      b.classList.toggle('is-was', !on && lastDraft?.steps[cid!] === step);
```

Replace the `retBtn.textContent` line:

```ts
    retBtn.textContent = status === 'returned' ? 'Take back' : ask !== 'none' ? 'Return for a redraft' : draft > 1 ? 'Return, finished' : `Return to ${first(d.student.name)}`;
```

Replace `finish` in the returned handle:

```ts
    finish: async () => {
      if (missingSection()) {
        askHint.textContent = 'Drag across the section first.';
        return false;
      }
      await save();
      if (stayedPractice) return false;
      await act.returnIt(askBody());
      status = 'returned';
      return true;
    }
```

Because `returnIt` may now be called with `undefined`, update the quiz-answer caller only if TypeScript complains; a function taking fewer parameters still satisfies the type.

- [ ] **Step 5: Pass the choice through.** In `mark-page.ts`:

```ts
          returnIt: (ask?: Parameters<MarkPieceActions['returnIt']>[0]) => call({ action: 'return', student_id: id, ...ask }),
```

and change the render to `markPieceView({ ...data, position: { index, total: handed.length } }, act, { rubric, redraft: true })`. Add `'redraft_asked'` to `ListedStudent['status']`, and add `draft?: number` to it.

In `to-mark-flow.ts` `pieceCard`:

```ts
    returnIt: (ask) => call({ action: 'return', ...ask }),
```

and pass `{ embedded: true, rubric, redraft: true }`.

- [ ] **Step 6: Add the styles.** Append to `apps/teaching/src/marking/marking.css`:

```css
.mk-drafts { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
.mk-draft-pill { border: 1px solid var(--line); background: var(--surface); color: var(--muted); border-radius: 999px; padding: 4px 12px; min-height: 32px; font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
.mk-draft-pill.is-on { background: var(--navy); border-color: var(--navy); color: #fff; }
.mk-changes { line-height: 1.75; white-space: pre-wrap; margin: 0 0 var(--space-3); }
.mk-changes ins { background: var(--pastel-sage); color: var(--pastel-sage-ink); text-decoration: none; border-radius: 3px; padding: 0 2px; }
.mk-changes del { background: var(--pastel-peach); color: var(--pastel-peach-ink); border-radius: 3px; padding: 0 2px; }
.mk-earlier { margin-bottom: var(--space-3); }
.mk-earlier__comment { margin: 0; font-size: var(--text-sm); white-space: pre-wrap; }
.mk-ask { border: 0; padding: 0; margin: var(--space-3) 0 0; }
.mk-ask__line { display: flex; gap: var(--space-2); align-items: flex-start; min-height: 32px; font-size: var(--text-sm); cursor: pointer; }
.mk-step.is-was { background: var(--pastel-blue); color: var(--pastel-blue-ink); }
```

Confirm `--line`, `--surface` and `--navy` exist in the tokens this file already uses, and swap to the ones it uses if not.

- [ ] **Step 7: Run to verify they pass**

Run: `npx vitest run --root apps/teaching tests/unit/draft-diff.test.ts tests/unit/mark-redraft.test.ts tests/unit/to-mark-flow.test.ts`
Expected: PASS. If a `to-mark-flow` test is absent at that path, run `npx vitest run --root apps/teaching tests/unit/to-mark-items.test.ts tests/unit/to-mark-view.test.ts` instead.

- [ ] **Step 8: Commit**

```bash
git add apps/teaching/src/marking apps/teaching/tests/unit/draft-diff.test.ts apps/teaching/tests/unit/mark-redraft.test.ts
git commit -m "Redrafting: ask, changes view and earlier drafts on the marking page"
```

### Task 6: To mark

**Files:**
- Modify: `apps/teaching/src/marking/to-mark-view.ts`
- Test: `apps/teaching/tests/unit/to-mark-view.test.ts`

- [ ] **Step 1: Write the failing test.** Append inside the `describe('to mark', ...)` block:

```ts
  it('lists students asked for a redraft quietly, and keeps a task showing for them', () => {
    const view = toMarkView([
      { class_id: 'c1', class_title: '11E1', column_id: 'col1', title: 'Harbour', lesson_id: 'l1', block_id: 'b1', waiting: 0, handed_in: 24, roster: 24, asked: [{ initials: 'SP', asked_at: new Date().toISOString() }] }
    ] as never);
    expect(view.textContent).toContain('Harbour');
    expect(view.querySelector('.tm-task__asked')!.textContent).toContain('Redraft asked: SP');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --root apps/teaching tests/unit/to-mark-view.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** In `to-mark-view.ts`, add to `ToMarkTask`: `asked?: { initials: string; asked_at: string }[];`. In `row`, after the `who` lines:

```ts
  if (t.asked?.length) text.append(el('p', 'tm-task__asked', `Redraft asked: ${t.asked.map((a) => `${a.initials} (${ageText(a.asked_at)})`).join(', ')}`));
```

Replace the `open` filter:

```ts
  const open = tasks.filter((t) => t.waiting === 0 && t.handed_in !== undefined && (t.handed_in < t.roster || Boolean(t.asked?.length)));
```

Add to the CSS file that styles `.tm-task__who`, next to that rule (find it with `grep -rn "tm-task__who" apps/teaching/src --include=*.css`):

```css
.tm-task__asked { margin: 2px 0 0; font-size: var(--text-sm); color: var(--muted); }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --root apps/teaching tests/unit/to-mark-view.test.ts tests/unit/to-mark-items.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/marking apps/teaching/tests/unit/to-mark-view.test.ts
git commit -m "Redrafting: To mark lists students asked for a redraft"
```

---

## Chunk C: student UI

### Task 7: The rewrite box

**Files:**
- Create: `apps/teaching/src/student/redraft-editor.ts`
- Modify: `apps/teaching/src/student/profile.css`
- Test: `apps/teaching/tests/unit/redraft-editor.test.ts`

- [ ] **Step 1: Write the failing test.** Create `apps/teaching/tests/unit/redraft-editor.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redraftEditor, type RedraftApi, type RedraftLoad } from '@/student/redraft-editor';

const TEXT = 'Before words. Middle words. After words.';
const load = (over: Partial<RedraftLoad> = {}): RedraftLoad => ({
  scope: { part: 'answers', field: 'q1', start: 14, end: 27 }, text: { answers: { q1: TEXT } }, prompts: { q1: 'How?' }, working: {}, ...over
});
const api = (l: RedraftLoad): RedraftApi => ({ load: vi.fn().mockResolvedValue(l), save: vi.fn().mockResolvedValue({}), send: vi.fn().mockResolvedValue({}) });
const settle = () => new Promise<void>((r) => { queueMicrotask(() => queueMicrotask(r)); });

describe('redraft editor', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); });
  afterEach(() => { vi.useRealTimers(); });

  it('a section shows the words around it locked, and only the section editable', async () => {
    const box = redraftEditor(api(load()), () => undefined);
    await settle();
    expect([...box.querySelectorAll('.pg-redraft__locked')].map((n) => n.textContent)).toEqual(['Before words. ', ' After words.']);
    const areas = box.querySelectorAll('textarea');
    expect(areas.length).toBe(1);
    expect(areas[0]!.value).toBe('Middle words.');
  });

  it('the whole piece gives a box per field under its prompt, resuming saved words', async () => {
    const box = redraftEditor(api(load({ scope: 'whole', working: { answers: { q1: 'Saved.' } } })), () => undefined);
    await settle();
    expect(box.querySelector('textarea')!.value).toBe('Saved.');
    expect(box.textContent).toContain('How?');
  });

  it('saves as they stop typing, flushes on send, then calls back', async () => {
    const a = api(load());
    const sent = vi.fn();
    const box = redraftEditor(a, sent);
    await settle();
    const area = box.querySelector('textarea')!;
    area.value = 'New words.';
    area.dispatchEvent(new Event('input'));
    box.querySelector<HTMLButtonElement>('[data-action="send"]')!.click();
    await vi.waitFor(() => expect(sent).toHaveBeenCalled());
    expect(a.save).toHaveBeenCalledWith('answers', 'q1', 'New words.');
    expect(a.send).toHaveBeenCalled();
  });

  it('keeps the words and shows a retry when sending fails', async () => {
    const a = api(load());
    a.send = vi.fn().mockRejectedValue(new Error('Write something before you send it.'));
    const box = redraftEditor(a, () => undefined);
    await settle();
    box.querySelector<HTMLButtonElement>('[data-action="send"]')!.click();
    await vi.waitFor(() => expect(box.querySelector('.pg-redraft__status')!.textContent).toContain('Write something'));
    expect(box.querySelector('textarea')!.value).toBe('Middle words.');
    expect(box.querySelector<HTMLButtonElement>('[data-action="send"]')!.disabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --root apps/teaching tests/unit/redraft-editor.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement.** Create `apps/teaching/src/student/redraft-editor.ts`:

```ts
/** Where a student rewrites a returned piece: the section their teacher chose, or the whole thing. Saves as they type. */
import { button, el, errorText } from '@/quiz/dom';

export type RedraftScope = 'whole' | { part: string; field: string; start: number; end: number };
export type RedraftLoad = { scope: RedraftScope; text: Record<string, Record<string, string>>; prompts: Record<string, string>; working: Record<string, Record<string, string>> };
export type RedraftApi = {
  load: () => Promise<RedraftLoad>;
  save: (part: string, field: string, text: string) => Promise<unknown>;
  send: () => Promise<unknown>;
};

const SAVE_AFTER = 800;

export function redraftEditor(api: RedraftApi, onSent: () => void): HTMLElement {
  const root = el('div', 'pg-redraft');
  const status = el('p', 'pg-redraft__status');
  status.setAttribute('role', 'status');
  root.append(el('p', 'pm-empty', 'Loading…'));
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pending = new Map<string, () => Promise<unknown>>();

  const flush = async (): Promise<void> => {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    const work = [...pending.values()];
    pending.clear();
    for (const run of work) await run();
  };

  const box = (part: string, field: string, value: string, label: string): HTMLTextAreaElement => {
    const area = el('textarea', 'pg-redraft__box');
    area.value = value;
    area.setAttribute('aria-label', label);
    area.addEventListener('input', () => {
      const key = `${part}|${field}`;
      clearTimeout(timers.get(key));
      pending.set(key, () => api.save(part, field, area.value).then(() => { status.textContent = 'Saved'; }));
      timers.set(key, setTimeout(() => {
        void flush().catch((e: unknown) => { status.textContent = errorText(e, 'Couldn’t save. Your words are still here. Try again.'); });
      }, SAVE_AFTER));
    });
    return area;
  };

  void api.load().then(
    ({ scope, text, prompts, working }) => {
      root.replaceChildren();
      if (scope === 'whole') {
        for (const [part, fields] of Object.entries(text)) {
          for (const [field, value] of Object.entries(fields)) {
            if (prompts[field]) root.append(el('p', 'pg-redraft__prompt', prompts[field]));
            root.append(box(part, field, working[part]?.[field] ?? value, prompts[field] ?? 'Your answer'));
          }
        }
      } else {
        const value = text[scope.part]?.[scope.field] ?? '';
        if (prompts[scope.field]) root.append(el('p', 'pg-redraft__prompt', prompts[scope.field]!));
        root.append(
          el('span', 'pg-redraft__locked', value.slice(0, scope.start)),
          box(scope.part, scope.field, working[scope.part]?.[scope.field] ?? value.slice(scope.start, scope.end), 'Your redraft of this section'),
          el('span', 'pg-redraft__locked', value.slice(scope.end))
        );
      }
      const send = button('Send my redraft', 'primary', () => {
        send.disabled = true;
        status.textContent = '';
        void flush().then(() => api.send()).then(onSent, (e: unknown) => {
          status.textContent = errorText(e, 'Couldn’t send it. Your words are still here. Try again.');
          send.disabled = false;
        });
      });
      send.dataset.action = 'send';
      root.append(status, send);
    },
    (e: unknown) => root.replaceChildren(el('p', 'pm-empty', errorText(e, 'Couldn’t open your redraft. Try again.')))
  );
  return root;
}
```

Append to `apps/teaching/src/student/profile.css`:

```css
.pg-redraft { display: grid; gap: var(--space-2); justify-items: start; }
.pg-redraft__prompt { margin: 0; font-size: var(--text-sm); color: var(--muted); }
.pg-redraft__locked { color: var(--muted); line-height: 1.7; }
.pg-redraft__box { width: 100%; min-height: 110px; font: inherit; line-height: 1.6; padding: var(--space-2) var(--space-3); border: 1px solid var(--line); border-radius: var(--radius-sm, .875rem); background: var(--surface); color: inherit; }
.pg-redraft__status { margin: 0; min-height: 1.4em; font-size: var(--text-sm); color: var(--muted); }
.pg-ask { background: var(--pastel-gold); color: var(--pastel-gold-ink); border-radius: var(--radius-sm, .875rem); padding: var(--space-2) var(--space-3); font-weight: 600; margin: 0 0 var(--space-3); }
.pg-drafts { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
.pg-draft-pill { border: 1px solid var(--line); background: var(--surface); color: var(--muted); border-radius: 999px; padding: 4px 12px; min-height: 36px; font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
.pg-draft-pill.is-on { background: var(--navy); border-color: var(--navy); color: #fff; }
.pg-returned__ask { display: block; font-size: var(--text-sm); color: var(--pastel-gold-ink); font-weight: 600; }
```

Check these tokens against the ones `profile.css` already uses, and swap to its own where they differ.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run --root apps/teaching tests/unit/redraft-editor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/teaching/src/student/redraft-editor.ts apps/teaching/src/student/profile.css apps/teaching/tests/unit/redraft-editor.test.ts
git commit -m "Redrafting: the student's rewrite box"
```

### Task 8: Returned work and the hand-in bar

**Files:**
- Modify: `apps/teaching/src/student/returned-view.ts`, `profile-view.ts`, `work-sync.ts`
- Test: `apps/teaching/tests/unit/returned-redraft.test.ts`

- [ ] **Step 1: Write the failing test.** Create `apps/teaching/tests/unit/returned-redraft.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { pieceView, returnedList, type PiecePayload } from '@/student/returned-view';

const piece = (over: Partial<PiecePayload> = {}): PiecePayload => ({
  id: 'w:l1:b1', kind: 'written', title: 'Harbour', date: '3 Nov', comment: 'Well found.',
  text: { answers: { q1: 'Latest words.' } }, tags: [],
  criteria: [{ label: 'Analysis', step: 'secure' as never, was: null, first: 'building' as never }],
  ...over
});
const api = () => ({ load: vi.fn().mockResolvedValue({ scope: 'whole', text: { answers: { q1: 'Latest words.' } }, prompts: {}, working: {} }), save: vi.fn(), send: vi.fn() });

describe('returned piece with drafts', () => {
  it('names the first step when a redraft moved it', () => {
    expect(pieceView(piece(), () => undefined).textContent).toContain('Building, then Secure after redraft');
  });
  it('flips between drafts', () => {
    const root = pieceView(piece({ draft: 2, drafts: [{ n: 1, text: { answers: { q1: 'Old words.' } }, tags: [], comment: 'Earlier note.', date: '1 Nov' }] }), () => undefined);
    expect(root.textContent).toContain('Latest words.');
    [...root.querySelectorAll<HTMLElement>('.pg-draft-pill')].find((b) => b.textContent === 'Draft 1')!.click();
    expect(root.textContent).toContain('Old words.');
    expect(root.textContent).toContain('Earlier note.');
  });
  it('an ask opens the editor when the student can act on it', () => {
    const root = pieceView(piece({ redraft: { scope: 'whole' } }), () => undefined, { redraft: api(), onSent: () => undefined });
    expect(root.querySelector('.pg-ask')!.textContent).toBe('Your teacher asked for a redraft of this piece.');
    expect(root.querySelector('.pg-redraft')).not.toBeNull();
  });
  it('an ask is only a note in the teacher view', () => {
    const root = pieceView(piece({ redraft: { scope: { part: 'answers', field: 'q1', start: 0, end: 3 } } }), () => undefined);
    expect(root.querySelector('.pg-ask')!.textContent).toBe('Your teacher asked for a redraft of one section.');
    expect(root.querySelector('.pg-redraft')).toBeNull();
  });
  it('a sent redraft says so', () => {
    expect(pieceView(piece({ sent: true }), () => undefined).querySelector('.pg-ask')!.textContent).toBe('Sent. Your teacher has it.');
  });
});

describe('returned list', () => {
  it('flags an ask until it is sent', () => {
    const box = returnedList([{ id: 'w:l:b', kind: 'written', title: 'Harbour', date: '3 Nov', new: false, redraft: 'asked' }] as never, () => undefined);
    expect(box.querySelector('.pg-returned__ask')!.textContent).toBe('Redraft asked');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run --root apps/teaching tests/unit/returned-redraft.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `returned-view.ts`.** Import the editor: `import { redraftEditor, type RedraftApi, type RedraftScope } from '@/student/redraft-editor';`. Extend `PiecePayload` and the criteria row:

```ts
  criteria: { label: string; step: Place | null; was: Place | null; first?: Place }[];
  draft?: number;
  drafts?: { n: number; text: Record<string, Record<string, string>>; tags: PieceTag[]; comment: string; date: string }[];
  redraft?: { scope: RedraftScope };
  sent?: boolean;
```

Add `redraft?: 'asked' | 'sent'` to `ReturnedItem`. In `returnedList`, after the `const t` line's `if (item.new)`:

```ts
    if (item.redraft) t.append(el('span', 'pg-returned__ask', item.redraft === 'asked' ? 'Redraft asked' : 'Sent to your teacher'));
```

In `sideBoxes`, give it a comment override and the first-step line:

```ts
function sideBoxes(p: PiecePayload, comment = p.comment): HTMLElement {
```

using `comment` in place of `p.comment` in that function. Replace the `delta` line:

```ts
      const moved = cr.first && cr.step && cr.first !== cr.step ? `${placeName(cr.first)}, then ${placeName(cr.step)} after redraft` : '';
      const delta = moved || (!cr.was || !cr.step ? '' : cr.was === cr.step ? 'same as last time' : rank(cr.was) < rank(cr.step) ? `up from ${placeName(cr.was)}` : '');
```

Change the signature:

```ts
export type PieceViewOptions = { redraft?: RedraftApi; onSent?: () => void };
export function pieceView(p: PiecePayload | NotePayload, onBack: () => void, o: PieceViewOptions = {}): HTMLElement {
```

Replace everything from `const cols = el('div', 'pg-piece__cols');` to the end of the function:

```ts
  if (p.sent) root.append(el('p', 'pg-ask', 'Sent. Your teacher has it.'));
  else if (p.redraft) root.append(el('p', 'pg-ask', p.redraft.scope === 'whole' ? 'Your teacher asked for a redraft of this piece.' : 'Your teacher asked for a redraft of one section.'));
  const canRewrite = Boolean(p.redraft && o.redraft);
  const cols = el('div', 'pg-piece__cols');
  const left = el('div');
  const side = el('div');
  type View = 'write' | 'latest' | number;
  let view: View = canRewrite ? 'write' : 'latest';
  const earlier = [...(p.drafts ?? [])].reverse();
  const tabs: Array<[View, string]> = [
    ...(canRewrite ? [['write', 'Your redraft'] as [View, string]] : []),
    ...(earlier.length || canRewrite ? [['latest', `Draft ${p.draft ?? 1}`] as [View, string]] : []),
    ...earlier.map((d) => [d.n, `Draft ${d.n}`] as [View, string])
  ];
  // The editor keeps its words when the student flips to read their feedback.
  const editor = canRewrite ? redraftEditor(o.redraft!, () => o.onSent?.()) : null;
  const paint = (): void => {
    left.replaceChildren();
    if (tabs.length > 1) {
      const row = el('div', 'pg-drafts');
      for (const [to, label] of tabs) {
        const b = el('button', `pg-draft-pill${view === to ? ' is-on' : ''}`, label);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(view === to));
        b.addEventListener('click', () => { view = to; paint(); });
        row.append(b);
      }
      left.append(row);
    }
    const past = typeof view === 'number' ? p.drafts?.find((d) => d.n === view) : null;
    side.replaceChildren(sideBoxes(p, past ? past.comment : p.comment));
    if (view === 'write' && editor) left.append(editor);
    else writingInto(left, past?.text ?? p.text, past?.tags ?? p.tags, past?.comment ?? p.comment);
  };
  paint();
  cols.append(left, side);
  root.append(cols);
  return root;
}

/** A draft's words with its highlights; tapping one explains it. A note has no typed text, so each tag is its own line. */
function writingInto(left: HTMLElement, text: PiecePayload['text'], tagged: PieceTag[], comment: string): void {
  const pop = el('div', 'pg-pop');
  pop.hidden = true;
  if (text) {
    for (const [part, fields] of Object.entries(text)) {
      for (const [field, words] of Object.entries(fields)) {
        const tags = tagged.filter((t) => t.part === part && t.field === field);
        const marks: Mark[] = tags.map((t, i) => ({ start: t.start, end: t.end, layer: i, colour: `var(--pastel-${t.colour}-ink)` }));
        const sheet = paper(words, marks, null);
        sheet.addEventListener('click', (e) => {
          const run = (e.target as HTMLElement).closest<HTMLElement>('.pa-run--mark');
          if (!run) return;
          const at = Number(run.dataset.start);
          const tag = tags.find((t) => t.start <= at && t.end > at);
          if (!tag) return;
          pop.replaceChildren(...explain(tag));
          pop.hidden = false;
        });
        left.append(sheet);
      }
    }
    left.append(pop, el('p', 'pg-hint', 'Tap a highlight to see what it means.'));
    return;
  }
  const list = el('ul', 'pg-viva');
  for (const tag of tagged) {
    const item = el('li', 'pg-box');
    if (tag.quote) item.append(el('p', 'pg-pop__note', `“${tag.quote}”`));
    item.append(...explain(tag));
    list.append(item);
  }
  if (tagged.length) left.append(list);
  else left.append(el('p', 'pm-empty', comment ? 'Your teacher left a comment on this one.' : 'Your teacher has marked this. There are no notes on it yet.'));
}
```

The `.pg-piece__cols > *` rule still applies, since `left` and `side` are direct children. If the side column's layout needs `.pg-piece__side` as the direct child, append `sideBoxes(...)` straight to `cols` and replace it on each paint instead.

- [ ] **Step 4: Wire `profile-view.ts`.** Add to `RenderProfileOptions`: `redraft?: (item: string) => RedraftApi;`, importing the type from `@/student/redraft-editor`. In `returnedPanel`'s `open`:

```ts
        const redraft = id.startsWith('w:') && 'redraft' in piece && piece.redraft ? options.redraft?.(id) : undefined;
        panel.replaceChildren(pieceView(piece, showList, redraft ? { redraft, onSent: () => open(id) } : {}));
```

In the mount, next to `loadPiece`:

```ts
        redraft: (item) => {
          const [, lessonId = '', blockId = ''] = item.split(':');
          const work = <T>(action: string, extra: Record<string, unknown> = {}): Promise<T> =>
            apiPost<T>(`/api/published/work/${encodeURIComponent(lessonId)}`, { action, block_id: blockId, class_id: classId, class_token: deviceToken(`class:${classId}`), ...extra });
          return {
            load: () => work('redraft_load'),
            save: (part, field, text) => work('redraft_save', { part, field, text }),
            send: () => work('redraft_send')
          };
        },
```

- [ ] **Step 5: Update the hand-in bar in `work-sync.ts`.** Add `redrafts?: Record<string, 'asked' | 'with_teacher'>` to `Reply`. Add `let redrafts: Record<string, 'asked' | 'with_teacher'> = {};` beside `marked`. Change `showHandIn` to take and keep them:

```ts
  function showHandIn(blockIds: string[] | undefined, states?: Reply['redrafts']): void {
    marked = blockIds ?? [];
    redrafts = states ?? {};
```

Update both callers to `showHandIn(reply.handin_blocks, reply.redrafts);`. At the top of `handInBar`:

```ts
    if (redrafts[blockId]) {
      const handin = el('div', 'ws-handin');
      const note = el('p', 'ws-handin__note', redrafts[blockId] === 'asked' ? 'Your teacher asked for a redraft. ' : 'Your redraft is with your teacher.');
      if (redrafts[blockId] === 'asked') {
        const link = el('a', undefined, 'Open it in Returned work');
        link.href = withAppBase(`/s/classes/${encodeURIComponent(classId)}/profile`);
        note.append(link);
      }
      handin.append(note);
      return handin;
    }
```

Add `import { withAppBase } from '@/app/base-path';` at the top; `classId` is already in scope from `options`. In the footer's loop, change `for (const id of marked) {` to:

```ts
      for (const id of marked.filter((m) => !redrafts[m])) {
```

- [ ] **Step 6: Run to verify they pass**

Run: `npx vitest run --root apps/teaching tests/unit/returned-redraft.test.ts tests/unit/redraft-editor.test.ts`
Expected: PASS.

Run: `npm --prefix apps/teaching run typecheck` (or `npx tsc --noEmit -p apps/teaching` if there's no such script)
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src/student apps/teaching/tests/unit/returned-redraft.test.ts
git commit -m "Redrafting: draft tabs, ask banner and hand-in bar for students"
```

---

## Main session

### Task 9: Walk, gate and PR

- [ ] **Step 1: Link dependencies.** The worktree needs `node_modules`; see `student-progress-feedback` in memory for the symlink note. Add a `redraft-dev` entry to `.claude/launch.json` pinned to the redraft worktree, and start it with `preview_start`.

- [ ] **Step 2: Walk in the dev mock, desktop and 390px.** Teacher: `/mark/class_2026_12engadv2/...`, from the sixth piece waiting. Student: `/s/classes/class_2026_12engadv2/profile`, initials AN. Check, in order:
  1. Section ask, with the gold section showing and the Return button refusing until there is one.
  2. Student rewrites, reloads, and finds their words kept. Only the section can be edited.
  3. The lesson's Hand in bar links to the redraft.
  4. To mark shows "Redraft 2", and the quiet line while it's asked.
  5. Changes tab, then Draft 2 and Draft 1 tabs, and the earlier comment beside them.
  6. One-tap Return, then the student's draft tabs and "Building, then Secure after redraft".
  7. A second ask for the whole piece.
  8. Take back mid-way, and the student's refusal message.
  9. Real text on the marking side panel: does the choice fit? If not, move it next to the bar's Return button.

  Screenshots stay out of the PR unless they show invented data only.

- [ ] **Step 3: Check the gate's triggers.** Run `git diff --stat origin/main...HEAD`. Nothing should touch grove, `packages/`, `apps/tasks`, the gate script or workflows. If the gate says "full suite", stop and find out why.

- [ ] **Step 4: Run the gate**

Run: `CB_BOOK_PACK=/nonexistent npm run pre-pr-check`
Expected: exit 0. If block-text baselines change, refresh them with `UPDATE_BLOCK_TEXT=1` only if the difference is intended.

- [ ] **Step 5: Push, open the PR ready for review, and enable auto-merge**

```bash
git push -u origin claude/redrafting
gh pr create --title "Redrafting: rewrite returned written work" --body-file /tmp/redraft-pr.md
```

Use invented data only in the body, and end it with the attribution line. Then bind the PR with the `ccd_pr` tools and enable auto-merge (merge commit). Say plainly what wasn't walked: live site, Safari and touch drag.

---

## Self-review

| Spec section | Task |
|---|---|
| Who decides, whole or section | 1, 5 |
| Rewrite on the returned piece, saves as they type | 2, 7, 8 |
| To mark label and quiet line | 1, 6 |
| Changes tab, earlier feedback, pale step, empty comment | 2, 5 |
| Latest step counts, first visible | 2, 3, 8 |
| Data records, including archive and rollup | 1, 2 |
| Hand-in refusal and bar states | 4, 8 |
| Carried rubric passes Return | 2 |
| Patterns count earlier codes once | 1, 3 |
| Returned work keeps a sent piece listed | 3, 8 |
| Next-step picks | 2 |
| Edge cases: take back, unlink, republish, blank, unchanged, failed save | 2, 7 |
| Wording | 7, 8 |
| Walk list | 9 |
