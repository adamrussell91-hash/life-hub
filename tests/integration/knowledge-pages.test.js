import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { DEFAULT_KNOWLEDGE_DATA_REPO } from '../../netlify/functions/_shared/knowledge-data.mjs';
import { createKnowledgePageHandler } from '../../netlify/functions/knowledge-page.mjs';
import { createKnowledgePagesHandler } from '../../netlify/functions/knowledge-pages.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com',
  GITHUB_TOKEN: 'knowledge-read-token',
  GITHUB_REPOSITORY: 'adamrussell91-hash/life-hub-data'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

function request({
  cookie = true,
  origin,
  url = 'https://api.adam-russell.com/api/knowledge/pages'
} = {}) {
  return new Request(url, {
    method: 'GET',
    headers: {
      ...(cookie ? { cookie: `life_hub_session=${session}` } : {}),
      ...(origin ? { origin } : {})
    }
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

test('Knowledge pages require the Life session and never load Teaching Blobs', async () => {
  let storeLoads = 0;
  const handler = createKnowledgePagesHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => {
      storeLoads += 1;
      throw new Error('Teaching Blobs must not load');
    }
  });
  const response = await handler(request({ cookie: false }));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
  assert.equal(storeLoads, 0);
});

test('Knowledge pages are 503 when the data-repo token is missing', async () => {
  const handler = createKnowledgePagesHandler({
    env: { ...env, GITHUB_TOKEN: '' },
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => {
      throw new Error('Teaching Blobs must not load');
    },
    fetchImpl: async () => {
      throw new Error('GitHub must not be called');
    }
  });
  const response = await handler(request({ origin: 'https://knowledge-hub.adam-russell.com' }));
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'knowledge_repo_unbound');
});

test('Knowledge pages list titles from knowledge-hub-data, not life-hub-data', async () => {
  const urls = [];
  const handler = createKnowledgePagesHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    getContentStore: async () => {
      throw new Error('Teaching Blobs must not load');
    },
    fetchImpl: async url => {
      urls.push(String(url));
      assert.match(String(url), new RegExp(DEFAULT_KNOWLEDGE_DATA_REPO));
      assert.doesNotMatch(String(url), /life-hub-data/);
      return jsonResponse({
        sha: 'a'.repeat(40),
        encoding: 'base64',
        content: Buffer.from(JSON.stringify([
          { id: 'note-1', title: 'Archive note', path: 'pages/note-1.json' }
        ])).toString('base64')
      });
    }
  });
  const response = await handler(request({ origin: 'https://knowledge-hub.adam-russell.com' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data[0].title, 'Archive note');
  assert.equal(urls.length, 1);
});

test('Knowledge page GET uses the Life session and returns page JSON', async () => {
  const handler = createKnowledgePageHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    fetchImpl: async url => {
      assert.match(String(url), /knowledge-hub-data\/contents\/pages\/note-1\.json/);
      return jsonResponse({
        sha: 'b'.repeat(40),
        encoding: 'base64',
        content: Buffer.from(JSON.stringify({ id: 'note-1', title: 'Archive note', body: 'Hello' })).toString('base64')
      });
    }
  });
  const response = await handler(
    request({ url: 'https://api.adam-russell.com/api/knowledge/pages/note-1' })
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.title, 'Archive note');
});

test('Knowledge handlers never read GITHUB_REPOSITORY', async () => {
  const files = [
    'netlify/functions/_shared/knowledge-data.mjs',
    'netlify/functions/knowledge-pages.mjs',
    'netlify/functions/knowledge-page.mjs'
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?<!KNOWLEDGE_)GITHUB_REPOSITORY/);
    assert.doesNotMatch(source, /life-hub-data/);
    assert.doesNotMatch(source, /@netlify\/blobs/);
  }
});
