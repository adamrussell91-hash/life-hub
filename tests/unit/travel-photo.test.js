import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { createTravelPhotoGetHandler } from '../../netlify/functions/travel-photo.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 's'.repeat(32) };
const hash = token => createHash('sha256').update(token).digest('hex');

function photoStore() {
  const blobs = new Map([
    ['photos/tph_a1.json', JSON.stringify({ id: 'tph_a1', trip_id: 'trp_live1', mime_type: 'image/jpeg' })],
    ['photos/tph_a1.bin', new Uint8Array([1, 2, 3]).buffer],
    ['photos/tph_d1.json', JSON.stringify({ id: 'tph_d1', trip_id: 'trp_gone1', mime_type: 'image/jpeg' })],
    ['photos/tph_d1.bin', new Uint8Array([4]).buffer]
  ]);
  return {
    async get(key) { return blobs.get(key) ?? null; },
    async getWithMetadata(key) { return blobs.has(key) ? { data: blobs.get(key), metadata: {} } : null; }
  };
}

function handler({ shares, sessionValid = false } = {}) {
  return createTravelPhotoGetHandler({
    env,
    getTravelStore: async () => photoStore(),
    createTravelRepository: () => ({
      async getShareTokens() { return { map: shares, version: 'v' }; },
      async getTrip(id) {
        if (id === 'trp_live1') return { trip: { id, title: 'Invented trip' } };
        if (id === 'trp_gone1') return { trip: { id, title: 'Old trip', status: 'deleted', deleted_at: '2026-10-01T00:00:00Z' } };
        throw Object.assign(new Error('missing'), { status: 404 });
      }
    }),
    verifySessionToken: async () => (sessionValid ? { valid: true, payload: {} } : { valid: false, reason: 'malformed' })
  });
}

const photoRequest = (query, headers = {}) => new Request(`https://api.example/api/travel-photo?${query}`, {
  headers: { origin: 'https://life-hub.adam-russell.com', ...headers }
});

test('owner photo reads are private to the browser, never publicly cacheable', async () => {
  const response = await handler({ shares: {}, sessionValid: true })(photoRequest('id=tph_a1', { cookie: 'life_hub_session=x' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, max-age=86400');
});

test('a trip share link opens that live trip\'s photos; a journal link or a deleted trip does not', async () => {
  const shares = {
    [hash('trip-token')]: { trip_id: 'trp_live1', created_at: '2026-10-01T00:00:00Z' },
    [hash('typed-trip-token')]: { trip_id: 'trp_live1', kind: 'trip' },
    [hash('journal-token')]: { trip_id: 'trp_live1', kind: 'journal' },
    [hash('deleted-trip-token')]: { trip_id: 'trp_gone1' }
  };
  const read = handler({ shares });

  const legacy = await read(photoRequest('id=tph_a1&token=trip-token'));
  assert.equal(legacy.status, 200);
  assert.equal(legacy.headers.get('cache-control'), 'private, max-age=86400');
  assert.equal((await read(photoRequest('id=tph_a1&token=typed-trip-token'))).status, 200);

  assert.equal((await read(photoRequest('id=tph_a1&token=journal-token'))).status, 404);
  assert.equal((await read(photoRequest('id=tph_d1&token=deleted-trip-token'))).status, 404);
  assert.equal((await read(photoRequest('id=tph_d1&token=trip-token'))).status, 404, 'another trip\'s photo');
  assert.equal((await read(photoRequest('id=tph_a1&token=unknown'))).status, 404);
});

test('an <img> must name its origin: a bare same-site image load is refused, a credentialed CORS load is served', async () => {
  const read = handler({ shares: {}, sessionValid: true });
  // What a plain <img> on the hub sends to the API host: no Origin, only fetch metadata.
  const bare = await read(new Request('https://api.example/api/travel-photo?id=tph_a1', {
    headers: { cookie: 'life_hub_session=x', 'sec-fetch-site': 'same-site', 'sec-fetch-dest': 'image' }
  }));
  assert.equal(bare.status, 403);

  // <img crossorigin="use-credentials">, as the Travel hub now sends it.
  const cors = await read(photoRequest('id=tph_a1', {
    cookie: 'life_hub_session=x',
    'sec-fetch-site': 'same-site',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'image'
  }));
  assert.equal(cors.status, 200);
  assert.equal(cors.headers.get('access-control-allow-origin'), 'https://life-hub.adam-russell.com');
  assert.equal(cors.headers.get('access-control-allow-credentials'), 'true');
});
