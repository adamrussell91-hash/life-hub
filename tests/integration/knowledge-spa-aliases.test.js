import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createKnowledgeAuthLoginHandler } from '../../netlify/functions/knowledge-auth-login.mjs';
import { createKnowledgeAuthLogoutHandler } from '../../netlify/functions/knowledge-auth-logout.mjs';
import { createKnowledgeAuthSessionHandler } from '../../netlify/functions/knowledge-auth-session.mjs';
import { createKnowledgePagesSaveHandler } from '../../netlify/functions/knowledge-pages-save.mjs';
import { createKnowledgeQuizItemsPathHandler } from '../../netlify/functions/knowledge-quiz-items-path.mjs';
import { createKnowledgeQuizSaveHandler } from '../../netlify/functions/knowledge-quiz-save.mjs';

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
const now = () => Date.parse('2026-08-01T01:00:00Z');

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

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

test('Knowledge SPA aliases require the Life session and never load Teaching Blobs', async () => {
  let storeLoads = 0;
  const deps = {
    env,
    now,
    getContentStore: async () => {
      storeLoads += 1;
      throw new Error('Teaching Blobs must not load');
    }
  };
  const response = await createKnowledgePagesSaveHandler(deps)(new Request(
    'https://api.adam-russell.com/api/knowledge/pages-save',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
  ));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
  assert.equal(storeLoads, 0);
});

test('Knowledge pages-save writes through the Life session from the Pages origin', async () => {
  const handler = createKnowledgePagesSaveHandler({
    env,
    now,
    fetchImpl: memoryGithub({ 'manifest.json': { sha: 'man1', text: '[]' } })
  });
  const response = await handler(new Request('https://api.adam-russell.com/api/knowledge/pages-save', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://knowledge-hub.adam-russell.com',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ title: 'Alias note', body: 'Hello', area: 'notes' })
  }));
  assert.equal(response.status, 200);
  const saved = (await response.json()).data;
  assert.equal(saved.title, 'Alias note');
  assert.match(saved.id, /^page_hub_/);
});

test('Knowledge quiz-save and quiz/items stay on knowledge-hub-data', async () => {
  const fetchImpl = memoryGithub({
    'quiz/schedule.json': {
      sha: 'q1',
      text: JSON.stringify({ schema_version: 1, schedule: [], edges: [], dumps: [] })
    },
    'quiz/items/note-1.json': {
      sha: 'i1',
      text: JSON.stringify({ items: [{ page_id: 'note-1', prompt: 'What is working memory?' }] })
    }
  });
  const saved = await createKnowledgeQuizSaveHandler({ env, now, fetchImpl })(new Request(
    'https://api.adam-russell.com/api/knowledge/quiz-save',
    {
      method: 'POST',
      headers: {
        cookie: `life_hub_session=${session}`,
        origin: 'https://knowledge-hub.adam-russell.com',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        schedule: [{ page_id: 'note-1' }],
        items: [{ page_id: 'note-1', prompt: 'What is working memory?' }]
      })
    }
  ));
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).data.schedule[0].page_id, 'note-1');

  const items = await createKnowledgeQuizItemsPathHandler({ env, now, fetchImpl })(new Request(
    'https://api.adam-russell.com/api/knowledge/quiz/items/note-1',
    {
      headers: {
        cookie: `life_hub_session=${session}`,
        origin: 'https://knowledge-hub.adam-russell.com'
      }
    }
  ));
  assert.equal(items.status, 200);
  assert.equal((await items.json()).data.items[0].page_id, 'note-1');
});

test('Knowledge auth aliases use the Life passphrase and cookie', async () => {
  const login = createKnowledgeAuthLoginHandler({
    env,
    verifyPassphrase: async value => value === 'accepted',
    now: () => Date.parse('2026-08-01T00:00:00Z'),
    randomBytes: () => Buffer.alloc(16, 1)
  });
  const signedIn = await login(new Request('https://api.adam-russell.com/api/knowledge/auth-login', {
    method: 'POST',
    headers: {
      origin: 'https://knowledge-hub.adam-russell.com',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ passphrase: 'accepted' })
  }));
  assert.equal(signedIn.status, 200);
  const cookie = signedIn.headers.get('set-cookie');
  assert.match(cookie, /life_hub_session=/);
  assert.match(cookie, /HttpOnly/);

  const sessionHandler = createKnowledgeAuthSessionHandler({
    env,
    now: () => Date.parse('2026-08-01T00:00:01Z')
  });
  const checked = await sessionHandler(new Request(
    'https://api.adam-russell.com/api/knowledge/auth-session',
    {
      headers: {
        origin: 'https://knowledge-hub.adam-russell.com',
        cookie: cookie.split(';', 1)[0]
      }
    }
  ));
  const body = await checked.json();
  assert.equal(checked.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.authenticated, true);

  const logout = await createKnowledgeAuthLogoutHandler({ env })(new Request(
    'https://api.adam-russell.com/api/knowledge/auth-logout',
    {
      method: 'POST',
      headers: { origin: 'https://knowledge-hub.adam-russell.com' }
    }
  ));
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /life_hub_session=/);
});

test('Knowledge SPA alias sources never read GITHUB_REPOSITORY or Teaching Blobs', async () => {
  const files = [
    'netlify/functions/knowledge-pages-save.mjs',
    'netlify/functions/knowledge-quiz-save.mjs',
    'netlify/functions/knowledge-quiz-items-path.mjs',
    'netlify/functions/knowledge-auth-session.mjs',
    'netlify/functions/knowledge-auth-login.mjs',
    'netlify/functions/knowledge-auth-logout.mjs'
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?<!KNOWLEDGE_)GITHUB_REPOSITORY/);
    assert.doesNotMatch(source, /life-hub-data/);
    assert.doesNotMatch(source, /@netlify\/blobs/);
    assert.doesNotMatch(source, /KNOWLEDGE_HUB_PASSPHRASE_HASH/);
  }
});
