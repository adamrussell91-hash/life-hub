import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createTravelPostcardHandler } from '../../netlify/functions/travel-postcard.mjs';

const fixture = JSON.parse(
  readFileSync(new URL('../../apps/travel/fixtures/test-trip.json', import.meta.url), 'utf8')
);
const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
const TRIP = fixture.id;
const ITEM = 'itm_testtodo01';
const NOW = Date.parse('2027-03-04T12:30:00.000Z');

const tick = (extra = {}) => ({
  id: 'chk_tick1',
  at: '2027-03-04T11:00:00.000Z',
  city_id: 'lis',
  label: 'Safe',
  item_id: ITEM,
  ...extra
});
const card = (extra = {}) => ({
  photo_id: 'tph_p1',
  orientation: 'portrait',
  address: ['Rua do Exemplo', 'Lisboa', 'Portugal'],
  ...extra
});

function fakeRepo(checkins) {
  const state = { trip: { ...structuredClone(fixture), checkins }, version: 'v1', saves: [] };
  return {
    state,
    async getTrip(id) {
      if (id !== state.trip.id) throw Object.assign(new Error('Trip not found.'), { code: 'not_found', status: 404 });
      return { trip: structuredClone(state.trip), version: state.version };
    },
    async saveTrip(next, version, message) {
      if (version !== state.version) {
        throw Object.assign(new Error('The trip changed. Reload and try again.'), { code: 'conflict', status: 409 });
      }
      state.trip = structuredClone(next);
      state.version = `v${state.saves.length + 2}`;
      state.saves.push(message);
      return { trip: structuredClone(next), version: state.version };
    }
  };
}

function blobStore({ failDelete = false } = {}) {
  const meta = (id, trip) => JSON.stringify({ id, trip_id: trip });
  const blobs = new Map([
    ['photos/tph_p1.json', meta('tph_p1', TRIP)],
    ['photos/tph_p1.bin', new Uint8Array([1]).buffer],
    ['photos/tph_old1.json', meta('tph_old1', TRIP)],
    ['photos/tph_old1.bin', new Uint8Array([2]).buffer],
    ['photos/tph_o1.json', meta('tph_o1', 'trp_other1')],
    ['audio/tau_a1.json', meta('tau_a1', TRIP)],
    ['audio/tau_a1.bin', new Uint8Array([3]).buffer],
    ['audio/tau_o1.json', meta('tau_o1', 'trp_other1')]
  ]);
  return {
    blobs,
    async get(key) {
      return blobs.get(key) ?? null;
    },
    async delete(key) {
      if (failDelete) throw new Error('blob store down');
      blobs.delete(key);
    }
  };
}

function setup(checkins, storeOptions) {
  const repo = fakeRepo(checkins);
  const store = blobStore(storeOptions);
  const handler = createTravelPostcardHandler({
    env,
    now: () => NOW,
    getTravelStore: async () => store,
    createTravelRepository: () => repo,
    verifySessionToken: async () => ({ valid: true, payload: {} })
  });
  const call = (method, body, query = `trip=${TRIP}&item=${ITEM}`) =>
    handler(
      new Request(`https://api.example/api/travel-postcard?${query}`, {
        method,
        headers: { 'content-type': 'application/json', cookie: 'life_hub_session=x' },
        body: JSON.stringify(body ?? {})
      })
    );
  return { repo, store, call };
}

test('a postcard is written onto the stop\'s latest check-in without moving its time', async () => {
  const earlier = tick({ id: 'chk_tick0', at: '2027-03-04T09:00:00.000Z' });
  const { repo, call } = setup([earlier, tick()]);
  const response = await call('PUT', {
    if_version: 'v1',
    postcard: card({ audio_id: 'tau_a1', audio_s: 21, text: ' All good   here. ', posted_at: '1999-01-01T00:00:00.000Z' })
  });
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.version, 'v2');

  const [first, second] = repo.state.trip.checkins;
  assert.equal(first.postcard, undefined, 'the earlier tick is untouched');
  assert.equal(second.at, '2027-03-04T11:00:00.000Z', 'the safe time does not move');
  assert.equal(second.photo_id, 'tph_p1', 'an older client still finds the photo');
  assert.deepEqual(second.postcard, {
    photo_id: 'tph_p1',
    orientation: 'portrait',
    address: ['Rua do Exemplo', 'Lisboa', 'Portugal'],
    text: 'All good here.',
    audio_id: 'tau_a1',
    audio_s: 21,
    posted_at: '2027-03-04T12:30:00.000Z'
  });
  assert.deepEqual(repo.state.saves, [`travel: postcard from ${ITEM}`]);
});

test('a stop that is not ticked safe, an unknown stop and bad fields are refused', async () => {
  const { repo, call } = setup([]);
  const notTicked = await call('PUT', { postcard: card() });
  assert.equal(notTicked.status, 400);
  assert.equal((await notTicked.json()).error.message, 'Tick this stop safe first.');

  assert.equal((await call('PUT', { postcard: card() }, `trip=${TRIP}&item=itm_nope`)).status, 400);
  assert.equal((await call('PUT', { postcard: card() }, `trip=${TRIP}`)).status, 400);
  assert.equal((await call('PUT', { postcard: card() }, 'trip=trp_missing1&item=x')).status, 404);
  assert.equal((await call('PUT', { postcard: card({ address: [] }) })).status, 400);
  assert.equal((await call('PUT', {})).status, 400);
  assert.equal((await call('POST', { postcard: card() })).status, 405);
  assert.equal(repo.state.saves.length, 0);
});

test('a stop that already has a postcard, or a photo from before postcards, says to remove it first', async () => {
  const existing = setup([tick({ photo_id: 'tph_p1', postcard: { ...card(), posted_at: '2027-03-04T11:30:00.000Z' } })]);
  const again = await existing.call('PUT', { postcard: card() });
  assert.equal(again.status, 409);
  const body = await again.json();
  assert.equal(body.error.code, 'postcard_exists');
  assert.equal(body.error.message, 'This stop already has a postcard. Remove it first.');

  const older = setup([tick({ photo_id: 'tph_old1' })]);
  assert.equal((await older.call('PUT', { postcard: card() })).status, 409);
});

test('a photo or clip from another trip is refused', async () => {
  const { repo, call } = setup([tick()]);
  assert.equal((await call('PUT', { postcard: card({ photo_id: 'tph_o1' }) })).status, 400);
  assert.equal((await call('PUT', { postcard: card({ photo_id: 'tph_missing9' }) })).status, 400);
  assert.equal((await call('PUT', { postcard: card({ audio_id: 'tau_o1', audio_s: 5 }) })).status, 400);
  assert.equal(repo.state.saves.length, 0);
});

test('a stale version is a conflict the client can retry', async () => {
  const { call } = setup([tick()]);
  const response = await call('PUT', { if_version: 'v0', postcard: card() });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'conflict');
});

test('removing a postcard clears every check-in on the stop, keeps the safe tick and deletes the files', async () => {
  const { repo, store, call } = setup([
    tick({ id: 'chk_old', at: '2027-03-04T09:00:00.000Z', photo_id: 'tph_old1' }),
    tick({
      photo_id: 'tph_p1',
      postcard: { ...card({ audio_id: 'tau_a1', audio_s: 21 }), posted_at: '2027-03-04T11:30:00.000Z' }
    })
  ]);
  const response = await call('DELETE', { if_version: 'v1' });
  assert.equal(response.status, 200);

  assert.equal(repo.state.trip.checkins.length, 2, 'the ticks stay');
  for (const c of repo.state.trip.checkins) {
    assert.equal(c.postcard, undefined);
    assert.equal(c.photo_id, undefined);
  }
  assert.deepEqual(repo.state.saves, [`travel: postcard removed from ${ITEM}`]);
  for (const key of ['photos/tph_p1.bin', 'photos/tph_p1.json', 'photos/tph_old1.bin', 'photos/tph_old1.json', 'audio/tau_a1.bin', 'audio/tau_a1.json']) {
    assert.equal(store.blobs.has(key), false, key);
  }
  assert.equal(store.blobs.has('photos/tph_o1.json'), true, 'another trip\'s files are left alone');
});

test('removing with nothing to remove is a 404; a failed file delete does not fail the removal', async () => {
  assert.equal((await setup([tick()]).call('DELETE', {})).status, 404);

  const { repo, call } = setup([tick({ photo_id: 'tph_p1', postcard: { ...card(), posted_at: '2027-03-04T11:30:00.000Z' } })], {
    failDelete: true
  });
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.equal((await call('DELETE', {})).status, 200);
  } finally {
    console.error = quiet;
  }
  assert.equal(repo.state.trip.checkins[0].postcard, undefined);
});
