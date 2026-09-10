import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PEDAGOGICAL_MODE,
  PedagogicalModeSchema,
  PEDAGOGICAL_MODES,
  pedagogicalModeLabel,
  resolvePedagogicalMode
} from '@/curriculum/pedagogical-mode';
import { LessonSchema } from '@/schemas';
import { toCurriculumLessonSummary } from '@/curriculum/lesson-summary';
import {
  applyLessonLibraryPatch,
  parseLessonLibraryPatch
} from '@/lessons/library-patch';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseLesson = {
  id: 'lesson_001',
  type: 'lesson' as const,
  title: 'Intro',
  slug: 'intro',
  unit_id: 'unit_1',
  sequence: 1,
  blocks: [],
  status: 'active' as const,
  schema_version: 1 as const,
  ...timestamps
};

describe('pedagogical mode taxonomy', () => {
  it('accepts the closed Notion mode set and defaults display to Lesson', () => {
    expect(PEDAGOGICAL_MODES).toContain('workshop');
    expect(resolvePedagogicalMode(undefined)).toBe(DEFAULT_PEDAGOGICAL_MODE);
    expect(resolvePedagogicalMode('nope')).toBe('lesson');
    expect(pedagogicalModeLabel('case_study')).toBe('Case Study');
    expect(PedagogicalModeSchema.parse('lab')).toBe('lab');
  });

  it('keeps older lesson blobs valid without pedagogical_mode', () => {
    const lesson = LessonSchema.parse(baseLesson);
    expect(lesson.pedagogical_mode).toBeUndefined();
    const withMode = LessonSchema.parse({ ...baseLesson, pedagogical_mode: 'workshop' });
    expect(withMode.pedagogical_mode).toBe('workshop');
  });

  it('includes mode in curriculum summaries and library patches', () => {
    const lesson = LessonSchema.parse({ ...baseLesson, pedagogical_mode: 'seminar' });
    const summary = toCurriculumLessonSummary(lesson, false);
    expect(summary.pedagogical_mode).toBe('seminar');

    const parsed = parseLessonLibraryPatch({ pedagogical_mode: 'project' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const next = applyLessonLibraryPatch(lesson, parsed.patch);
    expect(next.pedagogical_mode).toBe('project');
  });
});
