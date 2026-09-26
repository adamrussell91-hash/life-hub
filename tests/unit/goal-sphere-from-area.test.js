// tests/unit/goal-sphere-from-area.test.js
import assert from 'node:assert/strict';
import test from 'node:test';
import { sphereFromAreaTitle, ensureGoalSphere } from '../../netlify/functions/_shared/goal-record.mjs';

test('sphereFromAreaTitle maps area titles to work / professional / life', () => {
  assert.equal(sphereFromAreaTitle('Teaching'), 'work');
  assert.equal(sphereFromAreaTitle('School admin'), 'work');
  assert.equal(sphereFromAreaTitle('Class 9'), 'work');
  assert.equal(sphereFromAreaTitle('Work load'), 'work');
  assert.equal(sphereFromAreaTitle('Career growth'), 'professional');
  assert.equal(sphereFromAreaTitle('Professional learning'), 'professional');
  assert.equal(sphereFromAreaTitle('PD days'), 'professional');
  assert.equal(sphereFromAreaTitle('Leader coaching'), 'professional');
  assert.equal(sphereFromAreaTitle('Health & home'), 'life');
  assert.equal(sphereFromAreaTitle(''), 'life');
  assert.equal(sphereFromAreaTitle(null), 'life');
});

test('ensureGoalSphere leaves an explicit sphere alone', () => {
  const goal = { id: 'g1', sphere: 'professional', parent_area_id: 'area_1' };
  const areas = new Map([['area_1', { id: 'area_1', title: 'Teaching' }]]);
  assert.equal(ensureGoalSphere(goal, areas).sphere, 'professional');
  assert.equal(ensureGoalSphere(goal, areas)._sphere_derived, undefined);
});

test('ensureGoalSphere derives when sphere is missing and marks write-through', () => {
  const goal = { id: 'g2', parent_area_id: 'area_1', title: 'x' };
  const areas = new Map([['area_1', { id: 'area_1', title: 'Teaching' }]]);
  const next = ensureGoalSphere(goal, areas);
  assert.equal(next.sphere, 'work');
  assert.equal(next._sphere_derived, true);
});

test('ensureGoalSphere is idempotent for the same area', () => {
  const goal = { id: 'g3', parent_area_id: 'area_2' };
  const areas = new Map([['area_2', { id: 'area_2', title: 'Career' }]]);
  assert.equal(ensureGoalSphere(goal, areas).sphere, 'professional');
  assert.equal(ensureGoalSphere(ensureGoalSphere(goal, areas), areas).sphere, 'professional');
});
