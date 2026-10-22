import { describe, expect, it } from 'vitest';
import type { CurriculumOutcome } from '@/schemas/outcome';
import {
  duplicateSets,
  moveGroup,
  moveOutcome,
  orderAfterRegroup,
  outcomeUsageMap,
  usageLabel
} from '@/outcomes/manage';

function outcome(id: string, code: string, group: string): CurriculumOutcome {
  return {
    id,
    type: 'curriculum_outcome',
    source: 'custom',
    code,
    title: code,
    slug: code.toLowerCase(),
    description: `${code} wording`,
    group,
    subject_id: 'subject_1',
    status: 'active',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    schema_version: 1
  } as CurriculumOutcome;
}

const catalog = [
  outcome('a', 'EAV-12-01', 'Module A'),
  outcome('b', 'EAV-12-02', 'Module A'),
  outcome('c', 'EAV-12-04', 'Custom'),
  outcome('d', 'eav-12-04 ', 'Custom'),
  outcome('e', 'EAV-12-05', 'Module B')
];

describe('outcome library helpers', () => {
  it('finds codes saved more than once, ignoring case and spaces', () => {
    expect(duplicateSets(catalog).map((set) => set.map((row) => row.id))).toEqual([['c', 'd']]);
  });

  it('moves an outcome within its group and stops at the edges', () => {
    expect(moveOutcome(catalog, 'b', -1)).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(moveOutcome(catalog, 'a', -1)).toBeNull();
    expect(moveOutcome(catalog, 'e', 1)).toBeNull();
  });

  it('moves a whole group', () => {
    expect(moveGroup(catalog, 'Module B', -1)).toEqual(['a', 'b', 'e', 'c', 'd']);
    expect(moveGroup(catalog, 'Module A', -1)).toBeNull();
  });

  it('puts a regrouped outcome at the end of its new group', () => {
    expect(orderAfterRegroup(catalog, 'e', 'Module A')).toEqual(['a', 'b', 'e', 'c', 'd']);
    expect(orderAfterRegroup(catalog, 'a', 'Brand new')).toEqual(['b', 'c', 'd', 'e', 'a']);
  });

  it('counts lesson and unit tags, skipping trashed records', () => {
    const usage = outcomeUsageMap({
      lessons: [
        { id: 'l1', title: 'Poetry', outcome_ids: ['c'] },
        { id: 'l2', title: 'Old', status: 'trashed', outcome_ids: ['c'] }
      ],
      units: [{ id: 'u1', title: 'Texts', outcome_ids: ['c', 'a'] }]
    });
    expect(usageLabel(usage.get('c') ?? [])).toBe('Used in 1 lesson, 1 unit');
    expect(usage.get('c')?.map((row) => row.href)).toEqual(['/units/u1', '/lessons/l1']);
    expect(usageLabel(usage.get('e') ?? [])).toBe('Not used yet');
  });
});
