import { z } from 'zod';
import { schemaVersion } from './task';

export const AreaSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  tags: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string()
});

export type Area = z.infer<typeof AreaSchema>;

export const AreaCreateSchema = AreaSchema.omit({
  schema_version: true,
  id: true,
  created_at: true,
  updated_at: true
}).partial({
  description: true,
  tags: true
}).extend({
  title: z.string().min(1)
});

export const AreaUpdateSchema = AreaCreateSchema.partial();
