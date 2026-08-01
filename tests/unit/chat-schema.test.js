import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCanonicalPath, logEntryToolSchema, validateLogEntry } from '../../netlify/functions/_shared/chat-schema.mjs';

test('builds the canonical path for each writable record type', () => {
  assert.equal(buildCanonicalPath({ type: 'meal', date: '2026-08-01', slug: 'breakfast' }), 'data/nutrition/2026/08/2026-08-01-breakfast.md');
  assert.equal(buildCanonicalPath({ type: 'weight', date: '2026-08-01', slug: 'weight' }), 'data/body/2026/08/2026-08-01-weight.md');
});

test('rejects an unknown type, invalid date, or invalid slug', () => {
  assert.throws(() => buildCanonicalPath({ type: 'nope', date: '2026-08-01', slug: 'x' }), TypeError);
  assert.throws(() => buildCanonicalPath({ type: 'meal', date: '2026-13-40', slug: 'x' }), TypeError);
  assert.throws(() => buildCanonicalPath({ type: 'meal', date: '2026-08-01', slug: 'Bad Slug' }), TypeError);
});

test('the tool schema restricts type to the allowed list when supplied', () => {
  const schema = logEntryToolSchema(['meal']);
  assert.equal(schema.name, 'log_entry');
  assert.deepEqual(schema.input_schema.properties.type.enum, ['meal']);
});

test('validates a well-formed meal log entry into a canonical record', () => {
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: { meal: 'breakfast', calories: 520, protein_g: 38, fat_g: 12 }
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, true);
  assert.equal(result.record.calories, 520);
  assert.equal(result.record.source, 'chat');
});

test('rejects a log entry with semantically invalid fields', () => {
  const result = validateLogEntry({
    type: 'meal',
    date: '2026-08-01',
    fields: { meal: 'brunch', calories: 520, protein_g: 38, fat_g: 12 }
  }, { id: 'meal-1', now: '2026-08-01T07:45:00+10:00' });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('meal')));
});

test('rejects an unknown record type before touching field validation', () => {
  assert.deepEqual(
    validateLogEntry({ type: 'sleep', date: '2026-08-01', fields: {} }, { id: 'x', now: '2026-08-01T00:00:00+10:00' }),
    { valid: false, errors: ['Unknown record type: sleep'] }
  );
});

test('rejects a payload whose fields is missing or not an object', () => {
  assert.equal(
    validateLogEntry({ type: 'meal', date: '2026-08-01' }, { id: 'x', now: '2026-08-01T00:00:00+10:00' }).valid,
    false
  );
});
