import { z } from 'zod';
import { schemaVersion } from './task';

export const GoalStatusSchema = z.enum(['active', 'archived']);

export const GoalSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  parent_area_id: z.string().nullable().default(null),
  status: GoalStatusSchema.default('active'),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string()
});

export type Goal = z.infer<typeof GoalSchema>;

export const GoalCreateSchema = GoalSchema.omit({
  schema_version: true,
  id: true,
  created_at: true,
  updated_at: true
}).partial({
  description: true,
  parent_area_id: true,
  status: true,
  tags: true
}).extend({
  title: z.string().min(1)
});

export const GoalUpdateSchema = GoalCreateSchema.partial();
