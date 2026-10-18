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
  return {
    map, read: (k) => (map.has(k) ? JSON.parse(map.get(k)) : null),
    async get(key, o) { if (!map.has(key)) return null; return o?.type === 'json' ? JSON.parse(map.get(key)) : map.get(key); },
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
function fetchImpl(url) {
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
  if (u.hostname === 'files.example') return Promise.resolve(new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }));
  return Promise.resolve(routes[u.pathname] ? json(routes[u.pathname]) : json({ code: 'object_not_found' }, 404));
}
const seed = () => memoryStore({
  [yearKey('year_9')]: { ...common('year_9', 'Year 9'), type: 'year', year_level: 9 },
  [subjectKey('subject_1')]: { ...common('subject_1', 'Made-up Subject'), type: 'subject', display_title: 'Made-up Subject', unit_ids: [], outcome_ids: [], class_ids: [] }
});
const env = { NOTION_TEACHING_TOKEN: 't' };

test('plan then apply imports a unit with a rehosted image', async () => {
  const store = seed();
  await runPlan(store, { job_id: 'nij_test0001', page_id: 'u1' }, { env, fetchImpl, now, sleep: async () => {} });
  const planned = store.read(notionJobKey('nij_test0001'));
  assert.equal(planned.status, 'planned');
  assert.deepEqual(planned.plan.entities.map((e) => e.label), ['Unit', 'Workshop']);

  await runApply(store, { job_id: 'nij_test0002', page_id: 'u1', choices: { excluded_page_ids: [], overrides: {}, html_as_code: [] } },
    { env, fetchImpl, now, origin: 'https://hub.example', sleep: async () => {} });
  const done = store.read(notionJobKey('nij_test0002'));
  assert.equal(done.status, 'done');
  const lesson = store.read(draftLessonKey('lesson_n_l1'));
  assert.equal(lesson.pedagogical_mode, 'workshop');
  assert.match(lesson.blocks[1].content.url, /^https:\/\/hub\.example\/api\/media\/media_n_[0-9a-f]+\/file$/);
  assert.deepEqual(store.read(unitKey('unit_n_u1')).lesson_ids, ['lesson_n_l1']);
});

test('a missing token fails the job with a setup message', async () => {
  const store = seed();
  await runPlan(store, { job_id: 'nij_test0003', page_id: 'u1' }, { env: {}, fetchImpl, now });
  const job = store.read(notionJobKey('nij_test0003'));
  assert.equal(job.status, 'failed');
  assert.match(job.error, /NOTION_TEACHING_TOKEN/);
});

test('an unshared page fails the job with a sharing message', async () => {
  const store = seed();
  await runPlan(store, { job_id: 'nij_test0004', page_id: 'nope' }, { env, fetchImpl, now, sleep: async () => {} });
  assert.match(store.read(notionJobKey('nij_test0004')).error, /Connections/);
});

test('a 429 from Notion after retries maps to a busy message', async () => {
  const store = seed();
  const busy = () => Promise.resolve(json({ code: 'rate_limited' }, 429));
  await runPlan(store, { job_id: 'nij_test0005', page_id: 'u1' }, { env, fetchImpl: busy, now, sleep: async () => {} });
  assert.equal(store.read(notionJobKey('nij_test0005')).error, 'Notion is busy; try again in a minute.');
});

test('a replayed job id does not run again', async () => {
  const store = seed();
  await runPlan(store, { job_id: 'nij_test0006', page_id: 'u1' }, { env, fetchImpl, now, sleep: async () => {} });
  let calls = 0;
  const counting = (...a) => { calls += 1; return fetchImpl(...a); };
  await runPlan(store, { job_id: 'nij_test0006', page_id: 'u1' }, { env, fetchImpl: counting, now, sleep: async () => {} });
  assert.equal(calls, 0);
  assert.equal(store.read(notionJobKey('nij_test0006')).status, 'planned');
});

test('a fresh running job blocks a duplicate retry, a stale one is resumed', async () => {
  const store = seed();
  let calls = 0;
  const counting = (...a) => { calls += 1; return fetchImpl(...a); };
  store.map.set(notionJobKey('nij_test0007'), JSON.stringify({ id: 'nij_test0007', status: 'running', updated_at: new Date().toISOString() }));
  await runPlan(store, { job_id: 'nij_test0007', page_id: 'u1' }, { env, fetchImpl: counting, now, sleep: async () => {} });
  assert.equal(calls, 0);
  store.map.set(notionJobKey('nij_test0007'), JSON.stringify({ id: 'nij_test0007', status: 'running', updated_at: new Date(Date.now() - 3 * 60 * 1000).toISOString() }));
  await runPlan(store, { job_id: 'nij_test0007', page_id: 'u1' }, { env, fetchImpl: counting, now, sleep: async () => {} });
  assert.ok(calls > 0);
  assert.equal(store.read(notionJobKey('nij_test0007')).status, 'planned');
});

test('apply stops downloading media once the media deadline has passed', async () => {
  const store = seed();
  await runApply(store, { job_id: 'nij_test0008', page_id: 'u1', choices: { excluded_page_ids: [], overrides: {}, html_as_code: [] } },
    { env, fetchImpl, now, origin: 'https://hub.example', sleep: async () => {}, mediaDeadlineAt: Date.now() - 1 });
  const job = store.read(notionJobKey('nij_test0008'));
  assert.equal(job.status, 'done');
  assert.ok(job.report.warnings.some((w) => /out of time|ran out/i.test(w.message)));
  assert.equal([...store.map.keys()].some((k) => k.startsWith('media/')), false);
});
