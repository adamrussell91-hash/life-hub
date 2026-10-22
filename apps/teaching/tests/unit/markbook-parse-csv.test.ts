import { describe, expect, it } from 'vitest';
import { formatBands, formatOutcomeCodes, outcomeLabels, parseBands, parseOutcomeCodes } from '@/markbook/parse';
import { csvFileName, markbookCsv } from '@/markbook/csv';
import type { MarkbookView } from '@/markbook/types';

const labels = [{ id: 'o1', code: 'EN12-1', title: 'Responds', group: 'Objective A' }, { id: 'o2', code: 'EN12-3', title: 'Analyses', group: 'Objective B' }];

describe('band text', () => {
  it('reads and writes "A 13, B 10"', () => {
    expect(parseBands('A 13, B 10, C 7')).toEqual({ bands: [{ label: 'A', min: 13 }, { label: 'B', min: 10 }, { label: 'C', min: 7 }] });
    expect(parseBands('  ')).toEqual({ bands: [] });
    expect(parseBands('High distinction 18')).toEqual({ bands: [{ label: 'High distinction', min: 18 }] });
    expect(parseBands('A, B 10')).toEqual({ problem: 'Write each band as a name then its lowest mark, like A 13.' });
    expect(formatBands([{ label: 'A', min: 13 }, { label: 'B', min: 10 }])).toBe('A 13, B 10');
  });
});

describe('outcome codes', () => {
  it('maps codes to ids and names the unknown ones', () => {
    expect(parseOutcomeCodes('en12-1, EN12-3 EN99-9', labels)).toEqual({ ids: ['o1', 'o2'], unknown: ['EN99-9'] });
    expect(parseOutcomeCodes('o2', labels)).toEqual({ ids: ['o2'], unknown: [] });
    expect(formatOutcomeCodes(['o2', 'raw-id'], labels)).toBe('EN12-3, raw-id');
  });
  it('turns catalogue rows into labels, leaving out trashed ones', () => {
    const rows = [
      { id: 'o1', code: 'EN12-1', title: 'Responds', group: 'A', status: 'active' },
      { id: 'o3', code: 'EN12-9', title: 'Old', group: 'A', status: 'trashed' }
    ];
    expect(outcomeLabels(rows)).toEqual([{ id: 'o1', code: 'EN12-1', title: 'Responds', group: 'A' }]);
  });
});

describe('csv', () => {
  const view: MarkbookView = {
    markbook: {
      columns: [
        { id: 'essay0001', kind: 'assessment', title: 'Essay, part 1', date: '2026-11-01', weight: 100, criteria: [{ id: 'c1', label: 'All', max: 20, outcomes: [] }] },
        { id: 'hand00001', kind: 'handin', title: 'Draft', due: '2026-10-25' },
        { id: 'chck00001', kind: 'check', title: 'Bookwork', date: '2026-10-26', scale: 'tick' }
      ],
      hidden_quizzes: [],
      marks: { essay0001: { s1: { criteria: { c1: 15 } } }, hand00001: { s1: { status: 'late', at: '2026-10-26' } }, chck00001: { s1: true } },
      updated_at: ''
    },
    students: [{ id: 's1', name: 'Bob Brown', initials: 'BB' }, { id: 's2', name: 'Tom Tills', initials: 'TT' }],
    quizzes: [{ kind: 'quiz', id: 'quiz:l1', lesson_id: 'l1', title: 'Quiz 1', date: '2026-10-20', hidden: false, confidence: false, questions: [], scores: { s2: { attempt_id: 'x~0', submitted_at: '', score: 3, max: 4, pending: 0, rows: [] } } }]
  };
  it('writes one row per student, columns in date order, quoting commas', () => {
    expect(markbookCsv(view).split('\n')).toEqual([
      'Initials,Name,Quiz 1,Draft,Bookwork,"Essay, part 1",Overall',
      'BB,Bob Brown,,Late,Yes,75%,75%',
      'TT,Tom Tills,75%,,,,'
    ]);
  });
  it('marks a quiz percent that still has answers to mark', () => {
    const pending = { ...view, quizzes: [{ ...view.quizzes[0]!, scores: { s2: { ...view.quizzes[0]!.scores.s2!, score: 1, max: 7, pending: 1 } } }] };
    const rows = markbookCsv(pending).split('\n');
    expect(rows[2]).toBe('TT,Tom Tills,14% (1 to mark),,,,');
  });
  it('names the file after the class', () => {
    expect(csvFileName('12 English Adv', '2026-11-03')).toBe('markbook-12-english-adv-2026-11-03.csv');
  });
});
