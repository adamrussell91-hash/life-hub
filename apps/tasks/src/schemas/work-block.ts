import { z } from 'zod';
import { schemaVersion } from './task';

/** Hard deadline ≠ planned work. A work block is when work is planned. */
export const WorkBlockDepthSchema = z.enum(['deep', 'shallow', 'admin']);
export const WorkBlockStatusSchema = z.enum([
  'proposed',
  'confirmed',
  'in_progress',
  'done',
  'cancelled'
]);
export const WorkBlockSourceSchema = z.enum([
  'clare',
  'hammond',
  'manual',
  'runway',
  'focus'
]);

export const WorkBlockSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  task_id: z.string().nullable().default(null),
  project_id: z.string().nullable().default(null),
  title: z.string().min(1),
  date: z.string().min(1),
  start_time: z.string().min(1),
  duration_minutes: z.number().int().positive(),
  depth: WorkBlockDepthSchema.default('shallow'),
  status: WorkBlockStatusSchema.default('proposed'),
  source: WorkBlockSourceSchema.default('manual'),
  locked: z.boolean().default(false),
  created_at: z.string(),
  updated_at: z.string()
});

export type WorkBlock = z.infer<typeof WorkBlockSchema>;
export type WorkBlockDepth = z.infer<typeof WorkBlockDepthSchema>;
export type WorkBlockStatus = z.infer<typeof WorkBlockStatusSchema>;

export const WorkBlockCreateSchema = WorkBlockSchema.omit({
  schema_version: true,
  id: true,
  created_at: true,
  updated_at: true
}).partial({
  task_id: true,
  project_id: true,
  depth: true,
  status: true,
  source: true,
  locked: true
}).extend({
  title: z.string().min(1),
  date: z.string().min(1),
  start_time: z.string().min(1),
  duration_minutes: z.number().int().positive()
});

export const WorkBlockUpdateSchema = WorkBlockCreateSchema.partial();
