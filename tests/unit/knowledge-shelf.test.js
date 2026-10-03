import assert from 'node:assert/strict';
import test from 'node:test';
import { readShelf, saveBook, savePlacements, shelfBookKey } from '../../netlify/functions/_shared/knowledge-shelf.mjs';
import { createKnowledgeShelfHandler } from '../../netlify/functions/knowledge-shelf.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };
const NOW = '2026-10-03T09:00:00.000Z';

function memoryStore() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async setJSON(key, value) { values.set(key, structuredClone(value)); }
  };
}

const enigma = {
  label: 'The Enigma of Reason',
  author: 'Hugo Mercier & Dan Sperber',
  pages: 396,
  chapters: [
    { number: 1, title: 'Reason on Trial', start: 11 },
    { number: 2, title: 'Unconscious Inferences', start: 27 }
  ]
};

test('Shelf saves book facts keyed by title, case-insensitively, and merges later edits', async () => {
  const store = memoryStore();
  await saveBook(store, enigma, { now: NOW });
  const again = await saveBook(store, { label: 'the enigma of reason', reading: { page: 40 } }, { now: NOW });
  assert.equal(again.pages, 396);
  assert.equal(again.chapters.length, 2);
  assert.equal(again.chapters[0].label, '1');
  assert.deepEqual(again.reading, { page: 40, updated_at: NOW });
  const { books } = await readShelf(store);
  assert.equal(books.length, 1);
  assert.equal(shelfBookKey(' The  Enigma of Reason '), 'the enigma of reason');
});

test('Shelf keeps the reading page when a book is only re-marked as reading', async () => {
  const store = memoryStore();
  await saveBook(store, { label: 'The Knowledge Gene', reading: { page: 120 } }, { now: NOW });
  const next = await saveBook(store, { label: 'The Knowledge Gene', reading: true }, { now: NOW });
  assert.equal(next.reading.page, 120);
  const cleared = await saveBook(store, { label: 'The Knowledge Gene', reading: null }, { now: NOW });
  assert.equal(cleared.reading, undefined);
});

test('Shelf rejects chapters out of order or past the last page', async () => {
  const store = memoryStore();
  await assert.rejects(() => saveBook(store, { ...enigma, chapters: [{ title: 'B', start: 50 }, { title: 'A', start: 10 }] }), /page order/);
  await assert.rejects(() => saveBook(store, { ...enigma, chapters: [{ title: 'Late', start: 500 }] }), /after the last page/);
  await assert.rejects(() => saveBook(store, { label: 'X', pages: 0 }), /whole number/);
});

test('Shelf placements merge per note and null clears a field', async () => {
  const store = memoryStore();
  await savePlacements(store, [{ pageId: 'page_hub_a', page: 42, guessed: true, stance: 'complicates', gaps: ['Does it replicate?'] }], { now: NOW });
  const [next] = await savePlacements(store, { pageId: 'page_hub_a', stance: null, lastOpened: NOW }, { now: NOW });
  assert.equal(next.page, 42);
  assert.equal(next.guessed, true);
  assert.equal(next.stance, undefined);
  assert.deepEqual(next.gaps, ['Does it replicate?']);
  assert.equal(next.lastOpened, NOW);
  await assert.rejects(() => savePlacements(store, [{ pageId: '../x', page: 3 }]), /valid pageId/);
  await assert.rejects(() => savePlacements(store, [{ pageId: 'p1', stance: 'related' }]), /Stance/);
});

test('Shelf API gates the archive, reads, and writes both ops', async () => {
  const store = memoryStore();
  const locked = createKnowledgeShelfHandler({ env, verifySessionToken: () => ({ valid: false }), getStore: async () => store });
  assert.equal((await locked(new Request('https://example.test/api/knowledge/shelf'))).status, 401);

  const handler = createKnowledgeShelfHandler({ env, verifySessionToken: () => ({ valid: true }), getStore: async () => store, now: () => NOW });
  const post = body => handler(new Request('https://example.test/api/knowledge/shelf', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }));
  assert.equal((await post({ op: 'book', book: enigma })).status, 200);
  assert.equal((await post({ op: 'place', placements: [{ pageId: 'page_1', page: 30 }] })).status, 200);
  const bad = await post({ op: 'place', placements: [{ pageId: 'page_1', page: 'thirty' }] });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error.message, /whole number/);
  assert.equal((await post({ op: 'nope' })).status, 400);
  const read = await (await handler(new Request('https://example.test/api/knowledge/shelf'))).json();
  assert.equal(read.data.books[0].label, 'The Enigma of Reason');
  assert.equal(read.data.placements[0].page, 30);
});

test('Shelf can take a book record off the shelf', async () => {
  const { deleteBook } = await import('../../netlify/functions/_shared/knowledge-shelf.mjs');
  const store = memoryStore();
  await saveBook(store, { label: '~10%', notebook: 'Pedagogy and Planning' }, { now: NOW });
  assert.deepEqual(await deleteBook(store, '~10%'), { label: '~10%', removed: true });
  assert.equal((await readShelf(store)).books.length, 0);
  assert.deepEqual(await deleteBook(store, '~10%'), { label: '~10%', removed: false });
  await assert.rejects(() => deleteBook(store, ''), /title is required/);
});
