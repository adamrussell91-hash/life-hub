import { z } from 'zod';
import { schemaVersion } from './task';
import { WorkBlockDepthSchema } from './work-block';

/** Allen threefold work categories — explicit selection wins over inference. */
export const WorkModeSchema = z.enum(['predefined', 'reactive', 'defining']);
export const WorkSessionSourceSchema = z.enum([
  'focus_block',
  'manual',
  'inferred',
  'clare'
]);

export const WorkSessionSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  task_id: z.string().nullable().default(null),
  project_id: z.string().nullable().default(null),
  work_block_id: z.string().nullable().default(null),
  started_at: z.string().min(1),
  finished_at: z.string().nullable().default(null),
  actual_duration_minutes: z.number().nonnegative().nullable().default(null),
  depth: WorkBlockDepthSchema.default('shallow'),
  work_mode: WorkModeSchema.nullable().default(null),
  work_mode_confidence: z.enum(['explicit', 'inferred', 'unknown']).default('unknown'),
  result: z.enum(['done', 'partial', 'stopped', 'open']).default('open'),
  source: WorkSessionSourceSchema.default('manual'),
  notes: z.string().default(''),
  created_at: z.string(),
  updated_at: z.string()
});

export type WorkSession = z.infer<typeof WorkSessionSchema>;
export type WorkMode = z.infer<typeof WorkModeSchema>;

export const WorkSessionCreateSchema = WorkSessionSchema.omit({
  schema_version: true,
  id: true,
  created_at: true,
  updated_at: true
}).partial({
  task_id: true,
  project_id: true,
  work_block_id: true,
  finished_at: true,
  actual_duration_minutes: true,
  depth: true,
  work_mode: true,
  work_mode_confidence: true,
  result: true,
  source: true,
  notes: true
}).extend({
  started_at: z.string().min(1)
});

export const WorkSessionUpdateSchema = WorkSessionCreateSchema.partial();
