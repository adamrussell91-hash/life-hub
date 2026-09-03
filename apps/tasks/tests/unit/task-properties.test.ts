import { describe, expect, it } from 'vitest';
import {
  assertUniquePropertyIds,
  validateTaskClassifierPatch,
  validateTaskPropertyConfig
} from '@/schemas/task-properties';
import { slugifyPropertyId, uniquePropertyId } from '@/domain/property-ids';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '@/domain/task-properties-defaults';

describe('task property config', () => {
  it('accepts the default classifier lists', () => {
    expect(validateTaskPropertyConfig(DEFAULT_TASK_PROPERTY_CONFIG).domains).toHaveLength(5);
  });

  it('rejects duplicate ids in a list', () => {
    expect(() =>
      assertUniquePropertyIds(
        [
          { id: 'life', label: 'Life' },
          { id: 'life', label: 'Life duplicate' }
        ],
        'domains'
      )
    ).toThrow(/Duplicate domains id/);
  });

  it('validates task classifier writes against the configured lists', () => {
    expect(() =>
      validateTaskClassifierPatch({ domain: 'not-a-domain' }, DEFAULT_TASK_PROPERTY_CONFIG)
    ).toThrow(/Unknown domain/);
    expect(() =>
      validateTaskClassifierPatch({ priority: 'teaching' }, DEFAULT_TASK_PROPERTY_CONFIG)
    ).toThrow(/Unknown priority/);
  });

  it('slugifies display names into valid hidden ids', () => {
    expect(slugifyPropertyId('Teaching extra')).toBe('teaching_extra');
    expect(slugifyPropertyId('123')).toBe('item_123');
    expect(slugifyPropertyId('   ')).toBe('item');
    expect(uniquePropertyId('new item', ['new_item'])).toBe('new_item_2');
    expect(uniquePropertyId('teaching', ['teaching', 'teaching_2'])).toBe('teaching_3');
  });
});
