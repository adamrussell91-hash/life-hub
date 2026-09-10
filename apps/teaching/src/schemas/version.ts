import { z } from 'zod';
import { IsoDateSchema } from './common';

export const VersionKindSchema = z.enum(['lesson', 'unit', 'class_homepage']);
export const VersionReasonSchema = z.enum([
  'save',
  'publish',
  'restore',
  'ai_accepted',
  'manual_checkpoint'
]);

export const VersionIndexEntrySchema = z.object({
  id: z.string().min(1),
  revision: z.number().int().positive(),
  created_at: IsoDateSchema,
  reason: VersionReasonSchema,
  label: z.string().min(1).optional()
});

export const VersionIndexSchema = z.object({
  parent_id: z.string().min(1),
  kind: VersionKindSchema,
  latest_revision: z.number().int().nonnegative(),
  entries: z.array(VersionIndexEntrySchema)
});

export const VersionRecordSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['lesson_version', 'unit_version', 'class_homepage_version']),
  kind: VersionKindSchema,
  parent_id: z.string().min(1),
  revision: z.number().int().positive(),
  created_at: IsoDateSchema,
  reason: VersionReasonSchema,
  label: z.string().min(1).nullable().optional(),
  snapshot: z.unknown()
});

export type VersionKind = z.infer<typeof VersionKindSchema>;
export type VersionReason = z.infer<typeof VersionReasonSchema>;
export type VersionIndex = z.infer<typeof VersionIndexSchema>;
export type VersionIndexEntry = z.infer<typeof VersionIndexEntrySchema>;
export type VersionRecord = z.infer<typeof VersionRecordSchema>;
