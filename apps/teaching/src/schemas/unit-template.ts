import { z } from 'zod';
import { BlockSchema } from './block';
import { CommonFields, TrashFields } from './common';

export const UnitTemplateSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('unit_template'),
  description: z.string().optional(),
  blocks: z.array(BlockSchema).optional()
});

export type UnitTemplate = z.infer<typeof UnitTemplateSchema>;

export const UnitTemplateSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  updated_at: z.string().datetime()
});

export type UnitTemplateSummary = z.infer<typeof UnitTemplateSummarySchema>;
