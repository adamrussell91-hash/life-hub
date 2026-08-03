import test from 'node:test';
import assert from 'node:assert/strict';
import {
  foodLibraryEntrySchema,
  formatFoodLibraryForPrompt,
  parseFoodLibrary,
  upsertFoodLibraryEntry,
  validateFoodLibraryEntry
} from '../../netlify/functions/_shared/food-library.mjs';

test('the tool schema requires name, servingDescription, and the three core macros', () => {
  const schema = foodLibraryEntrySchema();
  assert.equal(schema.name, 'save_food_library_entry');
  assert.deepEqual(schema.input_schema.required, ['name', 'servingDescription', 'calories', 'protein_g', 'fat_g']);
});

test('parseFoodLibrary tolerates missing, malformed, or non-array content', () => {
  assert.deepEqual(parseFoodLibrary(undefined), []);
  assert.deepEqual(parseFoodLibrary('not json'), []);
  assert.deepEqual(parseFoodLibrary('{"not":"an array"}'), []);
  assert.deepEqual(parseFoodLibrary('[{"name":"Toast"},{"missingName":true},"not an object"]'), [{ name: 'Toast' }]);
});

test('validateFoodLibraryEntry accepts a well-formed entry and trims strings', () => {
  const entry = validateFoodLibraryEntry({
    name: '  Meatlovers Pizza  ', brand: ' Domino\'s ', servingDescription: '1 slice',
    calories: 250, protein_g: 11, fat_g: 12, omega3: 'none'
  });
  assert.deepEqual(entry, {
    name: 'Meatlovers Pizza', servingDescription: '1 slice', brand: 'Domino\'s',
    calories: 250, protein_g: 11, fat_g: 12, omega3: 'none'
  });
});

test('validateFoodLibraryEntry rejects a missing required field', () => {
  assert.equal(validateFoodLibraryEntry({ name: 'Toast', servingDescription: '1 slice', protein_g: 3, fat_g: 1 }), null);
  assert.equal(validateFoodLibraryEntry({ name: 'Toast', calories: 100, protein_g: 3, fat_g: 1 }), null);
  assert.equal(validateFoodLibraryEntry(null), null);
});

test('validateFoodLibraryEntry rejects a non-numeric macro or an invalid omega3 level', () => {
  assert.equal(validateFoodLibraryEntry({
    name: 'Toast', servingDescription: '1 slice', calories: 'lots', protein_g: 3, fat_g: 1
  }), null);
  assert.equal(validateFoodLibraryEntry({
    name: 'Toast', servingDescription: '1 slice', calories: 100, protein_g: 3, fat_g: 1, omega3: 'extreme'
  }), null);
});

test('upsertFoodLibraryEntry replaces an existing entry matched by brand+name rather than duplicating it', () => {
  const existing = [
    { name: 'Meatlovers Pizza', brand: 'Domino\'s', servingDescription: '1 slice', calories: 200, protein_g: 9, fat_g: 10, verifiedAt: '2025-01-01' },
    { name: 'Long Black', servingDescription: '1 cup', calories: 5, protein_g: 0, fat_g: 0, verifiedAt: '2025-01-01' }
  ];
  const updated = upsertFoodLibraryEntry(
    existing,
    { name: 'Meatlovers Pizza', brand: 'Domino\'s', servingDescription: '1 slice', calories: 250, protein_g: 11, fat_g: 12 },
    '2026-08-03'
  );
  assert.equal(updated.length, 2);
  const pizza = updated.find(entry => entry.name === 'Meatlovers Pizza');
  assert.equal(pizza.calories, 250);
  assert.equal(pizza.verifiedAt, '2026-08-03');
  assert.ok(updated.some(entry => entry.name === 'Long Black'), 'unrelated entries must be preserved');
});

test('upsertFoodLibraryEntry appends when there is no existing match', () => {
  const updated = upsertFoodLibraryEntry([], { name: 'Toast', servingDescription: '2 slices', calories: 180, protein_g: 6, fat_g: 4 }, '2026-08-03');
  assert.equal(updated.length, 1);
  assert.equal(updated[0].verifiedAt, '2026-08-03');
});

test('formatFoodLibraryForPrompt summarises entries with brand, serving, macros, and verification date', () => {
  const text = formatFoodLibraryForPrompt([
    { name: 'Meatlovers Pizza', brand: 'Domino\'s', servingDescription: '1 slice', calories: 250, protein_g: 11, fat_g: 12, carbs_g: 24, verifiedAt: '2026-08-03' }
  ]);
  assert.match(text, /Domino's Meatlovers Pizza/);
  assert.match(text, /1 slice/);
  assert.match(text, /calories=250/);
  assert.match(text, /verified 2026-08-03/);
});

test('formatFoodLibraryForPrompt returns an empty string for an empty or invalid library', () => {
  assert.equal(formatFoodLibraryForPrompt([]), '');
  assert.equal(formatFoodLibraryForPrompt(undefined), '');
});
