import assert from 'node:assert/strict';
import test from 'node:test';
import { runApply, runPlan } from '../../netlify/functions/_shared/notion-import-run.mjs';
import { notionJobKey } from '../../netlify/functions/_shared/notion-import-store.mjs';
import { draftLessonKey, subjectKey, unitKey, yearKey } from '../../netlify/functions/_shared/teaching-blobs.mjs';

const now = '2026-10-18T00:00:00.000Z';
const text = (plain_text) => [{ type: 'text', plain_text, href: null, annotations: {} }];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  const calls = [];
  return {
    map, calls, read: (k) => (map.has(k) ? JSON.parse(map.get(k)) : null),
    async get(key, o) { calls.push([key, o]); if (!map.has(key)) return null; return o?.type === 'json' ? JSON.parse(map.get(key)) : map.get(key); },
    async set(key, v) { map.set(key, typeof v === 'string' ? v : JSON.stringify({ bytes: true })); },
    async setJSON(key, v) { map.set(key, JSON.stringify(v)); },
    async delete(key) { map.delete(key); },
    async list({ prefix } = {}) { return { blobs: [...map.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const common = (id, title) => ({ id, title, slug: 'x', status: 'active', created_at: now, updated_at: now, schema_version: 1 });
function page(id, title, category, sub = []) {
  return { object: 'page', id, url: '', last_edited_time: now, cover: null, properties: {
    Name: { id: 'title', type: 'title', title: text(title) },
    Category: { id: 'c', type: 'select', select: { name: category } },
    Subject: { id: 's', type: 'multi_select', multi_select: [{ name: 'Made-up Subject' }] },
    'Year Level': { id: 'y', type: 'multi_select', multi_select: [{ name: 'Year 9' }] },
    'Sub-item': { id: 'sub', type: 'relation', relation: sub.map((s) => ({ id: s })), has_more: false }
  } };
}
const fileSignals = [];
function fetchImpl(url, init) {
  const u = new URL(url);
  const routes = {
    '/v1/pages/u1': page('u1', 'Made-up Unit', 'Unit', ['l1']),
    '/v1/pages/l1': page('l1', 'Made-up Lesson', 'Workshop'),
    '/v1/blocks/u1/children': { results: [], has_more: false },
    '/v1/blocks/l1/children': { results: [
      { id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: text('Hello') } },
      { id: 'b2', type: 'image', has_children: false, image: { type: 'file', file: { url: 'https://files.example/pic.png' }, caption: text('Pic') } }
    ], has_more: false }
  };
  if (u.hostname === 'files.example') fileSignals.push(init?.signal);
  if (u.hostname === 'files.example') return Promise.resolve(new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }));
  return Promise.resolve(routes[u.pathname] ? json(routes[u.pathname]) : json({ code: 'object_not_found' }, 404));
}
const seed = () => memoryStore({
  [yearKey('year_9')]: { ...common('year_9', 'Year 9'), type: 'year', year_level: 9 },
  [subjectKey('subject_1')]: { ...common('subject_1', 'Made-up Subject'), type: 'subject', display_title: 'Made-up Subject', unit_ids: [], outcome_ids: [], class_ids: [] }
});
const env = { NOTION_TEACHING_TOKEN: 't' };
const CHOICES = { excluded_page_ids: [], overrides: {}, html_as_code: [] };
function queue(store, id, { kind = 'plan', page_id = 'u1', choices = CHOICES, status = 'queued', updated_at = now } = {}) {
  store.map.set(notionJobKey(id), JSON.stringify({ id, kind, status, page_id, choices, created_at: now, updated_at }));
}

test('plan then apply imports a unit with a rehosted image', async () => {
  const store = seed();
  queue(store, 'nij_test0001');
  await runPlan(store, 'nij_test0001', { env, fetchImpl, now, sleep: async () => {} });
  const planned = store.read(notionJobKey('nij_test0001'));
  assert.equal(planned.status, 'planned');
  assert.equal(planned.page_id, 'u1');
  assert.equal(planned.plan.media_count, 1);
  assert.equal('media' in planned.plan, false);
  assert.ok(planned.plan.entities.every((e) => !('record' in e)));
  assert.deepEqual(Object.keys(planned.plan.entities[0]).sort(),
    ['existing', 'id', 'kind', 'label', 'needs', 'page_id', 'parent_page_id', 'suggested', 'title']);
  assert.ok(!JSON.stringify(planned.plan).includes('files.example'));
  for (const k of ['skipped', 'warnings', 'html_apps', 'new_subjects']) assert.ok(Array.isArray(planned.plan[k]), k);
  assert.deepEqual(planned.plan.entities.map((e) => e.label), ['Unit', 'Workshop']);

  queue(store, 'nij_test0002', { kind: 'apply' });
  await runApply(store, 'nij_test0002', { env, fetchImpl, now, origin: 'https://hub.example', sleep: async () => {} });
  const done = store.read(notionJobKey('nij_test0002'));
  assert.equal(done.status, 'done');
  const lesson = store.read(draftLessonKey('lesson_n_l1'));
  assert.equal(lesson.pedagogical_mode, 'workshop');
  assert.match(lesson.blocks[1].content.url, /^https:\/\/hub\.example\/api\/media\/media_n_[0-9a-f]+\/file$/);
  assert.deepEqual(store.read(unitKey('unit_n_u1')).lesson_ids, ['lesson_n_l1']);
});

test('a missing token fails the job with a setup message', async () => {
  const store = seed();
  queue(store, 'nij_test0003');
  await runPlan(store, 'nij_test0003', { env: {}, fetchImpl, now });
  const job = store.read(notionJobKey('nij_test0003'));
  assert.equal(job.status, 'failed');
  assert.match(job.error, /NOTION_TEACHING_TOKEN/);
});

test('an unshared page fails the job with a sharing message', async () => {
  const store = seed();
  queue(store, 'nij_test0004', { page_id: 'nope' });
  await runPlan(store, 'nij_test0004', { env, fetchImpl, now, sleep: async () => {} });
  assert.match(store.read(notionJobKey('nij_test0004')).error, /Connections/);
});

test('a 429 from Notion after retries maps to a busy message', async () => {
  const store = seed();
  queue(store, 'nij_test0005');
  const busy = () => Promise.resolve(json({ code: 'rate_limited' }, 429));
  await runPlan(store, 'nij_test0005', { env, fetchImpl: busy, now, sleep: async () => {} });
  assert.equal(store.read(notionJobKey('nij_test0005')).error, 'Notion is busy; try again in a minute.');
});

test('a job that is not queued, or is missing, or is the wrong kind, does nothing', async () => {
  const store = seed();
  let calls = 0;
  const counting = (...a) => { calls += 1; return fetchImpl(...a); };
  const run = (id, fn = runPlan) => fn(store, id, { env, fetchImpl: counting, now, sleep: async () => {} });
  queue(store, 'nij_done0001', { status: 'done' });
  queue(store, 'nij_plan0001', { status: 'planned' });
  queue(store, 'nij_fail0001', { status: 'failed' });
  queue(store, 'nij_busy0001', { status: 'running', updated_at: new Date().toISOString() });
  queue(store, 'nij_kind0001', { kind: 'apply' });
  for (const id of ['nij_done0001', 'nij_plan0001', 'nij_fail0001', 'nij_busy0001', 'nij_kind0001', 'nij_gone0001']) await run(id);
  assert.equal(calls, 0);
  assert.equal(store.read(notionJobKey('nij_kind0001')).status, 'queued');
  assert.equal(store.read(notionJobKey('nij_gone0001')), null);
});

test('a stale running job is resumed', async () => {
  const store = seed();
  queue(store, 'nij_test0007', { status: 'running', updated_at: new Date(Date.now() - 3 * 60 * 1000).toISOString() });
  await runPlan(store, 'nij_test0007', { env, fetchImpl, now, sleep: async () => {} });
  assert.equal(store.read(notionJobKey('nij_test0007')).status, 'planned');
});

test('a job with an unparseable updated_at is treated as stale', async () => {
  const store = seed();
  queue(store, 'nij_test0009', { status: 'running', updated_at: 'garbage' });
  await runPlan(store, 'nij_test0009', { env, fetchImpl, now, sleep: async () => {} });
  assert.equal(store.read(notionJobKey('nij_test0009')).status, 'planned');
});

test('apply stops downloading media once the media deadline has passed', async () => {
  const store = seed();
  queue(store, 'nij_test0008', { kind: 'apply' });
  await runApply(store, 'nij_test0008', { env, fetchImpl, now, origin: 'https://hub.example', sleep: async () => {}, mediaDeadlineAt: Date.now() - 1 });
  const job = store.read(notionJobKey('nij_test0008'));
  assert.equal(job.status, 'done');
  assert.ok(job.report.warnings.some((w) => /ran out/i.test(w.message)));
  assert.equal([...store.map.keys()].some((k) => k.startsWith('media/')), false);
});

test('each media download gets a bounded abort signal', async () => {
  const store = seed();
  fileSignals.length = 0;
  const asked = [];
  queue(store, 'nij_test0010', { kind: 'apply' });
  await runApply(store, 'nij_test0010', {
    env, fetchImpl, now, origin: 'https://hub.example', sleep: async () => {},
    clock: () => 1_000_000, mediaDeadlineAt: 1_000_000 + 5_000,
    timeoutSignal: (ms) => { asked.push(ms); return new AbortController().signal; }
  });
  assert.deepEqual(asked, [5000]); // bounded by the cutoff itself
  assert.equal(fileSignals.length, 1);
  assert.ok(fileSignals[0] instanceof AbortSignal);
  const near = [];
  const store2 = seed();
  queue(store2, 'nij_test0011', { kind: 'apply' });
  await runApply(store2, 'nij_test0011', {
    env, fetchImpl, now, origin: 'https://hub.example', sleep: async () => {},
    clock: () => 1_000_000, mediaDeadlineAt: 1_000_000 - 59_500,
    timeoutSignal: (ms) => { near.push(ms); return new AbortController().signal; }
  });
  assert.deepEqual(near, []); // past the deadline: no download, so no signal asked for
});

test('the injected clock drives the read deadline', async () => {
  const store = seed();
  queue(store, 'nij_test0012');
  let n = 0;
  const clock = () => (n++ === 0 ? 0 : 1e13);
  await runPlan(store, 'nij_test0012', { env, fetchImpl, now, clock, sleep: async () => {} });
  const job = store.read(notionJobKey('nij_test0012'));
  assert.equal(job.status, 'failed');
  assert.match(job.error, /Too much to read/);
});

test('the cutoff bounds each download timeout, between 1s and 60s', async () => {
  for (const [headroom, expected] of [[120_000, 60000], [200, 1000]]) {
    const store = seed();
    const asked = [];
    queue(store, 'nij_test0013', { kind: 'apply' });
    await runApply(store, 'nij_test0013', {
      env, fetchImpl, now, origin: 'https://hub.example', sleep: async () => {},
      clock: () => 1_000_000, mediaDeadlineAt: 1_000_000 + headroom,
      timeoutSignal: (ms) => { asked.push(ms); return new AbortController().signal; }
    });
    assert.deepEqual(asked, [expected]);
  }
});

test('every job read asks for strong consistency', async () => {
  const store = seed();
  queue(store, 'nij_test0014');
  queue(store, 'nij_test0015', { kind: 'apply' });
  await runPlan(store, 'nij_test0014', { env, fetchImpl, now, sleep: async () => {} });
  await runApply(store, 'nij_test0015', { env, fetchImpl, now, origin: 'https://hub.example', sleep: async () => {} });
  const jobReads = store.calls.filter(([k]) => k.startsWith('notion-import/jobs/'));
  assert.ok(jobReads.length >= 6);
  assert.ok(jobReads.every(([, o]) => o?.consistency === 'strong'), JSON.stringify(jobReads));
});

test('reading writes a heartbeat with page counts into the job', async () => {
  const store = seed();
  queue(store, 'nij_test0016');
  const snapshots = [];
  const realSet = store.setJSON.bind(store);
  store.setJSON = async (k, v) => { if (k === notionJobKey('nij_test0016')) snapshots.push(structuredClone(v)); return realSet(k, v); };
  await runPlan(store, 'nij_test0016', { env, fetchImpl, now, sleep: async () => {} });
  const beats = snapshots.filter((j) => j.status === 'running' && j.progress?.phase === 'reading');
  assert.deepEqual(beats.map((j) => [j.progress.done, j.progress.total]), [[1, 2], [2, 2]]);
  assert.ok(beats.every((j) => j.phase === 'reading'));
});
