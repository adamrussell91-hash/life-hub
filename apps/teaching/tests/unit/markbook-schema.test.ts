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
    expect(MarkbookSchema.parse({})).toEqual({ columns: [], hidden_quizzes: [], marks: {}, focus: {}, updated_at: '' });
  });

  it('accepts a good column and names the problem in a bad one', () => {
    expect(checkColumn(essay)).toEqual({ column: essay });
    expect(checkColumn({ ...essay, title: ' ' })).toEqual({ problem: 'Give it a title.' });
    expect(checkColumn({ ...essay, criteria: [] })).toEqual({ problem: 'Add at least one criterion.' });
    expect(checkColumn({ ...essay, criteria: [{ ...essay.criteria[0], bands: [{ label: 'A', min: 16 }] }] })).toEqual({ problem: 'Band A starts above 15 in Analysis.' });
    expect(checkColumn({ ...essay, criteria: [essay.criteria[0], { ...essay.criteria[1], id: 'crit000001' }] })).toEqual({ problem: 'Two criteria share an id.' });
    expect('problem' in checkColumn({ ...essay, weight: 120 })).toBe(true);
    expect(checkColumn({ ...essay, weight: 120 })).toEqual({ problem: 'Weight is at most 100.' });
    expect(checkColumn({ ...essay, weight: -1 })).toEqual({ problem: 'Weight can’t be below 0.' });
    expect(checkColumn({ ...essay, criteria: [{ ...essay.criteria[1], max: 1001 }] })).toEqual({ problem: 'A criterion is worth at most 1000 marks.' });
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

  it('prunes strictly', () => {
    const shrunk = { ...essay, criteria: [{ ...essay.criteria[0]!, max: 5 }, essay.criteria[1]!] };
    expect(pruneMarks(shrunk, { st_a: { criteria: { crit000001: 9, crit000002: 8 } } })).toEqual({ st_a: { criteria: { crit000002: 8 } } });
    expect(pruneMarks(essay, { st_a: { criteria: { crit000001: 3 }, evil: 'x' }, st_d: { criteria: {}, feedback: 5 }, st_b: [1, 2], st_c: 'x' })).toEqual({ st_a: { criteria: { crit000001: 3 } } });
    const handin = { id: 'col0000003', kind: 'handin' as const, title: 'Draft', due: '2026-11-05' };
    expect(pruneMarks(handin, { st_a: { status: 'late' }, st_b: { status: 'nope' }, st_c: true })).toEqual({ st_a: { status: 'late' } });
  });

  it('rejects impossible dates, duplicate outcomes and duplicate band names', () => {
    expect(checkColumn({ ...essay, date: '2026-99-99' })).toEqual({ problem: 'Pick a date.' });
    expect(checkColumn({ ...essay, criteria: [{ ...essay.criteria[0], outcomes: ['o1', 'o1'] }] })).toEqual({ problem: 'Each outcome once per criterion.' });
    expect(checkColumn({ ...essay, criteria: [{ ...essay.criteria[0], bands: [{ label: 'A', min: 5 }, { label: 'A', min: 1 }] }] })).toEqual({ problem: 'Band names must differ in Analysis.' });
    expect(checkColumn({ ...essay, id: 'X' })).toEqual({ problem: 'Something went wrong with this column. Reload and try again.' });
    expect(checkColumn({ ...essay, kind: 'zzz' })).toEqual({ problem: 'Pick a column type.' });
  });

  it('gives friendly mark messages and drops empty text', () => {
    expect(checkMark(essay, { criteria: { crit000001: -1 } })).toEqual({ problem: 'Marks must be 0 or more.' });
    expect(checkMark(essay, { criteria: { crit000001: 2 }, feedback: '  ', note: '' })).toEqual({ mark: { criteria: { crit000001: 2 } } });
    expect(checkMark({ id: 'col0000003', kind: 'handin', title: 'Draft', due: '2026-11-05' }, { status: 'late', at: 'bad' })).toEqual({ problem: 'Pick a date.' });
    expect(checkMark({ id: 'col0000003', kind: 'handin', title: 'Draft', due: '2026-11-05' }, { status: 'x' })).toEqual({ problem: 'Pick submitted, late, missing or exempt.' });
  });

  it('keeps the id index in range', () => {
    expect(newMarkbookId(() => 1)).toMatch(/^[a-z0-9]{12}$/);
  });
});

describe('criterion codes', () => {
  it('keeps codes on known criteria and drops empty lists', () => {
    const checked = checkMark(essay, { criteria: { crit000001: 3 }, codes: { crit000001: ['code-e'], crit000002: [] } });
    expect('mark' in checked && checked.mark).toEqual({ criteria: { crit000001: 3 }, codes: { crit000001: ['code-e'] } });
  });
  it('refuses codes on an unknown criterion', () => {
    expect(checkMark(essay, { criteria: {}, codes: { nope: ['x'] } })).toEqual({ problem: 'Unknown criterion.' });
  });
  it('pruneMarks keeps codes only for criteria still there', () => {
    const edited = { ...essay, criteria: essay.criteria.slice(0, 1) };
    const kept = pruneMarks(edited, { s1: { criteria: { crit000001: 1 }, codes: { crit000001: ['a'], crit000002: ['b'] } } });
    expect(kept.s1).toEqual({ criteria: { crit000001: 1 }, codes: { crit000001: ['a'] } });
  });
  it('a markbook defaults focus to empty', () => {
    expect(MarkbookSchema.parse({}).focus).toEqual({});
  });
});
