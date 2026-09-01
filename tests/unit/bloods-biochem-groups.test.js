import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BIOCHEM_GROUPS,
  groupBiochemistryMarkers
} from '../../apps/life/js/app/bloods-biochem-groups.js';

const marker = key => ({ key, label: key });

test('biochemistry markers are assigned to ordered physiological groups', () => {
  const groups = groupBiochemistryMarkers([
    marker('sodium'),
    marker('creatinine'),
    marker('alpha_1_globulin'),
    marker('mystery_marker')
  ]);

  assert.deepEqual(groups.map(group => group.id), [
    'electrolytes',
    'kidney',
    'protein',
    'other'
  ]);
  assert.deepEqual(groups.map(group => group.markers.map(item => item.key)), [
    ['sodium'],
    ['creatinine'],
    ['alpha_1_globulin'],
    ['mystery_marker']
  ]);
});

test('biochemistry groups omit empty sections and never duplicate a marker', () => {
  const input = [
    marker('calcium'),
    marker('adjusted_calcium'),
    marker('egfr'),
    marker('igg4'),
    marker('copper')
  ];
  const groups = groupBiochemistryMarkers(input);
  const assigned = groups.flatMap(group => group.markers);

  assert.deepEqual(groups.map(group => group.id), BIOCHEM_GROUPS.map(group => group.id));
  assert.equal(assigned.length, input.length);
  assert.equal(new Set(assigned).size, input.length);
});

test('an empty biochemistry panel produces no empty instrument groups', () => {
  assert.deepEqual(groupBiochemistryMarkers([]), []);
  assert.deepEqual(groupBiochemistryMarkers(), []);
});
