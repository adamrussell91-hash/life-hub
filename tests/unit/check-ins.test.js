import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInKey, open, seal } from '../../netlify/functions/_shared/check-in-crypto.mjs';
import { deleteCheckIn, getCheckIn, listCheckIns, saveCheckIn } from '../../netlify/functions/_shared/check-in-store.mjs';
import { CheckInTextSchema } from '../../netlify/functions/_shared/check-in-schema.mjs';
import { CHECK_IN_TEXT_MAX_AGE_MS, PRIVATE_CHECK_IN_PATH, loadCheckInText } from '../../netlify/functions/_shared/check-in-text.mjs';
import { createCheckInsHandler } from '../../netlify/functions/check-ins.mjs';
import { createCheckInTextHandler } from '../../netlify/functions/check-in-text.mjs';

// Invented student and filler wording. The real guide text lives in the private data repo.
const env = { CHECK_IN_KEY: 'k'.repeat(40), GITHUB_TOKEN: 'test-token' };
const MEETING = 'meeting_00000000-0000-4000-8000-000000000001';
const OTHER_MEETING = 'meeting_00000000-0000-4000-8000-000000000002';

function storeFixture() {
  const data = new Map();
  return {
    data,
    async get(k) { return data.has(k) ? structuredClone(data.get(k)) : null; },
    async setJSON(k, v) { data.set(k, structuredClone(v)); return { modified: true }; },
    async delete(k) { data.delete(k); }
  };
}

const record = (over = {}) => ({
  id: 'checkin_aaaaaaaa-0001',
  meeting_id: MEETING,
  person_ref: 'shared:person:p_riley',
  person_name: 'Riley Tan',
  safety: 'none',
  sides: [],
  lines: { open: 'Lorem ipsum opening line.' },
  said: 'Lorem ipsum dolor sit amet.',
  help: ['School counsellor'],
  handed_to: 'Wellbeing lead',
  follow_ups: ['Tell wellbeing lead'],
  report: null,
  created_at: '2026-11-02T01:00:00.000Z',
  updated_at: '2026-11-02T01:00:00.000Z',
  ...over
});

const textFile = () => ({
  version: 1,
  steps: ['open', 'safety', 'listen', 'hope', 'help'].map((id) => ({ id, title: id, ask: `Lorem ${id}`, say: ['Lorem'], listen: [] })),
  sides: [{ id: 'side-one', label: 'Lorem side', ask: 'Lorem', steps: ['Lorem'], report: true }],
  safety: { title: 'Lorem', steps: ['Lorem'], contacts: [{ role: 'Lorem lead' }] },
  follow_ups: ['Lorem follow-up']
});

test('sealing is AES-GCM with no plaintext, bound to its key name, and refuses without a key', () => {
  const key = checkInKey(env);
  const sealed = seal({ said: 'Lorem secret' }, key, 'records/a');
  assert.ok(!JSON.stringify(sealed).includes('Lorem secret'));
  assert.deepEqual(open(sealed, key, 'records/a'), { said: 'Lorem secret' });
  assert.throws(() => open(sealed, key, 'records/b'), { status: 500 });
  assert.throws(() => open({ ...sealed, ct: Buffer.from('x').toString('base64') }, key, 'records/a'), { status: 500 });
  assert.throws(() => open(sealed, checkInKey({ CHECK_IN_KEY: 'z'.repeat(40) }), 'records/a'), { status: 500 });
  assert.throws(() => checkInKey({}), { status: 503, code: 'check_in_key_unset' });
  assert.throws(() => checkInKey({ CHECK_IN_KEY: 'short' }), { status: 503 });
});

test('a saved record is sealed at rest; lists return who and when only', async () => {
  const store = storeFixture();
  const summary = await saveCheckIn(store, record(), { env });
  assert.deepEqual(Object.keys(summary).sort(), ['created_at', 'id', 'meeting_id', 'person_name', 'person_ref', 'updated_at']);
  for (const value of store.data.values()) {
    const raw = JSON.stringify(value);
    assert.ok(!raw.includes('Riley'), 'no name in the clear');
    assert.ok(!raw.includes('Lorem'), 'no content in the clear');
  }
  assert.equal((await getCheckIn(store, 'checkin_aaaaaaaa-0001', { env })).said, 'Lorem ipsum dolor sit amet.');
  await saveCheckIn(store, record({ id: 'checkin_aaaaaaaa-0002', meeting_id: OTHER_MEETING, created_at: '2026-11-03T01:00:00.000Z' }), { env });
  assert.deepEqual((await listCheckIns(store, { meeting_id: MEETING }, { env })).map((s) => s.id), ['checkin_aaaaaaaa-0001']);
  assert.deepEqual((await listCheckIns(store, { person_ref: 'shared:person:other', person_name: 'riley tan' }, { env })).map((s) => s.id), ['checkin_aaaaaaaa-0002', 'checkin_aaaaaaaa-0001']);
  await saveCheckIn(store, record({ said: 'Edited' }), { env });
  assert.equal((await listCheckIns(store, { meeting_id: MEETING }, { env })).length, 1);
  await deleteCheckIn(store, 'checkin_aaaaaaaa-0001', { env });
  await assert.rejects(getCheckIn(store, 'checkin_aaaaaaaa-0001', { env }), { status: 404 });
  assert.equal((await listCheckIns(store, { meeting_id: MEETING }, { env })).length, 0);
});

test('records are validated: unknown fields, long text and bad ids are refused', async () => {
  const store = storeFixture();
  await assert.rejects(saveCheckIn(store, { ...record(), extra: 'x' }, { env }), { status: 400 });
  await assert.rejects(saveCheckIn(store, record({ said: 'x'.repeat(2001) }), { env }), { status: 400 });
  await assert.rejects(saveCheckIn(store, record({ id: 'nope' }), { env }), { status: 400 });
  await assert.rejects(saveCheckIn(store, record({ meeting_id: 'meeting_x' }), { env }), { status: 400 });
  await assert.rejects(saveCheckIn(store, record({ lines: { other: 'x' } }), { env }), { status: 400 });
  await assert.rejects(getCheckIn(store, '../index/v1', { env }), { status: 400 });
  await assert.rejects(saveCheckIn(store, record(), { env: {} }), { status: 503 });
  assert.equal(store.data.size, 0);
});

const gateEnv = { ...env, LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };

test('the records endpoint is teacher only and never cached', async () => {
  const store = storeFixture();
  const make = (valid) => createCheckInsHandler({ env: gateEnv, getContentStore: async () => store, verifySessionToken: () => ({ valid }) });
  const post = (body) => new Request('https://example.test/api/check-ins', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  assert.equal((await make(false)(new Request(`https://example.test/api/check-ins?meeting_id=${MEETING}`))).status, 401);
  assert.equal((await make(false)(post({ action: 'save', check_in: record() }))).status, 401);
  assert.equal(store.data.size, 0);
  const saved = await make(true)(post({ action: 'save', check_in: record() }));
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'no-store');
  const listed = (await (await make(true)(new Request(`https://example.test/api/check-ins?meeting_id=${MEETING}`))).json()).data;
  assert.equal(listed.check_ins.length, 1);
  assert.equal(listed.check_ins[0].said, undefined);
  const one = (await (await make(true)(new Request("https://example.test/api/check-ins?id=checkin_aaaaaaaa-0001"))).json()).data;
  assert.equal(one.check_in.handed_to, 'Wellbeing lead');
  assert.equal((await make(true)(new Request('https://example.test/api/check-ins'))).status, 400);
  assert.equal((await make(true)(post({ action: 'delete', id: 'checkin_aaaaaaaa-0001' }))).status, 200);
});

test('the guide text loads from the private file, is checked, cached, and teacher only', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return new Response(JSON.stringify(textFile())); };
  const store = storeFixture();
  const text = await loadCheckInText(store, { env, fetchImpl });
  assert.ok(calls[0].includes(PRIVATE_CHECK_IN_PATH));
  assert.equal(text.steps.length, 5);
  await loadCheckInText(store, { env, fetchImpl });
  assert.equal(calls.length, 1);
  await loadCheckInText(store, { env, fetchImpl, now: Date.now() + CHECK_IN_TEXT_MAX_AGE_MS + 1000 });
  assert.equal(calls.length, 2);
  const bad = textFile();
  bad.steps.reverse();
  assert.equal(CheckInTextSchema.safeParse(bad).success, false);
  await assert.rejects(loadCheckInText(storeFixture(), { env, fetchImpl: async () => new Response(JSON.stringify(bad)) }), { status: 500 });

  const make = (valid) => createCheckInTextHandler({ env: gateEnv, getContentStore: async () => storeFixture(), verifySessionToken: () => ({ valid }), fetchImpl });
  assert.equal((await make(false)(new Request('https://example.test/api/check-in-text'))).status, 401);
  const ok = await make(true)(new Request('https://example.test/api/check-in-text'));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
});
