import { describe, it, expect } from 'vitest';
import { renderGrid } from '@/markbook/grid';
import type { MarkbookActions, MarkbookView, QuizColumn, RosterStudent, WorkColumn } from '@/markbook/types';

const students: RosterStudent[] = [{ id: 'st_ann', name: 'Ann Bell', initials: 'AB' }, { id: 'st_cy', name: 'Cy Dale', initials: 'CD' }];
const score = { attempt_id: 'x~0', submitted_at: '2026-10-23T01:00:00.000Z', score: 1, max: 2, pending: 0, rows: [] };
const column = (extra: Partial<QuizColumn> = {}): QuizColumn => ({
  kind: 'quiz', id: 'quiz:tut1', lesson_id: 'tut1', title: 'Tutorial: Structure', unit_id: 'u1', date: '2026-10-23', hidden: false, confidence: false, questions: [],
  scores: { st_ann: score, st_cy: score }, ...extra
});
const view = (q: QuizColumn): MarkbookView => ({ markbook: { columns: [], hidden_quizzes: [], marks: {}, updated_at: '' }, students, quizzes: [q] });
const noop = () => {};
const actions: MarkbookActions = { setMark: noop, openAssessment: noop, openQuiz: noop, openWork: noop, editColumn: noop, hideQuiz: noop, openHeatmap: noop, openStudent: noop };
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

  it('grey the cells of students outside a tutorial’s groups, and mark who has only started', () => {
    const blank = { st_ann: score };
    const [ann, cy] = cells(column({ scores: blank, groups: { st_ann: 'Re-tells the plot' } }));
    expect(ann!.classList.contains('mb-cell--na')).toBe(false);
    expect(cy!.classList.contains('mb-cell--na')).toBe(true);
    const [, started] = cells(column({ scores: blank, started: ['st_cy'] }));
    expect(started!.textContent).toBe('Started');
    expect(started!.classList.contains('mb-cell--na')).toBe(false);
  });
});

describe('markbook grid: work not handed in', () => {
  it('shows how far a student got on a quiz they haven’t handed in, and opens it', () => {
    const opened: string[] = [];
    const saved = { started_at: '2026-10-23T00:00:00.000Z', saved_at: '2026-10-23T00:05:00.000Z', answered: 3, total: 8, score: 2, max: 8, pending: 1, rows: [] };
    const q = column({ scores: { st_ann: score }, started: ['st_cy'], saved: { st_cy: saved } });
    const grid = renderGrid(view(q), students, { ...actions, openQuiz: (lesson, student) => opened.push(`${lesson}:${student}`) }, '2026-10-23');
    const cell = grid.querySelector<HTMLButtonElement>('button.mb-cell--saved')!;
    expect(cell.textContent).toBe('3/8');
    expect(cell.getAttribute('aria-label')).toBe('Tutorial: Structure, Cy Dale: not handed in, 3 of 8 answered, 2/8 so far');
    cell.click();
    expect(opened).toEqual(['tut1:st_cy']);
  });

  it('gives written work its own column, with a count per student that opens their answers', () => {
    const work: WorkColumn = {
      kind: 'work', id: 'work:l1', lesson_id: 'l1', title: 'Highway case', date: '2026-10-24',
      blocks: [{ id: 'b1', block_type: 'question_set', title: '', prompts: { q1: 'Who?' } }],
      students: { st_ann: { at: '2026-10-24T01:00:00.000Z', blocks: { b1: { answers: { q1: 'The state', q2: ' ' }, 'format.because_but_so': { because: 'cost' } } } } }
    };
    const opened: string[] = [];
    const grid = renderGrid({ ...view(column()), work: [work] }, students, { ...actions, openWork: (lesson, student) => opened.push(`${lesson}:${student}`) }, '2026-10-24');
    const head = grid.querySelector('th.mb-col--work')!;
    expect(head.querySelector('.mb-col__kind')!.textContent).toBe('Work');
    expect(head.querySelector('button')).toBeNull();
    const cells = [...grid.querySelectorAll('.mb-cell--work')];
    expect(cells.map((c) => c.textContent)).toEqual(['2 written', '']);
    (cells[0] as HTMLButtonElement).click();
    expect(opened).toEqual(['l1:st_ann']);
  });
});
