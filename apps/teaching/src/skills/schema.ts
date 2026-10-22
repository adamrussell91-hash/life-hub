import { z } from 'zod';

/**
 * The HSC skills continuum: strands of sub-strands, each climbing four rungs
 * from Capable to Excellent. Every rung has indicators to look for and a build: named parts, the language
 * for each part, a labelled example, checks and the next move. The content
 * lives in the private data repo (data/teaching/skills/{strand}.json).
 */

export const SKILL_STRANDS = ['reading', 'arguing', 'comparing', 'valuing', 'composing', 'speaking', 'language'] as const;
export const RUNG_IDS = ['capable', 'skilled', 'accomplished', 'excellent'] as const;
export type RungId = (typeof RUNG_IDS)[number];

/** A sub-strand reference, `strand.sub`, as stored on markbook criteria. */
export const SkillRefSchema = z.string().regex(/^[a-z]{3,20}\.[a-z-]{2,40}$/);

const Short = z.string().max(400);
const Long = z.string().max(1500);

export const SkillPartSchema = z.object({ id: z.string().min(1).max(40), name: Short, job: Long, language: z.array(Short).max(8).default([]) });
export const SkillBuildSchema = z.object({
  formula: z.array(Short).max(8),
  parts: z.array(SkillPartSchema).min(1).max(8),
  example: z.array(z.tuple([Long, z.string().max(40).nullable()])).min(1).max(20),
  why_here: Long,
  checks: z.array(Short).max(8),
  next_move: Long,
  steps: z.array(Long).max(8).optional(),
  technique: z.object({ name: Short, how: Long, pairs: z.array(z.tuple([Long, Long])).max(8) }).optional()
});
/** One observable behaviour, verb first, grouped by organiser, with a concrete example. */
export const SkillIndicatorSchema = z.object({ group: Short, text: Long, eg: Long.optional() });
export const SkillRungSchema = z.object({ i_can: Long, indicators: z.array(SkillIndicatorSchema).max(12).default([]), build: SkillBuildSchema });
export const SkillSubStrandSchema = z.object({
  id: z.string().regex(/^[a-z-]{2,40}$/),
  name: Short,
  in_hsc: Long,
  draws_on: Long,
  example_question: Long.optional(),
  example_claim: Long.optional(),
  example_note: Long.optional(),
  outcomes: z.array(z.number().int().min(1).max(12)).max(6).default([]),
  focus_areas: z.array(z.string().regex(/^[a-z0-9-]{2,40}$/)).max(8).default([]),
  rungs: z.object({ capable: SkillRungSchema, skilled: SkillRungSchema, accomplished: SkillRungSchema, excellent: SkillRungSchema })
});
export const SkillRungInfoSchema = z.object({ id: z.enum(RUNG_IDS), name: Short, marks: Short, marker_words: Short, meaning: Long });
export const SkillStrandSchema = z.object({
  schema: z.literal('skills_strand_v1'),
  strand: z.enum(SKILL_STRANDS),
  name: Short,
  summary: Long,
  rungs: z.array(SkillRungInfoSchema).length(4),
  sub_strands: z.array(SkillSubStrandSchema).min(1).max(12)
});
export const SkillsContinuumSchema = z.object({ strands: z.array(SkillStrandSchema).min(1).max(SKILL_STRANDS.length), fetched_at: z.string().optional() });

export type SkillStrand = z.infer<typeof SkillStrandSchema>;
export type SkillSubStrand = z.infer<typeof SkillSubStrandSchema>;
export type SkillBuild = z.infer<typeof SkillBuildSchema>;
export type SkillsContinuum = z.infer<typeof SkillsContinuumSchema>;
