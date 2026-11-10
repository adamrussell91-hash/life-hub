// Chunk 3: protocols inside Tasks. Origin round-trip, landing on completion, usage logging,
// and the median cost figures. Invented situations only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMemoryCognitiveStore } from '../../netlify/functions/_shared/cognitive-store.mjs';
import { createCognitiveService, addUsage } from '../../netlify/functions/_shared/cognitive-service.mjs';
import { buildPrompt, cleanOrigin } from '../../netlify/functions/_shared/cognitive-controller.mjs';
import { createKnowledgeProtocolsHandler, defaultModel } from '../../netlify/functions/knowledge-protocols.mjs';
import { audFor } from '../../packages/thinking-map/pricing.mjs';
import { loadProtocolCosts, medianCosts, protocolCost, sessionAud, setProtocolCosts } from '../../packages/protocol-view/cost.mjs';

const USAGE = { model: 'claude-sonnet-5', input: 1000, output: 200 };
const okModel = async (p) => ({ text: 'A fresh angle.', question: p.gate ? 'Does this hold?' : null, evidenceIds: [], usage: USAGE });
const retrieve = async () => ({ evidence: [], status: 'none' });
const intake = { problem: 'Choosing between two community garden plots', entrenchment: 'Each plot has a loud fan club', framing: 'One plot has to lose' };
const origin = { threadId: 'thread-1', sessionId: 'home-1', stepId: 'step-a' };

function setup(extra = {}) {
  const store = createMemoryCognitiveStore();
  const landed = [];
  const marked = [];
  const service = createCognitiveService({
    store, model: okModel, retrieve,
    landDetour: async (env, session, deps) => { landed.push({ id: session.id, tool: deps.tool, threadId: session.origin.threadId }); },
    markDetour: async (env, session, state) => { marked.push({ id: session.id, state }); },
    ...extra
  });
  return { store, service, landed, marked };
}
const create = (service, extra = {}) => service.create('owner', { protocolId: 'tribunal', mode: 'quick', intake, requestId: randomUUID(), ...extra });

test('origin round-trips through create, get and the Past runs list', async () => {
  const { service } = setup();
  const created = await create(service, { origin, userContext: 'Earlier: ruled out the cheaper plot.' });
  assert.deepEqual(created.origin, origin);
  assert.deepEqual((await service.get('owner', created.id)).origin, origin);
  const [row] = await service.list('owner');
  assert.deepEqual(row.origin, origin);
  assert.equal('userContext' in created, false, 'the thread digest is not sent back to the browser');
});

test('a run without a usable origin has none', async () => {
  const { service } = setup();
  assert.equal((await create(service)).origin, undefined);
  assert.equal((await create(service, { origin: { sessionId: 'x' } })).origin, undefined);
  assert.equal(cleanOrigin({ threadId: 't', extra: 'dropped' }).extra, undefined);
});

test('the thread digest reaches the voices as threadSoFar, except in isolated Tribunal voices', async () => {
  const { store, service } = setup();
  const created = await create(service, { origin, userContext: 'Earlier: ruled out the cheaper plot.' });
  const session = (await store.read('owner', created.id)).value;
  const fates = { ...session, protocolId: 'fates', mode: 'sprint', steps: [{ speaker: 'lachesis', stage: 'briefing' }], cursor: 0 };
  const prompt = buildPrompt(fates, { speaker: 'lachesis', stage: 'briefing' });
  assert.equal(JSON.parse(prompt.user).threadSoFar, 'Earlier: ruled out the cheaper plot.');
  const isolated = buildPrompt(session, { speaker: 'inverter', stage: 'inverter' });
  assert.equal('threadSoFar' in JSON.parse(isolated.user), false);
});

test('completing a run with an origin lands its packet on the thread, once', async () => {
  const { service, landed } = setup();
  const created = await create(service, { origin });
  const done = await service.run('owner', created.id);
  assert.equal(done.status, 'completed');
  assert.deepEqual(landed, [{ id: created.id, tool: 'knowledge-protocols', threadId: 'thread-1' }]);
  await service.get('owner', created.id);
  assert.equal(landed.length, 1);
});

test('a completed run with no origin lands nothing', async () => {
  const { service, landed } = setup();
  const created = await create(service);
  assert.equal((await service.run('owner', created.id)).status, 'completed');
  assert.deepEqual(landed, []);
});

test('a failed run marks its thread session failed; ending or deleting one marks it removed', async () => {
  const failing = setup({ model: async () => { throw new Error('provider down'); } });
  const first = await create(failing.service, { origin });
  assert.equal((await failing.service.run('owner', first.id)).status, 'failed');
  assert.deepEqual(failing.marked, [{ id: first.id, state: 'failed' }]);

  const { service, marked } = setup();
  const second = await create(service, { origin });
  await service.action('owner', { sessionId: second.id, revision: second.revision, requestId: randomUUID(), action: 'cancel' });
  assert.deepEqual(marked, [{ id: second.id, state: 'removed' }]);
  const third = await create(service, { origin });
  await service.deleteRuns('owner', [third.id]);
  assert.deepEqual(marked.at(-1), { id: third.id, state: 'removed' });
});

test('every model call of a run is summed onto the session as usage', async () => {
  const { store, service } = setup();
  const created = await create(service);
  await service.run('owner', created.id);
  const { usage } = (await store.read('owner', created.id)).value;
  assert.ok(usage.calls >= 4, 'three voices, the compile and the summary');
  assert.equal(usage.byModel['claude-sonnet-5'].input, usage.calls * 1000);
  assert.equal(usage.byModel['claude-sonnet-5'].output, usage.calls * 200);
  assert.deepEqual(addUsage({ calls: 0, byModel: {} }, null), { calls: 0, byModel: {} });
});

test('defaultModel reports the streamed token usage', async () => {
  const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const body = sse('message_start', { message: { usage: { input_tokens: 120 } } })
    + sse('content_block_start', { index: 0, content_block: { type: 'text' } })
    + sse('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '{}' } })
    + sse('content_block_stop', { index: 0 })
    + sse('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 33 } })
    + sse('message_stop', {});
  const result = await defaultModel({ system: 's', user: 'u', wordBudget: 50 }, { ANTHROPIC_API_KEY: 'test' }, async () => new Response(body, { status: 200 }));
  assert.equal(result.usage.input, 120);
  assert.equal(result.usage.output, 33);
  assert.equal(typeof result.usage.model, 'string');
});

const run = (protocolId, mode, input, output, extra = {}) => ({ status: 'completed', protocolId, mode, usage: { calls: 1, byModel: { 'claude-sonnet-5': { input, output } } }, ...extra });

test('protocolCost is the median of three or more logged runs, else null', () => {
  const rows = [run('fates', 'sprint', 10000, 2000), run('fates', 'sprint', 20000, 4000), run('fates', 'sprint', 60000, 9000), run('fates', 'sprint', 1, 1, { status: 'failed' }), run('mirror', 'standard', 5000, 500), run('mirror', 'standard', 5000, 500)];
  const costs = medianCosts(rows);
  setProtocolCosts(costs);
  const middle = audFor('claude-sonnet-5', { input: 20000, output: 4000 });
  assert.equal(protocolCost('fates', 'sprint').runs, 3);
  assert.ok(Math.abs(protocolCost('fates', 'sprint').aud - middle) < 1e-9);
  assert.equal(protocolCost('mirror', 'standard'), null, 'two runs is too few');
  assert.equal(protocolCost('fates', 'extended'), null);
  const even = medianCosts([...rows.slice(0, 3), run('fates', 'sprint', 40000, 6000)]);
  assert.equal(even['fates:sprint'].runs, 4);
  assert.equal(sessionAud({ byModel: { 'model-with-no-price': { input: 1, output: 1 } } }), null);
  assert.equal(sessionAud(null), null);
  setProtocolCosts({});
  assert.equal(protocolCost('fates', 'sprint'), null);
});

test('the costs endpoint serves medians and loadProtocolCosts caches them for protocolCost', async () => {
  const { store } = setup();
  const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32), COGNITIVE_OWNER_ID: 'operator' };
  for (const input of [10000, 20000, 30000]) {
    const id = randomUUID();
    await store.write('operator', id, { id, ...run('witness', 'trace', input, 1000), updatedAt: new Date().toISOString() }, null);
  }
  const handler = createKnowledgeProtocolsHandler({ env, verifySessionToken: () => ({ valid: true }), getStore: async () => store });
  const call = (url) => handler(new Request(url, { headers: { origin: 'https://life-hub.adam-russell.com' } }), { env });
  const served = await (await call('https://example.test/api/knowledge/protocols?costs=1')).json();
  assert.equal(served.data.costs['witness:trace'].runs, 3);
  setProtocolCosts({});
  await loadProtocolCosts({ apiBase: 'https://example.test/api/knowledge', fetchImpl: async (url) => { assert.match(url, /\?costs=1$/); return new Response(JSON.stringify(served), { status: 200 }); } });
  assert.equal(protocolCost('witness', 'trace').runs, 3);
  setProtocolCosts({});
});
