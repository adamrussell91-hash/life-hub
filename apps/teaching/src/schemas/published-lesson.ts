import { z } from 'zod';
import { IsoDateSchema } from './common';
import { BlockSchema } from './block';
import { CoverSchema } from './cover';
import { sanitizeBlocksDeep } from '../blocks/sanitize-blocks';
import { PublishableLessonSchema, type Lesson } from './lesson';
import { attachedOutcomeIds } from '../curriculum/outcome-ids';

export const PublishedLessonSchema = z.object({
  lesson_id: z.string().min(1),
  title: z.string().min(1),
  unit_id: z.string().min(1),
  blocks: z.array(BlockSchema),
  published_at: IsoDateSchema,
  schema_version: z.literal(1),
  cover: CoverSchema.optional(),
  outcome_ids: z.array(z.string().min(1)).max(24).optional()
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
      : {})
  });
}

export { PublishableLessonSchema };
