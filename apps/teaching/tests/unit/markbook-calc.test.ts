import { describe, expect, it } from 'vitest';
import type { AssessmentColumn, Markbook } from '@/markbook/schema';
import type { MarkbookView, QuizColumn } from '@/markbook/types';
import { assessmentResult, bandFor, formatDay, formatPercent, orderedColumns, overallFor, quizPercent, rowStudents, sortStudents, sydneyDay, todayInSydney, weightTotal } from '@/markbook/calc';
import { nextCheck, nextHandin } from '@/markbook/cells';

const task = (id: string, weight: number, max = 20, date = '2026-11-01'): AssessmentColumn => ({
  id, kind: 'assessment', title: id, date, weight, criteria: [{ id: `${id}c1`, label: 'All', max, outcomes: [] }]
});
const book = (columns: AssessmentColumn[], marks: Markbook['marks']): Markbook => ({ columns, hidden_quizzes: [], marks, updated_at: '' });

describe('assessment results', () => {
  const two: AssessmentColumn = { ...task('essay0001', 30), criteria: [{ id: 'c1', label: 'A', max: 15, outcomes: [] }, { id: 'c2', label: 'B', max: 10, outcomes: [] }] };
  it('is blank, partial, complete or exempt', () => {
    expect(assessmentResult(two, undefined)).toEqual({ exempt: false, score: null, max: 25, percent: null, complete: false });
    expect(assessmentResult(two, { criteria: { c1: 12 } })).toEqual({ exempt: false, score: 12, max: 25, percent: null, complete: false });
    expect(assessmentResult(two, { criteria: { c1: 12, c2: 8 } })).toEqual({ exempt: false, score: 20, max: 25, percent: 80, complete: true });
    expect(assessmentResult(two, { criteria: {}, exempt: true })).toMatchObject({ exempt: true, percent: null });
  });
  it('finds the band a mark sits in', () => {
    const c = { id: 'c', label: 'A', max: 15, outcomes: [], bands: [{ label: 'C', min: 7 }, { label: 'A', min: 13 }, { label: 'B', min: 10 }] };
    expect(bandFor(c, 14)).toBe('A');
    expect(bandFor(c, 10)).toBe('B');
    expect(bandFor(c, 3)).toBeNull();
    expect(bandFor({ ...c, bands: undefined }, 14)).toBeNull();
  });
});

describe('overall mark', () => {
  const cols = [task('t1aaaaaa', 25), task('t2aaaaaa', 35), task('t3aaaaaa', 40)];
  it('weights marked tasks and says when it is only so far', () => {
    const b = book(cols, { t1aaaaaa: { s1: { criteria: { t1aaaaaac1: 20 } } }, t2aaaaaa: { s1: { criteria: { t2aaaaaac1: 10 } } } });
    const o = overallFor(b, 's1');
    expect(o.partial).toBe(true);
    expect(o.percent).toBeCloseTo((25 * 100 + 35 * 50) / 60);
  });
  it('spreads an exempt task’s weight over the rest', () => {
    const b = book(cols, {
      t1aaaaaa: { s1: { criteria: { t1aaaaaac1: 20 } } },
      t2aaaaaa: { s1: { criteria: {}, exempt: true } },
      t3aaaaaa: { s1: { criteria: { t3aaaaaac1: 10 } } }
    });
    expect(overallFor(b, 's1')).toEqual({ percent: (25 * 100 + 40 * 50) / 65, partial: false });
  });
  it('ignores zero-weight tasks and is blank with nothing marked', () => {
    const b = book([task('t0aaaaaa', 0), task('t1aaaaaa', 25)], { t0aaaaaa: { s1: { criteria: { t0aaaaaac1: 0 } } } });
    expect(overallFor(b, 's1')).toEqual({ percent: null, partial: true });
    expect(weightTotal(b)).toBe(25);
  });
});

describe('ordering and rows', () => {
  const quiz: QuizColumn = { kind: 'quiz', id: 'quiz:l1', lesson_id: 'l1', title: 'Quiz 1', date: '2026-10-20', hidden: false, confidence: false, questions: [], scores: {} };
  const view: MarkbookView = {
    markbook: book([task('late0001', 10, 20, '2026-11-09'), task('earl0001', 10, 20, '2026-10-01')], { earl0001: { gone: { criteria: {} } } }),
    students: [{ id: 's1', name: 'Tom Tills', initials: 'TT' }, { id: 's2', name: 'Bob Brown', initials: 'BB' }],
    quizzes: [quiz, { ...quiz, id: 'quiz:l2', lesson_id: 'l2', hidden: true }]
  };
  it('puts columns in date order and leaves hidden quizzes out', () => {
    expect(orderedColumns(view).map((c) => c.id)).toEqual(['earl0001', 'quiz:l1', 'late0001']);
  });
  it('sorts by surname and adds removed students on request', () => {
    expect(sortStudents(view.students).map((s) => s.initials)).toEqual(['BB', 'TT']);
    expect(rowStudents(view, false).map((s) => s.id)).toEqual(['s2', 's1']);
    expect(rowStudents(view, true).map((s) => s.name)).toEqual(['Bob Brown', 'Tom Tills', 'Removed student 1']);
    expect(rowStudents(view, true).map((s) => s.removed === true)).toEqual([false, false, true]);
  });
  it('formats percents', () => {
    expect(formatPercent(null)).toBe('–');
    expect(formatPercent(79.6)).toBe('80%');
  });
});

describe('extra calc cases', () => {
  it('uses Sydney days', () => {
    expect(todayInSydney(new Date('2026-10-22T14:30:00Z'))).toBe('2026-10-23');
    expect(todayInSydney(new Date('2026-06-30T13:59:00Z'))).toBe('2026-06-30');
    expect(sydneyDay('2026-10-22T14:30:00Z')).toBe('2026-10-23');
  });
  it('formats days without throwing', () => {
    expect(formatDay('2026-01-01')).toBe('1 Jan');
    expect(formatDay('nope')).toBe('nope');
  });
  it('gives quiz percents', () => {
    const s = { attempt_id: 'a', submitted_at: '', pending: 0, rows: [] };
    expect(quizPercent({ ...s, score: 3, max: 4 })).toBe(75);
    expect(quizPercent({ ...s, score: 0, max: 0 })).toBeNull();
  });
  it('lists a removed student once and orders hand-ins by due date', () => {
    const v: MarkbookView = {
      markbook: {
        columns: [
          { id: 'hand0001', kind: 'handin', title: 'H', due: '2026-10-05' },
          { id: 'task0001', kind: 'assessment', title: 'T', date: '2026-10-10', weight: 0, criteria: [] }
        ],
        hidden_quizzes: [],
        marks: { hand0001: { gone: { status: 'late' } }, task0001: { gone: { criteria: {} } } },
        updated_at: ''
      },
      students: [],
      quizzes: []
    };
    expect(rowStudents(v, true)).toHaveLength(1);
    expect(orderedColumns(v).map((c) => c.id)).toEqual(['hand0001', 'task0001']);
  });
});

describe('tap to cycle', () => {
  it('cycles hand-ins and clears after exempt', () => {
    expect(nextHandin(undefined, '2026-11-03')).toEqual({ status: 'submitted', at: '2026-11-03' });
    expect(nextHandin({ status: 'submitted', at: '2026-11-03' }, '2026-11-04')).toEqual({ status: 'late', at: '2026-11-03' });
    expect(nextHandin({ status: 'late', at: '2026-11-03' }, '2026-11-04')).toEqual({ status: 'missing' });
    expect(nextHandin({ status: 'missing' }, '2026-11-04')).toEqual({ status: 'exempt' });
    expect(nextHandin({ status: 'exempt' }, '2026-11-04')).toBeNull();
  });
  it('cycles checks', () => {
    expect(nextCheck('tick', undefined)).toBe(true);
    expect(nextCheck('tick', true)).toBe(false);
    expect(nextCheck('tick', false)).toBeNull();
    expect(nextCheck('four', undefined)).toBe(1);
    expect(nextCheck('four', 3)).toBe(4);
    expect(nextCheck('four', 4)).toBeNull();
    expect(nextCheck('four', true)).toBe(1);
  });
});
