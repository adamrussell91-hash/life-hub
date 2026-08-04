import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompletionRing } from '../../js/app/central-node-charts.js';

test('computes stroke-dasharray geometry for a partial ring using default dimensions', () => {
  const ring = buildCompletionRing({ complete: 3, total: 5 });

  assert.equal(ring.size, 64);
  assert.equal(ring.strokeWidth, 8);
  assert.equal(ring.center, 32);
  assert.equal(ring.radius, 28);
  assert.equal(Math.round(ring.circumference * 100) / 100, 175.93);
  assert.equal(Math.round(ring.dashoffset * 100) / 100, 70.37);
});

test('a full ring (complete === total) has a zero dashoffset', () => {
  const ring = buildCompletionRing({ complete: 5, total: 5 });
  assert.equal(ring.dashoffset, 0);
});

test('an empty ring (total is zero) does not divide by zero and renders as fully unfilled', () => {
  const ring = buildCompletionRing({ complete: 0, total: 0 });
  assert.equal(ring.dashoffset, ring.circumference);
});

test('a complete value exceeding total is clamped to a full ring instead of overshooting', () => {
  const ring = buildCompletionRing({ complete: 7, total: 5 });
  assert.equal(ring.dashoffset, 0);
});

test('custom dimensions override the defaults', () => {
  const ring = buildCompletionRing({ complete: 1, total: 2 }, { size: 100, strokeWidth: 10 });
  assert.equal(ring.size, 100);
  assert.equal(ring.center, 50);
  assert.equal(ring.radius, 45);
});
