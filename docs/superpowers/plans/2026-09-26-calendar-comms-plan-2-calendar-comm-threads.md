# Calendar comms · Plan 2: Calendar wiring, the comm page, threads and cases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After this plan:
- Comms and promises appear on every hub's Tideline. Promises sit in the Due row. Timed comms are chips, and logged emails and texts are pins.
- Professional's rail has Calendar under Home. The old Comms, Meetings and Events list routes redirect to it.
- A comm opens as one page that changes with the clock: Before (prep), During (capture on the Tasks block engine), After (wrap-up with the promise ledger).
- Comms group into threads. A case thread has its own page with goals, the circle of people, a session ledger and a copyable case summary.

**Architecture:**
- Server: comm schema v2 stores time, agenda and blocks. A new `thread` record lives in the Professional store. Membership is a Universal Link (`in_thread`). Promises are People ledger items (Plan 1), found by their source record.
- Calendar: the kit gains a comm kind, pin chips and promise Due chips. The Tideline object, its bands and its zoom stops don't change.
- Professional: small pure modules (phase, inline promises, thread matching, case summary) hold the logic, and the two views stay thin.

**Tech Stack:** Netlify Functions ES modules (`node --test`); shared kit JS in `packages/design-kit/js/calendar`; Professional TS + Vite + Vitest (happy-dom); the Tasks block engine through the `@tasks/*` import from Plan 1.

**Depends on:** Plan 1 must be merged into this branch first (the `@tasks` resolver, ledger v2, calendar chips, auto-retry).

**Spec:** `docs/superpowers/specs/2026-09-26-calendar-comms-design.md`. This plan covers:
- §1: the Due row, pins, route redirects and pill colours
- §2: the shell, phases and block body. Clare's parts are Plan 4.
- §3: threads and the case page
- §4: the promise ledger on the comm page

**Not in this plan:**
- Plan 3: meetings, events and PD.
- Plan 4: Clare (brief, summary, drafts, handwriting, tray), the walk-in card and the 10-second log.
- Plan 5: the Notion import.

**Conventions used below:**
- Run commands from the repo root unless the step says `apps/professional`.
- Integration tests copy the sign-in and request helpers from `tests/integration/communications.test.js` (lines 1–120). In each new integration test, that file is called `SESSION HELPERS`: copy them exactly and don't invent new ones.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `netlify/functions/_shared/communication-schema.mjs` | Modify | v2 fields: time, purpose tag, agenda, blocks |
| `netlify/functions/_shared/communication-repository.mjs` | Modify | Store and patch v2 fields |
| `netlify/functions/_shared/ledger-repository.mjs` | Modify | `listForSources(refs)` |
| `netlify/functions/people-ledger.mjs` | Modify | `GET ?source_refs=` |
| `netlify/functions/_shared/thread-schema.mjs` | Create | Thread record shape |
| `netlify/functions/_shared/thread-repository.mjs` | Create | Thread CRUD |
| `netlify/functions/_shared/professional-blobs.mjs` | Modify | Thread keys |
| `netlify/functions/_shared/entity-ref.mjs`, `entity-resolvers.mjs`, `relationship-registry.mjs` | Modify | `professional:thread` kind, resolver, `in_thread` link |
| `netlify/functions/threads.mjs` | Create | `/api/threads` |
| `netlify/functions/_shared/schedule-projection.mjs` | Modify | `projectCommunicationSchedule` |
| `netlify/functions/schedule-projections.mjs` | Modify | Add comms and open promises |
| `packages/design-kit/js/calendar/professional-calendar.js` | Modify | Map comms; `promiseEventsFromLedger` |
| `packages/design-kit/js/calendar/load-hub-sources.js` | Modify | Load promises with Professional |
| `packages/design-kit/js/calendar/tideline-model.js` | Modify | Comm and event kinds, pins, promise dues |
| `packages/design-kit/js/calendar/render-tideline.js` | Modify | Promise Due chips, pin chips, real filter keys |
| `packages/design-kit/calendar-tideline.css` + `docs/proposals/calendar-reference/src/tideline.template.html` | Modify | Kind tints, pin and promise styles, pill colours |
| `apps/professional/src/shell/shell.ts`, `app/router.ts`, `app/main.ts`, `shell/icons.ts` | Modify | Calendar under Home, redirects, thread route |
| `apps/professional/src/domain/types.ts`, `domain/ids.ts` | Modify | v2 comm fields, `ThreadRecord`, `LedgerItem`, `isValidThreadId` |
| `apps/professional/src/api/communications.ts`, `api/threads.ts` (new), `api/ledger.ts` (new) | Modify/Create | Clients |
| `apps/professional/src/lib/comm-phase.ts` | Create | Before / During / After |
| `apps/professional/src/lib/inline-promises.ts` | Create | `»me` / `»name` parsing, block text |
| `apps/professional/src/lib/thread-match.ts` | Create | Auto-join rule |
| `apps/professional/src/lib/case-summary.ts` | Create | Copyable case summary |
| `apps/professional/src/types/tasks-engine.d.ts` | Modify | Add `mountBlockCanvas`, `nextBlockIdFactory`, `Block` |
| `apps/professional/src/components/block-page.ts` | Create | Block canvas + "+" + debounced save |
| `apps/professional/src/styles/block-page.css` | Create | Page-editor "+" styles (from Tasks) |
| `apps/professional/src/views/comm-page.ts` | Create | The comm page |
| `apps/professional/src/views/thread-page.ts` | Create | Thread / case page |
| Tests | Create/Modify | As listed in each task |

---

### Task 1: Comm schema v2

**Files:**
- Modify: `netlify/functions/_shared/communication-schema.mjs`
- Test: `tests/unit/communication-schema.test.js` (append)

- [ ] **Step 1: Write the failing tests**

```js
import {
  COMMUNICATION_SCHEMA_VERSION,
  parseCommunicationRecord,
  projectCommunication,
  validateCommunicationCreateInput,
  validateCommunicationFieldUpdate
} from '../../netlify/functions/_shared/communication-schema.mjs';

const V1 = {
  schema_version: 1,
  id: 'communication_00000000-0000-4000-8000-000000000001',
  direction: 'outbound',
  channel: 'in_person',
  occurred_at: '2026-10-14T00:50:00.000Z',
  subject: 'Declan essay feedback',
  summary: '',
  status: 'completed',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z'
};

test('comm schema is v2 and v1 records read with empty v2 fields', () => {
  assert.equal(COMMUNICATION_SCHEMA_VERSION, 2);
  const parsed = parseCommunicationRecord(V1);
  assert.equal(parsed.scheduled_start, null);
  assert.equal(parsed.scheduled_end, null);
  assert.equal(parsed.time_zone, null);
  assert.equal(parsed.purpose_tag, null);
  assert.deepEqual(parsed.agenda, []);
  assert.deepEqual(parsed.blocks, []);
  assert.deepEqual(projectCommunication(parsed).blocks, []);
});

test('create accepts a scheduled window and purpose tag', () => {
  const input = validateCommunicationCreateInput({
    direction: 'outbound',
    channel: 'in_person',
    occurred_at: '2026-10-14T00:50:00.000Z',
    scheduled_start: '2026-10-14T00:50:00.000Z',
    scheduled_end: '2026-10-14T01:05:00.000Z',
    time_zone: 'Australia/Sydney',
    purpose_tag: 'Feedback'
  });
  assert.equal(input.scheduled_end, '2026-10-14T01:05:00.000Z');
  assert.equal(input.purpose_tag, 'feedback');
  assert.throws(
    () => validateCommunicationCreateInput({
      direction: 'outbound', channel: 'in_person', occurred_at: '2026-10-14T00:50:00.000Z',
      scheduled_start: '2026-10-14T01:05:00.000Z', scheduled_end: '2026-10-14T00:50:00.000Z'
    }),
    { code: 'invalid_scheduled_window' }
  );
  assert.throws(
    () => validateCommunicationCreateInput({
      direction: 'outbound', channel: 'in_person', occurred_at: '2026-10-14T00:50:00.000Z', time_zone: 'Mars/Base'
    }),
    { code: 'invalid_time_zone' }
  );
});

test('update accepts agenda and blocks; blocks are sanitised', () => {
  const patch = validateCommunicationFieldUpdate({
    agenda: [{ id: 'ag_1', text: 'What went well', source: 'clare' }],
    blocks: [{ id: 'block_1', block_type: 'rich_text', content: { html: '<p>ok</p><script>x()</script>' } }]
  });
  assert.equal(patch.agenda[0].source, 'clare');
  assert.equal(patch.blocks[0].content.html, '<p>ok</p>');
  assert.throws(() => validateCommunicationFieldUpdate({ agenda: [{ id: 'a', text: 'x', source: 'bob' }] }), {
    code: 'invalid_agenda'
  });
  assert.throws(() => validateCommunicationFieldUpdate({ blocks: [{ block_type: 'rich_text' }] }), {
    code: 'invalid_blocks'
  });
});
```

(If the file already imports some of these names, merge the import lists.)

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/communication-schema.test.js`
Expected: FAIL, because `COMMUNICATION_SCHEMA_VERSION` is 1.

- [ ] **Step 3: Implement**

In `communication-schema.mjs`:

1. Add this import at the top:

```js
import { sanitizeBlocksDeep } from './teaching-student.mjs';
```

2. Replace `export const COMMUNICATION_SCHEMA_VERSION = 1;` with this:

```js
export const COMMUNICATION_SCHEMA_VERSION = 2;
const READABLE_COMMUNICATION_VERSIONS = new Set([1, 2]);
export const AGENDA_SOURCES = new Set(['clare', 'carried', 'you']);
export const PURPOSE_TAG_MAX_LENGTH = 60;
export const AGENDA_MAX_ITEMS = 30;
export const BLOCKS_MAX_JSON_LENGTH = 400_000;
```

3. Add these helpers below `trimBounded`:

```js
function isValidTimeZone(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function readScheduledWindow(input) {
  const start = input.scheduled_start ?? null;
  const end = input.scheduled_end ?? null;
  if (start !== null && !isIsoTimestamp(start)) {
    throw validationError('invalid_scheduled_window', 'scheduled_start must be an ISO timestamp.');
  }
  if (end !== null && (!isIsoTimestamp(end) || start === null || Date.parse(end) < Date.parse(start))) {
    throw validationError('invalid_scheduled_window', 'scheduled_end must be an ISO timestamp after scheduled_start.');
  }
  const time_zone = input.time_zone ?? null;
  if (time_zone !== null && !isValidTimeZone(time_zone)) {
    throw validationError('invalid_time_zone', 'time_zone must be an IANA time zone.');
  }
  return { scheduled_start: start, scheduled_end: end, time_zone };
}

function readPurposeTag(value) {
  if (value === undefined || value === null || value === '') return null;
  const tag = trimBounded(value, 'purpose_tag', PURPOSE_TAG_MAX_LENGTH).toLowerCase();
  return tag || null;
}

export function validateAgenda(value) {
  if (!Array.isArray(value) || value.length > AGENDA_MAX_ITEMS) {
    throw validationError('invalid_agenda', `agenda must be an array of at most ${AGENDA_MAX_ITEMS} items.`);
  }
  return value.map((item) => {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.text !== 'string' || !AGENDA_SOURCES.has(item.source)) {
      throw validationError('invalid_agenda', 'agenda items need id, text and source (clare, carried or you).');
    }
    return { id: item.id, text: item.text.trim().slice(0, 300), source: item.source, done: item.done === true };
  });
}

export function validateBlocks(value) {
  if (!Array.isArray(value) || value.some((block) => !block || typeof block.id !== 'string' || typeof block.block_type !== 'string')) {
    throw validationError('invalid_blocks', 'blocks must be an array of blocks with id and block_type.');
  }
  if (JSON.stringify(value).length > BLOCKS_MAX_JSON_LENGTH) {
    throw validationError('blocks_too_large', 'blocks are too large for one page.');
  }
  return sanitizeBlocksDeep(value);
}
```

4. Add these to `STORED_KEYS`: `'scheduled_start'`, `'scheduled_end'`, `'time_zone'`, `'purpose_tag'`, `'agenda'`, `'blocks'`.

5. In `parseCommunicationRecord`, replace the version line and the final return:

```js
  if (!READABLE_COMMUNICATION_VERSIONS.has(raw.schema_version)) return null;
```

```js
  return {
    ...raw,
    scheduled_start: raw.scheduled_start ?? null,
    scheduled_end: raw.scheduled_end ?? null,
    time_zone: raw.time_zone ?? null,
    purpose_tag: raw.purpose_tag ?? null,
    agenda: Array.isArray(raw.agenda) ? raw.agenda : [],
    blocks: Array.isArray(raw.blocks) ? raw.blocks : []
  };
```

6. Add `'scheduled_start'`, `'scheduled_end'`, `'time_zone'` and `'purpose_tag'` to `CREATE_KEYS`. In `validateCommunicationCreateInput`, add this before the `return`:

```js
  const window = readScheduledWindow(input);
  const purpose_tag = readPurposeTag(input.purpose_tag);
```

Then add `...window, purpose_tag,` to the returned object.

7. Replace `UPDATE_KEYS` and `validateCommunicationFieldUpdate` with this:

```js
const UPDATE_KEYS = new Set([
  'subject', 'summary', 'scheduled_start', 'scheduled_end', 'time_zone', 'purpose_tag', 'agenda', 'blocks'
]);

export function validateCommunicationFieldUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw validationError('invalid_input', 'A field update requires a request body object.');
  }
  for (const key of Object.keys(input)) {
    if (!UPDATE_KEYS.has(key)) {
      throw validationError('unknown_field', `Unknown field "${key}" is not accepted.`);
    }
  }
  const patch = {};
  if (input.subject !== undefined) patch.subject = trimBounded(input.subject, 'subject', SUBJECT_MAX_LENGTH);
  if (input.summary !== undefined) patch.summary = trimBounded(input.summary, 'summary', SUMMARY_MAX_LENGTH);
  if (input.scheduled_start !== undefined || input.scheduled_end !== undefined || input.time_zone !== undefined) {
    Object.assign(patch, readScheduledWindow(input));
  }
  if (input.purpose_tag !== undefined) patch.purpose_tag = readPurposeTag(input.purpose_tag);
  if (input.agenda !== undefined) patch.agenda = validateAgenda(input.agenda);
  if (input.blocks !== undefined) patch.blocks = validateBlocks(input.blocks);
  if (!Object.keys(patch).length) throw validationError('empty_update', 'Update has no fields.');
  return patch;
}
```

A patch that sends only `scheduled_end` must also send the current `scheduled_start`. The client always sends both (Task 17).

8. In `projectCommunication`, add these after `updated_at: record.updated_at`:

```js
    scheduled_start: record.scheduled_start ?? null,
    scheduled_end: record.scheduled_end ?? null,
    time_zone: record.time_zone ?? null,
    purpose_tag: record.purpose_tag ?? null,
    agenda: record.agenda ?? [],
    blocks: record.blocks ?? []
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/unit/communication-schema.test.js`
Expected: PASS. Old tests that asserted `empty_update` messages still pass, because the code is unchanged.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/communication-schema.mjs tests/unit/communication-schema.test.js
git commit -m "feat(comms): schema v2 with time window, purpose, agenda and blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Comm repository stores v2 records

**Files:**
- Modify: `netlify/functions/_shared/communication-repository.mjs` (`createCommunication` record literal)
- Test: `tests/integration/communications.test.js` (append)

- [ ] **Step 1: Write the failing test** (append; use the file's own handler and request helpers)

```js
test('v2: create stores a scheduled window, PATCH stores agenda and blocks', async () => {
  const handler = buildHandler(); // the file's existing handler factory
  const created = await send(handler, 'POST', '/api/communications', {
    direction: 'outbound',
    channel: 'in_person',
    occurred_at: '2026-10-14T00:50:00.000Z',
    scheduled_start: '2026-10-14T00:50:00.000Z',
    scheduled_end: '2026-10-14T01:05:00.000Z',
    time_zone: 'Australia/Sydney',
    purpose_tag: 'feedback',
    subject: 'Declan essay feedback'
  });
  const comm = (await created.json()).data.communication;
  assert.equal(comm.schema_version, 2);
  assert.equal(comm.scheduled_end, '2026-10-14T01:05:00.000Z');

  const patched = await send(handler, 'PATCH', `/api/communications?id=${comm.id}`, {
    agenda: [{ id: 'ag_1', text: 'What went well', source: 'you' }],
    blocks: [{ id: 'block_1', block_type: 'rich_text', content: { html: '<p>Tighter redraft.</p>' } }]
  });
  const after = (await patched.json()).data.communication;
  assert.equal(after.agenda[0].text, 'What went well');
  assert.equal(after.blocks[0].id, 'block_1');
});
```

Rename `buildHandler` and `send` to the helper names the file already uses.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/integration/communications.test.js`
Expected: FAIL. The created record has `schema_version` 1 or no `scheduled_end`.

- [ ] **Step 3: Implement**

Run: `grep -n "schema_version: COMMUNICATION_SCHEMA_VERSION" netlify/functions/_shared/communication-repository.mjs`
In that record literal (inside `createCommunication`), add this after the `summary` line:

```js
      scheduled_start: validated.scheduled_start ?? null,
      scheduled_end: validated.scheduled_end ?? null,
      time_zone: validated.time_zone ?? null,
      purpose_tag: validated.purpose_tag ?? null,
      agenda: [],
      blocks: [],
```

`validated` stands for the result of `validateCommunicationCreateInput` in that function. Use its real variable name. `updateCommunication` already spreads the patch, so it needs no change.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/integration/communications.test.js tests/integration/follow-up-operation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/communication-repository.mjs tests/integration/communications.test.js
git commit -m "feat(comms): store and patch v2 fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ledger items by source record

The comm page needs the promises made in, or checked in, a given record: this one and the last one in its thread.

**Files:**
- Modify: `netlify/functions/_shared/ledger-repository.mjs`, `netlify/functions/people-ledger.mjs`
- Test: `tests/unit/ledger-promises.test.js` (append; `memoryStore`, `PERSON` and `COMM` are already defined there by Plan 1)

- [ ] **Step 1: Write the failing test**

```js
test('listForSources finds items made in or checked in the given records', async () => {
  const store = memoryStore();
  let n = 0;
  const repo = createLedgerItemRepository({
    store,
    now: () => '2026-09-26T00:00:00.000Z',
    generateId: () => `ledger_00000000-0000-4000-8000-00000000002${++n}`
  });
  const OTHER = 'professional:communication:communication_00000000-0000-4000-8000-000000000009';
  await repo.createItem({ person_ref: PERSON, direction: 'you_owe', text: 'Quote bank', author: 'adam', comm_ref: COMM });
  const { item: checked } = await repo.createItem({ person_ref: PERSON, direction: 'they_owe', text: 'Redraft', author: 'adam', comm_ref: OTHER });
  await repo.patchItem(checked.id, { status: 'done', checked_in_ref: COMM });
  await repo.createItem({ person_ref: PERSON, direction: 'you_owe', text: 'Unrelated', author: 'adam', comm_ref: OTHER });

  const items = await repo.listForSources([COMM]);
  assert.deepEqual(items.map((item) => item.text).sort(), ['Quote bank', 'Redraft']);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/unit/ledger-promises.test.js`
Expected: FAIL with `repo.listForSources is not a function`.

- [ ] **Step 3: Implement**

In `ledger-repository.mjs`, add this next to `listDueBetween`, and add it to the returned object:

```js
  /** Items made in (comm_ref) or checked in (checked_in_ref) any of these records. */
  async function listForSources(refs, { status = null } = {}) {
    const wanted = new Set(refs);
    const keys = (await listBlobKeys(store, LEDGER_ITEM_PREFIX)).filter((key) => !isIndexKey(key));
    const records = [];
    for (const key of keys) {
      const record = parseLedgerItemRecord(await getJSON(store, key));
      if (!record) continue;
      if (!wanted.has(record.comm_ref) && !wanted.has(record.checked_in_ref)) continue;
      if (status && record.status !== status) continue;
      records.push(record);
    }
    records.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    return records.map(projectLedgerItem);
  }
```

In `people-ledger.mjs`, add this under the `due_from` branch from Plan 1:

```js
          if (url.searchParams.has('source_refs')) {
            const refs = url.searchParams.get('source_refs').split(',').map((ref) => ref.trim()).filter(Boolean);
            if (!refs.length || refs.length > 20 || refs.some((ref) => !parseEntityRef(ref))) {
              return withCors(errorResponse(400, 'invalid_source_refs', 'source_refs must be 1–20 entity refs.', false), request, env);
            }
            const items = await ledgerRepo.listForSources(refs);
            return withCors(okResponse(200, { items }), request, env);
          }
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/unit/ledger-promises.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/ledger-repository.mjs netlify/functions/people-ledger.mjs tests/unit/ledger-promises.test.js
git commit -m "feat(ledger): find promises by the record they were made or checked in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Thread record — schema, keys, repository

**Files:**
- Create: `netlify/functions/_shared/thread-schema.mjs`, `netlify/functions/_shared/thread-repository.mjs`
- Modify: `netlify/functions/_shared/professional-blobs.mjs`
- Test: `tests/unit/threads.test.js`

- [ ] **Step 1: Write the failing tests** (`tests/unit/threads.test.js`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidThreadId,
  parseThreadRecord,
  validateThreadCreateInput,
  validateThreadPatchInput
} from '../../netlify/functions/_shared/thread-schema.mjs';
import { createThreadRepository } from '../../netlify/functions/_shared/thread-repository.mjs';

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      return type === 'json' ? structuredClone(map.get(key)) : map.get(key);
    },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    _map: map
  };
}

test('thread ids and create validation', () => {
  assert.equal(isValidThreadId('thread_00000000-0000-4000-8000-000000000001'), true);
  assert.equal(isValidThreadId('thread_x'), false);
  const input = validateThreadCreateInput({ kind: 'case', title: 'Fletcher W. · case management', purpose_tag: 'Case Management' });
  assert.equal(input.purpose_tag, 'case management');
  assert.deepEqual(input.goals, []);
  assert.throws(() => validateThreadCreateInput({ kind: 'saga', title: 'x' }), { code: 'invalid_kind' });
  assert.throws(() => validateThreadCreateInput({ kind: 'general', title: '' }), { code: 'invalid_title' });
});

test('goals only on case threads; progress is 0–100', () => {
  const patch = validateThreadPatchInput({ goals: [{ id: 'g1', text: 'Maths C → B', progress: 62 }] }, 'case');
  assert.equal(patch.goals[0].progress, 62);
  assert.throws(() => validateThreadPatchInput({ goals: [{ id: 'g1', text: 'x', progress: 140 }] }, 'case'), { code: 'invalid_goals' });
  assert.throws(() => validateThreadPatchInput({ goals: [{ id: 'g1', text: 'x', progress: 10 }] }, 'general'), { code: 'goals_need_case' });
});

test('repository create / get / list / patch', async () => {
  const store = memoryStore();
  const repo = createThreadRepository({
    store,
    now: () => '2026-09-26T00:00:00.000Z',
    generateId: () => 'thread_00000000-0000-4000-8000-000000000001'
  });
  const thread = await repo.createThread({ kind: 'case', title: 'Fletcher W. · case management', purpose_tag: 'case management' });
  assert.equal(thread.status, 'open');
  assert.equal((await repo.getThread(thread.id)).title, 'Fletcher W. · case management');
  assert.equal((await repo.listThreads()).length, 1);
  const patched = await repo.patchThread(thread.id, { goals: [{ id: 'g1', text: 'Maths C → B', progress: 62 }] });
  assert.equal(patched.goals.length, 1);
  assert.ok(parseThreadRecord(store._map.get(`threads/records/${thread.id}`)));
  await assert.rejects(() => repo.getThread('thread_00000000-0000-4000-8000-000000000009'), { code: 'thread_not_found' });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/threads.test.js`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Create `thread-schema.mjs`**

```js
import { randomUUID } from 'node:crypto';

// A thread groups comms, meetings and events about the same people and purpose.
// Membership is a Universal Link (`in_thread`), never an id stored here.

export const THREAD_SCHEMA_VERSION = 1;
export const THREAD_KINDS = new Set(['general', 'case']);
export const THREAD_STATUSES = new Set(['open', 'closed']);
const THREAD_ID_PATTERN = /^thread_[0-9a-f-]{36}$/;

export function generateThreadId() {
  return `thread_${randomUUID()}`;
}

export function isValidThreadId(id) {
  return typeof id === 'string' && THREAD_ID_PATTERN.test(id);
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function readTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title || title.length > 120) throw validationError('invalid_title', 'title must be 1–120 characters.');
  return title;
}

function readPurposeTag(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 60) {
    throw validationError('invalid_purpose_tag', 'purpose_tag must be at most 60 characters.');
  }
  return value.trim().toLowerCase() || null;
}

function readGoals(value, kind) {
  if (!Array.isArray(value) || value.length > 12) throw validationError('invalid_goals', 'goals must be at most 12 items.');
  if (value.length && kind !== 'case') throw validationError('goals_need_case', 'Only case threads have goals.');
  return value.map((goal) => {
    const progress = goal?.progress ?? null;
    if (!goal || typeof goal.id !== 'string' || typeof goal.text !== 'string' || !goal.text.trim()
      || (progress !== null && (!Number.isFinite(progress) || progress < 0 || progress > 100))) {
      throw validationError('invalid_goals', 'goals need id, text and progress 0–100 or null.');
    }
    return {
      id: goal.id,
      text: goal.text.trim().slice(0, 200),
      progress,
      note: typeof goal.note === 'string' ? goal.note.trim().slice(0, 120) : null
    };
  });
}

const STORED_KEYS = new Set(['schema_version', 'id', 'kind', 'title', 'purpose_tag', 'goals', 'status', 'created_at', 'updated_at']);

export function parseThreadRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) if (!STORED_KEYS.has(key)) return null;
  if (raw.schema_version !== THREAD_SCHEMA_VERSION || !isValidThreadId(raw.id)) return null;
  if (!THREAD_KINDS.has(raw.kind) || !THREAD_STATUSES.has(raw.status)) return null;
  if (typeof raw.title !== 'string' || !Array.isArray(raw.goals)) return null;
  return { ...raw };
}

export function validateThreadCreateInput(input) {
  if (!input || typeof input !== 'object') throw validationError('invalid_input', 'Thread creation requires a body object.');
  if (!THREAD_KINDS.has(input.kind)) throw validationError('invalid_kind', 'kind must be general or case.');
  return {
    kind: input.kind,
    title: readTitle(input.title),
    purpose_tag: readPurposeTag(input.purpose_tag),
    goals: readGoals(input.goals ?? [], input.kind)
  };
}

export function validateThreadPatchInput(input, currentKind) {
  if (!input || typeof input !== 'object') throw validationError('invalid_input', 'Thread patch requires a body object.');
  const patch = {};
  const kind = input.kind ?? currentKind;
  if (input.kind !== undefined) {
    if (!THREAD_KINDS.has(input.kind)) throw validationError('invalid_kind', 'kind must be general or case.');
    patch.kind = input.kind;
  }
  if (input.title !== undefined) patch.title = readTitle(input.title);
  if (input.purpose_tag !== undefined) patch.purpose_tag = readPurposeTag(input.purpose_tag);
  if (input.goals !== undefined) patch.goals = readGoals(input.goals, kind);
  if (input.status !== undefined) {
    if (!THREAD_STATUSES.has(input.status)) throw validationError('invalid_status', 'status must be open or closed.');
    patch.status = input.status;
  }
  if (!Object.keys(patch).length) throw validationError('empty_update', 'Update has no fields.');
  return patch;
}

export function threadDisplayLabel(record) {
  return record?.title || 'Thread';
}

export function projectThread(record) {
  return { ...record };
}
```

- [ ] **Step 4: Add thread keys to `professional-blobs.mjs`**

Next to the other prefixes, add:

```js
export const THREAD_PREFIX = 'threads/records/';
```

Add `isValidThreadId` to the imports:

```js
import { isValidThreadId } from './thread-schema.mjs';
```

Add these near the ledger key helpers:

```js
export function threadKey(id) {
  if (!isValidThreadId(id)) {
    throw Object.assign(new Error(`Invalid thread id: ${JSON.stringify(id)}`), { status: 400, code: 'invalid_thread_id' });
  }
  return `${THREAD_PREFIX}${id}`;
}

export async function listThreadKeys(store) {
  return (await listBlobKeys(store, THREAD_PREFIX)).filter((key) => !isIndexKey(key));
}
```

- [ ] **Step 5: Create `thread-repository.mjs`**

```js
import {
  THREAD_SCHEMA_VERSION,
  generateThreadId,
  isValidThreadId,
  parseThreadRecord,
  projectThread,
  validateThreadCreateInput,
  validateThreadPatchInput
} from './thread-schema.mjs';
import { getJSON, listThreadKeys, setJSON, threadKey } from './professional-blobs.mjs';

function notFound() {
  return Object.assign(new Error('Thread not found.'), { status: 404, code: 'thread_not_found' });
}

export function createThreadRepository(deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createThreadRepository requires a professional store.');
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? generateThreadId;

  async function load(id) {
    if (!isValidThreadId(id)) throw notFound();
    const record = parseThreadRecord(await getJSON(store, threadKey(id)));
    if (!record) throw notFound();
    return record;
  }

  async function createThread(input) {
    const validated = validateThreadCreateInput(input);
    const timestamp = now();
    const record = {
      schema_version: THREAD_SCHEMA_VERSION,
      id: generateId(),
      ...validated,
      status: 'open',
      created_at: timestamp,
      updated_at: timestamp
    };
    await setJSON(store, threadKey(record.id), record);
    return projectThread(record);
  }

  async function getThread(id) {
    return projectThread(await load(id));
  }

  async function listThreads() {
    const out = [];
    for (const key of await listThreadKeys(store)) {
      const record = parseThreadRecord(await getJSON(store, key));
      if (record) out.push(projectThread(record));
    }
    out.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    return out;
  }

  async function patchThread(id, input) {
    const record = await load(id);
    const patch = validateThreadPatchInput(input, record.kind);
    const updated = { ...record, ...patch, updated_at: now() };
    await setJSON(store, threadKey(id), updated);
    return projectThread(updated);
  }

  return { createThread, getThread, listThreads, patchThread };
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `node --test tests/unit/threads.test.js`
Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/thread-schema.mjs netlify/functions/_shared/thread-repository.mjs netlify/functions/_shared/professional-blobs.mjs tests/unit/threads.test.js
git commit -m "feat(threads): thread record with case goals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `professional:thread` entity and the `in_thread` link

**Files:**
- Modify: `netlify/functions/_shared/entity-ref.mjs` (`ENTITY_REF_KINDS.professional`)
- Modify: `netlify/functions/_shared/entity-resolvers.mjs` (new `resolveThread` + slot)
- Modify: `netlify/functions/_shared/relationship-registry.mjs` (new declaration)
- Test: `tests/unit/threads.test.js` (append)

- [ ] **Step 1: Write the failing test**

```js
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { getRelationshipDeclaration } from '../../netlify/functions/_shared/relationship-registry.mjs';
import { resolveThread } from '../../netlify/functions/_shared/entity-resolvers.mjs';

test('threads are entities and records join them with in_thread', async () => {
  const ref = 'professional:thread:thread_00000000-0000-4000-8000-000000000001';
  assert.deepEqual(parseEntityRef(ref)?.kind, 'thread');
  const decl = getRelationshipDeclaration('in_thread');
  assert.deepEqual([...decl.source_kinds].sort(), ['professional:communication', 'professional:event', 'professional:meeting']);
  assert.deepEqual([...decl.target_kinds], ['professional:thread']);

  const store = memoryStore();
  const repo = createThreadRepository({ store, now: () => '2026-09-26T00:00:00.000Z', generateId: () => 'thread_00000000-0000-4000-8000-000000000001' });
  await repo.createThread({ kind: 'case', title: 'Fletcher W. · case management' });
  const endpoint = await resolveThread('thread_00000000-0000-4000-8000-000000000001', { visibility: 'operator', allowed_visibility: ['operator'] }, { getStore: async () => store });
  assert.equal(endpoint.display_label, 'Fletcher W. · case management');
  assert.equal(endpoint.href, '/professional/#/thread/thread_00000000-0000-4000-8000-000000000001');
});
```

Before running it, check the access-context shape with `grep -n "function isVisibilityAllowed" -A8 netlify/functions/_shared/entity-resolvers.mjs`. If the object above doesn't pass `isVisibilityAllowed(ctx, 'operator')`, use the shape that function reads. It's the same one `tests/unit/slice11-entity-adapters.test.js` passes.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/unit/threads.test.js`
Expected: FAIL, because `parseEntityRef` returns null for the thread kind.

- [ ] **Step 3: Implement**

`entity-ref.mjs`:

```js
  professional: new Set(['communication', 'meeting', 'event', 'application', 'thread']),
```

`relationship-registry.mjs`: add a new entry next to `follows_from`, in the same `[key, declaration({...})]` form:

```js
  [
    'in_thread',
    declaration({
      key: 'in_thread',
      sourceKinds: ['professional:communication', 'professional:meeting', 'professional:event'],
      targetKinds: ['professional:thread'],
      inverseLabel: 'thread_member',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none'
    })
  ],
```

`entity-resolvers.mjs`: add these imports:

```js
import { isValidThreadId, parseThreadRecord, threadDisplayLabel } from './thread-schema.mjs';
```

Add `threadKey` to the existing `./professional-blobs.mjs` import. Add this after `resolveMeeting`:

```js
export async function resolveThread(id, accessContext, { getStore = defaultGetProfessionalStore } = {}) {
  if (!isValidThreadId(id)) throw endpointNotFoundError();
  const ref = formatEntityRef({ namespace: 'professional', kind: 'thread', id });
  if (!isVisibilityAllowed(accessContext, 'operator')) throw endpointNotFoundError();
  const store = await getStore();
  const record = parseThreadRecord(await getProfessionalJSON(store, threadKey(id)));
  if (!record) throw endpointNotFoundError();
  return {
    ref,
    kind: 'thread',
    display_label: threadDisplayLabel(record),
    supporting_label: record.kind === 'case' ? 'case' : 'thread',
    href: `/professional/#/thread/${encodeURIComponent(id)}`,
    lifecycle_status: record.status,
    visibility: 'operator'
  };
}
```

Add this to the resolver slot map, next to `'professional:communication': resolveCommunication,`:

```js
  'professional:thread': resolveThread,
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/unit/threads.test.js tests/unit/slice11-entity-adapters.test.js`
Expected: PASS. If a registry snapshot test lists every relationship key, add `in_thread` to its expected list.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/entity-ref.mjs netlify/functions/_shared/entity-resolvers.mjs netlify/functions/_shared/relationship-registry.mjs tests/unit/threads.test.js
git commit -m "feat(threads): thread entity and in_thread link

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `/api/threads`

**Files:**
- Create: `netlify/functions/threads.mjs`
- Test: `tests/integration/threads.test.js`

- [ ] **Step 1: Write the failing test.** Copy the SESSION HELPERS, then add this:

```js
import { createThreadsHandler } from '../../netlify/functions/threads.mjs';

function threadsHandler(store) {
  return createThreadsHandler({ env, contentStore: store, threadNow: () => '2026-09-26T00:00:00.000Z' });
}

test('POST creates, GET lists and reads, PATCH updates goals', async () => {
  const store = memoryStore(); // copy memoryStore from tests/unit/threads.test.js
  const handler = threadsHandler(store);
  const created = await send(handler, 'POST', '/api/threads', { kind: 'case', title: 'Fletcher W. · case management' });
  assert.equal(created.status, 200);
  const thread = (await created.json()).data.thread;

  const list = await (await send(handler, 'GET', '/api/threads')).json();
  assert.equal(list.data.threads.length, 1);

  const one = await (await send(handler, 'GET', `/api/threads?id=${thread.id}`)).json();
  assert.equal(one.data.thread.kind, 'case');

  const patched = await (await send(handler, 'PATCH', `/api/threads?id=${thread.id}`, {
    goals: [{ id: 'g1', text: 'Maths C → B', progress: 62 }]
  })).json();
  assert.equal(patched.data.thread.goals[0].progress, 62);
});
```

Check how `createOperatorHandler` takes an injected store: `grep -n "getContentStore\|contentStore" netlify/functions/_shared/operator-gate.mjs`. If it's injected as a getter, pass `getContentStore: async () => store`, and apply the same rename in `threadsHandler`.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/integration/threads.test.js`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Create `netlify/functions/threads.mjs`**

```js
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { createThreadRepository } from './_shared/thread-repository.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';

export const config = { path: '/api/threads' };

function toErrorResponse(error) {
  const status = Number.isInteger(error?.status) ? error.status : 500;
  const code = typeof error?.code === 'string' ? error.code : 'internal_error';
  const message = typeof error?.message === 'string' && error.message ? error.message : 'Request failed.';
  return errorResponse(status, code, message, status === 503);
}

export function createThreadsHandler(deps = {}) {
  const threadNow = deps.threadNow ?? (() => new Date().toISOString());
  return createOperatorHandler(
    async (request, context) => {
      const { env, store } = context;
      const url = new URL(request.url);
      const repo = createThreadRepository({ store, now: threadNow, generateId: deps.generateId });
      try {
        if (request.method === 'GET') {
          const id = url.searchParams.get('id');
          if (id) return withCors(okResponse(200, { thread: await repo.getThread(id) }), request, env);
          return withCors(okResponse(200, { threads: await repo.listThreads() }), request, env);
        }
        if (request.method === 'POST') {
          const body = await readJsonObject(request);
          return withCors(okResponse(200, { thread: await repo.createThread(body) }), request, env);
        }
        if (request.method === 'PATCH') {
          const id = url.searchParams.get('id');
          if (!id) return withCors(errorResponse(400, 'missing_id', 'id query param required.', false), request, env);
          const body = await readJsonObject(request);
          return withCors(okResponse(200, { thread: await repo.patchThread(id, body) }), request, env);
        }
        return withCors(methodNotAllowed('GET, POST, PATCH, OPTIONS'), request, env);
      } catch (error) {
        return withCors(toErrorResponse(error), request, env);
      }
    },
    {
      ...deps,
      unboundCode: deps.unboundCode ?? 'professional_blobs_unbound',
      unboundMessage: deps.unboundMessage ?? 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createThreadsHandler();
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test tests/integration/threads.test.js`
Expected: PASS.

- [ ] **Step 5: Register the route for local dev if needed**

Run: `grep -rn "people-ledger" scripts/serve.mjs apps/professional/scripts/mock-api.ts | head`
If either file lists function routes explicitly, add `threads` the same way. Add a mock `/api/threads` to `mock-api.ts` that returns `{ ok: true, data: { threads: [] } }` for GET.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/threads.mjs tests/integration/threads.test.js scripts apps/professional/scripts
git commit -m "feat(threads): /api/threads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Schedule projections include comms and open promises

**Files:**
- Modify: `netlify/functions/_shared/schedule-projection.mjs`, `netlify/functions/schedule-projections.mjs`
- Test: `tests/unit/professional-calendar.test.js` (append)

- [ ] **Step 1: Write the failing test**

```js
import { projectCommunicationSchedule } from '../../netlify/functions/_shared/schedule-projection.mjs';

test('timed comms project as blocks; logged comms as pins', () => {
  const base = {
    id: 'communication_00000000-0000-4000-8000-000000000001',
    subject: 'Declan essay feedback',
    channel: 'in_person',
    direction: 'outbound',
    status: 'completed',
    occurred_at: '2026-10-14T00:50:00.000Z',
    time_zone: 'Australia/Sydney',
    scheduled_start: '2026-10-14T00:50:00.000Z',
    scheduled_end: '2026-10-14T01:05:00.000Z'
  };
  const timed = projectCommunicationSchedule(base);
  assert.equal(timed.kind, 'communication');
  assert.equal(timed.pin, false);
  assert.equal(timed.end, '2026-10-14T01:05:00.000Z');
  assert.equal(timed.href, '/professional/#/communication/communication_00000000-0000-4000-8000-000000000001');

  const logged = projectCommunicationSchedule({ ...base, channel: 'email', scheduled_start: null, scheduled_end: null, time_zone: null });
  assert.equal(logged.pin, true);
  assert.equal(logged.start, '2026-10-14T00:50:00.000Z');
  assert.equal(logged.time_zone, 'Australia/Sydney');
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/unit/professional-calendar.test.js`
Expected: FAIL, because `projectCommunicationSchedule` is not exported.

- [ ] **Step 3: Implement the projection** (`schedule-projection.mjs`)

```js
export function communicationSourceRef(id) {
  return formatEntityRef({ namespace: 'professional', kind: 'communication', id });
}

/** Timed comms are blocks; comms without a window (an email, a text) are pins on their hour. */
export function projectCommunicationSchedule(record) {
  const source_ref = communicationSourceRef(record.id);
  const start = record.scheduled_start ?? record.occurred_at;
  const pin = !record.scheduled_start || !record.scheduled_end;
  return {
    projection_id: deriveProjectionId(source_ref),
    source_ref,
    kind: 'communication',
    title: record.subject || record.channel.replace(/_/g, ' '),
    start,
    end: pin ? start : record.scheduled_end,
    time_zone: record.time_zone || 'Australia/Sydney',
    all_day: false,
    status: record.status,
    channel: record.channel,
    pin,
    href: `/professional/#/communication/${encodeURIComponent(record.id)}`
  };
}
```

- [ ] **Step 4: Include comms and promises in the endpoint** (`schedule-projections.mjs`)

Add these imports:

```js
import { createCommunicationRepository } from './_shared/communication-repository.mjs';
import { createLedgerItemRepository } from './_shared/ledger-repository.mjs';
import { projectCommunicationSchedule } from './_shared/schedule-projection.mjs';
```

(Merge `projectCommunicationSchedule` into the existing `schedule-projection.mjs` import.) Then add this helper above the handler:

```js
function sydneyDateKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
```

Inside the `try`, after `eventRepo` is created, add this:

```js
        const commRepo = (deps.createCommunicationRepository ?? createCommunicationRepository)({
          professionalStore: store,
          now: scheduleNow,
          resolveEntity
        });
        const ledgerRepo = (deps.createLedgerItemRepository ?? createLedgerItemRepository)({ store, now: scheduleNow });
        const today = new Date(scheduleNow());
        const from = sydneyDateKey(new Date(today.getTime() - 30 * 86_400_000));
        const to = sydneyDateKey(new Date(today.getTime() + 120 * 86_400_000));
```

Replace the `Promise.all` and `projections` lines with this:

```js
        const [meetingProjections, eventProjections, communications, promises] = await Promise.all([
          meetingRepo.listScheduleProjections(),
          eventRepo.listScheduleProjections(),
          commRepo.listCommunications(),
          ledgerRepo.listDueBetween(from, to)
        ]);
        const commProjections = communications.map(projectCommunicationSchedule);
        const projections = mergeScheduleProjections([meetingProjections, eventProjections, commProjections]);
        return withCors(okResponse(200, { projections, promises }), request, env);
```

Before relying on this, run `grep -n "export function createCommunicationRepository" -A6 netlify/functions/_shared/communication-repository.mjs` to check the repository's dependency names (for example `professionalStore` vs `store`, and whether it needs `getUniversalLinkStore`). Pass exactly what `communications.mjs` passes. `listCommunications()` returns v2 projections, which carry `scheduled_*`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test tests/unit/professional-calendar.test.js && npm run test:integration`
Expected: PASS. If a schedule-projections integration test asserts the exact response keys, add `promises: []` to its expectation.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/schedule-projection.mjs netlify/functions/schedule-projections.mjs tests
git commit -m "feat(calendar): comms and open promises in schedule projections

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The kit maps comms and promises into calendar events

**Files:**
- Modify: `packages/design-kit/js/calendar/professional-calendar.js`, `packages/design-kit/js/calendar/load-hub-sources.js`
- Test: `tests/unit/professional-calendar.test.js` (append)

- [ ] **Step 1: Write the failing test**

```js
import { promiseEventsFromLedger } from '../../packages/design-kit/js/calendar/professional-calendar.js';

test('comm projections become professional_communication rows with pin', () => {
  const [row] = professionalEventsFromProjections([projectCommunicationSchedule({
    id: 'communication_00000000-0000-4000-8000-000000000002',
    subject: 'Email Amy W.',
    channel: 'email',
    status: 'completed',
    occurred_at: '2026-09-20T23:10:00.000Z',
    scheduled_start: null,
    scheduled_end: null,
    time_zone: null
  })]);
  assert.equal(row.record.type, 'professional_communication');
  assert.equal(row.record.pin, true);
  assert.equal(row.record.channel, 'email');
  assert.equal(row.record.date, '2026-09-21');
  assert.equal(row.record.time, '09:10');
});

test('promiseEventsFromLedger makes dated ledger rows and flags late ones', () => {
  const rows = promiseEventsFromLedger([
    { id: 'ledger_a', direction: 'you_owe', text: 'Email Denielle the summary', due: '2026-09-23', status: 'open' },
    { id: 'ledger_b', direction: 'they_owe', text: 'Kathleen: T4 dates', due: '2026-09-30', status: 'open' }
  ], '2026-09-26');
  assert.equal(rows[0].record.type, 'ledger_item');
  assert.equal(rows[0].record.date, '2026-09-23');
  assert.equal(rows[0].record.late, true);
  assert.equal(rows[0].record.days_late, 3);
  assert.equal(rows[0].record.title, 'You owe · Email Denielle the summary · 3 days late');
  assert.equal(rows[1].record.late, false);
  assert.equal(rows[1].record.title, 'Owed to you · Kathleen: T4 dates');
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/professional-calendar.test.js`
Expected: FAIL. The comm maps to `professional_event`, and `promiseEventsFromLedger` is missing.

- [ ] **Step 3: Implement** (`professional-calendar.js`)

In `lifeEventFromProjection`, replace the `type` line:

```js
  const type =
    projection.kind === 'meeting'
      ? 'professional_meeting'
      : projection.kind === 'communication'
        ? 'professional_communication'
        : 'professional_event';
```

Add these to its returned `record: { ... }`:

```js
      pin: projection.pin === true,
      channel: projection.channel ?? null,
```

At the end of the file, add this:

```js
function daysBetween(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

/**
 * Open People-ledger promises as Due-row rows.
 * @param {Array<{id:string,direction:string,text:string,due:string|null,status:string}>} items
 * @param {string} todayKey YYYY-MM-DD in Sydney
 */
export function promiseEventsFromLedger(items, todayKey) {
  const out = [];
  for (const item of items ?? []) {
    if (!item?.due || item.status !== 'open') continue;
    const late = item.due < todayKey;
    const daysLate = late ? daysBetween(item.due, todayKey) : 0;
    const lead = item.direction === 'they_owe' ? 'Owed to you' : 'You owe';
    const tail = late ? ` · ${daysLate} day${daysLate === 1 ? '' : 's'} late` : '';
    out.push({
      path: `ledger:${item.id}`,
      record: {
        type: 'ledger_item',
        id: item.id,
        date: item.due,
        title: `${lead} · ${item.text}${tail}`,
        direction: item.direction,
        late,
        days_late: daysLate
      }
    });
  }
  return out;
}

export function sydneyTodayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
```

In `load-hub-sources.js`, merge `promiseEventsFromLedger` and `sydneyTodayKey` into the `./professional-calendar.js` import. Then replace the `const events = professionalEventsFromProjections(...)` line in `loadProfessional` with this:

```js
        const events = [
          ...professionalEventsFromProjections(payload.data?.projections ?? []),
          ...promiseEventsFromLedger(payload.data?.promises ?? [], opts.today ?? sydneyTodayKey())
        ];
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/unit/professional-calendar.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/design-kit/js/calendar/professional-calendar.js packages/design-kit/js/calendar/load-hub-sources.js tests/unit/professional-calendar.test.js
git commit -m "feat(calendar): kit maps comms and promises

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Tideline model — comm and event kinds, pins, promise dues

**Files:**
- Modify: `packages/design-kit/js/calendar/tideline-model.js` (`eventKind` at 93, `chipFromEvent` at 117, `dueFor` at 249, due counts at 332)
- Test: `tests/unit/tideline-model-comms.test.js`

- [ ] **Step 1: Find the model's public entry point**

Run: `grep -n "^export function" packages/design-kit/js/calendar/tideline-model.js`
Note the function that builds `model.days` from `events` (for example `buildTidelineModel`) and its arguments. Look at an existing test that calls it: `grep -rln "tideline-model" tests/unit`.

- [ ] **Step 2: Write the failing test.** Use the builder and the argument shape found in Step 1. The expectations are fixed:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { /* builder from Step 1 */ } from '../../packages/design-kit/js/calendar/tideline-model.js';

const events = [
  { path: 'p:1', record: { type: 'professional_communication', id: 'c1', date: '2026-09-22', time: '08:40', duration_min: 15, title: 'Fletcher W. · session 7', pin: false } },
  { path: 'p:2', record: { type: 'professional_communication', id: 'c2', date: '2026-09-21', time: '09:10', duration_min: 1, title: 'Email Amy W.', pin: true, channel: 'email' } },
  { path: 'p:3', record: { type: 'professional_event', id: 'e1', date: '2026-09-25', time: '18:00', duration_min: 105, title: 'HALT medal ceremony', event_type: 'ceremony' } },
  { path: 'ledger:a', record: { type: 'ledger_item', id: 'ledger_a', date: '2026-09-23', title: 'You owe · Email Denielle · 3 days late', direction: 'you_owe', late: true } }
];

test('comms are comm chips; pins stay short; non-PD events are event chips; promises are dues', () => {
  const model = build(events); // the builder from Step 1, called with the week 21–27/09/26
  const chips = model.days.flatMap((day) => day.chips);
  const session = chips.find((chip) => chip.id === 'c1');
  assert.equal(session.kind, 'comm');
  assert.equal(session.filterKey, 'comms');
  const pin = chips.find((chip) => chip.id === 'c2');
  assert.equal(pin.pin, true);
  assert.ok(pin.end - pin.start <= 0.4 + 1e-9);
  const ceremony = chips.find((chip) => chip.id === 'e1');
  assert.equal(ceremony.kind, 'event');
  assert.equal(ceremony.filterKey, 'events');
  const wed = model.days.find((day) => day.date === '2026-09-23');
  assert.deepEqual(wed.due.map((due) => [due.kind, due.filterKey, due.late]), [['promise', 'promises', true]]);
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `node --test tests/unit/tideline-model-comms.test.js`
Expected: FAIL. The session kind is `task`, and `wed.due` is empty.

- [ ] **Step 4: Implement**

`eventKind`:

```js
function eventKind(record) {
  if (record.type === 'scheduled_lesson') return 'teaching';
  if (record.type === 'professional_communication') return 'comm';
  if (record.type === 'professional_event' && record.event_type && record.event_type !== 'professional_development') return 'event';
  if (record.type === 'professional_meeting' || record.type === 'professional_event') return 'professional';
  if (record.type === 'workout') return 'fitness';
  if (record.type === 'medical') return 'health';
  if (record.type === 'calendar_block') return record.kind === 'corey' ? 'corey' : record.kind === 'focus' ? 'study' : 'health';
  if (record.type === 'work_block' || record.type === 'task') return 'task';
  return 'task';
}
```

In `chipFromEvent`, replace the `end` computation:

```js
  const pin = record.pin === true;
  const end = pin
    ? start + 0.4
    : record.end_time
      ? toHour(record.end_time)
      : start + (Number(record.duration_min) || 60) / 60;
```

Replace the `filterKey` expression's professional arm by putting two new arms before it:

```js
    : kind === 'comm'
      ? 'comms'
      : kind === 'event'
        ? 'events'
        : kind === 'professional'
          ? (record.type === 'professional_meeting' ? 'meetings' : 'pd')
          : kind === 'task'
```

Keep the rest of the chain unchanged. Add `pin,` to the returned chip object.

`dueFor`: replace the non-visual `return` with this:

```js
  const tasks = (events ?? [])
    .filter(event => event.record?.type === 'task' && event.record.date === date && !event.record.time)
    .map(event => ({ id: event.record.id || event.path, date, title: event.record.title || 'Task', kind: 'task', filterKey: 'tasks' }));
  const promises = (events ?? [])
    .filter(event => event.record?.type === 'ledger_item' && event.record.date === date)
    .map(event => ({
      id: event.record.id,
      date,
      title: event.record.title,
      kind: 'promise',
      filterKey: 'promises',
      direction: event.record.direction,
      late: event.record.late === true
    }));
  return [...tasks, ...promises];
```

Line 332 becomes this:

```js
    for (const due of day.due) if (due.kind !== 'promise') counts.task += 1;
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test tests/unit/tideline-model-comms.test.js && npm run test:unit`
Expected: PASS, with the existing Tideline model tests still green.

- [ ] **Step 6: Commit**

```bash
git add packages/design-kit/js/calendar/tideline-model.js tests/unit/tideline-model-comms.test.js
git commit -m "feat(calendar): comm, event and promise items in the Tideline model

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Tideline rendering — promise Due chips, pin chips, colours

**Files:**
- Modify: `packages/design-kit/js/calendar/render-tideline.js` (lines 421, 456, 523, `mountChip` at 595)
- Modify: `packages/design-kit/calendar-tideline.css`, `docs/proposals/calendar-reference/src/tideline.template.html`

- [ ] **Step 1: Use each due's own kind and filter key**

Change line 421 to this:

```js
  const dues = model.days.flatMap((day) => day.due.map((due) => ({ ...due, kind: due.kind ?? 'task', filterKey: due.filterKey ?? 'tasks' })));
```

Change line 456 to this:

```js
    for (const due of day.due) entries.push({ id: `due:${due.id}`, item: { ...due, kind: due.kind ?? 'task', filterKey: due.filterKey ?? 'tasks' } });
```

- [ ] **Step 2: Promise Due chips** (line 523)

```js
    const promiseClass = due.kind === 'promise'
      ? ` is-promise ${due.direction === 'they_owe' ? 'is-them' : 'is-you'}${due.late ? ' is-late' : ''}`
      : '';
    const chip = el('div', `cal-due${promiseClass}`, `<b>${escapeHtml(due.title)}</b>`, cell, { 'data-part': 'due', 'data-id': due.id, ...(due.kind === 'promise' ? { 'data-kind': 'promise' } : {}) });
```

- [ ] **Step 3: Pin chips** (`mountChip`)

After `if (chip.kind === 'corey') classes.push('is-corey');`, add:

```js
  if (chip.pin) classes.push('is-pin');
```

- [ ] **Step 4: Styles**

Append this to `calendar-tideline.css`, and to the matching `<style>` in `tideline.template.html`:

```css
/* ---------- comms, events, promises (26/09/26, calendar comms spec) ---------- */
.k-comm{--k-bg:var(--pastel-blue);--k-stripe:var(--wave)}
.k-event{--k-bg:var(--pastel-gold);--k-stripe:var(--pastel-gold-ink)}
.cal-chip.is-pin{height:22px!important;border-radius:var(--radius-full);padding:2px 8px;background:var(--paper);border:1px solid color-mix(in srgb,var(--wave) 35%,transparent)}
.cal-chip.is-pin::before{display:none}
.cal-chip.is-pin .cal-chip__meta{display:none}
.cal-chip.is-pin .cal-chip__title{font-size:var(--text-2xs);-webkit-line-clamp:1}
.cal-due.is-promise{background:color-mix(in srgb,var(--high-sea) 7%,transparent);border:1px dashed color-mix(in srgb,var(--high-sea-ink) 50%,transparent);color:var(--high-sea-ink)}
.cal-due.is-promise.is-them{background:color-mix(in srgb,var(--wave) 6%,transparent);border-color:color-mix(in srgb,var(--wave) 45%,transparent);color:var(--pastel-blue-ink)}
.cal-due.is-promise.is-late{background:var(--high-sea);border:1px solid var(--high-sea);color:#fff}
/* source pill dots */
.cal-src.k-classes{--k-stripe:var(--wave)}
.cal-src.k-comms{--k-stripe:var(--wave)}
.cal-src.k-meetings{--k-stripe:var(--cal-lilac-stripe)}
.cal-src.k-events{--k-stripe:var(--pastel-gold-ink)}
.cal-src.k-pd{--k-stripe:var(--pastel-peach-ink)}
.cal-src.k-promises{--k-stripe:var(--high-sea)}
.cal-src.k-tasks{--k-stripe:var(--cal-sage-stripe)}
.cal-src.k-health{--k-stripe:var(--cal-health-stripe)}
.cal-src.k-fitness{--k-stripe:var(--wave)}
```

`#fff` on solid High Sea follows the Tideline "today" pip, which already uses white on a filled token. If the spec's token-only lint flags `#fff`, use `var(--paper)` instead.

- [ ] **Step 5: Run the calendar suites**

Run: `npm run test:unit && npm run build && node --test --test-concurrency=1 tests/browser/calendar-filter.spec.mjs tests/browser/professional-calendar-hub.spec.mjs tests/browser/teaching-calendar-hub.spec.mjs tests/browser/tasks-calendar-hub.spec.mjs && TIDELINE_APP=1 node --test tests/browser/tideline-visual.spec.mjs`
Expected: PASS. The reference fixture has no comms or promises, so its goldens don't change. Only the pill colours might, and Plan 1 Task 4 already refreshed that row.

- [ ] **Step 6: Commit**

```bash
git add packages/design-kit/js/calendar/render-tideline.js packages/design-kit/calendar-tideline.css docs/proposals/calendar-reference/src/tideline.template.html
git commit -m "feat(calendar): promise Due chips, comm pins and source pill colours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Professional rail, routes and redirects

**Files:**
- Modify: `apps/professional/src/app/router.ts`, `apps/professional/src/shell/shell.ts`, `apps/professional/src/app/main.ts`, `apps/professional/src/shell/icons.ts`, `apps/professional/src/domain/ids.ts`
- Test: `apps/professional/tests/unit/router.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

```ts
import { parseRoute, threadRoute } from '@/app/router';

describe('calendar comms routes', () => {
  it('old list routes land on the calendar', () => {
    for (const hash of ['#/communications', '#/meetings', '#/events']) {
      expect(parseRoute(hash)).toEqual({ name: 'calendar', zoom: 'week', redirectedFrom: hash.slice(2) });
    }
  });
  it('thread route validates the id', () => {
    const id = 'thread_00000000-0000-4000-8000-000000000001';
    expect(parseRoute(`#/thread/${id}`)).toEqual({ name: 'thread', id });
    expect(parseRoute('#/thread/nope').name).toBe('not-found');
    expect(threadRoute(id)).toBe(`#/thread/${id}`);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/router.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`domain/ids.ts`: add this next to the other validators:

```ts
export function isValidThreadId(id: string): boolean {
  return /^thread_[0-9a-f-]{36}$/.test(id);
}
```

`router.ts`:
- Add `isValidThreadId` to the import.
- Add `'calendar'` to `RailViewId`.
- Change the calendar union member to `{ name: 'calendar'; zoom: string; redirectedFrom?: string }`.
- Add `| { name: 'thread'; id: string }`.
- Replace the three list-route lines with this:

```ts
  if (segments.length === 1 && ['communications', 'meetings', 'events'].includes(segments[0]!)) {
    return { name: 'calendar', zoom: 'week', redirectedFrom: segments[0]! };
  }
```

Add this before the final `return { name: 'not-found', path };`:

```ts
  if (segments.length === 2 && segments[0] === 'thread') {
    const id = safeDecode(segments[1]!);
    if (id && isValidThreadId(id)) return { name: 'thread', id };
    return { name: 'not-found', path };
  }
```

Export this next to `meetingRoute`:

```ts
export function threadRoute(id: string): string {
  return `#/thread/${encodeURIComponent(id)}`;
}
```

Keep the `communications`, `meetings` and `events` members in the `Route` union. They're no longer produced, and `main.ts` branches for them are deleted in Step 5.

`shell.ts`:

```ts
const MAJOR_ITEMS: NavItem[] = [
  { id: 'home', label: 'Home', href: '#/home' },
  { id: 'calendar', label: 'Calendar', href: '#/calendar' }
];

const REST: NavItem[] = [
  { id: 'people', label: 'People', href: '#/people' },
  { id: 'organisations', label: 'Organisations', href: '#/organisations' },
  { id: 'relationships', label: 'Relationships', href: '#/relationships' },
  { id: 'applications', label: 'Applications', href: '#/applications' },
  { id: 'career', label: 'Career', href: '#/career' },
  { id: 'network-ecology', label: 'Network Ecology', href: '#/network-ecology' }
];
```

In `syncMobileChrome`, replace the `communications` "more" entry with a `calendar` entry (label `Calendar`, `href: '#/calendar'`). Give the Calendar rail link the class `hub-rail__link--sub`, so it sits indented under Home as in the mockup: in the function that builds each link (line ~150), add `if (item.id === 'calendar') link.classList.add('hub-rail__link--sub');`. Add this to Professional's rail stylesheet (`grep -rln "hub-rail__link" apps/professional/src/styles`):

```css
.hub-rail__link--sub{padding-left:calc(var(--space-4) + 18px)}
```

`icons.ts`: add `calendar` to `RAIL_ICON_PATHS`. Copy the calendar path from `packages/design-kit/icons` (`ls packages/design-kit/icons | grep -i calendar`). Make `railIconFor('calendar')` return it.

- [ ] **Step 4: Update `railHighlightFor` and the redirect in `main.ts`**

Run: `grep -n "function railHighlightFor" -A30 apps/professional/src/app/main.ts`
Map `calendar`, `communication`, `communication-new`, `meeting`, `meeting-new`, `event`, `event-new` and `thread` to `'calendar'`.

At the top of `paint()`, right after `const route = parseRoute();`, add:

```ts
    if (route.name === 'calendar' && route.redirectedFrom) {
      history.replaceState(null, '', '#/calendar');
    }
```

- [ ] **Step 5: Remove the old list views and add the calendar's add buttons**

- Delete the `route.name === 'communications'`, `'meetings'` and `'events'` branches in `main.ts`, and their now-unused imports.
- Keep the files `views/communications.ts`, `meetings.ts` and `events.ts`: their new and detail views are still used.
- Remove the matching members from the `Route` union, now that nothing produces them.

In the `calendar` branch, after `shell.canvas.replaceChildren();`, add this:

```ts
      const actions = document.createElement('div');
      actions.className = 'pro-calendar__actions';
      for (const [label, href] of [
        ['＋ Log a comm', '#/communication/new'],
        ['＋ Meeting', '#/meeting/new'],
        ['＋ Event', '#/event/new']
      ] as const) {
        const link = document.createElement('a');
        link.className = 'btn btn--secondary';
        link.href = href;
        link.textContent = label;
        actions.append(link);
      }
      shell.canvas.append(actions);
```

Also add this CSS to Professional's views stylesheet:

```css
.pro-calendar__actions{display:flex;flex-wrap:wrap;gap:var(--space-2);justify-content:flex-end;margin-bottom:var(--space-3)}
```

- [ ] **Step 6: Run the tests and the typecheck, and confirm they pass**

Run: `cd apps/professional && npx vitest run && npx tsc --noEmit`
Expected: PASS. If `shell.test.ts` asserts the rail items, update it to the new list: Home, Calendar, People, Organisations, Relationships, Applications, Career, Network Ecology.

- [ ] **Step 7: Commit**

```bash
git add apps/professional/src apps/professional/tests
git commit -m "feat(professional): Calendar under Home; comms, meetings and events lists redirect

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Professional types and API clients

**Files:**
- Modify: `apps/professional/src/domain/types.ts`, `apps/professional/src/api/communications.ts`
- Create: `apps/professional/src/api/threads.ts`, `apps/professional/src/api/ledger.ts`
- Test: `apps/professional/tests/unit/api-threads-ledger.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listThreads, patchThread } from '@/api/threads';
import { createLedgerItem, listLedgerForSources } from '@/api/ledger';

function mockFetch(data: unknown) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('threads and ledger clients', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists threads', async () => {
    const fetch = mockFetch({ threads: [] });
    await listThreads();
    expect(String(fetch.mock.calls[0][0])).toContain('/api/threads');
  });

  it('patches a thread by id', async () => {
    const fetch = mockFetch({ thread: {} });
    await patchThread('thread_00000000-0000-4000-8000-000000000001', { status: 'closed' });
    expect(String(fetch.mock.calls[0][0])).toContain('/api/threads?id=thread_00000000-0000-4000-8000-000000000001');
    expect(fetch.mock.calls[0][1].method).toBe('PATCH');
  });

  it('reads ledger items by source and creates with action create', async () => {
    const fetch = mockFetch({ items: [] });
    await listLedgerForSources(['professional:communication:communication_1']);
    expect(String(fetch.mock.calls[0][0])).toContain('source_refs=professional%3Acommunication%3Acommunication_1');
    mockFetch({ item: {}, created: true });
    await createLedgerItem({ person_ref: 'shared:person:p1', direction: 'you_owe', text: 'Quote bank', comm_ref: 'professional:communication:communication_1' });
    const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.action).toBe('create');
  });
});
```

Check how `api/client.ts` builds requests (`sed -n 1,60p apps/professional/src/api/client.ts`). If it doesn't use global `fetch` directly, stub whatever it calls.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/professional && npx vitest run tests/unit/api-threads-ledger.test.ts`
Expected: FAIL, because the modules are missing.

- [ ] **Step 3: Implement**

`domain/types.ts`: extend `CommunicationRecord` with these fields:

```ts
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  time_zone?: string | null;
  purpose_tag?: string | null;
  agenda?: AgendaItem[];
  blocks?: unknown[];
```

Then add these types:

```ts
export interface AgendaItem {
  id: string;
  text: string;
  source: 'clare' | 'carried' | 'you';
  done?: boolean;
}

export interface ThreadGoal {
  id: string;
  text: string;
  progress: number | null;
  note: string | null;
}

export interface ThreadRecord {
  schema_version: number;
  id: string;
  kind: 'general' | 'case';
  title: string;
  purpose_tag: string | null;
  goals: ThreadGoal[];
  status: 'open' | 'closed';
  created_at: string;
  updated_at: string;
}

export interface LedgerItem {
  id: string;
  person_ref: string;
  direction: 'you_owe' | 'they_owe';
  text: string;
  task_ref: string | null;
  comm_ref: string | null;
  due: string | null;
  checked_in_ref: string | null;
  status: 'open' | 'done' | 'dismissed';
  author: 'clare' | 'adam';
  created_at: string;
  updated_at: string;
}
```

`api/communications.ts`: widen `updateCommunication`'s patch type to this:

```ts
  patch: {
    subject?: string;
    summary?: string;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    time_zone?: string | null;
    purpose_tag?: string | null;
    agenda?: AgendaItem[];
    blocks?: unknown[];
  },
```

Import `AgendaItem`. Also add the same optional window and `purpose_tag` fields to `CreateCommunicationInput`.

`api/threads.ts`:

```ts
import { apiGet, apiPatch, apiPost } from '@/api/client';
import type { ThreadGoal, ThreadRecord } from '@/domain/types';

export function listThreads(options: { signal?: AbortSignal } = {}): Promise<{ threads: ThreadRecord[] }> {
  return apiGet('/api/threads', { signal: options.signal });
}

export function getThread(id: string, options: { signal?: AbortSignal } = {}): Promise<{ thread: ThreadRecord }> {
  return apiGet(`/api/threads?${new URLSearchParams({ id }).toString()}`, { signal: options.signal });
}

export function createThread(
  body: { kind: 'general' | 'case'; title: string; purpose_tag?: string | null },
  options: { signal?: AbortSignal } = {}
): Promise<{ thread: ThreadRecord }> {
  return apiPost('/api/threads', body, { signal: options.signal });
}

export function patchThread(
  id: string,
  patch: { kind?: 'general' | 'case'; title?: string; purpose_tag?: string | null; goals?: ThreadGoal[]; status?: 'open' | 'closed' },
  options: { signal?: AbortSignal } = {}
): Promise<{ thread: ThreadRecord }> {
  return apiPatch(`/api/threads?${new URLSearchParams({ id }).toString()}`, patch, { signal: options.signal });
}
```

`api/ledger.ts`:

```ts
import { apiGet, apiPost } from '@/api/client';
import type { LedgerItem } from '@/domain/types';

export function listLedgerForSources(refs: string[], options: { signal?: AbortSignal } = {}): Promise<{ items: LedgerItem[] }> {
  const params = new URLSearchParams({ source_refs: refs.join(',') });
  return apiGet(`/api/people/ledger?${params.toString()}`, { signal: options.signal });
}

export function createLedgerItem(
  body: { person_ref: string; direction: 'you_owe' | 'they_owe'; text: string; comm_ref: string; due?: string | null },
  options: { signal?: AbortSignal } = {}
): Promise<{ item: LedgerItem; created: boolean }> {
  return apiPost('/api/people/ledger', { action: 'create', author: 'adam', ...body }, { signal: options.signal });
}

export function patchLedger(
  id: string,
  patch: { status?: LedgerItem['status']; due?: string | null; checked_in_ref?: string | null; task_ref?: string | null; text?: string },
  options: { signal?: AbortSignal } = {}
): Promise<{ item: LedgerItem }> {
  return apiPost('/api/people/ledger', { action: 'patch', id, ...patch }, { signal: options.signal });
}
```

If `apiPatch` / `apiGet` / `apiPost` aren't the exported names in `api/client.ts`, use the names `api/communications.ts` imports.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/api-threads-ledger.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/domain/types.ts apps/professional/src/api apps/professional/tests/unit/api-threads-ledger.test.ts
git commit -m "feat(professional): thread and ledger clients, v2 comm types

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The phase rule

**Files:**
- Create: `apps/professional/src/lib/comm-phase.ts`
- Test: `apps/professional/tests/unit/comm-phase.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { nextSwitchDelayMs, phaseFor } from '@/lib/comm-phase';

const w = { scheduled_start: '2026-10-14T00:50:00.000Z', scheduled_end: '2026-10-14T01:05:00.000Z' };

describe('phaseFor', () => {
  it('before, during, after around the window', () => {
    expect(phaseFor(w, new Date('2026-10-14T00:40:00.000Z'))).toBe('before');
    expect(phaseFor(w, new Date('2026-10-14T00:50:00.000Z'))).toBe('during');
    expect(phaseFor(w, new Date('2026-10-14T01:05:00.000Z'))).toBe('after');
  });
  it('no window means a logged comm: after', () => {
    expect(phaseFor({ scheduled_start: null, scheduled_end: null }, new Date())).toBe('after');
  });
  it('a start with no end runs for 60 minutes', () => {
    const open = { scheduled_start: '2026-10-14T00:50:00.000Z', scheduled_end: null };
    expect(phaseFor(open, new Date('2026-10-14T01:49:00.000Z'))).toBe('during');
    expect(phaseFor(open, new Date('2026-10-14T01:50:00.000Z'))).toBe('after');
  });
});

describe('nextSwitchDelayMs', () => {
  it('counts down to the next boundary, or null when done', () => {
    expect(nextSwitchDelayMs(w, new Date('2026-10-14T00:49:00.000Z'))).toBe(60_000);
    expect(nextSwitchDelayMs(w, new Date('2026-10-14T01:04:00.000Z'))).toBe(60_000);
    expect(nextSwitchDelayMs(w, new Date('2026-10-14T01:06:00.000Z'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/comm-phase.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `lib/comm-phase.ts`

```ts
export type CommPhase = 'before' | 'during' | 'after';

export type CommWindow = { scheduled_start?: string | null; scheduled_end?: string | null };

const OPEN_ENDED_MS = 60 * 60_000;

function bounds(w: CommWindow): { start: number; end: number } | null {
  if (!w.scheduled_start) return null;
  const start = Date.parse(w.scheduled_start);
  if (!Number.isFinite(start)) return null;
  const parsedEnd = w.scheduled_end ? Date.parse(w.scheduled_end) : NaN;
  const end = Number.isFinite(parsedEnd) ? parsedEnd : start + OPEN_ENDED_MS;
  return { start, end };
}

/** The clock picks the face: prep before the start, capture until the end, wrap-up after. */
export function phaseFor(w: CommWindow, now: Date): CommPhase {
  const b = bounds(w);
  if (!b) return 'after';
  const t = now.getTime();
  if (t < b.start) return 'before';
  if (t < b.end) return 'during';
  return 'after';
}

/** Milliseconds until the phase next changes, or null if it never will. */
export function nextSwitchDelayMs(w: CommWindow, now: Date): number | null {
  const b = bounds(w);
  if (!b) return null;
  const t = now.getTime();
  if (t < b.start) return b.start - t;
  if (t < b.end) return b.end - t;
  return null;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/comm-phase.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/lib/comm-phase.ts apps/professional/tests/unit/comm-phase.test.ts
git commit -m "feat(professional): comm phase rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Inline promises and block text

**Files:**
- Create: `apps/professional/src/lib/inline-promises.ts`
- Test: `apps/professional/tests/unit/inline-promises.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { blockPlainText, extractInlinePromises, resolvePromiseOwner } from '@/lib/inline-promises';

describe('extractInlinePromises', () => {
  it('finds »me and »Name lines', () => {
    const text = 'Good redraft.\n»me send the quote bank by Thu\n»Declan · rewrite the fence paragraph';
    expect(extractInlinePromises(text)).toEqual([
      { owner: 'me', text: 'send the quote bank by Thu' },
      { owner: 'Declan', text: 'rewrite the fence paragraph' }
    ]);
  });
  it('ignores empty promises and plain text', () => {
    expect(extractInlinePromises('»me   \nno marker here')).toEqual([]);
  });
});

describe('blockPlainText', () => {
  it('reads html and text from nested blocks', () => {
    const blocks = [
      { id: 'a', block_type: 'rich_text', content: { html: '<p>»me <b>quote bank</b></p>' } },
      { id: 'b', block_type: 'section', content: { blocks: [{ id: 'c', block_type: 'quote', content: { text: '»Declan redraft' } }] } }
    ];
    expect(blockPlainText(blocks)).toBe('»me quote bank\n»Declan redraft');
  });
});

describe('resolvePromiseOwner', () => {
  const people = [
    { ref: 'shared:person:p_declan', name: 'Declan J.' },
    { ref: 'shared:person:p_denielle', name: 'Denielle J.' }
  ];
  it('me owes the first person; a name owes by first-name match', () => {
    expect(resolvePromiseOwner('me', people)).toEqual({ direction: 'you_owe', person_ref: 'shared:person:p_declan' });
    expect(resolvePromiseOwner('Denielle', people)).toEqual({ direction: 'they_owe', person_ref: 'shared:person:p_denielle' });
    expect(resolvePromiseOwner('Greg', people)).toBeNull();
    expect(resolvePromiseOwner('me', [])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/inline-promises.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `lib/inline-promises.ts`

```ts
export type InlinePromise = { owner: string; text: string };

const LINE = /»\s*(me|[A-Z][\p{L}'’-]*)\s*(?:[·:,-]\s*)?(.*)$/u;

/** Each line that starts with » is a promise: `»me …` is yours, `»Name …` is theirs. */
export function extractInlinePromises(text: string): InlinePromise[] {
  const out: InlinePromise[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const match = LINE.exec(line);
    if (!match || line.indexOf('»') !== 0) continue;
    const body = (match[2] ?? '').trim();
    if (!body) continue;
    out.push({ owner: match[1]!, text: body });
  }
  return out;
}

function stripHtml(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ');
}

/** Every html/text string in a block tree, one line each. */
export function blockPlainText(blocks: unknown[]): string {
  const lines: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if ((key === 'html' || key === 'text') && typeof child === 'string') {
        for (const line of (key === 'html' ? stripHtml(child) : child).split('\n')) {
          const trimmed = line.replace(/\s+/g, ' ').trim();
          if (trimmed) lines.push(trimmed);
        }
      } else if (typeof child === 'object') {
        visit(child);
      }
    }
  };
  visit(blocks);
  return lines.join('\n');
}

export type PersonOnPage = { ref: string; name: string };

/** `me` owes the first person on the page; a name is someone on the page who owes you. */
export function resolvePromiseOwner(
  owner: string,
  people: PersonOnPage[]
): { direction: 'you_owe' | 'they_owe'; person_ref: string } | null {
  if (owner.toLowerCase() === 'me') {
    return people[0] ? { direction: 'you_owe', person_ref: people[0].ref } : null;
  }
  const lower = owner.toLowerCase();
  const hit = people.find((person) => person.name.toLowerCase().split(/\s+/)[0] === lower);
  return hit ? { direction: 'they_owe', person_ref: hit.ref } : null;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/inline-promises.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/lib/inline-promises.ts apps/professional/tests/unit/inline-promises.test.ts
git commit -m "feat(professional): »me / »name inline promises

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Thread auto-join rule

**Files:**
- Create: `apps/professional/src/lib/thread-match.ts`
- Test: `apps/professional/tests/unit/thread-match.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { pickThreadForComm, type ThreadCandidate } from '@/lib/thread-match';

const at = '2026-10-14T00:50:00.000Z';
const cand = (over: Partial<ThreadCandidate>): ThreadCandidate => ({
  id: 'thread_a', status: 'open', purpose_tag: 'feedback', personRefs: ['shared:person:declan'], lastAt: '2026-09-25T02:00:00.000Z', ...over
});

describe('pickThreadForComm', () => {
  it('joins the one open thread with the same purpose, a shared person, active in 90 days', () => {
    expect(pickThreadForComm({ personRefs: ['shared:person:declan'], purposeTag: 'feedback', at }, [cand({})])).toEqual({ join: 'thread_a', candidates: ['thread_a'] });
  });
  it('proposes instead of joining when two threads match', () => {
    const result = pickThreadForComm({ personRefs: ['shared:person:declan'], purposeTag: 'feedback', at }, [cand({}), cand({ id: 'thread_b' })]);
    expect(result).toEqual({ join: null, candidates: ['thread_a', 'thread_b'] });
  });
  it('skips closed, other-purpose, stranger and stale threads', () => {
    const threads = [
      cand({ id: 'closed', status: 'closed' }),
      cand({ id: 'other', purpose_tag: 'case management' }),
      cand({ id: 'stranger', personRefs: ['shared:person:amy'] }),
      cand({ id: 'stale', lastAt: '2026-06-01T00:00:00.000Z' })
    ];
    expect(pickThreadForComm({ personRefs: ['shared:person:declan'], purposeTag: 'feedback', at }, threads)).toEqual({ join: null, candidates: [] });
  });
  it('no purpose tag means no auto-join', () => {
    expect(pickThreadForComm({ personRefs: ['shared:person:declan'], purposeTag: null, at }, [cand({})]).join).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/thread-match.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `lib/thread-match.ts`

```ts
export type ThreadCandidate = {
  id: string;
  status: 'open' | 'closed';
  purpose_tag: string | null;
  personRefs: string[];
  lastAt: string | null;
};

const WINDOW_MS = 90 * 86_400_000;

/**
 * Spec §3: a record joins a thread by itself when exactly one open thread shares
 * its purpose tag and at least one person, and was active in the last 90 days.
 * Otherwise the matches are offered for Adam to pick.
 */
export function pickThreadForComm(
  comm: { personRefs: string[]; purposeTag: string | null; at: string },
  threads: ThreadCandidate[]
): { join: string | null; candidates: string[] } {
  if (!comm.purposeTag) return { join: null, candidates: [] };
  const at = Date.parse(comm.at);
  const people = new Set(comm.personRefs);
  const matches = threads.filter((thread) =>
    thread.status === 'open' &&
    thread.purpose_tag === comm.purposeTag &&
    thread.personRefs.some((ref) => people.has(ref)) &&
    thread.lastAt !== null &&
    Math.abs(at - Date.parse(thread.lastAt)) <= WINDOW_MS
  );
  const candidates = matches.map((thread) => thread.id);
  return { join: candidates.length === 1 ? candidates[0]! : null, candidates };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/thread-match.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/lib/thread-match.ts apps/professional/tests/unit/thread-match.test.ts
git commit -m "feat(professional): thread auto-join rule

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: A block page component on the Tasks engine

**Files:**
- Modify: `apps/professional/src/types/tasks-engine.d.ts`
- Create: `apps/professional/src/components/block-page.ts`, `apps/professional/src/styles/block-page.css`
- Modify: `apps/professional/src/app/main.ts` (CSS imports)
- Test: `apps/professional/tests/unit/block-page.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountBlockPage } from '@/components/block-page';

describe('mountBlockPage', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('shows the round + and saves inserted blocks after a pause', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const page = mountBlockPage(host, { blocks: [], onSave, debounceMs: 400 });
    host.querySelector<HTMLButtonElement>('.page-editor__add-btn')!.click();
    host.querySelector<HTMLButtonElement>('[data-block-type="rich_text"]')!.click();
    expect(onSave).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as Array<{ block_type: string }>;
    expect(saved.map((block) => block.block_type)).toEqual(['rich_text']);
    page.dispose();
  });

  it('flush saves at once', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const onSave = vi.fn().mockResolvedValue(undefined);
    const page = mountBlockPage(host, { blocks: [], onSave, debounceMs: 400 });
    host.querySelector<HTMLButtonElement>('.page-editor__add-btn')!.click();
    host.querySelector<HTMLButtonElement>('[data-block-type="heading"]')!.click();
    await page.flush();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/professional && npx vitest run tests/unit/block-page.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend the facade** (append to `src/types/tasks-engine.d.ts`)

```ts
export type Block = { id: string; block_type: string; content?: unknown; [key: string]: unknown };

export type BlockCanvasHandle = {
  update(blocks: Block[]): void;
  insertType(type: InsertMenuValue): void;
  dispose(): void;
};

export function mountBlockCanvas(
  host: HTMLElement,
  options: { blocks: Block[]; onChange: (blocks: Block[]) => void; idFactory: () => string; editable?: boolean }
): BlockCanvasHandle;

export function nextBlockIdFactory(prefix: string, blocks: Block[]): () => string;
```

`@tasks/*` maps every path to this one file for TypeScript. So `@tasks/teacher/lesson-canvas/mount-page` and `@tasks/teacher/lesson-canvas/drop` both type-check against these declarations.

- [ ] **Step 4: Implement** `components/block-page.ts`

```ts
import { mountBlockCanvas, nextBlockIdFactory, type Block } from '@tasks/teacher/lesson-canvas/mount-page';
import { mountBlockInsert } from '@tasks/views/block-insert';

export type BlockPageHandle = {
  flush(): Promise<void>;
  current(): Block[];
  dispose(): void;
};

/**
 * The Tasks block page (canvas + round "+"), saving through `onSave` after a
 * pause. Professional pages (comms, meetings, events) all use this, so they
 * edit exactly like Tasks and Lessons.
 */
export function mountBlockPage(
  host: HTMLElement,
  options: { blocks: Block[]; onSave: (blocks: Block[]) => Promise<void>; debounceMs?: number; editable?: boolean }
): BlockPageHandle {
  const debounceMs = options.debounceMs ?? 800;
  let blocks = options.blocks;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const layout = document.createElement('div');
  layout.className = 'block-page';
  const canvasHost = document.createElement('div');
  canvasHost.className = 'block-page__canvas';
  const add = document.createElement('div');
  add.className = 'page-editor__add';
  layout.append(canvasHost, add);
  host.append(layout);

  async function save(): Promise<void> {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    dirty = false;
    await options.onSave(blocks);
  }

  const canvas = mountBlockCanvas(canvasHost, {
    blocks,
    idFactory: nextBlockIdFactory('block', blocks),
    editable: options.editable !== false,
    onChange: (next) => {
      blocks = next;
      dirty = true;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void save(), debounceMs);
    }
  });
  const insert = options.editable === false ? null : mountBlockInsert(add, { onInsert: (type) => canvas.insertType(type) });

  return {
    flush: save,
    current: () => blocks,
    dispose() {
      if (timer !== null) clearTimeout(timer);
      insert?.dispose();
      canvas.dispose();
      layout.remove();
    }
  };
}
```

`nextBlockIdFactory` lives in `teacher/lesson-canvas/drop`, not `mount-page`. Import it from there if Vite reports it missing:

```ts
import { nextBlockIdFactory } from '@tasks/teacher/lesson-canvas/drop';
```

Both paths type-check against the one facade file.

- [ ] **Step 5: Styles**

`apps/professional/src/styles/block-page.css`. Copy the rules for `.page-editor__add`, `.page-editor__add-btn` (including `:hover` and `:focus-visible`), `.page-editor__insert`, `.page-editor__insert-family` and `.page-editor__insert-label` exactly from `apps/tasks/src/styles/cards.css` (lines 960–1030; find them with `grep -n "page-editor__" apps/tasks/src/styles/cards.css`). Put this comment at the top:

```css
/* Copied from apps/tasks/src/styles/cards.css (page-editor "+" and palette).
   Keep in step with that file; Professional doesn't import all of cards.css. */
.block-page{display:grid;gap:var(--space-3)}
```

In `apps/professional/src/app/main.ts`, add these after the existing CSS imports:

```ts
import '../../../tasks/src/styles/lesson-engine.css';
import '../styles/block-page.css';
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/block-page.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Check Tasks CSS doesn't restyle Professional**

Run `npm run build:professional` and start Professional (`cd apps/professional && npx vite`). Open People and Home: nothing should look different. If `lesson-engine.css` changes shared classes (`.btn`, `.card`), wrap its import in a cascade layer: create `src/styles/tasks-engine.css` containing `@import url('../../../tasks/src/styles/lesson-engine.css') layer(tasks-engine);`, and import that file instead.

- [ ] **Step 8: Commit**

```bash
git add apps/professional/src/types/tasks-engine.d.ts apps/professional/src/components/block-page.ts apps/professional/src/styles/block-page.css apps/professional/src/app/main.ts apps/professional/tests/unit/block-page.test.ts
git commit -m "feat(professional): block page on the Tasks engine

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: The comm page

Replaces `renderCommunicationDetailView` as the `#/communication/<id>` view. The existing view's follow-up section (Plan 1's auto-retry) moves into the After face unchanged.

**Files:**
- Create: `apps/professional/src/views/comm-page.ts`, `apps/professional/src/styles/comm-page.css`
- Modify: `apps/professional/src/app/main.ts` (communication branch), `apps/professional/src/views/communications.ts` (export the follow-up section)
- Test: `apps/professional/tests/unit/comm-page.test.ts`

**What the page reads:**
- `getCommunication(id)`: the record.
- `listUniversalLinksForEntity(commRef)`:
  - People: `recipient` links are "With", and `about_person` links are "Also concerned, not here".
  - Thread: the `in_thread` link.
- `listUniversalLinksForEntity(threadRef)`: incoming `in_thread` members. The previous one is the latest member before this record.
- `listLedgerForSources([commRef, previousRef])`: carried and new promises.

- [ ] **Step 1: Split the follow-up section out of `communications.ts`**

Move the code that builds the `followUp` section in `renderCommunicationDetailView` (from `const followUp = el('section', ...)` to where it's appended) into this exported function in the same file:

```ts
export function buildFollowUpSection(
  record: CommunicationRecord,
  paint: (next: CommunicationRecord) => void,
  load: () => Promise<void>
): HTMLElement
```

It returns `followUp`, and `renderCommunicationDetailView` calls it. Behaviour is unchanged. Run `npx vitest run tests/unit/communications.test.ts`: it should pass.

- [ ] **Step 2: Write the failing view tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const COMM_ID = 'communication_00000000-0000-4000-8000-000000000001';
const COMM_REF = `professional:communication:${COMM_ID}`;
const PREV_REF = 'professional:communication:communication_00000000-0000-4000-8000-000000000000';
const THREAD_REF = 'professional:thread:thread_00000000-0000-4000-8000-000000000001';

const record = {
  schema_version: 2, id: COMM_ID, direction: 'outbound', channel: 'in_person',
  occurred_at: '2026-10-14T00:50:00.000Z', subject: 'Declan J. · essay feedback', summary: '',
  status: 'completed', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z',
  scheduled_start: '2026-10-14T00:50:00.000Z', scheduled_end: '2026-10-14T01:05:00.000Z',
  time_zone: 'Australia/Sydney', purpose_tag: 'feedback', agenda: [], blocks: []
};

vi.mock('@/api/communications', () => ({
  getCommunication: vi.fn(async () => ({ communication: record })),
  updateCommunication: vi.fn(async (_id: string, patch: object) => ({ communication: { ...record, ...patch } })),
  retryFollowUpTask: vi.fn(),
  createFollowUpTask: vi.fn(),
  isFollowUpIncompleteError: () => false
}));
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async (ref: string) => {
    if (ref === COMM_REF) {
      return {
        outgoing: [
          { link: { id: 'l1', source_ref: COMM_REF, target_ref: 'shared:person:p_declan', relationship_type: 'recipient', status: 'current' },
            endpoint: { ref: 'shared:person:p_declan', kind: 'person', display_label: 'Declan J.', href: null }, direction: 'outgoing' },
          { link: { id: 'l2', source_ref: COMM_REF, target_ref: 'shared:person:p_denielle', relationship_type: 'about_person', status: 'current' },
            endpoint: { ref: 'shared:person:p_denielle', kind: 'person', display_label: 'Denielle J.', href: null }, direction: 'outgoing' },
          { link: { id: 'l3', source_ref: COMM_REF, target_ref: THREAD_REF, relationship_type: 'in_thread', status: 'current' },
            endpoint: { ref: THREAD_REF, kind: 'thread', display_label: 'Declan J. · study approach', href: null }, direction: 'outgoing' }
        ],
        incoming: []
      };
    }
    return {
      outgoing: [],
      incoming: [
        { link: { id: 'm0', source_ref: PREV_REF, target_ref: THREAD_REF, relationship_type: 'in_thread', status: 'current', created_at: '2026-09-25T02:00:00.000Z' },
          endpoint: { ref: PREV_REF, kind: 'communication', display_label: 'Declan · quote bank', href: null }, direction: 'incoming' },
        { link: { id: 'm1', source_ref: COMM_REF, target_ref: THREAD_REF, relationship_type: 'in_thread', status: 'current', created_at: '2026-10-01T00:00:00.000Z' },
          endpoint: { ref: COMM_REF, kind: 'communication', display_label: 'Declan J. · essay feedback', href: null }, direction: 'incoming' }
      ]
    };
  }),
  createUniversalLink: vi.fn(async () => ({ link: { id: 'link_new' }, created: true })),
  endUniversalLink: vi.fn(async () => ({})),
  createTask: vi.fn(async () => ({ id: 'task_1', title: 'x' }))
}));
vi.mock('@/api/ledger', () => ({
  listLedgerForSources: vi.fn(async () => ({
    items: [
      { id: 'ledger_1', person_ref: 'shared:person:p_declan', direction: 'you_owe', text: 'Send Declan the quote bank', comm_ref: PREV_REF, status: 'open', due: null, task_ref: null, checked_in_ref: null },
      { id: 'ledger_2', person_ref: 'shared:person:p_declan', direction: 'they_owe', text: 'Redraft paragraph 2', comm_ref: PREV_REF, status: 'open', due: null, task_ref: null, checked_in_ref: null },
      { id: 'ledger_3', person_ref: 'shared:person:p_denielle', direction: 'you_owe', text: 'Email Denielle the summary', comm_ref: COMM_REF, status: 'open', due: null, task_ref: null, checked_in_ref: null },
      { id: 'ledger_4', person_ref: 'shared:person:p_declan', direction: 'they_owe', text: 'Rewrite the fence paragraph', comm_ref: COMM_REF, status: 'open', due: null, task_ref: null, checked_in_ref: null }
    ]
  })),
  createLedgerItem: vi.fn(async (body: object) => ({ item: { id: 'ledger_new', status: 'open', ...body }, created: true })),
  patchLedger: vi.fn(async (id: string, patch: object) => ({ item: { id, ...patch } }))
}));
vi.mock('@/api/threads', () => ({ listThreads: vi.fn(async () => ({ threads: [] })) }));
vi.mock('@/components/block-page', () => ({
  mountBlockPage: vi.fn((host: HTMLElement) => {
    host.append(Object.assign(document.createElement('div'), { className: 'block-page-stub' }));
    return { flush: async () => {}, current: () => [], dispose: () => {} };
  })
}));

import { renderCommPage } from '@/views/comm-page';
import { patchLedger } from '@/api/ledger';

describe('comm page', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-14T00:40:00.000Z') }));
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  async function render() {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderCommPage(canvas, COMM_ID, { isCurrent: () => true, onTitleReady: () => {} });
    return canvas;
  }

  it('opens in Before with carried promises, people and the thread', async () => {
    const canvas = await render();
    expect(canvas.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('before');
    expect(canvas.textContent).toContain('Send Declan the quote bank');
    expect(canvas.textContent).toContain('Denielle J.');
    expect(canvas.textContent).toContain('Declan J. · study approach');
    expect(canvas.querySelector('[data-part="carried"] [data-owner="you"]')).not.toBeNull();
  });

  it('ticking a carried promise marks it done and checked in here', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-ledger-id="ledger_1"]')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(patchLedger).toHaveBeenCalledWith('ledger_1', { status: 'done', checked_in_ref: COMM_REF });
  });

  it('switches to During at the start time and shows the block page', async () => {
    const canvas = await render();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(canvas.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('during');
    expect(canvas.querySelector('.block-page-stub')).not.toBeNull();
  });

  it('manual switch to After shows the promise ledger with Task switches for yours', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-set-phase="after"]')!.click();
    expect(canvas.querySelector('[data-part="ledger"]')).not.toBeNull();
    expect(canvas.querySelectorAll('[data-part="ledger"] [role="switch"]').length).toBe(1);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/comm-page.test.ts`
Expected: FAIL, because `@/views/comm-page` is missing.

- [ ] **Step 4: Implement** `views/comm-page.ts`

```ts
import { getCommunication, updateCommunication } from '@/api/communications';
import { createTask, createUniversalLink, listUniversalLinksForEntity, type UniversalLinkEntry } from '@/api/universal-links';
import { createLedgerItem, listLedgerForSources, patchLedger } from '@/api/ledger';
import { mountBlockPage, type BlockPageHandle } from '@/components/block-page';
import { buildFollowUpSection } from '@/views/communications';
import { nextSwitchDelayMs, phaseFor, type CommPhase } from '@/lib/comm-phase';
import { blockPlainText, extractInlinePromises, resolvePromiseOwner, type PersonOnPage } from '@/lib/inline-promises';
import { threadRoute } from '@/app/router';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { AgendaItem, CommunicationRecord, LedgerItem } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const CHANNEL_LABEL: Record<string, string> = {
  in_person: 'in person', email: 'email', phone: 'call', message: 'text', video: 'video', other: 'other'
};

type PageData = {
  record: CommunicationRecord;
  commRef: string;
  withPeople: PersonOnPage[];
  alsoConcerned: PersonOnPage[];
  thread: { ref: string; label: string; id: string } | null;
  previousRef: string | null;
  memberCount: number;
  ledger: LedgerItem[];
};

function personFrom(entry: UniversalLinkEntry): PersonOnPage {
  return { ref: entry.endpoint.ref, name: entry.endpoint.display_label };
}

async function loadPage(id: string): Promise<PageData> {
  const { communication: record } = await getCommunication(id);
  const commRef = `professional:communication:${id}`;
  const links = await listUniversalLinksForEntity(commRef);
  const current = links.outgoing.filter((entry) => entry.link.status === 'current');
  const withPeople = current.filter((entry) => entry.link.relationship_type === 'recipient').map(personFrom);
  const alsoConcerned = current.filter((entry) => entry.link.relationship_type === 'about_person').map(personFrom);
  const threadEntry = current.find((entry) => entry.link.relationship_type === 'in_thread') ?? null;

  let previousRef: string | null = null;
  let memberCount = 0;
  if (threadEntry) {
    const members = (await listUniversalLinksForEntity(threadEntry.endpoint.ref)).incoming
      .filter((entry) => entry.link.relationship_type === 'in_thread' && entry.link.status === 'current');
    memberCount = members.length;
    const ordered = members
      .map((entry) => ({ ref: entry.link.source_ref, at: String((entry.link as { created_at?: string }).created_at ?? '') }))
      .sort((a, b) => a.at.localeCompare(b.at));
    const index = ordered.findIndex((member) => member.ref === commRef);
    previousRef = index > 0 ? ordered[index - 1]!.ref : null;
  }
  const refs = previousRef ? [commRef, previousRef] : [commRef];
  const { items: ledger } = await listLedgerForSources(refs);
  const thread = threadEntry
    ? { ref: threadEntry.endpoint.ref, label: threadEntry.endpoint.display_label, id: threadEntry.endpoint.ref.split(':').pop()! }
    : null;
  return { record, commRef, withPeople, alsoConcerned, thread, previousRef, memberCount, ledger };
}

export async function renderCommPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void }
): Promise<void> {
  showViewLoading(canvas, 'Loading…');
  let data: PageData;
  try {
    data = await loadPage(id);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderCommPage(canvas, id, options));
    return;
  }
  if (!options.isCurrent()) return;
  options.onTitleReady(data.record.subject || 'Comm');

  let phase: CommPhase = phaseFor(data.record, new Date());
  let manual = false;
  let clock: ReturnType<typeof setTimeout> | null = null;
  let blockPage: BlockPageHandle | null = null;

  const root = el('div', 'comm-page');
  const head = el('header', 'comm-page__head');
  const chips = el('div', 'comm-page__chips');
  chips.append(el('span', 'chip chip--comm', `● Comm · ${CHANNEL_LABEL[data.record.channel] ?? data.record.channel}`));
  if (data.record.purpose_tag) chips.append(el('span', 'chip', data.record.purpose_tag));
  const when = el('p', 'comm-page__when', whenLabel(data.record));
  const switcher = el('div', 'comm-page__phase');
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'Page phase');
  const note = el('p', 'comm-page__phase-note');
  for (const value of ['before', 'during', 'after'] as const) {
    const button = el('button', 'comm-page__phase-btn', value[0]!.toUpperCase() + value.slice(1)) as HTMLButtonElement;
    button.type = 'button';
    button.dataset.setPhase = value;
    button.addEventListener('click', () => {
      manual = true;
      setPhase(value);
    });
    switcher.append(button);
  }
  head.append(chips, when, switcher, note);

  const threadStrip = el('p', 'comm-page__thread');
  if (data.thread) {
    const link = el('a', undefined, data.thread.label) as HTMLAnchorElement;
    link.href = threadRoute(data.thread.id);
    threadStrip.append(el('span', 'eyebrow', 'Thread'), link, el('span', 'muted', ` · ${data.memberCount} in thread`));
  } else {
    threadStrip.hidden = true;
  }

  const main = el('div', 'comm-page__main');
  const rail = buildPeopleRail(data);
  const grid = el('div', 'comm-page__grid');
  grid.append(main, rail);
  root.append(head, threadStrip, grid);
  canvas.replaceChildren(root);

  function setPhase(next: CommPhase): void {
    phase = next;
    root.dataset.phase = next;
    for (const button of switcher.querySelectorAll<HTMLButtonElement>('[data-set-phase]')) {
      button.setAttribute('aria-pressed', String(button.dataset.setPhase === next));
    }
    note.textContent = manual ? 'Switched by hand' : autoNote(data.record, next);
    void blockPage?.flush();
    blockPage?.dispose();
    blockPage = null;
    main.replaceChildren();
    if (next === 'before') paintBefore();
    else if (next === 'during') paintDuring();
    else paintAfter();
  }

  function scheduleClock(): void {
    if (clock !== null) clearTimeout(clock);
    const delay = nextSwitchDelayMs(data.record, new Date());
    if (delay === null) return;
    clock = setTimeout(() => {
      if (!root.isConnected) return;
      if (!manual) setPhase(phaseFor(data.record, new Date()));
      scheduleClock();
    }, delay);
  }

  function carriedCard(): HTMLElement {
    const card = el('section', 'card comm-page__carried');
    card.dataset.part = 'carried';
    card.append(el('h3', undefined, 'Carried from last time'));
    const carried = data.ledger.filter((item) => item.comm_ref === data.previousRef);
    if (!carried.length) card.append(el('p', 'muted', 'Nothing carried.'));
    for (const item of carried) card.append(tickRow(item));
    return card;
  }

  function tickRow(item: LedgerItem): HTMLElement {
    const row = el('button', `tick${item.status === 'done' ? ' is-done' : ''}`) as HTMLButtonElement;
    row.type = 'button';
    row.dataset.ledgerId = item.id;
    row.dataset.owner = item.direction === 'you_owe' ? 'you' : 'them';
    row.append(el('span', 'tick__box', item.status === 'done' ? '✓' : ''), el('span', 'tick__text', item.text),
      el('span', `who-tag ${item.direction === 'you_owe' ? 'who-me' : 'who-them'}`, item.direction === 'you_owe' ? 'You' : 'Them'));
    row.addEventListener('click', async () => {
      const done = item.status !== 'done';
      const { item: next } = await patchLedger(item.id, done ? { status: 'done', checked_in_ref: data.commRef } : { status: 'open', checked_in_ref: null });
      Object.assign(item, next);
      row.classList.toggle('is-done', done);
      row.querySelector('.tick__box')!.textContent = done ? '✓' : '';
    });
    return row;
  }

  function agendaCard(): HTMLElement {
    const card = el('section', 'card comm-page__agenda');
    card.append(el('h3', undefined, 'Agenda'));
    const list = el('ol', 'agenda');
    const render = () => {
      list.replaceChildren();
      for (const item of data.record.agenda ?? []) {
        const li = el('li', `agenda__item${item.done ? ' is-done' : ''}`, item.text);
        li.append(el('span', 'agenda__from', item.source));
        list.append(li);
      }
    };
    const input = el('input', 'agenda__add') as HTMLInputElement;
    input.placeholder = 'Add an item…';
    input.setAttribute('aria-label', 'Add agenda item');
    input.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter' || !input.value.trim()) return;
      const agenda: AgendaItem[] = [...(data.record.agenda ?? []), { id: `ag_${Date.now()}`, text: input.value.trim(), source: 'you' }];
      input.value = '';
      data.record = (await updateCommunication(data.record.id, { agenda })).communication;
      render();
    });
    render();
    card.append(list, input);
    return card;
  }

  function paintBefore(): void {
    main.append(carriedCard(), agendaCard());
  }

  function paintDuring(): void {
    const strip = el('div', 'live-strip');
    const end = el('button', 'btn btn--ghost', 'End ›') as HTMLButtonElement;
    end.type = 'button';
    end.addEventListener('click', async () => {
      const nowIso = new Date().toISOString();
      data.record = (await updateCommunication(data.record.id, {
        scheduled_start: data.record.scheduled_start ?? nowIso,
        scheduled_end: nowIso,
        time_zone: data.record.time_zone ?? 'Australia/Sydney'
      })).communication;
      manual = false;
      setPhase('after');
    });
    strip.append(el('span', 'live-strip__rec', 'Live'), end);
    const body = el('div', 'comm-page__body');
    main.append(strip, body);
    blockPage = mountBlockPage(body, {
      blocks: (data.record.blocks ?? []) as never[],
      onSave: async (blocks) => {
        data.record = (await updateCommunication(data.record.id, { blocks })).communication;
        await syncInlinePromises(blocks);
      }
    });
  }

  async function syncInlinePromises(blocks: unknown[]): Promise<void> {
    const people = [...data.withPeople, ...data.alsoConcerned];
    for (const promise of extractInlinePromises(blockPlainText(blocks))) {
      const owner = resolvePromiseOwner(promise.owner, people);
      if (!owner) continue;
      // The ledger dedupes by person + direction + text + source, so re-saving never duplicates.
      const { item, created } = await createLedgerItem({ ...owner, text: promise.text, comm_ref: data.commRef });
      if (created) data.ledger.push(item);
    }
  }

  function paintAfter(): void {
    const summary = el('section', 'card comm-page__summary');
    summary.append(el('h3', undefined, 'Summary'));
    const text = el('textarea', 'comm-page__summary-text') as HTMLTextAreaElement;
    text.value = data.record.summary;
    text.setAttribute('aria-label', 'Summary');
    text.addEventListener('change', async () => {
      data.record = (await updateCommunication(data.record.id, { summary: text.value })).communication;
    });
    summary.append(text);

    const ledger = el('section', 'card comm-page__ledger');
    ledger.dataset.part = 'ledger';
    ledger.append(el('h3', undefined, 'Promise ledger'));
    const cols = el('div', 'ledger');
    const mine = el('div', 'ledger__col');
    const theirs = el('div', 'ledger__col');
    mine.append(el('p', 'ledger__head is-me', 'I owe'));
    theirs.append(el('p', 'ledger__head is-them', 'They owe · checked next time'));
    for (const item of data.ledger.filter((entry) => entry.comm_ref === data.commRef && entry.status === 'open')) {
      const row = el('div', 'ledger__row', item.text);
      if (item.direction === 'you_owe') {
        const toggle = el('button', 'switch') as HTMLButtonElement;
        toggle.type = 'button';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-label', 'Make task');
        toggle.setAttribute('aria-checked', String(Boolean(item.task_ref)));
        toggle.disabled = Boolean(item.task_ref);
        toggle.addEventListener('click', async () => {
          toggle.disabled = true;
          const task = await createTask({ title: item.text });
          const { item: next } = await patchLedger(item.id, { task_ref: `tasks:task:${task.id}` });
          Object.assign(item, next);
          toggle.setAttribute('aria-checked', 'true');
        });
        row.append(toggle);
        mine.append(row);
      } else {
        theirs.append(row);
      }
    }
    cols.append(mine, theirs);
    ledger.append(cols);
    const follow = buildFollowUpSection(data.record, (next) => { data.record = next; }, async () => {
      await renderCommPage(canvas, id, options);
    });
    main.append(summary, ledger, follow);
  }

  function buildPeopleRail(page: PageData): HTMLElement {
    const aside = el('aside', 'comm-page__rail');
    const card = el('section', 'card');
    card.append(el('h3', undefined, 'With'));
    for (const person of page.withPeople) card.append(el('div', 'pcard', person.name));
    for (const person of page.alsoConcerned) {
      const row = el('div', 'pcard is-ghost', person.name);
      row.append(el('span', 'pcard__role', 'Also concerned, not here'));
      card.append(row);
    }
    if (!page.withPeople.length && !page.alsoConcerned.length) card.append(el('p', 'muted', 'No people linked yet.'));
    aside.append(card);
    return aside;
  }

  setPhase(phase);
  scheduleClock();
}

function whenLabel(record: CommunicationRecord): string {
  const zone = record.time_zone ?? 'Australia/Sydney';
  const start = record.scheduled_start ?? record.occurred_at;
  const fmt = new Intl.DateTimeFormat('en-AU', { timeZone: zone, weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit', hour: 'numeric', minute: '2-digit' });
  const startText = fmt.format(new Date(start));
  if (!record.scheduled_end) return startText;
  const endText = new Intl.DateTimeFormat('en-AU', { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(new Date(record.scheduled_end));
  return `${startText} – ${endText}`;
}

function autoNote(record: CommunicationRecord, phase: CommPhase): string {
  if (!record.scheduled_start) return 'Logged';
  if (phase === 'before') return 'Switches to During by itself at the start time';
  if (phase === 'during') return 'Switches to After by itself at the end, or when you tap End';
  return 'Wrap-up';
}
```

Check against the codebase:
- `UniversalLinkEntry`'s link type may not declare `created_at`. The cast above reads it if the API sends it. If it doesn't, confirm with `grep -n "created_at" netlify/functions/_shared/universal-link-schema.mjs`. Then either add `created_at` to `UniversalLinkRecord` in `api/universal-links.ts` (if the projection has it), or order members by `valid_from`.
- Dates are shown as `dd/mm/yy` through `Intl` en-AU parts, never `YYYY-MM-DD`.

- [ ] **Step 5: Styles** `apps/professional/src/styles/comm-page.css`

Build this from the mockup's `.phase`, `.tick`, `.who-tag`, `.agenda`, `.live-strip`, `.ledger`, `.pr`, `.switch` and `.pcard` rules (`docs/professional-hub/calendar/mockups/index.html`, `<style>` block). Rename them to the classes used above, and use only design-kit tokens (`var(--…)`), never hex values. Add this to lay out the page:

```css
.comm-page{display:grid;gap:var(--space-5)}
.comm-page__grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:var(--space-5);align-items:start}
@media (max-width:900px){.comm-page__grid{grid-template-columns:1fr}}
.comm-page[data-phase="during"] .comm-page__phase-btn[aria-pressed="true"]{background:var(--high-sea);color:var(--paper)}
```

Import it in `main.ts` next to `block-page.css`.

- [ ] **Step 6: Route `#/communication/<id>` to the new page** (`main.ts` `communication` branch)

```ts
    if (route.name === 'communication') {
      renderPageHeader(shell, { eyebrow: 'Calendar · Comm', title: 'Loading…' });
      await renderCommPage(shell.canvas, route.id, {
        onTitleReady: (title) => {
          if (generation !== routeGeneration) return;
          renderPageHeader(shell, { eyebrow: 'Calendar · Comm', title });
        },
        isCurrent: () => generation === routeGeneration
      });
      return;
    }
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/comm-page.test.ts tests/unit/communications.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/professional/src/views/comm-page.ts apps/professional/src/views/communications.ts apps/professional/src/styles/comm-page.css apps/professional/src/app/main.ts apps/professional/tests/unit/comm-page.test.ts
git commit -m "feat(professional): comm page with Before, During and After

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Thread auto-join on the comm page

**Files:**
- Modify: `apps/professional/src/views/comm-page.ts`
- Test: `apps/professional/tests/unit/comm-page.test.ts` (append)

- [ ] **Step 1: Write the failing test**

```ts
it('joins the single matching thread and says so, with Undo', async () => {
  const links = await import('@/api/universal-links');
  const threads = await import('@/api/threads');
  // This comm has people but no thread yet.
  (links.listUniversalLinksForEntity as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
    outgoing: [
      { link: { id: 'l1', source_ref: COMM_REF, target_ref: 'shared:person:p_declan', relationship_type: 'recipient', status: 'current' },
        endpoint: { ref: 'shared:person:p_declan', kind: 'person', display_label: 'Declan J.', href: null }, direction: 'outgoing' }
    ],
    incoming: []
  }));
  (threads.listThreads as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ threads: [
    { id: 'thread_00000000-0000-4000-8000-000000000001', kind: 'general', title: 'Declan J. · study approach', purpose_tag: 'feedback', goals: [], status: 'open', schema_version: 1, created_at: '', updated_at: '2026-09-25T02:00:00.000Z' }
  ] });
  const canvas = await render();
  await vi.advanceTimersByTimeAsync(0);
  expect(links.createUniversalLink).toHaveBeenCalledWith(expect.objectContaining({
    source_ref: COMM_REF, target_ref: THREAD_REF, relationship_type: 'in_thread'
  }));
  expect(canvas.textContent).toContain('Added to Declan J. · study approach');
  expect(canvas.querySelector('[data-part="thread-undo"]')).not.toBeNull();
});
```

The thread's people come from its latest member's `recipient` links. The mocked `listUniversalLinksForEntity` returns the thread members first, and then `p_declan` for the member, from the default mock above. Check `lastAt` against the thread's `updated_at`.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/professional && npx vitest run tests/unit/comm-page.test.ts`
Expected: FAIL, because no link is created.

- [ ] **Step 3: Implement**

Add these imports to `comm-page.ts`:

```ts
import { listThreads } from '@/api/threads';
import { pickThreadForComm, type ThreadCandidate } from '@/lib/thread-match';
import { endUniversalLink } from '@/api/universal-links';
```

Add this function:

```ts
async function autoJoinThread(data: PageData): Promise<{ threadRef: string; label: string; linkId: string } | null> {
  if (data.thread || !data.record.purpose_tag) return null;
  const personRefs = [...data.withPeople, ...data.alsoConcerned].map((person) => person.ref);
  if (!personRefs.length) return null;
  const { threads } = await listThreads();
  const candidates: ThreadCandidate[] = [];
  for (const thread of threads.filter((entry) => entry.status === 'open' && entry.purpose_tag === data.record.purpose_tag)) {
    const threadRef = `professional:thread:${thread.id}`;
    const members = (await listUniversalLinksForEntity(threadRef)).incoming.filter((entry) => entry.link.relationship_type === 'in_thread');
    const latest = members.at(-1);
    const people = latest
      ? (await listUniversalLinksForEntity(latest.link.source_ref)).outgoing
          .filter((entry) => ['recipient', 'about_person'].includes(entry.link.relationship_type))
          .map((entry) => entry.endpoint.ref)
      : [];
    candidates.push({ id: thread.id, status: thread.status, purpose_tag: thread.purpose_tag, personRefs: people, lastAt: thread.updated_at });
  }
  const pick = pickThreadForComm({ personRefs, purposeTag: data.record.purpose_tag, at: data.record.scheduled_start ?? data.record.occurred_at }, candidates);
  if (!pick.join) return null;
  const threadRef = `professional:thread:${pick.join}`;
  const { link } = await createUniversalLink({ source_ref: data.commRef, target_ref: threadRef, relationship_type: 'in_thread' });
  const label = threads.find((thread) => thread.id === pick.join)!.title;
  return { threadRef, label, linkId: link.id };
}
```

In `renderCommPage`, after `canvas.replaceChildren(root);`, add this:

```ts
  void autoJoinThread(data).then((joined) => {
    if (!joined || !root.isConnected) return;
    threadStrip.hidden = false;
    threadStrip.replaceChildren(el('span', 'eyebrow', 'Thread'), el('span', undefined, `Added to ${joined.label}`));
    const undo = el('button', 'btn btn--ghost', 'Undo') as HTMLButtonElement;
    undo.type = 'button';
    undo.dataset.part = 'thread-undo';
    undo.addEventListener('click', async () => {
      await endUniversalLink(joined.linkId);
      threadStrip.hidden = true;
    });
    threadStrip.append(undo);
  });
```

Check `endUniversalLink`'s parameters with `sed -n 54,68p apps/professional/src/api/universal-links.ts`, and pass what it needs. (The Task 17 mock already includes `endUniversalLink`.)

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/comm-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/views/comm-page.ts apps/professional/tests/unit/comm-page.test.ts
git commit -m "feat(professional): comms join their thread by themselves, with Undo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: Thread and case page, with a copyable case summary

**Files:**
- Create: `apps/professional/src/lib/case-summary.ts`, `apps/professional/src/views/thread-page.ts`, `apps/professional/src/styles/thread-page.css`
- Modify: `apps/professional/src/app/main.ts` (thread route)
- Test: `apps/professional/tests/unit/case-summary.test.ts`, `apps/professional/tests/unit/thread-page.test.ts`

- [ ] **Step 1: Write the failing summary test**

```ts
import { describe, expect, it } from 'vitest';
import { caseSummaryText } from '@/lib/case-summary';

describe('caseSummaryText', () => {
  it('writes goals, sessions and open promises as plain text', () => {
    const text = caseSummaryText({
      title: 'Fletcher W. · case management',
      goals: [{ id: 'g1', text: 'Maths C → B', progress: 62, note: '31/50' }],
      sessions: [
        { label: 'Session 7 · fillable bar', at: '2026-09-22T22:40:00.000Z', summary: 'Fillable bar introduced.' },
        { label: 'Session 6', at: '2026-09-08T22:40:00.000Z', summary: '' }
      ],
      open: [{ text: 'Check in with Ms D’Souza', direction: 'you_owe' }, { text: '2 hrs maths on the bar', direction: 'they_owe' }],
      kept: 19,
      made: 24
    });
    expect(text).toBe([
      'Fletcher W. · case management',
      '',
      'Goals',
      '- Maths C → B: 62% (31/50)',
      '',
      'Sessions (newest first)',
      '- 23/09/26 Session 7 · fillable bar: Fillable bar introduced.',
      '- 09/09/26 Session 6',
      '',
      'Open promises',
      '- Mr Russell: Check in with Ms D’Souza',
      '- Student/family: 2 hrs maths on the bar',
      '',
      'Promises kept: 19 of 24'
    ].join('\n'));
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/professional && npx vitest run tests/unit/case-summary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `lib/case-summary.ts`

```ts
import type { ThreadGoal } from '@/domain/types';

function ddmmyy(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: '2-digit', month: '2-digit', year: '2-digit' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')}`;
}

/** Plain text for pasting into an email to Learning Support or a parent. */
export function caseSummaryText(input: {
  title: string;
  goals: ThreadGoal[];
  sessions: Array<{ label: string; at: string; summary: string }>;
  open: Array<{ text: string; direction: 'you_owe' | 'they_owe' }>;
  kept: number;
  made: number;
}): string {
  const lines = [input.title, '', 'Goals'];
  for (const goal of input.goals) {
    const progress = goal.progress === null ? '' : `: ${goal.progress}%`;
    lines.push(`- ${goal.text}${progress}${goal.note ? ` (${goal.note})` : ''}`);
  }
  lines.push('', 'Sessions (newest first)');
  for (const session of input.sessions) {
    lines.push(`- ${ddmmyy(session.at)} ${session.label}${session.summary ? `: ${session.summary}` : ''}`);
  }
  lines.push('', 'Open promises');
  for (const promise of input.open) {
    lines.push(`- ${promise.direction === 'you_owe' ? 'Mr Russell' : 'Student/family'}: ${promise.text}`);
  }
  lines.push('', `Promises kept: ${input.kept} of ${input.made}`);
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the summary test and confirm it passes**

Run: `cd apps/professional && npx vitest run tests/unit/case-summary.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing page test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const THREAD_ID = 'thread_00000000-0000-4000-8000-000000000001';
const THREAD_REF = `professional:thread:${THREAD_ID}`;
const S7 = 'professional:communication:communication_00000000-0000-4000-8000-000000000007';

vi.mock('@/api/threads', () => ({
  getThread: vi.fn(async () => ({ thread: {
    schema_version: 1, id: THREAD_ID, kind: 'case', title: 'Fletcher W. · case management', purpose_tag: 'case management',
    goals: [{ id: 'g1', text: 'Maths C → B', progress: 62, note: '31/50' }], status: 'open', created_at: '', updated_at: ''
  } })),
  patchThread: vi.fn(async (_id: string, patch: object) => ({ thread: { id: THREAD_ID, kind: 'case', goals: [], ...patch } }))
}));
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async (ref: string) => ref === THREAD_REF
    ? { outgoing: [], incoming: [
        { link: { id: 'm7', source_ref: S7, target_ref: THREAD_REF, relationship_type: 'in_thread', status: 'current', created_at: '2026-09-22T22:40:00.000Z' },
          endpoint: { ref: S7, kind: 'communication', display_label: 'Session 7 · fillable bar', href: '/professional/#/communication/communication_00000000-0000-4000-8000-000000000007' }, direction: 'incoming' }
      ] }
    : { outgoing: [
        { link: { id: 'p', source_ref: S7, target_ref: 'shared:person:p_fletcher', relationship_type: 'recipient', status: 'current' },
          endpoint: { ref: 'shared:person:p_fletcher', kind: 'person', display_label: 'Fletcher W.', href: null }, direction: 'outgoing' }
      ], incoming: [] })
}));
vi.mock('@/api/ledger', () => ({
  listLedgerForSources: vi.fn(async () => ({ items: [
    { id: 'a', direction: 'they_owe', text: '2 hrs maths on the bar', status: 'open', comm_ref: S7 },
    { id: 'b', direction: 'you_owe', text: 'Email Amy the template', status: 'done', comm_ref: S7 }
  ] }))
}));

import { renderThreadPage } from '@/views/thread-page';

describe('thread page (case)', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows goals, the circle, the session ledger and promise stats', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderThreadPage(canvas, THREAD_ID, { isCurrent: () => true, onTitleReady: () => {} });
    expect(canvas.querySelector('[data-part="goals"]')?.textContent).toContain('Maths C → B');
    expect(canvas.querySelector('[data-part="circle"]')?.textContent).toContain('Fletcher W.');
    expect(canvas.querySelector('[data-part="sessions"]')?.textContent).toContain('Session 7 · fillable bar');
    expect(canvas.querySelector('[data-part="stats"]')?.textContent).toContain('1 of 2 kept');
    expect(canvas.querySelector('[data-part="export"]')).not.toBeNull();
  });
});
```

- [ ] **Step 6: Run the test and confirm it fails**

Run: `cd apps/professional && npx vitest run tests/unit/thread-page.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implement** `views/thread-page.ts`

```ts
import { getThread, patchThread } from '@/api/threads';
import { listUniversalLinksForEntity } from '@/api/universal-links';
import { listLedgerForSources } from '@/api/ledger';
import { caseSummaryText } from '@/lib/case-summary';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { LedgerItem, ThreadGoal, ThreadRecord } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

type Member = { ref: string; label: string; href: string | null; at: string };

export async function renderThreadPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void }
): Promise<void> {
  showViewLoading(canvas, 'Loading…');
  let thread: ThreadRecord;
  let members: Member[];
  let ledger: LedgerItem[];
  const circle = new Map<string, string>();
  try {
    thread = (await getThread(id)).thread;
    const threadRef = `professional:thread:${id}`;
    const incoming = (await listUniversalLinksForEntity(threadRef)).incoming
      .filter((entry) => entry.link.relationship_type === 'in_thread' && entry.link.status === 'current');
    members = incoming
      .map((entry) => ({
        ref: entry.link.source_ref,
        label: entry.endpoint.display_label,
        href: entry.endpoint.href ?? null,
        at: String((entry.link as { created_at?: string }).created_at ?? '')
      }))
      .sort((a, b) => b.at.localeCompare(a.at));
    for (const member of members.slice(0, 10)) {
      const links = await listUniversalLinksForEntity(member.ref);
      for (const entry of links.outgoing) {
        if (['recipient', 'about_person'].includes(entry.link.relationship_type)) circle.set(entry.endpoint.ref, entry.endpoint.display_label);
      }
    }
    ledger = members.length ? (await listLedgerForSources(members.slice(0, 20).map((member) => member.ref))).items : [];
  } catch (err) {
    renderLoadError(canvas, err, () => void renderThreadPage(canvas, id, options));
    return;
  }
  if (!options.isCurrent()) return;
  options.onTitleReady(thread.title);

  const root = el('div', 'thread-page');
  root.dataset.kind = thread.kind;
  const head = el('header', 'thread-page__head');
  head.append(el('p', 'eyebrow', thread.kind === 'case' ? 'Case' : 'Thread'),
    el('p', 'muted', `${members.length} in ${thread.kind === 'case' ? 'case' : 'thread'}`));
  const kindToggle = el('button', 'btn btn--ghost', thread.kind === 'case' ? 'Make it a general thread' : 'Make it a case') as HTMLButtonElement;
  kindToggle.type = 'button';
  kindToggle.addEventListener('click', async () => {
    await patchThread(id, { kind: thread.kind === 'case' ? 'general' : 'case', ...(thread.kind === 'case' ? { goals: [] } : {}) });
    await renderThreadPage(canvas, id, options);
  });
  head.append(kindToggle);

  const sessions = el('section', 'thread-page__sessions');
  sessions.dataset.part = 'sessions';
  sessions.append(el('h3', undefined, 'Sessions'));
  for (const member of members) {
    const row = el('a', 'thread-page__session', member.label) as HTMLAnchorElement;
    if (member.href) row.href = member.href.replace(/^\/professional\//, '');
    sessions.append(row);
  }

  const side = el('aside', 'thread-page__side');
  if (thread.kind === 'case') side.append(goalsCard(thread, id));
  const circleCard = el('section', 'card');
  circleCard.dataset.part = 'circle';
  circleCard.append(el('h3', undefined, 'The circle'));
  for (const name of circle.values()) circleCard.append(el('p', 'thread-page__person', name));
  side.append(circleCard);

  const kept = ledger.filter((item) => item.status === 'done').length;
  const stats = el('section', 'card');
  stats.dataset.part = 'stats';
  stats.append(el('h3', undefined, 'Promises'), el('p', undefined, `${kept} of ${ledger.length} kept · ${ledger.filter((item) => item.status === 'open').length} open`));
  side.append(stats);

  if (thread.kind === 'case') {
    const exportBtn = el('button', 'btn btn--secondary', 'Copy case summary') as HTMLButtonElement;
    exportBtn.type = 'button';
    exportBtn.dataset.part = 'export';
    const status = el('p', 'muted');
    exportBtn.addEventListener('click', async () => {
      const text = caseSummaryText({
        title: thread.title,
        goals: thread.goals,
        sessions: members.map((member) => ({ label: member.label, at: member.at || new Date().toISOString(), summary: '' })),
        open: ledger.filter((item) => item.status === 'open').map((item) => ({ text: item.text, direction: item.direction })),
        kept,
        made: ledger.length
      });
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = 'Copied.';
      } catch {
        status.textContent = 'Copy failed. Select the text below instead.';
        const pre = el('pre', 'thread-page__export', text);
        side.append(pre);
      }
    });
    side.append(exportBtn, status);
  }

  const grid = el('div', 'thread-page__grid');
  grid.append(sessions, side);
  root.append(head, grid);
  canvas.replaceChildren(root);
}

function goalsCard(thread: ThreadRecord, id: string): HTMLElement {
  const card = el('section', 'card');
  card.dataset.part = 'goals';
  card.append(el('h3', undefined, 'Goals'));
  const list = el('div', 'goals');
  const render = (goals: ThreadGoal[]) => {
    list.replaceChildren();
    for (const goal of goals) {
      const row = el('div', 'goal');
      const top = el('div', 'goal__top');
      top.append(el('span', undefined, goal.text), el('span', 'muted', goal.note ?? (goal.progress === null ? '' : `${goal.progress}%`)));
      const bar = el('div', 'goal__bar');
      const fill = el('i');
      fill.style.width = `${goal.progress ?? 0}%`;
      bar.append(fill);
      row.append(top, bar);
      list.append(row);
    }
  };
  const input = el('input', 'goal__add') as HTMLInputElement;
  input.placeholder = 'Add a goal…';
  input.setAttribute('aria-label', 'Add goal');
  input.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter' || !input.value.trim()) return;
    const goals = [...thread.goals, { id: `g_${Date.now()}`, text: input.value.trim(), progress: null, note: null }];
    input.value = '';
    thread.goals = (await patchThread(id, { goals })).thread.goals;
    render(thread.goals);
  });
  render(thread.goals);
  card.append(list, input);
  return card;
}
```

- [ ] **Step 8: Route it** (`main.ts`: add this before the `not-found` fallthrough, with its import)

```ts
    if (route.name === 'thread') {
      renderPageHeader(shell, { eyebrow: 'Calendar · Thread', title: 'Loading…' });
      await renderThreadPage(shell.canvas, route.id, {
        onTitleReady: (title) => {
          if (generation !== routeGeneration) return;
          renderPageHeader(shell, { eyebrow: 'Calendar · Thread', title });
        },
        isCurrent: () => generation === routeGeneration
      });
      return;
    }
```

- [ ] **Step 9: Styles** `styles/thread-page.css`

Port the mockup's `.spine`, `.sess`, `.goal`, `.carry` rules (tab 3 of `docs/professional-hub/calendar/mockups/index.html`) using tokens only. Then add this:

```css
.thread-page__grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:var(--space-5);align-items:start}
@media (max-width:900px){.thread-page__grid{grid-template-columns:1fr}}
.thread-page__session{display:block;padding:var(--space-3) var(--space-4);border:1px solid var(--line);border-radius:var(--radius-sm);background:var(--paper);color:var(--ink);text-decoration:none}
.thread-page__export{white-space:pre-wrap;font-size:var(--text-sm);user-select:all}
```

Import it in `main.ts`.

- [ ] **Step 10: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/professional/src apps/professional/tests
git commit -m "feat(professional): thread and case page with a copyable case summary

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Full check

- [ ] **Step 1:** `npm test`. Expected: every unit and integration test passes.
- [ ] **Step 2:** `cd apps/professional && npx vitest run && npx tsc --noEmit && cd ../.. && npm run build`. Expected: pass, and every app builds.
- [ ] **Step 3:** `node --test --test-concurrency=1 tests/browser/calendar-filter.spec.mjs tests/browser/professional-calendar-hub.spec.mjs tests/browser/teaching-calendar-hub.spec.mjs tests/browser/tasks-calendar-hub.spec.mjs && TIDELINE_APP=1 node --test tests/browser/tideline-visual.spec.mjs`. Expected: PASS.
- [ ] **Step 4: Walk it** with `cd apps/professional && npx vite`:
  - The rail shows Home with Calendar indented under it.
  - `#/communications` lands on the calendar.
  - Log a comm with a time and a person. It shows as a blue chip in the right band. An email with no window is a pin.
  - Open it before its start time: Before shows the carried promises and agenda.
  - Switch to During: the round "+" adds blocks. Type `»me send the quote bank`, pause, then switch to After: the promise is in "I owe" with a Task switch.
  - Give the comm the same purpose and person as an existing thread: it joins, with Undo.
  - Open the thread and make it a case: goals, the circle and Copy case summary work.
  - Check it all at 390px wide.
- [ ] **Step 5:** `git push`. Don't open a PR yet; Plans 3 and 4 follow on this branch.

---

## Self-review

**Spec coverage (Plan 2's share):**

| Spec item | Where it's handled |
|---|---|
| §1 promises in Due, overdue solid | Tasks 7–10 |
| §1 comm pins | Tasks 7–10 |
| §1 redirects | Task 11 |
| §1 pill colours | Task 10 |
| §2 phases from the clock and by hand | Tasks 13, 17 |
| §2 carried promises as ticks | Task 17 |
| §2 agenda | Task 17 |
| §2 live strip and End | Task 17 |
| §2 block body on the Tasks engine | Tasks 16–17 |
| §2 `»me` / `»name` | Tasks 14, 17 |
| §2 After summary, ledger with Task switch | Task 17 |
| §2 people rail (with / also concerned) | Task 17 |
| §3 threads, auto-join with Undo | Tasks 4–6, 15, 18 |
| §3 case page (goals, circle, ledger, stats, export) | Task 19 |
| §4 ledger by source | Tasks 3, 12 |
| §10 comm v2 fields | Tasks 1–2 |
| §10 thread record and `in_thread` link | Tasks 4–5 |

**Deferred on purpose:**

| Item | Goes to |
|---|---|
| Clare brief, summary, drafts and handwriting | Plan 4 |
| "Mark as sent" logging a comm | Plan 4, with drafts |
| Next-date ghost | Plan 4 |
| `@name` tagging | Plan 3, with meetings, where it matters most |
| Goal progress read from session numbers | Plan 4 (Clare) |
| Promise keep rate per person | Plan 4, with the People ledger nudges |

**Types:**
- `CommPhase`, `CommWindow` (Task 13) are used in 17.
- `PersonOnPage`, `extractInlinePromises`, `resolvePromiseOwner`, `blockPlainText` (Task 14) are used in 17.
- `ThreadCandidate`, `pickThreadForComm` (Task 15) are used in 18.
- `BlockPageHandle`, `mountBlockPage` (Task 16) are used in 17.
- `LedgerItem`, `ThreadRecord`, `ThreadGoal`, `AgendaItem` (Task 12) are used in 17–19.
- `listLedgerForSources`, `createLedgerItem`, `patchLedger` (Task 12) are backed by Task 3's `source_refs` and Plan 1's `create` / `patch` actions.
- `threadRoute` (Task 11) is used in 17.
