# Anthology Class Knowledge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Students add knowledge from their pre-readings to a unit's Anthology map, shown on a Class tab beside the teacher's poem notes and joined to them through shared themes and concepts.

**Architecture:** A new server module keeps student items in their own store for each unit (`anthology-knowledge/{unit}/…`), behind one public endpoint (list shown items, add one) and one teacher endpoint (list everything, show/hide/delete). The client gets a small API wrapper, the graph builder takes optional knowledge items (drawn as hollow rings through a new opt-in `ringFor` graph option), and the Anthology view gains a Teacher | Class switch, an Add card and teacher controls.

**Tech Stack:** Netlify Functions (`.mjs`, Netlify Blobs store), `node:test` for server tests, TypeScript + Vitest (jsdom) for the Teaching app, the Knowledge Hub `forceGraph` canvas map.

**Spec:** `apps/teaching/docs/superpowers/specs/2026-10-31-anthology-class-knowledge-design.md`

**Worktree:** `~/Projects/life-hub-class-knowledge`, branch `claude/anthology-class-knowledge`. This branch is based on `main` from before PR 1245 (map remount + on-map note card), so **Task 0 merges `main` first**. Tasks 4 and 5 build on 1245's `pop` card.

**Build style (Adam's rule):** few big chunks, one PR, gate once at the end. Run each task's own tests; do not run the full gate until Task 6.

**Privacy:** the repo is public. Fixtures and tests use invented text only: no real poem lines, students or teachers.

---

## File map

| File | Responsibility |
|---|---|
| Create `netlify/functions/_shared/anthology-knowledge.mjs` | Store keys, validation, allowed tags, list/add/moderate |
| Create `netlify/functions/published-anthology-knowledge.mjs` | Public GET/POST at `/api/published/anthology-knowledge/:unit` |
| Create `netlify/functions/anthology-knowledge.mjs` | Teacher GET/POST at `/api/units/:unit/anthology-knowledge` |
| Create `tests/unit/anthology-knowledge.test.js` | Server tests |
| Modify `apps/knowledge/src/archive/forceGraph.ts` | Opt-in `ringFor` option: draw chosen notes as hollow rings |
| Create `apps/teaching/src/blocks/anthology-knowledge.ts` | Item type, student/teacher API, ids, tag list |
| Modify `apps/teaching/src/blocks/anthology-graph.ts` | `buildAnthologyGraph(data, grouping, knowledge)` |
| Modify `apps/teaching/src/blocks/anthology-view.ts` | Teacher/Class switch, Add card, knowledge cards, moderation |
| Modify `apps/teaching/src/blocks/render.ts` | `anthologyKnowledge` in `RenderContext`, pass to the view |
| Modify `apps/teaching/src/teacher/sections/units.ts` | Pass the teacher API |
| Modify `apps/teaching/src/student/unit-view.ts` | Pass the student API |
| Modify `apps/teaching/src/styles/app.css` | Switch, Add card, knowledge card styles (then regenerate `packages/block-styles/blocks.css`) |
| Modify `apps/teaching/scripts/mock-api.ts` | Route both endpoints to the real Functions for local walks |
| Modify `apps/teaching/tests/unit/anthology-graph.test.ts` | Graph and view tests |

---

### Task 0: Bring in PR 1245

- [ ] **Step 1: Merge main**

```bash
cd ~/Projects/life-hub-class-knowledge
git fetch origin main
git merge --no-edit origin/main
grep -n "block-anthology__pop" apps/teaching/src/blocks/anthology-view.ts | head -2
```

Expected: the merge succeeds and grep prints lines (1245 is in). If 1245 hasn't merged yet, merge `origin/claude/anthology-remount` instead.

- [ ] **Step 2: Install**

```bash
npm ci --no-audit --no-fund --loglevel=error
```

---

### Task 1: Server store, endpoints, tests

**Files:** create `netlify/functions/_shared/anthology-knowledge.mjs`, `netlify/functions/published-anthology-knowledge.mjs`, `netlify/functions/anthology-knowledge.mjs`, `tests/unit/anthology-knowledge.test.js`

- [ ] **Step 1: Write the failing tests** in `tests/unit/anthology-knowledge.test.js`

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeAction, MAX_PER_INITIALS } from '../../netlify/functions/_shared/anthology-knowledge.mjs';

const anthologyBlock = { id: 'anth1', block_type: 'anthology', visibility: 'student_teacher', content: { title: 'Map' } };
const noteBlock = {
  id: 'ann1', block_type: 'annotation', visibility: 'student_teacher',
  content: {
    text: 'An invented line about rain.',
    anthology: { whole_text: true, themes: ['Hope and growth'], concepts: ['Perspective'] },
    annotations: []
  }
};

function storeFixture({ withMap = true } = {}) {
  const data = new Map([
    ['units/unit1', { title: 'Invented unit', lesson_ids: ['lesson1'], blocks: withMap ? [anthologyBlock] : [] }],
    ['published/lessons/lesson1', { lesson_id: 'lesson1', unit_id: 'unit1', title: 'Poem one', blocks: [noteBlock] }]
  ]);
  return {
    data,
    async get(key, options) { assert.equal(options.consistency, 'strong'); return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; }
  };
}
const add = (store, extra = {}) => knowledgeAction(store, 'unit1', 'POST', {
  action: 'add', title: 'Rain as renewal', quote: 'An invented sentence from an invented article.',
  info: 'The article says rain marks a fresh start.', themes: ['Hope and growth'], concepts: [], initials: 'ab', ...extra
});
const studentList = store => knowledgeAction(store, 'unit1', 'GET', {});
const teacher = (store, method, body = {}) => knowledgeAction(store, 'unit1', method, body, { teacher: true });

test('a clean item shows at once and students never see initials', async () => {
  const store = storeFixture();
  const sent = await add(store);
  assert.equal(sent.status, 'shown');
  const { items } = await studentList(store);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Rain as renewal');
  assert.equal('initials' in items[0], false);
  const all = await teacher(store, 'GET');
  assert.equal(all.items[0].initials, 'AB');
  assert.equal(all.items[0].status, 'shown');
});

test('only the unit\'s own themes and concepts are kept; none left is refused', async () => {
  const store = storeFixture();
  await add(store, { themes: ['Hope and growth', 'Made up'], concepts: ['Perspective', 'Nope'] });
  const [item] = (await studentList(store)).items;
  assert.deepEqual(item.themes, ['Hope and growth']);
  assert.deepEqual(item.concepts, ['Perspective']);
  await assert.rejects(add(store, { themes: ['Made up'], concepts: [] }), { code: 'no_tags' });
});

test('title and quote are required, and long text is cut', async () => {
  const store = storeFixture();
  await assert.rejects(add(store, { title: '  ' }), { code: 'missing_title' });
  await assert.rejects(add(store, { quote: '' }), { code: 'missing_quote' });
  await assert.rejects(add(store, { initials: 'a' }), { code: 'bad_initials' });
  await add(store, { title: 'x'.repeat(200) });
  assert.equal((await studentList(store)).items[0].title.length, 80);
});

test('a flagged item waits for the teacher, who can show it', async () => {
  const store = storeFixture();
  const sent = await add(store, { info: 'what a load of sh1t' });
  assert.equal(sent.status, 'waiting');
  assert.equal((await studentList(store)).items.length, 0);
  const [waiting] = (await teacher(store, 'GET')).items;
  assert.equal(waiting.status, 'waiting');
  await teacher(store, 'POST', { action: 'show', id: waiting.id });
  assert.equal((await studentList(store)).items.length, 1);
});

test('the teacher can hide and delete', async () => {
  const store = storeFixture();
  await add(store);
  const [item] = (await teacher(store, 'GET')).items;
  await teacher(store, 'POST', { action: 'hide', id: item.id });
  assert.equal((await studentList(store)).items.length, 0);
  assert.equal((await teacher(store, 'GET')).items[0].status, 'hidden');
  await teacher(store, 'POST', { action: 'delete', id: item.id });
  assert.equal((await teacher(store, 'GET')).items.length, 0);
});

test('one set of initials can add only so many', async () => {
  const store = storeFixture();
  for (let i = 0; i < MAX_PER_INITIALS; i++) await add(store, { title: `Idea ${i}` });
  await assert.rejects(add(store), { code: 'too_many' });
});

test('a unit with no Anthology block has no class map', async () => {
  await assert.rejects(add(storeFixture({ withMap: false })), { code: 'not_found' });
});

test('students cannot moderate', async () => {
  const store = storeFixture();
  await add(store);
  const [item] = (await teacher(store, 'GET')).items;
  await assert.rejects(knowledgeAction(store, 'unit1', 'POST', { action: 'hide', id: item.id }), { code: 'bad_action' });
});
```

Before relying on the fixture's annotation shape, check how `collectAnthology` (`netlify/functions/_shared/teaching-anthology.mjs`) reads tags from a block, and adjust `noteBlock` so it yields one item tagged `Hope and growth` / `Perspective`. The fixture `apps/teaching/fixtures/annotation-anthology.json` shows a working shape.

- [ ] **Step 2: Run to see it fail**

Run: `node --test tests/unit/anthology-knowledge.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Write `netlify/functions/_shared/anthology-knowledge.mjs`**

```js
/**
 * Class knowledge on a unit's Anthology map: students add what they took from the
 * pre-readings (a title, a line from the article, a note, and some of the unit's own
 * themes or concepts). Students only ever add; the teacher shows, hides or deletes.
 *
 *   anthology-knowledge/{unit}/items/{id}       { title, quote, info, themes, concepts, initials, flagged, created_at }, create-only
 *   anthology-knowledge/{unit}/moderation/{id}  { status: shown | hidden } (teacher)
 *
 * Allowed tags come from the unit's published lessons, never the request.
 */
import { randomBytes } from 'node:crypto';
import { isSafeId } from './class-examples.mjs';
import { isDeletedRecord } from './record-liveness.mjs';
import { PUBLISHED_LESSON_PREFIX, unitKey } from './teaching-blobs.mjs';
import { flagText } from './peer-feedback-filter.mjs';
import { collectAnthology } from './teaching-anthology.mjs';

const STRONG = { type: 'json', consistency: 'strong' };
export const LIMITS = { title: 80, quote: 600, info: 1200 };
/** One device (one set of initials) can't flood the map. */
export const MAX_PER_INITIALS = 30;
const MAX_ITEMS = 600;

export class KnowledgeError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const reject = (status, code, message) => {
  throw new KnowledgeError(status, code, message);
};
const read = (store, key) => store.get(key, STRONG);
const base = (unit) => `anthology-knowledge/${unit}`;
const itemKey = (unit, id) => `${base(unit)}/items/${id}`;
const moderationKey = (unit, id) => `${base(unit)}/moderation/${id}`;
const validId = (id) => typeof id === 'string' && /^[a-z0-9]{6,12}-[a-f0-9]{8}$/.test(id);

function hasAnthologyBlock(blocks) {
  for (const b of blocks ?? []) {
    if (b.visibility === 'teacher_only') continue;
    if (b.block_type === 'anthology') return true;
    const nested = [
      b.content?.blocks,
      ...(b.content?.columns ?? []).map((c) => c.blocks),
      ...(b.content?.tabs ?? []).map((t) => t.blocks)
    ];
    if (nested.some((children) => hasAnthologyBlock(children))) return true;
  }
  return false;
}

async function liveUnit(store, unit) {
  if (!isSafeId(unit)) reject(404, 'not_found', 'This unit has no class map.');
  const record = await read(store, unitKey(unit));
  if (!record?.title || isDeletedRecord(record) || !hasAnthologyBlock(record.blocks)) {
    reject(404, 'not_found', 'This unit has no class map.');
  }
  return record;
}

/** The themes and concepts students may pick: the unit's own, from its published lessons. */
async function allowedTags(store, unit, record) {
  const { blobs } = await store.list({ prefix: PUBLISHED_LESSON_PREFIX });
  const snapshots = (await Promise.all(blobs.map((blob) => read(store, blob.key))))
    .filter((snap) => snap?.unit_id === unit && snap.lesson_id);
  const anthology = collectAnthology(
    snapshots.map((snap) => ({
      lesson_id: snap.lesson_id,
      lesson_title: snap.title ?? '',
      published: true,
      blocks: Array.isArray(snap.blocks) ? snap.blocks : []
    })),
    { lessonOrder: record.lesson_ids ?? [] }
  );
  return {
    themes: new Set(anthology.items.flatMap((item) => item.themes)),
    concepts: new Set(anthology.items.flatMap((item) => item.concepts))
  };
}

const oneLine = (value, max) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const paragraph = (value, max) =>
  typeof value === 'string' ? value.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max) : '';
const pick = (values, allowed) =>
  [...new Set((Array.isArray(values) ? values : []).filter((v) => typeof v === 'string' && allowed.has(v)))];
const cleanInitials = (value) => (typeof value === 'string' ? value.replace(/[^A-Za-z]/g, '').toUpperCase() : '');

function statusOf(item, moderation) {
  if (moderation?.status === 'hidden') return 'hidden';
  if (moderation?.status === 'shown') return 'shown';
  return item.flagged ? 'waiting' : 'shown';
}

/** Every item with its status, oldest first. */
async function allItems(store, unit) {
  const { blobs } = await store.list({ prefix: `${base(unit)}/items/` });
  const rows = await Promise.all(
    blobs.map(async ({ key }) => {
      const id = key.slice(key.lastIndexOf('/') + 1);
      const [item, moderation] = await Promise.all([read(store, key), read(store, moderationKey(unit, id))]);
      return item ? { id, ...item, status: statusOf(item, moderation) } : null;
    })
  );
  return rows.filter(Boolean).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
}

const forStudents = ({ id, title, quote, info, themes, concepts, created_at }) => ({ id, title, quote, info, themes, concepts, created_at });
const forTeacher = ({ id, title, quote, info, themes, concepts, created_at, initials, status }) => ({
  id, title, quote, info, themes, concepts, created_at, initials, status
});

async function addItem(store, unit, record, body) {
  const title = oneLine(body.title, LIMITS.title);
  const quote = paragraph(body.quote, LIMITS.quote);
  const info = paragraph(body.info, LIMITS.info);
  const initials = cleanInitials(body.initials);
  if (!title) reject(400, 'missing_title', 'Give it a short title.');
  if (!quote) reject(400, 'missing_quote', 'Add the quote or line from the article.');
  if (initials.length < 2 || initials.length > 4) reject(400, 'bad_initials', 'Type your initials (2 to 4 letters).');
  const allowed = await allowedTags(store, unit, record);
  const themes = pick(body.themes, allowed.themes);
  const concepts = pick(body.concepts, allowed.concepts);
  if (!themes.length && !concepts.length) reject(400, 'no_tags', 'Pick at least one theme or concept.');
  const existing = await allItems(store, unit);
  if (existing.length >= MAX_ITEMS) reject(429, 'map_full', 'The class map is full.');
  if (existing.filter((item) => item.initials === initials).length >= MAX_PER_INITIALS) {
    reject(429, 'too_many', 'You have added the most you can for this unit.');
  }
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`;
  const item = { title, quote, info, themes, concepts, initials, flagged: flagText(`${title} ${quote} ${info}`), created_at: new Date().toISOString() };
  const saved = await store.setJSON(itemKey(unit, id), item, { onlyIfNew: true });
  if (saved?.modified === false) reject(409, 'retry', 'Please send it again.');
  return { item: forStudents({ id, ...item }), status: statusOf(item, null) };
}

async function moderate(store, unit, body) {
  if (!validId(body.id)) reject(404, 'not_found', 'That item has gone.');
  if (!(await read(store, itemKey(unit, body.id)))) reject(404, 'not_found', 'That item has gone.');
  if (body.action === 'delete') {
    await Promise.all([store.delete(itemKey(unit, body.id)), store.delete(moderationKey(unit, body.id))]);
    return { deleted: body.id };
  }
  await store.setJSON(moderationKey(unit, body.id), { status: body.action === 'show' ? 'shown' : 'hidden' });
  return { id: body.id, status: body.action === 'show' ? 'shown' : 'hidden' };
}

/**
 * GET lists the map (students: shown items, no initials; teacher: everything).
 * POST { action: 'add', … } adds one; the teacher can also POST show | hide | delete.
 */
export async function knowledgeAction(store, unit, method, body, opts = {}) {
  const record = await liveUnit(store, unit);
  if (method === 'GET') {
    const items = await allItems(store, unit);
    return { items: opts.teacher ? items.map(forTeacher) : items.filter((item) => item.status === 'shown').map(forStudents) };
  }
  const action = body?.action;
  if (action === 'add') return addItem(store, unit, record, body);
  if (opts.teacher && ['show', 'hide', 'delete'].includes(action)) return moderate(store, unit, body);
  reject(400, 'bad_action', 'Unknown action.');
}
```

- [ ] **Step 4: Write the two endpoints**

`netlify/functions/published-anthology-knowledge.mjs`:

```js
import { createPublicStudentHandler } from './_shared/public-student-gate.mjs';
import { knowledgeAction, KnowledgeError } from './_shared/anthology-knowledge.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/published/anthology-knowledge/:unit', rateLimit: { action: 'rate_limit', aggregateBy: ['ip', 'domain'], windowLimit: 300, windowSize: 60 } };
export function createPublishedAnthologyKnowledgeHandler(deps = {}) {
  return createPublicStudentHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET' && request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    if (request.method === 'POST') {
      const originError = guardRequestOrigin(request, env);
      if (originError) return withCors(originError, request, env);
      if (Number(request.headers.get('content-length')) > 6000) return withCors(errorResponse(413, 'too_large', 'Keep it shorter.', false), request, env);
    }
    const unit = new URL(request.url).pathname.match(/\/anthology-knowledge\/([^/]+)$/)?.[1];
    try {
      const text = request.method === 'POST' ? await request.text() : '';
      if (text.length > 6000) throw new KnowledgeError(413, 'too_large', 'Keep it shorter.');
      const result = await knowledgeAction(store, unit, request.method, text ? JSON.parse(text) : {});
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof KnowledgeError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createPublishedAnthologyKnowledgeHandler();
```

`netlify/functions/anthology-knowledge.mjs`:

```js
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { knowledgeAction, KnowledgeError } from './_shared/anthology-knowledge.mjs';
import { errorResponse, guardRequestOrigin, okResponse, withCors, methodNotAllowed } from './_shared/http.mjs';
export const config = { path: '/api/units/:unit/anthology-knowledge' };
export function createAnthologyKnowledgeHandler(deps = {}) {
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    if (request.method !== 'GET' && request.method !== 'POST') return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    if (request.method === 'POST') {
      const originError = guardRequestOrigin(request, env);
      if (originError) return withCors(originError, request, env);
    }
    const unit = new URL(request.url).pathname.match(/\/units\/([^/]+)\/anthology-knowledge$/)?.[1];
    try {
      const body = request.method === 'POST' ? await request.json() : {};
      const result = await knowledgeAction(store, unit, request.method, body, { teacher: true });
      return withCors(okResponse(200, result, { 'cache-control': 'no-store' }), request, env);
    } catch (e) {
      if (e instanceof KnowledgeError || e instanceof SyntaxError) return withCors(errorResponse(e.status ?? 400, e.code ?? 'bad_request', e instanceof SyntaxError ? 'Invalid request.' : e.message, false), request, env);
      throw e;
    }
  }, deps);
}
export default createAnthologyKnowledgeHandler();
```

Check that `/api/units/:unit/anthology-knowledge` doesn't clash with an existing `/api/units/:id` function config (grep `path: '/api/units` in `netlify/functions`). Netlify matches the more specific path, as `/api/lessons/:id/brainstorm/:block` does today.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/unit/anthology-knowledge.test.js`
Expected: all 8 pass.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/anthology-knowledge.mjs netlify/functions/published-anthology-knowledge.mjs netlify/functions/anthology-knowledge.mjs tests/unit/anthology-knowledge.test.js
git commit -m "Class knowledge store and endpoints for the Anthology map"
```

---

### Task 2: Hollow-ring notes in the map (opt-in)

**Files:** modify `apps/knowledge/src/archive/forceGraph.ts`

- [ ] **Step 1: Add the option** to `ForceGraphOptions` (after `labelZoom`):

```ts
  /** Show All only: notes drawn as hollow rings (a second kind of note, such as class additions). */
  ringFor?: (pageId: string) => boolean;
```

- [ ] **Step 2: Draw rings.** In `drawShowAllFrame`, in the `// Notes: small cell bodies` loop, replace the final fill (from `ctx.fillStyle = hot ? …` to the closing `ctx.fill();`) with:

```ts
      const bodyR = (((hot ? 2.6 : 0.9 + Math.min(degree, 10) * 0.18) * 1.1) / view.k) * grown;
      const ring = Boolean(node.pageId && options.ringFor?.(node.pageId));
      ctx.globalAlpha = (hot ? 1 : dark ? 0.85 : 0.75) * fade;
      ctx.beginPath();
      ctx.arc(node.x, node.y, ring ? bodyR * 1.5 : bodyR, 0, Math.PI * 2);
      if (ring) {
        ctx.lineWidth = 1.3 / view.k;
        ctx.strokeStyle = hot ? (dark ? "#ffd2a8" : "#a8501a") : node.color;
        ctx.stroke();
      } else {
        ctx.fillStyle = hot ? (dark ? "#ffd2a8" : "#a8501a") : tint(node.color, dark ? 0.3 : 0.2);
        ctx.fill();
      }
```

No other map passes `ringFor`, so the Knowledge Hub is unchanged.

- [ ] **Step 3: Typecheck and run the Knowledge tests**

Run: `npx --prefix apps/knowledge tsc -p apps/knowledge --noEmit && npx --prefix apps/knowledge vitest run --root apps/knowledge tests/unit 2>&1 | tail -4`
Expected: no type errors; tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/knowledge/src/archive/forceGraph.ts
git commit -m "Map: opt-in hollow rings for a second kind of note"
```

---

### Task 3: Client API and graph model

**Files:** create `apps/teaching/src/blocks/anthology-knowledge.ts`; modify `apps/teaching/src/blocks/anthology-graph.ts`; test in `apps/teaching/tests/unit/anthology-graph.test.ts`

- [ ] **Step 1: Write the failing tests.** Append to `anthology-graph.test.ts` (the file already defines `data` with themes `Country`, `Hope` and concept `Style`):

```ts
import { knowledgeNoteId, isKnowledgeNoteId, CLASS_KNOWLEDGE_TEXT, unitTagChoices, type KnowledgeItem } from '@/blocks/anthology-knowledge';

const knowledge: KnowledgeItem[] = [
  { id: 'k1aa00-0000aaaa', title: 'Rain as renewal', quote: 'An invented article line.', info: 'Invented info.', themes: ['Hope'], concepts: [], created_at: '2026-10-31T00:00:00.000Z' }
];

describe('class knowledge on the map', () => {
  it('adds knowledge dots under the same theme hubs, named by title', () => {
    const graph = buildAnthologyGraph(data, 'theme', knowledge);
    const dot = graph.nodes.find((node) => node.pageId === knowledgeNoteId('k1aa00-0000aaaa'));
    expect(dot?.label).toBe('Rain as renewal');
    expect(dot?.hubLabels).toEqual(['Hope']);
    expect(isKnowledgeNoteId(dot!.pageId!)).toBe(true);
  });

  it('puts every knowledge dot under one Class knowledge hub when grouped by text', () => {
    const hubs = buildAnthologyGraph(data, 'poem', knowledge)
      .nodes.filter((node) => node.kind === 'major')
      .map((node) => node.label);
    expect(hubs).toContain(CLASS_KNOWLEDGE_TEXT);
  });

  it('leaves the map unchanged with no knowledge', () => {
    expect(buildAnthologyGraph(data, 'theme', []).nodes.length).toBe(buildAnthologyGraph(data, 'theme').nodes.length);
  });

  it('offers only the unit\'s own themes and concepts', () => {
    expect(unitTagChoices(data)).toEqual({ themes: ['Country', 'Hope'], concepts: ['Style'] });
  });
});
```

If `hubLabels` isn't set on Show All leaves, assert on `parentKeyword` instead (check `apps/knowledge/src/archive/showAllGraph.ts` around line 138).

- [ ] **Step 2: Run to see it fail**

Run: `cd apps/teaching && npx vitest run tests/unit/anthology-graph.test.ts`
Expected: FAIL, cannot find `@/blocks/anthology-knowledge`.

- [ ] **Step 3: Write `apps/teaching/src/blocks/anthology-knowledge.ts`**

```ts
/**
 * Class knowledge: what students add to a unit's Anthology map from their pre-readings.
 * The server keeps it apart from lessons; this file is the client's view of it.
 */
import { apiGet, apiPost } from '@/api/client';
import type { AnthologyData } from '@/blocks/anthology-collect';
import { anthologyMapItems } from '@/blocks/anthology-graph';

export type KnowledgeStatus = 'shown' | 'hidden' | 'waiting';

export type KnowledgeItem = {
  id: string;
  title: string;
  quote: string;
  info: string;
  themes: string[];
  concepts: string[];
  created_at: string;
  /** Teacher only. */
  initials?: string;
  /** Teacher only. */
  status?: KnowledgeStatus;
};

export type KnowledgeDraft = Pick<KnowledgeItem, 'title' | 'quote' | 'info' | 'themes' | 'concepts'> & { initials: string };

export type KnowledgeApi = {
  teacher: boolean;
  list(): Promise<KnowledgeItem[]>;
  add(draft: KnowledgeDraft): Promise<{ item: KnowledgeItem; status: KnowledgeStatus }>;
  moderate?(id: string, action: 'show' | 'hide' | 'delete'): Promise<void>;
};

/** The hub every class item sits under when the map groups by text. */
export const CLASS_KNOWLEDGE_TEXT = 'Class knowledge';

const PREFIX = 'knowledge::';
export const knowledgeNoteId = (id: string): string => `${PREFIX}${id}`;
export const isKnowledgeNoteId = (pageId: string): boolean => pageId.startsWith(PREFIX);

/** The themes and concepts a student may pick: the ones on the teacher's tagged notes. */
export function unitTagChoices(data: AnthologyData): { themes: string[]; concepts: string[] } {
  const items = anthologyMapItems(data);
  const sorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));
  return { themes: sorted(items.flatMap((item) => item.themes)), concepts: sorted(items.flatMap((item) => item.concepts)) };
}

export function studentKnowledgeApi(unitId: string): KnowledgeApi {
  const path = `/api/published/anthology-knowledge/${encodeURIComponent(unitId)}`;
  return {
    teacher: false,
    list: async () => (await apiGet<{ items: KnowledgeItem[] }>(path)).items,
    add: (draft) => apiPost(path, { action: 'add', ...draft })
  };
}

export function teacherKnowledgeApi(unitId: string): KnowledgeApi {
  const path = `/api/units/${encodeURIComponent(unitId)}/anthology-knowledge`;
  return {
    teacher: true,
    list: async () => (await apiGet<{ items: KnowledgeItem[] }>(path)).items,
    add: (draft) => apiPost(path, { action: 'add', ...draft }),
    moderate: async (id, action) => {
      await apiPost(path, { action, id });
    }
  };
}
```

`anthology-knowledge.ts` imports `anthologyMapItems` from `anthology-graph.ts`, and Step 4 makes `anthology-graph.ts` import from `anthology-knowledge.ts`. To avoid a cycle, `anthology-graph.ts` imports **only** `knowledgeNoteId` and `CLASS_KNOWLEDGE_TEXT`, as type-free constants. If the bundler complains, move those two into `anthology-graph.ts` and re-export them from `anthology-knowledge.ts`.

- [ ] **Step 4: Extend `apps/teaching/src/blocks/anthology-graph.ts`**

Add the import:

```ts
import { CLASS_KNOWLEDGE_TEXT, knowledgeNoteId, type KnowledgeItem } from '@/blocks/anthology-knowledge';
```

Change `anthologyHubColours` to take the knowledge too:

```ts
export function anthologyHubColours(
  data: AnthologyData,
  grouping: AnthologyGrouping,
  knowledge: readonly KnowledgeItem[] = []
): Map<string, (typeof KEYWORD_PALETTE)[number]> {
  const titles = textTitles(data);
  const labels =
    grouping === 'poem'
      ? [...data.texts.map((text) => text.title), ...(knowledge.length ? [CLASS_KNOWLEDGE_TEXT] : [])]
      : [
          ...new Set([
            ...anthologyMapItems(data).flatMap((item) => anthologyLabelsFor(item, grouping, titles)),
            ...knowledge.flatMap((item) => (grouping === 'theme' ? item.themes : item.concepts))
          ])
        ].sort((a, b) => a.localeCompare(b));
  return new Map(labels.map((label, index) => [label, KEYWORD_PALETTE[index % KEYWORD_PALETTE.length]!]));
}
```

Replace `buildAnthologyGraph`:

```ts
export function buildAnthologyGraph(
  data: AnthologyData,
  grouping: AnthologyGrouping,
  knowledge: readonly KnowledgeItem[] = []
): ArchiveGraphModel {
  const titles = textTitles(data);
  const items = anthologyMapItems(data);
  const labelsById = new Map<string, string[]>();
  const entries: PageManifestEntry[] = items.map((item) => {
    const id = anthologyNoteId(item);
    labelsById.set(id, anthologyLabelsFor(item, grouping, titles));
    return {
      id,
      title: `“${shortQuote(item.quote)}”`,
      area: 'notes',
      tags: [],
      excerpt: [item.note, titles.get(item.block_id) ?? item.lesson_title, ...item.themes, ...item.concepts]
        .filter(Boolean)
        .join(' · ')
    };
  });
  for (const item of knowledge) {
    const id = knowledgeNoteId(item.id);
    labelsById.set(id, grouping === 'poem' ? [CLASS_KNOWLEDGE_TEXT] : grouping === 'theme' ? item.themes : item.concepts);
    entries.push({
      id,
      title: item.title,
      area: 'notes',
      tags: [],
      excerpt: [item.quote, item.info, ...item.themes, ...item.concepts].filter(Boolean).join(' · ')
    });
  }
  const colours = anthologyHubColours(data, grouping, knowledge);
  return buildShowAllGraph(entries, 'tags', {
    labelsFor: (entry) => labelsById.get(entry.id) ?? [],
    colorFor: (label) => colours.get(label) ?? KEYWORD_PALETTE[0]!
  });
}
```

An item tagged only with concepts has no labels under Themes. `buildShowAllGraph` keeps label-less entries off the map, which is right: it shows under Concepts instead.

- [ ] **Step 5: Run the tests**

Run: `cd apps/teaching && npx vitest run tests/unit/anthology-graph.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/teaching/src/blocks/anthology-knowledge.ts apps/teaching/src/blocks/anthology-graph.ts apps/teaching/tests/unit/anthology-graph.test.ts
git commit -m "Anthology map takes class knowledge: client API and graph model"
```

---

### Task 4: View: Teacher | Class switch, Add card, knowledge cards, moderation

**Files:** modify `apps/teaching/src/blocks/anthology-view.ts`, `apps/teaching/src/blocks/render.ts`, `apps/teaching/src/teacher/sections/units.ts`, `apps/teaching/src/student/unit-view.ts`, `apps/teaching/src/styles/app.css`; test in `apps/teaching/tests/unit/anthology-graph.test.ts`

- [ ] **Step 1: Write the failing view tests** (append):

```ts
import type { KnowledgeApi } from '@/blocks/anthology-knowledge';

function fakeApi(teacher: boolean, items = knowledge): KnowledgeApi & { added: unknown[] } {
  const added: unknown[] = [];
  return {
    teacher,
    added,
    list: async () => items,
    add: async (draft) => {
      added.push(draft);
      return { item: { ...items[0]!, title: draft.title }, status: 'shown' };
    },
    moderate: teacher ? async () => {} : undefined
  };
}

describe('class knowledge view', () => {
  const anthology = () => {
    const block = createBlock('anthology', 'anth_1');
    if (block.block_type !== 'anthology') throw new Error('expected anthology');
    return block;
  };

  it('opens on Class for students and Teacher for the teacher', () => {
    const student = buildAnthologyView(anthology(), { data, mode: 'student', knowledge: fakeApi(false) });
    const teacher = buildAnthologyView(anthology(), { data, mode: 'teacher', knowledge: fakeApi(true) });
    const pressed = (view: HTMLElement) =>
      view.querySelector('.block-anthology__layers [aria-pressed="true"]')?.textContent;
    expect(pressed(student)).toBe('Class');
    expect(pressed(teacher)).toBe('Teacher');
  });

  it('has no switch when there is no class map', () => {
    const view = buildAnthologyView(anthology(), { data, mode: 'student' });
    expect(view.querySelector('.block-anthology__layers')).toBeNull();
  });

  it('the Add card offers only the unit tags and refuses a send with none picked', async () => {
    const api = fakeApi(false);
    const view = buildAnthologyView(anthology(), { data, mode: 'student', knowledge: api });
    view.querySelector<HTMLButtonElement>('.block-anthology__add')!.click();
    const form = view.querySelector<HTMLFormElement>('.block-anthology__add-form')!;
    expect([...form.querySelectorAll('.block-anthology__tag')].map((b) => b.textContent)).toEqual(['Country', 'Hope', 'Style']);
    form.querySelector<HTMLInputElement>('[name="title"]')!.value = 'An idea';
    form.querySelector<HTMLTextAreaElement>('[name="quote"]')!.value = 'An invented line.';
    form.querySelector<HTMLInputElement>('[name="initials"]')!.value = 'ab';
    form.requestSubmit();
    await Promise.resolve();
    expect(api.added).toHaveLength(0);
    expect(form.querySelector('.block-anthology__add-error')?.textContent).toMatch(/theme or concept/);
    form.querySelector<HTMLButtonElement>('.block-anthology__tag')!.click();
    form.requestSubmit();
    await new Promise((r) => setTimeout(r, 0));
    expect(api.added).toEqual([{ title: 'An idea', quote: 'An invented line.', info: '', themes: ['Country'], concepts: [], initials: 'AB' }]);
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd apps/teaching && npx vitest run tests/unit/anthology-graph.test.ts`
Expected: FAIL (no `knowledge` option, no `.block-anthology__layers`).

- [ ] **Step 3: Build the view.** Changes to `apps/teaching/src/blocks/anthology-view.ts`:

Imports:

```ts
import {
  isKnowledgeNoteId,
  knowledgeNoteId,
  unitTagChoices,
  type KnowledgeApi,
  type KnowledgeItem
} from '@/blocks/anthology-knowledge';
import { cleanInitials, rememberInitials, voiceDevice } from '@/blocks/voice-client';
```

Option on `BuildAnthologyViewOptions`:

```ts
  /** The class's additions. Left out, the map has no Class tab. */
  knowledge?: KnowledgeApi;
```

A knowledge card (beside `noteCard`):

```ts
function knowledgeCard(
  item: KnowledgeItem,
  onModerate?: (action: 'show' | 'hide' | 'delete') => void
): HTMLElement {
  const card = document.createElement('article');
  card.className = 'block-anthology__card block-anthology__card--class';
  const title = document.createElement('p');
  title.className = 'block-anthology__card-title';
  title.textContent = item.title;
  const quote = document.createElement('p');
  quote.className = 'block-anthology__card-quote';
  quote.textContent = `“${item.quote}”`;
  card.append(title, quote);
  if (item.info) {
    const info = document.createElement('p');
    info.className = 'block-anthology__card-note';
    info.textContent = item.info;
    card.append(info);
  }
  const chips = document.createElement('div');
  chips.className = 'block-anthology__chips';
  for (const theme of item.themes) chips.append(chip(theme, 'theme'));
  for (const concept of item.concepts) chips.append(chip(concept, 'concept'));
  card.append(chips);
  if (onModerate) {
    const foot = document.createElement('div');
    foot.className = 'block-anthology__card-foot';
    const who = document.createElement('span');
    who.className = 'block-anthology__card-meta';
    const when = new Date(item.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
    who.textContent = [item.initials, when, item.status === 'waiting' ? 'Waiting' : item.status === 'hidden' ? 'Hidden' : '']
      .filter(Boolean)
      .join(' · ');
    foot.append(who);
    const button = (label: string, action: 'show' | 'hide' | 'delete') => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn--ghost btn--small';
      btn.textContent = label;
      btn.addEventListener('click', () => onModerate(action));
      foot.append(btn);
    };
    if (item.status === 'shown') button('Hide', 'hide');
    else button('Show', 'show');
    button('Delete', 'delete');
    card.append(foot);
  }
  return card;
}
```

The Add form (beside it):

```ts
function knowledgeForm(
  tags: { themes: string[]; concepts: string[] },
  onSend: (draft: { title: string; quote: string; info: string; themes: string[]; concepts: string[]; initials: string }) => Promise<string>,
  onClose: () => void
): HTMLFormElement {
  const form = document.createElement('form');
  form.className = 'block-anthology__card block-anthology__add-form';
  form.noValidate = true;
  const heading = document.createElement('p');
  heading.className = 'block-anthology__card-title';
  heading.textContent = 'Add to the class map';
  const field = (label: string, el: HTMLInputElement | HTMLTextAreaElement) => {
    const wrap = document.createElement('label');
    wrap.className = 'block-anthology__field';
    const text = document.createElement('span');
    text.textContent = label;
    wrap.append(text, el);
    return wrap;
  };
  const title = Object.assign(document.createElement('input'), { name: 'title', maxLength: 80, placeholder: 'A short name for it' });
  const quote = Object.assign(document.createElement('textarea'), { name: 'quote', maxLength: 600, rows: 3, placeholder: 'The line from the article' });
  const info = Object.assign(document.createElement('textarea'), { name: 'info', maxLength: 1200, rows: 3, placeholder: 'What it tells us' });
  const initials = Object.assign(document.createElement('input'), { name: 'initials', maxLength: 4, placeholder: 'AB', value: voiceDevice().initials ?? '' });
  const picked = new Set<string>();
  const tagRow = document.createElement('div');
  tagRow.className = 'block-anthology__chips';
  const tagKind = new Map<string, 'theme' | 'concept'>();
  for (const [kind, list] of [['theme', tags.themes], ['concept', tags.concepts]] as const) {
    for (const tag of list) {
      tagKind.set(tag, kind);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `block-anthology__tag block-anthology__chip block-anthology__chip--${kind}`;
      btn.textContent = tag;
      btn.setAttribute('aria-pressed', 'false');
      btn.addEventListener('click', () => {
        if (picked.has(tag)) picked.delete(tag);
        else picked.add(tag);
        btn.setAttribute('aria-pressed', String(picked.has(tag)));
      });
      tagRow.append(btn);
    }
  }
  const error = document.createElement('p');
  error.className = 'block-anthology__add-error';
  error.setAttribute('role', 'alert');
  const actions = document.createElement('div');
  actions.className = 'block-anthology__card-foot';
  const send = Object.assign(document.createElement('button'), { type: 'submit', className: 'btn btn--primary btn--small', textContent: 'Add it' });
  const cancel = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn--ghost btn--small', textContent: 'Cancel' });
  cancel.addEventListener('click', onClose);
  actions.append(send, cancel);
  const tagLabel = document.createElement('span');
  tagLabel.className = 'block-anthology__field-label';
  tagLabel.textContent = 'Themes and concepts';
  form.append(heading, field('Title', title), field('Quote or line', quote), field('What it tells us', info), tagLabel, tagRow, field('Your initials', initials), error, actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = {
      title: title.value.trim(),
      quote: quote.value.trim(),
      info: info.value.trim(),
      themes: [...picked].filter((tag) => tagKind.get(tag) === 'theme'),
      concepts: [...picked].filter((tag) => tagKind.get(tag) === 'concept'),
      initials: cleanInitials(initials.value)
    };
    const problem = !draft.title
      ? 'Give it a short title.'
      : !draft.quote
        ? 'Add the quote or line from the article.'
        : !draft.themes.length && !draft.concepts.length
          ? 'Pick at least one theme or concept.'
          : draft.initials.length < 2
            ? 'Type your initials.'
            : '';
    error.textContent = problem;
    if (problem) return;
    send.disabled = true;
    rememberInitials(draft.initials);
    void onSend(draft)
      .then((message) => {
        error.textContent = message;
      })
      .catch((e: unknown) => {
        error.textContent = e instanceof Error ? e.message : 'That did not send. Try again.';
      })
      .finally(() => {
        send.disabled = false;
      });
  });
  return form;
}
```

In `buildAnthologyView`, after `paintPills()`, add the layer switch and the knowledge state:

```ts
  const knowledgeApi = options.mode === 'print' ? undefined : options.knowledge;
  let layer: 'teacher' | 'class' = options.mode === 'student' ? 'class' : 'teacher';
  let knowledge: KnowledgeItem[] = [];
  const knowledgeById = new Map<string, KnowledgeItem>();
  /** Teacher: every item; students and the map: shown items only. */
  const onMap = () => (layer === 'class' ? knowledge.filter((item) => !item.status || item.status === 'shown') : []);
  const redraw = () => graph?.setModel(buildAnthologyGraph(options.data, grouping, onMap()));
  const loadKnowledge = async () => {
    if (!knowledgeApi) return;
    try {
      knowledge = await knowledgeApi.list();
    } catch {
      knowledge = [];
    }
    knowledgeById.clear();
    for (const item of knowledge) knowledgeById.set(knowledgeNoteId(item.id), item);
    paintCount();
    redraw();
  };

  const layers = document.createElement('div');
  layers.className = 'hub-pills block-anthology__layers';
  layers.setAttribute('role', 'toolbar');
  layers.setAttribute('aria-label', 'Whose notes');
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn btn--secondary block-anthology__add';
  add.textContent = 'Add to the class map';
  const paintLayers = () => {
    layers.replaceChildren();
    for (const [id, label] of [['teacher', 'Teacher'], ['class', 'Class']] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hub-pills__btn';
      btn.textContent = label;
      btn.setAttribute('aria-pressed', String(layer === id));
      btn.addEventListener('click', () => {
        if (layer === id) return;
        layer = id;
        paintLayers();
        paintCount();
        closePop();
        redraw();
      });
      layers.append(btn);
    }
    add.hidden = layer !== 'class';
  };
```

`paintCount` replaces the fixed count text (where `count.textContent` is set now):

```ts
  const paintCount = () => {
    const extra = onMap().length;
    count.textContent = `${items.length} notes · ${textCount} ${textCount === 1 ? 'text' : 'texts'}${extra ? ` · ${extra} from the class` : ''}`;
  };
  paintCount();
```

Grouping pills must redraw with knowledge: in their click handler, replace `graph?.setModel(buildAnthologyGraph(options.data, grouping));` with `redraw();`.

Bar assembly: when `knowledgeApi` is set, `bar.append(layers, pills, search, count, add)` and call `paintLayers()`; otherwise keep today's `bar.append(pills, search, count)`.

The Add button opens the form in the floating card:

```ts
  add.addEventListener('click', () => {
    if (!knowledgeApi) return;
    pop.replaceChildren(
      knowledgeForm(
        unitTagChoices(options.data),
        async (draft) => {
          const { status } = await knowledgeApi.add(draft);
          await loadKnowledge();
          if (status === 'waiting') return 'Thanks. It will appear once your teacher has checked it.';
          closePop();
          return '';
        },
        closePop
      )
    );
    pop.hidden = false;
    pop.classList.add('block-anthology__pop--form');
  });
```

`closePop` (from PR 1245) must also `pop.classList.remove('block-anthology__pop--form')`. The form card sits at the top of the map (see CSS), not under a dot.

`showPop` handles knowledge dots. Change the `onNoteSelect` handler to:

```ts
            onNoteSelect: (note) => {
              if (note && isKnowledgeNoteId(note.pageId)) {
                const item = knowledgeById.get(note.pageId);
                if (!item) return closePop();
                const moderateItem = knowledgeApi?.moderate
                  ? (action: 'show' | 'hide' | 'delete') => {
                      void knowledgeApi.moderate!(item.id, action).then(() => {
                        closePop();
                        return loadKnowledge();
                      });
                    }
                  : undefined;
                return showCard(knowledgeCard(item, moderateItem));
              }
              const item = note ? byId.get(note.pageId) : undefined;
              return item ? showCard(noteCard(item, titles.get(item.block_id) ?? item.lesson_title, options.mode)) : closePop();
            }
```

So refactor 1245's `showPop(item)` into `showCard(card: HTMLElement)`. It adds the × button, fills `pop` and unhides it. Pass `ringFor: isKnowledgeNoteId` in the graph options. Inside the mount callback, after `graph = mountForceGraph(…)`, call `redraw()` so a remount keeps the current layer.

**Waiting and hidden items for the teacher:** they never go on the map (it shows only `shown`). The teacher sees them in a list under the map: a `<details class="block-anthology__review">` with the summary "Waiting or hidden (N)" that lists `knowledgeCard(item, moderateItem)` for each. Render it when `knowledgeApi?.teacher`, and refresh it in `loadKnowledge`. Hide it when N is 0.

Kick off: when `knowledgeApi` is set, call `void loadKnowledge();` once at the end of `buildAnthologyView`, before `return root`.

- [ ] **Step 4: Wire the context**

`apps/teaching/src/blocks/render.ts`: add to `RenderContext`:

```ts
  /** The unit's class additions to the Anthology map, read and written for this viewer. */
  anthologyKnowledge?: KnowledgeApi;
```

(import `type KnowledgeApi` from `@/blocks/anthology-knowledge`), and pass `knowledge: ctx.anthologyKnowledge` into `buildAnthologyView` in `renderAnthologyBlock`.

`apps/teaching/src/teacher/sections/units.ts`, where `anthology: anthologyData` is passed (around line 1034), add:

```ts
        anthologyKnowledge: teacherKnowledgeApi(options.unit.id),
```

`apps/teaching/src/student/unit-view.ts`, beside `anthology: unit.anthology`, add:

```ts
          anthologyKnowledge: studentKnowledgeApi(unit.unit_id),
```

- [ ] **Step 5: Styles.** Append to the anthology section of `apps/teaching/src/styles/app.css`, after `.block-anthology__pop-close:hover`:

```css
.block-anthology__layers {
  flex: none;
}

.block-anthology__pop--form {
  top: var(--space-3);
  padding-top: 0;
}

.block-anthology__pop--form .block-anthology__card::before {
  display: none;
}

.block-anthology__card-title {
  font-weight: 600;
}

.block-anthology__card--class .block-anthology__card-quote {
  font-size: 0.98rem;
}

.block-anthology__field {
  display: grid;
  gap: 4px;
  font-size: var(--text-sm);
}

.block-anthology__field input,
.block-anthology__field textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm, 6px);
  font: inherit;
}

.block-anthology__field-label {
  font-size: var(--text-sm);
}

.block-anthology__tag {
  cursor: pointer;
}

.block-anthology__tag[aria-pressed='true'] {
  outline: 2px solid currentColor;
  outline-offset: 1px;
}

.block-anthology__add-error:empty {
  display: none;
}

.block-anthology__add-error {
  color: var(--danger, #a33);
  font-size: var(--text-sm);
}

.block-anthology__review {
  margin-top: var(--space-3);
}

.block-anthology__review > summary {
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 600;
}
```

Then: `node scripts/generate-block-css.mjs`.

- [ ] **Step 6: Run tests and typecheck**

Run: `cd apps/teaching && npx vitest run tests/unit/anthology-graph.test.ts tests/unit/render-blocks.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors. If `__baselines__/block-text.json` changes because of the new button text, update the baseline the way that test's failure message says.

- [ ] **Step 7: Commit**

```bash
git add apps/teaching/src packages/block-styles/blocks.css apps/teaching/tests
git commit -m "Anthology map: Teacher | Class switch, Add to the class map, teacher review"
```

---

### Task 4b: The Anthology block in lessons

**Files:** modify `apps/teaching/src/teacher/lesson-canvas/drop.ts`, `apps/teaching/src/blocks/render.ts`, `apps/teaching/src/student/lesson-view.ts`, `apps/teaching/src/teacher/lesson-canvas/mount-page.ts`, `apps/teaching/src/teacher/lesson-display.ts`, `apps/teaching/src/teacher/sections/units.ts`, `netlify/functions/_shared/anthology-knowledge.mjs`; create `apps/teaching/src/blocks/anthology-load.ts`

- [ ] **Step 1: Allow it in lessons.** In `drop.ts`, `PAGE_ONLY` becomes `new Set(['collection'])`, and the anthology branch of `rejectReason` goes. Update any drop test that expects the old refusal.
- [ ] **Step 2: Lazy data in `render.ts`.** Add `loadAnthology?: () => Promise<{ data: AnthologyData; knowledge?: KnowledgeApi }>` to `RenderContext`. In `renderAnthologyBlock`, when `ctx.anthology` is missing and `ctx.loadAnthology` is set, return a wrapped holder (`<div class="block-anthology"><p class="block-anthology__empty block-empty">Loading the class map…</p></div>`). When the promise resolves, replace the holder with `buildAnthologyView(block, { data, mode, title, knowledge })`. On failure, show "The class map didn't load. Refresh to try again."
- [ ] **Step 3: Loaders in `anthology-load.ts`.**
  - `studentUnitAnthology(unitId)`: memoised `apiGet<PublishedUnit>('/api/published/units/{id}')`, giving `{ data: unit.anthology ?? { items: [], texts: [] }, knowledge: studentKnowledgeApi(unitId) }`.
  - `teacherUnitAnthology(unitId)`: `getCurriculum()`, finds the unit's `lesson_ids`, then runs the same snapshot loop as `refreshAnthology` in `units.ts`. Move that loop into an exported `gatherTeacherAnthology(lessonIds, curriculumLessons)` and call it from both places. Gives `{ data, knowledge: teacherKnowledgeApi(unitId) }`.
- [ ] **Step 4: Pass the loaders.**
  - Student `lesson-view.ts`: `loadAnthology: () => studentUnitAnthology(lesson.unit_id)`.
  - Teacher `mount-page.ts` `renderPreview`: `loadAnthology: () => teacherUnitAnthology(lesson.unit_id)`.
  - `lesson-display.ts`: the student loader (the screen shows no initials).
- [ ] **Step 5: Server accepts lesson copies.** In `anthology-knowledge.mjs`, `liveUnit` passes when the unit plan has a visible anthology block **or** any of the unit's published lessons does. Read the published lessons once and share them with `allowedTags`. Add a test: a unit whose plan has no map but whose published lesson does accepts additions.
- [ ] **Step 6: Run** `cd apps/teaching && npx vitest run tests/unit/anthology-graph.test.ts tests/unit/render-blocks.test.ts` plus the drop tests, and `node --test tests/unit/anthology-knowledge.test.js`. Then commit: "Anthology block in lessons: the unit's class map, loaded on open".

---

### Task 5: Local mock routes and a browser walk

**Files:** modify `apps/teaching/scripts/mock-api.ts`

- [ ] **Step 1: Route the endpoints to the real Functions.** Import beside the other Function imports (around line 110):

```ts
import { createPublishedAnthologyKnowledgeHandler } from '../../../netlify/functions/published-anthology-knowledge.mjs';
import { createAnthologyKnowledgeHandler } from '../../../netlify/functions/anthology-knowledge.mjs';
```

In the list of paths sent to `handleQuiz` (the `if (path === '/api/feedback-codes' || …)` block), add:

```ts
      /^\/api\/units\/[^/]+\/anthology-knowledge$/.test(path) ||
      /^\/api\/published\/anthology-knowledge\/[^/]+$/.test(path) ||
```

In `handleQuiz`'s handler chooser (around line 3906), add before the final fallback:

```ts
      : /^\/api\/units\/[^/]+\/anthology-knowledge$/.test(path)
        ? createAnthologyKnowledgeHandler(deps)
      : path.startsWith('/api/published/anthology-knowledge/')
        ? createPublishedAnthologyKnowledgeHandler(deps)
```

- [ ] **Step 2: Seed a walkable unit.** In the mock seed, give a mock unit an anthology block: add `createBlock('anthology', …)` output to the unit's `blocks`. Publish one lesson whose annotation block carries invented anthology tags (copy the shape from `apps/teaching/fixtures/annotation-anthology.json`). Invented text only.

- [ ] **Step 3: Walk it** (dev server for this worktree, port of choice):
  1. Teacher unit page: the map opens on Teacher with no rings. Switching to Class shows the Add button.
  2. Add an item tagged with one theme. A ring dot appears under that hub, and clicking it opens the card with Hide and Delete.
  3. Add one with a flagged word. It doesn't appear on the map; "Waiting or hidden (1)" shows below, and Show puts it on the map.
  4. Student page `/s/units/{id}`: opens on Class with rings, the card shows no initials or buttons, and the Add form works.
  5. Texts grouping shows a "Class knowledge" hub.
  6. Drop the Anthology block into a lesson: it shows Loading, then the same class map; the student lesson opens on Class and an addition there shows on the unit page too.
  7. Repeat 2 and 4 at 390px: the form fits and scrolls inside the map.

- [ ] **Step 4: Commit**

```bash
git add apps/teaching/scripts/mock-api.ts apps/teaching/scripts
git commit -m "Mock API: class knowledge routes and a seeded anthology unit"
```

---

### Task 6: Gate and PR

- [ ] **Step 1:** `npm run pre-pr-check`, exit 0 required. A lone Grove timeout in Tasks is a known local flake: rerun it alone, then rerun the gate.
- [ ] **Step 2:** Push, open the PR as ready (title: "Anthology map: students add class knowledge"), with an invented-text-only body ending with the Claude Code line, then `gh pr merge --auto --merge`.
- [ ] **Step 3:** After deploy, walk the live unit on desktop and 390px. Leave Adam's real map clean: delete any test items from the teacher review list.
