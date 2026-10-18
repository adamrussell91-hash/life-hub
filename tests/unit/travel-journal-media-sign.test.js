import test from 'node:test';
import assert from 'node:assert/strict';
import { createTravelJournalMediaSignHandler } from '../../netlify/functions/travel-journal-media-sign.mjs';
import { parseJournalMediaSignRequest } from '../../netlify/functions/_shared/travel-journal-r2.mjs';
import { emptyJournal, stripDeletedFromJournal } from '../../netlify/functions/_shared/travel-journal-schema.mjs';

const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: 'x'.repeat(32),
  R2_ACCOUNT_ID: 'acct',
  R2_BUCKET: 'bucket',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret'
};
const TRIP = 'trp_journal_media01';
const MEDIA = 'med_journal_media01';
const CHECKSUM = 'b'.repeat(64);

function journalWithPendingMedia() {
  const journal = emptyJournal(TRIP);
  journal.media.push({ id: MEDIA, lifecycle: 'live', upload_state: 'pending', content_type: 'audio/mp4' });
  return journal;
}

/** Repo whose version moves on (another save) between the client's read and verify. */
function movingRepo() {
  let stored = journalWithPendingMedia();
  let version = 'v2';
  let saves = 0;
  return {
    get stored() {
      return stored;
    },
    async getJournal() {
      return { journal: structuredClone(stored), version };
    },
    async saveJournal(journal, ifVersion) {
      if (ifVersion !== version) {
        throw Object.assign(new Error('conflict'), { code: 'conflict', status: 409 });
      }
      saves += 1;
      stored = structuredClone(journal);
      version = `v${2 + saves}`;
      return { journal: structuredClone(stored), version };
    }
  };
}

test('voice notes (iOS audio/mp4) can be signed for upload; derivatives stay JPEG-only', () => {
  const ok = parseJournalMediaSignRequest({
    trip_id: TRIP,
    media_id: MEDIA,
    content_type: 'audio/mp4;codecs=mp4a.40.2',
    byte_size: 1000,
    checksum: CHECKSUM,
    purpose: 'original'
  });
  assert.equal(ok.error, undefined);
  assert.equal(ok.value.content_type, 'audio/mp4');

  const badDerivative = parseJournalMediaSignRequest({
    trip_id: TRIP,
    media_id: MEDIA,
    content_type: 'audio/mp4',
    byte_size: 1000,
    checksum: CHECKSUM,
    purpose: 'derivative',
    derivative_width: 320
  });
  assert.match(badDerivative.error, /image\/jpeg/);
});

test('verify marks media backed up against the latest journal, not the client version', async () => {
  const repo = movingRepo();
  const handler = createTravelJournalMediaSignHandler({
    env,
    verifySessionToken: () => ({ valid: true }),
    createTravelRepository: () => repo,
    headObject: async () => ({ contentLength: 1000, metadata: { checksum: CHECKSUM } })
  });
  const res = await handler(
    new Request('https://example.test/api/travel-journal-media-sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'verify',
        trip_id: TRIP,
        media_id: MEDIA,
        content_type: 'audio/mp4',
        byte_size: 1000,
        checksum: CHECKSUM,
        purpose: 'original',
        if_version: 'v1-stale'
      })
    })
  );
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.data.upload_state, 'backed_up');
  assert.equal(repo.stored.media[0].upload_state, 'backed_up');
  assert.equal(repo.stored.media[0].original_key, `travel/journal/${TRIP}/${MEDIA}/original`);
});

test('stripDeletedFromJournal drops deleted rows even when the whole journal is in Trash', () => {
  const journal = journalWithPendingMedia();
  journal.lifecycle = 'deleted';
  journal.media.push({ id: 'med_gone_0001', lifecycle: 'deleted' });
  const stripped = stripDeletedFromJournal(journal);
  assert.deepEqual(
    stripped.media.map((m) => m.id),
    [MEDIA]
  );
});
