// tests/unit/thinking-guide.test.js
// The guide with a mocked model: triage (start, likely, alternative; one question at most; map
// fallback), check-ins (carry on by default, suggest only from the shortlist and never a declined
// option, hand over only from a detour, digest rewritten at `returned`), timeouts and bad JSON
// fall back quietly, spend logged per call, and the API. Invented situations only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createMemoryCognitiveStore } from '../../netlify/functions/_shared/cognitive-store.mjs';
import { createThreadStore } from '../../netlify/functions/_shared/thinking-threads/store.mjs';
import { addSession, createThread, recordRoute } from '../../netlify/functions/_shared/thinking-threads/thread.mjs';
import { createGuide, parseJsonReply } from '../../netlify/functions/_shared/thinking-guide/guide.mjs';
import { monthKey, readSpend, recordSpend } from '../../netlify/functions/_shared/thinking-guide/spend.mjs';
import { GUIDE_MODEL } from '../../netlify/functions/_shared/thinking-guide/pricing.mjs';
import { createThinkingGuideHandler } from '../../netlify/functions/thinking-threads-guide.mjs';

const NOW = '2026-11-10T09:00:00.000Z';
const SITUATION = 'I am choosing between two evening classes and I keep putting off the decision.';
const USAGE = { input_tokens: 2000, output_tokens: 200 };

function setup(replies) {
  const threads = createThreadStore(createMemoryCognitiveStore());
  const prompts = [];
  const queue = [...replies];
  const model = async (prompt) => {
    prompts.push(prompt);
    const next = queue.shift();
    if (typeof next === 'function') return next(prompt);
    return { text: typeof next === 'string' ? next : JSON.stringify(next), usage: USAGE };
  };
  const logs = [];
  const guide = createGuide({ model, threads, owner: 'me', now: () => NOW, timeoutMs: 50, log: (e) => logs.push(e) });
  return { threads, guide, prompts, logs };
}

async function seedThread(threads, { detour = false, declined = null } = {}) {
  let t = createThread({ situation: SITUATION, homeSession: { kind: 'tool', tool: 'problem-solver', sessionId: 'home-1' }, now: NOW });
  if (detour) t = addSession(t, { kind: 'tool', tool: 'rules-book', sessionId: 'det-1', role: 'detour', from: { sessionId: 'home-1', stepId: 'explore' }, now: NOW });
  if (declined) t = recordRoute(t, { joint: 'step_done', optionId: declined, outcome: 'not_now', stepId: 'explore', sessionId: 'home-1', now: NOW });
  return threads.create('me', t);
}

test('parseJsonReply takes the first object and refuses the rest', () => {
  assert.deepEqual(parseJsonReply('Sure: {"verdict":"carry_on"} done'), { verdict: 'carry_on' });
  assert.equal(parseJsonReply('not json'), null);
  assert.equal(parseJsonReply('[1,2]'), null);
});

test('triage: a valid reply keeps start, up to two likely and an alternative from the shortlist', async () => {
  const { guide, prompts } = setup([{ start: { optionId: 'tool:decision-book', reason: 'It is a choice between two.' }, likely: ['tool:get-things-done', 'made:up', 'tool:decision-book'], alternative: { optionId: 'tool:problem-solver', reason: 'If the real trouble is something else.' } }]);
  const out = await guide.triage({ situation: SITUATION });
  assert.deepEqual(out, { start: { optionId: 'tool:decision-book', reason: 'It is a choice between two.' }, likely: ['tool:get-things-done'], alternative: { optionId: 'tool:problem-solver', reason: 'If the real trouble is something else.' } });
  assert.match(prompts[0].user, /tool:question-book/, 'every tool is on the shortlist');
  assert.match(prompts[0].user, /ONE short clarifying question/);
});

test('triage: one question at most; with an answer it must choose', async () => {
  const { guide, prompts } = setup([{ question: 'Is the trouble the choice or starting?' }, { question: 'Another?' }]);
  assert.deepEqual(await guide.triage({ situation: 'Stuck.' }), { question: 'Is the trouble the choice or starting?' });
  const second = await guide.triage({ situation: 'Stuck.', answer: 'The choice.' });
  assert.equal(second.fallback, true, 'a second question is not allowed: the map answers');
  assert.match(prompts[1].user, /Do not ask a question; choose\./);
});

test('triage falls back to the map: bad JSON, an option outside the shortlist, a timeout', async () => {
  const slow = () => new Promise((resolve) => setTimeout(() => resolve({ text: '{}', usage: null }), 500));
  const { guide, logs } = setup(['no json here', { start: { optionId: 'rb_not_real', reason: 'x' } }, slow]);
  for (let i = 0; i < 3; i += 1) {
    const out = await guide.triage({ situation: SITUATION });
    assert.equal(out.fallback, true);
    assert.equal(out.start.reason, '');
    assert.equal(out.likely.length, 1);
    assert.ok(out.alternative.optionId);
  }
  assert.ok(logs.some((e) => e.code === 'off_shortlist'));
  assert.ok(logs.some((e) => e.code === 'guide_timeout'));
  await assert.rejects(guide.triage({ situation: ' ' }), { status: 400 });
});

test('check-in: carry on is the default; a suggestion from the shortlist is shown and logged', async () => {
  const { guide, threads } = setup([{ verdict: 'carry_on' }, { verdict: 'suggest', optionId: 'tool:decision-book', reason: 'This step is really a choice.', why: 'Two options, weighed.' }]);
  const t = await seedThread(threads);
  assert.deepEqual(await guide.checkIn({ threadId: t.id, joint: 'step_done', sessionId: 'home-1', stepId: 'explore' }), { verdict: 'carry_on' });
  const out = await guide.checkIn({ threadId: t.id, joint: 'step_done', sessionId: 'home-1', stepId: 'explore', latestStep: { title: 'Explore', text: 'Weighing the two classes.' } });
  assert.equal(out.verdict, 'suggest');
  assert.equal(out.optionId, 'tool:decision-book');
  const after = await threads.get('me', t.id);
  assert.deepEqual(after.route.at(-1), { at: NOW, joint: 'step_done', optionId: 'tool:decision-book', reason: 'This step is really a choice.', outcome: 'shown', stepId: 'explore', sessionId: 'home-1' });
});

test('check-in: an option outside the shortlist, one in the thread, or one declined at this step is dropped', async () => {
  const { guide, threads, prompts } = setup([
    { verdict: 'suggest', optionId: 'made:up', reason: 'x' },
    { verdict: 'suggest', optionId: 'tool:problem-solver', reason: 'Already home.' },
    { verdict: 'suggest', optionId: 'tool:decision-book', reason: 'Again.' }
  ]);
  const t = await seedThread(threads, { declined: 'tool:decision-book' });
  for (let i = 0; i < 3; i += 1) assert.deepEqual(await guide.checkIn({ threadId: t.id, joint: 'step_done', sessionId: 'home-1', stepId: 'explore' }), { verdict: 'carry_on' });
  assert.match(prompts[0].user, /DECLINED HERE: tool:decision-book/);
  assert.doesNotMatch(prompts[0].user, /- tool:decision-book \|/, 'the declined option is not offered');
  assert.doesNotMatch(prompts[0].user, /- tool:problem-solver \|/, 'the home tool is not offered');
  assert.equal((await threads.get('me', t.id)).route.length, 1, 'nothing new shown');
});

test('check-in: hand over only from a detour; a detour never suggests', async () => {
  const { guide, threads, prompts } = setup([
    { verdict: 'hand_over', reason: 'This is the real work now.' },
    { verdict: 'suggest', optionId: 'tool:decision-book', reason: 'x' },
    { verdict: 'hand_over', reason: 'Not from home.' }
  ]);
  const t = await seedThread(threads, { detour: true });
  assert.equal((await guide.checkIn({ threadId: t.id, joint: 'step_done', sessionId: 'det-1' })).verdict, 'hand_over');
  assert.match(prompts[0].user, /"verdict": "hand_over"/);
  assert.doesNotMatch(prompts[0].user, /"verdict": "suggest"/);
  assert.equal((await guide.checkIn({ threadId: t.id, joint: 'step_done', sessionId: 'det-1' })).verdict, 'carry_on');
  assert.equal((await guide.checkIn({ threadId: t.id, joint: 'step_done', sessionId: 'home-1' })).verdict, 'carry_on');
});

test('check-in at returned rewrites the digest in the same write; failures carry on quietly', async () => {
  const { guide, threads, prompts } = setup([
    { verdict: 'carry_on', digest: { facts: ['Two classes, both on Tuesdays'], choices: ['Pottery', 'Spanish'], restsOn: [], openQuestions: ['Which one lasts longer?'] } },
    'garbled',
    () => { throw new Error('provider down'); }
  ]);
  const t = await seedThread(threads);
  assert.equal((await guide.checkIn({ threadId: t.id, joint: 'returned', sessionId: 'home-1' })).verdict, 'carry_on');
  assert.match(prompts[0].user, /"digest"/);
  const after = await threads.get('me', t.id);
  assert.deepEqual(after.digest.choices, ['Pottery', 'Spanish']);
  assert.equal(after.revision, 1);
  assert.deepEqual(await guide.checkIn({ threadId: t.id, joint: 'step_done', sessionId: 'home-1' }), { verdict: 'carry_on', fallback: true });
  assert.deepEqual(await guide.checkIn({ threadId: t.id, joint: 'step_done', sessionId: 'home-1' }), { verdict: 'carry_on', fallback: true });
});

test('spend: each call is logged per Sydney month in A$', async () => {
  const { guide, threads } = setup([{ verdict: 'carry_on' }]);
  const t = await seedThread(threads);
  await guide.checkIn({ threadId: t.id, joint: 'framed', sessionId: 'home-1' });
  await recordSpend(threads, 'me', { model: GUIDE_MODEL, usage: { input_tokens: 1_000_000, output_tokens: 0 }, kind: 'triage', now: NOW });
  const spend = await readSpend(threads, 'me', NOW);
  assert.equal(spend.month, '2026-11');
  assert.equal(spend.calls, 2);
  assert.ok(spend.aud > 0.15 && spend.aud < 0.16, String(spend.aud));
  const row = await threads.getMeta('me', 'guide-spend-2026-11');
  assert.deepEqual(row.byKind, { check_in: 1, triage: 1 });
  assert.equal(monthKey('2026-10-31T14:00:00.000Z'), '2026-11', 'Sydney is already in November');
});

const MS = Date.parse('2026-11-10T20:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const TOKEN = createSessionToken({ now: MS, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

test('API: triage, check-in with a known joint, and the spend line', async () => {
  const store = createMemoryCognitiveStore();
  const handler = createThinkingGuideHandler({ env: ENV, now: () => MS, getStore: async () => store, model: async () => ({ text: '{"verdict":"carry_on","start":{"optionId":"tool:decision-book","reason":"A choice."}}', usage: USAGE }) });
  const call = async (method, body, query = '') => {
    const res = await handler(new Request(`https://life.example/api/thinking-threads/guide${query}`, { method, headers: { cookie: `life_hub_session=${TOKEN}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
    return { status: res.status, data: (await res.json()).data };
  };
  assert.equal((await call('POST', { triage: { situation: SITUATION } })).data.start.optionId, 'tool:decision-book');
  const t = await createThreadStore(store).create('operator', createThread({ situation: SITUATION, homeSession: { kind: 'tool', tool: 'problem-solver', sessionId: 'home-1' }, now: NOW }));
  assert.equal((await call('POST', { checkIn: { threadId: t.id, joint: 'framed', sessionId: 'home-1' } })).data.verdict, 'carry_on');
  assert.equal((await call('POST', { checkIn: { threadId: t.id, joint: 'lunch', sessionId: 'home-1' } })).status, 400);
  assert.equal((await call('POST', {})).status, 400);
  const spend = await call('GET', null, '?spend=1');
  assert.equal(spend.data.calls, 2);
  assert.equal(spend.data.month, '2026-11');
});
