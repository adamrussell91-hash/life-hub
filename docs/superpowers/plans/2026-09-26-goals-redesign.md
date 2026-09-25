# Goals Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Tasks Hub Goals page with a Term Runway landing page, a per-goal page with selectable goal structures, and Hammond as an active contributor that proposes confirmable changes. Goals can host projects and tasks, and can be @-tagged.

**Architecture:** Goals stay in `tasks-hub-content` Blobs (`goals/<id>`) with additive fields, cleaned by a new server normaliser. Runway and hosting maths are pure TS domain modules; the views only render. Hammond's goal read is a pure server module (`goal-read.mjs`), cached per goal in Blobs and recomputed daily or when its inputs change. His proposals are recomputed ghosts (`goal-…` ids), accepted through the existing `POST /api/calendar-ghosts` path, the same way as the Almanac's `alm-…` ghosts. Goals join Universal Links as the `tasks:goal` entity kind, so the `@` tagger can find them and tag onto them.

**Tech Stack:**
- Tasks Hub SPA: TypeScript, Vite, zod, and vitest with happy-dom (`apps/tasks`)
- Netlify Functions: `.mjs` files tested with `node --test` (`netlify/functions`, `tests/`)
- Life ghost writes: `apps/life/js/app/ghost-writes.js`
- Design kit tokens: `packages/design-kit`

**Spec:** `docs/superpowers/specs/2026-09-26-goals-redesign-design.md`. Read it first.
**Visual reference:** `docs/proposals/goals-reference/landing-runway.png`, `docs/proposals/goals-reference/goal-page.png`. Kit rules: `packages/design-kit/AGENTS.md` and `TASKS.md`.

**Branch:** `fix/goals-tags-crash`. It already contains the crash fix commit (tags written on goal/area create, and `withGoalDefaults` in the client), merged with `origin/main`. Task 4 replaces `withGoalDefaults` with `normalizeGoal`.

**Commands**
- Root tests (functions and Life): `npm test` from the repo root. Single file: `node --test tests/unit/<file>.test.js`
- Tasks unit tests: `cd apps/tasks && npx vitest run tests/unit/<file>.test.ts`
- Tasks typecheck: `cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`

**Baseline:** there are 33 tsc errors and 4 failing vitest tests (auth, page-editor ×3, task-relationships). Neither count may go up. Record both in Task 0.

---

## File structure

**Server (Netlify functions)**

| File | Responsibility |
|---|---|
| `netlify/functions/_shared/goal-record.mjs` (new) | Cleans a goal record: sphere, status, structure, frame, lead measure, week log, rest weeks, if-then, milestones, tags |
| `netlify/functions/_shared/tasks-collection.mjs` (modify) | Optional `normalize` hook on create, patch and list |
| `netlify/functions/goals.mjs` (modify) | Passes the goal input through and uses `normalizeGoalRecord` |
| `netlify/functions/tasks.mjs` (modify) | POST accepts `parent_goal_id`, `parent_task_id`, `kind: 'step'`, `step_order`, `tags` |
| `netlify/functions/_shared/entity-ref.mjs` (modify) | Registers `tasks:goal` |
| `netlify/functions/_shared/hub-ref.mjs` (modify) | Goal href and label |
| `netlify/functions/_shared/knowledge-universal-links.mjs` (modify) | `resolveTasksGoal` |
| `netlify/functions/_shared/entity-resolvers.mjs` (modify) | Registers the resolver slot |
| `netlify/functions/_shared/relationship-registry.mjs` (modify) | Makes goals taggable |
| `netlify/functions/entity-search.mjs` (modify) | Adds the `goal` and `project` search kinds |
| `netlify/functions/_shared/goal-read.mjs` (new) | Pure Hammond read and proposals for one goal |
| `netlify/functions/goal-reads.mjs` (new) | `GET/POST /api/goal-reads`: cache, staleness, rescan, dismissed list |
| `netlify/functions/calendar-ghosts.mjs` (modify) | Dispatches `goal-…` ids; `applyTaskStep` learns goals PATCH, new POST fields and `suffix` |

**Life ghosts**

| File | Responsibility |
|---|---|
| `apps/life/js/app/ghost-writes.js` (modify) | Kinds `split_task` and `goal_rest_weeks`; `create_task` gains `goalId` and `domain` |

**Tasks Hub (TypeScript)**

| File | Responsibility |
|---|---|
| `apps/tasks/src/schemas/goal.ts` (modify) | Goal v2 schema, plus `normalizeGoal` |
| `apps/tasks/src/schemas/task.ts` (modify) | `parent_goal_id` |
| `apps/tasks/src/services/client-api.ts` (modify) | `normalizeGoal` on reads; goal-reads and ghost-decision calls |
| `apps/tasks/src/domain/goal-hosting.ts` (new) | Hosted projects and tasks, last movement, one move, sphere → domain |
| `apps/tasks/src/domain/goal-runway.ts` (new) | Term weeks, week counts, cell states, lanes |
| `apps/tasks/src/domain/goal-reads.ts` (new) | Types for Hammond reads, and the landing-strip ordering |
| `apps/tasks/src/shell/shell.ts` (modify) | `parseGoalPage` for `#/goal/:id` |
| `apps/tasks/src/domain/cards.ts` (modify) | `goalPageHash` |
| `apps/tasks/src/app/main.ts` (modify) | Mounts the goal page and imports `goals.css` |
| `apps/tasks/src/views/goals.ts` (rewrite) | The Term Runway landing page |
| `apps/tasks/src/views/goal-frame.ts` (new) | The structure card for each structure |
| `apps/tasks/src/views/goal-page.ts` (new) | The goal page |
| `apps/tasks/src/views/hammond-goal.ts` (new) | Hammond's panel and strip, and the ghost confirm cards |
| `apps/tasks/src/views/focus-strip.ts` (new) | The 25/15-minute focus strip |
| `apps/tasks/src/views/entity-tagger.ts` (modify) | Adds `goal,project` to `TAGGABLE_KINDS` |
| `apps/tasks/src/styles/goals.css` (new) | Runway, goal page and Hammond styles, using tokens only |
| `apps/tasks/scripts/mock-api.ts` (modify) | Dev stubs for `/api/goal-reads` and `goal-` decisions |

**Docs:** `apps/tasks/docs/data-model.md`, `packages/design-kit/TASKS.md`.

---

## Task 0: Baseline

**Files:** none changed.

- [ ] **Step 1: Confirm the branch and the crash fix**

Run:
```bash
git status --short && git log --oneline -3
node --test tests/integration/tasks-collections.test.js 2>&1 | grep -E "ℹ (pass|fail)"
```
Expected: the working tree is clean, the log includes the `fix(tasks): Goals page crashes` commit, and the result is `ℹ pass 3` / `ℹ fail 0`.

- [ ] **Step 2: Record the baseline counts**

Run:
```bash
cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"; npx vitest run tests/unit 2>&1 | grep -E "Tests "
```
Expected: `33`, and `Tests  4 failed | 9xx passed`. If either differs, write down the new baseline at the top of this plan before continuing.

---

## Phase 1: Data model

### Task 1: Server goal normaliser

**Files:**
- Create: `netlify/functions/_shared/goal-record.mjs`
- Test: `tests/unit/goal-record.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/goal-record.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeGoalRecord } from '../../netlify/functions/_shared/goal-record.mjs';

const BASE = {
  schema_version: 1,
  id: 'goal_1',
  title: 'HA evidence',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z'
};

test('a legacy goal gains every v2 default', () => {
  const goal = normalizeGoalRecord({ ...BASE });
  assert.equal(goal.sphere, 'life');
  assert.equal(goal.status, 'active');
  assert.equal(goal.structure, 'woop');
  assert.deepEqual(goal.frame, {});
  assert.equal(goal.lead_measure, null);
  assert.deepEqual(goal.week_log, {});
  assert.deepEqual(goal.rest_weeks, []);
  assert.equal(goal.if_then, null);
  assert.equal(goal.next_start, null);
  assert.equal(goal.due_date, null);
  assert.deepEqual(goal.milestones, []);
  assert.deepEqual(goal.tags, []);
  assert.equal(goal.description, '');
});

test('known values survive, junk is dropped', () => {
  const goal = normalizeGoalRecord({
    ...BASE,
    sphere: 'professional',
    status: 'parked',
    structure: 'floor_target_stretch',
    frame: {
      woop: { wish: ' Be strong ', outcome: 'x', obstacle: 7, plan: 'y', extra: 'no' },
      floor_target_stretch: { unit: 'standards', floor: 3, target: 5, stretch: 7, current: Number.NaN },
      okr: { objective: 'Ship', key_results: [{ label: 'Users', target: 10, current: 2 }, { label: '' }] },
      nonsense: { a: 1 }
    },
    lead_measure: { label: '1 write-up', per_week: 1 },
    week_log: { '2026-09-28': { manual: 2 }, '2026-09-29': { manual: 1 }, junk: {} },
    rest_weeks: ['2026-10-05', '2026-10-05', '2026-10-06', 'x'],
    if_then: { cue: 'Tue P5', action: 'open the doc', obstacle: 'email' },
    next_start: '  Open the spreadsheet ',
    due_date: '2027-03-20',
    milestones: [{ title: 'Floor', due_date: '2026-11-20', status: 'done' }, { title: '' }],
    tags: ['term-4', 3, ' ']
  });
  assert.equal(goal.sphere, 'professional');
  assert.equal(goal.status, 'parked');
  assert.equal(goal.structure, 'floor_target_stretch');
  assert.deepEqual(goal.frame.woop, { wish: 'Be strong', outcome: 'x', obstacle: '', plan: 'y' });
  assert.deepEqual(goal.frame.floor_target_stretch, { unit: 'standards', floor: 3, target: 5, stretch: 7, current: null });
  assert.deepEqual(goal.frame.okr, {
    objective: 'Ship',
    key_results: [{ id: 'kr1', label: 'Users', target: 10, current: 2 }]
  });
  assert.equal('nonsense' in goal.frame, false);
  assert.deepEqual(goal.lead_measure, { label: '1 write-up', per_week: 1 });
  assert.deepEqual(goal.week_log, { '2026-09-28': { manual: 2 } });
  assert.deepEqual(goal.rest_weeks, ['2026-10-05']);
  assert.deepEqual(goal.if_then, { cue: 'Tue P5', action: 'open the doc', obstacle: 'email' });
  assert.equal(goal.next_start, 'Open the spreadsheet');
  assert.equal(goal.due_date, '2027-03-20');
  assert.deepEqual(goal.milestones, [{ id: 'ms1', title: 'Floor', due_date: '2026-11-20', status: 'done' }]);
  assert.deepEqual(goal.tags, ['term-4']);
});

test('invalid enums fall back and a half-filled lead measure is null', () => {
  const goal = normalizeGoalRecord({ ...BASE, sphere: 'x', status: 'y', structure: 'z', lead_measure: { label: 'a', per_week: 0 } });
  assert.equal(goal.sphere, 'life');
  assert.equal(goal.status, 'active');
  assert.equal(goal.structure, 'woop');
  assert.equal(goal.lead_measure, null);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test tests/unit/goal-record.test.js`
Expected: FAIL with `Cannot find module '.../goal-record.mjs'`.

- [ ] **Step 3: Implement**

```js
// netlify/functions/_shared/goal-record.mjs
import { normalizeTags } from './tasks-collection.mjs';

/**
 * Goal v2 shape (spec: docs/superpowers/specs/2026-09-26-goals-redesign-design.md).
 * Additive over v1: every field has a default, so stored goals stay valid.
 */
const SPHERES = new Set(['life', 'work', 'professional']);
const STATUSES = new Set(['active', 'parked', 'achieved', 'dropped', 'archived']);
const STRUCTURES = new Set(['woop', 'smarter', 'okr', 'lead_lag', 'floor_target_stretch']);
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TEXT_PARTS = {
  woop: ['wish', 'outcome', 'obstacle', 'plan'],
  smarter: ['specific', 'measurable', 'achievable', 'relevant', 'time_bound', 'evaluate', 'readjust'],
  lead_lag: ['lag']
};

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isMondayKey(key) {
  return typeof key === 'string' && DATE_KEY.test(key) && new Date(`${key}T00:00:00Z`).getUTCDay() === 1;
}

export function normalizeFrame(value) {
  const src = isObject(value) ? value : {};
  const out = {};
  for (const [part, keys] of Object.entries(TEXT_PARTS)) {
    if (isObject(src[part])) out[part] = Object.fromEntries(keys.map(key => [key, text(src[part][key])]));
  }
  if (isObject(src.okr)) {
    const results = Array.isArray(src.okr.key_results) ? src.okr.key_results : [];
    out.okr = {
      objective: text(src.okr.objective),
      key_results: results
        .filter(kr => isObject(kr) && text(kr.label))
        .slice(0, 6)
        .map((kr, index) => ({
          id: text(kr.id) || `kr${index + 1}`,
          label: text(kr.label),
          target: num(kr.target),
          current: num(kr.current)
        }))
    };
  }
  if (isObject(src.floor_target_stretch)) {
    const f = src.floor_target_stretch;
    out.floor_target_stretch = {
      unit: text(f.unit),
      floor: num(f.floor),
      target: num(f.target),
      stretch: num(f.stretch),
      current: num(f.current)
    };
  }
  return out;
}

function normalizeLeadMeasure(value) {
  if (!isObject(value)) return null;
  const label = text(value.label);
  const perWeek = Number.isInteger(value.per_week) && value.per_week >= 1 ? Math.min(value.per_week, 21) : null;
  return label && perWeek ? { label, per_week: perWeek } : null;
}

function normalizeWeekLog(value) {
  const out = {};
  if (!isObject(value)) return out;
  for (const [key, entry] of Object.entries(value)) {
    if (!isMondayKey(key)) continue;
    const manual = isObject(entry) && Number.isInteger(entry.manual) && entry.manual >= 0 ? Math.min(entry.manual, 50) : 0;
    out[key] = { manual };
  }
  return out;
}

function normalizeRestWeeks(value) {
  return Array.isArray(value) ? [...new Set(value.filter(isMondayKey))].sort() : [];
}

function normalizeIfThen(value) {
  if (!isObject(value)) return null;
  const cue = text(value.cue);
  const action = text(value.action);
  return cue && action ? { cue, action, obstacle: text(value.obstacle) } : null;
}

function normalizeMilestones(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => isObject(item) && text(item.title))
    .slice(0, 20)
    .map((item, index) => ({
      id: text(item.id) || `ms${index + 1}`,
      title: text(item.title),
      due_date: DATE_KEY.test(item.due_date ?? '') ? item.due_date : null,
      status: item.status === 'done' ? 'done' : 'open'
    }));
}

/** The goal fields a client may send on create or patch. Everything else is ignored. */
export const GOAL_INPUT_KEYS = Object.freeze([
  'title', 'description', 'parent_area_id', 'parent_someday_id', 'sphere', 'status', 'structure',
  'frame', 'lead_measure', 'week_log', 'rest_weeks', 'if_then', 'next_start', 'due_date',
  'milestones', 'tags', 'life_wall'
]);

export function normalizeGoalRecord(record) {
  return {
    ...record,
    description: typeof record.description === 'string' ? record.description : '',
    sphere: SPHERES.has(record.sphere) ? record.sphere : 'life',
    status: STATUSES.has(record.status) ? record.status : 'active',
    structure: STRUCTURES.has(record.structure) ? record.structure : 'woop',
    frame: normalizeFrame(record.frame),
    lead_measure: normalizeLeadMeasure(record.lead_measure),
    week_log: normalizeWeekLog(record.week_log),
    rest_weeks: normalizeRestWeeks(record.rest_weeks),
    if_then: normalizeIfThen(record.if_then),
    next_start: text(record.next_start) || null,
    due_date: DATE_KEY.test(record.due_date ?? '') ? record.due_date : null,
    milestones: normalizeMilestones(record.milestones),
    tags: normalizeTags(record.tags)
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test tests/unit/goal-record.test.js`
Expected: `ℹ pass 3`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/goal-record.mjs tests/unit/goal-record.test.js
git commit -m "feat(goals): server normaliser for goal v2 fields"
```

### Task 2: Goals API uses the normaliser on create, patch and list

**Files:**
- Modify: `netlify/functions/_shared/tasks-collection.mjs`
- Modify: `netlify/functions/goals.mjs`
- Test: `tests/integration/tasks-collections.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/integration/tasks-collections.test.js`)

```js
test('goals keep v2 fields on create and patch, and legacy goals list with defaults', async () => {
  const store = memoryStore({
    'goals/goal_legacy': {
      schema_version: 1, id: 'goal_legacy', title: 'Old', status: 'active',
      created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z'
    },
    'goals/_index': ['goal_legacy']
  });
  const deps = { env, now: () => Date.parse('2026-08-01T01:00:00Z'), getContentStore: async () => store };

  const created = await createGoalsHandler(deps)(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/goals',
    body: {
      title: 'HA evidence', sphere: 'professional', structure: 'floor_target_stretch',
      frame: { floor_target_stretch: { unit: 'standards', floor: 3, target: 5, stretch: 7, current: 3 } },
      lead_measure: { label: '1 write-up', per_week: 1 }, secret: 'dropped'
    }
  }));
  assert.equal(created.status, 201);
  const goal = (await created.json()).data;
  assert.equal(goal.sphere, 'professional');
  assert.equal(goal.frame.floor_target_stretch.target, 5);
  assert.deepEqual(goal.lead_measure, { label: '1 write-up', per_week: 1 });
  assert.equal('secret' in goal, false);

  const patched = await createGoalsHandler(deps)(request({
    method: 'PATCH',
    url: `https://api.adam-russell.com/api/goals?id=${goal.id}`,
    body: { rest_weeks: ['2026-11-09', 'bad'], sphere: 'nope' }
  }));
  const next = (await patched.json()).data;
  assert.deepEqual(next.rest_weeks, ['2026-11-09']);
  assert.equal(next.sphere, 'life');

  const listed = await createGoalsHandler(deps)(request({ url: 'https://api.adam-russell.com/api/goals' }));
  const legacy = (await listed.json()).data.goals.find(item => item.id === 'goal_legacy');
  assert.deepEqual(legacy.tags, []);
  assert.equal(legacy.structure, 'woop');
});
```

`memoryStore(entries = {})` in this file already accepts seed entries, so no helper change is needed.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test tests/integration/tasks-collections.test.js`
Expected: the new test FAILS. `goal.sphere` is `undefined`, because create ignores it.

- [ ] **Step 3: Add the `normalize` hook to `tasks-collection.mjs`**

In `createTasksCollectionHandler({ prefix, indexKey, listKey, idPrefix, notFound, create }, deps)`, add `normalize = null` to the destructured options:

```js
export function createTasksCollectionHandler({
  prefix,
  indexKey,
  listKey,
  idPrefix,
  notFound,
  create,
  normalize = null
}, deps = {}) {
  const shape = record => (normalize ? normalize(record) : record);
```

Then change the three write/read sites:

```js
// GET by id
          return withCors(okResponse(200, shape(record)), request, env);
// GET list
        const items = (await listJSON(store, prefix)).map(item => (item && typeof item === 'object' && !Array.isArray(item) ? shape(item) : item));
        return withCors(okResponse(200, { [listKey]: items }), request, env);
// POST, replacing the two lines that set and return built.record
        const record = shape(built.record);
        await setJSON(store, recordKey(prefix, record.id), record);
        const ids = await readIndex(store, indexKey);
        await writeIndex(store, indexKey, [...ids, record.id]);
        return withCors(okResponse(201, record), request, env);
// PATCH
        const next = shape(mergeRecord(existing, parsed.value));
```

- [ ] **Step 4: Rewrite `netlify/functions/goals.mjs`**

```js
import { createTasksCollectionHandler } from './_shared/tasks-collection.mjs';
import { GOAL_INPUT_KEYS, normalizeGoalRecord } from './_shared/goal-record.mjs';

export const config = { path: '/api/goals' };

function pickGoalInput(body) {
  const out = {};
  for (const key of GOAL_INPUT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(body, key)) out[key] = body[key];
  }
  return out;
}

export function createGoalsHandler(deps = {}) {
  return createTasksCollectionHandler({
    prefix: 'goals/',
    indexKey: 'goals/_index',
    listKey: 'goals',
    idPrefix: 'goal',
    notFound: 'Goal not found',
    normalize: normalizeGoalRecord,
    create(body, id, timestamp) {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title) {
        return { error: { code: 'validation_error', message: 'title is required' } };
      }
      return {
        record: {
          ...pickGoalInput(body),
          schema_version: 1,
          id,
          title,
          parent_area_id: typeof body.parent_area_id === 'string' ? body.parent_area_id : null,
          parent_someday_id: typeof body.parent_someday_id === 'string' ? body.parent_someday_id : null,
          created_at: timestamp,
          updated_at: timestamp
        }
      };
    }
  }, deps);
}

export default createGoalsHandler();
```

PATCH still merges the raw body through `mergeRecord`, so a patch with unknown keys would keep them. Make patches drop unknown keys too. Add `pickPatch` to the options and use it in `tasks-collection.mjs`:

```js
// tasks-collection.mjs options
  normalize = null,
  pickPatch = null
// PATCH
        const patch = pickPatch ? pickPatch(parsed.value) : parsed.value;
        const next = shape(mergeRecord(existing, patch));
```

In `goals.mjs`, pass `pickPatch: pickGoalInput`.

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `node --test tests/integration/tasks-collections.test.js`
Expected: `ℹ pass 4`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/tasks-collection.mjs netlify/functions/goals.mjs tests/integration/tasks-collections.test.js
git commit -m "feat(goals): API writes and lists goal v2 fields"
```

### Task 3: Tasks can be created under a goal, and as steps

**Files:**
- Modify: `netlify/functions/tasks.mjs`
- Test: `tests/integration/tasks-collections.test.js`

- [ ] **Step 1: Write the failing test** (append; add the import `import { createTasksHandler } from '../../netlify/functions/tasks.mjs';` at the top)

```js
test('tasks POST keeps parent_goal_id, steps and tags', async () => {
  const store = memoryStore();
  const deps = { env, now: () => Date.parse('2026-08-01T01:00:00Z'), getContentStore: async () => store };
  const parent = (await (await createTasksHandler(deps)(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/tasks',
    body: { title: 'Write up 6.3', domain: 'other', parent_goal_id: 'goal_ha', tags: ['apst', 4] }
  }))).json()).data;
  assert.equal(parent.parent_goal_id, 'goal_ha');
  assert.deepEqual(parent.tags, ['apst']);
  assert.equal(parent.kind, 'task');

  const step = (await (await createTasksHandler(deps)(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/tasks',
    body: { title: 'Pull 3 examples', domain: 'other', kind: 'step', parent_task_id: parent.id, step_order: 1, parent_goal_id: 'goal_ha' }
  }))).json()).data;
  assert.equal(step.kind, 'step');
  assert.equal(step.parent_task_id, parent.id);
  assert.equal(step.step_order, 1);

  const orphan = (await (await createTasksHandler(deps)(request({
    method: 'POST',
    url: 'https://api.adam-russell.com/api/tasks',
    body: { title: 'No parent', domain: 'life', kind: 'step' }
  }))).json()).data;
  assert.equal(orphan.kind, 'task');
  assert.equal(orphan.parent_goal_id, null);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test tests/integration/tasks-collections.test.js`
Expected: FAIL. `parent.parent_goal_id` is `undefined`.

- [ ] **Step 3: Implement.** In `netlify/functions/tasks.mjs`, add the import `import { normalizeTags } from './_shared/tasks-collection.mjs';`. In the POST branch, before `const task = {`, add:

```js
        const parentTaskId = typeof parsed.value.parent_task_id === 'string' && parsed.value.parent_task_id
          ? parsed.value.parent_task_id
          : null;
        const isStep = parsed.value.kind === 'step' && parentTaskId !== null;
```

Inside the `task` object, replace `kind: 'task',` with `kind: isStep ? 'step' : 'task',`, replace `tags: [],` with `tags: normalizeTags(parsed.value.tags),`, and add after `parent_project_id: …,`:

```js
          parent_goal_id: typeof parsed.value.parent_goal_id === 'string' && parsed.value.parent_goal_id
            ? parsed.value.parent_goal_id
            : null,
          parent_task_id: parentTaskId,
          step_order: Number.isInteger(parsed.value.step_order) && parsed.value.step_order >= 0
            ? parsed.value.step_order
            : 0,
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test tests/integration/tasks-collections.test.js && npm test 2>&1 | grep -E "ℹ (pass|fail)"`
Expected: `ℹ fail 0` both times.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/tasks.mjs tests/integration/tasks-collections.test.js
git commit -m "feat(tasks): POST keeps parent_goal_id, steps and tags"
```

### Task 4: Client goal schema v2 and `normalizeGoal`

**Files:**
- Modify: `apps/tasks/src/schemas/goal.ts`
- Modify: `apps/tasks/src/schemas/task.ts`
- Modify: `apps/tasks/src/services/client-api.ts`
- Test: `apps/tasks/tests/unit/goal-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/tasks/tests/unit/goal-schema.test.ts
import { describe, expect, it } from 'vitest';
import { GoalSchema, normalizeGoal } from '@/schemas/goal';
import { TaskSchema } from '@/schemas/task';

describe('goal schema v2', () => {
  it('fills every v2 default on a legacy goal', () => {
    const goal = normalizeGoal({
      schema_version: 1, id: 'g1', title: 'Old',
      created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z'
    } as never);
    expect(goal.sphere).toBe('life');
    expect(goal.structure).toBe('woop');
    expect(goal.tags).toEqual([]);
    expect(goal.rest_weeks).toEqual([]);
    expect(goal.frame).toEqual({});
    expect(goal.milestones).toEqual([]);
  });

  it('keeps a record that fails parsing usable instead of throwing', () => {
    const goal = normalizeGoal({ id: 'g2', title: 'Broken', sphere: 'nonsense' } as never);
    expect(goal.id).toBe('g2');
    expect(goal.sphere).toBe('life');
    expect(goal.tags).toEqual([]);
  });

  it('parses a full v2 goal', () => {
    const parsed = GoalSchema.parse({
      schema_version: 1, id: 'g3', title: 'HA', sphere: 'professional', structure: 'okr',
      frame: { okr: { objective: 'x', key_results: [{ id: 'kr1', label: 'y', target: 1, current: 0 }] } },
      created_at: 'a', updated_at: 'b'
    });
    expect(parsed.frame.okr?.key_results[0]?.label).toBe('y');
  });

  it('tasks carry parent_goal_id', () => {
    const task = TaskSchema.parse({ schema_version: 1, id: 't', title: 'T', domain: 'life', created_at: 'a', updated_at: 'b' });
    expect(task.parent_goal_id).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-schema.test.ts`
Expected: FAIL. `normalizeGoal` is not exported.

- [ ] **Step 3: Replace `apps/tasks/src/schemas/goal.ts`**

```ts
import { z } from 'zod';
import { LifeWallFieldSchema } from './life-wall';
import { schemaVersion } from './task';

export const GoalStatusSchema = z.enum(['active', 'parked', 'achieved', 'dropped', 'archived']);
export const GoalSphereSchema = z.enum(['life', 'work', 'professional']);
export const GoalStructureSchema = z.enum(['woop', 'smarter', 'okr', 'lead_lag', 'floor_target_stretch']);

const Text = z.string().default('');
const Num = z.number().nullable().default(null);

export const GoalFrameSchema = z.object({
  woop: z.object({ wish: Text, outcome: Text, obstacle: Text, plan: Text }).optional(),
  smarter: z
    .object({
      specific: Text, measurable: Text, achievable: Text, relevant: Text,
      time_bound: Text, evaluate: Text, readjust: Text
    })
    .optional(),
  okr: z
    .object({
      objective: Text,
      key_results: z.array(z.object({ id: z.string(), label: z.string(), target: Num, current: Num })).default([])
    })
    .optional(),
  lead_lag: z.object({ lag: Text }).optional(),
  floor_target_stretch: z
    .object({ unit: Text, floor: Num, target: Num, stretch: Num, current: Num })
    .optional()
});

export const GoalMilestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  due_date: z.string().nullable().default(null),
  status: z.enum(['open', 'done']).default('open')
});

export const GoalSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  parent_area_id: z.string().nullable().default(null),
  /** The Someday / Maybe idea this goal was promoted from — the idea itself stays put. */
  parent_someday_id: z.string().nullable().optional(),
  status: GoalStatusSchema.default('active'),
  sphere: GoalSphereSchema.default('life'),
  structure: GoalStructureSchema.default('woop'),
  frame: GoalFrameSchema.default({}),
  lead_measure: z.object({ label: z.string(), per_week: z.number().int().min(1) }).nullable().default(null),
  /** Manual "+1" taps per Monday key, added to the automatic count. */
  week_log: z.record(z.string(), z.object({ manual: z.number().int().min(0) })).default({}),
  /** Monday keys of planned rest weeks — drawn dashed, never as a miss. */
  rest_weeks: z.array(z.string()).default([]),
  if_then: z.object({ cue: z.string(), action: z.string(), obstacle: z.string().default('') }).nullable().default(null),
  next_start: z.string().nullable().default(null),
  due_date: z.string().nullable().default(null),
  milestones: z.array(GoalMilestoneSchema).default([]),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  life_wall: LifeWallFieldSchema
});

export type Goal = z.infer<typeof GoalSchema>;
export type GoalSphere = z.infer<typeof GoalSphereSchema>;
export type GoalStructure = z.infer<typeof GoalStructureSchema>;
export type GoalFrame = z.infer<typeof GoalFrameSchema>;

const DEFAULTS = GoalSchema.parse({
  schema_version: 1, id: '_', title: '_', created_at: '', updated_at: ''
});

/**
 * Server records are normalised already; this guards stale caches and mock data.
 * A record that fails parsing keeps its own fields over v2 defaults instead of throwing.
 */
export function normalizeGoal(raw: Goal): Goal {
  const parsed = GoalSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const source = raw as Partial<Goal>;
  return {
    ...DEFAULTS,
    id: source.id ?? DEFAULTS.id,
    title: source.title ?? DEFAULTS.title,
    description: typeof source.description === 'string' ? source.description : '',
    created_at: source.created_at ?? '',
    updated_at: source.updated_at ?? '',
    tags: Array.isArray(source.tags) ? source.tags.filter((t): t is string => typeof t === 'string') : []
  };
}

export const GoalCreateSchema = GoalSchema.omit({
  schema_version: true,
  id: true,
  created_at: true,
  updated_at: true
})
  .partial()
  .extend({ title: z.string().min(1) });

export const GoalUpdateSchema = GoalCreateSchema.partial();
```

- [ ] **Step 4: Add `parent_goal_id` to `TaskSchema`** in `apps/tasks/src/schemas/task.ts`, right after `parent_task_id: z.string().nullable().default(null),`:

```ts
  /** The goal that hosts this task directly (not via a project). */
  parent_goal_id: z.string().nullable().default(null),
```

Add `parent_goal_id: true,` to the `TaskCreateSchema` `.partial({ … })` list, after `parent_task_id: true,`.

- [ ] **Step 5: Use `normalizeGoal` in `client-api.ts`.** Delete the `withGoalDefaults` function and its doc comment. Replace the `listGoals`/`getGoal` lines with:

```ts
  listGoals: () =>
    apiGet<{ goals: import('@/schemas/goal').Goal[] }>('/api/goals').then((r) => r.goals.map(normalizeGoal)),
  getGoal: (id: string) =>
    apiGet<import('@/schemas/goal').Goal>(`/api/goals?id=${encodeURIComponent(id)}`).then(normalizeGoal),
```

Add `import { normalizeGoal } from '@/schemas/goal';` to the imports at the top.

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-schema.test.ts && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: PASS (4 tests), with a tsc count ≤ the baseline. If `someday.ts` or the old `goals.ts` now error on `GoalStatus`, leave `goals.ts`, because Task 11 rewrites it. Fix `someday.ts` only if a new error points there.

- [ ] **Step 7: Commit**

```bash
git add apps/tasks/src/schemas/goal.ts apps/tasks/src/schemas/task.ts apps/tasks/src/services/client-api.ts apps/tasks/tests/unit/goal-schema.test.ts
git commit -m "feat(tasks): goal v2 schema, normalizeGoal, task parent_goal_id"
```

---

## Phase 2: @ tagging

### Task 5: `tasks:goal` is a Universal Link entity

**Files:**
- Modify: `netlify/functions/_shared/entity-ref.mjs:25`
- Modify: `netlify/functions/_shared/hub-ref.mjs`
- Modify: `netlify/functions/_shared/knowledge-universal-links.mjs`
- Modify: `netlify/functions/_shared/entity-resolvers.mjs`
- Modify: `netlify/functions/_shared/relationship-registry.mjs`
- Test: `tests/unit/goal-entity.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/goal-entity.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { ENTITY_REF_KINDS, parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { hrefForHubRef, labelForHubRef } from '../../netlify/functions/_shared/hub-ref.mjs';
import { RESOLVER_SLOTS, resolveEntity } from '../../netlify/functions/_shared/entity-resolvers.mjs';
import { validateRelationshipInput } from '../../netlify/functions/_shared/relationship-registry.mjs';
import { createAccessContext } from '../../netlify/functions/_shared/entity-access.mjs';

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      return type === 'json' ? structuredClone(map.get(key)) : map.get(key);
    },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

test('goal is a registered tasks kind with an href', () => {
  assert.equal(ENTITY_REF_KINDS.tasks.has('goal'), true);
  assert.deepEqual(parseEntityRef('tasks:goal:goal_ha'), { namespace: 'tasks', kind: 'goal', id: 'goal_ha' });
  assert.equal(hrefForHubRef({ hub: 'tasks', kind: 'goal', id: 'goal_ha' }), '/tasks/#/goal/goal_ha');
  assert.equal(labelForHubRef({ hub: 'tasks', kind: 'goal', id: 'goal_ha' }), 'Tasks goal goal_ha');
});

test('resolveEntity returns the goal projection and 404s a missing one', async () => {
  assert.ok(RESOLVER_SLOTS['tasks:goal']);
  const store = memoryStore({ 'goals/goal_ha': { id: 'goal_ha', title: 'HA evidence', sphere: 'professional', status: 'active' } });
  const context = createAccessContext({ workflow: 'tasks' });
  const resolved = await resolveEntity('tasks:goal:goal_ha', context, { getStore: async () => store });
  assert.deepEqual(resolved, {
    ref: 'tasks:goal:goal_ha',
    kind: 'goal',
    display_label: 'HA evidence',
    supporting_label: 'professional',
    href: '/tasks/#/goal/goal_ha',
    lifecycle_status: 'active',
    visibility: 'operator'
  });
  await assert.rejects(
    () => resolveEntity('tasks:goal:goal_missing', context, { getStore: async () => store }),
    error => error.status === 404
  );
});

test('anything can be tagged_with a goal, both ways', () => {
  const goal = 'tasks:goal:goal_ha';
  const page = 'knowledge:page:page_1';
  assert.equal(validateRelationshipInput({ sourceRef: page, targetRef: goal, relationshipType: 'tagged_with' }).key, 'tagged_with');
  assert.equal(validateRelationshipInput({ sourceRef: goal, targetRef: 'tasks:task:t1', relationshipType: 'tagged_with' }).key, 'tagged_with');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test tests/unit/goal-entity.test.js`
Expected: FAIL. `ENTITY_REF_KINDS.tasks.has('goal')` is false.

- [ ] **Step 3: Implement**

`entity-ref.mjs` line 25:
```js
  tasks: new Set(['task', 'project', 'program', 'goal']),
```

`hub-ref.mjs`: in `hrefForHubRef`, after the project branch:
```js
  if (ref?.hub === 'tasks' && ref.kind === 'goal') {
    return `/tasks/#/goal/${encodeURIComponent(ref.id)}`;
  }
```
In `labelForHubRef`, after the project line:
```js
  if (ref?.hub === 'tasks' && ref.kind === 'goal') return `Tasks goal ${ref.id}`;
```

`knowledge-universal-links.mjs`: after `resolveTasksProject`, add:
```js
export async function resolveTasksGoal(
  id,
  accessContext,
  { getStore = defaultGetTasksStore } = {}
) {
  if (typeof id !== 'string' || !REF_ID.test(id)) throw endpointNotFoundError();
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = await getTasksJSON(store, `goals/${id}`);
  if (!record || typeof record !== 'object') throw endpointNotFoundError();
  const hubRef = { hub: 'tasks', kind: 'goal', id };
  return projection({
    namespace: 'tasks',
    kind: 'goal',
    id,
    displayLabel: typeof record.title === 'string' && record.title ? record.title : id,
    supportingLabel: typeof record.sphere === 'string' ? record.sphere : null,
    href: hrefForHubRef(hubRef),
    lifecycleStatus: typeof record.status === 'string' ? record.status : 'active'
  });
}
```
(`defaultGetTasksStore` and `getTasksJSON` are already imported in this file for `resolveTasksProject`.)

`entity-resolvers.mjs`: add `resolveTasksGoal` to both the import list and the `export { … }` list from `./knowledge-universal-links.mjs`, and to `RESOLVER_SLOTS`:
```js
  'tasks:program': resolveTasksProgram,
  'tasks:goal': resolveTasksGoal,
```

`relationship-registry.mjs`: in `ALL_TAGGABLE_KINDS`, after `'tasks:program',`:
```js
  'tasks:goal',
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test tests/unit/goal-entity.test.js tests/unit/entity-ref.test.js tests/unit/relationship-registry.test.js tests/unit/entity-resolvers.test.js`
Expected: `ℹ fail 0`. If `entity-ref.test.js` asserts the exact `tasks` set, add `'goal'` to its expected value.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/entity-ref.mjs netlify/functions/_shared/hub-ref.mjs netlify/functions/_shared/knowledge-universal-links.mjs netlify/functions/_shared/entity-resolvers.mjs netlify/functions/_shared/relationship-registry.mjs tests/unit/goal-entity.test.js tests/unit/entity-ref.test.js
git commit -m "feat(links): goals are a tasks:goal Universal Link entity"
```

### Task 6: @ search finds goals and projects

**Files:**
- Modify: `netlify/functions/entity-search.mjs`
- Modify: `apps/tasks/src/views/entity-tagger.ts`
- Test: `tests/unit/goal-entity.test.js`

- [ ] **Step 1: Write the failing test** (append to `tests/unit/goal-entity.test.js`, and add the imports at the top)

```js
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createEntitySearchHandler } from '../../netlify/functions/entity-search.mjs';

const SECRET = 's'.repeat(32);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: 'https://life-hub.adam-russell.com' };
const session = createSessionToken({ now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 7) }, SECRET).token;

test('@ search returns goals and projects from their indexes', async () => {
  const tasksStore = memoryStore({
    'goals/_index': ['goal_ha', 'goal_x'],
    'goals/goal_ha': { id: 'goal_ha', title: 'Highly Accomplished evidence', sphere: 'professional', status: 'active' },
    'goals/goal_x': { id: 'goal_x', title: 'Unrelated', sphere: 'life', status: 'active' },
    'projects/_index': ['proj_ha'],
    'projects/proj_ha': { id: 'proj_ha', title: 'HA evidence portfolio', status: 'active' }
  });
  const handler = createEntitySearchHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => memoryStore(),
    getTasksStore: async () => tasksStore,
    getProfessionalStore: async () => memoryStore()
  });
  const response = await handler(new Request('https://api.adam-russell.com/api/entities/search?q=Highly&kinds=goal,project', {
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com' }
  }));
  assert.equal(response.status, 200);
  const { groups } = (await response.json()).data;
  assert.deepEqual(groups.goal.map(item => item.ref), ['tasks:goal:goal_ha']);
  assert.equal(groups.goal[0].href, '/tasks/#/goal/goal_ha');

  const projects = await handler(new Request('https://api.adam-russell.com/api/entities/search?q=HA&kinds=project', {
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com' }
  }));
  const projectGroups = (await projects.json()).data.groups;
  assert.deepEqual(projectGroups.project.map(item => item.ref), ['tasks:project:proj_ha']);
  assert.equal(projectGroups.project[0].href, '/tasks/#/project/proj_ha');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test tests/unit/goal-entity.test.js`
Expected: FAIL with a 400, because `goal` is an unsupported kind.

- [ ] **Step 3: Implement in `entity-search.mjs`**

Add `'goal'` and `'project'` to `SUPPORTED_KINDS`. After `searchProgramKind`, add:

```js
async function searchTasksCollectionKind(getTasksStore, query, { indexKey, prefix, kind, supporting }) {
  const store = await getTasksStore();
  const ids = await readIndex(store, indexKey);
  const records = await mapBounded(ids, READ_BATCH_SIZE, id => getTasksJSON(store, `${prefix}${id}`));
  const out = [];
  for (const record of records) {
    if (!record || typeof record !== 'object' || typeof record.id !== 'string') continue;
    if (record.status === 'archived') continue;
    const label = typeof record.title === 'string' ? record.title : '';
    const rank = matchRank(query, label, null);
    if (rank === null) continue;
    out.push({
      rank,
      ref: formatEntityRef({ namespace: 'tasks', kind, id: record.id }),
      kind,
      display_label: label || record.id,
      supporting_label: supporting(record),
      href: hrefForHubRef({ hub: 'tasks', kind, id: record.id }),
      lifecycle_status: typeof record.status === 'string' ? record.status : 'active',
      visibility: 'operator'
    });
  }
  return out;
}
```

In the `Promise.all([...])` list, after the program line:

```js
      requestedKinds.has('goal')
        ? searchTasksCollectionKind(getTasksStore, query, {
          indexKey: 'goals/_index', prefix: 'goals/', kind: 'goal',
          supporting: record => (typeof record.sphere === 'string' ? record.sphere : null)
        })
        : [],
      requestedKinds.has('project')
        ? searchTasksCollectionKind(getTasksStore, query, {
          indexKey: 'projects/_index', prefix: 'projects/', kind: 'project',
          supporting: record => (typeof record.status === 'string' ? record.status : null)
        })
        : [],
```

In the `groups` object, add `goal: [],` and `project: [],` after `program: [],`.

In `apps/tasks/src/views/entity-tagger.ts`:
```ts
const TAGGABLE_KINDS = 'person,organisation,task,goal,project,application,program,page,unit,lesson,class,event,meeting';
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test tests/unit/goal-entity.test.js tests/integration/entity-search.test.js tests/unit/slice11-entity-adapters.test.js`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/entity-search.mjs apps/tasks/src/views/entity-tagger.ts tests/unit/goal-entity.test.js
git commit -m "feat(links): @ search finds goals and projects"
```

---

## Phase 3: Runway and hosting domain (pure TS)

### Task 7: `goal-hosting.ts`

**Files:**
- Create: `apps/tasks/src/domain/goal-hosting.ts`
- Create: `apps/tasks/tests/unit/goal-fixtures.ts` (shared builders for the goal tests)
- Test: `apps/tasks/tests/unit/goal-hosting.test.ts`

- [ ] **Step 1: Create the shared fixtures**

```ts
// apps/tasks/tests/unit/goal-fixtures.ts
import { normalizeGoal, type Goal } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';

export function goal(partial: Partial<Goal> & Pick<Goal, 'id' | 'title'>): Goal {
  return normalizeGoal({
    schema_version: 1,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...partial
  } as Goal);
}

export function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    schema_version: 1, description: '', kind: 'task', bucket: 'active', step_order: 0, domain: 'life',
    framework_used: null, estimated_duration: null, actual_duration: null, due_date: null,
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', completed_at: null,
    status: 'open', blocked_since: null, priority: 'medium', parent_project_id: null, parent_task_id: null,
    parent_goal_id: null, depends_on: [], tags: [], recurrence_rule: null, due_time: null, remind_at: null,
    remind_dismissed_at: null, attachments: [], source: 'manual', target_date: null, review_at: null,
    waiting_on: null, waiting_since: null, follow_up_at: null, waiting_status: null, contexts: [],
    cognitive_load: null, depth: null,
    ...partial
  } as Task;
}

export function project(partial: Partial<Project> & Pick<Project, 'id' | 'title'>): Project {
  return {
    schema_version: 1, status: 'active', description: '', parent_goal_id: null, tags: [], arc_summary: '',
    purpose: '', desired_outcome: '', quality_bar: null, review_at: null, type: 'standard', milestones: [],
    baseline_end_date: null, current_end_date: null, review_summary: null, stall_flagged_at: null,
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z',
    competition_or_event_type: null, key_dates: null, student_group_reference: null,
    generated_admin_tasks: [], drafted_documents: null,
    ...partial
  } as Project;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/tasks/tests/unit/goal-hosting.test.ts
import { describe, expect, it } from 'vitest';
import {
  directTasks, hostedProjects, hostedTasks, lastMovementAt, oneMove, projectProgress, SPHERE_DOMAIN
} from '@/domain/goal-hosting';
import { goal, project, task } from './goal-fixtures';

const g = goal({ id: 'g1', title: 'HA evidence', next_start: 'Open the spreadsheet' });
const projects = [
  project({ id: 'p1', title: 'Portfolio', parent_goal_id: 'g1' }),
  project({ id: 'p2', title: 'Old', parent_goal_id: 'g1', status: 'archived' }),
  project({ id: 'p3', title: 'Other', parent_goal_id: 'g2' })
];
const tasks = [
  task({ id: 't1', title: 'Direct', parent_goal_id: 'g1', due_date: '2026-10-10' }),
  task({ id: 't2', title: 'In project', parent_project_id: 'p1', due_date: '2026-10-05', priority: 'high' }),
  task({ id: 't3', title: 'Step', parent_goal_id: 'g1', kind: 'step', parent_task_id: 't1' }),
  task({ id: 't4', title: 'Someday', parent_goal_id: 'g1', bucket: 'someday' }),
  task({ id: 't5', title: 'Elsewhere', parent_project_id: 'p3' }),
  task({ id: 't6', title: 'Done', parent_goal_id: 'g1', status: 'done', completed_at: '2026-09-20T02:00:00.000Z', updated_at: '2026-09-20T02:00:00.000Z' })
];

describe('goal hosting', () => {
  it('hosts non-archived projects and their tasks plus direct tasks, never someday', () => {
    expect(hostedProjects(g, projects).map((p) => p.id)).toEqual(['p1']);
    expect(hostedTasks(g, tasks, projects).map((t) => t.id).sort()).toEqual(['t1', 't2', 't3', 't6']);
    expect(directTasks(g, tasks).map((t) => t.id)).toEqual(['t1', 't6']);
  });

  it('last movement is the newest stamp across the goal and its tasks', () => {
    expect(lastMovementAt(g, hostedTasks(g, tasks, projects))).toBe('2026-09-20T02:00:00.000Z');
  });

  it('one move is the earliest-due open task, else next_start, else null', () => {
    expect(oneMove(g, hostedTasks(g, tasks, projects))).toEqual({ title: 'In project', taskId: 't2' });
    expect(oneMove(g, [])).toEqual({ title: 'Open the spreadsheet', taskId: null });
    expect(oneMove(goal({ id: 'g9', title: 'x' }), [])).toBeNull();
  });

  it('project progress counts non-step tasks', () => {
    expect(projectProgress(projects[0]!, [...tasks, task({ id: 't7', title: 'x', parent_project_id: 'p1', status: 'done' })]))
      .toEqual({ done: 1, total: 2 });
  });

  it('maps spheres to task domains the API accepts', () => {
    expect(SPHERE_DOMAIN).toEqual({ life: 'life', work: 'teaching', professional: 'other' });
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-hosting.test.ts`
Expected: FAIL, because `@/domain/goal-hosting` can't be resolved.

- [ ] **Step 4: Implement**

```ts
// apps/tasks/src/domain/goal-hosting.ts
import type { Goal, GoalSphere } from '@/schemas/goal';
import { isProjectArchived, type Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';

export const SPHERES: readonly GoalSphere[] = ['life', 'work', 'professional'];
export const SPHERE_LABEL: Record<GoalSphere, string> = { life: 'Life', work: 'Work', professional: 'Professional' };
/** `tasks.mjs` accepts teaching | life | wedding | health | other. */
export const SPHERE_DOMAIN: Record<GoalSphere, string> = { life: 'life', work: 'teaching', professional: 'other' };
/** Soft cap: active goals per lane. */
export const LANE_CAP = 3;

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function isOpenTask(task: Task): boolean {
  return task.status !== 'done' && task.status !== 'dead';
}

export function hostedProjects(goal: Goal, projects: Project[]): Project[] {
  return projects.filter((p) => p.parent_goal_id === goal.id && !isProjectArchived(p.status));
}

/** Direct tasks plus tasks of hosted projects. Steps included; Someday never. */
export function hostedTasks(goal: Goal, tasks: Task[], projects: Project[]): Task[] {
  const projectIds = new Set(hostedProjects(goal, projects).map((p) => p.id));
  return tasks.filter(
    (t) =>
      t.bucket !== 'someday' &&
      ((t.parent_goal_id ?? null) === goal.id || (t.parent_project_id !== null && projectIds.has(t.parent_project_id)))
  );
}

/** Tasks the goal hosts directly (not via a project), without steps. */
export function directTasks(goal: Goal, tasks: Task[]): Task[] {
  return tasks.filter((t) => (t.parent_goal_id ?? null) === goal.id && t.kind !== 'step' && t.bucket !== 'someday');
}

export function lastMovementAt(goal: Goal, hosted: Task[]): string {
  const stamps = [goal.updated_at, ...hosted.flatMap((t) => [t.completed_at, t.updated_at])].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  );
  return stamps.sort().at(-1) ?? goal.created_at;
}

export function oneMove(goal: Goal, hosted: Task[]): { title: string; taskId: string | null } | null {
  const open = hosted
    .filter((t) => t.kind !== 'step' && isOpenTask(t))
    .sort(
      (a, b) =>
        (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') ||
        (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) ||
        a.title.localeCompare(b.title)
    );
  if (open[0]) return { title: open[0].title, taskId: open[0].id };
  if (goal.next_start) return { title: goal.next_start, taskId: null };
  return null;
}

export function projectProgress(project: Project, tasks: Task[]): { done: number; total: number } {
  const own = tasks.filter((t) => t.parent_project_id === project.id && t.kind !== 'step');
  return { done: own.filter((t) => !isOpenTask(t)).length, total: own.length };
}
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-hosting.test.ts`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/tasks/src/domain/goal-hosting.ts apps/tasks/tests/unit/goal-fixtures.ts apps/tasks/tests/unit/goal-hosting.test.ts
git commit -m "feat(goals): hosting domain — projects, tasks, one move"
```

### Task 8: `goal-runway.ts`

**Files:**
- Create: `apps/tasks/src/domain/goal-runway.ts`
- Test: `apps/tasks/tests/unit/goal-runway.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/tasks/tests/unit/goal-runway.test.ts
import { describe, expect, it } from 'vitest';
import { buildRunway, cellState, currentTerm, flattenTerms, sydneyDateKey, termWeeks, weekCount } from '@/domain/goal-runway';
import type { SchoolTerm } from '@/domain/school-time';
import { goal, task } from './goal-fixtures';

const T4: SchoolTerm = { term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' };
const T3: SchoolTerm = { term: 3, starts_on: '2026-07-20', ends_on: '2026-09-25' };

describe('goal runway', () => {
  it('flattens hub prefs terms in date order and picks the current or next term', () => {
    const terms = flattenTerms({ school_terms: [{ year: 2026, terms: [T4, T3] }] });
    expect(terms.map((t) => t.term)).toEqual([3, 4]);
    expect(currentTerm(terms, '2026-08-03')?.term).toBe(3);
    expect(currentTerm(terms, '2026-09-30')?.term).toBe(4);
    expect(currentTerm(terms, '2027-01-10')?.term).toBe(4);
  });

  it('lists Monday-keyed weeks of a term and flags the current one', () => {
    const weeks = termWeeks(T4, '2026-11-04');
    expect(weeks).toHaveLength(10);
    expect(weeks[0]).toMatchObject({ monday: '2026-10-12', label: 'W1', isNow: false });
    expect(weeks[3]).toMatchObject({ monday: '2026-11-02', label: 'W4', isNow: true });
  });

  it('converts completion stamps to Sydney dates', () => {
    expect(sydneyDateKey('2026-11-01T14:30:00.000Z')).toBe('2026-11-02');
  });

  it('counts completed hosted tasks in the week plus manual taps', () => {
    const g = goal({ id: 'g', title: 'x', week_log: { '2026-11-02': { manual: 1 } } });
    const hosted = [
      task({ id: 'a', title: 'a', status: 'done', completed_at: '2026-11-03T01:00:00.000Z' }),
      task({ id: 'b', title: 'b', status: 'done', completed_at: '2026-11-10T01:00:00.000Z' })
    ];
    expect(weekCount(g, hosted, '2026-11-02')).toBe(2);
  });

  it('cell states: rest beats everything, future, done, part, missed, empty now', () => {
    const g = goal({ id: 'g', title: 'x', lead_measure: { label: 'l', per_week: 2 }, rest_weeks: ['2026-10-19'] });
    expect(cellState(g, 5, '2026-10-19', '2026-11-02')).toBe('rest');
    expect(cellState(g, 0, '2026-11-09', '2026-11-02')).toBe('future');
    expect(cellState(g, 2, '2026-10-12', '2026-11-02')).toBe('done');
    expect(cellState(g, 1, '2026-10-26', '2026-11-02')).toBe('part');
    expect(cellState(g, 0, '2026-10-26', '2026-11-02')).toBe('missed');
    expect(cellState(g, 0, '2026-11-02', '2026-11-02')).toBe('empty');
  });

  it('builds lanes in sphere order with slots, rows, parked goals and a week summary', () => {
    const goals = [
      goal({ id: 'w1', title: 'Marking', sphere: 'work', lead_measure: { label: '2 blocks', per_week: 1 } }),
      goal({ id: 'l1', title: 'Recomp', sphere: 'life', lead_measure: { label: '4 sessions', per_week: 1 },
        milestones: [{ id: 'm', title: 'DEXA', due_date: '2026-11-05', status: 'open' }] }),
      goal({ id: 'l2', title: 'Parked one', sphere: 'life', status: 'parked' })
    ];
    const tasks = [task({ id: 't', title: 'Mark 8', parent_goal_id: 'w1', status: 'done', completed_at: '2026-11-03T01:00:00.000Z' })];
    const runway = buildRunway({ goals, projects: [], tasks, term: T4, today: '2026-11-04', crunchWeeks: ['2026-11-16'], proposedRest: { l1: ['2026-11-23'] } });
    expect(runway.lanes.map((l) => l.sphere)).toEqual(['life', 'work', 'professional']);
    expect(runway.lanes[0]!.slotsUsed).toBe(1);
    expect(runway.lanes[0]!.parked.map((g) => g.id)).toEqual(['l2']);
    const recomp = runway.lanes[0]!.rows[0]!;
    expect(recomp.cells.find((c) => c.monday === '2026-11-02')).toMatchObject({ milestone: true, isNow: true, state: 'empty' });
    expect(recomp.cells.find((c) => c.monday === '2026-11-23')?.proposed).toBe(true);
    expect(runway.weeks.find((w) => w.monday === '2026-11-16')?.isCrunch).toBe(true);
    expect(runway.weekSummary).toEqual({ done: 1, total: 2 });
    expect(runway.nowWeek).toBe(4);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-runway.test.ts`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement**

```ts
// apps/tasks/src/domain/goal-runway.ts
import type { Goal, GoalSphere } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { addDaysKey, mondayOf, termAt, type SchoolTerm } from '@/domain/school-time';
import { hostedTasks, oneMove, SPHERES, SPHERE_LABEL } from '@/domain/goal-hosting';

export type CellState = 'done' | 'part' | 'rest' | 'missed' | 'empty' | 'future';
export type RunwayWeek = { monday: string; index: number; label: string; isNow: boolean; isCrunch: boolean };
export type RunwayCell = { monday: string; state: CellState; count: number; isNow: boolean; milestone: boolean; proposed: boolean };
export type RunwayRow = {
  goal: Goal;
  cells: RunwayCell[];
  move: { title: string; taskId: string | null } | null;
  thisWeek: { count: number; perWeek: number | null };
};
export type RunwayLane = { sphere: GoalSphere; label: string; rows: RunwayRow[]; parked: Goal[]; slotsUsed: number };
export type Runway = {
  term: SchoolTerm;
  weeks: RunwayWeek[];
  lanes: RunwayLane[];
  weekSummary: { done: number; total: number };
  /** 1-based week of `today` inside the term, or null outside it. */
  nowWeek: number | null;
};

const SYDNEY_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit'
});

export function sydneyDateKey(iso: string): string {
  return SYDNEY_DAY.format(new Date(iso));
}

export function sydneyToday(now: Date = new Date()): string {
  return SYDNEY_DAY.format(now);
}

export function flattenTerms(prefs: { school_terms: Array<{ terms: SchoolTerm[] }> }): SchoolTerm[] {
  return prefs.school_terms.flatMap((year) => year.terms).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

/** The term containing `today`, else the next one to start, else the last one. */
export function currentTerm(terms: SchoolTerm[], today: string): SchoolTerm | null {
  return termAt(today, terms) ?? terms.find((t) => t.starts_on > today) ?? terms.at(-1) ?? null;
}

export function termWeeks(term: SchoolTerm, today: string): RunwayWeek[] {
  const nowMonday = mondayOf(today);
  const weeks: RunwayWeek[] = [];
  let monday = mondayOf(term.starts_on);
  let index = 1;
  while (monday <= term.ends_on) {
    weeks.push({ monday, index, label: `W${index}`, isNow: monday === nowMonday, isCrunch: false });
    monday = addDaysKey(monday, 7);
    index += 1;
  }
  return weeks;
}

export function weekCount(goal: Goal, hosted: Task[], monday: string): number {
  const sunday = addDaysKey(monday, 6);
  const auto = hosted.filter((t) => {
    if (!t.completed_at) return false;
    const key = sydneyDateKey(t.completed_at);
    return key >= monday && key <= sunday;
  }).length;
  return auto + (goal.week_log[monday]?.manual ?? 0);
}

export function cellState(goal: Goal, count: number, monday: string, nowMonday: string): CellState {
  if (goal.rest_weeks.includes(monday)) return 'rest';
  if (monday > nowMonday) return 'future';
  const perWeek = goal.lead_measure?.per_week ?? 1;
  if (count >= perWeek) return 'done';
  if (count > 0) return 'part';
  return monday < nowMonday ? 'missed' : 'empty';
}

export function buildRunway(input: {
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  term: SchoolTerm;
  today: string;
  crunchWeeks?: string[];
  /** goal id → Monday keys a pending `goal_rest_weeks` ghost would rest. */
  proposedRest?: Record<string, string[]>;
}): Runway {
  const { goals, projects, tasks, term, today, crunchWeeks = [], proposedRest = {} } = input;
  const nowMonday = mondayOf(today);
  const crunch = new Set(crunchWeeks);
  const weeks = termWeeks(term, today).map((w) => ({ ...w, isCrunch: crunch.has(w.monday) }));
  let done = 0;
  let total = 0;

  const lanes = SPHERES.map((sphere): RunwayLane => {
    const inLane = goals.filter((g) => g.sphere === sphere);
    const active = inLane.filter((g) => g.status === 'active');
    const rows = active.map((goal): RunwayRow => {
      const hosted = hostedTasks(goal, tasks, projects);
      const proposed = new Set(proposedRest[goal.id] ?? []);
      const cells = weeks.map((week): RunwayCell => {
        const count = weekCount(goal, hosted, week.monday);
        const sunday = addDaysKey(week.monday, 6);
        return {
          monday: week.monday,
          state: cellState(goal, count, week.monday, nowMonday),
          count,
          isNow: week.isNow,
          milestone: goal.milestones.some((m) => m.due_date !== null && m.due_date >= week.monday && m.due_date <= sunday),
          proposed: proposed.has(week.monday)
        };
      });
      const thisCount = weekCount(goal, hosted, nowMonday);
      const perWeek = goal.lead_measure?.per_week ?? null;
      if (perWeek !== null && !goal.rest_weeks.includes(nowMonday)) {
        total += 1;
        if (thisCount >= perWeek) done += 1;
      }
      return { goal, cells, move: oneMove(goal, hosted), thisWeek: { count: thisCount, perWeek } };
    });
    return {
      sphere,
      label: SPHERE_LABEL[sphere],
      rows,
      parked: inLane.filter((g) => g.status === 'parked' || g.status === 'achieved' || g.status === 'dropped'),
      slotsUsed: active.length
    };
  });

  const now = weeks.find((w) => w.isNow);
  return { term, weeks, lanes, weekSummary: { done, total }, nowWeek: now ? now.index : null };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-runway.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/tasks/src/domain/goal-runway.ts apps/tasks/tests/unit/goal-runway.test.ts
git commit -m "feat(goals): runway domain — term weeks, counts, cell states, lanes"
```

---

## Phase 4: Landing page and routes

### Task 9: `#/goal/:id` route

**Files:**
- Modify: `apps/tasks/src/shell/shell.ts` (after `parseEntityPage`, and in `isKnownHashView`)
- Modify: `apps/tasks/src/domain/cards.ts` (after `projectPageHash`)
- Test: `apps/tasks/tests/unit/goal-routes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/tasks/tests/unit/goal-routes.test.ts
import { describe, expect, it } from 'vitest';
import { isKnownHashView, parseGoalPage } from '@/shell/shell';
import { goalPageHash } from '@/domain/cards';

describe('goal routes', () => {
  it('parses #/goal/:id and round-trips the hash', () => {
    expect(parseGoalPage('#/goal/goal_a%2Fb')).toEqual({ id: 'goal_a/b' });
    expect(parseGoalPage('#/goals')).toBeNull();
    expect(goalPageHash('goal_a/b')).toBe('#/goal/goal_a%2Fb');
    expect(isKnownHashView('#/goal/goal_1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-routes.test.ts`
Expected: FAIL. `parseGoalPage` is not exported.

- [ ] **Step 3: Implement.** In `shell.ts`, after `parseEntityPage`:

```ts
/** Goal page: `#/goal/:id` — not a rail destination (the rail stays on Goals). */
export function parseGoalPage(hash = location.hash): { id: string } | null {
  const path = hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  const parts = path.split('/');
  return parts[0] === 'goal' && parts[1] ? { id: decodeURIComponent(parts[1]) } : null;
}
```

In `isKnownHashView`, after `if (parseEntityPage(hash)) return true;`:
```ts
  if (parseGoalPage(hash)) return true;
```

In `cards.ts`, after `projectPageHash`:
```ts
export function goalPageHash(id: string): string {
  return `#/goal/${encodeURIComponent(id)}`;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-routes.test.ts tests/unit/routes.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/tasks/src/shell/shell.ts apps/tasks/src/domain/cards.ts apps/tasks/tests/unit/goal-routes.test.ts
git commit -m "feat(goals): #/goal/:id route"
```

### Task 10: Goals styles

**Files:**
- Create: `apps/tasks/src/styles/goals.css`
- Modify: `apps/tasks/src/app/main.ts` (add the import after `import '../styles/backlog.css';`)

- [ ] **Step 1: Create the stylesheet.** It uses tokens only. Colour roles: Life uses sage, Work uses Wave/blue, Professional uses lilac, and pending proposals use High Sea dashes.

```css
/* Goals: Term Runway, goal page, Hammond. Tokens only (packages/design-kit/tokens.css). */
.goals-top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); margin-bottom: var(--space-4); flex-wrap: wrap; }
.goals-summary { font-size: var(--text-md); color: var(--muted); }
.goals-top__actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.goals-new { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); }
.goals-new input { min-width: 16rem; }

.runway { padding: var(--space-5) var(--space-6); position: relative; }
.runway__grid { display: grid; grid-template-columns: minmax(12rem, 18rem) repeat(var(--weeks, 10), minmax(1.5rem, 1fr)) minmax(10rem, 15rem); column-gap: var(--space-1); align-items: center; }
.runway__head { display: contents; }
.runway__head > * { font-size: var(--text-2xs); font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--muted); text-align: center; padding-bottom: var(--space-2); border-bottom: 1px solid var(--line); }
.runway__head > :first-child, .runway__head > :last-child { text-align: left; }
.runway__head .is-now { color: var(--high-sea-ink); }
.runway__head .is-crunch { background: var(--warning-surface); border-radius: var(--radius-xs); color: var(--high-sea-ink); }
.runway__lane { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--space-2); margin: var(--space-4) 0 var(--space-1); font-size: var(--text-2xs); font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps); text-transform: uppercase; }
.runway__lane small { margin-left: auto; font-size: var(--text-sm); font-weight: var(--weight-regular); letter-spacing: 0; text-transform: none; color: var(--muted); }
.runway__lane--life { color: var(--pastel-sage-ink); }
.runway__lane--work { color: var(--pastel-blue-ink); }
.runway__lane--professional { color: var(--pastel-lilac-ink); }
.runway__dot { width: var(--space-2); height: var(--space-2); border-radius: var(--radius-full); background: currentColor; }
.runway__row { display: contents; color: inherit; text-decoration: none; }
.runway__row > * { padding: var(--space-2) 0; border-bottom: 1px solid var(--line); cursor: pointer; }
.runway__row:hover > *, .runway__row:focus-visible > * { background: rgba(255, 255, 255, 0.6); }
.runway__goal-title { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-base); font-weight: var(--weight-semibold); color: var(--navy); }
.runway__goal-meta { font-size: var(--text-xs); color: var(--muted); margin-top: var(--space-px); }
.runway__chip { font-size: var(--text-2xs); font-weight: var(--weight-bold); letter-spacing: var(--tracking-wide); color: var(--muted); border: 1px solid var(--line); border-radius: var(--radius-xs); padding: 0 var(--space-1); }
.runway__cell { display: flex; justify-content: center; }
.cell { width: 1.25rem; height: 1.25rem; border-radius: var(--radius-xs); display: block; position: relative; background: rgba(255, 255, 255, 0.7); border: 1px solid var(--line); }
.cell--done { background: var(--wave); border-color: transparent; }
.cell--part { background: var(--pastel-blue); border-color: transparent; }
.runway__row--life .cell--done { background: var(--pastel-sage-ink); }
.runway__row--life .cell--part { background: var(--pastel-sage); }
.runway__row--professional .cell--done { background: var(--pastel-lilac-ink); }
.runway__row--professional .cell--part { background: var(--pastel-lilac); }
.cell--rest, .cell--missed { background: transparent; border: 1.5px dashed var(--shallow); }
.cell--missed { border-style: dotted; }
.cell.is-now { outline: 2px solid var(--high-sea); outline-offset: 2px; }
.cell.is-proposed { border: 1.5px dashed var(--high-sea); background: rgba(255, 255, 255, 0.7); }
.cell.has-milestone::after { content: "◆"; position: absolute; inset: 0; display: grid; place-items: center; font-size: var(--text-2xs); color: var(--navy); }
.runway__move { font-size: var(--text-sm); color: var(--ink); padding-left: var(--space-3) !important; border-left: 2px solid var(--line); line-height: var(--leading-snug); }
.runway__move b { display: block; font-size: var(--text-2xs); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--muted); }
.runway__move .is-proposal { color: var(--high-sea-ink); }
.runway__empty, .runway__parked { grid-column: 1 / -1; font-size: var(--text-sm); color: var(--muted); padding: var(--space-2) 0; }
.runway__parked summary { cursor: pointer; }
.runway__legend { display: flex; gap: var(--space-4); flex-wrap: wrap; margin-top: var(--space-3); font-size: var(--text-sm); color: var(--muted); }
.runway__legend span { display: inline-flex; align-items: center; gap: var(--space-2); }
.runway__legend .cell { width: 0.875rem; height: 0.875rem; }

.goal-page { display: grid; grid-template-columns: minmax(0, 1fr) 26rem; gap: var(--space-5); align-items: start; }
.goal-page__main { display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
.goal-page__meta { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-4); color: var(--muted); }
.goal-page__pair { display: grid; grid-template-columns: 1.15fr 1fr; gap: var(--space-4); }
.goal-card { padding: var(--space-5) var(--space-6); }
.goal-card__eyebrow { font-size: var(--text-2xs); font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--muted); display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-2); }
.goal-field { width: 100%; font: inherit; color: inherit; background: rgba(255, 255, 255, 0.55); border: 1px solid var(--line); border-radius: var(--radius-xs); padding: var(--space-1) var(--space-2); }
textarea.goal-field { resize: vertical; min-height: 3.5rem; }
.goal-frame__grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-3); margin-top: var(--space-4); }
.goal-frame__grid--3 { grid-template-columns: repeat(3, 1fr); }
.goal-frame__tile { border-radius: var(--radius-md); padding: var(--space-3) var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); position: relative; }
.goal-frame__tile .goal-field { background: rgba(255, 255, 255, 0.6); }
.goal-frame__letter { font-size: var(--text-2xl); font-weight: var(--weight-bold); line-height: 1; }
.goal-frame__label { font-size: var(--text-2xs); font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps); text-transform: uppercase; }
.goal-frame__here { position: absolute; top: var(--space-3); right: var(--space-3); font-size: var(--text-2xs); font-weight: var(--weight-bold); background: var(--on-dark); color: var(--depth); padding: 0 var(--space-2); border-radius: var(--radius-full); }
.tone-gold { background: var(--pastel-gold); color: var(--pastel-gold-ink); }
.tone-sage { background: var(--pastel-sage); color: var(--pastel-sage-ink); }
.tone-peach { background: var(--pastel-peach); color: var(--pastel-peach-ink); }
.tone-blue { background: var(--pastel-blue); color: var(--pastel-blue-ink); }
.tone-lilac { background: var(--pastel-lilac); color: var(--pastel-lilac-ink); }
.goal-rows { display: grid; grid-template-columns: 9rem 1fr; gap: var(--space-2) var(--space-3); margin-top: var(--space-4); align-items: center; font-size: var(--text-sm); }
.goal-lead { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--line); }
.goal-lead__cells { display: flex; gap: var(--space-1); margin-left: auto; }
.goal-ifthen { background: var(--depth); color: var(--on-dark); border-radius: var(--radius-md); padding: var(--space-4) var(--space-5); }
.goal-ifthen .goal-card__eyebrow { color: var(--on-dark-muted); }
.goal-ifthen .goal-field { background: var(--on-dark-hover); border-color: var(--on-dark-line); color: var(--on-dark); }
.goal-ifthen b { color: var(--high-sea); }
.goal-start { border: 1.5px solid var(--wave); background: var(--pastel-blue); border-radius: var(--radius-md); padding: var(--space-4) var(--space-5); }
.goal-start .goal-card__eyebrow { color: var(--pastel-blue-ink); }
.goal-list__item { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--line); font-size: var(--text-sm); }
.goal-list__item:last-child { border-bottom: none; }
.goal-list__item .r { margin-left: auto; display: inline-flex; gap: var(--space-2); align-items: center; }
.goal-progress { width: 5rem; height: var(--space-2); border-radius: var(--radius-full); background: var(--shore); overflow: hidden; }
.goal-progress > i { display: block; height: 100%; background: var(--wave); }
.goal-add { display: flex; gap: var(--space-2); margin-top: var(--space-3); }

.focus-strip { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-4); margin-bottom: var(--space-4); border-radius: var(--radius-full); background: var(--depth); color: var(--on-dark); box-shadow: var(--elev-4); }
.focus-strip__clock { font-variant-numeric: tabular-nums; font-weight: var(--weight-bold); color: var(--high-sea); }
.focus-strip .btn { margin-left: auto; color: var(--on-dark); }

.hammond { background: var(--depth); color: var(--on-dark); border-radius: var(--radius-lg); padding: var(--space-5); box-shadow: var(--elev-4); position: sticky; top: var(--space-6); }
.hammond__who { display: flex; align-items: center; gap: var(--space-3); }
.hammond__who img { width: 3rem; height: 3rem; border-radius: var(--radius-full); object-fit: cover; }
.hammond__stamp { font-size: var(--text-xs); color: var(--on-dark-muted); }
.hammond__stamp button { font: inherit; color: var(--on-dark); background: none; border: none; text-decoration: underline; cursor: pointer; padding: 0; }
.hammond__read { font-size: var(--text-base); line-height: var(--leading-normal); margin-top: var(--space-4); }
.hammond__looked { display: flex; gap: var(--space-1); flex-wrap: wrap; margin-top: var(--space-3); }
.hammond__looked span { font-size: var(--text-2xs); color: var(--on-dark-muted); border: 1px solid var(--on-dark-line); border-radius: var(--radius-full); padding: 0 var(--space-2); }
.hammond__head { font-size: var(--text-2xs); font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--on-dark-muted); margin: var(--space-5) 0 var(--space-2); }
.hammond .confirm-card { background: rgba(255, 255, 255, 0.96); color: var(--ink); margin-top: var(--space-2); }
.hammond__kind { font-size: var(--text-2xs); font-weight: var(--weight-bold); letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--muted); }
.hammond__title { font-size: var(--text-base); font-weight: var(--weight-semibold); color: var(--navy); margin-top: var(--space-1); }
.hammond__why { font-size: var(--text-xs); color: var(--muted); margin-top: var(--space-1); }
.hammond__diff { font-size: var(--text-xs); margin-top: var(--space-2); padding: var(--space-2) var(--space-3); border-radius: var(--radius-xs); background: var(--cotton); }
.hammond__diff s { color: var(--muted); }
.hammond__diff ins { text-decoration: none; color: var(--success); font-weight: var(--weight-semibold); }
.hammond-strip { display: grid; grid-template-columns: auto 1fr auto; gap: var(--space-5); align-items: center; background: var(--depth); color: var(--on-dark); border-radius: var(--radius-lg); padding: var(--space-4) var(--space-5); box-shadow: var(--elev-4); margin-bottom: var(--space-5); }
.hammond-strip img { width: 3rem; height: 3rem; border-radius: var(--radius-full); object-fit: cover; }
.hammond-strip__read { font-size: var(--text-md); line-height: var(--leading-snug); margin-top: var(--space-1); }
.hammond-strip__chips { display: flex; gap: var(--space-2); margin-top: var(--space-3); flex-wrap: wrap; }
.hammond-chip { display: flex; align-items: center; gap: var(--space-3); background: var(--on-dark-hover); border: 1px solid var(--on-dark-line); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3); font-size: var(--text-sm); }
.hammond-chip button { font: inherit; font-size: var(--text-xs); font-weight: var(--weight-semibold); padding: var(--space-1) var(--space-3); border-radius: var(--radius-sm); border: none; cursor: pointer; }
.hammond-chip .is-confirm { background: var(--on-dark); color: var(--depth); }
.hammond-chip .is-discard { background: transparent; color: var(--on-dark-muted); }

@media (max-width: 719px) {
  .runway { padding: var(--space-4); }
  .runway__grid { display: block; }
  .runway__head { display: none; }
  .runway__row { display: block; background: rgba(255, 255, 255, 0.7); border-radius: var(--radius-md); padding: var(--space-3); margin-bottom: var(--space-2); }
  .runway__row > * { border: none; padding: var(--space-1) 0; background: none !important; }
  .runway__cell { display: none; }
  .runway__cell.is-now { display: flex; justify-content: flex-start; }
  .runway__move { border-left: none; padding-left: 0 !important; }
  .goal-page, .goal-page__pair, .goal-frame__grid, .goal-frame__grid--3 { grid-template-columns: 1fr; }
  .hammond { position: static; }
  .hammond-strip { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Import it.** In `apps/tasks/src/app/main.ts`, after `import '../styles/backlog.css';`:
```ts
import '../styles/goals.css';
```

- [ ] **Step 3: Check that the stylesheet uses only tokens**

Run: `grep -nE "#[0-9a-fA-F]{3,6}\b|[0-9]px" apps/tasks/src/styles/goals.css | grep -vE "1px solid|1.5px|2px|3px|5px"`
Expected: no output. The only raw lengths are 1–2px borders and outlines, which the kit also uses.

- [ ] **Step 4: Commit**

```bash
git add apps/tasks/src/styles/goals.css apps/tasks/src/app/main.ts
git commit -m "feat(goals): runway, goal page and Hammond styles"
```

### Task 11: Term Runway landing page

**Files:**
- Rewrite: `apps/tasks/src/views/goals.ts`
- Test: `apps/tasks/tests/unit/goals-view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/tasks/tests/unit/goals-view.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderGoalsView } from '@/views/goals';
import { goal, task } from './goal-fixtures';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    listGoals: vi.fn(),
    listProjects: vi.fn(),
    listTasks: vi.fn(),
    getHubPrefs: vi.fn(),
    createGoal: vi.fn(),
    getGoalReads: vi.fn()
  }
}));

const T4 = { term: 4 as const, starts_on: '2026-10-12', ends_on: '2026-12-18' };

beforeEach(() => {
  vi.mocked(tasksApi.listGoals).mockResolvedValue([
    goal({ id: 'w1', title: 'Marking back in 10 days', sphere: 'work', structure: 'lead_lag', lead_measure: { label: '2 blocks / wk', per_week: 1 } }),
    goal({ id: 'p1', title: 'HA evidence', sphere: 'professional', structure: 'floor_target_stretch' }),
    goal({ id: 'l9', title: 'Half marathon', sphere: 'life', status: 'parked' })
  ]);
  vi.mocked(tasksApi.listProjects).mockResolvedValue([]);
  vi.mocked(tasksApi.listTasks).mockResolvedValue([
    task({ id: 't1', title: 'Yr 11 essays', parent_goal_id: 'w1', due_date: '2026-11-05' })
  ]);
  vi.mocked(tasksApi.getHubPrefs).mockResolvedValue({ school_terms: [{ year: 2026, terms: [T4] }] } as never);
  vi.mocked(tasksApi.getGoalReads).mockResolvedValue({ reads: [] });
  vi.mocked(tasksApi.createGoal).mockResolvedValue(goal({ id: 'new', title: 'New' }));
});

describe('goals landing', () => {
  it('renders three lanes, rows, the one move and links to goal pages', async () => {
    const canvas = document.createElement('div');
    await renderGoalsView(canvas, '2026-11-04');
    expect(canvas.querySelector('.goals-summary')?.textContent).toContain('Term 4 · week 4 of 10');
    const lanes = [...canvas.querySelectorAll('.runway__lane')].map((n) => n.textContent);
    expect(lanes[0]).toContain('Life');
    expect(lanes[1]).toContain('1 of 3 slots');
    const row = canvas.querySelector<HTMLAnchorElement>('a.runway__row[href="#/goal/w1"]');
    expect(row?.textContent).toContain('Marking back in 10 days');
    expect(row?.textContent).toContain('LEAD/LAG');
    expect(row?.textContent).toContain('Yr 11 essays');
    expect(row?.querySelectorAll('.cell')).toHaveLength(10);
    expect(canvas.querySelector('.runway__parked')?.textContent).toContain('Half marathon');
  });

  it('creates a goal in the chosen lane, parked when the lane is full', async () => {
    vi.mocked(tasksApi.listGoals).mockResolvedValue([
      goal({ id: 'a', title: 'A', sphere: 'work' }),
      goal({ id: 'b', title: 'B', sphere: 'work' }),
      goal({ id: 'c', title: 'C', sphere: 'work' })
    ]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const canvas = document.createElement('div');
    await renderGoalsView(canvas, '2026-11-04');
    canvas.querySelector<HTMLButtonElement>('[data-action="new-goal"]')!.click();
    const form = canvas.querySelector<HTMLFormElement>('.goals-new')!;
    form.querySelector<HTMLInputElement>('input[name="title"]')!.value = 'D';
    form.querySelector<HTMLSelectElement>('select[name="sphere"]')!.value = 'work';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await Promise.resolve();
    expect(confirm).toHaveBeenCalled();
    expect(tasksApi.createGoal).toHaveBeenCalledWith({ title: 'D', sphere: 'work', status: 'parked' });
  });

  it('shows a clear empty state when no school terms are set', async () => {
    vi.mocked(tasksApi.getHubPrefs).mockResolvedValue({ school_terms: [] } as never);
    const canvas = document.createElement('div');
    await renderGoalsView(canvas, '2026-11-04');
    expect(canvas.textContent).toContain('Add your school terms');
  });
});
```

`tasksApi.getGoalReads` doesn't exist until Task 17. The mock defines it, and Task 11's code doesn't call it, so this test is stable across both tasks.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/goals-view.test.ts`
Expected: FAIL. The old view renders `.hierarchy-*` markup and has no `.goals-summary`.

- [ ] **Step 3: Replace `apps/tasks/src/views/goals.ts`**

```ts
import type { Goal, GoalSphere } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { SchoolTerm } from '@/domain/school-time';
import { tasksApi } from '@/services/client-api';
import { errorMessage, showViewLoading } from '@/views/feedback';
import { createHubPills, el } from '@/views/hub-kit';
import { goalPageHash } from '@/domain/cards';
import { LANE_CAP, SPHERES, SPHERE_LABEL } from '@/domain/goal-hosting';
import {
  buildRunway, currentTerm, flattenTerms, sydneyToday,
  type Runway, type RunwayLane, type RunwayRow
} from '@/domain/goal-runway';

export const STRUCTURE_CHIP: Record<Goal['structure'], string> = {
  woop: 'WOOP',
  smarter: 'SMARTER',
  okr: 'OKR',
  lead_lag: 'LEAD/LAG',
  floor_target_stretch: 'FLOOR·TARGET'
};

export type GoalsData = { goals: Goal[]; projects: Project[]; tasks: Task[]; terms: SchoolTerm[]; today: string };
export type RunwayOverlay = { crunchWeeks: string[]; proposedRest: Record<string, string[]>; proposalGoalIds: Set<string> };

let selectedTermStart: string | null = null;

/** Term Runway (spec: docs/superpowers/specs/2026-09-26-goals-redesign-design.md). */
export async function renderGoalsView(canvas: HTMLElement, today = sydneyToday()): Promise<void> {
  showViewLoading(canvas, 'Loading goals…', '.runway');
  try {
    const [goals, projects, tasks, prefs] = await Promise.all([
      tasksApi.listGoals(),
      tasksApi.listProjects(),
      tasksApi.listTasks(),
      tasksApi.getHubPrefs()
    ]);
    paintGoals(canvas, { goals, projects, tasks, terms: flattenTerms(prefs), today });
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load goals.')));
  }
}

export function paintGoals(
  canvas: HTMLElement,
  data: GoalsData,
  overlay: RunwayOverlay = { crunchWeeks: [], proposedRest: {}, proposalGoalIds: new Set() }
): Runway | null {
  const term = data.terms.find((t) => t.starts_on === selectedTermStart) ?? currentTerm(data.terms, data.today);
  canvas.replaceChildren();
  const reload = () => void renderGoalsView(canvas, data.today);

  const top = el('div', 'goals-top');
  const summary = el('p', 'goals-summary');
  const actions = el('div', 'goals-top__actions');
  if (term) {
    const year = term.starts_on.slice(0, 4);
    actions.append(
      createHubPills({
        label: 'Term',
        items: data.terms.filter((t) => t.starts_on.startsWith(year)).map((t) => ({ id: t.starts_on, label: `Term ${t.term}` })),
        value: term.starts_on,
        onSelect: (id) => {
          selectedTermStart = id;
          paintGoals(canvas, data, overlay);
        }
      })
    );
  }
  const add = el('button', 'btn btn--primary', 'New goal');
  add.type = 'button';
  add.dataset.action = 'new-goal';
  actions.append(add);
  top.append(summary, actions);
  const hammondHost = el('div', 'goals-hammond-host');
  canvas.append(top, hammondHost);
  add.addEventListener('click', () => {
    if (canvas.querySelector('.goals-new')) return;
    hammondHost.before(newGoalForm(data.goals, reload));
  });

  if (!term) {
    canvas.append(el('p', 'empty-state', 'Add your school terms in Tools → Term dates to see the runway.'));
    return null;
  }
  const runway = buildRunway({
    goals: data.goals,
    projects: data.projects,
    tasks: data.tasks,
    term,
    today: data.today,
    crunchWeeks: overlay.crunchWeeks,
    proposedRest: overlay.proposedRest
  });
  const when = runway.nowWeek !== null
    ? `week ${runway.nowWeek} of ${runway.weeks.length}`
    : data.today < term.starts_on ? 'starts soon' : 'finished';
  summary.textContent = `Term ${term.term} · ${when} · this week ${runway.weekSummary.done} of ${runway.weekSummary.total} moves done`;
  canvas.append(renderRunway(runway, data, overlay));
  return runway;
}

function newGoalForm(goals: Goal[], reload: () => void): HTMLFormElement {
  const form = el('form', 'glass-tile goals-new');
  const title = el('input', 'goal-field');
  title.name = 'title';
  title.placeholder = 'What do you want to be true by the end of term?';
  title.setAttribute('aria-label', 'Goal title');
  const sphere = el('select', 'goal-field') as HTMLSelectElement;
  sphere.name = 'sphere';
  sphere.setAttribute('aria-label', 'Lane');
  for (const id of SPHERES) {
    const option = el('option', '', SPHERE_LABEL[id]) as HTMLOptionElement;
    option.value = id;
    sphere.append(option);
  }
  const submit = el('button', 'btn btn--primary', 'Create');
  submit.type = 'submit';
  const cancel = el('button', 'btn btn--ghost', 'Cancel');
  cancel.type = 'button';
  cancel.addEventListener('click', () => form.remove());
  form.append(title, sphere, submit, cancel);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = title.value.trim();
    if (!text) return;
    const lane = sphere.value as GoalSphere;
    const activeInLane = goals.filter((g) => g.sphere === lane && g.status === 'active').length;
    let status: Goal['status'] = 'active';
    if (activeInLane >= LANE_CAP) {
      const park = window.confirm(`${SPHERE_LABEL[lane]} already has ${LANE_CAP} active goals. Park one first? OK adds this goal as parked.`);
      if (!park) return;
      status = 'parked';
    }
    void tasksApi
      .createGoal({ title: text, sphere: lane, ...(status === 'parked' ? { status } : {}) })
      .then(reload)
      .catch((err) => window.alert(errorMessage(err)));
  });
  queueMicrotask(() => title.focus());
  return form;
}

function renderRunway(runway: Runway, data: GoalsData, overlay: RunwayOverlay): HTMLElement {
  const wrap = el('section', 'glass-tile runway');
  const grid = el('div', 'runway__grid');
  grid.style.setProperty('--weeks', String(runway.weeks.length));
  const head = el('div', 'runway__head');
  head.append(el('span', '', 'Goal · lead measure'));
  for (const week of runway.weeks) {
    head.append(el('span', `${week.isNow ? 'is-now' : ''}${week.isCrunch ? ' is-crunch' : ''}`.trim(), week.label));
  }
  head.append(el('span', '', "This week's one move"));
  grid.append(head);
  for (const lane of runway.lanes) grid.append(...renderLane(lane, data, overlay));
  wrap.append(grid, legend());
  return wrap;
}

function renderLane(lane: RunwayLane, data: GoalsData, overlay: RunwayOverlay): HTMLElement[] {
  const label = el('div', `runway__lane runway__lane--${lane.sphere}`);
  label.append(el('span', 'runway__dot'), el('span', '', lane.label), el('small', '', `${lane.slotsUsed} of ${LANE_CAP} slots`));
  const nodes: HTMLElement[] = [label];
  if (lane.rows.length === 0) nodes.push(el('p', 'runway__empty', 'No active goals in this lane.'));
  for (const row of lane.rows) nodes.push(renderRow(row, lane.sphere, data, overlay));
  if (lane.parked.length) {
    const parked = el('details', 'runway__parked');
    parked.append(el('summary', '', `Not this term (${lane.parked.length})`));
    for (const goal of lane.parked) {
      const link = el('a', '', `${goal.title} · ${goal.status}`);
      link.href = goalPageHash(goal.id);
      const item = el('div');
      item.append(link);
      parked.append(item);
    }
    nodes.push(parked);
  }
  return nodes;
}

function renderRow(row: RunwayRow, sphere: GoalSphere, data: GoalsData, overlay: RunwayOverlay): HTMLElement {
  const link = el('a', `runway__row runway__row--${sphere}`);
  link.href = goalPageHash(row.goal.id);
  const info = el('div', 'runway__goal');
  const title = el('p', 'runway__goal-title', row.goal.title);
  title.append(el('span', 'runway__chip', STRUCTURE_CHIP[row.goal.structure]));
  const dream = row.goal.parent_someday_id ? data.tasks.find((t) => t.id === row.goal.parent_someday_id) : undefined;
  const lead = row.goal.lead_measure
    ? `${row.goal.lead_measure.label} · ${row.thisWeek.count}/${row.goal.lead_measure.per_week} this week`
    : 'No lead measure yet';
  info.append(title, el('p', 'runway__goal-meta', dream ? `${lead} · ✦ ${dream.title}` : lead));
  link.append(info);
  for (const cell of row.cells) {
    const box = el('span', 'runway__cell');
    if (cell.isNow) box.classList.add('is-now');
    const mark = el('i', `cell cell--${cell.state}`);
    mark.classList.toggle('is-now', cell.isNow);
    mark.classList.toggle('is-proposed', cell.proposed);
    mark.classList.toggle('has-milestone', cell.milestone);
    mark.title = `${cell.monday}: ${cell.state}${cell.count ? ` (${cell.count})` : ''}`;
    box.append(mark);
    link.append(box);
  }
  const move = el('p', 'runway__move');
  move.append(el('b', '', 'Move'), document.createTextNode(row.move?.title ?? 'Add a next start'));
  if (overlay.proposalGoalIds.has(row.goal.id)) move.append(el('span', 'is-proposal', ' · Hammond has a proposal'));
  link.append(move);
  return link;
}

function legend(): HTMLElement {
  const wrap = el('div', 'runway__legend');
  const item = (cls: string, label: string) => {
    const span = el('span');
    span.append(el('i', `cell ${cls}`), document.createTextNode(label));
    return span;
  };
  wrap.append(
    item('cell--done', 'Lead measure hit'),
    item('cell--part', 'Partial'),
    item('cell--rest', 'Rest week (not a fail)'),
    item('is-proposed', 'Hammond proposal, waiting for you'),
    item('has-milestone', 'Milestone')
  );
  return wrap;
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd apps/tasks && npx vitest run tests/unit/goals-view.test.ts && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: 3 passed, with a tsc count ≤ the baseline. The old `goals.ts` imports (`createHierarchyTraceCard`, horizons) are gone. If `tests/unit/goals-horizons.test.ts` imported from `@/views/goals`, it doesn't: it tests `hammond-portfolio`, so it's unaffected.

- [ ] **Step 5: Commit**

```bash
git add apps/tasks/src/views/goals.ts apps/tasks/tests/unit/goals-view.test.ts
git commit -m "feat(goals): Term Runway landing page"
```

---

## Phase 5: Goal page

### Task 12: Focus strip

**Files:**
- Create: `apps/tasks/src/views/focus-strip.ts`
- Test: `apps/tasks/tests/unit/focus-strip.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/tasks/tests/unit/focus-strip.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startFocusStrip } from '@/views/focus-strip';

afterEach(() => vi.useRealTimers());

describe('focus strip', () => {
  it('counts down, can be stopped, and only one runs at a time', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    startFocusStrip(host, { minutes: 25, label: 'Focus on HA evidence' });
    expect(host.querySelector('.focus-strip__clock')?.textContent).toBe('25:00');
    vi.advanceTimersByTime(61_000);
    expect(host.querySelector('.focus-strip__clock')?.textContent).toBe('23:59');
    startFocusStrip(host, { minutes: 15, label: "Hammond's with you" });
    expect(host.querySelectorAll('.focus-strip')).toHaveLength(1);
    host.querySelector<HTMLButtonElement>('.focus-strip button')!.click();
    expect(host.querySelector('.focus-strip')).toBeNull();
  });

  it('removes itself at zero', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    startFocusStrip(host, { minutes: 1, label: 'x' });
    vi.advanceTimersByTime(60_000);
    expect(host.querySelector('.focus-strip')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/focus-strip.test.ts`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement**

```ts
// apps/tasks/src/views/focus-strip.ts
import { el } from '@/views/hub-kit';

let stopActive: (() => void) | null = null;

/** A timed focus strip. Creates nothing; it only helps you start. */
export function startFocusStrip(host: HTMLElement, options: { minutes: number; label: string }): void {
  stopActive?.();
  const strip = el('div', 'focus-strip');
  strip.setAttribute('role', 'status');
  const clock = el('span', 'focus-strip__clock');
  const stop = el('button', 'btn btn--ghost', 'Stop');
  stop.type = 'button';
  strip.append(el('span', 'focus-strip__label', options.label), clock, stop);
  host.prepend(strip);

  const endsAt = Date.now() + options.minutes * 60_000;
  const tick = () => {
    const left = Math.max(0, endsAt - Date.now());
    const minutes = Math.floor(left / 60_000);
    const seconds = Math.floor((left % 60_000) / 1000);
    clock.textContent = `${minutes}:${String(seconds).padStart(2, '0')}`;
    if (left === 0) finish();
  };
  const timer = window.setInterval(tick, 1000);
  function finish() {
    window.clearInterval(timer);
    strip.remove();
    if (stopActive === finish) stopActive = null;
  }
  stop.addEventListener('click', finish);
  stopActive = finish;
  tick();
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd apps/tasks && npx vitest run tests/unit/focus-strip.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/tasks/src/views/focus-strip.ts apps/tasks/tests/unit/focus-strip.test.ts
git commit -m "feat(goals): focus strip for Start now / Body-double"
```

### Task 13: Structure card (`goal-frame.ts`)

**Files:**
- Create: `apps/tasks/src/views/goal-frame.ts`
- Test: `apps/tasks/tests/unit/goal-frame.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/tasks/tests/unit/goal-frame.test.ts
import { describe, expect, it, vi } from 'vitest';
import { renderGoalFrame } from '@/views/goal-frame';
import { goal } from './goal-fixtures';

function commit(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('change'));
}

describe('goal structure card', () => {
  it('WOOP edits one quadrant and keeps the others', () => {
    const onPatch = vi.fn();
    const g = goal({ id: 'g', title: 'x', structure: 'woop', frame: { woop: { wish: 'a', outcome: 'b', obstacle: '', plan: '' } } });
    const node = renderGoalFrame(g, onPatch);
    expect(node.querySelectorAll('.goal-frame__tile')).toHaveLength(4);
    commit(node.querySelector<HTMLTextAreaElement>('[data-field="woop.obstacle"]')!, 'after 9pm');
    expect(onPatch).toHaveBeenCalledWith({ frame: { woop: { wish: 'a', outcome: 'b', obstacle: 'after 9pm', plan: '' } } });
  });

  it('Floor·target·stretch marks the highest level reached', () => {
    const g = goal({
      id: 'g', title: 'x', structure: 'floor_target_stretch',
      frame: { floor_target_stretch: { unit: 'standards', floor: 3, target: 5, stretch: 7, current: 3 } }
    });
    const node = renderGoalFrame(g, vi.fn());
    const tiles = [...node.querySelectorAll('.goal-frame__tile')];
    expect(tiles[0]!.querySelector('.goal-frame__here')).not.toBeNull();
    expect(tiles[1]!.querySelector('.goal-frame__here')).toBeNull();
  });

  it('OKR adds a key result', () => {
    const onPatch = vi.fn();
    const g = goal({ id: 'g', title: 'x', structure: 'okr', frame: { okr: { objective: 'Ship', key_results: [] } } });
    const node = renderGoalFrame(g, onPatch);
    node.querySelector<HTMLButtonElement>('[data-action="add-kr"]')!.click();
    expect(onPatch).toHaveBeenCalledWith({
      frame: { okr: { objective: 'Ship', key_results: [{ id: 'kr1', label: 'New key result', target: null, current: null }] } }
    });
  });

  it('SMARTER shows seven rows and Lead/lag shows the lag field', () => {
    expect(renderGoalFrame(goal({ id: 'g', title: 'x', structure: 'smarter' }), vi.fn()).querySelectorAll('.goal-rows .goal-field')).toHaveLength(7);
    expect(renderGoalFrame(goal({ id: 'g', title: 'x', structure: 'lead_lag' }), vi.fn()).querySelector('[data-field="lead_lag.lag"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-frame.test.ts`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement**

```ts
// apps/tasks/src/views/goal-frame.ts
import type { Goal, GoalFrame } from '@/schemas/goal';
import { el } from '@/views/hub-kit';

export type GoalPatch = Partial<Pick<Goal,
  'frame' | 'structure' | 'lead_measure' | 'week_log' | 'if_then' | 'next_start' | 'milestones' | 'status' | 'sphere'>>;

const EMPTY_WOOP = { wish: '', outcome: '', obstacle: '', plan: '' };
const EMPTY_SMARTER = { specific: '', measurable: '', achievable: '', relevant: '', time_bound: '', evaluate: '', readjust: '' };
const EMPTY_FTS = { unit: '', floor: null, target: null, stretch: null, current: null };

function field(kind: 'input' | 'textarea', path: string, value: string, label: string, onCommit: (v: string) => void) {
  const node = el(kind, 'goal-field') as HTMLInputElement | HTMLTextAreaElement;
  node.value = value;
  node.dataset.field = path;
  node.setAttribute('aria-label', label);
  node.addEventListener('change', () => onCommit(node.value.trim()));
  return node;
}

function numberField(path: string, value: number | null, label: string, onCommit: (v: number | null) => void) {
  const node = el('input', 'goal-field');
  node.type = 'number';
  node.value = value === null ? '' : String(value);
  node.dataset.field = path;
  node.setAttribute('aria-label', label);
  node.addEventListener('change', () => onCommit(node.value === '' ? null : Number(node.value)));
  return node;
}

function withFrame(goal: Goal, part: Partial<GoalFrame>): GoalPatch {
  return { frame: { ...goal.frame, ...part } };
}

function woop(goal: Goal, onPatch: (p: GoalPatch) => void): HTMLElement {
  const current = { ...EMPTY_WOOP, ...goal.frame.woop };
  const grid = el('div', 'goal-frame__grid');
  const parts: Array<[keyof typeof EMPTY_WOOP, string, string, string]> = [
    ['wish', 'W', 'Wish', 'tone-gold'],
    ['outcome', 'O', 'Outcome', 'tone-sage'],
    ['obstacle', 'O', 'Obstacle', 'tone-peach'],
    ['plan', 'P', 'Plan', 'tone-blue']
  ];
  for (const [key, letter, label, tone] of parts) {
    const tile = el('div', `goal-frame__tile ${tone}`);
    const head = el('div', 'row');
    head.append(el('span', 'goal-frame__letter', letter), el('span', 'goal-frame__label', label));
    tile.append(head, field('textarea', `woop.${key}`, current[key], label, (v) => onPatch(withFrame(goal, { woop: { ...current, [key]: v } }))));
    grid.append(tile);
  }
  return grid;
}

function smarter(goal: Goal, onPatch: (p: GoalPatch) => void): HTMLElement {
  const current = { ...EMPTY_SMARTER, ...goal.frame.smarter };
  const rows = el('div', 'goal-rows');
  const labels: Array<[keyof typeof EMPTY_SMARTER, string]> = [
    ['specific', 'Specific'], ['measurable', 'Measurable'], ['achievable', 'Achievable'], ['relevant', 'Relevant'],
    ['time_bound', 'Time-bound'], ['evaluate', 'Evaluate'], ['readjust', 'Readjust']
  ];
  for (const [key, label] of labels) {
    rows.append(el('span', 'goal-frame__label', label), field('input', `smarter.${key}`, current[key], label, (v) => onPatch(withFrame(goal, { smarter: { ...current, [key]: v } }))));
  }
  return rows;
}

function okr(goal: Goal, onPatch: (p: GoalPatch) => void): HTMLElement {
  const current = { objective: '', key_results: [], ...goal.frame.okr };
  const wrap = el('div', 'goal-rows');
  wrap.append(el('span', 'goal-frame__label', 'Objective'), field('input', 'okr.objective', current.objective, 'Objective', (v) => onPatch(withFrame(goal, { okr: { ...current, objective: v } }))));
  current.key_results.forEach((kr, index) => {
    const row = el('div', 'row');
    const save = (next: typeof kr) => onPatch(withFrame(goal, { okr: { ...current, key_results: current.key_results.map((k, i) => (i === index ? next : k)) } }));
    row.append(
      field('input', `okr.kr.${index}.label`, kr.label, 'Key result', (v) => save({ ...kr, label: v || kr.label })),
      numberField(`okr.kr.${index}.current`, kr.current, 'Current', (v) => save({ ...kr, current: v })),
      numberField(`okr.kr.${index}.target`, kr.target, 'Target', (v) => save({ ...kr, target: v }))
    );
    wrap.append(el('span', 'goal-frame__label', `KR ${index + 1}`), row);
  });
  const add = el('button', 'btn btn--ghost', '+ Key result');
  add.type = 'button';
  add.dataset.action = 'add-kr';
  add.addEventListener('click', () =>
    onPatch(withFrame(goal, {
      okr: { ...current, key_results: [...current.key_results, { id: `kr${current.key_results.length + 1}`, label: 'New key result', target: null, current: null }] }
    }))
  );
  wrap.append(el('span', ''), add);
  return wrap;
}

function leadLag(goal: Goal, onPatch: (p: GoalPatch) => void): HTMLElement {
  const current = { lag: '', ...goal.frame.lead_lag };
  const rows = el('div', 'goal-rows');
  rows.append(el('span', 'goal-frame__label', 'Lag (the outcome)'), field('textarea', 'lead_lag.lag', current.lag, 'Lag measure', (v) => onPatch(withFrame(goal, { lead_lag: { lag: v } }))));
  rows.append(el('span', 'goal-frame__label', 'Lead'), el('span', 'meta', 'The weekly lead measure below drives the runway.'));
  return rows;
}

function floorTargetStretch(goal: Goal, onPatch: (p: GoalPatch) => void): HTMLElement {
  const current = { ...EMPTY_FTS, ...goal.frame.floor_target_stretch };
  const save = (next: Partial<typeof current>) => onPatch(withFrame(goal, { floor_target_stretch: { ...current, ...next } }));
  const wrap = el('div');
  const levels: Array<['floor' | 'target' | 'stretch', string, string]> = [
    ['floor', 'Floor · still a win', 'tone-sage'],
    ['target', 'Target', 'tone-lilac'],
    ['stretch', 'Stretch', 'tone-gold']
  ];
  const reached = levels.filter(([key]) => current[key] !== null && current.current !== null && current.current >= (current[key] as number)).at(-1)?.[0];
  const grid = el('div', 'goal-frame__grid goal-frame__grid--3');
  for (const [key, label, tone] of levels) {
    const tile = el('div', `goal-frame__tile ${tone}`);
    tile.append(el('span', 'goal-frame__label', label), numberField(`fts.${key}`, current[key], label, (v) => save({ [key]: v })));
    if (reached === key) tile.append(el('span', 'goal-frame__here', "you're here"));
    grid.append(tile);
  }
  const rows = el('div', 'goal-rows');
  rows.append(
    el('span', 'goal-frame__label', 'Unit'), field('input', 'fts.unit', current.unit, 'Unit', (v) => save({ unit: v })),
    el('span', 'goal-frame__label', 'Where you are'), numberField('fts.current', current.current, 'Current', (v) => save({ current: v }))
  );
  wrap.append(grid, rows);
  return wrap;
}

/** The main card body for the goal's chosen structure. */
export function renderGoalFrame(goal: Goal, onPatch: (patch: GoalPatch) => void): HTMLElement {
  switch (goal.structure) {
    case 'woop': return woop(goal, onPatch);
    case 'smarter': return smarter(goal, onPatch);
    case 'okr': return okr(goal, onPatch);
    case 'lead_lag': return leadLag(goal, onPatch);
    case 'floor_target_stretch': return floorTargetStretch(goal, onPatch);
  }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-frame.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/tasks/src/views/goal-frame.ts apps/tasks/tests/unit/goal-frame.test.ts
git commit -m "feat(goals): structure card for WOOP, SMARTER, OKR, Lead/lag, Floor·target·stretch"
```

### Task 14: Goal page, hosting projects, tasks, milestones and @ tags

**Files:**
- Create: `apps/tasks/src/views/goal-page.ts`
- Modify: `apps/tasks/src/app/main.ts` (mount `#/goal/:id`)
- Test: `apps/tasks/tests/unit/goal-page.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/tasks/tests/unit/goal-page.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { renderGoalPage } from '@/views/goal-page';
import { mountTagAnythingSection } from '@/views/entity-tagger';
import { goal, project, task } from './goal-fixtures';

vi.mock('@/services/client-api', () => ({
  tasksApi: {
    getGoal: vi.fn(), updateGoal: vi.fn(), listProjects: vi.fn(), listTasks: vi.fn(), getHubPrefs: vi.fn(),
    updateProject: vi.fn(), createTask: vi.fn(), updateTask: vi.fn(), getGoalRead: vi.fn(), rescanGoalRead: vi.fn(), decideGhost: vi.fn()
  }
}));
vi.mock('@/views/entity-tagger', () => ({ mountTagAnythingSection: vi.fn() }));

const G = goal({
  id: 'g1', title: 'HA evidence', sphere: 'professional', structure: 'floor_target_stretch',
  lead_measure: { label: '1 write-up / week', per_week: 1 }, next_start: 'Open the spreadsheet',
  if_then: { cue: 'Tuesday P5', action: 'open the doc', obstacle: 'email' },
  milestones: [{ id: 'm1', title: 'Floor', due_date: '2026-11-20', status: 'open' }]
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tasksApi.getGoal).mockResolvedValue(G);
  vi.mocked(tasksApi.updateGoal).mockImplementation(async (_id, patch) => ({ ...G, ...(patch as object) }));
  vi.mocked(tasksApi.listProjects).mockResolvedValue([
    project({ id: 'p1', title: 'Portfolio', parent_goal_id: 'g1' }),
    project({ id: 'p2', title: 'Free project' })
  ]);
  vi.mocked(tasksApi.listTasks).mockResolvedValue([task({ id: 't1', title: 'Write up 6.3', parent_goal_id: 'g1' })]);
  vi.mocked(tasksApi.getHubPrefs).mockResolvedValue({ school_terms: [{ year: 2026, terms: [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }] }] } as never);
  vi.mocked(tasksApi.createTask).mockResolvedValue(task({ id: 't2', title: 'New' }));
  vi.mocked(tasksApi.updateProject).mockResolvedValue(project({ id: 'p2', title: 'Free project', parent_goal_id: 'g1' }));
  vi.mocked(tasksApi.getGoalRead).mockResolvedValue({ read: null, reason: 'first' } as never);
});

describe('goal page', () => {
  it('renders structure, lead strip, if-then, start, hosted projects and tasks, and mounts @ tags', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    expect(canvas.querySelector('.goal-card .hub-pills__btn.is-active')?.textContent).toBe('Floor · target · stretch');
    expect(canvas.querySelectorAll('.goal-lead__cells .cell')).toHaveLength(10);
    expect(canvas.textContent).toContain('Tuesday P5');
    expect(canvas.textContent).toContain('Open the spreadsheet');
    expect(canvas.textContent).toContain('Portfolio');
    expect(canvas.textContent).toContain('Write up 6.3');
    expect(mountTagAnythingSection).toHaveBeenCalledWith(expect.any(HTMLElement), 'tasks:goal:g1');
  });

  it('switching structure patches only structure', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    [...canvas.querySelectorAll<HTMLButtonElement>('.goal-card .hub-pills__btn')].find((b) => b.textContent === 'WOOP')!.click();
    expect(tasksApi.updateGoal).toHaveBeenCalledWith('g1', { structure: 'woop' });
  });

  it('+1 this week adds a manual tap on the Monday key', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    canvas.querySelector<HTMLButtonElement>('[data-action="plus-one"]')!.click();
    expect(tasksApi.updateGoal).toHaveBeenCalledWith('g1', { week_log: { '2026-11-02': { manual: 1 } } });
  });

  it('links a free project and adds a task under the goal with the sphere domain', async () => {
    const canvas = document.createElement('div');
    await renderGoalPage(canvas, 'g1', '2026-11-04');
    const select = canvas.querySelector<HTMLSelectElement>('select[name="link-project"]')!;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'p2']);
    select.value = 'p2';
    canvas.querySelector<HTMLButtonElement>('[data-action="link-project"]')!.click();
    expect(tasksApi.updateProject).toHaveBeenCalledWith('p2', { parent_goal_id: 'g1' });

    const input = canvas.querySelector<HTMLInputElement>('input[name="new-task"]')!;
    input.value = 'Collect student voice';
    canvas.querySelector<HTMLButtonElement>('[data-action="add-task"]')!.click();
    expect(tasksApi.createTask).toHaveBeenCalledWith({ title: 'Collect student voice', domain: 'other', parent_goal_id: 'g1' });
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-page.test.ts`
Expected: FAIL, because `@/views/goal-page` isn't found.

- [ ] **Step 3: Implement `apps/tasks/src/views/goal-page.ts`**

```ts
import { normalizeGoal, type Goal } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { SchoolTerm } from '@/domain/school-time';
import { mondayOf } from '@/domain/school-time';
import { tasksApi } from '@/services/client-api';
import { errorMessage, showViewLoading } from '@/views/feedback';
import { createHubPills, el } from '@/views/hub-kit';
import { mountTagAnythingSection } from '@/views/entity-tagger';
import { renderGoalFrame, type GoalPatch } from '@/views/goal-frame';
import { startFocusStrip } from '@/views/focus-strip';
import { directTasks, hostedProjects, hostedTasks, isOpenTask, projectProgress, SPHERE_DOMAIN, SPHERE_LABEL } from '@/domain/goal-hosting';
import { cellState, currentTerm, flattenTerms, sydneyToday, termWeeks, weekCount } from '@/domain/goal-runway';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

const STRUCTURES: Array<{ id: Goal['structure']; label: string }> = [
  { id: 'woop', label: 'WOOP' },
  { id: 'smarter', label: 'SMARTER' },
  { id: 'okr', label: 'OKR' },
  { id: 'lead_lag', label: 'Lead / lag' },
  { id: 'floor_target_stretch', label: 'Floor · target · stretch' }
];
const STATUSES: Array<{ id: Goal['status']; label: string }> = [
  { id: 'active', label: 'Active' },
  { id: 'parked', label: 'Parked' },
  { id: 'achieved', label: 'Achieved' },
  { id: 'dropped', label: 'Dropped' }
];

export type GoalPageState = { goal: Goal; projects: Project[]; tasks: Task[]; terms: SchoolTerm[]; today: string };
/** Hook for Task 17: fills the Hammond column. Defaults to nothing. */
export type HammondMount = (host: HTMLElement, state: GoalPageState, reload: () => void) => void;

export async function renderGoalPage(
  canvas: HTMLElement,
  goalId: string,
  today = sydneyToday(),
  mountHammond: HammondMount = () => {}
): Promise<void> {
  showViewLoading(canvas, 'Loading goal…', '.goal-page');
  try {
    const [goal, projects, tasks, prefs] = await Promise.all([
      tasksApi.getGoal(goalId),
      tasksApi.listProjects(),
      tasksApi.listTasks(),
      tasksApi.getHubPrefs()
    ]);
    paint(canvas, { goal, projects, tasks, terms: flattenTerms(prefs), today }, mountHammond);
  } catch (err) {
    canvas.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Could not load this goal.')));
  }
}

function card(title: string, className = 'glass-tile goal-card'): { root: HTMLElement; head: HTMLElement } {
  const root = el('section', className);
  const head = el('p', 'goal-card__eyebrow');
  head.append(el('span', '', title));
  root.append(head);
  return { root, head };
}

function paint(canvas: HTMLElement, state: GoalPageState, mountHammond: HammondMount): void {
  const { goal, projects, tasks, terms, today } = state;
  const reload = () => void renderGoalPage(canvas, goal.id, today, mountHammond);
  const save = (patch: GoalPatch | Partial<Goal>) =>
    tasksApi
      .updateGoal(goal.id, patch)
      .then((next) => paint(canvas, { ...state, goal: normalizeGoal(next) }, mountHammond))
      .catch((err) => window.alert(errorMessage(err)));

  canvas.replaceChildren();
  const hosted = hostedTasks(goal, tasks, projects);
  const dream = goal.parent_someday_id ? tasks.find((t) => t.id === goal.parent_someday_id) : undefined;

  const meta = el('div', 'goal-page__meta');
  const line = [SPHERE_LABEL[goal.sphere], dream ? `From ✦ ${dream.title}` : null, goal.due_date ? `due ${formatDisplayDate(goal.due_date)}` : null]
    .filter(Boolean)
    .join(' · ');
  const metaActions = el('div', 'row');
  const back = el('a', 'btn btn--secondary', '← Runway');
  back.href = '#/goals';
  const focus = el('button', 'btn btn--primary', 'Give it 25 min now');
  focus.type = 'button';
  focus.addEventListener('click', () => startFocusStrip(canvas, { minutes: 25, label: `Focus: ${goal.title}` }));
  metaActions.append(
    createHubPills({ label: 'Status', items: STATUSES, value: goal.status, onSelect: (status) => void save({ status }) }),
    back,
    focus
  );
  meta.append(el('span', '', line), metaActions);

  const page = el('div', 'goal-page');
  const main = el('div', 'goal-page__main');
  const aside = el('aside', 'goal-page__hammond');
  page.append(main, aside);
  canvas.append(meta, page);

  // 1. Structure card + lead measure
  const structure = card('Structure');
  structure.root.append(
    createHubPills({ label: 'Structure', items: STRUCTURES, value: goal.structure, onSelect: (id) => void save({ structure: id }) }),
    renderGoalFrame(goal, (patch) => void save(patch)),
    leadMeasure(goal, hosted, terms, today, save)
  );
  main.append(structure.root);

  // 2. If-then + 3. next start
  const pair = el('div', 'goal-page__pair');
  pair.append(ifThen(goal, save), nextStart(goal, canvas, save));
  main.append(pair);

  // 4. Projects + milestones, 5. tasks
  const pair2 = el('div', 'goal-page__pair');
  pair2.append(projectsCard(goal, projects, tasks, reload), tasksCard(goal, tasks, reload));
  main.append(pair2, milestonesCard(goal, save));

  // 6. Tagged (@)
  const tagged = card('Tagged (@)');
  const tagHost = el('div');
  tagged.root.append(tagHost);
  main.append(tagged.root);
  mountTagAnythingSection(tagHost, `tasks:goal:${goal.id}`);

  mountHammond(aside, state, reload);
}

function leadMeasure(goal: Goal, hosted: Task[], terms: SchoolTerm[], today: string, save: (p: GoalPatch) => void): HTMLElement {
  const wrap = el('div', 'goal-lead');
  const label = el('input', 'goal-field');
  label.value = goal.lead_measure?.label ?? '';
  label.placeholder = 'Weekly lead measure, e.g. 1 evidence write-up';
  label.setAttribute('aria-label', 'Lead measure');
  const per = el('input', 'goal-field');
  per.type = 'number';
  per.min = '1';
  per.value = String(goal.lead_measure?.per_week ?? 1);
  per.style.width = '4rem';
  per.setAttribute('aria-label', 'Times per week');
  const commit = () => {
    const text = label.value.trim();
    const n = Math.max(1, Math.round(Number(per.value) || 1));
    save({ lead_measure: text ? { label: text, per_week: n } : null });
  };
  label.addEventListener('change', commit);
  per.addEventListener('change', commit);
  wrap.append(el('span', 'goal-frame__label', 'Lead measure'), label, per, el('span', 'meta', '/ week'));

  const term = currentTerm(terms, today);
  if (term) {
    const cells = el('span', 'goal-lead__cells');
    const nowMonday = mondayOf(today);
    for (const week of termWeeks(term, today)) {
      const count = weekCount(goal, hosted, week.monday);
      const mark = el('i', `cell cell--${cellState(goal, count, week.monday, nowMonday)}`);
      mark.classList.toggle('is-now', week.isNow);
      mark.title = `${week.label}: ${count}`;
      cells.append(mark);
    }
    wrap.append(cells);
  }
  const plus = el('button', 'btn btn--secondary', '+1 this week');
  plus.type = 'button';
  plus.dataset.action = 'plus-one';
  plus.addEventListener('click', () => {
    const monday = mondayOf(today);
    const manual = (goal.week_log[monday]?.manual ?? 0) + 1;
    save({ week_log: { ...goal.week_log, [monday]: { manual } } });
  });
  wrap.append(plus);
  return wrap;
}

function ifThen(goal: Goal, save: (p: GoalPatch) => void): HTMLElement {
  const root = el('section', 'goal-ifthen');
  const head = el('p', 'goal-card__eyebrow', 'If–then trigger · shows where you act');
  const current = goal.if_then ?? { cue: '', action: '', obstacle: '' };
  const input = (key: 'cue' | 'action' | 'obstacle', label: string) => {
    const node = el('input', 'goal-field');
    node.value = current[key];
    node.placeholder = label;
    node.setAttribute('aria-label', label);
    node.addEventListener('change', () => {
      const next = { ...current, [key]: node.value.trim() };
      save({ if_then: next.cue && next.action ? next : null });
    });
    return node;
  };
  const row1 = el('p', 'row');
  row1.append(el('b', '', 'If'), input('cue', 'the cue, e.g. Tuesday P5 and not teaching'));
  const row2 = el('p', 'row');
  row2.append(el('b', '', 'then'), input('action', 'what you do'));
  const row3 = el('p', 'row');
  row3.append(el('span', 'meta', 'Answers the obstacle:'), input('obstacle', "e.g. it's boring admin, so email wins"));
  root.append(head, row1, row2, row3);
  return root;
}

function nextStart(goal: Goal, canvas: HTMLElement, save: (p: GoalPatch) => void): HTMLElement {
  const root = el('section', 'goal-start');
  const input = el('input', 'goal-field');
  input.value = goal.next_start ?? '';
  input.placeholder = 'The 2-minute start';
  input.setAttribute('aria-label', 'Smallest next start');
  input.addEventListener('change', () => save({ next_start: input.value.trim() || null }));
  const row = el('div', 'row');
  row.style.marginTop = 'var(--space-3)';
  const start = el('button', 'btn btn--primary', 'Start now');
  start.type = 'button';
  start.addEventListener('click', () => startFocusStrip(canvas, { minutes: 25, label: input.value || goal.title }));
  const body = el('button', 'btn btn--secondary', 'Body-double');
  body.type = 'button';
  body.addEventListener('click', () => startFocusStrip(canvas, { minutes: 15, label: "Hammond's with you" }));
  row.append(start, body);
  row.dataset.slot = 'start-actions';
  root.append(el('p', 'goal-card__eyebrow', 'Smallest next start · 2 min'), input, row);
  return root;
}

function projectsCard(goal: Goal, projects: Project[], tasks: Task[], reload: () => void): HTMLElement {
  const { root } = card('Projects under this goal');
  for (const project of hostedProjects(goal, projects)) {
    const progress = projectProgress(project, tasks);
    const item = el('div', 'goal-list__item');
    const link = el('a', '', project.title);
    link.href = `#/project/${encodeURIComponent(project.id)}`;
    const bar = el('span', 'goal-progress');
    const fill = el('i');
    fill.style.width = `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`;
    bar.append(fill);
    const unlink = el('button', 'btn btn--ghost', '×');
    unlink.type = 'button';
    unlink.setAttribute('aria-label', `Unlink ${project.title}`);
    unlink.addEventListener('click', () => void tasksApi.updateProject(project.id, { parent_goal_id: null }).then(reload));
    const right = el('span', 'r');
    right.append(bar, el('span', 'meta', `${progress.done}/${progress.total}`), unlink);
    item.append(link, right);
    root.append(item);
  }
  const add = el('div', 'goal-add');
  const select = el('select', 'goal-field') as HTMLSelectElement;
  select.name = 'link-project';
  select.setAttribute('aria-label', 'Project to link');
  const none = el('option', '', 'Link a project…') as HTMLOptionElement;
  none.value = '';
  select.append(none);
  for (const project of projects.filter((p) => p.status === 'active' && !p.parent_goal_id)) {
    const option = el('option', '', project.title) as HTMLOptionElement;
    option.value = project.id;
    select.append(option);
  }
  const link = el('button', 'btn btn--secondary', 'Link');
  link.type = 'button';
  link.dataset.action = 'link-project';
  link.addEventListener('click', () => {
    if (!select.value) return;
    void tasksApi.updateProject(select.value, { parent_goal_id: goal.id }).then(reload);
  });
  add.append(select, link);
  root.append(add);
  return root;
}

function tasksCard(goal: Goal, tasks: Task[], reload: () => void): HTMLElement {
  const { root } = card('Tasks on this goal');
  const list = directTasks(goal, tasks).sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
  for (const task of list) {
    const item = el('label', 'goal-list__item');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = !isOpenTask(task);
    box.addEventListener('change', () =>
      void tasksApi
        .updateTask(task.id, box.checked ? { status: 'done', completed_at: new Date().toISOString() } : { status: 'open', completed_at: null })
        .then(reload)
    );
    item.append(box, el('span', '', task.title));
    if (task.due_date) item.append(el('span', 'r meta', formatDisplayDate(task.due_date)));
    root.append(item);
  }
  const add = el('div', 'goal-add');
  const input = el('input', 'goal-field');
  input.name = 'new-task';
  input.placeholder = 'Add a task to this goal';
  input.setAttribute('aria-label', 'New task');
  const button = el('button', 'btn btn--secondary', 'Add');
  button.type = 'button';
  button.dataset.action = 'add-task';
  button.addEventListener('click', () => {
    const title = input.value.trim();
    if (!title) return;
    void tasksApi.createTask({ title, domain: SPHERE_DOMAIN[goal.sphere], parent_goal_id: goal.id }).then(reload);
  });
  add.append(input, button);
  root.append(add);
  return root;
}

function milestonesCard(goal: Goal, save: (p: GoalPatch) => void): HTMLElement {
  const { root } = card('Milestones');
  for (const milestone of goal.milestones) {
    const item = el('label', 'goal-list__item');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = milestone.status === 'done';
    box.addEventListener('change', () =>
      save({ milestones: goal.milestones.map((m) => (m.id === milestone.id ? { ...m, status: box.checked ? 'done' : 'open' } : m)) })
    );
    item.append(box, el('span', '', milestone.title));
    if (milestone.due_date) item.append(el('span', 'r meta', formatDisplayDate(milestone.due_date)));
    root.append(item);
  }
  const add = el('div', 'goal-add');
  const title = el('input', 'goal-field');
  title.placeholder = 'Milestone';
  title.setAttribute('aria-label', 'Milestone title');
  const date = el('input', 'goal-field');
  date.type = 'date';
  date.setAttribute('aria-label', 'Milestone date');
  const button = el('button', 'btn btn--secondary', 'Add');
  button.type = 'button';
  button.addEventListener('click', () => {
    if (!title.value.trim()) return;
    save({
      milestones: [
        ...goal.milestones,
        { id: `ms${Date.now().toString(36)}`, title: title.value.trim(), due_date: date.value || null, status: 'open' }
      ]
    });
  });
  add.append(title, date, button);
  root.append(add);
  return root;
}
```

- [ ] **Step 4: Mount it in `main.ts`.** Add `parseGoalPage` to the `@/shell/shell` import and `import { renderGoalPage } from '@/views/goal-page';`. In the `nextView` condition at `main.ts:180`, add `&& !parseGoalPage()` after `!parseEntityPage()`. Directly before `const entity = parseEntityPage();`, add:

```ts
    const goalPage = parseGoalPage();
    if (goalPage) {
      resetPaint();
      renderPrimaryNav(shell.railNav, 'goals');
      const goal = await tasksApi.getGoal(goalPage.id).catch(() => null);
      renderPageHeader(shell, { eyebrow: 'Goals', title: goal?.title ?? 'Goal' });
      try {
        await renderGoalPage(shell.canvas, goalPage.id);
      } catch (err) {
        renderLoadError(shell.canvas, err, () => void paint({ force: true }), 'Could not open goal');
      }
      return;
    }
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd apps/tasks && npx vitest run tests/unit/goal-page.test.ts tests/unit/goals-view.test.ts && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: all pass, with a tsc count ≤ the baseline. If `format-display-date.js` has no `.d.ts` and the import errors, copy the import line exactly from `src/views/backlog.ts:46`, which already compiles.

- [ ] **Step 6: Browser check (mock API).** Start the Tasks dev server from `.claude/launch.json` (or `cd apps/tasks && npm run dev`). Open `#/goals`: the runway shows three lanes. Create a goal, open it, switch structure, type in a field, add a task, and link a project. The console should have no errors. Take a screenshot to compare with `docs/proposals/goals-reference/goal-page.png`. The Hammond column will be empty until Task 17.

- [ ] **Step 7: Commit**

```bash
git add apps/tasks/src/views/goal-page.ts apps/tasks/src/app/main.ts apps/tasks/tests/unit/goal-page.test.ts
git commit -m "feat(goals): goal page — structures, lead measure, if-then, start, hosting, milestones, @ tags"
```

---

## Phase 6: Hammond as contributor

### Task 15: New ghost kinds, `split_task` and `goal_rest_weeks`

**Files:**
- Modify: `apps/life/js/app/ghost-writes.js`
- Test: `tests/unit/ghost-writes-goals.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/ghost-writes-goals.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptPlan, validateGhost, GHOST_KINDS } from '../../apps/life/js/app/ghost-writes.js';
import { validateCentralNodePatchInput } from '../../netlify/functions/_shared/hammond-tools.mjs';

const TODAY = '2026-11-04';

test('split_task posts one step per title with stable suffixes and goal fields', () => {
  const plan = acceptPlan({
    id: 'goal-g1-split-t1', agent: 'hammond', kind: 'split_task', taskId: 't1', title: 'Write up 6.3',
    steps: ['Pull examples', 'Draft 150 words', 'Attach artefacts'], goalId: 'g1', domain: 'other'
  }, { today: TODAY });
  const posts = plan.steps.filter(step => step.target === 'tasks');
  assert.deepEqual(posts.map(step => step.suffix), ['s1', 's2', 's3']);
  assert.deepEqual(posts[0], {
    target: 'tasks', method: 'POST', suffix: 's1',
    body: { title: 'Pull examples', kind: 'step', parent_task_id: 't1', step_order: 1, status: 'open', parent_goal_id: 'g1', domain: 'other' }
  });
  const cn = plan.steps.filter(step => step.target === 'central_node');
  assert.equal(cn.length, 1);
  assert.ok(validateCentralNodePatchInput(cn[0].patch));
  assert.match(plan.receipt, /now has 3 steps/);
});

test('goal_rest_weeks patches the goal with the full rest list', () => {
  const plan = acceptPlan({
    id: 'goal-g1-rest-2026-11-16', agent: 'hammond', kind: 'goal_rest_weeks', goalId: 'g1', title: 'HA evidence',
    weeks: ['2026-11-16'], rest_weeks: ['2026-10-19', '2026-11-16']
  }, { today: TODAY });
  assert.deepEqual(plan.steps[0], {
    target: 'tasks', collection: 'goals', method: 'PATCH', id: 'g1', body: { rest_weeks: ['2026-10-19', '2026-11-16'] }
  });
  assert.match(plan.receipt, /16\/11/);
});

test('create_task carries goalId and domain', () => {
  const plan = acceptPlan({
    id: 'goal-g1-start', agent: 'hammond', kind: 'create_task', title: 'Open the spreadsheet', due: '2026-11-06', goalId: 'g1', domain: 'other'
  }, { today: TODAY });
  assert.equal(plan.steps[0].body.parent_goal_id, 'g1');
  assert.equal(plan.steps[0].body.domain, 'other');
});

test('validateGhost rejects malformed goal ghosts', () => {
  assert.ok(GHOST_KINDS.includes('split_task') && GHOST_KINDS.includes('goal_rest_weeks'));
  assert.throws(() => validateGhost({ id: 'x', agent: 'hammond', kind: 'split_task', taskId: 't1', steps: [] }), /1–6 step titles/);
  assert.throws(() => validateGhost({ id: 'x', agent: 'hammond', kind: 'split_task', steps: ['a'] }), /taskId/);
  assert.throws(() => validateGhost({ id: 'x', agent: 'hammond', kind: 'goal_rest_weeks', goalId: 'g', weeks: ['bad'], rest_weeks: [] }), /weeks/);
  assert.throws(() => validateGhost({ id: 'x', agent: 'hammond', kind: 'goal_rest_weeks', goalId: 'g', weeks: ['2026-11-16'], rest_weeks: [] }), /rest_weeks/);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test tests/unit/ghost-writes-goals.test.js`
Expected: FAIL with `Unknown ghost kind: split_task`.

- [ ] **Step 3: Implement in `ghost-writes.js`**

```js
export const GHOST_KINDS = Object.freeze([
  'skip_workout', 'bedtime', 'protect_block', 'move_task', 'create_task', 'draft_message', 'split_task', 'goal_rest_weeks'
]);
```

In `validateGhost`, replace the `dated` line and add the new checks before `return ghost;`:

```js
  const dated = !['move_task', 'create_task', 'draft_message', 'split_task', 'goal_rest_weeks'].includes(ghost.kind);
```
```js
  if (ghost.kind === 'split_task') {
    if (typeof ghost.taskId !== 'string' || !ghost.taskId) throw new TypeError('split_task needs taskId');
    if (!Array.isArray(ghost.steps) || ghost.steps.length < 1 || ghost.steps.length > 6 || ghost.steps.some(step => !oneLine(step))) {
      throw new TypeError('split_task needs 1–6 step titles');
    }
  }
  if (ghost.kind === 'goal_rest_weeks') {
    if (typeof ghost.goalId !== 'string' || !ghost.goalId) throw new TypeError('goal_rest_weeks needs goalId');
    if (!Array.isArray(ghost.weeks) || !ghost.weeks.length || ghost.weeks.some(week => !DATE_KEY.test(week ?? ''))) {
      throw new TypeError('goal_rest_weeks needs weeks (YYYY-MM-DD)');
    }
    if (!Array.isArray(ghost.rest_weeks) || ghost.weeks.some(week => !ghost.rest_weeks.includes(week))) {
      throw new TypeError('goal_rest_weeks needs rest_weeks containing weeks');
    }
  }
```

In `acceptPlan`, change the `create_task` body line to:

```js
      const body = {
        title,
        due_date: ghost.due,
        status: 'open',
        ...(ghost.notes ? { notes: oneLine(ghost.notes) } : {}),
        ...(ghost.source ? { source: ghost.source } : {}),
        ...(ghost.goalId ? { parent_goal_id: ghost.goalId } : {}),
        ...(ghost.domain ? { domain: ghost.domain } : {})
      };
```

Add two cases before `default:`:

```js
    case 'split_task': {
      const parent = oneLine(ghost.title) || ghost.taskId;
      ghost.steps.forEach((stepTitle, index) => {
        steps.push({
          target: 'tasks',
          method: 'POST',
          suffix: `s${index + 1}`,
          body: {
            title: oneLine(stepTitle),
            kind: 'step',
            parent_task_id: ghost.taskId,
            step_order: index + 1,
            status: 'open',
            ...(ghost.goalId ? { parent_goal_id: ghost.goalId } : {}),
            ...(ghost.domain ? { domain: ghost.domain } : {})
          }
        });
      });
      steps.push(recentAction(actedOn, who, `split “${parent}” into ${ghost.steps.length} steps`));
      receipt = `${who} → Tasks: “${parent}” now has ${ghost.steps.length} steps.`;
      break;
    }
    case 'goal_rest_weeks': {
      const title = oneLine(ghost.title) || ghost.goalId;
      const list = ghost.weeks.map(short).join(', ');
      steps.push({ target: 'tasks', collection: 'goals', method: 'PATCH', id: ghost.goalId, body: { rest_weeks: [...ghost.rest_weeks] } });
      steps.push(recentAction(actedOn, who, `planned rest for “${title}”: weeks of ${list}`));
      receipt = `${who} → Goals: “${title}” rests the weeks of ${list}. Those weeks won't count as misses.`;
      break;
    }
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test tests/unit/ghost-writes-goals.test.js tests/unit/ghost-writes.test.js`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/life/js/app/ghost-writes.js tests/unit/ghost-writes-goals.test.js
git commit -m "feat(ghosts): split_task and goal_rest_weeks; create_task under a goal"
```

### Task 16: The ghost executor learns goal steps

**Files:**
- Modify: `netlify/functions/calendar-ghosts.mjs` (`applyTaskStep`, around line 295)
- Test: `tests/unit/ghost-task-steps.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/ghost-task-steps.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTaskStep, ghostTaskId } from '../../netlify/functions/calendar-ghosts.mjs';
import { taskKey, TASKS_INDEX_KEY } from '../../netlify/functions/_shared/tasks-blobs.mjs';

function memoryTasks(seed = {}) {
  const data = new Map([[TASKS_INDEX_KEY, []], ...Object.entries(seed)]);
  return {
    data,
    async get(key, options) {
      const value = data.get(key);
      if (value == null) return null;
      return options?.type === 'json' ? structuredClone(value) : value;
    },
    async setJSON(key, value) { data.set(key, structuredClone(value)); },
    async set(key, value) { data.set(key, typeof value === 'string' ? JSON.parse(value) : value); }
  };
}

test('split steps get stable suffixed ids, step fields, and retries are no-ops', async () => {
  const store = memoryTasks();
  const step = {
    target: 'tasks', method: 'POST', suffix: 's1',
    body: { title: 'Pull examples', kind: 'step', parent_task_id: 't1', step_order: 1, status: 'open', parent_goal_id: 'g1', domain: 'other' }
  };
  await applyTaskStep(store, step, { ghostId: 'goal-g1-split-t1' });
  await applyTaskStep(store, step, { ghostId: 'goal-g1-split-t1' });
  const id = `${ghostTaskId('goal-g1-split-t1')}-s1`;
  const saved = store.data.get(taskKey(id));
  assert.equal(saved.kind, 'step');
  assert.equal(saved.parent_task_id, 't1');
  assert.equal(saved.parent_goal_id, 'g1');
  assert.equal(saved.step_order, 1);
  assert.equal(saved.domain, 'other');
  assert.deepEqual(store.data.get(TASKS_INDEX_KEY), [id]);
});

test('a goals PATCH step merges, normalises and stamps the goal', async () => {
  const store = memoryTasks({
    'goals/g1': { schema_version: 1, id: 'g1', title: 'HA', rest_weeks: ['2026-10-19'], created_at: 'a', updated_at: '2026-09-01T00:00:00.000Z' }
  });
  await applyTaskStep(store, { target: 'tasks', collection: 'goals', method: 'PATCH', id: 'g1', body: { rest_weeks: ['2026-10-19', '2026-11-16', 'bad'] } });
  const goal = store.data.get('goals/g1');
  assert.deepEqual(goal.rest_weeks, ['2026-10-19', '2026-11-16']);
  assert.notEqual(goal.updated_at, '2026-09-01T00:00:00.000Z');
  await assert.rejects(
    () => applyTaskStep(store, { target: 'tasks', collection: 'goals', method: 'PATCH', id: 'missing', body: {} }),
    error => error.code === 'goal_not_found'
  );
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test tests/unit/ghost-task-steps.test.js`
Expected: FAIL. `applyTaskStep` is not exported.

- [ ] **Step 3: Implement.** In `calendar-ghosts.mjs`:

1. Add the import `import { normalizeGoalRecord } from './_shared/goal-record.mjs';`.
2. Change `async function applyTaskStep(` to `export async function applyTaskStep(`.
3. As the first statement inside `applyTaskStep`, add:

```js
  if (step.method === 'PATCH' && step.collection === 'goals') {
    const key = `goals/${step.id}`;
    const existing = await getJSON(store, key);
    if (!existing || typeof existing !== 'object') {
      throw Object.assign(new Error('Goal not found'), { code: 'goal_not_found' });
    }
    await setJSON(store, key, normalizeGoalRecord({ ...existing, ...(step.body ?? {}), updated_at: new Date().toISOString() }));
    return;
  }
```

4. In the POST branch, replace `const id = ghostId ? ghostTaskId(ghostId) : newTaskId();` with:

```js
    const baseId = ghostId ? ghostTaskId(ghostId) : newTaskId();
    const id = ghostId && typeof step.suffix === 'string' && step.suffix ? `${baseId}-${step.suffix}` : baseId;
```

5. In the same POST branch's `normalizeTaskRecord({ … })` object, replace `kind: 'task',` with:

```js
      kind: body.kind === 'step' && typeof body.parent_task_id === 'string' ? 'step' : 'task',
```

and directly after `parent_project_id: null,` add:

```js
      parent_goal_id: typeof body.parent_goal_id === 'string' ? body.parent_goal_id : null,
      parent_task_id: typeof body.parent_task_id === 'string' ? body.parent_task_id : null,
      step_order: Number.isInteger(body.step_order) ? body.step_order : 0,
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test tests/unit/ghost-task-steps.test.js tests/unit/calendar-ghosts.test.js tests/unit/almanac-api.test.js`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/calendar-ghosts.mjs tests/unit/ghost-task-steps.test.js
git commit -m "feat(ghosts): executor handles goal PATCH, step fields, suffixed ids"
```

### Task 17: Hammond's goal read (pure)

**Files:**
- Create: `netlify/functions/_shared/goal-read.mjs`
- Test: `tests/unit/goal-read.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/goal-read.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  basisUpdatedAt, buildGoalRead, crunchWeeks, goalIdFromGhostId, mondayOfKey, termsFromHubPrefs
} from '../../netlify/functions/_shared/goal-read.mjs';

const TERMS = [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }];
const TODAY = '2026-11-04';

function task(partial) {
  return { kind: 'task', bucket: 'active', status: 'open', domain: 'other', due_date: null, completed_at: null,
    estimated_duration: null, parent_goal_id: null, parent_project_id: null, parent_task_id: null,
    updated_at: '2026-09-01T00:00:00.000Z', ...partial };
}

const GOAL = {
  id: 'g1', title: 'HA evidence', sphere: 'professional', status: 'active',
  lead_measure: { label: '1 write-up', per_week: 1 }, rest_weeks: [], week_log: {}, next_start: null,
  created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z'
};
const HEAVY = Array.from({ length: 6 }, (_, i) => task({ id: `h${i}`, title: `Report ${i}`, due_date: '2026-11-18' }));
const TASKS = [
  task({ id: 't1', title: 'Write up 6.3', parent_goal_id: 'g1', due_date: '2026-11-06', estimated_duration: 60 }),
  task({ id: 't2', title: 'Old chase', parent_goal_id: 'g1', due_date: '2026-11-01' }),
  ...HEAVY
];

test('helpers: Monday keys, ghost ids, hub-prefs terms in either shape', () => {
  assert.equal(mondayOfKey('2026-11-04'), '2026-11-02');
  assert.equal(goalIdFromGhostId('goal-goal_a1-split-task_x'), 'goal_a1');
  assert.equal(goalIdFromGhostId('goal-g-1-start'), 'g-1');
  assert.equal(goalIdFromGhostId('alm-hold-x'), null);
  assert.deepEqual(termsFromHubPrefs({ school_terms: [{ year: 2026, terms: TERMS }] }), TERMS);
  assert.deepEqual(termsFromHubPrefs({ school_terms: TERMS }), TERMS);
  assert.deepEqual(termsFromHubPrefs(null), []);
});

test('crunch weeks are future weeks at or over max(5, 1.5 × median) open due tasks', () => {
  assert.deepEqual(crunchWeeks(TASKS, TERMS, TODAY), ['2026-11-16']);
});

test('the read: cold, lead count, crunch, verdict, and proposals in order', () => {
  const read = buildGoalRead({ goal: GOAL, projects: [], tasks: TASKS, terms: TERMS, today: TODAY });
  assert.equal(read.goal_id, 'g1');
  assert.equal(read.computed_on, TODAY);
  assert.equal(read.temperature, 'cold');
  assert.equal(read.days_since_movement, 15);
  assert.deepEqual(read.week, { count: 0, per_week: 1 });
  assert.deepEqual(read.crunch_weeks, ['2026-11-16']);
  assert.match(read.verdict, /Gone quiet: nothing for 15 days\./);
  assert.match(read.verdict, /0 of 1 this week\./);
  assert.match(read.verdict, /16\/11/);
  assert.deepEqual(read.ghosts.map(g => g.id), ['goal-g1-split-t1', 'goal-g1-rest-2026-11-16', 'goal-g1-move-t2']);
  const [split, rest, move] = read.ghosts;
  assert.equal(split.kind, 'split_task');
  assert.equal(split.steps.length, 3);
  assert.deepEqual(rest.rest_weeks, ['2026-11-16']);
  assert.deepEqual({ from: move.from, to: move.to }, { from: '2026-11-01', to: '2026-11-05' });
  assert.equal(read.basis_updated_at, '2026-10-20T00:00:00.000Z');
});

test('dismissed ids are left out; an empty goal gets a start task', () => {
  const read = buildGoalRead({ goal: GOAL, tasks: TASKS, terms: TERMS, today: TODAY, dismissed: ['goal-g1-rest-2026-11-16'] });
  assert.deepEqual(read.ghosts.map(g => g.id), ['goal-g1-split-t1', 'goal-g1-move-t2']);
  const empty = buildGoalRead({ goal: { ...GOAL, id: 'g2', next_start: 'Open the spreadsheet' }, tasks: [], terms: TERMS, today: TODAY });
  assert.deepEqual(empty.ghosts[0], {
    id: 'goal-g2-start', agent: 'hammond', kind: 'create_task', title: 'Open the spreadsheet', due: '2026-11-06',
    goalId: 'g2', domain: 'other', reason: 'Nothing is open under this goal'
  });
});

test('basis includes hosted project and task stamps', () => {
  const projects = [{ id: 'p1', parent_goal_id: 'g1', status: 'active', updated_at: '2026-11-03T00:00:00.000Z' }];
  assert.equal(basisUpdatedAt(GOAL, projects, TASKS), '2026-11-03T00:00:00.000Z');
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test tests/unit/goal-read.test.js`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement**

```js
// netlify/functions/_shared/goal-read.mjs
/**
 * Hammond's read of one goal. Pure: no I/O. Deterministic, like ghost-proposer.js.
 * Spec: docs/superpowers/specs/2026-09-26-goals-redesign-design.md ("Hammond's goal read").
 */
import { getSydneyDateKey } from '../../../apps/life/js/core/time.js';
import { addDays, daysBetween } from '../../../packages/design-kit/js/lead-lines.js';

export const SPHERE_DOMAIN = Object.freeze({ life: 'life', work: 'teaching', professional: 'other' });
const MAX_GHOSTS = 3;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const GHOST_ID = /^goal-(.+?)-(?:start|split-.+|rest-.+|move-.+)$/;

export function goalIdFromGhostId(id) {
  const match = typeof id === 'string' ? GHOST_ID.exec(id) : null;
  return match ? match[1] : null;
}

export function mondayOfKey(key) {
  const dow = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(key, -dow);
}

/** Hub prefs store terms nested by year; accept flat rows too. */
export function termsFromHubPrefs(prefs) {
  const rows = Array.isArray(prefs?.school_terms) ? prefs.school_terms : [];
  return rows
    .flatMap(row => (Array.isArray(row?.terms) ? row.terms : [row]))
    .filter(t => t && DATE_KEY.test(t.starts_on ?? '') && DATE_KEY.test(t.ends_on ?? '') && t.starts_on <= t.ends_on)
    .map(t => ({ term: Number.isInteger(t.term) ? t.term : null, starts_on: t.starts_on, ends_on: t.ends_on }))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

function sydneyKey(iso) {
  return getSydneyDateKey(new Date(iso));
}

function shortDate(key) {
  return `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}`;
}

function isOpen(task) {
  return task.status !== 'done' && task.status !== 'dead';
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function hostedOf(goal, projects = [], tasks = []) {
  const hostedProjects = projects.filter(p => p && p.parent_goal_id === goal.id && p.status !== 'archived');
  const projectIds = new Set(hostedProjects.map(p => p.id));
  const hostedTasks = tasks.filter(t =>
    t && t.bucket !== 'someday' &&
    (t.parent_goal_id === goal.id || (typeof t.parent_project_id === 'string' && projectIds.has(t.parent_project_id))));
  return { hostedProjects, hostedTasks };
}

export function basisUpdatedAt(goal, projects = [], tasks = []) {
  const { hostedProjects, hostedTasks } = hostedOf(goal, projects, tasks);
  return [goal.updated_at, ...hostedProjects.map(p => p.updated_at), ...hostedTasks.map(t => t.updated_at)]
    .filter(stamp => typeof stamp === 'string' && stamp)
    .sort()
    .at(-1) ?? '';
}

/** Future weeks of the current (or next) term whose open due-task count is ≥ max(5, 1.5 × median). */
export function crunchWeeks(tasks, terms, today) {
  const term = terms.find(t => today >= t.starts_on && today <= t.ends_on) ?? terms.find(t => t.starts_on > today);
  if (!term) return [];
  const load = new Map();
  for (let monday = mondayOfKey(term.starts_on); monday <= term.ends_on; monday = addDays(monday, 7)) load.set(monday, 0);
  for (const task of tasks) {
    if (!task || task.bucket === 'someday' || !isOpen(task) || !DATE_KEY.test(task.due_date ?? '')) continue;
    const monday = mondayOfKey(task.due_date);
    if (load.has(monday)) load.set(monday, load.get(monday) + 1);
  }
  const threshold = Math.max(5, 1.5 * median([...load.values()]));
  const nowMonday = mondayOfKey(today);
  return [...load.entries()].filter(([monday, count]) => monday > nowMonday && count >= threshold).map(([monday]) => monday);
}

function nextCalmWeekday(today, crunch) {
  for (let offset = 1; offset <= 21; offset += 1) {
    const day = addDays(today, offset);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6 || crunch.includes(mondayOfKey(day))) continue;
    return day;
  }
  return addDays(today, 1);
}

function proposals({ goal, hostedTasks, tasks, today, crunch, domain }) {
  const prefix = `goal-${goal.id}-`;
  const out = [];
  const open = hostedTasks.filter(t => isOpen(t) && t.kind !== 'step');
  const byDue = [...open].sort((a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'));

  if (!open.length) {
    out.push({
      id: `${prefix}start`, agent: 'hammond', kind: 'create_task',
      title: goal.next_start || `First step on “${goal.title}”`, due: addDays(today, 2),
      goalId: goal.id, domain, reason: 'Nothing is open under this goal'
    });
  }

  const candidate = byDue.find(t => !t.due_date || t.due_date >= today);
  if (candidate && !tasks.some(t => t && t.parent_task_id === candidate.id)) {
    const big = typeof candidate.estimated_duration === 'number' && candidate.estimated_duration >= 45;
    const soon = typeof candidate.due_date === 'string' && daysBetween(today, candidate.due_date) <= 7;
    if (big || soon) {
      out.push({
        id: `${prefix}split-${candidate.id}`, agent: 'hammond', kind: 'split_task',
        taskId: candidate.id, title: candidate.title,
        steps: [
          `Get what you need for “${candidate.title}” (10 min)`,
          'Do a rough first pass (20 min)',
          `Finish and tick off “${candidate.title}” (10 min)`
        ],
        goalId: goal.id, domain: candidate.domain || domain,
        reason: big ? 'It is one big block, and big blocks are hard to start' : 'It is due within a week'
      });
    }
  }

  if (goal.lead_measure) {
    const weeks = crunch.filter(week => !(goal.rest_weeks ?? []).includes(week));
    if (weeks.length) {
      out.push({
        id: `${prefix}rest-${weeks.join('_')}`, agent: 'hammond', kind: 'goal_rest_weeks',
        goalId: goal.id, title: goal.title, weeks,
        rest_weeks: [...new Set([...(goal.rest_weeks ?? []), ...weeks])].sort(),
        reason: 'Those weeks are already heavy. A planned rest is not a miss'
      });
    }
  }

  const overdue = byDue.find(t => DATE_KEY.test(t.due_date ?? '') && t.due_date < today);
  if (overdue) {
    out.push({
      id: `${prefix}move-${overdue.id}`, agent: 'hammond', kind: 'move_task',
      taskId: overdue.id, title: overdue.title, from: overdue.due_date, to: nextCalmWeekday(today, crunch),
      reason: 'Overdue. Moved to the next weekday outside a crunch week'
    });
  }
  return out;
}

function verdictFor({ days, temperature, count, perWeek, crunch }) {
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  const parts = [
    temperature === 'warm'
      ? `Moving: last touched ${when}.`
      : temperature === 'cooling'
        ? `Cooling: nothing for ${days} days.`
        : `Gone quiet: nothing for ${days} days.`
  ];
  if (perWeek) parts.push(count >= perWeek ? `${count} of ${perWeek} this week, done.` : `${count} of ${perWeek} this week.`);
  if (perWeek && crunch.length) parts.push(`The weeks of ${crunch.map(shortDate).join(' and ')} look heavy, so plan around them.`);
  return parts.join(' ');
}

export function buildGoalRead({ goal, projects = [], tasks = [], terms = [], today, dismissed = [] }) {
  const { hostedProjects, hostedTasks } = hostedOf(goal, projects, tasks);
  const stamps = [goal.updated_at, ...hostedTasks.flatMap(t => [t.completed_at, t.updated_at])]
    .filter(stamp => typeof stamp === 'string' && stamp)
    .sort();
  const last = stamps.at(-1) ?? goal.created_at ?? `${today}T00:00:00Z`;
  const days = Math.max(0, daysBetween(sydneyKey(last), today));
  const temperature = days <= 3 ? 'warm' : days <= 8 ? 'cooling' : 'cold';
  const monday = mondayOfKey(today);
  const sunday = addDays(monday, 6);
  const count = hostedTasks.filter(t => {
    if (typeof t.completed_at !== 'string') return false;
    const key = sydneyKey(t.completed_at);
    return key >= monday && key <= sunday;
  }).length + (goal.week_log?.[monday]?.manual ?? 0);
  const perWeek = goal.lead_measure?.per_week ?? null;
  const crunch = crunchWeeks(tasks, terms, today);
  const skip = new Set(dismissed);
  const ghosts = proposals({ goal, hostedTasks, tasks, today, crunch, domain: SPHERE_DOMAIN[goal.sphere] ?? 'life' })
    .filter(ghost => !skip.has(ghost.id))
    .slice(0, MAX_GHOSTS);
  return {
    goal_id: goal.id,
    computed_on: today,
    basis_updated_at: basisUpdatedAt(goal, projects, tasks),
    temperature,
    days_since_movement: days,
    week: { count, per_week: perWeek },
    crunch_weeks: crunch,
    verdict: verdictFor({ days, temperature, count, perWeek, crunch }),
    looked_at: [
      'Progress',
      ...(perWeek ? ['Lead measure'] : []),
      'Due dates',
      ...(terms.length ? ['Term rhythm'] : []),
      'Stall check',
      ...(hostedProjects.length ? ['Linked projects'] : [])
    ],
    ghosts
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test tests/unit/goal-read.test.js`
Expected: `ℹ pass 5`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/goal-read.mjs tests/unit/goal-read.test.js
git commit -m "feat(hammond): pure goal read — temperature, lead, crunch, proposals"
```

### Task 18: `GET/POST /api/goal-reads`

**Files:**
- Create: `netlify/functions/goal-reads.mjs`
- Test: `tests/integration/goal-reads.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/integration/goal-reads.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createGoalReadsHandler, goalReadKey, staleReason } from '../../netlify/functions/goal-reads.mjs';

const SECRET = 's'.repeat(32);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: 'https://life-hub.adam-russell.com' };
const session = createSessionToken({ now: Date.parse('2026-11-04T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key, { type } = {}) { return map.has(key) ? (type === 'json' ? structuredClone(map.get(key)) : map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async list({ prefix = '' } = {}) { return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

function request(url, { method = 'GET', body } = {}) {
  return new Request(url, {
    method,
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com', ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function seed() {
  return memoryStore({
    'meta/hub_prefs': { school_terms: [{ year: 2026, terms: [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }] }] },
    'goals/_index': ['g1'],
    'goals/g1': { schema_version: 1, id: 'g1', title: 'HA', sphere: 'professional', status: 'active', created_at: 'a', updated_at: '2026-10-20T00:00:00.000Z' },
    'tasks/t1': { id: 't1', title: 'Write up', parent_goal_id: 'g1', status: 'open', kind: 'task', bucket: 'active', domain: 'other', due_date: '2026-11-06', updated_at: '2026-10-01T00:00:00.000Z' }
  });
}

test('staleReason covers first, daily, changed and fresh', () => {
  assert.equal(staleReason(null, { today: '2026-11-04', basis: 'x' }), 'first');
  assert.equal(staleReason({ read: { computed_on: '2026-11-03', basis_updated_at: 'b' } }, { today: '2026-11-04', basis: 'b' }), 'daily');
  assert.equal(staleReason({ read: { computed_on: '2026-11-04', basis_updated_at: '2026-01' } }, { today: '2026-11-04', basis: '2026-02' }), 'changed');
  assert.equal(staleReason({ read: { computed_on: '2026-11-04', basis_updated_at: '2026-02' } }, { today: '2026-11-04', basis: '2026-02' }), null);
});

test('GET computes, caches, and reuses; POST forces a manual rescan', async () => {
  const store = seed();
  const handler = createGoalReadsHandler({ env, now: () => Date.parse('2026-11-04T01:00:00Z'), getContentStore: async () => store });
  const first = (await (await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=g1'))).json()).data;
  assert.equal(first.reason, 'first');
  assert.equal(first.read.goal_id, 'g1');
  assert.ok(first.read.ghosts.some(g => g.id === 'goal-g1-split-t1'));
  assert.equal(store.map.get(goalReadKey('g1')).read.computed_on, '2026-11-04');

  const again = (await (await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=g1'))).json()).data;
  assert.equal(again.reason, 'first');

  const forced = (await (await handler(request('https://api.adam-russell.com/api/goal-reads', { method: 'POST', body: { goal_id: 'g1' } }))).json()).data;
  assert.equal(forced.reason, 'manual');

  const all = (await (await handler(request('https://api.adam-russell.com/api/goal-reads'))).json()).data;
  assert.deepEqual(all.reads.map(r => r.read.goal_id), ['g1']);

  const missing = await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=nope'));
  assert.equal(missing.status, 404);
});

test('dismissed ids stay out of a recomputed read', async () => {
  const store = seed();
  store.map.set(goalReadKey('g1'), { read: null, dismissed: ['goal-g1-split-t1'], reason: 'first' });
  const handler = createGoalReadsHandler({ env, now: () => Date.parse('2026-11-04T01:00:00Z'), getContentStore: async () => store });
  const body = (await (await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=g1'))).json()).data;
  assert.equal(body.read.ghosts.some(g => g.id === 'goal-g1-split-t1'), false);
});
```

The "again" read keeps `reason: 'first'` because nothing changed, so the saved read comes back with its original reason.

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test tests/integration/goal-reads.test.js`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement**

```js
// netlify/functions/goal-reads.mjs
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetTasksStore, getJSON, listJSON, setJSON, TASK_PREFIX } from './_shared/tasks-blobs.mjs';
import { normalizeGoalRecord } from './_shared/goal-record.mjs';
import { basisUpdatedAt, buildGoalRead, termsFromHubPrefs } from './_shared/goal-read.mjs';
import { getSydneyDateKey } from '../../apps/life/js/core/time.js';

export const config = { path: '/api/goal-reads' };
const HUB_PREFS_KEY = 'meta/hub_prefs';

export function goalReadKey(goalId) {
  return `goal_reads/${goalId}`;
}

function records(list) {
  return list.filter(item => item && typeof item === 'object' && !Array.isArray(item) && typeof item.id === 'string');
}

export async function loadGoalInputs(store) {
  const [goals, projects, tasks, prefs] = await Promise.all([
    listJSON(store, 'goals/'),
    listJSON(store, 'projects/'),
    listJSON(store, TASK_PREFIX),
    getJSON(store, HUB_PREFS_KEY)
  ]);
  return {
    goals: records(goals).map(normalizeGoalRecord),
    projects: records(projects),
    tasks: records(tasks),
    terms: termsFromHubPrefs(prefs)
  };
}

/** Why a read must be recomputed, or null when the saved one is fresh. */
export function staleReason(cached, { today, basis }) {
  if (!cached?.read) return 'first';
  if (cached.read.computed_on !== today) return 'daily';
  if (basis > (cached.read.basis_updated_at ?? '')) return 'changed';
  return null;
}

export async function readForGoal(store, goal, inputs, { today, force = false }) {
  const cached = await getJSON(store, goalReadKey(goal.id));
  const basis = basisUpdatedAt(goal, inputs.projects, inputs.tasks);
  const reason = force ? 'manual' : staleReason(cached, { today, basis });
  if (!reason) return { read: cached.read, reason: cached.reason ?? 'daily' };
  const dismissed = Array.isArray(cached?.dismissed) ? cached.dismissed : [];
  const read = buildGoalRead({ goal, projects: inputs.projects, tasks: inputs.tasks, terms: inputs.terms, today, dismissed });
  await setJSON(store, goalReadKey(goal.id), { read, dismissed, reason });
  return { read, reason };
}

export function createGoalReadsHandler(deps = {}) {
  const now = deps.now ?? Date.now;
  return createOperatorHandler(async (request, context) => {
    const { env, store } = context;
    try {
      const today = getSydneyDateKey(new Date(now()));
      if (request.method === 'GET') {
        const inputs = await loadGoalInputs(store);
        const goalId = new URL(request.url).searchParams.get('goal_id');
        if (goalId) {
          const goal = inputs.goals.find(item => item.id === goalId);
          if (!goal) return withCors(errorResponse(404, 'not_found', 'Goal not found', false), request, env);
          return withCors(okResponse(200, await readForGoal(store, goal, inputs, { today })), request, env);
        }
        const reads = [];
        for (const goal of inputs.goals.filter(item => item.status === 'active')) {
          reads.push(await readForGoal(store, goal, inputs, { today }));
        }
        return withCors(okResponse(200, { reads }), request, env);
      }
      if (request.method === 'POST') {
        const parsed = await readJsonObject(request);
        if (parsed.error) return withCors(parsed.error, request, env);
        const goalId = typeof parsed.value.goal_id === 'string' ? parsed.value.goal_id : '';
        const inputs = await loadGoalInputs(store);
        const goal = inputs.goals.find(item => item.id === goalId);
        if (!goal) return withCors(errorResponse(404, 'not_found', 'Goal not found', false), request, env);
        return withCors(okResponse(200, await readForGoal(store, goal, inputs, { today, force: true })), request, env);
      }
      return withCors(methodNotAllowed('GET, POST, OPTIONS'), request, env);
    } catch {
      return withCors(errorResponse(503, 'tasks_blobs_unbound', 'Tasks content store is not bound.', true), request, env);
    }
  }, {
    ...deps,
    unboundCode: deps.unboundCode ?? 'tasks_blobs_unbound',
    unboundMessage: deps.unboundMessage ?? 'Tasks content store is not bound.',
    getContentStore: deps.getContentStore ?? defaultGetTasksStore
  });
}

export default createGoalReadsHandler();
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `node --test tests/integration/goal-reads.test.js`
Expected: `ℹ pass 3`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/goal-reads.mjs tests/integration/goal-reads.test.js
git commit -m "feat(hammond): /api/goal-reads with daily + on-change cache and manual rescan"
```

### Task 19: Accept and dismiss `goal-…` ghosts through `/api/calendar-ghosts`

**Files:**
- Modify: `netlify/functions/calendar-ghosts.mjs`
- Test: `tests/unit/goal-ghosts.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/goal-ghosts.test.js
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { taskKey, TASKS_INDEX_KEY } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { createCalendarGhostsHandler, ghostTaskId } from '../../netlify/functions/calendar-ghosts.mjs';
import { goalReadKey } from '../../netlify/functions/goal-reads.mjs';

const NOW = Date.parse('2026-11-04T09:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main', GITHUB_TOKEN: 'github-secret-token', GITHUB_TOKEN_EXPIRES: '2026-12-01'
};
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;
const CN = await readFile(new URL('../fixtures/valid/central-node.md', import.meta.url), 'utf8');

function sha(text) { return createHash('sha256').update(text).digest('hex').slice(0, 40); }

function memoryGitHub(initial) {
  const files = new Map(initial);
  let head = 'a'.repeat(40);
  const commits = [];
  return {
    files, commits,
    async resolveTree() {
      return { commitSha: head, treeSha: head, tree: [...files.entries()].map(([path, content]) => ({ path, type: 'blob', sha: sha(content), size: Buffer.byteLength(content) })) };
    },
    async readBlob(blobSha) {
      for (const content of files.values()) {
        if (sha(content) === blobSha) return { encoding: 'base64', content: Buffer.from(content).toString('base64'), sha: blobSha, size: Buffer.byteLength(content) };
      }
      throw new Error('missing blob');
    },
    async commitFiles({ files: next, message, parentSha }) {
      if (parentSha !== head) throw new Error('write_conflict');
      for (const file of next) files.set(file.path, file.content);
      head = sha(`${head}\0${message}`);
      commits.push({ message, paths: next.map(file => file.path) });
      return { commitSha: head };
    }
  };
}

function memoryTasks(seed) {
  const data = new Map([[TASKS_INDEX_KEY, []], ...Object.entries(seed)]);
  return {
    data,
    async get(key, options) { const v = data.get(key); return v == null ? null : (options?.type === 'json' ? structuredClone(v) : v); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); },
    async set(key, value) { data.set(key, typeof value === 'string' ? JSON.parse(value) : value); },
    async list({ prefix = '' } = {}) { return { blobs: [...data.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

function harness() {
  const github = memoryGitHub(new Map([['central-node.md', CN]]));
  const store = memoryTasks({
    'meta/hub_prefs': { school_terms: [{ year: 2026, terms: [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }] }] },
    'goals/_index': ['g1'],
    'goals/g1': { schema_version: 1, id: 'g1', title: 'HA evidence', sphere: 'professional', status: 'active', created_at: 'a', updated_at: '2026-10-20T00:00:00.000Z' },
    'tasks/t1': { id: 't1', title: 'Write up 6.3', parent_goal_id: 'g1', status: 'open', kind: 'task', bucket: 'active', domain: 'other', due_date: '2026-11-06', updated_at: '2026-10-01T00:00:00.000Z' }
  });
  const handler = createCalendarGhostsHandler({
    env: ENV, now: () => NOW, createGitHubClient: () => github, getTasksStore: async () => store,
    loadLessons: async () => [], loadProfessionalEvents: async () => []
  });
  return { handler, github, store };
}

function post(body) {
  return new Request('https://life.example/api/calendar-ghosts', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('accepting a split proposal writes the steps and one Central Node line', async () => {
  const { handler, github, store } = harness();
  const response = await handler(post({ id: 'goal-g1-split-t1', decision: 'accept' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.receipt, /now has 3 steps/);
  for (const n of [1, 2, 3]) {
    const step = store.data.get(taskKey(`${ghostTaskId('goal-g1-split-t1')}-s${n}`));
    assert.equal(step.kind, 'step');
    assert.equal(step.parent_task_id, 't1');
    assert.equal(step.parent_goal_id, 'g1');
  }
  assert.equal(github.commits.length, 1);
  assert.deepEqual(github.commits[0].paths, ['central-node.md']);
  assert.equal(store.data.get(goalReadKey('g1'))?.read ?? null, null);
});

test('dismissing records the id and writes nothing else', async () => {
  const { handler, github, store } = harness();
  const response = await handler(post({ id: 'goal-g1-split-t1', decision: 'dismiss' }));
  assert.equal(response.status, 200);
  assert.deepEqual(store.data.get(goalReadKey('g1')).dismissed, ['goal-g1-split-t1']);
  assert.equal(github.commits.length, 0);
});

test('a proposal that no longer applies is a 404', async () => {
  const { handler } = harness();
  assert.equal((await handler(post({ id: 'goal-g1-move-t1', decision: 'accept' }))).status, 404);
  assert.equal((await handler(post({ id: 'goal-nope-start', decision: 'accept' }))).status, 404);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `node --test tests/unit/goal-ghosts.test.js`
Expected: FAIL with 404 `ghost_not_found` on accept, because the queue has no `goal-…` entries.

- [ ] **Step 3: Implement in `calendar-ghosts.mjs`**

Imports:
```js
import { buildGoalRead, goalIdFromGhostId } from './_shared/goal-read.mjs';
import { goalReadKey, loadGoalInputs } from './goal-reads.mjs';
```

Add this function directly above `runGhostDecision`:

```js
/** Goal ghosts are recomputed from Hammond's goal read, not queued (spec: Goals redesign). */
async function runGoalGhostDecision({ open, commit, tasksStore, decision, today, nowIso }) {
  const goalId = goalIdFromGhostId(decision.id);
  if (!goalId) return fail(404, 'ghost_not_found', 'No pending ghost matches this id.');
  const store = await tasksStore();

  if (decision.decision === 'dismiss') {
    const cached = (await getJSON(store, goalReadKey(goalId))) ?? {};
    const dismissed = [...new Set([...(Array.isArray(cached.dismissed) ? cached.dismissed : []), decision.id])];
    const read = cached.read ? { ...cached.read, ghosts: (cached.read.ghosts ?? []).filter(g => g.id !== decision.id) } : null;
    await setJSON(store, goalReadKey(goalId), { ...cached, read, dismissed });
    return applied({ receipt: 'Dismissed. Nothing written.' });
  }

  const inputs = await loadGoalInputs(store);
  const goal = inputs.goals.find(item => item.id === goalId);
  if (!goal) return fail(404, 'ghost_not_found', 'No pending ghost matches this id.');
  const read = buildGoalRead({ goal, projects: inputs.projects, tasks: inputs.tasks, terms: inputs.terms, today });
  const ghost = read.ghosts.find(item => item.id === decision.id);
  if (!ghost) return fail(404, 'ghost_not_found', 'This proposal no longer applies.');

  let plan;
  try {
    plan = acceptPlan(ghost, { today });
  } catch (error) {
    return fail(400, 'invalid_ghost', error instanceof TypeError ? error.message : 'This ghost could not be validated.');
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const opened = await open();
    const settlement = await settleAlmanac(opened, [plan], { nowIso });
    if (settlement.status) return settlement;
    try {
      if (settlement.changed.size) await commit(settlement.changed, opened.base, settlement.message);
    } catch (error) {
      if (error instanceof GitHubClientError && error.code === 'write_conflict' && attempt === 0) continue;
      throw error;
    }
    const result = await finishTasks({ open, commit, tasksStore, id: decision.id, settlement });
    // The goal changed; drop the saved read so the next GET recomputes it.
    const cached = (await getJSON(store, goalReadKey(goalId))) ?? {};
    await setJSON(store, goalReadKey(goalId), { ...cached, read: null });
    return result;
  }
  return fail(409, 'write_conflict', 'The repository changed while accepting. Try again.');
}
```

At the top of `runGhostDecision`, after the `alm-` branch:

```js
  if (typeof decision.id === 'string' && decision.id.startsWith('goal-')) {
    return runGoalGhostDecision({ open, commit, tasksStore, decision, today, nowIso });
  }
```

`settleAlmanac` copies `plan.ghostId` onto each task step, and `applyTaskStep` then uses `ghostTaskId(ghostId)` plus `step.suffix`. That's why the step ids in the test are `ghost-goal-g1-split-t1-s1…s3`.

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `node --test tests/unit/goal-ghosts.test.js tests/unit/calendar-ghosts.test.js tests/unit/almanac-api.test.js && npm test 2>&1 | grep -E "ℹ (pass|fail)"`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/calendar-ghosts.mjs tests/unit/goal-ghosts.test.js
git commit -m "feat(hammond): accept/dismiss goal proposals via /api/calendar-ghosts"
```

### Task 20: Client — goal reads, the Hammond panel and strip, wired into both pages

**Files:**
- Create: `apps/tasks/src/domain/goal-reads.ts`
- Create: `apps/tasks/src/views/hammond-goal.ts`
- Modify: `apps/tasks/src/services/client-api.ts`
- Modify: `apps/tasks/src/views/goal-page.ts` (default Hammond mount, and a Split it button)
- Modify: `apps/tasks/src/views/goals.ts` (loads reads, draws the strip and overlay)
- Test: `apps/tasks/tests/unit/hammond-goal.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/tasks/tests/unit/hammond-goal.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/services/client-api';
import { describeGhost, orderReadsForStrip, overlayFromReads, type GoalRead } from '@/domain/goal-reads';
import { mountHammondPanel, renderHammondStrip } from '@/views/hammond-goal';
import { goal } from './goal-fixtures';

vi.mock('@/services/client-api', () => ({
  tasksApi: { getGoalRead: vi.fn(), rescanGoalRead: vi.fn(), decideGhost: vi.fn() }
}));

const READ: GoalRead = {
  goal_id: 'g1', computed_on: '2026-11-04', basis_updated_at: 'x', temperature: 'cold', days_since_movement: 9,
  week: { count: 0, per_week: 1 }, crunch_weeks: ['2026-11-16'],
  verdict: 'Gone quiet: nothing for 9 days. 0 of 1 this week.', looked_at: ['Progress', 'Lead measure'],
  ghosts: [
    { id: 'goal-g1-split-t1', agent: 'hammond', kind: 'split_task', taskId: 't1', title: 'Write up 6.3', steps: ['a', 'b', 'c'], reason: 'It is due within a week' },
    { id: 'goal-g1-rest-2026-11-16', agent: 'hammond', kind: 'goal_rest_weeks', goalId: 'g1', title: 'HA', weeks: ['2026-11-16'], rest_weeks: ['2026-11-16'] }
  ]
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(tasksApi.getGoalRead).mockResolvedValue({ read: READ, reason: 'changed' });
  vi.mocked(tasksApi.decideGhost).mockResolvedValue({ receipt: 'Hammond → Tasks: done.', writes: 'applied' });
});

describe('goal reads domain', () => {
  it('describes each ghost kind for a confirm card', () => {
    expect(describeGhost(READ.ghosts[0]!)).toMatchObject({ kind: 'Task · split into steps', title: 'Split “Write up 6.3” into 3 steps' });
    expect(describeGhost(READ.ghosts[1]!).diff?.after[0]).toContain('16/11/26');
  });

  it('orders the strip coldest first and builds the runway overlay', () => {
    const warm = { ...READ, goal_id: 'g2', temperature: 'warm' as const, days_since_movement: 1, ghosts: [] };
    expect(orderReadsForStrip([warm, READ]).map((r) => r.goal_id)).toEqual(['g1', 'g2']);
    const overlay = overlayFromReads([READ, warm]);
    expect(overlay.crunchWeeks).toEqual(['2026-11-16']);
    expect(overlay.proposedRest).toEqual({ g1: ['2026-11-16'] });
    expect([...overlay.proposalGoalIds]).toEqual(['g1']);
  });
});

describe('Hammond panel', () => {
  it('shows the read, why it rescanned, and confirm cards that accept or dismiss', async () => {
    const host = document.createElement('div');
    const onApplied = vi.fn();
    mountHammondPanel(host, goal({ id: 'g1', title: 'HA' }), onApplied);
    await flush();
    expect(host.textContent).toContain('Gone quiet');
    expect(host.textContent).toContain('something changed');
    const cards = host.querySelectorAll('.confirm-card');
    expect(cards).toHaveLength(2);
    cards[0]!.querySelector<HTMLButtonElement>('[data-decision="accept"]')!.click();
    await flush();
    expect(tasksApi.decideGhost).toHaveBeenCalledWith('goal-g1-split-t1', 'accept');
    expect(onApplied).toHaveBeenCalled();
    cards[1]!.querySelector<HTMLButtonElement>('[data-decision="dismiss"]')!.click();
    await flush();
    expect(tasksApi.decideGhost).toHaveBeenCalledWith('goal-g1-rest-2026-11-16', 'dismiss');
    expect(host.querySelectorAll('.confirm-card')).toHaveLength(1);
  });

  it('the landing strip lists the coldest verdict with the goal title and up to two chips', () => {
    const host = document.createElement('div');
    renderHammondStrip(host, [{ read: READ, reason: 'daily' }], [goal({ id: 'g1', title: 'HA evidence' })], vi.fn());
    expect(host.querySelector('.hammond-strip__read')?.textContent).toContain('HA evidence: Gone quiet');
    expect(host.querySelectorAll('.hammond-chip')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `cd apps/tasks && npx vitest run tests/unit/hammond-goal.test.ts`
Expected: FAIL, because the modules aren't found.

- [ ] **Step 3: Create `apps/tasks/src/domain/goal-reads.ts`**

```ts
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export type GoalGhost = {
  id: string;
  agent: 'hammond';
  kind: 'create_task' | 'split_task' | 'goal_rest_weeks' | 'move_task';
  title?: string;
  reason?: string;
  due?: string;
  steps?: string[];
  weeks?: string[];
  rest_weeks?: string[];
  taskId?: string;
  goalId?: string;
  from?: string;
  to?: string;
};

export type GoalRead = {
  goal_id: string;
  computed_on: string;
  basis_updated_at: string;
  temperature: 'warm' | 'cooling' | 'cold';
  days_since_movement: number;
  week: { count: number; per_week: number | null };
  crunch_weeks: string[];
  verdict: string;
  looked_at: string[];
  ghosts: GoalGhost[];
};

export type GoalReadEnvelope = { read: GoalRead | null; reason: string };

export const REASON_LABEL: Record<string, string> = {
  first: 'first read',
  daily: 'daily read',
  changed: 'something changed',
  manual: 'you asked'
};

export type GhostCard = { kind: string; title: string; why: string; diff: { before: string | null; after: string[] } | null };

export function describeGhost(ghost: GoalGhost): GhostCard {
  const why = ghost.reason ?? '';
  switch (ghost.kind) {
    case 'create_task':
      return { kind: 'Task · new', title: `Add “${ghost.title}”`, why, diff: { before: null, after: [`Due ${formatDisplayDate(ghost.due ?? '')}`] } };
    case 'split_task':
      return {
        kind: 'Task · split into steps',
        title: `Split “${ghost.title}” into ${ghost.steps?.length ?? 0} steps`,
        why,
        diff: { before: null, after: (ghost.steps ?? []).map((step) => `+ ${step}`) }
      };
    case 'goal_rest_weeks':
      return {
        kind: 'Goal · lead measure',
        title: 'Mark crunch weeks as planned rest',
        why,
        diff: { before: 'Every week counts', after: [`Rest: ${(ghost.weeks ?? []).map((w) => formatDisplayDate(w)).join(', ')}`] }
      };
    case 'move_task':
      return {
        kind: 'Task · new date',
        title: `Move “${ghost.title}”`,
        why,
        diff: { before: `Due ${formatDisplayDate(ghost.from ?? '')}`, after: [`Due ${formatDisplayDate(ghost.to ?? '')}`] }
      };
  }
}

const TEMP_RANK = { cold: 0, cooling: 1, warm: 2 } as const;

export function orderReadsForStrip(reads: GoalRead[]): GoalRead[] {
  return [...reads].sort(
    (a, b) => TEMP_RANK[a.temperature] - TEMP_RANK[b.temperature] || b.days_since_movement - a.days_since_movement
  );
}

export function overlayFromReads(reads: GoalRead[]): {
  crunchWeeks: string[];
  proposedRest: Record<string, string[]>;
  proposalGoalIds: Set<string>;
} {
  const crunch = new Set<string>();
  const proposedRest: Record<string, string[]> = {};
  const proposalGoalIds = new Set<string>();
  for (const read of reads) {
    read.crunch_weeks.forEach((week) => crunch.add(week));
    if (read.ghosts.length) proposalGoalIds.add(read.goal_id);
    const rest = read.ghosts.find((g) => g.kind === 'goal_rest_weeks');
    if (rest?.weeks) proposedRest[read.goal_id] = rest.weeks;
  }
  return { crunchWeeks: [...crunch].sort(), proposedRest, proposalGoalIds };
}
```

- [ ] **Step 4: Add the client API calls** in `client-api.ts`. `/api/calendar-ghosts` answers `{ ok, receipt, writes }` with no `data` wrapper, so `apiPost` would return `undefined`, and `decideGhost` uses `fetch` directly. After `deleteGoal`:

```ts
  getGoalReads: () =>
    apiGet<{ reads: import('@/domain/goal-reads').GoalReadEnvelope[] }>('/api/goal-reads'),
  getGoalRead: (goalId: string) =>
    apiGet<import('@/domain/goal-reads').GoalReadEnvelope>(`/api/goal-reads?goal_id=${encodeURIComponent(goalId)}`),
  rescanGoalRead: (goalId: string) =>
    apiPost<import('@/domain/goal-reads').GoalReadEnvelope>('/api/goal-reads', { goal_id: goalId }),
  decideGhost: async (id: string, decision: 'accept' | 'dismiss'): Promise<{ receipt: string; writes: string }> => {
    const response = await fetch(`${getApiBaseUrl()}/api/calendar-ghosts`, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, decision })
    });
    const body = (await response.json().catch(() => null)) as
      | { ok?: boolean; receipt?: string; writes?: string; error?: { code: string; message: string } }
      | null;
    if (!response.ok || !body?.ok) {
      throw new ApiClientError(body?.error ?? { code: 'ghost_failed', message: `Proposal failed (HTTP ${response.status})` }, response.status);
    }
    return { receipt: body.receipt ?? '', writes: body.writes ?? 'applied' };
  },
```

(`ApiClientError` and `getApiBaseUrl` are already imported at the top of `client-api.ts`.)

- [ ] **Step 5: Create `apps/tasks/src/views/hammond-goal.ts`**

```ts
import type { Goal } from '@/schemas/goal';
import { agentBySlug } from '@/chat/agents';
import { describeGhost, orderReadsForStrip, REASON_LABEL, type GoalGhost, type GoalReadEnvelope } from '@/domain/goal-reads';
import { tasksApi } from '@/services/client-api';
import { errorMessage } from '@/views/feedback';
import { el } from '@/views/hub-kit';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { showHubToast } from '../../../../packages/design-kit/js/hub-feedback.js';

function avatar(): HTMLImageElement {
  const img = el('img');
  img.src = agentBySlug('hammond').avatarSrc;
  img.alt = '';
  return img;
}

function decide(ghost: GoalGhost, decision: 'accept' | 'dismiss', done: () => void): void {
  void tasksApi
    .decideGhost(ghost.id, decision)
    .then((result) => {
      showHubToast(result.receipt);
      done();
    })
    .catch((err) => showHubToast(errorMessage(err, 'That proposal could not be applied.')));
}

function confirmCard(ghost: GoalGhost, onAccepted: () => void): HTMLElement {
  const info = describeGhost(ghost);
  const card = el('section', 'confirm-card');
  card.setAttribute('role', 'region');
  card.setAttribute('aria-label', 'Confirm change');
  card.append(el('p', 'hammond__kind', info.kind), el('p', 'hammond__title', info.title));
  if (info.why) card.append(el('p', 'hammond__why', info.why));
  if (info.diff) {
    const diff = el('div', 'hammond__diff');
    if (info.diff.before) diff.append(el('s', '', info.diff.before), el('br'));
    info.diff.after.forEach((line, index) => {
      if (index) diff.append(el('br'));
      diff.append(el('ins', '', line));
    });
    card.append(diff);
  }
  const actions = el('div', 'confirm-card__actions');
  const discard = el('button', 'btn btn--ghost', 'Discard');
  discard.type = 'button';
  discard.dataset.decision = 'dismiss';
  discard.addEventListener('click', () => decide(ghost, 'dismiss', () => card.remove()));
  const confirm = el('button', 'btn btn--primary', 'Confirm');
  confirm.type = 'button';
  confirm.dataset.decision = 'accept';
  confirm.addEventListener('click', () => decide(ghost, 'accept', onAccepted));
  actions.append(discard, confirm);
  card.append(actions);
  return card;
}

function renderPanel(host: HTMLElement, goal: Goal, envelope: GoalReadEnvelope, onApplied: () => void): void {
  const root = el('section', 'hammond');
  root.setAttribute('aria-label', 'General Hammond');
  const who = el('div', 'hammond__who');
  const copy = el('div');
  const stamp = el('p', 'hammond__stamp');
  const read = envelope.read;
  stamp.append(
    document.createTextNode(
      read ? `Read ${formatDisplayDate(read.computed_on)} · ${REASON_LABEL[envelope.reason] ?? envelope.reason} · ` : 'No read yet · '
    )
  );
  const rescan = el('button', '', 'Rescan');
  rescan.type = 'button';
  rescan.addEventListener('click', () => {
    rescan.disabled = true;
    void tasksApi.rescanGoalRead(goal.id).then((next) => renderPanel(host, goal, next, onApplied));
  });
  stamp.append(rescan);
  copy.append(el('p', '', 'General Hammond'), stamp);
  who.append(avatar(), copy);
  root.append(who);
  if (read) {
    root.append(el('p', 'hammond__read', read.verdict));
    const looked = el('div', 'hammond__looked');
    read.looked_at.forEach((label) => looked.append(el('span', '', label)));
    root.append(looked, el('p', 'hammond__head', 'Proposals · nothing changes until you confirm'));
    if (read.ghosts.length === 0) root.append(el('p', 'hammond__why', 'Nothing to propose right now.'));
    read.ghosts.forEach((ghost) => root.append(confirmCard(ghost, onApplied)));
  }
  host.replaceChildren(root);
}

/** Hammond's column on a goal page. Reads are cached server-side; this call is cheap. */
export function mountHammondPanel(host: HTMLElement, goal: Goal, onApplied: () => void): void {
  host.replaceChildren(el('p', 'canvas-status', 'Hammond is reading this goal…'));
  void tasksApi
    .getGoalRead(goal.id)
    .then((envelope) => renderPanel(host, goal, envelope, onApplied))
    .catch((err) => host.replaceChildren(el('p', 'empty-state', errorMessage(err, 'Hammond could not read this goal.'))));
}

/** The landing strip: coldest two verdicts and up to two proposal chips across all goals. */
export function renderHammondStrip(host: HTMLElement, envelopes: GoalReadEnvelope[], goals: Goal[], onApplied: () => void): void {
  const reads = orderReadsForStrip(envelopes.flatMap((e) => (e.read ? [e.read] : [])));
  if (!reads.length) {
    host.replaceChildren();
    return;
  }
  const titles = new Map(goals.map((g) => [g.id, g.title]));
  const strip = el('section', 'hammond-strip');
  strip.setAttribute('aria-label', 'General Hammond');
  const body = el('div');
  const latest = envelopes.find((e) => e.read?.goal_id === reads[0]!.goal_id);
  body.append(
    el('p', 'hammond__stamp', `General Hammond · ${REASON_LABEL[latest?.reason ?? 'daily'] ?? 'daily read'}`),
    el('p', 'hammond-strip__read', reads.slice(0, 2).map((r) => `${titles.get(r.goal_id) ?? 'Goal'}: ${r.verdict}`).join(' '))
  );
  const chips = el('div', 'hammond-strip__chips');
  for (const ghost of reads.flatMap((r) => r.ghosts).slice(0, 2)) {
    const chip = el('span', 'hammond-chip', describeGhost(ghost).title);
    const discard = el('button', 'is-discard', 'Discard');
    discard.type = 'button';
    discard.addEventListener('click', () => decide(ghost, 'dismiss', () => chip.remove()));
    const confirm = el('button', 'is-confirm', 'Confirm');
    confirm.type = 'button';
    confirm.addEventListener('click', () => decide(ghost, 'accept', onApplied));
    chip.append(discard, confirm);
    chips.append(chip);
  }
  body.append(chips);
  strip.append(avatar(), body, el('span'));
  host.replaceChildren(strip);
}
```

- [ ] **Step 6: Wire the panel into the goal page.** In `goal-page.ts`:

1. Add the import `import { mountHammondPanel } from '@/views/hammond-goal';`.
2. Change the `renderGoalPage` signature default to:
```ts
  mountHammond: HammondMount = (host, state, reload) => mountHammondPanel(host, state.goal, reload)
```
3. Change the `nextStart` call to `nextStart(goal, canvas, save, reload)`, change its signature to `function nextStart(goal: Goal, canvas: HTMLElement, save: (p: GoalPatch) => void, reload: () => void): HTMLElement`, and before `row.append(start, body);` add:
```ts
  const split = el('button', 'btn btn--secondary', 'Split it');
  split.type = 'button';
  split.addEventListener('click', () => void tasksApi.rescanGoalRead(goal.id).then(reload));
```
Then change `row.append(start, body);` to `row.append(start, body, split);`.

The Task 14 test mocks `getGoalRead` to resolve `{ read: null, reason: 'first' }`, so the panel renders "No read yet" and the test still passes.

- [ ] **Step 7: Wire the strip and overlay into the landing page.** In `goals.ts`:

1. Add the imports `import { overlayFromReads } from '@/domain/goal-reads';` and `import { renderHammondStrip } from '@/views/hammond-goal';`.
2. In `renderGoalsView`, add a fifth call to the `Promise.all` list: `tasksApi.getGoalReads().catch(() => ({ reads: [] }))`. Name it `readsResult`, then replace the `paintGoals(...)` call with:
```ts
    const envelopes = readsResult.reads;
    const overlay = overlayFromReads(envelopes.flatMap((e) => (e.read ? [e.read] : [])));
    paintGoals(canvas, { goals, projects, tasks, terms: flattenTerms(prefs), today }, overlay, envelopes);
```
3. Give `paintGoals` a fourth parameter, `envelopes: GoalReadEnvelope[] = []` (import the type from `@/domain/goal-reads`). Pass it through in the pill `onSelect` repaint as `paintGoals(canvas, data, overlay, envelopes)`. Right after `canvas.append(top, hammondHost);`, add:
```ts
  renderHammondStrip(hammondHost, envelopes, data.goals, reload);
```

- [ ] **Step 8: Run the tests and typecheck**

Run: `cd apps/tasks && npx vitest run tests/unit/hammond-goal.test.ts tests/unit/goal-page.test.ts tests/unit/goals-view.test.ts && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"`
Expected: all pass, with a tsc count ≤ the baseline. If `hub-feedback.js` has no types and errors, copy the import exactly as `src/views/graph-branch.ts:28` has it.

- [ ] **Step 9: Commit**

```bash
git add apps/tasks/src/domain/goal-reads.ts apps/tasks/src/views/hammond-goal.ts apps/tasks/src/services/client-api.ts apps/tasks/src/views/goal-page.ts apps/tasks/src/views/goals.ts apps/tasks/tests/unit/hammond-goal.test.ts
git commit -m "feat(hammond): goal panel, landing strip, runway overlay, confirm cards"
```

### Task 21: Dev mock support

**Files:**
- Modify: `apps/tasks/scripts/mock-api.ts` (after the `/api/goals` block)

- [ ] **Step 1: Add stubs** so `npm run dev` doesn't 404:

```ts
    if (path === '/api/goal-reads') {
      if (method === 'GET' && !url.searchParams.get('goal_id')) {
        return json(200, { ok: true, data: { reads: [] } });
      }
      return json(200, { ok: true, data: { read: null, reason: 'first' } });
    }

    if (path === '/api/calendar-ghosts' && method === 'POST') {
      return json(200, { ok: true, receipt: 'Mock: nothing written.', writes: 'applied' });
    }
```

- [ ] **Step 2: Check** by starting the dev server and opening `#/goals` and a goal page. The Network tab shows `/api/goal-reads` returning 200, and the Hammond column shows "No read yet · Rescan".

- [ ] **Step 3: Commit**

```bash
git add apps/tasks/scripts/mock-api.ts
git commit -m "chore(tasks): mock goal-reads and ghost decisions for dev"
```

---

## Phase 7: Docs and final verification

### Task 22: Docs, full test run, browser check, push

**Files:**
- Modify: `apps/tasks/docs/data-model.md`
- Modify: `packages/design-kit/TASKS.md`

- [ ] **Step 1: Update `apps/tasks/docs/data-model.md`.** Replace the Goal row with:

```markdown
| **Goal** | Short-to-medium-term outcome in a sphere (Life / Work / Professional). Chooses a structure (WOOP, SMARTER, OKR, Lead/lag, Floor·target·stretch), carries a weekly lead measure, rest weeks, an if-then trigger, a 2-minute next start and milestones. Hosts projects (`project.parent_goal_id`) and tasks (`task.parent_goal_id`). Can grow from a Someday dream (`parent_someday_id`). `@`-taggable as `tasks:goal:<id>`. |
```

Add `| Goal reads | `GET /api/goal-reads[?goal_id=]`, `POST /api/goal-reads { goal_id }` (Hammond; cached per goal, daily + on change) |` to the API table. Also add `Goal proposals: `POST /api/calendar-ghosts { id: 'goal-…', decision }`.`

- [ ] **Step 2: Update the Surfaces table in `packages/design-kit/TASKS.md`**:

```markdown
| **Goals** | `#/goals` Term Runway: three lanes (Life / Work / Professional), week cells from `goals.css` (never red for a miss), Hammond strip. `#/goal/:id`: structure card, if-then, next start, hosting, `@` tags, Hammond panel with `.confirm-card` proposals. Reference: `docs/proposals/goals-reference/`. |
```

- [ ] **Step 3: Run the full suites**

Run:
```bash
npm test 2>&1 | grep -E "ℹ (pass|fail)"
cd apps/tasks && npx tsc --noEmit -p . 2>&1 | grep -c "error TS"; npx vitest run tests/unit 2>&1 | grep -E "Tests "
```
Expected: root `ℹ fail 0`. The tsc count and the vitest failed count are each ≤ the Task 0 baseline (33 and 4). The new goal tests all pass.

- [ ] **Step 4: Browser check against the reference.** Start the dev server and check each point:
- `#/goals` shows three lanes, week cells, the now ring and the one move.
- New goal: a fourth goal in a full lane asks to park it.
- A row opens `#/goal/:id`.
- Switching structure keeps the other structures' content.
- +1 fills the current cell.
- Link project and add task both work.
- The @ tag section searches goals and projects.
- At 375px wide, lanes become cards and the Hammond panel sits below the main column.

Take screenshots at 1440 and 375, and compare them with `docs/proposals/goals-reference/*.png`.

- [ ] **Step 5: Commit the docs and push the branch**

```bash
git add apps/tasks/docs/data-model.md packages/design-kit/TASKS.md
git commit -m "docs(goals): data model and Tasks surfaces for the Goals redesign"
git push -u origin fix/goals-tags-crash
```

Adam opens and merges the PR himself: `https://github.com/adamrussell91-hash/life-hub/pull/new/fix/goals-tags-crash`.

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| Goal v2 fields, defaults, server cleaning | 1, 2, 4 |
| Crash fix: tags always written and defaulted | branch commit, plus 1, 2, 4 |
| Task `parent_goal_id`, steps and tags on POST | 3, 4 |
| Goals host projects (link/unlink) and tasks (add/tick) | 7, 14 |
| `@` tagging: `tasks:goal` kind, resolver, registry, href, search, tagger kinds, goal page tag section | 5, 6, 14 |
| Term Runway: lanes, soft cap, cells, one move, parked, crunch shading, proposal cells | 8, 11, 20 |
| Goal page: structure picker plus five structures, lead measure strip, +1, if-then, next start, focus strips, milestones, status | 12, 13, 14 |
| Hammond read: temperature, lead, crunch, verdict, looked-at, 4 proposal kinds, max 3, dismissed excluded | 17 |
| Cache: daily, on change, manual rescan, reason label | 18, 20 |
| Accept via existing ghost path, dismiss remembered, client sends `{id, decision}` only | 15, 16, 19, 20 |
| Kit tokens only, dates `dd/mm/yy`, confirm cards, never red | 10, 13, 14, 20 |
| Baseline counts not raised | 0, 22 |
