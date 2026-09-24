import { z } from 'zod';
import { LifeWallFieldSchema } from './life-wall';
import { schemaVersion } from './task';

export const GoalStatusSchema = z.enum(['active', 'archived']);

export const GoalSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  parent_area_id: z.string().nullable().default(null),
  /** The Someday / Maybe idea this goal was promoted from — the idea itself stays put. */
  parent_someday_id: z.string().nullable().optional(),
  status: GoalStatusSchema.default('active'),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  life_wall: LifeWallFieldSchema
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
  parent_someday_id: true,
  status: true,
  tags: true,
  life_wall: true
}).extend({
  title: z.string().min(1)
});

export const GoalUpdateSchema = GoalCreateSchema.partial();
