import test from 'node:test';
import assert from 'node:assert/strict';
import { createTravelAtlasHandler } from '../../netlify/functions/travel-atlas.mjs';
import { createTravelAtlasAssetHandler, slotFile } from '../../netlify/functions/travel-atlas-asset.mjs';
import {
  ATLAS_PREF_KEY,
  liveAtlasItems,
  normaliseAtlasSettings,
  validateAtlasItem
} from '../../netlify/functions/_shared/travel-atlas.mjs';
import { emptyJournal, validateJournal } from '../../netlify/functions/_shared/travel-journal-schema.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };
const signedIn = { verifySessionToken: () => ({ valid: true }) };
const signedOut = { verifySessionToken: () => ({ valid: false }) };

function item(partial = {}) {
  return {
    id: 'maccas_item0001',
    trip_id: 'trp_invented01',
    moment_id: 'mom_lunch0001',
    country: 'JP',
    city: 'Osaka',
    date: '2026-11-18',
    name: 'Teriyaki McBurger',
    kind: 'exclusive',
    price: { amount: 400, currency: 'JPY' },
    aud: { amount: 4.12, rate: 0.0103, as_of: '2026-11-18' },
    big_mac: false,
    rating: 4,
    vs_home: null,
    note: '',
    photo_ids: [],
    lifecycle: 'live',
    ...partial
  };
}

function journalWith(tripId, items, momentLifecycle = 'live') {
  const journal = emptyJournal(tripId);
  journal.legs = [{ id: 'leg_osaka0001', trip_id: tripId, pattern_id: 'p', destination: 'Osaka', timezone: 'Asia/Tokyo', order: 0, lifecycle: 'live' }];
  journal.leg_ids = ['leg_osaka0001'];
  journal.moments = [
    { id: 'mom_lunch0001', leg_id: 'leg_osaka0001', local_date: '2026-11-18', media_ids: [], display_order: 0, lifecycle: momentLifecycle }
  ];
  journal.preferences = { [ATLAS_PREF_KEY]: Object.fromEntries(items.map((i) => [i.id, i])) };
  return journal;
}

test('atlas items: the journal schema accepts good items and rejects bad ones', () => {
  assert.doesNotThrow(() => validateJournal(journalWith('trp_invented01', [item()])));
  assert.throws(() => validateAtlasItem(item({ kind: 'secret' }), 'x'), /kind/);
  assert.throws(() => validateAtlasItem(item({ name: ' ' }), 'x'), /name/);
  assert.throws(() => validateAtlasItem(item({ price: { amount: 4, currency: 'yen' } }), 'x'), /currency/);
  assert.throws(() => validateAtlasItem(item({ rating: 4.2 }), 'x'), /rating/);
  assert.throws(() => validateAtlasItem(item({ vs_home: 'better' }), 'x'), /classic/);
  assert.doesNotThrow(() => validateAtlasItem(item({ kind: 'classic', vs_home: 'better', aud: null, price: null }), 'x'));
  const mismatched = journalWith('trp_invented01', [item()]);
  mismatched.preferences[ATLAS_PREF_KEY] = { maccas_other0001: item() };
  assert.throws(() => validateJournal(mismatched), /match its key/);
});

test('atlas items: only live items on live moments in live journals count', () => {
  const live = item();
  const deleted = item({ id: 'maccas_item0002', lifecycle: 'deleted', deleted_at: '2026-11-19T00:00:00Z' });
  assert.deepEqual(liveAtlasItems(journalWith('trp_invented01', [live, deleted])).map((i) => i.id), ['maccas_item0001']);
  assert.deepEqual(liveAtlasItems(journalWith('trp_invented01', [live], 'deleted')), []);
  const gone = journalWith('trp_invented01', [live]);
  gone.lifecycle = 'deleted';
  assert.deepEqual(liveAtlasItems(gone), []);
});

test('atlas settings: home price is a positive AUD amount or null', () => {
  assert.deepEqual(normaliseAtlasSettings({ home_big_mac_aud: 7.954 }), { home_big_mac_aud: 7.95 });
  assert.deepEqual(normaliseAtlasSettings({ home_big_mac_aud: -1 }), { home_big_mac_aud: null });
  assert.deepEqual(normaliseAtlasSettings(undefined), { home_big_mac_aud: null });
});

function fakeRepo(journals, settings = {}) {
  let stored = { settings, version: null };
  return {
    async listJournals() {
      return journals;
    },
    async getJournal(tripId) {
      const journal = journals.find((j) => j.trip_id === tripId);
      if (!journal) throw Object.assign(new Error('Journal not found.'), { code: 'not_found', status: 404 });
      return { journal, version: 'v' };
    },
    async getAtlasSettings() {
      return stored;
    },
    async saveAtlasSettings(next, version) {
      assert.equal(version, stored.version);
      stored = { settings: next, version: 'set1' };
      return stored;
    }
  };
}

function atlasHandler(repo, auth = signedIn) {
  return createTravelAtlasHandler({ env, ...auth, createTravelRepository: () => repo });
}

const req = (url, init) => new Request(`https://example.test${url}`, init);

test('travel-atlas GET gathers items across trips, newest first', async () => {
  const repo = fakeRepo(
    [
      journalWith('trp_invented01', [item()]),
      journalWith('trp_invented02', [item({ id: 'maccas_item0003', date: '2027-01-05', country: 'FR', name: 'Big Mac', kind: 'classic', big_mac: true })])
    ],
    { home_big_mac_aud: 7.95 }
  );
  const response = await atlasHandler(repo)(req('/api/travel-atlas'));
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.deepEqual(data.items.map((i) => [i.id, i.trip_id]), [
    ['maccas_item0003', 'trp_invented02'],
    ['maccas_item0001', 'trp_invented01']
  ]);
  assert.deepEqual(data.settings, { home_big_mac_aud: 7.95 });
  assert.equal(response.headers.get('cache-control'), 'private, no-store');

  const one = await (await atlasHandler(repo)(req('/api/travel-atlas?trip=trp_invented01'))).json();
  assert.deepEqual(one.data.items.map((i) => i.id), ['maccas_item0001']);
  const none = await (await atlasHandler(repo)(req('/api/travel-atlas?trip=trp_nojournal01'))).json();
  assert.deepEqual(none.data.items, []);
});

test('travel-atlas PUT saves the home price and checks the version', async () => {
  const repo = fakeRepo([]);
  const handler = atlasHandler(repo);
  const put = (body) => handler(req('/api/travel-atlas', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  const bad = await put({ home_big_mac_aud: 'lots', settings_version: null });
  assert.equal(bad.status, 400);
  const ok = await put({ home_big_mac_aud: 7.95, settings_version: null });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data, { settings: { home_big_mac_aud: 7.95 }, settings_version: 'set1' });
  const stale = await put({ home_big_mac_aud: 8.1, settings_version: null });
  assert.equal(stale.status, 409);
});

test('travel-atlas refuses requests that are not signed in', async () => {
  const response = await atlasHandler(fakeRepo([]), signedOut)(req('/api/travel-atlas'));
  assert.equal(response.status, 401);
});

test('atlas assets: only slots listed in the manifest, with safe file names', () => {
  const manifest = { slots: { badge: 'badge.png', header: 'logo.svg', sneaky: '../secrets.json', odd: 'x.exe' } };
  assert.equal(slotFile(manifest, 'badge'), 'badge.png');
  assert.equal(slotFile(manifest, 'header'), 'logo.svg');
  assert.equal(slotFile(manifest, 'sneaky'), null);
  assert.equal(slotFile(manifest, 'odd'), null);
  assert.equal(slotFile(manifest, 'missing'), null);
  assert.equal(slotFile(manifest, '__proto__'), null);
  assert.equal(slotFile(manifest, '../badge'), null);
  assert.equal(slotFile({ badge: 'badge.png' }, 'badge'), 'badge.png');
});

function assetHandler(auth = signedIn, files = {}) {
  const reads = [];
  const handler = createTravelAtlasAssetHandler({
    env,
    ...auth,
    createTravelRepository: () => ({}),
    readPrivateJsonFile: async (path) => {
      reads.push(path);
      return { slots: { badge: 'badge.png' } };
    },
    readPrivateFileBytes: async (path) => {
      reads.push(path);
      if (!files[path]) throw Object.assign(new Error('missing'), { status: 404 });
      return files[path];
    }
  });
  return { handler, reads };
}

test('travel-atlas-asset serves a listed slot from the private repository', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const { handler, reads } = assetHandler(signedIn, { 'assets/arches-atlas/badge.png': bytes });
  const response = await handler(req('/api/travel-atlas-asset?slot=badge'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  assert.deepEqual(reads, ['assets/arches-atlas/manifest.json', 'assets/arches-atlas/badge.png']);
});

test('travel-atlas-asset refuses unlisted slots, missing files and signed-out requests', async () => {
  const { handler, reads } = assetHandler(signedIn, {});
  assert.equal((await handler(req('/api/travel-atlas-asset?slot=header'))).status, 404);
  assert.equal((await handler(req('/api/travel-atlas-asset?slot=badge'))).status, 404);
  assert.ok(!reads.includes('assets/arches-atlas/header'));
  const out = assetHandler(signedOut, {});
  const refused = await out.handler(req('/api/travel-atlas-asset?slot=badge'));
  assert.equal(refused.status, 401);
  assert.deepEqual(out.reads, []);
});
