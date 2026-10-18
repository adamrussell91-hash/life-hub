import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePageId } from '../../netlify/functions/_shared/notion-import-run.mjs';
import { notionJobKey } from '../../netlify/functions/_shared/notion-import-store.mjs';
import { config as planConfig, createNotionImportPlanHandler } from '../../netlify/functions/notion-import-plan.mjs';
import { config as applyConfig, createNotionImportApplyHandler } from '../../netlify/functions/notion-import-apply.mjs';
import { config as readConfig, createNotionImportHandler } from '../../netlify/functions/notion-import.mjs';

const DASHED = '0123abcd-4567-89ef-0123-456789abcdef';
const BARE = DASHED.replace(/-/g, '');
const VIEW = 'fedcba98765432100123456789abcdef';

test('normalizePageId dashes 32-hex ids in every form', () => {
  assert.equal(normalizePageId(BARE), DASHED);
  assert.equal(normalizePageId(DASHED), DASHED);
  assert.equal(normalizePageId(BARE.toUpperCase()), DASHED);
  assert.equal(normalizePageId(`https://www.notion.so/Made-up-Face-dead-${BARE}`), DASHED);
});

test('normalizePageId uses the p param, and never a view id from the query', () => {
  assert.equal(normalizePageId(`https://www.notion.so/ws/${VIEW}?v=${VIEW}&p=${BARE}&pm=s`), DASHED);
  assert.equal(normalizePageId(`https://www.notion.so/Made-up-${BARE}?v=${VIEW}`), DASHED);
  assert.equal(normalizePageId(`https://www.notion.so/Made-up-title?v=${VIEW}`), `https://www.notion.so/Made-up-title?v=${VIEW}`);
});

test('normalizePageId leaves non-hex ids alone', () => {
  assert.equal(normalizePageId('u1'), 'u1');
  assert.equal(normalizePageId('nope'), 'nope');
});

test('function configs declare paths and background mode', () => {
  assert.equal(planConfig.path, '/api/notion-import/plan');
  assert.equal(planConfig.background, true);
  assert.equal(applyConfig.path, '/api/notion-import/apply');
  assert.equal(applyConfig.background, true);
  assert.deepEqual(readConfig.path, ['/api/notion-import/search', '/api/notion-import/jobs', '/api/notion-import/jobs/:id']);
  assert.notEqual(readConfig.background, true);
});

// ---------------------------------------------------------------- handlers

const ORIGIN = 'https://life-hub.adam-russell.com';
const gate = { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' };
const env = { ...gate, NOTION_TEACHING_TOKEN: 't', NOTION_TEACHING_DATA_SOURCE_ID: 'ds' };

function memoryStore() {
  const map = new Map();
  const reads = [];
  return {
    map, reads,
    read: (k) => (map.has(k) ? JSON.parse(map.get(k)) : null),
    async get(key, o) { reads.push([key, o]); return map.has(key) ? JSON.parse(map.get(key)) : null; },
    async setJSON(key, v) { map.set(key, JSON.stringify(v)); },
    async set(key, v) { map.set(key, typeof v === 'string' ? v : JSON.stringify({ bytes: true })); },
    async list({ prefix } = {}) { return { blobs: [...map.keys()].filter((k) => !prefix || k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}
const deps = (store, extra = {}) => ({ getContentStore: async () => store, verifySessionToken: () => ({ valid: true }), env, ...extra });
const req = (method, path, body) => new Request(`https://api.adam-russell.com${path}`, {
  method,
  headers: { origin: ORIGIN, 'content-type': 'application/json', cookie: 'life_hub_session=ok' },
  ...(body ? { body: JSON.stringify(body) } : {})
});
const body = async (res) => (await res.json());

test('POST jobs: rejects a bad page id and bad kind with 400', async () => {
  const store = memoryStore();
  const handler = createNotionImportHandler(deps(store, { kickNotionImportRun: async () => true }));
  const bad = await handler(req('POST', '/api/notion-import/jobs', { kind: 'plan', page_id: 'not a page' }));
  assert.equal(bad.status, 400);
  assert.equal((await body(bad)).error.message, 'Choose a Notion page to import.');
  const kind = await handler(req('POST', '/api/notion-import/jobs', { kind: 'nuke', page_id: BARE }));
  assert.equal(kind.status, 400);
  const choices = await handler(req('POST', '/api/notion-import/jobs', { kind: 'apply', page_id: BARE, choices: { excluded_page_ids: 'x' } }));
  assert.equal(choices.status, 400);
  assert.equal(store.map.size, 0);
});

test('POST jobs: a missing token is 503 not_configured, not retryable', async () => {
  const handler = createNotionImportHandler(deps(memoryStore(), { env: gate, kickNotionImportRun: async () => true }));
  const res = await handler(req('POST', '/api/notion-import/jobs', { kind: 'plan', page_id: BARE }));
  assert.equal(res.status, 503);
  const err = (await body(res)).error;
  assert.equal(err.code, 'not_configured');
  assert.equal(err.retryable, false);
});

test('POST jobs: queues a job, kicks the matching run with only the job id, returns 202', async () => {
  const store = memoryStore();
  const kicks = [];
  const handler = createNotionImportHandler(deps(store, {
    kickNotionImportRun: async (request, runPath, jobId) => { kicks.push([runPath, jobId]); return true; }
  }));
  const choices = { excluded_page_ids: ['a'], overrides: {}, html_as_code: [] };
  const res = await handler(req('POST', '/api/notion-import/jobs', { kind: 'apply', page_id: `https://www.notion.so/Title-${BARE}`, choices }));
  assert.equal(res.status, 202);
  const { job_id } = (await body(res)).data;
  assert.match(job_id, /^nij_[a-z0-9]{8,32}$/);
  const job = store.read(notionJobKey(job_id));
  assert.equal(job.status, 'queued');
  assert.equal(job.kind, 'apply');
  assert.equal(job.page_id, DASHED);
  assert.deepEqual(job.choices, choices);
  assert.ok(job.created_at && job.updated_at);
  assert.deepEqual(kicks, [['/api/notion-import/apply', job_id]]);

  const plan = await handler(req('POST', '/api/notion-import/jobs', { kind: 'plan', page_id: BARE }));
  const planJob = store.read(notionJobKey((await body(plan)).data.job_id));
  assert.deepEqual(planJob.choices, { excluded_page_ids: [], overrides: {}, html_as_code: [] });
  assert.equal(kicks[1][0], '/api/notion-import/plan');
});

test('POST jobs: a kick that fails marks the job failed and answers 502 retryable', async () => {
  const store = memoryStore();
  const handler = createNotionImportHandler(deps(store, { kickNotionImportRun: async () => false }));
  const res = await handler(req('POST', '/api/notion-import/jobs', { kind: 'plan', page_id: BARE }));
  assert.equal(res.status, 502);
  assert.equal((await body(res)).error.retryable, true);
  const [job] = [...store.map.values()].map((v) => JSON.parse(v));
  assert.equal(job.status, 'failed');
});

test('GET jobs/:id: 400, 404 and 200', async () => {
  const store = memoryStore();
  const handler = createNotionImportHandler(deps(store));
  assert.equal((await handler(req('GET', '/api/notion-import/jobs/bad'))).status, 400);
  assert.equal((await handler(req('GET', '/api/notion-import/jobs/nij_missing01'))).status, 404);
  store.map.set(notionJobKey('nij_present01'), JSON.stringify({ id: 'nij_present01', status: 'planned' }));
  const ok = await handler(req('GET', '/api/notion-import/jobs/nij_present01'));
  assert.equal(ok.status, 200);
  assert.equal((await body(ok)).data.status, 'planned');
});

test('GET jobs/:id reads with strong consistency', async () => {
  const store = memoryStore();
  store.map.set(notionJobKey('nij_present01'), JSON.stringify({ id: 'nij_present01', status: 'queued' }));
  await createNotionImportHandler(deps(store))(req('GET', '/api/notion-import/jobs/nij_present01'));
  assert.deepEqual(store.reads.map(([, o]) => o?.consistency), ['strong']);
});

test('POST jobs: after a failed kick, a job that already moved on is left alone', async () => {
  const store = memoryStore();
  const handler = createNotionImportHandler(deps(store, {
    kickNotionImportRun: async (_r, _p, id) => {
      store.map.set(notionJobKey(id), JSON.stringify({ ...JSON.parse(store.map.get(notionJobKey(id))), status: 'running' }));
      return false;
    }
  }));
  const res = await handler(req('POST', '/api/notion-import/jobs', { kind: 'plan', page_id: BARE }));
  assert.equal(res.status, 502);
  const [job] = [...store.map.values()].map((v) => JSON.parse(v));
  assert.equal(job.status, 'running');
  assert.ok(store.reads.every(([, o]) => o?.consistency === 'strong'));
});

test('search: setup errors are 503 not_configured and not retryable', async () => {
  for (const e of [gate, { ...gate, NOTION_TEACHING_TOKEN: 't' }]) {
    const handler = createNotionImportHandler(deps(memoryStore(), { env: e }));
    const res = await handler(req('GET', '/api/notion-import/search?q=x'));
    assert.equal(res.status, 503);
    const err = (await body(res)).error;
    assert.equal(err.code, 'not_configured');
    assert.equal(err.retryable, false);
  }
});

test('search: returns slim items', async () => {
  const page = { id: 'p1', last_edited_time: 't', properties: { Name: { type: 'title', title: [{ plain_text: 'Made-up' }] }, Category: { select: { name: 'Unit' } } } };
  const fetchImpl = async () => new Response(JSON.stringify({ results: [page] }), { status: 200 });
  const handler = createNotionImportHandler(deps(memoryStore(), { fetchImpl }));
  const res = await handler(req('GET', '/api/notion-import/search?q=x'));
  assert.deepEqual((await body(res)).data.items, [{ page_id: 'p1', title: 'Made-up', category: 'Unit', last_edited_time: 't' }]);
});

test('other methods are 405', async () => {
  const handler = createNotionImportHandler(deps(memoryStore()));
  assert.equal((await handler(req('PUT', '/api/notion-import/jobs'))).status, 405);
  assert.equal((await handler(req('DELETE', '/api/notion-import/jobs/nij_present01'))).status, 405);
  assert.equal((await handler(req('POST', '/api/notion-import/search'))).status, 405);
  assert.equal((await handler(req('POST', '/api/notion-import/jobs/nij_present01'))).status, 405);
});

const text = (plain_text) => [{ type: 'text', plain_text, href: null, annotations: {} }];
const notionFetch = async (url) => {
  const path = new URL(url).pathname;
  if (path === '/v1/pages/0123abcd-4567-89ef-0123-456789abcdef') {
    return new Response(JSON.stringify({ object: 'page', id: DASHED, url: '', last_edited_time: 't', cover: null, properties: {
      Name: { id: 'title', type: 'title', title: text('Made-up Unit') },
      Category: { id: 'c', type: 'select', select: { name: 'Unit' } },
      'Sub-item': { id: 'sub', type: 'relation', relation: [], has_more: false }
    } }), { status: 200 });
  }
  if (path.endsWith('/children')) return new Response(JSON.stringify({ results: [], has_more: false }), { status: 200 });
  return new Response(JSON.stringify({ code: 'object_not_found' }), { status: 404 });
};

for (const [name, make, kind, path] of [
  ['plan', createNotionImportPlanHandler, 'plan', '/api/notion-import/plan'],
  ['apply', createNotionImportApplyHandler, 'apply', '/api/notion-import/apply']
]) {
  test(`${name} background handler: runs a queued job, ignores non-queued and missing ones`, async () => {
    const store = memoryStore();
    const handler = make(deps(store, { fetchImpl: notionFetch, sleep: async () => {} }));
    const seedJob = (id, extra) => store.map.set(notionJobKey(id), JSON.stringify({
      id, kind, page_id: DASHED, choices: { excluded_page_ids: [], overrides: {}, html_as_code: [] },
      status: 'queued', created_at: 't', updated_at: new Date().toISOString(), ...extra
    }));

    seedJob('nij_queued01', {});
    seedJob('nij_done0001', { status: 'done' });
    seedJob('nij_stale001', { status: 'running', updated_at: new Date(Date.now() - 3 * 60 * 1000).toISOString() });

    assert.equal((await handler(req('GET', path))).status, 405);
    assert.equal((await handler(req('POST', path, { job_id: 'bad' }))).status, 400);
    assert.equal((await handler(req('POST', path, { job_id: 'nij_missing01' }))).status, 404);
    assert.equal((await handler(req('POST', path, { job_id: 'nij_done0001' }))).status, 202);
    assert.equal(store.read(notionJobKey('nij_done0001')).status, 'done');
    assert.equal(store.read(notionJobKey('nij_done0001')).report, undefined);

    assert.equal((await handler(req('POST', path, { job_id: 'nij_queued01' }))).status, 202);
    assert.equal(store.read(notionJobKey('nij_queued01')).status, kind === 'plan' ? 'planned' : 'done');
    assert.equal((await handler(req('POST', path, { job_id: 'nij_stale001' }))).status, 202);
    assert.equal(store.read(notionJobKey('nij_stale001')).status, kind === 'plan' ? 'planned' : 'done');
  });
}
