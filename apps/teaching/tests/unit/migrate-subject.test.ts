import { describe, expect, it } from 'vitest';
import { migrateSubjectRecord, migrateSubjectRecords } from '@/curriculum/migrate-subject';

const ISO = '2026-01-01T00:00:00.000Z';

const legacyAdv = {
  id: 'subject_y12_engadv',
  type: 'subject',
  title: 'English Advanced',
  display_title: 'Year 12 English Advanced',
  slug: 'english_advanced',
  year_id: 'year_12',
  scope_id: 'scope_y12_engadv_2026',
  unit_ids: ['unit_aotfw'],
  outcome_ids: ['out_1'],
  class_ids: ['class_2026_12engadv1'],
  status: 'active',
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

const legacyStd = {
  ...legacyAdv,
  id: 'subject_y12_engstd',
  title: 'English Standard',
  display_title: 'Year 12 English Standard',
  slug: 'english_standard',
  scope_id: undefined,
  unit_ids: [],
  outcome_ids: [],
  class_ids: []
};

describe('migrateSubjectRecord', () => {
  it('strips year_id and makes display_title year-neutral while keeping ids and relations', () => {
    const result = migrateSubjectRecord(legacyAdv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.changed).toBe(true);
    expect(result.subject.id).toBe('subject_y12_engadv');
    expect(result.subject.title).toBe('English Advanced');
    expect(result.subject.display_title).toBe('English Advanced');
    expect(result.subject.scope_id).toBe('scope_y12_engadv_2026');
    expect(result.subject.unit_ids).toEqual(['unit_aotfw']);
    expect(result.subject.outcome_ids).toEqual(['out_1']);
    expect(result.subject.class_ids).toEqual(['class_2026_12engadv1']);
    expect(result.subject).not.toHaveProperty('year_id');
  });

  it('is a no-op when the subject is already global', () => {
    const first = migrateSubjectRecord(legacyAdv);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = migrateSubjectRecord(first.subject);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.changed).toBe(false);
    expect(second.subject).toEqual(first.subject);
  });

  it('reports malformed records without returning a subject', () => {
    const result = migrateSubjectRecord({ id: 'broken', type: 'subject' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/malformed|invalid/i);
  });
});

describe('migrateSubjectRecords', () => {
  it('migrates every record or stops without a partial rewrite', () => {
    const migrated = migrateSubjectRecords([legacyAdv, legacyStd]);
    expect(migrated).toHaveLength(2);
    expect(migrated.map((row) => row.id)).toEqual([
      'subject_y12_engadv',
      'subject_y12_engstd'
    ]);
    expect(migrated.every((row) => !('year_id' in row))).toBe(true);

    expect(() => migrateSubjectRecords([legacyAdv, { id: 'broken' }])).toThrow(
      /malformed|invalid/i
    );
  });
});
