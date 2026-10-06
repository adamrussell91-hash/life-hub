import assert from 'node:assert/strict';
import test from 'node:test';
import {
  annotatePendingBooks,
  approveProposal,
  dismissProposal,
  pairKey,
  parsePendingProposal
} from '../../netlify/functions/_shared/knowledge-curator.mjs';

const pending = [{
  id: 'a||b',
  noteA: 'a',
  noteB: 'b',
  titleA: 'A',
  titleB: 'B',
  excerptA: 'ea',
  excerptB: 'eb',
  relation: 'related',
  rationale: 'same thread',
  proposedAt: '2026-08-15T00:00:00.000Z'
}];

test('approveProposal keeps Teaching and Tasks refs already on a note', () => {
  const result = approveProposal(
    pending,
    { id: 'a', connected: ['teaching:unit:unit_aotfw'] },
    { id: 'b', connected: ['tasks:project:proj_aotfw'] },
    'a||b'
  );
  assert.deepEqual(result.pageA.connected, ['teaching:unit:unit_aotfw', 'b']);
  assert.deepEqual(result.pageB.connected, ['tasks:project:proj_aotfw', 'a']);
});

test('approveProposal links both notes and drops the proposal', () => {
  const result = approveProposal(
    pending,
    { id: 'a', connected: [] },
    { id: 'b', connected: ['c'] },
    'a||b'
  );
  assert.deepEqual(result.pending, []);
  assert.deepEqual(result.pageA.connected, ['b']);
  assert.deepEqual(result.pageB.connected, ['c', 'a']);
  assert.equal(pairKey('b', 'a'), 'a||b');
});

test('parsePendingProposal keeps confidence and does not invent one', () => {
  const scored = parsePendingProposal({ ...pending[0], confidence: 0.72, bookA: 'The Neural Mind', bookB: 'Atomic Habits' });
  assert.equal(scored.confidence, 0.72);
  assert.equal(scored.bookA, 'The Neural Mind');
  const unscored = parsePendingProposal(pending[0]);
  assert.equal(Object.hasOwn(unscored, 'confidence'), false);
  const annotated = annotatePendingBooks([unscored], JSON.stringify([
    { id: 'a', origins: [{ kind: 'book', label: 'The Neural Mind' }] },
    { id: 'b', origins: [{ kind: 'book', label: 'Atomic Habits' }] }
  ]));
  assert.equal(annotated[0].bookA, 'The Neural Mind');
  assert.equal(annotated[0].bookB, 'Atomic Habits');
  assert.equal(Object.hasOwn(annotated[0], 'confidence'), false);
});

test('dismissProposal records the pair once', () => {
  const first = dismissProposal(pending, [], 'a||b', '2026-09-04T00:00:00.000Z');
  const again = dismissProposal(pending, first.dismissed, 'a||b', '2026-09-05T00:00:00.000Z');
  assert.deepEqual(first.pending, []);
  assert.equal(first.dismissed.length, 1);
  assert.equal(again.dismissed.length, 1);
});
