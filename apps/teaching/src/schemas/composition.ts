import { z } from 'zod';
import { CommonFields, TrashFields } from './common';
import { SectionBlockSchema } from './block';

export const CompositionTemplateSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('composition_template'),
  root: SectionBlockSchema
});

export type CompositionTemplate = z.infer<typeof CompositionTemplateSchema>;

export const CompositionSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  updated_at: z.string().datetime()
});

export type CompositionSummary = z.infer<typeof CompositionSummarySchema>;
