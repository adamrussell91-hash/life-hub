import { describe, it, expect } from 'vitest';
import { ClassSchema } from '@/schemas/class';
import { ScheduledLessonSchema } from '@/schemas/scheduled-lesson';

const ISO = '2026-01-01T00:00:00.000Z';

const baseClass = {
  id: 'class_2026_12engadv1',
  type: 'class' as const,
  code: '12ENGADV1',
  title: 'Year 12 English Advanced',
  slug: '12engadv1',
  academic_year: 2026,
  year_id: 'year_12',
  subject_id: 'subject_y12_engadv',
  active_unit_ids: ['unit_aotfw'],
  status: 'active' as const,
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1 as const
};

const validHeadingBlock = {
  id: 'block_001',
  type: 'block' as const,
  block_type: 'heading' as const,
  variant: 'section' as const,
  visibility: 'student_teacher' as const,
  content: { text: 'Welcome' },
  layout: {},
  print: {},
  settings: {},
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1 as const
};

describe('ClassSchema', () => {
  it('parses a class', () => {
    const cls = ClassSchema.parse({
      id: 'class_2026_12engadv1',
      type: 'class',
      code: '12ENGADV1',
      title: 'Year 12 English Advanced',
      slug: '12engadv1',
      academic_year: 2026,
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      active_unit_ids: ['unit_aotfw'],
      current_unit_id: 'unit_aotfw',
      current_scheduled_lesson_id: 'scheduled_aotfw_008',
      status: 'active',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    });
    expect(cls.code).toBe('12ENGADV1');
  });

  it('accepts meeting_days', () => {
    const cls = ClassSchema.parse({
      id: 'class_2026_12engadv1',
      type: 'class',
      code: '12ENGADV1',
      title: 'Year 12 English Advanced',
      slug: '12engadv1',
      academic_year: 2026,
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      active_unit_ids: ['unit_aotfw'],
      meeting_days: [1, 3, 5],
      status: 'active',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    });
    expect(cls.meeting_days).toEqual([1, 3, 5]);
  });

  it('rejects empty code', () => {
    expect(() =>
      ClassSchema.parse({
        id: 'c1',
        type: 'class',
        code: '',
        title: 'X',
        slug: 'x',
        academic_year: 2026,
        year_id: 'year_12',
        subject_id: 's1',
        active_unit_ids: [],
        status: 'active',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1
      })
    ).toThrow();
  });

  it('accepts homepage with a valid heading block in announcements', () => {
    const cls = ClassSchema.parse({
      ...baseClass,
      homepage: {
        announcements: [validHeadingBlock],
        resources: [],
        custom: []
      }
    });
    expect(cls.homepage?.announcements).toHaveLength(1);
    expect(cls.homepage?.announcements[0]?.block_type).toBe('heading');
    expect(cls.homepage?.announcements[0]?.content).toEqual({ text: 'Welcome' });
  });

  it('rejects invalid homepage blocks', () => {
    expect(() =>
      ClassSchema.parse({
        ...baseClass,
        homepage: {
          announcements: [
            {
              ...validHeadingBlock,
              block_type: 'slideshow',
              content: { slides: [] }
            }
          ],
          resources: [],
          custom: []
        }
      })
    ).toThrow();
  });
});

describe('ScheduledLessonSchema', () => {
  it('parses a scheduled lesson', () => {
    const row = ScheduledLessonSchema.parse({
      id: 'scheduled_aotfw_008',
      type: 'scheduled_lesson',
      class_id: 'class_2026_12engadv1',
      lesson_id: 'lesson_aotfw_008',
      unit_id: 'unit_aotfw',
      date: '2026-08-12',
      schedule_order: 3,
      delivery_status: 'planned',
      created_at: ISO,
      updated_at: ISO,
      schema_version: 1
    });
    expect(row.date).toBe('2026-08-12');
  });

  it('rejects invalid delivery_status', () => {
    expect(() =>
      ScheduledLessonSchema.parse({
        id: 's1',
        type: 'scheduled_lesson',
        class_id: 'c1',
        lesson_id: 'l1',
        unit_id: 'u1',
        date: '2026-08-12',
        schedule_order: 1,
        delivery_status: 'done',
        created_at: ISO,
        updated_at: ISO,
        schema_version: 1
      })
    ).toThrow();
  });
});
