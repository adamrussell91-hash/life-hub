import { z } from 'zod';
import { IsoDateSchema } from './common';
import { BlockSchema } from './block';
import { CoverSchema } from './cover';
import { sanitizeBlocksDeep } from '../blocks/sanitize-blocks';
import { PublishableLessonSchema, type Lesson } from './lesson';
import { attachedOutcomeIds } from '../curriculum/outcome-ids';
import { QuizSettingsSchema } from '../quiz/core';

export const PublishedLessonSchema = z.object({
  lesson_id: z.string().min(1),
  title: z.string().min(1),
  unit_id: z.string().min(1),
  blocks: z.array(BlockSchema),
  published_at: IsoDateSchema,
  schema_version: z.literal(1),
  cover: CoverSchema.optional(),
  outcome_ids: z.array(z.string().min(1)).max(24).optional(),
  feedback_off: z.boolean().optional(),
  /** Quiz lessons: the settings students may see, with the published version. */
  pedagogical_mode: z.enum(['quiz', 'lecture']).optional(),
  quiz: QuizSettingsSchema.extend({
    version: z.string(),
    question_count: z.number().int(),
    total_marks: z.number()
  }).optional()
});

export type PublishedLesson = z.infer<typeof PublishedLessonSchema>;

export function toPublishedLesson(
  lesson: Lesson,
  publishedAt: string
): PublishedLesson {
  PublishableLessonSchema.parse(lesson);
  return PublishedLessonSchema.parse({
    lesson_id: lesson.id,
    title: lesson.title,
    unit_id: lesson.unit_id,
    blocks: sanitizeBlocksDeep(lesson.blocks),
    published_at: publishedAt,
    schema_version: 1,
    ...(lesson.cover ? { cover: lesson.cover } : {}),
    ...(attachedOutcomeIds(lesson).length > 0
      ? { outcome_ids: attachedOutcomeIds(lesson) }
      : {}),
    ...(lesson.feedback_off === true ? { feedback_off: true } : {})
  });
}

export { PublishableLessonSchema };
