import { apiGet } from '@/api/client';

/**
 * Proof for the WalkThrus board: per tile (technique or fusion) and class, the class's lesson scores
 * where the teacher ran it next to its lessons with no WalkThru run. Scores are 0–1 (quiz marks got
 * over marks available, latest attempts). Built by /api/walkthrus-proof (packages/walkthrus/proof.mjs).
 */
export interface ProofLesson { lesson_id: string; score: number; date: string | null }
export interface ProofRow {
  tile_id: string;
  class_id: string;
  ran: { n: number; mean: number | null; lessons: ProofLesson[] };
  /** Partly runs: shown, never averaged. */
  partly: { n: number; lessons: ProofLesson[] };
  /** The class's scored lessons with no ran or partly rep of any tile. */
  none: { n: number; mean: number | null };
  /** ran.mean − none.mean, or null when either side has no lessons. */
  diff: number | null;
  /** At least 4 lessons on both sides. */
  enough: boolean;
}
export interface Proof {
  /** Ranked: enough first by diff (largest first), then the rest. */
  rows: ProofRow[];
  /** Class id → its display name. */
  classes: Record<string, string>;
  lessons_scored: number;
  generated_at: string;
}

/** The server keeps Proof for ten minutes; `fresh` works it out again (`?rebuild=1`; not `fresh=1`, which the client reads as a schedule cache reset). */
export async function loadProof(options: { fresh?: boolean } = {}): Promise<Proof> {
  const r = await apiGet<{ proof: Proof }>(`/api/walkthrus-proof${options.fresh ? '?rebuild=1' : ''}`);
  return r.proof;
}
