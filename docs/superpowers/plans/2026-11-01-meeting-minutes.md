# Meeting Minutes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Minutes card on every Professional meeting page: Adam adds a PDF or pasted minutes, Clare reads them once, and he ticks which of his actions, other people's actions and decisions to save. Differences from his notes are flagged.

**Architecture:** A new `minutes` action on the existing `/api/clare/comms` endpoint reads the minutes (the PDF goes to Claude as a `document` block) and returns a checked review; it writes nothing. On **Save ticked items** the page uploads the PDF to a new private endpoint `/api/meetings/minutes-file`, creates ledger items and tasks through the existing ledger and task helpers, and PATCHes the meeting with a new `minutes` field and merged decisions. The card lives in its own module so `meeting-page.ts` (1,170 lines) only mounts it.

**Tech Stack:** Netlify Functions (ESM `.mjs`, `node:test`), Netlify Blobs (`professional-hub-content` store), Professional hub (TypeScript, Vite, Vitest + jsdom), Anthropic Messages API via `completeJson`.

**Spec:** `docs/superpowers/specs/2026-11-01-meeting-minutes-design.md`. This plan settles three points the spec left loose:
- **Who is Adam**: Clare's house prompt already names him and he is never in the attendee list, so the model returns `who: "me"` for his actions. No Central Node read.
- **No schema version bump**: `minutes` is an optional field, added the same way `coaching_sheets` was.
- **PDF cap is 4 MB**, not 5: base64 adds a third, and Netlify sync functions take about 6 MB of body.

**Privacy:** every test, fixture and mock uses invented people and meetings. Do not paste real minutes anywhere in the repo.

**Build mode** (memory: token-saving builds): implement in a few large chunks, run each task's tests, and run the full gate once at the end. No per-task reviewer subagents.

---

## File map

| File | Change |
|------|--------|
| `netlify/functions/_shared/meeting-schema.mjs` | `validateMinutes`; `minutes` in stored, update and projection keys; decisions keep `source` |
| `netlify/functions/_shared/clare-comms.mjs` | `readMinutes` job + `whoToPerson` matcher |
| `netlify/functions/clare-comms.mjs` | route `case 'minutes'` |
| `netlify/functions/meeting-minutes-file.mjs` | **new** POST (save PDF) / GET (read PDF) on the private store |
| `tests/unit/meeting-minutes-schema.test.js` | **new** |
| `tests/unit/clare-minutes.test.js` | **new** |
| `tests/unit/meeting-minutes-file.test.js` | **new** |
| `apps/professional/src/domain/types.ts` | `MeetingMinutes`; `minutes` on `MeetingRecord`; `source` on `MeetingDecision` |
| `apps/professional/src/api/meetings.ts` | `minutes` in `updateMeeting` patch |
| `apps/professional/src/api/clare-comms.ts` | `fileBase64`, `ClareMinutesReview`, `clareMinutes` |
| `apps/professional/src/api/meeting-minutes-file.ts` | **new** upload / fetch PDF |
| `apps/professional/src/lib/meeting-minutes.ts` | **new** pure helpers + `saveMinutesReview` |
| `apps/professional/src/views/meeting-minutes-card.ts` | **new** the card |
| `apps/professional/src/styles/meeting-page.css` | card styles |
| `apps/professional/src/views/meeting-page.ts` | mount the card in all phases; notes save keeps minutes decisions |
| `apps/professional/scripts/mock-api.ts` | mock `minutes` Clare action, minutes-file, PATCH `minutes` |
| `apps/professional/tests/unit/meeting-minutes.test.ts` | **new** helpers + save flow |
| `apps/professional/tests/unit/meeting-minutes-card.test.ts` | **new** card states |

---

### Task 1: Meeting schema stores minutes, decisions keep their source

**Files:**
- Modify: `netlify/functions/_shared/meeting-schema.mjs`
- Test: `tests/unit/meeting-minutes-schema.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/meeting-minutes-schema.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMinutes, validateDecisions, validateMeetingFieldUpdate, projectMeeting, parseMeetingRecord
} from '../../netlify/functions/_shared/meeting-schema.mjs';

const MEETING = 'meeting_00000000-0000-4000-8000-000000000001';
const good = () => ({
  sections: [{ heading: 'Assessment', text: 'Exams move to Week 8.' }],
  file_key: `meeting-minutes/${MEETING}/1762000000000.pdf`,
  source: 'page',
  added_at: '2026-11-01T02:00:00.000Z',
  saved_counts: { tasks: 1, promises: 2, decisions: 1 }
});

test('validateMinutes keeps a well-formed record and allows null', () => {
  assert.deepEqual(validateMinutes(good()), good());
  assert.equal(validateMinutes(null), null);
  assert.equal(validateMinutes({ ...good(), file_key: null }).file_key, null);
});

test('validateMinutes rejects bad keys, sources, sizes and counts', () => {
  assert.throws(() => validateMinutes({ ...good(), file_key: '../secrets.pdf' }), { code: 'invalid_minutes' });
  assert.throws(() => validateMinutes({ ...good(), source: 'email' }), { code: 'invalid_minutes' });
  assert.throws(() => validateMinutes({ ...good(), sections: 'x' }), { code: 'invalid_minutes' });
  assert.throws(() => validateMinutes({ ...good(), sections: Array.from({ length: 41 }, () => ({ heading: 'h', text: 't' })) }), { code: 'invalid_minutes' });
  assert.throws(() => validateMinutes({ ...good(), saved_counts: { tasks: -1, promises: 0, decisions: 0 } }), { code: 'invalid_minutes' });
  assert.throws(() => validateMinutes({ ...good(), added_at: 'yesterday' }), { code: 'invalid_minutes' });
});

test('validateMinutes trims long section text', () => {
  const out = validateMinutes({ ...good(), sections: [{ heading: 'H', text: 'x'.repeat(9000) }] });
  assert.equal(out.sections[0].text.length, 6000);
});

test('decisions keep source minutes and drop unknown sources', () => {
  const out = validateDecisions([
    { id: 'd_1', text: 'From notes', agenda_heading: null },
    { id: 'dm_1', text: 'From minutes', agenda_heading: 'Assessment', source: 'minutes' },
    { id: 'd_2', text: 'Odd', agenda_heading: null, source: 'fax' }
  ]);
  assert.equal(out[0].source, undefined);
  assert.equal(out[1].source, 'minutes');
  assert.equal(out[2].source, undefined);
});

test('field update accepts minutes; projection and parse carry it', () => {
  assert.deepEqual(validateMeetingFieldUpdate({ minutes: good() }).minutes, good());
  const record = { id: MEETING, title: 'T', state: 'scheduled', minutes: good() };
  assert.deepEqual(projectMeeting(record).minutes, good());
  assert.equal(projectMeeting({ id: MEETING, title: 'T', state: 'scheduled' }).minutes, null);
  assert.equal(parseMeetingRecord({ schema_version: 2, id: MEETING, title: 'T', scheduled_start: '2026-11-01T00:00:00.000Z', scheduled_end: '2026-11-01T01:00:00.000Z', time_zone: 'Australia/Sydney', state: 'scheduled', occurrence_history: [], created_at: 'x', updated_at: 'x', minutes: good() }).minutes.source, 'page');
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/unit/meeting-minutes-schema.test.js`
Expected: FAIL with `validateMinutes` not exported.

- [ ] **Step 3: Implement**

In `meeting-schema.mjs`, add constants near the other limits:

```js
export const MINUTES_SECTIONS_MAX = 40;
const MINUTES_FILE_KEY_RE = /^meeting-minutes\/meeting_[0-9a-f-]{36}\/\d{13}\.pdf$/;
const DECISION_SOURCES = new Set(['minutes']);
```

Change the `return` inside `validateDecisions` so a known source survives:

```js
    const out = {
      id: decision.id,
      text: decision.text.trim().slice(0, 500),
      agenda_heading: typeof decision.agenda_heading === 'string' ? decision.agenda_heading.trim().slice(0, 200) : null
    };
    if (DECISION_SOURCES.has(decision.source)) out.source = decision.source;
    return out;
```

Add after `validateCoachingSheets`:

```js
/** Official minutes for this meeting: the text by agenda item, where the PDF sits, what was saved from it. */
export function validateMinutes(value) {
  if (value === null) return null;
  const fail = (why) => validationError('invalid_minutes', `minutes: ${why}`);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('an object or null.');
  if (!Array.isArray(value.sections) || value.sections.length > MINUTES_SECTIONS_MAX) {
    throw fail(`sections must be an array of at most ${MINUTES_SECTIONS_MAX}.`);
  }
  const sections = value.sections.map((section) => ({
    heading: shortText(section?.heading, 200),
    text: shortText(section?.text, 6000)
  })).filter((section) => section.text);
  const fileKey = value.file_key ?? null;
  if (fileKey !== null && (typeof fileKey !== 'string' || !MINUTES_FILE_KEY_RE.test(fileKey))) throw fail('file_key is not a minutes file.');
  if (value.source !== 'page' && value.source !== 'chat') throw fail('source must be page or chat.');
  if (typeof value.added_at !== 'string' || !Number.isFinite(Date.parse(value.added_at))) throw fail('added_at must be a timestamp.');
  const counts = {};
  for (const key of ['tasks', 'promises', 'decisions']) {
    const n = value.saved_counts?.[key];
    if (!Number.isInteger(n) || n < 0 || n > 200) throw fail('saved_counts need whole numbers.');
    counts[key] = n;
  }
  return { sections, file_key: fileKey, source: value.source, added_at: value.added_at, saved_counts: counts };
}
```

Add `'minutes'` to `STORED_KEYS` and `UPDATE_KEYS`. In `validateMeetingFieldUpdate`, after the `coaching_sheets` line:

```js
  if (input.minutes !== undefined) patch.minutes = validateMinutes(input.minutes);
```

In `parseMeetingRecord`, after `coaching_sheets`:

```js
    minutes: raw.minutes && typeof raw.minutes === 'object' ? raw.minutes : null
```

In `projectMeeting`, after `coaching_sheets`:

```js
    minutes: record.minutes ?? null
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/meeting-minutes-schema.test.js tests/unit/meeting-event-schema.test.js tests/unit/walkthru-coaching.test.js`
Expected: PASS. If `meeting-event-schema.test.js` deep-equals a projection, add `minutes: null` to its expected object.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/meeting-schema.mjs tests/unit/meeting-minutes-schema.test.js tests/unit/meeting-event-schema.test.js
git commit -m "Meetings: store official minutes; decisions remember they came from minutes"
```

---

### Task 2: Clare reads minutes

**Files:**
- Modify: `netlify/functions/_shared/clare-comms.mjs`
- Modify: `netlify/functions/clare-comms.mjs`
- Test: `tests/unit/clare-minutes.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/clare-minutes.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readMinutes, whoToPerson } from '../../netlify/functions/_shared/clare-comms.mjs';

const ctx = {
  title: 'Faculty meeting', kind: 'meeting', when: 'Thu 6 Nov 2026, 3:30 pm',
  people: [
    { ref: 'shared:person:p1', name: 'Priya Nandakumar', role: 'attendee' },
    { ref: 'shared:person:p2', name: 'Tom Lister', role: 'attendee' }
  ],
  previous: [], open_promises: [], notes: 'Trip approved.',
  agenda_headings: ['Assessment', 'Excursions']
};
const PDF = { media_type: 'application/pdf', data: 'JVBERi0xLjQK' };

const reply = {
  sections: [{ heading: 'Assessment', text: 'Exams move to Week 8.' }, { heading: '', text: '' }],
  actions: [
    { who: 'me', text: 'Circulate the draft unit plan', due: '2026-11-14' },
    { who: 'PN', text: 'Confirm the excursion budget', due: 'Friday' },
    { who: 'Tom', text: 'Book the bus', due: null },
    { who: 'JT', text: 'Follow up with the venue', due: null },
    { who: 'me', text: '', due: null }
  ],
  decisions: [{ text: 'Year 10 exams move to Week 8', agenda_heading: 'Assessment' }, { text: '' }],
  differences: [{ text: 'My notes say the trip was approved; the minutes say pending.' }]
};

test('whoToPerson matches full name, first name and initials', () => {
  assert.equal(whoToPerson(ctx, 'Priya Nandakumar')?.ref, 'shared:person:p1');
  assert.equal(whoToPerson(ctx, 'tom')?.ref, 'shared:person:p2');
  assert.equal(whoToPerson(ctx, 'P.N.')?.ref, 'shared:person:p1');
  assert.equal(whoToPerson(ctx, 'JT'), null);
});

test('readMinutes sends the PDF as a document and sorts the reply', async () => {
  let sent;
  const complete = async (input) => { sent = input; return reply; };
  const out = await readMinutes(ctx, { pdf: PDF }, { complete });
  assert.equal(sent.content[0].type, 'document');
  assert.deepEqual(sent.content[0].source, { type: 'base64', media_type: 'application/pdf', data: PDF.data });
  assert.match(sent.content[1].text, /Faculty meeting/);
  assert.deepEqual(out.sections, [{ heading: 'Assessment', text: 'Exams move to Week 8.' }]);
  assert.deepEqual(out.mine, [{ text: 'Circulate the draft unit plan', due: '2026-11-14' }]);
  assert.deepEqual(out.others, [
    { text: 'Confirm the excursion budget', person_ref: 'shared:person:p1', person_name: 'Priya Nandakumar', due: null },
    { text: 'Book the bus', person_ref: 'shared:person:p2', person_name: 'Tom Lister', due: null }
  ]);
  assert.deepEqual(out.unmatched, [{ text: 'Follow up with the venue', who_text: 'JT', due: null }]);
  assert.deepEqual(out.decisions, [{ text: 'Year 10 exams move to Week 8', agenda_heading: 'Assessment' }]);
  assert.equal(out.differences.length, 1);
});

test('readMinutes takes pasted text instead of a PDF', async () => {
  let sent;
  const complete = async (input) => { sent = input; return reply; };
  await readMinutes(ctx, { text: '1. Assessment\nExams move to Week 8.' }, { complete });
  assert.equal(sent.content[0].type, 'text');
  assert.match(sent.content[0].text, /Exams move to Week 8/);
});

test('readMinutes refuses bad input and empty replies', async () => {
  const complete = async () => reply;
  await assert.rejects(() => readMinutes(ctx, {}, { complete }), { code: 'invalid_minutes' });
  await assert.rejects(() => readMinutes(ctx, { pdf: { media_type: 'image/png', data: 'x' } }, { complete }), { code: 'invalid_minutes' });
  await assert.rejects(() => readMinutes(ctx, { pdf: { ...PDF, data: 'x'.repeat(5_400_001) } }, { complete }), { code: 'invalid_minutes' });
  await assert.rejects(() => readMinutes(ctx, { pdf: PDF }, { complete: async () => ({ sections: [] }) }), { code: 'clare_failed' });
});

test('readMinutes caps list lengths', async () => {
  const many = { ...reply, actions: Array.from({ length: 50 }, (_, i) => ({ who: 'me', text: `Item ${i}` })),
    differences: Array.from({ length: 20 }, (_, i) => ({ text: `D ${i}` })) };
  const out = await readMinutes(ctx, { pdf: PDF }, { complete: async () => many });
  assert.equal(out.mine.length, 30);
  assert.equal(out.differences.length, 10);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/unit/clare-minutes.test.js`
Expected: FAIL with `readMinutes` not exported.

- [ ] **Step 3: Implement in `_shared/clare-comms.mjs`**

Add below `personByName`:

```js
function initialsOf(name) {
  return name.split(/\s+/).filter(Boolean).map((word) => word[0]).join('').toUpperCase();
}

/** A name, first name or initials as minutes write them → an attendee, or null. */
export function whoToPerson(ctx, who) {
  const byName = personByName(ctx, who);
  if (byName) return byName;
  const letters = line(who, 20).replace(/[^A-Za-z]/g, '').toUpperCase();
  if (letters.length < 2) return null;
  const hits = (ctx.people ?? []).filter((person) => initialsOf(person.name) === letters);
  return hits.length === 1 ? hits[0] : null;
}
```

Add at the end of the file:

```js
const MINUTES_PDF_MAX_CHARS = 5_400_000; // 4 MB of PDF once base64'd
const MINUTES_TEXT_MAX = 60_000;

function invalidMinutes(message) {
  return Object.assign(new Error(message), { status: 400, code: 'invalid_minutes' });
}

/**
 * Read official minutes (a PDF or pasted text) for the meeting in ctx. Writes nothing:
 * Adam ticks what to keep on the page. Actions for Adam come back as `mine`; actions
 * for an attendee as `others`; anyone Clare cannot place as `unmatched`.
 */
export async function readMinutes(ctx, minutes, { complete }) {
  const pdf = minutes?.pdf;
  const text = typeof minutes?.text === 'string' ? minutes.text.trim() : '';
  let source;
  if (pdf) {
    if (pdf.media_type !== 'application/pdf' || typeof pdf.data !== 'string' || !pdf.data || pdf.data.length > MINUTES_PDF_MAX_CHARS) {
      throw invalidMinutes('Send a PDF under 4 MB, or paste the minutes as text.');
    }
    source = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.data } };
  } else if (text) {
    source = { type: 'text', text: `Minutes:\n${text.slice(0, MINUTES_TEXT_MAX)}` };
  } else {
    throw invalidMinutes('Add a PDF or paste the minutes.');
  }
  const context = JSON.stringify({
    ...JSON.parse(contextText(ctx)),
    agenda_headings: (Array.isArray(ctx.agenda_headings) ? ctx.agenda_headings : []).slice(0, 40).map((h) => line(h, 200))
  });
  const reply = await complete({
    system: `${HOUSE}\nTask: these are the official minutes of this meeting, written by someone else. Adam may appear in them as Adam, Mr Russell or AR.\nsections: the minutes split by agenda item, in order, each a heading and its text. Tidy layout only; keep every fact and never change meaning.\nactions: every action item. who is "me" for Adam, otherwise the name or initials exactly as written. due is YYYY-MM-DD only if a date is given; the meeting is ${line(ctx.when, 80)}.\ndecisions: every decision or resolution, with the agenda heading it sits under, using the wording in context.agenda_headings when one matches.\ndifferences: at most 10 places where the minutes and Adam's notes (context.notes) disagree, or where the minutes give Adam an action his notes do not have. One sentence each, in Adam's voice ("My notes say…"). Empty when there are no notes.\nShape: {"sections":[{"heading":string,"text":string}],"actions":[{"who":string,"text":string,"due":string|null}],"decisions":[{"text":string,"agenda_heading":string|null}],"differences":[{"text":string}]}`,
    content: [source, { type: 'text', text: context }],
    maxTokens: 4000
  });

  const sections = (Array.isArray(reply.sections) ? reply.sections : [])
    .map((section) => ({ heading: line(section?.heading, 200), text: typeof section?.text === 'string' ? section.text.trim().slice(0, 6000) : '' }))
    .filter((section) => section.text)
    .slice(0, 40);
  if (!sections.length) throw clareFailed('no minutes text found');

  const mine = [];
  const others = [];
  const unmatched = [];
  for (const raw of Array.isArray(reply.actions) ? reply.actions.slice(0, 60) : []) {
    const actionText = line(raw?.text, 300);
    if (!actionText) continue;
    const due = isDateKey(raw?.due) ? raw.due : null;
    const who = line(raw?.who, 120);
    if (who.toLowerCase() === 'me') {
      if (mine.length < 30) mine.push({ text: actionText, due });
      continue;
    }
    const person = whoToPerson(ctx, who);
    if (person) {
      if (others.length < 30) others.push({ text: actionText, person_ref: person.ref, person_name: person.name, due });
    } else if (unmatched.length < 30) {
      unmatched.push({ text: actionText, who_text: who, due });
    }
  }
  const decisions = (Array.isArray(reply.decisions) ? reply.decisions : [])
    .map((decision) => ({ text: line(decision?.text, 500), agenda_heading: line(decision?.agenda_heading, 200) || null }))
    .filter((decision) => decision.text)
    .slice(0, 50);
  const differences = (Array.isArray(reply.differences) ? reply.differences : [])
    .map((difference) => ({ text: line(difference?.text, 300) }))
    .filter((difference) => difference.text)
    .slice(0, 10);
  return { sections, mine, others, unmatched, decisions, differences };
}
```

- [ ] **Step 4: Route it in `netlify/functions/clare-comms.mjs`**

Add `readMinutes` to the import from `./_shared/clare-comms.mjs`, and a case after `'handwriting'`:

```js
          case 'minutes': return withCors(okResponse(200, await readMinutes(ctx, body.minutes, { complete })), request, env);
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/unit/clare-minutes.test.js tests/unit/clare-comms.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/clare-comms.mjs netlify/functions/clare-comms.mjs tests/unit/clare-minutes.test.js
git commit -m "Clare: read official minutes into actions, decisions and differences"
```

---

### Task 3: Private minutes PDF store

**Files:**
- Create: `netlify/functions/meeting-minutes-file.mjs`
- Test: `tests/unit/meeting-minutes-file.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/meeting-minutes-file.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMinutesFile } from '../../netlify/functions/meeting-minutes-file.mjs';

const MEETING = 'meeting_00000000-0000-4000-8000-000000000001';
function fakeStore() {
  const map = new Map();
  return {
    map,
    async set(key, value, opts) { map.set(key, { value, metadata: opts?.metadata ?? {} }); },
    async getWithMetadata(key) { return map.has(key) ? { data: map.get(key).value, metadata: map.get(key).metadata } : null; }
  };
}
const post = (body) => new Request('https://hub.test/api/meetings/minutes-file', { method: 'POST', body: JSON.stringify(body) });
const get = (key) => new Request(`https://hub.test/api/meetings/minutes-file?key=${encodeURIComponent(key)}`);

test('POST saves a PDF under the meeting and GET reads it back', async () => {
  const store = fakeStore();
  const data = Buffer.from('%PDF-1.4 test').toString('base64');
  const saved = await handleMinutesFile(post({ meeting_id: MEETING, media_type: 'application/pdf', data }), { store, now: () => 1762000000000 });
  assert.equal(saved.status, 201);
  const { data: out } = await saved.json();
  assert.equal(out.file_key, `meeting-minutes/${MEETING}/1762000000000.pdf`);
  const read = await handleMinutesFile(get(out.file_key), { store });
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.data.media_type, 'application/pdf');
  assert.equal(Buffer.from(body.data.data, 'base64').toString(), '%PDF-1.4 test');
});

test('rejects bad meeting ids, non-PDFs, big files and foreign keys', async () => {
  const store = fakeStore();
  const data = Buffer.from('%PDF').toString('base64');
  assert.equal((await handleMinutesFile(post({ meeting_id: 'x', media_type: 'application/pdf', data }), { store })).status, 400);
  assert.equal((await handleMinutesFile(post({ meeting_id: MEETING, media_type: 'image/png', data }), { store })).status, 400);
  assert.equal((await handleMinutesFile(post({ meeting_id: MEETING, media_type: 'application/pdf', data: 'x'.repeat(5_400_001) }), { store })).status, 413);
  assert.equal((await handleMinutesFile(get('meetings/records/x.json'), { store })).status, 400);
  assert.equal((await handleMinutesFile(get(`meeting-minutes/${MEETING}/1762000000001.pdf`), { store })).status, 404);
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test tests/unit/meeting-minutes-file.test.js`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```js
// netlify/functions/meeting-minutes-file.mjs
// The original minutes PDF for a meeting, kept in the private Professional store.
// POST saves one ({ meeting_id, media_type, data }) and returns its file_key;
// GET ?key= returns it as base64 for the page to open.

import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { isValidMeetingId } from './_shared/meeting-schema.mjs';

export const config = { path: '/api/meetings/minutes-file' };

const PDF_MAX_CHARS = 5_400_000;
const KEY_RE = /^meeting-minutes\/meeting_[0-9a-f-]{36}\/\d{13}\.pdf$/;

export async function handleMinutesFile(request, { store, now = Date.now }) {
  if (request.method === 'GET') {
    const key = new URL(request.url).searchParams.get('key') ?? '';
    if (!KEY_RE.test(key)) return errorResponse(400, 'invalid_key', 'That is not a minutes file.', false);
    const entry = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!entry?.data) return errorResponse(404, 'not_found', 'Those minutes are no longer stored.', false);
    return okResponse(200, { media_type: 'application/pdf', data: Buffer.from(entry.data).toString('base64') });
  }
  if (request.method === 'POST') {
    const parsed = await readJsonObject(request);
    if (parsed.error) return parsed.error;
    const { meeting_id: meetingId, media_type: mediaType, data } = parsed.value;
    if (!isValidMeetingId(meetingId)) return errorResponse(400, 'invalid_meeting_id', 'Unknown meeting.', false);
    if (mediaType !== 'application/pdf' || typeof data !== 'string' || !data) {
      return errorResponse(400, 'invalid_file', 'Minutes must be a PDF.', false);
    }
    if (data.length > PDF_MAX_CHARS) return errorResponse(413, 'too_large', 'Minutes PDFs must be under 4 MB.', false);
    const key = `meeting-minutes/${meetingId}/${now()}.pdf`;
    await store.set(key, Buffer.from(data, 'base64'), { metadata: { meeting_id: meetingId, media_type: mediaType } });
    return okResponse(201, { file_key: key });
  }
  return methodNotAllowed('GET, POST, OPTIONS');
}

export function createMinutesFileHandler(deps = {}) {
  return createOperatorHandler(
    async (request, context) => withCors(await handleMinutesFile(request, { store: context.store, now: deps.clock }), request, context.env),
    {
      ...deps,
      unboundCode: 'professional_blobs_unbound',
      unboundMessage: 'Professional content store is not bound.',
      getContentStore: deps.getContentStore ?? defaultGetProfessionalStore
    }
  );
}

export default createMinutesFileHandler();
```

Check `okResponse(status, data)` wraps as `{ ok: true, data }` (it does for the Clare routes); if `errorResponse`/`okResponse` signatures differ, follow `clare-comms.mjs`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/unit/meeting-minutes-file.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/meeting-minutes-file.mjs tests/unit/meeting-minutes-file.test.js
git commit -m "Meetings: keep the minutes PDF in the private Professional store"
```

---

### Task 4: Client types, API calls and the save flow

**Files:**
- Modify: `apps/professional/src/domain/types.ts`
- Modify: `apps/professional/src/api/meetings.ts`
- Modify: `apps/professional/src/api/clare-comms.ts`
- Create: `apps/professional/src/api/meeting-minutes-file.ts`
- Create: `apps/professional/src/lib/meeting-minutes.ts`
- Test: `apps/professional/tests/unit/meeting-minutes.test.ts`

- [ ] **Step 1: Types and API calls**

In `types.ts`, add `source?: 'minutes';` to `MeetingDecision`, `minutes?: MeetingMinutes | null;` to `MeetingRecord`, and:

```ts
export interface MeetingMinutes {
  sections: Array<{ heading: string; text: string }>;
  file_key: string | null;
  source: 'page' | 'chat';
  added_at: string;
  saved_counts: { tasks: number; promises: number; decisions: number };
}
```

In `meetings.ts`, add `minutes?: MeetingMinutes | null;` to the `updateMeeting` patch type and import `MeetingMinutes`.

In `clare-comms.ts`, replace the body of `clareHandwriting` with a shared helper and add the minutes call:

```ts
export async function fileBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function clareHandwriting(file: File): Promise<{ text: string }> {
  return call<{ text: string }>('handwriting', { image: { media_type: file.type, data: await fileBase64(file) } });
}

export type ClareMinutesReview = {
  sections: Array<{ heading: string; text: string }>;
  mine: Array<{ text: string; due: string | null }>;
  others: Array<{ text: string; person_ref: string; person_name: string; due: string | null }>;
  unmatched: Array<{ text: string; who_text: string; due: string | null }>;
  decisions: Array<{ text: string; agenda_heading: string | null }>;
  differences: Array<{ text: string }>;
};

export const clareMinutes = (
  context: ClareContext & { agenda_headings: string[] },
  minutes: { pdf: { media_type: 'application/pdf'; data: string } } | { text: string }
) => call<ClareMinutesReview>('minutes', { context, minutes });
```

Create `apps/professional/src/api/meeting-minutes-file.ts`:

```ts
import { apiGet, apiPost } from '@/api/client';

export const uploadMinutesFile = (meetingId: string, data: string) =>
  apiPost<{ file_key: string }>('/api/meetings/minutes-file', { meeting_id: meetingId, media_type: 'application/pdf', data });

export const fetchMinutesFile = (key: string) =>
  apiGet<{ media_type: string; data: string }>(`/api/meetings/minutes-file?key=${encodeURIComponent(key)}`);
```

- [ ] **Step 2: Write the failing test for the helpers and save flow**

```ts
// apps/professional/tests/unit/meeting-minutes.test.ts
import { describe, expect, it, vi } from 'vitest';
import { keepMinutesDecisions, mergeMinutesDecisions, ownerForMine, savedLine, saveMinutesReview, PDF_MAX_BYTES } from '@/lib/meeting-minutes';
import type { MeetingRecord } from '@/domain/types';

const MEETING_ID = 'meeting_00000000-0000-4000-8000-000000000001';
const record = { id: MEETING_ID, decisions: [{ id: 'd_1', text: 'Notes decision', agenda_heading: null }], minutes: null } as unknown as MeetingRecord;

describe('decision merging', () => {
  it('adds only new minutes decisions, ignoring case and spacing', () => {
    const out = mergeMinutesDecisions(
      [...record.decisions!, { id: 'dm_1', text: 'Exams move to Week 8', agenda_heading: 'Assessment', source: 'minutes' }],
      [{ text: 'exams  move to week 8', agenda_heading: 'Assessment' }, { text: 'Bus booked', agenda_heading: null }]
    );
    expect(out.added).toBe(1);
    expect(out.decisions.at(-1)).toEqual({ id: 'dm_2', text: 'Bus booked', agenda_heading: null, source: 'minutes' });
  });

  it('keeps minutes decisions when notes are rebuilt', () => {
    const out = keepMinutesDecisions(
      [{ id: 'd_1', text: 'Old', agenda_heading: null }, { id: 'dm_1', text: 'From minutes', agenda_heading: null, source: 'minutes' }],
      [{ text: 'New from notes', agenda_heading: 'Assessment' }]
    );
    expect(out).toEqual([
      { id: 'd_1', text: 'New from notes', agenda_heading: 'Assessment' },
      { id: 'dm_1', text: 'From minutes', agenda_heading: null, source: 'minutes' }
    ]);
  });
});

describe('who Adam owes', () => {
  it('prefers the chair, then the first attendee', () => {
    expect(ownerForMine([{ ref: 'a', role: null }, { ref: 'b', role: 'chair' }])).toBe('b');
    expect(ownerForMine([{ ref: 'a', role: null }])).toBe('a');
    expect(ownerForMine([])).toBeNull();
  });
});

describe('saveMinutesReview', () => {
  const deps = () => ({
    uploadFile: vi.fn(async () => ({ file_key: `meeting-minutes/${MEETING_ID}/1762000000000.pdf` })),
    createLedgerItem: vi.fn(async (body: { text: string }) => ({ item: { id: `l_${body.text}`, text: body.text }, created: body.text !== 'Already there' })),
    makeActionTask: vi.fn(async (item: unknown) => item),
    createLooseTask: vi.fn(async () => undefined),
    saveMeeting: vi.fn(async (patch: object) => ({ ...record, ...patch }) as MeetingRecord),
    now: () => new Date('2026-11-01T02:00:00.000Z')
  });

  it('uploads, makes tasks and promises, merges decisions and saves minutes', async () => {
    const d = deps();
    const out = await saveMinutesReview({
      record, meetingRef: `professional:meeting:${MEETING_ID}`, attendees: [{ ref: 'shared:person:p1', role: 'chair' }],
      pdfData: 'JVBER', sections: [{ heading: 'Assessment', text: 'Exams move.' }],
      mine: [{ text: 'Circulate the plan', due: '2026-11-14' }, { text: 'Already there', due: null }],
      others: [{ text: 'Confirm budget', person_ref: 'shared:person:p1', due: null }],
      decisions: [{ text: 'Exams move to Week 8', agenda_heading: 'Assessment' }]
    }, d);
    expect(d.uploadFile).toHaveBeenCalledWith(MEETING_ID, 'JVBER');
    expect(d.makeActionTask).toHaveBeenCalledTimes(1);
    expect(d.createLedgerItem).toHaveBeenCalledWith(expect.objectContaining({ direction: 'they_owe', person_ref: 'shared:person:p1', text: 'Confirm budget' }));
    expect(out.counts).toEqual({ tasks: 1, promises: 1, decisions: 1 });
    const patch = d.saveMeeting.mock.calls[0][0] as { minutes: { file_key: string; source: string; added_at: string } };
    expect(patch.minutes).toMatchObject({ file_key: `meeting-minutes/${MEETING_ID}/1762000000000.pdf`, source: 'page', added_at: '2026-11-01T02:00:00.000Z' });
  });

  it('makes a loose task when nobody else is in the meeting, and keeps an old file for pasted text', async () => {
    const d = deps();
    const withFile = { ...record, minutes: { file_key: 'meeting-minutes/old.pdf' } } as unknown as MeetingRecord;
    await saveMinutesReview({ record: withFile, meetingRef: 'm', attendees: [], pdfData: null, sections: [{ heading: '', text: 'T' }],
      mine: [{ text: 'Do it', due: null }], others: [], decisions: [] }, d);
    expect(d.createLooseTask).toHaveBeenCalledWith('Do it', 'm');
    expect(d.uploadFile).not.toHaveBeenCalled();
    expect((d.saveMeeting.mock.calls[0][0] as { minutes: { file_key: string } }).minutes.file_key).toBe('meeting-minutes/old.pdf');
  });
});

it('savedLine reads naturally and the size cap is 4 MB', () => {
  expect(savedLine({ tasks: 1, promises: 2, decisions: 0 })).toBe('Added 1 task and 2 promises.');
  expect(savedLine({ tasks: 0, promises: 0, decisions: 0 })).toBe('Nothing new to add.');
  expect(PDF_MAX_BYTES).toBe(4_000_000);
});
```

- [ ] **Step 3: Run it and see it fail**

Run: `cd apps/professional && npx vitest run tests/unit/meeting-minutes.test.ts`
Expected: FAIL, module `@/lib/meeting-minutes` not found.

- [ ] **Step 4: Implement `apps/professional/src/lib/meeting-minutes.ts`**

```ts
import type { LedgerItem, MeetingDecision, MeetingMinutes, MeetingRecord } from '@/domain/types';

export const PDF_MAX_BYTES = 4_000_000;
const DECISIONS_MAX = 50;

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

/** Add minutes decisions not already on the meeting. Ids run dm_1, dm_2… */
export function mergeMinutesDecisions(
  existing: MeetingDecision[],
  incoming: Array<{ text: string; agenda_heading: string | null }>
): { decisions: MeetingDecision[]; added: number } {
  const seen = new Set(existing.map((decision) => norm(decision.text)));
  let n = existing.reduce((max, decision) => Math.max(max, Number(/^dm_(\d+)$/.exec(decision.id)?.[1] ?? 0)), 0);
  const decisions = [...existing];
  let added = 0;
  for (const decision of incoming) {
    if (decisions.length >= DECISIONS_MAX || seen.has(norm(decision.text))) continue;
    seen.add(norm(decision.text));
    decisions.push({ id: `dm_${++n}`, text: decision.text, agenda_heading: decision.agenda_heading, source: 'minutes' });
    added += 1;
  }
  return { decisions, added };
}

/** Notes rebuild their own decisions; minutes ones stay. */
export function keepMinutesDecisions(
  existing: MeetingDecision[],
  fromNotes: Array<{ text: string; agenda_heading: string | null }>
): MeetingDecision[] {
  const notes = fromNotes.map((decision, index) => ({ id: `d_${index + 1}`, ...decision }));
  return [...notes, ...existing.filter((decision) => decision.source === 'minutes')].slice(0, DECISIONS_MAX);
}

/** Adam's minutes actions are owed to the chair, else the first attendee. */
export function ownerForMine(attendees: Array<{ ref: string; role: string | null }>): string | null {
  return (attendees.find((attendee) => attendee.role === 'chair') ?? attendees[0])?.ref ?? null;
}

export function savedLine(counts: MeetingMinutes['saved_counts']): string {
  const bits = [
    [counts.tasks, 'task'], [counts.promises, 'promise'], [counts.decisions, 'decision']
  ].filter(([n]) => (n as number) > 0).map(([n, word]) => `${n} ${word}${n === 1 ? '' : 's'}`);
  if (!bits.length) return 'Nothing new to add.';
  return `Added ${bits.length > 1 ? `${bits.slice(0, -1).join(', ')} and ${bits.at(-1)}` : bits[0]}.`;
}

export type MinutesSaveDeps = {
  uploadFile: (meetingId: string, data: string) => Promise<{ file_key: string }>;
  createLedgerItem: (body: { person_ref: string; direction: 'you_owe' | 'they_owe'; text: string; comm_ref: string; due?: string | null }) => Promise<{ item: LedgerItem; created: boolean }>;
  makeActionTask: (item: LedgerItem, sourceRef: string) => Promise<LedgerItem>;
  createLooseTask: (title: string, sourceRef: string) => Promise<void>;
  saveMeeting: (patch: { minutes: MeetingMinutes; decisions: MeetingDecision[] }) => Promise<MeetingRecord>;
  now?: () => Date;
};

export type MinutesSaveInput = {
  record: MeetingRecord;
  meetingRef: string;
  attendees: Array<{ ref: string; role: string | null }>;
  pdfData: string | null;
  sections: MeetingMinutes['sections'];
  mine: Array<{ text: string; due: string | null }>;
  others: Array<{ text: string; person_ref: string; due: string | null }>;
  decisions: Array<{ text: string; agenda_heading: string | null }>;
};

/** Save what Adam ticked. Ledger create is idempotent, so a replaced set of minutes never doubles up. */
export async function saveMinutesReview(input: MinutesSaveInput, deps: MinutesSaveDeps): Promise<{ record: MeetingRecord; counts: MeetingMinutes['saved_counts'] }> {
  const { record, meetingRef } = input;
  const fileKey = input.pdfData ? (await deps.uploadFile(record.id, input.pdfData)).file_key : record.minutes?.file_key ?? null;
  const counts = { tasks: 0, promises: 0, decisions: 0 };
  const owedTo = ownerForMine(input.attendees);
  for (const action of input.mine) {
    if (!owedTo) {
      await deps.createLooseTask(action.text, meetingRef);
      counts.tasks += 1;
      continue;
    }
    const { item, created } = await deps.createLedgerItem({ person_ref: owedTo, direction: 'you_owe', text: action.text, comm_ref: meetingRef, due: action.due });
    if (!created) continue;
    await deps.makeActionTask(item, meetingRef);
    counts.tasks += 1;
  }
  for (const action of input.others) {
    const { created } = await deps.createLedgerItem({ person_ref: action.person_ref, direction: 'they_owe', text: action.text, comm_ref: meetingRef, due: action.due });
    if (created) counts.promises += 1;
  }
  const merged = mergeMinutesDecisions(record.decisions ?? [], input.decisions);
  counts.decisions = merged.added;
  const minutes: MeetingMinutes = {
    sections: input.sections,
    file_key: fileKey,
    source: 'page',
    added_at: (deps.now?.() ?? new Date()).toISOString(),
    saved_counts: counts
  };
  return { record: await deps.saveMeeting({ minutes, decisions: merged.decisions }), counts };
}
```

- [ ] **Step 5: Run tests and the type check**

Run: `cd apps/professional && npx vitest run tests/unit/meeting-minutes.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/professional/src/domain/types.ts apps/professional/src/api/meetings.ts apps/professional/src/api/clare-comms.ts apps/professional/src/api/meeting-minutes-file.ts apps/professional/src/lib/meeting-minutes.ts apps/professional/tests/unit/meeting-minutes.test.ts
git commit -m "Professional: minutes types, API calls and the save flow"
```

---

### Task 5: The Minutes card

**Files:**
- Create: `apps/professional/src/views/meeting-minutes-card.ts`
- Modify: `apps/professional/src/styles/meeting-page.css`
- Test: `apps/professional/tests/unit/meeting-minutes-card.test.ts`

The card takes all its calls as deps, so it is tested without the meeting page's large mock set.

- [ ] **Step 1: Write the failing test**

```ts
// apps/professional/tests/unit/meeting-minutes-card.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mountMinutesCard, type MinutesCardDeps } from '@/views/meeting-minutes-card';
import type { MeetingRecord } from '@/domain/types';

const MEETING_ID = 'meeting_00000000-0000-4000-8000-000000000001';
const review = {
  sections: [{ heading: 'Assessment', text: 'Exams move to Week 8.' }],
  mine: [{ text: 'Circulate the plan', due: '2026-11-14' }],
  others: [{ text: 'Confirm budget', person_ref: 'shared:person:p1', person_name: 'Priya Nandakumar', due: null }],
  unmatched: [{ text: 'Follow up with the venue', who_text: 'JT', due: null }],
  decisions: [{ text: 'Exams move to Week 8', agenda_heading: 'Assessment' }],
  differences: [{ text: 'My notes say approved; the minutes say pending.' }]
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(minutes: MeetingRecord['minutes'] = null) {
  const record = { id: MEETING_ID, decisions: [], minutes } as unknown as MeetingRecord;
  const deps: MinutesCardDeps = {
    read: vi.fn(async () => review),
    save: vi.fn(async (input) => ({ record: { ...record, minutes: { sections: input.sections, file_key: null, source: 'page', added_at: 'x', saved_counts: { tasks: 1, promises: 2, decisions: 1 } } } as MeetingRecord, counts: { tasks: 1, promises: 2, decisions: 1 } })),
    openFile: vi.fn(async () => undefined)
  };
  const card = mountMinutesCard({
    record: () => record,
    attendees: () => [{ ref: 'shared:person:p1', name: 'Priya Nandakumar', role: 'chair' }, { ref: 'shared:person:p2', name: 'Tom Lister', role: null }],
    onSaved: vi.fn(),
    deps
  });
  document.body.replaceChildren(card);
  return { card, deps };
}

describe('Minutes card', () => {
  it('starts empty with Add minutes', () => {
    const { card } = setup();
    expect(card.querySelector('h3')?.textContent).toBe('Minutes');
    expect(card.querySelector('[data-part="minutes-add"]')).not.toBeNull();
  });

  it('reads pasted minutes, shows four groups, and saves ticked items with a picked person', async () => {
    const { card, deps } = setup();
    (card.querySelector('[data-part="minutes-paste-toggle"]') as HTMLButtonElement).click();
    (card.querySelector('textarea') as HTMLTextAreaElement).value = '1. Assessment. Exams move.';
    (card.querySelector('[data-part="minutes-read-text"]') as HTMLButtonElement).click();
    await flush();
    expect(deps.read).toHaveBeenCalledWith({ text: '1. Assessment. Exams move.' });
    const groups = [...card.querySelectorAll('[data-group]')].map((node) => (node as HTMLElement).dataset.group);
    expect(groups).toEqual(['mine', 'others', 'unmatched', 'decisions', 'differences']);
    expect(card.querySelectorAll('[data-group="differences"] input').length).toBe(0);

    (card.querySelector('[data-group="others"] input') as HTMLInputElement).click(); // untick
    (card.querySelector('[data-group="unmatched"] select') as HTMLSelectElement).value = 'shared:person:p2';
    (card.querySelector('[data-part="minutes-save"]') as HTMLButtonElement).click();
    await flush();
    const input = (deps.save as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.mine).toEqual([{ text: 'Circulate the plan', due: '2026-11-14' }]);
    expect(input.others).toEqual([{ text: 'Follow up with the venue', person_ref: 'shared:person:p2', due: null }]);
    expect(input.pdfData).toBeNull();
    await flush();
    expect(card.textContent).toContain('Added 1 task, 2 promises and 1 decision.');
    expect(card.textContent).toContain('Exams move to Week 8.');
  });

  it('shows saved minutes with Open the PDF and Replace minutes', async () => {
    const { card, deps } = setup({ sections: [{ heading: 'Assessment', text: 'Exams move.' }], file_key: `meeting-minutes/${MEETING_ID}/1762000000000.pdf`, source: 'page', added_at: '2026-11-01T02:00:00.000Z', saved_counts: { tasks: 0, promises: 0, decisions: 0 } });
    (card.querySelector('[data-part="minutes-open-pdf"]') as HTMLButtonElement).click();
    expect(deps.openFile).toHaveBeenCalledWith(`meeting-minutes/${MEETING_ID}/1762000000000.pdf`);
    (card.querySelector('[data-part="minutes-replace"]') as HTMLButtonElement).click();
    expect(card.querySelector('[data-part="minutes-add"]')).not.toBeNull();
  });

  it('shows Try again when Clare fails', async () => {
    const { card, deps } = setup();
    (deps.read as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Clare could not finish: HTTP 529'));
    (card.querySelector('[data-part="minutes-paste-toggle"]') as HTMLButtonElement).click();
    (card.querySelector('textarea') as HTMLTextAreaElement).value = 'x';
    (card.querySelector('[data-part="minutes-read-text"]') as HTMLButtonElement).click();
    await flush();
    expect(card.textContent).toContain('Clare couldn’t read these minutes.');
    expect(card.querySelector('[data-part="minutes-retry"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `cd apps/professional && npx vitest run tests/unit/meeting-minutes-card.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `apps/professional/src/views/meeting-minutes-card.ts`**

```ts
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';
import { fileBase64, type ClareMinutesReview } from '@/api/clare-comms';
import { PDF_MAX_BYTES, savedLine, type MinutesSaveInput } from '@/lib/meeting-minutes';
import type { MeetingMinutes, MeetingRecord } from '@/domain/types';

type CardAttendee = { ref: string; name: string; role: string | null };

export type MinutesCardDeps = {
  read: (minutes: { pdf: { media_type: 'application/pdf'; data: string } } | { text: string }) => Promise<ClareMinutesReview>;
  save: (input: Omit<MinutesSaveInput, 'record' | 'meetingRef' | 'attendees'>) => Promise<{ record: MeetingRecord; counts: MeetingMinutes['saved_counts'] }>;
  openFile: (fileKey: string) => Promise<void>;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, part: string, kind = 'btn--secondary'): HTMLButtonElement {
  const node = el('button', `btn ${kind}`, label) as HTMLButtonElement;
  node.type = 'button';
  node.dataset.part = part;
  return node;
}

const due = (value: string | null) => (value ? ` · due ${formatDisplayDate(value)}` : '');

/** Official minutes: add a PDF or paste, review what Clare found, save what is ticked. */
export function mountMinutesCard(options: {
  record: () => MeetingRecord;
  attendees: () => CardAttendee[];
  onSaved: (record: MeetingRecord) => void;
  deps: MinutesCardDeps;
}): HTMLElement {
  const card = el('section', 'card meeting-minutes');
  card.dataset.part = 'minutes';
  const body = el('div', 'meeting-minutes__body');
  card.append(el('h3', undefined, 'Minutes'), body);

  function paintEmpty(withCancel: boolean): void {
    const file = el('input') as HTMLInputElement;
    file.type = 'file';
    file.accept = 'application/pdf';
    file.hidden = true;
    const add = button('Add minutes', 'minutes-add', 'btn--primary');
    add.addEventListener('click', () => file.click());
    const pasteToggle = button('Paste instead', 'minutes-paste-toggle', 'btn--ghost');
    const paste = el('div', 'meeting-minutes__paste');
    paste.hidden = true;
    const area = el('textarea') as HTMLTextAreaElement;
    area.rows = 8;
    area.setAttribute('aria-label', 'Paste the minutes');
    const readText = button('Read pasted minutes', 'minutes-read-text');
    paste.append(area, readText);
    pasteToggle.addEventListener('click', () => { paste.hidden = !paste.hidden; if (!paste.hidden) area.focus(); });
    readText.addEventListener('click', () => {
      const text = area.value.trim();
      if (text) void runRead({ text }, null);
    });
    file.addEventListener('change', async () => {
      const picked = file.files?.[0];
      if (!picked) return;
      if (picked.type !== 'application/pdf') return note('That isn’t a PDF. Paste the text instead.');
      if (picked.size > PDF_MAX_BYTES) return note('That PDF is over 4 MB. Paste the part you need instead.');
      const data = await fileBase64(picked);
      void runRead({ pdf: { media_type: 'application/pdf', data } }, data);
    });
    const row = el('div', 'clare-row');
    row.append(add, pasteToggle);
    if (withCancel) {
      const cancel = button('Cancel', 'minutes-cancel', 'btn--ghost');
      cancel.addEventListener('click', () => paintSaved(options.record().minutes!, null));
      row.append(cancel);
    }
    const hint = el('p', 'muted meeting-page__hint', 'Official minutes for this meeting. Clare finds your actions, other people’s, and the decisions.');
    body.replaceChildren(hint, row, paste, file);
  }

  function note(message: string): void {
    body.querySelector('.meeting-minutes__note')?.remove();
    body.append(el('p', 'muted meeting-minutes__note', message));
  }

  async function runRead(minutes: Parameters<MinutesCardDeps['read']>[0], pdfData: string | null): Promise<void> {
    body.replaceChildren(el('p', 'muted', 'Clare is reading the minutes…'));
    try {
      paintReview(await options.deps.read(minutes), pdfData);
    } catch (err) {
      body.replaceChildren(
        el('p', 'muted', 'Clare couldn’t read these minutes.'),
        el('p', 'muted meeting-minutes__note', err instanceof Error ? err.message : '')
      );
      const retry = button('Try again', 'minutes-retry');
      retry.addEventListener('click', () => void runRead(minutes, pdfData));
      body.append(retry);
    }
  }

  function tickGroup<T>(group: string, title: string, items: T[], label: (item: T) => string): Array<[HTMLInputElement, T]> {
    if (!items.length) return [];
    const host = el('div', 'meeting-minutes__group');
    host.dataset.group = group;
    host.append(el('h4', undefined, title));
    const boxes: Array<[HTMLInputElement, T]> = [];
    for (const item of items) {
      const row = el('label', 'clare-found__item');
      const box = el('input') as HTMLInputElement;
      box.type = 'checkbox';
      box.checked = true;
      row.append(box, document.createTextNode(` ${label(item)}`));
      host.append(row);
      boxes.push([box, item]);
    }
    body.append(host);
    return boxes;
  }

  function paintReview(review: ClareMinutesReview, pdfData: string | null): void {
    body.replaceChildren();
    const mine = tickGroup('mine', 'For you', review.mine, (item) => `${item.text}${due(item.due)}`);
    const others = tickGroup('others', 'For others', review.others, (item) => `${item.person_name}: ${item.text}${due(item.due)}`);

    const pickers: Array<[HTMLSelectElement, ClareMinutesReview['unmatched'][number]]> = [];
    if (review.unmatched.length) {
      const host = el('div', 'meeting-minutes__group');
      host.dataset.group = 'unmatched';
      host.append(el('h4', undefined, 'Who is this?'));
      for (const item of review.unmatched) {
        const row = el('label', 'meeting-minutes__unmatched');
        const pick = el('select') as HTMLSelectElement;
        pick.setAttribute('aria-label', `Who is ${item.who_text}?`);
        pick.append(new Option('Skip', ''));
        for (const person of options.attendees()) pick.append(new Option(person.name, person.ref));
        row.append(el('span', undefined, `“${item.who_text}”: ${item.text}${due(item.due)}`), pick);
        host.append(row);
        pickers.push([pick, item]);
      }
      body.append(host);
    }

    const decisions = tickGroup('decisions', 'Decisions', review.decisions, (item) => `${item.text}${item.agenda_heading ? ` · under ${item.agenda_heading}` : ''}`);

    if (review.differences.length) {
      const host = el('div', 'meeting-minutes__group meeting-minutes__diffs');
      host.dataset.group = 'differences';
      host.append(el('h4', undefined, 'Check against your notes'));
      for (const item of review.differences) host.append(el('p', 'meeting-minutes__diff', item.text));
      body.append(host);
    }

    const save = button('Save ticked items', 'minutes-save', 'btn--primary');
    save.addEventListener('click', async () => {
      save.disabled = true;
      const ticked = <T>(boxes: Array<[HTMLInputElement, T]>) => boxes.filter(([box]) => box.checked).map(([, item]) => item);
      const picked = pickers.filter(([pick]) => pick.value).map(([pick, item]) => ({ text: item.text, person_ref: pick.value, due: item.due }));
      try {
        const { record, counts } = await options.deps.save({
          pdfData,
          sections: review.sections,
          mine: ticked(mine).map(({ text, due: d }) => ({ text, due: d })),
          others: [...ticked(others).map(({ text, person_ref, due: d }) => ({ text, person_ref, due: d })), ...picked],
          decisions: ticked(decisions)
        });
        options.onSaved(record);
        paintSaved(record.minutes!, savedLine(counts));
      } catch (err) {
        save.disabled = false;
        note(err instanceof Error ? err.message : 'Could not save. Try again.');
      }
    });
    body.append(save);
  }

  function paintSaved(minutes: MeetingMinutes, line: string | null): void {
    body.replaceChildren();
    if (line) body.append(el('p', 'meeting-minutes__saved', line));
    for (const section of minutes.sections) {
      const block = el('div', 'meeting-minutes__section');
      if (section.heading) block.append(el('h4', undefined, section.heading));
      block.append(el('p', 'meeting-minutes__text', section.text));
      body.append(block);
    }
    const row = el('div', 'clare-row');
    if (minutes.file_key) {
      const open = button('Open the PDF', 'minutes-open-pdf', 'btn--ghost');
      open.addEventListener('click', () => void options.deps.openFile(minutes.file_key!).catch(() => note('Could not open the PDF.')));
      row.append(open);
    }
    const replace = button('Replace minutes', 'minutes-replace', 'btn--ghost');
    replace.addEventListener('click', () => paintEmpty(true));
    row.append(replace);
    body.append(row);
  }

  const existing = options.record().minutes;
  if (existing) paintSaved(existing, null);
  else paintEmpty(false);
  return card;
}
```

- [ ] **Step 4: Styles**

Append to `apps/professional/src/styles/meeting-page.css` (use the tokens already used in this file; check names before pasting):

```css
.meeting-minutes__body { display: grid; gap: 0.75rem; }
.meeting-minutes__paste { display: grid; gap: 0.5rem; }
.meeting-minutes__paste textarea { width: 100%; box-sizing: border-box; font: inherit; }
.meeting-minutes__group { display: grid; gap: 0.35rem; }
.meeting-minutes__group h4, .meeting-minutes__section h4 { margin: 0; }
.meeting-minutes__unmatched { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.meeting-minutes__unmatched select { max-width: 100%; }
.meeting-minutes__diff { margin: 0; padding-left: 0.75rem; border-left: 3px solid var(--warn, #c98a1a); }
.meeting-minutes__text { margin: 0.25rem 0 0; white-space: pre-wrap; }
.meeting-minutes__saved { margin: 0; font-weight: 600; }
```

- [ ] **Step 5: Run tests**

Run: `cd apps/professional && npx vitest run tests/unit/meeting-minutes-card.test.ts tests/unit/meeting-minutes.test.ts`
Expected: PASS. If `formatDisplayDate` returns a different form in jsdom, the assertions above do not depend on it.

- [ ] **Step 6: Commit**

```bash
git add apps/professional/src/views/meeting-minutes-card.ts apps/professional/src/styles/meeting-page.css apps/professional/tests/unit/meeting-minutes-card.test.ts
git commit -m "Professional: Minutes card with review, unmatched picker and saved view"
```

---

### Task 6: Put the card on the meeting page, mock it for dev

**Files:**
- Modify: `apps/professional/src/views/meeting-page.ts`
- Modify: `apps/professional/scripts/mock-api.ts`
- Test: `apps/professional/tests/unit/meeting-page.test.ts`

- [ ] **Step 1: Add a page test**

Append to `meeting-page.test.ts` inside its main `describe` (follow how the existing tests render the page and wait; reuse their helper names):

```ts
  it('shows the Minutes card in every phase', async () => {
    // Render as the existing tests do, then:
    expect(document.querySelector('[data-part="minutes"] h3')?.textContent).toBe('Minutes');
  });
```

Also add to the top-level mocks so the card's imports resolve:

```ts
vi.mock('@/api/meeting-minutes-file', () => ({
  uploadMinutesFile: vi.fn(async () => ({ file_key: 'meeting-minutes/x.pdf' })),
  fetchMinutesFile: vi.fn(async () => ({ media_type: 'application/pdf', data: '' }))
}));
```

and add `clareMinutes: vi.fn()` and `fileBase64: vi.fn(async () => '')` to the existing `@/api/clare-comms` mock if there is one.

- [ ] **Step 2: Wire it in `meeting-page.ts`**

Imports:

```ts
import { clareMinutes } from '@/api/clare-comms';            // add to the existing clare-comms import list
import { fetchMinutesFile, uploadMinutesFile } from '@/api/meeting-minutes-file';
import { createTask, createUniversalLink } from '@/api/universal-links'; // add to the existing universal-links import
import { keepMinutesDecisions, saveMinutesReview } from '@/lib/meeting-minutes';
import { mountMinutesCard } from '@/views/meeting-minutes-card';
```

Next to `let notesCardEl`, add one card kept across phase repaints:

```ts
  let minutesCardEl: HTMLElement | null = null;
  function minutesCard(): HTMLElement {
    if (minutesCardEl) return minutesCardEl;
    minutesCardEl = mountMinutesCard({
      record: () => record,
      attendees: () => attendees.map((attendee) => ({ ref: attendee.ref, name: attendee.name, role: attendee.role })),
      onSaved: (next) => { record = next; paintActions(); },
      deps: {
        read: (minutes) => clareMinutes({
          ...clareContext(),
          agenda_headings: (blockPage?.current() ?? record.blocks ?? [])
            .filter((block) => (block as { block_type?: string }).block_type === 'heading')
            .map((block) => String((block as { content?: { text?: string } }).content?.text ?? ''))
            .filter(Boolean)
        }, minutes),
        save: (input) => saveMinutesReview({
          ...input,
          record,
          meetingRef,
          attendees: attendees.map((attendee) => ({ ref: attendee.ref, role: attendee.role }))
        }, {
          uploadFile: uploadMinutesFile,
          createLedgerItem: async (body) => {
            const out = await createLedgerItem(body);
            if (out.created) ledger.push(out.item);
            return out;
          },
          makeActionTask,
          createLooseTask: async (title, sourceRef) => {
            const task = await createTask({ title });
            await createUniversalLink({ source_ref: `tasks:task:${task.id}`, target_ref: sourceRef, relationship_type: 'tagged_with' });
          },
          saveMeeting: async (patch) => (await updateMeeting(id, patch)).meeting
        }),
        openFile: async (fileKey) => {
          const file = await fetchMinutesFile(fileKey);
          const bytes = Uint8Array.from(atob(file.data), (c) => c.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
          window.open(url, '_blank', 'noopener');
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
      }
    });
    return minutesCardEl;
  }
```

In the phase repaint (where `notesCardEl` is detached before `main.replaceChildren()`), detach the minutes card the same way:

```ts
    if (minutesCardEl?.parentElement === main) minutesCardEl.remove();
```

Add `minutesCard()` straight after the notes card in each of `paintBefore`, `paintDuring` and `paintAfter`:

```ts
  function paintBefore(): void {
    main.append(briefCard(), openPromisesCard(), notesCard(
      'Agenda and notes',
      'Each agenda item is a heading. Add what you want to raise under it.'
    ), minutesCard());
  }
```

(`paintDuring`: insert `minutesCard()` after the `notesCard(...)` argument; `paintAfter`: after `notesCard('Notes', 'Your notes from the meeting. Still editable.')`.)

In `mountNotes`'s `onSave`, keep minutes decisions:

```ts
        const found = extractDecisions(blocks as Array<{ block_type: string; content?: unknown }>);
        const decisions = keepMinutesDecisions(record.decisions ?? [], found);
```

- [ ] **Step 3: Mock API**

In `apps/professional/scripts/mock-api.ts`, add `'minutes'` to the PATCH key list at the `/api/meetings` PATCH handler and `minutes: null as unknown,` to the created meeting object. Add these routes before the `/api/threads` GET handler (synthetic data only):

```ts
    if (path === '/api/clare/comms' && method === 'POST' && (body as { action?: string }).action === 'minutes') {
      const people = ((body as { context?: { people?: Array<{ ref: string; name: string }> } }).context?.people ?? []);
      return json(200, { ok: true, data: {
        sections: [
          { heading: 'Assessment', text: 'Year 10 exams move to Week 8. Draft unit plan to be circulated.' },
          { heading: 'Excursions', text: 'Museum trip pending budget confirmation.' }
        ],
        mine: [{ text: 'Circulate the draft unit plan', due: '2026-11-14' }],
        others: people[0] ? [{ text: 'Confirm the excursion budget', person_ref: people[0].ref, person_name: people[0].name, due: null }] : [],
        unmatched: [{ text: 'Follow up with the venue', who_text: 'JT', due: null }],
        decisions: [{ text: 'Year 10 exams move to Week 8', agenda_heading: 'Assessment' }],
        differences: [{ text: 'My notes say the trip was approved; the minutes say it is pending.' }]
      } });
    }

    if (path === '/api/meetings/minutes-file' && method === 'POST') {
      const meetingId = (body as { meeting_id?: string }).meeting_id;
      return json(201, { ok: true, data: { file_key: `meeting-minutes/${meetingId}/${Date.now()}.pdf` } });
    }

    if (path === '/api/meetings/minutes-file' && method === 'GET') {
      return json(200, { ok: true, data: { media_type: 'application/pdf', data: Buffer.from('%PDF-1.4\n%mock\n').toString('base64') } });
    }
```

If the mock routes `/api/clare/comms` elsewhere, put the `minutes` branch first inside that handler instead.

- [ ] **Step 4: Run tests and type check**

Run: `cd apps/professional && npx vitest run && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/views/meeting-page.ts apps/professional/scripts/mock-api.ts apps/professional/tests/unit/meeting-page.test.ts
git commit -m "Professional: Minutes card on every meeting page; notes keep minutes decisions"
```

---

### Task 7: Walk it, gate it, ship it

- [ ] **Step 1: Walk in the dev mock**

Start the Professional dev preview (`.claude/launch.json` entry for Professional; add one if missing). Open a meeting. At desktop and 390px check: empty card; **Paste instead** → read → five groups; untick one, pick a person for "JT", **Save ticked items** → saved line and sections; **Open the PDF** opens a tab; **Replace minutes** → empty with **Cancel**; Before / During / After all show the card; editing notes afterwards keeps the minutes decision in Actions. Screenshot the review state.

- [ ] **Step 2: Full gate**

Run: `npm run pre-pr-check`
Expected: exit 0. Fix anything it reports; never weaken `privacy-guard`.

- [ ] **Step 3: PR**

Push `claude/meeting-minutes`, open a ready (not draft) PR titled "Meetings: official minutes card", body listing what it does and what is unverified (live Claude read of a real PDF, Safari file picker, cost of the first real run). Enable auto-merge (merge commit).

- [ ] **Step 4: After deploy**

Adam adds one real set of minutes. Note the real token cost from that run in the memory file.

---

## Self-review

- **Spec coverage:** card states (Task 5), all phases (Task 6), four groups + unmatched picker (Tasks 2, 5), save to ledger/tasks/decisions (Task 4), replace without doubling (ledger idempotent; decisions de-duplicated in `mergeMinutesDecisions`), PDF private storage (Task 3), minutes field (Task 1), notes keep minutes decisions (Tasks 1, 4, 6), limits and failure (Tasks 2, 3, 5), mock + walk (Tasks 6, 7). Chat route is a later phase per the spec and not in this plan.
- **Names used across tasks:** `readMinutes`, `whoToPerson`, `validateMinutes`, `handleMinutesFile`, `clareMinutes`, `fileBase64`, `uploadMinutesFile`, `fetchMinutesFile`, `mergeMinutesDecisions`, `keepMinutesDecisions`, `ownerForMine`, `savedLine`, `saveMinutesReview`, `mountMinutesCard`, `MinutesCardDeps`, `PDF_MAX_BYTES`.
