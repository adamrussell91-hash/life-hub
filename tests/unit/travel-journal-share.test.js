import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { emptyJournal } from '../../netlify/functions/_shared/travel-journal-schema.mjs';
import {
  buildSharedJournalPayload,
  collectSharedMomentIds,
  findForbiddenSharePayloadKeys
} from '../../netlify/functions/_shared/travel-journal-share-privacy.mjs';
import { createTravelJournalShareHandler } from '../../netlify/functions/travel-journal-share.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };
const TRIP = 'trp_journal_share01';

function baseJournal() {
  const journal = emptyJournal(TRIP);
  journal.title = 'Share me';
  journal.legs.push(
    {
      id: 'leg_a',
      trip_id: TRIP,
      pattern_id: 'kul',
      destination: 'A',
      timezone: 'UTC',
      order: 1,
      lifecycle: 'live'
    },
    {
      id: 'leg_b',
      trip_id: TRIP,
      pattern_id: 'ist',
      destination: 'B',
      timezone: 'UTC',
      order: 2,
      lifecycle: 'live'
    }
  );
  journal.leg_ids = ['leg_a', 'leg_b'];
  journal.moments.push(
    {
      id: 'mom_share',
      leg_id: 'leg_a',
      local_date: '2026-04-01',
      media_ids: ['med_share'],
      display_order: 1,
      lifecycle: 'live',
      coordinates: { lat: 41.01, lon: 28.97 },
      location_source: 'exif',
      text: 'Shared moment'
    },
    {
      id: 'mom_private',
      leg_id: 'leg_b',
      local_date: '2026-04-02',
      media_ids: [],
      display_order: 1,
      lifecycle: 'live',
      text: 'Keep hidden'
    }
  );
  journal.media.push({
    id: 'med_share',
    lifecycle: 'live',
    width: 100,
    height: 80,
    original_key: `travel/journal/${TRIP}/med_share/original`,
    derivative_keys: { 320: `travel/journal/${TRIP}/med_share/der/320.jpg` },
    raw_metadata: { GPSLatitude: 41.01, GPSLongitude: 28.97 },
    exif_gps: { lat: 41.01, lon: 28.97 },
    checksum: 'a'.repeat(64)
  });
  journal.transitions.push({
    id: 'trn_1',
    from_leg_id: 'leg_a',
    to_leg_id: 'leg_b',
    mode: 'flight',
    lifecycle: 'live',
    itinerary_item_id: 'itm_secret_flight'
  });
  return journal;
}

test('buildSharedJournalPayload keeps only selected moments and strips private fields', () => {
  const payload = buildSharedJournalPayload(baseJournal(), { moment_ids: ['mom_share'], leg_ids: [] });
  assert.deepEqual(payload.shared_moment_ids, ['mom_share']);
  assert.equal(payload.moments.length, 1);
  assert.equal(payload.moments[0].id, 'mom_share');
  assert.equal(payload.moments[0].coordinates, undefined);
  assert.equal(payload.media.length, 1);
  assert.equal(payload.media[0].original_key, undefined);
  assert.equal(payload.media[0].raw_metadata, undefined);
  for (const trn of payload.transitions) {
    assert.equal(trn.itinerary_item_id, undefined);
  }
  assert.deepEqual(findForbiddenSharePayloadKeys(payload), []);
});

test('collectSharedMomentIds expands legs but never defaults to all moments', () => {
  const journal = baseJournal();
  const fromLeg = collectSharedMomentIds({ moment_ids: [], leg_ids: ['leg_a'] }, journal);
  assert.deepEqual([...fromLeg], ['mom_share']);
  const empty = collectSharedMomentIds({ moment_ids: [], leg_ids: [] }, journal);
  assert.equal(empty.size, 0);
});

test('travel-journal-share POST creates scoped token and public GET returns redacted payload', async () => {
  const journal = baseJournal();
  let tokenMap = {};
  let tokenVersion = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const travelRepo = {
    async getShareTokens() {
      return { map: structuredClone(tokenMap), version: tokenVersion };
    },
    async saveShareTokens(map, version) {
      tokenMap = structuredClone(map);
      tokenVersion = 'cccccccccccccccccccccccccccccccccccccccc';
      return { map: tokenMap, version: tokenVersion };
    }
  };
  const journalRepo = {
    async getJournal(tripId) {
      return { journal: structuredClone(journal), version: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' };
    }
  };

  const handler = createTravelJournalShareHandler({
    env,
    verifySessionToken: () => ({ valid: true }),
    createTravelRepository: () => travelRepo,
    createTravelJournalRepository: () => journalRepo,
    randomToken: () => 'test-share-token-plain',
    signGet: async ({ key }) => `https://signed.example/${encodeURIComponent(key)}`
  });

  const createRes = await handler(
    new Request(`https://example.test/api/travel-journal-share?trip=${TRIP}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ moment_ids: ['mom_share'], leg_ids: [] })
    }),
    {}
  );
  assert.equal(createRes.status, 200);
  const { url, token } = (await createRes.json()).data;
  assert.match(url, /token=/);
  assert.equal(token, 'test-share-token-plain');

  const hash = createHash('sha256').update('test-share-token-plain').digest('hex');
  assert.equal(tokenMap[hash].kind, 'journal');
  assert.deepEqual(tokenMap[hash].moment_ids, ['mom_share']);

  const publicRes = await handler(
    new Request(`https://example.test/api/travel-journal-share?token=${encodeURIComponent(token)}`),
    {}
  );
  assert.equal(publicRes.status, 200);
  const publicPayload = (await publicRes.json()).data;
  assert.deepEqual(publicPayload.journal.shared_moment_ids, ['mom_share']);
  assert.deepEqual(findForbiddenSharePayloadKeys(publicPayload.journal), []);
  const mediaRow = publicPayload.media_downloads.find((row) => row.media_id === 'med_share');
  assert.equal(mediaRow.variant, 'derivative');
  assert.equal(mediaRow.gps_stripped, true);
  assert.equal(mediaRow.original_key, undefined);

  const revokeRes = await handler(
    new Request(`https://example.test/api/travel-journal-share?trip=${TRIP}`, { method: 'DELETE' }),
    {}
  );
  assert.equal(revokeRes.status, 200);

  const afterRevoke = await handler(
    new Request(`https://example.test/api/travel-journal-share?token=${encodeURIComponent(token)}`),
    {}
  );
  assert.equal(afterRevoke.status, 404);
});
