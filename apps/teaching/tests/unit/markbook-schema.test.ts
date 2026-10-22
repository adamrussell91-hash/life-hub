import { describe, expect, it } from 'vitest';
import { MarkbookSchema, checkColumn, checkMark, newMarkbookId, pruneMarks, type AssessmentColumn, type CheckColumn } from '@/markbook/schema';

const essay: AssessmentColumn = {
  id: 'col0000001',
  kind: 'assessment',
  title: 'Essay',
  date: '2026-11-03',
  weight: 30,
  criteria: [
    { id: 'crit000001', label: 'Analysis', max: 15, outcomes: ['o1'], bands: [{ label: 'A', min: 13 }, { label: 'B', min: 10 }] },
    { id: 'crit000002', label: 'Expression', max: 10, outcomes: [] }
  ]
};
const tick: CheckColumn = { id: 'col0000002', kind: 'check', title: 'Bookwork', date: '2026-11-04', scale: 'tick' };

describe('markbook schema', () => {
  it('fills an empty record', () => {
    expect(MarkbookSchema.parse({})).toEqual({ columns: [], hidden_quizzes: [], marks: {}, updated_at: '' });
  });

  it('accepts a good column and names the problem in a bad one', () => {
    expect(checkColumn(essay)).toEqual({ column: essay });
    expect(checkColumn({ ...essay, title: ' ' })).toEqual({ problem: 'Give it a title.' });
    expect(checkColumn({ ...essay, criteria: [] })).toEqual({ problem: 'Add at least one criterion.' });
    expect(checkColumn({ ...essay, criteria: [{ ...essay.criteria[0], bands: [{ label: 'A', min: 16 }] }] })).toEqual({ problem: 'Band A starts above 15 in Analysis.' });
    expect(checkColumn({ ...essay, criteria: [essay.criteria[0], { ...essay.criteria[1], id: 'crit000001' }] })).toEqual({ problem: 'Two criteria share an id.' });
    expect('problem' in checkColumn({ ...essay, weight: 120 })).toBe(true);
  });

  it('checks a mark against its column', () => {
    expect(checkMark(essay, { criteria: { crit000001: 12 } })).toEqual({ mark: { criteria: { crit000001: 12 } } });
    expect(checkMark(essay, { criteria: { crit000001: 16 } })).toEqual({ problem: 'Give between 0 and 15 for Analysis.' });
    expect(checkMark(essay, { criteria: { nope: 1 } })).toEqual({ problem: 'Unknown criterion.' });
    expect(checkMark(essay, { criteria: { crit000001: 3 }, exempt: true, note: 'Misadventure' })).toEqual({ mark: { criteria: {}, exempt: true, note: 'Misadventure' } });
    expect(checkMark(tick, true)).toEqual({ mark: true });
    expect(checkMark(tick, 3)).toEqual({ problem: 'Tick or cross only.' });
    expect(checkMark({ ...tick, scale: 'four' }, 3)).toEqual({ mark: 3 });
    expect(checkMark({ ...tick, scale: 'four' }, true)).toEqual({ problem: 'Give 1 to 4.' });
    expect(checkMark({ id: 'col0000003', kind: 'handin', title: 'Draft', due: '2026-11-05' }, { status: 'late', at: '2026-11-06' })).toEqual({ mark: { status: 'late', at: '2026-11-06' } });
  });

  it('prunes marks that no longer fit an edited column', () => {
    const marks = { st_a: { criteria: { crit000001: 12, crit000002: 8 } }, st_b: { criteria: {}, exempt: true } };
    const edited = { ...essay, criteria: [essay.criteria[0]!] };
    expect(pruneMarks(edited, marks)).toEqual({ st_a: { criteria: { crit000001: 12 } }, st_b: { criteria: {}, exempt: true } });
    expect(pruneMarks({ ...tick, scale: 'four' }, { st_a: true, st_b: 2 })).toEqual({ st_b: 2 });
  });

  it('makes ids that pass the id rule', () => {
    expect(newMarkbookId(() => 0.5)).toMatch(/^[a-z0-9]{12}$/);
  });
});
