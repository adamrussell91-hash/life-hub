import { z } from 'zod';
import { BlockSchema } from './block';
import { CoverSchema } from './cover';

export const PublishedUnitLessonSummarySchema = z.object({
  lesson_id: z.string().min(1),
  title: z.string().min(1)
});

export const PublishedUnitSchema = z.object({
  unit_id: z.string().min(1),
  title: z.string().min(1),
  lessons: z.array(PublishedUnitLessonSummarySchema),
  cover: CoverSchema.optional(),
  blocks: z.array(BlockSchema).optional(),
  outcome_ids: z.array(z.string().min(1)).max(24).optional()
});

export type PublishedUnitLessonSummary = z.infer<
  typeof PublishedUnitLessonSummarySchema
>;
export type PublishedUnit = z.infer<typeof PublishedUnitSchema>;

export function orderLessonsByUnitIds(
  lessonIds: string[],
  lessons: PublishedUnitLessonSummary[]
): PublishedUnitLessonSummary[] {
  const byId = new Map(lessons.map((lesson) => [lesson.lesson_id, lesson]));
  const ordered: PublishedUnitLessonSummary[] = [];

  for (const id of lessonIds) {
    const hit = byId.get(id);
    if (hit) {
      ordered.push(hit);
      byId.delete(id);
    }
  }

  const rest = [...byId.values()].sort((a, b) =>
    a.title.localeCompare(b.title)
  );
  return [...ordered, ...rest];
}
