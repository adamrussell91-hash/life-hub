import { z } from 'zod';
import { AfterLessonIdsSchema, BlockSchema, LessonKindSchema, LineStopSchema, NetworkLineSchema } from './block';
import { CoverSchema } from './cover';

export const PublishedUnitLessonSummarySchema = z.object({
  lesson_id: z.string().min(1),
  title: z.string().min(1),
  line_stops: z.array(LineStopSchema).max(16).optional(),
  after_lesson_ids: AfterLessonIdsSchema.optional(),
  lesson_kind: LessonKindSchema.optional()
});

export const PublishedAnthologyItemSchema = z.object({
  lesson_id: z.string().min(1),
  lesson_title: z.string().min(1),
  block_id: z.string().min(1),
  annotation_id: z.string().min(1),
  quote: z.string(),
  line_number: z.number().int().min(0),
  layer_name: z.string(),
  technique_id: z.string().optional(),
  themes: z.array(z.string()),
  concepts: z.array(z.string())
});

export const PublishedAnthologyTextSchema = z.object({
  lesson_id: z.string().min(1),
  block_id: z.string().min(1),
  title: z.string().min(1),
  attribution: z.string().optional(),
  fingerprint: z.record(z.string(), z.number().int().min(0)),
  text_included: z.boolean(),
  poem: z
    .object({
      kind: z.enum(['verse', 'prose']),
      stanzas: z.array(
        z.object({
          id: z.string().min(1),
          lines: z.array(z.object({ id: z.string().min(1), text: z.string() }))
        })
      )
    })
    .optional(),
  stop_lines: z.record(z.string(), z.string()).optional()
});

export const PublishedAnthologySchema = z.object({
  items: z.array(PublishedAnthologyItemSchema),
  texts: z.array(PublishedAnthologyTextSchema)
});

export const PublishedUnitSchema = z.object({
  unit_id: z.string().min(1),
  title: z.string().min(1),
  lessons: z.array(PublishedUnitLessonSummarySchema),
  cover: CoverSchema.optional(),
  blocks: z.array(BlockSchema).optional(),
  anthology: PublishedAnthologySchema.optional(),
  outcome_ids: z.array(z.string().min(1)).max(24).optional(),
  /** The subject's curriculum network lines, for the unit map. */
  network_lines: z.array(NetworkLineSchema).max(24).optional()
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
