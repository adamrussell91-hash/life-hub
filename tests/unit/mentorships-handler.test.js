import assert from 'node:assert/strict';
import test from 'node:test';
import { createMentorshipsHandler } from '../../netlify/functions/mentorships.mjs';
import { createMentorshipSheetsHandler } from '../../netlify/functions/mentorship-sheets.mjs';
import { createPublishedSheetHandler } from '../../netlify/functions/published-sheet.mjs';
import { sheetSnapshotKey } from '../../netlify/functions/_shared/meeting-sheet.mjs';
import { mentorshipSheetShareKey } from '../../netlify/functions/_shared/mentorship-schema.mjs';

const PERSON_A = 'shared:person:person_00000000-0000-4000-8000-0000000000a1';
const PERSON_B = 'shared:person:person_00000000-0000-4000-8000-0000000000b2';
const TOKEN = 'c'.repeat(48);
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'x', SESSION_SECRET: 'x'.repeat(32) };
const shared = { id: 'sb1', block_type: 'rich_text', content: { html: '<p>Shared goal for the term.</p>' } };
const priv = { id: 'pb1', block_type: 'rich_text', content: { html: '<p>Private worry.</p>' } };

function fakeStore() {
  const rows = new Map();
  return {
    rows,
    async get(key) { return rows.has(key) ? structuredClone(rows.get(key)) : null; },
    async setJSON(key, value) { rows.set(key, structuredClone(value)); },
    async delete(key) { rows.delete(key); },
    async list({ prefix = '' } = {}) { return { blobs: [...rows.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

function setup() {
  const professional = fakeStore();
  const snapshots = fakeStore();
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 10, 1, 0, 0, tick++)).toISOString();
  const common = { env: ENV, verifySessionToken: () => ({ valid: true }), getContentStore: async () => professional };
  const main = createMentorshipsHandler({ ...common, mentorshipNow: now });
  const sheets = createMentorshipSheetsHandler({
    ...common, getSnapshotStore: async () => snapshots, newToken: () => TOKEN, now
  });
  const reader = createPublishedSheetHandler({ env: {}, getContentStore: async () => snapshots });
  const call = (handler, method, path, body) =>
    handler(new Request(`https://api.example${path}`, {
      method,
      headers: { 'content-type': 'application/json', cookie: 'life_hub_session=ok', origin: 'https://api.example' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }), {});
  const api = async (method, path, body) => {
    const response = await call(main, method, path, body);
    return { status: response.status, body: await response.json() };
  };
  const sheetApi = async (method, path, body) => {
    const response = await call(sheets, method, path, body);
    return { status: response.status, body: await response.json() };
  };
  const read = () => reader(new Request(`https://api.example/api/published/sheets/${TOKEN}`), {});
  return { api, sheetApi, read, professional, snapshots };
}

test('create returns 201, list is a summary without blocks, get returns full', async () => {
  const { api } = setup();
  const created = await api('POST', '/api/mentorships', { person_ref: PERSON_A, kind: 'accreditation', blocks: [priv], shared_blocks: [shared] });
  assert.equal(created.status, 201);
  const m = created.body.data.mentorship;
  assert.equal(m.status, 'active');
  const list = await api('GET', '/api/mentorships');
  assert.equal(list.body.data.mentorships.length, 1);
  assert.equal('blocks' in list.body.data.mentorships[0], false);
  assert.equal('shared_blocks' in list.body.data.mentorships[0], false);
  const one = await api('GET', `/api/mentorships?id=${m.id}`);
  assert.equal(one.body.data.mentorship.blocks.length, 1);
  assert.equal(one.body.data.mentorship.shared_blocks.length, 1);
  assert.equal((await api('GET', '/api/mentorships?id=mentorship_00000000-0000-4000-8000-000000000009')).status, 404);
});

test('list is newest update first', async () => {
  const { api } = setup();
  const a = (await api('POST', '/api/mentorships', { person_ref: PERSON_A, kind: 'coaching' })).body.data.mentorship;
  const b = (await api('POST', '/api/mentorships', { person_ref: PERSON_B, kind: 'other' })).body.data.mentorship;
  assert.deepEqual((await api('GET', '/api/mentorships')).body.data.mentorships.map((x) => x.id), [b.id, a.id]);
  await api('PATCH', `/api/mentorships?id=${a.id}`, { focus: 'Touch' });
  assert.deepEqual((await api('GET', '/api/mentorships')).body.data.mentorships.map((x) => x.id), [a.id, b.id]);
});

test('a second active mentorship for one person is a 409; a completed one allows a new one', async () => {
  const { api } = setup();
  const first = (await api('POST', '/api/mentorships', { person_ref: PERSON_A, kind: 'coaching' })).body.data.mentorship;
  const clash = await api('POST', '/api/mentorships', { person_ref: PERSON_A, kind: 'other' });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.error.code, 'mentorship_exists');
  await api('PATCH', `/api/mentorships?id=${first.id}`, { status: 'completed', completed_on: '2026-11-02', outcome: 'Invented outcome' });
  assert.equal((await api('POST', '/api/mentorships', { person_ref: PERSON_A, kind: 'other' })).status, 201);
});

test('GET by person_ref prefers active, then newest, and returns null when none', async () => {
  const { api } = setup();
  assert.equal((await api('GET', `/api/mentorships?person_ref=${encodeURIComponent(PERSON_A)}`)).body.data.mentorship, null);
  const old = (await api('POST', '/api/mentorships', { person_ref: PERSON_A, kind: 'coaching' })).body.data.mentorship;
  await api('PATCH', `/api/mentorships?id=${old.id}`, { status: 'completed' });
  const active = (await api('POST', '/api/mentorships', { person_ref: PERSON_A, kind: 'other' })).body.data.mentorship;
  await api('PATCH', `/api/mentorships?id=${old.id}`, { focus: 'Most recently touched' });
  const found = await api('GET', `/api/mentorships?person_ref=${encodeURIComponent(PERSON_A)}`);
  assert.equal(found.body.data.mentorship.id, active.id);
  assert.equal(found.body.data.mentorship.blocks.length, 0);
});

test('PATCH completes and reopens; reopening clears nothing unless asked', async () => {
  const { api } = setup();
  const m = (await api('POST', '/api/mentorships', { person_ref: PERSON_A, kind: 'accreditation' })).body.data.mentorship;
  const done = await api('PATCH', `/api/mentorships?id=${m.id}`, { status: 'completed', completed_on: '2026-11-02', outcome: 'Proficient achieved' });
  assert.equal(done.body.data.mentorship.status, 'completed');
  const reopened = await api('PATCH', `/api/mentorships?id=${m.id}`, { status: 'active' });
  assert.equal(reopened.body.data.mentorship.completed_on, '2026-11-02');
  const cleared = await api('PATCH', `/api/mentorships?id=${m.id}`, { completed_on: null, outcome: null });
  assert.equal(cleared.body.data.mentorship.completed_on, null);
  assert.equal(cleared.body.data.mentorship.outcome, null);
  assert.equal((await api('PATCH', `/api/mentorships?id=${m.id}`, { person_ref: PERSON_B })).status, 400);
  assert.equal((await api('PATCH', '/api/mentorships', { focus: 'x' })).status, 400);
  assert.equal((await api('PUT', '/api/mentorships')).status, 405);
});

test('sheet: publish keeps one token, serves only shared blocks, carries no ids, stop removes it', async () => {
  const { api, sheetApi, read, professional, snapshots } = setup();
  const m = (await api('POST', '/api/mentorships', { person_ref: PERSON_A, kind: 'accreditation', blocks: [priv], shared_blocks: [shared] })).body.data.mentorship;
  const path = (action) => `/api/mentorship-sheets?mentorship_id=${m.id}${action ? `&action=${action}` : ''}`;
  assert.equal((await sheetApi('GET', path())).body.data.share, null);
  assert.equal((await read()).status, 404);

  const first = await sheetApi('POST', path('publish'), { message: 'Hello', from: 'Your mentor' });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.share.token, TOKEN);
  assert.ok(first.body.data.left_off);
  const served = await (await read()).json();
  assert.equal(served.data.title, 'Shared with you');
  assert.equal(served.data.meeting_date, null);
  const text = JSON.stringify(served);
  assert.ok(text.includes('Shared goal for the term.'));
  assert.ok(!text.includes('Private worry'));
  assert.ok(!text.includes(m.id));
  assert.ok(!text.includes(PERSON_A));
  assert.ok(!text.includes('person_00000000'));

  await api('PATCH', `/api/mentorships?id=${m.id}`, { shared_blocks: [] });
  const again = await sheetApi('POST', path('publish'), { title: 'Second' });
  assert.equal(again.body.data.share.token, TOKEN);
  assert.equal(again.body.data.share.created_at, first.body.data.share.created_at);
  assert.equal((await (await read()).json()).data.title, 'Second');
  assert.equal(snapshots.rows.size, 1);
  assert.ok(snapshots.rows.has(sheetSnapshotKey(TOKEN)));
  assert.ok(professional.rows.has(mentorshipSheetShareKey(m.id)));
  assert.equal((await sheetApi('GET', path())).body.data.share.token, TOKEN);

  const stopped = await sheetApi('POST', path('stop'));
  assert.equal(stopped.body.data.share, null);
  assert.equal((await read()).status, 404);
  assert.equal(snapshots.rows.size, 0);
  assert.equal(professional.rows.has(mentorshipSheetShareKey(m.id)), false);
});

test('sheet: bad ids and actions are 400, unknown mentorship is 404, publish takes an empty body', async () => {
  const { api, sheetApi } = setup();
  assert.equal((await sheetApi('GET', '/api/mentorship-sheets?mentorship_id=nope')).status, 400);
  assert.equal((await sheetApi('POST', '/api/mentorship-sheets?mentorship_id=mentorship_00000000-0000-4000-8000-000000000009&action=publish')).status, 404);
  const m = (await api('POST', '/api/mentorships', { person_ref: PERSON_A, kind: 'other' })).body.data.mentorship;
  assert.equal((await sheetApi('POST', `/api/mentorship-sheets?mentorship_id=${m.id}&action=preview`)).status, 400);
  assert.equal((await sheetApi('POST', `/api/mentorship-sheets?mentorship_id=${m.id}&action=publish`)).status, 200);
});
