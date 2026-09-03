import { describe, it, expect } from 'vitest';
import { buildPublishedClass } from '@/schedule/build-published-class';
import type { Class, ScheduledLesson, Unit } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const baseClass: Class = {
  id: 'class_2026_12engadv1',
  type: 'class',
  code: '12ENGADV1',
  title: 'Year 12 English Advanced',
  slug: '12engadv1',
  display_name: '12ENGADV1',
  academic_year: 2026,
  year_id: 'year_12',
  subject_id: 'subject_y12_engadv',
  active_unit_ids: ['unit_aotfw'],
  current_unit_id: 'unit_aotfw',
  current_scheduled_lesson_id: 'scheduled_b',
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const units: Unit[] = [
  {
    id: 'unit_aotfw',
    type: 'unit',
    title: 'Artist of the Floating World',
    slug: 'aotfw',
    year_id: 'year_12',
    subject_id: 'subject_y12_engadv',
    lesson_ids: ['lesson_a', 'lesson_c', 'lesson_b'],
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1
  }
];

const scheduled: ScheduledLesson[] = [
  {
    id: 'scheduled_b',
    type: 'scheduled_lesson',
    class_id: 'class_2026_12engadv1',
    unit_id: 'unit_aotfw',
    lesson_id: 'lesson_b',
    date: '2026-08-12',
    schedule_order: 2,
    delivery_status: 'current',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1
  },
  {
    id: 'scheduled_a',
    type: 'scheduled_lesson',
    class_id: 'class_2026_12engadv1',
    unit_id: 'unit_aotfw',
    lesson_id: 'lesson_a',
    date: '2026-08-11',
    schedule_order: 1,
    delivery_status: 'planned',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1
  }
];

describe('buildPublishedClass', () => {
  it('normalizes missing homepage to empty arrays', () => {
    const dto = buildPublishedClass({
      cls: baseClass,
      units,
      lessons: [
        { id: 'lesson_a', title: 'Lesson A' },
        { id: 'lesson_b', title: 'Lesson B' }
      ],
      scheduled,
      publishedLessonIds: new Set(['lesson_a'])
    });

    expect(dto.homepage).toEqual({
      announcements: [],
      resources: [],
      custom: []
    });
  });

  it('orders schedule by schedule_order and marks published lessons', () => {
    const dto = buildPublishedClass({
      cls: baseClass,
      units,
      lessons: [
        { id: 'lesson_a', title: 'Lesson A' },
        { id: 'lesson_b', title: 'Lesson B' }
      ],
      scheduled,
      publishedLessonIds: new Set(['lesson_a'])
    });

    expect(dto.schedule.map((row) => row.id)).toEqual(['scheduled_a', 'scheduled_b']);
    expect(dto.schedule[0]).toMatchObject({
      lesson_id: 'lesson_a',
      unit_id: 'unit_aotfw',
      title: 'Lesson A',
      published: true
    });
    expect(dto.schedule[1]).toMatchObject({
      lesson_id: 'lesson_b',
      title: 'Lesson B',
      published: false
    });
  });

  it('resolves current unit and current lesson titles', () => {
    const dto = buildPublishedClass({
      cls: baseClass,
      units,
      lessons: [
        { id: 'lesson_a', title: 'Lesson A' },
        { id: 'lesson_b', title: 'Lesson B' }
      ],
      scheduled,
      publishedLessonIds: new Set()
    });

    expect(dto.current_unit).toEqual({
      id: 'unit_aotfw',
      title: 'Artist of the Floating World',
      lessons: []
    });
    expect(dto.current_lesson).toEqual({
      id: 'scheduled_b',
      title: 'Lesson B',
      lesson_id: 'lesson_b'
    });
    expect(dto.active_units).toEqual([
      { id: 'unit_aotfw', title: 'Artist of the Floating World' }
    ]);
  });

  it('includes ordered published lessons on current_unit', () => {
    const dto = buildPublishedClass({
      cls: baseClass,
      units,
      lessons: [
        { id: 'lesson_a', title: 'Lesson A' },
        { id: 'lesson_b', title: 'Lesson B' },
        { id: 'lesson_c', title: 'Lesson C' }
      ],
      scheduled,
      publishedLessonIds: new Set(['lesson_a', 'lesson_b'])
    });
    expect(dto.current_unit?.lessons.map((l) => l.id)).toEqual(['lesson_a', 'lesson_b']);
  });
});
