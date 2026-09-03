import { z } from 'zod';
import { CommonFields } from './common';

export const OutcomeSourceSchema = z.enum(['nesa', 'custom']);

export const OutcomeIdsSchema = z.array(z.string().min(1).max(64)).max(24);

export const CurriculumOutcomeSchema = z.object({
  ...CommonFields,
  type: z.literal('curriculum_outcome'),
  source: OutcomeSourceSchema,
  code: z.string().min(1).max(32),
  description: z.string().min(1).max(2000),
  group: z.string().min(1).max(80),
  subject_id: z.string().min(1),
  syllabus: z.string().min(1).max(80).optional(),
  syllabus_version: z.string().min(1).max(40).optional(),
  reference_url: z.string().url().or(z.literal('')).optional()
});

export type CurriculumOutcome = z.infer<typeof CurriculumOutcomeSchema>;
export type OutcomeSource = z.infer<typeof OutcomeSourceSchema>;
