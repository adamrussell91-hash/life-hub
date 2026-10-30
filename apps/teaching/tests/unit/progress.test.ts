import { describe, expect, it, vi } from 'vitest';
import { cellFor, withMark, type ProgressLesson } from '@/markbook/progress';
import { renderBook, renderBookPhone } from '@/markbook/book';

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

describe('withMark', () => {
  it('lays a teacher mark over the student record and clearing brings it back', () => {
    const tick = { at: 'a', via: 'tick' };
    const marked = withMark({ l1: tick }, 'l1', 'complete', 'b');
    expect(marked.l1).toEqual({ at: 'b', via: 'teacher', was: tick });
    expect(withMark(marked, 'l1', 'clear', 'c')).toEqual({ l1: tick });
    expect(withMark({}, 'l1', 'clear', 'c')).toEqual({});
  });
});

describe('renderBook', () => {
  const students = [{ id: 's1', name: 'Bob Brown', initials: 'BB' }, { id: 's2', name: 'Tom Tills', initials: 'TT' }];
  const noop = () => {};
  const actions = { setMark: noop, openAssessment: noop, openQuiz: noop, openWork: noop, editColumn: noop, hideQuiz: noop, openHeatmap: noop, openStudent: noop };
  const quiz = (extra = {}) => ({
    kind: 'quiz', id: 'quiz:l2', lesson_id: 'l2', title: 'Test', date: '2026-10-03', hidden: false, confidence: false, questions: [{ id: 'q', prompt: '', marks: 20, outcomes: [] }],
    scores: { s1: { attempt_id: 'a', submitted_at: '2026-10-03', score: 15, max: 20, pending: 0, rows: [] }, s2: { attempt_id: 'b', submitted_at: '2026-10-03', score: 4, max: 20, pending: 2, rows: [] } },
    ...extra
  });
  const book = (done: object, quizzes: object[] = [], columns: object[] = []) =>
    ({ markbook: { columns, hidden_quizzes: [], marks: {}, updated_at: '', took: {} }, students, quizzes, done }) as never;
  const draw = (view: never, lessons: ProgressLesson[], onMark = vi.fn(), show: 'all' | 'marked' | 'lessons' = 'all', setShow = vi.fn()) =>
    renderBook({ view, students, lessons, actions, today: '2026-10-20', show, setShow, onMark });

  it('draws a lesson box per student, ticks on press and undoes a tick of yours on the next', () => {
    const onMark = vi.fn();
    const root = draw(book({ s1: { l1: { at: 'x', via: 'tick' }, l2: { at: 'x', via: 'teacher' } } }), [core, { ...core, id: 'l2', title: 'Extra', role: 'extension' }], onMark);
    const cell = (s: string, l: string) => root.querySelector<HTMLButtonElement>(`[data-student="${s}"][data-lesson="${l}"]`)!;
    expect(cell('s1', 'l1').dataset.state).toBe('complete');
    expect(cell('s2', 'l1').dataset.state).toBe('open');
    expect(cell('s2', 'l1').dataset.late).toBe('true');
    expect(cell('s2', 'l2').dataset.state).toBe('na');
    expect(cell('s2', 'l1').getAttribute('aria-label')).toContain('overdue');
    expect(cell('s1', 'l2').dataset.override).toBe('true');
    cell('s2', 'l1').click();
    cell('s1', 'l1').click();
    cell('s1', 'l2').click();
    expect(onMark.mock.calls).toEqual([['s2', 'l1', 'complete'], ['s1', 'l1', 'complete'], ['s1', 'l2', 'clear']]);
  });

  it('shows a quiz lesson once, as its mark, in date order with the lessons and a unit band', () => {
    const lessons = [{ ...core, unit: 'Poetry' }, { ...core, id: 'l2', title: 'Test', date: '2026-10-03', unit: 'Novel' }];
    const root = draw(book({}, [quiz()]), lessons);
    expect(root.querySelector('[data-lesson="l2"]')).toBeNull();
    const marks = [...root.querySelectorAll<HTMLButtonElement>('.mb-cell--quiz')];
    expect(marks.map((b) => b.textContent)).toEqual(['15/20', '4/20']);
    expect(marks.map((b) => b.dataset.result)).toEqual(['done', 'waiting']);
    expect([...root.querySelectorAll('thead .mb-col__title, thead .mb-progress__title')].map((n) => n.textContent)).toEqual(['Poem', 'Test']);
    expect([...root.querySelectorAll('.mb-progress__unit')].map((n) => n.textContent)).toEqual(['Poetry', 'Novel']);
  });

  it('pins Done (core lessons so far) and Overall on the right', () => {
    const later = { ...core, id: 'l3', title: 'Later', date: '2026-11-30' };
    const root = draw(book({ s1: { l1: { at: 'x', via: 'tick' } } }), [core, later]);
    const done = [...root.querySelectorAll('tbody .mb-book__pin--done')].map((n) => n.textContent);
    expect(done).toEqual(['1/1', '0/1']);
    expect(root.querySelectorAll('tbody .mb-book__pin--overall')).toHaveLength(2);
  });

  it('filters to marked work or lessons, and the chips say which is on', () => {
    const setShow = vi.fn();
    const view = book({}, [quiz()]);
    const lessons = [core];
    expect(draw(view, lessons, vi.fn(), 'marked').querySelector('[data-lesson="l1"]')).toBeNull();
    const onlyLessons = draw(view, lessons, vi.fn(), 'lessons', setShow);
    expect(onlyLessons.querySelector('.mb-cell--quiz')).toBeNull();
    expect(onlyLessons.querySelector('[data-show="lessons"]')!.getAttribute('aria-pressed')).toBe('true');
    onlyLessons.querySelector<HTMLButtonElement>('[data-show="all"]')!.click();
    expect(setShow).toHaveBeenCalledWith('all');
  });

  it('on a phone, lists one student by unit: lesson boxes, marks, Done and Overall', () => {
    const onMark = vi.fn();
    const lessons = [{ ...core, unit: 'Poetry' }, { ...core, id: 'l2', title: 'Test', date: '2026-10-03', unit: 'Poetry' }];
    const card = renderBookPhone({ view: book({ s1: { l1: { at: 'x', via: 'tick' } } }, [quiz()]), students, lessons, actions, today: '2026-10-20', show: 'all', setShow: vi.fn(), onMark, index: 0, move: vi.fn() });
    expect(card.querySelector('.mb-book__unit')!.textContent).toBe('Poetry');
    // The handed-in quiz counts as a core lesson done.
    expect(card.querySelector('.mb-phone__done')!.textContent).toBe('2/2');
    expect(card.querySelector('.mb-cell--quiz')!.textContent).toBe('15/20');
    card.querySelector<HTMLButtonElement>('[data-lesson="l1"]')!.click();
    expect(onMark).toHaveBeenCalledWith('s1', 'l1', 'complete');
  });
  it('says so when there is nothing to show', () => {
    expect(draw(book({}), []).textContent).toContain('no unit lessons');
    expect(draw(book({}), [core], vi.fn(), 'marked').textContent).toContain('No marked work yet');
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

  it('ignores skipped calendar rows when dating a lesson', () => {
    const out = unitProgressLessons(
      [{ lesson_ids: ['a'] }] as never,
      [{ id: 'a', title: 'A' }],
      [{ lesson_id: 'a', date: '2026-10-01', delivery_status: 'skipped' }, { lesson_id: 'a', date: '2026-11-03', delivery_status: 'planned' }] as never
    );
    expect(out[0]?.date).toBe('2026-11-03');
  });

});
