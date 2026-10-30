import test from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, RUNGS, stepForShare, rungForShare, lowerOf, isTop, ladderFor, stepName } from '../../netlify/functions/_shared/progress-steps.mjs';

test('outcome steps follow the evidence boundaries', () => {
  assert.deepEqual(STEPS, ['starting', 'building', 'secure', 'extending']);
  assert.equal(stepForShare(0), 'starting');
  assert.equal(stepForShare(0.49), 'starting');
  assert.equal(stepForShare(0.5), 'building');
  assert.equal(stepForShare(0.79), 'building');
  assert.equal(stepForShare(0.8), 'secure');
  assert.equal(stepForShare(0.9), 'extending');
  assert.equal(stepForShare(Number.NaN), null);
});

test('skill rungs use the continuum thresholds; below Capable has its own name', () => {
  assert.deepEqual(RUNGS, ['below', 'capable', 'skilled', 'accomplished', 'excellent']);
  assert.equal(rungForShare(0.64), 'below');
  assert.equal(rungForShare(0.65), 'capable');
  assert.equal(rungForShare(14 / 20), 'capable');
  assert.equal(rungForShare(0.95), 'excellent');
  assert.equal(stepName('below'), 'On the way to Capable');
});

test('lower step wins and the top step is never holding', () => {
  assert.equal(lowerOf('secure', 'building'), 'building');
  assert.equal(lowerOf('skilled', 'accomplished'), 'skilled');
  assert.equal(isTop('extending'), true);
  assert.equal(isTop('excellent'), true);
  assert.equal(isTop('secure'), false);
  assert.equal(ladderFor('secure'), STEPS);
  assert.equal(ladderFor('skilled'), RUNGS);
});
