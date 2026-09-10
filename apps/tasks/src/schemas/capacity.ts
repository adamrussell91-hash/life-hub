import { z } from 'zod';
import { schemaVersion } from './task';

/** Share token for Corey’s read-only capacity URL (no task detail). */
export const CapacityShareSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  token: z.string().min(8),
  enabled: z.boolean().default(true),
  created_at: z.string(),
  rotated_at: z.string().nullable().default(null)
});

export type CapacityShare = z.infer<typeof CapacityShareSchema>;
