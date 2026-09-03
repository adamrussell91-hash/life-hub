import { describe, it, expect } from 'vitest';
import { YearSchema, SubjectSchema, UnitSchema } from '@/schemas';

describe('curriculum schemas', () => {
  it('parses year_12 with subject refs', () => {
    const year = YearSchema.parse({
      id: 'year_12',
      type: 'year',
      title: 'Year 12',
      year_level: 12,
      slug: 'year_12',
      subject_ids: ['subject_y12_engadv', 'subject_y12_engstd'],
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(year.subject_ids).toHaveLength(2);
  });

  it('keeps English Advanced and Standard as separate subjects', () => {
    const adv = SubjectSchema.parse({
      id: 'subject_y12_engadv',
      type: 'subject',
      title: 'English Advanced',
      display_title: 'English Advanced',
      slug: 'english_advanced',
      unit_ids: ['unit_aotfw'],
      outcome_ids: [],
      class_ids: [],
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    const std = SubjectSchema.parse({
      ...adv,
      id: 'subject_y12_engstd',
      title: 'English Standard',
      display_title: 'English Standard',
      slug: 'english_standard',
      unit_ids: []
    });
    expect(adv.id).not.toBe(std.id);
    expect(adv).not.toHaveProperty('year_id');
    expect(std).not.toHaveProperty('year_id');
  });

  it('parses a subject without year_id', () => {
    const subject = SubjectSchema.parse({
      id: 'subject_psych',
      type: 'subject',
      title: 'Psychology',
      display_title: 'Psychology',
      slug: 'psychology',
      unit_ids: [],
      outcome_ids: [],
      class_ids: [],
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(subject.title).toBe('Psychology');
    expect(subject.display_title).toBe('Psychology');
    expect(subject).not.toHaveProperty('year_id');
  });

  it('rejects a blank subject title', () => {
    const result = SubjectSchema.safeParse({
      id: 'subject_blank',
      type: 'subject',
      title: '',
      display_title: 'Psychology',
      slug: 'psychology',
      unit_ids: [],
      outcome_ids: [],
      class_ids: [],
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(result.success).toBe(false);
  });

  it('parses unit with year_id, subject_id, and lesson_ids', () => {
    const unit = UnitSchema.parse({
      id: 'unit_aotfw',
      type: 'unit',
      title: 'Artist of the Floating World',
      slug: 'artist_of_the_floating_world',
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      lesson_ids: ['lesson_aotfw_001', 'lesson_aotfw_002', 'lesson_aotfw_003'],
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(unit.year_id).toBe('year_12');
    expect(unit.subject_id).toBe('subject_y12_engadv');
    expect(unit.lesson_ids).toHaveLength(3);
  });

  it('accepts optional scope_id on subject', () => {
    const subject = SubjectSchema.parse({
      id: 'subject_y12_engadv',
      type: 'subject',
      title: 'English Advanced',
      display_title: 'Year 12 English Advanced',
      slug: 'english_advanced',
      scope_id: 'scope_y12_engadv_2026',
      unit_ids: ['unit_aotfw'],
      outcome_ids: [],
      class_ids: [],
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(subject.scope_id).toBe('scope_y12_engadv_2026');
  });

  it('accepts optional description and primary_term on unit', () => {
    const unit = UnitSchema.parse({
      id: 'unit_aotfw',
      type: 'unit',
      title: 'Artist of the Floating World',
      slug: 'artist_of_the_floating_world',
      year_id: 'year_12',
      subject_id: 'subject_y12_engadv',
      primary_term: 2,
      description: 'A study of Ishiguro',
      lesson_ids: ['lesson_aotfw_001'],
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema_version: 1
    });
    expect(unit.primary_term).toBe(2);
    expect(unit.description).toBe('A study of Ishiguro');
  });
});
