import { describe, expect, it } from 'vitest';
import type { Alignment } from '@/alignment/schema';
import type { InsightContext } from '@/evidence/context';
import { classEvidence, taughtAreas } from '@/evidence/class-evidence';
import { buildPointChain, lessonPointMap, outcomePointMap } from '@/evidence/syllabus';
import { syllabusGrid } from '@/evidence/syllabus-grid';
import type { MarkbookView, QuizColumn } from '@/markbook/types';

// Two modules share one outcome, as every Year 12 module does. Only the first has been taught.
const alignment = {
  outcomes: [{ n: 3, code: 'EN12-3', text: 'x' }],
  concepts: [],
  focus_areas: [
    { id: 'texts', name: 'Texts', points: [{ id: 'R1', kind: 'R', short: 'Taught point', text: 'a', outcomes: [{ n: 3, link: 'shared' }], concepts: [], processes: [] }] },
    { id: 'convo', name: 'Conversations', points: [{ id: 'R2', kind: 'R', short: 'Untaught point', text: 'b', outcomes: [{ n: 3, link: 'shared' }], concepts: [], processes: [] }] }
  ]
} as unknown as Alignment;
const labels = [{ id: 'o3', code: 'EN12-3', title: 'Language forms', group: '' }];
const lessons = [{ id: 'l1', unit_id: 'u1', dot_points: ['texts:R1'] }];
const units = [{ id: 'u1', deep_understandings: [{ dot_points: ['texts:R1'] }] }];

const ctx: InsightContext = {
  table: null,
  skills: null,
  codes: [],
  outcomes: labels,
  alignment,
  lessonPoints: lessonPointMap(lessons, alignment),
  outcomePoints: outcomePointMap(alignment, labels),
  chain: buildPointChain({ alignment, labels, continuum: null, units, lessons })
};

const quiz: QuizColumn = {
  kind: 'quiz',
  id: 'quiz:l1',
  lesson_id: 'l1',
  title: 'Quiz',
  date: '2026-10-01',
  hidden: false,
  confidence: false,
  questions: [],
  scores: {
    a: { attempt_id: 'a~0', submitted_at: '', score: 1, max: 2, pending: 0, rows: ['q1', 'q2'].map((id) => ({ id, awarded: 0.5, max: 1, confidence: null, outcomes: [], items: [{ item: id, tags: [], share: 0.5, why: [] }] })) }
  }
};

const view = {
  markbook: {
    columns: [{ id: 'task1', kind: 'assessment', title: 'Essay', date: '2026-10-02', weight: 10, criteria: [{ id: 'c1', label: 'Argument', max: 10, outcomes: ['o3'], concepts: [] }] }],
    marks: { a: { task1: { criteria: { c1: 6 } } } }
  },
  students: [{ id: 'a', name: 'Ann Ash', initials: 'AA' }],
  quizzes: [quiz]
} as unknown as MarkbookView;

describe('the Grid keeps to the modules a class has been taught', () => {
  it('reads the taught modules from the class’s lessons', () => {
    expect([...(taughtAreas(view, ctx) ?? [])]).toEqual(['texts']);
    expect(taughtAreas({ ...view, quizzes: [] }, ctx)).toBeNull();
  });

  it('stops a shared outcome marking an untaught module', () => {
    const { evidence } = classEvidence(view, ctx);
    expect(evidence.some((e) => e.tags.includes('dp:convo:R2'))).toBe(false);
    expect(evidence.filter((e) => e.source === 'assess:task1').every((e) => e.tags.includes('dp:texts:R1'))).toBe(true);
  });

  it('draws rows for taught modules only', () => {
    const { evidence } = classEvidence(view, ctx);
    expect(syllabusGrid(evidence, alignment, labels, ctx, ['a'], taughtAreas(view, ctx)).map((r) => r.tag)).toEqual(['dp:texts:R1']);
    expect(syllabusGrid(evidence, alignment, labels, ctx, ['a']).map((r) => r.tag)).toEqual(['dp:texts:R1', 'dp:convo:R2']);
  });
});
