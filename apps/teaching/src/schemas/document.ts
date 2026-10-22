import { z } from 'zod';
import { BlockSchema } from './block';
import { CommonFields, TrashFields } from './common';
import { CoverSchema } from './cover';
import { SourceSchema } from './source';

export const DocumentKindSchema = z.enum(['syllabus']);

/** A free-form page attached to a subject, e.g. an imported syllabus. */
export const DocumentSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('document'),
  kind: DocumentKindSchema,
  subject_id: z.string().min(1),
  blocks: z.array(BlockSchema),
  cover: CoverSchema.optional(),
  source: SourceSchema.optional()
});

export type TeachingDocument = z.infer<typeof DocumentSchema>;
