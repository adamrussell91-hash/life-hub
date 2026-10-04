import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNestedRings } from '../../apps/life/js/app/chart-kit/nested-rings.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} ≈ ${expected}`);

test('rings nest outer to inner with stroke and gap', () => {
  const rings = buildNestedRings([1, 2, 3, 4].map(() => ({ value: 1, target: 2 })), { size: 200, strokeWidth: 11, gap: 2 });
  assert.deepEqual(rings.map(ring => ring.radius), [94.5, 81.5, 68.5, 55.5]);
});

test('a partial ring offsets by the unfilled share', () => {
  const [ring] = buildNestedRings([{ value: 30, target: 120 }]);
  close(ring.dashoffset, ring.circumference * 0.75);
  assert.equal(ring.overflow, 0);
});

test('a ring past its target completes and draws an overflow lap', () => {
  const [ring] = buildNestedRings([{ value: 2800, target: 2000 }]);
  assert.equal(ring.dashoffset, 0);
  close(ring.overflow, 0.4);
  close(ring.overflowDashoffset, ring.circumference * 0.6);
});

test('the overflow lap is capped at one extra turn', () => {
  const [ring] = buildNestedRings([{ value: 900, target: 300 }]);
  assert.equal(ring.overflow, 1);
  assert.equal(ring.overflowDashoffset, 0);
});

test('a missing target draws an empty track, not a full ring', () => {
  const [ring] = buildNestedRings([{ value: 40, target: 0 }]);
  assert.equal(ring.hasTarget, false);
  assert.equal(ring.fraction, 0);
  assert.equal(ring.overflow, 0);
  close(ring.dashoffset, ring.circumference);
});
