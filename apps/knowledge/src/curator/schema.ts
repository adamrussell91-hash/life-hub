import { z } from "zod";

export const RELATIONS = ["related", "builds-on", "contrasts-with"] as const;
export type Relation = (typeof RELATIONS)[number];

export const CANDIDATE_CAP = 15;
export const RUN_CAP = 50;
export const LINK_FLOOR = 0.35;
export const DUPLICATE_HOLD = 0.92;
/** Explicit scores at or above this are written immediately. Adam reviews every score below it. */
export const AUTO_APPROVE_AT = 0.8;
export const CROSS_BOOK_ONGOING_CAP = 5;

export const CuratorStateSchema = z.object({
  lastProcessedSha: z.string(),
});
export type CuratorState = z.infer<typeof CuratorStateSchema>;

export const PendingProposalSchema = z.object({
  id: z.string(),
  noteA: z.string(),
  noteB: z.string(),
  titleA: z.string(),
  titleB: z.string(),
  excerptA: z.string(),
  excerptB: z.string(),
  relation: z.enum(RELATIONS),
  rationale: z.string(),
  proposedAt: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  bookA: z.string().optional(),
  bookB: z.string().optional(),
});
export type PendingProposal = z.infer<typeof PendingProposalSchema>;

export const AutoApprovedSchema = z.object({
  noteA: z.string(),
  noteB: z.string(),
  titleA: z.string(),
  titleB: z.string(),
  bookA: z.string(),
  bookB: z.string(),
  relation: z.enum(RELATIONS),
  rationale: z.string(),
  confidence: z.number().min(0).max(1),
  approvedAt: z.string(),
});
export type AutoApproved = z.infer<typeof AutoApprovedSchema>;

/** Missing or non-numeric scores are not a number the model gave. They must never auto-approve. */
export function parseConfidence(value: unknown): { confidence?: number; explicit: boolean } {
  if (typeof value !== "number" || !Number.isFinite(value)) return { explicit: false };
  return { confidence: Math.min(1, Math.max(0, value)), explicit: true };
}

/** ≥ 0.80 auto-approves. Every other judged link is queued. Nothing is dropped for a low score. */
export function routeConfidence(link: { confidence?: number; confidenceExplicit?: boolean }): "auto" | "queue" {
  if (link.confidenceExplicit !== true || typeof link.confidence !== "number") return "queue";
  return link.confidence >= AUTO_APPROVE_AT ? "auto" : "queue";
}

/** Whole percent for a score the model actually gave. Unscored rows return null. */
export function confidencePercent(confidence: unknown): string | null {
  const parsed = parseConfidence(confidence);
  if (!parsed.explicit || parsed.confidence === undefined) return null;
  return `${Math.round(parsed.confidence * 100)}%`;
}

export const DismissedPairSchema = z.object({
  noteA: z.string(),
  noteB: z.string(),
  dismissedAt: z.string(),
});
export type DismissedPair = z.infer<typeof DismissedPairSchema>;

export function pairKey(a: string, b: string) {
  return a < b ? `${a}||${b}` : `${b}||${a}`;
}

export function proposalId(a: string, b: string) {
  return pairKey(a, b);
}
