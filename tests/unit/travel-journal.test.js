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
