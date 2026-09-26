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
