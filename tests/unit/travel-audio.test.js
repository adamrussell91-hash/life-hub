import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  createTravelAudioHandler,
  MAX_AUDIO_BYTES,
  baseAudioMime
} from '../../netlify/functions/travel-audio.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
const ORIGIN = 'https://life-hub.adam-russell.com';
const hash = (token) => createHash('sha256').update(token).digest('hex');

function blobStore(entries = {}) {
  const blobs = new Map(Object.entries(entries));
  return {
    blobs,
    async get(key) {
      return blobs.get(key) ?? null;
    },
    async getWithMetadata(key) {
      return blobs.has(key) ? { data: blobs.get(key), metadata: {} } : null;
    },
    async set(key, value) {
      blobs.set(key, value);
    },
    async delete(key) {
      blobs.delete(key);
    }
  };
}

function seeded() {
  return blobStore({
    'audio/tau_a1.json': JSON.stringify({ id: 'tau_a1', trip_id: 'trp_live1', mime_type: 'audio/mp4' }),
    'audio/tau_a1.bin': new Uint8Array([1, 2, 3, 4]).buffer,
    'audio/tau_o1.json': JSON.stringify({ id: 'tau_o1', trip_id: 'trp_other1', mime_type: 'audio/mp4' }),
    'audio/tau_o1.bin': new Uint8Array([9]).buffer
  });
}

const LIVE_TRIPS = { trp_live1: { id: 'trp_live1', title: 'Invented trip', checkins: [] } };

function handler({ store = seeded(), shares = {}, sessionValid = true, trips = LIVE_TRIPS } = {}) {
  return createTravelAudioHandler({
    env,
    getTravelStore: async () => store,
    createTravelRepository: () => ({
      async getShareTokens() {
        return { map: shares, version: 'v' };
      },
      async getTrip(id) {
        if (trips[id]) return { trip: structuredClone(trips[id]), version: 'v1' };
        throw Object.assign(new Error('Trip not found.'), { status: 404, code: 'not_found' });
      }
    }),
    verifySessionToken: async () =>
      sessionValid ? { valid: true, payload: {} } : { valid: false, reason: 'malformed' }
  });
}

const get = (query, headers = {}) =>
  new Request(`https://api.example/api/travel-audio?${query}`, { headers: { origin: ORIGIN, ...headers } });

function upload(query, file) {
  const form = new FormData();
  if (file) form.append('file', file);
  return new Request(`https://api.example/api/travel-audio?${query}`, {
    method: 'POST',
    headers: { origin: ORIGIN, cookie: 'life_hub_session=x' },
    body: form
  });
}

const clip = (bytes, type, name = 'clip.m4a') => new File([new Uint8Array(bytes)], name, { type });

test('baseAudioMime drops the codec suffix', () => {
  assert.equal(baseAudioMime('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(baseAudioMime(' Audio/MP4 '), 'audio/mp4');
  assert.equal(baseAudioMime(undefined), '');
});

test('uploading a clip stores it against the trip and returns its id', async () => {
  const store = seeded();
  const response = await handler({ store })(
    upload('trip=trp_live1', clip([5, 6, 7], 'audio/webm;codecs=opus', 'clip.webm'))
  );
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.match(data.audio_id, /^tau_[a-z0-9]{12}$/);
  const meta = JSON.parse(store.blobs.get(`audio/${data.audio_id}.json`));
  assert.equal(meta.trip_id, 'trp_live1');
  assert.equal(meta.mime_type, 'audio/webm', 'the codec suffix is dropped');
  assert.equal(meta.size, 3);
  assert.equal(store.blobs.get(`audio/${data.audio_id}.bin`).byteLength, 3);
});

test('upload refuses a wrong type, an empty clip, an oversize clip, no file and no trip', async () => {
  const h = handler();
  assert.equal((await h(upload('trip=trp_live1', clip([1], 'video/mp4')))).status, 400);
  assert.equal((await h(upload('trip=trp_live1', clip([], 'audio/mp4')))).status, 400);
  const big = new File([new Uint8Array(MAX_AUDIO_BYTES + 1)], 'big.m4a', { type: 'audio/mp4' });
  assert.equal((await h(upload('trip=trp_live1', big))).status, 400);
  assert.equal((await h(upload('trip=trp_live1'))).status, 400);
  assert.equal((await h(upload('', clip([1], 'audio/mp4')))).status, 400);
  assert.equal((await h(upload('trip=trp_missing1', clip([1], 'audio/mp4')))).status, 404);
});

test('only the signed-in owner uploads', async () => {
  const response = await handler({ sessionValid: false })(upload('trip=trp_live1', clip([1], 'audio/mp4')));
  assert.equal(response.status, 401);
});

test('a trip link plays that live trip\'s clips; a journal link, another trip\'s clip and an unknown token do not', async () => {
  const shares = {
    [hash('trip-token')]: { trip_id: 'trp_live1' },
    [hash('journal-token')]: { trip_id: 'trp_live1', kind: 'journal' }
  };
  const read = handler({ shares, sessionValid: false });
  const ok = await read(get('id=tau_a1&token=trip-token'));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'audio/mp4');
  assert.equal(ok.headers.get('cache-control'), 'private, max-age=86400');
  assert.equal(ok.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual([...new Uint8Array(await ok.arrayBuffer())], [1, 2, 3, 4]);

  assert.equal((await read(get('id=tau_a1&token=journal-token'))).status, 404);
  assert.equal((await read(get('id=tau_o1&token=trip-token'))).status, 404);
  assert.equal((await read(get('id=tau_a1&token=unknown'))).status, 404);
  assert.equal((await read(get('id=not-an-id&token=trip-token'))).status, 404);
  assert.equal((await read(get('id=tau_a1'))).status, 401, 'no token and no session');
});

test('byte ranges are served so an iPhone can play the clip', async () => {
  const read = handler();
  const part = await read(get('id=tau_a1', { cookie: 'life_hub_session=x', range: 'bytes=0-1' }));
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 0-1/4');
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [1, 2]);

  const tail = await read(get('id=tau_a1', { cookie: 'life_hub_session=x', range: 'bytes=2-' }));
  assert.equal(tail.status, 206);
  assert.equal(tail.headers.get('content-range'), 'bytes 2-3/4');

  const past = await read(get('id=tau_a1', { cookie: 'life_hub_session=x', range: 'bytes=9-' }));
  assert.equal(past.status, 416);
  assert.equal(past.headers.get('content-range'), 'bytes */4');
});

test('a clip must name its origin: a bare same-site media load is refused, a credentialed CORS load is served', async () => {
  const read = handler();
  const bare = await read(
    new Request('https://api.example/api/travel-audio?id=tau_a1', {
      headers: { cookie: 'life_hub_session=x', 'sec-fetch-site': 'same-site', 'sec-fetch-dest': 'audio' }
    })
  );
  assert.equal(bare.status, 403);

  const cors = await read(
    get('id=tau_a1', {
      cookie: 'life_hub_session=x',
      'sec-fetch-site': 'same-site',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'audio'
    })
  );
  assert.equal(cors.status, 200);
  assert.equal(cors.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(cors.headers.get('access-control-allow-credentials'), 'true');
});

test('the owner can delete a draft clip, but not one a postcard uses', async () => {
  const store = seeded();
  store.blobs.set('audio/tau_used1.json', JSON.stringify({ id: 'tau_used1', trip_id: 'trp_live1', mime_type: 'audio/mp4' }));
  store.blobs.set('audio/tau_used1.bin', new Uint8Array([1]).buffer);
  const trips = {
    trp_live1: {
      id: 'trp_live1',
      title: 'Invented trip',
      checkins: [
        {
          id: 'chk_1',
          at: '2027-03-04T10:00:00.000Z',
          city_id: 'lis',
          label: 'Safe',
          item_id: 'itm_1',
          postcard: { photo_id: 'tph_p1', audio_id: 'tau_used1' }
        }
      ]
    }
  };
  const h = handler({ store, trips });
  const del = (id) =>
    h(
      new Request(`https://api.example/api/travel-audio?id=${id}`, {
        method: 'DELETE',
        headers: { origin: ORIGIN, cookie: 'life_hub_session=x' }
      })
    );

  assert.equal((await del('tau_a1')).status, 200);
  assert.equal(store.blobs.has('audio/tau_a1.bin'), false);
  assert.equal(store.blobs.has('audio/tau_a1.json'), false);

  assert.equal((await del('tau_used1')).status, 409);
  assert.equal(store.blobs.has('audio/tau_used1.bin'), true);

  assert.equal((await del('tau_gone9')).status, 200, 'deleting twice is fine');
  assert.equal((await del('nope')).status, 404);
});
