import { z } from 'zod';
import { PedagogicalModeSchema } from '@/curriculum/pedagogical-mode';
import type { Lesson } from '@/schemas/lesson';

export const LessonLibraryPatchSchema = z.object({
  tags: z.array(z.string().min(1).max(40)).max(24).optional(),
  review_status: z.enum(['needs_review', 'none']).optional(),
  syllabus_outcomes: z.array(z.string().min(1).max(32)).max(24).optional(),
  outcome_ids: z.array(z.string().min(1).max(64)).max(24).optional(),
  unit_id: z.string().min(1).optional(),
  author_id: z.string().min(1).nullable().optional(),
  pedagogical_mode: PedagogicalModeSchema.optional()
});

export type LessonLibraryPatch = z.infer<typeof LessonLibraryPatchSchema>;

export function parseLessonLibraryPatch(
  body: unknown
):
  | { ok: true; patch: LessonLibraryPatch; hasPatch: boolean }
  | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;
  const subset = {
    ...(record.tags !== undefined ? { tags: record.tags } : {}),
    ...(record.review_status !== undefined ? { review_status: record.review_status } : {}),
    ...(record.syllabus_outcomes !== undefined
      ? { syllabus_outcomes: record.syllabus_outcomes }
      : {}),
    ...(record.outcome_ids !== undefined ? { outcome_ids: record.outcome_ids } : {}),
    ...(record.unit_id !== undefined ? { unit_id: record.unit_id } : {}),
    ...(record.author_id !== undefined ? { author_id: record.author_id } : {}),
    ...(record.pedagogical_mode !== undefined
      ? { pedagogical_mode: record.pedagogical_mode }
      : {})
  };
  const parsed = LessonLibraryPatchSchema.safeParse(subset);
  if (!parsed.success) {
    return { ok: false, message: 'Library patch is invalid' };
  }
  return { ok: true, patch: parsed.data, hasPatch: Object.keys(parsed.data).length > 0 };
}

export function applyLessonLibraryPatch(lesson: Lesson, patch: LessonLibraryPatch): Lesson {
  const next: Lesson = { ...lesson };
  if (patch.tags !== undefined) next.tags = patch.tags;
  if (patch.review_status !== undefined) next.review_status = patch.review_status;
  if (patch.syllabus_outcomes !== undefined) next.syllabus_outcomes = patch.syllabus_outcomes;
  if (patch.outcome_ids !== undefined) {
    next.outcome_ids = patch.outcome_ids;
    next.syllabus_outcomes = patch.outcome_ids;
  }
  if (patch.unit_id !== undefined) next.unit_id = patch.unit_id;
  if (patch.author_id !== undefined) {
    if (patch.author_id === null) delete next.author_id;
    else next.author_id = patch.author_id;
  }
  if (patch.pedagogical_mode !== undefined) next.pedagogical_mode = patch.pedagogical_mode;
  return next;
}
