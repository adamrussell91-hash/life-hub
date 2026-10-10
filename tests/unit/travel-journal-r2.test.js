import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_JOURNAL_MEDIA_BYTES,
  assertJournalMediaKey,
  isJournalMediaKey,
  journalMediaDerivativeKey,
  journalMediaOriginalKey,
  parseJournalMediaSignRequest,
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
