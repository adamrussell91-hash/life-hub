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

 test('Shelf stores explicit book completion, preserves the date and clears it on rereading', async () => {
  const store = memoryStore();
  await saveBook(store, {label:'Finished book', reading:{page:120}}, {now:NOW});
  const finished = await saveBook(store, {label:'Finished book', completed_on:'2026-10-02'}, {now:NOW});
  assert.equal(finished.completed_on,'2026-10-02');
  assert.equal(finished.reading,undefined);
  assert.equal((await saveBook(store,{label:'Finished book',author:'Someone'},{now:NOW})).completed_on,'2026-10-02');
  assert.equal((await saveBook(store,{label:'Finished book',reading:true},{now:NOW})).completed_on,undefined);
  await assert.rejects(()=>saveBook(store,{label:'X',completed_on:'2026-02-30'},{now:NOW}),/completion date/);
  await assert.rejects(()=>saveBook(store,{label:'X',completed_on:'2027-01-01'},{now:NOW}),/future/);
  await assert.rejects(()=>saveBook(store,{label:'X',completed_on:'2026-99-99'},{now:NOW}),/completion date/);
});

test('Wish list adds, renames and removes books apart from the shelf', async () => {
  const { saveWish, deleteWish } = await import('../../netlify/functions/_shared/knowledge-shelf.mjs');
  const store = memoryStore();
  const wish = await saveWish(store, { label: 'The Overstory', author: 'Richard Powers', why: 'Trees as characters', from: 'A podcast' }, { now: NOW });
  assert.equal(wish.added_at, NOW);
  assert.equal(wish.why, 'Trees as characters');
  let shelf = await readShelf(store);
  assert.equal(shelf.books.length, 0);
  assert.equal(shelf.wishlist.length, 1);
  const renamed = await saveWish(store, { was: 'The Overstory', label: 'The Overstory: A Novel', why: null }, { now: '2026-10-04T09:00:00.000Z' });
  assert.equal(renamed.added_at, NOW);
  assert.equal(renamed.author, 'Richard Powers');
  assert.equal(renamed.why, undefined);
  shelf = await readShelf(store);
  assert.deepEqual(shelf.wishlist.map(w => w.label), ['The Overstory: A Novel']);
  await saveWish(store, { label: 'Middlemarch' }, { now: NOW });
  await assert.rejects(() => saveWish(store, { was: 'Middlemarch', label: 'the overstory: a novel' }), /already on the wish list/);
  await assert.rejects(() => saveWish(store, { label: '  ' }), /title is required/);
  assert.equal((await deleteWish(store, 'MIDDLEMARCH')).removed, true);
  assert.equal((await readShelf(store)).wishlist.length, 1);
});

test('Starting a wish puts it on the shelf as reading now and off the wish list', async () => {
  const store = memoryStore();
  const { saveWish, startWish } = await import('../../netlify/functions/_shared/knowledge-shelf.mjs');
  await saveWish(store, { label: 'Middlemarch', author: 'George Eliot' }, { now: NOW });
  const book = await startWish(store, 'middlemarch', { now: NOW });
  assert.equal(book.label, 'Middlemarch');
  assert.equal(book.author, 'George Eliot');
  assert.deepEqual(book.reading, { page: null, updated_at: NOW });
  const shelf = await readShelf(store);
  assert.equal(shelf.books.length, 1);
  assert.equal(shelf.wishlist.length, 0);
  await assert.rejects(() => startWish(store, 'Middlemarch'), /not on the wish list/);
});

test('Shelf API runs the wish ops', async () => {
  const store = memoryStore();
  const handler = createKnowledgeShelfHandler({ env, verifySessionToken: () => ({ valid: true }), getStore: async () => store, now: () => NOW });
  const post = body => handler(new Request('https://example.test/api/knowledge/shelf', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }));
  assert.equal((await post({ op: 'wish', wish: { label: 'Middlemarch' } })).status, 200);
  assert.equal((await post({ op: 'wish', wish: { label: 'Bleak House' } })).status, 200);
  assert.equal((await post({ op: 'wish', wish: {} })).status, 400);
  assert.equal((await post({ op: 'wish-delete', label: 'Bleak House' })).status, 200);
  assert.equal((await post({ op: 'wish-start', label: 'Nope' })).status, 404);
  assert.equal((await post({ op: 'wish-start', label: 'Middlemarch' })).status, 200);
  const read = await (await handler(new Request('https://example.test/api/knowledge/shelf'))).json();
  assert.deepEqual(read.data.wishlist, []);
  assert.equal(read.data.books[0].reading.page, null);
});
