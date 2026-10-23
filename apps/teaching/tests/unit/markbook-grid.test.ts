import { describe, it, expect } from 'vitest';
import { renderGrid } from '@/markbook/grid';
import type { MarkbookActions, MarkbookView, QuizColumn, RosterStudent } from '@/markbook/types';

const students: RosterStudent[] = [{ id: 'st_ann', name: 'Ann Bell', initials: 'AB' }, { id: 'st_cy', name: 'Cy Dale', initials: 'CD' }];
const score = { attempt_id: 'x~0', submitted_at: '2026-10-23T01:00:00.000Z', score: 1, max: 2, pending: 0, rows: [] };
const column = (extra: Partial<QuizColumn> = {}): QuizColumn => ({
  kind: 'quiz', id: 'quiz:tut1', lesson_id: 'tut1', title: 'Tutorial: Structure', unit_id: 'u1', date: '2026-10-23', hidden: false, confidence: false, questions: [],
  scores: { st_ann: score, st_cy: score }, ...extra
});
const view = (q: QuizColumn): MarkbookView => ({ markbook: { columns: [], hidden_quizzes: [], marks: {}, updated_at: '' }, students, quizzes: [q] });
const noop = () => {};
const actions: MarkbookActions = { setMark: noop, openAssessment: noop, openQuiz: noop, editColumn: noop, hideQuiz: noop, openHeatmap: noop, openStudent: noop };
const cells = (q: QuizColumn) => [...renderGrid(view(q), students, actions, '2026-10-23').querySelectorAll<HTMLButtonElement>('.mb-cell--quiz')];

describe('markbook grid quiz cells', () => {
  it('show the student’s tutorial group on hover and in the label', () => {
    const [ann, cy] = cells(column({ groups: { st_ann: 'Re-tells the plot' } }));
    expect(ann!.title).toBe('Re-tells the plot');
    expect(ann!.getAttribute('aria-label')).toBe('Tutorial: Structure, Ann Bell: 50% · Re-tells the plot');
    expect(cy!.title).toBe('');
    expect(cy!.getAttribute('aria-label')).not.toContain('·');
  });

  it('leave a plain quiz cell as it was', () => {
    const [ann] = cells(column());
    expect(ann!.title).toBe('');
    expect(ann!.getAttribute('aria-label')).toBe('Tutorial: Structure, Ann Bell: 50%');
  });
});
