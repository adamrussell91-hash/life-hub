import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listKnowledgePages,
  saveKnowledgePage,
  unwrapGithubFileText
} from '../../netlify/functions/_shared/knowledge-data.mjs';

function memoryGithub(initial = {}) {
  const files = new Map(Object.entries(initial));
  const fetchImpl = async (url, init = {}) => {
    const path = decodeURIComponent(String(url).split('/contents/')[1] ?? '');
    if ((init.method ?? 'GET') === 'GET') {
      const current = files.get(path);
      if (!current) return new Response('missing', { status: 404 });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          sha: current.sha,
          encoding: 'base64',
          content: Buffer.from(current.text).toString('base64'),
          size: Buffer.byteLength(current.text)
        })
      };
    }
    const body = JSON.parse(init.body);
    const text = Buffer.from(body.content, 'base64').toString('utf8');
    files.set(path, { sha: 'sha2', text });
    return { ok: true, status: 200, json: async () => ({ content: { sha: 'sha2' } }) };
  };
  return { files, fetchImpl };
}

test('unwraps a GitHub blob wrapper so a large manifest is not treated as empty', () => {
  const inner = JSON.stringify([{ id: 'note-1', title: 'Archive note' }]);
  const wrapper = JSON.stringify({
    sha: 'a'.repeat(40),
    encoding: 'base64',
    content: Buffer.from(inner).toString('base64')
  });
  assert.equal(unwrapGithubFileText({ encoding: 'utf-8', content: '' }, wrapper), inner);
});

function githubContents(path, body, sha = 'sha1') {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    sha,
    encoding: 'base64',
    content: Buffer.from(text).toString('base64'),
    size: Buffer.byteLength(text)
  };
}

test('listKnowledgePages recovers a wiped manifest from git history', async () => {
  const full = Array.from({ length: 8 }, (_, i) => ({
    id: `note-${i + 1}`,
    title: `Note ${i + 1}`
  }));
  const urls = [];
  const fetchImpl = async url => {
    urls.push(String(url));
    const href = String(url);
    if (href.endsWith('/repos/adamrussell91-hash/knowledge-hub-data')) {
      return Response.json({ default_branch: 'main' });
    }
    if (href.includes('/git/trees/')) {
      return Response.json({
        tree: full.map(row => ({ path: `pages/${row.id}.json`, type: 'blob' }))
      });
    }
    if (href.includes('/commits?')) {
      return Response.json([{ sha: 'oldsha' }, { sha: 'newsha' }]);
    }
    if (href.includes('manifest.json?ref=oldsha')) {
      return Response.json(githubContents('manifest.json', full, 'oldsha'));
    }
    if (href.includes('/contents/manifest.json')) {
      return Response.json(githubContents('manifest.json', full.slice(0, 2)));
    }
    return new Response('missing', { status: 404 });
  };

  const pages = await listKnowledgePages({
    env: { GITHUB_TOKEN: 'token' },
    fetchImpl
  });
  assert.equal(pages.length, 8);
  assert.equal(pages[0].title, 'Note 1');
  assert.ok(urls.some(url => url.includes('/commits?')));
});

test('listKnowledgePages trusts a healthy manifest and skips the git tree', async () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({
    id: `note-${i + 1}`,
    title: `Note ${i + 1}`
  }));
  const urls = [];
  const pages = await listKnowledgePages({
    env: { GITHUB_TOKEN: 'token' },
    fetchImpl: async url => {
      urls.push(String(url));
      if (String(url).includes('/contents/manifest.json')) {
        return Response.json(githubContents('manifest.json', rows));
      }
      throw new Error(`unexpected GitHub call ${url}`);
    }
  });
  assert.equal(pages.length, 51);
  assert.equal(urls.length, 1);
});

test('saveKnowledgePage refuses to overwrite an unreadable manifest', async () => {
  await assert.rejects(
    () => saveKnowledgePage(
      { title: 'New note', body: 'Hi' },
      {
        env: { GITHUB_TOKEN: 'token' },
        fetchImpl: async (url, init = {}) => {
          if ((init.method ?? 'GET') === 'PUT') {
            return Response.json({ content: { sha: 'new' } });
          }
          if (String(url).includes('pages/')) {
            return new Response('missing', { status: 404 });
          }
          return Response.json({
            sha: 'broken',
            encoding: 'base64',
            content: Buffer.from('not-json').toString('base64'),
            size: 8
          });
        }
      }
    ),
    error => error.status === 502 && /unreadable/.test(error.message)
  );
});

test('saveKnowledgePage keeps Teaching and Tasks refs on connected', async () => {
  const { files, fetchImpl } = memoryGithub({
    'manifest.json': { sha: 'man1', text: '[]' }
  });
  const saved = await saveKnowledgePage(
    {
      id: 'page_aotfw',
      title: 'Artist of the Floating World — sources',
      body: 'Ishiguro',
      area: 'university',
      connected: ['teaching:unit:unit_aotfw', 'tasks:project:proj_aotfw', 'knowledge:page:page_aotfw']
    },
    {
      env: { GITHUB_TOKEN: 'token' },
      fetchImpl,
      nowIso: () => '2026-01-15T09:00:00.000Z'
    }
  );
  assert.deepEqual(saved.connected, ['teaching:unit:unit_aotfw', 'tasks:project:proj_aotfw', 'page_aotfw']);
  const stored = JSON.parse(files.get('pages/page_aotfw.json').text);
  assert.deepEqual(stored.connected, saved.connected);
});

test('saveKnowledgePage rejects an invalid connected ref', async () => {
  await assert.rejects(
    () => saveKnowledgePage(
      { title: 'Broken', connected: ['life://diary/x'] },
      {
        env: { GITHUB_TOKEN: 'token' },
        fetchImpl: async () => {
          throw new Error('GitHub must not be called');
        }
      }
    ),
    error => error.status === 400 && /Invalid connected ref/.test(error.message)
  );
});
