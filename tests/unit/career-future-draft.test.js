import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFutureDraft } from '../../netlify/functions/_shared/career-future-draft.mjs';

test('parseFutureDraft accepts Ann JSON with 3+ criteria', () => {
  const draft = parseFutureDraft(
    JSON.stringify({
      title: 'Head of Gifted Education',
      where: 'Independent school',
      aliases: ['Head of Gifted', 'Gifted Coordinator'],
      criteria: [
        { text: 'Lead gifted policy', source: 'ad' },
        { text: 'Coach teachers', source: 'ad' },
        { text: 'Report to principal', source: 'ann' }
      ]
    }),
    { title: 'Head of Gifted Education' }
  );
  assert.ok(draft);
  assert.equal(draft.title, 'Head of Gifted Education');
  assert.equal(draft.criteria.length, 3);
  assert.match(draft.criteria[0].id, /^fcrit_/);
  assert.equal(draft.criteria[0].source, 'ad');
});

test('parseFutureDraft rejects thin drafts', () => {
  assert.equal(
    parseFutureDraft(JSON.stringify({ title: 'X', criteria: [{ text: 'only one' }] }), {
      title: 'X'
    }),
    null
  );
});
