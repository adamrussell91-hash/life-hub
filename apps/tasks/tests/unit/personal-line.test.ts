import { describe, expect, it } from 'vitest';
import { catalogPrograms } from '@/domain/programs-seed';
import { buildLineSnapshot } from '@/personal-line/model';
import { linesForSubjects, yearLineName } from '@/personal-line/lines';
import { lineTerms } from '@/views/personal-line';

const terms = lineTerms(2026, null);

describe('personal line', () => {
  it('maps subjects onto lines, a subject on two lines landing on both', () => {
    expect(linesForSubjects(['Psychology'])).toEqual(['R']);
    expect(linesForSubjects(['Debating', 'Mathematics'])).toEqual(['J', 'I', 'R']);
    expect(yearLineName(8)).toBe('Junior');
    expect(yearLineName(9)).toBe('Rozelle');
    expect(yearLineName(11)).toBe('Senior');
  });

  it('keeps only entries the year level can enter, in the chosen subjects, by date', () => {
    const snap = buildLineSnapshot(catalogPrograms(), {
      studentYear: 9,
      subjects: ['Debating', 'Psychology'],
      studentName: 'Mia Example',
      year: 2026,
      terms
    });
    expect(snap.student_name).toBe('Mia');
    expect(snap.lines).toEqual(['J', 'R']);
    expect(snap.items.length).toBeGreaterThan(5);
    for (const item of snap.items) {
      expect(item.years).toContain(9);
      expect(item.matched.some((s) => s === 'Debating' || s === 'Psychology')).toBe(true);
      expect(item.run || item.due).toBeTruthy();
    }
    const starts = snap.items.map((item) => item.run?.start ?? item.due!.on);
    expect([...starts].sort()).toEqual(starts);
    // A Debating entry sits on both Justice and Reasoning.
    expect(snap.items.some((item) => item.matched.includes('Debating') && item.on.join('') === 'JR')).toBe(true);
  });

  it('carries only public catalogue fields', () => {
    const snap = buildLineSnapshot(catalogPrograms(), { studentYear: 10, subjects: ['Economics'], year: 2026, terms });
    const keys = Object.keys(snap.items[0]!).sort();
    expect(keys).toEqual(
      ['basis', 'close', 'cost', 'description', 'due', 'entry', 'entry_route', 'format', 'id', 'length', 'level', 'link', 'location', 'matched', 'name', 'on', 'organiser', 'provider', 'run', 'settings', 'type', 'window', 'years'].sort()
    );
    expect(terms.map((term) => term.id)).toEqual(['T1', 'T2', 'T3', 'T4']);
  });
});
