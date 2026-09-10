import { describe, expect, it } from 'vitest';

/** Deep-link contract: class calendar → year sequence with unit selection. */
function yearSequenceHref(subjectId: string, unitId: string): string {
  return `/scope-sequences/${encodeURIComponent(subjectId)}?selectUnit=${encodeURIComponent(unitId)}`;
}

function selectedUnitFromSearch(search: string): string | undefined {
  return new URLSearchParams(search).get('selectUnit') ?? undefined;
}

describe('teaching calendar → year sequence deep link', () => {
  it('builds In year sequence href with selectUnit', () => {
    expect(yearSequenceHref('subj_science', 'unit_forces')).toBe(
      '/scope-sequences/subj_science?selectUnit=unit_forces'
    );
    expect(yearSequenceHref('a/b', 'u 1')).toBe('/scope-sequences/a%2Fb?selectUnit=u%201');
  });

  it('reads selectUnit from the scope route query', () => {
    expect(selectedUnitFromSearch('?selectNote=n1&selectUnit=unit_forces')).toBe('unit_forces');
    expect(selectedUnitFromSearch('?selectNote=n1')).toBeUndefined();
  });
});
