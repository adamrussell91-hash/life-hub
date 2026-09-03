import { z } from 'zod';
import { IsoDateSchema } from './common';

export const DeliveryStatusSchema = z.enum([
  'planned',
  'current',
  'delivered',
  'skipped',
  'rescheduled'
]);

export const ScheduledLessonSchema = z.object({
  id: z.string().min(1),
  type: z.literal('scheduled_lesson'),
  class_id: z.string().min(1),
  lesson_id: z.string().min(1),
  unit_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  schedule_order: z.number().int(),
  delivery_status: DeliveryStatusSchema,
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
});

export type ScheduledLesson = z.infer<typeof ScheduledLessonSchema>;
