import test from 'node:test';
import assert from 'node:assert/strict';
import { findTypeaheadMatch } from '../../packages/design-kit/js/hub-filter-menu.js';

test('findTypeaheadMatch returns the first case-insensitive prefix match', () => {
  const labels = ['Alpha', 'Bravo', 'Charlie', 'chromium'];
  assert.equal(findTypeaheadMatch(labels, 'c'), 2);
  assert.equal(findTypeaheadMatch(labels, 'ch'), 2);
  assert.equal(findTypeaheadMatch(labels, 'chr'), 3);
  assert.equal(findTypeaheadMatch(labels, 'B'), 1);
  assert.equal(findTypeaheadMatch(labels, 'z'), -1);
  assert.equal(findTypeaheadMatch(labels, ''), -1);
});
