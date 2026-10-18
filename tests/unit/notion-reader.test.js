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
