import test from 'node:test';
import assert from 'node:assert/strict';
import { createTravelNoticingHandler } from '../../netlify/functions/travel-noticing.mjs';
import { buildNoticingHistory } from '../../netlify/functions/_shared/travel-noticing-history.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };
const signedIn = { verifySessionToken: () => ({ valid: true }) };
const signedOut = { verifySessionToken: () => ({ valid: false }) };

const pastTrip = {
  id: 'trp_past0001', title: 'Invented north', start_date: '2025-03-01', end_date: '2025-03-10',
  cities: [{ id: 'bgo', name: 'Bergen', country: 'Norway', start_date: '2025-03-01', end_date: '2025-03-10' }]
};
const nowTrip = {
  id: 'trp_now00001', title: 'Invented south', start_date: '2027-03-03', end_date: '2027-03-07',
  cities: [{ id: 'lis', name: 'Lisbon', country: 'Portugal', start_date: '2027-03-03', end_date: '2027-03-07' }]
};
const moment = (id, date, time, extra = {}) => ({
  id, leg_id: 'leg_bergen01', local_date: date, local_time: time, media_ids: [], display_order: 1, lifecycle: 'live', ...extra
});
const pastJournal = {
  trip_id: 'trp_past0001', lifecycle: 'live',
  legs: [{ id: 'leg_bergen01', city_id: 'bgo', destination: 'Bergen', lifecycle: 'live' }],
  media: [
    { id: 'med_a', lifecycle: 'live', content_type: 'image/jpeg' },
    { id: 'med_b', lifecycle: 'live', content_type: 'image/jpeg' },
    { id: 'med_gone', lifecycle: 'deleted', content_type: 'image/jpeg' },
    { id: 'med_sound', lifecycle: 'live', content_type: 'audio/mp4' },
    { id: 'med_partner', lifecycle: 'live', content_type: 'image/jpeg' }
  ],
  moments: [
    moment('mom_1', '2025-03-05', '08:10', { media_ids: ['med_a', 'med_gone', 'med_sound'], coordinates: { lat: 60.39, lon: 5.32 }, place: { name: 'Bryggen' } }),
    moment('mom_2', '2025-03-05', '21:40', { media_ids: ['med_b'], coordinates: { lat: 60.45, lon: 5.3 } }),
    moment('mom_3', '2025-03-05', '23:00', { media_ids: ['med_partner'], author: 'partner', text: 'Partner line' }),
    moment('mom_4', '2025-03-06', '10:00', { lifecycle: 'deleted', media_ids: ['med_a'] })
  ]
};

test('noticing history: other trips only, with each day counted from the owner’s live moments', () => {
  const history = buildNoticingHistory({ trips: [nowTrip, pastTrip], journals: [pastJournal], exceptTripId: 'trp_now00001' });
  assert.deepEqual(history.trips.map((t) => [t.id, t.days, t.cities[0].country]), [['trp_past0001', 10, 'Norway']]);
  assert.deepEqual(history.days, [
    {
      trip_id: 'trp_past0001', date: '2025-03-05', city: 'Bergen', country: 'Norway', photos: 2,
      first_time: '08:10', last_time: '21:40',
      north: { lat: 60.45, place: 'Bergen' }, south: { lat: 60.39, place: 'Bryggen' },
      photo_ids: ['med_a', 'med_b']
    }
  ]);
  // Nothing of Partner's, nothing deleted, no words at all.
  const text = JSON.stringify(history);
  assert.ok(!text.includes('med_partner') && !text.includes('Partner line') && !text.includes('med_gone'));
});

test('travel-noticing: needs a session and a trip id, and returns the history', async () => {
  const deps = { env, loadTrips: async () => [nowTrip, pastTrip], loadJournals: async () => [pastJournal], github: {}, createTravelRepository: () => ({}) };
  const url = 'https://life-hub.test/api/travel-noticing';
  const out = await createTravelNoticingHandler({ ...deps, ...signedOut })(new Request(`${url}?trip=trp_now00001`));
  assert.equal(out.status, 401);
  const bad = await createTravelNoticingHandler({ ...deps, ...signedIn })(new Request(`${url}?trip=nope`));
  assert.equal(bad.status, 400);
  const post = await createTravelNoticingHandler({ ...deps, ...signedIn })(new Request(`${url}?trip=trp_now00001`, { method: 'POST' }));
  assert.equal(post.status, 405);
  const ok = await createTravelNoticingHandler({ ...deps, ...signedIn })(new Request(`${url}?trip=trp_now00001`));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.data.history.trips.length, 1);
  assert.equal(body.data.history.days[0].city, 'Bergen');
  assert.match(ok.headers.get('cache-control'), /no-store/);
});
