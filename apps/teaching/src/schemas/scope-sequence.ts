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

/** One visit of an outcome to a unit: the level it aims for and what students now do. */
export const OutcomeClimbEntrySchema = z.object({
  outcome: z.number().int().min(1).max(12),
  unit_id: z.string().min(1),
  level: z.enum(['capable', 'skilled', 'accomplished', 'excellent']).optional(),
  demand: z.string().trim().max(200).optional()
});

export const KNOWLEDGE_LIMITS = { target: 600, text: 300, word: 60, label: 40, units: 60, items: 30, words: 40, weeks: 24 } as const;
const ItemIdSchema = z.string().regex(/^ki_[a-z0-9]{4,16}$/);
const PlanTextSchema = z.string().max(KNOWLEDGE_LIMITS.text);

/** One thing students must know or be able to do, typed or linked to a deep understanding piece. */
export const KnowledgeItemSchema = z.object({
  id: ItemIdSchema,
  text: PlanTextSchema,
  piece_id: z.string().regex(/^kp_[a-z0-9]{4,16}$/).optional()
});

/** What a unit assumes: an item taught earlier in the plan, something from last year, or something nobody teaches yet. */
export const AlreadyKnowSchema = z.discriminatedUnion('from', [
  z.object({ from: z.literal('plan'), item_id: ItemIdSchema }),
  z.object({ from: z.literal('before'), text: PlanTextSchema }),
  z.object({ from: z.literal('untaught'), text: PlanTextSchema })
]);

export const KnowledgeWeekSchema = z.object({
  id: z.string().regex(/^kw_[a-z0-9]{4,16}$/),
  label: z.string().max(KNOWLEDGE_LIMITS.label).default(''),
  question: PlanTextSchema.default(''),
  already: z.array(AlreadyKnowSchema).max(KNOWLEDGE_LIMITS.items).default([]),
  must_ids: z.array(ItemIdSchema).max(KNOWLEDGE_LIMITS.items).default([]),
  skill_ids: z.array(ItemIdSchema).max(KNOWLEDGE_LIMITS.items).default([]),
  words: z.array(z.string().max(KNOWLEDGE_LIMITS.word)).max(KNOWLEDGE_LIMITS.words).default([]),
  check: PlanTextSchema.default('')
});

export const KnowledgeUnitPlanSchema = z.object({
  unit_id: z.string().min(1),
  big_idea: PlanTextSchema.default(''),
  already: z.array(AlreadyKnowSchema).max(KNOWLEDGE_LIMITS.items).default([]),
  must: z.array(KnowledgeItemSchema).max(KNOWLEDGE_LIMITS.items).default([]),
  words: z.array(z.string().max(KNOWLEDGE_LIMITS.word)).max(KNOWLEDGE_LIMITS.words).default([]),
  skills: z.array(KnowledgeItemSchema).max(KNOWLEDGE_LIMITS.items).default([]),
  assessed_by: PlanTextSchema.default(''),
  /** Where this unit leads beyond the plan, such as next year. Later units are worked out from links. */
  leads_on: PlanTextSchema.default(''),
  weeks: z.array(KnowledgeWeekSchema).max(KNOWLEDGE_LIMITS.weeks).default([])
});

/** The year as a written plan: where it ends, then each unit in teaching order (order comes from the timeline). */
export const KnowledgePlanSchema = z.object({
  year_target: z.string().max(KNOWLEDGE_LIMITS.target).default(''),
  units: z.array(KnowledgeUnitPlanSchema).max(KNOWLEDGE_LIMITS.units).default([])
});

export const ScopeSequenceSchema = z.object({
  ...CommonFields,
  type: z.literal('scope_sequence'),
  subject_id: z.string().min(1),
  academic_year: z.number().int(),
  week_count: z.number().int().positive(),
  terms: z.array(ScopeTermSchema),
  timeline_items: z.array(TimelineItemSchema),
  outcome_ids: z.array(z.string().min(1)).max(24).optional(),
  outcome_climb: z.array(OutcomeClimbEntrySchema).max(300).optional(),
  knowledge_plan: KnowledgePlanSchema.optional()
});

export type ScopeSequence = z.infer<typeof ScopeSequenceSchema>;
export type TimelineItem = z.infer<typeof TimelineItemSchema>;
export type OutcomeClimbEntry = z.infer<typeof OutcomeClimbEntrySchema>;
export type KnowledgePlan = z.infer<typeof KnowledgePlanSchema>;
export type KnowledgeUnitPlan = z.infer<typeof KnowledgeUnitPlanSchema>;
export type KnowledgeItem = z.infer<typeof KnowledgeItemSchema>;
export type KnowledgeWeek = z.infer<typeof KnowledgeWeekSchema>;
export type AlreadyKnow = z.infer<typeof AlreadyKnowSchema>;
