import { z } from 'zod';
import { BlockSchema } from './block';
import { CommonFields, TrashFields } from './common';

export const LessonTemplateSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('lesson_template'),
  blocks: z.array(BlockSchema)
});

export type LessonTemplate = z.infer<typeof LessonTemplateSchema>;

export const LessonTemplateSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  updated_at: z.string().datetime()
});

export type LessonTemplateSummary = z.infer<typeof LessonTemplateSummarySchema>;
