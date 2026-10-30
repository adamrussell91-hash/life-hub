/**
 * Aesthetics › Dress › Watches: tracker import, today's pick, the price radar and its weekly pass.
 * Runs on a synthetic fixture: the real watch tracker is private.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { createAesthetics } from '../../apps/life/js/app/aesthetics/render-aesthetics.js';
import { setFragranceSource } from '../../apps/life/js/app/aesthetics/fragrance-library.js';
import { LOOKS } from '../../apps/life/js/app/aesthetics/dress-looks.js';
import {
  WATCHES, WATCH_HUNT, freshTags, setWatchSource, groupByModel, isOwned, isTrackable, isWanted, pingsFrom, radarCoverage,
  radarItems, radiusFor, rankForLook, zoneFor
} from '../../apps/life/js/app/aesthetics/watch-model.js';
import { priceFromJsonLd, priceFromMeta, priceFromShopifyJson, readShopPrice, shopifyCurrency } from '../../netlify/functions/_shared/watch-price.mjs';
import { RADAR_KEY, TARGETS_KEY, WATCHES_PATH, loadPrivateWatches, radarModelKeys, radarWatchList, runWatchRadar, saveTarget } from '../../netlify/functions/_shared/watch-radar.mjs';
import { PUSH_SUBSCRIPTIONS_KEY } from '../../netlify/functions/_shared/push.mjs';
import { createWatchRadarHandler } from '../../netlify/functions/watch-radar.mjs';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';

// The fragrance library is private; the Dress tab runs on the synthetic fixture.
setFragranceSource(JSON.parse(readFileSync(new URL('../fixtures/aesthetics/fragrance-source.json', import.meta.url), 'utf8')));
const WATCH_FIXTURE = JSON.parse(readFileSync(new URL('../fixtures/aesthetics/watches.json', import.meta.url), 'utf8'));
setWatchSource(WATCH_FIXTURE);
const loadWatches = async () => WATCHES;

const owned = WATCHES.filter(isOwned);
const wanted = WATCHES.filter(isWanted);
const NEUTRA = 'Exemplar Neutral Chronograph';
const lookNamed = vibe => LOOKS.find(l => l.vibe === vibe);

function memoryStore(seed = []) {
  const data = new Map(seed);
  return {
    data,
    async get(key) { return data.has(key) ? structuredClone(data.get(key)) : null; },
    async setJSON(key, value) { data.set(key, structuredClone(value)); }
  };
}

test('the tracker import keeps every titled watch and its recorded values', () => {
  assert.equal(WATCHES.length, 11, 'the untitled empty row is left out');
  assert.equal(owned.length, 3);
  assert.equal(wanted.length, 7, 'passed watches leave the wishlist');
  const blue = WATCHES.find(w => w.name === 'Exemplar Townsend Automatic – Blue Dial / Brown');
  assert.equal(blue.mm, 41);
  assert.equal(blue.source.properties['Reference Number'], 'EX-1001');
  assert.deepEqual(blue.markers, ['Applied', 'Roman', 'Baton']);
  const quartz = WATCHES.find(w => w.name.startsWith('Samplewerk Quartz Day Date'));
  assert.equal(quartz.mm, null, 'no invented case size');
});

test('the watch list starts empty until the private tracker is installed', () => {
  try {
    assert.deepEqual(setWatchSource({}), []);
    assert.equal(WATCHES.length, 0);
    assert.equal(WATCH_HUNT, null);
    setWatchSource({ watches: WATCH_FIXTURE.watches, hunt: { brief: ['no title'] } });
    assert.equal(WATCH_HUNT, null, 'a malformed hunt reads as no hunt');
  } finally {
    setWatchSource(WATCH_FIXTURE);
  }
});

test('colourways share a model; only real product pages are trackable', () => {
  const groups = groupByModel(wanted);
  assert.equal(groups.find(g => g.key === NEUTRA).items.length, 3);
  assert.equal(groups.length, 5);
  assert.equal(isTrackable('https://www.samplewerk.example'), false);
  assert.equal(isTrackable('https://chrono.example/collections/1963'), false);
  assert.equal(isTrackable('https://fictiva.example/products/longitude'), true);
  assert.deepEqual(radarCoverage(wanted), { tracked: 3, homepage: 2, missing: 2, total: 7 });
});

test('radar zones and radius are continuous across the rings', () => {
  assert.equal(zoneFor(90, 100), 0);
  assert.equal(zoneFor(108, 100), 1);
  assert.equal(zoneFor(120, 100), 2);
  assert.equal(zoneFor(140, 100), 3);
  assert.equal(zoneFor(100, null), null);
  assert.ok(Math.abs(radiusFor(110, 100) - 0.5) < 1e-9);
  assert.ok(Math.abs(radiusFor(125, 100) - 0.75) < 1e-9);
  assert.ok(radiusFor(100, 100) <= 0.25);
});

test('today’s watch matches the leather and echoes the outfit', () => {
  const [best] = rankForLook(owned, lookNamed('old money'));
  assert.equal(best.watch.strap, 'Brown', 'cognac belt and chocolate loafers want a brown strap');
  assert.match(best.reasons.join(' '), /brown strap goes with the chocolate loafers and cognac belt/);
  const [powerful] = rankForLook(owned, lookNamed('powerful'));
  assert.equal(powerful.watch.strap, 'Black');
});

test('fresh tags name what nothing in the box does yet', () => {
  const moon = WATCHES.find(w => w.name === 'Samplewerk Original Moonphase');
  assert.deepEqual(freshTags(moon, owned), ['Moonphase']);
  const heritage = WATCHES.find(w => w.name.startsWith('Fictiva Longitude'));
  assert.ok(freshTags(heritage, owned).includes('British'));
});

test('radar items take the cheapest checked colourway and fall back to Notion', () => {
  const groups = groupByModel(wanted);
  const cream = WATCHES.find(w => w.name.includes('Neutral Chronograph – Cream'));
  const before = radarItems(groups).find(i => i.key === NEUTRA);
  assert.equal(before.live, false);
  assert.equal(before.price, 269, 'first priced colourway from Notion');
  const readings = { [cream.id]: { aud: 174, history: [{ at: '2026-10-04', aud: 249 }, { at: '2026-10-11', aud: 174 }] } };
  const after = radarItems(groups, { readings }).find(i => i.key === NEUTRA);
  assert.equal(after.watch.id, cream.id);
  assert.equal(after.zone, 0, 'A$174 is under the default 15% off A$249');
  const [ping] = pingsFrom(radarItems(groups, { readings }));
  assert.deepEqual([ping.from, ping.to, ping.underTarget], [249, 174, true]);
});

// ---------------- price parsing ----------------
test('price comes from JSON-LD, meta tags or Shopify JSON, never page text', () => {
  const ld = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"x","offers":[{"@type":"Offer","price":"249.00","priceCurrency":"USD"},{"@type":"Offer","price":"199.00","priceCurrency":"USD"}]}]}</script>`;
  assert.deepEqual(priceFromJsonLd(ld), { amount: 199, currency: 'USD', via: 'json-ld' });
  const meta = '<meta property="product:price:amount" content="495,00"><meta content="EUR" property="product:price:currency">';
  assert.equal(priceFromMeta(meta).currency, 'EUR');
  assert.equal(priceFromJsonLd('<p>Only $99 today!</p>'), null);
  assert.equal(shopifyCurrency('<script>Shopify.currency = {"active":"AUD","rate":"1.0"};</script>'), 'AUD');
  assert.deepEqual(priceFromShopifyJson({ variants: [{ price: 41900, available: true }, { price: 39900, available: false }] }, 'AUD'), { amount: 419, currency: 'AUD', via: 'shopify' });
});

test('a Shopify page without structured price falls back to the product JSON', async () => {
  const pages = {
    'https://shop.example/products/watch': '<html><script src="https://cdn.shopify.com/x.js"></script><script>Shopify.currency = {"active":"EUR"};</script></html>',
    'https://shop.example/products/watch.js': JSON.stringify({ variants: [{ price: 25900, available: true }] })
  };
  const fetchImpl = async url => ({ ok: true, status: 200, text: async () => pages[url.split('?')[0]] });
  assert.deepEqual(await readShopPrice('https://shop.example/products/watch?variant=1', { fetchImpl }), { amount: 259, currency: 'EUR', via: 'shopify' });
});

// ---------------- weekly pass ----------------
const SUB = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'BPk', auth: 'au' } };
const page = (price, currency) => `<script type="application/ld+json">{"@type":"Product","offers":{"price":"${price}","priceCurrency":"${currency}"}}</script>`;

test('the weekly pass records AUD readings, keeps failures and notifies once per drop', async () => {
  const list = [
    { id: 'a', url: 'https://one.example/products/a', key: 'Model A', name: 'Model A', price: 300 },
    { id: 'b', url: 'https://two.example/products/b', key: 'Model B', name: 'Model B', price: 500 }
  ];
  const store = memoryStore([[PUSH_SUBSCRIPTIONS_KEY, [SUB]], [TARGETS_KEY, { 'Model B': 400 }]]);
  let prices = { a: page(200, 'EUR'), b: null };
  const fetchImpl = async url => {
    const body = url.includes('one.example') ? prices.a : prices.b;
    return body ? { ok: true, status: 200, text: async () => body } : { ok: false, status: 403, text: async () => '' };
  };
  const rates = { getRate: async c => ({ rate: c === 'EUR' ? 1.6 : 1, date: '2026-10-10' }) };
  const sent = [];
  const send = async (_store, message) => { sent.push(message); return { delivered: 1 }; };
  const run = when => runWatchRadar({ store, watches: list, fetchImpl, rates, send, env: {}, now: () => new Date(when) });

  const first = await run('2026-10-10T21:00:00Z');
  assert.deepEqual([first.checked, first.failed], [1, 1]);
  const radar = store.data.get(RADAR_KEY);
  assert.equal(radar.readings.a.aud, 320);
  assert.equal(radar.readings.a.host, 'one.example');
  assert.equal(radar.readings.b.error.code, 'http_error');
  assert.equal(sent.length, 0, 'A$320 is above the default target of A$255');

  prices = { a: page(150, 'EUR'), b: page(390, 'AUD') };
  const second = await run('2026-10-17T21:00:00Z');
  assert.deepEqual(second.hits.map(h => h.key).sort(), ['Model A', 'Model B']);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].title, '2 watches hit your price');
  assert.equal(sent[0].url, '/#skincare');
  assert.equal(store.data.get(RADAR_KEY).readings.a.history.length, 2);

  await run('2026-10-24T21:00:00Z');
  assert.equal(sent.length, 1, 'same prices: no second notification');
});

test('the radar list only includes wanted watches with product pages', () => {
  const list = radarWatchList(WATCHES);
  assert.equal(list.length, 3);
  assert.ok(list.every(w => isTrackable(w.url)));
  assert.equal(radarWatchList().length, 0, 'no watches until the private list is passed in');
});

test('the server reads the watch tracker from the private repo', async () => {
  const reads = [];
  const read = async (path) => { reads.push(path); return WATCH_FIXTURE; };
  const watches = await loadPrivateWatches({ env: {}, read });
  assert.deepEqual(reads, [WATCHES_PATH]);
  assert.equal(watches.length, 11);
  assert.ok(radarModelKeys(watches).has(NEUTRA));
  await assert.rejects(saveTarget(memoryStore(), NEUTRA, 200), /unavailable/, 'no key list, no save');
});

test('the weekly pass loads the private list when none is given, and fails loudly without it', async () => {
  const store = memoryStore();
  await assert.rejects(runWatchRadar({ store, fetchImpl: async () => { throw new Error('offline'); }, rates: { getRate: async () => ({ rate: 1 }) }, env: {} }));
  assert.equal(store.data.has(RADAR_KEY), false, 'a failed load leaves the radar untouched');
});

// ---------------- endpoint ----------------
const SECRET = 's'.repeat(32);
const NOW = Date.parse('2026-10-14T17:05:00+11:00');
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 3) }, SECRET).token;
const ENV = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET };
const req = (method = 'GET', body) => new Request('https://api.example/api/watch-radar', {
  method,
  headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
  ...(body ? { body: JSON.stringify(body) } : {})
});

test('/api/watch-radar returns readings and saves only valid buy prices', async () => {
  const store = memoryStore([[RADAR_KEY, { readings: { x: { aud: 1 } }, lastRun: '2026-10-10T21:00:00Z' }]]);
  const handler = createWatchRadarHandler({ env: ENV, now: () => NOW, getContentStore: async () => store, loadWatches });
  const got = await (await handler(req())).json();
  assert.equal(got.data.lastRun, '2026-10-10T21:00:00Z');
  assert.deepEqual(got.data.targets, {});
  assert.equal((await handler(req('PUT', { key: NEUTRA, target: 200 }))).status, 200);
  assert.deepEqual(store.data.get(TARGETS_KEY), { [NEUTRA]: 200 });
  assert.equal((await handler(req('PUT', { key: 'Unknown Example Model', target: 200 }))).status, 400);
  assert.equal((await handler(req('PUT', { key: NEUTRA, target: -5 }))).status, 400);
  assert.equal((await handler(req('PUT', { key: NEUTRA, target: null }))).status, 200);
  assert.deepEqual(store.data.get(TARGETS_KEY), {});
  const anon = await handler(new Request('https://api.example/api/watch-radar'));
  assert.equal(anon.status, 401);
});

// ---------------- page ----------------
async function renderWatches({ api = null, saved = {} } = {}) {
  const window = new Window();
  for (const [key, value] of Object.entries(saved)) window.localStorage.setItem(key, JSON.stringify(value));
  window.document.write(readFileSync(new URL('../../apps/life/index.html', import.meta.url), 'utf8'));
  const aes = createAesthetics(window.document, { storage: window.localStorage, matchMedia: () => ({ matches: true }), watchRadarApi: api });
  aes.render({ date: '2026-10-08' });
  await new Promise(r => setTimeout(r, 0));
  return window.document;
}

test('Dress switches between Looks and Watches and remembers the choice', async () => {
  const doc = await renderWatches();
  assert.equal(doc.querySelector('#aes-watches').hidden, true);
  doc.querySelector('[data-aes-dress-view="watches"]').dispatchEvent(new doc.defaultView.MouseEvent('click'));
  assert.equal(doc.querySelector('#aes-watches').hidden, false);
  assert.equal(doc.querySelector('#aes-looks').hidden, true);
  assert.equal(doc.defaultView.localStorage.getItem('life-aesthetics-dress-view'), 'watches');
});

test('Watches renders the box, every record, the radar and the hunt', async () => {
  const doc = await renderWatches();
  assert.equal(doc.querySelectorAll('#aes-box .aes-slot').length, 3);
  assert.equal(doc.querySelectorAll('#aes-watch-records [data-watch-id]').length, 11);
  assert.equal(doc.querySelectorAll('#aes-radar-dial .aes-blip').length, 5);
  assert.equal(doc.querySelectorAll('#aes-radar-dial .aes-blip[data-zone="untracked"]').length, 3);
  assert.equal(doc.querySelector('#aes-hunt-card').hidden, false);
  assert.equal(doc.querySelector('#aes-hunt-title').textContent, 'The example watch hunt');
  assert.equal(doc.querySelector('#aes-hunt-when').textContent, 'Sample City, some month');
  assert.equal(doc.querySelectorAll('#aes-hunt-checks input').length, 3);
  assert.match(doc.querySelector('#aes-radar-status').textContent, /out of reach/);
  assert.ok(doc.querySelector('#aes-wrist-name').textContent.length > 0);
  const quartz = [...doc.querySelectorAll('#aes-watch-records details')].find(d => d.textContent.includes('cal. 9000'));
  assert.equal(quartz.querySelector('[data-source-field="Case Diameter mm"]').textContent, 'Not recorded');
});

test('live readings move a watch, and a new buy price is saved to the server', async () => {
  const cream = WATCHES.find(w => w.name.includes('Neutral Chronograph – Cream'));
  const saves = [];
  const api = {
    load: async () => ({ lastRun: '2026-10-04T21:00:00Z', targets: {}, readings: { [cream.id]: { amount: 174, currency: 'AUD', aud: 174, host: 'exemplar.example', checkedAt: '2026-10-04T21:00:00Z', history: [{ at: '2026-09-27T21:00:00Z', aud: 249 }, { at: '2026-10-04T21:00:00Z', aud: 174 }] } } }),
    setTarget: async (key, target) => { saves.push([key, target]); return {}; }
  };
  const doc = await renderWatches({ api });
  assert.match(doc.querySelector('#aes-radar-status').textContent, /Shops last checked/);
  assert.match(doc.querySelector('#aes-radar-card').textContent, /Exemplar Neutral Chronograph/, 'the watch at its price is selected first');
  assert.match(doc.querySelector('#aes-radar-card').textContent, /A\$174/);
  assert.match(doc.querySelector('#aes-radar-pings').textContent, /down to A\$174 from A\$249\. Under your price\./);
  const slider = doc.querySelector('#aes-radar-target');
  slider.value = '150';
  slider.dispatchEvent(new doc.defaultView.Event('change'));
  assert.deepEqual(saves, [[NEUTRA, 150]]);
  assert.match(doc.querySelector('#aes-radar-card').textContent, /A\$24 above your price/);
});

test('Wearing it logs today’s watch and counts it in the box', async () => {
  const doc = await renderWatches();
  doc.querySelector('#aes-wrist-wear').dispatchEvent(new doc.defaultView.MouseEvent('click'));
  assert.match(doc.querySelector('#aes-wrist-worn').textContent, /^Logged: /);
  assert.equal(Object.keys(JSON.parse(doc.defaultView.localStorage.getItem('life-aesthetics-watch-wear'))).length, 1);
  assert.match(doc.querySelector('#aes-box').textContent, /worn 1×/);
});
