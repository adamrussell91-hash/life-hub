import { describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import type { Lesson } from '@/schemas/lesson';
import type { Unit } from '@/schemas/unit';
import {
  buildArchiveExport,
  buildLessonExport,
  buildUnitExport,
  exportFilename
} from '@/export/portable';

const ISO = '2026-08-15T00:00:00.000Z';

function lesson(): Lesson {
  return {
    id: 'lesson_001',
    type: 'lesson',
    title: 'Intro',
    slug: 'intro',
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    unit_id: 'unit_001',
    sequence: 1,
    blocks: [createBlock('heading', 'h1')]
  };
}

function unit(): Unit {
  return {
    id: 'unit_001',
    type: 'unit',
    title: 'Unit One',
    slug: 'unit_one',
    status: 'active',
    created_at: ISO,
    updated_at: ISO,
    schema_version: 1,
    year_id: 'year_12',
    subject_id: 'subject_eng',
    lesson_ids: ['lesson_001']
  };
}

describe('portable export', () => {
  it('wraps a lesson with a manifest and keeps the draft blocks', () => {
    const pack = buildLessonExport(lesson(), ISO);
    expect(pack.product).toBe('Teaching Hub');
    expect(pack.export_version).toBe(1);
    expect(pack.kind).toBe('lesson');
    expect(pack.created_at).toBe(ISO);
    expect(pack.objects).toEqual({ lessons: 1 });
    expect(pack.lesson?.id).toBe('lesson_001');
    expect(pack.lesson?.blocks).toHaveLength(1);
    expect(JSON.stringify(pack)).not.toMatch(/passphrase|SESSION_SECRET|ANTHROPIC/i);
  });

  it('includes the unit and its full lessons', () => {
    const pack = buildUnitExport(unit(), [lesson()], ISO);
    expect(pack.kind).toBe('unit');
    expect(pack.unit?.id).toBe('unit_001');
    expect(pack.lessons?.map((row) => row.id)).toEqual(['lesson_001']);
    expect(pack.objects).toEqual({ units: 1, lessons: 1 });
  });

  it('archives curriculum records without media file bytes or AI jobs', () => {
    const pack = buildArchiveExport(
      {
        years: [{ id: 'year_12' }],
        subjects: [{ id: 'subject_eng' }],
        units: [unit()],
        lessons: [lesson()],
        classes: [{ id: 'class_1' }],
        scheduled_lessons: [{ id: 'sched_1' }],
        scope_sequences: [],
        media: [{ id: 'media_1', preview_url: 'https://example.com/a.png' }],
        outcomes: [{ id: 'EA12-1' }],
        compositions: [],
        lesson_templates: [],
        unit_templates: [],
        schedule_anchor_date: '2026-08-12'
      },
      ISO
    );
    expect(pack.kind).toBe('archive');
    expect(pack.objects.lessons).toBe(1);
    expect(pack.objects.media).toBe(1);
    expect(pack.objects.outcomes).toBe(1);
    expect(pack.media_files).toBeUndefined();
    expect(pack.ai_jobs).toBeUndefined();
    expect(JSON.stringify(pack)).not.toMatch(/media_files/);
  });

  it('names download files from kind and slug', () => {
    expect(exportFilename('lesson', 'intro')).toBe('teaching-hub-lesson-intro.json');
    expect(exportFilename('archive')).toBe('teaching-hub-archive.json');
  });
});
