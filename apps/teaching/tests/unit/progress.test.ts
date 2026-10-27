import { describe, expect, it, vi } from 'vitest';
import { cellFor, renderProgress, type ProgressLesson } from '@/markbook/progress';

const core: ProgressLesson = { id: 'l1', title: 'Poem', role: 'core', assessment: false, date: '2026-10-01' };
const base = { lesson: core, record: undefined, quizSubmitted: false, quizStarted: false, took: false, today: '2026-10-05' };

describe('cellFor', () => {
  it('a tick or a submitted quiz is complete, and never late', () => {
    expect(cellFor({ ...base, record: { at: 'x', via: 'tick' }, today: '2026-12-01' })).toEqual({ state: 'complete', late: false });
    expect(cellFor({ ...base, quizSubmitted: true }).state).toBe('complete');
  });
  it('a started quiz or a teacher partial mark is partial', () => {
    expect(cellFor({ ...base, quizStarted: true }).state).toBe('partial');
    expect(cellFor({ ...base, record: { at: 'x', via: 'teacher', partial: true } }).state).toBe('partial');
  });
  it('red dot only once a full week has passed since the set date', () => {
    expect(cellFor({ ...base, today: '2026-10-08' }).late).toBe(false);
    expect(cellFor({ ...base, today: '2026-10-09' }).late).toBe(true);
    expect(cellFor({ ...base, lesson: { ...core, date: undefined }, today: '2027-01-01' }).late).toBe(false);
    expect(cellFor({ ...base, quizStarted: true, today: '2026-10-20' })).toEqual({ state: 'partial', late: true });
  });
  it('a side lesson not taken is a grey box, and never late', () => {
    const side = { ...core, role: 'support' as const };
    expect(cellFor({ ...base, lesson: side, today: '2027-01-01' })).toEqual({ state: 'na', late: false });
    expect(cellFor({ ...base, lesson: side, took: true, today: '2027-01-01' })).toEqual({ state: 'open', late: true });
    expect(cellFor({ ...base, lesson: side, record: { at: 'x', via: 'tick' } }).state).toBe('complete');
  });
  it('an assessment is complete only when the teacher marks it; handed in is waiting', () => {
    const a = { ...core, assessment: true };
    expect(cellFor({ ...base, lesson: a, record: { at: 'x', via: 'tick' } }).state).toBe('partial');
    expect(cellFor({ ...base, lesson: a, quizSubmitted: true }).state).toBe('partial');
    expect(cellFor({ ...base, lesson: a, record: { at: 'x', via: 'teacher' } }).state).toBe('complete');
  });
});

describe('renderProgress', () => {
  const view = {
    markbook: { took: {} },
    quizzes: [],
    done: { s1: { l1: { at: 'x', via: 'tick' } } }
  } as never;
  const students = [{ id: 's1', name: 'Bob Brown', initials: 'BB' }, { id: 's2', name: 'Tom Tills', initials: 'TT' }];
  it('draws a cell per student and lesson, with words for each, and marks on press', () => {
    const onMark = vi.fn();
    const root = renderProgress({ view, students, lessons: [core, { ...core, id: 'l2', title: 'Extra', role: 'extension' }], today: '2026-10-20', onMark });
    const cell = (s: string, l: string) => root.querySelector<HTMLButtonElement>(`[data-student="${s}"][data-lesson="${l}"]`)!;
    expect(cell('s1', 'l1').dataset.state).toBe('complete');
    expect(cell('s2', 'l1').dataset.state).toBe('open');
    expect(cell('s2', 'l1').dataset.late).toBe('true');
    expect(cell('s2', 'l2').dataset.state).toBe('na');
    expect(cell('s2', 'l1').getAttribute('aria-label')).toContain('overdue');
    cell('s2', 'l1').click();
    cell('s1', 'l1').click();
    expect(onMark).toHaveBeenNthCalledWith(1, 's2', 'l1', 'complete');
    expect(onMark).toHaveBeenNthCalledWith(2, 's1', 'l1', 'partial');
  });
  it('says so when there are no lessons', () => {
    expect(renderProgress({ view, students, lessons: [], today: '2026-10-20', onMark: vi.fn() }).textContent).toContain('no unit lessons');
  });
});

import { unitProgressLessons } from '@/markbook/progress';
describe('unitProgressLessons', () => {
  it('lists the unit in order with roles, assessments and the earliest set date, skipping trashed lessons', () => {
    const out = unitProgressLessons(
      { lesson_ids: ['a', 'b', 'c', 'gone'] } as never,
      [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B', route_role: 'support' },
        { id: 'c', title: 'C', pedagogical_mode: 'assessment', status: 'active' },
        { id: 'gone', title: 'X', status: 'trashed' }
      ],
      [{ lesson_id: 'a', date: '2026-10-08T09:00:00' }, { lesson_id: 'a', date: '2026-10-02' }] as never
    );
    expect(out).toEqual([
      { id: 'a', title: 'A', role: 'core', assessment: false, date: '2026-10-02' },
      { id: 'b', title: 'B', role: 'support', assessment: false },
      { id: 'c', title: 'C', role: 'core', assessment: true }
    ]);
  });
});
