import { z } from 'zod';

/**
 * Discern: an optional thinking process attached to an existing block, never a
 * separate block type. Students test their initial position in four steps
 * (Initial, Against, For, Step back) and finish on a linked Confirm card.
 */
export const DiscernModeSchema = z.enum(['own', 'theirs']);
export const DiscernInitialTypeSchema = z.enum(['scale', 'choose', 'write']);
export const DiscernScalePresetSchema = z.enum(['agree', 'extent', 'effect', 'verdict']);

export const DiscernQualifierSchema = z.object({
  /** own: the student's answer. theirs: a character's or historical figure's choice. */
  mode: DiscernModeSchema.default('own'),
  who: z.string().trim().max(80).default(''),
  /** What is being judged. Fills every default prompt. */
  focus: z.string().trim().max(200).default(''),
  /** Optional evidence source, e.g. "the poems" or "Source B". */
  source: z.string().trim().max(120).default(''),
  initial: z.object({
    type: DiscernInitialTypeSchema.default('scale'),
    preset: DiscernScalePresetSchema.default('agree'),
    /** Scale points or choices. Empty scale points fall back to the preset. */
    options: z.array(z.string().trim().max(60)).max(5).default([])
  }).default({}),
  /** Teacher overrides for the five step prompts; an empty string keeps the default. */
  prompts: z.array(z.string().max(1200)).length(5).optional(),
  /** "Their choice" only: students also plot how settled the character is across key moments. */
  character_tail: z.object({
    enabled: z.boolean().default(false),
    moments: z.array(z.string().trim().max(80)).max(6).default([])
  }).optional()
});

export type DiscernMode = z.infer<typeof DiscernModeSchema>;
export type DiscernInitialType = z.infer<typeof DiscernInitialTypeSchema>;
export type DiscernScalePreset = z.infer<typeof DiscernScalePresetSchema>;
export type DiscernQualifier = z.infer<typeof DiscernQualifierSchema>;
