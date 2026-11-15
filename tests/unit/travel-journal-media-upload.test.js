import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createTravelJournalMediaUploadHandler } from '../../netlify/functions/travel-journal-media-upload.mjs';
import { JOURNAL_RELAY_MAX_BYTES } from '../../netlify/functions/_shared/travel-journal-r2.mjs';
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
const TRIP = 'trp_journal_upload01';
const MEDIA = 'med_journal_upload01';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function memoryRepo() {
  const journal = emptyJournal(TRIP);
  journal.media.push({ id: MEDIA, lifecycle: 'live', upload_state: 'pending', content_type: 'image/heic' });
  let stored = journal;
  let version = 'v1';
  let saves = 0;
  return {
    get stored() {
      return stored;
    },
    async getJournal() {
      return { journal: structuredClone(stored), version };
    },
    async saveJournal(next, ifVersion) {
      if (ifVersion !== version) throw Object.assign(new Error('conflict'), { code: 'conflict', status: 409 });
      saves += 1;
      stored = structuredClone(next);
      version = `v${1 + saves}`;
      return { journal: structuredClone(stored), version };
    }
  };
}

function setup() {
  const repo = memoryRepo();
  const puts = [];
  const handler = createTravelJournalMediaUploadHandler({
    env,
    verifySessionToken: () => ({ valid: true }),
    createTravelRepository: () => repo,
    putObject: async (input) => {
      puts.push(input);
    }
  });
  return { repo, puts, handler };
}

function upload(bytes, query, contentType = 'image/jpeg') {
  const params = new URLSearchParams({ trip: TRIP, id: MEDIA, checksum: sha256(bytes), ...query });
  return new Request(`https://api.example.test/api/travel-journal-media-upload?${params}`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': contentType },
    body: bytes
  });
}

// The page sends the bytes to the API, which stores them itself: the upload
// never depends on the bucket accepting a PUT from the browser.
test('a photo copy sent to the API is stored and recorded, and the photo waits for its original', async () => {
  const { repo, puts, handler } = setup();
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 9, 9, 9]);
  const res = await handler(upload(jpeg, { purpose: 'derivative', width: '960' }));
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(puts.length, 1);
  assert.equal(puts[0].key, `travel/journal/${TRIP}/${MEDIA}/der/960.jpg`);
  assert.equal(puts[0].contentType, 'image/jpeg');
  assert.deepEqual(new Uint8Array(puts[0].body), jpeg);
  assert.equal(puts[0].checksum, sha256(jpeg));
  const row = repo.stored.media[0];
  assert.equal(row.derivative_keys['960'], `travel/journal/${TRIP}/${MEDIA}/der/960.jpg`);
  // Backed up means the original is safe too; a copy alone is not that.
  assert.equal(row.upload_state, 'pending');
  assert.equal(body.data.upload_state, 'pending');
  assert.equal(body.data.version, 'v2');
});

test('the original sent to the API marks the photo backed up', async () => {
  const { repo, handler } = setup();
  const heic = new Uint8Array([1, 2, 3, 4, 5]);
  const res = await handler(upload(heic, { purpose: 'original' }, 'image/heic'));
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  const row = repo.stored.media[0];
  assert.equal(row.upload_state, 'backed_up');
  assert.equal(row.original_key, `travel/journal/${TRIP}/${MEDIA}/original`);
  assert.equal(row.byte_size, 5);
  assert.equal(row.checksum, sha256(heic));
  assert.equal(body.data.upload_state, 'backed_up');
});

test('bytes that do not match their checksum are refused and not stored', async () => {
  const { puts, handler } = setup();
  const params = new URLSearchParams({ trip: TRIP, id: MEDIA, purpose: 'original', checksum: 'c'.repeat(64) });
  const res = await handler(
    new Request(`https://api.example.test/api/travel-journal-media-upload?${params}`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'audio/mp4' },
      body: new Uint8Array([1, 2, 3])
    })
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'verify_failed');
  assert.equal(puts.length, 0);
});

test('a file too big to send through the API is refused so the page can use a signed upload', async () => {
  const { puts, handler } = setup();
  const big = new Uint8Array(JOURNAL_RELAY_MAX_BYTES + 1);
  const res = await handler(upload(big, { purpose: 'original' }));
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error.code, 'too_large');
  assert.equal(puts.length, 0);
});

test('bytes for a photo the journal does not hold are refused before anything is stored', async () => {
  const { puts, handler } = setup();
  const bytes = new Uint8Array([4, 4]);
  const params = new URLSearchParams({
    trip: TRIP,
    id: 'med_not_in_journal',
    purpose: 'original',
    checksum: sha256(bytes)
  });
  const res = await handler(
    new Request(`https://api.example.test/api/travel-journal-media-upload?${params}`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'image/jpeg' },
      body: bytes
    })
  );
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'not_found');
  assert.equal(puts.length, 0);
});

test('a copy must be a JPEG at one of the three widths', async () => {
  const { puts, handler } = setup();
  const res = await handler(upload(new Uint8Array([1]), { purpose: 'derivative', width: '500' }));
  assert.equal(res.status, 400);
  assert.equal(puts.length, 0);
});
