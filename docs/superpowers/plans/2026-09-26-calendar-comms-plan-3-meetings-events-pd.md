# Calendar comms · Plan 3: Meetings, events and PD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Meetings become the same kind of clock page as comms. They add a "Why you're there" purpose, the room grouped by organisation with warmth dots, agenda-as-headings notes on the Tasks block engine, decisions, and `@name` tags.
- Events become block pages with a **Counts as PD** switch, so the HALT medal ceremony can exist and isn't PD.
- A PD event has a shape (one-off, series or program). A series or program groups separate events, one per day, and adds up their hours.
- Each talk in a PD event can become its own Knowledge Hub note.

**Architecture:**
- Meetings (schema v2) store `purpose`, `blocks` and `decisions`. Events (v2) allow `event_type: 'general'` and store `talks` and `blocks`.
- A new `pd_group` record groups events. As everywhere, membership is a Universal Link (`in_pd_group`). A talk's note is a `talk_note` link from the event to the Knowledge page, carrying the talk id.
- Pages reuse Plan 2's building blocks: `phaseFor`, `mountBlockPage`, the inline promises and the ledger clients.

**Tech Stack:** as in Plans 1–2.

**Depends on:** Plans 1 and 2 merged into this branch.

**Spec:** `docs/superpowers/specs/2026-09-26-calendar-comms-design.md`. This plan covers:
- §5: meetings
- §6: events and PD, including the "one event per day" rule for programs

**Not in this plan (Plan 4, Clare):**
- Checking the meeting outcome against its purpose and carrying unmet ones forward.
- Transcripts.
- Grant/opportunity capture.
- Logging decisions to the organisation page. That page belongs to the Organisations redesign, and Plan 4 adds the read once both exist.

**Conventions:**
- SESSION HELPERS means the sign-in and request helpers at the top of `tests/integration/communications.test.js`. Copy them exactly.
- Where a step says to check a real name, use what the code has.
- Dates shown on screen are `dd/mm/yy`.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `netlify/functions/_shared/meeting-schema.mjs`, `meeting-repository.mjs` | Modify | v2: purpose, blocks, decisions |
| `netlify/functions/_shared/event-schema.mjs`, `event-repository.mjs` | Modify | v2: `general` type (updatable), talks, blocks |
| `netlify/functions/_shared/pd-group-schema.mjs`, `pd-group-repository.mjs` | Create | PD group record |
| `netlify/functions/_shared/professional-blobs.mjs`, `entity-ref.mjs`, `entity-resolvers.mjs`, `relationship-registry.mjs` | Modify | `pd_group` keys, kind, resolver; `in_pd_group`, `talk_note` links |
| `netlify/functions/pd-groups.mjs` | Create | `/api/pd-groups` |
| `apps/professional/src/views/home.ts` | Modify | PD hours count PD events only |
| `apps/professional/src/domain/types.ts`, `domain/ids.ts` | Modify | v2 fields, `PdGroupRecord`, `EventTalk`, `MeetingDecision`, `isValidPdGroupId` |
| `apps/professional/src/api/meetings.ts`, `api/events.ts`, `api/pd-groups.ts` (new), `api/knowledge-notes.ts` (new) | Modify/Create | Clients |
| `apps/professional/src/lib/meeting-notes.ts` | Create | Agenda → headings, decisions, `@mentions` |
| `apps/professional/src/lib/room.ts` | Create | Group attendees by organisation with warmth |
| `apps/professional/src/lib/pd-totals.ts` | Create | Series/program hours, gaps, talk-hours check |
| `apps/professional/src/views/meeting-page.ts`, `views/event-page.ts`, `views/pd-group-page.ts` | Create | The three pages |
| `apps/professional/src/styles/meeting-page.css`, `event-page.css` | Create | Styles (tokens only) |
| `apps/professional/src/app/router.ts`, `app/main.ts` | Modify | Route meeting/event detail to the new pages; `#/pd-group/<id>` |

---

### Task 1: Meeting schema v2

**Files:**
- Modify: `netlify/functions/_shared/meeting-schema.mjs`, `netlify/functions/_shared/meeting-repository.mjs`
- Test: `tests/unit/meeting-event-schema.test.js` (append)

- [ ] **Step 1: Write the failing tests**

```js
import {
  MEETING_SCHEMA_VERSION,
  parseMeetingRecord,
  projectMeeting,
  validateMeetingFieldUpdate
} from '../../netlify/functions/_shared/meeting-schema.mjs';

const MEETING_V1 = {
  schema_version: 1,
  id: 'meeting_00000000-0000-4000-8000-000000000001',
  title: 'HALT NSW board meeting',
  scheduled_start: '2026-09-24T08:00:00.000Z',
  scheduled_end: '2026-09-24T09:15:00.000Z',
  time_zone: 'Australia/Sydney',
  location_text: 'Teams',
  agenda: '1. Minutes\n2. Treasurer\n3. Medal ceremony run sheet',
  notes: null,
  state: 'scheduled',
  occurrence_history: [],
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z'
};

test('meeting v2 reads v1 with empty purpose, blocks and decisions', () => {
  assert.equal(MEETING_SCHEMA_VERSION, 2);
  const parsed = parseMeetingRecord(MEETING_V1);
  assert.equal(parsed.purpose, null);
  assert.deepEqual(parsed.blocks, []);
  assert.deepEqual(parsed.decisions, []);
  assert.equal(projectMeeting(parsed).agenda, MEETING_V1.agenda);
});

test('meeting update accepts purpose, blocks and decisions', () => {
  const patch = validateMeetingFieldUpdate({
    purpose: 'Present the run sheet; get a yes on the TeachMeet date.',
    blocks: [{ id: 'block_1', block_type: 'heading', content: { text: 'Minutes' } }],
    decisions: [{ id: 'd1', text: 'Minutes accepted', agenda_heading: 'Minutes' }]
  });
  assert.equal(patch.decisions[0].agenda_heading, 'Minutes');
  assert.throws(() => validateMeetingFieldUpdate({ decisions: [{ id: 'd1' }] }), { code: 'invalid_decisions' });
  assert.throws(() => validateMeetingFieldUpdate({ purpose: 'x'.repeat(501) }), { code: 'purpose_too_long' });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/meeting-event-schema.test.js`
Expected: FAIL, because the version is 1.

- [ ] **Step 3: Implement** (`meeting-schema.mjs`)

Add this import:

```js
import { validateBlocks } from './communication-schema.mjs';
```

Change the version and add a readable set and limits:

```js
export const MEETING_SCHEMA_VERSION = 2;
const READABLE_MEETING_VERSIONS = new Set([1, 2]);
export const PURPOSE_MAX_LENGTH = 500;
export const DECISIONS_MAX = 50;
```

Add this helper under `trimBounded`:

```js
export function validateDecisions(value) {
  if (!Array.isArray(value) || value.length > DECISIONS_MAX) {
    throw validationError('invalid_decisions', `decisions must be an array of at most ${DECISIONS_MAX}.`);
  }
  return value.map((decision) => {
    if (!decision || typeof decision.id !== 'string' || typeof decision.text !== 'string' || !decision.text.trim()) {
      throw validationError('invalid_decisions', 'decisions need id and text.');
    }
    return {
      id: decision.id,
      text: decision.text.trim().slice(0, 500),
      agenda_heading: typeof decision.agenda_heading === 'string' ? decision.agenda_heading.trim().slice(0, 200) : null
    };
  });
}
```

- Add `'purpose'`, `'blocks'` and `'decisions'` to `STORED_KEYS`.
- In `parseMeetingRecord`, change the version check to `if (!READABLE_MEETING_VERSIONS.has(raw.schema_version)) return null;`.
- Add these to the returned object:

```js
    purpose: typeof raw.purpose === 'string' ? raw.purpose : null,
    blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
    decisions: Array.isArray(raw.decisions) ? raw.decisions : [],
```

`UPDATE_KEYS` becomes `new Set(['title', 'location_text', 'agenda', 'notes', 'purpose', 'blocks', 'decisions'])`. In `validateMeetingFieldUpdate`, before the empty check, add:

```js
  if (input.purpose !== undefined) patch.purpose = trimBounded(input.purpose, 'purpose', PURPOSE_MAX_LENGTH);
  if (input.blocks !== undefined) patch.blocks = validateBlocks(input.blocks);
  if (input.decisions !== undefined) patch.decisions = validateDecisions(input.decisions);
```

Check that `trimBounded` throws `purpose_too_long` for an over-long value. It builds the code as `${field}_too_long`: `grep -n "function trimBounded" -A12 netlify/functions/_shared/meeting-schema.mjs`.

In `projectMeeting`, add:

```js
    purpose: record.purpose ?? null,
    blocks: record.blocks ?? [],
    decisions: record.decisions ?? [],
```

In `meeting-repository.mjs`, find the create record literal with `grep -n "schema_version: MEETING_SCHEMA_VERSION" netlify/functions/_shared/meeting-repository.mjs` and add:

```js
      purpose: null,
      blocks: [],
      decisions: [],
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/unit/meeting-event-schema.test.js && npm run test:integration`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/meeting-schema.mjs netlify/functions/_shared/meeting-repository.mjs tests/unit/meeting-event-schema.test.js
git commit -m "feat(meetings): schema v2 with purpose, blocks and decisions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Event schema v2 — non-PD events, talks, blocks

**Files:**
- Modify: `netlify/functions/_shared/event-schema.mjs`, `netlify/functions/_shared/event-repository.mjs`
- Modify: `apps/professional/src/views/home.ts:117` (PD hours count PD events only)
- Test: `tests/unit/meeting-event-schema.test.js` (append), `apps/professional/tests/unit/home-view.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

```js
import {
  EVENT_SCHEMA_VERSION,
  EVENT_TYPES,
  parseEventRecord,
  validateEventCreateInput,
  validateEventFieldUpdate
} from '../../netlify/functions/_shared/event-schema.mjs';

const EVENT_V1 = {
  schema_version: 1,
  id: 'event_00000000-0000-4000-8000-000000000001',
  title: 'Warlight Professional Development',
  event_type: 'professional_development',
  start: '2026-09-17T23:00:00.000Z',
  end: '2026-09-18T05:00:00.000Z',
  time_zone: 'Australia/Sydney',
  all_day: false,
  occurrence_state: 'completed',
  location_text: "St Aloysius' College",
  accreditation_category: null,
  priority_area: null,
  hours: 6,
  attendance_state: 'attended',
  certificate: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z'
};

test('event v2: general type allowed and switchable; v1 reads with empty talks and blocks', () => {
  assert.equal(EVENT_SCHEMA_VERSION, 2);
  assert.ok(EVENT_TYPES.has('general'));
  const parsed = parseEventRecord(EVENT_V1);
  assert.deepEqual(parsed.talks, []);
  assert.deepEqual(parsed.blocks, []);
  assert.deepEqual(validateEventFieldUpdate({ event_type: 'general' }), { event_type: 'general' });
  assert.equal(
    validateEventCreateInput({ ...EVENT_V1, event_type: 'general', hours: null, links: [] }).event_type,
    'general'
  );
});

test('talks validate time, hours and title', () => {
  const patch = validateEventFieldUpdate({
    talks: [
      { id: 't1', time: '09:00', title: 'Keynote · Reading against the grain', presenter: 'Dr Mia L.', hours: 1.5 },
      { id: 't2', time: null, title: 'Panel', presenter: null, hours: null }
    ]
  });
  assert.equal(patch.talks.length, 2);
  assert.throws(() => validateEventFieldUpdate({ talks: [{ id: 't1', time: '9am', title: 'x', hours: 1 }] }), { code: 'invalid_talks' });
  assert.throws(() => validateEventFieldUpdate({ talks: [{ id: 't1', time: null, title: '', hours: 1 }] }), { code: 'invalid_talks' });
  assert.throws(() => validateEventFieldUpdate({ talks: [{ id: 't1', time: null, title: 'x', hours: 30 }] }), { code: 'invalid_talks' });
});
```

Check `validateEventCreateInput`'s required fields with `sed -n 225,290p netlify/functions/_shared/event-schema.mjs`, and adjust the create input above to satisfy them. Keep `event_type: 'general'`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/meeting-event-schema.test.js`
Expected: FAIL, because `general` isn't in `EVENT_TYPES`.

- [ ] **Step 3: Implement** (`event-schema.mjs`)

Add this import:

```js
import { validateBlocks } from './communication-schema.mjs';
```

Replace these constants:

```js
export const EVENT_SCHEMA_VERSION = 2;
const READABLE_EVENT_VERSIONS = new Set([1, 2]);
export const EVENT_TYPES = new Set(['professional_development', 'general']);
export const TALKS_MAX = 40;
```

Add this helper:

```js
export function validateTalks(value) {
  if (!Array.isArray(value) || value.length > TALKS_MAX) {
    throw validationError('invalid_talks', `talks must be an array of at most ${TALKS_MAX}.`);
  }
  return value.map((talk) => {
    const hours = talk?.hours ?? null;
    const time = talk?.time ?? null;
    if (!talk || typeof talk.id !== 'string' || typeof talk.title !== 'string' || !talk.title.trim()
      || (time !== null && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))
      || (hours !== null && (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0 || hours > 24))) {
      throw validationError('invalid_talks', 'talks need id, title, time HH:MM or null, and hours 0–24 or null.');
    }
    return {
      id: talk.id,
      time,
      title: talk.title.trim().slice(0, 300),
      presenter: typeof talk.presenter === 'string' && talk.presenter.trim() ? talk.presenter.trim().slice(0, 200) : null,
      hours
    };
  });
}
```

- Add `'talks'` and `'blocks'` to `STORED_KEYS`.
- In `parseEventRecord`, change the version check to use `READABLE_EVENT_VERSIONS`, and add these to the returned object:

```js
    talks: Array.isArray(raw.talks) ? raw.talks : [],
    blocks: Array.isArray(raw.blocks) ? raw.blocks : [],
```

- Add `'event_type'`, `'talks'` and `'blocks'` to `UPDATE_KEYS`. In `validateEventFieldUpdate`, before the empty check, add:

```js
  if (input.event_type !== undefined) {
    if (!EVENT_TYPES.has(input.event_type)) throw validationError('invalid_event_type', 'event_type is not a permitted value.');
    patch.event_type = input.event_type;
  }
  if (input.talks !== undefined) patch.talks = validateTalks(input.talks);
  if (input.blocks !== undefined) patch.blocks = validateBlocks(input.blocks);
```

- In `projectEvent`, add `talks: record.talks ?? [], blocks: record.blocks ?? [],`.
- In `event-repository.mjs`, add `talks: [], blocks: [],` to the create record literal (`grep -n "schema_version: EVENT_SCHEMA_VERSION" netlify/functions/_shared/event-repository.mjs`).

- [ ] **Step 4: The PD dashboard counts PD only**

In `apps/professional/src/views/home.ts` `renderAccreditation`, add this as the first line in the `for (const event of events)` loop:

```ts
    if (event.event_type !== 'professional_development') continue;
```

Append this to `apps/professional/tests/unit/home-view.test.ts`, using its existing render helper and event fixture builder:

```ts
it('accreditation hours ignore non-PD events', async () => {
  // Arrange with the file's fixture builder: one completed PD event of 6 h and one completed
  // event_type 'general' event of 2 h in the current year.
  const canvas = await renderHomeWithEvents([pdEvent({ hours: 6 }), pdEvent({ hours: 2, event_type: 'general' })]);
  expect(canvas.querySelector('[data-part="accreditation-progress"]')?.textContent).toContain('6');
  expect(canvas.querySelector('[data-part="accreditation-progress"]')?.textContent).not.toContain('8');
});
```

Replace `renderHomeWithEvents` and `pdEvent` with that file's own helpers.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test tests/unit/meeting-event-schema.test.js && npm run test:integration && cd apps/professional && npx vitest run tests/unit/home-view.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/event-schema.mjs netlify/functions/_shared/event-repository.mjs apps/professional/src/views/home.ts apps/professional/tests/unit/home-view.test.ts tests/unit/meeting-event-schema.test.js
git commit -m "feat(events): non-PD events, talks and blocks; PD hours count PD only

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: PD group record

**Files:**
- Create: `netlify/functions/_shared/pd-group-schema.mjs`, `netlify/functions/_shared/pd-group-repository.mjs`
- Modify: `netlify/functions/_shared/professional-blobs.mjs`
- Test: `tests/unit/pd-groups.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidPdGroupId, validatePdGroupCreateInput } from '../../netlify/functions/_shared/pd-group-schema.mjs';
import { createPdGroupRepository } from '../../netlify/functions/_shared/pd-group-repository.mjs';

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) { return map.has(key) ? (type === 'json' ? structuredClone(map.get(key)) : map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async list({ prefix = '' } = {}) { return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) }; },
    _map: map
  };
}

test('pd group validation', () => {
  assert.equal(isValidPdGroupId('pd_group_00000000-0000-4000-8000-000000000001'), true);
  const input = validatePdGroupCreateInput({ shape: 'series', title: 'Warlight: Critical Study of Literature', provider: 'Warlight' });
  assert.equal(input.shape, 'series');
  assert.throws(() => validatePdGroupCreateInput({ shape: 'one_off', title: 'x' }), { code: 'invalid_shape' });
});

test('pd group repository', async () => {
  const store = memoryStore();
  const repo = createPdGroupRepository({ store, now: () => '2026-09-26T00:00:00.000Z', generateId: () => 'pd_group_00000000-0000-4000-8000-000000000001' });
  const group = await repo.createGroup({ shape: 'program', title: 'HPGE Conference 2026', provider: null });
  assert.equal((await repo.getGroup(group.id)).shape, 'program');
  assert.equal((await repo.listGroups()).length, 1);
  assert.equal((await repo.patchGroup(group.id, { title: 'HPGE Conference' })).title, 'HPGE Conference');
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/pd-groups.test.js`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Create `pd-group-schema.mjs`**

```js
import { randomUUID } from 'node:crypto';

// Groups PD events into a series (sessions weeks apart) or a program (a
// multi-day seminar, one event per day). Membership is an `in_pd_group` link.
// A one-off PD event has no group.

export const PD_GROUP_SCHEMA_VERSION = 1;
export const PD_GROUP_SHAPES = new Set(['series', 'program']);
const PD_GROUP_ID_PATTERN = /^pd_group_[0-9a-f-]{36}$/;

export function generatePdGroupId() {
  return `pd_group_${randomUUID()}`;
}

export function isValidPdGroupId(id) {
  return typeof id === 'string' && PD_GROUP_ID_PATTERN.test(id);
}

function validationError(code, message) {
  return Object.assign(new Error(message), { status: 400, code });
}

function readTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title || title.length > 200) throw validationError('invalid_title', 'title must be 1–200 characters.');
  return title;
}

function readProvider(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 200) throw validationError('invalid_provider', 'provider must be at most 200 characters.');
  return value.trim();
}

const STORED_KEYS = new Set(['schema_version', 'id', 'shape', 'title', 'provider', 'created_at', 'updated_at']);

export function parsePdGroupRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  for (const key of Object.keys(raw)) if (!STORED_KEYS.has(key)) return null;
  if (raw.schema_version !== PD_GROUP_SCHEMA_VERSION || !isValidPdGroupId(raw.id)) return null;
  if (!PD_GROUP_SHAPES.has(raw.shape) || typeof raw.title !== 'string') return null;
  return { ...raw, provider: raw.provider ?? null };
}

export function validatePdGroupCreateInput(input) {
  if (!input || typeof input !== 'object') throw validationError('invalid_input', 'PD group creation requires a body object.');
  if (!PD_GROUP_SHAPES.has(input.shape)) throw validationError('invalid_shape', 'shape must be series or program.');
  return { shape: input.shape, title: readTitle(input.title), provider: readProvider(input.provider) };
}

export function validatePdGroupPatchInput(input) {
  if (!input || typeof input !== 'object') throw validationError('invalid_input', 'PD group patch requires a body object.');
  const patch = {};
  if (input.shape !== undefined) {
    if (!PD_GROUP_SHAPES.has(input.shape)) throw validationError('invalid_shape', 'shape must be series or program.');
    patch.shape = input.shape;
  }
  if (input.title !== undefined) patch.title = readTitle(input.title);
  if (input.provider !== undefined) patch.provider = readProvider(input.provider);
  if (!Object.keys(patch).length) throw validationError('empty_update', 'Update has no fields.');
  return patch;
}

export function pdGroupDisplayLabel(record) {
  return record?.title || 'PD';
}
```

- [ ] **Step 4: Keys** (`professional-blobs.mjs`)

```js
import { isValidPdGroupId } from './pd-group-schema.mjs';

export const PD_GROUP_PREFIX = 'pd-groups/records/';

export function pdGroupKey(id) {
  if (!isValidPdGroupId(id)) {
    throw Object.assign(new Error(`Invalid PD group id: ${JSON.stringify(id)}`), { status: 400, code: 'invalid_pd_group_id' });
  }
  return `${PD_GROUP_PREFIX}${id}`;
}

export async function listPdGroupKeys(store) {
  return (await listBlobKeys(store, PD_GROUP_PREFIX)).filter((key) => !isIndexKey(key));
}
```

- [ ] **Step 5: Create `pd-group-repository.mjs`**

```js
import {
  PD_GROUP_SCHEMA_VERSION,
  generatePdGroupId,
  isValidPdGroupId,
  parsePdGroupRecord,
  validatePdGroupCreateInput,
  validatePdGroupPatchInput
} from './pd-group-schema.mjs';
import { getJSON, listPdGroupKeys, pdGroupKey, setJSON } from './professional-blobs.mjs';

function notFound() {
  return Object.assign(new Error('PD group not found.'), { status: 404, code: 'pd_group_not_found' });
}

export function createPdGroupRepository(deps = {}) {
  const store = deps.store;
  if (!store) throw new Error('createPdGroupRepository requires a professional store.');
  const now = deps.now ?? (() => new Date().toISOString());
  const generateId = deps.generateId ?? generatePdGroupId;

  async function load(id) {
    if (!isValidPdGroupId(id)) throw notFound();
    const record = parsePdGroupRecord(await getJSON(store, pdGroupKey(id)));
    if (!record) throw notFound();
    return record;
  }

  async function createGroup(input) {
    const validated = validatePdGroupCreateInput(input);
    const timestamp = now();
    const record = { schema_version: PD_GROUP_SCHEMA_VERSION, id: generateId(), ...validated, created_at: timestamp, updated_at: timestamp };
    await setJSON(store, pdGroupKey(record.id), record);
    return record;
  }

  async function listGroups() {
    const out = [];
    for (const key of await listPdGroupKeys(store)) {
      const record = parsePdGroupRecord(await getJSON(store, key));
      if (record) out.push(record);
    }
    return out.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  }

  async function patchGroup(id, input) {
    const record = await load(id);
    const updated = { ...record, ...validatePdGroupPatchInput(input), updated_at: now() };
    await setJSON(store, pdGroupKey(id), updated);
    return updated;
  }

  return { createGroup, getGroup: load, listGroups, patchGroup };
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `node --test tests/unit/pd-groups.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add netlify/functions/_shared/pd-group-schema.mjs netlify/functions/_shared/pd-group-repository.mjs netlify/functions/_shared/professional-blobs.mjs tests/unit/pd-groups.test.js
git commit -m "feat(pd): PD group record for series and programs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: PD group entity, links and `/api/pd-groups`

**Files:**
- Modify: `entity-ref.mjs`, `entity-resolvers.mjs`, `relationship-registry.mjs` (in `netlify/functions/_shared`)
- Create: `netlify/functions/pd-groups.mjs`
- Test: `tests/unit/pd-groups.test.js` (append), `tests/integration/pd-groups.test.js`

- [ ] **Step 1: Write the failing unit test**

```js
import { parseEntityRef } from '../../netlify/functions/_shared/entity-ref.mjs';
import { getRelationshipDeclaration } from '../../netlify/functions/_shared/relationship-registry.mjs';

test('pd groups are entities; events join them; talks link to Knowledge notes', () => {
  assert.equal(parseEntityRef('professional:pd_group:pd_group_00000000-0000-4000-8000-000000000001')?.kind, 'pd_group');
  const member = getRelationshipDeclaration('in_pd_group');
  assert.deepEqual([...member.source_kinds], ['professional:event']);
  assert.deepEqual([...member.target_kinds], ['professional:pd_group']);
  const note = getRelationshipDeclaration('talk_note');
  assert.deepEqual([...note.source_kinds], ['professional:event']);
  assert.deepEqual([...note.target_kinds], ['knowledge:page']);
  assert.deepEqual([...note.metadata_keys], ['talk_id']);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/unit/pd-groups.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

`entity-ref.mjs`: add `'pd_group'` to `ENTITY_REF_KINDS.professional`.

`relationship-registry.mjs`: add these two entries in the same form as `in_thread` (Plan 2):

```js
  [
    'in_pd_group',
    declaration({
      key: 'in_pd_group',
      sourceKinds: ['professional:event'],
      targetKinds: ['professional:pd_group'],
      inverseLabel: 'pd_group_member',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none'
    })
  ],
  [
    'talk_note',
    declaration({
      key: 'talk_note',
      sourceKinds: ['professional:event'],
      targetKinds: ['knowledge:page'],
      inverseLabel: 'note_of_talk',
      cardinality: 'many_to_many',
      temporalMode: 'timeless',
      roleMode: 'none',
      metadataKeys: ['talk_id']
    })
  ],
```

Before adding `talk_note`, check how `metadataKeys` values are validated: `grep -n "metadata_keys" -A10 netlify/functions/_shared/relationship-registry.mjs | head -30`. If a key needs a declared type (for example `{ talk_id: 'string' }`), follow that format.

`entity-resolvers.mjs`: add `resolvePdGroup` in the same shape as `resolveThread` (Plan 2 Task 5). It uses `parsePdGroupRecord`, `pdGroupKey` and `pdGroupDisplayLabel`, with `kind: 'pd_group'`, `supporting_label: record.shape` and `href: /professional/#/pd-group/<id>`. Register `'professional:pd_group': resolvePdGroup`.

Create `netlify/functions/pd-groups.mjs`. Copy `netlify/functions/threads.mjs` (Plan 2 Task 6) and change:
- `config = { path: '/api/pd-groups' }`
- `createPdGroupRepository`
- response keys `group` / `groups`
- methods: `createGroup`, `getGroup`, `listGroups`, `patchGroup`
- export `createPdGroupsHandler`

- [ ] **Step 4: Write the integration test** `tests/integration/pd-groups.test.js`. Copy the SESSION HELPERS, then add:

```js
import { createPdGroupsHandler } from '../../netlify/functions/pd-groups.mjs';

test('POST, GET and PATCH a PD group', async () => {
  const store = memoryStore(); // as in tests/unit/pd-groups.test.js
  const handler = createPdGroupsHandler({ env, contentStore: store });
  const created = await (await send(handler, 'POST', '/api/pd-groups', { shape: 'series', title: 'Warlight', provider: 'Warlight' })).json();
  const id = created.data.group.id;
  assert.equal((await (await send(handler, 'GET', '/api/pd-groups')).json()).data.groups.length, 1);
  assert.equal((await (await send(handler, 'GET', `/api/pd-groups?id=${id}`)).json()).data.group.shape, 'series');
  const patched = await (await send(handler, 'PATCH', `/api/pd-groups?id=${id}`, { shape: 'program' })).json();
  assert.equal(patched.data.group.shape, 'program');
});
```

Inject the store the same way the Plan 2 threads integration test does.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test tests/unit/pd-groups.test.js tests/integration/pd-groups.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions tests
git commit -m "feat(pd): PD group entity, in_pd_group and talk_note links, /api/pd-groups

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Professional types and clients

**Files:**
- Modify: `apps/professional/src/domain/types.ts`, `domain/ids.ts`, `api/meetings.ts`, `api/events.ts`
- Create: `apps/professional/src/api/pd-groups.ts`, `apps/professional/src/api/knowledge-notes.ts`
- Test: `apps/professional/tests/unit/api-pd-knowledge.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPdGroup, listPdGroups } from '@/api/pd-groups';
import { createKnowledgeNote } from '@/api/knowledge-notes';

function mockFetch(data: unknown) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('pd groups and knowledge notes clients', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists and creates PD groups', async () => {
    let fetch = mockFetch({ groups: [] });
    await listPdGroups();
    expect(String(fetch.mock.calls[0][0])).toContain('/api/pd-groups');
    fetch = mockFetch({ group: {} });
    await createPdGroup({ shape: 'series', title: 'Warlight', provider: 'Warlight' });
    expect(fetch.mock.calls[0][1].method).toBe('POST');
  });

  it('creates a Knowledge note in Notes with the talk tags', async () => {
    const fetch = mockFetch({ id: 'page_1', title: 'Keynote' });
    const page = await createKnowledgeNote({ title: 'Keynote · Reading against the grain', body: 'Dr Mia L. · Warlight 18/09/26', tags: ['pd', 'warlight'] });
    expect(String(fetch.mock.calls[0][0])).toContain('/api/knowledge/pages');
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ title: 'Keynote · Reading against the grain', body: 'Dr Mia L. · Warlight 18/09/26', area: 'notes', tags: ['pd', 'warlight'] });
    expect(page.id).toBe('page_1');
  });
});
```

Check the shape `saveKnowledgePage` returns with `grep -n "return" netlify/functions/_shared/knowledge-data.mjs | sed -n 1,40p` around line 380. If the page sits under a key (for example `{ page }`), make `createKnowledgeNote` unwrap it and update the mocked data to match.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/professional && npx vitest run tests/unit/api-pd-knowledge.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`domain/types.ts`: add these fields to `MeetingRecord`:

```ts
  purpose?: string | null;
  blocks?: unknown[];
  decisions?: MeetingDecision[];
```

Add these to `EventRecord`, and widen `event_type` to `'professional_development' | 'general' | string`:

```ts
  talks?: EventTalk[];
  blocks?: unknown[];
```

Add these types:

```ts
export interface MeetingDecision {
  id: string;
  text: string;
  agenda_heading: string | null;
}

export interface EventTalk {
  id: string;
  time: string | null;
  title: string;
  presenter: string | null;
  hours: number | null;
}

export interface PdGroupRecord {
  schema_version: number;
  id: string;
  shape: 'series' | 'program';
  title: string;
  provider: string | null;
  created_at: string;
  updated_at: string;
}
```

`domain/ids.ts`:

```ts
export function isValidPdGroupId(id: string): boolean {
  return /^pd_group_[0-9a-f-]{36}$/.test(id);
}
```

`api/meetings.ts` `updateMeeting`: widen the patch type with `purpose?: string; blocks?: unknown[]; decisions?: MeetingDecision[];`.
`api/events.ts` `updateEvent`: widen it with `event_type?: string; talks?: EventTalk[]; blocks?: unknown[];`.

`api/pd-groups.ts`:

```ts
import { apiGet, apiPatch, apiPost } from '@/api/client';
import type { PdGroupRecord } from '@/domain/types';

export function listPdGroups(options: { signal?: AbortSignal } = {}): Promise<{ groups: PdGroupRecord[] }> {
  return apiGet('/api/pd-groups', { signal: options.signal });
}

export function getPdGroup(id: string, options: { signal?: AbortSignal } = {}): Promise<{ group: PdGroupRecord }> {
  return apiGet(`/api/pd-groups?${new URLSearchParams({ id }).toString()}`, { signal: options.signal });
}

export function createPdGroup(
  body: { shape: 'series' | 'program'; title: string; provider?: string | null },
  options: { signal?: AbortSignal } = {}
): Promise<{ group: PdGroupRecord }> {
  return apiPost('/api/pd-groups', body, { signal: options.signal });
}

export function patchPdGroup(
  id: string,
  patch: { shape?: 'series' | 'program'; title?: string; provider?: string | null },
  options: { signal?: AbortSignal } = {}
): Promise<{ group: PdGroupRecord }> {
  return apiPatch(`/api/pd-groups?${new URLSearchParams({ id }).toString()}`, patch, { signal: options.signal });
}
```

`api/knowledge-notes.ts`:

```ts
import { apiPost } from '@/api/client';

/** A new page in Knowledge › Notes. Used for "Make note" on a PD talk. */
export function createKnowledgeNote(
  body: { title: string; body: string; tags: string[] },
  options: { signal?: AbortSignal } = {}
): Promise<{ id: string; title: string }> {
  return apiPost('/api/knowledge/pages', { title: body.title, body: body.body, area: 'notes', tags: body.tags }, { signal: options.signal });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/api-pd-knowledge.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/domain apps/professional/src/api apps/professional/tests/unit/api-pd-knowledge.test.ts
git commit -m "feat(professional): meeting/event v2 types, PD group and Knowledge note clients

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Meeting notes logic — agenda to headings, decisions, mentions

**Files:**
- Create: `apps/professional/src/lib/meeting-notes.ts`
- Test: `apps/professional/tests/unit/meeting-notes.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { agendaToBlocks, extractDecisions, extractMentions } from '@/lib/meeting-notes';

describe('agendaToBlocks', () => {
  it('turns a pasted agenda into a heading and an empty text block per item', () => {
    let n = 0;
    const blocks = agendaToBlocks('1. Minutes and matters arising\n2) Treasurer’s report\n\n- Medal ceremony run sheet', () => `block_${++n}`);
    expect(blocks.map((block) => [block.block_type, (block.content as { text?: string; html?: string }).text ?? (block.content as { html: string }).html])).toEqual([
      ['heading', 'Minutes and matters arising'], ['rich_text', ''],
      ['heading', 'Treasurer’s report'], ['rich_text', ''],
      ['heading', 'Medal ceremony run sheet'], ['rich_text', '']
    ]);
    expect(blocks[0]).toMatchObject({ id: 'block_1', variant: 'section' });
  });
  it('empty agenda gives no blocks', () => {
    expect(agendaToBlocks('  \n ', () => 'x')).toEqual([]);
  });
});

describe('extractDecisions', () => {
  it('reads ✓ and "Decision:" lines under the nearest heading', () => {
    const blocks = [
      { id: 'h1', block_type: 'heading', content: { text: 'Minutes' } },
      { id: 'r1', block_type: 'rich_text', content: { html: '<p>✓ Minutes accepted</p><p>Other chat</p>' } },
      { id: 'h2', block_type: 'heading', content: { text: 'Run sheet' } },
      { id: 'r2', block_type: 'rich_text', content: { html: '<p>Decision: ceremony at Parliament House</p>' } }
    ];
    expect(extractDecisions(blocks)).toEqual([
      { text: 'Minutes accepted', agenda_heading: 'Minutes' },
      { text: 'ceremony at Parliament House', agenda_heading: 'Run sheet' }
    ]);
  });
});

describe('extractMentions', () => {
  it('collects @Name lines per person', () => {
    const text = '@Greg surplus of $4.2k\nPremier’s grant closes 30 Oct\n@Greg grant closes 30 Oct\n@Sam O. first time here';
    expect(extractMentions(text)).toEqual([
      { name: 'Greg', lines: ['surplus of $4.2k', 'grant closes 30 Oct'] },
      { name: 'Sam O.', lines: ['first time here'] }
    ]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/meeting-notes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `lib/meeting-notes.ts`

```ts
import { blockPlainText } from '@/lib/inline-promises';

type NewBlock = { id: string; block_type: string; variant: string; content: Record<string, unknown> };

/** A pasted agenda becomes the notes' skeleton: a heading per item with an empty text block under it. */
export function agendaToBlocks(agenda: string, nextId: () => string): NewBlock[] {
  const out: NewBlock[] = [];
  for (const raw of agenda.split('\n')) {
    const text = raw.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, '').trim();
    if (!text) continue;
    out.push({ id: nextId(), block_type: 'heading', variant: 'section', content: { text } });
    out.push({ id: nextId(), block_type: 'rich_text', variant: 'medium', content: { html: '' } });
  }
  return out;
}

const DECISION = /^(?:✓\s*|decision:\s*)(.+)$/i;

/** `✓ …` or `Decision: …` lines, filed under the heading above them. */
export function extractDecisions(blocks: Array<{ block_type: string; content?: unknown }>): Array<{ text: string; agenda_heading: string | null }> {
  const out: Array<{ text: string; agenda_heading: string | null }> = [];
  let heading: string | null = null;
  for (const block of blocks) {
    if (block.block_type === 'heading') {
      const text = (block.content as { text?: string } | undefined)?.text;
      heading = typeof text === 'string' && text.trim() ? text.trim() : heading;
      continue;
    }
    for (const line of blockPlainText([block]).split('\n')) {
      const match = DECISION.exec(line.trim());
      if (match) out.push({ text: match[1]!.trim(), agenda_heading: heading });
    }
  }
  return out;
}

const MENTION = /^@([A-Z][\p{L}'’-]*(?:\s[A-Z][\p{L}'’.-]*)?)\s+(.+)$/u;

/** `@Name …` lines grouped by name, in first-seen order. */
export function extractMentions(text: string): Array<{ name: string; lines: string[] }> {
  const byName = new Map<string, string[]>();
  for (const raw of text.split('\n')) {
    const match = MENTION.exec(raw.trim());
    if (!match) continue;
    const name = match[1]!.trim();
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name)!.push(match[2]!.trim());
  }
  return [...byName.entries()].map(([name, lines]) => ({ name, lines }));
}
```

The regex takes an optional second capitalised word, so `@Sam O.` captures `Sam O.`. In `@Greg surplus`, the second word is lowercase, so the name stays `Greg`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/meeting-notes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/lib/meeting-notes.ts apps/professional/tests/unit/meeting-notes.test.ts
git commit -m "feat(professional): meeting notes skeleton, decisions and @mentions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The room — attendees by organisation with warmth

**Files:**
- Create: `apps/professional/src/lib/room.ts`
- Test: `apps/professional/tests/unit/room.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { groupRoom } from '@/lib/room';

const row = (ref: string, name: string, org: string | null, warmth: 'warm' | 'cooling' | 'cold', created = '2025-01-01T00:00:00.000Z') => ({
  ref, display_name: name, initials: name.slice(0, 2).toUpperCase(),
  organisation: org ? { ref: `shared:organisation:${org}`, display_name: org, monogram: org[0]!, logo_key: null, current: true } : null,
  warmth_band: warmth, created_at: created
});

describe('groupRoom', () => {
  const directory = [
    row('shared:person:vicki', 'Vicki Sheehan', 'HALT NSW', 'warm'),
    row('shared:person:greg', 'Greg R.', 'HALT NSW', 'cooling'),
    row('shared:person:jo', 'Jo T.', 'Barker College', 'cold'),
    row('shared:person:sam', 'Sam O.', null, 'cold', '2026-09-20T00:00:00.000Z')
  ];
  const attendees = [
    { ref: 'shared:person:greg', role: 'treasurer' },
    { ref: 'shared:person:vicki', role: 'chair' },
    { ref: 'shared:person:jo', role: null },
    { ref: 'shared:person:sam', role: null }
  ];

  it('clusters by organisation, biggest first; no organisation goes last', () => {
    const room = groupRoom(attendees, directory, new Date('2026-09-24T08:00:00.000Z'));
    expect(room.map((cluster) => [cluster.organisation, cluster.people.map((person) => person.name)])).toEqual([
      ['HALT NSW', ['Vicki Sheehan', 'Greg R.']],
      ['Barker College', ['Jo T.']],
      [null, ['Sam O.']]
    ]);
  });

  it('warmth becomes 3/2/1 dots; people added in the last 14 days are new', () => {
    const room = groupRoom(attendees, directory, new Date('2026-09-24T08:00:00.000Z'));
    const people = room.flatMap((cluster) => cluster.people);
    expect(people.find((person) => person.name === 'Vicki Sheehan')!.warmthDots).toBe(3);
    expect(people.find((person) => person.name === 'Greg R.')!.warmthDots).toBe(2);
    expect(people.find((person) => person.name === 'Jo T.')!.warmthDots).toBe(1);
    expect(people.find((person) => person.name === 'Sam O.')!.isNew).toBe(true);
    expect(people.find((person) => person.name === 'Vicki Sheehan')!.role).toBe('chair');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/room.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `lib/room.ts`

```ts
import type { DirectoryPersonRow } from '@/api/people-directory';

export type RoomPerson = { ref: string; name: string; initials: string; role: string | null; warmthDots: 1 | 2 | 3; isNew: boolean };
export type RoomCluster = { organisation: string | null; monogram: string | null; people: RoomPerson[] };

type DirectoryLike = Pick<DirectoryPersonRow, 'ref' | 'display_name' | 'initials' | 'organisation' | 'warmth_band' | 'created_at'>;

const DOTS: Record<DirectoryPersonRow['warmth_band'], 1 | 2 | 3> = { warm: 3, cooling: 2, cold: 1 };
const NEW_MS = 14 * 86_400_000;

/**
 * Attendees grouped by their current organisation (biggest group first, chairs first
 * inside a group). Warmth comes from the People directory, the same number People shows.
 */
export function groupRoom(
  attendees: Array<{ ref: string; role: string | null }>,
  directory: DirectoryLike[],
  now: Date
): RoomCluster[] {
  const byRef = new Map(directory.map((row) => [row.ref, row]));
  const clusters = new Map<string, RoomCluster>();
  for (const attendee of attendees) {
    const row = byRef.get(attendee.ref);
    const orgName = row?.organisation?.display_name ?? null;
    const key = orgName ?? '\u0000none';
    if (!clusters.has(key)) clusters.set(key, { organisation: orgName, monogram: row?.organisation?.monogram ?? null, people: [] });
    clusters.get(key)!.people.push({
      ref: attendee.ref,
      name: row?.display_name ?? 'Unknown person',
      initials: row?.initials ?? '?',
      role: attendee.role,
      warmthDots: row ? DOTS[row.warmth_band] : 1,
      isNew: row ? now.getTime() - Date.parse(row.created_at) <= NEW_MS : true
    });
  }
  const rolesFirst = (person: RoomPerson) => (person.role === 'chair' ? 0 : person.role ? 1 : 2);
  const list = [...clusters.values()];
  for (const cluster of list) cluster.people.sort((a, b) => rolesFirst(a) - rolesFirst(b));
  return list.sort((a, b) => {
    if (a.organisation === null) return 1;
    if (b.organisation === null) return -1;
    return b.people.length - a.people.length;
  });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/room.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/lib/room.ts apps/professional/tests/unit/room.test.ts
git commit -m "feat(professional): meeting room grouped by organisation with warmth

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: PD totals

**Files:**
- Create: `apps/professional/src/lib/pd-totals.ts`
- Test: `apps/professional/tests/unit/pd-totals.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { groupTotals, talkHoursNote } from '@/lib/pd-totals';

const ev = (id: string, start: string, hours: number | null, state = 'completed', attendance: string | null = 'attended') =>
  ({ id, start, end: start, hours, occurrence_state: state, attendance_state: attendance, time_zone: 'Australia/Sydney' });

describe('groupTotals', () => {
  it('sums done and planned hours and measures the gaps between sessions', () => {
    const totals = groupTotals([
      ev('s2', '2026-10-29T22:00:00.000Z', 6, 'scheduled', 'registered'),
      ev('s1', '2026-09-17T23:00:00.000Z', 6),
      ev('s3', '2026-11-19T22:00:00.000Z', 6, 'scheduled', null)
    ]);
    expect(totals.hoursDone).toBe(6);
    expect(totals.hoursTotal).toBe(18);
    expect(totals.sessions.map((session) => [session.id, session.label, session.gapAfter])).toEqual([
      ['s1', '18/09', '6 wks'],
      ['s2', '30/10', '3 wks'],
      ['s3', '20/11', null]
    ]);
  });
  it('gaps under a week are days', () => {
    const totals = groupTotals([ev('d1', '2026-10-05T22:00:00.000Z', 6), ev('d2', '2026-10-06T22:00:00.000Z', 5)]);
    expect(totals.sessions[0]!.gapAfter).toBe('1 day');
  });
});

describe('talkHoursNote', () => {
  it('says when talk hours and event hours differ', () => {
    expect(talkHoursNote([{ hours: 1.5 }, { hours: 2 }, { hours: 1.5 }], 6)).toBe('Talks add up to 5 h of 6 h.');
    expect(talkHoursNote([{ hours: 3 }, { hours: 3 }], 6)).toBeNull();
    expect(talkHoursNote([{ hours: null }], 6)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/pd-totals.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `lib/pd-totals.ts`

```ts
type EventLike = { id: string; start: string; hours: number | null; occurrence_state: string; attendance_state: string | null; time_zone: string };

function ddmm(iso: string, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: zone, day: '2-digit', month: '2-digit' }).formatToParts(new Date(iso));
  return `${parts.find((p) => p.type === 'day')?.value}/${parts.find((p) => p.type === 'month')?.value}`;
}

function gapLabel(ms: number): string {
  const days = Math.round(ms / 86_400_000);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'}`;
  const weeks = Math.round(days / 7);
  return `${weeks} wk${weeks === 1 ? '' : 's'}`;
}

/** Hours done (completed, attended or partial) and in total, plus sessions in date order with gaps between them. */
export function groupTotals(events: EventLike[]): {
  hoursDone: number;
  hoursTotal: number;
  sessions: Array<{ id: string; label: string; hours: number | null; done: boolean; gapAfter: string | null }>;
} {
  const ordered = [...events].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  let hoursDone = 0;
  let hoursTotal = 0;
  const sessions = ordered.map((event, index) => {
    const done = event.occurrence_state === 'completed' && (event.attendance_state === 'attended' || event.attendance_state === 'partial');
    if (event.hours != null) {
      hoursTotal += event.hours;
      if (done) hoursDone += event.hours;
    }
    const next = ordered[index + 1];
    return {
      id: event.id,
      label: ddmm(event.start, event.time_zone),
      hours: event.hours,
      done,
      gapAfter: next ? gapLabel(Date.parse(next.start) - Date.parse(event.start)) : null
    };
  });
  return { hoursDone, hoursTotal, sessions };
}

/** A gentle note when the talks' hours don't add up to the event's hours. */
export function talkHoursNote(talks: Array<{ hours: number | null }>, eventHours: number | null): string | null {
  const counted = talks.filter((talk) => talk.hours != null);
  if (!counted.length || eventHours == null) return null;
  const sum = counted.reduce((total, talk) => total + (talk.hours ?? 0), 0);
  if (Math.abs(sum - eventHours) < 0.01) return null;
  return `Talks add up to ${Number(sum.toFixed(2))} h of ${eventHours} h.`;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/pd-totals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/lib/pd-totals.ts apps/professional/tests/unit/pd-totals.test.ts
git commit -m "feat(professional): PD series and program totals

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The meeting page

Replaces `renderMeetingDetailView` for `#/meeting/<id>`. The existing preparation and follow-up Task link panels (with Plan 1's auto-retry) move into the page unchanged.

**Files:**
- Create: `apps/professional/src/views/meeting-page.ts`, `apps/professional/src/styles/meeting-page.css`
- Modify: `apps/professional/src/views/meetings.ts` (export the task-link section), `apps/professional/src/app/main.ts`
- Test: `apps/professional/tests/unit/meeting-page.test.ts`

**What the page reads:**
- `getMeeting(id)`.
- `listUniversalLinksForEntity(meetingRef)`: `attendee` links (with role) and `in_thread`.
- `fetchPeopleDirectory()`: organisation and warmth.
- `listLedgerForSources([meetingRef])`: promises made here.

- [ ] **Step 1: Split out the Task link section**

In `views/meetings.ts`, move the code in `renderMeetingDetailView` that mounts the preparation and follow-up `mountTaskLinkPanel`s into:

```ts
export function buildMeetingTaskLinks(record: MeetingRecord, reload: () => Promise<void>): HTMLElement
```

`renderMeetingDetailView` calls it. Run `npx vitest run tests/unit/meetings-events.test.ts`: it should pass unchanged.

- [ ] **Step 2: Write the failing tests**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MEETING_ID = 'meeting_00000000-0000-4000-8000-000000000001';
const MEETING_REF = `professional:meeting:${MEETING_ID}`;
const meeting = {
  schema_version: 2, id: MEETING_ID, title: 'HALT NSW board meeting',
  scheduled_start: '2026-09-24T08:00:00.000Z', scheduled_end: '2026-09-24T09:15:00.000Z', time_zone: 'Australia/Sydney',
  location_text: 'Teams', agenda: '1. Minutes\n2. Treasurer’s report\n3. Medal ceremony run sheet', notes: null, state: 'scheduled',
  occurrence_history: [], created_at: '', updated_at: '', purpose: null, blocks: [], decisions: []
};

vi.mock('@/api/meetings', () => ({
  getMeeting: vi.fn(async () => ({ meeting })),
  updateMeeting: vi.fn(async (_id: string, patch: object) => ({ meeting: { ...meeting, ...patch } }))
}));
vi.mock('@/views/meetings', () => ({ buildMeetingTaskLinks: () => document.createElement('section') }));
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async () => ({ outgoing: [
    { link: { id: 'a1', source_ref: MEETING_REF, target_ref: 'shared:person:vicki', relationship_type: 'attendee', role: 'chair', status: 'current' },
      endpoint: { ref: 'shared:person:vicki', kind: 'person', display_label: 'Vicki Sheehan', href: null }, direction: 'outgoing' },
    { link: { id: 'a2', source_ref: MEETING_REF, target_ref: 'shared:person:greg', relationship_type: 'attendee', role: null, status: 'current' },
      endpoint: { ref: 'shared:person:greg', kind: 'person', display_label: 'Greg R.', href: null }, direction: 'outgoing' }
  ], incoming: [] })),
  createTask: vi.fn(async () => ({ id: 'task_1', title: 'x' }))
}));
vi.mock('@/api/people-directory', () => ({
  fetchPeopleDirectory: vi.fn(async () => ({ people: [
    { ref: 'shared:person:vicki', display_name: 'Vicki Sheehan', initials: 'VS', organisation: { ref: 'o', display_name: 'HALT NSW', monogram: 'H', logo_key: null, current: true }, warmth_band: 'warm', created_at: '2024-01-01T00:00:00.000Z' },
    { ref: 'shared:person:greg', display_name: 'Greg R.', initials: 'GR', organisation: { ref: 'o', display_name: 'HALT NSW', monogram: 'H', logo_key: null, current: true }, warmth_band: 'cooling', created_at: '2024-01-01T00:00:00.000Z' }
  ], organisations: [], counts: { people: 2, organisations: 1 } }))
}));
vi.mock('@/api/ledger', () => ({
  listLedgerForSources: vi.fn(async () => ({ items: [] })),
  createLedgerItem: vi.fn(async (body: object) => ({ item: { id: 'l', status: 'open', ...body }, created: true })),
  patchLedger: vi.fn()
}));
let savedBlocks: unknown[] = [];
vi.mock('@/components/block-page', () => ({
  mountBlockPage: vi.fn((host: HTMLElement, options: { blocks: unknown[]; onSave: (blocks: unknown[]) => Promise<void> }) => {
    savedBlocks = options.blocks;
    host.append(Object.assign(document.createElement('div'), { className: 'block-page-stub' }));
    return { flush: async () => {}, current: () => savedBlocks, dispose: () => {}, save: options.onSave };
  })
}));

import { renderMeetingPage } from '@/views/meeting-page';
import { mountBlockPage } from '@/components/block-page';
import { updateMeeting } from '@/api/meetings';

describe('meeting page', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-09-24T08:30:00.000Z') }));
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  async function render() {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    await renderMeetingPage(canvas, MEETING_ID, { isCurrent: () => true, onTitleReady: () => {} });
    return canvas;
  }

  it('is live during the meeting, shows purpose and the room by organisation', async () => {
    const canvas = await render();
    expect(canvas.querySelector('[data-phase]')?.getAttribute('data-phase')).toBe('during');
    expect(canvas.querySelector('[data-part="purpose"]')).not.toBeNull();
    const room = canvas.querySelector('[data-part="room"]')!;
    expect(room.textContent).toContain('HALT NSW');
    expect(room.querySelectorAll('[data-warmth="3"]').length).toBe(1);
  });

  it('seeds the notes with the agenda as headings', async () => {
    await render();
    const blocks = (mountBlockPage as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1].blocks as Array<{ block_type: string; content: { text?: string } }>;
    expect(blocks.filter((block) => block.block_type === 'heading').map((block) => block.content.text)).toEqual([
      'Minutes', 'Treasurer’s report', 'Medal ceremony run sheet'
    ]);
  });

  it('saving notes stores blocks and the decisions found in them', async () => {
    await render();
    const onSave = (mountBlockPage as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1].onSave as (blocks: unknown[]) => Promise<void>;
    await onSave([
      { id: 'h', block_type: 'heading', content: { text: 'Minutes' } },
      { id: 'r', block_type: 'rich_text', content: { html: '<p>✓ Minutes accepted</p>' } }
    ]);
    expect(updateMeeting).toHaveBeenCalledWith(MEETING_ID, expect.objectContaining({
      decisions: [expect.objectContaining({ text: 'Minutes accepted', agenda_heading: 'Minutes' })]
    }));
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/meeting-page.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement** `views/meeting-page.ts`

```ts
import { getMeeting, updateMeeting } from '@/api/meetings';
import { createTask, listUniversalLinksForEntity } from '@/api/universal-links';
import { fetchPeopleDirectory } from '@/api/people-directory';
import { createLedgerItem, listLedgerForSources, patchLedger } from '@/api/ledger';
import { mountBlockPage, type BlockPageHandle } from '@/components/block-page';
import { buildMeetingTaskLinks } from '@/views/meetings';
import { nextSwitchDelayMs, phaseFor, type CommPhase } from '@/lib/comm-phase';
import { blockPlainText, extractInlinePromises, resolvePromiseOwner } from '@/lib/inline-promises';
import { agendaToBlocks, extractDecisions, extractMentions } from '@/lib/meeting-notes';
import { groupRoom, type RoomCluster } from '@/lib/room';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { LedgerItem, MeetingRecord } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function renderMeetingPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void }
): Promise<void> {
  showViewLoading(canvas, 'Loading…');
  const meetingRef = `professional:meeting:${id}`;
  let record: MeetingRecord;
  let room: RoomCluster[];
  let people: Array<{ ref: string; name: string }>;
  let ledger: LedgerItem[];
  try {
    record = (await getMeeting(id)).meeting;
    const [links, directory, ledgerResult] = await Promise.all([
      listUniversalLinksForEntity(meetingRef),
      fetchPeopleDirectory().catch(() => ({ people: [], organisations: [], counts: { people: 0, organisations: 0 } })),
      listLedgerForSources([meetingRef])
    ]);
    const attendees = links.outgoing
      .filter((entry) => entry.link.relationship_type === 'attendee' && entry.link.status === 'current')
      .map((entry) => ({ ref: entry.endpoint.ref, role: (entry.link as { role?: string | null }).role ?? null, name: entry.endpoint.display_label }));
    room = groupRoom(attendees, directory.people, new Date());
    people = attendees.map((attendee) => ({ ref: attendee.ref, name: attendee.name }));
    ledger = ledgerResult.items;
  } catch (err) {
    renderLoadError(canvas, err, () => void renderMeetingPage(canvas, id, options));
    return;
  }
  if (!options.isCurrent()) return;
  options.onTitleReady(record.title);

  const slot = { scheduled_start: record.scheduled_start, scheduled_end: record.scheduled_end };
  let manual = false;
  let blockPage: BlockPageHandle | null = null;

  const root = el('div', 'meeting-page');
  const head = el('header', 'meeting-page__head');
  head.append(el('span', 'chip chip--meet', `● Meeting${record.location_text ? ` · ${record.location_text}` : ''}`));
  const switcher = el('div', 'comm-page__phase');
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
  head.append(switcher);

  const purpose = el('section', 'meeting-page__purpose');
  purpose.dataset.part = 'purpose';
  purpose.append(el('b', undefined, 'Why you’re there'));
  const purposeText = el('textarea', 'meeting-page__purpose-text') as HTMLTextAreaElement;
  purposeText.value = record.purpose ?? '';
  purposeText.placeholder = 'What you want out of this meeting';
  purposeText.setAttribute('aria-label', 'Why you’re there');
  purposeText.addEventListener('change', async () => {
    record = (await updateMeeting(id, { purpose: purposeText.value })).meeting;
  });
  purpose.append(purposeText);

  const main = el('div', 'meeting-page__main');
  const side = el('aside', 'meeting-page__side');
  side.append(roomCard(room));
  const actions = el('section', 'card');
  actions.dataset.part = 'actions';
  const mentions = el('section', 'card');
  mentions.dataset.part = 'mentions';
  side.append(actions, mentions, buildMeetingTaskLinks(record, () => renderMeetingPage(canvas, id, options)));
  const grid = el('div', 'meeting-page__grid');
  grid.append(main, side);
  root.append(head, purpose, grid);
  canvas.replaceChildren(root);
  paintActions();
  paintMentions(record.blocks ?? []);

  function setPhase(next: CommPhase): void {
    root.dataset.phase = next;
    for (const button of switcher.querySelectorAll<HTMLButtonElement>('[data-set-phase]')) {
      button.setAttribute('aria-pressed', String(button.dataset.setPhase === next));
    }
    void blockPage?.flush();
    blockPage?.dispose();
    main.replaceChildren();
    const body = el('div', 'meeting-page__notes');
    main.append(body);
    let n = 0;
    const seeded = (record.blocks ?? []).length ? (record.blocks as never[]) : (agendaToBlocks(record.agenda ?? '', () => `block_${++n}`) as never[]);
    blockPage = mountBlockPage(body, {
      blocks: seeded,
      editable: true,
      onSave: async (blocks) => {
        const found = extractDecisions(blocks as Array<{ block_type: string; content?: unknown }>);
        const decisions = found.map((decision, index) => ({ id: `d_${index + 1}`, ...decision }));
        record = (await updateMeeting(id, { blocks, decisions })).meeting;
        await syncPromises(blocks);
        paintActions();
        paintMentions(blocks);
      }
    });
  }

  async function syncPromises(blocks: unknown[]): Promise<void> {
    for (const promise of extractInlinePromises(blockPlainText(blocks))) {
      const owner = resolvePromiseOwner(promise.owner, people);
      if (!owner) continue;
      const { item, created } = await createLedgerItem({ ...owner, text: promise.text, comm_ref: meetingRef });
      if (created) ledger.push(item);
    }
  }

  function paintActions(): void {
    actions.replaceChildren(el('h3', undefined, 'Actions'));
    for (const item of ledger.filter((entry) => entry.status === 'open')) {
      const row = el('div', `meeting-page__action is-${item.direction === 'you_owe' ? 'mine' : 'theirs'}`, item.text);
      if (item.direction === 'you_owe' && !item.task_ref) {
        const make = el('button', 'btn btn--ghost', 'Make task') as HTMLButtonElement;
        make.type = 'button';
        make.addEventListener('click', async () => {
          make.disabled = true;
          const task = await createTask({ title: item.text });
          Object.assign(item, (await patchLedger(item.id, { task_ref: `tasks:task:${task.id}` })).item);
          make.replaceWith(el('span', 'quiet-link', '✓ task linked'));
        });
        row.append(make);
      }
      actions.append(row);
    }
    for (const decision of record.decisions ?? []) {
      actions.append(el('div', 'meeting-page__decision', `✓ ${decision.text}${decision.agenda_heading ? ` · ${decision.agenda_heading}` : ''}`));
    }
  }

  function paintMentions(blocks: unknown[]): void {
    mentions.replaceChildren(el('h3', undefined, 'Who said what'));
    for (const mention of extractMentions(blockPlainText(blocks))) {
      const block = el('div', 'meeting-page__mention');
      block.append(el('b', undefined, mention.name));
      for (const line of mention.lines) block.append(el('p', undefined, line));
      const known = people.some((person) => person.name.toLowerCase().startsWith(mention.name.toLowerCase()));
      if (!known) {
        const add = el('a', 'btn btn--ghost', 'Add to People') as HTMLAnchorElement;
        add.href = '#/people';
        block.append(add);
      }
      mentions.append(block);
    }
  }

  function scheduleClock(): void {
    const delay = nextSwitchDelayMs(slot, new Date());
    if (delay === null) return;
    setTimeout(() => {
      if (!root.isConnected) return;
      if (!manual) setPhase(phaseFor(slot, new Date()));
      scheduleClock();
    }, delay);
  }

  setPhase(phaseFor(slot, new Date()));
  scheduleClock();
}

function roomCard(room: RoomCluster[]): HTMLElement {
  const card = el('section', 'card');
  card.dataset.part = 'room';
  card.append(el('h3', undefined, `The room · ${room.reduce((total, cluster) => total + cluster.people.length, 0)}`));
  for (const cluster of room) {
    const group = el('div', 'room__org');
    group.append(el('p', 'room__org-name', cluster.organisation ?? 'No organisation yet'));
    for (const person of cluster.people) {
      const row = el('div', 'room__person');
      row.dataset.warmth = String(person.warmthDots);
      row.append(el('span', 'room__initials', person.initials), el('span', undefined, person.name));
      if (person.role) row.append(el('span', 'muted', person.role));
      if (person.isNew) row.append(el('span', 'chip chip--warn', 'New to you'));
      const dots = el('span', 'room__warmth');
      dots.setAttribute('aria-label', `Warmth ${person.warmthDots} of 3`);
      for (let i = 1; i <= 3; i += 1) dots.append(el('i', i <= person.warmthDots ? 'is-on' : ''));
      row.append(dots);
      group.append(row);
    }
    card.append(group);
  }
  return card;
}
```

Notes:
- The notes stay editable in every phase, because you prep notes before a meeting too.
- Check that `getMeeting` returns `{ meeting }` and `getEvent` returns `{ event }` (`api/meetings.ts`, `api/events.ts`). If the key differs, use the real one in the pages and the test mocks.
- "Add to People" links to People, where the existing add-person form lives. Plan 4 can prefill the name if the People page gains an `?add=` parameter.
- Check the attendee link's `role` field name in `UniversalLinkRecord` (`api/universal-links.ts`). Add `role?: string | null` there if the projection carries it, and drop the cast.

- [ ] **Step 5: Styles** `styles/meeting-page.css`

Port the mockup's `.purpose`, `.org-cluster`, `.pp`, `.warm`, `.agh`, `.dec` rules (tab 4 of `docs/professional-hub/calendar/mockups/index.html`) to the class names above, using tokens only. Then add:

```css
.meeting-page{display:grid;gap:var(--space-5)}
.meeting-page__grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:var(--space-5);align-items:start}
@media (max-width:900px){.meeting-page__grid{grid-template-columns:1fr}}
.meeting-page__purpose{display:grid;gap:var(--space-2);padding:var(--space-4);border-radius:var(--radius-md);background:var(--pastel-lilac);color:var(--pastel-lilac-ink)}
.room__warmth i{display:inline-block;width:5px;height:5px;border-radius:50%;margin-left:2px;background:var(--line)}
.room__warmth i.is-on{background:var(--high-sea)}
```

Import it in `main.ts`.

- [ ] **Step 6: Route `#/meeting/<id>`** in `main.ts`: replace the `meeting` branch's `renderMeetingDetailView` call with `renderMeetingPage`, using the same header pattern as the comm branch and eyebrow `'Calendar · Meeting'`.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/meeting-page.test.ts tests/unit/meetings-events.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/professional/src apps/professional/tests/unit/meeting-page.test.ts
git commit -m "feat(professional): meeting page with purpose, room, notes on the agenda and decisions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The event page, with the PD switch, shape, talks and Knowledge notes

Replaces `renderEventDetailView` for `#/event/<id>`. The existing learning-task panel moves in unchanged.

**Files:**
- Create: `apps/professional/src/views/event-page.ts`, `apps/professional/src/styles/event-page.css`
- Modify: `apps/professional/src/views/events.ts` (export the learning-task and PD-fields builders), `apps/professional/src/app/main.ts`
- Test: `apps/professional/tests/unit/event-page.test.ts`

- [ ] **Step 1: Split out the PD sections from `events.ts`**

In `renderEventDetailView`, find the code that builds:
- the learning-task panel (the `mountTaskLinkPanel` with `relationshipType: 'learning_for'`)
- the PD field editors (hours, accreditation, priority area, attendance, certificate)

Move them into these two exports:

```ts
export function buildLearningTaskPanel(record: EventRecord, reload: () => Promise<void>): HTMLElement
export function buildPdFields(record: EventRecord, onSaved: (next: EventRecord) => void): HTMLElement
```

`renderEventDetailView` calls both. Run `npx vitest run tests/unit/meetings-events.test.ts`: it should pass unchanged.

- [ ] **Step 2: Write the failing tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const EVENT_ID = 'event_00000000-0000-4000-8000-000000000001';
const EVENT_REF = `professional:event:${EVENT_ID}`;
const GROUP_ID = 'pd_group_00000000-0000-4000-8000-000000000001';
const base = {
  schema_version: 2, id: EVENT_ID, title: 'Warlight: Critical Study of Literature', event_type: 'professional_development',
  start: '2026-09-17T23:00:00.000Z', end: '2026-09-18T05:00:00.000Z', time_zone: 'Australia/Sydney', all_day: false,
  occurrence_state: 'completed', location_text: "St Aloysius' College", accreditation_category: null, priority_area: null,
  hours: 6, attendance_state: 'attended', certificate: null, created_at: '', updated_at: '',
  talks: [{ id: 't1', time: '09:00', title: 'Keynote · Reading against the grain', presenter: 'Dr Mia L.', hours: 1.5 }],
  blocks: []
};
let current = { ...base };

vi.mock('@/api/events', () => ({
  getEvent: vi.fn(async () => ({ event: current })),
  updateEvent: vi.fn(async (_id: string, patch: object) => { current = { ...current, ...patch }; return { event: current }; })
}));
vi.mock('@/views/events', () => ({
  buildLearningTaskPanel: () => Object.assign(document.createElement('section'), { className: 'learning-stub' }),
  buildPdFields: () => Object.assign(document.createElement('section'), { className: 'pd-fields-stub' })
}));
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async (ref: string) => ref === EVENT_REF
    ? { outgoing: [
        { link: { id: 'g', source_ref: EVENT_REF, target_ref: `professional:pd_group:${GROUP_ID}`, relationship_type: 'in_pd_group', status: 'current' },
          endpoint: { ref: `professional:pd_group:${GROUP_ID}`, kind: 'pd_group', display_label: 'Warlight', href: null }, direction: 'outgoing' }
      ], incoming: [] }
    : { outgoing: [], incoming: [
        { link: { id: 'g', source_ref: EVENT_REF, target_ref: `professional:pd_group:${GROUP_ID}`, relationship_type: 'in_pd_group', status: 'current' },
          endpoint: { ref: EVENT_REF, kind: 'event', display_label: 'Warlight 1', href: null }, direction: 'incoming' }
      ] }),
  createUniversalLink: vi.fn(async () => ({ link: { id: 'new' }, created: true }))
}));
vi.mock('@/api/pd-groups', () => ({
  getPdGroup: vi.fn(async () => ({ group: { id: GROUP_ID, shape: 'series', title: 'Warlight', provider: 'Warlight', schema_version: 1, created_at: '', updated_at: '' } })),
  createPdGroup: vi.fn(async (body: object) => ({ group: { id: GROUP_ID, ...body } }))
}));
vi.mock('@/api/knowledge-notes', () => ({ createKnowledgeNote: vi.fn(async () => ({ id: 'page_1', title: 'Keynote' })) }));
vi.mock('@/components/block-page', () => ({
  mountBlockPage: vi.fn((host: HTMLElement) => {
    host.append(Object.assign(document.createElement('div'), { className: 'block-page-stub' }));
    return { flush: async () => {}, current: () => [], dispose: () => {} };
  })
}));

import { renderEventPage } from '@/views/event-page';
import { updateEvent } from '@/api/events';
import { createKnowledgeNote } from '@/api/knowledge-notes';
import { createUniversalLink } from '@/api/universal-links';

async function render() {
  const canvas = document.createElement('div');
  document.body.append(canvas);
  await renderEventPage(canvas, EVENT_ID, { isCurrent: () => true, onTitleReady: () => {} });
  return canvas;
}

describe('event page', () => {
  afterEach(() => {
    document.body.replaceChildren();
    current = { ...base };
  });

  it('PD event shows the switch on, shape, series strip, talks and PD panels', async () => {
    const canvas = await render();
    expect(canvas.querySelector('[data-part="pd-switch"]')?.getAttribute('aria-checked')).toBe('true');
    expect(canvas.querySelector('[data-part="shape"] [aria-checked="true"]')?.textContent).toContain('Series');
    expect(canvas.querySelector('[data-part="series"]')).not.toBeNull();
    expect(canvas.querySelector('[data-part="talks"]')?.textContent).toContain('Keynote · Reading against the grain');
    expect(canvas.querySelector('.pd-fields-stub')).not.toBeNull();
    expect(canvas.querySelector('.learning-stub')).not.toBeNull();
    expect(canvas.querySelector('.block-page-stub')).not.toBeNull();
  });

  it('turning PD off makes it a general event and hides the PD panels', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-part="pd-switch"]')!.click();
    await vi.waitFor(() => expect(updateEvent).toHaveBeenCalledWith(EVENT_ID, { event_type: 'general' }));
    await vi.waitFor(() => expect(canvas.querySelector('.pd-fields-stub')).toBeNull());
  });

  it('Make note creates a Knowledge page and links it to the talk', async () => {
    const canvas = await render();
    canvas.querySelector<HTMLButtonElement>('[data-talk-note="t1"]')!.click();
    await vi.waitFor(() => expect(createKnowledgeNote).toHaveBeenCalled());
    expect(createUniversalLink).toHaveBeenCalledWith({
      source_ref: EVENT_REF, target_ref: 'knowledge:page:page_1', relationship_type: 'talk_note', metadata: { talk_id: 't1' }
    });
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/event-page.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement** `views/event-page.ts`

```ts
import { getEvent, updateEvent } from '@/api/events';
import { createUniversalLink, listUniversalLinksForEntity } from '@/api/universal-links';
import { createPdGroup, getPdGroup } from '@/api/pd-groups';
import { createKnowledgeNote } from '@/api/knowledge-notes';
import { mountBlockPage } from '@/components/block-page';
import { buildLearningTaskPanel, buildPdFields } from '@/views/events';
import { groupTotals, talkHoursNote } from '@/lib/pd-totals';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { EventRecord, EventTalk, PdGroupRecord } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const PD = 'professional_development';

type Loaded = {
  record: EventRecord;
  group: PdGroupRecord | null;
  members: EventRecord[];
  notedTalks: Map<string, string>;
};

async function load(id: string): Promise<Loaded> {
  const record = (await getEvent(id)).event;
  const eventRef = `professional:event:${id}`;
  const links = await listUniversalLinksForEntity(eventRef);
  const current = links.outgoing.filter((entry) => entry.link.status === 'current');
  const groupEntry = current.find((entry) => entry.link.relationship_type === 'in_pd_group') ?? null;
  const notedTalks = new Map<string, string>();
  for (const entry of current.filter((item) => item.link.relationship_type === 'talk_note')) {
    const talkId = (entry.link as { metadata?: { talk_id?: string } }).metadata?.talk_id;
    if (talkId) notedTalks.set(talkId, entry.endpoint.href ?? '');
  }
  let group: PdGroupRecord | null = null;
  let members: EventRecord[] = [record];
  if (groupEntry) {
    const groupId = groupEntry.endpoint.ref.split(':').pop()!;
    group = (await getPdGroup(groupId)).group;
    const memberRefs = (await listUniversalLinksForEntity(groupEntry.endpoint.ref)).incoming
      .filter((entry) => entry.link.relationship_type === 'in_pd_group' && entry.link.status === 'current')
      .map((entry) => entry.link.source_ref.split(':').pop()!);
    members = await Promise.all(memberRefs.map(async (memberId) => (memberId === id ? record : (await getEvent(memberId)).event)));
  }
  return { record, group, members, notedTalks };
}

export async function renderEventPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void }
): Promise<void> {
  showViewLoading(canvas, 'Loading…');
  let data: Loaded;
  try {
    data = await load(id);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderEventPage(canvas, id, options));
    return;
  }
  if (!options.isCurrent()) return;
  options.onTitleReady(data.record.title);
  const eventRef = `professional:event:${id}`;
  const rerender = () => renderEventPage(canvas, id, options);

  const root = el('div', 'event-page');
  const isPd = data.record.event_type === PD;
  root.dataset.pd = String(isPd);

  const toggleRow = el('div', 'pd-toggle');
  const toggle = el('button', 'switch') as HTMLButtonElement;
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', String(isPd));
  toggle.setAttribute('aria-label', 'Counts as PD');
  toggle.dataset.part = 'pd-switch';
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    await updateEvent(id, { event_type: isPd ? 'general' : PD });
    await rerender();
  });
  toggleRow.append(toggle, el('b', undefined, 'Counts as PD'),
    el('span', 'muted', isPd ? 'Feeds the PD dashboard' : 'Off. No hours or evidence.'));
  root.append(toggleRow);

  if (isPd) {
    root.append(shapePicker(), talksCard(), buildPdFields(data.record, (next) => { data.record = next; }), buildLearningTaskPanel(data.record, rerender));
    if (data.group) root.append(seriesStrip(data.group));
  }

  const notes = el('section', 'event-page__notes');
  notes.append(el('h3', undefined, isPd ? 'Reflection and notes' : 'Notes'));
  const body = el('div');
  notes.append(body);
  root.append(notes);
  mountBlockPage(body, {
    blocks: (data.record.blocks ?? []) as never[],
    onSave: async (blocks) => {
      data.record = (await updateEvent(id, { blocks })).event;
    }
  });
  canvas.replaceChildren(root);

  function shapePicker(): HTMLElement {
    const group = el('div', 'shape');
    group.dataset.part = 'shape';
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'PD shape');
    const currentShape = data.group?.shape ?? 'one_off';
    const options: Array<[string, string, string]> = [
      ['one_off', 'One-off', 'One Zoom, one day, one session'],
      ['series', 'Series', 'Sessions weeks apart, one program'],
      ['program', 'Program', 'Multi-day seminar, one event per day']
    ];
    for (const [value, label, help] of options) {
      const button = el('button', `shape__opt${value === currentShape ? ' is-on' : ''}`) as HTMLButtonElement;
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(value === currentShape));
      button.append(el('b', undefined, label), el('small', undefined, help));
      button.addEventListener('click', async () => {
        if (value === currentShape || value === 'one_off') return;
        const { group: created } = await createPdGroup({ shape: value as 'series' | 'program', title: data.record.title });
        await createUniversalLink({ source_ref: eventRef, target_ref: `professional:pd_group:${created.id}`, relationship_type: 'in_pd_group' });
        await rerender();
      });
      group.append(button);
    }
    return group;
  }

  function seriesStrip(group: PdGroupRecord): HTMLElement {
    const totals = groupTotals(data.members);
    const card = el('section', 'card');
    card.dataset.part = 'series';
    const title = el('h3', undefined, `${group.shape === 'series' ? 'The series' : 'The program'} · ${totals.hoursDone}/${totals.hoursTotal} h`);
    const open = el('a', 'btn btn--ghost', 'Open') as HTMLAnchorElement;
    open.href = `#/pd-group/${encodeURIComponent(group.id)}`;
    card.append(title, open);
    const strip = el('div', 'series');
    for (const session of totals.sessions) {
      const cell = el('a', `series__session${session.id === id ? ' is-current' : ''}${session.done ? '' : ' is-future'}`) as HTMLAnchorElement;
      cell.href = `#/event/${encodeURIComponent(session.id)}`;
      cell.append(el('span', 'series__date', session.label), el('span', 'series__hours', session.hours == null ? '' : `${session.hours} h`));
      if (session.gapAfter) cell.append(el('span', 'series__gap', session.gapAfter));
      strip.append(cell);
    }
    card.append(strip);
    const add = el('a', 'btn btn--ghost', group.shape === 'program' ? '＋ Next day' : '＋ Next session') as HTMLAnchorElement;
    add.href = `#/event/new?pd_group=${encodeURIComponent(group.id)}`;
    card.append(add);
    return card;
  }

  function talksCard(): HTMLElement {
    const card = el('section', 'card');
    card.dataset.part = 'talks';
    card.append(el('h3', undefined, 'Talks and activities'));
    const list = el('div', 'prog');
    for (const talk of data.record.talks ?? []) list.append(talkRow(talk));
    card.append(list);
    const note = talkHoursNote(data.record.talks ?? [], data.record.hours);
    if (note) card.append(el('p', 'muted', note));
    const form = el('form', 'talk-add');
    const time = el('input') as HTMLInputElement;
    time.type = 'time';
    time.setAttribute('aria-label', 'Talk time');
    const title = el('input') as HTMLInputElement;
    title.placeholder = 'Talk or activity';
    title.setAttribute('aria-label', 'Talk title');
    const hours = el('input') as HTMLInputElement;
    hours.type = 'number';
    hours.step = '0.25';
    hours.min = '0';
    hours.placeholder = 'h';
    hours.setAttribute('aria-label', 'Talk hours');
    const add = el('button', 'btn btn--ghost', '＋ Add') as HTMLButtonElement;
    add.type = 'submit';
    form.append(time, title, hours, add);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!title.value.trim()) return;
      const talks: EventTalk[] = [...(data.record.talks ?? []), {
        id: `t_${Date.now()}`, time: time.value || null, title: title.value.trim(), presenter: null, hours: hours.value ? Number(hours.value) : null
      }];
      data.record = (await updateEvent(id, { talks })).event;
      await rerender();
    });
    card.append(form);
    return card;
  }

  function talkRow(talk: EventTalk): HTMLElement {
    const row = el('div', 'pi');
    row.append(el('span', 'pi__time', talk.time ?? ''), el('span', 'pi__title', talk.title),
      el('span', 'pi__who', [talk.presenter, talk.hours != null ? `${talk.hours} h` : null].filter(Boolean).join(' · ')));
    const href = data.notedTalks.get(talk.id);
    if (href !== undefined) {
      const link = el('a', 'kn', '✓ Knowledge note') as HTMLAnchorElement;
      if (href) link.href = href;
      row.append(link);
    } else {
      const make = el('button', 'kn is-draft', '＋ Make note') as HTMLButtonElement;
      make.type = 'button';
      make.dataset.talkNote = talk.id;
      make.addEventListener('click', async () => {
        make.disabled = true;
        const page = await createKnowledgeNote({
          title: talk.title,
          body: [talk.presenter, data.record.title, data.record.location_text].filter(Boolean).join(' · '),
          tags: ['pd']
        });
        await createUniversalLink({ source_ref: eventRef, target_ref: `knowledge:page:${page.id}`, relationship_type: 'talk_note', metadata: { talk_id: talk.id } });
        make.replaceWith(el('span', 'kn', '✓ Knowledge note'));
      });
      row.append(make);
    }
    return row;
  }
}
```

Check against the codebase:
- `createUniversalLink`'s body type (Plan 2 read it) already allows `metadata`. Keep that call shape.
- If `UniversalLinkRecord` has no `metadata` field, add `metadata?: Record<string, unknown>` in `api/universal-links.ts`, and drop the cast in `load`.
- Check the "New event" view reads `?pd_group=` for "＋ Next session": `grep -n "pd_group\|URLSearchParams" apps/professional/src/views/events.ts`. If it doesn't, add this to `renderEventNewView`: after a successful create, if the hash has `pd_group`, call `createUniversalLink({ source_ref: 'professional:event:<new id>', target_ref: 'professional:pd_group:<id>', relationship_type: 'in_pd_group' })` and set the new event's `event_type` to PD. Also make `parseRoute` ignore the query part, which it already does (`split('?')[0]`).

- [ ] **Step 5: Styles** `styles/event-page.css`

Port the mockup's `.pd-toggle`, `.shape`, `.series`, `.sn`, `.prog`, `.pi`, `.kn` rules (tab 5) to the classes above, using tokens only. Then add:

```css
.event-page{display:grid;gap:var(--space-4);max-width:72rem}
.talk-add{display:grid;grid-template-columns:7rem minmax(0,1fr) 5rem auto;gap:var(--space-2);margin-top:var(--space-3)}
@media (max-width:620px){.talk-add{grid-template-columns:1fr 1fr}}
```

Import it in `main.ts`.

- [ ] **Step 6: Route `#/event/<id>`** in `main.ts` to `renderEventPage`, with eyebrow `'Calendar · Event'`.

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/event-page.test.ts tests/unit/meetings-events.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/professional/src apps/professional/tests/unit/event-page.test.ts
git commit -m "feat(professional): event page with Counts as PD, shape, talks and Knowledge notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The PD group page

**Files:**
- Create: `apps/professional/src/views/pd-group-page.ts`
- Modify: `apps/professional/src/app/router.ts`, `apps/professional/src/app/main.ts`
- Test: `apps/professional/tests/unit/pd-group-page.test.ts`, `apps/professional/tests/unit/router.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Router (append):

```ts
it('pd-group route validates the id', () => {
  const id = 'pd_group_00000000-0000-4000-8000-000000000001';
  expect(parseRoute(`#/pd-group/${id}`)).toEqual({ name: 'pd-group', id });
  expect(parseRoute('#/pd-group/nope').name).toBe('not-found');
});
```

Page:

```ts
import { describe, expect, it, vi } from 'vitest';

const GROUP_ID = 'pd_group_00000000-0000-4000-8000-000000000001';
const GROUP_REF = `professional:pd_group:${GROUP_ID}`;
const ev = (n: number, start: string, hours: number, state: string, attendance: string | null) => ({
  id: `event_00000000-0000-4000-8000-00000000000${n}`, title: `Warlight ${n}`, start, end: start, hours,
  occurrence_state: state, attendance_state: attendance, time_zone: 'Australia/Sydney', event_type: 'professional_development'
});
const events = [ev(1, '2026-09-17T23:00:00.000Z', 6, 'completed', 'attended'), ev(2, '2026-10-29T22:00:00.000Z', 6, 'scheduled', 'registered')];

vi.mock('@/api/pd-groups', () => ({ getPdGroup: vi.fn(async () => ({ group: { id: GROUP_ID, shape: 'series', title: 'Warlight', provider: 'Warlight' } })) }));
vi.mock('@/api/universal-links', () => ({
  listUniversalLinksForEntity: vi.fn(async () => ({ outgoing: [], incoming: events.map((event) => ({
    link: { id: event.id, source_ref: `professional:event:${event.id}`, target_ref: GROUP_REF, relationship_type: 'in_pd_group', status: 'current' },
    endpoint: { ref: `professional:event:${event.id}`, kind: 'event', display_label: event.title, href: null }, direction: 'incoming'
  })) }))
}));
vi.mock('@/api/events', () => ({ getEvent: vi.fn(async (id: string) => ({ event: events.find((event) => event.id === id) })) }));

import { renderPdGroupPage } from '@/views/pd-group-page';

describe('PD group page', () => {
  it('lists sessions in order with gaps and hours', async () => {
    const canvas = document.createElement('div');
    await renderPdGroupPage(canvas, GROUP_ID, { isCurrent: () => true, onTitleReady: () => {} });
    expect(canvas.textContent).toContain('6/12 h');
    expect([...canvas.querySelectorAll('[data-part="session"]')].map((node) => node.textContent)).toEqual([
      expect.stringContaining('18/09'), expect.stringContaining('30/10')
    ]);
    expect(canvas.textContent).toContain('6 wks');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/pd-group-page.test.ts tests/unit/router.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Router:
- Add `isValidPdGroupId` to the import.
- Add `| { name: 'pd-group'; id: string }` to the `Route` union.
- Add this before the not-found fallthrough:

```ts
  if (segments.length === 2 && segments[0] === 'pd-group') {
    const id = safeDecode(segments[1]!);
    if (id && isValidPdGroupId(id)) return { name: 'pd-group', id };
    return { name: 'not-found', path };
  }
```

In `railHighlightFor`, map `'pd-group'` to `'calendar'`.

`views/pd-group-page.ts`:

```ts
import { getPdGroup } from '@/api/pd-groups';
import { getEvent } from '@/api/events';
import { listUniversalLinksForEntity } from '@/api/universal-links';
import { groupTotals } from '@/lib/pd-totals';
import { renderLoadError, showViewLoading } from '@/views/feedback';
import type { EventRecord } from '@/domain/types';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function renderPdGroupPage(
  canvas: HTMLElement,
  id: string,
  options: { isCurrent: () => boolean; onTitleReady: (title: string) => void }
): Promise<void> {
  showViewLoading(canvas, 'Loading…');
  try {
    const { group } = await getPdGroup(id);
    const incoming = (await listUniversalLinksForEntity(`professional:pd_group:${id}`)).incoming
      .filter((entry) => entry.link.relationship_type === 'in_pd_group' && entry.link.status === 'current');
    const events: EventRecord[] = await Promise.all(incoming.map(async (entry) => (await getEvent(entry.link.source_ref.split(':').pop()!)).event));
    if (!options.isCurrent()) return;
    options.onTitleReady(group.title);
    const totals = groupTotals(events);
    const byId = new Map(events.map((event) => [event.id, event]));

    const root = el('div', 'pd-group-page');
    root.append(el('p', 'eyebrow', group.shape === 'series' ? 'PD series' : 'PD program'),
      el('p', 'pd-group-page__hours', `${totals.hoursDone}/${totals.hoursTotal} h`));
    const list = el('ol', 'pd-group-page__sessions');
    for (const session of totals.sessions) {
      const item = el('li', `pd-group-page__session${session.done ? ' is-done' : ''}`);
      item.dataset.part = 'session';
      const link = el('a', undefined, `${session.label} · ${byId.get(session.id)?.title ?? ''}`) as HTMLAnchorElement;
      link.href = `#/event/${encodeURIComponent(session.id)}`;
      item.append(link, el('span', 'muted', session.hours == null ? '' : ` · ${session.hours} h`));
      if (session.gapAfter) item.append(el('span', 'pd-group-page__gap', ` then ${session.gapAfter}`));
      list.append(item);
    }
    const add = el('a', 'btn btn--secondary', group.shape === 'program' ? '＋ Next day' : '＋ Next session') as HTMLAnchorElement;
    add.href = `#/event/new?pd_group=${encodeURIComponent(id)}`;
    root.append(list, add);
    canvas.replaceChildren(root);
  } catch (err) {
    renderLoadError(canvas, err, () => void renderPdGroupPage(canvas, id, options));
  }
}
```

`main.ts`: add a `pd-group` branch in the same pattern as `thread` (Plan 2), with eyebrow `'Calendar · PD'`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src apps/professional/tests
git commit -m "feat(professional): PD series and program page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Full check

- [ ] **Step 1:** `npm test`. Expected: all pass.
- [ ] **Step 2:** `cd apps/professional && npx vitest run && npx tsc --noEmit && cd ../.. && npm run build`. Expected: pass.
- [ ] **Step 3:** `node --test --test-concurrency=1 tests/browser/calendar-filter.spec.mjs tests/browser/professional-calendar-hub.spec.mjs && TIDELINE_APP=1 node --test tests/browser/tideline-visual.spec.mjs`. Expected: PASS.
- [ ] **Step 4: Walk it** (`cd apps/professional && npx vite`):
  - Open a meeting during its time. It's live, "Why you're there" saves, the room groups by organisation with warmth dots, and the notes start from the agenda as headings.
  - Type `✓ Minutes accepted` under a heading and `»me seating list to Vicki`: the decision and action appear on the right. Type `@Sam O. first time here`: "Add to People" shows.
  - Open Warlight: PD is on. Choose Series: a group is created and the strip shows. Add a talk, then Make note: a Knowledge page exists, linked back.
  - Turn PD off on the HALT ceremony: the PD panels go, the calendar shows it on the Events chip (gold), and the PD dashboard hours don't count it.
  - Check it all at 390px.
- [ ] **Step 5:** `git push`. Don't open a PR yet; Plan 4 follows.

---

## Self-review

**Spec coverage:**

| Spec item | Where it's handled |
|---|---|
| §5 purpose box | Tasks 1, 9 |
| §5 agenda and notes as one page, pasted agenda → headings | Tasks 6, 9 |
| §5 items you own | Task 9. Headings stay plain; marking "yours" comes from `»me` actions. A per-heading "mine" flag is left out (YAGNI) until Adam asks. |
| §5 decisions | Tasks 1, 6, 9 |
| §5 the room by organisation with warmth; new people | Tasks 7, 9 |
| §5 actions three ways | Task 9 |
| §5 `@name` | Tasks 6, 9 |
| §6 every event a block page; photos as a gallery block | Tasks 2, 10 |
| §6 Counts as PD switch | Tasks 2, 10 |
| §6 shape one-off / series / program; one event per day | Tasks 3, 4, 10, 11 |
| §6 PD group totals | Tasks 8, 10, 11 |
| §6 talks with hours; talk → Knowledge note | Tasks 2, 4, 5, 10 |
| §6 certificate per session | Task 10, through the existing `buildPdFields` on each event |
| §6 PD dashboard keeps reading PD events | Task 2 guard |

**Deferred to Plan 4:**
- Clare checking the outcome against the purpose, and carrying unmet ones to the next meeting.
- Transcripts.
- The "opportunity" capture.
- Decisions shown on the organisation page.
- Prefilling "Add to People" with the name.

**Types:**
- `MeetingDecision`, `EventTalk`, `PdGroupRecord` (Task 5) are used in 9–11.
- `groupRoom` / `RoomCluster` (7) are used in 9.
- `groupTotals` / `talkHoursNote` (8) are used in 10–11.
- `agendaToBlocks` / `extractDecisions` / `extractMentions` (6) are used in 9.
- `createKnowledgeNote` (5) is used in 10.
- `validateBlocks` (Plan 2 Task 1) is used in Tasks 1–2.
