// tests/unit/decision-book-compass.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPASS, COMPASS_IDS, compassSections, parseCompass } from '../../packages/decision-book/compass.mjs';
import { SECTIONS } from '../../packages/decision-book/catalogue.mjs';

test('four quadrants, one per book section, in section order', () => {
  assert.deepEqual(COMPASS_IDS, ['self_improve', 'self_understand', 'others_understand', 'others_improve']);
  assert.deepEqual(COMPASS.map((q) => q.section), [1, 2, 3, 4]);
  for (const q of COMPASS) assert.equal(SECTIONS[q.section - 1].compass, q.id);
});

test('parseCompass keeps known ids in compass order, at most two', () => {
  assert.deepEqual(parseCompass('self_improve'), ['self_improve']);
  assert.deepEqual(parseCompass('others_understand and self_understand'), ['self_understand', 'others_understand']);
  assert.deepEqual(parseCompass('others_improve+self_improve+self_understand'), ['self_improve', 'self_understand']);
  assert.deepEqual(parseCompass('SELF_IMPROVE'), ['self_improve']);
  assert.deepEqual(parseCompass('about me, to understand'), []);
  assert.deepEqual(parseCompass(null), []);
});

test('compassSections maps a stored compass value to section numbers', () => {
  assert.deepEqual(compassSections('self_understand+others_improve'), [2, 4]);
  assert.deepEqual(compassSections(''), []);
});
