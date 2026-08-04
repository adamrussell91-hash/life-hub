import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRingTarget } from '../../js/app/chart-kit/ring.js';

test('buildRingTarget maps complete/total into circumference and capped dashoffset', () => {
  const ring = buildRingTarget({ value: 1, target: 5 }, { size: 64, strokeWidth: 8 });
  assert.equal(ring.size, 64);
  assert.equal(ring.strokeWidth, 8);
  assert.equal(ring.center, 32);
  assert.equal(ring.radius, 28);
  assert.ok(Math.abs(ring.circumference - (2 * Math.PI * 28)) < 1e-9);
  assert.ok(Math.abs(ring.dashoffset - ring.circumference * 0.8) < 1e-9);
  assert.equal(ring.fraction, 0.2);
});

test('over-target values cap visual fraction at 1 but expose raw value', () => {
  const ring = buildRingTarget({ value: 150, target: 100 }, { size: 72, strokeWidth: 7 });
  assert.equal(ring.fraction, 1);
  assert.equal(ring.dashoffset, 0);
  assert.equal(ring.value, 150);
  assert.equal(ring.target, 100);
});

test('zero or missing target yields fraction 0 without NaN', () => {
  const ring = buildRingTarget({ value: 40, target: 0 }, { size: 64, strokeWidth: 8 });
  assert.equal(ring.fraction, 0);
  assert.equal(Number.isFinite(ring.dashoffset), true);
});
