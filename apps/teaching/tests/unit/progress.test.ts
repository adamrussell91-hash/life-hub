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
  it('a fully marked quiz is complete, even on an assessment', () => {
    const a = { ...core, assessment: true };
    expect(cellFor({ ...base, lesson: a, quizSubmitted: true, quizMarked: true, today: '2027-01-01' })).toEqual({ state: 'complete', late: false });
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
  it('counts a marked quiz on an assessment lesson, with the score in the cell, and bands lessons by unit', () => {
    const marked = {
      ...view,
      done: {},
      quizzes: [{ lesson_id: 'l2', scores: { s1: { submitted_at: '2026-10-03', score: 15, max: 20, pending: 0 }, s2: { submitted_at: '2026-10-03', score: 4, max: 20, pending: 2 } } }]
    } as never;
    const lessons = [{ ...core, unit: 'Poetry' }, { ...core, id: 'l2', title: 'Test', assessment: true, unit: 'Novel' }];
    const root = renderProgress({ view: marked, students, lessons, today: '2026-10-20', onMark: vi.fn() });
    const cell = (s: string) => root.querySelector<HTMLButtonElement>(`[data-student="${s}"][data-lesson="l2"]`)!;
    expect(cell('s1').dataset.state).toBe('complete');
    expect(cell('s1').title).toContain('quiz 15/20');
    expect(cell('s2').dataset.state).toBe('partial');
    expect(cell('s2').title).toContain('2 to mark');
    expect([...root.querySelectorAll('.mb-progress__unit')].map((n) => n.textContent)).toEqual(['Poetry', 'Novel']);
  });
  it('says so when there are no lessons', () => {
    expect(renderProgress({ view, students, lessons: [], today: '2026-10-20', onMark: vi.fn() }).textContent).toContain('no unit lessons');
  });
});

import { unitProgressLessons } from '@/markbook/progress';
describe('unitProgressLessons', () => {
  it('lists the unit in order with roles, assessments and the earliest set date, skipping trashed lessons', () => {
    const out = unitProgressLessons(
      [{ lesson_ids: ['a', 'b', 'c', 'gone'] }] as never,
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

  it('orders lessons by set date across units, undated lessons last in unit order', () => {
    const out = unitProgressLessons(
      [{ title: 'Poetry', lesson_ids: ['p1', 'p2', 'p3'] }, { title: 'Novel', lesson_ids: ['n1', 'n2'] }] as never,
      ['p1', 'p2', 'p3', 'n1', 'n2'].map((id) => ({ id, title: id })),
      [
        { lesson_id: 'p1', date: '2026-10-20' },
        { lesson_id: 'p2', date: '2026-10-06' },
        { lesson_id: 'n2', date: '2026-10-13' }
      ] as never
    );
    expect(out.map((l) => l.id)).toEqual(['p2', 'n2', 'p1', 'p3', 'n1']);
  });

  it('runs across every active unit in order, each lesson once, tagged with its unit', () => {
    const out = unitProgressLessons(
      [{ title: 'Poetry', lesson_ids: ['a', 'b'] }, { title: 'Novel', lesson_ids: ['b', 'q'] }] as never,
      [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'q', title: 'Quiz', pedagogical_mode: 'quiz' }],
      []
    );
    expect(out.map((l) => [l.id, l.unit])).toEqual([['a', 'Poetry'], ['b', 'Poetry'], ['q', 'Novel']]);
  });

});
