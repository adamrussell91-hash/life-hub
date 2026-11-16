import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRoster } from '../../netlify/functions/_shared/class-claims.mjs';
import { createPublishedProgressShareHandler } from '../../netlify/functions/published-progress-share.mjs';
import { isPublicStudentApi } from '../../netlify/functions/_shared/public-student-routes.mjs';
import { openShare, signIn, signOut, deviceIn, teacherShareAction, SHARE_TRIES_PER_DAY, SHARE_MAX_DEVICES } from '../../netlify/functions/_shared/progress-share.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

const DEVICE = 'a'.repeat(48);
const NOW = new Date('2026-11-15T01:00:00Z');
const device = (n) => n.toString(16).padStart(48, '0');

async function setup() {
  const store = storeFixture([['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', students: [{ name: 'Ana Ames' }, { name: 'Ben Bolt' }] }]]);
  const roster = await loadRoster(store, 'class1');
  const [ana] = roster.students;
  const made = await teacherShareAction(store, 'class1', { action: 'add', student_id: ana.id, initials: 'p.t' }, { now: NOW });
  const share = made.shares.find((s) => s.token === made.made);
  return { store, ana, token: share.token, pin: share.pin };
}

test('add makes a 24-character token and a 6-digit PIN; only the hash is checked', async () => {
  const { store, token, pin } = await setup();
  assert.match(token, /^[A-Za-z0-9_-]{24}$/);
  assert.match(pin, /^\d{6}$/);
  const held = store.data.get(`progress_share/${token}`);
  assert.equal(held.initials, 'PT');
  assert.match(held.pin_hash, /^[a-f0-9]{64}$/);
});

test('initials and PIN sign in once; the PIN is then spent', async () => {
  const { store, token, pin } = await setup();
  await signIn(store, token, { device_token: DEVICE, initials: 'pt', pin }, { now: NOW });
  const held = store.data.get(`progress_share/${token}`);
  assert.equal(held.pin_hash, undefined);
  assert.equal(held.pin_plain, undefined);
  assert.ok(deviceIn(held, DEVICE));
  await assert.rejects(signIn(store, token, { device_token: device(2), initials: 'PT', pin }, { now: NOW }), { code: 'pin_used' });
});

test('a browser already in goes straight through', async () => {
  const { store, token, pin } = await setup();
  await signIn(store, token, { device_token: DEVICE, initials: 'PT', pin }, { now: NOW });
  const again = await signIn(store, token, { device_token: DEVICE }, { now: NOW });
  assert.equal(again.share.initials, 'PT');
});

test('wrong initials and wrong PIN get the same reply and share one cap', async () => {
  const { store, token, pin } = await setup();
  const wrongPin = pin === '000000' ? '111111' : '000000';
  const a = await signIn(store, token, { device_token: DEVICE, initials: 'XX', pin }, { now: NOW }).catch((e) => e);
  const b = await signIn(store, token, { device_token: DEVICE, initials: 'PT', pin: wrongPin }, { now: NOW }).catch((e) => e);
  assert.equal(a.code, 'wrong');
  assert.equal(a.message, b.message);
  for (let i = 2; i < SHARE_TRIES_PER_DAY; i += 1) await signIn(store, token, { device_token: DEVICE, initials: 'XX', pin }, { now: NOW }).catch(() => {});
  await assert.rejects(signIn(store, token, { device_token: DEVICE, initials: 'PT', pin }, { now: NOW }), { code: 'too_many_tries' });
});

test('new PIN replaces an unused one and keeps browsers already in', async () => {
  const { store, token, pin, ana } = await setup();
  await signIn(store, token, { device_token: DEVICE, initials: 'PT', pin }, { now: NOW });
  const reply = await teacherShareAction(store, 'class1', { action: 'new_pin', token }, { now: NOW });
  const fresh = reply.shares.find((s) => s.token === token).pin;
  assert.match(fresh, /^\d{6}$/);
  assert.ok(deviceIn(store.data.get(`progress_share/${token}`), DEVICE));
  await signIn(store, token, { device_token: device(2), initials: 'PT', pin: fresh }, { now: NOW });
  assert.equal(store.data.get(`progress_share/${token}`).devices.length, 2);
  assert.equal(reply.shares[0].student_id, ana.id);
});

test('remove makes the link 404 for a browser already in', async () => {
  const { store, token, pin } = await setup();
  await signIn(store, token, { device_token: DEVICE, initials: 'PT', pin }, { now: NOW });
  const reply = await teacherShareAction(store, 'class1', { action: 'remove', token });
  assert.deepEqual(reply.shares, []);
  await assert.rejects(openShare(store, token), { code: 'not_found' });
});

test('unknown and malformed tokens 404 alike', async () => {
  const { store } = await setup();
  await assert.rejects(openShare(store, 'A'.repeat(24)), { code: 'not_found', message: 'This link doesn’t work any more.' });
  await assert.rejects(openShare(store, '../x'), { code: 'not_found', message: 'This link doesn’t work any more.' });
});

test('a seventh browser drops the oldest', async () => {
  const { store, token } = await setup();
  for (let i = 1; i <= SHARE_MAX_DEVICES + 1; i += 1) {
    const reply = await teacherShareAction(store, 'class1', { action: 'new_pin', token }, { now: NOW });
    await signIn(store, token, { device_token: device(i), initials: 'PT', pin: reply.shares.find((s) => s.token === token).pin }, { now: NOW });
  }
  const held = store.data.get(`progress_share/${token}`);
  assert.equal(held.devices.length, SHARE_MAX_DEVICES);
  assert.equal(deviceIn(held, device(1)), false);
});

test('sign out forgets only this browser', async () => {
  const { store, token, pin } = await setup();
  await signIn(store, token, { device_token: DEVICE, initials: 'PT', pin }, { now: NOW });
  await signOut(store, token, DEVICE);
  assert.equal(deviceIn(store.data.get(`progress_share/${token}`), DEVICE), false);
});

test('a share for a student no longer on the list 404s', async () => {
  const { store, token } = await setup();
  const cls = store.data.get('classes/class1');
  store.data.set('classes/class1', { ...cls, students: [{ name: 'Ben Bolt' }] });
  await assert.rejects(openShare(store, token), { code: 'not_found' });
});

test('teacher add refuses bad initials and unknown students; another class can’t touch the link', async () => {
  const { store, ana, token } = await setup();
  await assert.rejects(teacherShareAction(store, 'class1', { action: 'add', student_id: ana.id, initials: '' }), { code: 'bad_request' });
  await assert.rejects(teacherShareAction(store, 'class1', { action: 'add', student_id: 'st_nobody', initials: 'PT' }), { code: 'bad_request' });
  store.data.set('classes/class2', { id: 'class2', type: 'class', status: 'active', title: '10 English', students: [] });
  await assert.rejects(teacherShareAction(store, 'class2', { action: 'remove', token }), { code: 'not_found' });
});

test('the public route is open only for a 24-character token', () => {
  assert.equal(isPublicStudentApi('POST', `/api/published/share/${'A'.repeat(24)}`), true);
  assert.equal(isPublicStudentApi('POST', '/api/published/share/short'), false);
  assert.equal(isPublicStudentApi('GET', `/api/published/share/${'A'.repeat(24)}`), false);
});

test('the public handler signs in and serves the page', async () => {
  const { store, token, pin } = await setup();
  const cls = store.data.get('classes/class1');
  store.data.set('classes/class1', { ...cls, current_unit_id: 'unit1' });
  store.data.set('units/unit1', { id: 'unit1', title: 'Poetry', lesson_ids: [] });
  store.data.set('markbook/class1', { columns: [], marks: {}, hidden_quizzes: [], focus: {}, took: {}, groups: [], history: [] });
  const origin = 'http://127.0.0.1:5190';
  const handler = createPublishedProgressShareHandler({ getContentStore: async () => store, env: { SITE_ORIGIN: origin }, now: () => NOW });
  const call = (body) => handler(new Request(`${origin}/api/published/share/${token}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const first = await (await call({ action: 'page', device_token: DEVICE })).json();
  assert.equal(first.data.need, 'sign_in');
  const signedIn = await call({ action: 'sign_in', device_token: DEVICE, initials: 'PT', pin });
  assert.equal(signedIn.status, 200);
  assert.equal((await signedIn.json()).data.viewer_initials, 'PT');
  const wrong = await call({ action: 'sign_in', device_token: 'd'.repeat(48), initials: 'PT', pin });
  assert.equal(wrong.status, 403);
});

test('a new link shows at once even when the blob listing lags', async () => {
  const store = storeFixture([['classes/class1', { id: 'class1', type: 'class', status: 'active', title: '9 English', students: [{ name: 'Ana Ames' }] }]]);
  store.list = async () => ({ blobs: [] }); // listing hasn't caught up
  const [ana] = (await loadRoster(store, 'class1')).students;
  const reply = await teacherShareAction(store, 'class1', { action: 'add', student_id: ana.id, initials: 'PT' }, { now: NOW });
  assert.equal(reply.shares.length, 1);
  assert.equal(reply.shares[0].token, reply.made);
  assert.match(reply.shares[0].pin, /^\d{6}$/);
});

test('the link log keeps made and removed times after the link is gone', async () => {
  const { store, token } = await setup();
  const later = new Date('2026-11-16T03:30:00Z');
  const reply = await teacherShareAction(store, 'class1', { action: 'remove', token }, { now: later });
  assert.equal(reply.shares.length, 0);
  assert.equal(store.data.get(`progress_share/${token}`), undefined);
  assert.deepEqual(reply.log.map((l) => [l.initials, l.made_at, l.removed_at]), [['PT', NOW.toISOString(), later.toISOString()]]);
  await assert.rejects(openShare(store, token), { code: 'not_found' });
});

test('links made before the log existed still list, and are logged when removed', async () => {
  const { store, token } = await setup();
  store.data.delete('progress_share_log/class1');
  const listed = await teacherShareAction(store, 'class1', { action: 'list' }, { now: NOW });
  assert.equal(listed.shares.length, 1);
  assert.equal(listed.log[0].removed_at, null);
  const reply = await teacherShareAction(store, 'class1', { action: 'remove', token }, { now: NOW });
  assert.equal(reply.log[0].removed_at, NOW.toISOString());
});
