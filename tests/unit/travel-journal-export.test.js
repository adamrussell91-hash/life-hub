import test from 'node:test';
import assert from 'node:assert/strict';
import { createTravelJournalExportHandler } from '../../netlify/functions/travel-journal-export.mjs';
import { emptyJournal } from '../../netlify/functions/_shared/travel-journal-schema.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };
const TRIP = 'trp_journal_export01';

function fakeJournalRepo(journal) {
  let stored = structuredClone(journal);
  const version = 'cccccccccccccccccccccccccccccccccccccccc';
  return {
    async getJournal(tripId) {
      if (stored.trip_id !== tripId) {
        const err = new Error('Journal not found.');
        err.code = 'not_found';
        err.status = 404;
        throw err;
      }
      return { journal: structuredClone(stored), version };
    }
  };
}

function handlerFor(repo) {
  return createTravelJournalExportHandler({
    env,
    verifySessionToken: () => ({ valid: true }),
    createTravelRepository: () => repo,
    signGet: async ({ key }) => `https://signed.example/${encodeURIComponent(key)}`
  });
}

test('travel-journal-export GET strips deleted and lists media download paths', async () => {
  const journal = emptyJournal(TRIP);
  journal.title = 'Portable';
  journal.legs.push({
    id: 'leg_export',
    trip_id: TRIP,
    pattern_id: 'kul',
    destination: 'Test',
    timezone: 'UTC',
    order: 1,
    lifecycle: 'live'
  });
  journal.leg_ids.push('leg_export');
  journal.media.push({
    id: 'med_export',
    lifecycle: 'live',
    width: 10,
    height: 10,
    checksum: 'd'.repeat(64),
    original_key: `travel/journal/${TRIP}/med_export/original`
  });
  journal.media.push({
    id: 'med_gone',
    lifecycle: 'deleted',
    width: 10,
    height: 10
  });

  const handler = handlerFor(fakeJournalRepo(journal));
  const res = await handler(
    new Request(`https://example.test/api/travel-journal-export?trip=${TRIP}`),
    {}
  );
  assert.equal(res.status, 200);
  const payload = (await res.json()).data;
  assert.equal(payload.bundle_version, 1);
  assert.equal(payload.journal.media.length, 1);
  assert.equal(payload.journal.media[0].id, 'med_export');
  assert.ok(payload.media_downloads.some((row) => row.media_id === 'med_export' && row.variant === 'original'));
  assert.ok(payload.restore_gaps?.length > 0);
});
