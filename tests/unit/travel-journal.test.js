import test from 'node:test';
import assert from 'node:assert/strict';
import { createTravelJournalHandler } from '../../netlify/functions/travel-journal.mjs';
import { emptyJournal } from '../../netlify/functions/_shared/travel-journal-schema.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };
const TRIP = 'trp_journal_api01';

function fakeJournalRepo() {
  let stored = null;
  let version = null;
  return {
    async getJournal(tripId) {
      if (!stored || stored.trip_id !== tripId) {
        const err = new Error('Journal not found.');
        err.code = 'not_found';
        err.status = 404;
        throw err;
      }
      return { journal: structuredClone(stored), version };
    },
    async createJournal(journal) {
      stored = structuredClone(journal);
      version = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      return { journal: structuredClone(stored), version };
    },
    async saveJournal(journal, ifVersion) {
      if (!stored || ifVersion !== version) {
        const err = new Error('This journal changed somewhere else. Reload to see the latest.');
        err.code = 'conflict';
        err.status = 409;
        throw err;
      }
      stored = structuredClone(journal);
      version = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      return { journal: structuredClone(stored), version };
    }
  };
}

function handlerFor(repo) {
  return createTravelJournalHandler({
    env,
    verifySessionToken: () => ({ valid: true }),
    createTravelRepository: () => repo
  });
}

function request(method, trip, body) {
  const init = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(`https://example.test/api/travel-journal?trip=${encodeURIComponent(trip)}`, init);
}

test('travel-journal GET returns 404 when missing', async () => {
  const response = await handlerFor(fakeJournalRepo())(request('GET', TRIP));
  assert.equal(response.status, 404);
});

test('travel-journal PUT create then GET and update', async () => {
  const repo = fakeJournalRepo();
  const handler = handlerFor(repo);
  const journal = emptyJournal(TRIP);

  const created = await handler(
    request('PUT', TRIP, { create: true, journal })
  );
  const createdBody = await created.json();
  assert.equal(created.status, 200);
  assert.equal(createdBody.ok, true);
  assert.equal(createdBody.data.journal.trip_id, TRIP);
  assert.ok(createdBody.data.version);

  const got = await handler(request('GET', TRIP));
  const gotBody = await got.json();
  assert.equal(got.status, 200);
  assert.equal(gotBody.data.version, createdBody.data.version);

  const next = { ...gotBody.data.journal, title: 'Trip journal', revision: 1 };
  const saved = await handler(
    request('PUT', TRIP, { if_version: gotBody.data.version, journal: next })
  );
  const savedBody = await saved.json();
  assert.equal(saved.status, 200);
  assert.equal(savedBody.data.journal.title, 'Trip journal');
  assert.notEqual(savedBody.data.version, gotBody.data.version);
});

test('travel-journal PUT rejects stale if_version', async () => {
  const repo = fakeJournalRepo();
  const handler = handlerFor(repo);
  await handler(request('PUT', TRIP, { create: true, journal: emptyJournal(TRIP) }));

  const response = await handler(
    request('PUT', TRIP, {
      if_version: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      journal: emptyJournal(TRIP)
    })
  );
  assert.equal(response.status, 409);
});

function journalWithTwoMoments() {
  const journal = emptyJournal(TRIP);
  journal.legs = [
    {
      id: 'leg_test01',
      trip_id: TRIP,
      destination: 'Test',
      timezone: 'UTC',
      pattern_id: 'generic',
      order: 0,
      lifecycle: 'live'
    }
  ];
  journal.leg_ids = ['leg_test01'];
  journal.moments = ['mom_one01', 'mom_two01'].map((id, i) => ({
    id,
    leg_id: 'leg_test01',
    local_date: '2026-03-01',
    media_ids: [],
    display_order: i + 1,
    lifecycle: 'live'
  }));
  return journal;
}

test("travel-journal ordinary save keeps the server's meal links and ignores forged ones", async () => {
  const repo = fakeJournalRepo();
  const handler = handlerFor(repo);
  const doc = journalWithTwoMoments();
  doc.moments[0].meal = { food_visit_id: 'visit_keep' };
  const created = await (await handler(request('PUT', TRIP, { create: true, journal: doc }))).json();

  const stale = structuredClone(doc);
  delete stale.moments[0].meal;
  stale.moments[1].meal = { food_visit_id: 'visit_forged' };
  const res = await handler(
    request('PUT', TRIP, { if_version: created.data.version, journal: stale })
  );
  assert.equal(res.status, 200);
  const saved = (await res.json()).data.journal;
  assert.deepEqual(saved.moments[0].meal, { food_visit_id: 'visit_keep' });
  assert.equal(saved.moments[1].meal, undefined);
});

test('travel-journal ordinary save still conflicts on a stale if_version', async () => {
  const repo = fakeJournalRepo();
  const handler = handlerFor(repo);
  const doc = journalWithTwoMoments();
  await handler(request('PUT', TRIP, { create: true, journal: doc }));
  const res = await handler(
    request('PUT', TRIP, { if_version: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', journal: doc })
  );
  assert.equal(res.status, 409);
});

// A Food Journal + trip snapshot that records each write, like createMealLinkStore.
function fakeMealStore({ travel, travelVersion, visits }) {
  const writes = [];
  return {
    writes,
    create: () => ({
      async read(tripId) {
        return {
          tripId,
          base: { commitSha: 'c'.repeat(40), treeSha: 't'.repeat(40) },
          travel: { journal: structuredClone(travel()), version: travelVersion() },
          food: { journal: { schema_version: 1, visits: structuredClone(visits), recipes: [] }, version: 'f'.repeat(40) }
        };
      },
      async write(snap, args) {
        writes.push(structuredClone(args));
        return { commitSha: 'd'.repeat(40), foodVersion: 'e'.repeat(40), travelVersions: { [snap.tripId]: 'n'.repeat(40) } };
      }
    })
  };
}

function mealHandler(repo, store) {
  return createTravelJournalHandler({
    env,
    verifySessionToken: () => ({ valid: true }),
    createTravelRepository: () => repo,
    createMealLinkStore: store.create
  });
}

async function seededMealTrip() {
  const repo = fakeJournalRepo();
  const doc = journalWithTwoMoments();
  doc.days = [{ id: 'day_test01', leg_id: 'leg_test01', local_date: '2026-03-01', lifecycle: 'live' }];
  doc.moments[0].meal = { food_visit_id: 'visit_one', mood: 'happy' };
  doc.moments[1].meal = { food_visit_id: 'visit_two' };
  const created = await repo.createJournal(doc);
  const visits = [
    { id: 'visit_one', title: 'Lunch', dishes: [] },
    { id: 'visit_two', title: 'Supper', dishes: [] },
    { id: 'visit_other', title: 'Elsewhere', dishes: [] }
  ];
  const store = fakeMealStore({
    travel: () => doc,
    travelVersion: () => created.version,
    visits
  });
  return { repo, doc, created, store };
}

test('travel-journal deleting a day of meal moments tombstones both visits in one write', async () => {
  const { repo, doc, created, store } = await seededMealTrip();
  const saves = [];
  const save = repo.saveJournal;
  repo.saveJournal = async (...args) => (saves.push(args), save(...args));
  const next = structuredClone(doc);
  const at = '2026-03-02T00:00:00.000Z';
  next.days[0] = { ...next.days[0], lifecycle: 'deleted', deleted_at: at };
  next.moments = next.moments.map((m) => ({ ...m, lifecycle: 'deleted', deleted_at: at, deleted_with: 'day_test01' }));
  next.revision = 1;

  const res = await mealHandler(repo, store)(request('PUT', TRIP, { if_version: created.version, journal: next }));
  assert.equal(res.status, 200);
  const body = (await res.json()).data;
  assert.equal(saves.length, 0);
  assert.equal(store.writes.length, 1);
  const [write] = store.writes;
  assert.deepEqual(
    write.food.visits.map((v) => [v.id, v.status]),
    [['visit_one', 'deleted'], ['visit_two', 'deleted'], ['visit_other', undefined]]
  );
  assert.equal(write.travels.length, 1);
  assert.ok(write.travels[0].journal.moments.every((m) => m.meal === undefined && m.lifecycle === 'deleted'));
  assert.equal(body.version, 'n'.repeat(40));
  assert.ok(body.journal.moments.every((m) => m.meal === undefined));
});

test('travel-journal deleting one meal moment keeps the other moment linked', async () => {
  const { repo, doc, created, store } = await seededMealTrip();
  const next = structuredClone(doc);
  next.moments[0] = { ...next.moments[0], lifecycle: 'deleted', deleted_at: '2026-03-02T00:00:00.000Z' };
  delete next.moments[1].meal;

  const res = await mealHandler(repo, store)(request('PUT', TRIP, { if_version: created.version, journal: next }));
  assert.equal(res.status, 200);
  const [write] = store.writes;
  assert.deepEqual(write.food.visits.map((v) => v.status), ['deleted', undefined, undefined]);
  assert.equal(write.travels[0].journal.moments[0].meal, undefined);
  assert.deepEqual(write.travels[0].journal.moments[1].meal, { food_visit_id: 'visit_two' });
});

test('travel-journal deleting a moment without a meal still uses the ordinary save', async () => {
  const { repo, doc, created, store } = await seededMealTrip();
  const plain = structuredClone(doc);
  plain.moments.push({ id: 'mom_three01', leg_id: 'leg_test01', local_date: '2026-03-01', media_ids: [], display_order: 3, lifecycle: 'live' });
  const seeded = await repo.saveJournal(plain, created.version);
  const next = structuredClone(plain);
  next.moments[2] = { ...next.moments[2], lifecycle: 'deleted', deleted_at: '2026-03-02T00:00:00.000Z' };

  const res = await mealHandler(repo, store)(request('PUT', TRIP, { if_version: seeded.version, journal: next }));
  assert.equal(res.status, 200);
  assert.equal(store.writes.length, 0);
  const saved = (await res.json()).data.journal;
  assert.equal(saved.moments[2].lifecycle, 'deleted');
  assert.deepEqual(saved.moments[0].meal, { food_visit_id: 'visit_one', mood: 'happy' });
});

test('travel-journal deleting a meal moment on a stale version is a conflict and writes nothing', async () => {
  const { repo, doc, store } = await seededMealTrip();
  const next = structuredClone(doc);
  next.moments[0] = { ...next.moments[0], lifecycle: 'deleted', deleted_at: '2026-03-02T00:00:00.000Z' };

  const res = await mealHandler(repo, store)(
    request('PUT', TRIP, { if_version: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', journal: next })
  );
  assert.equal(res.status, 409);
  assert.equal(store.writes.length, 0);
});
