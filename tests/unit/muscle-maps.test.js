import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMuscleMapKeys, muscleAssetPath, resolveExerciseThumbKey } from '../../apps/life/js/app/muscle-maps.js';

test('coarse focus falls back to whole-region keys', () => {
  assert.deepEqual(
    resolveMuscleMapKeys({ focus: ['chest', 'arms'], exercises: [] }),
    ['chest-whole', 'arm-bicep']
  );
});

test('exercise library focus_areas refine keys before coarse focus', () => {
  const libraryByName = new Map([
    ['Cable Fly', { name: 'Cable Fly', target_area: 'Chest', focus_areas: ['Upper Chest', 'Inner Chest'] }],
    ['Curl', { name: 'Curl', target_area: 'Arms', focus_areas: ['Biceps'] }]
  ]);
  assert.deepEqual(
    resolveMuscleMapKeys({
      focus: ['chest', 'arms'],
      exercises: [{ name: 'Cable Fly' }, { name: 'Curl' }],
      libraryByName
    }),
    ['chest-upper', 'chest-inner', 'arm-bicep']
  );
});

test('dedupes and caps at four keys', () => {
  assert.deepEqual(
    resolveMuscleMapKeys({
      focus: ['chest', 'back', 'legs', 'shoulders', 'core', 'arms']
    }),
    ['chest-whole', 'back-full', 'thighs-front', 'shoulders']
  );
});

test('unknown tokens are omitted', () => {
  assert.deepEqual(
    resolveMuscleMapKeys({ focus: ['unicorn', 'chest'] }),
    ['chest-whole']
  );
});

test('muscleAssetPath builds the static asset URL', () => {
  assert.equal(muscleAssetPath('chest-whole'), 'assets/fitness/muscles/chest-whole.png');
});

test('resolveExerciseThumbKey prefers library then name hints', () => {
  const libraryByName = new Map([
    ['Cable Fly', { name: 'Cable Fly', target_area: 'Chest', focus_areas: ['Upper Chest'] }]
  ]);
  assert.equal(resolveExerciseThumbKey({ name: 'Cable Fly' }, libraryByName), 'chest-upper');
  assert.equal(resolveExerciseThumbKey({ name: 'Barbell Squat' }), 'thighs-front');
  assert.equal(resolveExerciseThumbKey({ name: 'Unknown Move' }), 'chest-whole');
});
