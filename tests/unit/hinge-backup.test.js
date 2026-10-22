import test from 'node:test';
import assert from 'node:assert/strict';
import { createHingeHandler } from '../../netlify/functions/hinge.mjs';
import { createTextToolsHandler } from '../../netlify/functions/teaching-text-tools.mjs';
import { createTextToolsRunHandler } from '../../netlify/functions/teaching-text-tools-run.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const env = { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y', ANTHROPIC_API_KEY: 'test-key' };

const hinge = {
  id: 'hq1', type: 'block', block_type: 'hinge_question', variant: 'medium', visibility: 'student_teacher',
  content: {
    prompt: '"If we wait one more year, there will be nothing left to save." What is the main effect of this line?',
    options: [
      { id: 'a', text: 'It creates urgency', misconception: '' },
      { id: 'b', text: 'It uses an appeal to fear', misconception: 'naming the technique is explaining its effect' }
    ],
    correct_id: 'a', seconds: 60, move_on: 65, reteach: 40
  }
};

function memoryStore() {
  const map = new Map([
    ['lessons/lesson1', { blocks: [hinge] }],
    ['published/lessons/lesson1', { blocks: filterBlocksForStudent([hinge]) }]
  ]);
  return {
    map,
    async get(key) { return map.has(key) ? structuredClone(map.get(key)) : null; },
    async setJSON(key, value) { map.set(key, structuredClone(value)); return { modified: true }; },
    async list({ prefix }) { return { blobs: [...map.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const deps = (store, extra = {}) => ({ getContentStore: async () => store, verifySessionToken: () => ({ valid: true }), env, ...extra });
const req = (method, path, body) =>
  new Request(`https://api.adam-russell.com${path}`, {
    method,
    headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: 'life_hub_session=ok' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

const REPLY = JSON.stringify({
  prompt: '"Every one of you will have to explain why you did nothing." What is the main effect of this line?',
  options: [
    { text: 'It uses direct address', right: false, misconception: 'naming the technique is explaining its effect' },
    { text: 'It makes each listener feel responsible', right: true, misconception: '' }
  ]
});

test('the hinge route starts Ann\'s back-up as a job; the page polls it and gets one checked question', async () => {
  const store = memoryStore();
  const kicked = [];
  const route = createHingeHandler(deps(store, { kickTextToolRun: async (_r, path, key) => (kicked.push({ path, key }), true) }));
  const started = await route(req('POST', '/api/lessons/lesson1/hinge/hq1', { action: 'draft_backup' }), {});
  assert.equal(started.status, 200);
  const view = (await started.json()).data;
  assert.equal(view.status, 'working');
  assert.deepEqual(kicked, [{ path: '/api/text-tools-run', key: view.key }]);

  const calls = [];
  const run = createTextToolsRunHandler(deps(store, { completeMessage: async (args) => (calls.push(args), REPLY) }));
  assert.equal((await run(req('POST', '/api/text-tools-run', { key: view.key }), {})).status, 200);
  assert.equal(calls[0].model, 'claude-sonnet-5-5');
  assert.match(calls[0].messages[0].content, /appeal to fear \(0 picked it; teacher's note: naming the technique/);

  const poll = createTextToolsHandler(deps(store));
  const done = (await (await poll(req('GET', `/api/text-tools/${view.key}`), { params: { key: view.key } })).json()).data;
  assert.equal(done.status, 'done');
  assert.equal(done.result.options.filter((o) => o.right).length, 1);

  // The same question and votes reuse the finished job instead of paying again.
  const again = (await (await route(req('POST', '/api/lessons/lesson1/hinge/hq1', { action: 'draft_backup' }), {})).json()).data;
  assert.equal(again.status, 'done');
  assert.equal(kicked.length, 1);
});

test('the public text tools route will not start a hinge back-up', async () => {
  const handler = createTextToolsHandler(deps(memoryStore()));
  const response = await handler(req('POST', '/api/text-tools', { tool: 'hinge_backup', html: '<p>Anything at all</p>' }), {});
  assert.equal(response.status, 400);
});
