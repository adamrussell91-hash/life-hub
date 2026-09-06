import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  URL_WATCHES_PATH,
  checkWatchedUrl,
  defaultLoadAllUrlWatches,
  defaultLoadUrlWatches,
  extractWatchUrls,
  fingerprintText,
  normalizeUrlWatchStatus,
  parseUrlWatchStore
} from '../../netlify/functions/_shared/url-watch.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const knowledgeSeed = JSON.parse(
  readFileSync(join(root, 'apps/knowledge/fixtures/seed.json'), 'utf8')
);

test('extractWatchUrls keeps external http(s) links and skips hub hosts', () => {
  const body = [
    'See https://example.com/policy, and https://example.com/policy again.',
    'Ignore https://knowledge-hub.adam-russell.com/#page/x',
    'Also http://notes.example.org/a).'
  ].join('\n');
  assert.deepEqual(extractWatchUrls(body), [
    'https://example.com/policy',
    'http://notes.example.org/a'
  ]);
});

test('extractWatchUrls is empty when the body has no external URL', () => {
  assert.deepEqual(extractWatchUrls('# Static note\n\n{{life:compare_workout_windows}}'), []);
  assert.deepEqual(extractWatchUrls(''), []);
});

test('seed pages expose one real external URL for URL watch', () => {
  const aotfw = knowledgeSeed.find(item => item.id === 'page_aotfw');
  const pulse = knowledgeSeed.find(item => item.id === 'page_training_pulse');
  assert.deepEqual(extractWatchUrls(aotfw.body), [
    'https://en.wikipedia.org/wiki/An_Artist_of_the_Floating_World'
  ]);
  assert.deepEqual(extractWatchUrls(pulse.body), [
    'https://www.who.int/news-room/fact-sheets/detail/physical-activity'
  ]);
});

test('checkWatchedUrl treats If-None-Match 304 as unchanged', async () => {
  const calls = [];
  const result = await checkWatchedUrl({
    url: 'https://example.com/policy',
    previous: { etag: '"v1"', fingerprint: 'abc' },
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), headers: init.headers });
      return new Response(null, { status: 304 });
    }
  });
  assert.equal(result.status, 'unchanged');
  assert.equal(result.fingerprint, 'abc');
  assert.equal(calls[0].headers['if-none-match'], '"v1"');
});

test('checkWatchedUrl is changed when the body fingerprint moves', async () => {
  const first = fingerprintText('old policy');
  const result = await checkWatchedUrl({
    url: 'https://example.com/policy',
    previous: { fingerprint: first },
    fetchImpl: async () => new Response('new policy', {
      status: 200,
      headers: { etag: '"v2"' }
    })
  });
  assert.equal(result.status, 'changed');
  assert.equal(result.etag, '"v2"');
  assert.equal(result.fingerprint, fingerprintText('new policy'));
});

test('checkWatchedUrl is unavailable when fetch fails and Firecrawl is absent', async () => {
  const result = await checkWatchedUrl({
    url: 'https://example.com/down',
    fetchImpl: async () => {
      throw new Error('network down');
    }
  });
  assert.equal(result.status, 'unavailable');
});

test('checkWatchedUrl uses Firecrawl only after fetch fails, never as a search guess', async () => {
  const calls = [];
  const result = await checkWatchedUrl({
    url: 'https://example.com/spa',
    previous: { fingerprint: fingerprintText('old') },
    firecrawlKey: 'fc-test',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? 'GET' });
      if (String(url).includes('firecrawl.dev')) {
        return Response.json({ data: { markdown: 'new spa body' } });
      }
      return new Response('blocked', { status: 403 });
    }
  });
  assert.equal(result.status, 'changed');
  assert.equal(calls[0].url, 'https://example.com/spa');
  assert.ok(calls.some(item => item.url.includes('firecrawl.dev') && item.method === 'POST'));
});

test('parseUrlWatchStore drops junk rows and keeps a last-seen fingerprint', () => {
  const store = parseUrlWatchStore({
    watches: [
      { url: 'https://example.com/a', etag: '"e"', fingerprint: 'fff', status: 'changed' },
      { url: 'not-a-url', fingerprint: 'x' },
      null
    ]
  });
  assert.equal(store.watches.length, 1);
  assert.equal(store.watches[0].fingerprint, 'fff');
});

test('normalizeUrlWatchStatus is fail-visible for a loader miss', () => {
  assert.deepEqual(normalizeUrlWatchStatus({ watches: [], status: 'unavailable' }), {
    watches: [],
    status: 'unavailable'
  });
});

test('defaultLoadUrlWatches polls extracted URLs and stores the fingerprint', async () => {
  const writes = [];
  const result = await defaultLoadUrlWatches({
    env: { GITHUB_REPOSITORY: 'life-owner/life-repo', GITHUB_TOKEN: 't', GITHUB_TOKEN_EXPIRES: '2026-09-01' },
    page: { id: 'page_policy', body: 'Read https://example.com/policy' },
    nowIso: () => '2026-09-06T00:00:00.000Z',
    client: {
      resolveTree: async () => ({ tree: [], commitSha: 'c', treeSha: 't' }),
      writeFile: async payload => {
        writes.push(payload);
        return { sha: 'w' };
      }
    },
    fetchImpl: async url => {
      assert.equal(String(url), 'https://example.com/policy');
      return new Response('policy body', { status: 200, headers: { etag: '"p1"' } });
    }
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.watches[0].status, 'unchanged');
  assert.equal(result.watches[0].fingerprint, fingerprintText('policy body'));
  assert.equal(writes[0].path, URL_WATCHES_PATH);
  const stored = JSON.parse(writes[0].content);
  assert.equal(stored.watches[0].page_id, 'page_policy');
});

test('defaultLoadAllUrlWatches is unavailable when Life GitHub is missing', async () => {
  const loaded = await defaultLoadAllUrlWatches({
    env: {},
    fetchImpl: async () => {
      throw new Error('GitHub must not be called');
    }
  });
  assert.deepEqual(loaded, { watches: [], status: 'unavailable' });
});
