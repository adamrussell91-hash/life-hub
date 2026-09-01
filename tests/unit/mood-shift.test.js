import test from 'node:test';
import assert from 'node:assert/strict';
import { MOOD_ORDER } from '../../apps/life/js/app/mind-model.js';
import { moodShiftDirection, moodShiftRank } from '../../apps/life/js/app/render-mind.js';

test('moodShiftRank maps every mood through MOOD_ORDER.indexOf', () => {
  assert.deepEqual(MOOD_ORDER, ['great', 'good', 'neutral', 'low', 'bad']);
  for (const mood of MOOD_ORDER) {
    assert.equal(moodShiftRank(mood), MOOD_ORDER.indexOf(mood));
  }
  assert.equal(moodShiftRank('unknown'), -1);
});

test('moodShiftDirection is improved, declined, or flat from open to close rank', () => {
  assert.equal(moodShiftDirection('low', 'good'), 'improved');
  assert.equal(moodShiftDirection('great', 'bad'), 'declined');
  assert.equal(moodShiftDirection('neutral', 'neutral'), 'flat');
  assert.equal(moodShiftDirection('good', 'good'), 'flat');
  assert.equal(moodShiftDirection(null, 'good'), 'flat');
});
