import { describe, expect, it } from 'vitest';
import {
  VersionKindSchema,
  VersionReasonSchema,
  VersionRecordSchema,
  VersionIndexSchema
} from '@/schemas/version';

describe('version schemas', () => {
  it('parses a lesson version record and index', () => {
    const record = VersionRecordSchema.parse({
      id: 'version_lesson_1_1',
      type: 'lesson_version',
      kind: 'lesson',
      parent_id: 'lesson_1',
      revision: 1,
      created_at: '2026-08-11T00:00:00.000Z',
      reason: 'manual_checkpoint',
      label: 'Before rewrite',
      snapshot: { id: 'lesson_1', type: 'lesson' }
    });
    expect(record.revision).toBe(1);
    expect(VersionKindSchema.parse('class_homepage')).toBe('class_homepage');
    expect(VersionReasonSchema.parse('ai_accepted')).toBe('ai_accepted');

    const index = VersionIndexSchema.parse({
      parent_id: 'lesson_1',
      kind: 'lesson',
      latest_revision: 1,
      entries: [
        {
          id: record.id,
          revision: 1,
          created_at: record.created_at,
          reason: 'manual_checkpoint',
          label: 'Before rewrite'
        }
      ]
    });
    expect(index.entries).toHaveLength(1);
  });
});
