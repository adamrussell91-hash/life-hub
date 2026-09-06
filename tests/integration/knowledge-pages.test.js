import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { DEFAULT_KNOWLEDGE_DATA_REPO } from '../../netlify/functions/_shared/knowledge-data.mjs';
import { createKnowledgePageHandler } from '../../netlify/functions/knowledge-page.mjs';
import { createKnowledgePagesHandler } from '../../netlify/functions/knowledge-pages.mjs';
import { createKnowledgeQuizHandler } from '../../netlify/functions/knowledge-quiz.mjs';
import { createKnowledgeSearchHandler } from '../../netlify/functions/knowledge-search.mjs';

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
  assert.ok(urls.length >= 1);
  assert.ok(urls.every(url => url.includes(DEFAULT_KNOWLEDGE_DATA_REPO)));
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
    'netlify/functions/knowledge-page.mjs',
    'netlify/functions/knowledge-search.mjs',
    'netlify/functions/knowledge-quiz.mjs',
    'netlify/functions/knowledge-quiz-items.mjs',
    'netlify/functions/knowledge-pages-save.mjs',
    'netlify/functions/knowledge-quiz-save.mjs',
    'netlify/functions/knowledge-quiz-items-path.mjs'
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?<!KNOWLEDGE_)GITHUB_REPOSITORY/);
    assert.doesNotMatch(source, /life-hub-data/);
    assert.doesNotMatch(source, /@netlify\/blobs/);
  }
});

function memoryGithub(initial = {}) {
  const files = new Map(Object.entries(initial));
  return async (url, init = {}) => {
    const path = decodeURIComponent(String(url).split('/contents/')[1] ?? '');
    if ((init.method ?? 'GET') === 'GET') {
      const current = files.get(path);
      if (!current) return new Response('missing', { status: 404 });
      return jsonResponse({
        sha: current.sha,
        encoding: 'base64',
        content: Buffer.from(current.text).toString('base64')
      });
    }
    const body = JSON.parse(init.body);
    files.set(path, { sha: 'sha2', text: Buffer.from(body.content, 'base64').toString('utf8') });
    return jsonResponse({ content: { sha: 'sha2' } });
  };
}

test('Knowledge page save writes page JSON and upserts the manifest', async () => {
  const handler = createKnowledgePagesHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    fetchImpl: memoryGithub({
      'manifest.json': { sha: 'man1', text: '[]' }
    })
  });
  const response = await handler(new Request('https://api.adam-russell.com/api/knowledge/pages', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://knowledge-hub.adam-russell.com',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ title: 'New note', body: 'Hello', area: 'notes' })
  }));
  assert.equal(response.status, 200);
  const saved = (await response.json()).data;
  assert.equal(saved.title, 'New note');
  assert.match(saved.id, /^page_hub_/);
});

test('Knowledge search ranks manifest titles behind the Life session', async () => {
  const handler = createKnowledgeSearchHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    fetchImpl: async () => jsonResponse({
      sha: 'a'.repeat(40),
      encoding: 'base64',
      content: Buffer.from(JSON.stringify([
        { id: 'note-1', title: 'Working memory', excerpt: 'Miller', tags: ['psych'] }
      ])).toString('base64')
    })
  });
  const response = await handler(new Request('https://api.adam-russell.com/api/knowledge/search?q=memory', {
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://knowledge-hub.adam-russell.com'
    }
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.hits[0].id, 'note-1');
});

test('Knowledge quiz GET and POST stay on knowledge-hub-data', async () => {
  const fetchImpl = memoryGithub({
    'quiz/schedule.json': {
      sha: 'q1',
      text: JSON.stringify({ schema_version: 1, schedule: [], edges: [], dumps: [] })
    }
  });
  const handler = createKnowledgeQuizHandler({
    env,
    now: () => Date.parse('2026-08-01T01:00:00Z'),
    fetchImpl
  });
  const listed = await handler(new Request('https://api.adam-russell.com/api/knowledge/quiz', {
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://knowledge-hub.adam-russell.com'
    }
  }));
  assert.equal(listed.status, 200);
  const saved = await handler(new Request('https://api.adam-russell.com/api/knowledge/quiz', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://knowledge-hub.adam-russell.com',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      schedule: [{ page_id: 'note-1' }],
      items: [{ page_id: 'note-1', prompt: 'What is working memory?' }],
      page_reviews: [{ page_id: 'note-1', title: 'Working memory' }]
    })
  }));
  assert.equal(saved.status, 200);
  const payload = await saved.json();
  assert.equal(payload.data.schedule[0].page_id, 'note-1');
  assert.equal(payload.data.page_reviews[0].page_id, 'note-1');
});

