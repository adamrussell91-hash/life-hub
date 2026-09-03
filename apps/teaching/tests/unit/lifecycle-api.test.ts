import { describe, it, expect } from 'vitest';
import {
  dependenciesPath,
  entityPath,
  formatDependencyList,
  restoreFromTrashPath
} from '@/teacher/lifecycle-api';

describe('lifecycle-api paths', () => {
  it('maps entity types to collection paths', () => {
    expect(entityPath('lesson', 'lesson_1')).toBe('/api/lessons/lesson_1');
    expect(entityPath('unit', 'unit_1')).toBe('/api/units/unit_1');
    expect(entityPath('class', 'class_1')).toBe('/api/classes/class_1');
    expect(entityPath('media', 'media_1')).toBe('/api/media/media_1');
    expect(entityPath('lesson_template', 'tpl_1')).toBe('/api/lesson-templates/tpl_1');
    expect(entityPath('unit_template', 'tpl_2')).toBe('/api/unit-templates/tpl_2');
    expect(entityPath('composition', 'comp_1')).toBe('/api/compositions/comp_1');
  });

  it('builds restore-from-trash and dependencies paths', () => {
    expect(restoreFromTrashPath('lesson', 'lesson_1')).toBe(
      '/api/lessons/lesson_1/restore-from-trash'
    );
    expect(dependenciesPath('unit', 'unit_1')).toBe('/api/units/unit_1/dependencies');
  });

  it('formats dependency lists for confirms', () => {
    expect(
      formatDependencyList([
        { type: 'unit', id: 'unit_1', title: 'AoTFW', detail: 'Unit lists this lesson' }
      ])
    ).toBe('• AoTFW — Unit lists this lesson');
  });
});
