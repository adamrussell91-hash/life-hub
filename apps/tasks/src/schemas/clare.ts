import { z } from 'zod';
import { schemaVersion, TaskDomainSchema } from './task';

/** Per-domain estimate learning for Clare’s negotiation loop (spec §5.4). */
export const ClareCalibrationSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  domain: TaskDomainSchema,
  sample_count: z.number().int().nonnegative().default(0),
  sum_proposed: z.number().default(0),
  sum_accepted: z.number().default(0),
  actual_sample_count: z.number().int().nonnegative().default(0),
  sum_actual: z.number().default(0),
  /** Accepted − proposed minutes for recent negotiations (newest last). */
  recent_deltas: z.array(z.number()).default([]),
  calibrated_default_minutes: z.number().positive().default(45),
  updated_at: z.string()
});

export type ClareCalibration = z.infer<typeof ClareCalibrationSchema>;

export const ClareNegotiationLogSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  task_id: z.string().min(1),
  domain: TaskDomainSchema,
  framework_id: z.string().nullable(),
  proposed_minutes: z.number(),
  accepted_minutes: z.number(),
  reasoning: z.string(),
  created_at: z.string()
});

export type ClareNegotiationLog = z.infer<typeof ClareNegotiationLogSchema>;
