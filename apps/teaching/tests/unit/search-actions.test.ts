import { describe, expect, it } from 'vitest';
import type { CurriculumResponse } from '@/teacher/nav';
import {
  filterActions,
  listSearchActions,
  resolveTodayClassId,
  type SearchActionContext
} from '@/teacher/search/actions';

const base: SearchActionContext = {
  path: '/',
  hasLessonEditor: false,
  todayClassId: undefined
};

function curriculumFixture(): CurriculumResponse {
  return {
    years: [],
    subjects: [],
    units: [],
    lessons: [],
    classes: [],
    scheduled_lessons: [
      {
        id: 'sched_1',
        type: 'scheduled_lesson',
        class_id: 'c1',
        unit_id: 'u1',
        lesson_id: 'l1',
        date: '2026-08-12',
        schedule_order: 1,
        delivery_status: 'planned',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      },
      {
        id: 'sched_2',
        type: 'scheduled_lesson',
        class_id: 'c2',
        unit_id: 'u1',
        lesson_id: 'l2',
        date: '2026-08-12',
        schedule_order: 2,
        delivery_status: 'planned',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        schema_version: 1
      }
    ],
    scope_sequences: [],
    media: [],
    schedule_anchor_date: '2026-08-12'
  };
}

describe('listSearchActions', () => {
  it('always includes create + home', () => {
    const ids = listSearchActions(base).map((a) => a.id);
    expect(ids).toContain('new-lesson');
    expect(ids).toContain('new-unit');
    expect(ids).toContain('new-class');
    expect(ids).toContain('new-subject');
    expect(ids).toContain('new-scope');
    expect(ids).toContain('open-home');
  });

  it('includes student view only on teacher lesson/unit/class routes', () => {
    expect(
      listSearchActions({ ...base, path: '/lessons/l1' }).some((a) => a.id === 'open-student-view')
    ).toBe(true);
    expect(
      listSearchActions({ ...base, path: '/units/u1' }).some((a) => a.id === 'open-student-view')
    ).toBe(true);
    expect(
      listSearchActions({ ...base, path: '/classes/c1' }).some((a) => a.id === 'open-student-view')
    ).toBe(true);
    expect(
      listSearchActions({ ...base, path: '/' }).some((a) => a.id === 'open-student-view')
    ).toBe(false);
    expect(
      listSearchActions({ ...base, path: '/lessons' }).some((a) => a.id === 'open-student-view')
    ).toBe(false);
  });

  it('includes A4 + publish only with lesson editor', () => {
    const withEditor = listSearchActions({ ...base, path: '/lessons/l1', hasLessonEditor: true });
    const print = withEditor.find((a) => a.id === 'open-a4');
    expect(print?.title).toBe('Print lesson');
    expect(print?.keywords).toEqual(expect.arrayContaining(['print', 'a4']));
    expect(withEditor.some((a) => a.id === 'publish-lesson')).toBe(true);

    const withoutEditor = listSearchActions({ ...base, path: '/lessons/l1', hasLessonEditor: false });
    expect(withoutEditor.some((a) => a.id === 'open-a4')).toBe(false);
    expect(withoutEditor.some((a) => a.id === 'publish-lesson')).toBe(false);
  });

  it('includes today class only when resolvable', () => {
    expect(listSearchActions({ ...base, todayClassId: 'c1' }).some((a) => a.id === 'open-today-class')).toBe(
      true
    );
    expect(listSearchActions(base).some((a) => a.id === 'open-today-class')).toBe(false);
  });
});

describe('filterActions', () => {
  const actions = listSearchActions(base);

  it('returns all actions for empty query', () => {
    expect(filterActions(actions, '')).toEqual(actions);
    expect(filterActions(actions, '   ')).toEqual(actions);
  });

  it('matches title and keywords case-insensitively', () => {
    const hits = filterActions(actions, 'lesson');
    expect(hits.some((a) => a.id === 'new-lesson')).toBe(true);

    const publishHits = filterActions(
      listSearchActions({ ...base, path: '/lessons/l1', hasLessonEditor: true }),
      'publish'
    );
    expect(publishHits.some((a) => a.id === 'publish-lesson')).toBe(true);
  });

  it('returns empty when nothing matches', () => {
    expect(filterActions(actions, 'zzzznotfound')).toEqual([]);
  });
});

describe('resolveTodayClassId', () => {
  it('returns the first scheduled class for the anchor date', () => {
    expect(resolveTodayClassId(curriculumFixture())).toBe('c1');
  });

  it('returns undefined when no lessons are scheduled today', () => {
    const curriculum = curriculumFixture();
    curriculum.scheduled_lessons = [];
    expect(resolveTodayClassId(curriculum)).toBeUndefined();
  });

  it('accepts an explicit today override', () => {
    const curriculum = curriculumFixture();
    curriculum.scheduled_lessons[0].date = '2026-08-15';
    expect(resolveTodayClassId(curriculum, '2026-08-15')).toBe('c1');
  });
});
