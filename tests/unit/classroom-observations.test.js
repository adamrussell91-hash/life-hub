import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassroomObservationsHandler } from '../../netlify/functions/classroom-observations.mjs';
import { deleteObservation, getObservation, listObservations, saveObservation } from '../../netlify/functions/_shared/classroom-observation-store.mjs';
import { validateMeetingFieldUpdate } from '../../netlify/functions/_shared/meeting-schema.mjs';

// Invented teachers and school only.
const MEETING = 'meeting_00000000-0000-4000-8000-000000000001';

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
  id: 'obs_aaaaaaaa-0001',
  kind: 'nesa_proficient',
  status: 'open',
  teacher: { person_ref: 'shared:person:p_sam', name: 'Sam Okafor', nesa_number: '', email: '', school: 'Riverbend High' },
  supervisor: { name: 'Jo Supervisor', nesa_number: '' },
  planned_on: '2026-11-16',
  meetings: { planning: MEETING },
  descriptors: [{ code: '3.5.2', why: 'Lorem', look_fors: [{ id: 'lf_1', label: 'Lorem look-for', key: 'Q' }] }],
  log: [{ id: 'log_1', at: '2026-11-18T01:00:00.000Z', clock: '03:10', descriptor: '3.5.2', look_for: 'lf_1', kind: 'strength', text: 'Lorem' }],
  created_at: '2026-11-16T01:00:00.000Z',
  updated_at: '2026-11-16T01:00:00.000Z',
  ...over
});

test('save fills defaults, stamps updated_at and upserts one index row', async () => {
  const store = storeFixture();
  const saved = await saveObservation(store, record(), { now: () => new Date('2026-11-20T00:00:00.000Z') });
  assert.equal(saved.updated_at, '2026-11-20T00:00:00.000Z');
  assert.equal(saved.plan_measure, '');
  assert.equal(saved.descriptors[0].practice, '');
  assert.deepEqual(saved.clock, { started_at: null, paused_ms: 0, paused_at: null, ended_at: null });
  await saveObservation(store, record({ planned_on: '2026-11-17' }));
  const list = await listObservations(store);
  assert.equal(list.length, 1);
  assert.equal(list[0].planned_on, '2026-11-17');
  assert.deepEqual(Object.keys(list[0]).sort(), ['id', 'kind', 'meetings', 'person_ref', 'planned_on', 'status', 'teacher_name', 'updated_at']);
  assert.equal((await getObservation(store, 'obs_aaaaaaaa-0001')).log.length, 1);
});

test('list filters by person and by open', async () => {
  const store = storeFixture();
  await saveObservation(store, record());
  await saveObservation(store, record({ id: 'obs_aaaaaaaa-0002', status: 'done', teacher: { person_ref: 'shared:person:p_sam', name: 'Sam Okafor' } }));
  await saveObservation(store, record({ id: 'obs_aaaaaaaa-0003', teacher: { person_ref: 'shared:person:p_lee', name: 'Lee Marsh' } }));
  assert.equal((await listObservations(store, {})).length, 3);
  assert.deepEqual((await listObservations(store, { person_ref: 'shared:person:p_sam' })).map((s) => s.id).sort(), ['obs_aaaaaaaa-0001', 'obs_aaaaaaaa-0002']);
  assert.deepEqual((await listObservations(store, { person_ref: 'shared:person:p_sam', open: true })).map((s) => s.id), ['obs_aaaaaaaa-0001']);
  assert.equal((await listObservations(store, { open: true })).length, 2);
});

test('records are validated and ids are checked', async () => {
  const store = storeFixture();
  const d = (n) => Array.from({ length: n }, (_, i) => ({ code: `3.${i + 1}.2` }));
  await assert.rejects(saveObservation(store, record({ id: 'nope' })), { status: 400 });
  await assert.rejects(saveObservation(store, record({ descriptors: d(5) })), { status: 400 });
  // 4 agreed + 2 extras is fine; a third extra or a fifth agreed is not.
  const extras = (n) => Array.from({ length: n }, (_, i) => ({ code: `6.${i + 1}.2`, extra: true }));
  await assert.rejects(saveObservation(store, record({ descriptors: [...d(4), ...extras(3)] })), { status: 400 });
  await assert.rejects(saveObservation(store, record({ descriptors: [...d(5), ...extras(1)] })), { status: 400 });
  await assert.rejects(saveObservation(store, record({ descriptors: [{ code: '3.5.2' }, { code: '3.5.2' }] })), { status: 400 });
  await assert.rejects(saveObservation(store, record({ meetings: { planning: 'meeting_x' } })), { status: 400 });
  await assert.rejects(saveObservation(store, record({ planned_on: 'tomorrow' })), { status: 400 });
  await assert.rejects(getObservation(store, '../index/v1'), { status: 400 });
  await assert.rejects(getObservation(store, 'obs_zzzzzzzz-9999'), { status: 404 });
  assert.equal(store.data.size, 0);
  await saveObservation(store, record());
  await deleteObservation(store, 'obs_aaaaaaaa-0001');
  assert.equal((await listObservations(store)).length, 0);
  await assert.rejects(deleteObservation(store, 'bad'), { status: 400 });
});

const gateEnv = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };

test('the endpoint is teacher only, never cached, and handles save, get, list, delete', async () => {
  const store = storeFixture();
  const make = (valid) => createClassroomObservationsHandler({ env: gateEnv, getContentStore: async () => store, verifySessionToken: () => ({ valid }) });
  const post = (body) => new Request('https://example.test/api/classroom-observations', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
  const get = (qs = '') => new Request(`https://example.test/api/classroom-observations${qs}`);
  assert.equal((await make(false)(get())).status, 401);
  assert.equal((await make(false)(post({ action: 'save', observation: record() }))).status, 401);
  assert.equal(store.data.size, 0);

  const saved = await make(true)(post({ action: 'save', observation: record() }));
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'no-store');
  assert.equal((await saved.json()).data.observation.id, 'obs_aaaaaaaa-0001');

  const listed = (await (await make(true)(get('?open=1&person_ref=shared:person:p_sam'))).json()).data;
  assert.equal(listed.observations.length, 1);
  assert.equal(listed.observations[0].log, undefined);
  const one = (await (await make(true)(get('?id=obs_aaaaaaaa-0001'))).json()).data;
  assert.equal(one.observation.teacher.school, 'Riverbend High');

  assert.equal((await make(true)(get('?id=obs_aaaaaaaa-0009'))).status, 404);
  assert.equal((await make(true)(get('?id=bad'))).status, 400);
  assert.equal((await make(true)(post({ action: 'save', observation: { id: 'x' } }))).status, 400);
  assert.equal((await make(true)(post({ action: 'wat' }))).status, 400);
  const del = await make(true)(post({ action: 'delete', id: 'obs_aaaaaaaa-0001' }));
  assert.equal(del.status, 200);
  assert.equal((await del.json()).data.deleted, true);
  assert.equal((await (await make(true)(get())).json()).data.observations.length, 0);
});

test('a meeting patch accepts an observation link, or null to unlink, and refuses anything else', () => {
  const link = { id: 'obs_aaaaaaaa-0001', phase: 'observing' };
  assert.deepEqual(validateMeetingFieldUpdate({ observation: link }).observation, link);
  assert.deepEqual(validateMeetingFieldUpdate({ observation: { ...link, extra: 1 } }).observation, link);
  assert.equal(validateMeetingFieldUpdate({ observation: null }).observation, null);
  assert.throws(() => validateMeetingFieldUpdate({ observation: { id: 'nope', phase: 'observing' } }), { code: 'invalid_observation' });
  assert.throws(() => validateMeetingFieldUpdate({ observation: { id: link.id, phase: 'later' } }), { code: 'invalid_observation' });
  assert.throws(() => validateMeetingFieldUpdate({ observation: 'obs_aaaaaaaa-0001' }), { code: 'invalid_observation' });
});

test('keeps extra descriptors and the counts-as-partial flag', async () => {
  const store = storeFixture();
  const d = (n) => Array.from({ length: n }, (_, i) => ({ code: `3.${i + 1}.2` }));
  const extras = (n) => Array.from({ length: n }, (_, i) => ({ code: `6.${i + 1}.2`, extra: true }));
  const six = await saveObservation(store, record({
    descriptors: [...d(4), ...extras(2)],
    log: [{ id: 'log_1', at: '2026-11-18T01:00:00.000Z', clock: '01:00', descriptor: '3.1.2', look_for: null, kind: 'next', text: 'Lorem', counts_partial: false }]
  }));
  assert.deepEqual(six.descriptors.map((x) => x.extra ?? false), [false, false, false, false, true, true]);
  assert.equal(six.log[0].counts_partial, false);
});
