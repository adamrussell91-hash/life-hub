import { describe, expect, it } from 'vitest';
import type { Program } from '@/schemas/program';
import { catalogPrograms } from '@/domain/programs-seed';
import { buildLineSnapshot } from '@/personal-line/model';
import { linesForSubjects, yearLineName } from '@/personal-line/lines';
import { lineTerms, publicLineUrl } from '@/views/personal-line';

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
      ['basis', 'close', 'cost', 'description', 'due', 'entry', 'entry_route', 'format', 'id', 'length', 'level', 'link', 'location', 'matched', 'name', 'on', 'organiser', 'provider', 'run', 'settings', 'subjects', 'type', 'window', 'years'].sort()
    );
    expect(terms.map((term) => term.id)).toEqual(['T1', 'T2', 'T3', 'T4']);
  });

  it('copes with stored programs saved before subjects, settings or age groups existed', () => {
    const programs = catalogPrograms().map((program, i) => {
      const old: Record<string, unknown> = { ...program };
      delete old.settings;
      if (i === 0) delete old.subjects;
      if (i === 1) delete old.age_groups;
      return old as unknown as Program;
    });
    const snap = buildLineSnapshot(programs, { studentYear: 10, subjects: ['Economics'], year: 2026, terms });
    expect(snap.items.length).toBeGreaterThan(0);
    expect(snap.items.every((item) => Array.isArray(item.settings) && item.settings.length === 0)).toBe(true);
  });
});

describe('publicLineUrl', () => {
  it('hands out the class host, never the umbrella', () => {
    const umbrella = { hostname: 'life-hub.adam-russell.com', origin: 'https://life-hub.adam-russell.com' };
    expect(publicLineUrl('abc12345', umbrella)).toBe('https://class.adam-russell.com/line#abc12345');
  });

  it('keeps the dev origin locally', () => {
    const dev = { hostname: 'localhost', origin: 'http://localhost:5173' };
    expect(publicLineUrl('abc12345', dev)).toMatch(/^http:\/\/localhost:5173\/.*line\.html#abc12345$/);
  });
});
