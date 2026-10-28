import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createGoalsHandler } from '../../netlify/functions/goals.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';

const SECRET = 's'.repeat(32);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, SITE_ORIGIN: 'https://life-hub.adam-russell.com' };
const session = createSessionToken({ now: Date.parse('2026-08-01T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;

function memoryStore() {
  const map = new Map();
  return {
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async setJSON(key, value) { map.set(key, value); },
    async delete(key) { map.delete(key); },
    async list({ prefix }) { return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const call = (handler, { method = 'GET', url = 'https://api.adam-russell.com/api/goals', body } = {}) => handler(new Request(url, {
  method,
  headers: { cookie: `life_hub_session=${session}`, origin: 'https://tasks-hub.adam-russell.com', ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
}));

test('the goals endpoint keeps one active WalkThru technique, and parking frees the slot', async () => {
  const store = memoryStore();
  const handler = createGoalsHandler({ env, now: () => Date.parse('2026-08-01T01:00:00Z'), getContentStore: async () => store });
  const first = await call(handler, { method: 'POST', body: { title: 'Cold calling', sphere: 'professional', walkthru: { technique_id: 'w1-cold-calling' } } });
  assert.equal(first.status, 201);
  const a = (await first.json()).data;
  assert.equal(a.walkthru.technique_id, 'w1-cold-calling');
  assert.equal(a.walkthru.stage, 'attempt');

  const second = await call(handler, { method: 'POST', body: { title: 'Quizzing', sphere: 'professional', walkthru: { technique_id: 'w1-quizzing' } } });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error.code, 'walkthru_active');

  // an ordinary professional goal is unaffected
  assert.equal((await call(handler, { method: 'POST', body: { title: 'Mentor a colleague', sphere: 'professional' } })).status, 201);

  // park the first, and the second can start
  assert.equal((await call(handler, { method: 'PATCH', url: `https://api.adam-russell.com/api/goals?id=${a.id}`, body: { status: 'parked' } })).status, 200);
  const third = await call(handler, { method: 'POST', body: { title: 'Quizzing', sphere: 'professional', walkthru: { technique_id: 'w1-quizzing' } } });
  assert.equal(third.status, 201);
  const b = (await third.json()).data;

  // un-parking the first while the second is live is refused, and the first stays parked
  const back = await call(handler, { method: 'PATCH', url: `https://api.adam-russell.com/api/goals?id=${a.id}`, body: { status: 'active' } });
  assert.equal(back.status, 409);
  const read = await call(handler, { url: `https://api.adam-russell.com/api/goals?id=${a.id}` });
  assert.equal((await read.json()).data.status, 'parked');

  // moving the live goal along saves its stage and adapted notes
  const moved = await call(handler, { method: 'PATCH', url: `https://api.adam-russell.com/api/goals?id=${b.id}`, body: { walkthru: { technique_id: 'w1-quizzing', stage: 'adapt', adapted: { 2: 'my version' } } } });
  assert.equal(moved.status, 200);
  assert.deepEqual((await moved.json()).data.walkthru.adapted, { 2: 'my version' });
});

test('students never receive WalkThru notes or jots, on a note or on any block that carries them', () => {
  const SENTINEL = 'JOT-SENTINEL-2468';
  const note = { id: 'n1', block_type: 'teacher_note', visibility: 'teacher_only', content: { title: 'Note', html: '', walkthru: { set: 1, id: 'w1-cold-calling', jots: { 1: SENTINEL } } } };
  const stray = { id: 'q1', block_type: 'rich_text', visibility: 'student_teacher', content: { html: '<p>Hi</p>', walkthru: { set: 1, id: 'w1-cold-calling', jots: { 1: SENTINEL } } } };
  const nested = { id: 's1', block_type: 'section', visibility: 'student_teacher', content: { title: 'S', blocks: [note, stray] } };
  const out = JSON.stringify(filterBlocksForStudent([note, stray, nested]));
  assert.ok(!out.includes(SENTINEL));
  assert.ok(!out.includes('walkthru'));
  assert.ok(out.includes('<p>Hi</p>'));
});
