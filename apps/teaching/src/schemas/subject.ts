import { z } from 'zod';
import { CommonFields } from './common';
import { NetworkLineSchema, NetworkNudgesSchema } from './block';

export const SubjectSchema = z.object({
  ...CommonFields,
  type: z.literal('subject'),
  display_title: z.string().min(1),
  scope_id: z.string().min(1).optional(),
  unit_ids: z.array(z.string().min(1)),
  outcome_ids: z.array(z.string().min(1)),
  class_ids: z.array(z.string().min(1)),
  /** Curriculum network lines, in map column order: trains, metro, light rail. */
  network_lines: z.array(NetworkLineSchema).max(24).optional(),
  /** Drag offsets on the year network, keyed by unit id. */
  network_nudges: NetworkNudgesSchema.optional()
});

export type Subject = z.infer<typeof SubjectSchema>;
