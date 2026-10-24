import { z } from 'zod';

/**
 * A Design Sprint: settings on the draft lesson (`lesson.sprint`), the public
 * subset students get with the published lesson, and what students send for
 * each phase. Generated to netlify/functions/_shared/sprint-schema.mjs so the
 * server validates with the same rules. Imports nothing from the app.
 */

export const SPRINT_PHASES = ['understand', 'sketch', 'decide', 'prototype', 'test'] as const;
export type SprintPhaseKey = (typeof SPRINT_PHASES)[number];
export const SprintPhaseKeySchema = z.enum(SPRINT_PHASES);

export const PHASE_LABELS: Record<SprintPhaseKey, string> = {
  understand: 'Understand',
  sketch: 'Sketch',
  decide: 'Decide',
  prototype: 'Prototype',
  test: 'Test'
};

/** Starting · Showing · Strong, stored as 1 · 2 · 3. */
export const LEVEL_LABELS = ['Starting', 'Showing', 'Strong'] as const;
export const LevelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Level = z.infer<typeof LevelSchema>;

export const SPRINT_LIMITS = { criteria: 5, requirements: 6, groups: 10, groupSize: 12, ideas: 5, parts: 6, files: 3, fileBytes: 5 * 1024 * 1024 } as const;

export const SprintIdSchema = z.string().regex(/^[a-z0-9_-]{1,40}$/);
const Day = z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/);
const Time = z.string().regex(/^(\d{2}:\d{2})?$/);
const text = (max: number) => z.string().trim().max(max);

export const SprintCriterionSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(160),
  /** Markbook outcome catalogue id, from the lesson's dot points. */
  outcome: z.string().min(1).max(64).optional()
});
export type SprintCriterion = z.infer<typeof SprintCriterionSchema>;

export const SprintRequirementSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(160),
  phases: z.array(SprintPhaseKeySchema).max(5).default(['sketch', 'prototype'])
});
export type SprintRequirement = z.infer<typeof SprintRequirementSchema>;

export const IdeaGuideSchema = z.object({
  checklist: z.array(z.string().trim().min(1).max(160)).min(1).max(8),
  model: z.object({
    topic: text(80),
    text: text(800),
    /** "1 answers the question", one per marked part. */
    notes: z.array(text(120)).max(6).default([])
  }),
  pair: z.object({ developing: text(400), strong: text(400), note: text(200) }).optional()
});
export type IdeaGuide = z.infer<typeof IdeaGuideSchema>;

export const SprintPhaseSchema = z.object({
  key: SprintPhaseKeySchema,
  where: z.enum(['class', 'home']),
  due_date: Day.default(''),
  due_time: Time.default('15:00'),
  /** Class phases: when the class part ends on its own, "YYYY-MM-DDTHH:MM" Sydney time, or empty. */
  ends_at: z.string().regex(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})?$/).default(''),
  instruction: text(600).default(''),
  /** Understand and Sketch: ideas each student writes. */
  ideas: z.number().int().min(1).max(SPRINT_LIMITS.ideas).optional(),
  stretch: text(300).default('')
});
export type SprintPhase = z.infer<typeof SprintPhaseSchema>;

export const SprintGroupSchema = z.object({
  id: SprintIdSchema,
  name: z.string().trim().min(1).max(40),
  students: z.array(z.string().min(1).max(64)).max(SPRINT_LIMITS.groupSize)
});
export type SprintGroup = z.infer<typeof SprintGroupSchema>;

/**
 * Understand's steps, each one the teacher can leave out. Alone steps are on
 * each student's own screen; group steps are the group's shared space.
 */
export const UNDERSTAND_ALONE = ['spot', 'audience', 'dig', 'say', 'limits'] as const;
export const UNDERSTAND_GROUP = ['vote', 'merge', 'grid', 'ask', 'expert'] as const;
export const UNDERSTAND_STEPS = [...UNDERSTAND_ALONE, ...UNDERSTAND_GROUP] as const;
export type UnderstandStep = (typeof UNDERSTAND_STEPS)[number];
export const UNDERSTAND_STEP_LABELS: Record<UnderstandStep, string> = {
  spot: 'Spot: words that stand out in the brief',
  audience: 'Audience: who it is for and why',
  dig: 'Dig: why is that a problem?',
  say: 'Say it: the problem in your own words',
  limits: 'Limits: control and known',
  vote: 'Vote on the problem',
  merge: 'One audience',
  grid: 'Our limits',
  ask: 'Choose questions for the expert',
  expert: 'Expert answers'
};
const allSteps = () => Object.fromEntries(UNDERSTAND_STEPS.map((k) => [k, true])) as Record<UnderstandStep, boolean>;
export const UnderstandSettingsSchema = z.object({
  layout: z.enum(['slides', 'vertical']).default('slides'),
  steps: z.record(z.string(), z.boolean()).default(allSteps).transform((v) => ({ ...allSteps(), ...Object.fromEntries(Object.entries(v).filter(([k]) => (UNDERSTAND_STEPS as readonly string[]).includes(k))) }) as Record<UnderstandStep, boolean>)
});
export type UnderstandSettings = z.infer<typeof UnderstandSettingsSchema>;
export const defaultUnderstand = (): UnderstandSettings => ({ layout: 'slides', steps: allSteps() });

/** Limits grid boxes: can or can't control, known or unknown. */
export const LIMIT_BOXES = ['can_known', 'cant_known', 'can_unknown', 'cant_unknown'] as const;
export type LimitBox = (typeof LIMIT_BOXES)[number];

const phasesInOrder = (phases: readonly { key: string }[]) => phases.every((p, i) => p.key === SPRINT_PHASES[i]);

export const SprintSettingsSchema = z.object({
  class_id: z.string().min(1).max(64),
  decider: z.enum(['top_vote', 'teacher']).default('teacher'),
  support: z.enum(['guided', 'standard', 'open']).default('standard'),
  lock_hours: z.number().int().min(0).max(24).default(2),
  criteria: z.array(SprintCriterionSchema).max(SPRINT_LIMITS.criteria).default([]),
  reflection_criteria: z.array(SprintCriterionSchema).max(3).default([]),
  reflection_prompts: z.array(text(200)).max(2).default([]),
  requirements: z.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements).default([]),
  idea_guide: IdeaGuideSchema,
  phases: z.array(SprintPhaseSchema).length(5).refine(phasesInOrder, 'Phases must be in order: Understand, Sketch, Decide, Prototype, Test.'),
  groups: z.array(SprintGroupSchema).max(SPRINT_LIMITS.groups).default([]),
  understand: UnderstandSettingsSchema.default(defaultUnderstand),
  /** Sketch's rapid ideas: minutes on the timer, 0 for no timer. */
  sketch_timer: z.number().int().min(0).max(30).default(8),
  /** Markbook assessment columns made for this sprint's marks. */
  columns: z.object({ prototype: z.string().optional(), reflection: z.string().optional() }).default({})
});
export type SprintSettings = z.infer<typeof SprintSettingsSchema>;

/** What students get with the published lesson: no class, groups, outcomes or columns. */
export const PublicSprintSchema = z.object({
  support: z.enum(['guided', 'standard', 'open']),
  lock_hours: z.number().int().min(0).max(24),
  criteria: z.array(SprintCriterionSchema.omit({ outcome: true })).max(SPRINT_LIMITS.criteria),
  reflection_criteria: z.array(SprintCriterionSchema.omit({ outcome: true })).max(3),
  reflection_prompts: z.array(z.string().max(200)).max(2),
  requirements: z.array(SprintRequirementSchema).max(SPRINT_LIMITS.requirements),
  idea_guide: IdeaGuideSchema,
  phases: z.array(SprintPhaseSchema).length(5),
  understand: UnderstandSettingsSchema.default(defaultUnderstand),
  sketch_timer: z.number().int().min(0).max(30).default(8)
});
export type PublicSprint = z.infer<typeof PublicSprintSchema>;

// ---------------------------------------------------------------- payloads

const where = text(200);
const Wheres = z.record(z.string().max(40), where).default({});

const cards = z.array(text(120)).max(8).default([]);
export const UnderstandPayloadSchema = z.object({
  /** Earlier sprints' "How might we" notes; still read, no longer written. */
  notes: z.array(text(200)).max(SPRINT_LIMITS.ideas).default([]),
  /** The note id (from the group's statements) this student starred. */
  star: z.string().max(40).default(''),
  stretch: text(300).default(''),
  /** Words from the brief that stand out. */
  spot: z.array(text(40)).max(30).default([]),
  audience: z.object({ who: text(200).default(''), why: text(300).default('') }).default({ who: '', why: '' }),
  /** The surface problem, then each "why is that a problem?". */
  dig: z.array(text(300)).max(6).default([]),
  /** The problem in their own words. */
  say: text(400).default(''),
  limits: z.object({ can_known: cards, cant_known: cards, can_unknown: cards, cant_unknown: cards }).default({ can_known: [], cant_known: [], can_unknown: [], cant_unknown: [] })
});
export const SketchCardSchema = z.object({
  id: SprintIdSchema,
  /** The rapid idea it grew from. */
  seed: text(120).optional(),
  title: text(80),
  idea: text(600),
  answers: text(600),
  evidence: text(600),
  file: z.string().max(40).optional(),
  /** Criterion id → the line that shows it. */
  criteria: Wheres,
  /** Requirement id → where it is. */
  requirements: Wheres,
  value_answer: text(300).default('')
});
export type SketchCard = z.infer<typeof SketchCardSchema>;
export const SketchPayloadSchema = z.object({
  /** Examples worth borrowing from, and what to take from each. */
  inspiration: z.array(z.object({ from: text(120).default(''), borrow: text(200).default('') })).max(3).default([]),
  /** Rapid ideas: one line each, written against the timer. */
  rapid: z.array(text(120)).max(40).default([]),
  /** When the student started the timer (ISO), or empty. */
  rapid_started_at: z.string().max(40).default(''),
  /** Developed ideas, one per rapid idea picked (card id "r{index}"). These go to the group. */
  cards: z.array(SketchCardSchema).max(SPRINT_LIMITS.ideas).default([]),
  strongest: z.string().max(40).default(''),
  strongest_why: text(300).default('')
});
export const DecidePayloadSchema = z.object({
  /** Criterion id → idea id. */
  votes: z.record(z.string().max(40), z.string().max(40)).default({}),
  reasons: z.record(z.string().max(40), text(300)).default({}),
  opened: z.array(z.string().max(40)).max(40).default([]),
  stretch: text(300).default('')
});
export const PrototypePayloadSchema = z.object({
  text: text(4000).default(''),
  link: z.string().trim().max(500).regex(/^(https:\/\/\S+)?$/, 'Links start with https://').default(''),
  files: z.array(z.string().max(40)).max(SPRINT_LIMITS.files).default([]),
  requirements: Wheres,
  self: z.record(z.string().max(40), LevelSchema).default({}),
  self_why: z.record(z.string().max(40), text(300)).default({}),
  value_answer: text(300).default('')
});
export const TestPayloadSchema = z.object({
  reflection: z.array(text(1000)).max(2).default([]),
  quote: text(300).default(''),
  change_criterion: z.string().max(40).default(''),
  value_answer: text(300).default('')
});
export const PAYLOAD_SCHEMAS = {
  understand: UnderstandPayloadSchema,
  sketch: SketchPayloadSchema,
  decide: DecidePayloadSchema,
  prototype: PrototypePayloadSchema,
  test: TestPayloadSchema
} as const;
export type PhasePayload = {
  understand: z.infer<typeof UnderstandPayloadSchema>;
  sketch: z.infer<typeof SketchPayloadSchema>;
  decide: z.infer<typeof DecidePayloadSchema>;
  prototype: z.infer<typeof PrototypePayloadSchema>;
  test: z.infer<typeof TestPayloadSchema>;
};

export const PartSchema = z.object({
  id: SprintIdSchema,
  text: z.string().trim().min(1).max(80),
  shows: text(200).default(''),
  criterion: z.string().max(40).default('')
});
export type Part = z.infer<typeof PartSchema>;
export const PartsSchema = z.array(PartSchema).max(SPRINT_LIMITS.parts).refine((parts) => new Set(parts.map((p) => p.id)).size === parts.length, 'Each part needs its own id.');

export const FeedbackEntrySchema = z.object({
  levels: z.record(z.string().max(40), LevelSchema).default({}),
  worked: text(300).default(''),
  next: text(300).default(''),
  /** The criterion the written lines are about. */
  about: z.string().max(40).default('')
});
export type FeedbackEntry = z.infer<typeof FeedbackEntrySchema>;
