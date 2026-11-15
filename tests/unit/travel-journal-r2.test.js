import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_JOURNAL_MEDIA_BYTES,
  assertJournalMediaKey,
  isJournalMediaKey,
  journalMediaDerivativeKey,
  journalMediaOriginalKey,
  parseJournalMediaSignRequest,
  travelJournalPresignGet,
  travelJournalPresignPut,
  travelJournalR2Unbound,
  verifyHeadObject
} from '../../netlify/functions/_shared/travel-journal-r2.mjs';

const TRIP = 'trp_journal_r201';
const MEDIA = 'med_journal_r201';
const CHECKSUM = 'a'.repeat(64);

test('isJournalMediaKey accepts canonical keys and rejects foreign prefixes', () => {
  const canonical = journalMediaOriginalKey(TRIP, MEDIA);
  assert.equal(isJournalMediaKey(TRIP, canonical), true);
  assert.equal(isJournalMediaKey(TRIP, 'travel/journal/other_trip/x/original'), false);
  assert.equal(isJournalMediaKey(TRIP, 'knowledge/uploads/secret.jpg'), false);
  assert.throws(() => assertJournalMediaKey(TRIP, 'knowledge/evil'), (err) => {
    assert.equal(err.code, 'validation_error');
    assert.equal(err.status, 400);
    return true;
  });
  assert.doesNotThrow(() => assertJournalMediaKey(TRIP, canonical));
});

test('journal media keys stay under travel/journal prefix', () => {
  assert.equal(
    journalMediaOriginalKey(TRIP, MEDIA),
    `travel/journal/${TRIP}/${MEDIA}/original`
  );
  assert.equal(
    journalMediaDerivativeKey(TRIP, MEDIA, 320),
    `travel/journal/${TRIP}/${MEDIA}/der/320.jpg`
  );
  assert.equal(
    journalMediaDerivativeKey(TRIP, MEDIA, 960),
    `travel/journal/${TRIP}/${MEDIA}/der/960.jpg`
  );
});

test('parseJournalMediaSignRequest rejects files over 50MB', () => {
  const parsed = parseJournalMediaSignRequest({
    trip_id: TRIP,
    media_id: MEDIA,
    content_type: 'image/jpeg',
    byte_size: MAX_JOURNAL_MEDIA_BYTES + 1,
    checksum: CHECKSUM,
    purpose: 'original'
  });
  assert.equal(parsed.error, 'File exceeds 50MB journal media limit');
});

test('travelJournalPresignPut throws travel_journal_r2_unbound when R2 env missing', async () => {
  await assert.rejects(
    () => travelJournalPresignPut({}, { key: 'travel/journal/x', contentType: 'image/jpeg' }),
    (err) => err.code === travelJournalR2Unbound().code && err.status === 503
  );
});

test('verifyHeadObject compares metadata checksum and byte size', () => {
  const ok = verifyHeadObject(
    { contentLength: 1200, metadata: { checksum: CHECKSUM } },
    { byte_size: 1200, checksum: CHECKSUM }
  );
  assert.equal(ok.ok, true);

  const bad = verifyHeadObject(
    { contentLength: 1200, metadata: { checksum: 'b'.repeat(64) } },
    { byte_size: 1200, checksum: CHECKSUM }
  );
  assert.equal(bad.ok, false);
});

test('parseJournalMediaSignRequest mints derivative sign payload', () => {
  const parsed = parseJournalMediaSignRequest({
    trip_id: TRIP,
    media_id: MEDIA,
    content_type: 'image/jpeg',
    byte_size: 4096,
    checksum: CHECKSUM,
    purpose: 'derivative',
    derivative_width: 1600
  });
  assert.ok(parsed.value);
  assert.equal(parsed.value.key, `travel/journal/${TRIP}/${MEDIA}/der/1600.jpg`);
});

// R2 answers 501 NotImplemented to the SDK's default checksum mode: a signed
// PUT that names a CRC32 (of an empty body) fails, and a signed GET with
// x-amz-checksum-mode returns XML instead of the photo or the voice note.
test('signed journal URLs carry no SDK checksum parameters R2 rejects', async () => {
  const env = {
    R2_ACCOUNT_ID: 'acct',
    R2_BUCKET: 'bucket',
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret'
  };
  const key = journalMediaDerivativeKey(TRIP, MEDIA, 960);
  const put = new URL(
    await travelJournalPresignPut(env, { key, contentType: 'image/jpeg', checksum: CHECKSUM })
  );
  const get = new URL(await travelJournalPresignGet(env, { key }));
  for (const url of [put, get]) {
    const names = [...url.searchParams.keys()].map((name) => name.toLowerCase());
    assert.deepEqual(
      names.filter((name) => name.startsWith('x-amz-checksum') || name === 'x-amz-sdk-checksum-algorithm'),
      [],
      url.toString()
    );
  }
});
