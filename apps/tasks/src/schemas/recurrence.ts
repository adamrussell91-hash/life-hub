import { z } from 'zod';

export const RecurrenceFrequencySchema = z.enum(['daily', 'weekly', 'monthly', 'yearly']);

export const RecurrenceRuleSchema = z.object({
  v: z.literal(1),
  frequency: RecurrenceFrequencySchema,
  /** Repeat every N days/weeks/months/years. */
  interval: z.number().int().positive().default(1),
  /** Stop after this many completed cycles (null = forever). */
  count: z.number().int().positive().nullable().default(null),
  /** How many cycles have already finished (including the one just completed). */
  completed_count: z.number().int().nonnegative().default(0),
  /** 0 = Sunday … 6 = Saturday (weekly only). */
  weekday: z.number().int().min(0).max(6).optional(),
  /** Links instances in the same repeating series. */
  series_id: z.string().min(1).optional()
});

export type RecurrenceRule = z.infer<typeof RecurrenceRuleSchema>;
export type RecurrenceFrequency = z.infer<typeof RecurrenceFrequencySchema>;
