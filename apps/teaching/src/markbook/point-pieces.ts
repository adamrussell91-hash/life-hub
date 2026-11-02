import type { Alignment } from '@/alignment/schema';
import { pointTag } from '@/evidence/syllabus';
import type { Evidence } from '@/evidence/types';
import type { DeepUnderstanding, KnowledgePiece } from '@/deep/schema';
import { circleFor, type Circle, type WritingTicks } from '@/deep/track';

/**
 * Knowledge pieces filed under the dot point they build (`piece.dot_point`),
 * for the By dot point lens. Pieces with no dot point yet are gathered by the
 * focus area of their deep understanding so they stay visible. Pure.
 */
export type PieceGroup = { area: string; areaName: string; pieces: KnowledgePiece[] };

export function piecesByPoint(deep: readonly DeepUnderstanding[], alignment: Alignment | null): { byPoint: Map<string, KnowledgePiece[]>; loose: PieceGroup[] } {
  const byPoint = new Map<string, KnowledgePiece[]>();
  const loose = new Map<string, PieceGroup>();
  const seen = new Set<string>();
  const exists = (ref: string): boolean => {
    const [area, id] = ref.split(':');
    return !!alignment?.focus_areas.find((a) => a.id === area)?.points.some((p) => p.id === id);
  };
  for (const du of deep) {
    for (const piece of du.pieces) {
      if (!piece.text.trim() || seen.has(piece.id)) continue;
      seen.add(piece.id);
      if (piece.dot_point && exists(piece.dot_point)) {
        const [area, id] = piece.dot_point.split(':') as [string, string];
        const tag = pointTag(area, id);
        byPoint.set(tag, [...(byPoint.get(tag) ?? []), piece]);
        continue;
      }
      const area = du.dot_points.map((r) => r.split(':')[0] ?? '').find((a) => alignment?.focus_areas.some((f) => f.id === a)) ?? '';
      const group = loose.get(area) ?? { area, areaName: alignment?.focus_areas.find((f) => f.id === area)?.name ?? 'Other', pieces: [] };
      group.pieces.push(piece);
      loose.set(area, group);
    }
  }
  const order = (alignment?.focus_areas ?? []).map((a) => a.id);
  return { byPoint, loose: [...loose.values()].sort((a, b) => (order.indexOf(a.area) + 1 || 99) - (order.indexOf(b.area) + 1 || 99)) };
}

export function pieceCircles(evidence: readonly Evidence[], students: readonly string[], piece: KnowledgePiece, today: string, writing: WritingTicks = {}): Record<string, Circle> {
  return Object.fromEntries(students.map((s) => [s, circleFor(evidence, s, piece.id, today, writing)]));
}

/** The same classes Monitoring gives a circle. */
export function circleClass(c: Circle): string {
  return ['du-c', c.amber ? 'amb' : c.fill, c.faded ? 'fade' : '', c.ring === 'used' ? 'used' : c.ring === 'missed' ? 'notused' : ''].filter(Boolean).join(' ');
}

/** Colour is never alone: the same state in words. */
export function circleText(c: Circle): string {
  const base = c.amber ? 'latest check wrong' : c.fill === 'full' ? 'right on two separate days' : c.fill === 'half' ? 'right once' : 'not checked yet';
  return [base, c.faded ? 'no check in four weeks' : '', c.ring === 'used' ? 'used in writing' : c.ring === 'missed' ? 'expected in writing, not used' : ''].filter(Boolean).join(', ');
}
