import test from 'node:test';
import assert from 'node:assert/strict';
import { autoUpdateHubFloating, positionHubFloating } from '../../packages/design-kit/js/hub-floating.js';

test('hub-floating exports positioning helpers', () => {
  assert.equal(typeof positionHubFloating, 'function');
  assert.equal(typeof autoUpdateHubFloating, 'function');
});
