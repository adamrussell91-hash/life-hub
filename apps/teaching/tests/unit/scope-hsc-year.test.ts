import { describe, expect, it } from 'vitest';
import { scopeTermsFor, scopeWeekOfDate, scopeWindowStart, scopeYearLabel, startsInTermFour } from '@/scope/timeline-dates';
import { parseTerms } from '../../../../netlify/functions/scope-sequence.mjs';

describe('HSC year scopes', () => {
  const hsc = scopeTermsFor(2026, true);
  const calendar = scopeTermsFor(2026, false);

  it('runs Term 4 of the year through Term 3 of the next', () => {
    expect(hsc.map((t) => [t.term_number, t.start_week, t.end_week, t.start_date.slice(0, 4)])).toEqual([
      [4, 1, 10, '2026'], [1, 11, 20, '2027'], [2, 21, 30, '2027'], [3, 31, 40, '2027']
    ]);
    expect(startsInTermFour(hsc)).toBe(true);
    expect(startsInTermFour(calendar)).toBe(false);
  });

  it('puts dates on the weeks they fall in', () => {
    expect(scopeWeekOfDate(hsc, 2026, '2026-10-12')).toBe(1);
    expect(scopeWeekOfDate(hsc, 2026, '2026-12-04')).toBe(8);
    expect(scopeWeekOfDate(hsc, 2026, '2027-01-28')).toBe(11);
    expect(scopeWeekOfDate(hsc, 2026, '2026-12-25')).toBe(11);
    expect(scopeWeekOfDate(calendar, 2026, '2026-10-12')).toBe(31);
    expect(scopeWeekOfDate(calendar, 2026, '2027-03-01')).toBe(40);
  });

  it('starts the axis at the first term and labels a two-year scope', () => {
    expect(scopeWindowStart(hsc, 2026)).toBe('2026-10-01');
    expect(scopeWindowStart(calendar, 2026)).toBe('2026-01-01');
    expect(scopeYearLabel(hsc, 2026)).toBe('2026–27');
    expect(scopeYearLabel(calendar, 2026)).toBe('2026');
  });

  it('accepts only contiguous dated terms covering the year', () => {
    expect(parseTerms(hsc, 40).terms).toHaveLength(4);
    expect(parseTerms(hsc.slice(0, 3), 40).error).toBeTruthy();
    expect(parseTerms([{ ...hsc[0], start_date: undefined }, ...hsc.slice(1)], 40).error).toBeTruthy();
    expect(parseTerms([hsc[1], hsc[0], hsc[2], hsc[3]], 40).error).toBeTruthy();
  });
});
