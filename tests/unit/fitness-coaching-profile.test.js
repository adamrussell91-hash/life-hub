import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FITNESS_COACHING_PROFILE_PATH,
  parseFitnessCoachingProfile,
  validateFitnessCoachingProfilePatch,
  mergeFitnessCoachingProfile,
  formatFitnessCoachingProfileForPrompt,
  saveFitnessCoachingProfileSchema
} from '../../netlify/functions/_shared/fitness-coaching-profile.mjs';

test('coaching profile merges durable goals and preferences without erasing prior answers', () => {
  const first = mergeFitnessCoachingProfile({}, validateFitnessCoachingProfilePatch({
    physique_references: ['Tom Holland as Spider-Man'],
    priority_areas: ['shoulder to waist ratio']
  }), '2026-09-16T10:00:00+10:00');
  const second = mergeFitnessCoachingProfile(first, validateFitnessCoachingProfilePatch({
    enjoys: ['varied cable modes'],
    dislikes: ['repetitive exercise selection'],
    last_answer: 'Prioritise a lean athletic frame.'
  }), '2026-09-16T11:00:00+10:00');
  assert.deepEqual(second.physique_references, ['Tom Holland as Spider-Man']);
  assert.deepEqual(second.enjoys, ['varied cable modes']);
  assert.match(formatFitnessCoachingProfileForPrompt(second), /Tom Holland/);
  assert.match(formatFitnessCoachingProfileForPrompt(second), /repetitive exercise selection/);
});

test('empty profile asks for one focused question', () => {
  assert.match(formatFitnessCoachingProfileForPrompt({}), /one focused question/);
});

test('profile schema and path are stable', () => {
  assert.equal(FITNESS_COACHING_PROFILE_PATH, 'data/fitness-coaching-profile.json');
  assert.equal(saveFitnessCoachingProfileSchema().name, 'save_fitness_coaching_profile');
  assert.deepEqual(parseFitnessCoachingProfile('{'), {});
  assert.equal(validateFitnessCoachingProfilePatch({}), null);
});
