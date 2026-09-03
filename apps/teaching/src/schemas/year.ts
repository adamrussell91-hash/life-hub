import { z } from 'zod';
import { CommonFields } from './common';

export const YearSchema = z.object({
  ...CommonFields,
  type: z.literal('year'),
  year_level: z.number().int().positive(),
  subject_ids: z.array(z.string().min(1))
});

export type Year = z.infer<typeof YearSchema>;
