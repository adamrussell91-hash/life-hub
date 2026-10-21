import { z } from 'zod';

/**
 * Lenses added after Kaplan and Discern share one field: a list of
 * { id, config } entries, one per registry lens. The schema does not grow as
 * lenses are added; each lens validates its own config when it reads it.
 * Unknown ids are kept, so an older client never deletes a newer lens.
 */
export const LensAttachmentSchema = z.object({
  id: z.string().min(1).max(60),
  config: z.record(z.unknown())
});
export const LensAttachmentsSchema = z.array(LensAttachmentSchema).max(6).superRefine((items, ctx) => {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Use each lens once per block.' });
  }
});

export const LensLevelSchema = z.enum(['support', 'core', 'extend']);
const StepTextSchema = z.string().max(1200);

/** Windows & Mirrors: look outward (window), inward (mirror), both, or let students choose. */
export const WindowsMirrorsConfigSchema = z.object({
  focus: z.string().trim().max(200).default(''),
  answer_with: z.enum(['window', 'mirror', 'both', 'choice']).default('both'),
  level: LensLevelSchema.default('core'),
  student_level: z.boolean().default(true),
  mode: z.enum(['notes', 'discussion']).default('notes'),
  /** Teacher overrides keyed `${level}.${stepId}`; empty keeps the default. */
  prompts: z.record(StepTextSchema).optional(),
  supports: z.record(StepTextSchema.nullable()).optional(),
  examples: z.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});

/**
 * Lenses whose only settings are the shared ones: focus, level, the student's
 * level switch, step text overrides and per-level examples. 4 Levels of
 * Questions and Because, But, So use this.
 */
export const SteppedLensConfigSchema = WindowsMirrorsConfigSchema.omit({ answer_with: true });

/** Reasoning: deductive, inductive, abductive, all three in proof order, or the student picks. */
export const LogicSchema = z.enum(['deductive', 'inductive', 'abductive', 'all_three', 'choice']);
export const ReasoningConfigSchema = z.object({
  focus: z.string().trim().max(200).default(''),
  logic: LogicSchema.default('choice'),
  level: LensLevelSchema.default('core'),
  student_level: z.boolean().default(true),
  mode: z.enum(['notes', 'discussion']).default('notes'),
  prompts: z.record(StepTextSchema).optional(),
  supports: z.record(StepTextSchema.nullable()).optional(),
  examples: z.object({ support: StepTextSchema, core: StepTextSchema, extend: StepTextSchema }).partial().optional()
});

export type LensAttachment = z.infer<typeof LensAttachmentSchema>;
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>;
export type WindowsMirrorsConfig = z.infer<typeof WindowsMirrorsConfigSchema>;
export type SteppedLensConfig = z.infer<typeof SteppedLensConfigSchema>;
