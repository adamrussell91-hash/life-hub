import type { Alignment } from '@/alignment/schema';

/**
 * The unit's dot points (ticked on any of its lessons) and the concept bullets
 * the syllabus links to them, kept to the unit's own textual concepts when given.
 */
export type ScopePoint = { ref: string; id: string; kind: 'U' | 'R'; short: string };
export type ScopeBullet = { ref: string; text: string; via: string[] };

export function unitScope(
  lessons: ReadonlyArray<{ dot_points?: string[] }>,
  alignment: Alignment | null,
  conceptKeys: readonly string[] = []
): { points: ScopePoint[]; bullets: ScopeBullet[] } {
  if (!alignment) return { points: [], bullets: [] };
  const ticked = new Set(lessons.flatMap((l) => l.dot_points ?? []));
  const points: ScopePoint[] = [];
  for (const area of alignment.focus_areas) {
    for (const p of area.points) {
      const ref = `${area.id}:${p.id}`;
      if (ticked.has(ref)) points.push({ ref, id: p.id, kind: p.kind, short: p.short });
    }
  }
  const order = (id: string): number => (id.startsWith('U') ? 0 : 100) + Number(id.slice(1));
  points.sort((a, b) => order(a.id) - order(b.id));
  const bullets = new Map<string, ScopeBullet>();
  for (const sp of points) {
    const [areaId] = sp.ref.split(':');
    const point = alignment.focus_areas.find((a) => a.id === areaId)?.points.find((p) => p.id === sp.id);
    for (const c of point?.concepts ?? []) {
      const key = c.ref.replace(/\d+$/, '');
      if (conceptKeys.length && !conceptKeys.includes(key)) continue;
      const n = Number(c.ref.slice(key.length));
      const text = alignment.concepts.find((x) => x.key === key)?.bullets.find((b) => b.n === n)?.text;
      if (!text) continue;
      const row = bullets.get(c.ref) ?? { ref: c.ref, text, via: [] };
      if (!row.via.includes(sp.id)) row.via.push(sp.id);
      bullets.set(c.ref, row);
    }
  }
  return { points, bullets: [...bullets.values()] };
}
