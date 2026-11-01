import { z } from 'zod';
import { DotPointRefSchema } from '@/schemas/block';

/**
 * Deep understandings (Willingham): the three or four claims a unit is built
 * to make flexible, the knowledge pieces each rests on, and the five steps.
 * Where pieces are taught and tested is never stored here; it comes from
 * `kp:` and `du:` tags on the unit's lessons (see derive.ts).
 */

export const DEEP_LIMITS = { perUnit: 4, pieces: 24, claim: 400, why: 300, piece: 200, fill: 400 } as const;
export const TIERS = ['essential', 'strong', 'sophisticated'] as const;
export type Tier = (typeof TIERS)[number];
export const STEPS = ['1', '2a', '2b', '3', '4'] as const;
export type Step = (typeof STEPS)[number];
export type PlacedStep = Exclude<Step, '1'>;
export const STEP_LABEL: Record<Step, string> = { '1': '1', '2a': '2A', '2b': '2B', '3': '3', '4': '4' };
export const STEP_NAME: Record<Step, string> = {
  '1': 'Know the pieces',
  '2a': 'Explain it in one text',
  '2b': 'Explain it in a second text',
  '3': 'Compare when prompted',
  '4': 'Spot and use it unprompted'
};

export const DuIdSchema = z.string().regex(/^du_[a-z0-9]{4,16}$/);
export const PieceIdSchema = z.string().regex(/^kp_[a-z0-9]{4,16}$/);
const ConceptBulletSchema = z.string().regex(/^[A-Z]{2,5}\d{1,2}$/);

export const KnowledgePieceSchema = z.object({
  id: PieceIdSchema,
  text: z.string().trim().min(1).max(DEEP_LIMITS.piece),
  tier: z.enum(TIERS)
});

export const DeepUnderstandingSchema = z.object({
  id: DuIdSchema,
  claim: z.string().trim().max(DEEP_LIMITS.claim),
  why: z.string().trim().max(DEEP_LIMITS.why).default(''),
  dot_points: z.array(DotPointRefSchema).min(1).max(8),
  concept_bullets: z.array(ConceptBulletSchema).min(1).max(8),
  pieces: z.array(KnowledgePieceSchema).max(DEEP_LIMITS.pieces).default([]),
  /** Pieces owned by another deep understanding in this unit. */
  shared_piece_ids: z.array(PieceIdSchema).max(DEEP_LIMITS.pieces).default([]),
  steps: z.array(z.object({ step: z.enum(['2a', '2b', '3', '4']), fill: z.string().trim().max(DEEP_LIMITS.fill) })).max(4).default([])
});

export type KnowledgePiece = z.infer<typeof KnowledgePieceSchema>;
export type DeepUnderstanding = z.infer<typeof DeepUnderstandingSchema>;

const rand = (): string => Math.random().toString(36).slice(2, 8).padEnd(6, '0');
export const newDuId = (): string => `du_${rand()}`;
export const newPieceId = (): string => `kp_${rand()}`;
export const pieceTag = (pieceId: string): string => `kp:${pieceId}`;
export const stepTag = (duId: string, step: PlacedStep): string => `du:${duId}:${step}`;

/** Every piece a deep understanding counts: its own, then the shared ones found in the unit. */
export function piecesFor(du: DeepUnderstanding, all: readonly DeepUnderstanding[]): KnowledgePiece[] {
  const byId = new Map(all.flatMap((d) => d.pieces).map((p) => [p.id, p]));
  return [...du.pieces, ...du.shared_piece_ids.map((id) => byId.get(id)).filter((p): p is KnowledgePiece => !!p)];
}

/** A draft that has only a claim so far: the editor saves as it goes, before links exist. */
export const DeepUnderstandingDraftSchema = DeepUnderstandingSchema.extend({
  dot_points: z.array(DotPointRefSchema).max(8),
  concept_bullets: z.array(ConceptBulletSchema).max(8)
});
