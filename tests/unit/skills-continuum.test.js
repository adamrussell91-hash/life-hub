import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSkills, privateSkillsPath, refreshSkills } from '../../netlify/functions/_shared/skills-continuum.mjs';
import { createSkillsContinuumHandler } from '../../netlify/functions/skills-continuum.mjs';

// Invented content only. The real continuum lives in the private data repo.
const rung = (i) => ({ i_can: `Can do ${i}`, build: { formula: ['Part'], parts: [{ id: 'p', name: 'Part', job: 'Does a job', language: ['words'] }], example: [['Example', 'p']], why_here: 'Because', checks: ['Check'], next_move: 'Next' } });
const strand = (id) => ({
  schema: 'skills_strand_v1', strand: id, name: id, summary: 'Sample',
  rungs: ['capable', 'skilled', 'accomplished', 'excellent'].map((r) => ({ id: r, name: r, marks: '0', marker_words: 'x', meaning: 'y' })),
  sub_strands: [{ id: 'sample', name: 'Sample', in_hsc: 'Here', draws_on: 'There', outcomes: [1], focus_areas: ['area'], rungs: { capable: rung(1), skilled: rung(2), accomplished: rung(3), excellent: rung(4) } }]
});

function storeFixture() {
  const data = new Map();
  return { data, async get(k) { return data.has(k) ? structuredClone(data.get(k)) : null; }, async setJSON(k, v) { data.set(k, structuredClone(v)); return { modified: true }; } };
}
const env = { GITHUB_TOKEN: 'test-token' };
function fakeFetch(fn = (id) => strand(id)) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const id = /skills\/([a-z]+)\.json/.exec(url)[1];
    const body = fn(id);
    return body ? new Response(JSON.stringify(body)) : new Response('nope', { status: 404 });
  };
  return { calls, impl };
}

test('first load copies every strand from the private repo, later loads use the copy', async () => {
  const store = storeFixture();
  const { calls, impl } = fakeFetch();
  const c = await loadSkills(store, { env, fetchImpl: impl });
  assert.equal(c.strands.length, 7);
  assert.equal(calls.length, 7);
  assert.ok(calls[0].includes(privateSkillsPath('reading')));
  await loadSkills(store, { env, fetchImpl: impl });
  assert.equal(calls.length, 7);
  await refreshSkills(store, { env, fetchImpl: impl });
  assert.equal(calls.length, 14);
});

test('a malformed or missing strand file is reported, not invented', async () => {
  await assert.rejects(loadSkills(storeFixture(), { env, fetchImpl: fakeFetch((id) => (id === 'valuing' ? { schema: 'nope' } : strand(id))).impl }), { status: 500 });
  await assert.rejects(loadSkills(storeFixture(), { env, fetchImpl: fakeFetch((id) => (id === 'language' ? null : strand(id))).impl }), { status: 404 });
  await assert.rejects(loadSkills(storeFixture(), { env: {}, fetchImpl: fakeFetch().impl }), { status: 503 });
});

test('the endpoint is teacher only and refreshes on request', async () => {
  const store = storeFixture();
  const gateEnv = { ...env, LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
  const make = (valid) => createSkillsContinuumHandler({ env: gateEnv, getContentStore: async () => store, verifySessionToken: () => ({ valid }), fetchImpl: fakeFetch().impl });
  assert.equal((await make(false)(new Request('https://example.test/api/skills-continuum'))).status, 401);
  const ok = await make(true)(new Request('https://example.test/api/skills-continuum'));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).data.continuum.strands.length, 7);
  const refresh = await make(true)(new Request('https://example.test/api/skills-continuum', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }) }));
  assert.equal(refresh.status, 200);
  const bad = await make(true)(new Request('https://example.test/api/skills-continuum', { method: 'POST', body: JSON.stringify({ action: 'nope' }) }));
  assert.equal(bad.status, 400);
});

test('indicators survive the copy, and older copies without them load with none', async () => {
  const store = storeFixture();
  const withIndicators = (id) => {
    const s = strand(id);
    s.sub_strands[0].rungs.capable.indicators = [{ group: 'Claim', text: 'names the writer', eg: '“The poet shows…”' }];
    return s;
  };
  const c = await loadSkills(store, { env, fetchImpl: fakeFetch(withIndicators).impl });
  assert.deepEqual(c.strands[0].sub_strands[0].rungs.capable.indicators, [{ group: 'Claim', text: 'names the writer', eg: '“The poet shows…”' }]);
  assert.deepEqual(c.strands[0].sub_strands[0].rungs.skilled.indicators, []);
});
