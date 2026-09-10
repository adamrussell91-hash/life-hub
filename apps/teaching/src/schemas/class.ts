import { z } from 'zod';
import { BlockSchema } from './block';
import { CommonFields, TrashFields } from './common';
import { CoverSchema } from './cover';

export const ClassHomepageSchema = z.object({
  announcements: z.array(BlockSchema),
  resources: z.array(BlockSchema),
  custom: z.array(BlockSchema)
});

export type ClassHomepage = z.infer<typeof ClassHomepageSchema>;

export const ClassSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('class'),
  code: z.string().min(1),
  display_name: z.string().min(1).optional(),
  academic_year: z.number().int(),
  year_id: z.string().min(1),
  subject_id: z.string().min(1),
  active_unit_ids: z.array(z.string().min(1)),
  current_unit_id: z.string().min(1).optional(),
  current_scheduled_lesson_id: z.string().min(1).optional(),
  meeting_days: z.array(z.number().int().min(1).max(7)).optional(),
  homepage: ClassHomepageSchema.optional(),
  cover: CoverSchema.optional()
});

export type Class = z.infer<typeof ClassSchema>;
