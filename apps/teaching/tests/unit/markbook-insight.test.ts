import { describe, expect, it } from 'vitest';
import type { MarkbookView, QuizColumn, QuizScore } from '@/markbook/types';
import { band4, evidenceFor, isConfidentlyWrong, isDropping, outcomeCell, outcomesInView, quizSeries, reteachList } from '@/markbook/insight';

const score = (rows: QuizScore['rows'], extra: Partial<QuizScore> = {}): QuizScore => ({
  attempt_id: 'a~0', submitted_at: '2026-10-20T00:00:00Z', score: rows.reduce((s, r) => s + (r.awarded ?? 0), 0), max: rows.reduce((s, r) => s + r.max, 0), pending: rows.filter((r) => r.awarded === null).length, rows, ...extra
});
const quiz = (id: string, date: string, scores: QuizColumn['scores'], confidence = false): QuizColumn => ({
  kind: 'quiz', id: `quiz:${id}`, lesson_id: id, title: id, date, hidden: false, confidence,
  questions: [{ id: 'q1', prompt: 'Name the device', marks: 2, outcomes: ['o2'] }, { id: 'q2', prompt: 'Explain', marks: 2, outcomes: ['o2'] }], scores
});
const base: MarkbookView = {
  markbook: {
    columns: [{ id: 'essay0001', kind: 'assessment', title: 'Essay', date: '2026-11-01', weight: 40, criteria: [{ id: 'c1', label: 'Analysis', max: 20, outcomes: ['o1', 'o2'] }] }],
    hidden_quizzes: [],
    marks: { essay0001: { s1: { criteria: { c1: 15 } }, s2: { criteria: {}, exempt: true } } },
    updated_at: ''
  },
  students: [{ id: 's1', name: 'Bob Brown', initials: 'BB' }, { id: 's2', name: 'Tom Tills', initials: 'TT' }],
  quizzes: [quiz('l1', '2026-10-20', {
    s1: score([{ id: 'q1', awarded: 2, max: 2, confidence: null, outcomes: ['o2'] }, { id: 'q2', awarded: null, max: 2, confidence: null, outcomes: ['o2'] }]),
    s2: score([{ id: 'q1', awarded: 0, max: 2, confidence: null, outcomes: ['o2'] }, { id: 'q2', awarded: 0, max: 2, confidence: null, outcomes: ['o2'] }])
  })]
};

describe('outcome evidence', () => {
  it('collects criteria and marked quiz questions, skipping exempt and pending', () => {
    const ev = evidenceFor(base, 's1');
    expect(ev).toEqual([
      { outcome: 'o1', percent: 75, source: 'Essay', item: 'Analysis' },
      { outcome: 'o2', percent: 75, source: 'Essay', item: 'Analysis' },
      { outcome: 'o2', percent: 100, source: 'l1', item: 'Name the device' }
    ]);
    expect(outcomeCell(ev, 'o2')).toMatchObject({ mean: 87.5, count: 2 });
    expect(outcomeCell(evidenceFor(base, 's2'), 'o1')).toMatchObject({ mean: null, count: 0 });
    expect(outcomesInView(base)).toEqual(['o1', 'o2']);
  });
  it('bands percentages in four steps', () => {
    expect([49.9, 50, 69.9, 70, 84.9, 85].map(band4)).toEqual(['low', 'mid', 'mid', 'good', 'good', 'high']);
  });
});

describe('quiz insight', () => {
  it('lists questions the class averaged below half, lowest first', () => {
    expect(reteachList(base.quizzes[0]!, ['s1', 's2'])).toEqual([{ id: 'q2', prompt: 'Explain', average: 0 }]);
  });
  it('flags a drop of 15 points over the last three quizzes', () => {
    expect(isDropping([80, 80, 60, 60, 65])).toBe(true);
    expect(isDropping([80, 80, 70, 70, 66])).toBe(false);
    expect(isDropping([90, 20, 20, 20])).toBe(false);
  });
  it('builds a series from shown, fully marked quizzes in date order', () => {
    const full = (pct: number) => score([{ id: 'q1', awarded: pct / 50, max: 2, confidence: null, outcomes: [] }]);
    const view: MarkbookView = { ...base, quizzes: [quiz('b', '2026-10-02', { s1: full(50) }), quiz('a', '2026-10-01', { s1: full(100) }), { ...quiz('c', '2026-10-03', { s1: full(0) }), hidden: true }, base.quizzes[0]!] };
    expect(quizSeries(view, 's1')).toEqual([100, 50]);
  });
  it('flags students who are often sure and wrong', () => {
    const sure = (awarded: number) => ({ id: 'q1', awarded, max: 1, confidence: 3 as const, outcomes: [] });
    const make = (rows: QuizScore['rows'], confidence = true): MarkbookView => ({ ...base, quizzes: [quiz('l9', '2026-10-01', { s1: score(rows) }, confidence)] });
    expect(isConfidentlyWrong(make([sure(0), sure(0), sure(0), sure(1), sure(1)]), 's1')).toBe(true);
    expect(isConfidentlyWrong(make([sure(0), sure(0), sure(1)]), 's1')).toBe(false);
    expect(isConfidentlyWrong(make([sure(0), sure(0), sure(0), sure(1), sure(1), sure(1), sure(1), sure(1)]), 's1')).toBe(false);
    expect(isConfidentlyWrong(make([sure(0), sure(0), sure(0)], false), 's1')).toBe(false);
  });
});
