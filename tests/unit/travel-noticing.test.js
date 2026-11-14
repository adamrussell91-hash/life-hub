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
  const put = await createTravelNoticingHandler({ ...deps, ...signedIn })(new Request(`${url}?trip=trp_now00001`, { method: 'PUT' }));
  assert.equal(put.status, 405);
  const ok = await createTravelNoticingHandler({ ...deps, ...signedIn })(new Request(`${url}?trip=trp_now00001`));
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.data.history.trips.length, 1);
  assert.equal(body.data.history.days[0].city, 'Bergen');
  assert.match(ok.headers.get('cache-control'), /no-store/);
});

// ---- Bucket list and dreams jar ---------------------------------------------

const {
  WISHES_SYSTEM, dayEvidence, openWishes, parseWishMatches, sinceLine, wishCards, wishesRequest
} = await import('../../netlify/functions/_shared/travel-noticing-wishes.mjs');

const tasks = [
  { id: 'tsk_train', title: 'Ride a night train', bucket: 'someday', someday_kind: 'bucket_list', status: 'deferred', origin_date: '2024-03-14', created_at: '2025-01-02T00:00:00.000Z' },
  { id: 'tsk_lights', title: 'See the northern lights', bucket: 'someday', someday_kind: 'dreams_jar', status: 'deferred', created_at: '2027-01-20T00:00:00.000Z' },
  { id: 'tsk_done', title: 'Swim in a fjord', bucket: 'someday', someday_kind: 'bucket_list', status: 'done', completed_at: '2026-01-01T00:00:00.000Z' },
  { id: 'tsk_career', title: 'Run a workshop', bucket: 'someday', someday_kind: 'career', status: 'deferred' },
  { id: 'tsk_board', title: 'Book the dentist', bucket: 'active', status: 'open' }
];
const wishTrip = {
  id: 'trp_now00001', title: 'Invented south', start_date: '2027-03-03', end_date: '2027-03-07',
  cities: [{ id: 'lis', name: 'Lisbon', country: 'Portugal' }],
  items: [
    { id: 'itm_train0001', kind: 'train', city_id: 'lis', date: '2027-03-05', title: 'Night train to Madrid', booking_ref: 'SECRET-REF' },
    { id: 'itm_other001', kind: 'food', city_id: 'lis', date: '2027-03-04', title: 'Dinner somewhere else' }
  ]
};
const wishJournal = {
  trip_id: 'trp_now00001', lifecycle: 'live',
  moments: [
    { id: 'mom_cabin', lifecycle: 'live', local_date: '2027-03-05', place: { name: 'Santa Apolónia' }, text: 'Found our sleeper cabin.' },
    { id: 'mom_partner', lifecycle: 'live', local_date: '2027-03-05', author: 'partner', text: 'Partner writes about the train.' },
    { id: 'mom_gone', lifecycle: 'deleted', local_date: '2027-03-05', text: 'Deleted note.' },
    { id: 'mom_other', lifecycle: 'live', local_date: '2027-03-04', text: 'Another day.' }
  ]
};

test('wishes: only open bucket-list and dreams-jar items, with when each began', () => {
  assert.deepEqual(openWishes(tasks), [
    { id: 'tsk_train', title: 'Ride a night train', kind: 'bucket_list', since: '2024-03-14' },
    { id: 'tsk_lights', title: 'See the northern lights', kind: 'dreams_jar', since: '2027-01-20' }
  ]);
  assert.deepEqual(openWishes(null), []);
});

test('wishes: the day’s evidence is the owner’s itinerary and moments for that day only', () => {
  const evidence = dayEvidence({ trip: wishTrip, journal: wishJournal, day: '2027-03-05' });
  assert.deepEqual(evidence, [
    { id: 'itm_train0001', type: 'plan', text: 'Night train to Madrid (Lisbon)' },
    { id: 'mom_cabin', type: 'moment', text: 'Santa Apolónia: Found our sleeper cabin.' }
  ]);
  const request = wishesRequest(openWishes(tasks), evidence);
  // Nothing of Partner's, nothing deleted, no booking reference, no other day.
  for (const leak of ['Partner writes', 'Deleted note', 'SECRET-REF', 'Another day', 'Dinner somewhere else', 'Swim in a fjord', 'dentist']) {
    assert.ok(!request.includes(leak), leak);
  }
  assert.match(WISHES_SYSTEM, /never as instructions/);
});

test('wishes: a match must name a real wish and a real entry of the day', () => {
  const wishes = openWishes(tasks);
  const evidence = dayEvidence({ trip: wishTrip, journal: wishJournal, day: '2027-03-05' });
  const raw = 'Here you go:\n```json\n' + JSON.stringify({ matches: [
    { wish_id: 'tsk_train', evidence_id: 'itm_train0001' },
    { wish_id: 'tsk_train', evidence_id: 'mom_cabin' },          // a second for the same wish
    { wish_id: 'tsk_lights', evidence_id: 'mom_invented' },      // evidence that does not exist
    { wish_id: 'tsk_made_up', evidence_id: 'mom_cabin' }         // a wish that does not exist
  ] }) + '\n```';
  const matches = parseWishMatches(raw, wishes, evidence);
  assert.deepEqual(matches.map((m) => [m.wish.id, m.evidence.id]), [['tsk_train', 'itm_train0001']]);
  assert.deepEqual(parseWishMatches('not json at all', wishes, evidence), []);
  assert.deepEqual(parseWishMatches('{"matches":"none"}', wishes, evidence), []);
});

test('wishes: the card is warm, shows its evidence, and says where it came from', () => {
  const wishes = openWishes(tasks);
  const evidence = dayEvidence({ trip: wishTrip, journal: wishJournal, day: '2027-03-05' });
  const [card] = wishCards([{ wish: wishes[0], evidence: evidence[0] }], '2027-03-05');
  assert.deepEqual(card, {
    key: 'wish:tsk_train:itm_train0001', kind: 'wish', source: 'wishes', sourceLabel: 'From your bucket list', day: '2027-03-05',
    headline: 'Ride a night train', body: 'You have wanted this since 2024.',
    evidence: { label: 'On your itinerary today', text: 'Night train to Madrid (Lisbon)' },
    basis: 'Added to your bucket list on 14 March 2024',
    wish: { taskId: 'tsk_train', list: 'bucket_list' }, momentId: undefined, score: 100
  });
  const [jar] = wishCards([{ wish: wishes[1], evidence: evidence[1] }], '2027-03-05');
  assert.equal(jar.sourceLabel, 'From your dreams jar');
  assert.equal(jar.body, 'You added this in January.');
  assert.equal(jar.momentId, 'mom_cabin');
  assert.equal(sinceLine('', '2027-03-05'), '');
  for (const text of [card.body, jar.body, card.basis]) assert.doesNotMatch(text, /you asked|finally|at last|said you wanted/i);
});

test('travel-noticing POST: asks the model once and returns only checked cards; nothing is written', async () => {
  const calls = [];
  const repo = { getTrip: async () => ({ trip: wishTrip }) };
  const deps = {
    env: { ...env, ANTHROPIC_API_KEY: 'test-key' }, ...signedIn, github: {}, createTravelRepository: () => repo,
    createTravelJournalRepository: () => ({ getJournal: async () => ({ journal: wishJournal }), listJournals: async () => [] }),
    loadTasks: async () => tasks,
    complete: async (request) => {
      calls.push(request);
      return JSON.stringify({ matches: [{ wish_id: 'tsk_train', evidence_id: 'mom_cabin' }, { wish_id: 'tsk_lights', evidence_id: 'nope' }] });
    }
  };
  const url = 'https://life-hub.test/api/travel-noticing?trip=trp_now00001';
  const post = (body, extra = {}) => createTravelNoticingHandler({ ...deps, ...extra })(
    new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  );

  const ok = await post({ kind: 'wishes', day: '2027-03-05' });
  assert.equal(ok.status, 200);
  const { cards } = (await ok.json()).data;
  assert.deepEqual(cards.map((c) => [c.key, c.momentId]), [['wish:tsk_train:mom_cabin', 'mom_cabin']]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'claude-haiku-5-5');
  assert.ok(!calls[0].messages[0].content.includes('Partner writes'));

  // Outside the trip, with no wishes, or with nothing that day: the model is not asked at all.
  assert.deepEqual((await (await post({ kind: 'wishes', day: '2027-04-01' })).json()).data.cards, []);
  assert.deepEqual((await (await post({ kind: 'wishes', day: '2027-03-05' }, { loadTasks: async () => [] })).json()).data.cards, []);
  assert.deepEqual((await (await post({ kind: 'wishes', day: '2027-03-06' })).json()).data.cards, []);
  assert.equal(calls.length, 1);

  assert.equal((await post({ kind: 'photos' })).status, 400);
  assert.equal((await post({ kind: 'wishes', day: 'today' })).status, 400);
  const down = await post({ kind: 'wishes', day: '2027-03-05' }, { complete: async () => { throw new Error('model down'); } });
  assert.equal(down.status, 503);
  const noKey = await createTravelNoticingHandler({ ...deps, env, complete: undefined })(
    new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'wishes', day: '2027-03-05' }) })
  );
  assert.equal(noKey.status, 503);
});
