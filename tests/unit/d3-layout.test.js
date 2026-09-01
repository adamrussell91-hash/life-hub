import test from 'node:test';
import assert from 'node:assert/strict';
import { d3api } from '../../apps/life/js/app/chart-kit/d3-layout.js';

test('vendored d3 layout api loads', () => {
  const d3 = d3api();
  assert.equal(typeof d3, 'object');
});
