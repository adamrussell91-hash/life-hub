import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStudioOp, parseStudioText, STUDIO_FILE, writeStudioOp } from '../../netlify/functions/_shared/knowledge-studio.mjs';
import { createKnowledgeStudioHandler } from '../../netlify/functions/knowledge-studio.mjs';

const NOW = '2026-10-08T09:00:00.000Z';

function seed() {
  return {
    schema_version: 1,
    books: [{
      id: 'missed',
      title: 'Brilliance Missed',
      short: 'Brilliance Missed',
      area: 'series',
      added: '2025-10-20',
      kind: 'chapters',
      stage: 'Just an Idea',
      notes: ['page_a'],
      parts: [{ name: 'One', chapters: [{ title: 'Invisible', notes: [] }, { title: 'Why', notes: ['page_a'] }] }]
    }],
    notes: { page_a: { title: 'A', words: 10, in_knowledge: true } },
    decisions: {}
  };
}

function memoryGithub(initial = {}) {
  const files = new Map(Object.entries(initial));
  let collide = 0;
  const fetchImpl = async (url, init = {}) => {
    const path = decodeURIComponent(String(url).split('/contents/')[1] ?? '');
    if ((init.method ?? 'GET') === 'GET') {
      const current = files.get(path);
      if (!current) return new Response('missing', { status: 404 });
      return {
        ok: true,
        status: 200,
        json: async () => ({ sha: current.sha, encoding: 'base64', content: Buffer.from(current.text).toString('base64'), size: Buffer.byteLength(current.text) })
      };
    }
    if (collide > 0) {
      collide -= 1;
      return new Response('conflict', { status: 409 });
    }
    const body = JSON.parse(init.body);
    files.set(path, { sha: `sha${files.size + 2}`, text: Buffer.from(body.content, 'base64').toString('utf8'), message: body.message });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return { files, fetchImpl, collideNext: n => { collide = n; } };
}

test('Studio ops move stages, add ideas, link notes and record decisions', () => {
  let doc = applyStudioOp(seed(), { op: 'stage', bookId: 'missed', stage: 'Researching' });
  assert.equal(doc.books[0].stage, 'Researching');

  doc = applyStudioOp(doc, { op: 'idea', title: '  The Feedback   Illusion ' }, { now: NOW });
  assert.equal(doc.books[1].id, 'the-feedback-illusion');
  assert.equal(doc.books[1].title, 'The Feedback Illusion');
  assert.equal(doc.books[1].added, '2026-10-08');
  doc = applyStudioOp(doc, { op: 'idea', title: 'The Feedback Illusion' }, { now: NOW });
  assert.equal(doc.books[2].id, 'the-feedback-illusion-2');

  doc = applyStudioOp(doc, { op: 'link', bookId: 'missed', chapter: 0, ref: 'page_b', title: 'B', words: 420 });
  assert.deepEqual(doc.books[0].parts[0].chapters[0].notes, ['page_b']);
  assert.ok(doc.books[0].notes.includes('page_b'));
  assert.deepEqual(doc.notes.page_b, { title: 'B', words: 420, in_knowledge: true });
  doc = applyStudioOp(doc, { op: 'link', bookId: 'missed', chapter: 0, ref: 'page_b', title: 'B', words: 420 });
  assert.equal(doc.books[0].parts[0].chapters[0].notes.length, 1);
  doc = applyStudioOp(doc, { op: 'unlink', bookId: 'missed', chapter: 0, ref: 'page_b' });
  assert.deepEqual(doc.books[0].parts[0].chapters[0].notes, []);

  doc = applyStudioOp(doc, { op: 'decide', insightId: 'merge:cibt:ts', choice: 'fold' }, { now: NOW });
  assert.deepEqual(doc.decisions['merge:cibt:ts'], { choice: 'fold', at: NOW });
});

test('Studio ops reject bad input without touching the document', () => {
  const doc = seed();
  assert.throws(() => applyStudioOp(doc, { op: 'stage', bookId: 'missed', stage: 'Done' }), /Stage must be/);
  assert.throws(() => applyStudioOp(doc, { op: 'stage', bookId: 'nope', stage: 'Writing' }), /not on the shelf/);
  assert.throws(() => applyStudioOp(doc, { op: 'link', bookId: 'missed', chapter: 9, ref: 'page_b', title: 'B' }), /chapter does not exist/);
  assert.throws(() => applyStudioOp(doc, { op: 'link', bookId: 'missed', chapter: 0, ref: '../etc', title: 'B' }), /valid note id/);
  assert.throws(() => applyStudioOp(doc, { op: 'idea', title: '   ' }), /working title/);
  assert.throws(() => applyStudioOp(doc, { op: 'explode' }), /op must be/);
  assert.equal(doc.books[0].stage, 'Just an Idea');
});

test('Studio data parsing tolerates an empty file and rejects a broken one', () => {
  assert.deepEqual(parseStudioText(''), { schema_version: 1, books: [], notes: {}, decisions: {} });
  assert.throws(() => parseStudioText('{'), /not valid JSON/);
  assert.throws(() => parseStudioText('{"books":3}'), /expected shape/);
});

test('Studio writes go to the data repo and retry once on a collision', async () => {
  const github = memoryGithub({ [STUDIO_FILE]: { sha: 'sha1', text: JSON.stringify(seed()) } });
  github.collideNext(1);
  const next = await writeStudioOp({ op: 'stage', bookId: 'missed', stage: 'Outlining' }, { env: { GITHUB_TOKEN: 't' }, fetchImpl: github.fetchImpl });
  assert.equal(next.books[0].stage, 'Outlining');
  const saved = github.files.get(STUDIO_FILE);
  assert.equal(JSON.parse(saved.text).books[0].stage, 'Outlining');
  assert.equal(saved.message, 'Studio: missed → Outlining');
});

test('Studio API is gated and reads then writes the shelf', async () => {
  const github = memoryGithub({ [STUDIO_FILE]: { sha: 'sha1', text: JSON.stringify(seed()) } });
  const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32), GITHUB_TOKEN: 't' };
  const locked = createKnowledgeStudioHandler({ env, verifySessionToken: () => ({ valid: false }), fetchImpl: github.fetchImpl });
  assert.equal((await locked(new Request('https://example.test/api/knowledge/studio'))).status, 401);

  const handler = createKnowledgeStudioHandler({ env, verifySessionToken: () => ({ valid: true }), fetchImpl: github.fetchImpl, now: () => NOW });
  const got = await (await handler(new Request('https://example.test/api/knowledge/studio'))).json();
  assert.equal(got.data.studio.books[0].id, 'missed');

  const posted = await handler(new Request('https://example.test/api/knowledge/studio', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'decide', insightId: 'cornerstone:page_a', choice: 'pin' })
  }));
  assert.equal(posted.status, 200);
  assert.equal((await posted.json()).data.studio.decisions['cornerstone:page_a'].choice, 'pin');

  const bad = await handler(new Request('https://example.test/api/knowledge/studio', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'stage', bookId: 'missed', stage: 'Nope' })
  }));
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'validation_error');
});
