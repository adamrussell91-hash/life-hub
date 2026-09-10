import { z } from 'zod';
import { BlockSchema } from './block';
import { CommonFields, TrashFields } from './common';
import { CoverSchema } from './cover';

export const UnitSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('unit'),
  year_id: z.string().min(1),
  subject_id: z.string().min(1),
  lesson_ids: z.array(z.string().min(1)),
  primary_term: z.number().int().positive().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(),
  cover: CoverSchema.optional(),
  blocks: z.array(BlockSchema).optional(),
  outcome_ids: z.array(z.string().min(1)).max(24).optional()
});

export type Unit = z.infer<typeof UnitSchema>;
