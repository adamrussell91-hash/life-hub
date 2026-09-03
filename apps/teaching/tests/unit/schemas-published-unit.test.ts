import { describe, it, expect } from 'vitest';
import {
  PublishedUnitSchema,
  orderLessonsByUnitIds
} from '@/schemas/published-unit';

describe('PublishedUnitSchema', () => {
  it('parses a unit with published lesson summaries', () => {
    const unit = PublishedUnitSchema.parse({
      unit_id: 'unit_aotfw',
      title: 'AOTFW',
      lessons: [
        { lesson_id: 'lesson_aotfw_008', title: 'Memory' },
        { lesson_id: 'lesson_aotfw_001', title: 'Intro' }
      ]
    });
    expect(unit.lessons).toHaveLength(2);
  });

  it('rejects empty unit_id or title', () => {
    expect(() =>
      PublishedUnitSchema.parse({ unit_id: '', title: 'X', lessons: [] })
    ).toThrow();
  });
});

describe('orderLessonsByUnitIds', () => {
  it('orders by lesson_ids and appends unknowns last by title', () => {
    const ordered = orderLessonsByUnitIds(
      ['lesson_b', 'lesson_a'],
      [
        { lesson_id: 'lesson_a', title: 'A' },
        { lesson_id: 'lesson_c', title: 'C' },
        { lesson_id: 'lesson_b', title: 'B' }
      ]
    );
    expect(ordered.map((l) => l.lesson_id)).toEqual([
      'lesson_b',
      'lesson_a',
      'lesson_c'
    ]);
  });

  it('sorts by title when lesson_ids is empty', () => {
    const ordered = orderLessonsByUnitIds(
      [],
      [
        { lesson_id: 'l2', title: 'Zebra' },
        { lesson_id: 'l1', title: 'Alpha' }
      ]
    );
    expect(ordered.map((l) => l.lesson_id)).toEqual(['l1', 'l2']);
  });
});
