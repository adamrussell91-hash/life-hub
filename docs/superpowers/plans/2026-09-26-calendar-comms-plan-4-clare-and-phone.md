# Calendar comms · Plan 4: Clare and the phone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clare does the heavy lifting around every comm and meeting:
- a three-point brief before
- reading handwriting during
- a summary, the promises and follow-up drafts after
- a check against the meeting's purpose
- a suggested next session
- nudges for late promises

On the phone, Home shows a walk-in card ten minutes before a comm or meeting, and a 10-second log captures hallway chats.

**Architecture:**
- **One Claude path.** A small server module builds each prompt from context the page already has, calls Claude once, and returns validated JSON. It follows the `person-brief-generation.mjs` pattern, with an injectable `complete` for tests.
- **Clare never writes directly.**
  - Summaries, promises and drafts come back to the page, and Adam confirms them.
  - Calendar suggestions (the next session, late-promise drafts) go only into `pending-calendar-ghosts.json`. Accept runs on the server through `acceptPlan`, as the Tideline contract requires.
  - One new ghost kind, `book_comm`, gets a server step that creates the comm.
- **Clare never sends a message.** Drafts are copied and sent by Adam.

**Tech Stack:** as in Plans 1–3, plus the Anthropic Messages API via `fetch`, model `claude-sonnet-5`. That matches `person-brief-generation.mjs`, the house choice for Clare's one-shot jobs. Change it in one constant if Adam wants another.

**Depends on:** Plans 1–3 merged into this branch.

**Spec:** `docs/superpowers/specs/2026-09-26-calendar-comms-design.md`. This plan covers:
- §9 Clare, and the Clare parts of §2 and §5
- §7: the suggested task title
- §8: the phone

**Not in this plan:**
- **Turning audio into text.** Claude doesn't transcribe audio. Transcripts arrive as text: a Teams or Notion AI export, pasted, or attached. Clare summarises that text.
- **Showing decisions on the organisation page.** That belongs to the Organisations redesign's build.
- **The Notion import:** Plan 5.

**Conventions:** as in Plans 2 and 3 (SESSION HELPERS, checking real names, `dd/mm/yy` on screen).

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `netlify/functions/_shared/clare-comms-model.mjs` | Create | One Claude call returning parsed JSON |
| `netlify/functions/_shared/clare-comms.mjs` | Create | Prompts and output checks for brief, summary, drafts, handwriting, purpose check, task title, next session |
| `netlify/functions/clare-comms.mjs` | Create | `POST /api/clare/comms` |
| `netlify/functions/_shared/calendar-ghost-queue.mjs` | Create | Append a ghost to the queue from any server function |
| `packages/design-kit/js/calendar/ghost-writes.js` | Modify | `book_comm` ghost kind |
| `netlify/functions/calendar-ghosts.mjs` | Modify | Run `professional` steps on Accept |
| `netlify/functions/_shared/promise-nudges.mjs`, `netlify/functions/promise-nudges-scheduled.mjs` | Create | Daily late-promise draft ghosts |
| `apps/professional/src/api/clare-comms.ts` | Create | Client |
| `apps/professional/src/components/block-page.ts` | Modify | `append(blocks)` |
| `apps/professional/src/components/schedule-relationships.ts` | Modify | `suggestTitle` on the Task link panel |
| `apps/professional/src/views/comm-page.ts`, `meeting-page.ts`, `event-page.ts` | Modify | Clare cards and actions |
| `apps/professional/src/lib/walk-in.ts` | Create | Next walk-in, home nudges, channel guess, quick-log body |
| `apps/professional/src/views/home.ts` | Modify | Walk-in card and nudges |
| `apps/professional/src/views/quick-log.ts` | Create | 10-second log (`#/log`) |
| `apps/professional/src/app/router.ts`, `app/main.ts`, `shell/shell.ts` | Modify | `#/log` route; Log in the phone tab bar |

---

### Task 1: One Claude call that returns JSON

**Files:**
- Create: `netlify/functions/_shared/clare-comms-model.mjs`
- Test: `tests/unit/clare-comms.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CLARE_COMMS_MODEL, completeJson, extractJsonText } from '../../netlify/functions/_shared/clare-comms-model.mjs';

test('extractJsonText strips a stray fence', () => {
  assert.equal(extractJsonText('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(extractJsonText(' {"a":1} '), '{"a":1}');
});

test('completeJson sends model, system and content, and parses the reply', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push([url, JSON.parse(init.body), init.headers]);
    return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"points":[]}' }] }), { status: 200 });
  };
  const out = await completeJson({ system: 'S', content: [{ type: 'text', text: 'U' }], apiKey: 'k', fetchImpl, maxTokens: 300 });
  assert.deepEqual(out, { points: [] });
  assert.equal(calls[0][0], 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0][1].model, CLARE_COMMS_MODEL);
  assert.equal(calls[0][1].max_tokens, 300);
  assert.deepEqual(calls[0][1].messages, [{ role: 'user', content: [{ type: 'text', text: 'U' }] }]);
  assert.equal(calls[0][2]['x-api-key'], 'k');
});

test('completeJson throws clare_failed on bad JSON or HTTP errors', async () => {
  const bad = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: 'not json' }] }), { status: 200 });
  await assert.rejects(() => completeJson({ system: 'S', content: [], apiKey: 'k', fetchImpl: bad }), { code: 'clare_failed' });
  const down = async () => new Response('{}', { status: 529 });
  await assert.rejects(() => completeJson({ system: 'S', content: [], apiKey: 'k', fetchImpl: down }), { code: 'clare_failed' });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/clare-comms.test.js`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement** `clare-comms-model.mjs`

```js
// One Claude call for Clare's comm jobs. Same shape as person-brief-generation.mjs:
// raw fetch to the Messages API, JSON-only replies, never trusted blindly.
export const CLARE_COMMS_MODEL = 'claude-sonnet-5';

function clareFailed(detail) {
  return Object.assign(new Error(`Clare could not finish: ${detail}`), { status: 502, code: 'clare_failed', retryable: true });
}

export function extractJsonText(raw) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

/**
 * @param {{ system: string, content: unknown[], apiKey: string, fetchImpl?: typeof fetch, maxTokens?: number }} input
 * @returns {Promise<any>} the parsed JSON object
 */
export async function completeJson({ system, content, apiKey, fetchImpl = fetch, maxTokens = 1200 }) {
  let response;
  try {
    response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: CLARE_COMMS_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] })
    });
  } catch {
    throw clareFailed('network');
  }
  if (!response.ok) throw clareFailed(`HTTP ${response.status}`);
  const payload = await response.json().catch(() => null);
  const text = payload?.content?.find((block) => block.type === 'text')?.text ?? '';
  try {
    const parsed = JSON.parse(extractJsonText(text));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw clareFailed('reply was not a JSON object');
  }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/unit/clare-comms.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/clare-comms-model.mjs tests/unit/clare-comms.test.js
git commit -m "feat(clare): one JSON call for comm jobs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Clare's comm jobs

Every job takes `(context, { complete })`. Here `complete({ system, content, maxTokens })` resolves to a parsed object. The endpoint wires the real `completeJson`, and tests pass a fake. Each job checks and bounds the reply, and never passes the model's shape through.

**Files:**
- Create: `netlify/functions/_shared/clare-comms.mjs`
- Test: `tests/unit/clare-comms.test.js` (append)

- [ ] **Step 1: Write the failing tests**

```js
import {
  checkPurpose,
  generateBrief,
  generateDrafts,
  generateSummary,
  readHandwriting,
  suggestNextSession,
  suggestTaskTitle
} from '../../netlify/functions/_shared/clare-comms.mjs';

const fake = (reply) => {
  const calls = [];
  return { calls, complete: async (input) => { calls.push(input); return reply; } };
};

const ctx = {
  title: 'Declan J. · essay feedback',
  kind: 'comm',
  when: 'Wed 14/10/26 11:50',
  people: [{ ref: 'shared:person:p_declan', name: 'Declan J.', role: 'with' }, { ref: 'shared:person:p_denielle', name: 'Denielle J.', role: 'also concerned' }],
  previous: [{ when: '25/09/26', summary: 'Quote bank agreed.' }],
  open_promises: [{ direction: 'you_owe', text: 'Email Denielle a summary', days_late: 3 }],
  notes: 'Redraft is tighter. Second quote is retold.'
};

test('brief: at most 3 points with sources, and an optional owed line', async () => {
  const { complete, calls } = fake({
    points: [
      { text: 'His redraft came in yesterday.', source: 'Canvas, 13/10' },
      { text: 'One target at a time works.', source: 'comm 2' },
      { text: 'Denielle is waiting on you.', source: 'ledger' },
      { text: 'extra', source: 'x' }
    ],
    owed_line: 'Send Denielle the summary after this one.'
  });
  const brief = await generateBrief(ctx, { complete });
  assert.equal(brief.points.length, 3);
  assert.equal(brief.points[0].source, 'Canvas, 13/10');
  assert.equal(brief.owed_line, 'Send Denielle the summary after this one.');
  assert.match(calls[0].system, /Australian English/);
  assert.match(calls[0].content[0].text, /Declan J\./);
});

test('summary: summary text plus promises tied to people on the page; unknown owners dropped', async () => {
  const { complete } = fake({
    summary: 'Good progress.',
    promises: [
      { owner: 'me', to: 'Denielle J.', text: 'Email Denielle the summary', due: '2026-10-14' },
      { owner: 'Declan J.', text: 'Rewrite the fence paragraph', due: '2026-10-19' },
      { owner: 'Greg', text: 'Not on this page', due: null },
      { owner: 'me', to: 'Declan J.', text: 'Mark it', due: 'soon' }
    ],
    numbers: [{ label: 'Maths quiz', value: '31/50' }]
  });
  const out = await generateSummary(ctx, { complete });
  assert.equal(out.summary, 'Good progress.');
  assert.deepEqual(out.promises, [
    { direction: 'you_owe', person_ref: 'shared:person:p_denielle', text: 'Email Denielle the summary', due: '2026-10-14' },
    { direction: 'they_owe', person_ref: 'shared:person:p_declan', text: 'Rewrite the fence paragraph', due: '2026-10-19' },
    { direction: 'you_owe', person_ref: 'shared:person:p_declan', text: 'Mark it', due: null }
  ]);
  assert.deepEqual(out.numbers, [{ label: 'Maths quiz', value: '31/50' }]);
});

test('drafts: one per person on the page, never to strangers', async () => {
  const { complete } = fake({ drafts: [
    { to: 'Denielle J.', subject: 'Declan update', body: 'Hi Denielle, …' },
    { to: 'Someone else', subject: 'x', body: 'y' }
  ] });
  const out = await generateDrafts({ ...ctx, summary: 'Good progress.' }, { complete });
  assert.deepEqual(out.drafts, [{ person_ref: 'shared:person:p_denielle', to: 'Denielle J.', subject: 'Declan update', body: 'Hi Denielle, …' }]);
});

test('handwriting sends the image as an image block and returns text', async () => {
  const { complete, calls } = fake({ text: 'Quote, then so what?' });
  const out = await readHandwriting({ media_type: 'image/jpeg', data: 'AAAA' }, { complete });
  assert.equal(out.text, 'Quote, then so what?');
  assert.deepEqual(calls[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } });
  await assert.rejects(() => readHandwriting({ media_type: 'image/gif', data: 'A' }, { complete }), { code: 'invalid_image' });
});

test('purpose check, task title and next session are bounded', async () => {
  assert.deepEqual(await checkPurpose({ ...ctx, purpose: 'Get a yes on the TeachMeet date' }, fake({ met: false, note: 'Deferred to October.' })), { met: false, note: 'Deferred to October.' });
  assert.equal((await suggestTaskTitle({ title: 'Warlight', notes: 'close reading' }, fake({ title: 'Apply Warlight close-reading to the Y10 unit' }))).title, 'Apply Warlight close-reading to the Y10 unit');
  const next = await suggestNextSession({ ...ctx, cadence_days: 7, last_start: '2026-10-14T00:50:00.000Z', time_zone: 'Australia/Sydney' }, fake({ date: '2026-10-21', time: '11:50', duration_min: 15, reason: 'Weekly, same slot.' }));
  assert.deepEqual(next, { date: '2026-10-21', time: '11:50', duration_min: 15, reason: 'Weekly, same slot.' });
  await assert.rejects(() => suggestNextSession(ctx, fake({ date: 'soon', time: '9', duration_min: 900 })), { code: 'clare_failed' });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/clare-comms.test.js`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement** `clare-comms.mjs`

```js
// Clare's comm and meeting jobs. Context comes from the page Adam is on; nothing
// here writes anything. Replies are checked and bounded before they leave.

const HOUSE = [
  'You are Clare, Adam Russell’s professional assistant. Adam is a secondary English and gifted education teacher in Sydney.',
  'Write in Australian English, plainly, the way a thoughtful colleague talks. No jargon, no flattery, no exclamation marks.',
  'Use only the facts in the context. Never invent names, dates, scores or events. If something is missing, leave it out.',
  'Students are minors: never add health or family detail that is not already in the context.',
  'Reply with one JSON object only, no prose around it.'
].join('\n');

function clareFailed(detail) {
  return Object.assign(new Error(`Clare could not finish: ${detail}`), { status: 502, code: 'clare_failed', retryable: true });
}

function line(value, max) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function contextText(ctx) {
  return JSON.stringify({
    title: ctx.title, kind: ctx.kind, when: ctx.when, purpose: ctx.purpose ?? null,
    people: (ctx.people ?? []).map((person) => ({ name: person.name, role: person.role })),
    previous: ctx.previous ?? [], open_promises: ctx.open_promises ?? [],
    notes: typeof ctx.notes === 'string' ? ctx.notes.slice(0, 20000) : '',
    summary: ctx.summary ?? null
  });
}

function personByName(ctx, name) {
  const wanted = line(name, 120).toLowerCase();
  if (!wanted) return null;
  return (ctx.people ?? []).find((person) => {
    const full = person.name.toLowerCase();
    return full === wanted || full.split(/\s+/)[0] === wanted.split(/\s+/)[0];
  }) ?? null;
}

export async function generateBrief(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: a brief Adam reads in the minute before this ${ctx.kind}. Give at most 3 points, most useful first, each with the source it came from. Add owed_line only if Adam owes someone here something.\nShape: {"points":[{"text":string,"source":string}],"owed_line":string|null}`,
    content: [{ type: 'text', text: contextText(ctx) }],
    maxTokens: 600
  });
  const points = (Array.isArray(reply.points) ? reply.points : [])
    .map((point) => ({ text: line(point?.text, 300), source: line(point?.source, 60) }))
    .filter((point) => point.text)
    .slice(0, 3);
  return { points, owed_line: line(reply.owed_line, 200) || null };
}

export async function generateSummary(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: after this ${ctx.kind}, write a short summary (3–5 sentences) from the notes, then list every promise made. owner is "me" for Adam, or the person's name. For Adam's promises, "to" names who he owes. due is YYYY-MM-DD only if a date was said. numbers lists any scores or measures stated.\nShape: {"summary":string,"promises":[{"owner":string,"to":string|null,"text":string,"due":string|null}],"numbers":[{"label":string,"value":string}]}`,
    content: [{ type: 'text', text: contextText(ctx) }],
    maxTokens: 1200
  });
  const summary = line(reply.summary, 2000);
  if (!summary) throw clareFailed('no summary');
  const promises = [];
  for (const raw of Array.isArray(reply.promises) ? reply.promises.slice(0, 20) : []) {
    const text = line(raw?.text, 300);
    if (!text) continue;
    const due = isDateKey(raw?.due) ? raw.due : null;
    if (line(raw?.owner, 20).toLowerCase() === 'me') {
      const to = personByName(ctx, raw?.to) ?? (ctx.people ?? []).find((person) => person.role === 'with') ?? null;
      if (to) promises.push({ direction: 'you_owe', person_ref: to.ref, text, due });
      continue;
    }
    const owner = personByName(ctx, raw?.owner);
    if (owner) promises.push({ direction: 'they_owe', person_ref: owner.ref, text, due });
  }
  const numbers = (Array.isArray(reply.numbers) ? reply.numbers : [])
    .map((item) => ({ label: line(item?.label, 80), value: line(item?.value, 40) }))
    .filter((item) => item.label && item.value)
    .slice(0, 10);
  return { summary, promises, numbers };
}

export async function generateDrafts(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: draft short follow-up emails from Adam (signing "Mr Russell" to students and parents, "Adam" to colleagues) to the people on this page who should hear about it. Warm, specific, one clear ask at most. Adam edits and sends them himself.\nShape: {"drafts":[{"to":string,"subject":string,"body":string}]}`,
    content: [{ type: 'text', text: contextText(ctx) }],
    maxTokens: 1500
  });
  const drafts = [];
  for (const raw of Array.isArray(reply.drafts) ? reply.drafts.slice(0, 3) : []) {
    const person = personByName(ctx, raw?.to);
    const body = typeof raw?.body === 'string' ? raw.body.trim().slice(0, 4000) : '';
    if (!person || !body) continue;
    drafts.push({ person_ref: person.ref, to: person.name, subject: line(raw?.subject, 150), body });
  }
  return { drafts };
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function readHandwriting(image, { complete }) {
  if (!image || !IMAGE_TYPES.has(image.media_type) || typeof image.data !== 'string' || !image.data || image.data.length > 7_000_000) {
    throw Object.assign(new Error('Send a JPEG, PNG or WebP photo under 5 MB.'), { status: 400, code: 'invalid_image' });
  }
  const reply = await complete({
    system: `${HOUSE}\nTask: transcribe the handwriting in this photo exactly, keeping line breaks and arrows (→). Do not tidy or add words. If a word is unreadable write [?].\nShape: {"text":string}`,
    content: [{ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } }],
    maxTokens: 1500
  });
  const text = typeof reply.text === 'string' ? reply.text.trim().slice(0, 8000) : '';
  if (!text) throw clareFailed('no text found');
  return { text };
}

export async function checkPurpose(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: Adam set a purpose before this meeting. From the notes, say whether it was met, in one short sentence.\nShape: {"met":boolean,"note":string}`,
    content: [{ type: 'text', text: contextText(ctx) }],
    maxTokens: 200
  });
  if (typeof reply.met !== 'boolean') throw clareFailed('no verdict');
  return { met: reply.met, note: line(reply.note, 300) };
}

export async function suggestTaskTitle(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: suggest one task title (under 80 characters, starting with a verb) for applying what Adam learned at this PD to his teaching.\nShape: {"title":string}`,
    content: [{ type: 'text', text: JSON.stringify({ title: ctx.title, notes: typeof ctx.notes === 'string' ? ctx.notes.slice(0, 4000) : '' }) }],
    maxTokens: 100
  });
  const title = line(reply.title, 80);
  if (!title) throw clareFailed('no title');
  return { title };
}

export async function suggestNextSession(ctx, { complete }) {
  const reply = await complete({
    system: `${HOUSE}\nTask: suggest the next session in this thread. Keep the usual rhythm and time of day unless the notes say otherwise. Times are ${ctx.time_zone ?? 'Australia/Sydney'} wall time.\nShape: {"date":"YYYY-MM-DD","time":"HH:MM","duration_min":number,"reason":string}`,
    content: [{ type: 'text', text: JSON.stringify({ ...JSON.parse(contextText(ctx)), cadence_days: ctx.cadence_days ?? null, last_start: ctx.last_start ?? null }) }],
    maxTokens: 200
  });
  const duration = Number(reply.duration_min);
  if (!isDateKey(reply.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(reply.time ?? '') || !Number.isFinite(duration) || duration < 5 || duration > 240) {
    throw clareFailed('next session was not a usable slot');
  }
  return { date: reply.date, time: reply.time, duration_min: Math.round(duration), reason: line(reply.reason, 200) };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `node --test tests/unit/clare-comms.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/_shared/clare-comms.mjs tests/unit/clare-comms.test.js
git commit -m "feat(clare): brief, summary, drafts, handwriting, purpose, task title, next session

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `book_comm` ghosts and the queue helper

**Files:**
- Modify: `packages/design-kit/js/calendar/ghost-writes.js`
- Create: `netlify/functions/_shared/calendar-ghost-queue.mjs`
- Modify: `netlify/functions/calendar-ghosts.mjs`
- Test: `tests/unit/ghost-book-comm.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptPlan, validateGhost } from '../../packages/design-kit/js/calendar/ghost-writes.js';
import { enqueueCalendarGhost } from '../../netlify/functions/_shared/calendar-ghost-queue.mjs';
import { applyProfessionalStep } from '../../netlify/functions/calendar-ghosts.mjs';

const ghost = {
  id: 'clare-book_comm-2026-10-21', agent: 'clare', kind: 'book_comm', date: '2026-10-21', time: '11:50', duration_min: 15,
  title: 'Declan J. · feedback', channel: 'in_person', time_zone: 'Australia/Sydney', purpose_tag: 'feedback',
  thread_ref: 'professional:thread:thread_00000000-0000-4000-8000-000000000001',
  person_refs: ['shared:person:p_declan'], reason: 'Weekly, same slot.'
};

test('book_comm validates and plans one professional step plus a recent action', () => {
  validateGhost(ghost);
  assert.throws(() => validateGhost({ ...ghost, time: '9am' }), /time HH:MM/);
  assert.throws(() => validateGhost({ ...ghost, person_refs: [] }), /person/);
  const plan = acceptPlan(ghost, { today: '2026-10-14' });
  const step = plan.steps.find((item) => item.target === 'professional');
  assert.deepEqual(step, {
    target: 'professional', action: 'create_communication', date: '2026-10-21', time: '11:50', duration_min: 15,
    time_zone: 'Australia/Sydney', title: 'Declan J. · feedback', channel: 'in_person', purpose_tag: 'feedback',
    thread_ref: ghost.thread_ref, person_refs: ghost.person_refs
  });
  assert.match(plan.receipt, /Clare → Calendar/);
});

test('applyProfessionalStep turns wall time into UTC and links people and thread', async () => {
  const created = [];
  await applyProfessionalStep(
    { createCommunication: async (input) => { created.push(input); return { communication: { id: 'communication_x' } }; }, createLink: async (link) => created.push(link) },
    acceptPlan(ghost, { today: '2026-10-14' }).steps.find((item) => item.target === 'professional')
  );
  assert.equal(created[0].scheduled_start, '2026-10-21T00:50:00.000Z');
  assert.equal(created[0].scheduled_end, '2026-10-21T01:05:00.000Z');
  assert.deepEqual(created[0].links, [{ relationship_type: 'recipient', target_ref: 'shared:person:p_declan' }]);
  assert.deepEqual(created[1], { source_ref: 'professional:communication:communication_x', target_ref: ghost.thread_ref, relationship_type: 'in_thread' });
});

test('enqueueCalendarGhost appends once through the GitHub client', async () => {
  const files = new Map([['pending-calendar-ghosts.json', '[]']]);
  const client = {
    async resolveTree() { return { tree: [...files.keys()].map((path) => ({ path, type: 'blob', sha: path })) }; },
    async readBlob(sha) { return { content: Buffer.from(files.get(sha)).toString('base64'), encoding: 'base64' }; },
    async writeFile({ path, content }) { files.set(path, content); }
  };
  const decodeBlob = (blob) => Buffer.from(blob.content, 'base64').toString('utf8');
  const entry = { ...ghost, created_at: '2026-10-14T12:00:00+11:00', status: 'pending', via: 'clare-comms' };
  assert.equal((await enqueueCalendarGhost({ client, decodeBlob, entry })).added, true);
  assert.equal((await enqueueCalendarGhost({ client, decodeBlob, entry })).added, false);
  assert.equal(JSON.parse(files.get('pending-calendar-ghosts.json')).ghosts?.length ?? JSON.parse(files.get('pending-calendar-ghosts.json')).length, 1);
});
```

Check `decodeBlob`'s real signature and what `client.readBlob` returns with `grep -n "export function decodeBlob" -A8 netlify/functions/_shared/decode-blob.mjs`. Make the fake client in the test match, and import the real `decodeBlob` if it takes the blob object.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/ghost-book-comm.test.js`
Expected: FAIL, because the ghost kind is unknown.

- [ ] **Step 3: Implement the ghost kind** (`ghost-writes.js`)

- Add `'book_comm'` to `GHOST_KINDS`.
- `book_comm` is dated, so it stays out of the undated list in `validateGhost`. Add this after the `bedtime` check:

```js
  if (ghost.kind === 'book_comm') {
    if (!HHMM.test(ghost.time ?? '')) throw new TypeError('book_comm needs time HH:MM');
    if (!Number.isInteger(ghost.duration_min) || ghost.duration_min < 5 || ghost.duration_min > 240) throw new TypeError('book_comm needs duration_min 5–240');
    if (!oneLine(ghost.title)) throw new TypeError('book_comm needs a title');
    if (!Array.isArray(ghost.person_refs) || !ghost.person_refs.length) throw new TypeError('book_comm needs at least one person');
  }
```

Add this case in `acceptPlan`, before `default`:

```js
    case 'book_comm': {
      steps.push({
        target: 'professional',
        action: 'create_communication',
        date: ghost.date,
        time: ghost.time,
        duration_min: ghost.duration_min,
        time_zone: ghost.time_zone || 'Australia/Sydney',
        title: oneLine(ghost.title),
        channel: ghost.channel || 'in_person',
        purpose_tag: ghost.purpose_tag ?? null,
        thread_ref: ghost.thread_ref ?? null,
        person_refs: [...ghost.person_refs]
      });
      steps.push(recentAction(actedOn, who, `booked “${oneLine(ghost.title)}” ${weekday(ghost.date)} ${short(ghost.date)} ${clock12(ghost.time)}${why}`));
      receipt = `${who} → Calendar: “${oneLine(ghost.title)}”, ${weekday(ghost.date)} ${formatDisplayDate(ghost.date)} at ${clock12(ghost.time)}.`;
      break;
    }
```

`recentAction`, `weekday`, `short`, `clock12`, `why` and `who` already exist in that file. Check `recentAction`'s signature with `grep -n "function recentAction" packages/design-kit/js/calendar/ghost-writes.js`.

- [ ] **Step 4: Run Accept's `professional` steps** (`calendar-ghosts.mjs`)

In `settle`, add this next to the `tasks` routing (line ~423), so professional steps run in the same "after the commit" phase and share `tasks_pending`:

```js
    if (step.target === 'professional') {
      taskSteps.push(step);
      continue;
    }
```

Change the `tasks-only` retry filter (line ~394) to `step => step.target === 'tasks' || step.target === 'professional'`.

Add this exported function:

```js
import { wallLocalToUtcIso } from './_shared/wall-time.mjs';

/** Accept of a book_comm ghost: create the comm, then join it to its thread. */
export async function applyProfessionalStep(deps, step) {
  if (step.action !== 'create_communication') throw new TypeError(`Unknown professional step: ${step.action}`);
  const start = wallLocalToUtcIso(`${step.date}T${step.time}`, step.time_zone);
  const end = new Date(Date.parse(start) + step.duration_min * 60_000).toISOString();
  const { communication } = await deps.createCommunication({
    direction: 'outbound',
    channel: step.channel,
    occurred_at: start,
    scheduled_start: start,
    scheduled_end: end,
    time_zone: step.time_zone,
    purpose_tag: step.purpose_tag,
    subject: step.title,
    links: step.person_refs.map((ref) => ({ relationship_type: 'recipient', target_ref: ref }))
  });
  if (step.thread_ref) {
    await deps.createLink({ source_ref: `professional:communication:${communication.id}`, target_ref: step.thread_ref, relationship_type: 'in_thread' });
  }
  return communication;
}
```

Check the wall-time helper's name and argument order with `grep -n "export function" netlify/functions/_shared/wall-time.mjs`. The Professional client has `wallLocalToUtcIso(local, zone)`. Use the server equivalent. Check the comm create `links` item shape (`target_ref` vs `target`) against `prepareValidatedIntents` in `communication-repository.mjs`, and match it.

In `finishTasks`:
- Route each step: `step.target === 'professional' ? await applyProfessionalStep(await professionalDeps(), step) : await applyTaskStep(store, step, …)`.
- Add a `professionalDeps` parameter to `runGhostDecision` and `finishTasks`.

In the handler (line ~877), pass this:

```js
        professionalDeps: async () => {
          const professionalStore = await defaultGetProfessionalStore(env);
          const repo = createCommunicationRepository({ professionalStore /* same deps communications.mjs passes */ });
          const links = createUniversalLinkRepository({ /* same deps universal-links.mjs passes */ });
          return {
            createCommunication: (input) => repo.createCommunication(input),
            createLink: (link) => links.createLink(link)
          };
        },
```

Build both repositories exactly as `netlify/functions/communications.mjs` and `netlify/functions/universal-links.mjs` build theirs (read those files). Use the operator access context they use.

- [ ] **Step 5: The queue helper** `netlify/functions/_shared/calendar-ghost-queue.mjs`

```js
import { PENDING_CALENDAR_GHOSTS_PATH, appendPendingCalendarGhost } from '../calendar-ghosts.mjs';

/** Append one ghost to pending-calendar-ghosts.json. The same write chat.mjs does for propose_calendar_ghost. */
export async function enqueueCalendarGhost({ client, decodeBlob, entry }) {
  const tree = await client.resolveTree();
  const blob = (tree.tree ?? []).find((item) => item.path === PENDING_CALENDAR_GHOSTS_PATH && item.type === 'blob');
  const prior = blob ? decodeBlob(await client.readBlob(blob.sha)) : '[]';
  const { content, added } = appendPendingCalendarGhost(prior, entry);
  if (added) {
    await client.writeFile({
      path: PENDING_CALENDAR_GHOSTS_PATH,
      content,
      ...(blob?.sha ? { sha: blob.sha } : {}),
      message: `chore(calendar): propose ${entry.id}`
    });
  }
  return { added, id: entry.id };
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `node --test tests/unit/ghost-book-comm.test.js && npm run test:unit && npm run test:integration`
Expected: PASS. The existing ghost tests stay green.

- [ ] **Step 7: Commit**

```bash
git add packages/design-kit/js/calendar/ghost-writes.js netlify/functions/calendar-ghosts.mjs netlify/functions/_shared/calendar-ghost-queue.mjs tests/unit/ghost-book-comm.test.js
git commit -m "feat(calendar): book_comm ghosts; Accept creates the comm and joins its thread

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `POST /api/clare/comms`

**Files:**
- Create: `netlify/functions/clare-comms.mjs`
- Test: `tests/integration/clare-comms.test.js`

- [ ] **Step 1: Write the failing test.** Copy the SESSION HELPERS, then add this:

```js
import { createClareCommsHandler } from '../../netlify/functions/clare-comms.mjs';

const context = {
  title: 'Declan J. · essay feedback', kind: 'comm', when: 'Wed 14/10/26 11:50',
  people: [{ ref: 'shared:person:p_declan', name: 'Declan J.', role: 'with' }], previous: [], open_promises: [], notes: 'x'
};

test('brief action returns Clare’s brief', async () => {
  const handler = createClareCommsHandler({ env: { ...env, ANTHROPIC_API_KEY: 'k' }, complete: async () => ({ points: [{ text: 'One', source: 'comm 1' }], owed_line: null }) });
  const body = await (await send(handler, 'POST', '/api/clare/comms', { action: 'brief', context })).json();
  assert.equal(body.data.points[0].text, 'One');
});

test('propose_next queues a book_comm ghost, never writes the comm', async () => {
  const queued = [];
  const handler = createClareCommsHandler({
    env: { ...env, ANTHROPIC_API_KEY: 'k' },
    complete: async () => ({ date: '2026-10-21', time: '11:50', duration_min: 15, reason: 'Weekly.' }),
    enqueue: async (entry) => { queued.push(entry); return { added: true, id: entry.id }; },
    now: () => new Date('2026-10-14T01:10:00.000Z')
  });
  const res = await send(handler, 'POST', '/api/clare/comms', {
    action: 'propose_next',
    context: { ...context, time_zone: 'Australia/Sydney', purpose_tag: 'feedback', thread_ref: 'professional:thread:thread_00000000-0000-4000-8000-000000000001' }
  });
  assert.equal(res.status, 200);
  assert.equal(queued[0].kind, 'book_comm');
  assert.equal(queued[0].agent, 'clare');
  assert.deepEqual(queued[0].person_refs, ['shared:person:p_declan']);
});

test('no API key is a clear 503', async () => {
  const handler = createClareCommsHandler({ env });
  const res = await send(handler, 'POST', '/api/clare/comms', { action: 'brief', context });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'clare_unconfigured');
});

test('unknown action is a 400', async () => {
  const handler = createClareCommsHandler({ env: { ...env, ANTHROPIC_API_KEY: 'k' }, complete: async () => ({}) });
  assert.equal((await send(handler, 'POST', '/api/clare/comms', { action: 'send_email', context })).status, 400);
});
```

Check how the SESSION HELPERS' handlers read `env`. If `env` is passed per request rather than to the factory, pass `ANTHROPIC_API_KEY` the way that file passes env.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/integration/clare-comms.test.js`
Expected: FAIL, because the module isn't found.

- [ ] **Step 3: Implement** `netlify/functions/clare-comms.mjs`

```js
import { errorResponse, methodNotAllowed, okResponse, withCors } from './_shared/http.mjs';
import { createOperatorHandler } from './_shared/operator-gate.mjs';
import { readJsonObject } from './_shared/teaching-record-get.mjs';
import { completeJson } from './_shared/clare-comms-model.mjs';
import {
  checkPurpose, generateBrief, generateDrafts, generateSummary, readHandwriting, suggestNextSession, suggestTaskTitle
} from './_shared/clare-comms.mjs';
import { calendarGhostFromToolInput } from './calendar-ghosts.mjs';
import { enqueueCalendarGhost } from './_shared/calendar-ghost-queue.mjs';
import { createGitHubClient } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';

export const config = { path: '/api/clare/comms' };

const MAX_BODY_CHARS = 8_000_000;

function sydneyStamp(date) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Australia/Sydney', dateStyle: 'short', timeStyle: 'medium' }).format(date).replace(' ', 'T');
}

export function createClareCommsHandler(deps = {}) {
  const now = deps.now ?? (() => new Date());
  return createOperatorHandler(
    async (request, context) => {
      const env = deps.env ?? context.env;
      if (request.method !== 'POST') return withCors(methodNotAllowed('POST, OPTIONS'), request, env);
      const apiKey = env?.ANTHROPIC_API_KEY;
      if (!apiKey && !deps.complete) {
        return withCors(errorResponse(503, 'clare_unconfigured', 'Clare needs ANTHROPIC_API_KEY on the server.', false), request, env);
      }
      const complete = deps.complete ?? ((input) => completeJson({ ...input, apiKey }));
      const enqueue = deps.enqueue ?? ((entry) => enqueueCalendarGhost({ client: createGitHubClient({ env }), decodeBlob, entry }));
      try {
        const body = await readJsonObject(request);
        if (JSON.stringify(body).length > MAX_BODY_CHARS) {
          return withCors(errorResponse(413, 'too_large', 'That is too much for Clare in one go.', false), request, env);
        }
        const ctx = body?.context ?? {};
        switch (body?.action) {
          case 'brief': return withCors(okResponse(200, await generateBrief(ctx, { complete })), request, env);
          case 'summary': return withCors(okResponse(200, await generateSummary(ctx, { complete })), request, env);
          case 'drafts': return withCors(okResponse(200, await generateDrafts(ctx, { complete })), request, env);
          case 'handwriting': return withCors(okResponse(200, await readHandwriting(body.image, { complete })), request, env);
          case 'purpose_check': return withCors(okResponse(200, await checkPurpose(ctx, { complete })), request, env);
          case 'task_title': return withCors(okResponse(200, await suggestTaskTitle(ctx, { complete })), request, env);
          case 'propose_next': {
            const slot = await suggestNextSession(ctx, { complete });
            const entry = calendarGhostFromToolInput({
              kind: 'book_comm',
              date: slot.date,
              time: slot.time,
              duration_min: slot.duration_min,
              title: String(ctx.title ?? 'Next session').slice(0, 120),
              channel: ctx.channel ?? 'in_person',
              time_zone: ctx.time_zone ?? 'Australia/Sydney',
              purpose_tag: ctx.purpose_tag ?? null,
              thread_ref: ctx.thread_ref ?? null,
              person_refs: (ctx.people ?? []).filter((person) => person.role === 'with').map((person) => person.ref),
              reason: slot.reason
            }, { agent: 'clare', nowIso: sydneyStamp(now()) });
            const result = await enqueue({ ...entry, via: 'clare-comms' });
            return withCors(okResponse(200, { ...slot, ghost_id: result.id, queued: result.added }), request, env);
          }
          default:
            return withCors(errorResponse(400, 'invalid_action', 'Unknown Clare action.', false), request, env);
        }
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = typeof error?.code === 'string' ? error.code : 'internal_error';
        return withCors(errorResponse(status, code, error?.message || 'Clare could not finish.', status >= 500), request, env);
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

export default createClareCommsHandler();
```

Check names before relying on them:
- `readJsonObject`: in `people-ledger.mjs` it returns the object. In `knowledge-pages.mjs` it returns `{ value, error }`. Use whichever form `teaching-record-get.mjs` exports.
- `createGitHubClient` and `decodeBlob`: match how `chat.mjs` imports them.
- `getSydneyTimestamp`: if the repo already exports it (as `chat.mjs` uses), use it instead of `sydneyStamp`.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `node --test tests/integration/clare-comms.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/clare-comms.mjs tests/integration/clare-comms.test.js
git commit -m "feat(clare): /api/clare/comms

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Daily late-promise nudges

Each morning, Clare queues a draft for each promise Adam owes that is 2 or more days late. Each shows in the calendar tray as a draft to copy, and nothing is sent.

**Files:**
- Create: `netlify/functions/_shared/promise-nudges.mjs`, `netlify/functions/promise-nudges-scheduled.mjs`
- Test: `tests/unit/promise-nudges.test.js`

- [ ] **Step 1: Write the failing tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { latePromiseGhosts, selectLatePromises } from '../../netlify/functions/_shared/promise-nudges.mjs';

const items = [
  { id: 'l1', direction: 'you_owe', status: 'open', due: '2026-09-22', text: 'Email Denielle the summary', person_ref: 'shared:person:p_denielle' },
  { id: 'l2', direction: 'you_owe', status: 'open', due: '2026-09-25', text: 'Seating list', person_ref: 'shared:person:vicki' },
  { id: 'l3', direction: 'they_owe', status: 'open', due: '2026-09-20', text: 'T4 dates', person_ref: 'shared:person:kathleen' },
  { id: 'l4', direction: 'you_owe', status: 'done', due: '2026-09-20', text: 'Done', person_ref: 'shared:person:amy' }
];

test('selectLatePromises keeps your open ones at least 2 days late', () => {
  assert.deepEqual(selectLatePromises(items, '2026-09-26', 2).map((item) => item.id), ['l1', 'l2']);
  assert.deepEqual(selectLatePromises(items, '2026-09-26', 4).map((item) => item.id), ['l1']);
});

test('latePromiseGhosts builds one draft_message ghost per promise, keyed by ledger id', () => {
  const ghosts = latePromiseGhosts(selectLatePromises(items, '2026-09-26', 2), { 'shared:person:p_denielle': 'Denielle J.', 'shared:person:vicki': 'Vicki Sheehan' }, '2026-09-26T07:00:00+10:00');
  assert.equal(ghosts[0].kind, 'draft_message');
  assert.equal(ghosts[0].to, 'Denielle J.');
  assert.match(ghosts[0].text, /summary/);
  assert.equal(ghosts[0].id, 'clare-nudge-l1');
  assert.match(ghosts[0].reason, /4 days late/);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `node --test tests/unit/promise-nudges.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** `promise-nudges.mjs`

```js
import { validateGhost } from '../../../packages/design-kit/js/calendar/ghost-writes.js';

function daysBetween(fromKey, toKey) {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86_400_000);
}

export function selectLatePromises(items, todayKey, minDaysLate = 2) {
  return items.filter((item) => item.direction === 'you_owe' && item.status === 'open' && item.due && daysBetween(item.due, todayKey) >= minDaysLate);
}

/**
 * One draft per late promise. The draft is a starting point Adam edits and sends himself.
 * The id is stable per ledger item, so a dismissed nudge never comes back the next day.
 */
export function latePromiseGhosts(late, namesByRef, nowIso) {
  const today = nowIso.slice(0, 10);
  return late.map((item) => {
    const to = namesByRef[item.person_ref] ?? 'them';
    const days = daysBetween(item.due, today);
    const ghost = {
      id: `clare-nudge-${item.id}`,
      agent: 'clare',
      kind: 'draft_message',
      to,
      text: `Hi ${to.split(' ')[0]},\n\nSorry this is later than I said. ${item.text}.\n\n`,
      reason: `${days} days late`,
      ledger_id: item.id,
      created_at: nowIso,
      status: 'pending',
      via: 'promise-nudges'
    };
    validateGhost(ghost);
    return ghost;
  });
}
```

Check the relative path from `netlify/functions/_shared` to `packages/design-kit/js/calendar/ghost-writes.js`, and see how `calendar-ghosts.mjs` imports it. Use that same import path.

- [ ] **Step 4: The scheduled function** `netlify/functions/promise-nudges-scheduled.mjs`

Copy the schedule and config block from `netlify/functions/people-remember-tick-scheduled.mjs` (same cron style), set to 07:00 Sydney (`0 21 * * *` UTC in AEST; note that daylight saving moves it to 08:00, which is fine). The body does this:

```js
import { createLedgerItemRepository } from './_shared/ledger-repository.mjs';
import { defaultGetProfessionalStore } from './_shared/professional-blobs.mjs';
import { latePromiseGhosts, selectLatePromises } from './_shared/promise-nudges.mjs';
import { enqueueCalendarGhost } from './_shared/calendar-ghost-queue.mjs';
import { createGitHubClient } from './_shared/github-client.mjs';
import { decodeBlob } from './_shared/decode-blob.mjs';
import { fetchPeopleNames } from './_shared/promise-nudges-names.mjs';

export async function runPromiseNudges({ env, now = new Date(), deps = {} }) {
  const store = await (deps.getStore ?? defaultGetProfessionalStore)(env);
  const ledger = createLedgerItemRepository({ store });
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(now);
  const from = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(now.getTime() - 60 * 86_400_000));
  const late = selectLatePromises(await ledger.listDueBetween(from, today), today, 2);
  if (!late.length) return { queued: 0 };
  const names = await (deps.names ?? fetchPeopleNames)(env, late.map((item) => item.person_ref));
  const nowIso = `${today}T07:00:00+10:00`;
  let queued = 0;
  for (const entry of latePromiseGhosts(late, names, nowIso)) {
    const result = await (deps.enqueue ?? ((e) => enqueueCalendarGhost({ client: createGitHubClient({ env }), decodeBlob, entry: e })))(entry);
    if (result.added) queued += 1;
  }
  return { queued };
}
```

Create `netlify/functions/_shared/promise-nudges-names.mjs` exporting `fetchPeopleNames(env, refs)`. It returns `{ [ref]: display_name }` using `resolvePerson` from `entity-resolvers.mjs`, with the Universal Link store and the operator access context `slice11-entity-adapters.test.js` uses. It catches per ref, so an unknown person is simply left out.

Add a test to `tests/unit/promise-nudges.test.js` calling `runPromiseNudges` with `deps: { getStore, names, enqueue }` fakes. Use a memory store seeded with two late ledger records, and expect `{ queued: 2 }`.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `node --test tests/unit/promise-nudges.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add netlify/functions/_shared/promise-nudges.mjs netlify/functions/_shared/promise-nudges-names.mjs netlify/functions/promise-nudges-scheduled.mjs tests/unit/promise-nudges.test.js
git commit -m "feat(clare): daily drafts for late promises, queued on the calendar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Professional client and block-page append

**Files:**
- Create: `apps/professional/src/api/clare-comms.ts`
- Modify: `apps/professional/src/components/block-page.ts`
- Test: `apps/professional/tests/unit/api-clare-comms.test.ts`, `apps/professional/tests/unit/block-page.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clareBrief, clareHandwriting } from '@/api/clare-comms';

describe('clare comms client', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('posts the action and context', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { points: [], owed_line: null } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await clareBrief({ title: 't', kind: 'comm', when: 'w', people: [], previous: [], open_promises: [], notes: '' });
    expect(String(fetch.mock.calls[0][0])).toContain('/api/clare/comms');
    expect(JSON.parse(fetch.mock.calls[0][1].body).action).toBe('brief');
  });
  it('sends handwriting as base64 without the data: prefix', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: { text: 'hi' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    await clareHandwriting(new File([new Uint8Array([1, 2, 3])], 'note.jpg', { type: 'image/jpeg' }));
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.image).toEqual({ media_type: 'image/jpeg', data: 'AQID' });
  });
});
```

Append to `block-page.test.ts`:

```ts
it('append adds blocks and saves', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const onSave = vi.fn().mockResolvedValue(undefined);
  const page = mountBlockPage(host, { blocks: [], onSave, debounceMs: 400 });
  page.append([{ id: 'x_1', block_type: 'rich_text', variant: 'medium', content: { html: '<p>From your handwriting</p>' } }]);
  await page.flush();
  expect((onSave.mock.calls[0][0] as Array<{ id: string }>).map((block) => block.id)).toEqual(['x_1']);
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/api-clare-comms.test.ts tests/unit/block-page.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`api/clare-comms.ts`:

```ts
import { apiPost } from '@/api/client';

export type ClareContext = {
  title: string;
  kind: 'comm' | 'meeting' | 'event';
  when: string;
  purpose?: string | null;
  people: Array<{ ref: string; name: string; role: 'with' | 'also concerned' | 'attendee' }>;
  previous: Array<{ when: string; summary: string }>;
  open_promises: Array<{ direction: 'you_owe' | 'they_owe'; text: string; days_late?: number }>;
  notes: string;
  summary?: string | null;
  time_zone?: string;
  purpose_tag?: string | null;
  thread_ref?: string | null;
  channel?: string;
};

export type ClareBrief = { points: Array<{ text: string; source: string }>; owed_line: string | null };
export type ClareSummary = {
  summary: string;
  promises: Array<{ direction: 'you_owe' | 'they_owe'; person_ref: string; text: string; due: string | null }>;
  numbers: Array<{ label: string; value: string }>;
};
export type ClareDraft = { person_ref: string; to: string; subject: string; body: string };

const call = <T>(action: string, extra: object) => apiPost<T>('/api/clare/comms', { action, ...extra });

export const clareBrief = (context: ClareContext) => call<ClareBrief>('brief', { context });
export const clareSummary = (context: ClareContext) => call<ClareSummary>('summary', { context });
export const clareDrafts = (context: ClareContext) => call<{ drafts: ClareDraft[] }>('drafts', { context });
export const clarePurposeCheck = (context: ClareContext) => call<{ met: boolean; note: string }>('purpose_check', { context });
export const clareTaskTitle = (context: { title: string; notes: string }) => call<{ title: string }>('task_title', { context });
export const clareProposeNext = (context: ClareContext) =>
  call<{ date: string; time: string; duration_min: number; reason: string; ghost_id: string; queued: boolean }>('propose_next', { context });

export async function clareHandwriting(file: File): Promise<{ text: string }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return call<{ text: string }>('handwriting', { image: { media_type: file.type, data: btoa(binary) } });
}
```

If `apiPost`'s signature needs a third options argument, pass `{}`.

`block-page.ts`:
- Add `append(blocks: Block[]): void` to `BlockPageHandle`.
- In the returned object:

```ts
    append(extra) {
      blocks = [...blocks, ...extra];
      canvas.update(blocks);
      dirty = true;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void save(), debounceMs);
    },
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/api-clare-comms.test.ts tests/unit/block-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/api/clare-comms.ts apps/professional/src/components/block-page.ts apps/professional/tests/unit
git commit -m "feat(professional): Clare comms client; block page append

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Clare on the comm page

**Before:** Clare's brief is fetched when the page opens in Before, with a Refresh button. **During:** a "Read a photo" button in the live strip. **After:**
- Summarise: fills the summary and offers the promises it found, as ticked checkboxes, with an "Add" button.
- Drafts: one tab per person, with Copy and Mark as sent.
- Suggest next session: queues a ghost and says so.

**Files:**
- Modify: `apps/professional/src/views/comm-page.ts`
- Create: `apps/professional/src/lib/clare-context.ts`
- Test: `apps/professional/tests/unit/clare-context.test.ts`, `apps/professional/tests/unit/comm-page.test.ts` (append)

- [ ] **Step 1: Write the failing context test**

```ts
import { describe, expect, it } from 'vitest';
import { buildClareContext } from '@/lib/clare-context';

describe('buildClareContext', () => {
  it('maps the page into Clare’s context with days late and plain notes', () => {
    const ctx = buildClareContext({
      title: 'Declan J. · essay feedback', kind: 'comm', when: 'Wed 14/10/26 11:50',
      withPeople: [{ ref: 'shared:person:p_declan', name: 'Declan J.' }],
      alsoConcerned: [{ ref: 'shared:person:p_denielle', name: 'Denielle J.' }],
      previousSummaries: [{ when: '25/09/26', summary: 'Quote bank agreed.' }],
      ledger: [{ direction: 'you_owe', text: 'Email Denielle', status: 'open', due: '2026-09-22' }],
      blocks: [{ id: 'a', block_type: 'rich_text', content: { html: '<p>Tighter redraft.</p>' } }],
      todayKey: '2026-09-26'
    });
    expect(ctx.people).toEqual([
      { ref: 'shared:person:p_declan', name: 'Declan J.', role: 'with' },
      { ref: 'shared:person:p_denielle', name: 'Denielle J.', role: 'also concerned' }
    ]);
    expect(ctx.open_promises).toEqual([{ direction: 'you_owe', text: 'Email Denielle', days_late: 4 }]);
    expect(ctx.notes).toBe('Tighter redraft.');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/professional && npx vitest run tests/unit/clare-context.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `lib/clare-context.ts`

```ts
import type { ClareContext } from '@/api/clare-comms';
import { blockPlainText } from '@/lib/inline-promises';

function daysLate(due: string | null, todayKey: string): number | undefined {
  if (!due || due >= todayKey) return undefined;
  return Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
}

export function buildClareContext(input: {
  title: string;
  kind: ClareContext['kind'];
  when: string;
  purpose?: string | null;
  withPeople: Array<{ ref: string; name: string }>;
  alsoConcerned?: Array<{ ref: string; name: string }>;
  attendees?: Array<{ ref: string; name: string }>;
  previousSummaries: Array<{ when: string; summary: string }>;
  ledger: Array<{ direction: 'you_owe' | 'they_owe'; text: string; status: string; due: string | null }>;
  blocks: unknown[];
  summary?: string | null;
  todayKey: string;
  extra?: Partial<ClareContext>;
}): ClareContext {
  return {
    title: input.title,
    kind: input.kind,
    when: input.when,
    purpose: input.purpose ?? null,
    people: [
      ...input.withPeople.map((person) => ({ ...person, role: 'with' as const })),
      ...(input.alsoConcerned ?? []).map((person) => ({ ...person, role: 'also concerned' as const })),
      ...(input.attendees ?? []).map((person) => ({ ...person, role: 'attendee' as const }))
    ],
    previous: input.previousSummaries,
    open_promises: input.ledger
      .filter((item) => item.status === 'open')
      .map((item) => {
        const late = daysLate(item.due, input.todayKey);
        return { direction: item.direction, text: item.text, ...(late !== undefined ? { days_late: late } : {}) };
      }),
    notes: blockPlainText(input.blocks),
    summary: input.summary ?? null,
    ...input.extra
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `cd apps/professional && npx vitest run tests/unit/clare-context.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing page tests** (append to `comm-page.test.ts`, and add the Clare mock to the file's mocks)

```ts
vi.mock('@/api/clare-comms', () => ({
  clareBrief: vi.fn(async () => ({ points: [{ text: 'His redraft came in yesterday.', source: 'Canvas, 13/10' }], owed_line: 'Send Denielle the summary after this one.' })),
  clareSummary: vi.fn(async () => ({ summary: 'Good progress.', promises: [{ direction: 'they_owe', person_ref: 'shared:person:p_declan', text: 'Rewrite the fence paragraph', due: '2026-10-19' }], numbers: [] })),
  clareDrafts: vi.fn(async () => ({ drafts: [{ person_ref: 'shared:person:p_denielle', to: 'Denielle J.', subject: 'Declan update', body: 'Hi Denielle,' }] })),
  clareProposeNext: vi.fn(async () => ({ date: '2026-10-21', time: '11:50', duration_min: 15, reason: 'Weekly.', ghost_id: 'g', queued: true })),
  clareHandwriting: vi.fn(async () => ({ text: 'quote → so what?' }))
}));
```

```ts
it('Before shows Clare’s brief with sources', async () => {
  const canvas = await render();
  await vi.advanceTimersByTimeAsync(0);
  const brief = canvas.querySelector('[data-part="clare-brief"]')!;
  expect(brief.textContent).toContain('His redraft came in yesterday.');
  expect(brief.textContent).toContain('Canvas, 13/10');
  expect(brief.textContent).toContain('Send Denielle the summary after this one.');
});

it('After: Summarise fills the summary and adds ticked promises to the ledger', async () => {
  const { createLedgerItem } = await import('@/api/ledger');
  const canvas = await render();
  canvas.querySelector<HTMLButtonElement>('[data-set-phase="after"]')!.click();
  canvas.querySelector<HTMLButtonElement>('[data-part="clare-summarise"]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(canvas.querySelector<HTMLTextAreaElement>('.comm-page__summary-text')!.value).toBe('Good progress.');
  canvas.querySelector<HTMLButtonElement>('[data-part="clare-add-promises"]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(createLedgerItem).toHaveBeenCalledWith(expect.objectContaining({ text: 'Rewrite the fence paragraph', direction: 'they_owe', due: '2026-10-19' }));
});

it('After: Mark as sent logs an outbound comm to that person and ticks the promise', async () => {
  const comms = await import('@/api/communications');
  (comms as unknown as { createCommunication: ReturnType<typeof vi.fn> }).createCommunication = vi.fn(async () => ({ communication: { id: 'communication_sent' }, created: true }));
  const canvas = await render();
  canvas.querySelector<HTMLButtonElement>('[data-set-phase="after"]')!.click();
  canvas.querySelector<HTMLButtonElement>('[data-part="clare-drafts"]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  canvas.querySelector<HTMLButtonElement>('[data-part="mark-sent"]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(comms.createCommunication).toHaveBeenCalledWith(expect.objectContaining({
    direction: 'outbound', channel: 'email', subject: 'Declan update',
    links: [{ relationship_type: 'recipient', target_ref: 'shared:person:p_denielle' }]
  }));
});
```

Add `createCommunication: vi.fn(async () => ({ communication: { id: 'communication_sent' }, created: true }))` to the file's `@/api/communications` mock factory, and drop the reassignment line in the last test. Check the `links` item shape against `CommunicationLinkInput` in `api/communications.ts`, and match it.

- [ ] **Step 6: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/comm-page.test.ts`
Expected: FAIL, because there's no `clare-brief` part.

- [ ] **Step 7: Implement in `comm-page.ts`**

Add these imports:

```ts
import { clareBrief, clareDrafts, clareHandwriting, clareProposeNext, clareSummary, type ClareDraft } from '@/api/clare-comms';
import { createCommunication } from '@/api/communications';
import { buildClareContext } from '@/lib/clare-context';
```

Add this helper inside `renderCommPage` (after `data` is loaded):

```ts
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date());
  const clareContext = () => buildClareContext({
    title: data.record.subject || 'Comm',
    kind: 'comm',
    when: whenLabel(data.record),
    withPeople: data.withPeople,
    alsoConcerned: data.alsoConcerned,
    previousSummaries: [],
    ledger: data.ledger,
    blocks: data.record.blocks ?? [],
    summary: data.record.summary || null,
    todayKey,
    extra: {
      time_zone: data.record.time_zone ?? 'Australia/Sydney',
      purpose_tag: data.record.purpose_tag ?? null,
      thread_ref: data.thread?.ref ?? null,
      channel: data.record.channel
    }
  });

  function clareCard(part: string, title: string): { card: HTMLElement; body: HTMLElement } {
    const card = el('section', 'card clare');
    card.dataset.part = part;
    const head = el('p', 'clare__who', `✦ Clare · ${title}`);
    const body = el('div', 'clare__body');
    card.append(head, body);
    return { card, body };
  }

  function showClareError(body: HTMLElement, err: unknown, retry: () => void): void {
    body.replaceChildren(el('p', 'muted', err instanceof Error ? err.message : 'Clare could not finish.'));
    const again = el('button', 'btn btn--ghost', 'Try again') as HTMLButtonElement;
    again.type = 'button';
    again.addEventListener('click', retry);
    body.append(again);
  }
```

In `paintBefore`, put the brief first:

```ts
  function paintBefore(): void {
    const { card, body } = clareCard('clare-brief', 'brief');
    const load = () => {
      body.replaceChildren(el('p', 'muted', 'Clare is reading the thread…'));
      clareBrief(clareContext()).then((brief) => {
        body.replaceChildren();
        const list = el('ol');
        for (const point of brief.points) {
          const li = el('li', undefined, point.text);
          li.append(el('span', 'src', ` · ${point.source}`));
          list.append(li);
        }
        body.append(list);
        if (brief.owed_line) body.append(el('p', 'muted', brief.owed_line));
        const refresh = el('button', 'btn btn--ghost', 'Refresh') as HTMLButtonElement;
        refresh.type = 'button';
        refresh.addEventListener('click', load);
        body.append(refresh);
      }, (err) => showClareError(body, err, load));
    };
    load();
    main.append(card, carriedCard(), agendaCard());
  }
```

In `paintDuring`, add a photo reader to the live strip:

```ts
    const photo = el('label', 'btn btn--ghost', '✎ Read a photo');
    const file = el('input') as HTMLInputElement;
    file.type = 'file';
    file.accept = 'image/jpeg,image/png,image/webp';
    file.capture = 'environment';
    file.hidden = true;
    photo.append(file);
    file.addEventListener('change', async () => {
      const picked = file.files?.[0];
      if (!picked || !blockPage) return;
      photo.firstChild!.textContent = 'Reading…';
      try {
        const { text } = await clareHandwriting(picked);
        const stamp = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit' }).format(new Date());
        const html = `<p><em>From your handwriting · ${stamp}</em></p>` + text.split('\n').map((lineText) => `<p>${lineText.replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' })[c]!)}</p>`).join('');
        blockPage.append([{ id: `hand_${Date.now()}`, block_type: 'rich_text', variant: 'medium', content: { html } }]);
      } catch (err) {
        strip.append(el('span', 'muted', err instanceof Error ? err.message : 'Clare could not read that photo.'));
      } finally {
        photo.firstChild!.textContent = '✎ Read a photo';
        file.value = '';
      }
    });
    strip.append(photo);
```

**Keeping the photo:** the text block records the time of the photo. To keep the photo itself beside the text (spec §2), also append an `image` block whose `content.url` points at an uploaded copy. Look for the Tasks upload path: `grep -rn "upload" apps/tasks/src/services/client-api.ts apps/tasks/src/blocks/editors.ts | head`.
- **If an upload function exists** that returns a URL (as the image block editor uses), call it with `picked` and append `{ block_type: 'image', variant: 'large', content: { url, alt_text: 'Handwritten notes' } }` before the text block.
- **If not**, leave the photo out, and add a line to this task's commit message saying the photo isn't kept yet.

In `paintAfter`, add three Clare controls above the summary card:

```ts
    const clareRow = el('div', 'clare-row');
    const summarise = el('button', 'btn btn--secondary', '✦ Summarise') as HTMLButtonElement;
    summarise.type = 'button';
    summarise.dataset.part = 'clare-summarise';
    const draftsBtn = el('button', 'btn btn--secondary', '✦ Draft follow-ups') as HTMLButtonElement;
    draftsBtn.type = 'button';
    draftsBtn.dataset.part = 'clare-drafts';
    const nextBtn = el('button', 'btn btn--ghost', '✦ Suggest next session') as HTMLButtonElement;
    nextBtn.type = 'button';
    nextBtn.hidden = !data.thread;
    clareRow.append(summarise, draftsBtn, nextBtn);
    const found = el('div', 'clare-found');
    const draftsHost = el('div', 'clare-drafts');

    summarise.addEventListener('click', async () => {
      summarise.disabled = true;
      try {
        const out = await clareSummary(clareContext());
        text.value = out.summary;
        data.record = (await updateCommunication(data.record.id, { summary: out.summary })).communication;
        found.replaceChildren(el('h4', undefined, 'Promises Clare found'));
        const boxes: Array<[HTMLInputElement, (typeof out.promises)[number]]> = [];
        for (const promise of out.promises) {
          const label = el('label', 'clare-found__item');
          const box = el('input') as HTMLInputElement;
          box.type = 'checkbox';
          box.checked = true;
          label.append(box, document.createTextNode(` ${promise.direction === 'you_owe' ? 'You' : 'They'}: ${promise.text}${promise.due ? ` · ${promise.due.split('-').reverse().join('/')}` : ''}`));
          found.append(label);
          boxes.push([box, promise]);
        }
        const add = el('button', 'btn btn--primary', 'Add to the ledger') as HTMLButtonElement;
        add.type = 'button';
        add.dataset.part = 'clare-add-promises';
        add.addEventListener('click', async () => {
          add.disabled = true;
          for (const [box, promise] of boxes) {
            if (!box.checked) continue;
            const { item, created } = await createLedgerItem({ ...promise, comm_ref: data.commRef });
            if (created) data.ledger.push(item);
          }
          setPhase('after');
        });
        found.append(add);
      } catch (err) {
        showClareError(found, err, () => summarise.click());
      } finally {
        summarise.disabled = false;
      }
    });

    draftsBtn.addEventListener('click', async () => {
      draftsBtn.disabled = true;
      try {
        const { drafts } = await clareDrafts(clareContext());
        draftsHost.replaceChildren();
        for (const draft of drafts) draftsHost.append(draftCard(draft));
        if (!drafts.length) draftsHost.append(el('p', 'muted', 'Nobody on this page needs a follow-up.'));
      } catch (err) {
        showClareError(draftsHost, err, () => draftsBtn.click());
      } finally {
        draftsBtn.disabled = false;
      }
    });

    nextBtn.addEventListener('click', async () => {
      nextBtn.disabled = true;
      try {
        const next = await clareProposeNext(clareContext());
        nextBtn.replaceWith(el('span', 'muted', `Proposed on your calendar: ${next.date.split('-').reverse().join('/')} at ${next.time}. Accept or dismiss it there.`));
      } catch (err) {
        nextBtn.disabled = false;
        clareRow.append(el('span', 'muted', err instanceof Error ? err.message : 'Clare could not suggest a time.'));
      }
    });
```

Add `draftCard` inside `renderCommPage`:

```ts
  function draftCard(draft: ClareDraft): HTMLElement {
    const card = el('section', 'draft');
    card.append(el('p', 'draft__to', `To ${draft.to} · ${draft.subject}`));
    const body = el('textarea', 'draft__body') as HTMLTextAreaElement;
    body.value = draft.body;
    body.setAttribute('aria-label', `Draft to ${draft.to}`);
    const copy = el('button', 'btn btn--primary', 'Copy') as HTMLButtonElement;
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(body.value);
        copy.textContent = 'Copied';
      } catch {
        body.select();
      }
    });
    const sent = el('button', 'btn btn--secondary', 'Mark as sent') as HTMLButtonElement;
    sent.type = 'button';
    sent.dataset.part = 'mark-sent';
    sent.addEventListener('click', async () => {
      sent.disabled = true;
      const { communication } = await createCommunication({
        direction: 'outbound', channel: 'email', occurred_at: new Date().toISOString(),
        subject: draft.subject, summary: body.value,
        links: [{ relationship_type: 'recipient', target_ref: draft.person_ref }]
      });
      if (data.thread) {
        await createUniversalLink({ source_ref: `professional:communication:${communication.id}`, target_ref: data.thread.ref, relationship_type: 'in_thread' });
      }
      const owed = data.ledger.find((item) => item.status === 'open' && item.direction === 'you_owe' && item.person_ref === draft.person_ref);
      if (owed) Object.assign(owed, (await patchLedger(owed.id, { status: 'done', checked_in_ref: `professional:communication:${communication.id}` })).item);
      sent.replaceWith(el('span', 'quiet-link', '✓ Logged as sent'));
    });
    card.append(body, copy, sent);
    return card;
  }
```

`paintAfter` appends `clareRow, found, summary, ledger, draftsHost, follow` in that order. `text` is the summary textarea already created in `paintAfter`, so declare it before `summarise`'s handler uses it.

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/comm-page.test.ts tests/unit/clare-context.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/professional/src apps/professional/tests
git commit -m "feat(professional): Clare's brief, photo reading, summary, promises, drafts and next session on the comm page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Clare on meetings and events

**Files:**
- Modify: `apps/professional/src/views/meeting-page.ts`, `apps/professional/src/components/schedule-relationships.ts`, `apps/professional/src/views/events.ts` (learning task panel)
- Test: `apps/professional/tests/unit/meeting-page.test.ts` (append), `apps/professional/tests/unit/task-link-auto-retry.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Meeting (add this mock to the file, then append the test):

```ts
vi.mock('@/api/clare-comms', () => ({
  clarePurposeCheck: vi.fn(async () => ({ met: false, note: 'TeachMeet date was deferred to October.' })),
  clareSummary: vi.fn(async () => ({ summary: 'Board agreed the run sheet.', promises: [], numbers: [] })),
  clareHandwriting: vi.fn()
}));

it('After: purpose check shows the verdict and offers to carry it forward', async () => {
  const { createLedgerItem } = await import('@/api/ledger');
  const canvas = await render();
  canvas.querySelector<HTMLButtonElement>('[data-set-phase="after"]')!.click();
  canvas.querySelector<HTMLButtonElement>('[data-part="purpose-check"]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(canvas.textContent).toContain('TeachMeet date was deferred to October.');
  canvas.querySelector<HTMLButtonElement>('[data-part="carry-purpose"]')!.click();
  await vi.advanceTimersByTimeAsync(0);
  expect(createLedgerItem).toHaveBeenCalledWith(expect.objectContaining({ direction: 'you_owe', text: expect.stringContaining('Carried:') }));
});
```

The test meeting needs a purpose. Set `purpose: 'Get a yes on the TeachMeet date'` in the file's `meeting` fixture.

Task link panel (append):

```ts
it('prefills the title from suggestTitle', async () => {
  vi.useRealTimers();
  const host = document.createElement('div');
  document.body.append(host);
  mountTaskLinkPanel({
    host, heading: 'Learning task', relationshipType: 'learning_for', onSubmit: async () => {},
    suggestTitle: async () => 'Apply Warlight close-reading to the Y10 unit'
  });
  await vi.waitFor(() => expect(host.querySelector<HTMLInputElement>('input[aria-label="Learning task title"]')!.value).toBe('Apply Warlight close-reading to the Y10 unit'));
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/meeting-page.test.ts tests/unit/task-link-auto-retry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`schedule-relationships.ts`:
- Add `suggestTitle?: () => Promise<string>` to `mountTaskLinkPanel`'s options.
- After `title` is created, add this:

```ts
  if (options.suggestTitle) {
    title.placeholder = 'Clare is suggesting a title…';
    options.suggestTitle().then(
      (suggested) => {
        if (!title.value) title.value = suggested;
        title.placeholder = 'Task title';
      },
      () => {
        title.placeholder = 'Task title';
      }
    );
  }
```

`events.ts` `buildLearningTaskPanel`: pass this to `mountTaskLinkPanel`:

```ts
      suggestTitle: () => clareTaskTitle({ title: record.title, notes: blockPlainText(record.blocks ?? []) }).then((out) => out.title),
```

Import `clareTaskTitle` from `@/api/clare-comms` and `blockPlainText` from `@/lib/inline-promises`.

`meeting-page.ts`: in `setPhase`, when `next === 'after'`, put a card above the notes:

```ts
    if (next === 'after' && record.purpose) {
      const card = el('section', 'card clare');
      card.append(el('p', 'clare__who', '✦ Clare · did you get what you came for?'));
      const check = el('button', 'btn btn--secondary', 'Check against your purpose') as HTMLButtonElement;
      check.type = 'button';
      check.dataset.part = 'purpose-check';
      const out = el('div');
      check.addEventListener('click', async () => {
        check.disabled = true;
        try {
          const verdict = await clarePurposeCheck(buildClareContext({
            title: record.title, kind: 'meeting', when: record.scheduled_start, purpose: record.purpose,
            withPeople: [], attendees: people, previousSummaries: [], ledger, blocks: blockPage?.current() ?? record.blocks ?? [],
            todayKey: new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date())
          }));
          out.replaceChildren(el('p', verdict.met ? 'quiet-link' : 'muted', `${verdict.met ? '✓ Met' : '◐ Not yet'}. ${verdict.note}`));
          if (!verdict.met && people[0]) {
            const carry = el('button', 'btn btn--ghost', 'Carry it to next time') as HTMLButtonElement;
            carry.type = 'button';
            carry.dataset.part = 'carry-purpose';
            carry.addEventListener('click', async () => {
              carry.disabled = true;
              await createLedgerItem({ direction: 'you_owe', person_ref: people[0]!.ref, text: `Carried: ${record.purpose}`, comm_ref: meetingRef });
              carry.replaceWith(el('span', 'quiet-link', '✓ It will open your next meeting in this thread'));
            });
            out.append(carry);
          }
        } catch (err) {
          out.replaceChildren(el('p', 'muted', err instanceof Error ? err.message : 'Clare could not check.'));
        } finally {
          check.disabled = false;
        }
      });
      card.append(check, out);
      main.prepend(card);
    }
```

Add the imports: `clarePurposeCheck` from `@/api/clare-comms`, and `buildClareContext` from `@/lib/clare-context`.

A carried item is a `you_owe` ledger item made in this meeting. If the meeting is in a thread, the next meeting's Before shows it as carried, through Plan 2's previous-member logic. That logic was written for comms, so extend `loadPage`'s thread lookup in the meeting page the same way if the meeting has an `in_thread` link.

Also add the same "✎ Read a photo" button to the meeting's During strip. Copy the handler from Task 7 exactly, pointing at the meeting's `blockPage`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src apps/professional/tests
git commit -m "feat(professional): Clare checks meeting purpose, reads photos, suggests learning task titles

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Walk-in, nudges, channel guess and quick-log logic

**Files:**
- Create: `apps/professional/src/lib/walk-in.ts`
- Test: `apps/professional/tests/unit/walk-in.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { guessChannel, homeNudges, nextWalkIn, quickLogBody } from '@/lib/walk-in';

const now = new Date('2026-10-13T21:31:00.000Z'); // Wed 14/10 8:31 am Sydney

describe('nextWalkIn', () => {
  it('picks the soonest comm or meeting starting within 10 minutes, or already running under 15', () => {
    const items = [
      { kind: 'comm' as const, id: 'c1', title: 'Fletcher W. · session 8', start: '2026-10-13T21:40:00.000Z', href: '#/communication/c1' },
      { kind: 'meeting' as const, id: 'm1', title: 'Nina · gifted audit', start: '2026-10-13T23:20:00.000Z', href: '#/meeting/m1' }
    ];
    expect(nextWalkIn(items, now)?.id).toBe('c1');
    expect(nextWalkIn(items, now)?.minutes).toBe(9);
    expect(nextWalkIn(items, new Date('2026-10-13T21:20:00.000Z'))).toBeNull();
    expect(nextWalkIn(items, new Date('2026-10-13T21:50:00.000Z'))?.minutes).toBe(-10);
  });
});

describe('homeNudges', () => {
  it('orders late promises, wrap-ups and quiet threads, at most 5', () => {
    const nudges = homeNudges({
      late: [{ text: 'Email Denielle J.', days_late: 3, href: '#/communication/c0' }],
      wrapUps: [{ title: 'Declan J. + Denielle', href: '#/communication/c2' }],
      quiet: [{ title: 'Kathleen E. · enrichment', days: 9, href: '#/thread/t1' }]
    });
    expect(nudges.map((nudge) => nudge.text)).toEqual([
      'Email Denielle J. · 3 days late',
      'Wrap up Declan J. + Denielle',
      'Kathleen E. · enrichment has been quiet for 9 days'
    ]);
  });
});

describe('guessChannel', () => {
  it('in person during school hours on a weekday, otherwise a text', () => {
    expect(guessChannel(new Date('2026-10-14T02:47:00.000Z'))).toBe('in_person'); // Wed 12:47
    expect(guessChannel(new Date('2026-10-14T09:00:00.000Z'))).toBe('message'); // Wed 8 pm
    expect(guessChannel(new Date('2026-10-17T02:00:00.000Z'))).toBe('message'); // Sat
  });
});

describe('quickLogBody', () => {
  it('builds a logged comm with the person as recipient and pulls out »me', () => {
    const body = quickLogBody({
      personRef: 'shared:person:p_declan', channel: 'in_person',
      line: 'Chat after period 4: essay plan fine, needs a quote bank. »me send quote bank by Thu',
      at: new Date('2026-10-14T02:47:00.000Z')
    });
    expect(body.communication).toEqual({
      direction: 'outbound', channel: 'in_person', occurred_at: '2026-10-14T02:47:00.000Z',
      subject: 'Chat after period 4: essay plan fine, needs a quote bank.',
      summary: 'Chat after period 4: essay plan fine, needs a quote bank. »me send quote bank by Thu',
      links: [{ relationship_type: 'recipient', target_ref: 'shared:person:p_declan' }]
    });
    expect(body.promises).toEqual([{ direction: 'you_owe', person_ref: 'shared:person:p_declan', text: 'send quote bank by Thu' }]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/walk-in.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** `lib/walk-in.ts`

```ts
import { extractInlinePromises } from '@/lib/inline-promises';

export type WalkInItem = { kind: 'comm' | 'meeting'; id: string; title: string; start: string; href: string };

/** The card shows from 10 minutes before until 15 minutes in. minutes < 0 means it has started. */
export function nextWalkIn(items: WalkInItem[], now: Date): (WalkInItem & { minutes: number }) | null {
  const t = now.getTime();
  const open = items
    .map((item) => ({ ...item, minutes: Math.round((Date.parse(item.start) - t) / 60_000) }))
    .filter((item) => item.minutes <= 10 && item.minutes > -15)
    .sort((a, b) => a.minutes - b.minutes);
  return open.find((item) => item.minutes >= 0) ?? open.at(-1) ?? null;
}

export function homeNudges(input: {
  late: Array<{ text: string; days_late: number; href: string }>;
  wrapUps: Array<{ title: string; href: string }>;
  quiet: Array<{ title: string; days: number; href: string }>;
}): Array<{ text: string; href: string; tone: 'late' | 'wrap' | 'quiet' }> {
  return [
    ...input.late.map((item) => ({ text: `${item.text} · ${item.days_late} day${item.days_late === 1 ? '' : 's'} late`, href: item.href, tone: 'late' as const })),
    ...input.wrapUps.map((item) => ({ text: `Wrap up ${item.title}`, href: item.href, tone: 'wrap' as const })),
    ...input.quiet.map((item) => ({ text: `${item.title} has been quiet for ${item.days} days`, href: item.href, tone: 'quiet' as const }))
  ].slice(0, 5);
}

function sydneyParts(at: Date): { weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '0';
  return { weekday: get('weekday'), minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** At school on a weekday (8:00–15:30), a quick log is most likely in person; otherwise a text. */
export function guessChannel(at: Date): 'in_person' | 'message' {
  const { weekday, minutes } = sydneyParts(at);
  const weekdayOk = !['Sat', 'Sun'].includes(weekday);
  return weekdayOk && minutes >= 8 * 60 && minutes <= 15 * 60 + 30 ? 'in_person' : 'message';
}

export function quickLogBody(input: { personRef: string; channel: string; line: string; at: Date }): {
  communication: {
    direction: 'outbound'; channel: string; occurred_at: string; subject: string; summary: string;
    links: Array<{ relationship_type: 'recipient'; target_ref: string }>;
  };
  promises: Array<{ direction: 'you_owe' | 'they_owe'; person_ref: string; text: string }>;
} {
  const line = input.line.trim();
  const beforePromise = line.split('»')[0]!.trim();
  const firstSentence = (beforePromise.match(/^.*?[.!?](\s|$)/)?.[0] ?? beforePromise).trim();
  const promises = extractInlinePromises(line.replace(/\s*»/g, '\n»'))
    .map((promise) => ({
      direction: (promise.owner.toLowerCase() === 'me' ? 'you_owe' : 'they_owe') as 'you_owe' | 'they_owe',
      person_ref: input.personRef,
      text: promise.text
    }));
  return {
    communication: {
      direction: 'outbound',
      channel: input.channel,
      occurred_at: input.at.toISOString(),
      subject: firstSentence.slice(0, 120),
      summary: line,
      links: [{ relationship_type: 'recipient', target_ref: input.personRef }]
    },
    promises
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/walk-in.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src/lib/walk-in.ts apps/professional/tests/unit/walk-in.test.ts
git commit -m "feat(professional): walk-in, home nudges, channel guess, quick-log body

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The walk-in card and nudges on Home

**Files:**
- Modify: `apps/professional/src/views/home.ts`
- Create: `apps/professional/src/styles/walk-in.css`
- Test: `apps/professional/tests/unit/home-view.test.ts` (append)

**Home loads:**
- Meetings (already).
- `listCommunications()`, filtered to comms with a `scheduled_start`.
- `/api/people/ledger?due_from=<today-60>&due_to=<yesterday>` for late promises. Add `listLedgerDue(from, to)` to `api/ledger.ts`, calling the Plan 1 endpoint.
- Wrap-ups: comms and meetings from the last 3 days whose end has passed and whose summary is empty.
- Quiet threads: `listThreads()` open threads whose `updated_at` is over 14 days ago, where the thread has an open `they_owe` item. To keep Home fast, check at most 10 threads.

- [ ] **Step 1: Write the failing test** (append; use the file's render helper, and mock `@/api/communications`, `@/api/ledger` and `@/api/clare-comms`)

```ts
it('shows the walk-in card with Clare’s three points ten minutes before a comm', async () => {
  vi.useFakeTimers({ now: new Date('2026-10-13T21:31:00.000Z') });
  // Arrange: listCommunications returns one comm, scheduled_start '2026-10-13T21:40:00.000Z',
  // subject 'Fletcher W. · session 8'; clareBrief resolves { points: [a, b, c], owed_line: 'Amy template done ✓' }.
  const canvas = await renderHomeForTest();
  await vi.advanceTimersByTimeAsync(0);
  const card = canvas.querySelector('[data-part="walk-in"]')!;
  expect(card.textContent).toContain('Fletcher W. · session 8');
  expect(card.textContent).toContain('in 9 min');
  expect(card.querySelectorAll('li').length).toBe(3);
  expect(card.querySelector('a[data-part="walk-in-start"]')?.getAttribute('href')).toContain('#/communication/');
  vi.useRealTimers();
});

it('lists late promises first in the nudges', async () => {
  // Arrange: listLedgerDue resolves one you_owe item due 3 days ago, text 'Email Denielle J.'.
  const canvas = await renderHomeForTest();
  expect(canvas.querySelector('[data-part="nudges"]')?.textContent).toContain('Email Denielle J. · 3 days late');
});
```

Fill the two Arrange comments with the file's own mocking pattern.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `cd apps/professional && npx vitest run tests/unit/home-view.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `home.ts`, add this function and call it first in the Home canvas, above the existing sections:

```ts
async function renderWalkInAndNudges(host: HTMLElement, meetings: MeetingRecord[]): Promise<void> {
  const now = new Date();
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(now);
  const dayKey = (offset: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney' }).format(new Date(now.getTime() + offset * 86_400_000));
  const [{ communications }, { items: lateItems }] = await Promise.all([
    listCommunications().catch(() => ({ communications: [] as CommunicationRecord[] })),
    listLedgerDue(dayKey(-60), dayKey(-1)).catch(() => ({ items: [] as LedgerItem[] }))
  ]);

  const walk = nextWalkIn([
    ...communications.filter((comm) => comm.scheduled_start).map((comm) => ({ kind: 'comm' as const, id: comm.id, title: comm.subject || 'Comm', start: comm.scheduled_start!, href: `#/communication/${encodeURIComponent(comm.id)}` })),
    ...meetings.map((meeting) => ({ kind: 'meeting' as const, id: meeting.id, title: meeting.title, start: meeting.scheduled_start, href: `#/meeting/${encodeURIComponent(meeting.id)}` }))
  ], now);

  if (walk) {
    const card = el('section', 'walk-in');
    card.dataset.part = 'walk-in';
    card.append(el('p', 'walk-in__count', walk.minutes >= 0 ? `in ${walk.minutes} min` : `started ${-walk.minutes} min ago`), el('h3', undefined, walk.title));
    const list = el('ol');
    card.append(list);
    const owed = el('p', 'walk-in__owe');
    card.append(owed);
    const start = el('a', 'btn walk-in__start', 'Start') as HTMLAnchorElement;
    start.href = walk.href;
    start.dataset.part = 'walk-in-start';
    card.append(start);
    host.append(card);
    clareBrief({ title: walk.title, kind: walk.kind, when: walk.start, people: [], previous: [], open_promises: [], notes: '' })
      .then((brief) => {
        for (const point of brief.points) list.append(el('li', undefined, point.text));
        owed.textContent = brief.owed_line ?? '';
      })
      .catch(() => list.append(el('li', undefined, 'Open the page for the full brief.')));
  }

  const late = lateItems
    .filter((item) => item.direction === 'you_owe' && item.status === 'open' && item.due && item.due < todayKey)
    .map((item) => ({
      text: item.text,
      days_late: Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${item.due}T00:00:00Z`)) / 86_400_000),
      href: item.comm_ref ? `#/communication/${encodeURIComponent(item.comm_ref.split(':').pop()!)}` : '#/calendar'
    }));
  const wrapUps = communications
    .filter((comm) => comm.scheduled_end && Date.parse(comm.scheduled_end) < now.getTime() && Date.parse(comm.scheduled_end) > now.getTime() - 3 * 86_400_000 && !comm.summary)
    .map((comm) => ({ title: comm.subject || 'a comm', href: `#/communication/${encodeURIComponent(comm.id)}` }));
  const nudges = homeNudges({ late, wrapUps, quiet: [] });
  if (nudges.length) {
    const card = el('section', 'card home-nudges');
    card.dataset.part = 'nudges';
    card.append(el('h3', undefined, 'Clare noticed'));
    for (const nudge of nudges) {
      const link = el('a', `home-nudges__item is-${nudge.tone}`, nudge.text) as HTMLAnchorElement;
      link.href = nudge.href;
      card.append(link);
    }
    host.append(card);
  }
}
```

The walk-in brief gets the title only, so Clare's brief is thin on Home. For a full brief:
- Extract `loadPage` + `clareContext` from `comm-page.ts` into `views/comm-context.ts` (a `loadClareContextForComm(id)` export).
- Call it here when `walk.kind === 'comm'`.
- Do the same for meetings from `meeting-page.ts`.
- Test this with the comm-page mocks.

Quiet threads (spec §9 nudges): pass `quiet` from open threads whose `updated_at` is 14–60 days old and that have an open `they_owe` item (`listLedgerForSources` over their latest member). Cap it at 10 threads. Add a test case with one quiet thread.

Add the imports:
- `nextWalkIn` and `homeNudges` from `@/lib/walk-in`
- `clareBrief` from `@/api/clare-comms`
- `listCommunications` from `@/api/communications`
- `listLedgerDue` from `@/api/ledger`

Add `listLedgerDue` to `api/ledger.ts`:

```ts
export function listLedgerDue(from: string, to: string, options: { signal?: AbortSignal } = {}): Promise<{ items: LedgerItem[] }> {
  return apiGet(`/api/people/ledger?${new URLSearchParams({ due_from: from, due_to: to }).toString()}`, { signal: options.signal });
}
```

`styles/walk-in.css`: port the mockup's `.walkin` and `.owe` rules (tab 6) to `.walk-in`, `.walk-in__count` and `.walk-in__owe`, using tokens only. It must look right at 390px, where it's the first thing on Home. Import it in `main.ts`.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run tests/unit/home-view.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src apps/professional/tests
git commit -m "feat(professional): walk-in card and Clare's nudges on Home

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The 10-second log

**Files:**
- Create: `apps/professional/src/views/quick-log.ts`, `apps/professional/src/styles/quick-log.css`
- Modify: `apps/professional/src/app/router.ts`, `app/main.ts`, `shell/shell.ts`
- Test: `apps/professional/tests/unit/quick-log.test.ts`, `apps/professional/tests/unit/router.test.ts` (append)

- [ ] **Step 1: Write the failing tests**

Router (append): `expect(parseRoute('#/log')).toEqual({ name: 'log' });`

View:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/api/people-directory', () => ({
  fetchPeopleDirectory: vi.fn(async () => ({ people: [
    { ref: 'shared:person:p_declan', display_name: 'Declan J.', initials: 'DJ', updated_at: '2026-10-14T01:00:00.000Z' },
    { ref: 'shared:person:p_fletcher', display_name: 'Fletcher W.', initials: 'FW', updated_at: '2026-10-13T01:00:00.000Z' }
  ], organisations: [], counts: { people: 2, organisations: 0 } }))
}));
vi.mock('@/api/communications', () => ({ createCommunication: vi.fn(async () => ({ communication: { id: 'communication_new' }, created: true })) }));
vi.mock('@/api/ledger', () => ({ createLedgerItem: vi.fn(async (body: object) => ({ item: body, created: true })) }));

import { renderQuickLog } from '@/views/quick-log';
import { createCommunication } from '@/api/communications';
import { createLedgerItem } from '@/api/ledger';

describe('quick log', () => {
  afterEach(() => document.body.replaceChildren());

  it('logs a chat with the most recent person and a »me promise, then opens it', async () => {
    const canvas = document.createElement('div');
    document.body.append(canvas);
    const navigate = vi.fn();
    await renderQuickLog(canvas, { now: () => new Date('2026-10-14T02:47:00.000Z'), navigate });
    expect(canvas.querySelector('[data-person][aria-pressed="true"]')?.textContent).toContain('Declan J.');
    expect(canvas.querySelector('[data-channel="in_person"]')?.getAttribute('aria-pressed')).toBe('true');
    const field = canvas.querySelector<HTMLTextAreaElement>('textarea')!;
    field.value = 'Essay plan fine. »me send quote bank by Thu';
    canvas.querySelector<HTMLButtonElement>('[data-part="log-it"]')!.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('#/communication/communication_new'));
    expect(createCommunication).toHaveBeenCalledWith(expect.objectContaining({ channel: 'in_person', subject: 'Essay plan fine.' }));
    expect(createLedgerItem).toHaveBeenCalledWith(expect.objectContaining({ direction: 'you_owe', text: 'send quote bank by Thu', comm_ref: 'professional:communication:communication_new' }));
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `cd apps/professional && npx vitest run tests/unit/quick-log.test.ts tests/unit/router.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Router:
- Add `| { name: 'log' }` to the `Route` union.
- Add `if (segments.length === 1 && segments[0] === 'log') return { name: 'log' };`.
- In `railHighlightFor`, map `'log'` to `'calendar'`.

`views/quick-log.ts`:

```ts
import { fetchPeopleDirectory } from '@/api/people-directory';
import { createCommunication } from '@/api/communications';
import { createLedgerItem } from '@/api/ledger';
import { guessChannel, quickLogBody } from '@/lib/walk-in';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const CHANNELS: Array<[string, string, string]> = [
  ['in_person', '☺', 'In person'], ['email', '✉', 'Email'], ['phone', '☏', 'Call'], ['message', '✆', 'Text']
];

export async function renderQuickLog(
  canvas: HTMLElement,
  options: { now?: () => Date; navigate?: (hash: string) => void } = {}
): Promise<void> {
  const now = options.now ?? (() => new Date());
  const navigate = options.navigate ?? ((hash: string) => { location.hash = hash; });
  const { people } = await fetchPeopleDirectory();
  const recent = [...people].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 8);
  let personRef = recent[0]?.ref ?? null;
  let channel: string = guessChannel(now());

  const sheet = el('section', 'quick-log');
  sheet.append(el('h2', 'quick-log__title', 'Log a comm'));
  const who = el('div', 'quick-log__people');
  who.setAttribute('role', 'group');
  who.setAttribute('aria-label', 'Who');
  const paintWho = () => {
    for (const button of who.querySelectorAll<HTMLButtonElement>('[data-person]')) {
      button.setAttribute('aria-pressed', String(button.dataset.person === personRef));
    }
  };
  for (const person of recent) {
    const button = el('button', 'quick-log__person') as HTMLButtonElement;
    button.type = 'button';
    button.dataset.person = person.ref;
    button.append(el('span', 'quick-log__initials', person.initials), el('span', undefined, person.display_name));
    button.addEventListener('click', () => { personRef = person.ref; paintWho(); });
    who.append(button);
  }
  const anyone = el('a', 'quick-log__person', '＋ Anyone') as HTMLAnchorElement;
  anyone.href = '#/communication/new';
  who.append(anyone);

  const channels = el('div', 'quick-log__channels');
  const paintChannels = () => {
    for (const button of channels.querySelectorAll<HTMLButtonElement>('[data-channel]')) {
      button.setAttribute('aria-pressed', String(button.dataset.channel === channel));
    }
  };
  for (const [value, icon, label] of CHANNELS) {
    const button = el('button', 'quick-log__channel') as HTMLButtonElement;
    button.type = 'button';
    button.dataset.channel = value;
    button.append(el('span', undefined, icon), el('span', undefined, label));
    button.addEventListener('click', () => { channel = value; paintChannels(); });
    channels.append(button);
  }

  const field = el('textarea', 'quick-log__line') as HTMLTextAreaElement;
  field.rows = 3;
  field.placeholder = 'One line. »me … makes it a promise.';
  field.setAttribute('aria-label', 'What happened');
  const status = el('p', 'muted');
  const logIt = el('button', 'btn btn--primary quick-log__go', 'Log it') as HTMLButtonElement;
  logIt.type = 'button';
  logIt.dataset.part = 'log-it';
  logIt.addEventListener('click', async () => {
    if (!personRef || !field.value.trim()) {
      status.textContent = 'Pick a person and write one line.';
      return;
    }
    logIt.disabled = true;
    try {
      const body = quickLogBody({ personRef, channel, line: field.value, at: now() });
      const { communication } = await createCommunication(body.communication);
      for (const promise of body.promises) {
        await createLedgerItem({ ...promise, comm_ref: `professional:communication:${communication.id}` });
      }
      navigate(`#/communication/${encodeURIComponent(communication.id)}`);
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Could not log that. Try again.';
      logIt.disabled = false;
    }
  });

  sheet.append(who, channels, field, logIt, status);
  canvas.replaceChildren(sheet);
  paintWho();
  paintChannels();
  field.focus();
}
```

Opening the new comm lets Plan 2's auto-join file it into the right thread. The spec's "Clare files it into the thread" is met by that rule, with Undo.

`main.ts`: add a `log` branch with `renderPageHeader(shell, { eyebrow: 'Calendar', title: 'Log a comm' })` and `await renderQuickLog(shell.canvas)`.

`shell.ts` `syncMobileChrome`: add a primary item between Home and People:

```ts
      {
        id: 'log',
        label: 'Log',
        paths: RAIL_ICON_PATHS.communications,
        href: '#/log',
        current: active === 'calendar' && location.hash.startsWith('#/log')
      },
```

If `mountMobileChrome`'s primary list is capped at three, replace Organisations with Log there (Organisations stays in "more").

`styles/quick-log.css`: port the mockup's `.sheet`, `.recents`, `.chan` and `.field` rules (tab 6) to the classes above, using tokens only. At under 720px, `.quick-log` sits at the bottom of the screen as a sheet (`position:sticky;bottom:0`) with 16px side padding. Buttons are at least 44px tall.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `cd apps/professional && npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/professional/src apps/professional/tests
git commit -m "feat(professional): 10-second log

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Full check

- [ ] **Step 1:** `npm test`. Expected: all pass.
- [ ] **Step 2:** `cd apps/professional && npx vitest run && npx tsc --noEmit && cd ../.. && npm run build`. Expected: pass.
- [ ] **Step 3:** `node --test --test-concurrency=1 tests/browser/calendar-filter.spec.mjs tests/browser/professional-calendar-hub.spec.mjs && TIDELINE_APP=1 node --test tests/browser/tideline-visual.spec.mjs`. Expected: PASS.
- [ ] **Step 4: Walk it with a real `ANTHROPIC_API_KEY`** in the dev env:
  - Open a comm in Before: Clare's three points, with sources, appear within a few seconds.
  - In During, photograph a handwritten page: its text appears as a block.
  - In After:
    - Summarise: a summary and ticked promises appear, and Add puts them in the ledger.
    - Draft follow-ups: one per person. Copy, then Mark as sent: a new outbound comm appears in the thread, and the matching promise is ticked.
    - Suggest next session: a dashed Clare chip appears on the calendar. Accept creates the comm in its thread.
  - On a meeting with a purpose, check it after: "Not yet" offers Carry it to next time.
  - On the phone (390px): the walk-in card leads Home 10 minutes before a timed comm, and Log opens the 10-second log.
  - The next morning, a late promise shows as a Clare draft in the calendar tray.
- [ ] **Step 5:** `git push`. The comms framework is done. Plan 5 (the Notion import) follows. When Adam is ready, open the single PR for the branch.

---

## Self-review

**Spec coverage (§9 table, plus the Clare parts of §2, §5, §7 and §8):**

| Spec item | Where it's handled |
|---|---|
| Before brief (3 points with sources, owed line) | Tasks 2, 4, 7 |
| During: handwriting to text; transcripts as text are summarised | Tasks 2, 7, 8 |
| After: summary, promises, drafts | Tasks 2, 7 |
| After: next-date ghost (`book_comm`, queue-only) | Tasks 2–4, 7 |
| Mark as sent logs a comm and ticks the promise | Task 7 |
| Always: late promises → daily draft ghosts; Home nudges for late, wrap-ups and quiet | Tasks 5, 9, 10 |
| Meeting purpose check and carry forward | Task 8 |
| §7 Clare-suggested task title | Task 8 |
| §8 walk-in card | Tasks 9, 10 |
| §8 10-second log with channel guess and »me | Tasks 9, 11 |
| Clare never sends; never writes the calendar directly | Drafts are copy-only. Calendar changes only through ghosts accepted on the server (Tasks 3–5). |

**Honest gaps, stated in the plan:**
- Audio isn't transcribed. Transcripts come in as text.
- The handwriting photo is kept only if a Tasks upload helper exists (Task 7 says what to do either way).
- Decisions on the organisation page wait for the Organisations build.

**Types:**
- `ClareContext`, `ClareBrief`, `ClareSummary`, `ClareDraft` (Task 6) are used in 7, 8 and 10.
- `buildClareContext` (7) is used in 7, 8 and 10.
- `BlockPageHandle.append` (6) is used in 7 and 8.
- `nextWalkIn`, `homeNudges`, `guessChannel`, `quickLogBody` (9) are used in 10 and 11.
- `applyProfessionalStep` and `enqueueCalendarGhost` (3) are used in 4 and 5.
