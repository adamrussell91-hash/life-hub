import test from 'node:test';
import assert from 'node:assert/strict';
import { verdictOf, earlierOf, kindGroup, sydneyDayOf, codeSides } from '../../netlify/functions/_shared/feedback-story.mjs';

const piece = (places, tags = [], extra = {}) => ({ kind: 'written', at: '2026-10-02T00:00:00Z', places, tags, ...extra });

test('a piece is read against the last one of its kind', () => {
  const before = piece({ 'skill:a.b': 'capable', 'out:x': 'building' });
  assert.equal(verdictOf(piece({ 'skill:a.b': 'skilled', 'out:x': 'building' }), before).kind, 'better');
  assert.equal(verdictOf(piece({ 'skill:a.b': 'capable', 'out:x': 'building' }), before).kind, 'same');
  assert.equal(verdictOf(piece({ 'skill:a.b': 'skilled', 'out:x': 'starting' }), before).kind, 'mixed');
  assert.deepEqual(verdictOf(piece({ 'skill:a.b': 'below', 'out:x': 'building' }), before), { kind: 'lower', up: [], same: ['out:x'], down: ['skill:a.b'] });
  assert.equal(verdictOf(piece({ 'out:x': 'building' }), null).kind, 'first');
});

test('with no place to compare, the codes are counted; with nothing at all there is no verdict', () => {
  const tags = [{ code_id: 'a', positive: true }, { code_id: 'b', positive: false }, { code_id: 'b', positive: false }];
  assert.deepEqual(verdictOf(piece({}, tags), null), { kind: 'counts', good: 1, work: 1 });
  assert.deepEqual(verdictOf(piece({ 'out:y': 'secure' }, tags), piece({ 'out:x': 'secure' })), { kind: 'counts', good: 1, work: 1 });
  assert.equal(verdictOf(piece({}), null), null);
  assert.deepEqual(codeSides(tags), { good: ['a'], work: ['b'] });
});

test('kinds, days and the earlier piece', () => {
  assert.deepEqual(['written', 'note', 'viva', 'quiz', 'answer'].map(kindGroup), ['written', 'written', 'spoken', 'short', 'short']);
  assert.equal(sydneyDayOf('2026-11-15T20:00:00Z'), '2026-11-16');
  const list = [piece({}, [], { id: 1, at: '2026-10-01T00:00:00Z' }), piece({}, [], { id: 2, kind: 'viva', at: '2026-10-02T00:00:00Z' }), piece({}, [], { id: 3, at: '2026-10-03T00:00:00Z' })];
  assert.equal(earlierOf(list, list[2]).id, 1);
  assert.equal(earlierOf(list, list[1]), null);
});
