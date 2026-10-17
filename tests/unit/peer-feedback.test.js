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
test('whole exchange: unique identities, no self review, private feedback, immutable submissions and session isolation', async () => {
  const store = storeFixture(); const activity = await call(store, { action: 'start' }, true);
  const students = ['0-0', '1-0', '2-0'].map((identity, i) => ({ identity, session: activity.session, token: String(i + 1).repeat(48) }));
  await Promise.all(students.map(s => call(store, { ...s, action: 'join', code: activity.code })));
  await assert.rejects(call(store, { ...students[0], token: 'a'.repeat(48), action: 'join', code: activity.code }), /already taken/);
  await assert.rejects(call(store, { ...students[0], action: 'join', code: 'wrong' }), /code/);
  const publicState = await call(store, {});
  assert.equal(publicState.taken.length, 3); assert.equal(publicState.code, undefined); assert.equal(publicState.rows, undefined);
  for (const [i, s] of students.entries()) await call(store, { ...s, action: 'submit', text: `Writing ${i}` });
  await call(store, { ...students[0], action: 'submit', text: 'overwrite' });
  assert.equal((await call(store, students[0])).text, 'Writing 0');
  const review = await call(store, { action: 'review' }, true);
  assert.equal(new Set(Object.values(review.assignments)).size, 3);
  for (const [from, to] of Object.entries(review.assignments)) assert.notEqual(from, to);
  for (const s of students) {
    const state = await call(store, s); assert.ok(state.assigned_text); assert.notEqual(state.assigned_text, state.text);
    await call(store, { ...s, action: 'feedback', strength: `Strength ${s.identity}`, suggestion: 'Add evidence' });
    assert.equal((await call(store, s)).received, null);
  }
  await call(store, { action: 'results' }, true);
  for (const s of students) { const state = await call(store, s); assert.equal(state.received.suggestion, 'Add evidence'); assert.notEqual(state.received.strength, `Strength ${s.identity}`); }
  await call(store, { action: 'start' }, true);
  await assert.rejects(call(store, students[0]), /Join again/);
});
test('moderation excludes writing; late and excluded students cannot submit reviews', async () => {
  const store = storeFixture(); const a = await call(store, { action: 'start' }, true);
  const students = ['0-0', '1-0', '2-0'].map((identity, i) => ({ identity, session: a.session, token: String(i + 1).repeat(48) }));
  for (const s of students) { await call(store, { ...s, action: 'join', code: a.code }); await call(store, { ...s, action: 'submit', text: s.identity }); }
  await assert.rejects(call(store, { action: 'review', exclude: ['0-0', '1-0'] }, true), /at least two/);
  const review = await call(store, { action: 'review', exclude: ['2-0'] }, true);
  assert.equal(review.assignments['2-0'], undefined);
  await assert.rejects(call(store, { ...students[2], action: 'feedback', strength: 'x', suggestion: 'x' }), /no writing/);
  await assert.rejects(call(store, { ...students[0], action: 'submit', text: 'late' }), /ended/);
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
