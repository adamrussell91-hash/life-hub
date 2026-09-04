import test from 'node:test';
import assert from 'node:assert/strict';
import {
  listKnowledgePages,
  saveKnowledgePage,
  unwrapGithubFileText
} from '../../netlify/functions/_shared/knowledge-data.mjs';

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
