import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TASK_PROPERTY_CONFIG,
  validateTaskPropertyConfig
} from '../../netlify/functions/_shared/task-properties.mjs';

test('validateTaskPropertyConfig accepts defaults', () => {
  const parsed = validateTaskPropertyConfig(DEFAULT_TASK_PROPERTY_CONFIG);
  assert.equal(parsed.schema_version, 1);
  assert.equal(parsed.domains.length, 5);
});

test('validateTaskPropertyConfig rejects duplicate ids and bad colours', () => {
  assert.throws(
    () =>
      validateTaskPropertyConfig({
        ...DEFAULT_TASK_PROPERTY_CONFIG,
        domains: [
          { id: 'teaching', label: 'teaching', color: '#376fb7' },
          { id: 'teaching', label: 'again', color: '#376fb7' }
        ]
      }),
    /Duplicate domains id/
  );

  assert.throws(
    () =>
      validateTaskPropertyConfig({
        ...DEFAULT_TASK_PROPERTY_CONFIG,
        domains: [{ id: 'teaching', label: 'teaching', color: 'blue' }]
      }),
    /color must be #RRGGBB/
  );
});
