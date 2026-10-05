import { describe, expect, it } from 'vitest';
import { normalizeScopeTerms } from '@/scope/timeline-dates';

describe('normalizeScopeTerms', () => {
  it('fills title and term_number for terms the old API stored as { label }', () => {
    const legacy = [
      { id: 'term2_2026', label: 'Term 2', start_week: 11, end_week: 20 },
      { id: 'term1_2026', label: 'Term 1', start_week: 1, end_week: 10 }
    ];
    expect(normalizeScopeTerms(legacy).map((t) => [t.term_number, t.title])).toEqual([
      [1, 'Term 1'],
      [2, 'Term 2']
    ]);
  });

  it('leaves current-shape terms alone', () => {
    const [term] = normalizeScopeTerms([
      { id: 't1', title: 'Autumn', term_number: 1, start_week: 1, end_week: 10 }
    ]);
    expect(term).toMatchObject({ title: 'Autumn', term_number: 1 });
  });
});
