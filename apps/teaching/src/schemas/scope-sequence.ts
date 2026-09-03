import { z } from 'zod';
import { CommonFields } from './common';

const WeekSchema = z.number().int().positive();
const CalendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const weekRangeRefine = (i: { start_week: number; end_week: number }) =>
  i.end_week >= i.start_week;

export const ScopeTermSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  term_number: z.number().int().positive(),
  start_week: WeekSchema,
  end_week: WeekSchema,
  start_date: CalendarDateSchema.optional(),
  end_date: CalendarDateSchema.optional()
}).refine(weekRangeRefine, { message: 'term end_week must be >= start_week' });

const TimelineUnitItemBaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('unit'),
  unit_id: z.string().min(1),
  start_week: WeekSchema,
  end_week: WeekSchema,
  start_date: CalendarDateSchema.optional(),
  end_date: CalendarDateSchema.optional(),
  order: z.number().int()
});

const TimelineNoteItemBaseSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('note'),
  title: z.string().min(1),
  start_week: WeekSchema,
  end_week: WeekSchema,
  start_date: CalendarDateSchema.optional(),
  end_date: CalendarDateSchema.optional(),
  order: z.number().int()
});

export const TimelineUnitItemSchema = TimelineUnitItemBaseSchema.refine(weekRangeRefine, {
  message: 'end_week must be >= start_week'
});

export const TimelineNoteItemSchema = TimelineNoteItemBaseSchema.refine(weekRangeRefine, {
  message: 'end_week must be >= start_week'
});

export const TimelineItemSchema = z
  .discriminatedUnion('kind', [TimelineUnitItemBaseSchema, TimelineNoteItemBaseSchema])
  .refine(weekRangeRefine, { message: 'end_week must be >= start_week' });

export const ScopeSequenceSchema = z.object({
  ...CommonFields,
  type: z.literal('scope_sequence'),
  subject_id: z.string().min(1),
  academic_year: z.number().int(),
  week_count: z.number().int().positive(),
  terms: z.array(ScopeTermSchema),
  timeline_items: z.array(TimelineItemSchema),
  outcome_ids: z.array(z.string().min(1)).max(24).optional()
});

export type ScopeSequence = z.infer<typeof ScopeSequenceSchema>;
export type TimelineItem = z.infer<typeof TimelineItemSchema>;
