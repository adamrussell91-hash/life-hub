import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryAlchemyStore } from '../helpers/alchemy-store.js';
import { createAlchemyAgentHandler } from '../../netlify/functions/alchemy-agent.mjs';
import { createAlchemyAgentRunHandler } from '../../netlify/functions/alchemy-agent-run.mjs';
import { readUnitNotes } from '../../netlify/functions/_shared/alchemy-unit-notes.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32), ANTHROPIC_API_KEY: 'test' };

function setup(extra = {}) {
  const store = memoryAlchemyStore();
  store.rows.set('lessons/l1', { data: { id: 'l1', title: 'Invented lesson', unit_id: 'u1', blocks: [] }, etag: '0' });
  const started = [];
  const deps = { env, getContentStore: async () => store, verifySessionToken: t => ({ valid: t === 'ok' }), invokeRun: async (_req, id) => { started.push(id); return true; }, ...extra };
  const handler = createAlchemyAgentHandler(deps);
  const runner = createAlchemyAgentRunHandler({ ...deps, run: extra.run ?? (async ({ onProgress }) => { onProgress('Reading your rules'); onProgress('Searching: memory'); return { summary: 'One change.', proposals: [{ id: 'p1', blockId: 'h1', path: 'content.text', oldStr: 'a', newStr: 'b', why: 'Better.', source: { noteId: 'n1', title: 'Invented note', quote: 'A quoted passage here.' } }], stoppedEarly: false }; }) });
  const call = (h, method, path, body) => h(new Request('https://api.example' + path, { method, headers: { 'content-type': 'application/json', cookie: 'life_hub_session=ok' }, ...(body ? { body: JSON.stringify(body) } : {}) }));
  return { store, started, handler, runner, call };
}

test('starting a review creates one job per lesson and hands it to the runner', async () => {
  const { handler, started, call } = setup();
  const first = await call(handler, 'POST', '/api/alchemy-agent', { kind: 'lesson', id: 'l1' });
  assert.equal(first.status, 202);
  const job = (await first.json()).data;
  assert.equal(job.status, 'working');
  assert.deepEqual(started, [job.job]);
  const again = (await (await call(handler, 'POST', '/api/alchemy-agent', { kind: 'lesson', id: 'l1' })).json()).data;
  assert.equal(again.job, job.job);
  assert.equal(started.length, 1);
});

test('the runner writes progress and the result, then frees the lesson', async () => {
  const { handler, runner, call, started } = setup();
  const { job } = (await (await call(handler, 'POST', '/api/alchemy-agent', { kind: 'lesson', id: 'l1' })).json()).data;
  assert.equal((await call(runner, 'POST', '/api/alchemy-agent/run', { id: job })).status, 200);
  const done = (await (await call(handler, 'GET', '/api/alchemy-agent?job=' + job)).json()).data;
  assert.equal(done.status, 'done');
  assert.deepEqual(done.progress.map(p => p.text), ['Reading your rules', 'Searching: memory']);
  assert.equal(done.result.proposals[0].id, 'p1');
  const latest = (await (await call(handler, 'GET', '/api/alchemy-agent?kind=lesson&id=l1')).json()).data;
  assert.equal(latest.job, job);
  await call(handler, 'POST', '/api/alchemy-agent', { kind: 'lesson', id: 'l1' });
  assert.equal(started.length, 2);
});

test('a failed run shows Ann’s message, not a stack', async () => {
  const { handler, runner, call } = setup({ run: async () => { throw Object.assign(new Error('That block is no longer in the lesson.'), { status: 409, code: 'alchemy_stale' }); } });
  const { job } = (await (await call(handler, 'POST', '/api/alchemy-agent', { kind: 'lesson', id: 'l1' })).json()).data;
  await call(runner, 'POST', '/api/alchemy-agent/run', { id: job });
  const failed = (await (await call(handler, 'GET', '/api/alchemy-agent?job=' + job)).json()).data;
  assert.equal(failed.status, 'error');
  assert.equal(failed.error.message, 'That block is no longer in the lesson.');
});

test('accepting a suggestion records it and keeps its note on the unit shelf', async () => {
  const { handler, runner, call, store } = setup();
  const { job } = (await (await call(handler, 'POST', '/api/alchemy-agent', { kind: 'lesson', id: 'l1' })).json()).data;
  await call(runner, 'POST', '/api/alchemy-agent/run', { id: job });
  const res = await call(handler, 'POST', '/api/alchemy-agent', { action: 'accepted', job, proposal: 'p1' });
  assert.equal((await res.json()).data.decisions.p1, 'accepted');
  assert.deepEqual((await readUnitNotes(store, 'u1')).notes.map(n => n.id), ['n1']);
});

test('the daily allowance stops lesson reviews', async () => {
  const { handler, runner, call } = setup({ env: { ...env, ALCHEMY_AGENT_DAILY_RUNS: '1' } });
  const { job } = (await (await call(handler, 'POST', '/api/alchemy-agent', { kind: 'lesson', id: 'l1' })).json()).data;
  await call(runner, 'POST', '/api/alchemy-agent/run', { id: job });
  const res = await call(handler, 'POST', '/api/alchemy-agent', { kind: 'lesson', id: 'l1' });
  assert.equal(res.status, 429);
  assert.match((await res.json()).error.message, /1 full reviews today/);
});

test('bad input and signed-out requests are refused', async () => {
  const { handler, call } = setup();
  assert.equal((await call(handler, 'POST', '/api/alchemy-agent', { kind: 'lesson', id: '../x' })).status, 400);
  assert.equal((await call(handler, 'POST', '/api/alchemy-agent', { kind: 'lesson', id: 'l1', request: 'x'.repeat(3000) })).status, 400);
  const signedOut = await handler(new Request('https://api.example/api/alchemy-agent?lesson=l1'));
  assert.equal(signedOut.status, 401);
});
