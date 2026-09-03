import { z } from 'zod';
import { CommonFields } from './common';

export const SubjectSchema = z.object({
  ...CommonFields,
  type: z.literal('subject'),
  display_title: z.string().min(1),
  scope_id: z.string().min(1).optional(),
  unit_ids: z.array(z.string().min(1)),
  outcome_ids: z.array(z.string().min(1)),
  class_ids: z.array(z.string().min(1))
});

export type Subject = z.infer<typeof SubjectSchema>;
