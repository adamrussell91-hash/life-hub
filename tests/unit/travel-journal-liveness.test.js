import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyJournal, stripDeletedFromJournal } from '../../netlify/functions/_shared/travel-journal-schema.mjs';
import { createTravelJournalHandler } from '../../netlify/functions/travel-journal.mjs';

const env = { LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: 'x'.repeat(32) };
const TRIP = 'trp_journal_live01';

test('Codex check 7 — stripDeletedFromJournal removes deleted rows from normal read shape', () => {
  const journal = emptyJournal(TRIP);
  const legId = 'leg_live01';
  journal.legs = [
    {
      id: legId,
      trip_id: TRIP,
      destination: 'Live',
      timezone: 'UTC',
      pattern_id: 'generic',
      order: 0,
      lifecycle: 'live'
    }
  ];
  journal.leg_ids = [legId];
  journal.moments = [
    {
      id: 'mom_live01',
      leg_id: legId,
      local_date: '2026-03-01',
      media_ids: [],
      display_order: 1,
      lifecycle: 'live'
    },
    {
      id: 'mom_gone01',
      leg_id: legId,
      local_date: '2026-03-01',
      media_ids: [],
      display_order: 2,
      lifecycle: 'deleted'
    }
  ];
  const stripped = stripDeletedFromJournal(journal);
  assert.equal(stripped.moments.length, 1);
  assert.equal(stripped.moments[0].id, 'mom_live01');
});

test('travel-journal GET strips deleted unless trash=1', async () => {
  let stored = emptyJournal(TRIP);
  const legId = 'leg_live02';
  stored.legs = [
    {
      id: legId,
      trip_id: TRIP,
      destination: 'Live',
      timezone: 'UTC',
      pattern_id: 'generic',
      order: 0,
      lifecycle: 'live'
    }
  ];
  stored.leg_ids = [legId];
  stored.moments = [
    {
      id: 'mom_gone02',
      leg_id: legId,
      local_date: '2026-03-02',
      media_ids: [],
      display_order: 1,
      lifecycle: 'deleted'
    }
  ];
  const repo = {
    async getJournal() {
      return { journal: structuredClone(stored), version: 'sha1' };
    }
  };
  const handler = createTravelJournalHandler({
    env,
    verifySessionToken: () => ({ valid: true }),
    createTravelRepository: () => repo
  });
  const normal = await handler(
    new Request(`https://example.test/api/travel-journal?trip=${TRIP}`)
  );
  const normalBody = await normal.json();
  assert.equal(normalBody.data.journal.moments.length, 0);

  const trash = await handler(
    new Request(`https://example.test/api/travel-journal?trip=${TRIP}&trash=1`)
  );
  const trashBody = await trash.json();
  assert.equal(trashBody.data.journal.moments.length, 1);
});
