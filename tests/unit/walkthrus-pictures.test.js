import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPictures, privatePicturePath, safeSvg } from '../../netlify/functions/_shared/walkthrus-pictures.mjs';
import { createWalkthrusPicturesHandler } from '../../netlify/functions/walkthrus-pictures.mjs';
import { WalkthruStepSchema } from '../../netlify/functions/_shared/walkthrus-text-schema.mjs';
import { filterBlocksForStudent } from '../../netlify/functions/_shared/teaching-student.mjs';

// Filler drawings only. The real pictures live in the private data repo.
const svg = (n) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><circle cx="${n}" cy="9" r="4"/></svg>`;

function storeFixture() {
  const data = new Map();
  return { data, async get(k) { return data.has(k) ? structuredClone(data.get(k)) : null; }, async setJSON(k, v) { data.set(k, structuredClone(v)); return { modified: true }; } };
}
const env = { GITHUB_TOKEN: 'test-token' };
function fakeFetch(missing = new Set()) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const n = Number(/step-(\d)\.svg/.exec(url)[1]);
    return missing.has(n) ? new Response('nope', { status: 404 }) : new Response(svg(n));
  };
  return { calls, impl };
}

test('line art passes; anything that could run or load something is refused', () => {
  assert.equal(safeSvg(svg(1)), svg(1));
  assert.equal(safeSvg('<svg><script>alert(1)</script></svg>'), null);
  assert.equal(safeSvg('<svg onload="x()"></svg>'), null);
  assert.equal(safeSvg('<svg><image href="https://x.test/a.png"/></svg>'), null);
  assert.equal(safeSvg('<svg><foreignObject></foreignObject></svg>'), null);
  assert.equal(safeSvg('<div></div>'), null);
});

test('first load copies five pictures, later loads use the copy, a missing step is null', async () => {
  const store = storeFixture();
  const { calls, impl } = fakeFetch(new Set([4]));
  const pictures = await loadPictures(store, 'w1-cold-calling', { env, fetchImpl: impl });
  assert.equal(pictures.steps.length, 5);
  assert.equal(pictures.steps[3], null);
  assert.ok(calls[0].includes(privatePicturePath('w1-cold-calling', 1)));
  const before = calls.length;
  await loadPictures(store, 'w1-cold-calling', { env, fetchImpl: impl });
  assert.equal(calls.length, before);
  await assert.rejects(loadPictures(store, '../../secrets', { env, fetchImpl: impl }), { status: 400 });
  await loadPictures(store, 'w1-cold-calling', { env, fetchImpl: impl, now: Date.now() + 7 * 60 * 60 * 1000 });
  assert.ok(calls.length > before, 'a stale copy is fetched again');
});

test('the pictures endpoint is teacher only and never cached', async () => {
  const store = storeFixture();
  const gateEnv = { ...env, LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
  const make = (valid) => createWalkthrusPicturesHandler({ env: gateEnv, getContentStore: async () => store, verifySessionToken: () => ({ valid }), fetchImpl: fakeFetch().impl });
  const url = 'https://example.test/api/walkthrus-pictures?id=w1-cold-calling';
  assert.equal((await make(false)(new Request(url))).status, 401);
  const ok = await make(true)(new Request(url));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal((await ok.json()).data.pictures.steps.length, 5);
});

test('a step can carry a lesson cue with a timer or names tool', () => {
  const step = WalkthruStepSchema.parse({ n: 2, label: 'L', text: 'T', cue: { time: '15 seconds', do: ['Wait.'], say: ['“{name}?”'], tool: { kind: 'timer', seconds: 15 } } });
  assert.deepEqual(step.cue.tool, { kind: 'timer', seconds: 15 });
  assert.equal(WalkthruStepSchema.safeParse({ n: 2, label: 'L', text: 'T', cue: { tool: { kind: 'kazoo' } } }).success, false);
  assert.equal(WalkthruStepSchema.parse({ n: 1, label: 'L', text: 'T' }).cue, undefined);
});

test('the student feed drops a block’s chosen WalkThru', () => {
  const block = { id: 'r1', type: 'block', block_type: 'rich_text', variant: 'medium', visibility: 'student_teacher', content: { html: '<p>Hi</p>' }, settings: { size: 2, walkthru: 'w1-cold-calling' } };
  const out = JSON.stringify(filterBlocksForStudent([block]));
  assert.ok(!out.includes('walkthru'));
  assert.ok(out.includes('"size":2'));
});
