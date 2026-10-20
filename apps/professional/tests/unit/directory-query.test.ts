import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  defaultDirectoryQuery,
  parseDirectoryQuery,
  serializeDirectoryQuery,
  SORT_LABELS
} from '@/domain/directory-query';

describe('directory-query', () => {
  it('round-trips sort via URL and keeps Sort label source of truth (V2)', () => {
    const state = { ...defaultDirectoryQuery(), sort: 'going_cold' as const };
    const qs = serializeDirectoryQuery(state);
    expect(qs).toContain('sort=going_cold');
    const parsed = parseDirectoryQuery(qs);
    expect(parsed.sort).toBe('going_cold');
    expect(SORT_LABELS[parsed.sort]).toBe('Going cold');
  });

  it('keeps colleagues as the default view and round-trips the students view', () => {
    expect(defaultDirectoryQuery().who).toBe('colleagues');
    expect(serializeDirectoryQuery(defaultDirectoryQuery())).toBe('');
    const qs = serializeDirectoryQuery({ ...defaultDirectoryQuery(), who: 'students' });
    expect(qs).toContain('who=students');
    expect(parseDirectoryQuery(qs).who).toBe('students');
    expect(parseDirectoryQuery('?who=nonsense').who).toBe('colleagues');
  });

  it('counts active filters', () => {
    expect(activeFilterCount(defaultDirectoryQuery())).toBe(0);
    expect(
      activeFilterCount({
        ...defaultDirectoryQuery(),
        role: 'mentee',
        hasOpen: true,
        warmth: 'cold'
      })
    ).toBe(3);
  });
});
