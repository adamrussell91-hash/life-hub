import { z } from 'zod';

/**
 * Content shapes for the Thinking Toolkit blocks (Newington Critical Thinking
 * Framework). Teacher-only fields (`teacher_note`, `teacher_jots`) are removed
 * by `filterBlocksForStudent` before publish and print.
 */

export const TkStepSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  prompt: z.string()
});

export const TkRevealSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  body: z.string()
});

export const TkTeacherNoteSchema = z.object({
  what: z.string().default(''),
  run: z.array(z.string()).default([]),
  say: z.array(z.string()).default([]),
  watch: z.array(z.string()).default([]),
  extra_label: z.string().default(''),
  extra: z.array(z.string()).default([]),
  time: z.string().default(''),
  source: z.string().default(''),
  /** True once the teacher edits the note; Thinking move then stops rebuilding it. */
  edited: z.boolean().default(false)
});

/** Teacher's own notes. The empty key is the block's notes; other keys are older per-class notes. */
export const TkJotsSchema = z.record(z.string()).default({});

export const TkItemListSchema = z.array(z.string().min(1)).default([]);

export const ToolkitSkillContentSchema = z.object({
  item: z.string().min(1),
  label: z.string(),
  definition: z.string(),
  definition_source: z.string().default(''),
  /** Student instruction shown at the top of the block. */
  guide: z.string().default(''),
  context: z.string().default(''),
  steps: z.array(TkStepSchema).max(8),
  show_test: z.boolean().default(true),
  checks: z.array(z.string()).max(8).default([]),
  reveals: z.array(TkRevealSchema).max(6).default([]),
  links: z
    .object({ tools: TkItemListSchema, values: TkItemListSchema })
    .default({ tools: [], values: [] }),
  show_links: z.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});

export const ToolFrameSchema = z.enum(['fork', 'steps', 'converter', 'stress']);
export const PairLevelSchema = z.enum(['none', 'level1', 'level2', 'level3', 'maths', 'inquiry']);
export const StressVerdictSchema = z.enum(['survives', 'fails', 'qualifies']);

export const ForkSlotsSchema = z.object({
  kind: z.string().default(''),
  marker: z.string().default(''),
  a: z.string().default(''),
  b: z.string().default('')
});

export const ToolkitToolContentSchema = z.object({
  item: z.string().min(1),
  label: z.string(),
  definition: z.string(),
  definition_source: z.string().default(''),
  /** Student instruction shown at the top of the block. */
  guide: z.string().default(''),
  frame: ToolFrameSchema,
  sentence: z.string().default(''),
  steps: z.array(TkStepSchema).max(8).default([]),
  /** Fork frame: the worked example filled into the slots on reveal. */
  worked: ForkSlotsSchema.default({}),
  worked_note: z.string().default(''),
  converters: z
    .array(z.object({ id: z.string().min(1), closed: z.string(), open: z.string() }))
    .max(10)
    .default([]),
  statements: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string(),
        verdict: StressVerdictSchema,
        reason: z.string()
      })
    )
    .max(10)
    .default([]),
  pair_level: PairLevelSchema.default('none'),
  reveals: z.array(TkRevealSchema).max(6).default([]),
  links: z
    .object({ skills: TkItemListSchema, tools: TkItemListSchema })
    .default({ skills: [], tools: [] }),
  show_links: z.boolean().default(true),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});

export const ToolkitValueContentSchema = z.object({
  item: z.string().min(1),
  label: z.string(),
  definition: z.string(),
  definition_source: z.string().default(''),
  /** Student instruction shown at the top of the block. */
  guide: z.string().default(''),
  claim: z.string().default(''),
  options: z.array(z.object({ id: z.string().min(1), text: z.string() })).max(8).default([]),
  probes: z
    .array(z.object({ id: z.string().min(1), question: z.string(), asks: z.string() }))
    .max(8)
    .default([]),
  instruction: z.string().default(''),
  model: z.object({ label: z.string(), body: z.string() }).default({ label: '', body: '' }),
  discussion: z.string().default(''),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});

export const ThinkingMoveStepSchema = z.object({
  id: z.string().min(1),
  tool: z.string().min(1),
  prompt: z.string(),
  frame: z.string(),
  example: z.string()
});

export const ThinkingMoveContentSchema = z.object({
  skill: z.string().min(1),
  tools: z.array(z.string().min(1)).min(1).max(5),
  value: z.string().min(1),
  community: z.string().default(''),
  /** Student instruction shown at the top of the block. */
  guide: z.string().default(''),
  stimulus: z.string().default(''),
  steps: z.array(ThinkingMoveStepSchema).max(5).default([]),
  check: z.array(z.string()).max(8).default([]),
  why: z.string().default(''),
  teacher_note: TkTeacherNoteSchema.optional(),
  /** skill|tools|value the note was last built from. */
  note_basis: z.string().default(''),
  teacher_jots: TkJotsSchema.optional()
});

export const QuadrantSchema = z.enum(['comprehension', 'research', 'speculation', 'inquiry']);

export const QuestionQuadrantContentSchema = z.object({
  /** Student instruction shown at the top of the block. */
  guide: z.string().default(''),
  stimulus: z.string().default(''),
  procedure: z.enum(['sort', 'create']).default('sort'),
  questions: z
    .array(z.object({ id: z.string().min(1), text: z.string(), quadrant: QuadrantSchema }))
    .max(16)
    .default([]),
  converters: z
    .array(z.object({ id: z.string().min(1), closed: z.string(), open: z.string() }))
    .max(8)
    .default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});

export const ConceptGameKindSchema = z.enum(['kind_sort', 'degree_line', 'word_sort']);

export const ConceptFeaturesContentSchema = z.object({
  /** Student instruction shown at the top of the block. */
  guide: z.string().default(''),
  concepts: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string(),
        central: z.boolean(),
        contestable: z.boolean(),
        common: z.boolean()
      })
    )
    .max(8)
    .default([]),
  analogy: z.object({ stem: z.string(), example: z.string() }).default({ stem: '', example: '' }),
  game: z
    .object({
      kind: ConceptGameKindSchema,
      left: z.string(),
      middle: z.string(),
      right: z.string(),
      cards: z
        .array(z.object({ id: z.string().min(1), text: z.string(), prompt: z.string() }))
        .max(16)
    })
    .default({ kind: 'kind_sort', left: '', middle: '?', right: '', cards: [] }),
  criteria: z.array(z.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});

export const ThinkingIntentionsContentSchema = z.object({
  content: z.string().default(''),
  skills: z.array(z.string().min(1)).max(2).default([]),
  tools: z.array(z.string().min(1)).max(6).default([]),
  values: z.array(z.string().min(1)).max(4).default([]),
  community: z.array(z.string().min(1)).max(2).default([]),
  success: z.array(z.string()).max(6).default([])
});

export const ThinkingReflectionContentSchema = z.object({
  variant: z.enum(['lesson', 'unit']).default('lesson'),
  /** Student instruction shown at the top of the block. */
  guide: z.string().default(''),
  concept: z.string().default(''),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});

/** One level of a fluid analogy type: the task, framed steps, an example. */
export const AnalogyTierSchema = z.object({
  task: z.string().default(''),
  steps: z.array(TkStepSchema).max(6).default([]),
  example: z.string().default('')
});

/** Fluid analogy: one of the seven types of analogy, at three levels. */
export const FluidAnalogyContentSchema = z.object({
  kind: z.string().min(1),
  label: z.string(),
  definition: z.string(),
  /** The text, character or idea students work with. */
  focus: z.string().default(''),
  /** The level students start at. */
  level: z.number().int().min(1).max(3).default(1),
  /** Students can step between levels themselves. */
  student_choice: z.boolean().default(true),
  tiers: z.array(AnalogyTierSchema).length(3),
  show_check: z.boolean().default(true),
  checks: z.array(z.string()).max(8).default([]),
  /** Show the prompt-card name for classes using the printed deck. */
  show_card: z.boolean().default(false),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});

/** Analogy types: all seven, the three levels, the process and the check. */
export const AnalogyTypesContentSchema = z.object({
  /** Student instruction shown at the top of the block. */
  guide: z.string().default(''),
  focus: z.string().default(''),
  /** Types marked "This lesson". */
  types: z.array(z.string().min(1)).max(7).default([]),
  show_contrast: z.boolean().default(true),
  weak: z.string().default(''),
  strong: z.string().default(''),
  why: z.string().default(''),
  process: z.array(z.string()).max(8).default([]),
  show_check: z.boolean().default(true),
  checks: z.array(z.string()).max(8).default([]),
  teacher_note: TkTeacherNoteSchema.optional(),
  teacher_jots: TkJotsSchema.optional()
});

export const TeacherNoteBlockContentSchema = z.object({
  title: z.string().default('Teacher note'),
  html: z.string().default('')
});

export type TkStep = z.infer<typeof TkStepSchema>;
export type TkReveal = z.infer<typeof TkRevealSchema>;
export type TkTeacherNote = z.infer<typeof TkTeacherNoteSchema>;
export type ToolFrame = z.infer<typeof ToolFrameSchema>;
export type PairLevel = z.infer<typeof PairLevelSchema>;
export type StressVerdict = z.infer<typeof StressVerdictSchema>;
export type Quadrant = z.infer<typeof QuadrantSchema>;
export type ConceptGameKind = z.infer<typeof ConceptGameKindSchema>;

/** Block types whose content carries `teacher_note` / `teacher_jots`. */
export const TOOLKIT_NOTE_BLOCK_TYPES = [
  'toolkit_skill',
  'toolkit_tool',
  'toolkit_value',
  'thinking_move',
  'question_quadrant',
  'concept_features',
  'thinking_reflection'
] as const;

/** All Newington set blocks (griffin badge). */
export const TOOLKIT_BLOCK_TYPES = [
  ...TOOLKIT_NOTE_BLOCK_TYPES,
  'thinking_intentions'
] as const;

export type ToolkitBlockType = (typeof TOOLKIT_BLOCK_TYPES)[number];

/** Analogous Thinking blocks: teacher note and class notes like the toolkit, no griffin. */
export const ANALOGY_BLOCK_TYPES = ['analogy_types', 'fluid_analogy'] as const;
