// tests/unit/notion-reader.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createNotionClient, NotionApiError } from '../../netlify/functions/_shared/notion-client.mjs';
import { readNotionTree, normalizePage } from '../../netlify/functions/_shared/notion-reader.mjs';

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const text = (plain_text) => [{ type: 'text', plain_text, href: null, annotations: {} }];

function fakeNotion(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method ?? 'GET'} ${u.pathname}${u.searchParams.get('start_cursor') ? `?c=${u.searchParams.get('start_cursor')}` : ''}`;
    calls.push(key);
    const route = routes[key];
    if (!route) return json(404, { object: 'error', code: 'object_not_found', message: key });
    return typeof route === 'function' ? route(calls) : json(200, route);
  };
  return { fetchImpl, calls };
}

function pageBody(id, title, category, subItems = []) {
  return {
    object: 'page', id, url: `https://www.notion.so/${id}`, last_edited_time: '2026-10-01T00:00:00.000Z',
    cover: { type: 'file', file: { url: `https://files.example/${id}.png` } },
    properties: {
      Name: { id: 'title', type: 'title', title: text(title) },
      Category: { id: 'c', type: 'select', select: category ? { name: category } : null },
      Subject: { id: 's', type: 'multi_select', multi_select: [{ name: 'Made-up Subject' }] },
      'Year Level': { id: 'y', type: 'multi_select', multi_select: [{ name: 'Year 9' }] },
      Outcomes: { id: 'o', type: 'multi_select', multi_select: [{ name: 'EN5-URA-01' }] },
      'Date/s': { id: 'd', type: 'date', date: { start: '2027-02-01', end: null } },
      Files: { id: 'f', type: 'files', files: [{ name: 'brief.pdf', type: 'file', file: { url: 'https://files.example/brief.pdf' } }] },
      'Sub-item': { id: 'sub', type: 'relation', relation: subItems.map((sid) => ({ id: sid })), has_more: false }
    }
  };
}

test('client retries 429 using Retry-After, then succeeds', async () => {
  let n = 0;
  const waits = [];
  const client = createNotionClient({
    token: 't',
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async () => (++n === 1 ? json(429, { code: 'rate_limited' }, { 'retry-after': '2' }) : json(200, { ok: true }))
  });
  assert.deepEqual(await client.request('GET', '/v1/users/me'), { ok: true });
  assert.deepEqual(waits, [2000]);
});

test('client raises NotionApiError with the Notion code', async () => {
  const client = createNotionClient({ token: 't', sleep: async () => {}, fetchImpl: async () => json(404, { code: 'object_not_found', message: 'nope' }) });
  await assert.rejects(client.request('GET', '/v1/pages/x'), (err) => err instanceof NotionApiError && err.code === 'object_not_found');
});

test('normalizePage reads the Teaching properties', () => {
  const page = normalizePage(pageBody('u1', 'Made-up Unit', 'Unit', ['l1']), []);
  assert.equal(page.title, 'Made-up Unit');
  assert.equal(page.category, 'Unit');
  assert.deepEqual(page.years, ['Year 9']);
  assert.deepEqual(page.child_ids, ['l1']);
  assert.equal(page.files[0].source, 'file');
  assert.equal(page.cover.url, 'https://files.example/u1.png');
  assert.equal(page.date_start, '2027-02-01');
});

test('readNotionTree follows Sub-items, paginates and recurses into children', async () => {
  const { fetchImpl } = fakeNotion({
    'GET /v1/pages/u1': pageBody('u1', 'Made-up Unit', 'Unit', ['l1']),
    'GET /v1/pages/l1': pageBody('l1', 'Made-up Lesson', 'Lesson'),
    'GET /v1/blocks/u1/children': {
      results: [{ id: 'b1', type: 'paragraph', has_children: false, paragraph: { rich_text: text('one') } }],
      has_more: true, next_cursor: 'cur2'
    },
    'GET /v1/blocks/u1/children?c=cur2': {
      results: [{ id: 'b2', type: 'toggle', has_children: true, toggle: { rich_text: text('T') } }],
      has_more: false
    },
    'GET /v1/blocks/b2/children': {
      results: [{ id: 'b3', type: 'child_database', has_children: true, child_database: { title: 'x' } }],
      has_more: false
    },
    'GET /v1/blocks/l1/children': { results: [], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  const tree = await readNotionTree(client, 'u1');
  assert.deepEqual(Object.keys(tree.pages).sort(), ['l1', 'u1']);
  const blocks = tree.pages.u1.blocks;
  assert.deepEqual(blocks.map((b) => b.type), ['paragraph', 'toggle']);
  assert.equal(blocks[1].children[0].type, 'child_database');
  assert.deepEqual(blocks[1].children[0].children, []); // never descends into databases
  assert.equal(tree.root_id, 'u1');
});

const DASHED_A = '11111111-2222-3333-4444-555555555555';
const DASHED_B = '66666666-7777-8888-9999-000000000000';

test('readNotionTree keys the root by the id Notion returns, even for undashed input', async () => {
  const undashed = DASHED_A.replaceAll('-', '');
  const { fetchImpl } = fakeNotion({
    [`GET /v1/pages/${undashed}`]: pageBody(DASHED_A, 'Made-up Page', 'Lesson'),
    [`GET /v1/blocks/${DASHED_A}/children`]: { results: [], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  const tree = await readNotionTree(client, undashed);
  assert.equal(tree.root_id, DASHED_A);
  assert.deepEqual(Object.keys(tree.pages), [DASHED_A]);
  assert.equal(tree.pages[DASHED_A].id, DASHED_A);
});

test('readNotionTree survives a Sub-item cycle (A <-> B)', async () => {
  const { fetchImpl, calls } = fakeNotion({
    [`GET /v1/pages/${DASHED_A}`]: pageBody(DASHED_A, 'A', 'Unit', [DASHED_B]),
    [`GET /v1/pages/${DASHED_B}`]: pageBody(DASHED_B, 'B', 'Unit', [DASHED_A]),
    [`GET /v1/blocks/${DASHED_A}/children`]: { results: [], has_more: false },
    [`GET /v1/blocks/${DASHED_B}/children`]: { results: [], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  const tree = await readNotionTree(client, DASHED_A);
  assert.deepEqual(Object.keys(tree.pages).sort(), [DASHED_A, DASHED_B].sort());
  assert.equal(calls.filter((c) => c === `GET /v1/pages/${DASHED_A}`).length, 1);
  assert.equal(calls.filter((c) => c === `GET /v1/pages/${DASHED_B}`).length, 1);
});

test('readNotionTree stops at the page limit', async () => {
  const { fetchImpl } = fakeNotion({
    'GET /v1/pages/u1': pageBody('u1', 'U', 'Unit', ['l1', 'l2']),
    'GET /v1/pages/l1': pageBody('l1', 'L1', 'Lesson'),
    'GET /v1/blocks/u1/children': { results: [], has_more: false },
    'GET /v1/blocks/l1/children': { results: [], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  await assert.rejects(readNotionTree(client, 'u1', { maxPages: 2 }), /more than 2 pages/);
});

test('readNotionTree normalises tabs', async () => {
  const { fetchImpl } = fakeNotion({
    'GET /v1/pages/u1': pageBody('u1', 'U', 'Lesson'),
    'GET /v1/blocks/u1/children': { results: [{ id: 'tb', type: 'tab', has_children: true, tab: {} }], has_more: false },
    'GET /v1/blocks/tb/children': { results: [
      { id: 't1', type: 'paragraph', has_children: true, paragraph: { rich_text: text('Do Now') } },
      { id: 't2', type: 'paragraph', has_children: false, paragraph: { rich_text: text('Teach') } }
    ], has_more: false },
    'GET /v1/blocks/t1/children': { results: [{ id: 'x', type: 'paragraph', has_children: false, paragraph: { rich_text: text('inside') } }], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  const [tabs] = (await readNotionTree(client, 'u1')).pages.u1.blocks;
  assert.equal(tabs.type, 'tabs');
  assert.deepEqual(tabs.children.map((t) => t.data.label), ['Do Now', 'Teach']);
  assert.equal(tabs.children[0].children[0].type, 'paragraph');
});

test('client retries a thrown fetch error', async () => {
  let n = 0;
  const waits = [];
  const client = createNotionClient({
    token: 't',
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async () => { if (++n === 1) throw new TypeError('fetch failed'); return json(200, { ok: true }); }
  });
  assert.deepEqual(await client.request('GET', '/v1/users/me'), { ok: true });
  assert.deepEqual(waits, [500]);
  assert.equal(client.requestCount, 2);
});

test('client rethrows a thrown fetch error after maxRetries', async () => {
  const client = createNotionClient({ token: 't', maxRetries: 1, sleep: async () => {}, fetchImpl: async () => { throw new TypeError('down'); } });
  await assert.rejects(client.request('GET', '/v1/x'), /down/);
});

test('client caps Retry-After at 30 seconds', async () => {
  let n = 0;
  const waits = [];
  const client = createNotionClient({
    token: 't',
    sleep: async (ms) => { waits.push(ms); },
    fetchImpl: async () => (++n === 1 ? json(429, {}, { 'retry-after': '600' }) : json(200, {}))
  });
  await client.request('GET', '/v1/x');
  assert.deepEqual(waits, [30000]);
});

test('client cancels the body of a response it retries', async () => {
  let cancelled = false;
  let n = 0;
  const client = createNotionClient({
    token: 't',
    sleep: async () => {},
    fetchImpl: async () => {
      if (++n === 1) return { ok: false, status: 503, headers: new Headers(), body: { cancel: async () => { cancelled = true; throw new Error('ignored'); } } };
      return json(200, {});
    }
  });
  await client.request('GET', '/v1/x');
  assert.equal(cancelled, true);
});

test('propertyItems passes an already-encoded property id through as is', async () => {
  const seen = [];
  const client = createNotionClient({
    token: 't', sleep: async () => {},
    fetchImpl: async (url) => { seen.push(new URL(url).pathname); return json(200, { results: [], has_more: false }); }
  });
  await client.propertyItems('p1', '%5EOE%40');
  assert.ok(seen[0].includes('/properties/%5EOE%40'), seen[0]);
});

test('relation with has_more fetches the property items by the encoded id', async () => {
  const body = pageBody('u1', 'U', 'Unit');
  body.properties['Sub-item'] = { id: '%5EOE%40', type: 'relation', relation: [{ id: 'l1' }], has_more: true };
  const { fetchImpl, calls } = fakeNotion({
    'GET /v1/pages/u1': body,
    'GET /v1/pages/u1/properties/%5EOE%40': { results: [{ relation: { id: 'l1' } }, { relation: { id: 'l2' } }], has_more: false },
    'GET /v1/pages/l1': pageBody('l1', 'L1', 'Lesson'),
    'GET /v1/pages/l2': pageBody('l2', 'L2', 'Lesson'),
    'GET /v1/blocks/u1/children': { results: [], has_more: false },
    'GET /v1/blocks/l1/children': { results: [], has_more: false },
    'GET /v1/blocks/l2/children': { results: [], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  const tree = await readNotionTree(client, 'u1');
  assert.deepEqual(Object.keys(tree.pages).sort(), ['l1', 'l2', 'u1']);
  assert.ok(calls.some((c) => c.includes('/properties/%5EOE%40')));
});

test('nested block that Notion will not return gets children_error', async () => {
  const { fetchImpl } = fakeNotion({
    'GET /v1/pages/u1': pageBody('u1', 'U', 'Lesson'),
    'GET /v1/blocks/u1/children': { results: [
      { id: 'b1', type: 'toggle', has_children: true, toggle: { rich_text: text('T') } },
      { id: 'b2', type: 'paragraph', has_children: false, paragraph: { rich_text: text('ok') } }
    ], has_more: false }
    // no route for b1 children: 404
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  const blocks = (await readNotionTree(client, 'u1')).pages.u1.blocks;
  assert.equal(blocks[0].children_error, 'object_not_found');
  assert.deepEqual(blocks[0].children, []);
  assert.equal(blocks[1].children_error, undefined);
});

test('nested 500-class failures still throw', async () => {
  const { fetchImpl } = fakeNotion({
    'GET /v1/pages/u1': pageBody('u1', 'U', 'Lesson'),
    'GET /v1/blocks/u1/children': { results: [{ id: 'b1', type: 'toggle', has_children: true, toggle: { rich_text: text('T') } }], has_more: false },
    'GET /v1/blocks/b1/children': () => json(401, { code: 'unauthorized', message: 'x' })
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  await assert.rejects(readNotionTree(client, 'u1'), (e) => e instanceof NotionApiError && e.code === 'unauthorized');
});

test('child page 404 is skipped and recorded as unreadable', async () => {
  const { fetchImpl } = fakeNotion({
    'GET /v1/pages/u1': pageBody('u1', 'U', 'Unit', ['l1', 'l2']),
    'GET /v1/pages/l2': pageBody('l2', 'L2', 'Lesson'),
    'GET /v1/blocks/u1/children': { results: [], has_more: false },
    'GET /v1/blocks/l2/children': { results: [], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  const tree = await readNotionTree(client, 'u1');
  assert.deepEqual(Object.keys(tree.pages).sort(), ['l2', 'u1']);
  assert.deepEqual(tree.unreadable, [{ page_id: 'l1', parent_id: 'u1', code: 'object_not_found' }]);
});

test('root page failure still throws', async () => {
  const { fetchImpl } = fakeNotion({});
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  await assert.rejects(readNotionTree(client, 'nope'), NotionApiError);
});

test('trashed or archived child pages are skipped as in_trash', async () => {
  const gone = pageBody('l1', 'L1', 'Lesson');
  gone.in_trash = true;
  const arch = pageBody('l2', 'L2', 'Lesson');
  arch.archived = true;
  const { fetchImpl } = fakeNotion({
    'GET /v1/pages/u1': pageBody('u1', 'U', 'Unit', ['l1', 'l2']),
    'GET /v1/pages/l1': gone,
    'GET /v1/pages/l2': arch,
    'GET /v1/blocks/u1/children': { results: [], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  const tree = await readNotionTree(client, 'u1');
  assert.deepEqual(Object.keys(tree.pages), ['u1']);
  assert.deepEqual(tree.unreadable.map((u) => [u.page_id, u.code]), [['l1', 'in_trash'], ['l2', 'in_trash']]);
});

test('deadline stops the read partway through', async () => {
  const { fetchImpl } = fakeNotion({
    'GET /v1/pages/u1': pageBody('u1', 'U', 'Unit', ['l1']),
    'GET /v1/pages/l1': pageBody('l1', 'L1', 'Lesson'),
    'GET /v1/blocks/u1/children': { results: [], has_more: false },
    'GET /v1/blocks/l1/children': { results: [], has_more: false }
  });
  const client = createNotionClient({ token: 't', fetchImpl, sleep: async () => {} });
  let t = 0;
  const now = () => (t += 1);
  // checks: page u1 (1), children u1 (2), page l1 (3) -> past deadline 2
  await assert.rejects(readNotionTree(client, 'u1', { deadlineMs: 2, now }), /Too much to read from Notion in one go\. Import a smaller part \(for example one unit at a time\)\./);
});

test('missing last_edited_time becomes an empty string', () => {
  const body = pageBody('u1', 'U', 'Unit');
  delete body.last_edited_time;
  assert.equal(normalizePage(body, []).last_edited_time, '');
});
