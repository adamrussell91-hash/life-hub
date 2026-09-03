import { describe, it, expect } from 'vitest';
import {
  selectUnpublishedChanges,
  selectRecentlyEdited,
  selectTodaySchedule,
  groupWeekSchedule,
  HOME_ATTENTION_LIMIT
} from '@/teacher/home-model';
import type { CurriculumLessonSummary } from '@/teacher/nav';
import type { ScheduledLesson } from '@/schemas';

const ISO = '2026-01-01T00:00:00.000Z';

const lessons: CurriculumLessonSummary[] = [
  {
    id: 'l1',
    title: 'One',
    slug: 'one',
    unit_id: 'u',
    sequence: 1,
    status: 'active',
    published: true,
    updated_at: '2026-08-12T15:00:00.000Z',
    published_at: '2026-08-10T10:00:00.000Z'
  },
  {
    id: 'l2',
    title: 'Two',
    slug: 'two',
    unit_id: 'u',
    sequence: 2,
    status: 'active',
    published: true,
    updated_at: '2026-08-11T12:00:00.000Z',
    published_at: '2026-08-11T12:00:00.000Z'
  },
  {
    id: 'l3',
    title: 'Three',
    slug: 'three',
    unit_id: 'u',
    sequence: 3,
    status: 'active',
    published: false,
    updated_at: '2026-08-13T09:00:00.000Z'
  }
];

const scheduled: ScheduledLesson[] = [
  {
    id: 'sched_1',
    type: 'scheduled_lesson',
    class_id: 'class_demo',
    unit_id: 'u',
    lesson_id: 'l1',
    date: '2026-08-12',
    schedule_order: 1,
    delivery_status: 'planned',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1
  },
  {
    id: 'sched_2',
    type: 'scheduled_lesson',
    class_id: 'class_demo',
    unit_id: 'u',
    lesson_id: 'l2',
    date: '2026-08-13',
    schedule_order: 2,
    delivery_status: 'planned',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1
  },
  {
    id: 'sched_3',
    type: 'scheduled_lesson',
    class_id: 'class_demo',
    unit_id: 'u',
    lesson_id: 'l3',
    date: '2026-08-10',
    schedule_order: 3,
    delivery_status: 'planned',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1
  }
];

describe('selectUnpublishedChanges', () => {
  it('includes only lessons edited after publish', () => {
    const rows = selectUnpublishedChanges(lessons);
    expect(rows.map((l) => l.id)).toEqual(['l1']);
  });
});

describe('selectRecentlyEdited', () => {
  it('orders by updated_at desc and respects limit', () => {
    const rows = selectRecentlyEdited(lessons, 2);
    expect(rows.map((l) => l.id)).toEqual(['l3', 'l1']);
    expect(HOME_ATTENTION_LIMIT).toBe(8);
  });
});

describe('selectTodaySchedule', () => {
  it('filters schedule to the anchor date', () => {
    const rows = selectTodaySchedule(scheduled, '2026-08-12');
    expect(rows).toHaveLength(1);
    expect(rows[0].lesson_id).toBe('l1');
  });
});

describe('groupWeekSchedule', () => {
  it('groups Mon–Sun for the week containing the anchor and omits empty days', () => {
    // 2026-08-12 is Wednesday; week Mon 10 – Sun 16
    const groups = groupWeekSchedule(scheduled, '2026-08-12');
    expect(groups.map((g) => g.date)).toEqual(['2026-08-10', '2026-08-12', '2026-08-13']);
    expect(groups[0].entries.map((e) => e.lesson_id)).toEqual(['l3']);
  });
});
