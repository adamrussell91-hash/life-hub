import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { createAesthetics } from '../../apps/life/js/app/aesthetics/render-aesthetics.js';
import { FRAGRANCES, SOURCE_FRAGRANCES, setFragranceSource } from '../../apps/life/js/app/aesthetics/fragrance-library.js';
import { createAestheticsNotesHandler, FRAGRANCE_NOTES_PATH, shapeFragranceNotes } from '../../netlify/functions/aesthetics-notes.mjs';

// Synthetic fixture only; the real library is private.
setFragranceSource(JSON.parse(readFileSync(new URL('../fixtures/aesthetics/fragrance-source.json', import.meta.url), 'utf8')));

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function render(notesApi = null) {
  const window = new Window();
  window.document.write(readFileSync(new URL('../../apps/life/index.html', import.meta.url), 'utf8'));
  createAesthetics(window.document, {
    storage: window.localStorage,
    matchMedia: () => ({ matches: true }),
    weatherApi: async () => ({ weather: null, status: 'unavailable' }),
    notesApi
  }).render({ date: '2026-10-08' });
  return window.document;
}
const records = doc => [...doc.querySelectorAll('#aes-library details[data-fragrance-id]')];
const click = (doc, node) => node.dispatchEvent(new doc.defaultView.MouseEvent('click'));

test('library filters by status, loved and not-for-me, with counts', () => {
  const doc = render();
  assert.equal(records(doc).length, SOURCE_FRAGRANCES.length);
  const wishlist = doc.querySelector('[data-library-filter="status:Wishlist"]');
  const expected = SOURCE_FRAGRANCES.filter(r => r.properties.Status === 'Wishlist').length;
  assert.match(wishlist.textContent, new RegExp(`Wishlist ${expected}$`));
  click(doc, wishlist);
  assert.equal(records(doc).length, expected);
  assert.ok(records(doc).every(d => /Wishlist/.test(d.querySelector('summary').textContent)));
  assert.equal(doc.querySelector('[data-library-filter="status:Wishlist"]').getAttribute('aria-pressed'), 'true');
  assert.match(doc.querySelector('#aes-library-count').textContent, new RegExp(`Showing ${expected} of ${SOURCE_FRAGRANCES.length}`));

  click(doc, doc.querySelector('[data-library-filter="hated"]'));
  const hated = new Set(FRAGRANCES.filter(f => f.hated).map(f => f.id));
  assert.equal(records(doc).length, hated.size);
  assert.ok(records(doc).every(d => hated.has(d.dataset.fragranceId)));

  click(doc, doc.querySelector('[data-library-filter="loved"]'));
  assert.equal(records(doc).length, FRAGRANCES.filter(f => f.loved).length);
  assert.equal(doc.querySelector('[data-library-filter="noted"]'), null, 'no notes filter without the notes service');
});

test('library sorts by rating, newest and status', () => {
  const doc = render();
  const select = doc.querySelector('#aes-library-sort');
  select.value = 'rating';
  select.dispatchEvent(new doc.defaultView.Event('change'));
  const rated = SOURCE_FRAGRANCES.filter(r => r.properties.Rating != null).sort((a, b) => b.properties.Rating - a.properties.Rating);
  assert.equal(records(doc)[0].dataset.fragranceId, rated[0].id);
  doc.querySelector('#aes-library-sort').value = 'status';
  doc.querySelector('#aes-library-sort').dispatchEvent(new doc.defaultView.Event('change'));
  const order = records(doc).map(d => SOURCE_FRAGRANCES.find(r => r.id === d.dataset.fragranceId).properties.Status);
  assert.deepEqual(order, [...order].sort((a, b) => ['Owned', 'Sampling', 'Wishlist', 'Retired'].indexOf(a) - ['Owned', 'Sampling', 'Wishlist', 'Retired'].indexOf(b)));
});

test('the map card still opens a record the library filter is hiding', () => {
  const doc = render();
  click(doc, doc.querySelector('[data-library-filter="status:Retired"]'));
  const button = [...doc.querySelectorAll('#aes-mapcard button')].find(b => b.textContent === 'Full record');
  click(doc, button);
  const open = doc.querySelector('#aes-library details[open]');
  assert.ok(open, 'record opened after the filter cleared');
  assert.equal(doc.querySelector('[data-library-filter="all"]').getAttribute('aria-pressed'), 'true');
});

test('each record has a notes box that loads, saves and clears through the notes service', async () => {
  const first = SOURCE_FRAGRANCES[0].id;
  const saved = [];
  const api = {
    load: async () => ({ [first]: { text: 'Fixture note: wore well in the rain.', updatedAt: '2026-10-01T09:00:00.000Z' } }),
    save: async (id, text) => { saved.push([id, text]); return text.trim() ? { text: text.trim(), updatedAt: '2026-10-08T10:00:00.000Z' } : null; }
  };
  const doc = render(api);
  await tick();
  const box = doc.querySelector(`[data-note-for="${first}"]`);
  assert.equal(box.querySelector('textarea').value, 'Fixture note: wore well in the rain.');
  assert.match(box.querySelector('.aes-note__status').textContent, /Saved/);
  assert.match(doc.querySelector('[data-library-filter="noted"]').textContent, /With my notes 1/);

  const otherId = SOURCE_FRAGRANCES[1].id;
  const other = doc.querySelector(`[data-note-for="${otherId}"]`);
  const area = other.querySelector('textarea');
  const button = other.querySelector('button');
  assert.equal(button.disabled, true, 'nothing to save yet');
  area.value = 'Fixture: layer with something citrus.';
  area.dispatchEvent(new doc.defaultView.Event('input'));
  assert.equal(button.disabled, false);
  click(doc, button);
  await tick();
  assert.deepEqual(saved.at(-1), [otherId, 'Fixture: layer with something citrus.']);
  assert.match(doc.querySelector(`[data-note-for="${otherId}"] .aes-note__status`).textContent, /Saved/);
  assert.match(doc.querySelector('[data-library-filter="noted"]').textContent, /With my notes 2/);

  click(doc, doc.querySelector('[data-library-filter="noted"]'));
  assert.equal(records(doc).length, 2);
});

test('a failed save keeps the typed note and says so', async () => {
  const api = { load: async () => ({}), save: async () => { throw Object.assign(new Error('x'), { code: 'write_conflict' }); } };
  const doc = render(api);
  await tick();
  const id = SOURCE_FRAGRANCES[0].id;
  const box = doc.querySelector(`[data-note-for="${id}"]`);
  box.querySelector('textarea').value = 'Fixture draft';
  box.querySelector('textarea').dispatchEvent(new doc.defaultView.Event('input'));
  click(doc, box.querySelector('button'));
  await tick();
  assert.equal(box.querySelector('textarea').value, 'Fixture draft');
  assert.match(box.querySelector('.aes-note__status').textContent, /Changed elsewhere/);
});

// ---------------- /api/aesthetics/notes ----------------
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };
const signedIn = { verifySessionToken: () => ({ valid: true }) };
const req = (init) => new Request('https://example.test/api/aesthetics/notes', init);
function fakeRepo(initial = null) {
  const state = { file: initial == null ? null : JSON.stringify(initial), writes: [] };
  const sha = 'a'.repeat(40);
  return {
    state,
    client: () => ({
      resolveTree: async () => ({ tree: state.file == null ? [] : [{ path: FRAGRANCE_NOTES_PATH, type: 'blob', sha }] }),
      readBlob: async () => ({ encoding: 'base64', content: Buffer.from(state.file).toString('base64') }),
      writeFile: async (args) => { state.writes.push(args); state.file = args.content; return { sha }; }
    })
  };
}

test('notes endpoint answers no notes before the file exists, then saves and clears one', async () => {
  const repo = fakeRepo();
  const handler = createAestheticsNotesHandler({ env, ...signedIn, createGitHubClient: repo.client, now: () => Date.parse('2026-10-08T10:00:00Z') });
  let body = await (await handler(req())).json();
  assert.deepEqual(body.data.notes, {});
  let res = await handler(req({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'rec-1', text: '  Fixture note  ' }) }));
  assert.equal(res.status, 200);
  body = await res.json();
  assert.deepEqual(body.data.note, { text: 'Fixture note', updatedAt: '2026-10-08T10:00:00.000Z' });
  assert.equal(repo.state.writes[0].path, FRAGRANCE_NOTES_PATH);
  assert.equal(repo.state.writes[0].sha, undefined, 'first write creates the file');
  res = await handler(req({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'rec-1', text: '' }) }));
  body = await res.json();
  assert.equal(body.data.note, null);
  assert.deepEqual(JSON.parse(repo.state.file).notes, {});
  assert.ok(repo.state.writes[1].sha, 'later writes pass the current sha');
});

test('notes endpoint rejects bad input and signed-out requests', async () => {
  const repo = fakeRepo({ notes: {} });
  const handler = createAestheticsNotesHandler({ env, ...signedIn, createGitHubClient: repo.client });
  for (const payload of [{ id: '../x', text: 'a' }, { id: 'rec', text: 'x'.repeat(4001) }, { text: 'a' }]) {
    const res = await handler(req({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }));
    assert.equal(res.status, 400);
  }
  assert.equal(repo.state.writes.length, 0);
  const out = createAestheticsNotesHandler({ env, verifySessionToken: () => ({ valid: false }), createGitHubClient: repo.client });
  assert.equal((await out(req())).status, 401);
});

test('shapeFragranceNotes drops malformed entries', () => {
  assert.deepEqual(shapeFragranceNotes({ notes: { ok: { text: 'a', updatedAt: 'x' }, empty: { text: ' ' }, 'bad id': { text: 'a' }, n: 3 } }), { ok: { text: 'a', updatedAt: 'x' } });
  assert.deepEqual(shapeFragranceNotes(null), {});
});
