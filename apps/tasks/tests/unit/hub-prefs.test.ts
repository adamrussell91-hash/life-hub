import { describe, expect, it } from 'vitest';
import { NSW_2026_TERMS, parseHubPrefs, parseSchoolTerms } from '@/domain/hub-prefs';
import { schoolTerms } from '@/domain/maps-layout';

describe('hub prefs term dates', () => {
  it('seeds NSW 2026 and a 10 minute marking guess when the blob has neither', () => {
    const prefs = parseHubPrefs({ timezone: 'Australia/Sydney' });
    expect(prefs.school_terms).toEqual([{ year: 2026, terms: [...NSW_2026_TERMS] }]);
    expect(prefs.school_terms.some((row) => row.year === 2027)).toBe(false);
    expect(prefs.marking_default_minutes_per_script).toBe(10);
    expect(prefs.school_terms[0]?.terms[0]).toEqual({
      term: 1,
      starts_on: '2026-02-02',
      ends_on: '2026-04-02'
    });
    expect(prefs.school_terms[0]?.terms[3]?.ends_on).toBe('2026-12-17');
  });

  it('drops a term that ends before it starts and keeps an explicit empty list', () => {
    const prefs = parseHubPrefs({
      school_terms: [
        {
          year: 2026,
          terms: [
            { term: 1, starts_on: '2026-04-02', ends_on: '2026-02-02' },
            { term: 2, starts_on: '2026-04-22', ends_on: '2026-07-03' }
          ]
        }
      ]
    });
    expect(prefs.school_terms[0]?.terms.map((term) => term.term)).toEqual([2]);
    expect(parseSchoolTerms([])).toEqual([]);
  });
});

describe('schoolTerms prefs', () => {
  it('uses saved term starts and falls back only when that year is missing', () => {
    const years = parseHubPrefs({}).school_terms;
    expect(schoolTerms(2026, years).t1).toBe('2026-02-02');
    expect(schoolTerms(2026, years).t4).toBe('2026-10-13');
    expect(schoolTerms(2026, years).e).toBe('2026-12-17');
    expect(schoolTerms(2026).t1).toBe('2026-01-27');
    expect(schoolTerms(2027, years).t1).toBe('2027-01-27');
  });
});
