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
  start_time: z
    .string()
    .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .nullable()
    .optional(),
  schedule_order: z.number().int(),
  end_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  cycle_day: z.number().int().min(1).max(20).optional(),
  period: z.string().max(40).optional(),
  room: z.string().max(80).optional(),
  delivery_status: DeliveryStatusSchema,
  created_at: IsoDateSchema,
  updated_at: IsoDateSchema,
  schema_version: z.literal(1)
});

export type ScheduledLesson = z.infer<typeof ScheduledLessonSchema>;
