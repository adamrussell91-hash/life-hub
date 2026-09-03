import { z } from 'zod';
import { schemaVersion } from './task';

export const StressAgentSchema = z.enum([
  'General Hammond',
  'Penelope Rose Quillian',
  'Dr Vera Lenz'
]);

export const StressPatternKindSchema = z.enum([
  'overlapping_excursions',
  'dense_pinch',
  'missed_deadlines',
  'intuitive',
  'manual'
]);

export const StressFlagSchema = z.object({
  schema_version: schemaVersion,
  id: z.string().min(1),
  source_project_or_task_id: z.string().nullable().default(null),
  pattern_description: z.string().min(1),
  pattern_kind: StressPatternKindSchema,
  raised_by: z.literal('Clare DeMind').default('Clare DeMind'),
  routed_to: z.array(StressAgentSchema).min(1),
  recurrence_note: z.string().nullable().default(null),
  /** Stable key so scans do not spam duplicate flags. */
  fingerprint: z.string().min(1),
  created_at: z.string()
});

export type StressFlag = z.infer<typeof StressFlagSchema>;
export type StressAgent = z.infer<typeof StressAgentSchema>;
export type StressPatternKind = z.infer<typeof StressPatternKindSchema>;

export const DEFAULT_STRESS_ROUTE: StressAgent[] = [
  'General Hammond',
  'Penelope Rose Quillian',
  'Dr Vera Lenz'
];
