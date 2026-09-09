import { z } from 'zod';
import { schemaVersion } from './task';

/**
 * Compact purpose / principles / vision for Hammond Horizons.
 * Areas, Goals, Projects, Tasks remain the Tasks source of truth —
 * this record only holds the layers above Areas.
 */
export const PlanningDirectionSchema = z.object({
  schema_version: schemaVersion,
  id: z.literal('default'),
  purpose: z.string().default(''),
  principles: z.array(z.string()).default([]),
  vision: z.string().default(''),
  updated_at: z.string().nullable().default(null)
});

export type PlanningDirection = z.infer<typeof PlanningDirectionSchema>;

export const DEFAULT_PLANNING_DIRECTION: PlanningDirection = {
  schema_version: 1,
  id: 'default',
  purpose: '',
  principles: [],
  vision: '',
  updated_at: null
};

export const PlanningDirectionUpdateSchema = PlanningDirectionSchema.partial().omit({
  schema_version: true,
  id: true
});
