import test from 'node:test';
import assert from 'node:assert/strict';
import { peerAction } from '../../netlify/functions/_shared/peer-feedback.mjs';
import { createPublishedPeerFeedbackHandler } from '../../netlify/functions/published-peer-feedback.mjs';
import { createPeerFeedbackHandler } from '../../netlify/functions/peer-feedback.mjs';
import { BlockSchema } from '../../netlify/functions/_shared/teaching-block-schema.mjs';
const block = { id: 'peer1', type: 'block', block_type: 'peer_feedback', variant: 'medium', visibility: 'student_teacher', content: { prompt: 'Explain your reasoning.' }, created_at: '2026-10-16T00:00:00.000Z', updated_at: '2026-10-16T00:00:00.000Z', schema_version: 1 };
function storeFixture() {
  const data = new Map([['lessons/lesson1', { blocks: [block] }], ['published/lessons/lesson1', { blocks: [block] }]]);
  return {
    data,
    async get(key, options) { assert.equal(options.consistency, 'strong'); return structuredClone(data.get(key) ?? null); },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    }
  };
}
const call = (store, body, teacher = false) => peerAction(store, 'lesson1', 'peer1', body, teacher);
test('peer feedback publishes as a new block with default structured feedback prompts', () => {
  assert.equal(BlockSchema.parse(block).content.strength_prompt, 'One thing that works well…');
});
const tokens = n => Array.from({ length: n }, (_, i) => ({ token: (i + 1).toString(16).repeat(48).slice(0, 48) }));
async function joinAll(store, activity, n) {
  const students = tokens(n).map(t => ({ ...t, session: activity.session }));
  await Promise.all(students.map(s => call(store, { ...s, action: 'join', code: activity.code })));
  await call(store, { action: 'symbols', show: true }, true);
  for (const s of students) s.symbol = (await call(store, s)).symbol;
  await call(store, { action: 'symbols', show: false }, true);
  return students;
}
test('whole exchange: symbols handed out silently, no self review, private feedback, write-once, session isolation', async () => {
  const store = storeFixture(); const activity = await call(store, { action: 'start' }, true);
  const students = await joinAll(store, activity, 3);
  assert.equal(new Set(students.map(s => s.symbol)).size, 3, 'every student gets their own symbol');
  const again = await call(store, { ...students[0], action: 'join', code: activity.code });
  assert.equal(again.symbol, null, 'symbols stay hidden unless the teacher shows them');
  assert.equal((await call(store, { action: 'symbols', show: true }, true)).show_symbols, true);
  assert.equal((await call(store, students[0])).symbol, students[0].symbol, 'rejoining keeps the same symbol');
  await call(store, { action: 'symbols', show: false }, true);
  await assert.rejects(call(store, { ...tokens(4)[3], session: activity.session, action: 'join', code: 'wrong' }), /didn’t match/);
  const publicState = await call(store, {});
  assert.deepEqual(Object.keys(publicState).sort(), ['phase', 'session']);
  for (const [i, s] of students.entries()) await call(store, { ...s, action: 'submit', text: `Writing ${i}` });
  await call(store, { ...students[0], action: 'submit', text: 'overwrite' });
  assert.equal((await call(store, students[0])).text, 'Writing 0');
  const review = await call(store, { action: 'review' }, true);
  assert.equal(review.assignments, undefined);
  assert.equal(new Set(review.rows.map(r => r.reviewer)).size, 3);
  for (const row of review.rows) { assert.ok(row.reviewer); assert.notEqual(row.reviewer, row.id); }
  for (const s of students) {
    const state = await call(store, s); assert.ok(state.assigned_text); assert.notEqual(state.assigned_text, state.text);
    await call(store, { ...s, action: 'feedback', strength: `Strength ${s.symbol}`, suggestion: 'Add evidence' });
    assert.equal((await call(store, s)).received, null);
  }
  const returned = await call(store, { action: 'results' }, true);
  for (const row of returned.rows) { assert.ok(row.gave); assert.equal(row.received.strength, `Strength ${row.reviewer}`); assert.equal(row.received.status, 'ok'); }
  for (const s of students) { const state = await call(store, s); assert.equal(state.received.suggestion, 'Add evidence'); assert.notEqual(state.received.strength, `Strength ${s.symbol}`); assert.equal(state.received.flagged, undefined); }
  await call(store, { action: 'start' }, true);
  await assert.rejects(call(store, students[0]), /Join again/);
});
test('abusive feedback is held from the writer until the teacher releases it, or removed for good', async () => {
  const store = storeFixture(); const a = await call(store, { action: 'start' }, true);
  const students = await joinAll(store, a, 2);
  for (const s of students) await call(store, { ...s, action: 'submit', text: `Answer by ${s.symbol}` });
  await call(store, { action: 'review' }, true);
  const [rude, kind] = students;
  await call(store, { ...rude, action: 'feedback', strength: 'nothing', suggestion: 'ur a piece of sh1t' });
  await call(store, { ...kind, action: 'feedback', strength: 'Clear point', suggestion: 'Add a quote' });
  const t = await call(store, { action: 'results' }, true);
  const victimRow = t.rows.find(r => r.reviewer === rude.symbol);
  assert.equal(victimRow.received.flagged, true); assert.equal(victimRow.received.status, 'held');
  assert.equal((await call(store, kind)).received, null, 'held from the writer');
  assert.equal((await call(store, rude)).received.strength, 'Clear point', 'clean feedback goes through');
  await call(store, { action: 'release', reviewer: rude.symbol }, true);
  assert.equal((await call(store, kind)).received.suggestion, 'ur a piece of sh1t');
  await call(store, { action: 'remove', reviewer: rude.symbol }, true);
  assert.equal((await call(store, kind)).received, null);
  assert.equal((await call(store, {}, true)).rows.find(r => r.reviewer === rude.symbol).received.status, 'removed');
});
test('a flagged answer is marked for the teacher', async () => {
  const store = storeFixture(); const a = await call(store, { action: 'start' }, true);
  const [s] = await joinAll(store, a, 1);
  await call(store, { ...s, action: 'submit', text: 'this whole task is f u c k i n g dumb' });
  assert.equal((await call(store, {}, true)).rows[0].flagged, true);
});
test('moderation excludes writing; late and excluded students cannot submit reviews', async () => {
  const store = storeFixture(); const a = await call(store, { action: 'start' }, true);
  const students = await joinAll(store, a, 3);
  for (const s of students) await call(store, { ...s, action: 'submit', text: s.symbol });
  const [first, second, third] = students.map(s => s.symbol);
  await assert.rejects(call(store, { action: 'review', exclude: [first, second] }, true), /at least two/);
  const review = await call(store, { action: 'review', exclude: [third] }, true);
  assert.equal(review.rows.find(r => r.id === third).included, false);
  await assert.rejects(call(store, { ...students[2], action: 'feedback', strength: 'x', suggestion: 'x' }), /no writing/);
  await assert.rejects(call(store, { ...students[0], action: 'submit', text: 'late' }), /ended/);
  await assert.rejects(call(store, { ...tokens(5)[4], session: a.session, action: 'join', code: a.code }), /closed/);
  store.data.delete('published/lessons/lesson1'); await assert.rejects(call(store, students[0]), /Publish/);
});
test('deleted or removed blocks are unreachable even while the published snapshot exists', async () => {
  const store = storeFixture(); await call(store, { action: 'start' }, true);
  store.data.set('lessons/lesson1', { blocks: [] }); await assert.rejects(call(store, {}), /Publish/);
  store.data.set('lessons/lesson1', { status: 'deleted', blocks: [block] }); await assert.rejects(call(store, {}), /Publish/);
});
test('public production entry permits account-free status but rejects bad origins and malformed requests', async () => {
  const store = storeFixture(); const origin = 'https://life-hub.adam-russell.com';
  const handler = createPublishedPeerFeedbackHandler({ getContentStore: async () => store, env: { SITE_ORIGIN: origin } });
  const request = (body, from = origin) => new Request('https://api.example/api/published/peer-feedback/lesson1/peer1', { method: 'POST', headers: { origin: from }, body });
  const response = await handler(request('{}'));
  assert.equal(response.status, 200); assert.equal((await response.json()).data.phase, 'idle');
  assert.equal((await handler(request('{}', 'https://evil.example'))).status, 403);
  assert.equal((await handler(request('null'))).status, 400);
});
test('teacher production entry starts sessions only behind the operator session gate', async () => {
  const store = storeFixture(); const origin = 'https://life-hub.adam-russell.com';
  const deps = { getContentStore: async () => store, env: { SITE_ORIGIN: origin, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' }, verifySessionToken: () => ({ valid: true }) };
  const req = () => new Request('https://api.example/api/lessons/lesson1/peer-feedback/peer1', { method: 'POST', headers: { origin, cookie: 'umbrella_session=ok' }, body: JSON.stringify({ action: 'start' }) });
  const response = await createPeerFeedbackHandler(deps)(req());
  assert.equal(response.status, 200); assert.match((await response.json()).data.code, /^\d{6}$/);
  assert.equal((await createPeerFeedbackHandler({ ...deps, verifySessionToken: () => ({ valid: false }) })(req())).status, 401);
});
test('ending an activity closes it for everyone', async () => {
  const store = storeFixture(); const a = await call(store, { action: 'start' }, true);
  const students = await joinAll(store, a, 2);
  for (const s of students) await call(store, { ...s, action: 'submit', text: 'x' });
  assert.equal((await call(store, { action: 'end' }, true)).phase, 'idle');
  assert.equal((await call(store, students[0])).phase, 'idle');
  assert.equal((await call(store, {}, true)).phase, 'idle');
});
