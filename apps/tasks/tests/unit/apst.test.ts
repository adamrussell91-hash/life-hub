import { describe, expect, it } from 'vitest';
import {
  APST_FOCUS_AREAS,
  APST_STANDARDS,
  focusAreaLabel,
  focusAreasByStandard,
  isFocusArea,
  sanitizeApstFocus,
  standardsCoverage
} from '@/domain/apst';

describe('APST reference data', () => {
  it('has 7 standards and 37 focus areas in the published counts per standard', () => {
    expect(APST_STANDARDS).toHaveLength(7);
    expect(APST_FOCUS_AREAS).toHaveLength(37);
    expect(focusAreasByStandard().map((g) => g.areas.length)).toEqual([6, 6, 7, 5, 5, 4, 4]);
  });

  it('numbers focus areas consecutively within each standard', () => {
    for (const g of focusAreasByStandard())
      g.areas.forEach((a, i) => expect(a.code).toBe(`${g.standard.number}.${i + 1}`));
  });

  it('rejects codes that match the old pattern but do not exist', () => {
    expect(isFocusArea('3.2')).toBe(true);
    expect(isFocusArea('4.9')).toBe(false);
    expect(isFocusArea('6.5')).toBe(false);
  });

  it('labels a code with its title', () => {
    expect(focusAreaLabel('3.2')).toBe('3.2 Plan, structure and sequence learning programs');
  });

  it('sanitises to valid, unique codes in document order', () => {
    expect(sanitizeApstFocus(['7.4', '3.2', '3.2', '4.9', ' 1.2 ', 12])).toEqual(['1.2', '3.2', '7.4']);
    expect(sanitizeApstFocus('3.2')).toEqual([]);
  });
});

describe('standardsCoverage', () => {
  it('matches the reference fixture ribbon', () => {
    const cov = standardsCoverage([
      { status: 'done', apst_focus: ['3.2', '4.1'] },
      { status: 'done', apst_focus: ['1.2', '2.1'] },
      { status: 'open', apst_focus: ['6.4'] },
      { status: 'open', apst_focus: ['7.4'] },
      { status: 'open', apst_focus: [] }
    ]);
    expect(Object.values(cov)).toEqual(['evidenced', 'evidenced', 'evidenced', 'evidenced', 'none', 'some', 'some']);
  });

  it('lets a done task upgrade a standard that an open task started', () => {
    const cov = standardsCoverage([
      { status: 'open', apst_focus: ['5.1'] },
      { status: 'done', apst_focus: ['5.4'] }
    ]);
    expect(cov[5]).toBe('evidenced');
  });
});
