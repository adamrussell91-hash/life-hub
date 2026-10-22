import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAlignment, patchAlignment, privateAlignmentPath } from '../../netlify/functions/_shared/syllabus-alignment.mjs';
import { createSyllabusAlignmentHandler } from '../../netlify/functions/syllabus-alignment.mjs';

// Invented wording only. The real syllabus text lives in the private data repo.
const sample = {
  schema: 'syllabus_alignment_v1',
  title: 'Sample subject',
  match: { syllabus: 'Sample', version: '2024', year: 12 },
  sources: [],
  outcomes: [{ n: 1, code: 'SAM-12-01', text: 'reads closely' }, { n: 2, code: 'SAM-12-02', text: 'writes boldly' }],
  processes: [{ code: 'UN', name: 'Understanding', text: 'knows things' }, { code: 'RE', name: 'Reflecting', text: 'looks back' }],
  concepts: [{ key: 'ARG', name: 'Argument', head: 'argues well', bullets: [{ n: 1, text: 'claims need reasons', adv: false }, { n: 2, text: 'counter-claims help', adv: true }] }],
  focus_areas: [{ id: 'sample-area', name: 'Sample area', points: [
    { id: 'U1', kind: 'U', short: 'Close reading', text: 'Close reading of a text', outcomes: [{ n: 1, link: 'shared' }], concepts: [{ ref: 'ARG1', link: 'related' }], processes: ['UN'] }
  ] }]
};

function storeFixture() {
  const data = new Map();
  const etags = new Map();
  let n = 0;
  return {
    data,
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: etags.get(key) } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      if (options?.onlyIfMatch && etags.get(key) !== options.onlyIfMatch) return { modified: false };
      data.set(key, structuredClone(value)); etags.set(key, `e${++n}`); return { modified: true };
    }
  };
}

const env = { GITHUB_TOKEN: 'test-token' };
function fakeFetch(body = sample, status = 200) {
  const calls = [];
  const impl = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify(body), { status }); };
  return { calls, impl };
}

test('first load copies the private file, later loads use the saved copy', async () => {
  const store = storeFixture();
  const { calls, impl } = fakeFetch();
  const first = await loadAlignment(store, 'sample', { env, fetchImpl: impl });
  assert.equal(first.focus_areas[0].points[0].id, 'U1');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, new RegExp(privateAlignmentPath('sample').replaceAll('/', '\\/')));
  assert.equal(calls[0].init.headers.authorization, 'Bearer test-token');
  await loadAlignment(store, 'sample', { env, fetchImpl: impl });
  assert.equal(calls.length, 1);
});

test('without a token the private file is reported unreachable, not invented', async () => {
  await assert.rejects(loadAlignment(storeFixture(), 'sample', { env: {}, fetchImpl: fakeFetch().impl }), { status: 503, code: 'private_data_unbound' });
});

test('a malformed private file is refused', async () => {
  await assert.rejects(loadAlignment(storeFixture(), 'sample', { env, fetchImpl: fakeFetch({ schema: 'nope' }).impl }), { status: 500 });
});

test('patching a point replaces its links and marks it edited', async () => {
  const store = storeFixture();
  await loadAlignment(store, 'sample', { env, fetchImpl: fakeFetch().impl });
  const next = await patchAlignment(store, {
    focus_area: 'sample-area', point: 'U1',
    outcomes: [{ n: 2, link: 'related' }, { n: 1, link: 'shared' }, { n: 2, link: 'shared' }],
    concepts: [{ ref: 'ARG2', link: 'shared' }],
    processes: ['RE', 'RE']
  }, 'sample');
  const point = next.focus_areas[0].points[0];
  assert.deepEqual(point.outcomes, [{ n: 1, link: 'shared' }, { n: 2, link: 'shared' }]);
  assert.deepEqual(point.concepts, [{ ref: 'ARG2', link: 'shared' }]);
  assert.deepEqual(point.processes, ['RE']);
  assert.equal(point.edited, true);
  assert.equal(point.text, 'Close reading of a text');
});

test('links outside the syllabus are refused', async () => {
  const store = storeFixture();
  await loadAlignment(store, 'sample', { env, fetchImpl: fakeFetch().impl });
  const base = { focus_area: 'sample-area', point: 'U1', outcomes: [], concepts: [], processes: [] };
  await assert.rejects(patchAlignment(store, { ...base, outcomes: [{ n: 9, link: 'shared' }] }, 'sample'), { status: 400 });
  await assert.rejects(patchAlignment(store, { ...base, concepts: [{ ref: 'ARG7', link: 'shared' }] }, 'sample'), { status: 400 });
  await assert.rejects(patchAlignment(store, { ...base, point: 'R4' }, 'sample'), { status: 400 });
});

test('the endpoint is teacher only', async () => {
  const store = storeFixture();
  const gateEnv = { ...env, LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
  const request = () => new Request('https://example.test/api/syllabus-alignment', { method: 'GET' });
  const signedOut = createSyllabusAlignmentHandler({ env: gateEnv, getContentStore: async () => store, verifySessionToken: () => ({ valid: false }) });
  assert.equal((await signedOut(request())).status, 401);
  const signedIn = createSyllabusAlignmentHandler({ env: gateEnv, getContentStore: async () => store, verifySessionToken: () => ({ valid: true }), fetchImpl: fakeFetch({ ...sample, title: 'From private' }).impl });
  const ok = await signedIn(request());
  assert.equal(ok.status, 200);
  assert.ok((await ok.json()).data.alignment.focus_areas.length >= 1);
});
