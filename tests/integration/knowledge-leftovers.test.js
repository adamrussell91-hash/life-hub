import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createKnowledgeCuratorHandler } from '../../netlify/functions/knowledge-curator.mjs';
import { createKnowledgePodcastHandler } from '../../netlify/functions/knowledge-podcast.mjs';
import { createKnowledgeTidyHandler } from '../../netlify/functions/knowledge-tidy.mjs';
import { createLessonAlchemistHandler } from '../../netlify/functions/lesson-alchemist.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com',
  GITHUB_TOKEN: 'knowledge-read-token',
  GITHUB_REPOSITORY: 'adamrussell91-hash/life-hub-data',
  ANTHROPIC_API_KEY: 'anthropic-test',
  RESEARCH_KERNEL_SHARED_SECRET: 'kernel-secret',
  RESEARCH_KERNEL_URL: 'https://knowledge-hub-research.example',
  R2_ACCOUNT_ID: 'acct',
  R2_BUCKET: 'knowledge-hub-archive',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  ALCHEMIST_SHARED_SECRET: 'alchem-secret'
};
const session = createSessionToken({
  now: Date.parse('2026-08-01T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;
const now = () => Date.parse('2026-08-01T01:00:00Z');
const cwd = fileURLToPath(new URL('../..', import.meta.url));

function authed(url, init = {}) {
  return new Request(url, {
    ...init,
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://knowledge-hub.adam-russell.com',
      ...(init.headers ?? {})
    }
  });
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

function memoryGithub(initial = {}) {
  const files = new Map(Object.entries(initial));
  return async (url, init = {}) => {
    if (String(url).includes('anthropic.com')) {
      return jsonResponse({
        content: [{
          type: 'text',
          text: JSON.stringify({
            tags: ['Learning Science and Cognition'],
            title: null,
            body: 'Miller seven plus or minus two.'
          })
        }]
      });
    }
    if (String(url).includes('actions/workflows/curator.yml/dispatches')) {
      return new Response(null, { status: 204 });
    }
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

const pageA = {
  id: 'a',
  title: 'A',
  area: 'notes',
  tags: [],
  body: 'Body',
  connected: [],
  attachments: [],
  created_at: '2026-08-15T00:00:00.000Z',
  updated_at: '2026-08-15T00:00:00.000Z',
  schema_version: 1
};

test('Knowledge leftovers require the Life session and never load Teaching Blobs', async () => {
  let storeLoads = 0;
  const deps = {
    env,
    now,
    getContentStore: async () => {
      storeLoads += 1;
      throw new Error('Teaching Blobs must not load');
    }
  };
  const response = await createKnowledgeTidyHandler(deps)(new Request(
    'https://api.adam-russell.com/api/knowledge/tidy',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
  ));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'unauthenticated');
  assert.equal(storeLoads, 0);
});

test('Tidy rewrites a page on knowledge-hub-data behind the Life session', async () => {
  const handler = createKnowledgeTidyHandler({
    env,
    now,
    cwd,
    fetchImpl: memoryGithub({
      'pages/note-1.json': { sha: 'p1', text: JSON.stringify({ ...pageA, id: 'note-1', title: 'Old title' }) },
      'manifest.json': { sha: 'm1', text: JSON.stringify([{ id: 'note-1', title: 'Old title' }]) }
    })
  });
  const response = await handler(authed('https://api.adam-russell.com/api/knowledge/tidy', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'note-1' })
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.id, 'note-1');
  assert.match(body.data.body, /Miller/);
  assert.ok(body.data.tags.includes('Learning Science and Cognition'));
});

test('Curator lists pending and can queue a run without Teaching Blobs', async () => {
  const proposal = {
    id: 'a||b',
    noteA: 'a',
    noteB: 'b',
    titleA: 'A',
    titleB: 'B',
    excerptA: 'ea',
    excerptB: 'eb',
    relation: 'related',
    rationale: 'same thread',
    proposedAt: '2026-08-15T00:00:00.000Z'
  };
  const files = {
    '_curator/pending-proposals.json': { sha: 'p', text: JSON.stringify([proposal]) },
    '_curator/dismissed.json': { sha: 'd', text: '[]' },
    'pages/a.json': { sha: 'a1', text: JSON.stringify(pageA) },
    'pages/b.json': { sha: 'b1', text: JSON.stringify({ ...pageA, id: 'b', title: 'B' }) }
  };
  const listed = await createKnowledgeCuratorHandler({
    env,
    now,
    fetchImpl: memoryGithub(files)
  })(authed('https://api.adam-russell.com/api/knowledge/curator'));
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).data.pending[0].id, 'a||b');

  const approved = await createKnowledgeCuratorHandler({
    env,
    now,
    nowIso: () => '2026-09-04T00:00:00.000Z',
    fetchImpl: memoryGithub(files)
  })(authed('https://api.adam-russell.com/api/knowledge/curator', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'approve', id: 'a||b' })
  }));
  assert.equal(approved.status, 200);
  assert.deepEqual((await approved.json()).data.pending, []);

  const urls = [];
  const queued = await createKnowledgeCuratorHandler({
    env,
    now,
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      return memoryGithub(files)(url, init);
    }
  })(authed('https://api.adam-russell.com/api/knowledge/curator', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'run' })
  }));
  assert.equal(queued.status, 200);
  assert.equal((await queued.json()).data.status, 'queued');
  assert.ok(urls.some(url => url.includes('knowledge-hub/actions/workflows/curator.yml/dispatches')));
});

test('Podcast start and audio sign stay on the research Worker and R2', async () => {
  const urls = [];
  const started = await createKnowledgePodcastHandler({
    env,
    now,
    fetchImpl: async (url, init) => {
      urls.push(String(url));
      assert.equal(init.headers['x-research-kernel-secret'], 'kernel-secret');
      return jsonResponse({ id: 'ep-1', status: 'running' });
    }
  })(authed('https://api.adam-russell.com/api/knowledge/podcast/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'recap' })
  }));
  assert.equal(started.status, 200);
  const startedBody = await started.json();
  assert.equal(startedBody.data.id, 'ep-1');
  assert.ok(urls[0].endsWith('/podcast/start'));
  assert.ok(!JSON.stringify(startedBody).includes('kernel-secret'));

  const audio = await createKnowledgePodcastHandler({
    env,
    now,
    fetchImpl: async () => jsonResponse({
      id: 'ep-1',
      turns: [{ id: 't1', audioKey: 'podcast/audio/ep-1/t1' }]
    }),
    signGet: async ({ key, bucket }) => {
      assert.equal(bucket, 'knowledge-hub-archive');
      assert.equal(key, 'podcast/audio/ep-1/t1');
      return 'https://r2.example/audio';
    }
  })(authed('https://api.adam-russell.com/api/knowledge/podcast/ep-1/audio/t1'));
  assert.equal(audio.status, 200);
  assert.equal((await audio.json()).data.url, 'https://r2.example/audio');
});

test('Lesson alchemist stays secret-gated and returns raw Teaching JSON', async () => {
  const denied = await createLessonAlchemistHandler({ env, cwd })(new Request(
    'https://api.adam-russell.com/api/lesson-alchemist',
    {
      method: 'POST',
      headers: { origin: 'https://teaching-hub.adam-russell.com', 'content-type': 'application/json' },
      body: JSON.stringify({ lessonText: 'working memory' })
    }
  ));
  assert.equal(denied.status, 401);

  const handler = createLessonAlchemistHandler({
    env,
    cwd,
    fetchImpl: memoryGithub({
      'manifest.json': {
        sha: 'm1',
        text: JSON.stringify([{ id: 'note-1', title: 'Working memory', excerpt: 'Miller', tags: [] }])
      }
    }),
    complete: async () => JSON.stringify([{
      sourcePageId: 'note-1',
      summary: 'Load',
      icon: 'Rules',
      sourcePageTitle: 'Working memory',
      sourceExcerpt: 'Miller',
      whyNonObvious: 'Archive bridge'
    }])
  });
  const response = await handler(new Request('https://api.adam-russell.com/api/lesson-alchemist', {
    method: 'POST',
    headers: {
      origin: 'https://teaching-hub.adam-russell.com',
      'content-type': 'application/json',
      'x-alchemist-secret': 'alchem-secret'
    },
    body: JSON.stringify({ lessonText: 'working memory in year 11' })
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, undefined);
  assert.equal(body.mode, 'synthesis');
  assert.equal(body.connections[0].sourcePageId, 'note-1');
});

test('Leftover sources never read GITHUB_REPOSITORY or bind Blobs', async () => {
  const files = [
    'netlify/functions/knowledge-tidy.mjs',
    'netlify/functions/knowledge-curator.mjs',
    'netlify/functions/knowledge-podcast.mjs',
    'netlify/functions/knowledge-podcast-path.mjs',
    'netlify/functions/lesson-alchemist.mjs',
    'netlify/functions/_shared/knowledge-tidy.mjs',
    'netlify/functions/_shared/knowledge-curator.mjs',
    'netlify/functions/_shared/knowledge-podcast.mjs',
    'netlify/functions/_shared/knowledge-alchemist.mjs'
  ];
  for (const file of files) {
    const source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /(?<!KNOWLEDGE_)GITHUB_REPOSITORY/);
    assert.doesNotMatch(source, /life-hub-data/);
    assert.doesNotMatch(source, /@netlify\/blobs/);
    assert.doesNotMatch(source, /KNOWLEDGE_HUB_PASSPHRASE_HASH/);
  }
});
