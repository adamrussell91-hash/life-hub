import test from 'node:test';
import assert from 'node:assert/strict';
import { listFocusable, trapFocus } from '../../packages/design-kit/js/hub-focus-trap.js';

test('hub-focus-trap exports trap helpers', () => {
  assert.equal(typeof listFocusable, 'function');
  assert.equal(typeof trapFocus, 'function');
});

test('listFocusable returns empty for null containers', () => {
  assert.deepEqual(listFocusable(null), []);
  assert.deepEqual(listFocusable(undefined), []);
});

test('trapFocus returns a release function for missing containers', () => {
  const release = trapFocus(null);
  assert.equal(typeof release, 'function');
  release();
});
