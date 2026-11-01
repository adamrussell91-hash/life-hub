import type { Evidence } from '@/evidence/types';
import type { KnowledgePiece, PlacedStep, Step } from './schema';

/**
 * One student's hold on one knowledge piece, from `kp:` quiz evidence and the
 * teacher's piece-use ticks on writing tasks. Pure; the monitor view feeds it.
 *   fill   none · half (right once) · full (right on two separate days)
 *   amber  the latest marked check was wrong (memory jog)
 *   faded  no check in FADE_DAYS
 *   ring   used (in writing) · missed (expected, not used; hidden while amber) · none
 */
export const FADE_DAYS = 28;
export type Circle = { fill: 'none' | 'half' | 'full'; amber: boolean; faded: boolean; ring: 'used' | 'missed' | 'none' };
export type WritingTicks = Record<string, Record<string, { used: string[]; missed: string[]; at: string }>>;

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function circleFor(evidence: readonly Evidence[], student: string, pieceId: string, today: string, writing: WritingTicks = {}): Circle {
  const tag = `kp:${pieceId}`;
  const mine = evidence.filter((e) => e.student === student && e.share !== null && e.tags.includes(tag)).sort((a, b) => a.date.localeCompare(b.date));
  const rightDays = new Set(mine.filter((e) => (e.share ?? 0) >= 1).map((e) => e.date));
  const fill = rightDays.size >= 2 ? 'full' : rightDays.size === 1 ? 'half' : 'none';
  const last = mine[mine.length - 1];
  const amber = !!last && (last.share ?? 0) < 1;
  const faded = !!last && daysBetween(last.date, today) > FADE_DAYS;
  const ticks = Object.values(writing).map((byStudent) => byStudent[student]).filter((t): t is NonNullable<typeof t> => !!t);
  const used = ticks.some((t) => t.used.includes(pieceId));
  const missed = ticks.some((t) => t.missed.includes(pieceId));
  const ring = used ? 'used' : missed && !amber ? 'missed' : 'none';
  return { fill, amber, faded, ring };
}

/** Step 1 exit: every introduced Essential piece full, and 80% of introduced Essential + Strong full. */
export function step1Passed(pieces: readonly KnowledgePiece[], introduced: ReadonlySet<string>, circles: Readonly<Record<string, Circle>>): boolean {
  const counted = pieces.filter((p) => p.tier !== 'sophisticated' && introduced.has(p.id));
  if (!counted.length) return false;
  const isFull = (id: string) => circles[id]?.fill === 'full';
  if (!counted.filter((p) => p.tier === 'essential').every((p) => isFull(p.id))) return false;
  return counted.filter((p) => isFull(p.id)).length / counted.length >= 0.8;
}

/** Where a student sits: the step the teacher last passed them on, else 1 once they're through Step 1, else null (still in Step 1). */
export function studentStep(passedStep1: boolean, passed: { step: PlacedStep; at: string } | undefined): Step | null {
  if (passed) return passed.step;
  return passedStep1 ? '1' : null;
}
