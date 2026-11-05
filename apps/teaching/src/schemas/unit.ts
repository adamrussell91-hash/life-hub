import { z } from 'zod';
import { BlockSchema } from './block';
import { CommonFields, TrashFields } from './common';
import { DEEP_LIMITS, DeepUnderstandingDraftSchema } from '../deep/schema';
import { CoverSchema } from './cover';
import { SourceSchema } from './source';

/**
 * What a WalkThru is doing in this unit, beyond a lesson block choosing it. Teacher only.
 * `du` and `organiser` tie the technique to a deep understanding (ref is its id) or the organiser
 * (ref is all, vocab or facts). `block` only holds the how line for a lesson block, ref lesson/block.
 */
export const WalkthruTieSchema = z.object({
  technique: z.string().min(1).max(120),
  kind: z.enum(['du', 'organiser', 'block']),
  ref: z.string().min(1).max(240),
  how: z.string().max(200).optional()
});
export type WalkthruTie = z.infer<typeof WalkthruTieSchema>;

export const UnitSchema = z.object({
  ...CommonFields,
  ...TrashFields,
  type: z.literal('unit'),
  year_id: z.string().min(1),
  subject_id: z.string().min(1),
  lesson_ids: z.array(z.string().min(1)),
  primary_term: z.number().int().positive().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().optional(),
  cover: CoverSchema.optional(),
  blocks: z.array(BlockSchema).optional(),
  outcome_ids: z.array(z.string().min(1)).max(24).optional(),
  /** Willingham deep understandings: the unit's 3–4 claims and their knowledge pieces (deep/schema.ts). */
  deep_understandings: z.array(DeepUnderstandingDraftSchema).max(DEEP_LIMITS.perUnit).optional(),
  walkthru_ties: z.array(WalkthruTieSchema).max(120).optional(),
  /** 'program': same level as a unit, never one of a class's active units. */
  kind: z.enum(['program']).optional(),
  source: SourceSchema.optional()
});

export type Unit = z.infer<typeof UnitSchema>;
