import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyJournal,
  makeJournalId,
  makeLegId,
  makeMomentId,
  makeMediaId,
  makeTransitionId,
  makeOperationId,
  validateJournal
} from '../../netlify/functions/_shared/travel-journal-schema.mjs';

test('emptyJournal links to trip_id and validates', () => {
  const journal = emptyJournal('trp_kl_ist_fixture');
  const validated = validateJournal(journal);
  assert.equal(validated.trip_id, 'trp_kl_ist_fixture');
  assert.equal(validated.schema_version, 1);
  assert.match(validated.id, /^jrn_/);
  assert.deepEqual(validated.leg_ids, []);
  assert.equal(validated.legs.length, 0);
  assert.equal(validated.moments.length, 0);
});

test('validateJournal rejects missing schema_version', () => {
  const journal = emptyJournal('trp_test01');
  delete journal.schema_version;
  assert.throws(
    () => validateJournal(journal),
    (err) => err.code === 'validation_error' && err.path === 'schema_version'
  );
});

test('validateJournal rejects unknown location_source on moments', () => {
  const journal = emptyJournal('trp_test01');
  const legId = 'leg_test01';
  journal.legs = [
    {
      id: legId,
      trip_id: 'trp_test01',
      destination: 'Test',
      timezone: 'UTC',
      pattern_id: 'generic',
      order: 0,
      lifecycle: 'live'
    }
  ];
  journal.leg_ids = [legId];
  journal.moments = [
    {
      id: 'mom_badsource01',
      leg_id: 'leg_test01',
      local_date: '2026-03-01',
      media_ids: [],
      display_order: 1,
      lifecycle: 'live',
      location_source: 'city_centre'
    }
  ];
  assert.throws(
    () => validateJournal(journal),
    (err) =>
      err.code === 'validation_error' &&
      String(err.path).includes('location_source')
  );
});

test('validateJournal rejects media keys outside travel/journal trip namespace', () => {
  const tripId = 'trp_test01';
  const journal = emptyJournal(tripId);
  const mediaId = makeMediaId();
  journal.media = [
    {
      id: mediaId,
      lifecycle: 'live',
      original_key: 'knowledge/other-hub/photo.jpg'
    }
  ];
  assert.throws(
    () => validateJournal(journal),
    (err) => err.code === 'validation_error' && String(err.path).includes('original_key')
  );

  journal.media[0].original_key = `travel/journal/${tripId}/${mediaId}/original`;
  journal.media[0].derivative_keys = { 320: 'travel/journal/wrong_trip/x/der/320.jpg' };
  assert.throws(
    () => validateJournal(journal),
    (err) => err.code === 'validation_error' && String(err.path).includes('derivative_keys')
  );
});

test('journal id helpers use required prefixes', () => {
  assert.match(makeJournalId(), /^jrn_[a-z2-7]{12}$/);
  assert.match(makeLegId(), /^leg_[a-z2-7]{12}$/);
  assert.match(makeMomentId(), /^mom_[a-z2-7]{12}$/);
  assert.match(makeMediaId(), /^med_[a-z2-7]{12}$/);
  assert.match(makeTransitionId(), /^trn_[a-z2-7]{12}$/);
  assert.match(makeOperationId(), /^op_[a-z2-7]{12}$/);
});
