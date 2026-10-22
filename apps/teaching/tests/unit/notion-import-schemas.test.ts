import { describe, expect, it } from 'vitest';
import { DocumentSchema, LessonSchema, SourceSchema, UnitSchema } from '@/schemas';

const now = '2026-10-18T00:00:00.000Z';
const common = { slug: 'x', status: 'active', created_at: now, updated_at: now, schema_version: 1 } as const;
const source = {
  system: 'notion',
  page_id: '0123456789abcdef0123456789abcdef',
  imported_at: now,
  last_edited_at: now
} as const;

describe('notion import schemas', () => {
  it('accepts a notion source link', () => {
    expect(SourceSchema.parse(source)).toEqual(source);
  });

  it('rejects a source without a page id', () => {
    expect(SourceSchema.safeParse({ ...source, page_id: '' }).success).toBe(false);
  });

  it('accepts a program unit with a source', () => {
    const unit = UnitSchema.parse({
      ...common, id: 'unit_1', title: 'Made-up Program', type: 'unit', kind: 'program',
      year_id: 'year_7', subject_id: 'subject_1', lesson_ids: [], source
    });
    expect(unit.kind).toBe('program');
  });

  it('treats a unit without kind as a plain unit', () => {
    const unit = UnitSchema.parse({
      ...common, id: 'unit_2', title: 'Plain', type: 'unit',
      year_id: 'year_7', subject_id: 'subject_1', lesson_ids: []
    });
    expect(unit.kind).toBeUndefined();
  });

  it('accepts a lesson with a source', () => {
    const lesson = LessonSchema.parse({
      ...common, id: 'lesson_1', title: 'L', type: 'lesson', unit_id: 'unit_1',
      sequence: 1, blocks: [], source
    });
    expect(lesson.source?.page_id).toBe(source.page_id);
  });

  it('accepts a syllabus document', () => {
    const doc = DocumentSchema.parse({
      ...common, id: 'document_1', title: 'Made-up Syllabus', type: 'document',
      kind: 'syllabus', subject_id: 'subject_1', blocks: [], source
    });
    expect(doc.kind).toBe('syllabus');
  });

  it('rejects an unknown document kind', () => {
    expect(DocumentSchema.safeParse({
      ...common, id: 'document_2', title: 'X', type: 'document',
      kind: 'scope_sequence', subject_id: 'subject_1', blocks: []
    }).success).toBe(false);
  });
});
