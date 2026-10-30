import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { AESTHETICS_SOURCE_PATH, createAestheticsSourceHandler, shapeAestheticsSource, shapeWatchSource } from '../../netlify/functions/aesthetics-source.mjs';
import { WATCHES_PATH } from '../../netlify/functions/_shared/watch-radar.mjs';
import { WATCHES, setWatchSource } from '../../apps/life/js/app/aesthetics/watch-model.js';
import { createAestheticsSourceApi } from '../../apps/life/js/app/aesthetics-source-api.js';
import { createAesthetics } from '../../apps/life/js/app/aesthetics/render-aesthetics.js';
import { FRAGRANCES, setFragranceSource } from '../../apps/life/js/app/aesthetics/fragrance-library.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/aesthetics/fragrance-source.json', import.meta.url), 'utf8'));
const watchFixture = JSON.parse(readFileSync(new URL('../fixtures/aesthetics/watches.json', import.meta.url), 'utf8'));
const files = { [AESTHETICS_SOURCE_PATH]: fixture, [WATCHES_PATH]: watchFixture };
const readFiles = (reads = []) => async (path) => { reads.push(path); if (!(path in files)) throw Object.assign(new Error('missing'), { status: 404 }); return files[path]; };
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };
const signedIn = { verifySessionToken: () => ({ valid: true }) };
const req = (url, init) => new Request(`https://example.test${url}`, init);

test('aesthetics source reads the private library and watch tracker once and caches them', async () => {
  const reads = [];
  const handler = createAestheticsSourceHandler({ env, ...signedIn, readPrivateJsonFile: readFiles(reads) });
  for (let i = 0; i < 2; i++) {
    const response = await handler(req('/api/aesthetics/source'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const body = await response.json();
    assert.equal(body.data.status, 'ready');
    assert.equal(body.data.fragrances.length, fixture.fragrances.length);
    assert.equal(body.data.map.length, fixture.map.length);
    assert.equal(body.data.watches.length, 11, 'the untitled row is dropped');
    assert.equal(body.data.watchSourceUrl, 'https://notes.example/watches');
    assert.equal(body.data.watchHunt.title, 'The example watch hunt');
  }
  assert.deepEqual(reads.sort(), [AESTHETICS_SOURCE_PATH, WATCHES_PATH].sort());
});

test('aesthetics source answers an empty library when the private repo is unreachable', async () => {
  const handler = createAestheticsSourceHandler({ env, ...signedIn, readPrivateJsonFile: async () => { throw Object.assign(new Error('x'), { status: 503 }); } });
  const body = await (await handler(req('/api/aesthetics/source'))).json();
  assert.deepEqual(body.data, { map: [], fragrances: [], styleNote: null, watches: [], watchSourceUrl: null, watchHunt: null, status: 'unavailable' });
});

test('aesthetics source serves whichever file loaded and retries the other', async () => {
  const reads = [];
  const only = { [AESTHETICS_SOURCE_PATH]: fixture };
  const handler = createAestheticsSourceHandler({ env, ...signedIn, readPrivateJsonFile: async (path) => { reads.push(path); if (!(path in only)) throw Object.assign(new Error('x'), { status: 404 }); return only[path]; } });
  const { data } = await (await handler(req('/api/aesthetics/source'))).json();
  assert.equal(data.status, 'ready');
  assert.deepEqual(data.watches, []);
  await handler(req('/api/aesthetics/source'));
  assert.equal(reads.length, 4, 'a partial read is not cached');
  assert.deepEqual(shapeWatchSource(null), { watches: [], watchSourceUrl: null, watchHunt: null });
});

test('aesthetics source needs a session and GET', async () => {
  const signedOut = createAestheticsSourceHandler({ env, verifySessionToken: () => ({ valid: false }), readPrivateJsonFile: async () => fixture });
  assert.equal((await signedOut(req('/api/aesthetics/source'))).status, 401);
  const handler = createAestheticsSourceHandler({ env, ...signedIn, readPrivateJsonFile: async () => fixture });
  assert.equal((await handler(req('/api/aesthetics/source', { method: 'POST' }))).status, 405);
});

test('shapeAestheticsSource drops malformed rows', () => {
  assert.deepEqual(shapeAestheticsSource(null), { map: [], fragrances: [], styleNote: null });
  const shaped = shapeAestheticsSource({ map: [{ name: 'Fixture' }, null, { family: 'x' }], fragrances: [{ id: 'a', properties: {} }, { id: 1 }], styleNote: 'nope' });
  assert.equal(shaped.map.length, 1);
  assert.equal(shaped.fragrances.length, 1);
  assert.equal(shaped.styleNote, null);
});

test('the Life client returns the library and throws when it is unavailable', async () => {
  const reply = data => async () => new Response(JSON.stringify({ ok: true, data }), { status: 200 });
  assert.equal((await createAestheticsSourceApi(reply({ ...fixture, status: 'ready' }))()).fragrances.length, fixture.fragrances.length);
  await assert.rejects(createAestheticsSourceApi(reply({ status: 'unavailable' }))(), /unavailable/);
});

function page() {
  const window = new Window();
  window.document.write(readFileSync(new URL('../../apps/life/index.html', import.meta.url), 'utf8'));
  return window.document;
}
const flush = () => new Promise(r => setTimeout(r, 0));
const options = doc => ({
  storage: doc.defaultView.localStorage,
  matchMedia: () => ({ matches: true }),
  weatherApi: async () => ({ weather: null, status: 'unavailable' })
});

test('Aesthetics shows a status, not a broken page, while the library is missing', async () => {
  setFragranceSource({});
  try {
    const doc = page();
    let calls = 0;
    const aes = createAesthetics(doc, { ...options(doc), sourceApi: async () => { calls += 1; throw new Error('offline'); } });
    aes.render({ date: '2026-10-08' });
    await flush();
    const status = doc.querySelector('#aes-source-status');
    assert.equal(status.hidden, false);
    assert.match(status.textContent, /isn’t available right now/);
    assert.equal(doc.querySelector('#aes-today').hidden, true);
    assert.equal(doc.querySelectorAll('#aes-library [data-fragrance-id]').length, 0);
    aes.render({ date: '2026-10-08' });
    await flush();
    assert.equal(calls, 2, 'a later render tries again');
  } finally {
    setFragranceSource(fixture);
  }
});

test('Aesthetics loads the private library at runtime and then renders it', async () => {
  setFragranceSource({});
  try {
    const doc = page();
    setWatchSource({});
    const aes = createAesthetics(doc, { ...options(doc), sourceApi: async () => ({ ...fixture, watches: watchFixture.watches, watchSourceUrl: watchFixture.sourceUrl, watchHunt: watchFixture.hunt }) });
    aes.render({ date: '2026-10-08' });
    assert.match(doc.querySelector('#aes-source-status').textContent, /Loading/);
    await flush();
    assert.equal(FRAGRANCES.length, fixture.map.length);
    assert.equal(doc.querySelector('#aes-source-status').hidden, true);
    assert.equal(doc.querySelector('#aes-today').hidden, false);
    assert.ok(doc.querySelector('#aes-today-name').textContent);
    assert.equal(doc.querySelectorAll('#aes-library [data-fragrance-id]').length, fixture.fragrances.length);
    assert.equal(WATCHES.length, 11, 'the watch tracker arrives with the same call');
    assert.equal(doc.querySelectorAll('#aes-watch-records [data-watch-id]').length, 11);
    assert.equal(doc.querySelector('#aes-hunt-title').textContent, 'The example watch hunt');
  } finally {
    setFragranceSource(fixture);
    setWatchSource(watchFixture);
  }
});

test('Watches shows a status, not a broken box, when the tracker is missing', async () => {
  setWatchSource({});
  try {
    const doc = page();
    createAesthetics(doc, options(doc)).render({ date: '2026-10-08' });
    await flush();
    const host = doc.querySelector('#aes-watches');
    assert.ok(host.classList.contains('aes-watches--empty'));
    assert.equal(doc.querySelector('#aes-watch-status').hidden, false);
    assert.match(doc.querySelector('#aes-watch-status').textContent, /isn’t available right now/);
    assert.equal(doc.querySelectorAll('#aes-box .aes-slot').length, 0);
  } finally {
    setWatchSource(watchFixture);
  }
});
