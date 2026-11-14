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

function journalWithOneMoment() {
  const journal = emptyJournal('trp_test01');
  journal.legs = [
    {
      id: 'leg_test01',
      trip_id: 'trp_test01',
      destination: 'Test',
      timezone: 'UTC',
      pattern_id: 'generic',
      order: 0,
      lifecycle: 'live'
    }
  ];
  journal.leg_ids = ['leg_test01'];
  journal.moments = [
    {
      id: 'mom_meal01',
      leg_id: 'leg_test01',
      local_date: '2026-03-01',
      media_ids: [],
      display_order: 1,
      lifecycle: 'live'
    }
  ];
  return journal;
}

test('a moment may point at the itinerary stop it was logged from', () => {
  const doc = journalWithOneMoment();
  doc.moments[0].item_id = 'itm_lunchstop01';
  assert.doesNotThrow(() => validateJournal(doc));
  doc.moments[0].item_id = null;
  assert.doesNotThrow(() => validateJournal(doc));
  for (const bad of ['nope', 'itm_!', 42]) {
    const copy = structuredClone(doc);
    copy.moments[0].item_id = bad;
    assert.throws(
      () => validateJournal(copy),
      (err) => err.code === 'validation_error' && String(err.path).endsWith('item_id')
    );
  }
});

test('a moment may carry a meal link with travel extras', () => {
  const doc = journalWithOneMoment();
  doc.moments[0].meal = {
    food_visit_id: 'visit_3f2a',
    mood: 'buzzing',
    vibe: 'tiny bar, standing room',
    with: 'the group'
  };
  assert.doesNotThrow(() => validateJournal(doc));
  doc.moments[0].meal = null;
  assert.doesNotThrow(() => validateJournal(doc));
  for (const meal of [
    { mood: 'x' },
    { food_visit_id: 'bad id!' },
    { food_visit_id: 'visit_1', mood: 'x'.repeat(41) },
    { food_visit_id: 'visit_1', vibe: 'x'.repeat(601) },
    { food_visit_id: 'visit_1', with: 4 }
  ]) {
    const copy = structuredClone(doc);
    copy.moments[0].meal = meal;
    assert.throws(() => validateJournal(copy));
  }
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

test('keepsakes: a record from before keepsakes and a full new one both validate', () => {
  const journal = emptyJournal('trp_test01');
  journal.preferences = {
    cover_media_id: 'med_cover001',
    journal_souvenirs_v1: {
      sv_old: { id: 'sv_old', title: 'Fridge magnet', lifecycle: 'live', created_at: '2027-03-03T10:00:00.000Z' },
      sv_new: {
        id: 'sv_new', title: 'Tram ticket', lifecycle: 'live', created_at: '2027-03-03T10:00:00.000Z',
        kind: 'ticket', source: 'photo', media_id: 'med_ticket01', leg_id: 'leg_test01',
        local_date: '2027-03-03', local_time: '11:20', coordinates: { lat: 38.71, lon: -9.14 }
      },
      sv_hide_itm_train01: {
        id: 'sv_hide_itm_train01', title: 'Test Rail IC200', lifecycle: 'deleted', created_at: '2027-03-03T10:00:00.000Z',
        kind: 'ticket', source: 'booking', item_id: 'itm_train01', deleted_at: '2027-03-04T10:00:00.000Z'
      }
    }
  };
  assert.doesNotThrow(() => validateJournal(journal));
});

test('keepsakes: an unknown kind, source, date or place is rejected', () => {
  const base = { id: 'sv_a', title: 'Thing', lifecycle: 'live', created_at: '2027-03-03T10:00:00.000Z' };
  const cases = [
    [{ kind: 'sticker' }, 'kind'],
    [{ source: 'gift' }, 'source'],
    [{ local_date: '3 March' }, 'local_date'],
    [{ local_time: '9am' }, 'local_time'],
    [{ coordinates: { lat: 120, lon: 0 } }, 'coordinates'],
    [{ item_id: 42 }, 'item_id']
  ];
  for (const [extra, key] of cases) {
    const journal = emptyJournal('trp_test01');
    journal.preferences = { journal_souvenirs_v1: { sv_a: { ...base, ...extra } } };
    assert.throws(
      () => validateJournal(journal),
      (err) => err.code === 'validation_error' && String(err.path).endsWith(`sv_a.${key}`),
      key
    );
  }
  const journal = emptyJournal('trp_test01');
  journal.preferences = { cover_media_id: 7 };
  assert.throws(() => validateJournal(journal), (err) => err.path === 'preferences.cover_media_id');
});
