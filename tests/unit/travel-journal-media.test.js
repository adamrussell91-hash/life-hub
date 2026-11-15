import test from 'node:test';
import assert from 'node:assert/strict';
import { createTravelJournalMediaHandler } from '../../netlify/functions/travel-journal-media.mjs';
import { emptyJournal } from '../../netlify/functions/_shared/travel-journal-schema.mjs';

const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: 'x'.repeat(32),
  R2_ACCOUNT_ID: 'acct',
  R2_BUCKET: 'bucket',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret'
};
const ORIGIN = 'https://life-hub.adam-russell.com';
const TRIP = 'trp_journal_serve01';
const PHOTO = 'med_journal_photo01';
const SOUND = 'med_journal_sound01';

function repo() {
  const journal = emptyJournal(TRIP);
  journal.media.push(
    { id: PHOTO, lifecycle: 'live', upload_state: 'backed_up', content_type: 'image/heic' },
    { id: SOUND, lifecycle: 'live', upload_state: 'backed_up', content_type: 'audio/mp4' }
  );
  return {
    async getJournal() {
      return { journal: structuredClone(journal), version: 'v1' };
    }
  };
}

function handlerWith(getObject, extra = {}) {
  const calls = [];
  const handler = createTravelJournalMediaHandler({
    env,
    verifySessionToken: () => ({ valid: true }),
    createTravelRepository: () => repo(),
    getObject: async (input) => {
      calls.push(input);
      return getObject(input);
    },
    signGet: async ({ key }) => `https://r2.example/${key}?signed=1`,
    ...extra
  });
  return { handler, calls };
}

function get(query, headers = {}) {
  return new Request(`https://api.example.test/api/travel-journal-media?${query}`, {
    headers: { origin: ORIGIN, ...headers }
  });
}

// The page loads photos and voice notes as credentialed CORS requests to this
// API. The bucket's own signed URLs cannot answer those, so the bytes come from here.
test('a photo copy is served from the API to the journal page, with credentials', async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
  const { handler, calls } = handlerWith(async () => ({ bytes: jpeg, contentType: 'image/jpeg' }));
  const res = await handler(get(`trip=${TRIP}&id=${PHOTO}&variant=derivative&width=960`));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
  assert.match(res.headers.get('cache-control'), /^private/);
  assert.doesNotMatch(res.headers.get('cache-control'), /no-store/);
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), jpeg);
  assert.equal(calls[0].key, `travel/journal/${TRIP}/${PHOTO}/der/960.jpg`);
  assert.equal(calls[0].range, undefined);
});

// iOS Safari plays audio only from a server that answers byte ranges.
test('a voice note answers a byte range with 206 and Content-Range', async () => {
  const { handler, calls } = handlerWith(async () => ({
    bytes: new Uint8Array([7, 8]),
    contentType: 'audio/mp4',
    contentRange: 'bytes 0-1/5000'
  }));
  const res = await handler(get(`trip=${TRIP}&id=${SOUND}&variant=original`, { range: 'bytes=0-1' }));
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), 'bytes 0-1/5000');
  assert.equal(res.headers.get('content-type'), 'audio/mp4');
  assert.equal(res.headers.get('content-length'), '2');
  assert.match(res.headers.get('access-control-expose-headers'), /content-range/);
  assert.equal(calls[0].range, 'bytes=0-1');
  assert.equal(calls[0].key, `travel/journal/${TRIP}/${SOUND}/original`);
});

test('a range the object cannot satisfy answers 416', async () => {
  const { handler } = handlerWith(async () => ({ invalidRange: true }));
  const res = await handler(get(`trip=${TRIP}&id=${SOUND}&variant=original`, { range: 'bytes=9000-' }));
  assert.equal(res.status, 416);
});

test('a copy not yet in storage is a 404 that is not cached', async () => {
  const { handler } = handlerWith(async () => null);
  const res = await handler(get(`trip=${TRIP}&id=${PHOTO}&variant=derivative&width=320`));
  assert.equal(res.status, 404);
  assert.match(res.headers.get('cache-control'), /no-store/);
});

test('an object too big to send through the API still redirects to storage', async () => {
  const { handler } = handlerWith(async () => ({ tooLarge: true }));
  const res = await handler(get(`trip=${TRIP}&id=${PHOTO}&variant=original`));
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), `https://r2.example/travel/journal/${TRIP}/${PHOTO}/original?signed=1`);
});

test('format=json still answers with a signed URL', async () => {
  const { handler, calls } = handlerWith(async () => {
    throw new Error('should not read the object');
  });
  const res = await handler(get(`trip=${TRIP}&id=${PHOTO}&variant=derivative&width=320&format=json`));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.data.url, `https://r2.example/travel/journal/${TRIP}/${PHOTO}/der/320.jpg?signed=1`);
  assert.equal(calls.length, 0);
});

test('the preflight for a ranged audio request allows the Range header', async () => {
  const { handler } = handlerWith(async () => null);
  const res = await handler(
    new Request('https://api.example.test/api/travel-journal-media', {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-headers': 'range' }
    })
  );
  assert.equal(res.status, 204);
  assert.match(res.headers.get('access-control-allow-headers'), /(^|, )range(,|$)/);
});

test('a plain image request with no Origin is still refused', async () => {
  const { handler } = handlerWith(async () => ({ bytes: new Uint8Array([1]) }));
  const res = await handler(
    new Request(`https://api.example.test/api/travel-journal-media?trip=${TRIP}&id=${PHOTO}&variant=derivative&width=320`, {
      headers: { 'sec-fetch-site': 'same-site' }
    })
  );
  assert.equal(res.status, 403);
});
